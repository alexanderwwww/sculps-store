/**
 * The model makers, reached through fal's queue.
 *
 * Verified against fal.ai/docs and each model's API page on 2026-09-13:
 * `POST https://queue.fal.run/<model id>` with `Authorization: Key <key>`
 * answers `{ request_id, status_url, response_url }`; the status URL reports
 * IN_QUEUE | IN_PROGRESS | COMPLETED (an `error` field on a failed one); the
 * response URL carries the model's own output — `images[].url` or
 * `video.url`. Pay per use, one key. Input pictures are plain https URLs,
 * which our /media route already serves publicly.
 */
import { eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { studioConfig } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

const QUEUE = "https://queue.fal.run";

export class StudioNotConfigured extends Error {}

export async function keyFor(db: DB, env: Env, storeId: string): Promise<string> {
  const [row] = await db.select().from(studioConfig).where(eq(studioConfig.storeId, storeId)).limit(1);
  if (!row) throw new StudioNotConfigured("Add a fal.ai key in Studio first.");
  const key = await decryptSecret(env, row.secretEnc);
  if (!key) throw new StudioNotConfigured("The stored fal key cannot be read. Save it again.");
  return key;
}

function headers(key: string): Record<string, string> {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/* ---------------------------------------------------------------- catalog */

export type Kind = "image" | "video";

export interface ModelDef {
  id: string;
  /** fal endpoint id */
  endpoint: string;
  kind: Kind;
  label: string;
  maker: string;
  note: string;
  needsImage: boolean;
  aspects: string[];
  durations?: string[];
  /** builds the request body from the studio's normalised fields */
  body: (input: BodyInput) => Record<string, unknown>;
}

export interface BodyInput {
  prompt: string;
  aspect: string;
  duration: string;
  imageUrl: string | null;
  audio: boolean;
  count: number;
}

/** GPT Image sizes are named, not ratios. */
function gptSize(aspect: string): string {
  return (
    {
      "1:1": "square_hd",
      "4:3": "landscape_4_3",
      "3:4": "portrait_4_3",
      "16:9": "landscape_16_9",
      "9:16": "portrait_16_9",
    }[aspect] ?? "auto"
  );
}

export const MODELS: ModelDef[] = [
  {
    id: "gpt-image-2",
    endpoint: "openai/gpt-image-2",
    kind: "image",
    label: "GPT Image 2",
    maker: "OpenAI",
    note: "Product shots, typography, clean renders",
    needsImage: false,
    aspects: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    body: ({ prompt, aspect, count }) => ({ prompt, image_size: gptSize(aspect), quality: "high", num_images: count, output_format: "png" }),
  },
  {
    id: "gpt-image-2-edit",
    endpoint: "openai/gpt-image-2/edit",
    kind: "image",
    label: "GPT Image 2 with reference",
    maker: "OpenAI",
    note: "Keeps your product or a face from the picture",
    needsImage: true,
    aspects: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    body: ({ prompt, aspect, count, imageUrl }) => ({
      prompt,
      image_urls: [imageUrl],
      image_size: gptSize(aspect),
      quality: "high",
      num_images: count,
      output_format: "png",
    }),
  },
  {
    id: "seedance-2",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    kind: "video",
    label: "Seedance 2.0",
    maker: "ByteDance",
    note: "Talking creators with speech, up to 15s",
    needsImage: true,
    aspects: ["9:16", "16:9", "1:1", "4:3", "3:4"],
    durations: ["4", "5", "6", "8", "10", "12", "15"],
    body: ({ prompt, aspect, duration, imageUrl, audio }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspect,
      duration,
      resolution: "1080p",
      generate_audio: audio,
    }),
  },
  {
    id: "seedance-2-fast",
    endpoint: "bytedance/seedance-2.0/fast/image-to-video",
    kind: "video",
    label: "Seedance 2.0 Fast",
    maker: "ByteDance",
    note: "Same model, quicker and cheaper, 720p",
    needsImage: true,
    aspects: ["9:16", "16:9", "1:1", "4:3", "3:4"],
    durations: ["4", "5", "6", "8", "10", "12", "15"],
    body: ({ prompt, aspect, duration, imageUrl, audio }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspect,
      duration,
      resolution: "720p",
      generate_audio: audio,
    }),
  },
  {
    id: "kling-3-pro",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    kind: "video",
    label: "Kling 3.0 Pro",
    maker: "Kuaishou",
    note: "Cinematic motion with native audio",
    needsImage: true,
    aspects: ["9:16", "16:9", "1:1"],
    durations: ["3", "5", "8", "10", "15"],
    body: ({ prompt, duration, imageUrl, audio }) => ({ prompt, start_image_url: imageUrl, duration, generate_audio: audio }),
  },
  {
    id: "kling-3",
    endpoint: "fal-ai/kling-video/v3/standard/image-to-video",
    kind: "video",
    label: "Kling 3.0",
    maker: "Kuaishou",
    note: "Cheaper Kling, still with audio",
    needsImage: true,
    aspects: ["9:16", "16:9", "1:1"],
    durations: ["3", "5", "8", "10", "15"],
    body: ({ prompt, duration, imageUrl, audio }) => ({ prompt, start_image_url: imageUrl, duration, generate_audio: audio }),
  },
  {
    id: "veo-3-1",
    endpoint: "fal-ai/veo3.1/image-to-video",
    kind: "video",
    label: "Veo 3.1",
    maker: "Google",
    note: "Best lip sync, 4 to 8s",
    needsImage: true,
    aspects: ["9:16", "16:9"],
    durations: ["4", "6", "8"],
    body: ({ prompt, aspect, duration, imageUrl, audio }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspect,
      duration: `${duration}s`,
      resolution: "1080p",
      generate_audio: audio,
    }),
  },
];

