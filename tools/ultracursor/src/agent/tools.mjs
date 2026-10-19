/*
 * The agent's hands: the tools the model may call, and what each one does in
 * the page. Mechanics only. Whether an action may happen at all (approval,
 * passwords, walls, limits) is decided in agent.mjs with guard.mjs before any
 * of these run.
 *
 *   TOOLS                            the tool list sent to the API (never changes)
 *   resolve(page, ref)               a Locator for a ref, or {error} when it is stale
 *   describe(locator)                what the element is: tag, type, value, label …
 *   act.click/type/select/upload/press/scroll/navigate/wait   (page, input, env) -> {ok, did|error}
 *   settle(page)                     let a click's consequences arrive
 *   format(result, view)             the tool result text (SPEC "Tool result text")
 *
 * Every move goes through ui.mjs: a human path for the mouse, the wheel for
 * scrolling, so Alex sees the cursor do the work and the site gets trusted
 * input. Typing is one key at a time with the profile's per-character delay.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const rand = (a, b) => a + Math.random() * (b - a);
const errLine = (e) => String(e && e.message || e).split("\n")[0].slice(0, 200);

const WHY = { type: "string", description: "A few plain words saying what this step is for. Shown on Alex's screen." };
const REF = { type: "string", description: "The element's ref from the most recent page you were shown, e.g. e17 or f1e3." };

export const TOOLS = [
  {
    name: "look",
    description: "Read the current page again (accessibility snapshot with refs). Use after anything changed the page without a page block, or when unsure. full:true shows up to 40k characters instead of a compact view.",
    input_schema: { type: "object", properties: { full: { type: "boolean" } }, additionalProperties: false },
  },
  {
    name: "find",
    description: "Search the current page's snapshot for lines containing some text (case-insensitive). Cheaper than look. Returns up to 40 lines with refs.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
  },
  {
    name: "read_text",
    description: "The visible text of the whole page, or of one element (ref). Up to 6000 characters. For reading messages, descriptions, prices.",
    input_schema: { type: "object", properties: { ref: REF }, additionalProperties: false },
  },
  {
    name: "click",
    description: "Move the mouse to an element and click it. Set final to the kind of action when the click commits something (publish/post, send, buy/pay, delete, price change, other submit); otherwise none. Final actions wait for Alex's approval.",
    input_schema: {
      type: "object",
      properties: { ref: REF, why: WHY, final: { type: "string", enum: ["none", "publish", "send", "buy", "delete", "price", "other"] } },
      required: ["ref", "why", "final"], additionalProperties: false,
    },
  },
  {
    name: "type",
    description: "Click a text field and type into it, one key at a time. clear (default true) empties it first. enter:true presses Enter afterwards (outside a search box that submits, so it waits for approval).",
    input_schema: {
      type: "object",
      properties: { ref: REF, text: { type: "string" }, why: WHY, clear: { type: "boolean" }, enter: { type: "boolean" } },
      required: ["ref", "text", "why"], additionalProperties: false,
    },
  },
  {
    name: "select",
    description: "Choose an option in a native dropdown (a combobox that lists its options). For custom dropdowns, click to open them and click the option instead.",
    input_schema: { type: "object", properties: { ref: REF, option: { type: "string" }, why: WHY }, required: ["ref", "option", "why"], additionalProperties: false },
  },
  {
    name: "upload",
    description: "Give task files to an upload control: the ref of the button that opens the file picker, or of a file input. files are names from the task's Files list.",
    input_schema: {
      type: "object",
      properties: { ref: REF, files: { type: "array", items: { type: "string" }, minItems: 1 }, why: WHY },
      required: ["ref", "files", "why"], additionalProperties: false,
    },
  },
  {
    name: "press",
    description: "Press one key in whatever has focus: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, Space. Enter outside a search box waits for approval.",
    input_schema: { type: "object", properties: { key: { type: "string" }, why: WHY }, required: ["key", "why"], additionalProperties: false },
  },
  {
    name: "scroll",
    description: "Scroll the page with the mouse wheel.",
    input_schema: {
      type: "object",
      properties: { direction: { type: "string", enum: ["down", "up"] }, amount: { type: "string", enum: ["small", "page"] } },
      required: ["direction"], additionalProperties: false,
    },
  },
  {
    name: "navigate",
    description: "Go to a web address (http or https).",
    input_schema: { type: "object", properties: { url: { type: "string" }, why: WHY }, required: ["url", "why"], additionalProperties: false },
  },
  {
    name: "screenshot",
    description: "A picture of what is on screen now. Only when you must check something visual (photos in place, layout); the snapshot is cheaper.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "wait",
    description: "Wait 1-10 seconds for the page to finish something (an upload, a slow load).",
    input_schema: { type: "object", properties: { seconds: { type: "number", minimum: 1, maximum: 10 } }, required: ["seconds"], additionalProperties: false },
  },
  {
    name: "finish",
    description: "End the task. done: it is finished. blocked: it cannot be done (say why). needs_alex: something only Alex can answer (ask the exact question). summary: 1-3 short sentences for Alex.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["done", "blocked", "needs_alex"] }, summary: { type: "string" } },
      required: ["status", "summary"], additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));
export const ACTIONS = new Set(["click", "type", "select", "upload", "press", "scroll", "navigate"]);
const KEYS = new Set(["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space"]);

/** Check the model's input against the tool's own schema: required fields, types, enums. */
export function validate(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return `there is no tool called ${name}`;
  if (!input || typeof input !== "object" || Array.isArray(input)) return "the input must be an object";
  const s = tool.input_schema;
  for (const k of s.required || []) if (input[k] === undefined || input[k] === null || input[k] === "") return `${k} is required`;
  for (const [k, v] of Object.entries(input)) {
    const p = s.properties[k];
    if (!p) return `unknown field ${k}`;
    if (p.type === "string" && typeof v !== "string") return `${k} must be text`;
    if (p.type === "boolean" && typeof v !== "boolean") return `${k} must be true or false`;
    if (p.type === "number" && (typeof v !== "number" || !isFinite(v))) return `${k} must be a number`;
    if (p.type === "array" && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) return `${k} must be a list of names`;
    if (p.enum && !p.enum.includes(v)) return `${k} must be one of ${p.enum.join(", ")}`;
  }
  if (input.ref !== undefined && !/^[a-z]?[0-9]*[a-z]?[0-9]+$/i.test(String(input.ref))) return `ref ${input.ref} is not a ref (refs look like e17)`;
  return null;
}

