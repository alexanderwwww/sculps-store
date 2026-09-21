/**
 * Where does the connect step actually spend its time?
 *
 * Written because the daemon sat on "opening instagram" for minutes and three
 * rounds of reasoning about which call was hanging were all wrong. This times
 * every step, and stops itself, so the answer is a number rather than a
 * theory.
 */
import { openChrome, attach, connection, signedIn } from "../browser.mjs";

const t0 = Date.now();
const at = (m) => console.log(`${String(Date.now() - t0).padStart(6)}ms  ${m}`);

const guard = setTimeout(() => {
  console.log("HARD STOP — something above this line never returned");
  process.exit(9);
}, 90000);

at("openChrome…");
const { browser } = await openChrome({ profile: "/tmp/claude-0/oxprof2" });
at("chrome up");

const ctx = browser.contexts()[0] ?? (await browser.newContext());
at(`context (${browser.contexts().length} existing)`);

const page = await ctx.newPage();
at("newPage");

await attach(page);
at("attach done");

await connection(page, "instagram", "checking");
at("connection() done");

const r1 = await signedIn(page, "instagram");
at(`signedIn (navigating) -> ${JSON.stringify(r1)}`);

const r2 = await signedIn(page, "instagram", { navigate: false });
at(`signedIn (no nav)    -> ${JSON.stringify(r2)}`);

clearTimeout(guard);
await browser.close();
at("closed");
process.exit(0);
