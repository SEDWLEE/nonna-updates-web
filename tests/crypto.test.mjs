import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret } from "../js/crypto.js";
import { applyRotaEditsToFeed } from "../js/logic.js";
import { WRITABLE, FEED_ROTA_ONLY, FILES } from "../js/config.js";

describe("PIN vault crypto", () => {
  const pin = "246801";
  const secret = "dummy-secret-not-a-github-token";

  it("round-trips a secret and rejects a wrong PIN", async () => {
    const vault = await encryptSecret(pin, secret, 10_000); // lower iter in unit tests
    assert.equal(vault.configured, true);
    assert.ok(vault.salt && vault.iv && vault.ct);
    assert.ok(!vault.salt.includes(pin) && !vault.ct.includes(secret));
    const out = await decryptSecret(pin, vault);
    assert.equal(out, secret);
    await assert.rejects(() => decryptSecret("000000", vault), (err) => err.code === "WRONG_PIN");
  });

  it("refuses an unconfigured vault", async () => {
    await assert.rejects(
      () => decryptSecret("246801", { configured: false, salt: "", iv: "", ct: "" }),
      (err) => err.code === "UNCONFIGURED",
    );
  });
});

describe("write whitelist", () => {
  it("does not allow fleet, stock, optimo, or unscoped feed writes", () => {
    assert.ok(!WRITABLE.has(FILES.fleet));
    assert.ok(!WRITABLE.has(FILES.stock));
    assert.ok(!WRITABLE.has(FILES.optimo));
    assert.ok(!WRITABLE.has(FILES.feed));
    assert.equal(FEED_ROTA_ONLY, "feed.json");
  });
  it("rota merge leaves updates and staff untouched", () => {
    const root = { updates: [{ id: 1 }], staff: [{ name: "Jenny" }], rotas: [] };
    const next = applyRotaEditsToFeed(root, [
      { weekStarting: "2026-11-16", riderName: "Shane", day: "Monday", status: "working" },
    ], "Sam", "at");
    assert.deepEqual(next.updates, root.updates);
    assert.deepEqual(next.staff, root.staff);
  });
});
