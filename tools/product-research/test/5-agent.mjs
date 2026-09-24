/**
 * The supplier desk, in a real engine.
 *
 * There is no Mac here, so this is the proof: the local Chromium, the built
 * bundle injected at document start exactly the way WKUserScript injects it,
 * and stand-in pages made of the markup Alibaba and 1688 actually serve —
 * English and Chinese, signed in and signed out.
 *
 * What is being proven is the one rule the desk lives by: the numbers come out
 * right when the page prints them, and come out NULL when it does not. A zero
 * MOQ or a 0% response rate is a number Alex would quote at a factory, so a
 * missing field that arrives as 0 is a failing test, not a rounding error.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, failures } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = readFileSync(join(here, "..", "worker", "agent.built.js"), "utf8");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/* An Alibaba search page as it renders in English, signed in. */
const ALIBABA_RESULTS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>water chiller</title></head><body>
<header><a href="https://my.alibaba.com/">My Alibaba</a>
  <div class="member-info"><span class="member-name">alex.sculps</span></div></header>
<div class="organic-offer-wrapper" data-spm="offer1">
  <a href="/product-detail/portable-water-chiller_1600123.html" title="Portable Countertop Water Chiller">Portable Countertop Water Chiller</a>
  <div class="price">US $12.50 - 18.90</div>
  <div class="min-order">Min. Order: 500 Pieces</div>
  <div class="supplier-name"><a href="/company/shenzhen-cold.html">Shenzhen Cold Tech Co., Ltd.</a></div>
  <div class="years">6 YRS</div>
  <div>Transactions 512</div>
</div>
<div class="organic-offer-wrapper" data-spm="offer2">
  <a href="/product-detail/mini-chiller_1600999.html" title="Mini Bottle Chiller">Mini Bottle Chiller</a>
  <div class="supplier-name">Ningbo Frost Industry Co.</div>
</div>
</body></html>`;

/* 1688, all Chinese, the domestic list. */
const CN_RESULTS = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>冷水机</title></head><body>
<header><a href="https://work.1688.com/">我的1688</a><span class="member-name">阿力</span></header>
<div class="space-offer-card-box">
  <a href="https://detail.1688.com/offer/778899.html" title="便携式桌面冷水机">便携式桌面冷水机</a>
  <div class="price">¥3.50-8.20</div>
  <div>起订量：500 个</div>
  <div class="company-name">深圳冷科技有限公司</div>
  <div>7年</div>
  <div>成交1.2万件</div>
</div>
<div class="space-offer-card-box">
  <a href="https://detail.1688.com/offer/112233.html" title="迷你制冷杯">迷你制冷杯</a>
  <div class="price">￥88.00</div>
  <div>100件起批</div>
  <div class="company-name">宁波霜业厂家</div>
</div>
</body></html>`;

/* A 1688 company page with a ladder, certificates and OEM wording. */
const CN_SUPPLIER = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>深圳冷科技有限公司</title></head><body>
<a href="https://work.1688.com/">我的1688</a>
<h1 class="company-name">深圳冷科技有限公司</h1>
<div class="year-item">7年</div>
<div class="response-rate">回复率 96.5%</div>
<div class="transaction-count">近30天成交 1.2万</div>
<div class="certificate-list">ISO9001 / CE / RoHS 认证</div>
<div>支持 OEM 贴牌，来图加工 ODM</div>
<div>起订量：500 个</div>
<table class="ladder-price">
  <tr><th>数量</th><th>价格</th></tr>
  <tr><td>1-99 个</td><td>¥8.20</td></tr>
  <tr><td>100-499 个</td><td>¥5.40</td></tr>
  <tr><td>500 个以上</td><td>¥3.50</td></tr>
</table>
</body></html>`;

/* An Alibaba company page that prints almost nothing. The honest case. */
const THIN_SUPPLIER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ningbo Frost</title></head><body>
<a href="https://my.alibaba.com/">My Alibaba</a>
<h1 class="company-name">Ningbo Frost Industry Co.</h1>
<p>We make things.</p>
</body></html>`;

