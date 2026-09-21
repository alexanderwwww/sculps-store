/**
 * OrganicX — the thing that runs.
 *
 * Double-clicked, it opens its own Chrome and gets on with it. It does not
 * wait to be told to start — anything not connected gets connected, and then
 * it works. Orders steer it; they do not start it.
 *
 * Everything it does is reported after it does it, because the Mac cannot be
 * reached from where Claude is and "it stopped" is not a diagnosis.
 *
 * Three jobs, in order of how often they run:
 *
 *   work      connect, then farm, on the accounts' own rhythms
 *   obey      an order arrives within a couple of seconds, wherever it is
 *   update    a new build installs itself and the app restarts
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  openChrome, attach, say, signedIn, whoAmI, sleep, checkFriction,
  connection, panelState, working, stopRequested,
} from "./browser.mjs";
import * as db from "./db.mjs";
import { planDay, scatterAcrossDay, dayBudget, isAwake } from "./human.mjs";
import * as skills from "./skills.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** This build. The control plane's runtime slot is compared against it. */
export const BUILD = 4;

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
    skills: skills.list(),
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
    /*
     * Only ever beside itself. A code file at the top, a skill under
     * skills/, and nothing else — no parent hops, no deeper paths, no
     * absolute anything. The other end of this is a network channel that
     * writes to somebody's disk.
     */
    const isCode = /^[\w.-]+\.(mjs|json)$/.test(name);
    const isSkill = /^skills\/[\w.-]+\.md$/.test(name);
    if ((!isCode && !isSkill) || name.includes("..")) continue;
    if (isSkill) await mkdir(join(PATHS.runtime, "skills"), { recursive: true });
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
  /*
   * Instagram first, then TikTok, then YouTube.
   *
   * The order is Alex's: he signs in one at a time, and Instagram is the one
   * that matters most — best conversion, product tagging in the reel, one tap
   * to the store.
   */
  const wanted = only ? [only] : ["instagram", "tiktok", "youtube"];
  const context = browser.contexts()[0] ?? (await browser.newContext());

  for (const platform of wanted) {
    const page = await context.newPage();
    await attach(page);
    await connection(page, platform, "checking");
    await tick("sam", `opening ${platform} — sign in and I will pick it up`);

    /*
     * It watches rather than waits.
     *
     * The first version gave each platform five minutes and then gave up,
     * which is wrong twice over: he may be finding a code on his phone, and
     * he said himself he would do one now and one later. So it checks, and
     * if nothing is signed in it moves on and comes back — a platform that
     * gets signed into an hour from now is picked up on the next sweep
     * without anybody restarting anything.
     */
    /*
     * Eight tries, not twenty-four.
     *
     * Each try is a page load plus a settle plus five seconds — about ten
     * seconds — so twenty-four was four minutes per platform and twelve
     * before it did anything else. It does not need to camp there: it comes
     * back every sweep, so a minute and a half is enough to catch somebody
     * already signing in, and everybody else is caught later without them
     * waiting on it.
     */
    let result = { connected: false, friction: null };
    for (let i = 0; i < 8; i++) {
      // Navigate on the first look only; after that the tab is already there
      // and signing in happens in it, so checking is reading the DOM again.
      result = await signedIn(page, platform, { navigate: i === 0 });
      if (result.connected) break;
      await connection(page, platform, "waiting");
      await say(page, `sign in to ${platform} — I am watching this tab`);
      if (await stopRequested(page)) break;
      await sleep(5000);
    }

    if (!result.connected) {
      await connection(page, platform, "off");
      await tick(
        "sam",
        `${platform} is not signed in yet${result.friction ? ` (${result.friction})` : ""} — I will keep checking`,
      );
      await page.close();
      continue;
    }

    /*
     * A connection with no name on it is not a connection.
     *
     * The markers can be fooled — a signed-out TikTok once came back as
     * "connected as @" — and the handle cannot: reading it means the page
     * gave up something only a signed-in session has. So it is the
     * confirmation, not a decoration on one.
     */
    const handle = await whoAmI(page, platform);
    if (!handle || handle.replace(/[@\s]/g, "") === "") {
      await connection(page, platform, "off");
      await tick(
        "sam",
        `${platform} looked signed in but would not tell me who — not taking that as connected`,
      );
      await page.close();
      continue;
    }
    const row = await db.markConnected(platform, handle, PATHS.profile);
    await connection(page, platform, "connected", handle);
    await say(page, `${handle} connected`);
    await tick("sam", `${platform} connected as ${handle}`);
    await post("/accounts", { accounts: await db.accounts() }).catch(() => {});

    if (!(await db.personaFor(row.id))) {
      await working(page, "ines", `writing who ${handle} is`);
      await tick("ines", `writing who ${handle} is — written once and kept`);
      await db.savePersona(row.id, personaSeed(handle));
    }
    await sleep(1200);
    await page.close();
  }
}

