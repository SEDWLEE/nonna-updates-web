# Nonna Updates (website)

A free, static website for the Nonna Updates phone app. It reads and writes the same private data repo (`SEDWLEE/nonna-updates-data`), so changes here show up on the phone and the other way round.

Hosted at: <https://sedwlee.github.io/nonna-updates-web/>

This repository holds **site code only**. It does not contain staff lists, fleet data, passwords, PINs or GitHub tokens.

## Sign in

The landing page is a PIN pad. A correct PIN decrypts a data-repo access key in your browser (AES-GCM, key derived with PBKDF2). The key stays in `sessionStorage`, or in `localStorage` if you tick **Remember this device**. **Lock** clears it.

## Setting or changing the PIN

Do this on a trusted machine. The PIN and the GitHub token are read from the environment — never pass them as command-line flags.

```bash
SITE_PIN=yourpin GITHUB_WRITE_TOKEN=yourtoken node scripts/set-pin.mjs
```

That rewrites `vault.json` with a new salt, iv and ciphertext only. Commit and push the file. It should never contain a GitHub token or the PIN itself.

The token must be a fine-grained GitHub token limited to **`SEDWLEE/nonna-updates-data`**, with **Contents: Read and write**.

## What the site may write

The site may write: `items.json`, `checkouts.json`, `stock-counts.json`, `cv-decisions.json`, `handover.json`, `bike-details.json`, `stock-details.json`, `repairs.json`, `staff.json`, and only the **rota** portion of `feed.json`.

It never writes `fleet.json`, `stock.json`, `optimo-stats.json`, or `feed.json` `updates[]` / `staff[]`.

## Local development

```bash
npm test
python3 -m http.server 8080
```

Open `http://localhost:8080`.
