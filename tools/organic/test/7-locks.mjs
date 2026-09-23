/** A dead Chrome's lock must not stop the next one starting. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearStaleLocks } from "../worker/chrome.mjs";

let bad = 0;
const ok = (n, good, extra = "") => { console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`); if (!good) bad++; };
const gone = async (p) => access(p).then(() => false, () => true);

const profile = await mkdtemp(join(tmpdir(), "organic-profile-"));
await writeFile(join(profile, "SingletonLock"), "");
// The real ones are symlinks, and on a dead Chrome they point nowhere.
await symlink("/nonexistent/host-1234", join(profile, "SingletonSocket"));
await writeFile(join(profile, "Preferences"), "{}");

await clearStaleLocks(profile);
ok("the lock file is gone", await gone(join(profile, "SingletonLock")));
ok("a dangling socket symlink is gone", await gone(join(profile, "SingletonSocket")));
ok("the profile itself is untouched", !(await gone(join(profile, "Preferences"))));

// Running it on a profile with no locks is not an error.
await clearStaleLocks(profile);
ok("running again is fine", true);
// A profile that does not exist at all is not an error either.
await clearStaleLocks(join(profile, "nope", "nothing"));
ok("a missing profile is fine", true);

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