/* The message centre: a thread list, an open conversation, a composer, a
   paperclip with the file input behind it. */
const INBOX = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Message Center</title></head><body>
<a href="https://message.alibaba.com/">Messenger</a>
<ul class="conversation-list">
  <li class="session-item"><span class="name">Shenzhen Cold Tech</span><span class="last-msg">Sample is ready</span><span class="unread-badge">3</span></li>
  <li class="session-item"><span class="name">深圳冷科技</span><span class="last-msg">你好</span></li>
</ul>
<div class="message-list">
  <div class="message-item msg-other"><div class="content">Hello, this is Lily.</div><time datetime="2026-09-01T02:10:00Z">02:10</time></div>
  <div class="message-item msg-self"><div class="content">Hi Lily — can you quote 500pcs?</div></div>
</div>
<div class="send-box"><textarea class="chat-input" placeholder="Type a message"></textarea></div>
<input type="file" id="pick" accept="image/*">
<script>
  window.__filesSeen = null;
  document.getElementById('pick').addEventListener('change', function (e) {
    window.__filesSeen = Array.prototype.map.call(e.target.files, function (f) {
      return { name: f.name, type: f.type, size: f.size };
    });
  });
</script></body></html>`;

/* Signed out: Alibaba serves a sign-in header and no account anywhere. */
const SIGNED_OUT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Alibaba</title></head><body>
<header><a href="https://login.alibaba.com/?redirect=/">Sign In</a><a href="/register">Join Free</a></header>
<div class="organic-offer-wrapper"><a href="/product-detail/x_1.html">A thing</a></div>
</body></html>`;

const LOGIN = `<!doctype html><html><head><meta charset="utf-8"><title>Sign in</title></head><body>
<form><input name="account"><input name="password" type="password"><button>Sign In</button></form>
</body></html>`;

