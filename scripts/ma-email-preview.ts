/**
 * Renders every Mysterious Archive customer email with sample data, screenshots each at 600px wide
 * and builds one labelled contact sheet. Nothing is sent.
 * Run: npx tsx scripts/ma-email-preview.ts [outDir]   (needs Playwright's chromium, ImageMagick)
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { archivePreview } from "../app/lib/emails/archive";

const OUT = process.argv[2] || "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/emails";
mkdirSync(OUT, { recursive: true });
const kinds: [string, string][] = [
  ["confirmation", "Order confirmation"],
  ["shipping", "Shipping and tracking"],
  ["refund", "Refund"],
  ["abandoned_cart", "Left in the bag"],
  ["abandoned_checkout", "One step from yours"],
];
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
const shots: { file: string; label: string }[] = [];
for (const [kind, label] of kinds) {
  const mail = archivePreview(kind)!;
  writeFileSync(`${OUT}/${kind}.html`, mail.html);
  writeFileSync(`${OUT}/${kind}.txt`, `Subject: ${mail.subject}\n\n${mail.text}`);
  await page.setContent(mail.html, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const file = `${OUT}/${kind}.png`;
  await page.screenshot({ path: file, fullPage: true });
  shots.push({ file, label: `${label} — ${mail.subject}` });
  console.log("rendered", kind, "|", mail.subject);
}
await browser.close();
const args: string[] = [];
for (const s of shots) args.push("-label", s.label, s.file);
execFileSync("montage", [...args, "-tile", `${shots.length}x1`, "-geometry", "600x+16+16", "-pointsize", "20", "-background", "#e9e9e9", `${OUT}/emails-sheet.png`]);
console.log("sheet:", `${OUT}/emails-sheet.png`);
