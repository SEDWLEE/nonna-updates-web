#!/usr/bin/env node
/**
 * Regenerate vault.json from environment variables.
 * Usage (never pass the PIN or token as CLI flags — they would show up in process lists):
 *   SITE_PIN=...... GITHUB_WRITE_TOKEN=... node scripts/set-pin.mjs
 *
 * Writes only salt, iv and ciphertext. Does not print the PIN or the token.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { encryptSecret } from "../js/crypto.js";

const pin = process.env.SITE_PIN || process.env.PIN || "";
const token = process.env.GITHUB_WRITE_TOKEN || process.env.TOKEN || "";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "vault.json");

if (!pin || !token) {
  console.error("Need SITE_PIN (or PIN) and GITHUB_WRITE_TOKEN (or TOKEN) in the environment.");
  process.exit(1);
}
if (!/^\d{4,12}$/.test(pin)) {
  console.error("PIN must be 4–12 digits.");
  process.exit(1);
}
if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
  console.error("GITHUB_WRITE_TOKEN does not look like a GitHub token.");
  process.exit(1);
}

const vault = await encryptSecret(pin, token);
if (!vault.ct || !vault.salt || !vault.iv || vault.configured !== true) {
  console.error("Encryption did not produce a vault blob.");
  process.exit(1);
}
// Safety: never write the PIN or a token-shaped string into the vault file.
const json = JSON.stringify(vault, null, 2) + "\n";
if (json.includes(pin) || json.includes(token) || json.includes("ghp_") || json.includes("github_pat_")) {
  console.error("Refusing to write vault.json because a secret would have been included.");
  process.exit(1);
}
writeFileSync(out, json);
console.log("Wrote vault.json (ciphertext, salt and iv only).");
