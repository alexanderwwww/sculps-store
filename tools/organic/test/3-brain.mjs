/**
 * The brain, booted for real, with a stand-in phone on the wire.
 *
 * No browser and no Mac here — so the phone is a script that answers the way
 * a signed-in Instagram would, and this watches what the brain does with it:
 * finds the account, connects it, starts a look-around at once, and keeps
 * each account on its own cookie jar.
 */
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import { mkdtemp, cp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudStub } from "./_cloud-stub.mjs";
import { check, failures, until, sleep } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HOME = await mkdtemp(join(tmpdir(), "organic-brain-"));
const WORKER = join(HOME, "worker");
await cp(join(here, "..", "worker"), WORKER, { recursive: true });
// The worker installs `ws` for itself on a Mac; here it borrows the repo's.
await symlink(join(here, "..", "..", "..", "node_modules"), join(WORKER, "node_modules")).catch(() => {});
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 260000);

let nextOrder = null;
const cloud = await cloudStub({ order: () => { const o = nextOrder; nextOrder = null; return o ? { cmd: o } : null; }, brief: () => ({ store: "Test Store", storeUrl: "https://store.test/", products: ["Widget"], market: [], platforms: ["instagram"] }) });

const child = spawn(process.execPath, ["main.mjs"], {
  cwd: WORKER, stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, ORGANIC_HOME: HOME, ORGANIC_CLOUD: cloud.base, ORGANIC_PORT: "", ORGANIC_NO_LINK: "1" },
});
let out = "", err = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { err += d; });

const port = await until(() => { const m = /^PORT (\d+)\n/.exec(out); return m ? Number(m[1]) : null; }, 20000);
check("the brain comes up and says its port", Boolean(port), JSON.stringify(out.slice(0, 20)));

/* ---- the stand-in phone ---- */
const asks = [];
const profiles = [];
let signedIn = false, handle = null;
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
ws.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === "window") { if (m.do === "profile") profiles.push(m.id); return; }
  if (m.t !== "do") return;
  asks.push(m);
  const reply = (ok, result) => ws.send(JSON.stringify({ t: "done", id: m.id, ok, result, error: null }));
  if (m.act === "read") {
    if (m.what === "signedIn") return reply(true, signedIn);
    if (m.what === "handle") return reply(true, handle);
    if (m.what === "userId") return reply(true, signedIn ? "17841400000000000" : null);
    if (m.what === "text") return reply(true, "a feed of things");
    if (m.what === "posts") return reply(true, [{ url: "https://www.instagram.com/p/A/", handle: "@someone", views: 1200 }]);
    if (m.what === "tags") return reply(true, ["halloweendecor"]);
    if (m.what === "store") return reply(true, { products: [{ url: "https://store.test/products/w", title: "Widget", price: "$9" }], stopped: null });
    if (m.what === "ads") return reply(true, []);
    if (m.what === "accountStatusUrl") return reply(true, "https://www.instagram.com/accounts/account_status/");
    if (m.what === "accountStatus") return reply(true, { restricted: true, said: "Your account is not eligible to be recommended" });
    return reply(true, null);
  }
  if (m.act === "tap") return reply(true, { found: true, changed: true });
  reply(true, true);
});
await until(() => ws.readyState === 1, 8000);
check("the phone connects to the brain", ws.readyState === 1);

// Nothing signed in: it should ask, not invent.
await sleep(4000);
check("it asks for a sign-in rather than pretending", /connect an account on the phone/.test(err), err.slice(-120));
check("it put the phone on an account's own jar", profiles.length >= 1, profiles.slice(0, 2).join(","));

// Now the account is signed in, but the platform will not say who.
signedIn = true;
const working = await until(() => /is signed in — working as @/.test(err), 90000);
check("a signed-in account with no name still starts", Boolean(working), err.split("\n").filter(Boolean).slice(-1)[0]);
check("it works under the account's own id", /working as @17841400000/.test(err));

// A look-around starts at once, not at seven tonight.
const look = await until(() => /a first look around/.test(err), 30000);
check("a first look around starts immediately", Boolean(look));
const moved = await until(() => asks.some((a) => a.act === "scroll") && asks.some((a) => a.act === "dwell"), 60000);
check("the crew actually scrolls and watches", Boolean(moved), asks.filter((a) => a.act === "scroll").length + " scrolls");

// And when the platform finally says the name, it swaps it in.
handle = "@blackreaper.us";
const named = await until(() => /says its name now: @blackreaper\.us/.test(err), 90000);
check("the real name replaces the id when it arrives", Boolean(named));

// The panel is how he picks a worker to watch: one row per account, each
// saying what it is doing, plus the research screen.
const panels = asks.filter((a) => a.act === "panel").filter(Boolean);
const last = panels[panels.length - 1] ?? {};
check("the panel lists accounts by id", Array.isArray(last.accounts) && last.accounts.some((a) => a.id === "instagram-1"), JSON.stringify(last.accounts ?? []).slice(0, 160));
check("each row says what that one is doing", last.accounts.some((a) => a.id === "instagram-1" && typeof a.doing === "string" && a.doing.length));
check("the research screen is one of the rows", last.accounts.some((a) => a.id === "market"));
check("one row is marked as the one on screen", last.accounts.some((a) => a.on === true));

// Tapping a row switches the glass — by account id, not by platform.
const before = profiles.length;
ws.send(JSON.stringify({ t: "asked", do: "switch", account: "market" }));
const switched = await until(() => profiles.length > before, 15000);
check("tapping a row puts that one on the glass", Boolean(switched), `${before} -> ${profiles.length}`);

// The recovery: ordered from the cloud, and it says so in its own words.
nextOrder = "recover instagram-1";
const onRecovery = await until(() => /is on the recovery/.test(err), 60000);
check("an account can be put on the recovery", Boolean(onRecovery), err.split("\n").filter(Boolean).slice(-1)[0]);
const statusRead = await until(() => asks.some((a) => a.act === "read" && a.what === "accountStatus"), 90000);
check("it reads Instagram's own Account Status", Boolean(statusRead));
const savedNow = JSON.parse(await readFile(join(WORKER, "accounts.json"), "utf8"));
check("the recovery survives a restart", savedNow.accounts[0].mission === "recover" && typeof savedNow.accounts[0].missionSince === "string");

const saved = JSON.parse(await readFile(join(WORKER, "accounts.json"), "utf8"));
check("the account and its jar are on disk", saved.accounts.length >= 1 && /^[0-9a-f-]{36}$/.test(saved.accounts[0].profileId));
check("every jar is different", new Set(profiles).size === profiles.length || new Set(profiles).size > 1, profiles.length + " switches");

child.stdin.end();
child.kill();
await cloud.stop?.();
clearTimeout(guard);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