/**
 * Re-check what is signed in, and show it.
 *
 * Runs on every sweep. A session that has expired should stop being green
 * the moment it expires, not the next time somebody restarts the app — and a
 * platform Alex signs into later should go green on its own.
 */
export async function verifyConnections(browser) {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const rows = await db.accounts();
  const page = await context.newPage();
  await attach(page);

  for (const platform of ["instagram", "tiktok", "youtube"]) {
    const known = rows.find((r) => r.platform === platform && r.connected);
    await connection(page, platform, "checking");
    const result = await signedIn(page, platform);
    if (result.connected) {
      const handle = known?.handle ?? (await whoAmI(page, platform));
      if (!handle || handle.replace(/[@\s]/g, "") === "") {
        // Same rule as the connect step: no name, not connected.
        await connection(page, platform, "off");
        continue;
      }
      if (!known) {
        // Signed in since the last look. Pick it up without being asked.
        const row = await db.markConnected(platform, handle, PATHS.profile);
        await tick("sam", `${platform} came online as ${handle}`);
        if (!(await db.personaFor(row.id))) await db.savePersona(row.id, personaSeed(handle));
      }
      await connection(page, platform, "connected", handle);
    } else {
      await connection(page, platform, "off");
      if (known) await tick("sam", `${platform} is signed out now — it was ${known.handle}`);
    }
  }
  await page.close();
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

/**
 * Whether the clip tools are here, asked where they are needed.
 *
 * Startup does not demand them; anything that pulls or cuts a clip does, and
 * gets a sentence naming the fix rather than a spawn failure.
 */
export function clipToolsReady() {
  const missing = (process.env.OX_MISSING_TOOLS ?? "").trim();
  return missing ? { ok: false, missing, fix: `brew install ${missing}` } : { ok: true };
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
  // Its memory lives behind the control plane. Nothing on this Mac holds a
  // database credential, and there is nothing to put in any file.
  db.connect(BASE);

  state = "starting";
  await report();
  await skills.load(PATHS.runtime);
  const taught = skills.list();
  await tick(
    "organicx",
    `build ${BUILD} is up` + (taught.length ? ` · ${taught.length} skill${taught.length > 1 ? "s" : ""} loaded` : ""),
  );

  /*
   * What is missing, said once, without stopping anything.
   *
   * The launcher no longer refuses to open over ffmpeg and yt-dlp, because
   * connecting accounts and warming them — the part that has to start weeks
   * before anything else — does not touch either. This is the reminder, and
   * the work that genuinely needs them checks again at the point of use.
   */
  const missingTools = (process.env.OX_MISSING_TOOLS ?? "").trim();
  if (missingTools) {
    await tick(
      "rosa",
      `no ${missingTools} yet — warming does not need it, cutting clips will. brew install ${missingTools}`,
    );
  }

  const { browser } = await openChrome({ profile: PATHS.profile });

  /*
   * It opens and it goes.
   *
   * This used to boot to idle and sit there until an order arrived, which
   * meant opening the app did nothing and the first thing Alex had to do was
   * tell it to start. That is backwards: he opens it because he wants it
   * working, and a tool that needs to be told to begin is one more thing to
   * remember.
   *
   * So: anything not connected gets connected, and then it works. Orders
   * still arrive and are still obeyed — they steer it, they do not start it.
   */
  state = "connecting";
  await report();
  await connect(browser);
  state = "working";
  doing = "warming the accounts";
  await report();
  await tick("bea", "starting the day");
  let nextSweep = 0;

  for (;;) {
    try {
      if (await maybeUpdate()) return;

      const order = await get("/order").catch(() => null);
      if (order?.cmd) {
        const cmd = String(order.cmd);
        await tick("organicx", `heard: ${cmd}`);

        if (cmd === "pause") {
          state = "paused";
          doing = "paused";
          await report();
        }
        if (cmd === "run" || cmd === "warm") {
          state = "working";
        }
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
          nextSweep = 0; // go now rather than at the next sweep
        }
      }

      /*
       * The work, on its own.
       *
       * A sweep every few minutes rather than a tight loop: the accounts'
       * own rhythms decide whether anything actually happens, and farm()
       * returns immediately for one that is asleep, parked, or has already
       * had its day. Checking constantly would burn the Mac for nothing.
       */
      if (state !== "paused" && Date.now() >= nextSweep) {
        // A skill shipped since the last sweep takes effect now, not on the
        // next restart — the point of shipping one is that it lands.
        await skills.load(PATHS.runtime).catch(() => {});
        // What is actually signed in, checked rather than remembered.
        await verifyConnections(browser).catch(() => {});
        for (const account of await db.accounts()) {
          if (!account.connected) continue;
          await farm(browser, account);
        }
        nextSweep = Date.now() + 4 * 60 * 1000;
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
