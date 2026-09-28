/**
 * Vestiaire's reader, driven in a real browser against real markup.
 *
 * The numbers on this site have four figures in them, so the two things that
 * must never be wrong are the price and whether something is sold. A European
 * price misread by a factor of a thousand lists a bag at a euro twenty; the
 * word "sold" mistaken for a sold badge quietly withdraws live stock.
 *
 * The markup here is a STAND-IN, written to the selectors in the module, and
 * that limit has to be said plainly: this proves the parsing and the shape of
 * what comes back. It cannot prove the selectors match the live site, because
 * none of them have been opened against it. One signed-in run of `sellForm`
 * corrects that, and nothing here substitutes for it.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";

const CHROME = process.env.PLUG_CHROME
  || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

const card = (slug, title, price, likes, sold) => `
  <li data-testid="product-card">
    <a href="/p/${slug}/">
      <img alt="${title}">
      <h3>${title}</h3>
      <span data-testid="price">${price}</span>
      <span data-testid="likes">${likes}</span>
      ${sold ? '<span data-testid="sold-badge">Sold</span>' : ""}
    </a>
  </li>`;

const SHELF = `<!doctype html><html><body>
  <header><a href="/me/"><span class="name">alleqsh</span></a></header>
  <nav><a href="/sell">Sell</a><a href="/my-orders">Orders</a></nav>
  <ul>
    ${card("birkin-35", "Hermès Birkin 35", "€1.200,50", "34", false)}
    ${card("rolex-datejust", "Rolex Datejust", "$16,800.00", "12", true)}
    ${card("ch-ring", "Chrome Hearts ring", "€480", "5", false)}
  </ul>
  <!-- the word, not a badge: this must NOT mark anything sold -->
  <p>Recently sold by this seller</p>
</body></html>`;

const LOGIN = `<!doctype html><html><body>
  <form><input type="password" name="password"><button>Log in</button></form>
</body></html>`;

const ORDER_SHIP = `<!doctype html><body>
  <h1>Congratulations, your item sold</h1>
  <p>Print your shipping label and send it to Vestiaire Collective for authentication.</p>
</body>`;

const ORDER_AUTH = `<!doctype html><body>
  <p>Your item is being authenticated by our experts.</p></body>`;

const server = createServer((req, res) => {
  const body = req.url.startsWith("/login") ? LOGIN
    : req.url.startsWith("/order-ship") ? ORDER_SHIP
    : req.url.startsWith("/order-auth") ? ORDER_AUTH
    : SHELF;
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
});
await new Promise((go) => server.listen(0, "127.0.0.1", go));
const { port } = server.address();

/* The module guards on the hostname, so the page has to really be on it.
   Splitting Chrome's args on newlines, because --host-resolver-rules has a
   space in its value and splitting on spaces hands Chrome three URLs. */
const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    "--no-sandbox",
    `--host-resolver-rules=MAP www.vestiairecollective.com 127.0.0.1:${port}`,
  ],
});

const agent = await readFile("worker/agent.built.js", "utf8");
const page = await browser.newPage();
const at = (path) => `http://www.vestiairecollective.com${path}`;

async function load(path) {
  await page.goto(at(path));
  await page.evaluate(agent);
  return page.evaluate(() => window.__organicNS.sites.vestiaire);
}

await load("/shelf");

/* common.js sets up the registry; only real marketplaces register themselves
   in it, which is the shape that keeps the core ignorant of both. */
check(await page.evaluate(() => Object.keys(window.__organicNS.sites).sort().join(",")) === "depop,vestiaire",
  "both marketplaces are registered, and nothing else is");

check(await page.evaluate(() => window.__organicNS.sites.vestiaire.match("www.vestiairecollective.com")
  && !window.__organicNS.sites.vestiaire.match("www.depop.com")),
  "it claims its own site and not the other one");

check(await page.evaluate(() => window.__organicNS.sites.vestiaire.signedIn()) === true,
  "it knows a signed-in page when it sees one");
check(await page.evaluate(() => window.__organicNS.sites.vestiaire.who()) === "alleqsh",
  "the handle is read, not invented");

const rows = await page.evaluate(() => window.__organicNS.sites.vestiaire.listings());
check(rows.length === 3, `every item is read, and none of them twice (got ${rows.length})`);

const birkin = rows.find((r) => /Birkin/.test(r.title || ""));
/* €1.200,50 is twelve hundred euro. Read as a decimal point it is a euro
   twenty, and the bag is given away. */
check(birkin && birkin.priceCents === 120050,
  "a European price is twelve hundred euro, not one euro twenty", String(birkin?.priceCents));

const rolex = rows.find((r) => /Rolex/.test(r.title || ""));
check(rolex && rolex.priceCents === 1680000,
  "a US price with a comma parses to the right number of cents", String(rolex?.priceCents));
check(rolex && rolex.sold === true, "a sold badge marks it sold");

const ring = rows.find((r) => /Chrome Hearts/.test(r.title || ""));
check(ring && ring.priceCents === 48000, "a price with no decimals still parses", String(ring?.priceCents));
check(rows.every((r) => r.site === "vestiaire"), "every row says which site it came from");
check(rows.filter((r) => r.sold).length === 1,
  "the WORD sold on the page does not mark live stock as gone");

/* The leg that does not exist on Depop. Calling a sale done at "sold" tells
   him a parcel is handled while it is still on his table. */
await load("/order-ship");
check(await page.evaluate(() => window.__organicNS.sites.vestiaire.orderStage()) === "ship-to-authentication",
  "a sale says it still has to go to authentication");
await load("/order-auth");
check(await page.evaluate(() => window.__organicNS.sites.vestiaire.orderStage()) === "with-authentication",
  "an item at authentication is not reported as delivered");

/* And the door. A logged-out page read as a quiet shelf is the worst lie the
   app can tell, because a shut door and a slow day look identical. */
await load("/login");
check(await page.evaluate(() => window.__organicNS.sites.vestiaire.signedIn()) === false,
  "a login page is a shut door, not a quiet day");

await browser.close();
server.close();
if (bad) { console.log(`vestiaire: ${bad} failed`); process.exit(1); }
console.log("vestiaire: ok");
process.exit(0);
