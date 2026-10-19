/*
 * One task, start to finish: the loop between Claude and the page.
 *
 *   runTask({ page, task, deps }) -> { status, summary, steps, usd }
 *
 *   task: { id, text, files: [{name, path, mime}] }
 *   deps: {
 *     brain        { next({system, tools, messages}), model }
 *     profiles     loadProfiles(...) result
 *     ui           ui.mjs-shaped hands (hover, scroll, say, pause), plus the overlay pill
 *     log          action log writer (log.mjs)
 *     limits       createLimits(...)
 *     maxUsd       spend cap for this task
 *     ask(card)    show a card, resolve with the choice id ("approve"|"skip"|"stop"|"continue"|…)
 *     onWall(wall) show the wall card; resolves "stop" if Alex stops, else never (cleared is detected here)
 *     control      { paused(), stopped(), waitWhilePaused() }
 *     onProgress({status, step, max, usd})
 *     setPage(p)   the agent moved to another tab (a click opened one)
 *     pacingScale  1 on his Mac (the profile's pacing as written); the tests pass less
 *   }
 *
 * The history sent to Claude is append-only: each response is appended
 * exactly as it came back (thinking blocks included) and each round of tool
 * results is ONE user message. Nothing earlier is ever edited, so thinking
 * stays valid for the whole task and the prompt cache keeps hitting.
 *
 * Gates, in the order they apply to an action: stop / pause -> wall (sign-in,
 * captcha) -> limits -> secret fields -> approval for final actions -> the
 * action itself. Three failed actions in a row, or Claude failing after the
 * SDK's own retries, pause the task on a card with Continue / Stop.
 */
