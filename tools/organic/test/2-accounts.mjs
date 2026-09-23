/** Several accounts per platform, each with its own cookie jar, kept on disk. */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountsIn, MAX_PER_PLATFORM } from "../worker/accounts-store.mjs";
import { check, failures } from "./lib.mjs";

const dir = await mkdtemp(join(tmpdir(), "organic-accounts-"));
const a = accountsIn(dir);
await a.load();
check("it starts with nobody", a.all().length === 0);

const one = await a.add("instagram");
const two = await a.add("instagram");
const tt = await a.add("tiktok");
check("three accounts, two of them instagram", a.all().length === 3 && a.forPlatform("instagram").length === 2);
check("each has its own store", one.profileId !== two.profileId && one.profileId !== tt.profileId, `${one.profileId.slice(0, 8)} vs ${two.profileId.slice(0, 8)}`);
check("a profile id is a uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(one.profileId), one.profileId);
check("ids read like what they are", one.id === "instagram-1" && two.id === "instagram-2" && tt.id === "tiktok-1", [one.id, two.id, tt.id].join(","));

await a.update(two.id, { state: "connected", handle: "@spooky.two" });
check("connected is remembered", a.connected().length === 1 && a.connected()[0].handle === "@spooky.two");

const again = accountsIn(dir);
await again.load();
check("it survives a restart", again.all().length === 3 && again.connected()[0].handle === "@spooky.two");
check("...with the same stores", again.find("instagram-1").profileId === one.profileId);

for (let i = a.forPlatform("instagram").length; i < MAX_PER_PLATFORM; i++) await a.add("instagram");
const over = await a.add("instagram");
check(`it stops at ${MAX_PER_PLATFORM} per platform`, over === null && a.forPlatform("instagram").length === MAX_PER_PLATFORM);

await a.remove("instagram-1");
check("forgetting one leaves the rest", !a.find("instagram-1") && a.forPlatform("instagram").length === MAX_PER_PLATFORM - 1);
// The recovery: a mission is remembered, dated, and counted in whole days.
check("an account starts on the ordinary day", a.find("tiktok-1").mission === "grow");
await a.mission("tiktok-1", "recover");
check("the recovery is stamped", a.find("tiktok-1").mission === "recover" && typeof a.find("tiktok-1").missionSince === "string");
check("day one is day zero", a.daysOnMission("tiktok-1") === 0);
await a.update("tiktok-1", { missionSince: new Date(Date.now() - 3.5 * 86400000).toISOString() });
check("whole days only", a.daysOnMission("tiktok-1") === 3, String(a.daysOnMission("tiktok-1")));
await a.mission("tiktok-1", "grow");
check("coming off it clears the date", a.find("tiktok-1").mission === "grow" && a.find("tiktok-1").missionSince === null);

const saved = JSON.parse(await readFile(join(dir, "accounts.json"), "utf8"));
check("the file on disk agrees", saved.accounts.length === a.all().length);

/* ------------------------------------------------- the recovery's shape */

const { recoveryBudget, recoveryDwellMs } = await import("../worker/human.mjs");
const ordinary = { like: 30, save: 2, share: 1, comment: 2, follow: 5 };

const day1 = recoveryBudget(ordinary, 0);
check("day one acts barely at all", day1.like >= 1 && day1.like <= 8, `like ${day1.like}`);
check("no comments on day one", day1.comment === 0);
check("no shares while recovering", day1.share === 0 && recoveryBudget(ordinary, 30).share === 0);
check("no follows in the first week", recoveryBudget(ordinary, 6).follow === 0);
check("follows come back after a week", recoveryBudget(ordinary, 7).follow > 0);
check("comments only after ten clean days", recoveryBudget(ordinary, 9).comment === 0 && recoveryBudget(ordinary, 10).comment > 0);
check("it opens up, it does not jump", recoveryBudget(ordinary, 10).like >= day1.like);
check("it never exceeds an ordinary day", recoveryBudget(ordinary, 40).like <= ordinary.like);
const dwell = recoveryDwellMs(10000);
check("clips are watched, not skimmed", dwell > 10000 && dwell <= 45000, `${dwell}ms`);

console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
