/**
 * Higgsfield's developer API, from the Worker.
 *
 * Verified against https://docs.higgsfield.ai/docs/openapi.json on 2026-09-13:
 * every request is `POST https://api.higgsfield.ai/<model path>` with a
 * `Authorization: Key <id>:<secret>` header, answers `{ request_id, status,
 * status_url }`, and is polled at `/requests/<id>/status` until one of
 * completed | failed | nsfw | canceled. Finished files arrive as
 * `images[].url` or `video.url` and are kept on their CDN for seven days,
 * which is why the caller copies them into R2 straight away.
 *
 * Marketing Studio, avatars and brand kits are NOT in this API. The UGC ad
 * flow in the Studio is built on top of the models that are.
 */
import { eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { studioConfig } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

const BASE = "https://api.higgsfield.ai";

export class StudioNotConfigured extends Error {}

export interface Credentials {
  keyId: string;
  secret: string;
}

export async function credentialsFor(db: DB, env: Env, storeId: string): Promise<Credentials> {
  const [row] = await db.select().from(studioConfig).where(eq(studioConfig.storeId, storeId)).limit(1);
  if (!row) throw new StudioNotConfigured("Connect a Higgsfield API key in Studio first.");
  const secret = await decryptSecret(env, row.secretEnc);
  if (!secret) throw new StudioNotConfigured("The stored Higgsfield secret cannot be read. Save the key again.");
  return { keyId: row.keyId, secret };
}

function headers(creds: Credentials): Record<string, string> {
  return {
    Authorization: `Key ${creds.keyId}:${creds.secret}`,
    "Content-Type": "application/json",
  };
}

/* ---------------------------------------------------------------- catalog */

export type Kind = "image" | "video";

export interface ModelDef {
  id: string;
  path: string;
  kind: Kind;
  label: string;
  note: string;
  /** needs an input picture */
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

export const MODELS: ModelDef[] = [
  {
    id: "soul",
    path: "/higgsfield-ai/soul/standard",
    kind: "image",
    label: "Soul",
    note: "Realistic people, fashion, UGC stills",
    needsImage: false,
    aspects: ["1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "16:9", "9:16"],
    body: ({ prompt, aspect, count }) => ({ prompt, aspect_ratio: aspect, num_images: count, resolution: "2K" }),
  },
  {
    id: "soul-reference",
    path: "/higgsfield-ai/soul/reference",
    kind: "image",
    label: "Soul with reference",
    note: "Keeps a product or a face from your picture",
    needsImage: true,
    aspects: ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"],
    body: ({ prompt, aspect, imageUrl }) => ({
      prompt,
      image_reference_url: imageUrl,
      aspect_ratio: aspect,
      resolution: "1080p",
      enhance_prompt: true,
    }),
  },
  {
    id: "flux-kontext",
    path: "/flux-pro/kontext/max/text-to-image",
    kind: "image",
    label: "Flux Kontext Max",
    note: "Product shots, typography, clean studio renders",
    needsImage: false,
    aspects: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    body: ({ prompt, aspect }) => ({ prompt, aspect_ratio: aspect }),
  },
  {
    id: "veo-i2v",
    path: "/veo3.1/image-to-video",
    kind: "video",
    label: "Veo 3.1",
    note: "Best for talking creators, with sound",
    needsImage: true,
    aspects: ["9:16", "16:9"],
    durations: ["4", "6", "8"],
    body: ({ prompt, aspect, duration, imageUrl, audio }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspect,
      duration,
      resolution: "1080",
      generate_audio: audio,
    }),
  },
  {
    id: "veo-fast-i2v",
    path: "/veo3.1/fast/image-to-video",
    kind: "video",
    label: "Veo 3.1 Fast",
    note: "Same model, quicker and cheaper",
    needsImage: true,
    aspects: ["9:16", "16:9"],
    durations: ["4", "6", "8"],
    body: ({ prompt, aspect, duration, imageUrl, audio }) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: aspect,
      duration,
      resolution: "720",
      generate_audio: audio,
    }),
  },
  {
    id: "kling-i2v",
    path: "/kling-video/v2.5-turbo/pro/image-to-video",
    kind: "video",
    label: "Kling 2.5 Turbo",
    note: "Product motion, camera moves, no speech",
    needsImage: true,
    aspects: ["9:16", "16:9", "1:1"],
    durations: ["5", "10"],
    body: ({ prompt, duration, imageUrl }) => ({ prompt, image_url: imageUrl, duration: Number(duration) }),
  },
  {
    id: "dop",
    path: "/higgsfield-ai/dop/standard",
    kind: "video",
    label: "Higgsfield DOP",
    note: "Cinematic camera presets from one picture",
    needsImage: true,
    aspects: ["9:16", "16:9", "1:1"],
    body: ({ prompt, imageUrl }) => ({ prompt, image_url: imageUrl, enhance_prompt: true }),
  },
];

