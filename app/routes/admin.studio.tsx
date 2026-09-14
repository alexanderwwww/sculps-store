/**
 * Studio — a preset-driven creative studio, in Shop Admin's language.
 *
 * You never type a prompt. You pick what you want to make (a clean product
 * shot, a Meta ad, a real-phone UGC still, an exploded view, a video, a
 * talking UGC ad), point at a product picture from Media and click through
 * a few pickers; the recipe composes a product-accurate prompt behind the
 * scenes and shows it under "See the prompt" so it stays transparent and
 * editable. Everything is dark inside this page only; the admin shell stays
 * as it is. Models are the makers' own — GPT Image, Seedance, Kling, Veo —
 * through fal's queue with one pay-per-use key. A UGC ad is a two-step
 * chain (still first, then the video on it). Everything finished lands in
 * this store's Media.
 */
import * as React from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.studio";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listMedia, addMedia } from "~/lib/admin.server";
import { studioConfig } from "~/db/schema";
import { encryptSecret, encryptionReady } from "~/lib/crypto.server";
import { MODELS, modelById, testKey, StudioNotConfigured } from "~/lib/fal.server";
import { listGenerations, startGeneration, deleteGeneration } from "~/lib/studio.server";
import type { GenerationRow } from "~/lib/studio.server";
import { card, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Studio — Shop Admin" }];
}

const PUBLIC_MODELS = MODELS.map(({ body: _body, ...rest }) => rest);
type PublicModel = (typeof PUBLIC_MODELS)[number];
type Kind = "image" | "video" | "ugc";

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, config: null, rows: [], pictures: [], models: PUBLIC_MODELS, encryption: false, tab: "image" as Kind };

  const [config] = await context.db.select().from(studioConfig).where(eq(studioConfig.storeId, store.id)).limit(1);
  const rows = await listGenerations(context.db, store.id);
  const pictures = (await listMedia(context.db, store.id))
    .filter((m) => m.mime.startsWith("image/") && !m.key.startsWith("http"))
    .slice(0, 240)
    .map((m) => ({ key: m.key, filename: m.filename, studio: m.key.startsWith("studio-") }));

  const requested = url.searchParams.get("tab") ?? "";
  const tab: Kind = requested === "video" || requested === "ugc" ? requested : "image";
  return {
    store: { slug: store.slug, name: store.name },
    config: config ? { keyId: config.keyId, connectedAt: config.connectedAt } : null,
    rows,
    pictures,
    models: PUBLIC_MODELS,
    encryption: encryptionReady(context.cloudflare.env),
    tab,
  };
}

type Result = { ok?: string; error?: string; intent?: string };

export async function action({ context, request }: Route.ActionArgs): Promise<Result> {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };
  const env = context.cloudflare.env;

  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");

  if (intent === "connect") {
    const secret = text("secret");
    if (!secret) return { intent, error: "Paste the fal key." };
    if (!encryptionReady(env)) return { intent, error: "Not saved: no ENCRYPTION_KEY on the Worker, and an API key will not be stored in the clear." };
    const check = await testKey(secret);
    if (!check.ok) return { intent, error: check.reason };
    const secretEnc = await encryptSecret(env, secret);
    if (!secretEnc) return { intent, error: "Could not encrypt the key." };
    const keyId = `fal …${secret.slice(-4)}`;
    await context.db
      .insert(studioConfig)
      .values({ storeId: store.id, keyId, secretEnc, connectedAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({ target: studioConfig.storeId, set: { keyId, secretEnc, connectedAt: new Date(), updatedAt: new Date() } });
    return { intent, ok: "Connected. fal accepted the key." };
  }

  if (intent === "disconnect") {
    await context.db.delete(studioConfig).where(eq(studioConfig.storeId, store.id));
    return { intent, ok: "Key removed." };
  }

  if (intent === "delete") {
    await deleteGeneration(context.db, store.id, text("id"));
    return { intent, ok: "Deleted." };
  }

  if (intent === "generate") {
    const kind = text("kind") as Kind;
    if (!["image", "video", "ugc"].includes(kind)) return { intent, error: "Unknown tab." };

    // The input picture: a fresh upload wins over a picked one.
    let inputKey = text("inputKey") || null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return { intent, error: "The input has to be a picture." };
      if (file.size > 25 * 1024 * 1024) return { intent, error: "That file is over 25 MB." };
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hash = Array.from(new Uint8Array(digest).slice(0, 10))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      inputKey = `${hash}.${ext}`;
      await env.MEDIA.put(inputKey, buffer, { httpMetadata: { contentType: file.type } });
      await addMedia(context.db, store.id, { key: inputKey, filename: file.name, mime: file.type, sizeBytes: file.size, alt: null }).catch(() => null);
    }

    try {
      if (kind === "ugc") {
        const product = text("product");
        const creator = text("creator") || "a real content creator in her twenties";
        const setting = text("setting") || "her real apartment, daylight from a window";
        const script = text("script");
        if (!product) return { intent, error: "Say what the product is." };
        if (!script) return { intent, error: "Write what she says. That is the ad." };
        if (!inputKey) return { intent, error: "A UGC ad starts from a picture of the product." };
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
        });
        return { intent, ok: "Started. The still comes first, then the video on top of it." };
      }

      const model = modelById(text("model"));
      if (!model || model.kind !== kind) return { intent, error: "Pick a model." };
      const prompt = text("prompt");
      if (!prompt) return { intent, error: "Write a prompt." };
      await startGeneration(context.db, env, url.origin, store.id, {
        kind,
        model,
        prompt,
        aspect: text("aspect") || model.aspects[0],
        duration: text("duration") || model.durations?.[0] || "6",
        audio: form.get("audio") === "on",
        count: Math.min(4, Math.max(1, Number(text("count") || 1))),
        inputKey: model.needsImage ? inputKey : null,
      });
      return { intent, ok: "Started." };
    } catch (error) {
      if (error instanceof StudioNotConfigured) return { intent, error: error.message };
      return { intent, error: error instanceof Error ? error.message : "The model did not accept the request." };
    }
  }

  return { error: "Unknown action." };
}

/* ---------------------------------------------------------------- recipes */

type Opts = Record<string, string | boolean>;

type Field =
  | { key: string; label: string; type: "choice"; options: { value: string; label: string; swatch?: string }[]; def: string; hint?: string }
  | { key: string; label: string; type: "text"; def: string; placeholder?: string; long?: boolean; hint?: string }
  | { key: string; label: string; type: "toggle"; def: boolean; hint?: string }
  /** the model, as small cards, limited to these ids (empty = every model the loader sent) */
  | { key: "model"; label: string; type: "model"; ids: string[]; def: string }
  /** the shape, filtered by what the model offers */
  | { key: "aspect"; label: string; type: "aspect"; options: { value: string; label: string }[]; def: string }
  /** the length in seconds, from the model */
  | { key: "duration"; label: string; type: "length"; def: string };

