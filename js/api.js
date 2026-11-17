/**
 * Data-access adapter. The rest of the app talks only to this module
 * (get file / put file with sha-merge). The backend is the GitHub Contents API
 * after the PIN decrypts a write token in the browser.
 */

import { FEED_ROTA_ONLY, FILES, MAX_WRITE_ATTEMPTS, WRITABLE } from "./config.js";
import { getToken } from "./auth.js";
import * as github from "./github.js";

function token() {
  const t = getToken();
  if (!t) throw new Error("Locked. Enter the PIN to continue.");
  return t;
}

function assertWritable(path, rotaWrite) {
  if (rotaWrite && path === FEED_ROTA_ONLY) return;
  if (!WRITABLE.has(path)) {
    throw new Error(`Refusing to write ${path}: that file is owned by another team.`);
  }
}

export async function getFile(path) {
  return github.getFile(token(), path);
}

export async function putFile(path, { text, sha, message, rotaWrite = false } = {}) {
  assertWritable(path, rotaWrite);
  return github.putFile(token(), path, { text, sha, message });
}

/**
 * Read-merge-write with sha. On 409/422 conflict, re-read, re-apply mutator, retry.
 * mutator(freshJsonOrNull, freshText, file) => object or string to write.
 */
export async function commitFile(path, message, mutator, { rotaWrite = false } = {}) {
  assertWritable(path, rotaWrite);
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const file = await getFile(path);
    const json = file.missing || !file.text.trim() ? null : safeJson(file.text);
    const next = await mutator(json, file.text, file);
    const text = typeof next === "string" ? next : JSON.stringify(next, null, 2) + "\n";
    try {
      return await putFile(path, { text, sha: file.sha, message, rotaWrite });
    } catch (err) {
      lastError = err;
      if (err.conflict) continue;
      throw err;
    }
  }
  throw lastError || new Error(`Could not save ${path} after ${MAX_WRITE_ATTEMPTS} attempts`);
}

function safeJson(text) {
  try {
    return JSON.parse(String(text).replace(/^\uFEFF/, "").trim());
  } catch {
    return null;
  }
}

export async function loadAll(paths = Object.values(FILES)) {
  const entries = await Promise.all(paths.map(async (path) => {
    try {
      const file = await getFile(path);
      return [path, file];
    } catch (err) {
      return [path, { path, sha: null, text: "", missing: true, error: err }];
    }
  }));
  return Object.fromEntries(entries);
}

export { FILES };
