/** Low-level GitHub Contents API. Tokens are passed in, never logged. */

import { API_BASE, DATA_BRANCH, DATA_OWNER, DATA_REPO } from "./config.js";

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentsUrl(path) {
  return `${API_BASE}/repos/${DATA_OWNER}/${DATA_REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(DATA_BRANCH)}`;
}

function putUrl(path) {
  return `${API_BASE}/repos/${DATA_OWNER}/${DATA_REPO}/contents/${encodeURI(path)}`;
}

function b64Encode(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function b64Decode(b64) {
  const clean = String(b64 || "").replace(/\n/g, "");
  return decodeURIComponent(escape(atob(clean)));
}

async function githubFetch(token, url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { ...headers(token), ...(opts.headers || {}) },
  });
}

export async function getFile(token, path, { etag } = {}) {
  const extra = {};
  if (etag) extra["If-None-Match"] = etag;
  const res = await githubFetch(token, contentsUrl(path), { headers: extra });
  const nextEtag = res.headers.get("ETag") || etag || null;
  if (res.status === 304) return { path, notModified: true, etag: nextEtag, missing: false };
  if (res.status === 404) return { path, sha: null, text: "", missing: true, etag: null };
  if (!res.ok) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  let text = "";
  if (body.encoding === "base64" && body.content && (body.size == null || body.size < 1_000_000)) {
    text = b64Decode(body.content);
  } else if (body.download_url) {
    const raw = await fetch(body.download_url, { headers: headers(token) });
    if (!raw.ok) throw new Error(`Could not download ${path}`);
    text = await raw.text();
  }
  return { path, sha: body.sha, text, missing: false, etag: nextEtag, notModified: false };
}

/** Latest commit sha on the data branch. 304s (If-None-Match) mean nothing changed. */
export async function getLatestRef(token, { etag } = {}) {
  const url = `${API_BASE}/repos/${DATA_OWNER}/${DATA_REPO}/git/ref/heads/${encodeURIComponent(DATA_BRANCH)}`;
  const extra = {};
  if (etag) extra["If-None-Match"] = etag;
  const res = await githubFetch(token, url, { headers: extra });
  const nextEtag = res.headers.get("ETag") || etag || null;
  if (res.status === 304) return { notModified: true, sha: null, etag: nextEtag };
  if (!res.ok) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const sha = body.object?.sha || body.sha || null;
  return { notModified: false, sha, etag: nextEtag };
}

export async function putFile(token, path, { text, sha, message }) {
  const payload = {
    message,
    content: b64Encode(text),
    branch: DATA_BRANCH,
  };
  if (sha) payload.sha = sha;
  const res = await githubFetch(token, putUrl(path), {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (res.status === 409 || res.status === 422) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    err.conflict = true;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function errorMessage(res) {
  let msg = `GitHub ${res.status}`;
  try {
    const body = await res.json();
    if (body?.message) msg = body.message;
  } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) {
    return "The GitHub key was rejected. Check it still has access to the data repo, then try again.";
  }
  if (res.status === 404) return "That file was not found in the data repo.";
  return msg;
}

/** Who is signed in — used for "logged by" stamps. Never logs the token. */
export async function getViewer(token) {
  const res = await githubFetch(token, `${API_BASE}/user`);
  if (!res.ok) {
    const err = new Error("Could not sign in with that key.");
    err.status = res.status;
    throw err;
  }
  const user = await res.json();
  return { login: user.login, name: user.name || user.login };
}
