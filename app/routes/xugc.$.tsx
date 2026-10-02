/**
 * XUGC's back end: a status board, an inbox of orders, and an MCP server, all on one secret path.
 *
 * Same shape as the Magic Wand's, with one deliberate difference: there is NO way in here to change
 * the app's code, its spending limits or its keys. Claude can ask XUGC to make a video, stop one,
 * write or switch a Style Bible file, and share a finished video for review. Every video still goes
 * through the app's own money rules (per-video cap, daily cap, one GPU job at a time), which a remote
 * caller cannot touch.
 *
 *   GET  /xugc/<key>/status      what the app is doing (and when Claude last called)
 *   POST /xugc/<key>/status      the app saying so
 *   GET  /xugc/<key>/orders      the app asking what it has been told
 *   POST /xugc/<key>/orders      the app acknowledging orders and reporting their results
 *   POST /xugc/<key>/take        the app sending up a finished video for Claude to look at
 *   GET  /xugc/<key>/file/<name> a shared video
 *   POST /xugc/<key>/mcp         the tools below, for claude.ai
 */
import type { Route } from "./+types/xugc.$";

/** Rotating this disconnects every client at once, which is the point. */
const KEY = "dc38a4e4a6a658a15bf83def99875381166d00015767c80f";
const FILES = { status: "xugc-status.json", orders: "xugc-orders.json", results: "xugc-results.json", seen: "xugc-seen.json" } as const;
type Slot = keyof typeof FILES;
const TAKES = "xugc-takes/";
const MD_NAME = /^[a-z0-9][a-z0-9-]{0,38}\.md$/;
const SECONDS = [5, 10, 15, 20];
const QUALITIES = ["draft", "hd", "full"];
const LOOKS = ["None", "Selfie", "Unboxing", "Demo", "Testimonial"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "cache-control": "no-store",
    },
  });