export function modelById(id: string): ModelDef | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

/* --------------------------------------------------------------- requests */

export interface Submitted {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export async function submit(key: string, model: ModelDef, body: Record<string, unknown>): Promise<Submitted> {
  const response = await fetch(`${QUEUE}/${model.endpoint}`, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${model.label} refused the request (${response.status}): ${detail(text)}`);
  const json = JSON.parse(text) as { request_id?: string; status_url?: string; response_url?: string };
  if (!json.request_id || !json.status_url || !json.response_url) throw new Error(`fal answered without a request id: ${text.slice(0, 200)}`);
  return { requestId: json.request_id, statusUrl: json.status_url, responseUrl: json.response_url };
}

function detail(text: string): string {
  try {
    const json = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const d = json.detail ?? json.error;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => (typeof x === "string" ? x : (x as { msg?: string }).msg ?? JSON.stringify(x))).join("; ");
    if (d) return JSON.stringify(d);
  } catch {
    /* not json */
  }
  return text.slice(0, 300);
}

export interface StatusResult {
  /** queued | in_progress | completed | failed */
  status: "queued" | "in_progress" | "completed" | "failed";
  urls: string[];
  error: string | null;
}

export async function status(key: string, statusUrl: string, responseUrl: string): Promise<StatusResult> {
  const response = await fetch(statusUrl, { headers: headers(key) });
  const text = await response.text();
  if (!response.ok) throw new Error(`fal status ${response.status}: ${detail(text)}`);
  const json = JSON.parse(text) as { status?: string; error?: string; error_type?: string };
  if (json.status === "IN_QUEUE") return { status: "queued", urls: [], error: null };
  if (json.status === "IN_PROGRESS") return { status: "in_progress", urls: [], error: null };
  if (json.status !== "COMPLETED") return { status: "in_progress", urls: [], error: null };

  const result = await fetch(responseUrl, { headers: headers(key) });
  const body = await result.text();
  if (!result.ok) return { status: "failed", urls: [], error: detail(body) || json.error || "The model failed." };
  const out = JSON.parse(body) as { images?: Array<{ url?: string }>; video?: { url?: string }; error?: string };
  const urls = [...(out.images ?? []).map((i) => i.url).filter((u): u is string => Boolean(u)), ...(out.video?.url ? [out.video.url] : [])];
  if (!urls.length) return { status: "failed", urls: [], error: out.error ?? json.error ?? "The model returned nothing." };
  return { status: "completed", urls, error: null };
}

/** Proves the key is accepted: a status lookup that needs auth but costs nothing. */
export async function testKey(key: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const response = await fetch(`${QUEUE}/openai/gpt-image-2/requests/00000000-0000-0000-0000-000000000000/status`, { headers: headers(key) });
  if (response.status === 401 || response.status === 403) return { ok: false, reason: `fal refused the key (${response.status}).` };
  if (response.status >= 500) return { ok: false, reason: `fal is unreachable (${response.status}).` };
  return { ok: true };
}
