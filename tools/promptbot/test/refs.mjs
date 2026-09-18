/**
 * The attach that fails, and the prompt after it.
 *
 * A run in one conversation only skips the attach once the pictures are
 * demonstrably in the thread. This site refuses every one of them, so the
 * second prompt has to try again rather than print "already in this chat"
 * and draw the wrong product for the rest of the job.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`  ${ok ? "\x1b[32mPASS" : "\x1b[31mFAIL"}\x1b[0m  ${what}${extra ? " — " + extra : ""}`); };

const work = await mkdtemp(join(tmpdir(), "wand-e2e-"));
const out = join(work, "images");

// A one-pixel-ish PNG, big enough to pass the runner's size filter.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAIAAABC8jL9AAAAxUlEQVR42u3BMQEAAADCoPVPbQwf" +
  "oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeBsAAf//AwAB/qjwAAAAAElFTkSuQmCC", "base64");

/* ---------------------------------------------------------- the fake site */
const chat = createServer((req, res) => {
  if (req.url.startsWith("/shot.png")) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(PNG);
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html><head><title>fake chat</title></head><body>
    <button data-testid="create-new-chat-button">New chat</button>
    <div id="prompt-textarea" contenteditable="true"></div>
    <button data-testid="send-button">Send</button>
    <div id="thread"></div>
    <script>
      let n = 0;
      // Nothing here accepts a file: no picker, no paste, no drop.
      document.querySelector('[data-testid=send-button]').onclick = () => {
        const box = document.getElementById('prompt-textarea');
        if (!box.textContent.trim()) return;
        box.textContent = '';
        // Answers the way a chat site does: a moment later, with a picture.
        setTimeout(() => {
          const img = document.createElement('img');
          img.alt = 'Generated image';
          img.src = '/shot.png?n=' + (++n);
          document.getElementById('thread').appendChild(img);
        }, 700);
      };
      document.querySelector('[data-testid=create-new-chat-button]').onclick = () => {
        document.getElementById('thread').innerHTML = '';
      };
    </script></body></html>`);
}).listen(0);
const chatUrl = `http://localhost:${chat.address().port}/`;

/* ------------------------------------------- the queue and the order file */
let queue = {
  id: "e2e-1",
  name: "E2E",
  site: "fake",
  sameChat: true,
  prompts: ["draw one", "draw two"],
  refs: [],
};
let order = { cmd: "", at: 0 };
const api = createServer((req, res) => {
  // The reference picture a job can point at, served from the same place.
  if (req.url.startsWith("/ref.png")) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(PNG);
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(req.url.startsWith("/control") ? order : queue));
}).listen(0);
const apiUrl = `http://localhost:${api.address().port}`;
queue.refs = [`${apiUrl}/ref.png`];

/* ------------------------------------------------ a Chrome with the door on */
const browser = await chromium.launchServer({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--remote-debugging-port=9333"],
});
// A page on the fake site, so the runner finds a tab the way it does in life.
const driver = await chromium.connectOverCDP("http://localhost:9333");
const ctx = driver.contexts()[0] ?? (await driver.newContext());
const tab = await ctx.newPage();
await tab.goto(chatUrl);

/* ------------------------------------------------------------ the runner */
const app = spawn(process.execPath, [
  new URL("../live.mjs", import.meta.url).pathname,
  "--site", "fake", "--out", out, "--port", "9333", "--wait", "12",
], {
  cwd: work,
  env: {
    ...process.env,
    QUEUE: `${apiUrl}/queue.json`,
    CONTROL: `${apiUrl}/control.json`,
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

const until = async (what, test, ms = 45000) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await test()) return check(what, true);
    await new Promise((r) => setTimeout(r, 500));
  }
  check(what, false, log.split("\n").slice(-6).join(" / "));
};

console.log("\nthe app, end to end:");
await until("it finds the tab and offers the job", async () => /E2E/.test(log));
await until("the card is on screen in the browser", async () =>
  tab.evaluate(() => Boolean(window.__wand) && window.__wand.asking()).catch(() => false));

// Claude says go.
order = { cmd: "go", at: Date.now() + 1 };
await until("Claude's order starts it", async () => /Claude: go/.test(log));
await until("both prompts run", async () => /\[2\/2\]/.test(log));
await until("both prompts were attempted", async () => /\[2\/2\]/.test(log));

console.log("\nthe attach that never lands:");
const failures = (log.match(/nothing attached/g) ?? []).length;
check("it says so, both times", failures === 2, `${failures} of 2`);
check(
  "and never claims the references are already in the chat",
  !/already in this chat/.test(log),
  /already in this chat/.test(log) ? "it claimed they were" : "it did not",
);

app.kill();
await driver.close().catch(() => {});
await browser.close().catch(() => {});
chat.close(); api.close();
await rm(work, { recursive: true, force: true });

if (fails) console.log("\n--- runner output ---\n" + log);
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