async function read<T>(env: Env, slot: Slot, fallback: T): Promise<T> {
  const obj = await env.MEDIA?.get(FILES[slot]);
  if (!obj) return fallback;
  try { return JSON.parse(await obj.text()) as T; } catch { return fallback; }
}
async function write(env: Env, slot: Slot, value: unknown) {
  await env.MEDIA?.put(FILES[slot], JSON.stringify(value), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
}

type Order = { id: string; type: string; at: number; [k: string]: unknown };

/** Why an order cannot be stored, or the clean order. Every order is validated here AND again in the app. */
function cleanOrder(type: string, a: Record<string, unknown>): { error: string } | { order: Omit<Order, "id" | "at"> } {
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  if (type === "generate") {
    const seconds = Number(a.seconds ?? 15);
    const quality = str(a.quality ?? "hd", 10);
    if (!SECONDS.includes(seconds)) return { error: "seconds must be 5, 10, 15 or 20" };
    if (!QUALITIES.includes(quality)) return { error: "quality must be draft, hd or full" };
    const scene = str(a.scene, 1500);
    const prompt = str(a.prompt, 6000);
    if (scene.length < 10 && prompt.length < 20) return { error: "give a scene (what happens) or a full prompt" };
    const look = str(a.look, 20);
    if (look && !LOOKS.includes(look)) return { error: "look must be one of: " + LOOKS.join(", ") };
    const productUrl = str(a.productUrl, 500);
    if (productUrl && !/^https?:\/\//i.test(productUrl)) return { error: "productUrl must be an http(s) link" };
    const refs: unknown = a.refs === "auto" ? "auto" : Array.isArray(a.refs)
      ? a.refs.slice(0, 3).map((x: unknown) => {
          if (typeof x === "string") return str(x, 500);
          const o = (x ?? {}) as Record<string, unknown>;
          return { url: str(o.url, 500), at: o.at === undefined ? undefined : Math.min(1, Math.max(0, Number(o.at))), strength: o.strength === undefined ? undefined : Math.min(1, Math.max(0.1, Number(o.strength))) };
        }).filter((x: any) => /^https?:\/\//i.test(typeof x === "string" ? x : x.url))
      : [];
    const captions = Array.isArray(a.captions) ? a.captions.map((x) => str(x, 200)).filter((x) => /^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*\|/.test(x)).slice(0, 8) : undefined;
    const music = ["none", "soft", "drop"].includes(str(a.music, 10)) ? str(a.music, 10) : "";
    return { order: { type, scene, prompt, seconds, quality, engine: ["seedance","kling","fal_veo","fal_wan","veo","ltx","ltx_full","hunyuan","wan"].includes(str(a.engine, 12)) ? str(a.engine, 12) : undefined, res: ["480p","720p"].includes(str(a.res, 6)) ? str(a.res, 6) : undefined, preset: ["review","product-only","unboxing","try-on","tutorial","breaking-news-start","demo-in-motion","before-after"].includes(str(a.preset, 24)) ? str(a.preset, 24) : undefined, tier: ["lite","fast"].includes(str(a.tier, 8)) ? str(a.tier, 8) : undefined, look, refs, music, captions, avatar: str(a.avatar, 20), avatarText: str(a.avatarText, 400), productUrl } };
  }
  if (type === "reference_set") {
    const beats = String(a.beats ?? "").trim().slice(0, 3000);
    const level = a.level === undefined ? undefined : Number(a.level);
    if (level !== undefined && !(Number.isInteger(level) && level >= 0 && level <= 3)) return { error: "level must be 0 (off), 1 (mood only), 2 (same story) or 3 (same shots and timing)" };
    if (!beats && level === undefined) return { error: "give beats (what happens in the reference, shot by shot) and/or a level" };
    return { order: { type, beats, level } };
  }
  if (type === "cancel") return { order: { type } };
  if (type === "style_write") {
    const name = str(a.name, 40), content = String(a.content ?? "");
    if (!MD_NAME.test(name)) return { error: "name must be lowercase letters, numbers and dashes, ending in .md" };
    if (!content.trim() || content.length > 20000) return { error: "content must have text and be under 20,000 characters" };
    return { order: { type, name, content } };
  }
  if (type === "style_delete" || type === "style_toggle") {
    const name = str(a.name, 40);
    if (!MD_NAME.test(name)) return { error: "bad file name" };
    return { order: { type, name, on: a.on !== false } };
  }
  if (type === "share") {
    const id = str(a.id, 40);
    if (!/^take-\d+$/.test(id)) return { error: "id must look like take-1234567890" };
    return { order: { type, takeId: id } };
  }
  return { error: "not an order: " + type };
}

async function send(env: Env, type: string, args: Record<string, unknown>) {
  const c = cleanOrder(type, args);
  if ("error" in c) return { ok: false, error: c.error };
  const id = `o${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const orders = (await read<Order[]>(env, "orders", [])).filter((o) => Date.now() - o.at < 3600_000);
  orders.push({ ...c.order, id, at: Date.now() } as Order);
  await write(env, "orders", orders.slice(-30));
  return { ok: true, orderId: id, note: "Queued. The app picks it up within a few seconds if it is open and Claude control is on. Check xugc_result with this orderId." };
}

const TOOLS = [
  { name: "xugc_status", description: "What XUGC is doing right now on Alex's Mac: whether a video is rendering, today's spend against the limits, the Style Bible files, the product, recent videos and their cost, and the last results of orders sent. Read this before answering anything about whether XUGC is working.", inputSchema: { type: "object", properties: {} } },
  { name: "xugc_generate", description: "Make a video. XUGC shows the finished prompt and price on Alex's screen and WAITS for him to press Approve (unless he switched auto-approve on); the page moves live as you order it. Goes through XUGC's own money rules, so it is refused if over the per-video or daily limit. Give either 'scene' (what happens; XUGC adds the Style Bible, avatar and product) or 'prompt' (a finished prompt used as written). seconds 5/10/15/20. quality draft/hd/full. Returns an orderId; poll xugc_result.", inputSchema: { type: "object", properties: { scene: { type: "string" }, prompt: { type: "string" }, seconds: { type: "number", enum: SECONDS }, quality: { type: "string", enum: QUALITIES }, res: { type: "string", enum: ["480p", "720p"], description: "seedance / fal_wan only: 480p is about half the price" }, engine: { type: "string", enum: ["seedance", "kling", "fal_veo", "fal_wan", "veo", "ltx", "ltx_full", "hunyuan", "wan"], description: "seedance (Seedance 2.5, default choice for UGC), kling (Kling 3.0 Pro), fal_veo (Veo 3.1), fal_wan (Wan 3.0) are rented on fal.ai with one key: hidden golden-ratio frames, then 8 s clips joined; product photos only teach the frames. veo = Veo 3.1 (720p, with sound; hidden golden-ratio frames; product photos only teach the frames, never go into the video). The others are open models on a rented GPU." }, preset: { type: "string", enum: ["review", "product-only", "unboxing", "try-on", "tutorial", "breaking-news-start", "demo-in-motion", "before-after"], description: "Real Life (veo) recipe; default review" }, tier: { type: "string", enum: ["lite", "fast"], description: "Veo only (fal_veo or veo): lite $0.05/s, fast $0.15/s on fal. Every rented model also makes hidden frames at $0.08 each (clips + 1). Seedance 2.5: $0.47/s at 720p, $0.22/s at 480p. Kling 3.0 Pro: $0.17/s. Wan 3.0: $0.10/s at 720p, $0.05/s at 480p. A 16 s ad = 2 clips of 8 s + 3 frames." }, look: { type: "string", enum: LOOKS }, avatar: { type: "string", description: "none (the scene decides), broad, maya, jordan, ava, leo or sofia" }, avatarText: { type: "string", description: "your own description of the person" }, productUrl: { type: "string" }, captions: { type: "array", items: { type: "string" }, description: "Text burned onto the video by the app (the model cannot draw text). Each: \"start-end | text | top or bottom\", e.g. \"0-4 | BREAKING NEWS\". Omit to use the Style Bible captions; pass [] for none." }, music: { type: "string", enum: ["none", "soft", "drop"], description: "none, a soft beat bed, or a beat that drops at the biggest moment" }, refs: { description: "Reference photos that lock the product to its real look. \"auto\" = the first clean photo (no text or infographics). Or up to 3 items, each a photo URL from the product page or {url, at, strength}: at = where in the video (0 start, 0.5 middle, 1 end), strength 0.1-1. Use ONLY clean photos with no text on them: a photo with text or a diagram will be pasted into the video.", anyOf: [{ type: "string", enum: ["auto"] }, { type: "array", items: { anyOf: [{ type: "string" }, { type: "object", properties: { url: { type: "string" }, at: { type: "number" }, strength: { type: "number" } } }] } }] } } } },
  { name: "xugc_reference_set", description: "Describe the reference ad Alex loaded (a video that went a little viral) and set how closely to follow it. First call xugc_status: status.reference has the timings and the cuts, and xugc_takes lists ref-sheet.jpg, a contact sheet of the frames with a url you can look at. Write 'beats': what happens in each shot with its timing, e.g. '0-3s: a man kneels beside a flat black heap and starts a blower. 3-6s: ...'. level: 0 off, 1 mood only, 2 same story, 3 same shots and timing.", inputSchema: { type: "object", properties: { beats: { type: "string" }, level: { type: "number", enum: [0, 1, 2, 3] } } } },
  { name: "xugc_cancel", description: "Stop the video that is rendering and hand the GPU back.", inputSchema: { type: "object", properties: {} } },
  { name: "xugc_result", description: "The outcome of an order sent earlier (started, done with cost, or the exact error).", inputSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] } },
  { name: "xugc_style_write", description: "Create or replace a Style Bible .md file. Lines under '## Prompt' are written into every video prompt; lines under '## Never' become the Avoid list. Everything else is for humans.", inputSchema: { type: "object", properties: { name: { type: "string" }, content: { type: "string" } }, required: ["name", "content"] } },
  { name: "xugc_style_toggle", description: "Turn a Style Bible file on or off.", inputSchema: { type: "object", properties: { name: { type: "string" }, on: { type: "boolean" } }, required: ["name"] } },
  { name: "xugc_style_delete", description: "Delete a Style Bible file.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "xugc_share", description: "Ask the app to upload a finished video so it can be watched here. Then see xugc_takes.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "xugc_takes", description: "Videos the app has shared, with a url for each.", inputSchema: { type: "object", properties: {} } },
] as const;

async function callTool(env: Env, name: string, a: Record<string, unknown>) {
  if (name === "xugc_status") {
    const status = await read<Record<string, unknown>>(env, "status", { state: "the app has not reported yet" });
    const results = await read<unknown[]>(env, "results", []);
    return { status, recentResults: results.slice(-8) };
  }
  if (name === "xugc_result") {
    const results = await read<{ id: string }[]>(env, "results", []);
    return results.filter((r) => r.id === String(a.orderId ?? "")).pop() ?? { state: "no result yet" };
  }
  if (name === "xugc_takes") {
    const out: { name: string; size: number; url: string }[] = [];
    const page = await env.MEDIA.list({ prefix: TAKES, limit: 200 });
    for (const o of page.objects) out.push({ name: o.key.slice(TAKES.length), size: o.size, url: `https://kerberos.gardenbuddystore.workers.dev/xugc/${KEY}/file/${o.key.slice(TAKES.length)}` });
    return { count: out.length, takes: out };
  }
  const map: Record<string, string> = { xugc_generate: "generate", xugc_cancel: "cancel", xugc_reference_set: "reference_set", xugc_style_write: "style_write", xugc_style_toggle: "style_toggle", xugc_style_delete: "style_delete", xugc_share: "share" };
  if (map[name]) return send(env, map[name], a);
  return { ok: false, error: `no such tool: ${name}` };
}

async function mcp(env: Env, body: any) {
  const id = body?.id ?? null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  if (body?.method === "initialize") {
    return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "xugc", title: "XUGC", version: "1.0.0", websiteUrl: "https://kerberos.gardenbuddystore.workers.dev" } });
  }
  if (body?.method === "notifications/initialized") return null;
  if (body?.method === "tools/list") return reply({ tools: TOOLS });
  if (body?.method === "tools/call") {
    await write(env, "seen", { at: Date.now(), tool: body?.params?.name ?? "" });
    const out = await callTool(env, body?.params?.name ?? "", body?.params?.arguments ?? {});
    return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}

