/**
 * The Marketing Studio agent: one chat turn with Claude, tools included.
 *
 * The owner talks; assets get generated inside the chat. Claude is given the
 * store's brand rules, the section's purpose and a small set of tools that
 * wrap the existing fal plumbing (studio.server.ts). Nothing here streams:
 * a turn is one POST that runs the tool loop server-side, persists every
 * message as Anthropic content blocks, and answers with the new rows.
 *
 * Money: no generate tool runs without a price. The estimate is computed in
 * code from PRICES, and anything over $1 needs an explicit yes from the
 * owner in the message that asked for it — the model cannot talk its way
 * past that check, it lives in the tool handler.
 */
import { SECTION_INFO } from "./studio-sections";
export { SECTION_INFO };
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The Messages API over plain fetch. The SDK drags Node-only modules into the
 * Worker bundle (child_process), so this is the whole client we need.
 */
function anthropicClient(apiKey: string) {
  return {
    messages: {
      async create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`Anthropic ${response.status}: ${(await response.text()).slice(0, 300)}`);
        return (await response.json()) as Anthropic.Message;
      },
    },
  };
}
import { and, asc, desc, eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { generations, media, products, studioConfig, studioMessages, studioThreads, type StudioSection } from "~/db/schema";
import { decryptSecret } from "./crypto.server";
import { modelById } from "./fal.server";
import { listSubjects, refreshPending, startGeneration, startTraining, type GenerationRow } from "./studio.server";

/* ------------------------------------------------------------------ brand */

/**
 * The brand rules, in code for now: the Worker cannot read the skill's
 * style guide at build time. Keep this short; it rides in every request.
 */
export const BRAND = `
Visual rules (non-negotiable):
- One hue family per image. No sky, no clouds. Chrome, satin metal and a soft glow are the finish language.
- Product accuracy is critical: the product must match the reference picture exactly — shape, proportions, colour, logo, screen, materials. Nothing added, nothing removed.
- UGC must look like a real phone: candid, slightly imperfect light, real room, real skin, no studio, no text overlays baked in.
- Website and product photos: clean, sharp, e-commerce quality, generous negative space for copy.
- Meta ad photos: one clear subject, the product large in frame, 4:5 or 1:1, a single focal point.
- Never write brand names of other companies into a prompt. Never put text or logos in the image unless asked.
`.trim();


/* ------------------------------------------------------------------ prices */

/** Approximate fal prices, in USD. */
export const PRICES = {
  gptImage: { high: 0.22, medium: 0.07, low: 0.015 },
  fluxLora: 0.035,
  videoPerSecond: {
    "ltx-2-pro": 0.06,
    "wan-2-5": 0.1,
    "kling-3": 0.084,
    "kling-3-pro": 0.14,
    "seedance-2": 0.3,
    "seedance-2-fast": 0.15,
    "veo-3-1": 0.4,
  } as Record<string, number>,
  klingAudioPerSecond: 0.126,
  training: 2,
};

export const APPROVAL_LIMIT_USD = 1;
const APPROVAL_WORDS = /\b(yes|yep|yeah|go|go ahead|ok|okay|do it|approved|approve|proceed|sure|run it|ship it)\b/i;

export function imagePrice(quality: string, count: number): number {
  const q = (["high", "medium", "low"].includes(quality) ? quality : "high") as "high" | "medium" | "low";
  return PRICES.gptImage[q] * count;
}

export function videoPrice(model: string, duration: number, audio: boolean): number {
  let rate = PRICES.videoPerSecond[model] ?? 0.3;
  if (model === "kling-3" && audio) rate = PRICES.klingAudioPerSecond;
  return rate * duration;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/* ------------------------------------------------------------------- tools */

const VIDEO_MODELS = ["ltx-2-pro", "wan-2-5", "kling-3", "kling-3-pro", "seedance-2", "seedance-2-fast", "veo-3-1"];

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_media",
    description: "Lists this store's media library (uploaded product pictures and everything generated here). Use it to find a reference key before generating.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter by filename or key, case-insensitive." },
        only: { type: "string", enum: ["all", "uploads", "generated"], description: "uploads = pictures the owner added; generated = Studio outputs." },
      },
    },
  },
  {
    name: "generate_image",
    description:
      "Generates still images with GPT Image 2 (or FLUX with a trained subject when subject_id is given). With reference_key the product in that picture is kept exactly. State the price first; the tool refuses over $1 without the owner's yes.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        reference_key: { type: "string", description: "/media key of the reference picture (product or person)." },
        subject_id: { type: "string", description: "A trained subject id; switches to FLUX LoRA and requires the trigger word in the prompt." },
        aspect: { type: "string", enum: ["1:1", "4:3", "3:4", "16:9", "9:16", "4:5"] },
        count: { type: "integer", minimum: 1, maximum: 4 },
        quality: { type: "string", enum: ["low", "medium", "high"] },
        approved_cost_usd: { type: "number", description: "The price you quoted to the owner for this call." },
      },
      required: ["prompt", "approved_cost_usd"],
    },
  },
  {
    name: "generate_video",
    description: "Animates a still (a /media key) into a short video. State the price first; over $1 needs the owner's yes.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        source_key: { type: "string", description: "/media key of the still to animate." },
        model: { type: "string", enum: VIDEO_MODELS },
        duration: { type: "integer", minimum: 3, maximum: 15 },
        audio: { type: "boolean" },
        aspect: { type: "string", enum: ["9:16", "16:9", "1:1", "4:3", "3:4", "4:5"] },
        approved_cost_usd: { type: "number" },
      },
      required: ["prompt", "source_key", "model", "duration", "approved_cost_usd"],
    },
  },
  {
    name: "generate_batch",
    description:
      "Organic volume: creates N still+video pairs from one reference (GPT Image 2 edit still, then a video on it), each with its own hook. Quote the TOTAL first; over $1 needs the owner's yes.",
    input_schema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "What the clips are about, who is in them, the setting, the energy." },
        reference_key: { type: "string", description: "/media key of the product picture every still is built from." },
        count: { type: "integer", minimum: 1, maximum: 8 },
        format: { type: "string", enum: ["9:16"] },
        model: { type: "string", enum: VIDEO_MODELS, description: "Video model, default ltx-2-pro." },
        duration: { type: "integer", minimum: 3, maximum: 15 },
        hooks: { type: "array", items: { type: "string" }, description: "One hook line per clip (spoken or acted). Falls back to variations of the brief." },
        audio: { type: "boolean" },
        approved_cost_usd: { type: "number" },
      },
      required: ["brief", "reference_key", "count", "approved_cost_usd"],
    },
  },
  {
    name: "check_generation",
    description: "Checks a generation (waits up to a minute). Returns status and the /media keys of finished files.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "train_subject",
    description: "Trains a LoRA of a product or person from 3–30 media keys (about $2, ~5 minutes). Afterwards generate_image with subject_id draws it accurately.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        media_keys: { type: "array", items: { type: "string" } },
        trigger_word: { type: "string", description: "One uppercase token, e.g. BODIESBOARD." },
        approved_cost_usd: { type: "number" },
      },
      required: ["name", "media_keys", "trigger_word", "approved_cost_usd"],
    },
  },
  {
    name: "write_hooks",
    description: "Stores 5–10 short on-screen hook lines and captions for the owner to use on a batch. No posting happens; this is the copy sheet.",
    input_schema: {
      type: "object",
      properties: {
        batch_id: { type: "string" },
        hooks: { type: "array", items: { type: "string" } },
        captions: { type: "array", items: { type: "string" } },
      },
      required: ["hooks", "captions"],
    },
  },
  {
    name: "save_note",
    description: "Appends a short note to this thread's summary (a decision, a prompt that worked, a to-do).",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
];

