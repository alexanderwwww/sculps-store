/*
 * Claude drives ultracursor through the link (link/worker.mjs), the way Magic
 * Wand is driven: no API key, Claude in the chat is the brain.
 *
 *   createLink({ base, log, inbox, build, fetchFn })
 *     -> { take(), heartbeat(info), brain(firstCmd) }
 *
 * brain(firstCmd) is shaped like brain.mjs's brain, so the SAME agent loop
 * (runTask: approval cards, walls, secret fields, pacing, the action log)
 * runs Claude's commands: next() hands the loop one command as a tool_use,
 * and on the following call posts the loop's tool_result back as the answer.
 * A session ends with "done", after 10 idle minutes, or when Alex stops it.
 */
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const DEFAULT_LINK = "https://ultra-link.gardenbuddystore.workers.dev/uL7kQ2vN9xR4tB8mW3zY6pD1sF5hJ0cA";
const IDLE_MS = 10 * 60000;

export function createLink({ base = DEFAULT_LINK, log = () => {}, inbox, fetchFn = fetch } = {}) {
  const root = String(base).replace(/\/+$/, "");
  const call = async (method, what, body) => {
    try {
      const r = await fetchFn(`${root}/${what}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) return undefined;
      return await r.json();
    } catch { return undefined; }
  };
  const take = () => call("GET", "next");
  const answer = (id, text, image) => call("POST", "result", { id, text, image });
  const heartbeat = (info) => call("POST", "status", info);

  /** Photos Claude passes as URLs become files the upload tool can hand over. */
  async function fetchFiles(task, urls) {
    const names = [];
    const dir = path.join(inbox, `link-${task.id}`);
    for (const u of urls.slice(0, 12)) {
      if (!/^https?:\/\//i.test(u)) { names.push(u); continue; }
      try {
        const r = await fetchFn(u);
        const mime = String(r.headers.get("content-type") || "").split(";")[0];
        if (!r.ok || !/^image\//.test(mime)) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        fs.mkdirSync(dir, { recursive: true });
        let name = (decodeURIComponent(new URL(u).pathname.split("/").pop() || "") || `photo-${names.length + 1}`).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
        if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += mime === "image/png" ? ".png" : ".jpg";
        while (task.files.some((f) => f.name === name)) name = `1-${name}`;
        const file = path.join(dir, name);
        fs.writeFileSync(file, buf);
        task.files.push({ name, path: file, mime, size: buf.length });
        names.push(name);
      } catch (e) { log(`link photo not fetched: ${u.slice(0, 100)}`); }
    }
    return names;
  }

  function brain(firstCmd, task) {
    let pending = null;     // the command whose answer the loop is producing
    let queued = firstCmd;
    let n = 0;
    const toUse = async (cmd) => {
      const input = { ...(cmd.input || {}) };
      let name = cmd.action;
      if (name === "done") return { name: "finish", input: { status: "done", summary: String(input.summary || "Done.") } };
      if (name === "upload" && Array.isArray(input.files)) input.files = await fetchFiles(task, input.files.map(String));
      // The loop wants these; Claude may leave them out.
      if (["click", "type", "select", "upload", "press", "navigate"].includes(name) && !input.why) input.why = name;
      if (name === "click" && !input.final) input.final = "none";
      if (name === "wait" && !input.seconds) input.seconds = 2;
      for (const k of Object.keys(input)) if (input[k] === undefined || input[k] === null) delete input[k];
      return { name, input };
    };
    return {
      model: "claude-via-link",
      async next({ messages }) {
        // Answer the previous command with what the loop made of it.
        if (pending) {
          const last = messages[messages.length - 1];
          const res = last && Array.isArray(last.content) ? last.content.find((b) => b.type === "tool_result") : null;
          let text = "", image = null;
          const c = res ? res.content : "";
          if (typeof c === "string") text = c;
          else if (Array.isArray(c)) for (const b of c) { if (b.type === "text") text += b.text; if (b.type === "image") image = b.source && b.source.data; }
          await answer(pending.id, text, image);
          pending = null;
        } else if (n === 0) {
          // nothing to answer yet
        }
        let cmd = queued;
        queued = null;
        const t0 = Date.now();
        while (!cmd) {
          if (Date.now() - t0 > IDLE_MS) return { content: [{ type: "tool_use", id: `link_idle_${n}`, name: "finish", input: { status: "done", summary: "Claude's session ended (10 minutes without a command)." } }], stop_reason: "tool_use", usage: {} };
          await sleep(1000);
          cmd = await take();
        }
        pending = cmd;
        n++;
        const u = await toUse(cmd);
        return { content: [{ type: "tool_use", id: `link_${n}_${cmd.id}`, name: u.name, input: u.input }], stop_reason: "tool_use", usage: {} };
      },
      /** The session ended (done, stop, limit): the command in flight still gets an answer. */
      async close(summary) { if (pending) { await answer(pending.id, `The session ended: ${summary}`); pending = null; } },
    };
  }

  return { take, heartbeat, brain, answer };
}
