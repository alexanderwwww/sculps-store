/*
 * The node side of the task panel (src/panel.js).
 *
 *   createHost({ build, getState, onMessage, log })
 *     -> { install(context), attach(page), layout(page), token }
 *
 * install(context): registers ONE binding, __ucAgent, on the context, THEN the
 * panel as an init script (so the panel finds the binding when it starts,
 * before any page script runs), then puts the panel on the pages already open.
 * attach(page): the panel on a page as it is now (one opened before install).
 *
 * The panel calls __ucAgent(token, json). The token is random per run and
 * lives only inside the panel's closure (panel.js reads it from the line in
 * front of it and deletes it at once), so a page script calling the binding
 * gets "bad token". Calls from a frame other than the page's main frame are
 * refused too. "poll" answers with getState(page) and remembers the rects of
 * the panel's controls the poll carried (layout(page)); every other message
 * type goes to onMessage(msg, page). Nothing here throws to the caller.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const PANEL = fs.readFileSync(new URL("../panel.js", import.meta.url), "utf8");
const TYPES = new Set(["file", "task", "control", "decide", "setKey"]);

export function createHost({ build, getState, onMessage, log = () => {} }) {
  const token = crypto.randomBytes(24).toString("hex");
  // Which run of ultracursor drew a panel: a copy left by an earlier run (old
  // token) retires itself when this one arrives.
  const hid = crypto.randomBytes(6).toString("hex");
  const source = `window.__ucPanelConfig = ${JSON.stringify({ token, hid, build: build === undefined || build === null ? "" : String(build) })};\n${PANEL}`;
  const installed = new WeakSet();
  const layouts = new WeakMap();
  let warned = 0;
  const warn = (line) => { if (warned++ < 20) log(line); };

  async function handler(source, tok, raw) {
    if (tok !== token) return { ok: false, error: "bad token" };
    let page = null, frame = null;
    try { page = source.page; frame = source.frame; } catch { /* gone */ }
    if (!page || !frame || frame !== page.mainFrame()) return { ok: false, error: "not from the page itself" };
    let msg = raw;
    if (typeof raw === "string") { try { msg = JSON.parse(raw); } catch { return { ok: false }; } }
    if (!msg || typeof msg !== "object") return { ok: false };
    if (msg.type === "poll") {
      // The rects, plus which card was on screen when they were measured.
      if (msg.layout && typeof msg.layout === "object") layouts.set(page, { ...msg.layout, shownCard: (msg.seen && msg.seen.card) || null });
      try { return await getState(page); }
      catch (e) { warn(`panel state failed: ${String(e && e.message || e).slice(0, 160)}`); return { ok: false, error: "state" }; }
    }
    if (!TYPES.has(msg.type)) return { ok: false };
    try {
      const r = await onMessage(msg, page);
      return r === undefined ? { ok: true } : r;
    } catch (e) {
      warn(`panel message ${msg.type} failed: ${String(e && e.message || e).slice(0, 160)}`);
      return { ok: false, error: "ultracursor could not do that" };
    }
  }

  async function attach(page) {
    try { if (page && !page.isClosed()) await page.evaluate(source); }
    catch { /* a page mid-navigation gets the panel from the init script */ }
  }

  async function install(context) {
    if (!context || installed.has(context)) return;
    installed.add(context);
    try { await context.exposeBinding("__ucAgent", handler); }
    catch (e) { warn(`panel binding could not be registered: ${String(e && e.message || e).slice(0, 160)}`); }
    try { await context.addInitScript({ content: source }); }
    catch (e) { warn(`panel could not be added to new pages: ${String(e && e.message || e).slice(0, 160)}`); }
    for (const p of context.pages()) await attach(p);
  }

  return { install, attach, layout: (page) => layouts.get(page) || null, token };
}
