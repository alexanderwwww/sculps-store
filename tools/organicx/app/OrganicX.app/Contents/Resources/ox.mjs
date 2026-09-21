/**
 * OrganicX — the thing that runs.
 *
 * Double-clicked, it opens its own Chrome, says what it is doing, waits for
 * orders, and gets on with the work. Everything it does is reported to the
 * control plane after it does it, because the Mac cannot be reached from
 * where Claude is and "it stopped" is not a diagnosis.
 *
 * Three jobs, in order of how often they run:
 *
 *   obey      an order arrives within a couple of seconds, wherever it is
 *   update    a new build installs itself and the app restarts
 *   work      connect, then farm, then the rest of the loop
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { openChrome, attach, say, signedIn, whoAmI, sleep, checkFriction } from "./browser.mjs";
import * as db from "./db.mjs";
import { planDay, scatterAcrossDay, dayBudget, isAwake } from "./human.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** This build. The control plane's runtime slot is compared against it. */
export const BUILD = 1;

const BASE =
  process.env.OX_BASE ??
  "https://kerberos.gardenbuddystore.workers.dev/organicx/q9DpKpatiPsqZc_sSQr5Vo-8UI4FR3ck";

/**
 * One folder for everything, under Application Support.
 *
 * Nothing lands on the Desktop and nothing spreads: the Chrome profile, the
 * runtime, and the scratch space for clips all live here, and the scratch is
 * emptied as it goes.
 */
const HOME = join(homedir(), "Library", "Application Support", "OrganicX");
const PATHS = {
  home: HOME,
  profile: join(HOME, "chrome"),
  runtime: join(HOME, "runtime"),
  /* Temporary by design. A raw clip lives only as long as it takes to judge it. */
  scratch: join(HOME, "scratch"),
};

/* ------------------------------------------------------------- reporting */

const recent = [];

/**
 * One line of the crew ticker.
 *
 * Plain language, and always a name: "Sam · @spookyhome, watched 14, liked 2"
 * rather than a stack trace. When something stops, Alex should get a person
 * and a sentence.
 */
export async function tick(who, did) {
  const line = `${who} · ${did}`;
  recent.push(line);
  while (recent.length > 40) recent.shift();
  console.log(line);
  await post("/log", { who, did }).catch(() => {});
}

async function post(path, body) {
  return fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json().catch(() => null));
}

async function get(path) {
  return fetch(BASE + path).then((r) => r.json().catch(() => null));
}

let state = "starting";
let doing = "";

async function report() {
  await post("/status", {
    state,
    doing,
    build: BUILD,
    at: Date.now(),
    tail: recent.slice(-18),
  }).catch(() => {});
}

/* ---------------------------------------------------------- self-updating */

/**
 * Pull a new build and restart.
 *
 * This is the whole of "version one updates itself". The wand reached build
 * seventy-one because every fix meant Alex downloading a .app; this one takes
 * a fix without him doing anything. Exit code 75 is what the launcher
 * restarts on.
 */
async function maybeUpdate() {
  const runtime = await get("/runtime").catch(() => null);
  if (!runtime?.build || runtime.build === BUILD) return false;

  await tick("organicx", `updating to build ${runtime.build}`);
  await mkdir(PATHS.runtime, { recursive: true });
  for (const [name, source] of Object.entries(runtime.files ?? {})) {
    // Only ever writes beside itself, never anywhere else on the disk.
    if (name.includes("/") || name.includes("..")) continue;
    await writeFile(join(PATHS.runtime, name), source, "utf8");
  }
  await writeFile(join(PATHS.runtime, "BUILD"), String(runtime.build), "utf8");
  state = "updating";
  await report();
  process.exit(75);
}

/* ----------------------------------------------------------- the connect */

/**
 * Open each platform so Alex can sign in himself.
 *
 * It types nothing. It opens the page, waits for him, and looks at what is
 * there — and when it cannot tell which state the page is in, it says so
 * rather than assuming "connected" and posting into a logged-out browser.
 */
export async function connect(browser, only) {
  const wanted = only ? [only] : ["tiktok", "instagram", "youtube"];
  const context = browser.contexts()[0] ?? (await browser.newContext());

  for (const platform of wanted) {
    const page = await context.newPage();
    await attach(page);
    await tick("sam", `opening ${platform} — sign in and I will pick it up`);

    // Up to five minutes per platform, checked every few seconds. He may be
    // doing a 2FA code on his phone, and rushing him is how this gets a
    // half-signed-in session recorded as connected.
    let result = { connected: false, friction: null };
    for (let i = 0; i < 60; i++) {
      result = await signedIn(page, platform);
      if (result.connected) break;
      await say(page, `waiting for you to sign in to ${platform}`);
      await sleep(5000);
    }

    if (!result.connected) {
      await tick("sam", `${platform} is still not signed in${result.friction ? ` (${result.friction})` : ""} — skipping it`);
      await page.close();
      continue;
    }

    const handle = (await whoAmI(page, platform)) ?? `(${platform} account)`;
    const row = await db.markConnected(platform, handle, PATHS.profile);
    await say(page, `${handle} connected`);
    await tick("sam", `${platform} connected as ${handle}`);
    await post("/accounts", { accounts: await db.accounts() }).catch(() => {});
    await page.close();

    if (!(await db.personaFor(row.id))) {
      await tick("ines", `writing who ${handle} is — this gets written once and kept`);
      await db.savePersona(row.id, personaSeed(handle));
    }
  }
}

