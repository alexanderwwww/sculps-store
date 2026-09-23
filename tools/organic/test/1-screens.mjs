import { openChrome } from "../worker/chrome.mjs";
import { Screens } from "../worker/screens.mjs";
import { check, failures, testChrome, stubSites, sleep } from "./lib.mjs";
import { execSync } from "node:child_process";

const PORT = 9461;
const PROFILE = "/tmp/claude-0/organic-test-1";
execSync(`rm -rf ${PROFILE}`);
const SITES = { "ig.test": "<html><body><h1>ig</h1></body></html>", "tt.test": "<html><body><h1>tt</h1></body></html>" };
const HOSTS = { instagram: "ig.test", tiktok: "tt.test" };

const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 90000);

let { browser } = await testChrome(PORT, PROFILE);
let screens = new Screens(browser, { hosts: HOSTS });
await stubSites(await screens.context(), SITES);
await screens.adopt();

const a = await screens.open("instagram", "http://ig.test/");
const b = await screens.open("instagram", "http://ig.test/");
check("open twice → the same page", a === b);
check("it went where it was told", a.url() === "http://ig.test/", a.url());
await screens.open("tiktok", "http://tt.test/");
const ctx = await screens.context();
check("two ids → two pages, no strays", ctx.pages().filter((p) => !p.isClosed()).length === 2, String(ctx.pages().length));
check("page(id) finds it", screens.page("tiktok").url() === "http://tt.test/");
check("busy() is null when nobody is focused", screens.busy("instagram") === null);
await screens.focus("instagram");
check("busy() is alex while focused", screens.busy("instagram") === "alex" && screens.busy("tiktok") === null);
await screens.focus(null);

// A stray page, opened outside Screens (never in the app; here to prove it gets closed).
const stray = await ctx.newPage();
await stray.goto("http://ig.test/stray").catch(() => {});

// Restart: the worker comes back with an empty tab map over a browser that
// still has the pages. (The browser is this process's now — closing it would
// close it, so the restart is the worker forgetting, not the browser dying.)
await screens.dispose();
await sleep(300);
screens = new Screens(browser, { hosts: HOSTS });
const adopted = await screens.adopt();
check("adopt after restart finds both by host", adopted.includes("instagram") && adopted.includes("tiktok"), adopted.join(","));
const again = await screens.open("instagram", "http://ig.test/");
check("open after adopt reuses the page, no navigation", again === screens.page("instagram") && again.url().startsWith("http://ig.test/"));
const live = (await screens.context()).pages().filter((p) => !p.isClosed());
check("the stray was closed — one page per id", live.length === 2, String(live.length));

clearTimeout(guard);
await browser.close().catch(() => {});
execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