function parse(splat: string | undefined) {
  const parts = (splat ?? "").split("/").filter(Boolean);
  return { key: parts[0] ?? "", what: parts[1] ?? "", rest: parts.slice(2).join("/") };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { key, what, rest } = parse(params["*"]);
  if (key !== KEY) throw new Response("Not found", { status: 404 });
  const env = context.cloudflare.env;
  if (what === "status") return json({ ...(await read(env, "status", { state: "never reported" })), mcpSeen: await read(env, "seen", null) });
  if (what === "orders") return json({ orders: await read<Order[]>(env, "orders", []), mcpSeen: await read(env, "seen", null) });
  if (what === "file") {
    const name = rest.replace(/[^A-Za-z0-9._-]/g, "");
    const obj = name ? await env.MEDIA.get(TAKES + name) : null;
    if (!obj) throw new Response("Not found", { status: 404 });
    return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "video/mp4", "cache-control": "no-store", "access-control-allow-origin": "*" } });
  }
  if (what === "mcp") return json({ ok: true, server: "xugc", tools: TOOLS.map((t) => t.name) });
  throw new Response("Not found", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { key, what } = parse(params["*"]);
  if (request.method === "OPTIONS") return json({ ok: true });
  if (key !== KEY) throw new Response("Not found", { status: 404 });
  const env = context.cloudflare.env;

  if (what === "take") {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
    if (!/^(take-\d+\.mp4|ref-sheet\.jpg)$/.test(name)) return json({ ok: false, error: "name must be take-<digits>.mp4 or ref-sheet.jpg" }, 400);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ ok: false, error: "empty" }, 400);
    if (bytes.byteLength > 90_000_000) return json({ ok: false, error: "too big" }, 413);
    await env.MEDIA.put(TAKES + name, bytes, { httpMetadata: { contentType: name.endsWith(".jpg") ? "image/jpeg" : "video/mp4" } });
    return json({ ok: true, url: `${url.origin}/xugc/${KEY}/file/${name}` });
  }

  let body: any = null;
  try { body = await request.json(); } catch { body = null; }

  if (what === "mcp") {
    const out = await mcp(env, body);
    return out ? json(out) : new Response(null, { status: 202 });
  }
  if (what === "status") { await write(env, "status", { ...(body ?? {}), at: Date.now() }); return json({ ok: true }); }
  if (what === "orders") {
    // The app: remove the orders it has taken, and report what happened to them.
    const ack: string[] = Array.isArray(body?.ack) ? body.ack.map(String) : [];
    if (ack.length) await write(env, "orders", (await read<Order[]>(env, "orders", [])).filter((o) => !ack.includes(o.id)));
    const rs = Array.isArray(body?.results) ? body.results : [];
    if (rs.length) {
      const results = await read<unknown[]>(env, "results", []);
      for (const r of rs) results.push({ ...(r as object), at: Date.now() });
      await write(env, "results", results.slice(-40));
    }
    return json({ ok: true });
  }
  throw new Response("Not found", { status: 404 });
}
