/**
 * The sourcing pipeline, with a real brain process and a stand-in Alibaba.
 *
 * What this has to prove, because Alex spends five figures off the result:
 * the pipeline picks up exactly where it left off after the app is closed,
 * a draft he has not approved never reaches the composer, and a supplier who
 * says "yes 30 seconds" is recorded as having answered nothing.
 */
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import { mkdtemp, cp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deskCloud } from "./_desk-cloud.mjs";
import { check, failures, until, sleep } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HOME = await mkdtemp(join(tmpdir(), "research-desk-"));
const WORKER = join(HOME, "worker");
await cp(join(here, "..", "worker"), WORKER, { recursive: true });
await symlink(join(here, "..", "..", "..", "node_modules"), join(WORKER, "node_modules")).catch(() => {});
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 115000);

const decisions = [];
const cloud = await deskCloud({
  job: () => ({ id: "job-1", product: "portable countertop bottle chiller" }),
  decisions: () => decisions.splice(0),
});

const STATE = () => join(HOME, "ProductResearch", "data", "sourcing.json");
const read = async () => JSON.parse(await readFile(STATE(), "utf8"));

/* ---- a stand-in Alibaba / 1688 on the wire ---- */
const typed = [];
const sends = [];
let replies = [];

/** What the composer would end up holding: keys, with the typos backed out. */
function fromKeys(strokes = []) {
  let text = "";
  for (const k of strokes) {
    const key = k.key ?? k.ch ?? "";
    if (key === "Backspace") text = text.slice(0, -1);
    else if (key === "Enter") text += "\n";
    else text += key;
  }
  return text;
}

function phone(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t !== "do") return;
    const reply = (ok, result) => ws.send(JSON.stringify({ t: "done", id: m.id, ok, result, error: null }));
    if (m.act === "read") {
      if (m.what === "listings") {
        return reply(true, [
          { name: "Ningbo Culi Electronics", url: "https://www.alibaba.com/culi", title: "OEM rapid beverage chiller machine", blurb: "manufacturer, aluminium housing", years: 8 },
          { name: "Sunny Trading Co", url: "https://www.alibaba.com/sunny", title: "water bottle", blurb: "" },
        ]);
      }
      if (m.what === "thread") return reply(true, replies);
      return reply(true, null);
    }
    if (m.act === "type") { typed.push(fromKeys(m.strokes)); return reply(true, true); }
    if (m.act === "send") { sends.push(m.to); return reply(true, { ok: true }); }
    if (m.act === "openThread") return reply(true, { ok: true });
    reply(true, true);
  });
  return ws;
}

async function boot() {
  const child = spawn(process.execPath, ["main.mjs"], {
    cwd: WORKER, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, RESEARCH_HOME: HOME, RESEARCH_CLOUD: cloud.base, RESEARCH_PORT: "", RESEARCH_TICK: "600" },
  });
  let out = "", err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  const port = await until(() => { const m = /^PORT (\d+)\n/.exec(out); return m ? Number(m[1]) : null; }, 20000);
  const ws = phone(port);
  await until(() => ws.readyState === 1, 8000);
  return { child, ws, log: () => err, stop: async () => { child.stdin.end(); child.kill(); ws.close(); await sleep(300); } };
}

/* ---- first run: it searches, shortlists, opens, and stops at a draft ---- */
let app = await boot();
check("the brain comes up with the desk on it", Boolean(app));

const drafted = await until(async () => {
  try { const s = await read(); return s.outbox.items.some((i) => i.status === "pending") ? s : null; } catch { return null; }
}, 60000);
check("it gets as far as a drafted message on its own", Boolean(drafted), app.log().split("\n").slice(-3).join(" | "));
check("it shortlisted on what the page said, not on everything it saw",
  drafted.suppliers.length === 2 && drafted.suppliers.every((s) => s.name === "Ningbo Culi Electronics"),
  drafted.suppliers.map((s) => `${s.site}:${s.name}`).join(","));