/* ------------------------------------------------------------- transcript */

export type MessageRow = typeof studioMessages.$inferSelect;
export type ThreadRow = typeof studioThreads.$inferSelect;

/** Our own marker block: a picture from Media attached to a user message. */
interface AttachmentBlock {
  type: "ms_attachment";
  key: string;
}

type StoredBlock = Anthropic.ContentBlockParam | AttachmentBlock;

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i += 0x8000) out += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(out);
}

/**
 * Turns the stored rows into what the API wants. Attachments become base64
 * image blocks (fal's URLs are on our own origin, which may be local, so the
 * bytes are read from R2 instead), and `tool` rows become user turns.
 */
async function toApiMessages(env: Env, rows: MessageRow[]): Promise<Anthropic.MessageParam[]> {
  const out: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const raw of row.content as StoredBlock[]) {
      if (raw.type === "ms_attachment") {
        const object = await env.MEDIA?.get(raw.key);
        const type = object?.httpMetadata?.contentType ?? "";
        if (object && /^image\/(png|jpeg|webp|gif)$/.test(type) && object.size < 4_500_000) {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: type as "image/png", data: toBase64(await object.arrayBuffer()) },
          });
        }
        blocks.push({ type: "text", text: `(attached reference: /media/${raw.key} — reference_key "${raw.key}")` });
      } else {
        blocks.push(raw);
      }
    }
    if (!blocks.length) continue;
    out.push({ role: row.role === "assistant" ? "assistant" : "user", content: blocks });
  }
  return out;
}

