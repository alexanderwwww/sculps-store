/**
 * Marketing Studio — a small app launcher inside the admin.
 *
 * The home is a honeycomb of glossy app bubbles (drag, fisheye, inertia).
 * Tapping one slides an app up over the pane: the five sections (Meta ad
 * photos, UGC videos, Product photos, Website photos, Organic clips) are
 * preset-driven generators on the store's fal key; Assets, Models
 * (training), Batches, Emails and Chat with Claude are the utilities.
 * Everything a section makes lands in Media tagged with the section, so
 * Assets and the section grids are views of the same files.
 *
 * Dark and scoped to `.ms-`; the admin shell around it stays as it is.
 */
import * as React from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.studio";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listMedia, addMedia } from "~/lib/admin.server";
import { studioConfig, STUDIO_SECTIONS, type StudioSection } from "~/db/schema";
import { encryptSecret, encryptionReady } from "~/lib/crypto.server";
import { testKey, StudioNotConfigured, MODELS, modelById } from "~/lib/fal.server";
import { listGenerations, deleteGeneration, listSubjects, startTraining, startGeneration, type GenerationRow, type SubjectRow } from "~/lib/studio.server";
import { SECTION_INFO } from "~/lib/studio-sections";
import { listThreads, threadMessages, type MessageRow, type ThreadRow } from "~/lib/studio-agent.server";
import type { ChatResult } from "./admin.studio.chat";
import type { loader as statusLoader } from "./admin.studio.status";

export function meta() {
  return [{ title: "Marketing Studio — Shop Admin" }];
}

const SECTIONS = STUDIO_SECTIONS.map((id) => ({ id, ...SECTION_INFO[id] }));

/** The model catalogue the client needs: no request builders, no key. */
const MODEL_CARDS = MODELS.map((m) => ({ id: m.id, kind: m.kind, label: m.label, maker: m.maker, note: m.note, needsImage: m.needsImage, aspects: m.aspects, durations: m.durations ?? null }));
type ModelCard = (typeof MODEL_CARDS)[number];

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) {
    return { store: null, config: null, encryption: false, threads: [] as ThreadRow[], messages: [] as MessageRow[], rows: [] as GenerationRow[], media: [] as MediaItem[], subjects: [] as SubjectRow[], threadId: null as string | null, models: MODEL_CARDS };
  }
  const [config] = await context.db.select().from(studioConfig).where(eq(studioConfig.storeId, store.id)).limit(1);
  const threadId = url.searchParams.get("thread");
  const [threads, rows, mediaRows, subjects] = await Promise.all([
    listThreads(context.db, store.id),
    listGenerations(context.db, store.id, 200),
    listMedia(context.db, store.id),
    listSubjects(context.db, store.id),
  ]);
  const thread = threadId ? threads.find((t) => t.id === threadId) : null;
  const messages = thread ? await threadMessages(context.db, thread.id) : [];
  return {
    store: { id: store.id, slug: store.slug, name: store.name },
    config: config
      ? { falKeyId: config.keyId || null, hasAnthropic: Boolean(config.anthropicKeyEnc), model: config.model }
      : { falKeyId: null as string | null, hasAnthropic: false, model: "claude-sonnet-5" },
    encryption: encryptionReady(context.cloudflare.env),
    threads,
    messages,
    rows,
    media: mediaRows
      .filter((m) => !m.key.startsWith("http") && !m.key.endsWith(".zip"))
      .slice(0, 500)
      .map((m): MediaItem => ({ id: m.id, key: m.key, filename: m.filename, mime: m.mime, sizeBytes: m.sizeBytes, createdAt: m.createdAt })),
    subjects,
    threadId: thread?.id ?? null,
    models: MODEL_CARDS,
  };
}

type Result = { ok?: string; error?: string; intent?: string; key?: string };