export function modelById(id: string): ModelDef | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

/* --------------------------------------------------------------- requests */

export interface Submitted {
  requestId: string;
  status: string;
}

export async function submit(creds: Credentials, model: ModelDef, body: Record<string, unknown>): Promise<Submitted> {
  const response = await fetch(`${BASE}${model.path}`, { method: "POST", headers: headers(creds), body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Higgsfield ${response.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { request_id?: string; status?: string };
  if (!json.request_id) throw new Error(`Higgsfield answered without a request id: ${text.slice(0, 200)}`);
  return { requestId: json.request_id, status: json.status ?? "queued" };
}

export interface StatusResult {
  status: string;
  urls: string[];
  error: string | null;
}

export async function status(creds: Credentials, requestId: string): Promise<StatusResult> {
  const response = await fetch(`${BASE}/requests/${encodeURIComponent(requestId)}/status`, { headers: headers(creds) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Higgsfield ${response.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as {
    status?: string;
    images?: Array<{ url?: string } | string>;
    video?: { url?: string } | string;
    videos?: Array<{ url?: string } | string>;
    error?: unknown;
    detail?: unknown;
  };
  const urls: string[] = [];
  const pick = (item: { url?: string } | string | undefined) => {
    if (!item) return;
    const url = typeof item === "string" ? item : item.url;
    if (url) urls.push(url);
  };
  json.images?.forEach(pick);
  json.videos?.forEach(pick);
  pick(json.video);
  const error = json.error ?? json.detail;
  return {
    status: json.status ?? "queued",
    urls,
    error: error ? (typeof error === "string" ? error : JSON.stringify(error)).slice(0, 500) : null,
  };
}

/** A cheap call that proves the key pair is accepted: a status lookup of a made-up id. */
export async function testKey(creds: Credentials): Promise<{ ok: true } | { ok: false; reason: string }> {
  const response = await fetch(`${BASE}/requests/00000000-0000-0000-0000-000000000000/status`, { headers: headers(creds) });
  if (response.status === 401 || response.status === 403) return { ok: false, reason: `Higgsfield refused the key (${response.status}).` };
  if (response.status >= 500) return { ok: false, reason: `Higgsfield is unreachable (${response.status}).` };
  return { ok: true };
}

/**
 * Higgsfield needs a public https URL for input pictures. Ours are on the
 * store's own domain, but a preview host or a ?store= URL is not something
 * their fetcher can read, so the bytes go through their presigned upload.
 */
export async function uploadInput(creds: Credentials, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const response = await fetch(`${BASE}/files/generate-upload-url`, {
    method: "POST",
    headers: headers(creds),
    body: JSON.stringify({ content_type: contentType }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Higgsfield upload ${response.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as {
    upload_url?: string;
    public_url?: string;
    content_type?: string;
    upload_headers?: Record<string, string>;
  };
  if (!json.upload_url || !json.public_url) throw new Error("Higgsfield did not hand back an upload address.");
  const put = await fetch(json.upload_url, {
    method: "PUT",
    headers: { "Content-Type": json.content_type ?? contentType, ...(json.upload_headers ?? {}) },
    body: bytes,
  });
  if (!put.ok) throw new Error(`Upload to Higgsfield failed (${put.status}).`);
  return json.public_url;
}