/** A Locator for a ref from the latest snapshot; a ref the page no longer has is refused, never guessed. */
export async function resolve(page, ref) {
  const r = String(ref || "").trim();
  if (!/^[a-z0-9]+$/i.test(r)) return { error: `"${r}" is not a ref` };
  const loc = page.locator(`aria-ref=${r}`);
  let n = 0;
  try { n = await loc.count(); } catch { n = 0; }
  if (n === 0) return { error: `ref ${r} is not on the page any more (the page changed): look again and use a fresh ref` };
  return { loc: loc.first() };
}

/** What kind of element this is, read from the element itself. */
export async function describe(loc) {
  try {
    return await loc.evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      const editable = el.isContentEditable;
      const label = el.getAttribute("aria-label") || (el.labels && el.labels[0] ? el.labels[0].innerText : "") || "";
      let value = null;
      if (type !== "password") {
        if (tag === "input" || tag === "textarea") value = el.value;
        else if (tag === "select") value = el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : el.value;
        else if (editable) value = el.innerText;
      }
      return {
        tag, type, editable,
        role: el.getAttribute("role") || "",
        autocomplete: el.getAttribute("autocomplete") || "",
        fieldName: el.getAttribute("name") || "",
        id: el.id || "",
        placeholder: el.getAttribute("placeholder") || "",
        label: String(label).trim().slice(0, 120),
        text: type === "password" ? "" : String(el.innerText || el.value || "").trim().replace(/\s+/g, " ").slice(0, 80),
        value: value === null ? null : String(value).slice(0, 400),
        multiline: tag === "textarea" || editable,
        isFile: tag === "input" && type === "file",
        isSelect: tag === "select",
        inDialog: !!el.closest('[role="dialog"],[role="alertdialog"],dialog'),
      };
    }, undefined, { timeout: 5000 });
  } catch {
    return null;
  }
}

/** Wait for whatever a click or a key started: a navigation, a request, a re-render. */
export async function settle(page) {
  await sleep(350);
  try { await page.waitForLoadState("domcontentloaded", { timeout: 6000 }); } catch { /* still going is fine */ }
  try { await page.waitForLoadState("networkidle", { timeout: 2500 }); } catch { /* busy sites never go idle */ }
}