const sha = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 10))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export async function action({ context, request }: Route.ActionArgs): Promise<Result> {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };
  const env = context.cloudflare.env;
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const now = new Date();

  if (intent === "fal-connect") {
    const secret = text("secret");
    if (!secret) return { intent, error: "Paste the fal key." };
    if (!encryptionReady(env)) return { intent, error: "Not saved: no ENCRYPTION_KEY on the Worker." };
    const check = await testKey(secret);
    if (!check.ok) return { intent, error: check.reason };
    const secretEnc = await encryptSecret(env, secret);
    if (!secretEnc) return { intent, error: "Could not encrypt the key." };
    const keyId = `fal …${secret.slice(-4)}`;
    await context.db
      .insert(studioConfig)
      .values({ storeId: store.id, keyId, secretEnc, connectedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: studioConfig.storeId, set: { keyId, secretEnc, connectedAt: now, updatedAt: now } });
    return { intent, ok: "fal connected." };
  }

  if (intent === "anthropic-connect") {
    const secret = text("secret");
    if (!secret.startsWith("sk-ant-")) return { intent, error: "That does not look like an Anthropic key (sk-ant-…)." };
    if (!encryptionReady(env)) return { intent, error: "Not saved: no ENCRYPTION_KEY on the Worker." };
    const enc = await encryptSecret(env, secret);
    if (!enc) return { intent, error: "Could not encrypt the key." };
    await context.db
      .insert(studioConfig)
      .values({ storeId: store.id, keyId: "", secretEnc: "", anthropicKeyEnc: enc, updatedAt: now })
      .onConflictDoUpdate({ target: studioConfig.storeId, set: { anthropicKeyEnc: enc, updatedAt: now } });
    return { intent, ok: "Anthropic key saved." };
  }

  if (intent === "anthropic-remove") {
    await context.db.update(studioConfig).set({ anthropicKeyEnc: null, updatedAt: now }).where(eq(studioConfig.storeId, store.id));
    return { intent, ok: "Anthropic key removed." };
  }

  if (intent === "fal-remove") {
    await context.db.update(studioConfig).set({ keyId: "", secretEnc: "", connectedAt: null, updatedAt: now }).where(eq(studioConfig.storeId, store.id));
    return { intent, ok: "fal key removed." };
  }

  if (intent === "model") {
    const model = text("model") === "claude-opus-5" ? "claude-opus-5" : "claude-sonnet-5";
    await context.db
      .insert(studioConfig)
      .values({ storeId: store.id, keyId: "", secretEnc: "", model, updatedAt: now })
      .onConflictDoUpdate({ target: studioConfig.storeId, set: { model, updatedAt: now } });
    return { intent, ok: "Model set." };
  }

  if (intent === "train") {
    try {
      await startTraining(context.db, env, url.origin, store.id, {
        name: text("name"),
        triggerWord: text("trigger"),
        mediaKeys: form.getAll("mediaKey").map(String),
      });
      return { intent, ok: "Training started. About five minutes and $2." };
    } catch (error) {
      if (error instanceof StudioNotConfigured) return { intent, error: error.message };
      return { intent, error: error instanceof Error ? error.message : "Training did not start." };
    }
  }

  if (intent === "delete-generation") {
    await deleteGeneration(context.db, store.id, text("id"));
    return { intent, ok: "Deleted." };
  }

  // Upload a file from the Assets app into R2 and the media table.
  if (intent === "upload") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { intent, error: "Choose a file first." };
    if (file.size > 25 * 1024 * 1024) return { intent, error: "That file is over 25 MB." };
    const buffer = await file.arrayBuffer();
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${await sha(buffer)}.${ext}`;
    await env.MEDIA.put(key, buffer, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await addMedia(context.db, store.id, { key, filename: file.name, mime: file.type || "application/octet-stream", sizeBytes: file.size, alt: null }).catch(() => null);
    return { intent, ok: `Uploaded ${file.name}.`, key };
  }

  // One generation from a section app: the client composed the prompt.
  if (intent === "generate") {
    const kind = text("kind");
    if (!["image", "video", "ugc"].includes(kind)) return { intent, error: "Unknown kind." };
    const section = (STUDIO_SECTIONS as readonly string[]).includes(text("section")) ? text("section") : "product_photos";
    const inputKey = text("inputKey") || null;
    const label = text("label") || undefined;
    try {
      if (kind === "ugc") {
        const product = text("product") || "the product";
        const creator = text("creator") || "a real content creator in her twenties";
        const setting = text("setting") || "her real apartment, daylight from a window";
        const script = text("script");
        if (!script) return { intent, error: "Write what she says. That is the ad." };
        if (!inputKey) return { intent, error: "A UGC ad starts from a picture of the product. Pick one under Reference." };
        const still = modelById("gpt-image-2-edit")!;
        const imagePrompt =
          `Candid iPhone photo, no retouching, slightly imperfect light, vertical 9:16. ${creator} in ${setting}, ` +
          `holding and showing ${product} to the camera as if filming a selfie video. The product must look exactly like the reference picture: same shape, colour, logo, proportions. ` +
          `Real skin, real clothes, nothing staged, no studio.`;
        const videoPrompt =
          `She talks directly to the camera like a TikTok, natural handheld phone movement, casual energy, lip sync. ` +
          `She says: "${script}". Keep the product exactly as shown. Real room sound.`;
        await startGeneration(context.db, env, url.origin, store.id, {
          kind: "ugc",
          model: still,
          prompt: `${product} — ${script.slice(0, 120)}`,
          requestPrompt: imagePrompt,
          aspect: "9:16",
          duration: text("duration") || "8",
          audio: true,
          count: 1,
          inputKey,
          videoPrompt,
          videoModel: text("videoModel") || "seedance-2",
          meta: { section, label },
        });
        return { intent, ok: "Started. The still comes first, then the video on top of it." };
      }
      const model = modelById(text("model"));
      if (!model || model.kind !== kind) return { intent, error: "Pick a model." };
      const prompt = text("prompt");
      if (!prompt) return { intent, error: "Write a prompt." };
      let loras: Array<{ path: string; scale: number }> | undefined;
      const subjectId = text("subjectId");
      if (subjectId) {
        const subject = (await listSubjects(context.db, store.id)).find((s) => s.id === subjectId);
        if (subject?.status === "ready" && subject.loraUrl) loras = [{ path: subject.loraUrl, scale: 1 }];
      }
      const wanted = text("aspect") || model.aspects[0];
      await startGeneration(context.db, env, url.origin, store.id, {
        kind: kind as "image" | "video",
        model,
        prompt,
        aspect: model.aspects.includes(wanted) ? wanted : model.aspects[0],
        duration: text("duration") || model.durations?.[0] || "6",
        audio: form.get("audio") === "on",
        count: Math.min(4, Math.max(1, Number(text("count") || 1))),
        inputKey: model.needsImage ? inputKey : null,
        quality: text("quality") || undefined,
        loras,
        meta: { section, label },
      });
      return { intent, ok: "Started." };
    } catch (error) {
      if (error instanceof StudioNotConfigured) return { intent, error: error.message };
      return { intent, error: error instanceof Error ? error.message : "The model did not accept the request." };
    }
  }

  // A batch of organic clips: N still+video pairs from one reference, one batch id.
  if (intent === "batch") {
    const brief = text("brief");
    const reference = text("inputKey");
    if (!brief) return { intent, error: "Write a one-line brief first." };
    if (!reference) return { intent, error: "Pick a product picture as the reference." };
    const count = Math.min(8, Math.max(1, Number(text("count") || 4)));
    const videoModel = modelById(text("model")) ?? modelById("ltx-2-pro")!;
    if (videoModel.kind !== "video") return { intent, error: "Pick a video model." };
    const duration = text("duration") || videoModel.durations?.[0] || "6";
    const hooks = text("hooks").split("\n").map((h) => h.trim()).filter(Boolean);
    const batchId = crypto.randomUUID();
    const still = modelById("gpt-image-2-edit")!;
    try {
      for (let i = 0; i < count; i++) {
        const hook = hooks[i % Math.max(1, hooks.length)] ?? "";
        const imagePrompt =
          `Candid iPhone photo, vertical 9:16, no retouching, slightly imperfect light. ${brief}. ` +
          (hook ? `This frame opens on the moment: "${hook}". ` : `Variation ${i + 1}: a different angle, moment and framing from the others. `) +
          `The product must look exactly like the reference picture: same shape, colour, logo, proportions. Real room, real skin, nothing staged, no text.`;
        const videoPrompt =
          `Handheld phone footage, natural small movements, casual energy. ${brief}. ` + (hook ? `She says, to camera: "${hook}". Lip sync. ` : "") + `Keep the product exactly as shown. Real room sound.`;
        await startGeneration(context.db, env, url.origin, store.id, {
          kind: "ugc",
          model: still,
          prompt: hook || `${brief.slice(0, 60)} ${i + 1}`,
          requestPrompt: imagePrompt,
          aspect: "9:16",
          duration,
          audio: true,
          count: 1,
          inputKey: reference,
          videoPrompt,
          videoModel: videoModel.id,
          meta: { section: "organic", batchId, label: hook || `Clip ${i + 1}` },
        });
      }
      return { intent, ok: `Batch of ${count} started.` };
    } catch (error) {
      if (error instanceof StudioNotConfigured) return { intent, error: error.message };
      return { intent, error: error instanceof Error ? error.message : "The batch did not start." };
    }
  }

  return { error: "Unknown action." };
}

/* ------------------------------------------------------------------ view */

type MediaItem = { id: string; key: string; filename: string; mime: string; sizeBytes: number; createdAt: Date | string };
type Block = { type: string; [k: string]: unknown };

const PENDING = (s: string) => s === "queued" || s === "in_progress";
const isVideoKey = (k: string) => /\.(mp4|webm|mov)$/i.test(k);
const isStudioKey = (k: string) => /^(studio|ms)-/.test(k);

/** The fal row's section, from its params (Marketing Studio rows only). */
const sectionOf = (row: GenerationRow): StudioSection | null => {
  const s = row.params.section;
  return typeof s === "string" && (STUDIO_SECTIONS as readonly string[]).includes(s) ? (s as StudioSection) : null;
};

/** Approximate fal prices, mirrored from studio-agent.server.ts so the buttons can quote. */
const PRICES = {
  gptImage: { high: 0.22, medium: 0.07, low: 0.015 } as Record<string, number>,
  fluxLora: 0.035,
  videoPerSecond: { "ltx-2-pro": 0.06, "wan-2-5": 0.1, "kling-3": 0.084, "kling-3-pro": 0.14, "seedance-2": 0.3, "seedance-2-fast": 0.15, "veo-3-1": 0.4 } as Record<string, number>,
  training: 2,
};
const usd = (n: number) => `$${n.toFixed(2)}`;
const videoPrice = (model: string, seconds: number, audio: boolean) => (model === "kling-3" && audio ? 0.126 : PRICES.videoPerSecond[model] ?? 0.3) * seconds;

/* ------------------------------------------------------------------- apps */

type AppId = StudioSection | "assets" | "training" | "batches" | "emails" | "chat";

/** One glossy iOS-like colour per app: [top, bottom]. */
const APP_COLOR: Record<AppId, [string, string]> = {
  meta_photos: ["#3A7BFF", "#1E4FD8"],
  ugc_videos: ["#FF4FA3", "#E0187A"],
  product_photos: ["#B78BE0", "#7B4BC7"],
  website_photos: ["#3FE0B0", "#12A87E"],
  organic: ["#7CE05A", "#2FA34A"],
  assets: ["#FFA43A", "#E5661A"],
  batches: ["#34D3E8", "#0FA5BD"],
  training: ["#9C6BFF", "#5B2EE0"],
  emails: ["#FFD93A", "#E5A800"],
  chat: ["#5C6270", "#2E323C"],
};

const APP_INFO: Record<AppId, { label: string; glyph: Glyph; blurb: string }> = {
  meta_photos: { label: "Meta ad photos", glyph: "camera", blurb: "Feed-ready stills for paid social" },
  ugc_videos: { label: "UGC videos", glyph: "play", blurb: "A creator shows it and says your script" },
  product_photos: { label: "Product photos", glyph: "cube", blurb: "Clean, exact, on a backdrop you pick" },
  website_photos: { label: "Website photos", glyph: "browser", blurb: "Hero and lifestyle shots for the storefront" },
  organic: { label: "Organic clips", glyph: "sparkles", blurb: "Volume for Reels and TikTok" },
  assets: { label: "Assets", glyph: "folder", blurb: "Everything in Media" },
  batches: { label: "Batches", glyph: "stack", blurb: "Clips made in bulk" },
  training: { label: "Models", glyph: "brain", blurb: "Train the model on your product" },
  emails: { label: "Emails", glyph: "envelope", blurb: "Draft campaign emails" },
  chat: { label: "Chat with Claude", glyph: "chat", blurb: "Ask for anything in words" },
};
const APP_ORDER: AppId[] = ["meta_photos", "ugc_videos", "product_photos", "website_photos", "organic", "assets", "training", "batches", "emails", "chat"];

/* ----------------------------------------------------------------- glyphs */

type Glyph = "camera" | "play" | "cube" | "browser" | "sparkles" | "folder" | "stack" | "brain" | "envelope" | "chat" | "layers" | "sticker" | "sock" | "square" | "film" | "phone" | "person" | "pencil" | "home" | "gear";

/** Simple SF-symbol-like line glyphs in a 24px box. */
const GLYPHS: Record<Glyph, React.ReactNode> = {
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.4-2h4.2L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" />,
  cube: <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM4 7.5 12 12l8-4.5M12 12v9" />,
  browser: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M3 9.5h18M6.5 7h.01M9 7h.01" />
    </>
  ),
  sparkles: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8zM19 3l.6 1.6L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.4z" />,
  folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2.5h7A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />,
  stack: <path d="M12 4 3 8.5l9 4.5 9-4.5zM3 13l9 4.5 9-4.5M3 17.5 12 22l9-4.5" />,
  brain: (
    <>
      <path d="M9.5 4.5A3 3 0 0 0 6 7.5a3 3 0 0 0-1.5 5.3A3 3 0 0 0 7 17.5a3 3 0 0 0 5 1.5V6a3 3 0 0 0-2.5-1.5z" />
      <path d="M14.5 4.5A3 3 0 0 1 18 7.5a3 3 0 0 1 1.5 5.3A3 3 0 0 1 17 17.5a3 3 0 0 1-5 1.5V6a3 3 0 0 1 2.5-1.5z" />
    </>
  ),
  envelope: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </>
  ),
  chat: <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />,
  layers: <path d="M12 4v3M12 10v4M12 17v3M6 7h12M6 12h12M6 17h12" />,
  sticker: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 12h6M7 15.5h10" />
    </>
  ),
  sock: <path d="M8.5 3h7v8l3.5 3.5V19a2 2 0 0 1-2 2H10l-4-4v-4.5L8.5 10z" />,
  square: (
    <>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M9 19h6" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 10 6-3v10l-6-3" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </>
  ),
  pencil: <path d="M5 19l1-4L16.5 4.5a2 2 0 0 1 3 3L9 18zM14 7l3 3" />,
  home: <path d="M4 11 12 4l8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.5-1.9-3.3-2.3.9a7.6 7.6 0 0 0-2.1-1.2L14.8 3H9.2l-.3 2.7a7.6 7.6 0 0 0-2.1 1.2l-2.3-.9L2.6 9.3l2 1.5a7.5 7.5 0 0 0 0 2.4l-2 1.5 1.9 3.3 2.3-.9a7.6 7.6 0 0 0 2.1 1.2l.3 2.7h5.6l.3-2.7a7.6 7.6 0 0 0 2.1-1.2l2.3.9 1.9-3.3-2-1.5c.07-.4.1-.8.1-1.2z" />
    </>
  ),
};

function Icon({ g, size = 24 }: { g: Glyph; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[g]}
    </svg>
  );
}

/** A glossy app disc in the app's colour. */
function AppDisc({ app, size, glyph, tint }: { app: AppId; size: number; glyph?: Glyph; tint?: boolean }) {
  const [a, b] = APP_COLOR[app];
  return (
    <span className={`ms-disc${tint ? " ms-disc-tint" : ""}`} style={{ "--a": a, "--b": b, width: size, height: size } as React.CSSProperties}>
      <span className="ms-disc-hi" />
      <Icon g={glyph ?? APP_INFO[app].glyph} size={Math.round(size * 0.5)} />
    </span>
  );
}

/* ---------------------------------------------------------------- recipes */

type Opts = Record<string, string | boolean>;

type Field =
  | { key: string; label: string; type: "choice"; options: { value: string; label: string; swatch?: string }[]; def: string; hint?: string }
  | { key: string; label: string; type: "text"; def: string; placeholder?: string; long?: boolean; hint?: string }
  | { key: string; label: string; type: "toggle"; def: boolean; hint?: string }
  | { key: "model"; label: string; type: "model"; ids: string[]; def: string }
  | { key: "aspect"; label: string; type: "aspect"; options: { value: string; label: string }[]; def: string }
  | { key: "duration"; label: string; type: "length"; def: string }
  | { key: "count"; label: string; type: "count"; def: string };

interface Preset {
  id: string;
  section: StudioSection;
  title: string;
  sub: string;
  kind: "image" | "video" | "ugc";
  glyph: Glyph;
  /** fixed model for image recipes; video recipes carry a model field instead */
  model?: string;
  fields: Field[];
  compose: (o: Opts) => string;
  refLabel: string;
  cta: string;
  /** which store pictures make a good bubble thumbnail */
  match: RegExp;
}

const ACCURACY =
  "PRODUCT ACCURACY IS CRITICAL: keep the exact shape, proportions, colour, screen, logo, materials and details of the product in the reference picture, nothing added, nothing removed.";
const NO_SKY = "No sky, no clouds, no people, no text";

const BACKGROUNDS = [
  { value: "white", label: "White", swatch: "#F4F4F2", text: "seamless pure white with a soft contact shadow" },
  { value: "lilac", label: "Lilac", swatch: "linear-gradient(135deg,#C9A6FF,#FF9AD5)", text: "a smooth vivid lilac-to-pink gradient" },
  { value: "icy", label: "Icy blue", swatch: "linear-gradient(135deg,#8FD0FF,#EAF7FF)", text: "a smooth icy blue-to-white gradient" },
  { value: "matcha", label: "Matcha", swatch: "linear-gradient(135deg,#9BD08A,#E4F2C8)", text: "a soft matcha green gradient" },
  { value: "sand", label: "Sand", swatch: "linear-gradient(135deg,#E8CFA8,#FBF3E4)", text: "a warm sand-to-cream gradient" },
  { value: "black", label: "Black", swatch: "#0A0A0A", text: "deep black with a subtle rim light" },
];
const bgText = (v: string | boolean) => BACKGROUNDS.find((b) => b.value === v)?.text ?? BACKGROUNDS[0].text;
const bgOptions = (ids?: string[]) => BACKGROUNDS.filter((b) => !ids || ids.includes(b.value)).map(({ value, label, swatch }) => ({ value, label, swatch }));

const ANGLES: Record<string, string> = {
  tq: "three-quarter view from slightly above",
  front: "straight-on front view",
  top: "top-down flat lay",
  macro: "macro close-up of the surface, edge and finish",
};
const SCENES: Record<string, string> = {
  bedroom: "a real bedroom, the product on the floor beside the bed",
  living: "a real living room, the product on the floor in front of the sofa",
  apartment: "a small studio apartment, plants and a window",
  indoor: "a bright indoor room with no window visible",
};
const TIMES: Record<string, string> = { morning: "soft morning daylight", evening: "warm evening lamp light" };
const MOTIONS: Record<string, string> = {
  orbit: "The camera slowly orbits around the product, smooth and steady; the product stays perfectly still and exactly as it is in the picture.",
  push: "A slow cinematic push-in toward the product, shallow depth of field, the light softly shifting on its surface.",
  handheld: "Subtle handheld phone movement, like someone filming it in their room, small natural drifts, real light.",
  screen: "The product's screen lights up and a workout starts playing on it, a soft glow spilling out, the camera nearly still.",
};
const SOCK_COLOURS = [
  { value: "swan", label: "Icy Swan", swatch: "#F3F5F8", text: "icy swan white" },
  { value: "lilac", label: "Lilac Heat", swatch: "#C9A6FF", text: "lilac" },
  { value: "matcha", label: "Matcha", swatch: "#B7D89A", text: "matcha green" },
  { value: "bare", label: "Bare", swatch: "#E8D5C0", text: "bare sand beige" },
  { value: "black", label: "Black", swatch: "#141414", text: "black" },
];
const LAYOUTS = [
  { value: "1:1", label: "Square" },
  { value: "3:4", label: "Portrait" },
  { value: "9:16", label: "Story" },
  { value: "16:9", label: "Wide" },
];
const VIDEO_MODEL_IDS = ["ltx-2-pro", "wan-2-5", "kling-3", "seedance-2-fast", "seedance-2", "veo-3-1"];
const SCENE_FIELD: Field = {
  key: "scene",
  label: "Scene",
  type: "choice",
  options: [
    { value: "bedroom", label: "Bedroom" },
    { value: "living", label: "Living room" },
    { value: "apartment", label: "Studio apartment" },
    { value: "indoor", label: "Indoor, no window" },
  ],
  def: "bedroom",
};
const TIME_FIELD: Field = { key: "time", label: "Time", type: "choice", options: [{ value: "morning", label: "Morning light" }, { value: "evening", label: "Evening lamp" }], def: "morning" };
const COUNT_FIELD: Field = { key: "count", label: "How many", type: "count", def: "1" };

const PRESETS: Preset[] = [
  {
    id: "meta_shot",
    section: "meta_photos",
    title: "Meta ad shot",
    sub: "Bold colour world, two sticker lines, feed-ready",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "sticker",
    match: /\bad\b|-ad-|_ad_|band|hero|bd-g-|bd-x-/i,
    refLabel: "Product picture",
    cta: "Make the ad",
    fields: [
      { key: "bg", label: "Colour world", type: "choice", options: bgOptions(["lilac", "icy", "matcha", "sand", "black"]), def: "lilac" },
      { key: "s1", label: "Sticker line 1", type: "text", def: "SCREEN BUILT IN", placeholder: "SCREEN BUILT IN" },
      { key: "s2", label: "Sticker line 2", type: "text", def: "FOLDS FLAT", placeholder: "FOLDS FLAT" },
      { key: "aspect", label: "Layout", type: "aspect", options: LAYOUTS.slice(0, 3), def: "3:4" },
      COUNT_FIELD,
    ],
    compose: (o) =>
      `Paid social ad creative. The product from the reference picture, large and centred, on ${bgText(o.bg)}, one hue family, a liquid-chrome ring and a soft glow behind it. ${ACCURACY} ` +
      `Two bold rounded sticker labels, white with black uppercase text, read exactly "${String(o.s1 || "SCREEN BUILT IN")}" and "${String(o.s2 || "FOLDS FLAT")}", placed near the product; nothing else is written. ` +
      `No sky, no clouds, no people. Crisp, high contrast, made for a Meta feed.`,
  },
  {
    id: "meta_lifestyle",
    section: "meta_photos",
    title: "Lifestyle ad",
    sub: "Someone using it, product large, one focal point",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "person",
    match: /life|girl|real|apt/i,
    refLabel: "Product picture",
    cta: "Make the ad",
    fields: [SCENE_FIELD, TIME_FIELD, { key: "aspect", label: "Layout", type: "aspect", options: LAYOUTS.slice(0, 3), def: "3:4" }, COUNT_FIELD],
    compose: (o) =>
      `Paid social ad photo. A woman in her twenties in everyday clothes using the product from the reference picture, mid-movement, face relaxed, in ${SCENES[String(o.scene)] ?? SCENES.bedroom}, ${TIMES[String(o.time)] ?? TIMES.morning}. ` +
      `The product large in frame, one clear subject, one focal point. ${ACCURACY} No sky, no clouds, no text. Scroll-stopping, natural, real.`,
  },
  {
    id: "ugc_ad",
    section: "ugc_videos",
    title: "UGC ad",
    sub: "A creator shows it and says your script",
    kind: "ugc",
    glyph: "person",
    match: /real|life|girl|bd-[a-f]-/i,
    refLabel: "Product picture",
    cta: "Make the ad",
    fields: [
      { key: "product", label: "The product, as she would say it", type: "text", def: "", placeholder: "the bodies board in Lilac Heat" },
      { key: "script", label: "What she says", type: "text", def: "", long: true, placeholder: "okay this folds under my bed and I did 20 minutes before work, I'm never going back to the studio", hint: "8 seconds is about 20 words." },
      { key: "creator", label: "Creator (optional)", type: "text", def: "", placeholder: "Latina, mid twenties, claw clip" },
      { key: "setting", label: "Where (optional)", type: "text", def: "", placeholder: "small living room, morning light" },
      { key: "model", label: "Video model", type: "model", ids: ["seedance-2", "seedance-2-fast", "veo-3-1", "kling-3"], def: "seedance-2" },
      { key: "duration", label: "Length", type: "length", def: "8" },
    ],
    compose: (o) => `${String(o.product) || "the product"} — ${String(o.script)}`,
  },
  {
    id: "ugc_still",
    section: "ugc_videos",
    title: "UGC still",
    sub: "Real-phone look, a real apartment, no studio",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "phone",
    match: /real|life|girl|apt|bd-[a-f]-/i,
    refLabel: "Product picture",
    cta: "Make the still",
    fields: [
      SCENE_FIELD,
      TIME_FIELD,
      { key: "person", label: "Person", type: "choice", options: [{ value: "none", label: "None" }, { value: "woman", label: "Woman using it" }], def: "woman" },
      { key: "phone", label: "Phone-photo look", type: "toggle", def: true, hint: "Slightly imperfect, like a customer took it" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[2], LAYOUTS[1], LAYOUTS[0]], def: "9:16" },
      COUNT_FIELD,
    ],
    compose: (o) =>
      `${o.phone ? "Candid photo shot on iPhone, no retouching, slightly imperfect framing, " : "Natural photo, "}real apartment, natural skin tones. ` +
      `The product from the reference picture${o.person === "woman" ? ", a woman in her twenties in everyday clothes using it, mid-movement, face relaxed" : ""}, in ${SCENES[String(o.scene)] ?? SCENES.bedroom}, ${TIMES[String(o.time)] ?? TIMES.morning}. ` +
      `${ACCURACY} No sky, no clouds, no studio, no text. It should look like a real customer took it.`,
  },
  {
    id: "clean",
    section: "product_photos",
    title: "Clean product shot",
    sub: "Your product, exact, on a backdrop you pick",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "square",
    match: /studio|cut|render|bodies-/i,
    refLabel: "Product picture",
    cta: "Make the shot",
    fields: [
      { key: "bg", label: "Background", type: "choice", options: bgOptions(), def: "white" },
      { key: "angle", label: "Angle", type: "choice", options: [{ value: "tq", label: "Three-quarter" }, { value: "front", label: "Front" }, { value: "top", label: "Top-down" }, { value: "macro", label: "Macro detail" }], def: "tq" },
      { key: "chrome", label: "Add a chrome object", type: "toggle", def: false, hint: "One liquid-chrome blob beside the product" },
      { key: "aspect", label: "Shape", type: "aspect", options: LAYOUTS, def: "1:1" },
      COUNT_FIELD,
    ],
    compose: (o) =>
      `Studio product photograph of the product in the reference picture, ${ANGLES[String(o.angle)] ?? ANGLES.tq}. ${ACCURACY} ` +
      `Background: ${bgText(o.bg)}. ${o.chrome ? "One liquid-chrome blob floats beside the product, reflecting the background colour. " : ""}` +
      `Soft studio light, one hue family, a gentle glow behind the product. ${NO_SKY}. Sharp, clean, e-commerce quality.`,
  },
  {
    id: "exploded",
    section: "product_photos",
    title: "Exploded view",
    sub: "Every part floating apart, neatly stacked",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "layers",
    match: /explod|box|kit|cables|straps|pads|charger/i,
    refLabel: "Product picture",
    cta: "Make the view",
    fields: [{ key: "bg", label: "Background", type: "choice", options: bgOptions(), def: "white" }, { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[0], LAYOUTS[1], LAYOUTS[2]], def: "1:1" }],
    compose: (o) =>
      `Exploded-view product render of the product in the reference picture: its parts separated and floating in a neat, evenly spaced vertical stack, each part still exact. ${ACCURACY} ` +
      `Background: ${bgText(o.bg)}. Soft glow, one hue family, clean technical feel. ${NO_SKY}.`,
  },
  {
    id: "socks",
    section: "product_photos",
    title: "Socks / accessory",
    sub: "An accessory, recoloured, on clean white",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "sock",
    match: /sock|strap|pad|accessor/i,
    refLabel: "Reference picture",
    cta: "Make the shot",
    fields: [{ key: "colour", label: "Colour", type: "choice", options: SOCK_COLOURS.map(({ value, label, swatch }) => ({ value, label, swatch })), def: "swan" }, { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[0], LAYOUTS[1]], def: "1:1" }],
    compose: (o) =>
      `Clean studio product shot of the accessory in the reference picture, recoloured to ${SOCK_COLOURS.find((c) => c.value === o.colour)?.text ?? "icy swan white"} while keeping every detail — shape, grip pattern, stitching, logo — identical. ${ACCURACY} ` +
      `Pure white seamless background, soft contact shadow, one hue family. ${NO_SKY}.`,
  },
  {
    id: "hero",
    section: "website_photos",
    title: "Hero shot",
    sub: "Wide, calm, room for a headline",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "browser",
    match: /hero|web|home|life/i,
    refLabel: "Product picture",
    cta: "Make the hero",
    fields: [
      { key: "bg", label: "Colour world", type: "choice", options: bgOptions(["lilac", "icy", "matcha", "sand", "white"]), def: "icy" },
      { key: "side", label: "Product on the", type: "choice", options: [{ value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "centre", label: "Centre" }], def: "right" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[3], LAYOUTS[1]], def: "16:9" },
      COUNT_FIELD,
    ],
    compose: (o) =>
      `Website hero photograph. The product from the reference picture placed on the ${String(o.side)} of the frame with generous empty space on the other side for a headline, on ${bgText(o.bg)}, one hue family, chrome and satin accents, a soft glow. ${ACCURACY} ${NO_SKY}. Calm, sharp, premium e-commerce.`,
  },
  {
    id: "lifestyle",
    section: "website_photos",
    title: "Lifestyle shot",
    sub: "In a real room, morning light",
    kind: "image",
    model: "gpt-image-2-edit",
    glyph: "person",
    match: /life|girl|real|apt/i,
    refLabel: "Product picture",
    cta: "Make the shot",
    fields: [SCENE_FIELD, TIME_FIELD, { key: "person", label: "Person", type: "choice", options: [{ value: "none", label: "None" }, { value: "woman", label: "Woman using it" }], def: "woman" }, { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[3], LAYOUTS[1], LAYOUTS[0]], def: "16:9" }, COUNT_FIELD],
    compose: (o) =>
      `Lifestyle photograph for a storefront. The product from the reference picture${o.person === "woman" ? ", a woman in her twenties in everyday clothes using it, mid-movement, face relaxed" : ""}, in ${SCENES[String(o.scene)] ?? SCENES.bedroom}, ${TIMES[String(o.time)] ?? TIMES.morning}. ${ACCURACY} No sky, no clouds, no text. Clean, calm, e-commerce quality with room for copy.`,
  },
  {
    id: "video",
    section: "website_photos",
    title: "Product video",
    sub: "Image → video, with sound",
    kind: "video",
    glyph: "film",
    match: /studio|hero|band|bd-g-/i,
    refLabel: "Source picture",
    cta: "Make the video",
    fields: [
      { key: "model", label: "Model", type: "model", ids: VIDEO_MODEL_IDS, def: "ltx-2-pro" },
      { key: "motion", label: "Motion", type: "choice", options: [{ value: "orbit", label: "Slow orbit" }, { value: "push", label: "Push in" }, { value: "handheld", label: "Handheld" }, { value: "screen", label: "Screen turns on" }], def: "push" },
      { key: "duration", label: "Length", type: "length", def: "6" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[3], LAYOUTS[2], LAYOUTS[0]], def: "16:9" },
      { key: "audio", label: "Sound", type: "toggle", def: true, hint: "Room tone and the product's own sounds" },
    ],
    compose: (o) => `${MOTIONS[String(o.motion)] ?? MOTIONS.orbit} Keep the product exactly as in the picture: same colours, same shape, same logo. No new objects, no text, no people appear.${o.audio ? " Quiet room tone." : ""}`,
  },
  {
    id: "organic_clip",
    section: "organic",
    title: "One clip",
    sub: "A still + video pair with a hook line",
    kind: "ugc",
    glyph: "sparkles",
    match: /clip|reel|tiktok|organic|bd-d-/i,
    refLabel: "Product picture",
    cta: "Make the clip",
    fields: [
      { key: "product", label: "The product, as she would say it", type: "text", def: "", placeholder: "my bodies board" },
      { key: "script", label: "Hook line", type: "text", def: "", long: true, placeholder: "POV: you stopped paying $40 a class", hint: "One line. 6 seconds is about 15 words." },
      { key: "setting", label: "Where (optional)", type: "text", def: "", placeholder: "bedroom floor, morning light" },
      { key: "model", label: "Video model", type: "model", ids: ["ltx-2-pro", "wan-2-5", "kling-3", "seedance-2-fast"], def: "ltx-2-pro" },
      { key: "duration", label: "Length", type: "length", def: "6" },
    ],
    compose: (o) => `${String(o.product) || "the product"} — ${String(o.script)}`,
  },
  {
    id: "custom",
    section: "product_photos",
    title: "Write your own",
    sub: "Any model, your own prompt",
    kind: "image",
    glyph: "pencil",
    match: /$^/,
    refLabel: "Reference picture",
    cta: "Generate",
    fields: [
      { key: "model", label: "Model", type: "model", ids: [], def: "gpt-image-2-edit" },
      { key: "prompt", label: "Prompt", type: "text", def: "", long: true, placeholder: "Describe the picture or the motion…" },
      { key: "aspect", label: "Shape", type: "aspect", options: [...LAYOUTS, { value: "4:3", label: "Landscape" }], def: "1:1" },
      { key: "duration", label: "Length", type: "length", def: "6" },
      { key: "audio", label: "Sound", type: "toggle", def: true },
      COUNT_FIELD,
    ],
    compose: (o) => String(o.prompt ?? ""),
  },
];
const presetById = (id: string | null) => PRESETS.find((p) => p.id === id) ?? null;
/** Presets shown in a section app: its own, plus "Write your own" everywhere. */
const presetsFor = (section: StudioSection) => [...PRESETS.filter((p) => p.section === section && p.id !== "custom"), presetById("custom")!];

function defaults(p: Preset): Opts {
  const o: Opts = {};
  for (const f of p.fields) o[f.key] = f.def;
  return o;
}

/* ------------------------------------------------------------- bubble home */

type Bubble = { id: string; label: string; app: AppId; preset?: string; glyph: Glyph; tint: boolean; match: RegExp };

/** Honeycomb order, rows of 3 / 4 / 4 / 4 / 3: the five sections sit in the middle. */
const BUBBLES: Bubble[] = [
  { id: "exploded", label: "Exploded view", app: "product_photos", preset: "exploded", glyph: "layers", tint: true, match: /explod|box|kit/i },
  { id: "meta_shot", label: "Meta ad shot", app: "meta_photos", preset: "meta_shot", glyph: "sticker", tint: true, match: /\bad\b|-ad-|band|hero|bd-g-/i },
  { id: "hero", label: "Hero shot", app: "website_photos", preset: "hero", glyph: "browser", tint: true, match: /hero|web|home/i },

  { id: "clean", label: "Clean shot", app: "product_photos", preset: "clean", glyph: "square", tint: true, match: /studio|cut|render/i },
  { id: "product_photos", label: "Product photos", app: "product_photos", glyph: "cube", tint: false, match: /studio|macro|fold|screen/i },
  { id: "meta_photos", label: "Meta ad photos", app: "meta_photos", glyph: "camera", tint: false, match: /\bad\b|-ad-|_ad_|hero|bd-g-/i },
  { id: "assets", label: "Assets", app: "assets", glyph: "folder", tint: false, match: /$^/ },

  { id: "training", label: "Models", app: "training", glyph: "brain", tint: false, match: /$^/ },
  { id: "ugc_videos", label: "UGC videos", app: "ugc_videos", glyph: "play", tint: false, match: /girl|bd-c-|bd-d-|real|apt/i },
  { id: "website_photos", label: "Website photos", app: "website_photos", glyph: "browser", tint: false, match: /hero|web|home|life/i },
  { id: "chat", label: "Chat with Claude", app: "chat", glyph: "chat", tint: false, match: /$^/ },

  { id: "emails", label: "Emails", app: "emails", glyph: "envelope", tint: false, match: /$^/ },
  { id: "organic", label: "Organic clips", app: "organic", glyph: "sparkles", tint: false, match: /clip|reel|tiktok|organic|bd-d-/i },
  { id: "ugc_ad", label: "UGC ad", app: "ugc_videos", preset: "ugc_ad", glyph: "person", tint: true, match: /girl|real|life|bd-[a-f]-/i },
  { id: "batches", label: "Batches", app: "batches", glyph: "stack", tint: false, match: /$^/ },

  { id: "video", label: "Product video", app: "website_photos", preset: "video", glyph: "film", tint: true, match: /studio|hero|band/i },
  { id: "ugc_still", label: "UGC still", app: "ugc_videos", preset: "ugc_still", glyph: "phone", tint: true, match: /real|life|girl|apt/i },
  { id: "custom", label: "Write your own", app: "product_photos", preset: "custom", glyph: "pencil", tint: true, match: /$^/ },
];
const BUBBLE_ROWS = [3, 4, 4, 4, 3];
/** Half-step shifts that keep consecutive rows hex-packed (equal-length rows need one). */
const ROW_SHIFT = [0, 0, 0.5, 0, 0];
const RING_SIZE = [112, 92, 72, 58];
const BIG = RING_SIZE[0];
const SMALL = RING_SIZE[3];

type Slot = { i: number; row: number; x: number; y: number; ring: number };
const BUBBLE_SLOTS: Slot[][] = (() => {
  const rows: Slot[][] = [];
  let i = 0;
  const midRow = (BUBBLE_ROWS.length - 1) / 2;
  BUBBLE_ROWS.forEach((n, row) => {
    const list: Slot[] = [];
    for (let c = 0; c < n; c++) {
      const x = c - (n - 1) / 2 - ROW_SHIFT[row];
      const y = (row - midRow) * 0.88;
      const d = Math.hypot(x, y);
      const ring = d < 0.6 ? 0 : d < 1.4 ? 1 : d < 2.1 ? 2 : 3;
      list.push({ i: i++, row, x, y, ring });
    }
    rows.push(list);
  });
  return rows;
})();

const BUB_MOTION = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? false : true;

function bubbleThumb(b: Bubble, media: MediaItem[]): string | null {
  if (!b.preset) return null;
  const hit = media.find((m) => m.mime.startsWith("image/") && (b.match.test(m.filename) || b.match.test(m.key)));
  return hit ? `/media/${hit.key}` : null;
}

/**
 * The honeycomb is plain CSS: flex rows, centred, odd rows shifted half a
 * step, every bubble sized by its ring through an inline `--size`. Once
 * mounted, layout() refines sizes and opacity from the pan (the fisheye)
 * and moves the rows; drag has inertia.
 */
function BubbleHome({ media, onTap }: { media: MediaItem[]; onTap: (b: Bubble) => void }) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const rowsEl = React.useRef<HTMLDivElement>(null);
  const els = React.useRef<(HTMLButtonElement | null)[]>([]);
  const pan = React.useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const drag = React.useRef<{ id: number; x: number; y: number; moved: boolean; lx: number; ly: number; lt: number } | null>(null);
  const raf = React.useRef(0);
  const thumbs = React.useMemo(() => BUBBLES.map((b) => bubbleThumb(b, media)), [media]);
  const flat = React.useMemo(() => BUBBLE_SLOTS.flat(), []);

  const layout = React.useCallback(() => {
    const box = wrap.current;
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H) return;
    const k = Math.max(0.5, Math.min(1, W / 620, H / 500));
    const big = BIG * k;
    const small = SMALL * k;
    const step = big * 1.06;
    const reach = Math.min(W, H) * 0.62;
    const maxX = ((Math.max(...BUBBLE_ROWS) - 1) / 2) * step + big * 0.2;
    const maxY = ((BUBBLE_ROWS.length - 1) / 2) * 0.88 * step + big * 0.2;
    const p = pan.current;
    p.x = Math.max(-maxX, Math.min(maxX, p.x));
    p.y = Math.max(-maxY, Math.min(maxY, p.y));
    if (rowsEl.current) rowsEl.current.style.transform = `translate(${p.x}px,${p.y}px)`;
    flat.forEach((s) => {
      const el = els.current[s.i];
      if (!el) return;
      const cx = W / 2 + p.x + s.x * step;
      const cy = H / 2 + p.y + s.y * step;
      const t = Math.min(1, Math.hypot(cx - W / 2, cy - H / 2) / reach);
      const ease = t * t * (3 - 2 * t);
      const size = (big - (big - small) * ease) / k;
      el.style.setProperty("--size", `${size.toFixed(1)}px`);
      el.style.opacity = `${1 - ease * 0.3}`;
      el.classList.toggle("ms-bub-far", size * k < 60);
    });
  }, [flat]);

  React.useEffect(() => {
    layout();
    const ro = new ResizeObserver(layout);
    if (wrap.current) ro.observe(wrap.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [layout]);

  const glide = React.useCallback(() => {
    cancelAnimationFrame(raf.current);
    const p = pan.current;
    const tick = () => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      layout();
      if (Math.abs(p.vx) > 0.2 || Math.abs(p.vy) > 0.2) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [layout]);

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    cancelAnimationFrame(raf.current);
    pan.current.vx = pan.current.vy = 0;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() };
    wrap.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.lx;
    const dy = e.clientY - d.ly;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.moved = true;
      wrap.current?.classList.add("ms-home-drag");
    }
    if (!d.moved) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lt);
    pan.current.x += dx;
    pan.current.y += dy;
    pan.current.vx = (dx / dt) * 12;
    pan.current.vy = (dy / dt) * 12;
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = now;
    layout();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    wrap.current?.classList.remove("ms-home-drag");
    if (d.moved) {
      if (BUB_MOTION) glide();
      else layout();
      return;
    }
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(".ms-bub");
    const i = target ? els.current.indexOf(target) : -1;
    if (i >= 0) onTap(BUBBLES[i]);
  };
  const onWheel = (e: React.WheelEvent) => {
    cancelAnimationFrame(raf.current);
    pan.current.x -= e.deltaX;
    pan.current.y -= e.deltaY;
    layout();
  };

  return (
    <div className="ms-home">
      <div className="ms-home-glow" aria-hidden="true" />
      <div ref={wrap} className="ms-home-grid" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} role="group" aria-label="Apps">
        <div ref={rowsEl} className="ms-home-rows">
          {BUBBLE_SLOTS.map((row, r) => (
            <div key={r} className="ms-home-row" style={{ "--row-shift": String(ROW_SHIFT[r]) } as unknown as React.CSSProperties}>
              {row.map((s) => {
                const b = BUBBLES[s.i];
                const [a, c] = APP_COLOR[b.app];
                return (
                  <button
                    key={b.id}
                    ref={(el) => {
                      els.current[s.i] = el;
                    }}
                    type="button"
                    className={`ms-bub${b.tint ? " ms-bub-tint" : ""}${thumbs[s.i] ? " ms-bub-photo" : ""}${s.ring === 3 ? " ms-bub-far" : ""}`}
                    style={{ "--size": `${RING_SIZE[s.ring]}px`, "--a": a, "--b": c, ...(BUB_MOTION ? { animationDelay: `${40 + s.i * 30}ms` } : { animation: "none" }) } as unknown as React.CSSProperties}
                    title={b.label}
                    aria-label={b.label}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTap(b);
                      }
                    }}
                  >
                    <span className="ms-bub-in">
                      {thumbs[s.i] ? <img src={thumbs[s.i]!} alt="" draggable={false} loading="lazy" /> : null}
                      <span className="ms-bub-shine" />
                      <span className="ms-bub-body">
                        <Icon g={b.glyph} size={26} />
                      </span>
                    </span>
                    <span className="ms-bub-label">{b.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="ms-home-hint">Drag around · tap an app</div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

const isAppId = (s: string | null): s is AppId => Boolean(s) && (APP_ORDER as string[]).includes(s!);

export default function MarketingStudio({ loaderData }: Route.ComponentProps) {
  const { store, config, encryption, threads: initialThreads, messages: initialMessages, rows: initialRows, media: initialMedia, subjects: initialSubjects, threadId, models } = loaderData;
  const [params, setParams] = useSearchParams();
  const suffix = store ? `?store=${store.slug}` : "";
  const revalidator = useRevalidator();

  const [app, setAppState] = React.useState<AppId | null>(() => (threadId ? "chat" : isAppId(params.get("app")) ? (params.get("app") as AppId) : null));
  const [presetId, setPresetId] = React.useState<string | null>(() => params.get("preset"));
  /** a reference key handed from one app to another ("Make a video from this") */
  const [handoff, setHandoff] = React.useState<{ key: string; n: number } | null>(null);
  const [threads, setThreads] = React.useState<ThreadRow[]>(initialThreads);
  const [messages, setMessages] = React.useState<MessageRow[]>(initialMessages);
  const [rows, setRows] = React.useState<GenerationRow[]>(initialRows);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>(initialSubjects);
  const [media, setMedia] = React.useState<MediaItem[]>(initialMedia);
  const [model, setModel] = React.useState(config?.model ?? "claude-sonnet-5");
  const [showSettings, setShowSettings] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);

  React.useEffect(() => setThreads(initialThreads), [initialThreads]);
  React.useEffect(() => setRows(initialRows), [initialRows]);
  React.useEffect(() => setSubjects(initialSubjects), [initialSubjects]);
  React.useEffect(() => setMedia(initialMedia), [initialMedia]);
  React.useEffect(() => setMessages(initialMessages), [initialMessages]);

  const settings = useFetcher<Result>();
  const poll = useFetcher<typeof statusLoader>();

  const lastSettings = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (settings.state !== "idle" || !settings.data || settings.data === lastSettings.current) return;
    lastSettings.current = settings.data;
    setFlash(settings.data.ok ?? settings.data.error ?? null);
    if (settings.data.ok) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.state, settings.data]);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  /* ----------------------------------------------------------- polling */
  const pending = rows.some((r) => PENDING(r.status)) || subjects.some((s) => PENDING(s.status));
  React.useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (poll.state === "idle") poll.load(`/admin/studio/status${suffix}`);
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, suffix]);
  React.useEffect(() => {
    if (poll.state !== "idle" || !poll.data) return;
    setRows(poll.data.rows);
    setSubjects(poll.data.subjects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.data]);
  const wasPending = React.useRef(pending);
  React.useEffect(() => {
    if (wasPending.current && !pending) revalidator.revalidate();
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  /* ---------------------------------------------------------- routing */
  function setApp(next: AppId | null, preset?: string | null) {
    setAppState(next);
    setPresetId(preset ?? null);
    const p = new URLSearchParams(params);
    if (next) p.set("app", next);
    else p.delete("app");
    if (preset) p.set("preset", preset);
    else p.delete("preset");
    if (next !== "chat") p.delete("thread");
    setParams(p, { replace: true, preventScrollReset: true });
  }
  function tapBubble(b: Bubble) {
    setApp(b.app, b.preset ?? null);
  }
  /** From any result: open Website photos → Product video with this still as the source. */
  function makeVideo(key: string) {
    setHandoff({ key, n: Date.now() });
    setApp("website_photos", "video");
  }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && app && !document.querySelector(".ms-modal-back, .ms-lightbox")) setApp(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  const copyPath = (key: string) => {
    void navigator.clipboard?.writeText(`/media/${key}`);
    setFlash(`Copied /media/${key.slice(0, 18)}… — paste it in any image field on the site.`);
  };

  if (!store) {
    return (
      <div className="ms-desk">
        <style>{STYLE}</style>
        <div className="ms-empty-page">Create a store first.</div>
      </div>
    );
  }

  const shared = { store, suffix, media, rows, subjects, models, config: config!, flash: setFlash, revalidate: () => revalidator.revalidate(), copyPath, makeVideo, openApp: setApp, handoff };

  return (
    <div className="ms-desk">
      <style>{STYLE}</style>
      <div className="ms-window">
        {/* --------------------------------------------------- title bar */}
        <div className="ms-titlebar">
          <div className="ms-dots" aria-hidden="true">
            <span className="ms-dot ms-dot-r" />
            <span className="ms-dot ms-dot-y" />
            <span className="ms-dot ms-dot-g" />
          </div>
          <div className="ms-title">
            {app ? <AppDisc app={app} size={20} /> : <GoldMark />}
            <span>{app ? APP_INFO[app].label : "Marketing Studio"}</span>
            <span className="ms-store">{store.name}</span>
          </div>
          <div className="ms-titlebar-right">
            {app ? (
              <button type="button" className="ms-back" onClick={() => setApp(null)} title="Back to the apps (Esc)">
                ⌘← Home
              </button>
            ) : null}
            <button type="button" className="ms-icon-btn" onClick={() => setShowSettings((s) => !s)} title="Keys and settings" aria-label="Settings">
              <Icon g="gear" size={17} />
            </button>
          </div>
        </div>

        {showSettings ? <SettingsCard config={config!} encryption={encryption} fetcher={settings} onClose={() => setShowSettings(false)} /> : null}
        {flash ? <div className="ms-flash">{flash}</div> : null}

        <div className="ms-body">
          {/* ------------------------------------------------- rail */}
          <nav className="ms-rail" aria-label="Apps">
            <button type="button" className={`ms-rail-btn${!app ? " on" : ""}`} onClick={() => setApp(null)} title="Home">
              <span className="ms-rail-home">
                <Icon g="home" size={18} />
              </span>
            </button>
            {APP_ORDER.map((id) => (
              <button key={id} type="button" className={`ms-rail-btn${app === id ? " on" : ""}`} onClick={() => setApp(id)} title={APP_INFO[id].label}>
                <AppDisc app={id} size={36} />
                {id === "training" && subjects.some((s) => PENDING(s.status)) ? <span className="ms-rail-dot" /> : null}
                {(STUDIO_SECTIONS as readonly string[]).includes(id) && rows.some((r) => PENDING(r.status) && sectionOf(r) === id) ? <span className="ms-rail-dot" /> : null}
              </button>
            ))}
          </nav>

          {/* ------------------------------------------------- pane */}
          <section className="ms-pane" aria-label="Studio">
            {!app ? <BubbleHome media={media} onTap={tapBubble} /> : null}
            {app ? (
              <div key={app} className="ms-sheet">
                {(STUDIO_SECTIONS as readonly string[]).includes(app) ? (
                  <SectionApp key={app} section={app as StudioSection} presetId={presetId} onPreset={(id) => setApp(app, id)} {...shared} />
                ) : app === "assets" ? (
                  <AssetsApp {...shared} />
                ) : app === "training" ? (
                  <TrainingApp {...shared} />
                ) : app === "batches" ? (
                  <BatchesApp {...shared} />
                ) : app === "emails" ? (
                  <EmailsApp {...shared} />
                ) : (
                  <ChatApp {...shared} threads={threads} setThreads={setThreads} messages={messages} setMessages={setMessages} threadId={threadId} model={model} setModel={setModel} params={params} setParams={setParams} hasAnthropic={Boolean(config?.hasAnthropic)} />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

type Shared = {
  store: { id: string; slug: string; name: string };
  suffix: string;
  media: MediaItem[];
  rows: GenerationRow[];
  subjects: SubjectRow[];
  models: ModelCard[];
  config: { falKeyId: string | null; hasAnthropic: boolean; model: string };
  flash: (s: string | null) => void;
  revalidate: () => void;
  copyPath: (key: string) => void;
  makeVideo: (key: string) => void;
  openApp: (app: AppId | null, preset?: string | null) => void;
  handoff: { key: string; n: number } | null;
};

function GoldMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="ms-mark">
      <defs>
        <linearGradient id="msGold" x1="4" y1="4" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F5D67A" />
          <stop offset="0.55" stopColor="#C9A227" />
          <stop offset="1" stopColor="#8A6A12" />
        </linearGradient>
      </defs>
      <path d="M11 11.5V9a5 5 0 0 1 10 0v2.5" fill="none" stroke="url(#msGold)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6.5 11.5h19l1.6 15.2a2 2 0 0 1-2 2.3H6.9a2 2 0 0 1-2-2.3z" fill="url(#msGold)" />
      <path d="M11.2 20.4l3.4 3.2 6.6-6.4" fill="none" stroke="#3B2A05" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

/** A small header inside a sheet: icon, name, blurb, and anything on the right. */
function AppHead({ app, right, sub }: { app: AppId; right?: React.ReactNode; sub?: string }) {
  return (
    <div className="ms-app-head">
      <AppDisc app={app} size={40} />
      <div className="ms-app-head-text">
        <div className="ms-app-title">{APP_INFO[app].label}</div>
        <div className="ms-app-sub">{sub ?? APP_INFO[app].blurb}</div>
      </div>
      <div className="ms-app-head-right">{right}</div>
    </div>
  );
}

function Empty({ title, help, action }: { title: string; help: string; action?: React.ReactNode }) {
  return (
    <div className="ms-empty">
      <div className="ms-empty-title">{title}</div>
      <div className="ms-empty-help">{help}</div>
      {action ? <div className="ms-empty-action">{action}</div> : null}
    </div>
  );
}

function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "1:23" since a timestamp, ticking every second while mounted. */
function useElapsed(since: Date | string | null): string {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  // Empty until mounted: the server's clock and the browser's differ, and a
  // seconds counter rendered on both sides never hydrates cleanly.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (!since) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since || !mounted) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Elapsed({ since }: { since: Date | string }) {
  return <>{useElapsed(since)}</>;
}

function fileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------ section app */

function SectionApp({ section, presetId, onPreset, media, rows, subjects, models, store, flash, makeVideo, copyPath, handoff }: Shared & { section: StudioSection; presetId: string | null; onPreset: (id: string) => void }) {
  const list = presetsFor(section);
  const preset = list.find((p) => p.id === presetId) ?? list[0];
  const [opts, setOpts] = React.useState<Opts>(() => defaults(preset));
  const [ref, setRef] = React.useState<string | null>(null);
  const [picker, setPicker] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<string>("");
  const gen = useFetcher<Result>();
  const del = useFetcher<Result>();
  const busy = gen.state !== "idle";

  React.useEffect(() => setOpts(defaults(preset)), [preset.id]);
  React.useEffect(() => {
    if (handoff) setRef(handoff.key);
  }, [handoff]);
  // Default reference: the first product-looking picture in Media.
  React.useEffect(() => {
    if (ref) return;
    const hit = media.find((m) => m.mime.startsWith("image/") && !isStudioKey(m.key) && !m.key.startsWith("train-")) ?? media.find((m) => m.mime.startsWith("image/"));
    if (hit) setRef(hit.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);
  const lastGen = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (gen.state !== "idle" || !gen.data || gen.data === lastGen.current) return;
    lastGen.current = gen.data;
    flash(gen.data.ok ?? gen.data.error ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.state, gen.data]);

  const set = (k: string, v: string | boolean) => setOpts((o) => ({ ...o, [k]: v }));
  const modelId = preset.kind === "ugc" ? String(opts.model ?? "seedance-2") : (preset.model ?? String(opts.model ?? "gpt-image-2-edit"));
  const modelCard = models.find((m) => m.id === modelId) ?? null;
  const kind: "image" | "video" | "ugc" = preset.kind === "ugc" ? "ugc" : preset.id === "custom" ? (modelCard?.kind ?? "image") : preset.kind;
  const count = Math.max(1, Number(opts.count ?? 1));
  const seconds = Number(opts.duration ?? 6);
  const price =
    kind === "image" ? (subjectId ? PRICES.fluxLora : PRICES.gptImage.high) * count : kind === "video" ? videoPrice(modelId, seconds, opts.audio !== false) : PRICES.gptImage.high + videoPrice(modelId, seconds, true);
  const readySubjects = subjects.filter((s) => s.status === "ready");
  const [usedIds, setUsedIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    try { setUsedIds(readySubjects.filter((s) => localStorage.getItem(`ms.model.${s.id}`) === "on").map((s) => s.id)); } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);
  const usedSubjects = readySubjects.filter((s) => usedIds.includes(s.id));
  const needsRef = kind === "ugc" || Boolean(modelCard?.needsImage);

  function generate() {
    const fd = new FormData();
    fd.set("intent", "generate");
    fd.set("kind", kind);
    fd.set("section", section);
    fd.set("label", preset.title);
    if (ref) fd.set("inputKey", ref);
    if (kind === "ugc") {
      fd.set("product", String(opts.product ?? ""));
      fd.set("script", String(opts.script ?? ""));
      fd.set("creator", String(opts.creator ?? ""));
      fd.set("setting", String(opts.setting ?? ""));
      fd.set("videoModel", modelId);
      fd.set("duration", String(opts.duration ?? "8"));
    } else {
      let m = modelId;
      if (kind === "image" && subjectId) m = "flux-lora";
      else if (kind === "image" && !ref && m === "gpt-image-2-edit") m = "gpt-image-2";
      fd.set("model", m);
      if (subjectId) fd.set("subjectId", subjectId);
      const subject = readySubjects.find((s) => s.id === subjectId);
      const prompt = preset.compose(opts);
      fd.set("prompt", subject ? `${subject.triggerWord}, ${prompt}` : prompt);
      fd.set("aspect", String(opts.aspect ?? ""));
      fd.set("duration", String(opts.duration ?? ""));
      fd.set("count", String(count));
      if (opts.audio !== false) fd.set("audio", "on");
    }
    gen.submit(fd, { method: "post" });
  }

  const mine = rows.filter((r) => sectionOf(r) === section);
  const [a, b] = APP_COLOR[section];

  return (
    <div className="ms-app" style={{ "--a": a, "--b": b } as React.CSSProperties}>
      <AppHead app={section} sub={SECTION_INFO[section].purpose} />
      <div className="ms-chips">
        {list.map((p) => (
          <button key={p.id} type="button" className={`ms-chip-preset${p.id === preset.id ? " on" : ""}`} onClick={() => onPreset(p.id)}>
            <AppDisc app={section} size={30} glyph={p.glyph} tint={p.id !== preset.id} />
            <span>{p.title}</span>
          </button>
        ))}
      </div>

      <div className="ms-recipe">
        <div className="ms-recipe-fields">
          <div className="ms-recipe-title">
            {preset.title}
            <span className="ms-muted"> · {preset.sub}</span>
          </div>

          {needsRef || preset.id === "custom" ? (
            <div className="ms-field-row">
              <div className="ms-field-label">{preset.refLabel}</div>
              <div className="ms-ref">
                {ref ? <img src={`/media/${ref}`} alt="" /> : <span className="ms-ref-empty">None</span>}
                <div className="ms-ref-actions">
                  <button type="button" className="ms-btn ms-btn-small" onClick={() => setPicker(true)}>
                    {ref ? "Change" : "Pick from Assets"}
                  </button>
                  {ref && preset.id === "custom" ? (
                    <button type="button" className="ms-btn ms-btn-small" onClick={() => setRef(null)}>
                      None
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {preset.fields.map((f) => (
            <FieldRow key={f.key} field={f} opts={opts} set={set} models={models} modelId={modelId} presetKind={preset.kind} />
          ))}

          {kind === "image" && readySubjects.length ? (
            <div className="ms-field-row">
              <div className="ms-field-label">Trained model</div>
              <div className="ms-seg">
                <button type="button" className={subjectId ? "" : "on"} onClick={() => setSubjectId("")}>
                  None
                </button>
                {(usedSubjects.length ? usedSubjects : readySubjects).map((s) => (
                  <button key={s.id} type="button" className={subjectId === s.id ? "on" : ""} onClick={() => setSubjectId(s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ms-generate-row">
            <button type="button" className="ms-generate" disabled={busy || (needsRef && !ref)} onClick={generate}>
              <Icon g="sparkles" size={18} />
              {busy ? "Starting…" : preset.cta}
            </button>
            <div className="ms-price">
              ~{usd(price)} on your fal key
              {modelCard ? <span className="ms-muted"> · {modelCard.label}</span> : null}
            </div>
          </div>
        </div>
        {kind !== "ugc" ? (
          <details className="ms-prompt-peek">
            <summary>The prompt it will send</summary>
            <pre>{preset.compose(opts)}</pre>
          </details>
        ) : null}
      </div>

      <div className="ms-results-head">
        <span>Results in {APP_INFO[section].label}</span>
        <span className="ms-muted">{mine.length ? `${mine.length} run${mine.length > 1 ? "s" : ""}` : ""}</span>
      </div>
      {mine.length ? (
        <div className="ms-results">
          {mine.map((r) => (
            <ResultCard key={r.id} row={r} onVideo={makeVideo} onReference={(k) => setRef(k)} onCopy={copyPath} onDelete={() => del.submit({ intent: "delete-generation", id: r.id }, { method: "post" })} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing made here yet" help={`Pick a preset above, choose a reference picture, and press ${preset.cta}. Results land here and in Assets.`} />
      )}

      {picker ? <MediaPicker media={media} title={preset.refLabel} single onClose={() => setPicker(false)} onPick={(keys) => { setRef(keys[0] ?? null); setPicker(false); }} /> : null}
    </div>
  );
}

function FieldRow({ field: f, opts, set, models, modelId, presetKind }: { field: Field; opts: Opts; set: (k: string, v: string | boolean) => void; models: ModelCard[]; modelId: string; presetKind: Preset["kind"] }) {
  const modelCard = models.find((m) => m.id === modelId);
  if (f.type === "choice") {
    return (
      <div className="ms-field-row">
        <div className="ms-field-label">{f.label}</div>
        <div className="ms-choices">
          {f.options.map((o) => (
            <button key={o.value} type="button" className={`ms-choice${opts[f.key] === o.value ? " on" : ""}`} onClick={() => set(f.key, o.value)}>
              {o.swatch ? <span className="ms-swatch" style={{ background: o.swatch }} /> : null}
              {o.label}
            </button>
          ))}
        </div>
        {f.hint ? <div className="ms-hint">{f.hint}</div> : null}
      </div>
    );
  }
  if (f.type === "text") {
    return (
      <div className="ms-field-row">
        <div className="ms-field-label">{f.label}</div>
        {f.long ? (
          <textarea className="ms-field ms-field-long" rows={3} value={String(opts[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
        ) : (
          <input className="ms-field" value={String(opts[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
        )}
        {f.hint ? <div className="ms-hint">{f.hint}</div> : null}
      </div>
    );
  }
  if (f.type === "toggle") {
    if (f.key === "audio" && modelCard?.kind !== "video" && presetKind !== "video") return null;
    return (
      <div className="ms-field-row ms-field-inline">
        <button type="button" className={`ms-toggle${opts[f.key] ? " on" : ""}`} onClick={() => set(f.key, !opts[f.key])} aria-pressed={Boolean(opts[f.key])}>
          <span />
        </button>
        <div>
          <div className="ms-field-label">{f.label}</div>
          {f.hint ? <div className="ms-hint">{f.hint}</div> : null}
        </div>
      </div>
    );
  }
  if (f.type === "model") {
    const list = models.filter((m) => (f.ids.length ? f.ids.includes(m.id) : true));
    return (
      <div className="ms-field-row">
        <div className="ms-field-label">{f.label}</div>
        <div className="ms-models">
          {list.map((m) => {
            const rate = m.kind === "video" ? `${usd(PRICES.videoPerSecond[m.id] ?? 0.3)}/s` : m.id === "flux-lora" ? usd(PRICES.fluxLora) : `${usd(PRICES.gptImage.high)}/img`;
            return (
              <button key={m.id} type="button" className={`ms-model${opts[f.key] === m.id ? " on" : ""}`} onClick={() => set(f.key, m.id)}>
                <div className="ms-model-name">{m.label}</div>
                <div className="ms-model-note">{m.note}</div>
                <div className="ms-model-rate">{rate}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (f.type === "aspect") {
    const allowed = modelCard ? f.options.filter((o) => modelCard.aspects.includes(o.value)) : f.options;
    if (!allowed.length || presetKind === "ugc") return null;
    return (
      <div className="ms-field-row">
        <div className="ms-field-label">{f.label}</div>
        <div className="ms-seg">
          {allowed.map((o) => (
            <button key={o.value} type="button" className={opts.aspect === o.value ? "on" : ""} onClick={() => set("aspect", o.value)}>
              {o.label} <span className="ms-muted">{o.value}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "length") {
    const durations = modelCard?.durations ?? null;
    if (!durations || (modelCard?.kind !== "video" && presetKind !== "ugc")) return null;
    return (
      <div className="ms-field-row">
        <div className="ms-field-label">{f.label}</div>
        <div className="ms-seg">
          {durations.map((d) => (
            <button key={d} type="button" className={String(opts.duration) === d ? "on" : ""} onClick={() => set("duration", d)}>
              {d}s
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "count") {
    if (modelCard?.kind === "video") return null;
    return (
      <div className="ms-field-row">
        <div className="ms-field-label">{f.label}</div>
        <div className="ms-seg">
          {["1", "2", "3", "4"].map((n) => (
            <button key={n} type="button" className={String(opts.count ?? "1") === n ? "on" : ""} onClick={() => set("count", n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

/** One generation in a results grid: shimmer while pending, then its files with actions. */
function ResultCard({ row, onVideo, onReference, onCopy, onDelete }: { row: GenerationRow; onVideo: (k: string) => void; onReference: (k: string) => void; onCopy: (k: string) => void; onDelete: () => void }) {
  const label = String(row.params.label ?? row.prompt);
  if (PENDING(row.status)) {
    return (
      <div className="ms-card">
        <div className="ms-shimmer" />
        <div className="ms-card-foot">
          <span className="ms-card-label">{row.kind === "ugc" ? (row.stage === 1 ? "Still first…" : "Now the video…") : row.status === "queued" ? "Queued" : "Rendering…"}</span>
          <span className="ms-muted">
            <Elapsed since={row.createdAt} />
          </span>
        </div>
      </div>
    );
  }
  if (row.status !== "completed") {
    return (
      <div className="ms-card ms-card-failed">
        <div className="ms-card-err">{row.error ?? row.status}</div>
        <div className="ms-card-foot">
          <span className="ms-card-label">{label}</span>
          <button type="button" className="ms-x" onClick={onDelete} title="Remove">
            ×
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {row.outputKeys.map((key) => (
        <AssetCard key={key} mediaKey={key} label={label} onReference={onReference} onVideo={onVideo} onCopy={onCopy} onDelete={onDelete} />
      ))}
    </>
  );
}

function AssetCard({ mediaKey, label, onReference, onVideo, onCopy, onDelete }: { mediaKey: string; label: string; onReference?: (key: string) => void; onVideo?: (key: string) => void; onCopy?: (key: string) => void; onDelete?: () => void }) {
  const video = isVideoKey(mediaKey);
  return (
    <div className="ms-card">
      {video ? <video src={`/media/${mediaKey}`} controls playsInline preload="metadata" /> : <img src={`/media/${mediaKey}`} alt={label} loading="lazy" />}
      <div className="ms-card-foot">
        <span className="ms-card-label" title={label}>
          {label}
        </span>
        <div className="ms-card-actions">
          {!video && onVideo ? (
            <button type="button" onClick={() => onVideo(mediaKey)} title="Make a video from this">
              <Icon g="film" size={14} />
            </button>
          ) : null}
          {!video && onReference ? (
            <button type="button" onClick={() => onReference(mediaKey)} title="Use as reference">
              Ref
            </button>
          ) : null}
          {onCopy ? (
            <button type="button" onClick={() => onCopy(mediaKey)} title="Use on site (copy the address)">
              <Icon g="browser" size={14} />
            </button>
          ) : null}
          <a href={`/media/${mediaKey}`} download title="Download">
            ↓
          </a>
          {onDelete ? (
            <button type="button" onClick={onDelete} title="Delete this run">
              ×
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- assets app */

type AssetFilter = "all" | "images" | "videos" | "studio" | "training";
const assetFilter = (f: AssetFilter) => (m: MediaItem) =>
  f === "images" ? m.mime.startsWith("image/") : f === "videos" ? m.mime.startsWith("video/") || isVideoKey(m.key) : f === "studio" ? isStudioKey(m.key) : f === "training" ? m.key.startsWith("train-") : true;

function AssetsApp({ media, suffix, flash, revalidate, copyPath, makeVideo }: Shared) {
  const [filter, setFilter] = React.useState<AssetFilter>("all");
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState<number | null>(null);
  const upload = useFetcher<Result>();
  const del = useFetcher<{ ok?: string; error?: string }>();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const list = media.filter(assetFilter(filter)).filter((m) => !q || m.filename.toLowerCase().includes(q.toLowerCase()) || m.key.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const lastUp = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (upload.state !== "idle" || !upload.data || upload.data === lastUp.current) return;
    lastUp.current = upload.data;
    flash(upload.data.ok ?? upload.data.error ?? null);
    if (upload.data.ok) revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload.state, upload.data]);
  const lastDel = React.useRef<unknown>(undefined);
  React.useEffect(() => {
    if (del.state !== "idle" || !del.data || del.data === lastDel.current) return;
    lastDel.current = del.data;
    flash(del.data.ok ? "Deleted." : (del.data.error ?? null));
    setPicked([]);
    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [del.state, del.data]);

  function removePicked(ids: string[] = picked) {
    if (!ids.length || !window.confirm(`Delete ${ids.length} file${ids.length > 1 ? "s" : ""}? Anywhere they are used on the site will break.`)) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    for (const id of ids) fd.append("mediaId", id);
    del.submit(fd, { method: "post", action: `/admin/media${suffix}` });
  }
  function downloadPicked() {
    const keys = media.filter((m) => picked.includes(m.id)).map((m) => m.key);
    keys.forEach((k, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = `/media/${k}`;
        a.download = k;
        a.click();
      }, i * 250);
    });
  }

  return (
    <div className="ms-app">
      <AppHead
        app="assets"
        sub={`${media.length} file${media.length === 1 ? "" : "s"} in Media`}
        right={
          <>
            <input ref={fileRef} type="file" accept="image/*,video/*" hidden multiple onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) { const fd = new FormData(); fd.set("intent", "upload"); fd.set("file", f); upload.submit(fd, { method: "post", encType: "multipart/form-data" }); } e.target.value = ""; }} />
            <button type="button" className="ms-btn ms-btn-accent" style={{ "--a": APP_COLOR.assets[0], "--b": APP_COLOR.assets[1] } as React.CSSProperties} onClick={() => fileRef.current?.click()} disabled={upload.state !== "idle"}>
              {upload.state !== "idle" ? "Uploading…" : "Upload"}
            </button>
          </>
        }
      />
      <div className="ms-toolbar">
        <div className="ms-seg">
          {([["all", "All"], ["images", "Images"], ["videos", "Videos"], ["studio", "Studio-made"], ["training", "Training set"]] as [AssetFilter, string][]).map(([f, l]) => (
            <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {l}
            </button>
          ))}
        </div>
        <input className="ms-field ms-search" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
        {picked.length ? (
          <div className="ms-selbar">
            <span>{picked.length} selected</span>
            <button type="button" className="ms-btn ms-btn-small" onClick={downloadPicked}>Download</button>
            {picked.length === 1 ? <button type="button" className="ms-btn ms-btn-small" onClick={() => copyPath(media.find((m) => m.id === picked[0])!.key)}>Use on site</button> : null}
            <button type="button" className="ms-btn ms-btn-small ms-btn-danger" onClick={() => removePicked()} disabled={del.state !== "idle"}>Delete</button>
            <button type="button" className="ms-btn ms-btn-small" onClick={() => setPicked([])}>Clear</button>
          </div>
        ) : null}
      </div>
      {list.length ? (
        <div className="ms-assets">
          {list.map((m, i) => {
            const video = m.mime.startsWith("video/") || isVideoKey(m.key);
            const on = picked.includes(m.id);
            return (
              <div key={m.id} className={`ms-asset${on ? " on" : ""}`}>
                <button type="button" className="ms-asset-open" onClick={() => setOpen(i)} title={m.filename}>
                  {video ? <video src={`/media/${m.key}`} muted playsInline preload="metadata" /> : <img src={`/media/${m.key}`} alt="" loading="lazy" />}
                </button>
                <button type="button" className="ms-asset-check" aria-label={on ? "Deselect" : "Select"} aria-pressed={on} onClick={() => toggle(m.id)}>
                  {on ? "✓" : ""}
                </button>
                {isStudioKey(m.key) ? <span className="ms-asset-tag">studio</span> : m.key.startsWith("train-") ? <span className="ms-asset-tag">training</span> : null}
                <div className="ms-asset-name">{m.filename}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title={media.length ? "No files match" : "No files yet"} help={media.length ? "Try another filter or a shorter search." : "Upload your product pictures here, then make shots from them in any section."} action={<button type="button" className="ms-btn" onClick={() => fileRef.current?.click()}>Upload files</button>} />
      )}
      {open !== null && list[open] ? (
        <Lightbox
          item={list[open]}
          index={open}
          total={list.length}
          onClose={() => setOpen(null)}
          onStep={(d) => setOpen((o) => (o === null ? null : (o + d + list.length) % list.length))}
          onCopy={copyPath}
          onVideo={makeVideo}
          onDelete={() => { const id = list[open].id; setOpen(null); removePicked([id]); }}
        />
      ) : null}
    </div>
  );
}

function Lightbox({ item, index, total, onClose, onStep, onCopy, onVideo, onDelete }: { item: MediaItem; index: number; total: number; onClose: () => void; onStep: (d: number) => void; onCopy: (k: string) => void; onVideo: (k: string) => void; onDelete: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onStep]);
  const video = item.mime.startsWith("video/") || isVideoKey(item.key);
  return (
    <div className="ms-lightbox" onClick={onClose} role="dialog" aria-label={item.filename}>
      <button type="button" className="ms-lb-nav ms-lb-prev" onClick={(e) => { e.stopPropagation(); onStep(-1); }} aria-label="Previous">‹</button>
      <div className="ms-lb-body" onClick={(e) => e.stopPropagation()}>
        {video ? <video src={`/media/${item.key}`} controls autoPlay playsInline /> : <img src={`/media/${item.key}`} alt={item.filename} />}
        <div className="ms-lb-bar">
          <div className="ms-lb-meta">
            <div className="ms-lb-name">{item.filename}</div>
            <div className="ms-muted">{index + 1} / {total}{item.sizeBytes ? ` · ${fileSize(item.sizeBytes)}` : ""} · {timeAgo(item.createdAt)}</div>
          </div>
          <div className="ms-lb-actions">
            {!video ? <button type="button" className="ms-btn ms-btn-small" onClick={() => { onVideo(item.key); onClose(); }}>Make a video</button> : null}
            <button type="button" className="ms-btn ms-btn-small" onClick={() => onCopy(item.key)}>Use on site</button>
            <a className="ms-btn ms-btn-small" href={`/media/${item.key}`} download>Download</a>
            <button type="button" className="ms-btn ms-btn-small ms-btn-danger" onClick={onDelete}>Delete</button>
          </div>
        </div>
      </div>
      <button type="button" className="ms-lb-nav ms-lb-next" onClick={(e) => { e.stopPropagation(); onStep(1); }} aria-label="Next">›</button>
      <button type="button" className="ms-lb-close" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

/** Pick one or several pictures from Media. */
function MediaPicker({ media, title, single, preselect, onClose, onPick, foot }: { media: MediaItem[]; title: string; single?: boolean; preselect?: string[]; onClose: () => void; onPick: (keys: string[]) => void; foot?: (picked: string[]) => React.ReactNode }) {
  const [q, setQ] = React.useState("");
  const [only, setOnly] = React.useState<"all" | "uploads" | "generated">("all");
  const [picked, setPicked] = React.useState<string[]>(preselect ?? []);
  const list = media
    .filter((m) => m.mime.startsWith("image/"))
    .filter((m) => (only === "uploads" ? !isStudioKey(m.key) : only === "generated" ? isStudioKey(m.key) : true))
    .filter((m) => !q || m.filename.toLowerCase().includes(q.toLowerCase()) || m.key.toLowerCase().includes(q.toLowerCase()));
  const toggle = (k: string) => {
    if (single) return onPick([k]);
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };
  return (
    <div className="ms-modal-back" onClick={onClose}>
      <div className="ms-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="ms-modal-head">
          <div className="ms-modal-title">{title}</div>
          <button type="button" className="ms-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="ms-modal-tools">
          <input className="ms-field" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ms-seg">
            {(["all", "uploads", "generated"] as const).map((f) => (
              <button key={f} type="button" className={only === f ? "on" : ""} onClick={() => setOnly(f)}>{f}</button>
            ))}
          </div>
        </div>
        <div className="ms-modal-grid">
          {list.map((m) => (
            <button key={m.key} type="button" className={`ms-pick${picked.includes(m.key) ? " on" : ""}`} onClick={() => toggle(m.key)} title={m.filename}>
              <img src={`/media/${m.key}`} alt="" loading="lazy" />
            </button>
          ))}
          {!list.length ? <div className="ms-empty-help">No pictures match. Upload some in Assets first.</div> : null}
        </div>
        {!single ? (
          <div className="ms-modal-foot">
            <span className="ms-muted">{picked.length} picked</span>
            {foot ? foot(picked) : <button type="button" className="ms-btn ms-btn-accent" disabled={!picked.length} onClick={() => onPick(picked)}>Use {picked.length}</button>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- training app */

const SAMPLE_PROMPTS = (trigger: string) => [
  `${trigger}, studio product photograph on seamless white, three-quarter view, soft contact shadow`,
  `${trigger} on a bedroom floor beside the bed, soft morning daylight, candid iPhone photo`,
  `${trigger} on a smooth lilac-to-pink gradient, a liquid-chrome ring behind it, paid social ad`,
];

function TrainingApp({ subjects, media, flash, revalidate }: Shared) {
  const [form, setForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"product" | "style" | "person">("product");
  const [keys, setKeys] = React.useState<string[]>(() => media.filter((m) => m.key.startsWith("train-bodies-") && m.mime.startsWith("image/")).map((m) => m.key));
  const [picker, setPicker] = React.useState(false);
  const train = useFetcher<Result>();
  const busy = train.state !== "idle";
  const trigger = (name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "SUBJECT").slice(0, 24);
  const lastT = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (train.state !== "idle" || !train.data || train.data === lastT.current) return;
    lastT.current = train.data;
    flash(train.data.ok ?? train.data.error ?? null);
    if (train.data.ok) { setForm(false); revalidate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [train.state, train.data]);

  function start() {
    const fd = new FormData();
    fd.set("intent", "train");
    fd.set("name", name.trim() || trigger);
    fd.set("trigger", trigger);
    for (const k of keys) fd.append("mediaKey", k);
    train.submit(fd, { method: "post" });
  }
  const [a, b] = APP_COLOR.training;

  return (
    <div className="ms-app" style={{ "--a": a, "--b": b } as React.CSSProperties}>
      <AppHead app="training" sub="A model trained on 3–30 pictures draws your product exactly, every time." right={<button type="button" className="ms-btn ms-btn-accent" onClick={() => setForm((f) => !f)}>{form ? "Close" : "Train new"}</button>} />

      {form ? (
        <div className="ms-panel">
          <div className="ms-panel-title">New model</div>
          <div className="ms-form-grid">
            <div className="ms-field-row">
              <div className="ms-field-label">Name</div>
              <input className="ms-field" placeholder="The board" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="ms-hint">Trigger word: <code>{trigger}</code> — it goes at the start of every prompt that uses this model.</div>
            </div>
            <div className="ms-field-row">
              <div className="ms-field-label">Type</div>
              <div className="ms-seg">
                {([["product", "Product"], ["style", "Style"], ["person", "Person"]] as const).map(([v, l]) => (
                  <button key={v} type="button" className={type === v ? "on" : ""} onClick={() => setType(v)}>{l}</button>
                ))}
              </div>
              <div className="ms-hint">{type === "product" ? "Same object from many angles and lights." : type === "style" ? "Pictures that share one look; the model learns the look, not the object." : "One person, many expressions and angles. Get their consent."}</div>
            </div>
          </div>
          <div className="ms-field-row">
            <div className="ms-field-label">Pictures · {keys.length} picked{keys.length < 3 ? " (at least 3)" : ""}</div>
            <div className="ms-train-strip">
              {keys.map((k) => (
                <button key={k} type="button" className="ms-train-thumb" title="Remove" onClick={() => setKeys((p) => p.filter((x) => x !== k))}>
                  <img src={`/media/${k}`} alt="" />
                </button>
              ))}
              <button type="button" className="ms-train-add" onClick={() => setPicker(true)}>+ Pick from Assets</button>
            </div>
          </div>
          <div className="ms-generate-row">
            <button type="button" className="ms-generate" disabled={busy || keys.length < 3} onClick={start}>
              <Icon g="brain" size={18} />
              {busy ? "Starting…" : `Train ${name.trim() || "model"}`}
            </button>
            <div className="ms-price">$2 per training on your fal key · about five minutes</div>
          </div>
        </div>
      ) : null}

      {subjects.length ? (
        <div className="ms-subjects">
          {subjects.map((s) => (
            <SubjectCard key={s.id} s={s} />
          ))}
        </div>
      ) : !form ? (
        <Empty title="No models trained yet" help="Train one on your product pictures and every preset can draw it exactly. It costs $2 and takes about five minutes." action={<button type="button" className="ms-btn ms-btn-accent" onClick={() => setForm(true)}>Train new</button>} />
      ) : null}

      {picker ? <MediaPicker media={media} title="Training pictures" preselect={keys} onClose={() => setPicker(false)} onPick={(k) => { setKeys(k); setPicker(false); }} /> : null}
    </div>
  );
}

function SubjectCard({ s }: { s: SubjectRow }) {
  const pending = PENDING(s.status);
  const elapsed = useElapsed(pending ? s.createdAt : null);
  const [use, setUse] = React.useState(false);
  React.useEffect(() => {
    try { setUse(localStorage.getItem(`ms.model.${s.id}`) === "on"); } catch { /* private mode */ }
  }, [s.id]);
  const toggle = () => {
    const next = !use;
    setUse(next);
    try { localStorage.setItem(`ms.model.${s.id}`, next ? "on" : "off"); } catch { /* ignore */ }
  };
  // Training runs about five minutes; the ring shows how far along that is.
  const secs = pending ? Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 1000) : 0;
  const progress = pending ? Math.min(0.95, secs / 300) : s.status === "ready" ? 1 : 0;
  return (
    <div className={`ms-subject ms-subject-${s.status}`}>
      <div className="ms-subject-thumbs">
        {s.mediaKeys.slice(0, 4).map((k) => (
          <img key={k} src={`/media/${k}`} alt="" />
        ))}
      </div>
      <div className="ms-subject-body">
        <div className="ms-subject-top">
          <div className="ms-subject-name">{s.name}</div>
          <span className={`ms-pill ms-pill-${s.status}`}>
            {s.status === "queued" ? "Queued" : s.status === "in_progress" ? `Training · ${elapsed}` : s.status === "ready" ? "Ready" : "Failed"}
          </span>
        </div>
        <div className="ms-subject-sub">
          Trigger <code>{s.triggerWord}</code> · {s.mediaKeys.length} pictures · {s.status === "ready" ? `trained ${timeAgo(s.updatedAt)}` : `started ${timeAgo(s.createdAt)}`}
        </div>
        {s.status === "failed" && s.error ? <div className="ms-card-err">{s.error}</div> : null}
        {s.status === "ready" ? (
          <>
            <label className="ms-use-row">
              <button type="button" className={`ms-toggle${use ? " on" : ""}`} onClick={toggle} aria-pressed={use}><span /></button>
              <span>Use in presets</span>
            </label>
            <details className="ms-prompt-peek">
              <summary>Sample prompts</summary>
              {SAMPLE_PROMPTS(s.triggerWord).map((p) => (
                <pre key={p}>{p}</pre>
              ))}
            </details>
          </>
        ) : null}
      </div>
      {pending || s.status === "ready" ? (
        <svg className="ms-ring" viewBox="0 0 36 36" width="44" height="44" aria-hidden="true">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#msRing)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${progress * 97.4} 97.4`} transform="rotate(-90 18 18)" />
          <defs>
            <linearGradient id="msRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#9C6BFF" />
              <stop offset="1" stopColor="#5B2EE0" />
            </linearGradient>
          </defs>
        </svg>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ batches app */

