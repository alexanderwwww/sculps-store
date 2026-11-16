// GROK DESK: the helper connection badge (top bar) and the "GROK'S WORK" section of the desk.
// Everything shown is read from /api/aq/state. Missing = "—" or an honest empty state; nothing is invented.
// The same badge and the same lane/seat rows work for ChatGPT and Codex the moment the engine reports them.
import { ago, esc, poll } from "./main.js";
import { mark, series } from "./hist.js";

const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const QUIET_MS = 20 * 60e3;
export const HELPERS = [["grok", "GROK DESK", "Grok"], ["chatgpt", "CHATGPT", "ChatGPT"], ["codex", "CODEX", "Codex"]];
const pct = (v, dp = 1) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(dp) + "%" : D);
const wr = (v) => (num(v) ? (v * (v <= 1 ? 100 : 1)).toFixed(0) + "%" : D);
const cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const n0 = (v) => (num(v) ? String(v) : D);
const shortCa = (a) => (a && a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a || D);
const lbl = (l) => { const x = String(l || "").toUpperCase(); return x ? `<span class="lbl lbl-${esc(x.toLowerCase())}">${esc(x)}</span>` : ""; };

// ---------- connection: green under 20 min, amber after, grey when the engine says not connected ----------
export function helperStatus(s, k) {
  const hp = (s && s.helpers) || {}, v = hp[k], o = v && typeof v === "object" ? v : null;
  const lastAt = hp[k + "LastAt"] || (o && o.lastAt) || null, said = (o ? o.status : v) === "connected";
  const age = lastAt ? Date.now() - new Date(lastAt).getTime() : null, fresh = num(age) && age < QUIET_MS;
  return { k, st: fresh ? "on" : said ? (lastAt ? "quiet" : "on") : "off", lastAt, age };
}
export function helperBadge(s, k) {
  const [, big] = HELPERS.find((h) => h[0] === k) || [k, k.toUpperCase()], h = helperStatus(s, k);
  const seen = h.lastAt ? `last seen ${ago(h.lastAt)} ago` : h.st === "off" ? "never heard" : "", seenH = h.lastAt ? `<s>last seen </s>${ago(h.lastAt)} ago` : seen;
  return `<span class="hb hb-${h.st}" data-helper="${esc(k)}" title="${esc(big)}: ${h.st === "off" ? "not connected" : "connected"}${seen ? " · " + seen : ""}"><i></i><b>${esc(big)}</b><em>${h.st === "off" ? "NOT CONNECTED" : "CONNECTED"}</em>${seen ? `<small>${seenH}</small>` : ""}</span>`;
}
// Grok always shows (it is the desk Alex asked about); the others appear when they connect.
export const helperBadges = (s) => HELPERS.filter(([k]) => k === "grok" || helperStatus(s, k).st !== "off").map(([k]) => helperBadge(s, k)).join("");

