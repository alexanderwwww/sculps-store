// End to end: the built extension in Playwright's Chromium, on a local stand-in for the Kraken Prop page,
// with REAL live Kraken data. Takes screenshots.   node test/e2e.mjs <extDir> <shotsDir>
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const [ext, shots] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const page0 = readFileSync(join(HERE, "fake-kraken.html"), "utf8");
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page0); }).listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const origin = `http://127.0.0.1:${srv.address().port}`;
const fails = []; const ok = (c, m) => { console.log(`${c ? "  ok " : "FAIL "} ${m}`); if (!c) fails.push(m); };
const profile = join(shots, ".profile"); rmSync(profile, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(profile, { channel: "chromium", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
ok(!!sw, `extension service worker running (${sw.url().split("/")[2]})`);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${origin}/prop/account/TEST123/trade/btc-usd`);
const S = (sel) => page.locator(`#supercomputer-root ${sel}`);
const text = async (sel) => (await S(sel).first().textContent()) || "";
await S(".card").waitFor({ state: "visible", timeout: 15000 });
ok(true, "widget appears on the page");
await page.waitForFunction(() => { const r = document.querySelector("#supercomputer-root")?.shadowRoot; return r && /\d/.test(r.querySelector(".c5 .big")?.textContent || ""); }, null, { timeout: 45000 });
const real = await (await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD")).json();
const realBtc = +Object.values(real.result)[0].c[0];
const shown = Number((await text(".price")).replace(/,/g, ""));
ok(Math.abs(shown / realBtc - 1) < 0.005, `BTC price on widget ${shown} matches Kraken REST ${realBtc}`);
ok((await text(".cname")) === "BTC/USD", `coin detected from the Prop URL: ${await text(".cname")}`);
ok(/5 MIN/.test(await text(".c5")) && /%/.test(await text(".c5")), `5 min call: ${(await text(".c5 .big")).trim()}`);
ok(/15 MIN/.test(await text(".c15")), `15 min call: ${(await text(".c15 .big")).trim()}`);
const verdictTxt = await text(".verdict"); ok(verdictTxt.length > 5, `verdict: ${verdictTxt}`);
const plan = await S(".plan").isVisible(); console.log(`      plan row ${plan ? "shown: " + (await text(".plan")).slice(0, 120) : "hidden (no edge)"}`);
await page.waitForTimeout(2500);
const ws = await text(".feed"); ok(ws === "live", `live feed: ${ws}`);
const nonBlank = await page.evaluate(() => { const c = document.querySelector("#supercomputer-root").shadowRoot.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (d.length / 4); });
ok(nonBlank > 0.05, `chart canvas drawn (${(nonBlank * 100).toFixed(0)}% of pixels)`);
ok(/Athens/.test(await text(".clock")), `clock: ${await text(".clock")}`);
ok(/build \d+/.test(await text(".build")), `build on screen: ${await text(".build")}`);
const box = await S(".card").boundingBox();
ok(box.width <= 345 && box.x < 40 && box.y + box.height > 860, `card ${Math.round(box.width)}x${Math.round(box.height)} at bottom-left (${Math.round(box.x)},${Math.round(box.y)})`);
await page.screenshot({ path: join(shots, "1-page-btc.png") });
await S(".card").screenshot({ path: join(shots, "2-widget-btc.png") });

// movers: the scan reads live liquid pairs by itself
await S('.tabs button[data-t="movers"]').click();
await page.waitForFunction(() => document.querySelector("#supercomputer-root").shadowRoot.querySelectorAll(".mv").length >= 3, null, { timeout: 60000 }).catch(() => {});
const mv = await S(".mv").count(); ok(mv >= 3, `movers: ${mv} setups, ${(await text(".tabbody")).match(/(\d+) pairs/)?.[0] || "?"}`);
ok(/No trade now|Best trade now/.test(await text(".best")), `best-trade card: ${(await text(".best .bh b"))}`);
await S(".card").screenshot({ path: join(shots, "3-widget-movers.png") });

await S('.tabs button[data-t="news"]').click(); await page.waitForTimeout(4000);
const nw = await S(".nw").count(); ok(nw >= 1 || /No fresh headline/.test(await text(".tabbody")), `news: ${nw} headlines`);
await S(".card").screenshot({ path: join(shots, "4-widget-news.png") });

await S('.tabs button[data-t="grok"]').click();
await S(".gpaste").fill("BTC looks heavy after the flush, sellers in control.\n```\nGROK {\"coin\":\"BTC/USD\",\"h5\":\"down\",\"p5\":0.58,\"h15\":\"down\",\"p15\":62,\"entry\":0,\"stop\":0,\"tp\":0,\"note\":\"lower highs on 5m\"}\n```");
await page.waitForTimeout(400);
ok(/Grok/.test(await text(".gres")) && /58%/.test(await text(".gres")), `Grok reply parsed: ${(await text(".gres")).replace(/\s+/g, " ").slice(0, 80)}`);
await S(".card").screenshot({ path: join(shots, "5-widget-grok.png") });

await S('.tabs button[data-t="score"]').click(); await page.waitForTimeout(300);
ok(/Tested on unseen data/.test(await text(".tabbody")), "scorecard shows the tested accuracy per band");
await S(".card").screenshot({ path: join(shots, "6-widget-score.png") });
await S('.tabs button[data-t="score"]').click();

// GOLD on the Prop page: path /prop/account/<id>/trade/gold-usd
await page.evaluate(() => window.goGold());
await page.waitForFunction(() => document.querySelector("#supercomputer-root").shadowRoot.querySelector(".cname").textContent === "XAU/USD", null, { timeout: 10000 }).catch(() => {});
ok((await text(".cname")) === "XAU/USD", `GOLD page -> ${await text(".cname")} (${await text(".src")})`);
await page.waitForFunction(() => /\d/.test(document.querySelector("#supercomputer-root").shadowRoot.querySelector(".price").textContent), null, { timeout: 20000 }).catch(() => {});
const fut = await (await fetch("https://futures.kraken.com/derivatives/api/v3/tickers/PF_XAUUSD")).json();
const gold = Number((await text(".price")).replace(/,/g, ""));
ok(Math.abs(gold / fut.ticker.last - 1) < 0.005, `GOLD price ${gold} matches Kraken PF_XAUUSD ${fut.ticker.last}`);
await page.waitForTimeout(6000);
ok(/Stand aside/.test(await text(".verdict")), `GOLD verdict: ${await text(".verdict")}`);
await S(".card").screenshot({ path: join(shots, "7-widget-gold.png") });

// picker override
await S(".coinbtn").click(); await S(".picker").selectOption("SOL");
await page.waitForFunction(() => document.querySelector("#supercomputer-root").shadowRoot.querySelector(".cname").textContent === "SOL/USD", null, { timeout: 10000 }).catch(() => {});
ok((await text(".cname")) === "SOL/USD", "coin picker overrides the page");
await S(".coinbtn").click(); await S(".picker").selectOption("");

// minimise -> pill, drag to the top-right, it snaps and remembers
await S(".min").click(); await page.waitForTimeout(300);
ok(await S(".pill").isVisible(), `pill: ${(await text(".pill")).trim()}`);
await S(".pill").screenshot({ path: join(shots, "8-pill.png") });
const pb = await S(".pill").boundingBox();
await page.mouse.move(pb.x + 20, pb.y + 10); await page.mouse.down(); await page.mouse.move(900, 300, { steps: 8 }); await page.mouse.move(1300, 100, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
const pb2 = await S(".pill").boundingBox(); ok(pb2.x > 1200 && pb2.y < 30, `pill snapped to top-right (${Math.round(pb2.x)},${Math.round(pb2.y)})`);
await S(".pill").click(); await page.waitForTimeout(400);
ok(await S(".card").isVisible(), "click on pill opens the card");
await page.reload(); await S(".card").waitFor({ state: "visible", timeout: 15000 });
const cb = await S(".card").boundingBox(); ok(cb.x + cb.width > 1400 && cb.y < 30, "position remembered after reload (top-right)");
await page.screenshot({ path: join(shots, "9-page-top-right.png") });
// settings sheet
await S(".gear").click(); await page.waitForTimeout(300); await S(".card").screenshot({ path: join(shots, "10-settings.png") }); await S(".done").click();

ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await ctx.close(); srv.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall e2e checks passed");
process.exit(fails.length ? 1 : 0);