/**
 * A starting persona.
 *
 * Deliberately specific: vague people read as bots. This is a seed rather
 * than the final word — it is written once, kept, and never regenerated,
 * because a person does not change who they are between Tuesday and
 * Wednesday.
 */
function personaSeed(handle) {
  const metros = ["Columbus, OH", "Boise, ID", "Mobile, AL", "Provo, UT", "Raleigh, NC"];
  const metro = metros[Math.floor(Math.random() * metros.length)];
  return {
    who: `34, suburban, two kids, owns the house, decorates hard for Halloween (${handle})`,
    metro,
    hours: [
      { start: "07:05", end: "07:40" },
      { start: "12:20", end: "12:55" },
      { start: "20:10", end: "23:10" },
    ],
    interests: ["home improvement", "dogs", "high-school football", "deals and coupons"],
    voice: "short, lowercase, says omg and no way, never uses a semicolon",
    typing: { cpsMin: 4.5, cpsMax: 9, typoRate: 0.04 },
    temperament: { likeRate: 0.055, saveRate: 0.012, shareRate: 0.004, commentRate: 0.006, followRate: 0.004 },
    daysOff: [2],
  };
}

/* -------------------------------------------------------------- the work */

/**
 * A farming session: watch, like a little, follow rarely, and stop on
 * friction. Posting is one behaviour among many, not the only one.
 */
export async function farm(browser, account) {
  if (await db.isParked(account.id)) {
    await tick("sam", `${account.handle} is parked for today — leaving it alone`);
    return;
  }
  const persona = await db.personaFor(account.id);
  if (!persona) return;
  if (!isAwake(persona, new Date())) {
    await tick("bea", `${account.handle} is not awake at this hour — later`);
    return;
  }

  const sessions = planDay(persona, account.warmed_days);
  if (!sessions.length) {
    await tick("bea", `${account.handle} does not open the app today — that happens`);
    return;
  }
  const budget = dayBudget(persona, account.warmed_days);
  await tick(
    "bea",
    `${account.handle}: ${sessions.length} session${sessions.length > 1 ? "s" : ""} today, up to ${budget.like} likes`,
  );

  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  await attach(page);
  await say(page, `${account.handle} — having a scroll`);

  const friction = await checkFriction(page);
  if (friction) {
    await db.park(account.id, friction);
    await tick("sam", `${account.handle}: ${friction}. That account is done for today.`);
    await page.close();
    return;
  }

  await db.seen(account.id);
  await db.warmedToday(account.id);
  await page.close();
}

/* -------------------------------------------------------------- the loop */

async function main() {
  await mkdir(PATHS.home, { recursive: true });
  await mkdir(PATHS.scratch, { recursive: true });
  db.connect(process.env.DATABASE_URL);

  state = "starting";
  await report();
  await tick("organicx", `build ${BUILD} is up`);

  const { browser } = await openChrome({ profile: PATHS.profile });
  state = "idle";
  doing = "waiting for something to do";
  await report();

  for (;;) {
    try {
      if (await maybeUpdate()) return;

      const order = await get("/order").catch(() => null);
      if (order?.cmd) {
        const cmd = String(order.cmd);
        await tick("organicx", `heard: ${cmd}`);

        if (cmd === "stop") {
          state = "stopped";
          await report();
          await browser.close().catch(() => {});
          return;
        }
        if (cmd.startsWith("connect")) {
          state = "connecting";
          await report();
          const only = cmd.split(" ")[1];
          await connect(browser, only);
          state = "idle";
        }
        if (cmd === "warm" || cmd === "run") {
          state = "working";
          await report();
          for (const account of await db.accounts()) {
            if (!account.connected) continue;
            await farm(browser, account);
          }
          state = "idle";
        }
      }

      await report();
      await sleep(2000);
    } catch (error) {
      // Say what failed and why. "Nothing happened" is not a status.
      await tick("organicx", `stopped on: ${error?.message ?? error}`);
      state = "error";
      doing = String(error?.message ?? error);
      await report();
      await sleep(5000);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("ox.mjs")) {
  main().catch(async (error) => {
    console.error(error);
    await tick("organicx", `could not start: ${error?.message ?? error}`).catch(() => {});
    process.exit(1);
  });
}

export { PATHS, main };