import { readFile } from "node:fs/promises";
import { TOOLS, ACTIONS, validate, resolve, describe, act, readText, screenshot, downscale, format } from "./tools.mjs";
import { observe, findLines, pageBlock } from "./snapshot.mjs";
import { clickKind, enterIsFinal, navigateKind, secretField, priceField, detectWall } from "./guard.mjs";
import { SYSTEM, costOf, explainError } from "./brain.mjs";
import { render } from "./profiles.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const rand = (a, b) => a + Math.random() * (b - a);
const clip = (s, n) => { const t = String(s ?? ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const host = (u) => { try { return new URL(u).host; } catch { return ""; } };

const KIND_TITLE = {
  publish: "Publish", send: "Send", buy: "Buy / pay", delete: "Delete", save: "Save changes",
  offer: "Answer an offer", submit: "Submit", price: "Change a price", other: "Final step",
};

export async function runTask({ page, task, deps }) {
  const started = Date.now();
  let profile = deps.profiles.forUrl(page.url());
  let usd = 0, steps = 0, errorsInRow = 0;
  const files = new Map((task.files || []).map((f) => [f.name, f]));
  let refs = new Map();            // ref -> {role, name}, from the latest page the model saw
  let typed = [];                  // fields typed since the last approval: {name, value, from}
  let lastApproved = null;         // {kind, step}: a confirm dialog right after an approved delete
  const log = (e) => deps.log({ task: task.id, ...e });
  const say = (text) => { try { deps.ui && deps.ui.say && deps.ui.say(page, text); } catch { /* the pill is a nicety */ } };
  const progress = (status) => deps.onProgress && deps.onProgress({ status, step: steps, max: profile.limits.stepsPerTask, usd, cap: deps.maxUsd });
  const end = (status, summary) => {
    log({ kind: "task", event: "end", status, summary, steps, usd: Math.round(usd * 10000) / 10000, seconds: Math.round((Date.now() - started) / 1000) });
    return { status, summary, steps, usd };
  };

  const blocked = deps.limits.startTask(profile);
  if (blocked) { log({ kind: "limit", text: blocked }); return end("limit", `Not started: ${blocked}.`); }
  log({ kind: "task", event: "start", text: task.text, files: [...files.keys()], url: page.url(), model: deps.brain.model });

  const view = async (full) => {
    const v = await observe(page, { full });
    refs = v.refs;
    return v;
  };
  const label = (ref) => {
    const r = refs.get(ref);
    return r ? `${r.role}${r.name ? ` "${clip(r.name, 60)}"` : ""}` : `element ${ref}`;
  };

  /* ---------------------------------------------------------- first message */
  const first = await view(false);
  const content = [{
    type: "text",
    text: [
      `Task: ${task.text}`,
      `Files: ${files.size ? [...files.keys()].join(", ") : "none"}`,
      "",
      render(profile),
      "",
      "Current page:",
      pageBlock(first),
    ].join("\n"),
  }];
  let shown = 0;
  for (const f of task.files || []) {
    if (shown >= 6 || !/^image\//.test(f.mime || "")) continue;
    let img = null;
    try { img = await downscale(page, await readFile(f.path), f.mime); } catch { img = null; }
    if (!img) { content.push({ type: "text", text: `Photo ${f.name} could not be shown to you (format not readable); do not describe it.` }); continue; }
    if (img) {
      content.push({ type: "text", text: `Photo ${shown + 1}: ${f.name}` });
      content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } });
      shown++;
    }
  }
  const messages = [{ role: "user", content }];

  /* ---------------------------------------------------------- gates */
  const checkWall = async () => {
    const w = await detectWall(page, profile);
    if (!w) return null;
    log({ kind: "wall", event: "paused", wall: w.kind, reason: w.reason });
    say(w.kind === "login" ? "Waiting for you to sign in" : "Waiting for you to solve the check");
    progress(w.kind === "login" ? "Waiting for you to sign in" : "Waiting for you to solve the check");
    const stopP = deps.onWall(w).then((c) => (c === "stop" ? "stop" : "again"));
    const t0 = Date.now();
    for (;;) {
      const r = await Promise.race([stopP, sleep(2000).then(() => "tick")]);
      if (r === "stop" || deps.control.stopped()) return { stop: true };
      const still = await detectWall(page, profile);
      if (!still) break;
      if (Date.now() - t0 > 30 * 60000) return { stop: true, timeout: true };
    }
    deps.clearCard && deps.clearCard();
    log({ kind: "wall", event: "cleared", wall: w.kind });
    profile = deps.profiles.forUrl(page.url());
    return { note: w.kind === "login" ? "A sign-in page was in the way; Alex signed in and the work continues from this page." : "A human check was in the way; Alex solved it and the work continues." };
  };

  const approve = async (kind, why, targetText, step) => {
    const lines = [
      `${targetText}`,
      `On: ${clip(host(page.url()) + (() => { try { return new URL(page.url()).pathname; } catch { return ""; } })(), 80)}`,
    ];
    if (why) lines.push(`Why: ${clip(why, 160)}`);
    for (const t of typed.slice(-6)) {
      lines.push(t.from && t.from !== t.value
        ? `${clip(t.name, 40)}: ${clip(t.from, 60)} → ${clip(t.value, 160)}`
        : `${clip(t.name, 40)}: ${clip(t.value, 160)}`);
    }
    const title = KIND_TITLE[kind] || KIND_TITLE.other;
    say(`Waiting for your OK: ${title}`);
    progress(`Waiting for your OK: ${title}`);
    const choice = await deps.ask({ kind: "approval", title: `Approve? ${title}`, lines, choices: [{ id: "approve", label: "Approve" }, { id: "skip", label: "Skip" }, { id: "stop", label: "Stop" }] });
    log({ kind: "approval", step, title, target: targetText, typed: typed.map((t) => ({ name: t.name, value: clip(t.value, 300) })), choice });
    return choice;
  };

  /* ---------------------------------------------------------- one tool call */
  // What happened, for the one action-log line every tool call gets (the loop writes it).
  let noted = {};
  const note = (o) => { noted = { ...noted, ...o }; };
  const runTool = async (tu, step) => {
    noted = {};
    // Alex closed the tab: carry on in the last open one.
    try { if (page.isClosed()) { const open = page.context().pages().filter((p) => !p.isClosed()); if (!open.length) return { stop: true, reason: "the tab was closed" }; page = open[open.length - 1]; deps.setPage && deps.setPage(page); } } catch { return { stop: true, reason: "the tab was closed" }; }
    const name = tu.name, input = tu.input || {};
    const bad = validate(name, input);
    if (bad) return { text: format({ ok: false, error: bad }), error: true };
    if (name === "finish") return { finish: { status: input.status, summary: String(input.summary || "").trim() } };

    if (deps.control.stopped()) return { stop: true };
    await deps.control.waitWhilePaused();
    if (deps.control.stopped()) return { stop: true };

    const notes = [];
    const w = await checkWall();
    if (w && w.stop) return { stop: true, reason: w.timeout ? "waited 30 minutes for the sign-in or check" : null };
    if (w && w.note) notes.push(w.note);

    if (input.why) { say(clip(input.why, 90)); progress(clip(input.why, 120)); }

    // Reading tools: no pacing, no gates.
    if (name === "look") { const v = await view(!!input.full); return { text: format({ ok: true, did: "read the page", notes }, v) }; }
    if (name === "find") {
      const v = await view(false);
      const lines = findLines(v.yaml, input.text, 40);
      return { text: `ok: true\ndid: searched the page for "${clip(input.text, 60)}"\nurl: ${v.url}\ntitle: ${v.title}\nmatches:\n${lines.length ? lines.join("\n") : "(nothing on the page mentions that)"}` };
    }
    if (name === "read_text") {
      const r = await readText(page, input.ref);
      return { text: r.ok ? `ok: true\ntext:\n${r.text}` : format(r), error: !r.ok };
    }
    if (name === "screenshot") {
      const r = await screenshot(page);
      if (!r.ok) return { text: format(r), error: true };
      return { blocks: [{ type: "text", text: `ok: true\nurl: ${page.url()}` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: r.b64 } }] };
    }
    if (name === "wait") { const r = await act.wait(page, input); return { text: format(r) }; }

    if (!ACTIONS.has(name)) return { text: format({ ok: false, error: `unknown tool ${name}` }), error: true };

    // Human pace between actions.
    const pc = profile.pacing || {};
    const k = deps.pacingScale ?? 1;   // 1 on his Mac; the tests run the same code faster
    await sleep(rand(pc.minMs ?? 900, pc.maxMs ?? 2600) * k);
    if (deps.control.stopped()) return { stop: true };

    // What is the target, and is this final?
    let target = null, info = null, kind = null, targetText = "";
    if (input.ref) {
      const r = await resolve(page, input.ref);
      if (r.error) { const v = await view(false); return { text: format({ ok: false, error: r.error }, v), error: true }; }
      info = await describe(r.loc);
      // The name the snapshot gave it; for an older ref, what the element itself says.
      const known = refs.get(input.ref);
      target = {
        role: (known && known.role) || (info && (info.role || info.tag)) || "",
        name: (known && known.name) || (info && (info.label || info.text)) || "",
        inConsent: !!(info && info.inConsent),
      };
      targetText = `${target.role || "element"} "${clip(target.name, 80)}"`;
    }
    if (name === "click") {
      kind = clickKind(target, input.final, profile);
      // The confirm button of a dialog right after an approved delete/publish of the same kind is the same decision.
      if (kind && lastApproved && lastApproved.kind === kind && step - lastApproved.step <= 2 && info && info.inDialog) kind = null;
      // Saving a form in which a price was typed is a price change; posting a new listing stays "publish".
      if (kind && typed.some((t) => t.price) && ["save", "submit", "other"].includes(kind)) kind = "price";
    } else if (name === "type") {
      const secret = secretField({ ...(info || {}), name: target && target.name });
      if (secret) {
        note({ target: targetText, ok: false, error: `refused: ${secret}` });
        return { text: format({ ok: false, error: `ultracursor never types into ${secret}. If a sign-in is needed, it pauses for Alex by itself; otherwise finish with needs_alex.` }), error: true };
      }
      // A line break in a one-line field submits its form, Shift or not: that is a submit too.
      const breaks = /\n/.test(String(input.text)) && info && !info.multiline;
      if ((input.enter || breaks) && enterIsFinal({ ...target, ...(info || {}) })) kind = typed.some((t) => t.price) ? "price" : "submit";
    } else if (name === "press") {
      if (["Enter", "Space"].includes(String(input.key))) {
        let focus = null;
        try {
          focus = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            return { role: el.getAttribute("role") || "", type: (el.getAttribute("type") || "").toLowerCase(), name: el.getAttribute("aria-label") || (el.tagName === "BUTTON" || el.tagName === "A" ? el.innerText.trim().slice(0, 80) : "") || el.getAttribute("name") || "", placeholder: el.getAttribute("placeholder") || "", multiline: el.tagName === "TEXTAREA" || el.isContentEditable, tag: el.tagName.toLowerCase() };
          });
        } catch { focus = null; }
        if (focus && (focus.tag === "button" || focus.tag === "a")) {
          kind = clickKind({ name: focus.name }, "none", profile) || null;
        } else if (enterIsFinal(focus)) kind = typed.some((t) => t.price) ? "price" : "submit";
        targetText = focus ? `Enter in ${focus.tag}${focus.name ? ` "${clip(focus.name, 60)}"` : ""}` : "Enter";
      }
    } else if (name === "navigate") {
      kind = navigateKind(input.url);
      targetText = `Open ${clip(input.url, 120)}`;
    } else if (name === "upload") {
      targetText = `${targetText} ← ${input.files.join(", ")}`;
    }

    if (kind) {
      const lim = deps.limits.finalAllowed(profile);
      if (lim) {
        log({ kind: "limit", text: lim });
        return { stop: true, reason: lim, limit: true };
      }
      const what = name === "click"
        ? `${target.role ? target.role[0].toUpperCase() + target.role.slice(1) : "Button"}: "${clip(target.name, 80)}"`
        : targetText;
      const choice = await approve(kind, input.why, what, step);
      if (choice === "stop") { note({ target: targetText, ok: false, error: "stopped by Alex at the approval", final: kind }); return { stop: true }; }
      if (choice !== "approve") {
        typed = typed.filter((t) => !t.price);
        note({ target: targetText, ok: false, error: "skipped by Alex", final: kind });
        const v = await view(false);
        return { text: format({ ok: false, error: "Alex skipped this action (not approved). Do not try it another way." }, v) };
      }
      deps.limits.countFinal(profile);
      lastApproved = { kind, step };
      typed = [];
      if (deps.control.stopped()) return { stop: true };
    }

    // The action.
    const before = new Set(page.context().pages());
    const fieldBefore = info && info.value !== undefined ? info.value : null;
    let r;
    try {
      r = await act[name](page, input, { ui: deps.ui, files, pacing: { typeMinMs: (pc.typeMinMs ?? 40) * k, typeMaxMs: (pc.typeMaxMs ?? 120) * k }, label });
    } catch (e) {
      r = { ok: false, error: `it failed: ${String(e && e.message || e).split("\n")[0].slice(0, 200)}` };
    }
    if (r.ok && name === "type" && !input.enter) {
      const fname = (target && target.name) || (info && (info.label || info.fieldName || info.placeholder)) || "field";
      typed = typed.filter((t) => t.name !== fname);
      typed.push({ name: fname, value: String(input.text), from: fieldBefore, price: priceField(fname, profile) });
    }
    // A click that opened a new tab: follow it, the way a person would.
    const opened = page.context().pages().filter((p) => !before.has(p));
    if (opened.length) {
      page = opened[opened.length - 1];
      try { await page.bringToFront(); await page.waitForLoadState("domcontentloaded", { timeout: 10000 }); } catch { /* keep going */ }
      deps.setPage && deps.setPage(page);
      notes.push("that opened a new tab; you are now on it");
    }
    const nextProfile = deps.profiles.forUrl(page.url());
    if (nextProfile.name !== profile.name) {
      profile = nextProfile;
      notes.push(`now on a different site; its profile:\n${render(profile)}`);
    }
    const v = await view(false);
    note({ target: targetText || null, ok: !!r.ok, error: r.error || null, how: r.how || null, url: v.url, final: kind || null });
    return { text: format({ ...r, notes: notes.concat(r.notes || []) }, v), error: !r.ok };
  };

  /* ---------------------------------------------------------- the loop */
  for (;;) {
    if (deps.control.stopped()) return end("stopped", "Stopped by Alex.");
    await deps.control.waitWhilePaused();
    if (deps.control.stopped()) return end("stopped", "Stopped by Alex.");
    if (steps >= profile.limits.stepsPerTask) {
      log({ kind: "limit", text: `${steps} steps` });
      return end("limit", `Stopped after ${steps} steps (the limit for one task). Nothing final was done without your OK.`);
    }
    progress(steps === 0 ? "Thinking" : "Thinking about the next step");
    let res;
    try {
      res = await deps.brain.next({ system: SYSTEM, tools: TOOLS, messages });
    } catch (e) {
      const why = explainError(e);
      log({ kind: "error", text: why.text });
      if (why.badKey && deps.onBadKey) deps.onBadKey();
      if (!why.retry) return end("error", why.text);
      const c = await deps.ask({ kind: "stuck", title: "Claude could not answer", lines: [why.text], choices: [{ id: "continue", label: "Try again" }, { id: "stop", label: "Stop" }] });
      if (c === "stop") return end("stopped", why.text);
      continue;
    }
    const spent = costOf(deps.brain.model, res.usage);
    usd += spent;
    log({ kind: "model", step: steps + 1, stop: res.stop_reason, usage: res.usage, usd: Math.round(spent * 10000) / 10000 });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") return end("blocked", "Claude declined this task.");
    if (res.stop_reason === "max_tokens") return end("error", "Claude's answer was cut off.");
    if (res.stop_reason === "pause_turn") continue;
    const uses = (res.content || []).filter((b) => b.type === "tool_use");
    if (!uses.length) {
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
      return end("done", text || "Finished.");
    }
    const results = [];
    let finish = null, stop = null;
    for (const tu of uses) {
      steps++;
      if (finish || stop) { results.push({ type: "tool_result", tool_use_id: tu.id, content: "not run: the task ended", is_error: true }); continue; }
      const out = await runTool(tu, steps);
      // Every tool call, reads and finishes included, gets exactly one line.
      const input = { ...(tu.input || {}) };
      delete input.why;
      log({
        kind: "action", step: steps, tool: tu.name, why: tu.input && tu.input.why ? String(tu.input.why).slice(0, 160) : undefined, input,
        target: noted.target || null,
        ok: noted.ok !== undefined ? noted.ok : !(out.error || out.stop),
        error: noted.error || (out.stop ? (out.reason || "stopped") : null),
        how: noted.how || null, final: noted.final || null, url: noted.url || (() => { try { return page.url(); } catch { return null; } })(),
        outcome: out.finish ? `finish ${out.finish.status}` : out.stop ? "stop" : undefined,
      });
      if (out.finish && uses.length > 1) { results.push({ type: "tool_result", tool_use_id: tu.id, content: "not run: call finish alone, after you have seen the results of your actions", is_error: true }); continue; }
      if (out.finish) { finish = out.finish; results.push({ type: "tool_result", tool_use_id: tu.id, content: "ok: true" }); continue; }
      if (out.stop) { stop = out; results.push({ type: "tool_result", tool_use_id: tu.id, content: "not run: stopped", is_error: true }); continue; }
      errorsInRow = out.error ? errorsInRow + 1 : 0;
      results.push(out.blocks
        ? { type: "tool_result", tool_use_id: tu.id, content: out.blocks }
        : { type: "tool_result", tool_use_id: tu.id, content: out.text, ...(out.error ? { is_error: true } : {}) });
    }
    if (finish) {
      const st = finish.status === "done" ? "done" : finish.status === "needs_alex" ? "needs_alex" : "blocked";
      return end(st, finish.summary || "Finished.");
    }
    if (stop) return end(stop.limit ? "limit" : "stopped", stop.reason ? `Stopped: ${stop.reason}.` : "Stopped by Alex.");
    if (usd >= deps.maxUsd) {
      log({ kind: "limit", text: `spend cap $${deps.maxUsd}` });
      return end("limit", `Stopped at the spend cap for one task ($${deps.maxUsd.toFixed(2)}). Nothing final was done without your OK.`);
    }
    if (errorsInRow >= 3) {
      const c = await deps.ask({ kind: "stuck", title: "Stuck", lines: ["Three steps in a row did not work.", clip(String(results[results.length - 1].content).split("\n").slice(0, 2).join(" "), 200)], choices: [{ id: "continue", label: "Keep trying" }, { id: "stop", label: "Stop" }] });
      if (c === "stop") { messages.push({ role: "user", content: results }); return end("stopped", "Stopped after three failed steps."); }
      errorsInRow = 0;
    }
    messages.push({ role: "user", content: results });
  }
}