// ---------- X radar parser ----------
// "GROK DESK X radar (CLAIMED, leads not proof). Last X sweep 2026-11-16T19:37:11Z UTC, 562 posts. 1. GTA 6 release | 97 posts / 88 authors |
//  1.067/min (15m), growth +12.0 | tickers - | CA no CA | cred 0.433 | swarm 0% 2. AI / agents | ..."
const f = (x) => { const v = parseFloat(x); return isFinite(v) ? v : null; };
export function parseRadar(text) {
  const t = String(text || ""); if (!/radar/i.test(t) || !/\|\s*\d+\s*posts?\b/i.test(t)) return null;
  const sw = /sweep\s+(\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:?\d\d)?)/i.exec(t), marks = [...t.matchAll(/(?:^|\s)(\d{1,2})\.\s+(?=[^|]{1,90}\|\s*\d+\s*posts?\b)/g)];
  if (!marks.length) return null;
  const head = t.slice(0, marks[0].index), tp = /([\d][\d,]*)\s+posts\b/i.exec(head.replace(/^.*sweep/i, "")) || /([\d][\d,]*)\s+posts\b/i.exec(head);
  const rows = [];
  for (let i = 0; i < marks.length; i++) {
    const seg = t.slice(marks[i].index + marks[i][0].length, i + 1 < marks.length ? marks[i + 1].index : t.length).trim(), p = seg.split("|").map((x) => x.trim());
    const r = { rank: Number(marks[i][1]), name: p[0], posts: null, authors: null, perMin: null, window: null, growth: null, tickers: [], ca: null, cred: null, swarm: null };
    for (const c of p.slice(1)) { let m;
      if ((m = /(\d+)\s*posts?\s*\/\s*(\d+)\s*authors?/i.exec(c))) { r.posts = +m[1]; r.authors = +m[2]; }
      if ((m = /(-?[\d.]+)\s*\/\s*min(?:\s*\(([^)]+)\))?/i.exec(c))) { r.perMin = f(m[1]); r.window = m[2] || null; }
      if ((m = /growth\s*([+-]?[\d.]+)/i.exec(c))) r.growth = f(m[1]);
      if ((m = /^tickers?\s+(.+)$/i.exec(c))) r.tickers = m[1].split(/[,\s]+/).map((x) => x.replace(/^\$/, "")).filter((x) => x && x !== "-" && x !== "—");
      if ((m = /^CA\s+(\S+)/i.exec(c)) && /^[1-9A-HJ-NP-Za-km-z]{25,}$/.test(m[1])) r.ca = m[1];
      if ((m = /cred\s*([\d.]+)/i.exec(c))) r.cred = f(m[1]);
      if ((m = /swarm\s*([\d.]+)\s*%/i.exec(c))) r.swarm = f(m[1]);
    }
    if (r.name && (r.posts != null || r.perMin != null)) rows.push(r);
  }
  if (!rows.length) return null;
  const st = sw ? Date.parse(sw[1]) : NaN;
  return { sweepAt: isFinite(st) ? new Date(st).toISOString() : null, posts: tp ? Number(tp[1].replace(/,/g, "")) : null, rows };
}
const pc = new Map();
const radarOf = (m) => { const k = m.text || ""; if (!pc.has(k)) { if (pc.size > 200) pc.clear(); pc.set(k, parseRadar(k)); } return pc.get(k); };
const rkey = (name) => "rad:" + String(name).toLowerCase().replace(/\s+/g, " ").trim();
const spark = (vals) => { if (!vals || vals.length < 2) return `<svg class="gk-sp" viewBox="0 0 64 16"></svg>`; const mx = Math.max(...vals, 1e-9), n = vals.length, pt = vals.map((v, i) => [((i / (n - 1)) * 62 + 1).toFixed(1), (14 - (v / mx) * 12).toFixed(1)]);
  return `<svg class="gk-sp" viewBox="0 0 64 16" preserveAspectRatio="none"><polyline fill="none" stroke="#fff" stroke-width="1.3" vector-effect="non-scaling-stroke" points="${pt.map((p) => p.join(",")).join(" ")}"/><circle cx="${pt[n - 1][0]}" cy="${pt[n - 1][1]}" r="1.6" fill="#fff"/></svg>`; };

