/**
 * The two dead buttons come off Depop's sign-in sheet — proven, not assumed.
 *
 * "every time I try to connect, it connects to my iCloud and then it brings me
 * back to the login screen." Continue with Apple hands the browser to iCloud
 * and iCloud hands it back; an embedded web view cannot finish that handshake,
 * so the login page returns forever. Continue with Google refuses outright.
 * The only fix that holds is the buttons not being there.
 *
 * This drives the REAL script out of main.swift, never a copy, against a
 * stand-in for the modal — including the Greek label his account is served,
 * which is what caught the first version: "Συνέχεια" is accented and the match
 * was not, so the Google button would have shipped still standing.
 *
 * The page has to really be on depop.com, because the script guards on
 * location.hostname and that cannot be redefined from inside a page. There is
 * no route to the real site from here and none is wanted, so a local server
 * answers and Chromium resolves the name to it.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";

const SWIFT = "app/Flip.app/Contents/Resources/Shell/main.swift";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const source = await readFile(SWIFT, "utf8");
const start = source.indexOf('let onlyEmail = """');
if (start < 0) throw new Error("onlyEmail is gone from main.swift");
const from = source.indexOf("\n", start) + 1;
const end = source.indexOf('\n    """', from);
const script = source.slice(from, end);

const SHEET = `<body><div id="sheet">
  <button>\u03a3\u03c5\u03bd\u03ad\u03c7\u03b5\u03b9\u03b1 \u03bc\u03b5 \u03c4\u03b7\u03bd Google</button>
  <button>Continue with Apple</button>
  <a href="/login/email/">Continue with email</a>
  <button>Sign up</button></div>
  <button>Apple Pay checkout is a different thing entirely and much longer here</button>
</body>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(SHEET);
});
await new Promise((go) => server.listen(0, "127.0.0.1", go));
const { port } = server.address();

const browser = await chromium.launch({
  args: ["--no-sandbox", `--host-resolver-rules=MAP www.depop.com 127.0.0.1:${port}`],
  executablePath: CHROME,
});

let bad = 0;
function check(ok, what) {
  console.log(ok ? "  ok  " + what : "FAIL  " + what);
  if (!ok) bad++;
}

const page = await browser.newPage();
await page.goto("http://www.depop.com/login/");
await page.evaluate(script);
const text = () => page.evaluate(() => document.body.innerText);

let seen = await text();
check(!/Google/.test(seen), "the Google button is gone, accent and all");
check(!/Continue with Apple/.test(seen), "the Apple button is gone");
check(/Continue with email/.test(seen), "the email route is untouched");
check(/Sign up/.test(seen), "an unrelated control is untouched");
check(/Apple Pay checkout/.test(seen), "Apple Pay is not mistaken for sign-in");

// React re-renders the modal; the observer has to catch that.
await page.evaluate(() => {
  const b = document.createElement("button");
  b.textContent = "Continue with Apple";
  document.getElementById("sheet").appendChild(b);
});
await page.waitForTimeout(150);
check(!/Continue with Apple/.test(await text()), "a re-rendered Apple button is caught");

const elsewhere = await browser.newPage();
await elsewhere.setContent(SHEET);
await elsewhere.evaluate(script);
check(/Continue with Apple/.test(await elsewhere.evaluate(() => document.body.innerText)),
  "every other site is left alone");

await browser.close();
server.close();
if (bad) { console.log(`only-email: ${bad} failed`); process.exit(1); }
console.log("only-email: ok");
process.exit(0);