/* -------------------------------------------------------------- the turn */

export interface TurnInput {
  db: DB;
  env: Env;
  origin: string;
  store: { id: string; name: string; slug: string };
  thread: ThreadRow;
  text: string;
  attachments: string[];
  model: string;
}

export interface TurnResult {
  messages: MessageRow[];
  generationIds: string[];
  thread: ThreadRow;
  error?: string;
}

const MAX_TURN_MS = 85_000;
const MAX_ITERATIONS = 8;

export async function anthropicKeyFor(db: DB, env: Env, storeId: string): Promise<string | null> {
  const [row] = await db.select().from(studioConfig).where(eq(studioConfig.storeId, storeId)).limit(1);
  if (!row?.anthropicKeyEnc) return null;
  return decryptSecret(env, row.anthropicKeyEnc);
}

async function systemPrompt(db: DB, store: TurnInput["store"], section: StudioSection): Promise<string> {
  const rows = await db.select({ title: products.title, description: products.description }).from(products).where(eq(products.storeId, store.id)).limit(8);
  const productLines = rows.map((p) => `- ${p.title}: ${p.description.replace(/\s+/g, " ").slice(0, 160)}`).join("\n") || "- (no products yet)";
  const info = SECTION_INFO[section];
  return `You are the Marketing Studio of ${store.name}, a small e-commerce store. You talk with the owner and make assets inside this chat using tools.

Store products:
${productLines}

${BRAND}

This chat is the "${info.label}" section. ${info.purpose} Default aspect: ${info.aspect}.

How to work:
- Be short. The owner is busy; answer in a few lines, no headings, no lists unless asked.
- Before any generate_* or train_subject call, say the approximate price in one line (for example "2 images, GPT Image 2 high, ~$0.44"). Prices: GPT Image 2 high $0.22 / medium $0.07 / low $0.015 per image; FLUX subject $0.035; LTX-2 Pro $0.06/s; Wan 2.5 $0.10/s; Kling 3 $0.084/s ($0.126 with audio); Seedance 2 $0.30/s; Veo 3.1 $0.40/s; training $2.
- Under $1 is pre-approved: just say the price and run. Over $1: quote the price and ask; only run once the owner says yes. The tools enforce this and will answer "needs approval" if you try early.
- Pass the quoted price as approved_cost_usd on every generate call.
- Use list_media to find the product reference before generating anything with the product in it; product pictures the owner uploaded are the source of truth.
- Generations take 20–90 seconds. After starting one, call check_generation once. If it is still running, say so and stop — the page shows it when it lands. Do not poll again and again.
- Write prompts yourself, fully, in the brand's language. Never ask the owner to write a prompt.
- For organic batches, propose hooks first with write_hooks, then generate_batch.`;
}