check("it searched both sites", new Set(drafted.suppliers.map((s) => s.site)).size === 2);
check("the shortlist reason came off the page", drafted.suppliers[0].shortlistBecause.length >= 2, drafted.suppliers[0].shortlistBecause.join("; "));
check("what it says they make carries the page it read it on", drafted.suppliers[0].makes?.source?.kind === "page");
check("NOTHING was typed while the draft is unapproved", typed.length === 0, typed.join("|").slice(0, 80));
check("and nothing was sent", sends.length === 0);
check("the draft leads with the measured chill time", /MEASURED time for a 500 ml PET bottle/.test(drafted.outbox.items[0].text));
// The draft is on disk one tick before it is pushed out, so this waits for
// the push rather than racing it — the app is not wrong for saving first.
const queued = await until(() => cloud.got.queue.some((q) => q.items?.some((i) => i.status === "pending")), 20000);
check("the queue reached the cloud for him to look at", Boolean(queued),
  `${cloud.got.queue.length} pushes seen`);

/* ---- the app is closed and reopened ---- */
const before = await read();
await app.stop();
await sleep(500);
app = await boot();
const after = await until(async () => { const s = await read(); return s.suppliers.length ? s : null; }, 30000);
check("the shortlist survives the app being closed", after.suppliers.length === before.suppliers.length);
check("the drafts survive with it, still pending", after.outbox.items.length === before.outbox.items.length && after.outbox.items.every((i) => i.status === "pending"));
check("the searches already done are not run again", after.doneQueries.length === before.doneQueries.length && after.doneQueries.length === 7, String(after.doneQueries.length));
await sleep(3000);
check("and it still does not send the unapproved draft after a restart", typed.length === 0 && sends.length === 0);

/* ---- he approves one, and only then does it go ---- */
const pending = after.outbox.items.filter((i) => i.status === "pending");
decisions.push({ id: pending[0].id, decision: "approve" });
if (pending[1]) decisions.push({ id: pending[1].id, decision: "reject", why: "not this one" });
const sent = await until(() => (sends.length ? true : null), 30000);
check("the approved one is typed and sent", Boolean(sent) && typed.length === 1, `${typed.length} typed, ${sends.length} sent`);
check("what was typed is the exact text he approved, to the character",
  typed[0] === pending[0].text, JSON.stringify(typed[0]?.slice(0, 70)));
const afterSend = await until(async () => { const s = await read(); return s.outbox.items.some((i) => i.status === "sent") ? s : null; }, 20000);
check("the rejected one never goes", afterSend.outbox.items.filter((i) => i.status === "sent").length === 1);
const asked = afterSend.suppliers.find((s) => s.messages.some((m) => m.dir === "out"));
check("the questions are marked asked, with a timestamp", Boolean(asked.answers.chillTime.asked));
check("the outgoing message is in the record with its time", asked.messages[0].dir === "out" && typeof asked.messages[0].at === "string");

/* ---- and a reply that answers nothing is recorded as answering nothing ---- */
replies = [{ id: "r1", dir: "in", at: new Date().toISOString(), text: "yes 30 seconds no problem, how many pieces you want?" }];
const heard = await until(async () => {
  const s = await read();
  const t = s.suppliers.find((x) => x.messages.some((m) => m.id === "r1"));
  return t ?? null;
}, 30000);
check("the reply is kept word for word", heard.messages.some((m) => m.id === "r1" && /30 seconds/.test(m.text)));
check("but the chill time stays empty", heard.chillTime === null);
check("and the record says why", /no measurement/.test(heard.answers.chillTime.note.why), heard.answers.chillTime.note.why);
check("the question is still counted as unanswered", heard.answers.chillTime.answered === false);
check("the brain said so in its own words", /answered nothing/.test(app.log()), app.log().split("\n").filter((l) => /Culi/.test(l)).slice(-1)[0] ?? "");
const answers = cloud.got.answers.slice(-1)[0]?.rows ?? [];
check("and the answers table sent out shows the claim as unmeasured",
  answers.some((r) => r.chillTime?.state === "claimed, not measured"), JSON.stringify(answers).slice(0, 160));

await app.stop();
await cloud.close();
clearTimeout(guard);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