// ---------- section shell (static: tabs and the chat box survive every re-render) ----------
const TABS = [["radar", "X RADAR"], ["picks", "PICKS"], ["room", "WAR ROOM"], ["seat", "COUNCIL"], ["posts", "POSTS"]];
export function grokHTML() {
  return `<section class="p grok" id="d-grok" data-tab="radar">
  <div class="gk-h"><div class="gk-av" id="g-av"><i></i><i></i></div><div class="gk-t"><b>GROK'S WORK</b><small>xAI agent on the helper link · what he sends, what he picks, what he thinks</small></div><div id="g-badge"></div></div>
  <div class="gk-sum" id="g-sum"></div>
  <div class="gk-tabs" role="tablist">${TABS.map(([k, n]) => `<button data-gt="${k}" role="tab">${n}<u id="g-n-${k}"></u></button>`).join("")}</div>
  <div class="gk-g">
    <div class="gk-p gk-radar" data-pane="radar"><div class="gk-ph"><b>X RADAR</b><span id="g-radar-s">—</span></div><div id="g-radar"></div></div>
    <div class="gk-p gk-room" data-pane="room"><div class="gk-ph"><b>WAR ROOM</b><span id="g-room-s">—</span></div><div id="g-room" class="gk-thread"></div>
      <form id="g-chat" class="gk-chat" autocomplete="off"><input name="text" maxlength="1000" placeholder="Message the war room as Alex" aria-label="Message the war room"><button type="submit">SEND</button></form><p class="gk-msg" id="g-chat-m"></p></div>
    <div class="gk-p gk-picks" data-pane="picks"><div class="gk-ph"><b>PICKS · HIS LANE</b><span id="g-picks-s">—</span></div><div id="g-picks"></div></div>
    <div class="gk-p gk-seat" data-pane="seat"><div class="gk-ph"><b>COUNCIL SEAT · ALERTS</b><span id="g-seat-s">—</span></div><div id="g-seat"></div></div>
    <div class="gk-p gk-posts" data-pane="posts"><div class="gk-ph"><b>OPINIONS · EVIDENCE POSTS</b><span id="g-posts-s">—</span></div><div id="g-posts" class="gk-scroll"></div></div>
  </div></section>`;
}

const cache = new Map(); let wired = false, lastRoomKey = "", readKey = "";
// Alex is looking at the war room (pane shown and on screen) -> tell the engine he has read it, once per newest message
function markRead(root, key) { const th = root.querySelector("#g-room"); if (!th || !th.offsetParent || document.hidden || key === readKey) return; const r = th.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; readKey = key;
  fetch("/api/aq/chat/read", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).then((x) => { if (!x.ok) readKey = ""; }).catch(() => { readKey = ""; }); }
async function copy(txt) { try { await navigator.clipboard.writeText(txt); return true; } catch {} try { const ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { return false; } }
function wire(root) {
  wired = true;
  try { const t = localStorage.getItem("aq-grok-tab"); if (t && TABS.some((x) => x[0] === t)) root.dataset.tab = t; } catch {}
  const paint = () => root.querySelectorAll("[data-gt]").forEach((b) => b.classList.toggle("on", b.dataset.gt === root.dataset.tab)); paint();
  root.addEventListener("click", async (e) => {
    const tb = e.target.closest("[data-gt]"); if (tb) { root.dataset.tab = tb.dataset.gt; paint(); const th = root.querySelector("#g-room"); if (tb.dataset.gt === "room" && th) th.scrollTop = th.scrollHeight; try { localStorage.setItem("aq-grok-tab", tb.dataset.gt); } catch {} return; }
    const cb = e.target.closest("[data-copy]"); if (cb) { const ok = await copy(cb.dataset.copy); cb.textContent = ok ? "COPIED" : "NO CLIPBOARD"; cb.classList.toggle("ok", ok); setTimeout(() => { cb.textContent = "COPY"; cb.classList.remove("ok"); }, 1400); }
  });
  const form = root.querySelector("#g-chat"), msg = root.querySelector("#g-chat-m");
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const inp = form.elements.text, text = inp.value.trim(); if (!text) return;
    const btn = form.querySelector("button"); btn.disabled = true; msg.className = "gk-msg"; msg.textContent = "Sending…";
    try {
      const r = await fetch("/api/aq/chat", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (r.status === 404 || r.status === 405) throw new Error("the engine has no chat yet (HTTP " + r.status + "). It arrives with the engine update.");
      const j = await r.json().catch(() => ({})); if (!r.ok || j.error) { const er = j.error; throw new Error((er && typeof er === "object" ? er.message || er.code : er) || j.message || "HTTP " + r.status); }
      inp.value = ""; msg.textContent = "Sent."; msg.className = "gk-msg ok"; setTimeout(() => { if (msg.textContent === "Sent.") msg.textContent = ""; }, 2500); poll();
    } catch (err) { msg.textContent = "Not sent: " + err.message; msg.className = "gk-msg err"; }
    btn.disabled = false;
  });
}