/** One agent turn. Persists everything it produces, even on failure. */
export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const { db, env, origin, store, thread } = input;
  const started = Date.now();
  const generationIds: string[] = [];
  const produced: MessageRow[] = [];
  const timeLeft = () => MAX_TURN_MS - (Date.now() - started);

  const apiKey = await anthropicKeyFor(db, env, store.id);
  if (!apiKey) return { messages: [], generationIds, thread, error: "Add your Anthropic API key first." };

  // The owner's message, stored first so it is never lost to a model error.
  const userBlocks: StoredBlock[] = [
    ...input.attachments.map((key): AttachmentBlock => ({ type: "ms_attachment", key })),
    { type: "text", text: input.text },
  ];
  const [userRow] = await db.insert(studioMessages).values({ threadId: thread.id, role: "user", content: userBlocks }).returning();
  produced.push(userRow);

  const history = await db.select().from(studioMessages).where(eq(studioMessages.threadId, thread.id)).orderBy(asc(studioMessages.createdAt));
  const messages = await toApiMessages(env, history);
  const system = await systemPrompt(db, store, thread.section);
  const approvedByOwner = APPROVAL_WORDS.test(input.text);

  const client = anthropicClient(apiKey);
  const model = input.model === "claude-opus-5" ? "claude-opus-5" : "claude-sonnet-5";

  let lastError: string | undefined;
  try {
    for (let i = 0; i < MAX_ITERATIONS && timeLeft() > 8_000; i++) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        messages,
      });

      // Thinking blocks are echoed back untouched (same model) but never shown.
      const assistantBlocks = response.content as Anthropic.ContentBlockParam[];
      const [assistantRow] = await db.insert(studioMessages).values({ threadId: thread.id, role: "assistant", content: assistantBlocks }).returning();
      produced.push(assistantRow);
      messages.push({ role: "assistant", content: assistantBlocks });

      if (response.stop_reason === "refusal") {
        lastError = "Claude declined this request.";
        break;
      }
      if (response.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const ctx: ToolContext = { db, env, origin, store, thread, approvedByOwner, generationIds, timeLeft };
        let result: unknown;
        let isError = false;
        try {
          result = await runTool(ctx, block.name, block.input as Record<string, unknown>);
        } catch (error) {
          isError = true;
          result = { error: error instanceof Error ? error.message : String(error) };
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result), ...(isError ? { is_error: true } : {}) });
      }
      const [toolRow] = await db.insert(studioMessages).values({ threadId: thread.id, role: "tool", content: results }).returning();
      produced.push(toolRow);
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/^Anthropic 401/.test(text)) lastError = "Anthropic refused the API key. Save it again.";
    else if (/^Anthropic 429/.test(text)) lastError = "Anthropic is rate limiting this key. Try again in a moment.";
    else lastError = text;
  }

  // Title the thread from the first message; touch updatedAt either way.
  const patch: Partial<typeof studioThreads.$inferInsert> = { updatedAt: new Date() };
  if (thread.title === "New chat") patch.title = input.text.replace(/\s+/g, " ").slice(0, 60);
  const [nextThread] = await db.update(studioThreads).set(patch).where(eq(studioThreads.id, thread.id)).returning();

  return { messages: produced, generationIds, thread: nextThread, error: lastError };
}

/* ---------------------------------------------------------- tool handlers */

interface ToolContext {
  db: DB;
  env: Env;
  origin: string;
  store: TurnInput["store"];
  thread: ThreadRow;
  approvedByOwner: boolean;
  generationIds: string[];
  timeLeft: () => number;
}

