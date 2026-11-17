/** PIN-derived AES-GCM helpers. Never log the PIN, the token, or plaintext. */

import { PBKDF2_ITERATIONS } from "./config.js";

export function bytesToB64(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}

export function b64ToBytes(s) {
  const bin = atob(String(s || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(pin, salt, iter = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a secret with a PIN. Returns a public vault object (salt, iv, ciphertext only). */
export async function encryptSecret(pin, secret, iter = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(String(secret)));
  return {
    v: 1,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(ct),
    configured: true,
  };
}

export async function decryptSecret(pin, vault) {
  if (!vault || vault.configured === false || !vault.ct || !vault.salt || !vault.iv) {
    const err = new Error("PIN is not set up yet.");
    err.code = "UNCONFIGURED";
    throw err;
  }
  try {
    const key = await deriveKey(pin, b64ToBytes(vault.salt), vault.iter || PBKDF2_ITERATIONS);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(vault.iv) }, key, b64ToBytes(vault.ct));
    return new TextDecoder().decode(pt);
  } catch (e) {
    const err = new Error("Wrong PIN");
    err.code = "WRONG_PIN";
    err.cause = e;
    throw err;
  }
}

export const EMPTY_VAULT = {
  v: 1,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iter: PBKDF2_ITERATIONS,
  salt: "",
  iv: "",
  ct: "",
  configured: false,
};