const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const pageFor = (u) => {
  if (u.hostname.startsWith("login.")) return LOGIN;
  if (u.pathname.startsWith("/company/cn")) return CN_SUPPLIER;
  if (u.pathname.startsWith("/company/thin")) return THIN_SUPPLIER;
  if (u.pathname.startsWith("/inbox")) return INBOX;
  if (u.pathname.startsWith("/out")) return SIGNED_OUT;
  if (u.hostname.endsWith("1688.com")) return CN_RESULTS;
  return ALIBABA_RESULTS;
};

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (route) =>
    route.fulfill({ contentType: "text/html", body: pageFor(new URL(route.request().url())) }),
  );
  await context.addInitScript({ content: BUNDLE });
  const page = await context.newPage();
  const go = async (url) => {
    await page.goto(url);
    await page.waitForFunction(() => window.__organic && window.__organic.__booted);
  };

  /* ------------------------------------------------ pure parsers, no DOM */
  await go("https://www.alibaba.com/trade/search");
  const P = await page.evaluate(() => {
    const p = window.__organic.sites.alibaba.parse;
    return {
      range: p.price("¥3.50-8.20"),
      single: p.price("¥88.00"),
      usd: p.price("US $12.50 - 18.90"),
      none: p.price("call for pricing"),
      moqEn: p.moq("Min. Order: 500 Pieces"),
      moqCn: p.moq("起订量：500 个"),
      moqQi: p.moq("100件起批"),
      moqNone: p.moq("free shipping worldwide"),
      yrsEn: p.years("6 YRS"),
      yrsCn: p.years("7年"),
      yrsNone: p.years("Gold Supplier"),
      dealsCn: p.deals("成交1.2万件"),
      dealsEn: p.deals("Transactions 512"),
      dealsNone: p.deals("no orders listed"),
      respCn: p.response("回复率 96.5%"),
      respEn: p.response("Response Rate 88%"),
      respNone: p.response("replies fast"),
      certs: p.certs("ISO9001 / CE / RoHS 认证"),
      certsNone: p.certs("A certificate of excellence"),
      wan: p.num("1.2万"),
    };
  });

  check("a ¥ range comes back as low/high/CNY", P.range && P.range.low === 3.5 && P.range.high === 8.2 && P.range.currency === "CNY", JSON.stringify(P.range));
  check("a single ¥ price has no invented high", P.single && P.single.low === 88 && P.single.high === null, JSON.stringify(P.single));
  check("a US $ range is USD", P.usd && P.usd.low === 12.5 && P.usd.high === 18.9 && P.usd.currency === "USD", JSON.stringify(P.usd));
  check("no price printed means null, not zero", P.none === null, JSON.stringify(P.none));
  check("Min. Order reads with its unit", P.moqEn && P.moqEn.quantity === 500 && P.moqEn.unit === "Pieces", JSON.stringify(P.moqEn));
  check("起订量 reads with its unit", P.moqCn && P.moqCn.quantity === 500 && P.moqCn.unit === "个", JSON.stringify(P.moqCn));
  check("起批 reads as an MOQ", P.moqQi && P.moqQi.quantity === 100 && P.moqQi.unit === "件", JSON.stringify(P.moqQi));
  check("no MOQ printed means null, not zero", P.moqNone === null, JSON.stringify(P.moqNone));
  check("6 YRS is six years", P.yrsEn === 6, String(P.yrsEn));
  check("7年 is seven years", P.yrsCn === 7, String(P.yrsCn));
  check("no years printed means null, not zero", P.yrsNone === null, String(P.yrsNone));
  check("成交1.2万件 is twelve thousand", P.dealsCn === 12000, String(P.dealsCn));
  check("Transactions 512 is five hundred and twelve", P.dealsEn === 512, String(P.dealsEn));
  check("no transactions printed means null, not zero", P.dealsNone === null, String(P.dealsNone));
  check("回复率 96.5% reads as 96.5", P.respCn === 96.5, String(P.respCn));
  check("Response Rate 88% reads as 88", P.respEn === 88, String(P.respEn));
  check("no response rate printed means null, not zero", P.respNone === null, String(P.respNone));
  check("the certificates listed are the ones read", P.certs.join(",") === "ISO9001,CE,RoHS", P.certs.join(","));
  check("the word certificate is not a certificate", P.certsNone.length === 0, P.certsNone.join(","));
  check("万 is ten thousand", P.wan === 12000, String(P.wan));

  /* ------------------------------------------------------------ results */
  const en = await page.evaluate(() => window.__organic.read.results());
  check("the English search page gives both rows", en.length === 2, String(en.length));
  check("the row carries its price range", en[0].price.low === 12.5 && en[0].price.high === 18.9);
  check("the row carries its MOQ", en[0].moq.quantity === 500 && en[0].moq.unit === "Pieces");
  check("the row names the supplier", /Shenzhen Cold Tech/.test(en[0].supplier || ""), en[0].supplier);
  check("the row carries years and transactions", en[0].years === 6 && en[0].transactions === 512, `${en[0].years}/${en[0].transactions}`);
  check("a row that prints no price says null", en[1].price === null, JSON.stringify(en[1].price));
  check("a row that prints no MOQ says null", en[1].moq === null, JSON.stringify(en[1].moq));
  check("a row that prints no years says null", en[1].years === null, String(en[1].years));
  check("a row that prints no transactions says null", en[1].transactions === null, String(en[1].transactions));
  check("the English page says it is alibaba", en[0].site === "alibaba", en[0].site);
  check("signed in when the header offers his account", await page.evaluate(() => window.__organic.read.signedIn("alibaba")) === true);

  await go("https://s.1688.com/selloffer/offer_search.htm");
  const cn = await page.evaluate(() => window.__organic.read.results());
  check("the Chinese search page gives both rows", cn.length === 2, String(cn.length));
  check("¥3.50-8.20 comes off the card as a range", cn[0].price.low === 3.5 && cn[0].price.high === 8.2 && cn[0].price.currency === "CNY", JSON.stringify(cn[0].price));
  check("起订量 comes off the card", cn[0].moq.quantity === 500 && cn[0].moq.unit === "个", JSON.stringify(cn[0].moq));
  check("7年 comes off the card", cn[0].years === 7, String(cn[0].years));
  check("成交1.2万件 comes off the card", cn[0].transactions === 12000, String(cn[0].transactions));
  check("the Chinese supplier name comes off the card", cn[0].supplier === "深圳冷科技有限公司", cn[0].supplier);
  check("起批 on the second row reads as an MOQ", cn[1].moq.quantity === 100, JSON.stringify(cn[1].moq));
  check("a card with no years says null on 1688 too", cn[1].years === null, String(cn[1].years));
  check("the Chinese page says it is 1688", cn[0].site === "1688", cn[0].site);

  /* ----------------------------------------------------------- supplier */
  await go("https://detail.1688.com/company/cn");
  const sup = await page.evaluate(() => window.__organic.read.supplier());
  check("the company page names the company", sup.name === "深圳冷科技有限公司", sup.name);
  check("the company page gives years", sup.years === 7, String(sup.years));
  check("the company page gives the response rate", sup.responseRate === 96.5, String(sup.responseRate));
  check("the company page gives transactions", sup.transactions === 12000, String(sup.transactions));
  check("the certificates listed are read", sup.certifications.join(",") === "ISO9001,CE,RoHS", sup.certifications.join(","));
  check("OEM and ODM are read because the page says them", sup.oem === true && sup.odm === true);
  check("the ladder comes back with three tiers", sup.tiers && sup.tiers.length === 3, JSON.stringify(sup.tiers));
  check("the first tier is 1-99 at ¥8.20", sup.tiers[0].min === 1 && sup.tiers[0].max === 99 && sup.tiers[0].price.low === 8.2, JSON.stringify(sup.tiers[0]));
  check("the last tier is 500+ with no ceiling", sup.tiers[2].min === 500 && sup.tiers[2].max === null && sup.tiers[2].price.low === 3.5, JSON.stringify(sup.tiers[2]));
  check("the ladder keeps the unit the page printed", sup.tiers[0].unit === "个", String(sup.tiers[0].unit));

  await go("https://www.alibaba.com/company/thin");
  const thin = await page.evaluate(() => window.__organic.read.supplier());
  check("a thin page still names the company", thin.name === "Ningbo Frost Industry Co.", thin.name);
  check("a thin page says null years, not zero", thin.years === null, String(thin.years));
  check("a thin page says null response rate, not zero", thin.responseRate === null, String(thin.responseRate));
  check("a thin page says null transactions, not zero", thin.transactions === null, String(thin.transactions));
  check("a thin page lists no certificates", thin.certifications.length === 0);
  check("a thin page does not claim OEM", thin.oem === false && thin.odm === false);
  check("no ladder means null, not an empty ladder", thin.tiers === null, JSON.stringify(thin.tiers));
  check("a thin page says null MOQ", thin.moq === null, JSON.stringify(thin.moq));

  /* -------------------------------------------------------- signed out */
  await go("https://www.alibaba.com/out");
  check("a sign-in header with no account means signed out", await page.evaluate(() => window.__organic.read.signedIn("alibaba")) === false);
  check("signed out still reads what the list shows", (await page.evaluate(() => window.__organic.read.results())).length === 1);
  check("signed out has no handle", await page.evaluate(() => window.__organic.sites.alibaba.handle()) === null);

  await go("https://login.alibaba.com/");
  check("a password page is a login page", await page.evaluate(() => window.__organic.sites.alibaba.isLoginPage()) === true);
  check("a login page reads no results at all", (await page.evaluate(() => window.__organic.read.results())).length === 0);
  check("a login page reads no supplier", await page.evaluate(() => window.__organic.read.supplier()) === null);

  /* ------------------------------------------------------ message centre */
  await go("https://message.alibaba.com/inbox");
  const th = await page.evaluate(() => window.__organic.read.threads());
  check("the inbox lists both conversations", th.length === 2, String(th.length));
  check("a thread carries who and the last line", th[0].who === "Shenzhen Cold Tech" && /Sample is ready/.test(th[0].last), JSON.stringify(th[0]));
  check("an unread badge is the number it shows", th[0].unread === 3, String(th[0].unread));
  check("no badge means null unread, not zero unread", th[1].unread === null, String(th[1].unread));
  check("a Chinese thread name survives", th[1].who === "深圳冷科技", th[1].who);

  const ms = await page.evaluate(() => window.__organic.read.messages());
  check("the open conversation reads oldest last", ms.length === 2 && /quote 500pcs/.test(ms[1].text));
  check("theirs is marked as not mine", ms[0].mine === false, String(ms[0].mine));
  check("mine is marked as mine", ms[1].mine === true, String(ms[1].mine));
  check("a timestamp is the one the row printed", ms[0].at === "2026-09-01T02:10:00Z", String(ms[0].at));
  check("a message with no time says null", ms[1].at === null, String(ms[1].at));
  check("the composer is the chat box, not the search box", await page.evaluate(() => {
    const el = window.__organic.sites.alibaba.composer();
    return el ? el.className : null;
  }) === "chat-input");

  /* ---------------------------------------------------------- sendFile */
  const sent = await page.evaluate(
    (url) => window.__organic.hands.sendFile({ file: url, name: "render.png" }),
    PNG_1x1,
  );
  check("a data url is attached to the file input", sent.ok === true, JSON.stringify(sent));
  const seen = await page.evaluate(() => window.__filesSeen);
  check("the page's own change handler saw the file", seen && seen.length === 1 && seen[0].name === "render.png", JSON.stringify(seen));
  check("the file arrived as a png with bytes in it", seen[0].type === "image/png" && seen[0].size > 0, JSON.stringify(seen[0]));

  const junk = await page.evaluate(() => window.__organic.hands.sendFile({ file: "/Users/alex/render.png" }));
  check("a disk path is refused rather than guessed at", junk.ok === false && /data: url/.test(junk.error), JSON.stringify(junk));

  await go("https://www.alibaba.com/trade/search");
  const noInput = await page.evaluate((url) => window.__organic.hands.sendFile({ file: url }), PNG_1x1);
  check("no file input on the page fails honestly", noInput.ok === false && /no file input/.test(noInput.error), JSON.stringify(noInput));

  /* ----------------------------------------------------- through the wire */
  await go("https://message.alibaba.com/inbox");
  // There is no Swift here, so send() keeps every message in __organic.sent —
  // which is exactly the wire the app would have read.
  const answer = async (id, msg) => {
    await page.evaluate((m) => {
      window.__organic.sent = [];
      window.__organic.fromApp(m);
    }, msg);
    return page.waitForFunction(
      (want) => (window.__organic.sent || []).find((m) => m.t === "done" && m.id === want) || null,
      id,
    ).then((h) => h.jsonValue());
  };

  const viaBridge = await answer("f1", { t: "do", id: "f1", act: "sendFile", file: PNG_1x1, name: "qr.png" });
  check("act sendFile answers through the bridge", viaBridge.ok === true && viaBridge.result.ok === true, JSON.stringify(viaBridge));

  const viaRead = await answer("r1", { t: "do", id: "r1", act: "read", what: "supplier" });
  check("act read/supplier answers through the bridge", viaRead.ok === true, JSON.stringify(viaRead).slice(0, 120));

  await browser.close();
}

await main();
if (failures()) {
  console.log(`\n${failures()} failed`);
  process.exit(1);
}
console.log("\nall good");