interface Preset {
  id: string;
  title: string;
  sub: string;
  kind: Kind;
  /** fixed model for image recipes; video recipes carry a model field instead */
  model?: string;
  /** which store pictures make a good thumbnail for the tile */
  match: RegExp;
  icon: string;
  fields: Field[];
  compose: (o: Opts) => string;
  /** the reference picker's label */
  refLabel: string;
  cta: string;
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
const TIMES: Record<string, string> = {
  morning: "soft morning daylight",
  evening: "warm evening lamp light",
};
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
const VIDEO_MODELS = ["ltx-2-pro", "wan-2-5", "kling-3", "seedance-2", "kling-3-pro", "veo-3-1"];

const PRESETS: Preset[] = [
  {
    id: "clean",
    title: "Clean product shot",
    sub: "Your product, exact, on a backdrop you pick",
    kind: "image",
    model: "gpt-image-2-edit",
    match: /studio|cut|render|bodies-/i,
    icon: "M4 6h12v10H4z M7 16v1h6v-1",
    refLabel: "Product picture",
    cta: "Make the shot",
    fields: [
      { key: "bg", label: "Background", type: "choice", options: bgOptions(), def: "white" },
      {
        key: "angle",
        label: "Angle",
        type: "choice",
        options: [
          { value: "tq", label: "Three-quarter" },
          { value: "front", label: "Front" },
          { value: "top", label: "Top-down" },
          { value: "macro", label: "Macro detail" },
        ],
        def: "tq",
      },
      { key: "chrome", label: "Add a chrome object", type: "toggle", def: false, hint: "One liquid-chrome blob beside the product" },
      { key: "aspect", label: "Shape", type: "aspect", options: LAYOUTS, def: "1:1" },
    ],
    compose: (o) =>
      `Studio product photograph of the product in the reference picture, ${ANGLES[String(o.angle)] ?? ANGLES.tq}. ${ACCURACY} ` +
      `Background: ${bgText(o.bg)}. ${o.chrome ? "One liquid-chrome blob floats beside the product, reflecting the background colour. " : ""}` +
      `Soft studio light, one hue family, a gentle glow behind the product. ${NO_SKY}. Sharp, clean, e-commerce quality.`,
  },
  {
    id: "meta",
    title: "Meta ad shot",
    sub: "Bold colour world, two sticker lines, feed-ready",
    kind: "image",
    model: "gpt-image-2-edit",
    match: /ad|band|hero|bd-g-|bd-x-/i,
    icon: "M3 5h14v10H3z M6 12l3-3 3 2 2-1",
    refLabel: "Product picture",
    cta: "Make the ad",
    fields: [
      { key: "bg", label: "Colour world", type: "choice", options: bgOptions(["lilac", "icy", "matcha", "sand", "black"]), def: "lilac" },
      { key: "s1", label: "Sticker line 1", type: "text", def: "SCREEN BUILT IN", placeholder: "SCREEN BUILT IN" },
      { key: "s2", label: "Sticker line 2", type: "text", def: "FOLDS FLAT", placeholder: "FOLDS FLAT" },
      { key: "aspect", label: "Layout", type: "aspect", options: LAYOUTS.slice(0, 3), def: "1:1" },
    ],
    compose: (o) =>
      `Paid social ad creative. The product from the reference picture, large and centred, on ${bgText(o.bg)}, one hue family, a liquid-chrome ring and a soft glow behind it. ${ACCURACY} ` +
      `Two bold rounded sticker labels, white with black uppercase text, read exactly "${String(o.s1 || "SCREEN BUILT IN")}" and "${String(o.s2 || "FOLDS FLAT")}", placed near the product; nothing else is written. ` +
      `No sky, no clouds, no people. Crisp, high contrast, made for a Meta feed.`,
  },
  {
    id: "ugcstill",
    title: "UGC still",
    sub: "Real-phone look, a real apartment, no studio",
    kind: "image",
    model: "gpt-image-2-edit",
    match: /real|life|girl|apt|bd-[a-f]-/i,
    icon: "M7 3h6v14H7z M9 15h2",
    refLabel: "Product picture",
    cta: "Make the still",
    fields: [
      {
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
      },
      {
        key: "time",
        label: "Time",
        type: "choice",
        options: [
          { value: "morning", label: "Morning light" },
          { value: "evening", label: "Evening lamp" },
        ],
        def: "morning",
      },
      {
        key: "person",
        label: "Person",
        type: "choice",
        options: [
          { value: "none", label: "None" },
          { value: "woman", label: "Woman using it" },
        ],
        def: "none",
      },
      { key: "phone", label: "Phone-photo look", type: "toggle", def: true, hint: "Slightly imperfect, like a customer took it" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[2], LAYOUTS[1], LAYOUTS[0]], def: "9:16" },
    ],
    compose: (o) =>
      `${o.phone ? "Candid photo shot on iPhone, no retouching, slightly imperfect framing, " : "Natural photo, "}real apartment, natural skin tones. ` +
      `The product from the reference picture${o.person === "woman" ? ", a woman in her twenties in everyday clothes using it, mid-movement, face relaxed" : ""}, in ${SCENES[String(o.scene)] ?? SCENES.bedroom}, ${TIMES[String(o.time)] ?? TIMES.morning}. ` +
      `${ACCURACY} No sky, no clouds, no studio, no text. It should look like a real customer took it.`,
  },
  {
    id: "exploded",
    title: "Exploded view",
    sub: "Every part floating apart, neatly stacked",
    kind: "image",
    model: "gpt-image-2-edit",
    match: /explod|box|kit|cables|straps|pads|charger/i,
    icon: "M10 3v3 M10 8v4 M10 14v3 M5 6h10 M5 11h10 M5 16h10",
    refLabel: "Product picture",
    cta: "Make the view",
    fields: [
      { key: "bg", label: "Background", type: "choice", options: bgOptions(), def: "white" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[0], LAYOUTS[1], LAYOUTS[2]], def: "1:1" },
    ],
    compose: (o) =>
      `Exploded-view product render of the product in the reference picture: its parts separated and floating in a neat, evenly spaced vertical stack, each part still exact. ${ACCURACY} ` +
      `Background: ${bgText(o.bg)}. Soft glow, one hue family, clean technical feel. ${NO_SKY}.`,
  },
  {
    id: "socks",
    title: "Socks / accessory shot",
    sub: "An accessory, recoloured, on clean white",
    kind: "image",
    model: "gpt-image-2-edit",
    match: /sock|strap|pad|accessor/i,
    icon: "M7 3h6v7l3 3v4H8l-3-3v-4l2-2z",
    refLabel: "Reference picture",
    cta: "Make the shot",
    fields: [
      { key: "colour", label: "Colour", type: "choice", options: SOCK_COLOURS.map(({ value, label, swatch }) => ({ value, label, swatch })), def: "swan" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[0], LAYOUTS[1]], def: "1:1" },
    ],
    compose: (o) =>
      `Clean studio product shot of the accessory in the reference picture, recoloured to ${SOCK_COLOURS.find((c) => c.value === o.colour)?.text ?? "icy swan white"} while keeping every detail — shape, grip pattern, stitching, logo — identical. ${ACCURACY} ` +
      `Pure white seamless background, soft contact shadow, one hue family. ${NO_SKY}.`,
  },
  {
    id: "video",
    title: "Product video",
    sub: "Image → video, with sound",
    kind: "video",
    match: /studio|hero|band|bd-g-/i,
    icon: "M4 5h9v10H4z M13 8l3-2v8l-3-2",
    refLabel: "Source picture",
    cta: "Make the video",
    fields: [
      { key: "model", label: "Model", type: "model", ids: VIDEO_MODELS, def: "ltx-2-pro" },
      {
        key: "motion",
        label: "Motion",
        type: "choice",
        options: [
          { value: "orbit", label: "Slow orbit" },
          { value: "push", label: "Push in" },
          { value: "handheld", label: "Handheld" },
          { value: "screen", label: "Screen turns on" },
        ],
        def: "orbit",
      },
      { key: "duration", label: "Length", type: "length", def: "6" },
      { key: "aspect", label: "Shape", type: "aspect", options: [LAYOUTS[2], LAYOUTS[0], LAYOUTS[3]], def: "9:16" },
      { key: "audio", label: "Sound", type: "toggle", def: true, hint: "Room tone and the product's own sounds" },
    ],
    compose: (o) =>
      `${MOTIONS[String(o.motion)] ?? MOTIONS.orbit} Keep the product exactly as in the picture: same colours, same shape, same logo. No new objects, no text, no people appear.${o.audio ? " Quiet room tone." : ""}`,
  },
  {
    id: "ugcad",
    title: "UGC ad",
    sub: "A creator shows it and says your script",
    kind: "ugc",
    match: /real|life|girl|bd-[a-f]-/i,
    icon: "M10 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M4 17c0-3 3-5 6-5s6 2 6 5",
    refLabel: "Product picture",
    cta: "Make the ad",
    fields: [
      { key: "product", label: "The product, as she would say it", type: "text", def: "", placeholder: "the bodies board in Lilac Heat" },
      { key: "script", label: "What she says", type: "text", def: "", long: true, placeholder: "okay this folds under my bed and I did 20 minutes before work, I'm never going back to the studio", hint: "8 seconds is about 20 words." },
      { key: "creator", label: "Creator (optional)", type: "text", def: "", placeholder: "Latina, mid twenties, claw clip" },
      { key: "setting", label: "Where (optional)", type: "text", def: "", placeholder: "small living room, morning light" },
      { key: "model", label: "Video model", type: "model", ids: VIDEO_MODELS, def: "kling-3" },
      { key: "duration", label: "Length", type: "length", def: "8" },
    ],
    compose: (o) =>
      `Still (GPT Image 2 with reference): candid iPhone photo, ${String(o.creator) || "a real content creator in her twenties"} in ${String(o.setting) || "her real apartment, daylight from a window"}, holding and showing ${String(o.product) || "the product"} to the camera as if filming a selfie video, product exactly like the reference.\n` +
      `Video: she talks to the camera like a TikTok, natural handheld movement, lip sync. She says: "${String(o.script)}". Keep the product exactly as shown. Real room sound.`,
  },
];

