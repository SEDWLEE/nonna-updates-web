/** PIN unlock and session. Never log the PIN or the decrypted token. */

import {
  ACTOR_STORAGE_KEY, DEFAULT_ACTOR, PIN_LENGTH,
  TOKEN_REMEMBER_KEY, TOKEN_SESSION_KEY,
} from "./config.js";
import { decryptSecret } from "./crypto.js";

let vaultCache = null;
let memoryToken = "";

export async function loadVault() {
  if (vaultCache) return vaultCache;
  const res = await fetch(new URL("../vault.json", import.meta.url), { cache: "no-store" });
  if (!res.ok) {
    vaultCache = { configured: false };
    return vaultCache;
  }
  vaultCache = await res.json();
  return vaultCache;
}

export function vaultConfigured(vault = vaultCache) {
  return Boolean(vault && vault.configured && vault.ct);
}

export function getToken() {
  if (memoryToken) return memoryToken;
  try {
    const remembered = localStorage.getItem(TOKEN_REMEMBER_KEY) === "1";
    const stored = (remembered ? localStorage : sessionStorage).getItem(TOKEN_SESSION_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  } catch { /* ignore */ }
  return "";
}

export function isUnlocked() {
  return Boolean(getToken());
}

export function getActor() {
  try {
    return localStorage.getItem(ACTOR_STORAGE_KEY) || DEFAULT_ACTOR;
  } catch {
    return DEFAULT_ACTOR;
  }
}

export function setActor(name) {
  const n = String(name || "").trim() || DEFAULT_ACTOR;
  try { localStorage.setItem(ACTOR_STORAGE_KEY, n); } catch { /* ignore */ }
  return n;
}

function persistToken(token, remember) {
  memoryToken = token;
  try {
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_REMEMBER_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_SESSION_KEY, token);
    if (remember) localStorage.setItem(TOKEN_REMEMBER_KEY, "1");
  } catch { /* memory-only still works */ }
}

export function lock() {
  memoryToken = "";
  try {
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_REMEMBER_KEY);
  } catch { /* ignore */ }
}

/** Decrypt the vault with the PIN and keep the token in the browser only. */
export async function unlockWithPin(pin, { remember = false, vault } = {}) {
  const cleaned = String(pin || "").replace(/\D/g, "");
  if (cleaned.length !== PIN_LENGTH) {
    const err = new Error(`Enter the ${PIN_LENGTH}-digit PIN.`);
    err.code = "BAD_LENGTH";
    throw err;
  }
  const v = vault || await loadVault();
  if (!vaultConfigured(v)) {
    const err = new Error("The PIN has not been set up on this site yet.");
    err.code = "UNCONFIGURED";
    throw err;
  }
  const token = await decryptSecret(cleaned, v);
  persistToken(token, remember);
  return true;
}

/**
 * Hidden fallback: paste a fine-grained GitHub token.
 * Not shown as the main sign-in path.
 */
export function unlockWithToken(token, { remember = false } = {}) {
  const trimmed = String(token || "").trim();
  if (!trimmed) throw new Error("Paste a GitHub key to connect.");
  if (!trimmed.startsWith("ghp_") && !trimmed.startsWith("github_pat_")) {
    throw new Error("That does not look like a GitHub key.");
  }
  persistToken(trimmed, remember);
  return true;
}

export { PIN_LENGTH };
