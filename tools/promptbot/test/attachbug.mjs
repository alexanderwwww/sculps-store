/**
 * The attached reference must never be collected as a generated picture.
 *
 * This reproduces the run exactly: a thumbnail of the attachment sits in the
 * composer before the prompt goes out, then a result arrives after it. Only
 * the second one is a result.
 */
import { chromium } from "playwright";
const SP = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest";
const MIN = 320;
const sels = ['img[src^="blob:"]', 'img[src^="data:image"]'];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--ignore-certificate-errors"] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.goto(`file://${SP}/page.html`);

const put = (id) => p.evaluate((i) => new Promise((done) => {
  const c = document.createElement("canvas"); c.width = 700; c.height = 700;
  const g = c.getContext("2d"); g.fillStyle = "#333"; g.fillRect(0, 0, 700, 700);
  c.toBlob((blob) => {
    const img = document.createElement("img");
    img.id = i; img.src = URL.createObjectURL(blob);
    img.onload = () => done();
    document.getElementById("shots").appendChild(img);
  });
}), id);

const collect = () => p.evaluate((arg) =>
  arg.sels.flatMap((s) => Array.from(document.querySelectorAll(s)))
    .filter((el) => el.naturalWidth >= arg.min && el.naturalHeight >= arg.min)
    .map((el) => el.src), { sels, min: MIN });

// The attachment preview, present before the send.
await put("attachment");
const already = new Set(await collect());

// The generated picture, after it.
await put("result");
const after = await collect();

const fresh = after.filter((u) => !already.has(u));
const ok = already.size === 1 && after.length === 2 && fresh.length === 1;
console.log(`  on screen before sending: ${already.size}`);
console.log(`  on screen after:          ${after.length}`);
console.log(`  counted as results:       ${fresh.length}`);
console.log(ok ? "  PASS — only the generated one is saved" : "  FAIL");
await b.close();
process.exit(ok ? 0 : 1);