function guard(ctx: ToolContext, estimate: number, quoted: unknown): { needs_approval: true; estimated_cost_usd: string; message: string } | null {
  if (estimate <= APPROVAL_LIMIT_USD) return null;
  if (ctx.approvedByOwner && typeof quoted === "number" && quoted > 0) return null;
  return {
    needs_approval: true,
    estimated_cost_usd: usd(estimate),
    message: `needs approval: ${usd(estimate)}. Quote this price to the owner and run again after they say yes.`,
  };
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

async function runTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<unknown> {
  const { db, env, origin, store, thread } = ctx;
  const section = thread.section;

  if (name === "list_media") {
    const q = str(input.query).toLowerCase();
    const only = str(input.only, "all");
    const rows = await db.select().from(media).where(eq(media.storeId, store.id)).orderBy(desc(media.createdAt)).limit(300);
    const list = rows
      .filter((m) => !m.key.startsWith("http"))
      .filter((m) => (only === "uploads" ? !/^(studio|ms)-/.test(m.key) : only === "generated" ? /^(studio|ms)-/.test(m.key) : true))
      .filter((m) => !q || m.filename.toLowerCase().includes(q) || m.key.toLowerCase().includes(q))
      .slice(0, 40)
      .map((m) => ({ key: m.key, name: m.filename, mime: m.mime, url: `${origin}/media/${m.key}` }));
    return { media: list, count: list.length };
  }

  if (name === "generate_image") {
    const count = Math.min(4, Math.max(1, Math.round(num(input.count, 1))));
    const quality = str(input.quality, "high");
    const subjectId = str(input.subject_id);
    const reference = str(input.reference_key) || null;
    const estimate = subjectId ? PRICES.fluxLora * count : imagePrice(quality, count);
    const denied = guard(ctx, estimate, input.approved_cost_usd);
    if (denied) return denied;

    let loras: Array<{ path: string; scale: number }> | undefined;
    let modelId = reference ? "gpt-image-2-edit" : "gpt-image-2";
    if (subjectId) {
      const subject = (await listSubjects(db, store.id)).find((s) => s.id === subjectId);
      if (!subject || subject.status !== "ready" || !subject.loraUrl) throw new Error("That subject is not trained yet.");
      loras = [{ path: subject.loraUrl, scale: 1 }];
      modelId = "flux-lora";
    }
    const model = modelById(modelId)!;
    const aspect = str(input.aspect, SECTION_INFO[section].aspect);
    const row = await startGeneration(db, env, origin, store.id, {
      kind: "image",
      model,
      prompt: str(input.prompt),
      aspect: aspect === "4:5" ? "3:4" : aspect,
      duration: "0",
      audio: false,
      count,
      inputKey: modelId === "gpt-image-2-edit" ? reference : null,
      quality,
      loras,
      meta: { section, threadId: thread.id },
    });
    ctx.generationIds.push(row.id);
    return { generation_id: row.id, status: row.status, model: model.label, count, estimated_cost_usd: usd(estimate) };
  }

  if (name === "generate_video") {
    const modelId = VIDEO_MODELS.includes(str(input.model)) ? str(input.model) : "ltx-2-pro";
    const model = modelById(modelId)!;
    const duration = clampDuration(model.durations, num(input.duration, 6));
    const audio = input.audio !== false;
    const estimate = videoPrice(modelId, duration, audio);
    const denied = guard(ctx, estimate, input.approved_cost_usd);
    if (denied) return denied;
    const source = str(input.source_key);
    if (!source) throw new Error("source_key is required.");
    const wanted = str(input.aspect, SECTION_INFO[section].aspect);
    const aspect = model.aspects.includes(wanted) ? wanted : model.aspects[0];
    const row = await startGeneration(db, env, origin, store.id, {
      kind: "video",
      model,
      prompt: str(input.prompt),
      aspect,
      duration: String(duration),
      audio,
      count: 1,
      inputKey: source,
      meta: { section, threadId: thread.id },
    });
    ctx.generationIds.push(row.id);
    return { generation_id: row.id, status: row.status, model: model.label, seconds: duration, estimated_cost_usd: usd(estimate) };
  }

  if (name === "generate_batch") {
    const count = Math.min(8, Math.max(1, Math.round(num(input.count, 4))));
    const modelId = VIDEO_MODELS.includes(str(input.model)) ? str(input.model) : "ltx-2-pro";
    const videoModel = modelById(modelId)!;
    const duration = clampDuration(videoModel.durations, num(input.duration, 6));
    const audio = input.audio !== false;
    const perClip = PRICES.gptImage.high + videoPrice(modelId, duration, audio);
    const estimate = perClip * count;
    const denied = guard(ctx, estimate, input.approved_cost_usd);
    if (denied) return denied;
    const reference = str(input.reference_key);
    if (!reference) throw new Error("reference_key is required.");
    const brief = str(input.brief);
    const hooks = Array.isArray(input.hooks) ? input.hooks.filter((h): h is string => typeof h === "string" && h.trim().length > 0) : [];
    const batchId = crypto.randomUUID();
    const still = modelById("gpt-image-2-edit")!;
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const hook = hooks[i % Math.max(1, hooks.length)] ?? "";
      const imagePrompt =
        `Candid iPhone photo, vertical 9:16, no retouching, slightly imperfect light. ${brief}. ` +
        (hook ? `This frame opens on the moment: "${hook}". ` : `Variation ${i + 1}: a different angle, moment and framing from the others. `) +
        `The product must look exactly like the reference picture: same shape, colour, logo, proportions. Real room, real skin, nothing staged, no text.`;
      const videoPrompt =
        `Handheld phone footage, natural small movements, casual energy. ${brief}. ` +
        (hook ? `She says, to camera: "${hook}". Lip sync. ` : "") +
        `Keep the product exactly as shown. Real room sound.`;
      const row = await startGeneration(db, env, origin, store.id, {
        kind: "ugc",
        model: still,
        prompt: hook ? `${hook}` : `${brief.slice(0, 60)} ${i + 1}`,
        requestPrompt: imagePrompt,
        aspect: "9:16",
        duration: String(duration),
        audio,
        count: 1,
        inputKey: reference,
        videoPrompt,
        videoModel: modelId,
        meta: { section, threadId: thread.id, batchId, label: hook || `Clip ${i + 1}` },
      });
      ids.push(row.id);
      ctx.generationIds.push(row.id);
    }
    return { batch_id: batchId, generation_ids: ids, clips: count, model: videoModel.label, seconds: duration, estimated_cost_usd: usd(estimate) };
  }

  if (name === "check_generation") {
    const id = str(input.id);
    // Poll a few times, but leave room to answer within the turn.
    const budget = Math.min(60_000, ctx.timeLeft() - 10_000);
    const stop = Date.now() + Math.max(0, budget);
    let row: GenerationRow | undefined;
    for (;;) {
      const changed = await refreshPending(db, env, origin, store.id).catch(() => [] as GenerationRow[]);
      row = changed.find((r) => r.id === id) ?? (await findGeneration(db, id));
      if (!row) return { error: "Unknown generation id." };
      if (row.status !== "queued" && row.status !== "in_progress") break;
      if (Date.now() + 5_000 > stop) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    const pending = row.status === "queued" || row.status === "in_progress";
    return {
      id: row.id,
      status: row.status,
      stage: row.stage,
      keys: row.outputKeys,
      urls: row.outputKeys.map((k) => `${origin}/media/${k}`),
      error: row.error,
      note: pending ? "still running, tell the owner it will appear here when done — do not call check_generation again this turn" : undefined,
    };
  }

  if (name === "train_subject") {
    const denied = guard(ctx, PRICES.training, input.approved_cost_usd);
    if (denied) return denied;
    const keys = Array.isArray(input.media_keys) ? input.media_keys.map(String) : [];
    const row = await startTraining(db, env, origin, store.id, { name: str(input.name), triggerWord: str(input.trigger_word), mediaKeys: keys });
    return { subject_id: row.id, status: row.status, trigger_word: row.triggerWord, estimated_cost_usd: usd(PRICES.training) };
  }

  if (name === "write_hooks") {
    // Stored by being in the transcript (the tool_use block holds the copy);
    // the note keeps a compact copy on the thread too.
    const hooks = Array.isArray(input.hooks) ? input.hooks.map(String) : [];
    const captions = Array.isArray(input.captions) ? input.captions.map(String) : [];
    const note = `Hooks${input.batch_id ? ` (batch ${String(input.batch_id).slice(0, 8)})` : ""}:\n${hooks.map((h) => `• ${h}`).join("\n")}\nCaptions:\n${captions.map((c) => `• ${c}`).join("\n")}`;
    await appendNote(db, thread.id, note);
    return { saved: true, hooks: hooks.length, captions: captions.length };
  }

  if (name === "save_note") {
    await appendNote(db, thread.id, str(input.text));
    return { saved: true };
  }

  throw new Error(`Unknown tool ${name}.`);
}

function clampDuration(options: string[] | undefined, wanted: number): number {
  if (!options?.length) return Math.max(3, Math.min(15, Math.round(wanted)));
  const numbers = options.map(Number);
  return numbers.reduce((best, n) => (Math.abs(n - wanted) < Math.abs(best - wanted) ? n : best), numbers[0]);
}

async function findGeneration(db: DB, id: string): Promise<GenerationRow | undefined> {
  const [row] = await db.select().from(generations).where(eq(generations.id, id)).limit(1);
  return row;
}

async function appendNote(db: DB, threadId: string, text: string): Promise<void> {
  const [row] = await db.select({ summary: studioThreads.summary }).from(studioThreads).where(eq(studioThreads.id, threadId)).limit(1);
  const summary = [row?.summary, text].filter(Boolean).join("\n\n").slice(-4000);
  await db.update(studioThreads).set({ summary, updatedAt: new Date() }).where(eq(studioThreads.id, threadId));
}

/* --------------------------------------------------------------- threads */

export async function listThreads(db: DB, storeId: string): Promise<ThreadRow[]> {
  return db.select().from(studioThreads).where(eq(studioThreads.storeId, storeId)).orderBy(desc(studioThreads.updatedAt)).limit(200);
}

export async function threadMessages(db: DB, threadId: string): Promise<MessageRow[]> {
  return db.select().from(studioMessages).where(eq(studioMessages.threadId, threadId)).orderBy(asc(studioMessages.createdAt));
}

export async function ensureThread(db: DB, storeId: string, section: StudioSection, threadId: string | null): Promise<ThreadRow> {
  if (threadId) {
    const [row] = await db
      .select()
      .from(studioThreads)
      .where(and(eq(studioThreads.id, threadId), eq(studioThreads.storeId, storeId)))
      .limit(1);
    if (row) return row;
  }
  const [row] = await db.insert(studioThreads).values({ storeId, section, title: "New chat" }).returning();
  return row;
}
