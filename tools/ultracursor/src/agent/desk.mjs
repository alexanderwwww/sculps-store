/*
 * The desk: everything between Alex, the panel and the agent loop.
 *
 *   createDesk({ work, build, cloudLog, ui, pacingScale, baseURL, createHost })
 *     -> { install(context), enqueue(task), hasWork(), runNext(context), control(cmd),
 *          state(), busy(), onFinished(fn) }
 *
 * It keeps the queue (one task at a time), the cards (an approval, a wall, a
 * stuck step, the result), the API key, and the files Alex attached. The panel
 * polls state() through host.mjs and sends messages back; the agent loop asks
 * for decisions through ask(), which shows a card and waits for his click.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runTask } from "./agent.mjs";
import { createBrain } from "./brain.mjs";
import { loadProfiles } from "./profiles.mjs";
import { createLimits } from "./limits.mjs";
import { createActionLog } from "./log.mjs";
import { configPath, loadConfig, saveKey } from "./config.mjs";
import { traderOrb, setTraderMute } from "../trader/memory.mjs";

const MAX_FILE = 25 * 1024 * 1024;
const id = () => crypto.randomBytes(6).toString("hex");
const safeName = (n) => String(n || "file").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";

const RESULT_TITLE = {
  done: "Done", needs_alex: "Needs you", blocked: "Could not finish", stopped: "Stopped",
  limit: "Limit reached", error: "Problem",
};

export function createDesk({ work, build, cloudLog = () => {}, ui, pacingScale = 1, baseURL, createHost, trader = null }) {
  const cfgFile = configPath(work);
  const inbox = path.join(work, "inbox");
  const log = createActionLog(path.join(work, "logs"), cloudLog);
  const limits = createLimits(path.join(work, "agent-limits.json"));
  const profiles = () => loadProfiles(path.join(work, "profiles"), cloudLog);

  const S = {
    queue: [], current: null, page: null,
    status: "", step: null, usd: null,
    card: null, cardWaiter: null,
    paused: false, stopped: false,
    keyError: null,
  };
  const drafts = new Map(); // draft id -> {files: [], at}
  const finished = [];

  const hasKey = () => !!loadConfig(cfgFile).anthropicApiKey && !S.keyError;

  function state() {
    let mode = "idle";
    if (S.card) mode = "card";
    else if (S.current) mode = S.paused ? "paused" : "running";
    // build 6: no key prompt; tasks come from Claude through the link
    else if (S.queue.length) mode = "queued";
    return {
      build: String(build),
      hasKey: hasKey(),
      mode,
      status: S.current ? S.status : S.queue.length ? "Waiting for the current job to finish" : (S.keyError || ""),
      step: S.current && S.step ? S.step : null,
      usd: S.current && S.usd ? S.usd : null,
      task: S.current ? { id: S.current.id, text: S.current.text } : null,
      card: S.card ? { id: S.card.id, kind: S.card.kind, title: S.card.title, lines: S.card.lines, choices: S.card.choices } : null,
      // trader mode only: the memory orb and the "got paid" chime (null when the trader is off)
      trader: traderOrb(),
      // build 5: trader mode wanted (the panel pill shows on/off; the bar folds away so it covers nothing)
      traderMode: !!(trader && trader.want()),
    };
  }

  function showCard(card) {
    if (S.cardWaiter) S.cardWaiter("cleared");
    const c = { id: id(), ...card };
    S.card = c;
    return new Promise((resolve) => {
      S.cardWaiter = (choice) => {
        if (S.card && S.card.id === c.id) { S.card = null; S.cardWaiter = null; }
        resolve(choice);
      };
    });
  }
  const clearCard = () => { if (S.cardWaiter) S.cardWaiter("cleared"); S.card = null; S.cardWaiter = null; };

  async function onMessage(msg, page) {
    switch (msg && msg.type) {
      case "traderMute": return setTraderMute(msg.muted === true);
      case "traderMode": return trader ? trader.set(msg.on === true) : { ok: false, error: "the trader is not available" };
      case "setKey": {
        const err = saveKey(cfgFile, msg.key);
        if (err) return { ok: false, error: err };
        S.keyError = null;
        cloudLog("Claude API key saved on this Mac");
        return { ok: true };
      }
      case "file": {
        const draft = String(msg.draft || "");
        if (!/^[a-z0-9_-]{4,40}$/i.test(draft)) return { ok: false, error: "bad draft" };
        const mime = String(msg.mime || "");
        if (!/^image\//.test(mime)) return { ok: false, error: "Only photos can be attached." };
        let buf;
        try { buf = Buffer.from(String(msg.b64 || ""), "base64"); } catch { return { ok: false, error: "That file could not be read." }; }
        if (!buf.length || buf.length > MAX_FILE) return { ok: false, error: "That photo is empty or bigger than 25 MB." };
        const d = drafts.get(draft) || { files: [], at: Date.now() };
        if (d.files.length >= 12) return { ok: false, error: "12 photos at most per task." };
        let name = safeName(msg.name);
        while (d.files.some((f) => f.name === name)) name = name.replace(/(\.[^.]*)?$/, (m) => `-2${m || ""}`);
        const dir = path.join(inbox, draft);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name);
        fs.writeFileSync(file, buf);
        d.files.push({ name, path: file, mime, size: buf.length });
        drafts.set(draft, d);
        return { ok: true, name };
      }
      case "task": {
        const text = String(msg.text || "").trim();
        if (!text) return { ok: false, error: "Type what to do first." };
        if (text.length > 4000) return { ok: false, error: "That is too long for one task." };
        if (!hasKey()) return { ok: false, error: S.keyError || "Paste your Claude API key first." };
        const d = drafts.get(String(msg.draft || ""));
        drafts.delete(String(msg.draft || ""));
        const t = { id: id(), text, files: d ? d.files : [], page, source: "panel" };
        S.queue.push(t);
        cloudLog(`task queued from the panel: ${text.slice(0, 120)}`);
        return { ok: true, queued: S.queue.length + (S.current ? 1 : 0) };
      }
      case "control": {
        if (msg.cmd === "pause") S.paused = true;
        else if (msg.cmd === "resume") S.paused = false;
        else if (msg.cmd === "stop") { S.stopped = true; S.paused = false; if (S.card && S.card.kind !== "done" && S.cardWaiter) S.cardWaiter("stop"); }
        else return { ok: false };
        return { ok: true };
      }
      case "decide": {
        if (!S.card || S.card.id !== msg.card) return { ok: false, error: "That card is gone." };
        const allowed = S.card.choices.map((c) => c.id);
        if (!allowed.includes(msg.choice)) return { ok: false };
        S.cardWaiter && S.cardWaiter(msg.choice);
        if (S.card && S.card.id === msg.card) S.card = null;
        return { ok: true };
      }
      default:
        return { ok: false };
    }
  }

  // Pages whose panel has polled lately, so the test hook below can say where
  // each page's controls are. Nothing else uses this.
  const polled = new Set();
  const host = createHost({ build, getState: (page) => { if (page) polled.add(page); return state(); }, onMessage, log: cloudLog });

  // test/agent-e2e.mjs only: where the panel's controls are on each page, so
  // the test can press them with a real mouse like Alex does. Off unless the
  // test sets ULTRA_TEST_PANEL_FILE; nothing on his Mac sets it.
  if (process.env.ULTRA_TEST_PANEL_FILE) {
    const out = process.env.ULTRA_TEST_PANEL_FILE;
    const t = setInterval(() => {
      const pages = [];
      for (const p of polled) {
        let closed = true;
        try { closed = p.isClosed(); } catch { closed = true; }
        if (closed) { polled.delete(p); continue; }
        let url = "";
        try { url = p.url(); } catch { url = ""; }
        pages.push({ url, current: p === S.page, layout: host.layout(p) || null });
      }
      try { fs.writeFileSync(out + ".tmp", JSON.stringify({ state: state(), pages })); fs.renameSync(out + ".tmp", out); } catch { /* next tick */ }
    }, 250);
    if (t.unref) t.unref();
  }

  async function pickPage(context, task) {
    let p = task.page;
    try { if (p && !p.isClosed()) return p; } catch { /* closed */ }
    const pages = context.pages().filter((x) => { try { return !x.isClosed(); } catch { return false; } });
    if (pages.length) return pages[pages.length - 1];
    return context.newPage();
  }

  async function runNext(context) {
    const task = S.queue.shift();
    if (!task) return null;
    const cfg = loadConfig(cfgFile);
    if (S.card && S.card.kind === "done") clearCard(); // the last result gives way to the new task
    S.current = task; S.stopped = false; S.paused = false; S.status = "Starting"; S.step = null; S.usd = null;
    let result;
    try {
      if (!task.brain && !cfg.anthropicApiKey) throw new Error("Paste your Claude API key first.");
      let page = await pickPage(context, task);
      S.page = page;
      try { await page.bringToFront(); } catch { /* fine */ }
      if (ui && ui.attach) await ui.attach(context, page, build);
      await host.attach(page);
      // Claude in the chat (the link) or Claude through Alex's API key.
      const brain = task.brain || createBrain({ apiKey: cfg.anthropicApiKey, model: cfg.model, effort: cfg.effort, baseURL });
      result = await runTask({
        page,
        task,
        deps: {
          brain,
          profiles: profiles(),
          ui,
          log,
          limits,
          maxUsd: cfg.maxUsdPerTask,
          pacingScale,
          // trader mode: x6.47, except on a site whose profile keeps humanPace; GMGN's trade box is off limits while it trains
          speed: (profile) => (trader && trader.want() && !(profile && profile.humanPace) ? 6.47 : 1),
          trading: () => !!(trader && trader.want()),
          ask: (card) => showCard(card),
          onWall: (w) => showCard({
            kind: "wall",
            title: w.kind === "login" ? "Sign in to carry on" : "Solve the check to carry on",
            lines: [w.kind === "login" ? "Sign in yourself in this window. ultracursor carries on by itself when you are in." : "Do the check yourself. ultracursor carries on by itself when it is gone.", w.reason],
            choices: [{ id: "stop", label: "Stop" }],
          }),
          clearCard,
          control: {
            paused: () => S.paused,
            stopped: () => S.stopped,
            waitWhilePaused: async () => { while (S.paused && !S.stopped) await new Promise((r) => setTimeout(r, 200)); },
          },
          onProgress: (p) => { S.status = p.status; S.step = { n: p.step, max: p.max }; S.usd = { spent: Math.round(p.usd * 100) / 100, cap: p.cap }; },
          setPage: (p) => { S.page = p; host.attach(p).catch(() => {}); },
          onBadKey: () => { S.keyError = "The Claude API key was refused. Paste it again."; },
        },
      });
    } catch (e) {
      result = { status: "error", summary: String(e && e.message || e).slice(0, 200), steps: 0, usd: 0 };
      log({ task: task.id, kind: "error", text: result.summary });
    }
    if (ui && ui.setSpeed) ui.setSpeed(1);   // research sweeps keep the human hand
    if (task.brain && task.brain.close) { try { await task.brain.close(result.summary); } catch { /* the link is down */ } }
    S.current = null; S.status = ""; S.step = null; S.usd = null;
    // The photos were for this task only.
    if (task.files && task.files.length) {
      try { fs.rmSync(path.dirname(task.files[0].path), { recursive: true, force: true }); } catch { /* fine */ }
    }
    const lines = [result.summary];
    lines.push(`${result.steps} step${result.steps === 1 ? "" : "s"} · $${(result.usd || 0).toFixed(2)}`);
    showCard({ kind: "done", title: RESULT_TITLE[result.status] || "Finished", lines, choices: [{ id: "ok", label: "OK" }] }).catch(() => {});
    const out = { task: { id: task.id, text: task.text, source: task.source, huntId: task.huntId || null }, ...result };
    finished.push(out);
    for (const fn of listeners) { try { fn(out); } catch { /* listener's problem */ } }
    return out;
  }
  const listeners = [];

  return {
    host,
    install: async (context) => { await host.install(context); },
    enqueue: (task) => { S.queue.push({ id: task.id || id(), ...task }); },
    hasWork: () => S.queue.length > 0 && !S.current,
    busy: () => !!S.current,
    runNext,
    control: (cmd) => onMessage({ type: "control", cmd }),
    state,
    onFinished: (fn) => listeners.push(fn),
    finished,
    _onMessage: onMessage,
    _paths: { cfgFile, inbox },
  };
}