const CUSTOM: Preset = {
  id: "custom",
  title: "Write your own",
  sub: "Any model, your own prompt",
  kind: "image",
  match: /$^/,
  icon: "M4 15l9-9 2 2-9 9H4z",
  refLabel: "Reference picture",
  cta: "Generate",
  fields: [
    { key: "model", label: "Model", type: "model", ids: [], def: "gpt-image-2-edit" },
    { key: "prompt", label: "Prompt", type: "text", def: "", long: true, placeholder: "Describe the picture or the motion…" },
    { key: "aspect", label: "Shape", type: "aspect", options: [...LAYOUTS, { value: "4:3", label: "Landscape" }], def: "1:1" },
    { key: "duration", label: "Length", type: "length", def: "6" },
    { key: "audio", label: "Sound", type: "toggle", def: true },
  ],
  compose: (o) => String(o.prompt ?? ""),
};

const ALL_PRESETS = [...PRESETS, CUSTOM];
const presetById = (id: string | null) => ALL_PRESETS.find((p) => p.id === id) ?? null;

function defaults(p: Preset): Opts {
  const o: Opts = {};
  for (const f of p.fields) o[f.key] = f.def;
  return o;
}

/* ------------------------------------------------------------------ view */

const isVideoKey = (key: string) => /\.(mp4|webm|mov)$/i.test(key);
const isPending = (r: GenerationRow) => r.status === "queued" || r.status === "in_progress";

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function timeAgo(value: Date | string, now: number): string {
  const s = Math.max(0, Math.floor((now - toDate(value).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return toDate(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Best-effort read-back of the UGC form from a row, for "Regenerate". */
function ugcFromRow(row: GenerationRow): { product: string; script: string } {
  const product = row.prompt.split(" — ")[0] ?? "";
  const videoPrompt = String(row.params.videoPrompt ?? "");
  const script = /She says: "([\s\S]*?)"\. Keep the product/.exec(videoPrompt)?.[1] ?? row.prompt.split(" — ").slice(1).join(" — ");
  return { product, script };
}

type Picture = { key: string; filename: string; studio: boolean };

export default function Studio({ loaderData }: Route.ComponentProps) {
  const { store, config, rows: loaded, pictures, models, encryption, tab: initialTab } = loaderData;
  const revalidator = useRevalidator();
  const poll = useFetcher<{ rows: GenerationRow[]; pending: number }>();
  const gen = useFetcher<Result>();
  const remove = useFetcher<Result>();
  const keyForm = useFetcher<Result>();
  const suffix = store ? `?store=${store.slug}` : "";

  /* --- rows: the loader's list, overridden by a fresher poll until the next revalidation */
  const [override, setOverride] = React.useState<GenerationRow[] | null>(null);
  React.useEffect(() => setOverride(null), [loaded]);
  React.useEffect(() => {
    if (poll.data?.rows) setOverride(poll.data.rows);
  }, [poll.data]);
  const rows = override ?? loaded;
  const pending = rows.some(isPending);

  /* --- composer state */
  const [presetId, setPresetId] = React.useState<string | null>(initialTab === "video" ? "video" : initialTab === "ugc" ? "ugcad" : null);
  const preset = presetById(presetId);
  const [opts, setOpts] = React.useState<Opts>({});
  const [customPrompt, setCustomPrompt] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(1);
  const [inputKey, setInputKey] = React.useState("");
  const [upload, setUpload] = React.useState<{ name: string; url: string } | null>(null);
  const [picker, setPicker] = React.useState(false);
  const [promptOpen, setPromptOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const composerRef = React.useRef<HTMLDivElement>(null);
  const keyRef = React.useRef<HTMLDivElement>(null);

  const choose = (id: string | null, seed?: Opts) => {
    const p = presetById(id);
    setPresetId(id);
    setOpts(p ? ({ ...defaults(p), ...seed } as Opts) : {});
    setCustomPrompt(null);
    setPromptOpen(false);
    setCount(1);
    if (p) requestAnimationFrame(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const set = (key: string, value: string | boolean) => {
    setOpts((o) => ({ ...o, [key]: value }));
    if (key !== "prompt") setCustomPrompt(null);
  };

  // The model in play: fixed by the recipe, or picked in it.
  const modelId = preset?.model ?? String(opts.model ?? "");
  const activeModel: PublicModel | undefined = models.find((m) => m.id === modelId);
  const kind: Kind = preset?.id === "custom" ? ((activeModel?.kind as Kind) ?? "image") : (preset?.kind ?? "image");
  const needsImage = kind === "ugc" || Boolean(activeModel?.needsImage);
  const hasImage = Boolean(upload || inputKey);

  // Keep shape and length legal for the chosen model.
  React.useEffect(() => {
    if (!activeModel) return;
    const a = String(opts.aspect ?? "");
    if (a && !activeModel.aspects.includes(a)) set("aspect", kind === "image" ? (activeModel.aspects.includes("1:1") ? "1:1" : activeModel.aspects[0]) : "9:16");
    const d = String(opts.duration ?? "");
    if (activeModel.durations && d && !activeModel.durations.includes(d)) set("duration", activeModel.durations.includes(d) ? d : activeModel.durations.includes("6") ? "6" : activeModel.durations[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModel?.id]);

  const composed = preset ? preset.compose(opts) : "";
  const prompt = customPrompt ?? composed;

  /* --- viewer */
  const [viewId, setViewId] = React.useState<string | null>(null);
  const viewing = rows.find((r) => r.id === viewId) ?? null;
  const [filter, setFilter] = React.useState<"all" | Kind>("all");

  /* --- a ticking clock for elapsed seconds and "x min ago" */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), pending ? 1000 : 30000);
    return () => clearInterval(t);
  }, [pending]);

  // While something is generating, ask every 5 seconds. Stops on its own.
  React.useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (poll.state === "idle") poll.load(`/admin/studio/status${suffix}`);
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, suffix]);

  // A finished batch also shows up in Media; refresh the picker list once.
  const wasPending = React.useRef(pending);
  React.useEffect(() => {
    if (wasPending.current && !pending) revalidator.revalidate();
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // After a successful submit, refresh so the new row appears in Recent.
  const lastGen = React.useRef<Result | undefined>(undefined);
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (gen.state === "idle" && gen.data && gen.data !== lastGen.current) {
      lastGen.current = gen.data;
      if (gen.data.ok) {
        setToast(gen.data.ok);
        revalidator.revalidate();
        window.setTimeout(() => setToast(null), 3500);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.state, gen.data]);

  React.useEffect(() => {
    if (keyForm.state === "idle" && keyForm.data?.ok) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyForm.state, keyForm.data]);

  React.useEffect(() => {
    if (remove.state === "idle" && remove.data?.ok) {
      setViewId(null);
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remove.state, remove.data]);

  // ⌘/Ctrl+Enter generates; Esc closes whatever is open.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
      if (e.key === "Escape") {
        setViewId(null);
        setPicker(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Release object URLs for previews.
  React.useEffect(() => () => {
    if (upload) URL.revokeObjectURL(upload.url);
  }, [upload]);

  const busy = gen.state !== "idle";

  const chooseFile = (file: File | null) => {
    if (upload) URL.revokeObjectURL(upload.url);
    if (!file) {
      setUpload(null);
      return;
    }
    setUpload({ name: file.name, url: URL.createObjectURL(file) });
    setInputKey("");
    setPicker(false);
  };

  const clearReference = () => {
    chooseFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setInputKey("");
  };

  const useAsReference = (key: string) => {
    if (fileRef.current) fileRef.current.value = "";
    if (upload) URL.revokeObjectURL(upload.url);
    setUpload(null);
    setInputKey(key);
  };

  const makeVideoFrom = (key: string) => {
    setViewId(null);
    useAsReference(key);
    choose("video");
  };

  const referenceFromViewer = (key: string) => {
    setViewId(null);
    useAsReference(key);
    if (!preset || preset.kind !== "image") choose("clean");
    else composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const regenerate = (row: GenerationRow) => {
    const p = row.params;
    setViewId(null);
    if (row.inputKey) useAsReference(row.inputKey);
    else clearReference();
    if (row.kind === "ugc") {
      const back = ugcFromRow(row);
      choose("ugcad", { product: back.product, script: back.script, model: String(p.videoModel ?? "seedance-2"), duration: String(p.duration ?? "8") });
      return;
    }
    choose("custom", {
      model: row.model,
      prompt: row.prompt,
      aspect: typeof p.aspect === "string" ? p.aspect : "1:1",
      duration: typeof p.duration === "string" ? p.duration : "6",
      audio: typeof p.audio === "boolean" ? p.audio : true,
    });
    if (typeof p.count === "number") setCount(p.count);
    // Submit on the next frame so the hidden inputs carry the new values.
    requestAnimationFrame(() => requestAnimationFrame(() => formRef.current?.requestSubmit()));
  };

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const referencePreview = upload ? upload.url : inputKey ? `/media/${inputKey}` : null;
  const referenceLabel = upload ? upload.name : inputKey ? pictures.find((p) => p.key === inputKey)?.filename ?? inputKey : "";
  const recent = rows.filter((r) => filter === "all" || r.kind === filter);
  const modelLabel = (id: string) => models.find((m) => m.id === id)?.label ?? id;
  const thumbFor = (p: Preset): string | null => {
    const hit = pictures.find((m) => !m.studio && p.match.test(m.filename)) ?? pictures.find((m) => p.match.test(m.filename));
    return hit ? `/media/${hit.key}` : null;
  };
  const quickPictures = pictures.filter((p) => !p.studio).slice(0, 7);

  const canGenerate = Boolean(config) && !busy && Boolean(preset) && (!needsImage || hasImage) && (kind === "ugc" ? Boolean(opts.product && opts.script) : prompt.trim().length > 0);

  return (
    <div className="sx">
      <style>{STYLE}</style>

      {/* ------------------------------------------------------------ header */}
      <header className="sx-head">
        <div className="sx-brand">
          <img src="/logo-mark.png" alt="" className="sx-logo" />
          <div>
            <h1 className="sx-title">Studio</h1>
            <div className="sx-sub">Pick a preset, point at a product picture, press make.</div>
          </div>
        </div>
        <div className="sx-status">
          <span className="sx-chip">
            <span className="sx-chip-dot" />
            {store.name}
          </span>
          {config ? (
            <keyForm.Form method="post" style={{ margin: 0 }} onSubmit={(e) => (window.confirm("Remove the fal key?") ? undefined : e.preventDefault())}>
              <input type="hidden" name="intent" value="disconnect" />
              <span className="sx-chip sx-chip-ok" title={`Connected ${config.connectedAt ? timeAgo(config.connectedAt, now) : ""}`}>
                <span className="sx-chip-dot" />
                {config.keyId}
                <button type="submit" className="sx-chip-x" disabled={keyForm.state !== "idle"} aria-label="Disconnect the key" title="Disconnect">
                  ×
                </button>
              </span>
            </keyForm.Form>
          ) : (
            <button type="button" className="sx-chip sx-chip-warn" onClick={() => keyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span className="sx-chip-dot" />
              Add key
            </button>
          )}
          <span className="sx-balance">Paid per run through your fal key</span>
        </div>
      </header>

      {!config ? (
        <div className="sx-keywrap" ref={keyRef}>
          <div className="sx-keycard">
            <img src="/logo-mark.png" alt="" className="sx-logo sx-logo-lg" />
            <div className="sx-keycard-title">Add your fal.ai key</div>
            <div className="sx-muted">One key runs every model here. Get it at fal.ai → Dashboard → Keys. It is encrypted before it is stored.</div>
            {!encryption ? <div className="sx-notice">The Worker has no ENCRYPTION_KEY, so the key cannot be stored yet.</div> : null}
            {keyForm.data?.error ? <div className="sx-notice">{keyForm.data.error}</div> : null}
            <keyForm.Form method="post" className="sx-keyform">
              <input type="hidden" name="intent" value="connect" />
              <input name="secret" type="password" className="sx-input" placeholder="key_…" autoComplete="off" required aria-label="fal key" />
              <button type="submit" className="sx-btn sx-btn-lime" disabled={keyForm.state !== "idle" || !encryption}>
                {keyForm.state !== "idle" ? "Checking…" : "Connect"}
              </button>
            </keyForm.Form>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------------- hero */}
      <section className="sx-hero">
        <div className="sx-hero-head">
          <h2 className="sx-h2">What do you want to make?</h2>
          <button type="button" className="sx-link" onClick={() => choose(presetId === "custom" ? null : "custom")} aria-pressed={presetId === "custom"}>
            Advanced · write your own
          </button>
        </div>
        <div className="sx-tiles">
          {PRESETS.map((p) => {
            const thumb = thumbFor(p);
            return (
              <button key={p.id} type="button" className="sx-tile" aria-pressed={presetId === p.id} onClick={() => choose(presetId === p.id ? null : p.id)}>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="sx-tile-blank" />}
                <span className="sx-tile-scrim" />
                <span className="sx-tile-kind">{p.kind === "ugc" ? "UGC · video" : p.kind}</span>
                <span className="sx-tile-icon">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                    <path d={p.icon} />
                  </svg>
                </span>
                <span className="sx-tile-text">
                  <span className="sx-tile-title">{p.title}</span>
                  <span className="sx-tile-sub">{p.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- composer */}
      <div ref={composerRef} style={{ scrollMarginTop: 12 }}>
        {preset ? (
          <gen.Form ref={formRef} method="post" encType="multipart/form-data" className="sx-composer">
            <input type="hidden" name="intent" value="generate" />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="inputKey" value={inputKey} />
            <input ref={fileRef} type="file" name="file" accept="image/*" hidden onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
            {kind === "ugc" ? (
              <>
                <input type="hidden" name="videoModel" value={modelId} />
                <input type="hidden" name="product" value={String(opts.product ?? "")} />
                <input type="hidden" name="script" value={String(opts.script ?? "")} />
                <input type="hidden" name="creator" value={String(opts.creator ?? "")} />
                <input type="hidden" name="setting" value={String(opts.setting ?? "")} />
                <input type="hidden" name="duration" value={String(opts.duration ?? "8")} />
              </>
            ) : (
              <>
                <input type="hidden" name="model" value={modelId} />
                <input type="hidden" name="prompt" value={prompt} />
                <input type="hidden" name="aspect" value={String(opts.aspect ?? activeModel?.aspects[0] ?? "1:1")} />
                <input type="hidden" name="duration" value={String(opts.duration ?? "6")} />
                <input type="hidden" name="count" value={kind === "image" ? count : 1} />
                {kind === "video" && opts.audio ? <input type="hidden" name="audio" value="on" /> : null}
              </>
            )}

            <div className="sx-composer-head">
              <span className="sx-composer-icon">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                  <path d={preset.icon} />
                </svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sx-composer-title">{preset.title}</div>
                <div className="sx-muted">
                  {kind === "ugc" ? "GPT Image 2 makes the still, then the video model makes her talk" : activeModel ? `${activeModel.label} · ${activeModel.maker}` : preset.sub}
                </div>
              </div>
              <button type="button" className="sx-link" onClick={() => choose(null)}>
                Close
              </button>
            </div>

            <div className="sx-composer-body">
              {/* reference */}
              <div className="sx-col">
                <div className="sx-label">
                  {preset.refLabel}
                  {!needsImage ? <span className="sx-muted"> · optional</span> : null}
                </div>
                {referencePreview ? (
                  <div className="sx-ref">
                    <img src={referencePreview} alt="" />
                    <div className="sx-ref-meta">
                      <span className="sx-ellipsis" title={referenceLabel}>{referenceLabel}</span>
                      <span style={{ display: "flex", gap: 10 }}>
                        <button type="button" className="sx-link" onClick={() => setPicker(true)}>Change</button>
                        <button type="button" className="sx-link" onClick={clearReference}>Remove</button>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="sx-quick">
                    {quickPictures.map((p) => (
                      <button key={p.key} type="button" className="sx-quick-item" onClick={() => useAsReference(p.key)} title={p.filename}>
                        <img src={`/media/${p.key}`} alt="" loading="lazy" />
                      </button>
                    ))}
                    <button type="button" className="sx-quick-item sx-quick-more" onClick={() => setPicker(true)}>
                      All media
                    </button>
                    <button type="button" className="sx-quick-item sx-quick-more" onClick={() => fileRef.current?.click()}>
                      Upload
                    </button>
                  </div>
                )}
                {kind === "image" && preset.id === "custom" && activeModel?.id === "gpt-image-2" && hasImage ? (
                  <div className="sx-muted">GPT Image 2 ignores pictures. Pick “GPT Image 2 with reference” to keep your product.</div>
                ) : null}
              </div>

              {/* pickers */}
              <div className="sx-col sx-pickers">
                {preset.fields.map((f, i) => (
                  <FieldView
                    key={f.key}
                    field={f}
                    step={kind === "ugc" ? i + 1 : undefined}
                    value={opts[f.key]}
                    models={models}
                    activeModel={activeModel}
                    onChange={(v) => set(f.key, v)}
                  />
                ))}
                {kind === "image" && preset.id !== "custom" ? (
                  <div className="sx-field">
                    <div className="sx-label">How many</div>
                    <div className="sx-chips">
                      {[1, 2, 4].map((n) => (
                        <button key={n} type="button" className="sx-chip-btn" aria-pressed={count === n} onClick={() => setCount(n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* the prompt, transparent */}
            {preset.id !== "custom" ? (
              <div className="sx-prompt">
                <button type="button" className="sx-link" onClick={() => setPromptOpen((o) => !o)} aria-expanded={promptOpen}>
                  {promptOpen ? "Hide the prompt" : "See the prompt"}
                  {customPrompt !== null ? " · edited" : ""}
                </button>
                {promptOpen ? (
                  kind === "ugc" ? (
                    <pre className="sx-prompt-pre">{composed}</pre>
                  ) : (
                    <>
                      <textarea className="sx-textarea" value={prompt} onChange={(e) => setCustomPrompt(e.target.value)} aria-label="Prompt" rows={5} />
                      {customPrompt !== null ? (
                        <button type="button" className="sx-link" onClick={() => setCustomPrompt(null)}>Reset to the recipe</button>
                      ) : (
                        <span className="sx-muted">Edit it if you like; changing a picker writes it again.</span>
                      )}
                    </>
                  )
                ) : null}
              </div>
            ) : null}

            {gen.data?.error && gen.state === "idle" ? <div className="sx-notice">{gen.data.error}</div> : null}

            <div className="sx-go">
              <button type="submit" className="sx-btn sx-btn-lime sx-btn-big" disabled={!canGenerate}>
                {busy ? "Sending…" : kind === "image" && count > 1 ? `${preset.cta} ×${count}` : preset.cta}
              </button>
              <span className="sx-kbd">⌘↵</span>
              <span className="sx-muted">
                {!config ? "Add the fal key first." : needsImage && !hasImage ? "Pick a picture to start from." : kind === "ugc" && !(opts.product && opts.script) ? "Name the product and write what she says." : kind === "video" ? `${String(opts.duration ?? "")}s · ${String(opts.aspect ?? "")}` : ""}
              </span>
              {toast ? <span className="sx-toast">{toast}</span> : null}
            </div>
          </gen.Form>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ recent */}
      <section className="sx-recent">
        <div className="sx-recent-head">
          <h2 className="sx-h2">Recent</h2>
          <div className="sx-chips">
            {(["all", "image", "video", "ugc"] as const).map((f) => (
              <button key={f} type="button" className="sx-chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? `All ${rows.length}` : f === "ugc" ? "UGC ad" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {recent.length === 0 ? (
          <div className="sx-empty">
            <div className="sx-empty-title">{rows.length ? "Nothing of this kind yet" : config ? "Pick a preset above" : "Add your key, then pick a preset"}</div>
            <div className="sx-muted">{rows.length ? "Switch the filter, or make one." : "Everything you make shows up here and in Media."}</div>
          </div>
        ) : (
          <div className="sx-masonry">
            {recent.map((row) => {
              const thumb = row.status === "completed" ? row.outputKeys[0] : row.stillKey ?? row.inputKey;
              const ratio = String(row.params.aspect ?? (row.kind === "image" ? "1:1" : "9:16")).replace(":", " / ");
              return (
                <button key={row.id} type="button" className="sx-card" onClick={() => setViewId(row.id)} style={{ aspectRatio: ratio }} title={row.prompt}>
                  {thumb ? (
                    isVideoKey(thumb) ? (
                      <video src={`/media/${thumb}`} muted playsInline loop preload="metadata" onMouseEnter={(e) => void e.currentTarget.play().catch(() => null)} onMouseLeave={(e) => e.currentTarget.pause()} />
                    ) : (
                      <img src={`/media/${thumb}`} alt="" loading="lazy" style={isPending(row) ? { opacity: 0.4, filter: "blur(2px)" } : undefined} />
                    )
                  ) : (
                    <span className="sx-card-blank">{row.status === "failed" ? "Failed" : ""}</span>
                  )}
                  <span className="sx-card-top">
                    <StatusPill row={row} now={now} />
                    {row.outputKeys.length > 1 ? <span className="sx-count">{row.outputKeys.length}</span> : null}
                  </span>
                  <span className="sx-card-bottom">
                    <span className="sx-ellipsis">{row.prompt}</span>
                    <span className="sx-card-meta">{modelLabel(row.model)} · {timeAgo(row.createdAt, now)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {viewing ? (
        <Viewer
          row={viewing}
          now={now}
          modelLabel={modelLabel(viewing.model)}
          storeSuffix={suffix}
          busy={remove.state !== "idle"}
          onUse={referenceFromViewer}
          onVideo={makeVideoFrom}
          onRegenerate={regenerate}
          onClose={() => setViewId(null)}
          onDelete={(id) => {
            if (!window.confirm("Delete this generation? The files stay in Media.")) return;
            remove.submit({ intent: "delete", id }, { method: "post" });
          }}
        />
      ) : null}

      {picker ? (
        <MediaPicker
          pictures={pictures}
          current={inputKey}
          storeSuffix={suffix}
          onPick={(key) => { useAsReference(key); setPicker(false); }}
          onUpload={() => fileRef.current?.click()}
          onClose={() => setPicker(false)}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function FieldView({
  field,
  step,
  value,
  models,
  activeModel,
  onChange,
}: {
  field: Field;
  step?: number;
  value: string | boolean | undefined;
  models: PublicModel[];
  activeModel: PublicModel | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const label = (
    <div className="sx-label">
      {step ? <span className="sx-step">{step}</span> : null}
      {field.label}
    </div>
  );
  if (field.type === "toggle") {
    const on = Boolean(value);
    return (
      <div className="sx-field sx-field-row">
        <div>
          <div className="sx-label" style={{ marginBottom: 0 }}>{field.label}</div>
          {field.hint ? <div className="sx-muted">{field.hint}</div> : null}
        </div>
        <button type="button" role="switch" aria-checked={on} className="sx-switch" onClick={() => onChange(!on)} aria-label={field.label}>
          <span />
        </button>
      </div>
    );
  }
  if (field.type === "text") {
    return (
      <div className="sx-field">
        {label}
        {field.long ? (
          <textarea className="sx-textarea" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={3} />
        ) : (
          <input className="sx-input" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
        )}
        {field.hint ? <div className="sx-muted">{field.hint}</div> : null}
      </div>
    );
  }
  if (field.type === "model") {
    const list = field.ids.length ? field.ids.map((id) => models.find((m) => m.id === id)).filter((m): m is PublicModel => Boolean(m)) : models;
    return (
      <div className="sx-field">
        {label}
        <div className="sx-models">
          {list.map((m) => (
            <button key={m.id} type="button" className="sx-model" aria-pressed={value === m.id} onClick={() => onChange(m.id)}>
              <span className="sx-model-name">{m.label}</span>
              <span className="sx-model-maker">{m.maker}</span>
              <span className="sx-model-note">{m.note}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "length") {
    const list = activeModel?.durations;
    if (!list) return null;
    return (
      <div className="sx-field">
        {label}
        <div className="sx-chips">
          {list.map((d) => (
            <button key={d} type="button" className="sx-chip-btn" aria-pressed={value === d} onClick={() => onChange(d)}>{d}s</button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "aspect") {
    const list = field.options.filter((o) => !activeModel || activeModel.aspects.includes(o.value));
    if (list.length < 2) return null;
    return (
      <div className="sx-field">
        {label}
        <div className="sx-chips">
          {list.map((o) => (
            <button key={o.value} type="button" className="sx-chip-btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
              <span className={`sx-shape sx-shape-${o.value.replace(":", "x")}`} />
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="sx-field">
      {label}
      <div className="sx-chips">
        {field.options.map((o) => (
          <button key={o.value} type="button" className="sx-chip-btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.swatch ? <span className="sx-swatch" style={{ background: o.swatch }} /> : null}
            {o.label}
          </button>
        ))}
      </div>
      {field.hint ? <div className="sx-muted">{field.hint}</div> : null}
    </div>
  );
}

function StatusPill({ row, now }: { row: GenerationRow; now: number }) {
  const started = toDate(row.stage === 2 ? row.updatedAt : row.createdAt).getTime();
  const elapsed = Math.max(0, Math.floor((now - started) / 1000));
  const map: Record<string, { cls: string; text: string }> = {
    queued: { cls: "wait", text: `Queued · ${elapsed}s` },
    in_progress: { cls: "run", text: `${row.kind === "ugc" && row.stage === 2 ? "Video" : "Running"} · ${elapsed}s` },
    completed: { cls: "ok", text: row.kind === "ugc" ? "UGC ad" : row.kind === "video" ? "Video" : "Image" },
    failed: { cls: "bad", text: "Failed" },
    nsfw: { cls: "warn", text: "Blocked" },
    canceled: { cls: "wait", text: "Canceled" },
  };
  const s = map[row.status] ?? map.queued;
  return (
    <span className={`sx-pill sx-pill-${s.cls}`}>
      {isPending(row) ? <span className="sx-spin" /> : null}
      {s.text}
    </span>
  );
}

function Viewer({
  row,
  now,
  modelLabel,
  storeSuffix,
  busy,
  onUse,
  onVideo,
  onRegenerate,
  onDelete,
  onClose,
}: {
  row: GenerationRow;
  now: number;
  modelLabel: string;
  storeSuffix: string;
  busy: boolean;
  onUse: (key: string) => void;
  onVideo: (key: string) => void;
  onRegenerate: (row: GenerationRow) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [row.id]);
  const done = row.status === "completed";
  const files = done ? row.outputKeys : [];
  const current = files[Math.min(index, Math.max(0, files.length - 1))];
  const working = isPending(row);
  const ghost = working ? row.stillKey ?? row.inputKey : null;

  return (
    <div className="sx-viewer" role="dialog" aria-modal="true" aria-label="Generation" onClick={onClose}>
      <div className="sx-viewer-top" onClick={(e) => e.stopPropagation()}>
        <StatusPill row={row} now={now} />
        <span className="sx-muted sx-ellipsis" style={{ flex: 1 }}>
          {modelLabel}
          {typeof row.params.aspect === "string" ? ` · ${row.params.aspect}` : ""}
          {row.kind !== "image" && row.params.duration ? ` · ${String(row.params.duration)}s` : ""}
          {" · "}
          {timeAgo(row.createdAt, now)}
        </span>
        <button type="button" className="sx-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="sx-viewer-stage">
        {current ? (
          isVideoKey(current) ? (
            <video key={current} src={`/media/${current}`} controls playsInline autoPlay loop onClick={(e) => e.stopPropagation()} />
          ) : (
            <img key={current} src={`/media/${current}`} alt={row.prompt} onClick={(e) => e.stopPropagation()} />
          )
        ) : working ? (
          <div className="sx-viewer-working" onClick={(e) => e.stopPropagation()}>
            {ghost ? <img src={`/media/${ghost}`} alt="" className="sx-ghost" /> : null}
            <div className="sx-viewer-msg">
              <span className="sx-spin sx-spin-lg" />
              <span>{row.kind === "ugc" ? (row.stage === 2 ? "Still done, now the video…" : "Making the still first…") : row.status === "queued" ? "Waiting in fal's queue…" : "The model is working…"}</span>
            </div>
          </div>
        ) : (
          <div className="sx-viewer-failed" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{row.status === "nsfw" ? "The model blocked this one" : "Did not finish"}</div>
            <div className="sx-error">{row.error ?? "The model returned nothing."}</div>
          </div>
        )}
      </div>

      <div className="sx-viewer-bottom" onClick={(e) => e.stopPropagation()}>
        {files.length > 1 ? (
          <div className="sx-strip">
            {files.map((k, i) => (
              <button key={k} type="button" className="sx-strip-item" aria-pressed={i === index} onClick={() => setIndex(i)}>
                <img src={`/media/${k}`} alt="" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="sx-viewer-prompt" title={row.prompt}>{row.prompt}</div>
        <div className="sx-actions">
          {current && !isVideoKey(current) ? (
            <>
              <button type="button" className="sx-btn" onClick={() => onUse(current)}>Use as reference</button>
              <button type="button" className="sx-btn" onClick={() => onVideo(current)}>Make a video</button>
            </>
          ) : null}
          {current ? (
            <>
              <a href={`/media/${current}`} download className="sx-btn">Download</a>
              <Link to={`/admin/media${storeSuffix}`} className="sx-btn">In media library ✓</Link>
            </>
          ) : null}
          {!working ? <button type="button" className="sx-btn" onClick={() => onRegenerate(row)}>{row.kind === "ugc" ? "Edit and run again" : "Regenerate"}</button> : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="sx-btn sx-btn-danger" disabled={busy} onClick={() => onDelete(row.id)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function MediaPicker({
  pictures,
  current,
  storeSuffix,
  onPick,
  onUpload,
  onClose,
}: {
  pictures: Picture[];
  current: string;
  storeSuffix: string;
  onPick: (key: string) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [only, setOnly] = React.useState<"all" | "media" | "studio">("all");
  const list = pictures.filter((p) => (only === "all" || (only === "studio") === p.studio) && (!q || p.filename.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="sx-modal-back" onClick={onClose} role="presentation">
      <div className="sx-modal" role="dialog" aria-modal="true" aria-label="Pick a picture" onClick={(e) => e.stopPropagation()}>
        <div className="sx-modal-head">
          <span style={{ fontWeight: 650, flex: 1 }}>Pick a picture</span>
          <div className="sx-chips">
            {(["all", "media", "studio"] as const).map((f) => (
              <button key={f} type="button" className="sx-chip-btn" aria-pressed={only === f} onClick={() => setOnly(f)}>
                {f === "all" ? "All" : f === "media" ? "Uploads" : "Made here"}
              </button>
            ))}
          </div>
          <input className="sx-input" style={{ maxWidth: 200 }} placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
          <button type="button" className="sx-btn" onClick={onUpload}>Upload</button>
          <button type="button" className="sx-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {pictures.length === 0 ? (
          <div className="sx-empty">
            <div className="sx-empty-title">No pictures in Media yet</div>
            <div className="sx-muted">Upload one here, or add pictures in Media.</div>
            <Link to={`/admin/media${storeSuffix}`} className="sx-btn" style={{ marginTop: 10 }}>Open Media</Link>
          </div>
        ) : list.length === 0 ? (
          <div className="sx-empty">
            <div className="sx-empty-title">No match</div>
          </div>
        ) : (
          <div className="sx-pickgrid">
            {list.map((p) => (
              <button key={p.key} type="button" className="sx-pick" aria-pressed={current === p.key} onClick={() => onPick(p.key)} title={p.filename}>
                <img src={`/media/${p.key}`} alt="" loading="lazy" />
                <span className="sx-pick-name">{p.filename}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- styles */

const STYLE = `
.sx{--bg:#0F1012;--card:#17181C;--card-2:#1E2025;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.16);--ink:#F5F6F8;--mute:#9AA0AA;--lime:#C6F135;--lime-ink:#101208;--r:14px;
  background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;border-radius:var(--r);padding:20px;display:grid;gap:24px;min-height:calc(100vh - 120px);color-scheme:dark}
.sx *{box-sizing:border-box}
.sx a{color:inherit}
.sx h1,.sx h2{margin:0}
.sx-muted{font-size:12px;color:var(--mute);line-height:17px}
.sx-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.sx-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.sx-brand{display:flex;align-items:center;gap:12px}
.sx-logo{width:40px;height:40px;object-fit:contain;display:block;border-radius:10px;background:#000}
.sx-logo-lg{width:52px;height:52px;margin:0 auto 4px}
.sx-title{font-size:22px;line-height:28px;font-weight:700;letter-spacing:-.02em}
.sx-sub{font-size:13px;color:var(--mute)}
.sx-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sx-chip{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap}
.sx-chip-dot{width:7px;height:7px;border-radius:50%;background:var(--mute)}
.sx-chip-ok .sx-chip-dot{background:var(--lime);box-shadow:0 0 8px var(--lime)}
.sx-chip-warn{cursor:pointer}.sx-chip-warn .sx-chip-dot{background:#F0B429}
.sx-chip-x{border:0;background:transparent;color:var(--mute);font-size:15px;line-height:1;cursor:pointer;padding:0 0 0 2px}
.sx-chip-x:hover{color:var(--ink)}
.sx-balance{font-size:12px;color:var(--mute)}
.sx-h2{font-size:16px;font-weight:650;letter-spacing:-.01em}
.sx-link{border:0;background:transparent;padding:0;font:inherit;font-size:12px;font-weight:600;color:var(--lime);cursor:pointer}
.sx-link:hover{text-decoration:underline}
.sx-link[aria-pressed="true"]{text-decoration:underline}
.sx-keywrap{display:grid;place-items:center}
.sx-keycard{width:min(440px,100%);text-align:center;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:26px 22px;display:grid;gap:8px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.sx-keycard-title{font-size:16px;font-weight:650}
.sx-keyform{display:flex;gap:8px;margin:8px 0 0}
.sx-keyform .sx-input{flex:1}
.sx-input{height:36px;width:100%;padding:0 12px;border-radius:10px;border:1px solid var(--line-2);background:#0B0C0E;color:var(--ink);font:inherit;font-size:13px}
.sx-input:focus,.sx-textarea:focus{outline:none;border-color:var(--lime)}
.sx-textarea{width:100%;min-height:72px;padding:9px 12px;border-radius:10px;border:1px solid var(--line-2);background:#0B0C0E;color:var(--ink);font:inherit;font-size:13px;line-height:20px;resize:vertical}
.sx-notice{padding:9px 11px;border-radius:10px;font-size:12px;line-height:16px;background:rgba(255,90,90,.12);color:#FF8A8A;border:1px solid rgba(255,90,90,.25)}
.sx-btn{height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--line-2);background:var(--card-2);color:var(--ink);font:inherit;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none}
.sx-btn:hover:not(:disabled){background:#26282E}
.sx-btn:disabled{opacity:.45;cursor:not-allowed}
.sx-btn-danger{color:#FF8A8A;border-color:rgba(255,90,90,.3)}
.sx-btn-lime{background:var(--lime);color:var(--lime-ink);border-color:var(--lime);font-weight:700}
.sx-btn-lime:hover:not(:disabled){background:#D4FF4A}
.sx-btn-big{height:44px;padding:0 24px;font-size:14px;border-radius:12px;box-shadow:0 0 0 0 rgba(198,241,53,0);transition:box-shadow .2s}
.sx-btn-big:not(:disabled):hover{box-shadow:0 0 24px rgba(198,241,53,.35)}
.sx-kbd{font-size:11px;color:var(--mute);border:1px solid var(--line-2);border-radius:6px;padding:2px 7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sx-toast{font-size:12px;color:var(--lime);font-weight:600}
/* hero tiles */
.sx-hero{display:grid;gap:12px}
.sx-hero-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sx-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sx-tile{position:relative;padding:0;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:var(--card);cursor:pointer;aspect-ratio:4/3;text-align:left;color:var(--ink);transition:transform .35s cubic-bezier(.2,.7,.2,1),border-color .2s}
.sx-tile:hover{transform:translateY(-2px);border-color:var(--line-2)}
.sx-tile[aria-pressed="true"]{border-color:var(--lime);box-shadow:0 0 0 1px var(--lime),0 12px 40px rgba(198,241,53,.12)}
.sx-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.sx-tile:hover img{transform:scale(1.04)}
.sx-tile-blank{position:absolute;inset:0;background:radial-gradient(120% 80% at 80% 0%,#2A2D36 0%,#17181C 60%)}
.sx-tile-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,16,18,.1) 0%,rgba(15,16,18,.25) 45%,rgba(15,16,18,.92) 100%)}
.sx-tile-kind{position:absolute;top:10px;left:10px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.85);background:rgba(0,0,0,.45);backdrop-filter:blur(6px);padding:3px 8px;border-radius:999px}
.sx-tile-icon{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:9px;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);display:grid;place-items:center;color:var(--lime)}
.sx-tile-text{position:absolute;left:14px;right:14px;bottom:12px;display:grid;gap:2px}
.sx-tile-title{font-size:15px;font-weight:700;letter-spacing:-.01em;line-height:20px}
.sx-tile-sub{font-size:12px;color:rgba(255,255,255,.7);line-height:16px}
/* composer */
.sx-composer{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px;display:grid;gap:16px;margin:0;animation:sxIn .2s ease}
@keyframes sxIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.sx-composer-head{display:flex;align-items:center;gap:12px}
.sx-composer-icon{width:36px;height:36px;border-radius:10px;background:rgba(198,241,53,.12);color:var(--lime);display:grid;place-items:center;flex:none}
.sx-composer-title{font-size:15px;font-weight:650}
.sx-composer-body{display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px;align-items:start}
.sx-col{display:grid;gap:12px;min-width:0}
.sx-pickers{gap:16px}
.sx-label{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px}
.sx-step{width:18px;height:18px;border-radius:50%;background:var(--lime);color:var(--lime-ink);font-size:11px;font-weight:700;display:grid;place-items:center}
.sx-field{display:block}
.sx-field-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card-2)}
.sx-switch{width:40px;height:22px;border-radius:999px;border:0;background:#33363E;position:relative;cursor:pointer;flex:none;transition:background .2s}
.sx-switch span{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
.sx-switch[aria-checked="true"]{background:var(--lime)}
.sx-switch[aria-checked="true"] span{transform:translateX(18px)}
.sx-chips{display:flex;gap:6px;flex-wrap:wrap}
.sx-chip-btn{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line-2);background:transparent;color:var(--ink);font:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s}
.sx-chip-btn:hover{background:var(--card-2)}
.sx-chip-btn[aria-pressed="true"]{background:var(--ink);color:#0F1012;border-color:var(--ink)}
.sx-swatch{width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,.25);flex:none}
.sx-shape{display:inline-block;border:1.5px solid currentColor;border-radius:2px;opacity:.8}
.sx-shape-1x1{width:11px;height:11px}.sx-shape-3x4{width:9px;height:12px}.sx-shape-4x3{width:12px;height:9px}
.sx-shape-9x16{width:7px;height:13px}.sx-shape-16x9{width:15px;height:8px}
.sx-models{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.sx-model{display:grid;gap:2px;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid var(--line-2);background:transparent;cursor:pointer;color:var(--ink);font:inherit}
.sx-model:hover{background:var(--card-2)}
.sx-model[aria-pressed="true"]{border-color:var(--lime);box-shadow:inset 0 0 0 1px var(--lime);background:rgba(198,241,53,.06)}
.sx-model-name{font-size:13px;font-weight:650}
.sx-model-maker{font-size:11px;color:var(--mute)}
.sx-model-note{font-size:11px;color:var(--mute);line-height:15px;margin-top:2px}
.sx-ref{display:grid;gap:8px;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--card-2)}
.sx-ref img{width:100%;aspect-ratio:1;border-radius:8px;object-fit:cover;background:#000;display:block}
.sx-ref-meta{display:flex;justify-content:space-between;gap:8px;min-width:0;font-size:12px;color:var(--mute);align-items:center}
.sx-quick{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.sx-quick-item{padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card-2);cursor:pointer;aspect-ratio:1;color:var(--ink);font:inherit;font-size:12px;font-weight:600}
.sx-quick-item:hover{border-color:var(--lime)}
.sx-quick-item img{width:100%;height:100%;object-fit:cover;display:block}
.sx-quick-more{border-style:dashed;color:var(--mute)}
.sx-prompt{display:grid;gap:8px;padding-top:4px;border-top:1px solid var(--line);padding-top:12px}
.sx-prompt-pre{margin:0;white-space:pre-wrap;font:inherit;font-size:12px;line-height:18px;color:var(--mute);padding:10px 12px;border-radius:10px;background:#0B0C0E;border:1px solid var(--line)}
.sx-go{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
/* recent */
.sx-recent{display:grid;gap:12px}
.sx-recent-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sx-empty{padding:48px 16px;text-align:center;border:1px dashed var(--line-2);border-radius:var(--r);display:grid;gap:4px;justify-items:center}
.sx-empty-title{font-size:15px;font-weight:650}
.sx-masonry{columns:4;column-gap:12px}
.sx-card{position:relative;display:block;width:100%;margin:0 0 12px;padding:0;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:var(--card);cursor:pointer;color:var(--ink);break-inside:avoid;text-align:left;font:inherit;transition:transform .35s cubic-bezier(.2,.7,.2,1),border-color .2s}
.sx-card:hover{transform:translateY(-2px);border-color:var(--line-2)}
.sx-card img,.sx-card video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.sx-card-blank{position:absolute;inset:0;display:grid;place-items:center;color:var(--mute);font-size:12px;background:radial-gradient(120% 80% at 80% 0%,#2A2D36 0%,#17181C 60%)}
.sx-card-top{position:absolute;top:8px;left:8px;right:8px;display:flex;justify-content:space-between;align-items:center;gap:6px}
.sx-count{font-size:11px;font-weight:700;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);color:#fff;padding:2px 8px;border-radius:999px}
.sx-card-bottom{position:absolute;left:0;right:0;bottom:0;padding:22px 12px 10px;display:grid;gap:2px;font-size:12px;background:linear-gradient(180deg,rgba(15,16,18,0),rgba(15,16,18,.9));opacity:0;transition:opacity .2s}
.sx-card:hover .sx-card-bottom{opacity:1}
.sx-card-meta{font-size:11px;color:var(--mute)}
.sx-pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;backdrop-filter:blur(6px)}
.sx-pill-wait{background:rgba(0,0,0,.55);color:#fff}.sx-pill-run{background:rgba(198,241,53,.9);color:var(--lime-ink)}
.sx-pill-ok{background:rgba(0,0,0,.55);color:#fff}.sx-pill-bad{background:rgba(255,90,90,.9);color:#fff}
.sx-pill-warn{background:rgba(240,180,41,.9);color:#1A1A1A}
.sx-spin{width:10px;height:10px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:sxSpin .8s linear infinite;flex:none}
.sx-spin-lg{width:24px;height:24px;border-width:3px}
@keyframes sxSpin{to{transform:rotate(360deg)}}
/* viewer */
.sx-viewer{position:fixed;inset:0;z-index:70;background:rgba(8,9,10,.94);backdrop-filter:blur(10px);display:grid;grid-template-rows:auto 1fr auto;color:var(--ink);font-family:Inter,system-ui,sans-serif;animation:kFade .15s ease}
.sx-viewer-top{display:flex;align-items:center;gap:12px;padding:12px 16px}
.sx-icon-btn{width:34px;height:34px;border-radius:10px;border:1px solid var(--line-2);background:var(--card-2);color:var(--ink);font-size:20px;line-height:1;cursor:pointer;flex:none}
.sx-icon-btn:hover{background:#26282E}
.sx-viewer-stage{position:relative;min-height:0;display:grid;place-items:center;padding:0 16px}
.sx-viewer-stage>img,.sx-viewer-stage>video{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.sx-viewer-working{position:relative;width:min(90vw,520px);aspect-ratio:1;display:grid;place-items:center;border-radius:12px;overflow:hidden;background:var(--card)}
.sx-ghost{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35;filter:blur(3px)}
.sx-viewer-msg{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:13px;color:var(--ink)}
.sx-viewer-failed{max-width:520px;padding:24px;text-align:center;font-size:13px;background:var(--card);border-radius:12px;border:1px solid var(--line)}
.sx-error{color:#FF8A8A;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:17px}
.sx-viewer-bottom{display:grid;gap:10px;padding:12px 16px 16px}
.sx-viewer-prompt{font-size:13px;line-height:19px;color:var(--mute);max-height:38px;overflow:hidden;text-align:center}
.sx-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.sx-strip{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.sx-strip-item{width:52px;height:52px;padding:0;border-radius:8px;overflow:hidden;border:1px solid var(--line-2);background:var(--card);cursor:pointer}
.sx-strip-item[aria-pressed="true"]{border-color:var(--lime);box-shadow:inset 0 0 0 1px var(--lime)}
.sx-strip-item img{width:100%;height:100%;object-fit:cover;display:block}
/* picker modal */
.sx-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);z-index:80;display:grid;place-items:center;padding:16px;animation:kFade .15s ease;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.sx-modal{width:min(920px,100%);max-height:min(82vh,760px);background:var(--card);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 30px 80px rgba(0,0,0,.6);display:grid;grid-template-rows:auto 1fr;overflow:hidden;animation:kModal .18s ease}
.sx-modal-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.sx-pickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;padding:12px;overflow:auto}
.sx-pick{padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card-2);cursor:pointer;display:grid;color:var(--ink);font:inherit}
.sx-pick:hover{border-color:var(--line-2)}
.sx-pick[aria-pressed="true"]{border-color:var(--lime);box-shadow:inset 0 0 0 1px var(--lime)}
.sx-pick img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.sx-pick-name{font-size:11px;padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mute)}
@media (max-width:1100px){.sx-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.sx-masonry{columns:3}}
@media (max-width:900px){.sx-composer-body{grid-template-columns:1fr}}
@media (max-width:700px){
  .sx{padding:14px;gap:18px}
  .sx-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .sx-tile{aspect-ratio:1}
  .sx-tile-title{font-size:13px;line-height:17px}.sx-tile-sub{display:none}
  .sx-masonry{columns:2;column-gap:8px}.sx-card{margin-bottom:8px}
  .sx-quick{grid-template-columns:repeat(4,1fr)}
  .sx-viewer-stage{padding:0 8px}
  .sx-viewer-bottom .sx-actions{justify-content:center}
}
@media (prefers-reduced-motion:reduce){.sx-spin{animation:none}.sx-tile,.sx-card,.sx-tile img{transition:none}}
`;