function BatchesApp({ rows, suffix, media, models, flash, revalidate, makeVideo, copyPath }: Shared) {
  const groups = new Map<string, GenerationRow[]>();
  for (const r of rows) {
    const id = typeof r.params.batchId === "string" ? r.params.batchId : null;
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const [form, setForm] = React.useState(groups.size === 0);
  const [brief, setBrief] = React.useState("");
  const [hooks, setHooks] = React.useState("");
  const [count, setCount] = React.useState(4);
  const [modelId, setModelId] = React.useState("ltx-2-pro");
  const [duration, setDuration] = React.useState("6");
  const [ref, setRef] = React.useState<string | null>(() => media.find((m) => m.mime.startsWith("image/") && !isStudioKey(m.key))?.key ?? null);
  const [picker, setPicker] = React.useState(false);
  const batch = useFetcher<Result>();
  const busy = batch.state !== "idle";
  const videoModels = models.filter((m) => m.kind === "video");
  const modelCard = videoModels.find((m) => m.id === modelId) ?? videoModels[0];
  const price = count * (PRICES.gptImage.high + videoPrice(modelId, Number(duration), true));
  const lastB = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (batch.state !== "idle" || !batch.data || batch.data === lastB.current) return;
    lastB.current = batch.data;
    flash(batch.data.ok ?? batch.data.error ?? null);
    if (batch.data.ok) { setForm(false); revalidate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.state, batch.data]);
  React.useEffect(() => {
    if (modelCard?.durations && !modelCard.durations.includes(duration)) setDuration(modelCard.durations[0]);
  }, [modelCard, duration]);

  function start() {
    const fd = new FormData();
    fd.set("intent", "batch");
    fd.set("brief", brief);
    fd.set("hooks", hooks);
    fd.set("count", String(count));
    fd.set("model", modelId);
    fd.set("duration", duration);
    if (ref) fd.set("inputKey", ref);
    batch.submit(fd, { method: "post" });
  }
  const [a, b] = APP_COLOR.batches;

  return (
    <div className="ms-app" style={{ "--a": a, "--b": b } as React.CSSProperties}>
      <AppHead app="batches" sub="Organic clips in bulk: each a still + video pair with its own hook line." right={<button type="button" className="ms-btn ms-btn-accent" onClick={() => setForm((f) => !f)}>{form ? "Close" : "New batch"}</button>} />
      {form ? (
        <div className="ms-panel">
          <div className="ms-panel-title">New batch</div>
          <div className="ms-field-row">
            <div className="ms-field-label">Brief</div>
            <input className="ms-field" placeholder="a woman in her twenties using the board in her bedroom before work" value={brief} onChange={(e) => setBrief(e.target.value)} />
          </div>
          <div className="ms-field-row">
            <div className="ms-field-label">Hook lines (optional, one per line)</div>
            <textarea className="ms-field ms-field-long" rows={3} placeholder={"POV: you stopped paying $40 a class\nthis folds under my bed"} value={hooks} onChange={(e) => setHooks(e.target.value)} />
            <div className="ms-hint">One hook per clip. With none, every clip is a different moment of the brief.</div>
          </div>
          <div className="ms-form-grid">
            <div className="ms-field-row">
              <div className="ms-field-label">Reference picture</div>
              <div className="ms-ref">
                {ref ? <img src={`/media/${ref}`} alt="" /> : <span className="ms-ref-empty">None</span>}
                <div className="ms-ref-actions">
                  <button type="button" className="ms-btn ms-btn-small" onClick={() => setPicker(true)}>{ref ? "Change" : "Pick from Assets"}</button>
                </div>
              </div>
            </div>
            <div className="ms-field-row">
              <div className="ms-field-label">How many</div>
              <div className="ms-seg">
                {[2, 4, 6, 8].map((n) => (
                  <button key={n} type="button" className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>
                ))}
              </div>
              <div className="ms-field-label" style={{ marginTop: 10 }}>Length</div>
              <div className="ms-seg">
                {(modelCard?.durations ?? ["6"]).map((d) => (
                  <button key={d} type="button" className={duration === d ? "on" : ""} onClick={() => setDuration(d)}>{d}s</button>
                ))}
              </div>
            </div>
          </div>
          <div className="ms-field-row">
            <div className="ms-field-label">Video model</div>
            <div className="ms-models">
              {videoModels.map((m) => (
                <button key={m.id} type="button" className={`ms-model${modelId === m.id ? " on" : ""}`} onClick={() => setModelId(m.id)}>
                  <div className="ms-model-name">{m.label}</div>
                  <div className="ms-model-note">{m.note}</div>
                  <div className="ms-model-rate">{usd(PRICES.videoPerSecond[m.id] ?? 0.3)}/s</div>
                </button>
              ))}
            </div>
          </div>
          <div className="ms-generate-row">
            <button type="button" className="ms-generate" disabled={busy || !brief.trim() || !ref} onClick={start}>
              <Icon g="stack" size={18} />
              {busy ? "Starting…" : `Make ${count} clips`}
            </button>
            <div className="ms-price">~{usd(price)} on your fal key · {modelCard?.label}</div>
          </div>
        </div>
      ) : null}

      {groups.size ? (
        <div className="ms-batches">
          {Array.from(groups.entries()).map(([id, list]) => {
            const done = list.filter((r) => r.status === "completed").length;
            const failed = list.filter((r) => r.status === "failed").length;
            return (
              <div key={id} className="ms-batch">
                <div className="ms-batch-head">
                  <div>
                    <div className="ms-batch-title">{String(list[list.length - 1].params.label ?? "").replace(/ \d+$/, "") || `Batch ${id.slice(0, 8)}`}</div>
                    <div className="ms-batch-sub">{done}/{list.length} done{failed ? ` · ${failed} failed` : ""} · {timeAgo(list[0].createdAt)}</div>
                  </div>
                  {done ? <a className="ms-btn ms-btn-small" href={`/admin/studio/batch${suffix}${suffix ? "&" : "?"}batch=${id}`}>Download all</a> : null}
                </div>
                <div className="ms-batch-strip">
                  {list.map((r) => {
                    const key = r.outputKeys[0] ?? r.stillKey;
                    return (
                      <div key={r.id} className="ms-batch-thumb" title={String(r.params.label ?? r.prompt)}>
                        {key ? isVideoKey(key) ? <video src={`/media/${key}`} muted playsInline preload="metadata" controls /> : <img src={`/media/${key}`} alt="" /> : <div className="ms-shimmer" />}
                        {PENDING(r.status) ? <span className="ms-batch-badge">{r.stage === 1 ? "still" : "video"} · <Elapsed since={r.createdAt} /></span> : r.status === "failed" ? <span className="ms-batch-badge ms-bad">failed</span> : null}
                        {key ? (
                          <div className="ms-batch-actions">
                            {!isVideoKey(key) ? <button type="button" onClick={() => makeVideo(key)} title="Make a video">▶</button> : null}
                            <button type="button" onClick={() => copyPath(key)} title="Use on site"><Icon g="browser" size={12} /></button>
                            <a href={`/media/${key}`} download title="Download">↓</a>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="ms-note">Posting to Instagram and TikTok comes next. For now: Download all, post by hand.</div>
        </div>
      ) : !form ? (
        <Empty title="No batches yet" help="A batch makes several organic clips from one product picture and a one-line brief." action={<button type="button" className="ms-btn ms-btn-accent" onClick={() => setForm(true)}>New batch</button>} />
      ) : null}
      {picker ? <MediaPicker media={media} title="Reference picture" single onClose={() => setPicker(false)} onPick={(k) => { setRef(k[0] ?? null); setPicker(false); }} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------- emails app */

type Draft = { id: string; title: string; subject: string; preheader: string; hero: string; headline: string; body: string; cta: string; link: string; updatedAt: number };
const DRAFTS_KEY = "ms.emails";
const loadDrafts = (): Draft[] => {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as Draft[]; } catch { return []; }
};
const saveDrafts = (d: Draft[]) => { try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(d)); } catch { /* private mode */ } };
const newDraft = (store: string): Draft => ({ id: crypto.randomUUID(), title: "New email", subject: `Something new at ${store}`, preheader: "", hero: "", headline: "Meet the board that folds under your bed", body: "Twenty minutes before work. No class to book, no studio to get to.\n\nShips in three days.", cta: "Shop now", link: "https://", updatedAt: Date.now() });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function emailHtml(d: Draft, origin: string): string {
  const hero = d.hero ? `${origin}/media/${d.hero}` : "";
  const paras = d.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font:16px/26px Helvetica,Arial,sans-serif;color:#333">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(d.subject)}</title></head>
<body style="margin:0;background:#F4F4F2">
<span style="display:none;max-height:0;overflow:hidden;color:#F4F4F2">${esc(d.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F4F2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
${hero ? `<tr><td><img src="${hero}" width="600" alt="" style="display:block;width:100%;height:auto"></td></tr>` : ""}
<tr><td style="padding:32px 32px 8px"><h1 style="margin:0 0 16px;font:800 34px/38px Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-.02em;color:#111">${esc(d.headline)}</h1>${paras}</td></tr>
<tr><td style="padding:8px 32px 36px"><a href="${esc(d.link)}" style="display:inline-block;background:#C9FF3D;color:#111;font:700 15px/20px Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:999px;text-decoration:none">${esc(d.cta)}</a></td></tr>
</table>
<p style="font:12px/18px Helvetica,Arial,sans-serif;color:#888;margin:16px 0 0">You are getting this because you shopped with us. <a href="#" style="color:#888">Unsubscribe</a></p>
</td></tr></table></body></html>`;
}

function EmailsApp({ store, media, flash }: Shared) {
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [cur, setCur] = React.useState<string | null>(null);
  const [picker, setPicker] = React.useState(false);
  React.useEffect(() => {
    const d = loadDrafts();
    setDrafts(d);
    setCur(d[0]?.id ?? null);
  }, []);
  const draft = drafts.find((d) => d.id === cur) ?? null;
  const update = (patch: Partial<Draft>) => {
    setDrafts((all) => {
      const next = all.map((d) => (d.id === cur ? { ...d, ...patch, updatedAt: Date.now() } : d));
      saveDrafts(next);
      return next;
    });
  };
  const add = () => {
    const d = newDraft(store.name);
    const next = [d, ...drafts];
    setDrafts(next);
    saveDrafts(next);
    setCur(d.id);
  };
  const remove = (id: string) => {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    saveDrafts(next);
    if (cur === id) setCur(next[0]?.id ?? null);
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const html = draft ? emailHtml(draft, origin) : "";
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `${(draft?.title ?? "email").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
    a.click();
  };
  const [a, b] = APP_COLOR.emails;
  return (
    <div className="ms-app ms-app-emails" style={{ "--a": a, "--b": b } as React.CSSProperties}>
      <AppHead app="emails" sub="Sending comes next; drafts save on this device." right={<button type="button" className="ms-btn ms-btn-accent" onClick={add}>New draft</button>} />
      {!drafts.length ? (
        <Empty title="No drafts yet" help="Write a campaign email with a hero image from Assets, preview it, and download the HTML for your email tool." action={<button type="button" className="ms-btn ms-btn-accent" onClick={add}>New draft</button>} />
      ) : (
        <div className="ms-email">
          <div className="ms-email-list">
            {drafts.map((d) => (
              <div key={d.id} className={`ms-email-item${d.id === cur ? " on" : ""}`}>
                <button type="button" className="ms-email-item-btn" onClick={() => setCur(d.id)}>
                  <div className="ms-email-item-title">{d.title || "Untitled"}</div>
                  <div className="ms-muted">{d.subject}</div>
                </button>
                <button type="button" className="ms-x" onClick={() => { if (window.confirm("Delete this draft?")) remove(d.id); }} aria-label="Delete draft">×</button>
              </div>
            ))}
          </div>
          {draft ? (
            <>
              <div className="ms-email-form">
                {([["title", "Title (for you)"], ["subject", "Subject"], ["preheader", "Preheader"], ["headline", "Headline"], ["cta", "Button label"], ["link", "Button link"]] as [keyof Draft, string][]).map(([k, l]) => (
                  <div key={k} className="ms-field-row">
                    <div className="ms-field-label">{l}</div>
                    <input className="ms-field" value={String(draft[k])} onChange={(e) => update({ [k]: e.target.value })} />
                  </div>
                ))}
                <div className="ms-field-row">
                  <div className="ms-field-label">Body</div>
                  <textarea className="ms-field ms-field-long" rows={6} value={draft.body} onChange={(e) => update({ body: e.target.value })} />
                </div>
                <div className="ms-field-row">
                  <div className="ms-field-label">Hero image</div>
                  <div className="ms-ref">
                    {draft.hero ? <img src={`/media/${draft.hero}`} alt="" /> : <span className="ms-ref-empty">None</span>}
                    <div className="ms-ref-actions">
                      <button type="button" className="ms-btn ms-btn-small" onClick={() => setPicker(true)}>{draft.hero ? "Change" : "Pick from Assets"}</button>
                      {draft.hero ? <button type="button" className="ms-btn ms-btn-small" onClick={() => update({ hero: "" })}>Remove</button> : null}
                    </div>
                  </div>
                </div>
                <div className="ms-generate-row">
                  <button type="button" className="ms-generate" onClick={() => { void navigator.clipboard?.writeText(html); flash("HTML copied. Paste it into Klaviyo, Mailchimp or Shopify Email."); }}>
                    <Icon g="envelope" size={18} />
                    Copy HTML
                  </button>
                  <button type="button" className="ms-btn" onClick={download}>Download .html</button>
                </div>
              </div>
              <div className="ms-email-preview">
                <iframe title="Email preview" srcDoc={html} sandbox="" />
              </div>
            </>
          ) : null}
        </div>
      )}
      {picker ? <MediaPicker media={media} title="Hero image" single onClose={() => setPicker(false)} onPick={(k) => { update({ hero: k[0] ?? "" }); setPicker(false); }} /> : null}
    </div>
  );
}

/* --------------------------------------------------------------- chat app */

function ChatApp({ suffix, rows, media, config, hasAnthropic, threads, setThreads, messages, setMessages, threadId, model, setModel, params, setParams, flash, revalidate, makeVideo }: Shared & {
  hasAnthropic: boolean;
  threads: ThreadRow[];
  setThreads: React.Dispatch<React.SetStateAction<ThreadRow[]>>;
  messages: MessageRow[];
  setMessages: React.Dispatch<React.SetStateAction<MessageRow[]>>;
  threadId: string | null;
  model: string;
  setModel: (m: string) => void;
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const [section, setSection] = React.useState<StudioSection>(() => threads.find((t) => t.id === threadId)?.section ?? "meta_photos");
  const [attachments, setAttachments] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [picker, setPicker] = React.useState(false);
  const chat = useFetcher<ChatResult>();
  const threadOps = useFetcher<ChatResult>();
  const busy = chat.state !== "idle";
  const thread = threads.find((t) => t.id === threadId) ?? null;
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rowsById = React.useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function openThread(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("thread", id);
    else next.delete("thread");
    next.set("app", "chat");
    setParams(next, { preventScrollReset: true });
    if (!id) setMessages([]);
  }

  const lastChat = React.useRef<ChatResult | undefined>(undefined);
  React.useEffect(() => {
    if (chat.state !== "idle" || !chat.data || chat.data === lastChat.current) return;
    lastChat.current = chat.data;
    const data = chat.data;
    if (data.thread) {
      setThreads((all) => [data.thread!, ...all.filter((t) => t.id !== data.thread!.id)]);
      if (data.thread.id !== threadId) {
        const next = new URLSearchParams(params);
        next.set("thread", data.thread.id);
        next.set("app", "chat");
        setParams(next, { replace: true, preventScrollReset: true });
      }
    }
    if (data.messages?.length) setMessages((m) => [...m.filter((x) => !x.id.startsWith("local-")), ...data.messages!]);
    else setMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
    if (data.error) flash(data.error);
    if (data.generationIds?.length) revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.state, chat.data]);
  const lastOps = React.useRef<ChatResult | undefined>(undefined);
  React.useEffect(() => {
    if (threadOps.state !== "idle" || !threadOps.data || threadOps.data === lastOps.current) return;
    lastOps.current = threadOps.data;
    const data = threadOps.data;
    if (data.deletedThreadId) {
      setThreads((all) => all.filter((t) => t.id !== data.deletedThreadId));
      if (data.deletedThreadId === threadId) openThread(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadOps.state, threadOps.data]);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  function send() {
    const text = draft.trim();
    if (!text || busy || !hasAnthropic) return;
    const fd = new FormData();
    fd.set("intent", "send");
    fd.set("section", section);
    if (threadId) fd.set("threadId", threadId);
    fd.set("text", text);
    fd.set("model", model);
    for (const key of attachments) fd.append("attachment", key);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, threadId: threadId ?? "", role: "user", content: [...attachments.map((key) => ({ type: "ms_attachment", key })), { type: "text", text }], createdAt: new Date() } as MessageRow]);
    setDraft("");
    setAttachments([]);
    chat.submit(fd, { method: "post", action: `/admin/studio/chat${suffix}` });
  }
  const useAsReference = (key: string) => {
    setAttachments((a) => (a.includes(key) ? a : [...a, key]));
    composerRef.current?.focus();
  };

  return (
    <div className="ms-app ms-app-chat">
      <div className="ms-chat-side">
        <div className="ms-chat-side-head">
          <select className="ms-field" value={section} onChange={(e) => setSection(e.target.value as StudioSection)} aria-label="Section">
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button type="button" className="ms-btn ms-btn-small" onClick={() => openThread(null)}>+ New</button>
        </div>
        <div className="ms-threads">
          {threads.filter((t) => t.section === section).map((t) => (
            <div key={t.id} className={`ms-thread${t.id === threadId ? " on" : ""}`}>
              <button type="button" className="ms-thread-title" onClick={() => openThread(t.id)} title={t.title}>{t.title}</button>
              <button type="button" className="ms-thread-x" aria-label="Delete chat" onClick={() => { if (window.confirm("Delete this chat? Its assets stay in Media.")) threadOps.submit({ intent: "delete", threadId: t.id, section }, { method: "post", action: `/admin/studio/chat${suffix}` }); }}>×</button>
            </div>
          ))}
          {!threads.some((t) => t.section === section) ? <div className="ms-empty-help" style={{ padding: 10 }}>No chats in this section yet.</div> : null}
        </div>
      </div>
      <div className="ms-chat">
        <div className="ms-chat-head">
          <div>
            <div className="ms-chat-title">{thread?.title ?? "New chat"}</div>
            <div className="ms-chat-sub">{SECTION_INFO[section].label}</div>
          </div>
          <div className="ms-seg ms-seg-model" role="radiogroup" aria-label="Model">
            {[["claude-sonnet-5", "Sonnet"], ["claude-opus-5", "Opus"]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={model === id} className={model === id ? "on" : ""} onClick={() => setModel(id)}>{label}</button>
            ))}
          </div>
        </div>
        {!hasAnthropic ? (
          <div className="ms-inline-card">
            <div>
              <div className="ms-inline-title">Optional. Claude also works from Claude Code.</div>
              <div className="ms-muted">Add an Anthropic key in settings (gear, top right) to chat here in the browser. Everything else in the Studio runs on your fal key{config.falKeyId ? ` (${config.falKeyId})` : ""}.</div>
            </div>
          </div>
        ) : null}
        <div className="ms-scroll" ref={scrollRef}>
          {!messages.length ? <div className="ms-empty-help" style={{ padding: 24, textAlign: "center" }}>Say what you need in words: "two Meta ad shots on lilac with the sticker lines SCREEN BUILT IN and FOLDS FLAT". Claude quotes the price, then runs it.</div> : null}
          {messages.map((m) => (
            <Message key={m.id} row={m} rowsById={rowsById} onReference={useAsReference} onVideo={makeVideo} />
          ))}
          {busy ? (
            <div className="ms-row ms-row-assistant">
              <div className="ms-bubble ms-bubble-assistant ms-typing" aria-label="Thinking"><span /><span /><span /></div>
            </div>
          ) : null}
        </div>
        <div className="ms-composer">
          {attachments.length ? (
            <div className="ms-attachments">
              {attachments.map((key) => (
                <span key={key} className="ms-attachment">
                  <img src={`/media/${key}`} alt="" />
                  <button type="button" aria-label="Remove" onClick={() => setAttachments((a) => a.filter((k) => k !== key))}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="ms-composer-row">
            <button type="button" className="ms-icon-btn" title="Attach a picture from Assets" aria-label="Attach" onClick={() => setPicker(true)}>
              <Icon g="folder" size={16} />
            </button>
            <textarea ref={composerRef} className="ms-input" rows={1} placeholder={hasAnthropic ? "Tell the studio what you need… (⌘⏎ to send)" : "Add an Anthropic key in settings to chat here"} value={draft} disabled={!hasAnthropic || busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }} />
            <button type="button" className="ms-send" disabled={!hasAnthropic || busy || !draft.trim()} onClick={send} aria-label="Send">↑</button>
          </div>
        </div>
      </div>
      {picker ? <MediaPicker media={media} title="Attach from Assets" onClose={() => setPicker(false)} onPick={(keys) => { setAttachments((a) => Array.from(new Set([...a, ...keys]))); setPicker(false); }} /> : null}
    </div>
  );
}

function Message({ row, rowsById, onReference, onVideo }: { row: MessageRow; rowsById: Map<string, GenerationRow>; onReference: (key: string) => void; onVideo: (key: string) => void }) {
  const blocks = row.content as Block[];
  if (row.role === "user") {
    const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
    const keys = blocks.filter((b) => b.type === "ms_attachment").map((b) => String(b.key));
    return (
      <div className="ms-row ms-row-user">
        <div className="ms-bubble ms-bubble-user">
          {keys.length ? <div className="ms-bubble-attachments">{keys.map((k) => <img key={k} src={`/media/${k}`} alt="" />)}</div> : null}
          {text}
        </div>
      </div>
    );
  }
  if (row.role === "tool") {
    const ids: string[] = [];
    const notes: string[] = [];
    for (const b of blocks) {
      if (b.type !== "tool_result") continue;
      const parsed = parseResult(b.content);
      if (!parsed) continue;
      if (typeof parsed.generation_id === "string") ids.push(parsed.generation_id);
      if (Array.isArray(parsed.generation_ids)) ids.push(...parsed.generation_ids.map(String));
      if (parsed.needs_approval) notes.push(`Waiting for your go-ahead · ${String(parsed.estimated_cost_usd)}`);
      if (typeof parsed.error === "string") notes.push(parsed.error);
    }
    if (!ids.length && !notes.length) return null;
    return (
      <div className="ms-row ms-row-assistant">
        <div className="ms-toolwrap">
          {notes.map((n, i) => <div key={i} className="ms-activity">{n}</div>)}
          {ids.length ? (
            <div className="ms-cards">
              {ids.map((id) => {
                const gen = rowsById.get(id);
                return gen ? <ResultCard key={id} row={gen} onReference={onReference} onVideo={onVideo} onCopy={(k) => void navigator.clipboard?.writeText(`/media/${k}`)} onDelete={() => undefined} /> : null;
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "text" && String(b.text).trim()) return <div key={i} className="ms-row ms-row-assistant"><div className="ms-bubble ms-bubble-assistant">{String(b.text)}</div></div>;
        if (b.type === "tool_use") return <div key={i} className="ms-row ms-row-assistant"><div className="ms-activity">{activityLabel(String(b.name), (b.input ?? {}) as Record<string, unknown>)}</div></div>;
        return null;
      })}
    </>
  );
}

function parseResult(content: unknown): Record<string, unknown> | null {
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (c as { text?: string }).text ?? "").join("") : "";
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function activityLabel(name: string, input: Record<string, unknown>): string {
  const cost = typeof input.approved_cost_usd === "number" ? ` · ~$${input.approved_cost_usd.toFixed(2)}` : "";
  switch (name) {
    case "list_media": return "Looking through Assets";
    case "generate_image": { const n = Number(input.count ?? 1); return `Generating ${n} image${n > 1 ? "s" : ""} · ${input.subject_id ? "FLUX subject" : "GPT Image 2"}${cost}`; }
    case "generate_video": return `Generating a ${input.duration ?? ""}s video · ${String(input.model ?? "ltx-2-pro")}${cost}`;
    case "generate_batch": return `Batch of ${input.count ?? ""} clips · ${String(input.model ?? "ltx-2-pro")}${cost}`;
    case "check_generation": return "Waiting for the result";
    case "train_subject": return `Training a model: ${String(input.name ?? "")}${cost}`;
    case "write_hooks": return `Wrote ${Array.isArray(input.hooks) ? input.hooks.length : ""} hooks and captions`;
    case "save_note": return "Saved a note";
    default: return name;
  }
}

/* --------------------------------------------------------------- settings */

function SettingsCard({ config, encryption, fetcher, onClose }: { config: { falKeyId: string | null; hasAnthropic: boolean; model: string }; encryption: boolean; fetcher: ReturnType<typeof useFetcher<Result>>; onClose: () => void }) {
  const busy = fetcher.state !== "idle";
  return (
    <div className="ms-settings">
      <div className="ms-settings-row">
        <div>
          <div className="ms-settings-title">fal.ai key</div>
          <div className="ms-muted">{config.falKeyId ? `Connected: ${config.falKeyId}` : "fal.ai → Dashboard → Keys. Runs every model, pay per use."}</div>
        </div>
        {config.falKeyId ? (
          <fetcher.Form method="post"><input type="hidden" name="intent" value="fal-remove" /><button type="submit" className="ms-btn ms-btn-small" disabled={busy}>Remove</button></fetcher.Form>
        ) : (
          <fetcher.Form method="post" className="ms-keyform"><input type="hidden" name="intent" value="fal-connect" /><input name="secret" type="password" className="ms-field" placeholder="key_…" autoComplete="off" required /><button type="submit" className="ms-btn ms-btn-small" disabled={busy || !encryption}>Connect</button></fetcher.Form>
        )}
      </div>
      <div className="ms-settings-row">
        <div>
          <div className="ms-settings-title">Anthropic API key <span className="ms-muted">optional</span></div>
          <div className="ms-muted">{config.hasAnthropic ? "Saved and encrypted." : "Only for the in-browser chat. Claude also works from Claude Code without it."}</div>
        </div>
        {config.hasAnthropic ? (
          <fetcher.Form method="post"><input type="hidden" name="intent" value="anthropic-remove" /><button type="submit" className="ms-btn ms-btn-small" disabled={busy}>Remove</button></fetcher.Form>
        ) : (
          <fetcher.Form method="post" className="ms-keyform"><input type="hidden" name="intent" value="anthropic-connect" /><input name="secret" type="password" className="ms-field" placeholder="sk-ant-…" autoComplete="off" required /><button type="submit" className="ms-btn ms-btn-small" disabled={busy || !encryption}>Save</button></fetcher.Form>
        )}
      </div>
      <div className="ms-settings-row">
        <div>
          <div className="ms-settings-title">Chat model</div>
          <div className="ms-muted">Sonnet is cheap and fast; Opus for harder briefs.</div>
        </div>
        <fetcher.Form method="post" className="ms-keyform">
          <input type="hidden" name="intent" value="model" />
          <select name="model" defaultValue={config.model} className="ms-field"><option value="claude-sonnet-5">Sonnet 5</option><option value="claude-opus-5">Opus 5</option></select>
          <button type="submit" className="ms-btn ms-btn-small" disabled={busy}>Set</button>
        </fetcher.Form>
      </div>
      {!encryption ? <div className="ms-settings-warn">The Worker has no ENCRYPTION_KEY, so keys cannot be stored yet.</div> : null}
      <div className="ms-settings-foot">
        <span className="ms-muted">Every button shows its price before it runs.</span>
        <button type="button" className="ms-btn ms-btn-small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- style */

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
.ms-desk{--bg:#0B0D14;--win:#0E1019;--panel:#151827;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);--ink:#F2F3F7;--ink-2:#A9ADBD;--ink-3:#6E7387;--a:#3A7BFF;--b:#1E4FD8;
  font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:20px;color:var(--ink);background:var(--bg);height:100%;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;min-height:0}
.ms-desk *{box-sizing:border-box}
.ms-desk button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.ms-desk button:disabled{opacity:.45;cursor:default}
.ms-desk a{color:inherit}
.ms-window{flex:1;min-height:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#0B0D14,#14172A);border:1px solid var(--line-2);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 .5px rgba(255,255,255,.04) inset;overflow:hidden}
.ms-titlebar{display:flex;align-items:center;gap:12px;height:44px;padding:0 14px;background:rgba(255,255,255,.03);border-bottom:1px solid var(--line);flex:none;position:relative}
.ms-dots{display:flex;gap:7px}
.ms-dot{width:12px;height:12px;border-radius:50%;display:block;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.3)}
.ms-dot-r{background:#FF5F57}.ms-dot-y{background:#FEBC2E}.ms-dot-g{background:#28C840}
.ms-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap}
.ms-store{color:var(--ink-3);font-weight:500}
.ms-store::before{content:"·";margin-right:8px}
.ms-mark{filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.ms-titlebar-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.ms-back{height:26px;padding:0 10px;border-radius:8px;background:rgba(255,255,255,.08);font-size:12px;font-weight:500;color:var(--ink-2)}
.ms-back:hover{background:rgba(255,255,255,.14);color:var(--ink)}
.ms-icon-btn{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--ink-2);flex:none}
.ms-icon-btn:hover{background:rgba(255,255,255,.08);color:var(--ink)}
.ms-seg{display:inline-flex;background:rgba(255,255,255,.06);border-radius:9px;padding:2px;gap:2px;flex-wrap:wrap}
.ms-seg button{height:26px;padding:0 10px;border-radius:7px;font-size:12px;font-weight:500;color:var(--ink-2);white-space:nowrap}
.ms-seg button.on{background:rgba(255,255,255,.14);color:var(--ink)}
.ms-body{flex:1;min-height:0;display:grid;grid-template-columns:60px minmax(0,1fr)}
.ms-rail{border-right:1px solid var(--line);background:rgba(0,0,0,.18);display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 0;overflow:auto}
.ms-rail-btn{position:relative;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.ms-rail-btn:hover{transform:translateY(-1px) scale(1.06)}
.ms-rail-btn:active{transform:scale(.94)}
.ms-rail-btn.on::before{content:"";position:absolute;left:-8px;top:14px;width:3px;height:16px;border-radius:2px;background:#fff}
.ms-rail-home{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.1);display:grid;place-items:center;color:var(--ink)}
.ms-rail-dot{position:absolute;right:2px;top:2px;width:9px;height:9px;border-radius:50%;background:#FF5F57;box-shadow:0 0 0 2px var(--bg);animation:msPulse 1.4s infinite}
@keyframes msPulse{50%{opacity:.4}}
.ms-disc{--a:#3A7BFF;--b:#1E4FD8;position:relative;display:inline-grid;place-items:center;flex:none;border-radius:28%;background:linear-gradient(160deg,var(--a),var(--b));color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -2px 6px rgba(0,0,0,.25) inset,0 6px 14px rgba(0,0,0,.35);overflow:hidden}
.ms-disc-hi{position:absolute;inset:0;background:radial-gradient(70% 55% at 28% 18%,rgba(255,255,255,.45),rgba(255,255,255,0) 70%);pointer-events:none}
.ms-disc svg{position:relative;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}
.ms-disc-tint{background:linear-gradient(160deg,color-mix(in srgb,var(--a) 55%,#1a1d2e),color-mix(in srgb,var(--b) 55%,#0e1019))}
.ms-pane{position:relative;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.ms-flash{margin:8px 16px 0;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid var(--line-2);font-size:12px;color:var(--ink);flex:none;animation:msSpring .3s cubic-bezier(.2,.8,.2,1)}
@keyframes msSpring{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}

/* home */
.ms-home{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.ms-home-glow{position:absolute;left:50%;top:50%;width:70%;height:70%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(96,110,255,.22),rgba(255,79,163,.08) 50%,transparent 100%);filter:blur(30px);pointer-events:none}
.ms-home-grid{--k:1;--step:calc(112px * var(--k) * 1.06);flex:1;min-height:320px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;mask-image:radial-gradient(72% 72% at 50% 50%,#000 58%,transparent 100%);-webkit-mask-image:radial-gradient(72% 72% at 50% 50%,#000 58%,transparent 100%)}
.ms-home-grid.ms-home-drag{cursor:grabbing}
.ms-home-grid.ms-home-drag .ms-bub{pointer-events:none}
.ms-home-rows{display:flex;flex-direction:column;align-items:center;flex:none;will-change:transform}
.ms-home-row{display:flex;align-items:center;justify-content:center;height:calc(var(--step) * .88);margin-left:calc(var(--row-shift,0) * var(--step) * -1)}
.ms-bub{--size:72px;position:relative;flex:none;width:var(--step);height:var(--step);padding:0;border-radius:50%;animation:msBubIn .6s cubic-bezier(.2,1.3,.4,1) both;-webkit-tap-highlight-color:transparent}
.ms-bub:focus-visible{outline:2px solid #fff;outline-offset:3px}
@keyframes msBubIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.ms-bub-in{position:absolute;left:50%;top:50%;width:calc(var(--size) * var(--k));height:calc(var(--size) * var(--k));margin:calc(var(--size) * var(--k) / -2) 0 0 calc(var(--size) * var(--k) / -2);border-radius:50%;overflow:hidden;background:linear-gradient(160deg,var(--a),var(--b));color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 -6px 14px rgba(0,0,0,.28) inset,0 12px 28px rgba(0,0,0,.5),0 0 30px color-mix(in srgb,var(--a) 30%,transparent);transition:transform .2s cubic-bezier(.2,1.2,.4,1),box-shadow .2s}
.ms-bub-tint .ms-bub-in{background:linear-gradient(160deg,color-mix(in srgb,var(--a) 62%,#1a1d2e),color-mix(in srgb,var(--b) 62%,#0e1019))}
.ms-bub:hover .ms-bub-in{transform:translateY(-3px) scale(1.07);box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 -6px 14px rgba(0,0,0,.28) inset,0 18px 36px rgba(0,0,0,.55),0 0 40px color-mix(in srgb,var(--a) 45%,transparent)}
.ms-bub:active .ms-bub-in{transform:scale(.94);transition-duration:.08s}
.ms-bub-in img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;opacity:.55;mix-blend-mode:luminosity}
.ms-bub-photo .ms-bub-in::after{content:"";position:absolute;inset:0;background:linear-gradient(160deg,color-mix(in srgb,var(--a) 70%,transparent),color-mix(in srgb,var(--b) 85%,transparent));border-radius:50%}
.ms-bub-shine{position:absolute;inset:0;border-radius:50%;background:radial-gradient(65% 50% at 30% 18%,rgba(255,255,255,.5),rgba(255,255,255,0) 70%);pointer-events:none;z-index:2}
.ms-bub-body{position:absolute;inset:0;z-index:3;display:grid;place-items:center;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
.ms-bub-body svg{width:calc(var(--size) * var(--k) * .42);height:calc(var(--size) * var(--k) * .42)}
.ms-bub-label{position:absolute;left:50%;top:calc(50% + var(--size) * var(--k) / 2 + 3px);transform:translateX(-50%);font-size:11px;line-height:13px;font-weight:600;color:#fff;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none;letter-spacing:-.01em;z-index:4}
.ms-bub-far .ms-bub-label{display:none}
.ms-home-hint{flex:none;text-align:center;padding:6px 12px 10px;font-size:11.5px;color:var(--ink-3)}

/* sheet + apps */
.ms-sheet{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#0E1019,#151827);animation:msSheet .32s cubic-bezier(.2,.8,.2,1) both}
@keyframes msSheet{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
.ms-app{flex:1;min-height:0;overflow:auto;padding:16px 20px 28px;display:flex;flex-direction:column;gap:14px}
.ms-app-head{display:flex;align-items:center;gap:12px}
.ms-app-head-text{min-width:0;flex:1}
.ms-app-title{font-weight:700;font-size:17px;line-height:22px;letter-spacing:-.01em}
.ms-app-sub{font-size:12px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-app-head-right{display:flex;gap:8px;align-items:center;flex:none}
.ms-chips{display:flex;gap:8px;overflow:auto;padding-bottom:2px;flex:none}
.ms-chip-preset{display:flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--line);font-size:12px;font-weight:500;color:var(--ink-2);white-space:nowrap;flex:none;transition:transform .15s}
.ms-chip-preset:hover{background:rgba(255,255,255,.1);color:var(--ink)}
.ms-chip-preset:active{transform:scale(.96)}
.ms-chip-preset.on{background:color-mix(in srgb,var(--a) 22%,transparent);border-color:color-mix(in srgb,var(--a) 50%,transparent);color:#fff}
.ms-recipe{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.ms-recipe-title{font-weight:600;font-size:13px}
.ms-recipe-fields{display:flex;flex-direction:column;gap:12px}
.ms-field-row{display:flex;flex-direction:column;gap:6px;min-width:0}
.ms-field-inline{flex-direction:row;align-items:center;gap:10px}
.ms-field-label{font-size:11.5px;font-weight:600;color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em}
.ms-hint{font-size:11.5px;color:var(--ink-3)}
.ms-hint code{color:#fff;background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px}
.ms-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.ms-choices{display:flex;flex-wrap:wrap;gap:6px}
.ms-choice{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid var(--line);font-size:12px;color:var(--ink-2)}
.ms-choice:hover{color:var(--ink);background:rgba(255,255,255,.1)}
.ms-choice.on{background:color-mix(in srgb,var(--a) 22%,transparent);border-color:color-mix(in srgb,var(--a) 60%,transparent);color:#fff}
.ms-swatch{width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.25) inset}
.ms-toggle{width:40px;height:24px;border-radius:12px;background:rgba(255,255,255,.14);position:relative;flex:none;transition:background .2s}
.ms-toggle span{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s cubic-bezier(.2,.8,.2,1);box-shadow:0 1px 3px rgba(0,0,0,.4)}
.ms-toggle.on{background:linear-gradient(160deg,var(--a),var(--b))}
.ms-toggle.on span{transform:translateX(16px)}
.ms-models{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ms-model{text-align:left;padding:9px 11px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid var(--line)}
.ms-model:hover{background:rgba(255,255,255,.09)}
.ms-model.on{border-color:color-mix(in srgb,var(--a) 70%,transparent);background:color-mix(in srgb,var(--a) 16%,transparent)}
.ms-model-name{font-weight:600;font-size:12.5px}
.ms-model-note{font-size:11px;color:var(--ink-3);line-height:15px;margin-top:2px}
.ms-model-rate{font-size:11px;color:var(--ink-2);margin-top:4px}
.ms-ref{display:flex;align-items:center;gap:10px}
.ms-ref img{width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--line-2);background:#000}
.ms-ref-empty{width:64px;height:64px;border-radius:10px;border:1px dashed var(--line-2);display:grid;place-items:center;font-size:11px;color:var(--ink-3)}
.ms-ref-actions{display:flex;gap:6px;flex-wrap:wrap}
.ms-generate-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:4px}
.ms-generate{height:42px;padding:0 20px;border-radius:13px;background:linear-gradient(160deg,var(--a),var(--b));color:#fff;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:8px;box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 8px 22px color-mix(in srgb,var(--a) 40%,transparent);transition:transform .15s cubic-bezier(.2,.8,.2,1),filter .15s}
.ms-generate:hover{filter:brightness(1.08);transform:translateY(-1px)}
.ms-generate:active{transform:scale(.96)}
.ms-price{font-size:12px;color:var(--ink-2)}
.ms-prompt-peek{font-size:12px;color:var(--ink-3)}
.ms-prompt-peek summary{cursor:pointer}
.ms-prompt-peek pre{white-space:pre-wrap;font:12px/18px Inter,system-ui,sans-serif;color:var(--ink-2);background:rgba(0,0,0,.25);padding:8px 10px;border-radius:8px;margin:6px 0 0}
.ms-results-head{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:13px;padding-top:4px}
.ms-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.ms-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;animation:msSpring .3s cubic-bezier(.2,.8,.2,1)}
.ms-card img,.ms-card video{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#000}
.ms-card video{aspect-ratio:9/16;max-height:320px}
.ms-card-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;font-size:11px;color:var(--ink-3)}
.ms-card-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-card-actions{display:flex;gap:2px;flex:none}
.ms-card-actions a,.ms-card-actions button{height:22px;min-width:22px;padding:0 5px;border-radius:5px;color:var(--ink-2);font-size:11px;text-decoration:none;display:grid;place-items:center}
.ms-card-actions a:hover,.ms-card-actions button:hover{background:rgba(255,255,255,.1);color:var(--ink)}
.ms-card-failed{padding:10px}.ms-card-err{font-size:11px;color:#FF7B72}
.ms-x{width:22px;height:22px;border-radius:5px;color:var(--ink-3);display:grid;place-items:center}
.ms-x:hover{background:rgba(255,255,255,.1);color:var(--ink)}
.ms-shimmer{width:100%;aspect-ratio:1;background:linear-gradient(100deg,#171a28 30%,#242840 50%,#171a28 70%);background-size:200% 100%;animation:msShimmer 1.4s infinite linear}
@keyframes msShimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.ms-empty{margin:auto;max-width:380px;text-align:center;padding:36px 16px;display:flex;flex-direction:column;align-items:center;gap:6px}
.ms-empty-title{font-weight:600;font-size:14px}
.ms-empty-help{font-size:12.5px;color:var(--ink-3);line-height:18px}
.ms-empty-action{margin-top:8px}
.ms-btn{height:30px;padding:0 14px;border-radius:9px;background:rgba(255,255,255,.1);color:var(--ink);font-weight:500;font-size:12px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap;transition:transform .12s}
.ms-btn:hover{background:rgba(255,255,255,.16)}
.ms-btn:active{transform:scale(.96)}
.ms-btn-accent{background:linear-gradient(160deg,var(--a),var(--b));color:#fff;font-weight:600;box-shadow:0 1px 0 rgba(255,255,255,.3) inset}
.ms-btn-accent:hover{filter:brightness(1.08);background:linear-gradient(160deg,var(--a),var(--b))}
.ms-btn-danger{color:#FF8A80}
.ms-btn-small{height:26px;padding:0 10px;font-size:11.5px}
.ms-panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.ms-panel-title{font-weight:600}
.ms-note{font-size:11.5px;color:var(--ink-3)}
.ms-muted{color:var(--ink-3);font-size:12px}
.ms-field{height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--line-2);background:rgba(255,255,255,.05);color:var(--ink);font:inherit;font-size:12.5px;min-width:0;width:100%}
.ms-field-long{height:auto;padding:7px 10px;resize:vertical;line-height:18px}
.ms-field:focus{outline:2px solid color-mix(in srgb,var(--a) 70%,transparent);outline-offset:-1px}
.ms-field option{background:#151827}

/* assets */
.ms-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ms-search{width:200px}
.ms-selbar{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);margin-left:auto;background:rgba(255,255,255,.06);padding:4px 6px 4px 12px;border-radius:10px;animation:msSpring .25s}
.ms-assets{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.ms-asset{position:relative;border-radius:12px;overflow:hidden;background:var(--panel);border:1px solid var(--line);transition:transform .15s}
.ms-asset:hover{transform:translateY(-2px)}
.ms-asset.on{outline:2px solid var(--a);outline-offset:-2px}
.ms-asset-open{display:block;width:100%;padding:0}
.ms-asset-open img,.ms-asset-open video{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#000}
.ms-asset-check{position:absolute;top:6px;left:6px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.5);border:1.5px solid rgba(255,255,255,.7);color:#fff;font-size:12px;display:grid;place-items:center;opacity:0;transition:opacity .15s}
.ms-asset:hover .ms-asset-check,.ms-asset.on .ms-asset-check{opacity:1}
.ms-asset.on .ms-asset-check{background:var(--a);border-color:#fff}
.ms-asset-tag{position:absolute;top:8px;right:8px;font-size:9.5px;font-weight:600;padding:1px 6px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;text-transform:uppercase;letter-spacing:.04em}
.ms-asset-name{font-size:11px;color:var(--ink-3);padding:5px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-lightbox{position:fixed;inset:0;z-index:70;background:rgba(5,6,12,.9);display:grid;grid-template-columns:56px 1fr 56px;align-items:center;font-family:Inter,system-ui,sans-serif;color:#F2F3F7;animation:msFade .2s}
@keyframes msFade{from{opacity:0}to{opacity:1}}
.ms-lightbox button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.ms-lb-body{display:flex;flex-direction:column;align-items:center;gap:12px;max-height:100vh;padding:24px 0;min-width:0}
.ms-lb-body img,.ms-lb-body video{max-width:100%;max-height:calc(100vh - 140px);border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:msSpring .3s cubic-bezier(.2,.8,.2,1)}
.ms-lb-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;width:min(720px,100%);flex-wrap:wrap}
.ms-lb-name{font-weight:600}
.ms-lb-actions{display:flex;gap:6px;flex-wrap:wrap}
.ms-lb-nav{height:100%;font-size:40px;color:rgba(255,255,255,.5)}
.ms-lb-nav:hover{color:#fff}
.ms-lb-close{position:absolute;top:12px;right:14px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.1);font-size:20px}

/* models */
.ms-train-strip{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ms-train-thumb{width:56px;height:56px;border-radius:9px;overflow:hidden;padding:0;border:1px solid var(--line-2);background:#000}
.ms-train-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ms-train-thumb:hover{opacity:.7}
.ms-train-add{height:56px;padding:0 12px;border-radius:9px;border:1px dashed var(--line-2);font-size:12px;color:var(--ink-2)}
.ms-subjects{display:flex;flex-direction:column;gap:10px}
.ms-subject{display:flex;gap:14px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px;position:relative}
.ms-subject-thumbs{display:grid;grid-template-columns:1fr 1fr;gap:3px;flex:none}
.ms-subject-thumbs img{width:34px;height:34px;object-fit:cover;border-radius:7px;background:#000}
.ms-subject-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.ms-subject-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ms-subject-name{font-weight:600;font-size:13.5px}
.ms-subject-sub{font-size:12px;color:var(--ink-2)}
.ms-subject-sub code{color:#fff;background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px}
.ms-pill{height:22px;padding:0 9px;border-radius:11px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.08);color:var(--ink-2)}
.ms-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.ms-pill-ready{background:rgba(40,200,64,.15);color:#6EE08A}
.ms-pill-in_progress,.ms-pill-queued{background:rgba(156,107,255,.18);color:#C9B3FF}
.ms-pill-in_progress::before{animation:msPulse 1.2s infinite}
.ms-pill-failed{background:rgba(255,95,87,.15);color:#FF8A80}
.ms-use-row{display:flex;align-items:center;gap:10px;font-size:12.5px;margin-top:2px}
.ms-ring{flex:none}

/* batches */
.ms-batches{display:flex;flex-direction:column;gap:10px}
.ms-batch{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--panel)}
.ms-batch-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.ms-batch-title{font-weight:600;font-size:13px}
.ms-batch-sub{font-size:11.5px;color:var(--ink-3)}
.ms-batch-strip{display:flex;gap:8px;overflow:auto;padding-bottom:4px}
.ms-batch-thumb{position:relative;flex:none;width:120px;aspect-ratio:9/16;border-radius:10px;overflow:hidden;background:#000}
.ms-batch-thumb img,.ms-batch-thumb video{width:100%;height:100%;object-fit:cover;display:block}
.ms-batch-thumb .ms-shimmer{height:100%;aspect-ratio:auto}
.ms-batch-badge{position:absolute;left:6px;top:6px;font-size:9.5px;padding:1px 6px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff}
.ms-batch-badge.ms-bad{background:#B3261E}
.ms-batch-actions{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:4px;padding:4px;background:linear-gradient(transparent,rgba(0,0,0,.7));opacity:0;transition:opacity .15s}
.ms-batch-thumb:hover .ms-batch-actions{opacity:1}
.ms-batch-actions a,.ms-batch-actions button{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,.15);color:#fff;font-size:11px;display:grid;place-items:center;text-decoration:none}

/* emails */
.ms-app-emails{padding-bottom:16px}
.ms-email{flex:1;min-height:0;display:grid;grid-template-columns:200px minmax(280px,1fr) minmax(320px,1.2fr);gap:14px}
.ms-email-list{display:flex;flex-direction:column;gap:4px;overflow:auto}
.ms-email-item{display:flex;align-items:center;border-radius:10px}
.ms-email-item.on{background:rgba(255,255,255,.08)}
.ms-email-item-btn{flex:1;min-width:0;text-align:left;padding:8px 10px}
.ms-email-item-title{font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-email-item .ms-muted{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.ms-email-form{display:flex;flex-direction:column;gap:10px;overflow:auto;padding-right:4px}
.ms-email-preview{background:#F4F4F2;border-radius:14px;overflow:hidden;min-height:420px}
.ms-email-preview iframe{width:100%;height:100%;min-height:420px;border:0;display:block;background:#F4F4F2}

/* chat */
.ms-app-chat{padding:0;flex-direction:row;overflow:hidden}
.ms-chat-side{width:220px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.ms-chat-side-head{display:flex;gap:6px;padding:10px;border-bottom:1px solid var(--line)}
.ms-threads{padding:6px 8px;display:flex;flex-direction:column;gap:1px;overflow:auto}
.ms-thread{display:flex;align-items:center;border-radius:7px}
.ms-thread.on{background:rgba(255,255,255,.1)}
.ms-thread:hover{background:rgba(255,255,255,.06)}
.ms-thread-title{flex:1;min-width:0;text-align:left;padding:6px 8px;font-size:12px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-thread.on .ms-thread-title{color:var(--ink)}
.ms-thread-x{width:22px;height:22px;color:var(--ink-3);border-radius:5px;opacity:0}
.ms-thread:hover .ms-thread-x{opacity:1}
.ms-chat{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.ms-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid var(--line);flex:none}
.ms-chat-title{font-weight:600}
.ms-chat-sub{font-size:11px;color:var(--ink-3)}
.ms-inline-card{margin:12px 18px 0;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid var(--line);display:flex;gap:10px;align-items:center;flex:none}
.ms-inline-title{font-weight:600;font-size:12.5px}
.ms-scroll{flex:1;min-height:0;overflow:auto;padding:18px 18px 8px;display:flex;flex-direction:column;gap:6px}
.ms-row{display:flex;animation:msSpring .32s cubic-bezier(.2,1.2,.4,1) both}
.ms-row-user{justify-content:flex-end}
.ms-row-assistant{justify-content:flex-start}
.ms-bubble{max-width:min(78%,620px);padding:9px 14px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word;font-size:14px;line-height:21px}
.ms-bubble-user{background:linear-gradient(180deg,#3A86FF,#2F6FE0);color:#fff;border-bottom-right-radius:5px}
.ms-bubble-assistant{background:rgba(255,255,255,.08);color:var(--ink);border-bottom-left-radius:5px}
.ms-bubble-attachments{display:flex;gap:6px;margin-bottom:6px}
.ms-bubble-attachments img{width:64px;height:64px;object-fit:cover;border-radius:8px}
.ms-typing{display:flex;gap:4px;align-items:center;padding:12px 14px}
.ms-typing span{width:7px;height:7px;border-radius:50%;background:var(--ink-3);animation:msDots 1.2s infinite ease-in-out}
.ms-typing span:nth-child(2){animation-delay:.15s}.ms-typing span:nth-child(3){animation-delay:.3s}
@keyframes msDots{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}
.ms-activity{font-size:11.5px;color:var(--ink-3);padding:2px 6px;display:flex;align-items:center;gap:6px}
.ms-activity::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--ink-3);flex:none}
.ms-toolwrap{max-width:min(90%,720px);display:flex;flex-direction:column;gap:6px}
.ms-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.ms-composer{flex:none;padding:8px 14px 12px;border-top:1px solid var(--line)}
.ms-attachments{display:flex;gap:6px;padding:0 0 6px}
.ms-attachment{position:relative;width:48px;height:48px}
.ms-attachment img{width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--line-2)}
.ms-attachment button{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#333;color:#fff;font-size:12px;display:grid;place-items:center}
.ms-composer-row{display:flex;align-items:flex-end;gap:6px;background:rgba(255,255,255,.06);border:1px solid var(--line-2);border-radius:20px;padding:5px 6px}
.ms-composer-row:focus-within{border-color:rgba(58,123,255,.7)}
.ms-input{flex:1;background:none;border:0;outline:0;resize:none;color:var(--ink);font:inherit;font-size:14px;line-height:20px;padding:4px;max-height:140px;min-height:28px;field-sizing:content}
.ms-send{width:28px;height:28px;border-radius:50%;background:#3A7BFF;color:#fff;display:grid;place-items:center;flex:none;font-weight:700}
.ms-send:disabled{background:rgba(255,255,255,.12)}

/* settings + modal */
.ms-settings{border-bottom:1px solid var(--line);background:rgba(0,0,0,.25);padding:6px 16px;display:flex;flex-direction:column;flex:none;animation:msSpring .25s}
.ms-settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.ms-settings-title{font-weight:600;font-size:12.5px}
.ms-settings-warn{color:#FFB4A8;font-size:12px;padding:6px 0}
.ms-settings-foot{display:flex;justify-content:space-between;align-items:center;padding:8px 0 4px;gap:10px}
.ms-keyform{display:flex;gap:6px;align-items:center}
.ms-keyform .ms-field{width:220px}
.ms-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60;display:grid;place-items:center;padding:16px;font-family:Inter,system-ui,sans-serif;color:#F2F3F7}
.ms-modal-back *{box-sizing:border-box}
.ms-modal-back button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.ms-modal{width:min(760px,100%);max-height:min(80vh,720px);background:#151827;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden;animation:msSheet .3s cubic-bezier(.2,.8,.2,1) both}
.ms-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.ms-modal-title{font-weight:600}
.ms-modal-tools{display:flex;gap:8px;padding:10px 16px 0;flex-wrap:wrap}
.ms-modal-tools .ms-field{flex:1;width:auto}
.ms-modal-grid{flex:1;min-height:0;overflow:auto;padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;align-content:start}
.ms-pick{aspect-ratio:1;border-radius:10px;overflow:hidden;border:2px solid transparent;background:#000;padding:0}
.ms-pick img{width:100%;height:100%;object-fit:cover;display:block}
.ms-pick.on{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.3)}
.ms-modal-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid rgba(255,255,255,.08)}
.ms-empty-page{color:#A9ADBD;padding:40px;text-align:center}
@media (prefers-reduced-motion: reduce){.ms-bub,.ms-sheet,.ms-card,.ms-row{animation:none}.ms-bub-in{transition:none}}
@media (max-width: 900px){
  .ms-desk{padding:0}
  .ms-window{border-radius:0;border:0}
  .ms-title{position:static;transform:none}
  .ms-store{display:none}
  .ms-home-grid{--k:.62;min-height:260px}
  .ms-body{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto}
  .ms-rail{order:2;flex-direction:row;border-right:0;border-top:1px solid var(--line);padding:6px 8px;gap:4px;justify-content:flex-start}
  .ms-rail-btn{width:40px;height:40px;flex:none}
  .ms-rail-btn.on::before{left:12px;top:auto;bottom:-6px;width:16px;height:3px}
  .ms-pane{order:1}
  .ms-app{padding:12px 14px 20px}
  .ms-email{grid-template-columns:1fr}
  .ms-email-list{flex-direction:row;overflow:auto}
  .ms-email-item{flex:none;max-width:200px}
  .ms-app-chat{flex-direction:column}
  .ms-chat-side{width:auto;border-right:0;border-bottom:1px solid var(--line);max-height:160px}
  .ms-bubble{max-width:88%}
  .ms-lightbox{grid-template-columns:32px 1fr 32px}
  .ms-search{width:100%}
  .ms-selbar{margin-left:0}
}
`;