async function covered(loc, at) {
  // Is the element (or something inside it) what the mouse is over? A banner or
  // dialog on top would take the click instead.
  try {
    return await loc.evaluate((el, p) => {
      if (window.top !== window) return false; // inside a frame: coordinates differ, trust the move
      const hit = document.elementFromPoint(p.x, p.y);
      if (!hit) return false;
      if (hit === el || el.contains(hit)) return false;
      // Styled controls: a visually hidden input under its own label or a
      // decorative sibling. Those take the click for the element; fine.
      if (el.labels && Array.from(el.labels).some((l) => l.contains(hit))) return false;
      const lab = hit.closest("label");
      if (lab && lab.contains(el)) return false;
      if (el.parentElement && el.parentElement.contains(hit) && !hit.closest('[role="dialog"],dialog')) return false;
      return true;
    }, at, { timeout: 3000 });
  } catch { return false; }
}

async function humanClick(page, loc, ui) {
  const at = ui && ui.hover ? await ui.hover(page, loc) : null;
  if (at) {
    if (await covered(loc, at)) return { ok: false, error: "something else is on top of it (a banner, menu or dialog): look again and deal with that first" };
    await sleep(rand(90, 240));
    await page.mouse.down();
    await sleep(rand(45, 120));
    await page.mouse.up();
    return { ok: true, how: "mouse" };
  }
  // No box to aim at (zero-size or off-screen in a scroller): Playwright's own click.
  try { await loc.click({ timeout: 8000 }); return { ok: true, how: "playwright" }; }
  catch (e) { return { ok: false, error: `could not click it: ${errLine(e)}` }; }
}

async function typeHuman(page, text, pacing) {
  const long = text.length > 300;
  const a = long ? 15 : pacing.typeMinMs, b = long ? 40 : pacing.typeMaxMs;
  for (const ch of text) {
    // Shift+Enter is a new line in a chat box where Enter alone would send.
    if (ch === "\n") await page.keyboard.press("Shift+Enter");
    else await page.keyboard.type(ch);
    await sleep(rand(a, b));
  }
}

export const act = {
  async click(page, input, env) {
    const r = await resolve(page, input.ref);
    if (r.error) return { ok: false, error: r.error };
    const c = await humanClick(page, r.loc, env.ui);
    if (!c.ok) return c;
    await settle(page);
    return { ok: true, did: `clicked ${env.label(input.ref)}`, how: c.how };
  },

  async type(page, input, env) {
    const r = await resolve(page, input.ref);
    if (r.error) return { ok: false, error: r.error };
    const c = await humanClick(page, r.loc, env.ui);
    if (!c.ok) return c;
    await sleep(rand(120, 300));
    if (input.clear !== false) {
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
    }
    await typeHuman(page, String(input.text), env.pacing);
    let did = `typed into ${env.label(input.ref)}`;
    if (input.enter) {
      await sleep(rand(200, 500));
      await page.keyboard.press("Enter");
      did += " and pressed Enter";
    }
    await settle(page);
    // Read back what the field now holds: a field that reformats or refuses input says so here.
    const d = await describe(r.loc);
    if (d && d.value !== null && !input.enter) did += ` (it now reads: ${JSON.stringify(String(d.value).slice(0, 160))})`;
    return { ok: true, did };
  },

  async select(page, input, env) {
    const r = await resolve(page, input.ref);
    if (r.error) return { ok: false, error: r.error };
    if (env.ui && env.ui.hover) await env.ui.hover(page, r.loc);
    try { await r.loc.selectOption({ label: input.option }, { timeout: 5000 }); }
    catch {
      try { await r.loc.selectOption(input.option, { timeout: 5000 }); }
      catch (e) { return { ok: false, error: `could not choose "${input.option}": ${errLine(e)} (if this is a custom dropdown, click it and click the option)` }; }
    }
    await settle(page);
    return { ok: true, did: `chose "${input.option}" in ${env.label(input.ref)}` };
  },

  async upload(page, input, env) {
    const names = input.files.map(String);
    const missing = names.filter((n) => !env.files.has(n));
    if (missing.length) return { ok: false, error: `not in the task's files: ${missing.join(", ")} (files: ${[...env.files.keys()].join(", ") || "none"})` };
    const paths = names.map((n) => env.files.get(n).path);
    const r = await resolve(page, input.ref);
    if (r.error) return { ok: false, error: r.error };
    const d = await describe(r.loc);
    if (d && d.isFile) {
      try { await r.loc.setInputFiles(paths, { timeout: 10000 }); }
      catch (e) { return { ok: false, error: `the file input refused the files: ${errLine(e)}` }; }
      await settle(page);
      return { ok: true, did: `gave ${names.length} file(s) to ${env.label(input.ref)}`, how: "file input" };
    }
    // A button that opens the picker: catch the picker and hand it the files.
    const chooser = page.waitForEvent("filechooser", { timeout: 6000 }).catch(() => null);
    const c = await humanClick(page, r.loc, env.ui);
    if (!c.ok) { await chooser; return c; }
    const fc = await chooser;
    if (fc) {
      try { await fc.setFiles(paths, { timeout: 10000 }); }
      catch (e) { return { ok: false, error: `the file picker refused the files: ${errLine(e)}` }; }
      await settle(page);
      return { ok: true, did: `picked ${names.length} file(s) through ${env.label(input.ref)}`, how: "file chooser" };
    }
    // The button did not open a picker: give them to the page's file input
    // (a plain HTML file input, the one generic thing every upload has).
    try {
      const inputs = page.locator('input[type="file"]');
      if ((await inputs.count()) === 0) return { ok: false, error: "no file picker opened and the page has no file input: look again for the real upload control" };
      await inputs.first().setInputFiles(paths, { timeout: 10000 });
      await settle(page);
      return { ok: true, did: `gave ${names.length} file(s) to the page's file input`, how: "fallback file input" };
    } catch (e) {
      return { ok: false, error: `could not hand over the files: ${errLine(e)}` };
    }
  },

  async press(page, input) {
    const key = String(input.key).trim();
    if (!KEYS.has(key)) return { ok: false, error: `press takes one of: ${[...KEYS].join(", ")}` };
    await page.keyboard.press(key === "Space" ? " " : key);
    await settle(page);
    return { ok: true, did: `pressed ${key}` };
  },

  async scroll(page, input, env) {
    const vh = await page.evaluate(() => window.innerHeight).catch(() => 800);
    const px = (input.amount === "small" ? 0.35 : 0.85) * vh * (input.direction === "up" ? -1 : 1);
    if (env.ui && env.ui.scroll) await env.ui.scroll(page, px);
    else await page.mouse.wheel(0, px);
    await sleep(300);
    return { ok: true, did: `scrolled ${input.direction}` };
  },

  async navigate(page, input) {
    let u;
    try { u = new URL(String(input.url)); } catch { return { ok: false, error: "that is not a web address" }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: "only http and https addresses" };
    try { await page.goto(u.href, { waitUntil: "domcontentloaded", timeout: 45000 }); }
    catch (e) { return { ok: false, error: `the page did not load: ${errLine(e)}` }; }
    await settle(page);
    return { ok: true, did: `opened ${u.host}${u.pathname}` };
  },

  async wait(page, input) {
    const s = Math.max(1, Math.min(10, Number(input.seconds) || 1));
    await sleep(s * 1000);
    return { ok: true, did: `waited ${s} s` };
  },
};

