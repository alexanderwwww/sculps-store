/**
 * Alibaba and 1688, as the desk sees them.
 *
 * One recipe for both because they are the same company and very nearly the
 * same page underneath: a supplier list, a product page, and a message
 * centre. 1688 is the Chinese domestic side — the prices Alex is actually
 * after — and it has no API at all, which is the whole reason this app is a
 * browser and not a fetch call.
 *
 * Alex signs into both himself. Nothing here types a password or reads one.
 *
 * Both sites change their markup constantly and serve a different template to
 * a signed-out visitor than to a signed-in one, so every reader below tries
 * several strategies in turn and stops at the first that gives something it
 * can defend. When none of them do, the answer is null or [] — never a zero,
 * never a guess. A zero MOQ or a 0% response rate would be a lie Alex would
 * then quote at a factory.
 *
 * 1688 is entirely in Chinese, so the labels are read in both languages:
 * 起订量 (minimum order), 成交 (transactions done), 年 (years trading),
 * 回复率 (response rate), 供应商 / 厂家 (supplier / factory), ¥ prices.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  var S = O.sites || (O.sites = {});
  if (S.alibaba) return;

  function text(el) {
    return el ? String(el.innerText || el.textContent || "").trim() : "";
  }

  /** The same, with runs of whitespace flattened — for matching, not display. */
  function flat(el) {
    return text(el).replace(/\s+/g, " ");
  }

  function abs(href) {
    if (!href) return null;
    try { return new URL(href, location.href).href; } catch (e) { return null; }
  }

  function first(list) {
    for (var i = 0; i < list.length; i++) if (list[i] != null && list[i] !== "") return list[i];
    return null;
  }

  /** Every element matching any of the selectors, in document order, deduped. */
  function pick(sels, scope) {
    var out = [];
    var seen = [];
    for (var i = 0; i < sels.length; i++) {
      var hits;
      try { hits = (scope || document).querySelectorAll(sels[i]); } catch (e) { continue; }
      for (var j = 0; j < hits.length; j++) {
        if (seen.indexOf(hits[j]) >= 0) continue;
        seen.push(hits[j]);
        out.push(hits[j]);
      }
    }
    return out;
  }

  function one(sels, scope) {
    var hits = pick(sels, scope);
    return hits.length ? hits[0] : null;
  }

  /**
   * A number as either site prints it. "1,200" / "1.2万" / "3.4k" / "12件".
   * 万 is ten thousand and 亿 is a hundred million — 1688 uses both freely and
   * getting them wrong is two orders of magnitude of wrong.
   */
  function num(s) {
    if (s == null) return null;
    var m = /(\d[\d,]*(?:\.\d+)?)\s*(万|亿|千|[KkMm])?/.exec(String(s));
    if (!m) return null;
    var n = Number(m[1].replace(/,/g, ""));
    if (!isFinite(n)) return null;
    var mult = { "万": 1e4, "亿": 1e8, "千": 1e3, K: 1e3, k: 1e3, M: 1e6, m: 1e6 }[m[2] || ""] || 1;
    return Math.round(n * mult * 100) / 100;
  }

  var CUR = "(?:US\\s*\\$|\\$|US¥|¥|￥|RMB|CNY|USD)";

  /**
   * "US $12.50 - 18.90" / "¥88.00" / "¥3.50-8.20" / "￥3.50~8.20元".
   * A range comes back as {low, high, currency}; a single price has high null
   * rather than a high copied off the low, because "3.50 to 3.50" is a claim
   * the page never made.
   */
  function priceFrom(s) {
    if (!s) return null;
    var re = new RegExp(CUR + "\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:[-~—–至到]\\s*(?:" + CUR + ")?\\s*(\\d[\\d,]*(?:\\.\\d+)?))?");
    var m = re.exec(String(s));
    if (!m) return null;
    var lo = Number(m[1].replace(/,/g, ""));
    if (!isFinite(lo)) return null;
    var hi = m[2] ? Number(m[2].replace(/,/g, "")) : null;
    if (hi != null && !isFinite(hi)) hi = null;
    // a range printed backwards is the page's mistake, not a reason to invent
    if (hi != null && hi < lo) { var t = lo; lo = hi; hi = t; }
    var cny = /[¥￥]|RMB|CNY/.test(m[0]);
    return { low: lo, high: hi, currency: cny ? "CNY" : "USD" };
  }

  function priceIn(el) {
    if (!el) return null;
    // the marked-up price first, the whole blob only as a fallback
    var tagged = pick(
      ['[class*="price" i]', '[data-price]', '[itemprop="price"]', ".price", ".sku-price"],
      el,
    );
    for (var i = 0; i < tagged.length; i++) {
      var p = priceFrom(tagged[i].getAttribute("data-price") || flat(tagged[i]));
      if (p) return p;
    }
    return priceFrom(flat(el));
  }

  /**
   * The minimum order, however it is written:
   *   "Min. Order: 500 Pieces"   "起订量：500 个"   "500件起批"   "≥ 100 米"
   * The unit is kept exactly as printed and is null when the row omits it.
   */
  function moqFrom(s) {
    if (!s) return null;
    s = String(s);
    var pats = [
      /(?:Min(?:imum)?\.?\s*Order(?:\s*Quantity)?|MOQ)\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?\s*(?:万|千)?)\s*([^\s\d,.;|·\/]{0,6})/i,
      /(?:最小)?起订量\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?\s*(?:万|千)?)\s*([^\s\d,.;|·\/]{0,6})/,
      /(\d[\d,]*(?:\.\d+)?\s*(?:万|千)?)\s*([^\s\d,.;|·\/]{0,4}?)\s*起(?:批|订|定)/,
      /[≥>]=?\s*(\d[\d,]*(?:\.\d+)?\s*(?:万|千)?)\s*([^\s\d,.;|·\/]{0,4})/,
    ];
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i].exec(s);
      if (!m) continue;
      var q = num(m[1]);
      if (q == null) continue;
      var unit = (m[2] || "").replace(/[:：,，.。]/g, "").trim();
      // "Pieces" and "件" are units; a stray "起" or a currency mark is not
      if (!unit || /^(?:起|批|订|定|and|up)$/i.test(unit) || new RegExp("^" + CUR + "$").test(unit)) unit = null;
      return { quantity: q, unit: unit };
    }
    return null;
  }

  /** "5 YRS" / "6年" / "Since 2011" is not years traded — only the first two. */
  function yearsFrom(s) {
    if (!s) return null;
    var m = /(\d{1,2})\s*(?:yrs?|years?)\b/i.exec(String(s)) || /(\d{1,2})\s*年(?![^\s]{0,3}(?:销|售))/.exec(String(s));
    if (!m) return null;
    var n = Number(m[1]);
    return isFinite(n) && n > 0 && n < 100 ? n : null;
  }

  /** 成交 / transactions: "成交1.2万件" "月成交 3400" "Transactions 512". */
  function dealsFrom(s) {
    if (!s) return null;
    var m =
      /(?:月?成交|近30天成交)\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?\s*(?:万|亿|千)?)/.exec(String(s)) ||
      /(\d[\d,]*(?:\.\d+)?\s*(?:万|亿|千)?)\s*(?:笔|单)?\s*(?:成交|交易)/.exec(String(s)) ||
      // "Orders" alone is not it: "Min. Order: 500" is the MOQ, not a count
      /(?:Transactions?|Orders?\s*(?:Completed|Placed)|Total\s*Orders?)\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?\s*[KkMm]?)/i.exec(String(s));
    return m ? num(m[1]) : null;
  }

  /** 回复率 / Response Rate, as a percentage number. Never defaulted to 0. */
  function responseFrom(s) {
    if (!s) return null;
    var m =
      /(?:回复率|响应率)\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)\s*%/.exec(String(s)) ||
      /Respon(?:se|d)\s*Rate\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)\s*%/i.exec(String(s));
    if (!m) return null;
    var n = Number(m[1]);
    return isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }

  /** The certification marks either site actually prints, in the order seen. */
  var CERTS = [
    "ISO9001", "ISO 9001", "ISO14001", "ISO 14001", "ISO13485", "IATF16949",
    "BSCI", "SEDEX", "SGS", "CE", "RoHS", "REACH", "FDA", "FCC", "UL", "ETL",
    "GS", "PSE", "CCC", "3C", "EMC", "MSDS", "GRS", "OEKO-TEX", "BRC", "HACCP",
  ];
  function certsFrom(s) {
    if (!s) return [];
    var out = [];
    for (var i = 0; i < CERTS.length; i++) {
      var word = CERTS[i];
      var re = new RegExp("(^|[^A-Za-z0-9])" + word.replace(/[-\s]/g, "[-\\s]?") + "([^A-Za-z0-9]|$)", "i");
      if (!re.test(s)) continue;
      // ISO 9001 also matches the looser "ISO"; keep the specific spelling only
      if (out.indexOf(word) < 0 && !out.some(function (w) { return w.replace(/\s/g, "") === word.replace(/\s/g, ""); }))
        out.push(word);
    }
    return out;
  }

  /** The supplier's name off a row: the labelled node first, then 供应商/厂家. */
  function supplierIn(card) {
    var el = one(
      [
        '[class*="supplier" i] a', '[class*="company" i] a', '[class*="seller" i] a',
        '[class*="supplier" i]', '[class*="company" i]', '[class*="seller" i]',
        '[class*="shop-name" i]', '[class*="factory" i]',
        'a[href*="/company/"]', 'a[href*="company_profile"]', 'a[href*=".1688.com"]',
      ],
      card,
    );
    var t = el ? flat(el) : "";
    if (t && t.length <= 80) return t;
    var whole = flat(card);
    var m = /(?:供应商|厂家|商家|公司)\s*[:：]?\s*([^\s|·]{2,40})/.exec(whole);
    if (m) return m[1];
    return t ? t.slice(0, 80) : null;
  }

  /** A page that is asking for a password is not a page we read anything off. */
  function isLoginPage() {
    if (/(^|\/)(login|signin)/i.test(location.pathname) || /login\.(1688|alibaba)\.com$/.test(location.hostname))
      return true;
    return Boolean(document.querySelector('input[type="password"]') && document.querySelector("form"));
  }

  S.alibaba = {
    match: function (host) {
      return /(^|\.)alibaba\.com$/.test(host) || /(^|\.)1688\.com$/.test(host);
    },

    site: function () {
      return /1688\.com$/.test(location.hostname) ? "1688" : "alibaba";
    },

    isLoginPage: isLoginPage,

    /**
     * Signed in, in layers, because both sites render a different header for
     * each state and neither marks it honestly:
     *   1. a password form on screen — definitely not
     *   2. the site's own signed-in marker (my-alibaba, 会员/我的阿里)
     *   3. a sign-in link with nothing beside it — definitely not
     *   4. a readable account name
     * When none of that is on the page it says false, because "probably" is
     * not an answer the brain can act on.
     */
    signedIn: function () {
      if (isLoginPage()) return false;
      var marked = one([
        'a[href*="my.alibaba.com"]', 'a[href*="message.alibaba.com"]',
        'a[href*="work.1688.com"]', 'a[href*="member.1688.com"]',
        '[class*="sign-out" i]', '[class*="logout" i]',
        '[data-role="member"]', '[class*="my-alibaba" i]',
      ]);
      if (marked) return true;
      var signIn = one([
        'a[href*="login" i]', 'a[href*="signin" i]', ".sign-in", "#login-form",
      ]);
      var named = S.alibaba.handle();
      if (signIn && !named) return false;
      if (named) return true;
      // 我的阿里 / 我的1688 only ever appears once he is in
      return /我的(?:阿里|1688)|退出登录|Sign\s*Out/i.test(flat(document.body).slice(0, 4000));
    },

    /**
     * His own account name, when the header prints one. Anything that looks
     * like a prompt ("Sign In", "登录", "Hi,") is not a name.
     */
    handle: function () {
      var cands = pick([
        '[class*="member" i] [class*="name" i]',
        '[class*="account" i] [class*="name" i]',
        '[class*="user" i] [class*="name" i]',
        '[class*="login-id" i]', '[class*="nick" i]',
        '[data-role="member"] [class*="name" i]',
      ]);
      for (var i = 0; i < cands.length; i++) {
        var t = flat(cands[i]).replace(/^(?:Hi|Hello|欢迎)[,，]?\s*/i, "").replace(/[,，]$/, "");
        if (!t || t.length > 60) continue;
        if (/sign\s*in|sign\s*up|log\s*in|register|登录|注册|免费注册/i.test(t)) continue;
        return t;
      }
      return null;
    },

    /**
     * A search page's results: the product, the price the row shows, the
     * minimum order, the supplier, years trading and transactions done.
     *
     * Three strategies, in order: the cards either site marks up, then the
     * offer links' own containers, then any link that looks like an offer at
     * all. Everything is read off the row — a missing number stays null rather
     * than becoming a zero.
     */
    results: function () {
      if (isLoginPage()) return [];
      var cards = pick([
        '[data-spm*="offer"]',
        ".organic-offer-wrapper", ".list-no-v-tile", ".J_offerCard",
        ".offer-list-row", ".space-offer-card-box", ".offer-list-row-offer",
        '[class*="offer-card" i]', '[class*="organic-list" i] [class*="card" i]',
        '[class*="product-card" i]', '[class*="gallery-offer" i]',
        '[data-content="abtest-mod"]', '[class*="J_offerBox" i]',
      ]);
      if (!cards.length) {
        // no marked card: climb out of each offer link to the block holding it
        var links = pick([
          'a[href*="/product-detail/"]',
          'a[href*="detail.1688.com/offer/"]',
          'a[href*="/offer/"]',
        ]);
        cards = links.map(function (a) {
          var n = a;
          for (var i = 0; i < 5 && n.parentElement; i++) {
            n = n.parentElement;
            // stop at the block that also carries a price — that is the row
            if (priceIn(n)) return n;
          }
          return a.parentElement || a;
        });
      }
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < cards.length && out.length < 40; i++) {
        var card = cards[i];
        var link = one(
          [
            'a[href*="/product-detail/"]',
            'a[href*="detail.1688.com/offer/"]',
            'a[href*="/offer/"]',
            "a[href]",
          ],
          card,
        );
        var url = link ? abs(link.getAttribute("href")) : null;
        if (!url || seen[url]) continue;
        seen[url] = 1;
        var whole = flat(card);
        var titleEl = one(['[class*="title" i]', "h2", "h3", '[class*="subject" i]'], card);
        var title = first([
          link && (link.getAttribute("title") || "").trim(),
          titleEl && flat(titleEl),
          link && flat(link),
          whole,
        ]);
        out.push({
          url: url,
          title: String(title || "").slice(0, 160) || null,
          price: priceIn(card),
          moq: moqFrom(whole),
          supplier: supplierIn(card),
          years: yearsFrom(whole),
          transactions: dealsFrom(whole),
          site: S.alibaba.site(),
        });
      }
      return out;
    },

    /**
     * A company or product page, read as printed.
     *
     * This is the reader that decides whether Alex writes to a factory at all,
     * so it is the one that must not invent. Every field is null when the page
     * does not say it, certifications is [] when none are listed, and the
     * tiers table is null (not []) when the page shows no tiers — "no tiers"
     * and "tiers we could not read" are different facts and the brain treats
     * them differently.
     */
    supplier: function () {
      if (isLoginPage()) return null;
      var body = flat(document.body || document.documentElement);
      if (!body) return null;

      var nameEl = one([
        '[class*="company-name" i]', '[class*="companyName" i]',
        '[class*="supplier-name" i]', '[class*="shop-name" i]',
        '[class*="company" i] h1', '[class*="company" i] a',
        'a[href*="/company/"]', '[class*="factory-name" i]',
      ]);
      var name = nameEl ? flat(nameEl) : null;
      if (!name) {
        var m = /(?:供应商|厂家|商家)\s*[:：]\s*([^\s|·]{2,60})/.exec(body);
        if (m) name = m[1];
      }
      if (name && name.length > 120) name = null;

      // years / response / transactions come off their own labelled node when
      // there is one, and off the page text when there is not
      var yearsEl = one(['[class*="year" i]', '[class*="yrs" i]', '[title*="年"]']);
      var years = first([yearsEl && yearsFrom(flat(yearsEl)), yearsFrom(body)]);

      var respEl = one(['[class*="response" i]', '[class*="reply" i]', '[class*="回复"]']);
      var response = first([respEl && responseFrom(flat(respEl)), responseFrom(body)]);

      var dealEl = one(['[class*="transaction" i]', '[class*="deal" i]', '[class*="trade" i]', '[class*="成交"]']);
      var transactions = first([dealEl && dealsFrom(flat(dealEl)), dealsFrom(body)]);

      // certifications: what a certificate list names, else what the page prints
      var certScope = pick(['[class*="certific" i]', '[class*="认证"]', '[class*="credential" i]']);
      var certs = [];
      for (var i = 0; i < certScope.length; i++)
        certsFrom(flat(certScope[i])).forEach(function (c) { if (certs.indexOf(c) < 0) certs.push(c); });
      if (!certs.length) certs = certsFrom(body);

      return {
        site: S.alibaba.site(),
        url: location.href,
        name: name || null,
        years: years == null ? null : years,
        responseRate: response == null ? null : response,
        transactions: transactions == null ? null : transactions,
        certifications: certs,
        // only true when the page itself says it; false means "it does not say"
        oem: /\bOEM\b/i.test(body) || /来样加工|贴牌/.test(body),
        odm: /\bODM\b/i.test(body) || /来图加工|自主研发设计/.test(body),
        moq: moqFrom(body),
        price: priceIn(document.querySelector('[class*="price" i]') || document.body),
        tiers: S.alibaba.tiers(),
      };
    },

    /**
     * The quantity -> price ladder, when the page prints one.
     *
     * Alibaba renders it as a table or as stacked "1 - 99 Pieces / $4.20"
     * cells; 1688 renders "1-99件 ¥3.50". A tier is only kept when BOTH a
     * quantity and a price came out of the same cell — half a tier is worse
     * than no tier. Returns null when the page has no ladder at all.
     */
    tiers: function () {
      var rows = [];

      // 1. a real table: quantity column and price column
      var tables = pick(['[class*="ladder" i] table', '[class*="price" i] table', "table"]);
      for (var t = 0; t < tables.length && !rows.length; t++) {
        var trs = tables[t].querySelectorAll("tr");
        var got = [];
        for (var r = 0; r < trs.length; r++) {
          var cells = trs[r].querySelectorAll("td, th");
          if (cells.length < 2) continue;
          var q = qtyFrom(flat(cells[0]));
          var p = priceFrom(flat(cells[cells.length - 1]));
          if (q && p) got.push({ min: q.min, max: q.max, unit: q.unit, price: p });
        }
        if (got.length) rows = got;
      }

      // 2. stacked cells: each one carries its own quantity and price
      if (!rows.length) {
        var cells2 = pick([
          '[class*="ladder" i] [class*="item" i]',
          '[class*="price-item" i]', '[class*="price-range" i]',
          '[class*="sku-price" i]', '[class*="tier" i]',
        ]);
        for (var c = 0; c < cells2.length; c++) {
          var s = flat(cells2[c]);
          var q2 = qtyFrom(s);
          var p2 = priceFrom(s);
          if (q2 && p2) rows.push({ min: q2.min, max: q2.max, unit: q2.unit, price: p2 });
        }
      }

      if (!rows.length) return null;
      // the same ladder can be rendered twice (mobile + desktop templates)
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var key = rows[i].min + "|" + rows[i].max + "|" + rows[i].price.low;
        if (seen[key]) continue;
        seen[key] = 1;
        out.push(rows[i]);
      }
      return out;
    },

    /**
     * The message centre's threads.
     *
     * The list is one of half a dozen widgets depending on which message
     * centre the account gets. A row with no readable name is dropped rather
     * than listed as an empty conversation — openThread matches on that name.
     */
    threads: function () {
      var rows = pick([
        '[class*="conversation" i] li', '[class*="session-list" i] li',
        '[class*="chat-list" i] li', '[class*="contact-list" i] li',
        '[class*="session-item" i]', '[class*="conversation-item" i]',
        '[class*="talk-list" i] li', '[role="listitem"][class*="chat" i]',
      ]);
      var out = [];
      var seen = Object.create(null);
      for (var i = 0; i < rows.length && out.length < 40; i++) {
        var row = rows[i];
        var nameEl = one(
          ['[class*="name" i]', '[class*="nick" i]', '[class*="title" i]', "h3", "h4"],
          row,
        );
        var lines = text(row).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        var who = first([nameEl && flat(nameEl), lines[0]]);
        if (!who || who.length > 80) continue;
        if (seen[who]) continue;
        seen[who] = 1;
        var lastEl = one(['[class*="last" i]', '[class*="summary" i]', '[class*="preview" i]'], row);
        var badge = one(['[class*="unread" i]', '[class*="badge" i]', '[class*="dot" i]'], row);
        var unreadN = badge ? num(flat(badge)) : null;
        out.push({
          who: who.slice(0, 80),
          last: first([lastEl && flat(lastEl), lines[1]]) ? String(first([lastEl && flat(lastEl), lines[1]])).slice(0, 200) : null,
          // no badge means the row said nothing about unread, not "zero unread"
          unread: badge ? (unreadN == null ? null : unreadN) : null,
        });
      }
      return out;
    },

    /** Open a conversation by the exact name the list shows. */
    openThread: function (who) {
      who = String(who || "").trim();
      if (!who) return false;
      var rows = pick([
        '[class*="conversation" i] li', '[class*="session-list" i] li',
        '[class*="chat-list" i] li', '[class*="session-item" i]',
        '[class*="conversation-item" i]', '[class*="contact-list" i] li',
      ]);
      for (var i = 0; i < rows.length; i++) {
        if (flat(rows[i]).indexOf(who) !== 0 && flat(rows[i]).split("\n")[0] !== who) {
          // exact name anywhere in the row is still allowed, loose is not
          if (flat(rows[i]).indexOf(who) < 0) continue;
        }
        var target = one(["a[href]", '[class*="name" i]'], rows[i]) || rows[i];
        try { target.click(); } catch (e) { return false; }
        return true;
      }
      return false;
    },

    /**
     * The open conversation, oldest last.
     *
     * "mine" is only true when the row says so — a class naming the sender, an
     * aria-label, or the message sitting on the right. When the row says
     * nothing it is null, because attributing one of the factory's own lines
     * to Alex would be worse than not knowing.
     */
    messages: function () {
      var rows = pick([
        '[class*="message-item" i]', '[class*="msg-item" i]',
        '[class*="chat-message" i]', '[class*="message-list" i] li',
        '[class*="bubble" i]', '[class*="talk-item" i]',
      ]);
      var out = [];
      for (var i = Math.max(0, rows.length - 40); i < rows.length; i++) {
        var row = rows[i];
        var bodyEl = one(['[class*="content" i]', '[class*="text" i]', '[class*="body" i]'], row);
        var t = flat(bodyEl || row);
        if (!t) continue;
        var cls = String(row.className || "") + " " + (row.getAttribute("data-from") || "");
        var mine = null;
        if (/\b(self|mine|right|out|send|sent|me)\b/i.test(cls) || /自己|我发/.test(cls)) mine = true;
        else if (/\b(other|left|in|recv|receive|peer|them)\b/i.test(cls) || /对方/.test(cls)) mine = false;
        var timeEl = one(["time", '[class*="time" i]', '[class*="date" i]'], row);
        out.push({
          mine: mine,
          text: t.slice(0, 1200),
          at: timeEl ? (timeEl.getAttribute("datetime") || flat(timeEl) || null) : null,
        });
      }
      return out;
    },

    /**
     * The box a reply is typed into. Both centres use a contenteditable in
     * some templates and a textarea in others; a search box or a login field
     * is never it, which is what the exclusions below are for.
     */
    composer: function () {
      var cands = pick([
        '[class*="editor" i][contenteditable="true"]',
        '[class*="input" i][contenteditable="true"]',
        '[class*="send" i] textarea',
        '[class*="message" i] textarea',
        '[class*="chat" i] textarea',
        '[class*="reply" i] textarea',
        'textarea[class*="input" i]',
        '[contenteditable="true"]',
        "textarea",
      ]);
      for (var i = 0; i < cands.length; i++) {
        var el = cands[i];
        if (el.disabled || el.readOnly) continue;
        var hint = ((el.getAttribute("placeholder") || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.className || "")).toLowerCase();
        if (/search|搜索|password|keyword/.test(hint)) continue;
        if (O.find && O.find.visible && !O.find.visible(el)) continue;
        return el;
      }
      return null;
    },

    /** The site's own file picker in the message centre, for sendFile. */
    fileInput: function () {
      var ins = pick(['input[type="file"]']);
      for (var i = 0; i < ins.length; i++) {
        if (ins[i].disabled) continue;
        return ins[i];
      }
      return null;
    },
  };

  /** "1 - 99 Pieces" / "100-499件" / "≥500 个" / "5000+ pieces". */
  function qtyFrom(s) {
    if (!s) return null;
    s = String(s);
    var m = /(\d[\d,]*)\s*(?:万|千)?\s*[-~—–至到]\s*(\d[\d,]*)\s*(?:万|千)?\s*([^\s\d,.;|]{0,6})?/.exec(s);
    if (m) {
      var lo = num(m[1]), hi = num(m[2]);
      if (lo == null || hi == null) return null;
      return { min: lo, max: hi, unit: cleanUnit(m[3]) };
    }
    var m2 = /(?:[≥>]=?\s*)?(\d[\d,]*)\s*(?:万|千)?\s*([^\s\d,.;|]{0,6})?\s*(?:\+|以上|起)/.exec(s);
    if (m2) {
      var v = num(m2[1]);
      if (v == null) return null;
      return { min: v, max: null, unit: cleanUnit(m2[2]) };
    }
    var m3 = /^\s*(\d[\d,]*)\s*(?:万|千)?\s*([^\s\d,.;|]{0,6})?/.exec(s);
    if (m3) {
      var v3 = num(m3[1]);
      if (v3 == null) return null;
      return { min: v3, max: null, unit: cleanUnit(m3[2]) };
    }
    return null;
  }

  function cleanUnit(u) {
    u = (u || "").replace(/[:：,，.。+]/g, "").trim();
    if (!u) return null;
    if (new RegExp("^" + CUR + "$").test(u)) return null;
    if (/^(?:以上|起|and|up|或)$/i.test(u)) return null;
    return u;
  }

  // The parsers are exposed so the tests can feed them fragments directly —
  // nothing else reads them, and none of them touch the DOM.
  S.alibaba.parse = {
    price: priceFrom,
    moq: moqFrom,
    years: yearsFrom,
    deals: dealsFrom,
    response: responseFrom,
    certs: certsFrom,
    qty: qtyFrom,
    num: num,
  };
})(window);
