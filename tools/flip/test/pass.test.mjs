/**
 * The pass really runs: a real browser, the real agent, real readers.
 *
 * Everything else in this suite tests a piece. This drives the whole thing the
 * way it runs on his Mac — Chrome launched, agent.built.js injected, the Depop
 * site module deciding what it is looking at, the readers parsing a shop floor
 * — and asserts on what comes back.
 *
 * The pages here are a STAND-IN, written to the selectors in
 * worker/agent/sites/depop.js. That is the honest limit of this test and it
 * has to be said plainly: it proves every wire between the worker and the page
 * is connected, and it cannot prove the selectors match the real Depop. Those
 * have never been checked against the live site. A signed-in browser and one
 * run of `sellForm` corrects them, and nothing here substitutes for it.
 *
 * What it does prove, and what was broken at least once each: the agent is
 * injected and survives navigation, signedIn is not always false, the handle
 * is read rather than invented, listings parse with prices in cents, the same
 * card is not counted twice, and a sold item is not offered for sale.
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { openChrome, pageOverChrome } from "../worker/chrome.mjs";

process.env.FLIP_CHROME = process.env.FLIP_CHROME
  || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

/* A signed-in shop floor. Two cards, one of them sold, and the wrapper plus
   the anchor both match — which is exactly the shape that made every listing
   come back twice. */
const card = (slug, title, price, likes, sold) => `
  <li data-testid="product-card">
    <a href="/products/${slug}/">
      <img alt="${title}">
      <h3>${title}</h3>
      <p data-testid="price">${price}</p>
      <span data-testid="likes">${likes}</span>
      ${sold ? '<span data-testid="sold-badge">Sold</span>' : ""}
    </a>
  </li>`;

const SHOP = `<!doctype html><html><head><title>alleqsh</title></head><body>
  <header><a href="/alleqsh/" data-testid="profile-link">alleqsh</a></header>
  <nav><a href="/messages">Messages</a><a href="/sell/">Sell</a></nav>
  <ul>
    ${card("chrome-hearts-ring", "Chrome Hearts ring", "€1.200,50", "34 likes", false)}
    ${card("carhartt-jacket", "Carhartt jacket", "£95", "8 likes", true)}
  </ul>
</body></html>`;

/* And a logged-out one, because "shut door" and "quiet day" must never look
   the same to the loop. */
const LOGIN = `<!doctype html><html><body>
  <form><input type="password" name="password"><button>Log in</button></form>
</body></html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(req.url.startsWith("/login") ? LOGIN : SHOP);
});
await new Promise((go) => server.listen(0, "127.0.0.1", go));
const { port: web } = server.address();
const at = (path) => `http://www.depop.com${path}`;

/*
 * The pages have to really be served from depop.com, because the site module
 * decides what it is looking at from the hostname — that is the whole point of
 * it. There is no route to the real site from here and none is wanted, so
 * Chrome is told to resolve the name to the local server. The port is only
 * known once it is listening, so the args are set here rather than outside.
 */
process.env.FLIP_CHROME_ARGS = [
  process.env.FLIP_CHROME_ARGS ?? "",
  `--host-resolver-rules=MAP www.depop.com 127.0.0.1:${web}`,
].filter(Boolean).join("\n");

const home = await mkdtemp(join(tmpdir(), "flip-pass-"));
const chrome = await openChrome({
  home,
  port: 9412,
  agent: await readFile("worker/agent.built.js", "utf8"),
  log: (line) => console.log("      " + line),
});

const page = pageOverChrome(await chrome.open(at("/alleqsh/")));

/* Signed in, and it knows whose shop it is. */
const who = await page.ask("read", { what: "accountStatus" });
check(who && who.signedIn === true, "it knows a signed-in page when it sees one",
  JSON.stringify(who));
check(who && who.who === "@alleqsh", "the handle is read, not invented", JSON.stringify(who));

/* The shop floor. */
const rows = await page.ask("read", { what: "listings" });
const list = Array.isArray(rows) ? rows : rows?.items ?? rows?.rows ?? [];
check(list.length === 2, `both listings are read, and neither twice (got ${list.length})`);

const ring = list.find((r) => (r.title || "").includes("Chrome Hearts"));
check(!!ring, "the listing carries its title");
/* €1.200,50 is twelve hundred euro, not a hundred and twenty thousand. */
check(ring && ring.priceCents === 120050,
  "a European price parses to the right number of cents", String(ring?.priceCents));
check(ring && /\/products\/chrome-hearts-ring/.test(ring.url || ""),
  "the listing carries an absolute url", ring?.url);
check(ring && ring.sold !== true, "a live listing is not marked sold");

const jacket = list.find((r) => (r.title || "").includes("Carhartt"));
check(jacket && jacket.sold === true, "a sold listing is marked sold, so it is never refreshed");

/* And the door. This is the one the app got wrong for a whole evening: a
   logged-out page read as a quiet shop. */
await page.ask("goto", { url: at("/login/") });
const shut = await page.ask("read", { what: "accountStatus" });
check(shut && shut.signedIn === false, "a login page is a shut door, not a quiet day",
  JSON.stringify(shut));

page.close();
chrome.stop();
server.close();
if (bad) { console.log(`pass: ${bad} failed`); process.exit(1); }
console.log("pass: ok");
process.exit(0);