const who = (x) => String(x || "").toLowerCase();
const whoCls = (x) => { const w = who(x); return w.includes("grok") ? "grok" : w.includes("alex") || w === "ceo" ? "alex" : w.includes("claude") || w.includes("aquarius") ? "claude" : w.includes("gpt") || w.includes("openai") ? "gpt" : w.includes("codex") ? "codex" : "other"; };

export function renderGrok(root0, s) {
  const root = root0.querySelector("#d-grok"); if (!root || !s) return; if (!wired) wire(root);
  const set = (id, html) => { if (cache.get(id) === html) return false; const e = root.querySelector("#" + id); if (e) { e.innerHTML = html; cache.set(id, html); } return true; };
  const H = helperStatus(s, "grok"), lanes = Array.isArray(s.lanes) ? s.lanes : [], ours = lanes.find((l) => l.helper === "aquarius") || (s.trades ? { n: s.trades.n, winRate: s.trades.winRate, expectancyPct: s.trades.expectancyPct, open: (s.positions || []).length } : null), lane = lanes.find((l) => l.helper === "grok") || null;
  const feed = [...(Array.isArray(s.xfeed) ? s.xfeed : []), ...(Array.isArray(s.marketFeed) ? s.marketFeed : []), ...(Array.isArray(s.helperFeed) ? s.helperFeed : [])].filter((m) => m && m.text && (!m.source || who(m.source) === "grok") && (!m.from || who(m.from) === "grok")).sort((a, b) => new Date(b.at) - new Date(a.at));
  const radars = feed.map((m) => ({ m, r: radarOf(m) })).filter((x) => x.r);
  root.dataset.st = H.st; set("g-badge", helperBadge(s, "grok"));

  // ---- radar history: one point per sweep, per narrative (posts/min), kept in localStorage
  for (const { m, r } of [...radars].reverse()) { const t = Date.parse(r.sweepAt || m.at); for (const x of r.rows) mark(rkey(x.name), t, x.perMin); }

  // ---- summary line
  const picksSent = lane ? [lane.n, lane.open, lane.rejected].filter(num).reduce((a, b) => a + b, 0) : null, oldest = feed.length ? feed[feed.length - 1].at : null, since = (s.helpers && (s.helpers.grokSince || s.helpers.grokFirstAt)) || null;
  const tile = (k, v, sub, c = "") => `<div><small>${k}</small><b class="${c}">${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
  set("g-sum", [
    tile("LINK", H.st === "off" ? "NOT CONNECTED" : "CONNECTED", H.st === "quiet" ? "quiet for over 20 min" : H.st === "on" ? "helper link is live" : "waiting for the helper link", "st-" + H.st),
    tile("LAST SEEN", H.lastAt ? ago(H.lastAt) + " ago" : D, H.lastAt ? esc(new Date(H.lastAt).toISOString().slice(11, 19)) + " UTC" : "never heard"),
    tile(since ? "CONNECTED SINCE" : "HEARD SINCE", since ? ago(since) + " ago" : oldest ? "≥ " + ago(oldest) : D, since ? "" : oldest ? "oldest post still in the feed" : "no posts in the feed"),
    tile("RADARS SENT", feed.length ? String(radars.length) : D, feed.length ? `of the last ${feed.length} posts` : "no posts in the feed"),
    tile("PICKS SENT", n0(picksSent), lane ? `${n0(lane.n)} closed · ${n0(lane.open)} open · ${n0(lane.rejected)} rejected` : "no picks yet"),
    tile("LANE vs OURS", `<span class="${cls(lane && lane.expectancyPct)}">${pct(lane && lane.expectancyPct, 2)}</span> <u>vs</u> <span class="${cls(ours && ours.expectancyPct)}">${pct(ours && ours.expectancyPct, 2)}</span>`, "expectancy per closed pick, after costs"),
  ].join(""));

  // ---- X RADAR
  const top = radars[0], prev = radars[1];
  if (top) { const R = top.r, pr = prev ? prev.r.rows : null;
    set("g-radar-s", `sweep ${R.sweepAt ? esc(R.sweepAt.slice(11, 19)) + " UTC · " + ago(R.sweepAt) + " ago" : D} · ${num(R.posts) ? R.posts.toLocaleString("en-US") + " posts read" : "posts —"} · ${radars.length} sweep${radars.length === 1 ? "" : "s"} in the feed`);
    set("g-n-radar", String(R.rows.length));
    set("g-radar", `<div class="gk-row hd"><span class="rk">#</span><span class="nm">NARRATIVE</span><span class="sp">TREND</span><span class="pa">POSTS / AUTHORS</span><span class="pm">PER MIN</span><span class="gw">GROWTH</span><span class="tk">TICKERS</span><span class="ca">CONTRACT</span><span class="cr">CRED</span><span class="sw">SWARM</span></div>` + R.rows.map((x) => {
      const parts = String(x.name).split(/\s+·\s+/), head = parts[0], sub = parts.slice(1).join(" · "), was = pr ? pr.find((y) => rkey(y.name) === rkey(x.name)) : null, mv = !pr ? "" : !was ? `<u class="new">NEW</u>` : was.rank > x.rank ? `<u class="up">▲${was.rank - x.rank}</u>` : was.rank < x.rank ? `<u class="dn">▼${x.rank - was.rank}</u>` : "";
      const sv = series(rkey(x.name)).slice(-16).map((p) => p[1]);
      return `<div class="gk-row"><span class="rk">${x.rank}</span><span class="nm"><b>${esc(head)}</b>${mv}${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="sp" title="posts per minute across the last ${sv.length} sweep(s)">${spark(sv)}</span>
        <span class="pa"><b>${n0(x.posts)}</b> / ${n0(x.authors)}<small> posts / authors</small></span><span class="pm"><b>${num(x.perMin) ? x.perMin.toFixed(3) : D}</b><small>/min${x.window ? " · " + esc(x.window) : ""}</small></span>
        <span class="gw ${cls(x.growth)}">${num(x.growth) ? (x.growth > 0 ? "+" : "") + x.growth.toFixed(2) : D}<small> growth</small></span>
        <span class="tk">${x.tickers.length ? x.tickers.slice(0, 2).map((k) => `<u>$${esc(k)}</u>`).join("") + (x.tickers.length > 2 ? `<u class="more" title="${esc(x.tickers.map((k) => "$" + k).join(" "))}">+${x.tickers.length - 2}</u>` : "") : `<em>${D}</em>`}</span>
        <span class="ca">${x.ca ? `<code title="${esc(x.ca)}">${esc(shortCa(x.ca))}</code><button type="button" data-copy="${esc(x.ca)}">COPY</button>` : `<em>no contract</em>`}</span>
        <span class="cr" title="credibility ${n0(x.cred)}"><i style="--w:${num(x.cred) ? Math.max(0, Math.min(100, x.cred * 100)).toFixed(0) : 0}%"></i><b>${num(x.cred) ? x.cred.toFixed(2) : D}</b><small> cred</small></span>
        <span class="sw ${num(x.swarm) && x.swarm >= 15 ? "warn" : ""}">${num(x.swarm) ? x.swarm + "%" : D}<small> swarm</small></span></div>`; }).join("")
      + `<p class="gk-note">${lbl(top.m.label || "CLAIMED")} leads, not proof. Growth and credibility are Grok's own numbers, shown as sent. Swarm = share of posts from coordinated accounts.</p>`);
  } else { const raw = feed.find((m) => /radar/i.test(m.text));
    set("g-radar-s", raw ? "radar text did not match the table pattern · shown as sent" : "no radar in the feed"); set("g-n-radar", "");
    set("g-radar", raw ? `<pre class="gk-raw">${esc(raw.text)}</pre><p class="gk-note">${lbl(raw.label)} ${ago(raw.at)} ago</p>` : `<div class="gk-0"><b>NO X RADAR YET</b><p>${H.st === "off" ? "Grok is not connected. His narrative radar lands here as a ranked table when he posts it." : "Grok is connected. His next X sweep lands here as a ranked table."}</p></div>`); }

  // ---- PICKS: his lane next to ours, and the pick list when the engine sends one
  { const helpersL = lanes.filter((l) => l.helper !== "aquarius"), row = (nm, c, o) => `<div class="gk-ln ${c}"><b>${esc(nm)}</b><span>${n0(o && o.n)}</span><span>${wr(o && o.winRate)}</span><span class="${cls(o && o.expectancyPct)}">${pct(o && o.expectancyPct, 2)}</span><span>${n0(o && o.open)}</span><span>${o && num(o.rejected) ? o.rejected : D}</span><span>${o && num(o.weight) ? "×" + o.weight : D}</span></div>`;
    const list = Array.isArray(s.lanePicks) ? s.lanePicks.filter((p) => !p.helper || p.helper === "grok") : lane && Array.isArray(lane.picks) ? lane.picks : null;
    const fromBrain = (s.brain || []).filter((b) => /^LANE:grok pick\b/i.test(b.text || ""));
    const dlt = lane && ours && num(lane.expectancyPct) && num(ours.expectancyPct) ? lane.expectancyPct - ours.expectancyPct : null;
    set("g-picks-s", lane ? `${n0(lane.n)} closed · ${n0(lane.open)} open` : "no picks yet"); set("g-n-picks", picksSent != null ? String(picksSent) : "");
    set("g-picks", `<div class="gk-vs"><div><small>GROK LANE</small><b class="${cls(lane && lane.expectancyPct)}">${pct(lane && lane.expectancyPct, 2)}</b><i>${lane ? `${n0(lane.n)} closed · win ${wr(lane.winRate)}` : "no closed picks"}</i></div><em>${dlt == null ? "vs" : dlt > 0 ? "ahead" : dlt < 0 ? "behind" : "level"}${dlt == null ? "" : `<u class="${cls(dlt)}">${pct(dlt, 2)}</u>`}</em><div><small>AQUARIUS</small><b class="${cls(ours && ours.expectancyPct)}">${pct(ours && ours.expectancyPct, 2)}</b><i>${ours ? `${n0(ours.n)} closed · win ${wr(ours.winRate)}` : D}</i></div></div>
      <div class="gk-ln hd"><b>LANE</b><span>N</span><span>WIN</span><span>EXP</span><span>OPEN</span><span>REJ</span><span>WT</span></div>${row("AQUARIUS", "us", ours)}${helpersL.map((l) => row(String(l.helper).toUpperCase(), l.helper === "grok" ? "gk" : "", l)).join("") || row("GROK", "gk", null)}
      ${lane && num(lane.n) && lane.n < 5 ? `<p class="gk-note">${lane.n} closed pick${lane.n === 1 ? "" : "s"}: too few to call. His evidence weight moves once the lane has 5.</p>` : ""}
      <div class="gk-sh">HIS PICKS</div>${list && list.length ? list.slice(0, 12).map((p) => `<div class="gk-pk"><b>${esc(p.symbol || D)}</b><u class="s-${esc(who(p.status))}">${esc(String(p.status || D).toUpperCase())}</u><span class="${cls(p.pnlPct)}">${pct(p.pnlPct, 2)}</span><small>${p.verdict ? "council " + esc(p.verdict) + (p.verdictReason ? " · " + esc(p.verdictReason) : "") + " · " : ""}${esc(p.outcome || "")}${p.thesis ? " · " + esc(p.thesis) : ""} · ${ago(p.closedAt || p.openedAt || p.createdAt || p.at)}</small></div>`).join("")
        : fromBrain.length ? fromBrain.slice(0, 8).map((b) => { const m = /pick\s+(\S+):\s*(.+?)\s+at\s+([+-]?[\d.]+)%/i.exec(b.text), c = /Council had said (\w+)(?:\s*\(([^)]*)\))?: the Council was (\w+)/i.exec(b.text);
            return m ? `<div class="gk-pk"><b>${esc(m[1])}</b><u class="s-closed">${esc(m[2].toUpperCase())}</u><span class="${cls(f(m[3]))}">${pct(f(m[3]), 2)}</span><small>${c ? `council said ${esc(c[1])}${c[2] ? " (" + esc(c[2]) + ")" : ""} · council was <i class="${/right/i.test(c[3]) ? "up" : "dn"}">${esc(c[3].toUpperCase())}</i> · ` : ""}${ago(b.at)} ago</small></div>` : `<div class="gk-pk"><small>${esc(b.text)} · ${ago(b.at)} ago</small></div>`; }).join("") + `<p class="gk-note">Closed picks as the review desk logged them in the brain. Open and rejected picks are not listed by the engine yet.</p>`
        : `<p class="gk-e">${lane ? "The engine sends the lane summary only; the pick list is not in the state yet." : "No picks yet. A pick shows here the moment Grok sends one."}</p>`}`); }

  // ---- WAR ROOM: chat thread (state.warroom), newest at the bottom
  { const wr0 = Array.isArray(s.warroom) ? s.warroom : s.warroom && Array.isArray(s.warroom.messages) ? s.warroom.messages : null, wrm = wr0 ? [...wr0].filter((m) => m && m.text).sort((a, b) => new Date(a.at) - new Date(b.at)) : null, th = root.querySelector("#g-room");
    set("g-room-s", wrm ? `${wrm.length} message${wrm.length === 1 ? "" : "s"}${wrm.length ? " · last " + ago(wrm[wrm.length - 1].at) + " ago" : ""}` : "not in the engine yet"); const unread = s.warroom && s.warroom.unread && num(s.warroom.unread.alex) ? s.warroom.unread.alex : 0; set("g-n-room", unread ? unread + " new" : wrm && wrm.length ? String(wrm.length) : ""); root.dataset.unread = unread ? "1" : "";
    const stick = th && th.scrollHeight - th.scrollTop - th.clientHeight < 40, key = wrm ? wrm.length + "|" + (wrm.length ? wrm[wrm.length - 1].at : "") : "x";
    set("g-room", wrm ? (wrm.length ? wrm.map((m) => { const c = whoCls(m.from); return `<div class="gk-b b-${c}"><small><b>${esc(String(m.from || D).toUpperCase())}</b> → ${esc(String(m.to || "all").toUpperCase())} · ${ago(m.at)}</small><p>${esc(m.text)}</p></div>`; }).join("") : `<div class="gk-0"><b>WAR ROOM IS OPEN</b><p>No messages yet. Write the first one below.</p></div>`)
      : `<div class="gk-0"><b>WAR ROOM OPENS WHEN THE ENGINE UPDATE LANDS</b><p>Grok in black, Claude in cyan, you in gold. Until the engine sends the thread, his messages are the evidence posts in POSTS.</p></div>`);
    if (th && (key !== lastRoomKey ? stick || !lastRoomKey : false)) th.scrollTop = th.scrollHeight; lastRoomKey = key;
    if (unread && wrm && wrm.length) markRead(root, String(wrm[wrm.length - 1].id ?? wrm[wrm.length - 1].at)); }

  // ---- COUNCIL SEAT + ALERTS
  { const seats = s.council && Array.isArray(s.council.seats) ? s.council.seats : null, me = seats ? seats.find((x) => who(x.helper) === "grok") : null, al = Array.isArray(s.alerts) ? s.alerts : null;
    const hit = me && num(me.right) && num(me.wrong) && me.right + me.wrong > 0 ? me.right / (me.right + me.wrong) : null;
    set("g-seat-s", me ? `${n0(me.votes)} vote${me.votes === 1 ? "" : "s"}${me.lastVoteAt ? " · last " + ago(me.lastVoteAt) + " ago" : ""}` : seats ? "no votes yet" : "not in the engine yet"); set("g-n-seat", al && al.length ? String(al.length) : "");
    set("g-seat", (me ? `<div class="gk-seatc"><div><small>VOTES</small><b>${n0(me.votes)}</b></div><div><small>RIGHT</small><b class="up">${n0(me.right)}</b></div><div><small>WRONG</small><b class="dn">${n0(me.wrong)}</b></div><div><small>WEIGHT</small><b>${num(me.weight) ? "×" + me.weight : D}</b></div></div>${num(me.effective) || num(me.laneWeight) ? `<p class="gk-e">seat ×${n0(me.weight)} · lane ×${n0(me.laneWeight)} · counts as ×${n0(me.effective)} in the council</p>` : ""}
        <div class="gk-hit"><i><s style="width:${hit == null ? 0 : (hit * 100).toFixed(0)}%"></s></i><small>${hit == null ? "no scored votes yet" : `${(hit * 100).toFixed(0)}% of scored votes right`} · last vote ${me.lastVoteAt ? ago(me.lastVoteAt) + " ago" : D}</small></div>`
        : `<p class="gk-e">${seats ? "No votes yet. Grok's seat fills in with his first council vote." : "No votes yet. The council seat appears with the engine update."}</p>`)
      + (seats && seats.filter((x) => x !== me).length ? `<div class="gk-sh">OTHER SEATS</div>` + seats.filter((x) => x !== me).map((x) => `<div class="gk-ln st"><b>${esc(String(x.helper || D).toUpperCase())}</b><span>${n0(x.votes)} votes</span><span class="up">${n0(x.right)}</span><span class="dn">${n0(x.wrong)}</span><span>${num(x.weight) ? "×" + x.weight : D}</span></div>`).join("") : "")
      + `<div class="gk-sh">ALERTS</div>` + (al ? (al.length ? `<div class="gk-scroll sm">${al.slice(0, 20).map((a) => { const o = typeof a === "string" ? { text: a } : a || {}, lv = String(o.kind || o.level || o.severity || o.type || "").toLowerCase(), by = o.helper || o.from || o.source, body = [o.note, o.text || o.message || o.title].filter(Boolean).join(" · "), cf = typeof o.confirmed === "boolean" ? o.confirmed : null;
          return `<div class="gk-al a-${esc(lv.replace(/[^a-z]/g, ""))} ${cf == null ? "" : cf ? "a-yes" : "a-no"}"><i></i><p>${lv ? `<u>${esc(lv.replace(/_/g, " ").toUpperCase())}</u> ` : ""}${o.symbol ? `<b>${esc(o.symbol)}</b> ` : ""}${esc(body || (o.symbol ? "" : D))}${num(o.price) ? ` <u>at $${esc(String(+o.price.toPrecision(5)))}</u>` : ""}${cf == null ? "" : `<em class="${cf ? "up" : ""}">${cf ? "CONFIRMED" : "NOT CONFIRMED"}</em>`}${o.result ? `<span>${esc(o.result)}</span>` : ""}</p><small>${by ? esc(String(by).toUpperCase()) + " · " : ""}${ago(o.at)}</small></div>`; }).join("")}</div>` : `<p class="gk-e">No alerts.</p>`) : `<p class="gk-e">Alerts appear with the engine update.</p>`)); }

  // ---- OPINIONS: his evidence posts, each with the label that says how far it can be trusted
  { const posts = feed.slice(0, 30);
    set("g-posts-s", posts.length ? `${posts.length} post${posts.length === 1 ? "" : "s"} · newest ${ago(posts[0].at)} ago` : "none yet"); set("g-n-posts", posts.length ? String(posts.length) : "");
    set("g-posts", posts.length ? posts.map((m) => { const r = radarOf(m), labels = Array.isArray(m.labels) && m.labels.length ? m.labels : [m.label];
      return `<div class="gk-post">${labels.map(lbl).join("")}<small>${m.section || m.dept ? esc(String(m.section || m.dept).replace(/_/g, " ").toUpperCase()) + " · " : ""}${num(m.weight) ? "weight ×" + m.weight + " · " : ""}${ago(m.at)} ago</small><p>${r ? `<b>X radar</b> · ${num(r.posts) ? r.posts.toLocaleString("en-US") + " posts read" : "posts —"} · top: ${r.rows.slice(0, 3).map((x) => esc(x.name)).join(", ")}` : esc(m.text)}</p></div>`; }).join("")
      : `<div class="gk-0"><b>NO POSTS YET</b><p>${H.st === "off" ? "Grok is not connected." : "Grok is connected and has not posted evidence yet."}</p></div>`); }
}
