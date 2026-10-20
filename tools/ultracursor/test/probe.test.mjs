// The probe's honesty (build 41), headless Chrome over its DevTools port: a local fake token page
// with a trade box, presets, a slippage control, a wallet label and an iframe variant. Every
// control on it reports every click and input to the test server. The probe must report the
// controls (role, name, rect), the trade box, presets, slippage, the wallet, the CDP targets,
// with ZERO clicks and ZERO inputs, and the same hash for the same page. This tests the probe
// only, never GMGN's real DOM (Cloudflare-blocked from here). No internet: gmgn.ai is routed to
// the local server and everything else is aborted.
//
//   TMPDIR=/tmp node test/probe.test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GmgnPanel } from "../src/trader/real/exec/gmgn-panel.mjs";
import { startFakeGmgn, routeGmgn, launchChrome, mintOf, WALLET_LABEL } from "./fake-gmgn.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KILL = setTimeout(() => { console.log("FAIL  probe test timed out"); process.exit(1); }, 120_000);
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x).slice(0, 600)); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-probe-"));
const srv = await startFakeGmgn({});
const chrome = await launchChrome();
try {
  await routeGmgn(chrome.ctx, srv);
  const panel = new GmgnPanel({ browser: chrome.browser, build: 41, dir, waitMs: 4000 });
  const pagesBefore = chrome.ctx.pages().length;
  const url = `https://gmgn.ai/sol/token/${mintOf("probe-a")}`;
  const rep = await panel.probe(url);
  const c = (role, name) => (rep.controls || []).find((x) => x.role === role && x.name === name);

  ok("the report is ok, from build 41, on the coin's page", rep.ok === true && rep.build === 41 && rep.url === url, { ok: rep.ok, why: rep.why, url: rep.url });
  ok("ZERO clicks and ZERO inputs reached the page (the page counts every one)", srv.events.length === 0, srv.events);
  ok("and zero trusted inputs were recorded by the probe's own recorder", rep.inputs === 0, rep.inputs);
  ok("the trade box is found, with its rect", rep.tradeBox && rep.tradeBox.rect.w > 100 && rep.tradeBox.rect.h > 50 && rep.tradeBox.frame === 0, rep.tradeBox);
  ok("role, name and rect for the tabs, the amount, Buy and slippage, all in the box",
    ["tab|Buy", "tab|Sell", "textbox|Amount", "button|Buy", "button|Slippage 1%"].every((k) => { const [r, n] = k.split("|"); const x = c(r, n); return x && x.inTradeBox && x.rect.w > 0 && !x.hidden; }), rep.controls.filter((x) => x.inTradeBox));
  ok("the Sell tab's hidden controls are listed as hidden (100%, Sell), never as visible", c("button", "100%")?.hidden === true && c("button", "Sell")?.hidden === true);
  ok("the wallet label is outside the box", c("button", WALLET_LABEL) && !c("button", WALLET_LABEL).inTradeBox);
  ok("tag, type, placeholder, value and disabled are read", c("textbox", "Amount").tag === "input" && c("textbox", "Amount").placeholder === "0.0" && c("textbox", "Amount").disabled === false && c("checkbox", "Anti-MEV")?.checked === "true", c("textbox", "Amount"));
  ok("presets: 0.01, 0.1, 0.5, 1, Max (and the hidden 25/50/100%)", ["0.01", "0.1", "0.5", "1", "Max", "100% (hidden)"].every((p) => rep.presets.includes(p)), rep.presets);
  ok("slippage 1% read from its control", rep.slippage.pct === 0.01 && rep.slippage.control.name === "Slippage 1%", rep.slippage);
  ok("priority, anti-MEV, TP/SL and balance texts", rep.priority.texts.some((t) => /Priority/.test(t)) && rep.antiMev.texts.length > 0 && rep.tpsl.texts.some((t) => /TP\/SL/.test(t)) && rep.balance.sol === 0.15, { p: rep.priority, m: rep.antiMev, t: rep.tpsl, b: rep.balance });
  ok("wallet: GMGN's own, address 7xKX…gAsU", rep.walletKind === "gmgn" && rep.walletAddr === WALLET_LABEL, { k: rep.walletKind, a: rep.walletAddr, e: rep.walletEvidence });
  ok("CDP targets listed before and after", Array.isArray(rep.cdpTargetsBefore) && Array.isArray(rep.cdpTargetsAfter) && rep.cdpTargetsAfter.some((t) => t.type === "page" && /gmgn\.ai/.test(t.url)), rep.cdpTargetsAfter);
  ok("the accessibility snapshot of the box is in the report", typeof rep.aria === "string" && /tab "Buy"/.test(rep.aria) && /textbox "Amount"/.test(rep.aria), rep.aria);
  ok("a screenshot is written to real/probe.png", rep.screenshot && fs.statSync(rep.screenshot).size > 1000);
  ok("the probe's tab is closed afterwards", chrome.ctx.pages().length === pagesBefore, { before: pagesBefore, after: chrome.ctx.pages().length });

  const rep2 = await panel.probe(`https://gmgn.ai/sol/token/${mintOf("probe-b")}`);
  ok("the hash is stable for the same page (another coin, same layout)", rep2.hash === rep.hash && /^[0-9a-f]{16}$/.test(rep.hash), [rep.hash, rep2.hash]);
  srv.variant = "slip5";
  const rep3 = await panel.probe(`https://gmgn.ai/sol/token/${mintOf("probe-c")}`);
  ok("only the numbers changed (slippage 5%): same hash, the 5% is read", rep3.hash === rep.hash && rep3.slippage.pct === 0.05, [rep3.hash, rep3.slippage]);
  srv.variant = "renamed";
  const rep4 = await panel.probe(`https://gmgn.ai/sol/token/${mintOf("probe-d")}`);
  ok("a renamed control changes the hash", rep4.hash !== rep.hash);

  srv.variant = "iframe";
  const rep5 = await panel.probe(`https://gmgn.ai/sol/token/${mintOf("probe-e")}`);
  const inBox = rep5.controls.filter((x) => x.inTradeBox);
  ok("iframe: the trade box is found inside the frame", rep5.ok && rep5.tradeBox && rep5.tradeBox.frame > 0 && rep5.frames.length >= 2, { ok: rep5.ok, why: rep5.why, tb: rep5.tradeBox, frames: rep5.frames });
  ok("iframe: its controls carry the frame index; the wallet label is in the top page", inBox.length >= 8 && inBox.every((x) => x.frame === rep5.tradeBox.frame) && rep5.controls.find((x) => x.name === WALLET_LABEL)?.frame === 0);
  ok("iframe: still zero clicks and zero inputs", srv.events.length === 0 && rep5.inputs === 0, srv.events);

  srv.variant = "phantom";
  const rep6 = await panel.probe(`https://gmgn.ai/sol/token/${mintOf("probe-f")}`);
  ok("a page that names Phantom: walletKind phantom (every buy and sell would need his confirm)", rep6.walletKind === "phantom" && rep6.walletEvidence.some((e) => /Phantom/.test(e)), rep6.walletEvidence);

  srv.variant = "normal";
  const rep7 = await panel.probe(`https://gmgn.ai/nothing-here/${mintOf("probe-g")}`);
  ok("no trade box (a 404 page): not ok, and why says so", rep7.ok === false && /no trade box/.test(rep7.why), rep7.why);
  ok("after 7 probes the page has still seen zero clicks and inputs", srv.events.length === 0, srv.events);

  // the probe module itself has no way to touch a page
  const src = fs.readFileSync(path.join(HERE, "../src/trader/real/probe.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("probe.mjs calls no click, fill, type, press, hover, check, tap or dispatchEvent", !/\.(click|fill|type|press|hover|check|uncheck|tap|dispatchEvent|selectOption|setInputFiles|focus)\s*\(/.test(src));
} finally {
  await chrome.close();
  await srv.close();
  clearTimeout(KILL);
}
console.log(`\nprobe.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
