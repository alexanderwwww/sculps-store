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
const saved = JSON.parse(await readFile(join(dir, "accounts.json"), "utf8"));
check("the file on disk agrees", saved.accounts.length === a.all().length);

console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
