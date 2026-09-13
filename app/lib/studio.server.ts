/**
 * The Studio's own logic: start a generation, poll it, keep what it made.
 *
 * Shared by the page action (start) and the status route (poll), so the UGC
 * chain — still first, then the video on that still — lives in one place.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "~/db/client";
import { generations, media } from "~/db/schema";
import {
  credentialsFor,
  modelById,
  submit,
  status as remoteStatus,
  uploadInput,
  type Credentials,
  type ModelDef,
  type BodyInput,
} from "./higgsfield.server";

export type GenerationRow = typeof generations.$inferSelect;

const PENDING = ["queued", "in_progress"];

export async function listGenerations(db: DB, storeId: string, limit = 60): Promise<GenerationRow[]> {
  return db.select().from(generations).where(eq(generations.storeId, storeId)).orderBy(desc(generations.createdAt)).limit(limit);
}

/** Reads a stored file back out of R2 and hands Higgsfield a URL it can fetch. */
async function publicInputUrl(bucket: R2Bucket, creds: Credentials, key: string): Promise<string> {
  const object = await bucket.get(key);
  if (!object) throw new Error("The input picture is no longer in storage.");
  const bytes = await object.arrayBuffer();
  const type = object.httpMetadata?.contentType ?? "image/png";
  return uploadInput(creds, bytes, type);
}

export interface StartInput {
  kind: "image" | "video" | "ugc";
  model: ModelDef;
  prompt: string;
  aspect: string;
  duration: string;
  audio: boolean;
  count: number;
  inputKey: string | null;
  /** what the model receives when it differs from the label shown in the gallery */
  requestPrompt?: string;
  /** for a UGC ad: the video prompt used on the still once it exists */
  videoPrompt?: string;
  videoModel?: string;
}

export async function startGeneration(db: DB, env: Env, storeId: string, input: StartInput): Promise<GenerationRow> {
  const creds = await credentialsFor(db, env, storeId);
  if (input.model.needsImage && !input.inputKey) throw new Error(`${input.model.label} needs a picture to start from.`);

  const imageUrl = input.inputKey ? await publicInputUrl(env.MEDIA, creds, input.inputKey) : null;
  const bodyInput: BodyInput = {
    prompt: input.requestPrompt ?? input.prompt,
    aspect: input.aspect,
    duration: input.duration,
    imageUrl,
    audio: input.audio,
    count: input.count,
  };
  const submitted = await submit(creds, input.model, input.model.body(bodyInput));

  const [row] = await db
    .insert(generations)
    .values({
      storeId,
      kind: input.kind,
      model: input.model.id,
      prompt: input.prompt,
      params: {
        aspect: input.aspect,
        duration: input.duration,
        audio: input.audio,
        count: input.count,
        ...(input.kind === "ugc" ? { videoPrompt: input.videoPrompt ?? "", videoModel: input.videoModel ?? "veo-i2v" } : {}),
      },
      inputKey: input.inputKey,
      stage: 1,
      requestId: submitted.requestId,
      status: submitted.status,
    })
    .returning();
  return row;
}

function extensionFor(url: string, contentType: string | null): string {
  const fromType = contentType?.split("/")[1]?.split(";")[0];
  if (fromType && /^[a-z0-9]+$/.test(fromType)) return fromType === "jpeg" ? "jpg" : fromType === "quicktime" ? "mov" : fromType;
  const fromUrl = url.split("?")[0].split(".").pop();
  return fromUrl && fromUrl.length <= 4 ? fromUrl.toLowerCase() : "bin";
}

/** Copies one finished file from Higgsfield's CDN into R2 and the media table. */
async function keep(db: DB, bucket: R2Bucket, storeId: string, url: string, row: GenerationRow, index: number): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the result (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const type = response.headers.get("content-type");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest).slice(0, 10))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ext = extensionFor(url, type);
  const key = `studio-${hash}.${ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type ?? "application/octet-stream" } });
  const label = row.prompt.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "studio";
  await db
    .insert(media)
    .values({
      storeId,
      key,
      filename: `${label}${index ? `-${index + 1}` : ""}.${ext}`,
      mime: type ?? "application/octet-stream",
      sizeBytes: bytes.byteLength,
      alt: row.prompt.slice(0, 160),
    })
    .onConflictDoNothing();
  return key;
}

/**
 * Asks Higgsfield about every unfinished generation of this store, keeps what
 * finished, and moves UGC ads on to their video stage.
 */
export async function refreshPending(db: DB, env: Env, storeId: string): Promise<GenerationRow[]> {
  const pending = await db
    .select()
    .from(generations)
    .where(and(eq(generations.storeId, storeId), inArray(generations.status, PENDING)))
    .limit(20);
  if (!pending.length) return [];

  const creds = await credentialsFor(db, env, storeId);
  const updated: GenerationRow[] = [];

  for (const row of pending) {
    if (!row.requestId) continue;
    let patch: Partial<typeof generations.$inferInsert> = {};
    try {
      const result = await remoteStatus(creds, row.requestId);
      if (result.status === "completed") {
        const keys: string[] = [];
        for (const [i, url] of result.urls.entries()) keys.push(await keep(db, env.MEDIA, storeId, url, row, i));

        if (row.kind === "ugc" && row.stage === 1 && keys[0]) {
          // The still is done: build the video on it.
          const videoModel = modelById(String(row.params.videoModel ?? "veo-i2v"));
          if (!videoModel) throw new Error("Unknown video model for the UGC ad.");
          const imageUrl = await publicInputUrl(env.MEDIA, creds, keys[0]);
          const submitted = await submit(
            creds,
            videoModel,
            videoModel.body({
              prompt: String(row.params.videoPrompt || row.prompt),
              aspect: String(row.params.aspect ?? "9:16"),
              duration: String(row.params.duration ?? "8"),
              imageUrl,
              audio: true,
              count: 1,
            }),
          );
          patch = { stillKey: keys[0], stage: 2, requestId: submitted.requestId, status: submitted.status, model: videoModel.id };
        } else {
          patch = { status: "completed", outputKeys: keys };
        }
      } else if (result.status === "failed" || result.status === "nsfw" || result.status === "canceled") {
        patch = { status: result.status, error: result.error ?? (result.status === "nsfw" ? "Flagged by Higgsfield's moderation." : null) };
      } else if (result.status !== row.status) {
        patch = { status: result.status };
      }
    } catch (error) {
      patch = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    if (Object.keys(patch).length) {
      const [next] = await db
        .update(generations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(generations.id, row.id))
        .returning();
      updated.push(next);
    }
  }
  return updated;
}

export async function deleteGeneration(db: DB, storeId: string, id: string): Promise<void> {
  await db.delete(generations).where(and(eq(generations.storeId, storeId), eq(generations.id, id)));
}
