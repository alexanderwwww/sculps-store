/**
 * Loyal to the conversation, not the tab.
 *
 * The runner used to follow whichever tab of the site was most recently
 * opened, so a closed tab — or a second one opened on another thread —
 * quietly moved the rest of a job into a different conversation. Now the
 * first message to land pins the run to its /c/<id> address, and every tab
 * loss after that comes back to the same chat.
 *
 * This runs live.mjs the way endtoend.mjs does, against a fake chat site
 * that behaves like ChatGPT about addresses: the first message on a fresh
 * page moves the tab to /c/<id>, and every message is posted back to the
 * server with the conversation it went into — so "which chat did that land
 * in" is a question the test can answer exactly.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`  ${ok ? "\x1b[32mPASS" : "\x1b[31mFAIL"}\x1b[0m  ${what}${extra ? " — " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const work = await mkdtemp(join(tmpdir(), "wand-pin-"));
const out = join(work, "images");

// A one-pixel-ish PNG, big enough to pass the runner's size filter.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAIAAABC8jL9AAAAxUlEQVR42u3BMQEAAADCoPVPbQwf" +
  "oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeBsAAf//AwAB/qjwAAAAAElFTkSuQmCC", "base64");

/* ---------------------------------------------------------- the fake site */
/** Every message the site received: which host it was typed into, which chat. */
const sends = [];
const chat = createServer((req, res) => {
  if (req.url.startsWith("/shot.png")) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(PNG);
  }
  if (req.method === "POST" && req.url === "/api/send") {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      sends.push({ host: req.headers.host, ...JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    return;
  }
  // Both the front page and /c/<id> serve the same app; the conversation is
  // whatever the address says, the way a single-page chat site works.
  const conv = req.url.match(/^\/c\/([^/?#]+)/)?.[1] ?? null;
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html><head><title>fake chat</title></head><body>
    <button data-testid="create-new-chat-button">New chat</button>
    <div id="prompt-textarea" contenteditable="true"></div>
    <button data-testid="send-button">Send</button>
    <div id="thread"></div>
    <script>
      let conv = ${JSON.stringify(conv)};
      let n = 0;
      document.querySelector('[data-testid=send-button]').onclick = () => {
        const box = document.getElementById('prompt-textarea');
        const text = box.textContent.trim();
        if (!text) return;
        box.textContent = '';
        // The first message of a fresh page is what creates the conversation:
        // the address changes to /c/<id> without a page load, like ChatGPT.
        if (!conv) {
          conv = 'conv' + Math.random().toString(36).slice(2, 8);
          history.pushState({}, '', '/c/' + conv);
        }
        fetch('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conv, text }) });
        // Answers the way a chat site does: a moment later, with a picture.
        setTimeout(() => {
          const img = document.createElement('img');
          img.alt = 'Generated image';
          img.src = '/shot.png?n=' + (++n) + '&c=' + conv;
          document.getElementById('thread').appendChild(img);
        }, 700);
      };
      document.querySelector('[data-testid=create-new-chat-button]').onclick = () => {
        conv = null;
        history.pushState({}, '', '/');
        document.getElementById('thread').innerHTML = '';
      };
    </script></body></html>`);
}).listen(0);
const port = chat.address().port;
const chatUrl = `http://localhost:${port}/`;
const HOST = `localhost:${port}`;
// The same server under a name the runner has never been told about. It has
// a message box and everything — which is exactly why the runner must refuse
// to go there: nothing it knows says this is a chat site of ours.
const FOREIGN = `127.0.0.1:${port}`;

/* ------------------------------------------- the queue and the order file */
let queue = {};
let order = { cmd: "", at: 0 };
const api = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(req.url.startsWith("/control") ? order : req.url.startsWith("/queue") ? queue : {}));
}).listen(0);
const apiUrl = `http://localhost:${api.address().port}`;
let orderAt = Date.now();
const tell = (cmd) => { order = { cmd, at: ++orderAt }; };

/* ------------------------------------------------ a Chrome with the door on */
const PORT = 9334;
const browser = await chromium.launchServer({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--ignore-certificate-errors", `--remote-debugging-port=${PORT}`],
});
const driver = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = driver.contexts()[0] ?? (await driver.newContext());
let tab = await ctx.newPage();
await tab.goto(chatUrl);

/* ------------------------------------------------------------ the runner */
const app = spawn(process.execPath, [
  new URL("../live.mjs", import.meta.url).pathname,
  "--site", "fake", "--out", out, "--port", String(PORT), "--wait", "25",
], {
  cwd: work,
  env: {
    ...process.env,
    QUEUE: `${apiUrl}/queue.json`,
    CONTROL: `${apiUrl}/control.json`,
    WAND: `${apiUrl}/wand`,
    WAND_SITES: JSON.stringify({ fake: {
      name: "Fake", url: chatUrl,
      ask: ['div#prompt-textarea[contenteditable="true"]'],
      send: ['button[data-testid="send-button"]'],
      fresh: ['button[data-testid="create-new-chat-button"]'],
      file: ['input[type="file"]:not([data-wand])'],
      attach: [], attachItem: [],
      images: ['img[alt="Generated image" i]'],
    } }),
  },
});
let log = "";
app.stdout.on("data", (d) => { log += d; });
app.stderr.on("data", (d) => { log += d; });
let exited = false;
app.on("exit", () => { exited = true; });

const plain = () => log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
/** Where the log is now, measured on the stripped text every check reads. */
const mark = () => plain().length;
const until = async (what, test, ms = 60000) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await test()) return true;
    await sleep(300);
  }
  check(what, false, plain().split("\n").filter(Boolean).slice(-6).join(" / "));
  return false;
};
/** Wait for a line to be printed after a given point in the log. */
const printed = (re, from = 0) => re.test(plain().slice(from));
const waitLog = (what, re, from = 0, ms) => until(what, async () => printed(re, from), ms);

/** The tab the runner is typing into right now: the one on this chat address. */
const tabOn = async (path) => {
  const stop = Date.now() + 15000;
  while (Date.now() < stop) {
    const pg = ctx.pages().find((p) => !p.isClosed() && new URL(p.url()).pathname === path);
    if (pg) return pg;
    await sleep(200);
  }
  return null;
};

/**
 * Wait for the picture of the current prompt to be on screen AND for the
 * runner to have noticed it (it polls every two seconds). Closing the tab
 * before it has seen a picture leaves it waiting two minutes for one.
 */
const pictureSeen = async (pg, count) => {
  await pg.waitForFunction((k) => document.querySelectorAll("#thread img").length >= k && [...document.querySelectorAll("#thread img")].every((i) => i.naturalWidth > 0), count, { timeout: 30000 }).catch(() => {});
  await sleep(3500);
};

/** Put a job in the queue, say go from Claude's side, and wait for its first "sent". */
const startJob = async (job) => {
  const from = mark();
  queue = { site: "fake", refs: [], ...job };
  const ok = await waitLog(`"${job.name}" is offered`, new RegExp(job.name), from, 40000)
    && await until(`the card is asking for "${job.name}"`, async () => {
      for (const p of ctx.pages()) {
        if (p.isClosed()) continue;
        if (await p.evaluate(() => Boolean(window.__wand) && window.__wand.asking()).catch(() => false)) return true;
      }
      return false;
    });
  tell("go");
  return ok && await waitLog(`Claude's go starts "${job.name}"`, /Claude: go/, from);
};
/** The n-th prompt of the running job has been sent (and at most n have). */
const sent = (n, from) => until(`prompt ${n} is sent`, async () => (plain().slice(from).match(/\n\s*sent\n/g) ?? []).length >= n);
const finished = (job, from) => waitLog(`"${job.name}" runs to the end`, new RegExp(`\\[${job.prompts.length}/${job.prompts.length}\\]`), from, 90000);
const convOf = (text) => sends.filter((s) => s.text === text).map((s) => `${s.host}/c/${s.conv}`);
const pathOf = (text) => sends.filter((s) => s.text === text).map((s) => `/c/${s.conv}`)[0] ?? null;

/* ================================================================= 1 */
console.log("\n1. a run pins itself to the chat its first message lands in:");
{
  const from = mark();
  const job = { id: "pin-1", name: "PIN-ONE", prompts: ["one alpha", "one beta", "one gamma"] };
  await startJob(job);
  await sent(1, from);
  await waitLog("it says it pinned after the first message", /pinned to this chat/, from, 10000);
  const a = plain().slice(from);
  check("the pin comes after the first 'sent'", a.indexOf("sent") > -1 && a.indexOf("sent") < a.indexOf("pinned to this chat"));
  const url = tab.url();
  check("the tab is on a /c/<id> address", /\/c\/conv\w+$/.test(url), url);
  await finished(job, from);
  const [c1, c2, c3] = [convOf("one alpha"), convOf("one beta"), convOf("one gamma")];
  check("every prompt reached the site once", c1.length === 1 && c2.length === 1 && c3.length === 1, JSON.stringify([c1, c2, c3]));
  check("prompts 2 and 3 went into the same conversation as prompt 1", c1[0] && c1[0] === c2[0] && c2[0] === c3[0], JSON.stringify([c1, c2, c3]));
  check("and only pinned once", (plain().slice(from).match(/pinned to this chat/g) ?? []).length === 1);
}

/* ============================================================== 2 & 3 */
console.log("\n2. a closed tab is reopened on the pinned chat, not the front page:");
let pinnedB = null;
{
  // A clean start for this one: drop the pin from job 1 and put the tab on
  // the front page, so the run has to make its own conversation again.
  tell("unpin");
  await waitLog("unpin is obeyed while idle", /Claude: unpin$/m);
  await tab.goto(chatUrl);
  const from = mark();
  const job = { id: "pin-2", name: "PIN-TWO", prompts: ["two alpha", "two beta", "two gamma"] };
  await startJob(job);
  await sent(1, from);
  await waitLog("pinned after the first message", /pinned to this chat/, from, 10000);
  pinnedB = new URL(tab.url()).pathname;
  check("a fresh conversation, not job 1's", pinnedB !== pathOf("one alpha"), pinnedB);
  await pictureSeen(tab, 1);
  await tab.close();
  await sent(2, from);
  const a = plain().slice(from);
  check("it reopens the chat this job belongs to", /reopening the chat this job belongs to/.test(a));
  check("rather than looking for another tab", !/moved to your other|no Fake tab open/.test(a));
  const back = await tabOn(pinnedB);
  check("the new tab is on the same /c/<id>", Boolean(back), back ? back.url() : ctx.pages().map((p) => p.url()).join(", "));
  check("prompt 2 landed in that conversation", convOf("two beta")[0] === convOf("two alpha")[0], JSON.stringify([convOf("two alpha"), convOf("two beta")]));

  console.log("\n3. a newer tab on another conversation does not pull the run away:");
  await pictureSeen(back, 1);
  const other = await ctx.newPage();
  await other.goto(`${chatUrl}c/other`);
  await back.close();
  await sent(3, from);
  await finished(job, from);
  const b = plain().slice(from);
  check("it reopened the pinned chat again", (b.match(/reopening the chat this job belongs to/g) ?? []).length === 2);
  check("and never 'moved to your other tab'", !/moved to your other/.test(b));
  check("prompt 3 landed in the pinned conversation", convOf("two gamma")[0] === convOf("two alpha")[0], JSON.stringify(convOf("two gamma")));
  check("nothing was typed into /c/other", !sends.some((s) => s.conv === "other"));
  check("the /c/other tab was left alone", !other.isClosed() && new URL(other.url()).pathname === "/c/other");
}

/* ================================================================= 4 */
console.log("\n4. a goto order mid-run moves the job into that chat and pins it:");
{
  const from = mark();
  const job = { id: "pin-3", name: "PIN-GOTO", prompts: ["three alpha", "three beta"] };
  await startJob(job);
  await sent(1, from);
  const working = await tabOn(pinnedB);
  check("prompt 1 still went to the pinned chat from job 2", convOf("three alpha")[0] === convOf("two alpha")[0], JSON.stringify(convOf("three alpha")));
  if (working) await pictureSeen(working, 1);
  tell(`goto ${chatUrl}c/named`);
  await waitLog("goto is obeyed", /Claude: goto .*\/c\/named$/m, from);
  check("it says it pinned to the named chat", printed(/pinned to http:\/\/localhost:\d+\/c\/named/, from));
  await sent(2, from);
  await finished(job, from);
  check("prompt 2 landed in /c/named", convOf("three beta")[0] === `${HOST}/c/named`, JSON.stringify(convOf("three beta")));
}

/* ================================================================= 5 */
console.log("\n5. newChat: each prompt in a fresh conversation, nothing pinned:");
{
  const from = mark();
  const job = { id: "pin-4", name: "PIN-FRESH", newChat: true, prompts: ["four alpha", "four beta", "four gamma"] };
  await startJob(job);
  await finished(job, from);
  const cs = ["four alpha", "four beta", "four gamma"].map((t) => convOf(t)[0]);
  check("all three prompts reached the site", cs.every(Boolean), JSON.stringify(cs));
  check("in three distinct conversations", new Set(cs).size === 3, JSON.stringify(cs));
  check("none of them the previously pinned one", !cs.includes(`${HOST}/c/named`));
  check("and nothing was pinned", !/pinned to/.test(plain().slice(from)));
  check("nor reopened", !/reopening the chat|back on the chat/.test(plain().slice(from)));
}

/* ================================================================= 6 */
console.log("\n6. after unpin, a lost tab falls back to the most recent tab of the site:");
{
  const from = mark();
  const job = { id: "pin-5", name: "PIN-UNPIN", prompts: ["five alpha", "five beta"] };
  await startJob(job);
  await sent(1, from);
  await waitLog("the default run pinned again", /pinned to this chat/, from, 10000);
  const pinned = pathOf("five alpha");
  const working = await tabOn(pinned);
  check("found the working tab", Boolean(working), ctx.pages().map((p) => p.url()).join(", "));
  if (working) await pictureSeen(working, 1);
  tell("unpin");
  await waitLog("unpin is obeyed mid-run", /Claude: unpin$/m, from);
  const newer = await ctx.newPage();
  await newer.goto(`${chatUrl}c/other2`);
  if (working) await working.close();
  await sent(2, from);
  await finished(job, from);
  const a = plain().slice(from);
  check("it moved to the other tab", /moved to your other Fake tab/.test(a));
  check("and did not reopen the old chat", !/reopening the chat this job belongs to/.test(a));
  check("prompt 2 landed in the newest tab's conversation, /c/other2", convOf("five beta")[0] === `${HOST}/c/other2`, JSON.stringify(convOf("five beta")));
  check("not in the older /c/other tab", !sends.some((s) => s.conv === "other"));
}

/* ================================================================= 7 */
console.log("\n7. goto on a host the runner does not know is refused, and the run goes on:");
{
  const from = mark();
  const job = { id: "pin-6", name: "PIN-FOREIGN", prompts: ["six alpha", "six beta"] };
  await startJob(job);
  await sent(1, from);
  const pinned = pathOf("six alpha");
  const working = await tabOn(pinned);
  if (working) await pictureSeen(working, 1);
  const foreign = `http://${FOREIGN}/c/foreign`;
  tell(`goto ${foreign}`);
  await waitLog("the order is read", /Claude: goto .*\/c\/foreign/, from, 40000);
  check("and answered as nothing to do", printed(/Claude: goto .*\/c\/foreign \(nothing to do\)/, from));
  check("with a refusal in the log", /not a site I know|unknown site|don't know that site|not one of the sites|refus/i.test(plain().slice(from)), plain().slice(from).split("\n").filter((l) => /goto|foreign|know|refus|pinned/.test(l)).join(" / "));
  check("it never says it pinned the foreign address", !printed(/pinned to http:\/\/127\.0\.0\.1/, from));
  await sent(2, from);
  await finished(job, from);
  check("the runner is still alive", !exited);
  check("nothing was ever typed into the foreign host", !sends.some((s) => s.host === FOREIGN), JSON.stringify(sends.filter((s) => s.host === FOREIGN)));
  check("prompt 2 landed on the site it knows", convOf("six beta")[0]?.startsWith(HOST), JSON.stringify(convOf("six beta")));
  check("no tab was left on the foreign host", !ctx.pages().some((p) => !p.isClosed() && p.url().startsWith(`http://${FOREIGN}`)), ctx.pages().map((p) => p.url()).join(", "));
}

app.kill();
await driver.close().catch(() => {});
await browser.close().catch(() => {});
chat.close(); api.close();
await rm(work, { recursive: true, force: true });

if (fails) console.log("\n--- runner output ---\n" + log);
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
