import test from "node:test"; import assert from "node:assert/strict";
import { world } from "./fakechain.mjs";
import { jupiterExec, CAPS } from "../src/lib/exec-jupiter.mjs";
import { walletFromPem } from "../src/lib/solana.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import crypto from "node:crypto";
test("golden take: sellPart sells exactly 38.2% of the tokens and reports what is left", async () => {
  const w = walletFromPem(crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
  const t = world(w.publicKey, { held: 1000000n });
  const ex = jupiterExec({ wallet: w, rpc: t.rpc, jupiter: t.jupiter, cfg: DEFAULTS, caps: CAPS, wait: async () => {} });
  const r = await ex.sellPart({ mint: "M".repeat(43), frac: 0.382 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.sold, "382000"); assert.equal(r.left, "618000");
  assert.equal(t.W.quotes.at(-1).amount, "382000", "Jupiter was asked to sell exactly 38.2%");
  assert.equal(t.W.closes, 0, "the token account stays open for the rest");
});
