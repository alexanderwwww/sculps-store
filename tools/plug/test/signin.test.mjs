/**
 * The sign-in gate, for BOTH marketplaces.
 *
 * Nothing else in plug is written until this holds, so it is tested first and
 * hardest. Two things have to be true on each site, and each one has already
 * cost a build on the app plug replaces.
 *
 * One: the two buttons that cannot work are not on the page. Continue with
 * Google is refused outright inside an embedded web view, and Continue with
 * Apple hands the browser to iCloud, which returns it to the login screen —
 * forever, with no error. Removing them is the only fix that holds, and it has
 * to survive the page re-rendering, which a one-shot click does not.
 *
 * Two: the matching is on the WORDS Google and Apple, never on the verb. His
 * account is served Greek, where the label is "Συνέχεια με την Google" —
 * accented, which is exactly what defeated the first attempt at this.
 *
 * The script is read out of main.swift, never copied here. A test that drives
 * its own copy is testing itself.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { chromium } from "playwright";

const SWIFT = "app/Plug.app/Contents/Resources/Shell/main.swift";
const CHROME = process.env.PLUG_CHROME
  || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let bad = 0;
const check = (ok, what) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what);
  if (!ok) bad++;
};

const source = await readFile(SWIFT, "utf8");
const start = source.indexOf('let onlyEmail = """');
if (start < 0) throw new Error("onlyEmail is gone from main.swift — the sign-in is unguarded");
const from = source.indexOf("\n", start) + 1;
const end = source.indexOf('\n    """', from);
const script = source.slice(from, end);

/* Greek on one site, English on the other — both are labels he is really
   served, and both have to fall. */
const SHEET = `<body><div id="sheet">
  <button>Συνέχεια με την Google</button>
  <button>Continue with Apple</button>
  <a href="/login/email/">Continue with email</a>
  <button>Sign up</button></div>
  <button>Apple Pay checkout is something else entirely and much longer than a label</button>
</body>`;

/*
 * HTTPS, with a self-signed certificate, and it has to be.
 *
 * depop.com is on Chrome's preloaded HSTS list, so a plain http:// navigation
 * is rewritten to https:// before it leaves the browser and then fails on the
 * certificate. A local server answering http is never reached at all — which is
 * exactly the ERR_BLOCKED_BY_CLIENT that stopped an earlier attempt at this
 * test and was mistaken for a networking problem.
 */
const server = createServer({
  key: await readFile("test/fixtures/dev-key.pem"),
  cert: await readFile("test/fixtures/dev-cert.pem"),
}, (_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(SHEET);
});
await new Promise((go) => server.listen(0, "127.0.0.1", go));
const { port } = server.address();

const SITES = ["www.depop.com", "www.vestiairecollective.com"];
const browser = await chromium.launch({
  executablePath: CHROME,
  /* One rule with both maps in it: Chrome keeps only the last
     --host-resolver-rules flag it is given, so passing the flag twice silently
     loses the first site. */
  args: [
    "--no-sandbox",
    /* Without this the resolver rule is bypassed entirely: this container has
       an HTTPS proxy configured, Chrome hands the hostname to the proxy, and
       the navigation reaches the REAL site — which answers 403 and reads as a
       broken test rather than as traffic that should never have left. */
    "--no-proxy-server",
    /* One rule with both maps in it: Chrome keeps only the last
       --host-resolver-rules flag it is given, so passing the flag twice
       silently loses the first site. */
    `--host-resolver-rules=${SITES.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(",")}`,
  ],
});
/* ignoreHTTPSErrors belongs to the CONTEXT, not the launch — passing it to
   launch is accepted and does nothing, which reads as a cert error nobody can
   explain. */
const context = await browser.newContext({ ignoreHTTPSErrors: true });

for (const host of SITES) {
  const page = await context.newPage();
  await page.goto(`https://${host}/login/`);
  await page.evaluate(script);
  const text = () => page.evaluate(() => document.body.innerText);

  let seen = await text();
  check(!/Google/.test(seen), `${host}: the Google button is gone, accent and all`);
  check(!/Continue with Apple/.test(seen), `${host}: the Apple button is gone`);
  check(/Continue with email/.test(seen), `${host}: the one route that works is untouched`);
  check(/Sign up/.test(seen), `${host}: an unrelated control is untouched`);
  check(/Apple Pay checkout/.test(seen), `${host}: Apple Pay is not mistaken for sign-in`);

  /* Both sites are React apps and re-render their sheets. */
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.textContent = "Continue with Apple";
    document.getElementById("sheet").appendChild(b);
  });
  await page.waitForTimeout(150);
  check(!/Continue with Apple/.test(await text()), `${host}: a re-rendered button is caught too`);
  await page.close();
}

/* And nowhere else on the web is any of its business. */
const elsewhere = await context.newPage();
await elsewhere.setContent(SHEET);
await elsewhere.evaluate(script);
check(/Continue with Apple/.test(await elsewhere.evaluate(() => document.body.innerText)),
  "every other site is left completely alone");

await browser.close();
server.close();
if (bad) { console.log(`signin: ${bad} failed`); process.exit(1); }
console.log("signin: ok");
process.exit(0);