export async function readText(page, ref) {
  try {
    if (ref) {
      const r = await resolve(page, ref);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, text: String(await r.loc.innerText({ timeout: 5000 })).slice(0, 6000) };
    }
    return { ok: true, text: String(await page.evaluate(() => (document.body ? document.body.innerText : ""))).slice(0, 6000) };
  } catch (e) {
    return { ok: false, error: `could not read it: ${errLine(e)}` };
  }
}

export async function screenshot(page) {
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 60, scale: "css", timeout: 15000 });
    return { ok: true, b64: buf.toString("base64") };
  } catch (e) {
    return { ok: false, error: `no screenshot: ${errLine(e)}` };
  }
}

/**
 * A photo made small enough for the model (longest side <= 1024, JPEG), using
 * Chrome itself: no image library to install on his Mac.
 */
export async function downscale(page, buf, mime, max = 1024) {
  try {
    const b64 = await page.evaluate(async ({ data, type, max }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type }));
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const cv = new OffscreenCanvas(w, h);
      cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
      const out = await cv.convertToBlob({ type: "image/jpeg", quality: 0.82 });
      const arr = new Uint8Array(await out.arrayBuffer());
      let s = "";
      for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
      return btoa(s);
    }, { data: Buffer.from(buf).toString("base64"), type: mime || "image/jpeg", max });
    return b64 ? { b64, mime: "image/jpeg" } : null;
  } catch {
    return null;
  }
}

/** The tool result text (SPEC "Tool result text"). */
export function format(result, view) {
  const head = result.ok ? `ok: true\ndid: ${result.did || "done"}` : `ok: false\nerror: ${result.error || "it did not work"}`;
  const notes = (result.notes || []).map((n) => `note: ${n}`).join("\n");
  const tail = view ? `\nurl: ${view.url}\ntitle: ${view.title}\npage:\n${view.text}` : "";
  return head + (notes ? `\n${notes}` : "") + tail;
}
