/**
 * Studio — our own image, video and UGC ad generator.
 *
 * Three zones: the Create rail on the left (kind, model, prompt, reference,
 * shape, count), the Canvas in the middle (the generation you are looking
 * at, its status, what to do with it) and History underneath (everything
 * this store has made). The models are the makers' own — Seedance, Kling,
 * Veo, GPT Image — reached through fal's queue with one pay-per-use key.
 * UGC ad is a two-step chain: GPT Image puts a real-looking creator with
 * the product from your product picture, then a video model makes her say
 * the script with sound. Everything that finishes is copied into this
 * store's media so the editor can use it.
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
    .slice(0, 120)
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

/* ------------------------------------------------------------------ view */

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "image", label: "Image", hint: "Stills, product shots, creatives" },
  { key: "video", label: "Video", hint: "Animate a picture, with sound" },
  { key: "ugc", label: "UGC ad", hint: "A creator shows and talks about your product" },
];

/** Every shape the rail offers; a chip is disabled when the chosen model does not take it. */
const ASPECTS = ["1:1", "4:5", "3:4", "9:16", "16:9", "21:9"];
const PRICE_HINT = "priced by fal per run";

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

  /* --- rail state */
  const [kind, setKind] = React.useState<Kind>(initialTab);
  const videoModels = models.filter((m) => m.kind === "video");
  const imageModels = models.filter((m) => m.kind === "image");
  const [modelId, setModelId] = React.useState<string>(imageModels[0]?.id ?? "");
  const [videoModelId, setVideoModelId] = React.useState<string>(videoModels[0]?.id ?? "");
  const [prompt, setPrompt] = React.useState("");
  const [aspect, setAspect] = React.useState("1:1");
  const [count, setCount] = React.useState(1);
  const [duration, setDuration] = React.useState("6");
  const [audio, setAudio] = React.useState(true);
  const [inputKey, setInputKey] = React.useState("");
  const [upload, setUpload] = React.useState<{ name: string; url: string } | null>(null);
  const [ugc, setUgc] = React.useState({ product: "", creator: "", setting: "", script: "" });
  const [brief, setBrief] = React.useState({ product: "", scene: "", mood: "" });
  const [briefOpen, setBriefOpen] = React.useState(false);
  const [picker, setPicker] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const promptRef = React.useRef<HTMLTextAreaElement>(null);

  const railModels: PublicModel[] = kind === "image" ? imageModels : videoModels;
  const activeModelId = kind === "image" ? modelId : videoModelId;
  const activeModel = railModels.find((m) => m.id === activeModelId) ?? railModels[0];
  const setActiveModel = (id: string) => (kind === "image" ? setModelId(id) : setVideoModelId(id));
  const needsImage = kind === "ugc" || Boolean(activeModel?.needsImage);
  const hasImage = Boolean(upload || inputKey);

  // Keep the shape and length legal for the chosen model.
  React.useEffect(() => {
    if (!activeModel) return;
    if (!activeModel.aspects.includes(aspect)) setAspect(kind === "image" ? (activeModel.aspects.includes("1:1") ? "1:1" : activeModel.aspects[0]) : "9:16");
    if (activeModel.durations && !activeModel.durations.includes(duration)) setDuration(activeModel.durations.includes("6") ? "6" : activeModel.durations[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModel?.id, kind]);

  /* --- canvas selection */
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
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

  // After a successful submit, refresh so the new row appears and lands on the canvas.
  const lastGen = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (gen.state === "idle" && gen.data && gen.data !== lastGen.current) {
      lastGen.current = gen.data;
      if (gen.data.ok) {
        setSelectedId(null);
        revalidator.revalidate();
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
      setSelectedId(null);
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remove.state, remove.data]);

  // ⌘/Ctrl+Enter generates from anywhere in the rail.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
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

  const composeBrief = () => {
    const parts: string[] = [];
    if (brief.product) parts.push(brief.product.trim());
    if (brief.scene) parts.push(`in ${brief.scene.trim()}`);
    if (brief.mood) parts.push(brief.mood.trim());
    if (!parts.length) return;
    const lead = kind === "image" ? "Candid iPhone photo of " : "Slow, natural handheld shot of ";
    setPrompt(`${lead}${parts.join(", ")}.`);
    setBriefOpen(false);
    promptRef.current?.focus();
  };

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
    if (kind === "image") setModelId("gpt-image-2-edit");
  };

  const makeVideoFrom = (key: string) => {
    useAsReference(key);
    setKind("video");
    setPrompt("");
    promptRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const regenerate = (row: GenerationRow) => {
    const p = row.params;
    if (row.inputKey) useAsReference(row.inputKey);
    else clearReference();
    if (row.kind === "ugc") {
      const back = ugcFromRow(row);
      setKind("ugc");
      setUgc((u) => ({ ...u, product: back.product, script: back.script }));
      setVideoModelId(String(p.videoModel ?? "seedance-2"));
      setDuration(String(p.duration ?? "8"));
      return;
    }
    setKind(row.kind as Kind);
    if (row.kind === "image") setModelId(row.model);
    else setVideoModelId(row.model);
    setPrompt(row.prompt);
    if (typeof p.aspect === "string") setAspect(p.aspect);
    if (typeof p.duration === "string") setDuration(p.duration);
    if (typeof p.audio === "boolean") setAudio(p.audio);
    if (typeof p.count === "number") setCount(p.count);
    // Submit on the next frame so the controlled inputs carry the new values.
    requestAnimationFrame(() => formRef.current?.requestSubmit());
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
  const history = rows.filter((r) => filter === "all" || r.kind === filter);
  const modelLabel = (id: string) => models.find((m) => m.id === id)?.label ?? id;

  return (
    <div className="st" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <style>{STYLE}</style>

      <div className="st-head">
        <div>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Studio</h1>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Images, videos and UGC ads with the makers' own models, paid per run through your fal key.</div>
        </div>
        {config ? (
          <keyForm.Form method="post" className="st-keyrow" onSubmit={(e) => (window.confirm("Remove the fal key?") ? undefined : e.preventDefault())}>
            <input type="hidden" name="intent" value="disconnect" />
            <span className="st-dot" />
            <span>{config.keyId}</span>
            <button type="submit" className="st-link" disabled={keyForm.state !== "idle"}>Disconnect</button>
          </keyForm.Form>
        ) : null}
      </div>

      <div className="st-layout">
        {/* ------------------------------------------------------------ rail */}
        <aside className="st-rail">
          {!config ? (
            <div className="st-keycard">
              <div style={{ fontWeight: 600 }}>Add your fal.ai key</div>
              <div className="st-muted">Get it at fal.ai → Dashboard → Keys. One key runs every model here; it is encrypted before it is stored.</div>
              {!encryption ? <div className="st-notice st-notice-critical">The Worker has no ENCRYPTION_KEY, so the key cannot be stored yet.</div> : null}
              {keyForm.data?.error ? <div className="st-notice st-notice-critical">{keyForm.data.error}</div> : null}
              <keyForm.Form method="post" className="st-keyform">
                <input type="hidden" name="intent" value="connect" />
                <input name="secret" type="password" className="st-input" placeholder="key_…" autoComplete="off" required aria-label="fal key" />
                <button type="submit" className="st-btn st-btn-dark" disabled={keyForm.state !== "idle" || !encryption}>
                  {keyForm.state !== "idle" ? "Checking…" : "Save"}
                </button>
              </keyForm.Form>
            </div>
          ) : null}

          <div className="st-tabs" role="tablist">
            {KINDS.map((k) => (
              <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className="st-tab" onClick={() => setKind(k.key)} title={k.hint}>
                {k.label}
              </button>
            ))}
          </div>

          <gen.Form ref={formRef} method="post" encType="multipart/form-data" className="st-form">
            <input type="hidden" name="intent" value="generate" />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="inputKey" value={inputKey} />
            <input ref={fileRef} type="file" name="file" accept="image/*" hidden onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />

            {/* model */}
            <div className="st-section">
              <div className="st-label">{kind === "ugc" ? "Video model" : "Model"}</div>
              <div className="st-models">
                {railModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="st-model"
                    aria-pressed={activeModel?.id === m.id}
                    onClick={() => setActiveModel(m.id)}
                  >
                    <span className="st-model-top">
                      <span className="st-model-name">{m.label}</span>
                      <span className="st-model-maker">{m.maker}</span>
                    </span>
                    <span className="st-model-note">{m.note}</span>
                    <span className="st-model-price">{PRICE_HINT}</span>
                  </button>
                ))}
              </div>
              {kind === "ugc" ? (
                <div className="st-help">The still is made with GPT Image 2 from your product picture, then this model turns it into the talking video.</div>
              ) : null}
              <input type="hidden" name={kind === "ugc" ? "videoModel" : "model"} value={activeModel?.id ?? ""} />
            </div>

            {/* prompt or UGC brief */}
            {kind === "ugc" ? (
              <div className="st-section">
                <label className="st-label" htmlFor="st-product">Product</label>
                <input id="st-product" name="product" className="st-input" value={ugc.product} onChange={(e) => setUgc({ ...ugc, product: e.target.value })} placeholder="the bodies board in Lilac Heat" required />
                <div className="st-help">Name it the way she would say it.</div>
                <label className="st-label" htmlFor="st-script" style={{ marginTop: 10 }}>What she says</label>
                <textarea id="st-script" name="script" className="st-textarea" value={ugc.script} onChange={(e) => setUgc({ ...ugc, script: e.target.value })} placeholder="okay this folds under my bed and I did 20 minutes before work, I'm never going back to the studio" required />
                <div className="st-help">8 seconds is about 20 words.</div>
                <div className="st-two" style={{ marginTop: 10 }}>
                  <div>
                    <label className="st-label" htmlFor="st-creator">Creator</label>
                    <input id="st-creator" name="creator" className="st-input" value={ugc.creator} onChange={(e) => setUgc({ ...ugc, creator: e.target.value })} placeholder="Latina, mid twenties, claw clip" />
                  </div>
                  <div>
                    <label className="st-label" htmlFor="st-setting">Where</label>
                    <input id="st-setting" name="setting" className="st-input" value={ugc.setting} onChange={(e) => setUgc({ ...ugc, setting: e.target.value })} placeholder="small living room, morning light" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="st-section">
                <div className="st-labelrow">
                  <label className="st-label" htmlFor="st-prompt">Prompt</label>
                  <button type="button" className="st-link" onClick={() => setBriefOpen((o) => !o)} aria-expanded={briefOpen}>
                    {briefOpen ? "Hide brief" : "Write from a brief"}
                  </button>
                </div>
                {briefOpen ? (
                  <div className="st-brief">
                    <input className="st-input" placeholder="Product — the bodies board in Matcha" value={brief.product} onChange={(e) => setBrief({ ...brief, product: e.target.value })} aria-label="Product" />
                    <input className="st-input" placeholder="Scene — a sunlit bedroom floor, plants" value={brief.scene} onChange={(e) => setBrief({ ...brief, scene: e.target.value })} aria-label="Scene" />
                    <input className="st-input" placeholder="Mood — soft morning, unhurried, real" value={brief.mood} onChange={(e) => setBrief({ ...brief, mood: e.target.value })} aria-label="Mood" />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button type="button" className="st-btn" onClick={composeBrief}>Compose prompt</button>
                      <span className="st-help" style={{ marginTop: 0 }}>Optional. Fills the prompt, you can still edit it.</span>
                    </div>
                  </div>
                ) : null}
                <textarea
                  id="st-prompt"
                  ref={promptRef}
                  name="prompt"
                  className="st-textarea st-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={kind === "image" ? "Candid iPhone photo of the board on a bedroom floor, morning light through linen curtains…" : "Slow push in, she looks up from the board and smiles, soft room sound…"}
                  required
                />
              </div>
            )}

            {/* reference */}
            <div className="st-section">
              <div className="st-labelrow">
                <span className="st-label">{kind === "ugc" ? "Product picture" : needsImage ? "Start picture" : "Reference picture"}</span>
                <span className="st-help" style={{ marginTop: 0 }}>{needsImage ? "required" : "optional"}</span>
              </div>
              {referencePreview ? (
                <div className="st-ref">
                  <img src={referencePreview} alt="" />
                  <div className="st-ref-meta">
                    <span className="st-ellipsis" title={referenceLabel}>{referenceLabel}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="st-link" onClick={() => setPicker(true)}>Change</button>
                      <button type="button" className="st-link" onClick={clearReference}>Remove</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="st-refpick">
                  <button type="button" className="st-btn" onClick={() => setPicker(true)}>Pick from media</button>
                  <button type="button" className="st-btn" onClick={() => fileRef.current?.click()}>Upload</button>
                </div>
              )}
              {kind === "image" && activeModel?.id === "gpt-image-2" && hasImage ? (
                <div className="st-help">GPT Image 2 ignores pictures. Switch to “GPT Image 2 with reference” to keep your product.</div>
              ) : null}
            </div>

            {/* shape, count, length */}
            {kind !== "ugc" ? (
              <div className="st-section">
                <div className="st-label">Shape</div>
                <div className="st-chips">
                  {ASPECTS.map((a) => {
                    const ok = activeModel?.aspects.includes(a) ?? false;
                    return (
                      <button key={a} type="button" className="st-chip" aria-pressed={aspect === a} disabled={!ok} onClick={() => setAspect(a)} title={ok ? a : `${activeModel?.label ?? "This model"} does not offer ${a}`}>
                        <span className={`st-shape st-shape-${a.replace(":", "x")}`} />
                        {a}
                      </button>
                    );
                  })}
                </div>
                <input type="hidden" name="aspect" value={aspect} />
              </div>
            ) : null}

            {kind === "image" ? (
              <div className="st-section">
                <div className="st-label">How many</div>
                <div className="st-chips">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" className="st-chip st-chip-n" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>
                  ))}
                </div>
                <input type="hidden" name="count" value={count} />
              </div>
            ) : (
              <div className="st-section">
                <div className="st-two">
                  <div>
                    <div className="st-label">Length</div>
                    <div className="st-chips">
                      {(activeModel?.durations ?? ["4", "5", "6", "8", "10", "12", "15"]).map((d) => (
                        <button key={d} type="button" className="st-chip st-chip-n" aria-pressed={duration === d} onClick={() => setDuration(d)}>{d}s</button>
                      ))}
                    </div>
                    <input type="hidden" name="duration" value={duration} />
                  </div>
                </div>
                {kind === "video" ? (
                  <label className="st-check">
                    <input type="checkbox" name="audio" checked={audio} onChange={(e) => setAudio(e.target.checked)} /> Generate sound
                  </label>
                ) : null}
              </div>
            )}

            {gen.data?.error && gen.state === "idle" ? <div className="st-notice st-notice-critical">{gen.data.error}</div> : null}

            <div className="st-go">
              <button type="submit" className="st-btn st-btn-lime" disabled={busy || !config || (needsImage && !hasImage)}>
                {busy ? "Sending…" : kind === "ugc" ? "Make the ad" : kind === "video" ? "Generate video" : count > 1 ? `Generate ${count}` : "Generate"}
              </button>
              <span className="st-kbd">⌘↵</span>
              {!config ? <span className="st-help" style={{ marginTop: 0 }}>Add the fal key first.</span> : needsImage && !hasImage ? <span className="st-help" style={{ marginTop: 0 }}>Needs a picture to start from.</span> : null}
            </div>
          </gen.Form>
        </aside>

        {/* ---------------------------------------------------------- canvas */}
        <section className="st-canvas">
          {selected ? (
            <Canvas
              row={selected}
              now={now}
              modelLabel={modelLabel(selected.model)}
              storeSuffix={suffix}
              busy={remove.state !== "idle"}
              onUse={useAsReference}
              onVideo={makeVideoFrom}
              onRegenerate={regenerate}
              onDelete={(id) => {
                if (!window.confirm("Delete this generation? The files stay in Media.")) return;
                remove.submit({ intent: "delete", id }, { method: "post" });
              }}
            />
          ) : (
            <div className="st-canvas-empty">
              <Empty
                title={config ? "Nothing on the canvas yet" : "Add your fal key to start"}
                help={config ? "Write a prompt on the left and press Generate, or ⌘↵. What you make shows up here and in Media." : "The rail on the left takes the key. After that every model here is one prompt away."}
              />
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------ history */}
      <section className="st-history">
        <div className="st-history-head">
          <div style={{ fontWeight: 650 }}>History</div>
          <div className="st-chips">
            {(["all", "image", "video", "ugc"] as const).map((f) => (
              <button key={f} type="button" className="st-chip st-chip-n" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? `All ${rows.length}` : f === "ugc" ? "UGC ad" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {history.length === 0 ? (
          <div style={{ ...card }}>
            <Empty
              title={rows.length ? "Nothing of this kind yet" : "No generations yet"}
              help={rows.length ? "Switch the filter, or make one from the rail." : "Everything you generate is kept here with its prompt, model and time, and copied into Media."}
            />
          </div>
        ) : (
          <div className="st-grid">
            {history.map((row) => {
              const thumb = row.status === "completed" ? row.outputKeys[0] : row.stillKey ?? row.inputKey;
              return (
                <button key={row.id} type="button" className="st-tile" aria-current={selected?.id === row.id} onClick={() => { setSelectedId(row.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <span className="st-tile-media">
                    {thumb ? (
                      isVideoKey(thumb) ? <video src={`/media/${thumb}`} muted playsInline preload="metadata" /> : <img src={`/media/${thumb}`} alt="" loading="lazy" />
                    ) : (
                      <span className="st-tile-blank">{row.status === "failed" ? "Failed" : "…"}</span>
                    )}
                    <span className="st-tile-status"><StatusPill row={row} now={now} compact /></span>
                    {row.outputKeys.length > 1 ? <span className="st-tile-count">{row.outputKeys.length}</span> : null}
                  </span>
                  <span className="st-tile-text">
                    <span className="st-tile-prompt">{row.prompt}</span>
                    <span className="st-tile-meta">{modelLabel(row.model)} · {row.kind === "ugc" ? "UGC ad" : row.kind} · {timeAgo(row.createdAt, now)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

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

function StatusPill({ row, now, compact }: { row: GenerationRow; now: number; compact?: boolean }) {
  const started = toDate(row.stage === 2 ? row.updatedAt : row.createdAt).getTime();
  const elapsed = Math.max(0, Math.floor((now - started) / 1000));
  const map: Record<string, { cls: string; text: string }> = {
    queued: { cls: "neutral", text: compact ? "Queued" : `Queued · ${elapsed}s` },
    in_progress: { cls: "info", text: compact ? "Running" : `${row.kind === "ugc" && row.stage === 2 ? "Making the video" : "Running"} · ${elapsed}s` },
    completed: { cls: "success", text: "Done" },
    failed: { cls: "critical", text: "Failed" },
    nsfw: { cls: "warning", text: "Blocked" },
    canceled: { cls: "neutral", text: "Canceled" },
  };
  const s = map[row.status] ?? map.queued;
  return (
    <span className={`st-pill st-pill-${s.cls}`}>
      {isPending(row) ? <span className="st-spin" /> : null}
      {s.text}
    </span>
  );
}

function Canvas({
  row,
  now,
  modelLabel,
  storeSuffix,
  busy,
  onUse,
  onVideo,
  onRegenerate,
  onDelete,
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
}) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [row.id]);
  const done = row.status === "completed";
  const files = done ? row.outputKeys : [];
  const current = files[Math.min(index, Math.max(0, files.length - 1))];
  const working = isPending(row);
  const ghost = working ? row.stillKey ?? row.inputKey : null;
  const aspect = String(row.params.aspect ?? (row.kind === "image" ? "1:1" : "9:16")).replace(":", " / ");

  return (
    <div className="st-stage">
      <div className="st-stage-head">
        <StatusPill row={row} now={now} />
        <span className="st-stage-meta">
          {modelLabel} · {row.kind === "ugc" ? "UGC ad" : row.kind}
          {typeof row.params.aspect === "string" ? ` · ${row.params.aspect}` : ""}
          {row.kind !== "image" && row.params.duration ? ` · ${String(row.params.duration)}s` : ""}
          {" · "}
          {timeAgo(row.createdAt, now)}
        </span>
      </div>

      <div className="st-view" style={{ aspectRatio: aspect }}>
        {current ? (
          isVideoKey(current) ? (
            <video key={current} src={`/media/${current}`} controls playsInline autoPlay loop />
          ) : (
            <img key={current} src={`/media/${current}`} alt={row.prompt} />
          )
        ) : working ? (
          <div className="st-view-working">
            {ghost ? <img src={`/media/${ghost}`} alt="" className="st-ghost" /> : null}
            <div className="st-view-msg">
              <span className="st-spin st-spin-lg" />
              <span>{row.kind === "ugc" ? (row.stage === 2 ? "Still done, now the video…" : "Making the still first…") : row.status === "queued" ? "Waiting in fal's queue…" : "The model is working…"}</span>
            </div>
          </div>
        ) : (
          <div className="st-view-failed">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.status === "nsfw" ? "The model blocked this one" : "Did not finish"}</div>
            <div className="st-error">{row.error ?? "The model returned nothing."}</div>
          </div>
        )}
      </div>

      {files.length > 1 ? (
        <div className="st-strip">
          {files.map((k, i) => (
            <button key={k} type="button" className="st-strip-item" aria-pressed={i === index} onClick={() => setIndex(i)}>
              <img src={`/media/${k}`} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="st-prompt-out" title={row.prompt}>{row.prompt}</div>

      <div className="st-actions">
        {current && !isVideoKey(current) ? (
          <>
            <button type="button" className="st-btn" onClick={() => onUse(current)}>Use as reference</button>
            <button type="button" className="st-btn" onClick={() => onVideo(current)}>Make a video from this</button>
          </>
        ) : null}
        {current ? (
          <>
            <Link to={`/admin/media${storeSuffix}`} className="st-btn st-btn-link">In media library ✓</Link>
            <a href={`/media/${current}`} download className="st-btn st-btn-link">Download</a>
          </>
        ) : null}
        {!working ? <button type="button" className="st-btn" onClick={() => onRegenerate(row)}>{row.kind === "ugc" ? "Edit and run again" : "Regenerate"}</button> : null}
        <span style={{ flex: 1 }} />
        <button type="button" className="st-btn st-btn-danger" disabled={busy} onClick={() => onDelete(row.id)}>Delete</button>
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
  pictures: { key: string; filename: string; studio: boolean }[];
  current: string;
  storeSuffix: string;
  onPick: (key: string) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const list = pictures.filter((p) => !q || p.filename.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="st-modal-back" onClick={onClose} role="presentation">
      <div className="st-modal" role="dialog" aria-modal="true" aria-label="Pick a picture" onClick={(e) => e.stopPropagation()}>
        <div className="st-modal-head">
          <span style={{ fontWeight: 650 }}>Pick a picture</span>
          <input className="st-input" style={{ maxWidth: 220 }} placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
          <button type="button" className="st-btn" onClick={onUpload}>Upload new</button>
          <button type="button" className="st-link" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {pictures.length === 0 ? (
          <Empty
            title="No pictures in Media yet"
            help="Upload one here, or add pictures in Media. Anything the Studio makes lands there as well."
            action={<Link to={`/admin/media${storeSuffix}`} className="st-btn st-btn-link">Open Media</Link>}
          />
        ) : list.length === 0 ? (
          <Empty title="No match" help="Nothing in Media has that in its name." />
        ) : (
          <div className="st-pickgrid">
            {list.map((p) => (
              <button key={p.key} type="button" className="st-pick" aria-pressed={current === p.key} onClick={() => onPick(p.key)} title={p.filename}>
                <img src={`/media/${p.key}`} alt="" loading="lazy" />
                <span className="st-pick-name">{p.filename}</span>
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
.st{--st-lime:#C6F135;--st-lime-ink:#1A1A1A;--st-lime-hover:#B8E51F;display:grid;gap:16px}
.st-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.st-keyrow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-2);margin:0}
.st-dot{width:7px;height:7px;border-radius:50%;background:var(--success)}
.st-layout{display:grid;grid-template-columns:380px minmax(0,1fr);gap:16px;align-items:start}
.st-rail{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:14px;display:grid;gap:14px;position:sticky;top:12px}
.st-canvas{min-width:0}
.st-muted{font-size:12px;color:var(--ink-2);line-height:17px}
.st-help{font-size:12px;color:var(--ink-2);margin-top:5px;line-height:16px}
.st-label{display:block;font-size:12px;font-weight:550;color:var(--ink-2);margin-bottom:6px}
.st-labelrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.st-labelrow .st-label{margin-bottom:6px}
.st-section{display:block}
.st-form{display:grid;gap:14px}
.st-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.st-input{height:32px;width:100%;padding:0 10px;border-radius:8px;border:1px solid var(--input-border);background:var(--input);color:var(--ink);font-size:13px}
.st-textarea{width:100%;min-height:72px;padding:8px 10px;border-radius:8px;border:1px solid var(--input-border);background:var(--input);color:var(--ink);font-size:13px;line-height:20px;resize:vertical}
.st-prompt{min-height:128px;font-size:14px;line-height:21px}
.st-brief{display:grid;gap:8px;padding:10px;border:1px dashed var(--border-strong);border-radius:10px;background:var(--bg);margin-bottom:8px}
.st-keycard{display:grid;gap:8px;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--bg)}
.st-keyform{display:flex;gap:8px;margin:0}
.st-keyform .st-input{flex:1}
.st-tabs{display:flex;gap:2px;background:var(--bg);border-radius:9px;padding:3px}
.st-tab{flex:1;height:28px;border:0;border-radius:6px;font-size:12px;font-weight:600;background:transparent;color:var(--ink-2);cursor:pointer}
.st-tab[aria-selected="true"]{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.st-models{display:grid;gap:6px}
.st-model{display:grid;gap:2px;text-align:left;padding:9px 11px;border-radius:10px;border:1px solid var(--border);background:var(--surface);cursor:pointer;color:var(--ink)}
.st-model:hover{background:var(--hover)}
.st-model[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.st-model-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.st-model-name{font-size:13px;font-weight:600}
.st-model-maker{font-size:11px;color:var(--ink-3)}
.st-model-note{font-size:12px;color:var(--ink-2);line-height:16px}
.st-model-price{font-size:11px;color:var(--ink-3)}
.st-chips{display:flex;gap:6px;flex-wrap:wrap}
.st-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:12px;font-weight:550;cursor:pointer}
.st-chip:hover:not(:disabled){background:var(--hover)}
.st-chip[aria-pressed="true"]{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.st-chip:disabled{opacity:.4;cursor:not-allowed}
.st-chip-n{min-width:36px;justify-content:center}
.st-shape{display:inline-block;border:1.5px solid currentColor;border-radius:2px;opacity:.8}
.st-shape-1x1{width:12px;height:12px}.st-shape-4x5{width:11px;height:14px}.st-shape-3x4{width:10px;height:13px}
.st-shape-9x16{width:8px;height:14px}.st-shape-16x9{width:16px;height:9px}.st-shape-21x9{width:19px;height:8px}
.st-check{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px}
.st-ref{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}
.st-ref img{width:56px;height:56px;border-radius:8px;object-fit:cover;background:var(--surface);flex:none}
.st-ref-meta{display:grid;gap:4px;min-width:0;font-size:12px;color:var(--ink-2)}
.st-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-refpick{display:flex;gap:6px}
.st-btn{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:12px;font-weight:550;cursor:pointer;box-shadow:var(--shadow);display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.st-btn:hover:not(:disabled){background:var(--hover);text-decoration:none}
.st-btn:disabled{opacity:.5;cursor:not-allowed}
.st-btn-link{text-decoration:none}
.st-btn-dark{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
.st-btn-dark:hover:not(:disabled){background:var(--accent-hover)}
.st-btn-danger{color:var(--critical);border-color:var(--critical-bg)}
.st-btn-lime{height:38px;padding:0 20px;font-size:13px;font-weight:700;background:var(--st-lime);color:var(--st-lime-ink);border-color:var(--st-lime);border-radius:10px;box-shadow:0 1px 0 rgba(0,0,0,.08)}
.st-btn-lime:hover:not(:disabled){background:var(--st-lime-hover)}
.st-link{border:0;background:transparent;padding:0;font-size:12px;font-weight:500;color:var(--link);cursor:pointer}
.st-link:hover{text-decoration:underline}
.st-go{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:14px}
.st-kbd{font-size:11px;color:var(--ink-3);border:1px solid var(--border);border-radius:5px;padding:1px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.st-notice{padding:9px 11px;border-radius:9px;font-size:12px;line-height:16px}
.st-notice-critical{background:var(--b-critical-bg);color:var(--b-critical-fg)}
.st-stage{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:14px;display:grid;gap:12px}
.st-stage-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.st-stage-meta{font-size:12px;color:var(--ink-2)}
.st-view{position:relative;width:100%;max-height:min(72vh,820px);margin:0 auto;border-radius:10px;overflow:hidden;background:var(--bg);display:grid;place-items:center}
.st-view>img,.st-view>video{width:100%;height:100%;object-fit:contain;display:block;background:#111}
.st-view-working{position:absolute;inset:0;display:grid;place-items:center}
.st-ghost{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35;filter:blur(2px)}
.st-view-msg{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;font-size:13px;color:var(--ink-2);padding:12px 16px;background:rgba(255,255,255,.85);border-radius:10px}
.st-view-failed{padding:24px;text-align:center;max-width:520px;font-size:13px}
.st-error{color:var(--critical);white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:17px}
.st-strip{display:flex;gap:6px;flex-wrap:wrap}
.st-strip-item{width:56px;height:56px;padding:0;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:var(--bg);cursor:pointer}
.st-strip-item[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.st-strip-item img{width:100%;height:100%;object-fit:cover;display:block}
.st-prompt-out{font-size:13px;line-height:19px;color:var(--ink);max-height:57px;overflow:hidden}
.st-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.st-canvas-empty{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);min-height:420px;display:grid;place-items:center}
.st-pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:8px;font-size:12px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.st-pill-neutral{background:var(--b-neutral-bg);color:var(--b-neutral-fg)}.st-pill-info{background:var(--b-info-bg);color:var(--b-info-fg)}
.st-pill-success{background:var(--b-success-bg);color:var(--b-success-fg)}.st-pill-critical{background:var(--b-critical-bg);color:var(--b-critical-fg)}
.st-pill-warning{background:var(--b-warning-bg);color:var(--b-warning-fg)}
.st-spin{width:10px;height:10px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:st-spin .8s linear infinite;flex:none}
.st-spin-lg{width:22px;height:22px;border-width:3px}
@keyframes st-spin{to{transform:rotate(360deg)}}
.st-history{display:grid;gap:10px}
.st-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.st-tile{padding:0;text-align:left;border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden;cursor:pointer;color:var(--ink);display:grid}
.st-tile:hover{background:var(--hover)}
.st-tile[aria-current="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.st-tile-media{position:relative;display:block;aspect-ratio:4/5;background:var(--bg)}
.st-tile-media img,.st-tile-media video{width:100%;height:100%;object-fit:cover;display:block}
.st-tile-blank{display:grid;place-items:center;height:100%;color:var(--ink-3);font-size:12px}
.st-tile-status{position:absolute;top:6px;left:6px}
.st-tile-count{position:absolute;top:6px;right:6px;font-size:11px;font-weight:600;background:rgba(0,0,0,.6);color:#fff;padding:2px 7px;border-radius:8px}
.st-tile-text{display:grid;gap:3px;padding:8px 10px}
.st-tile-prompt{font-size:12px;line-height:16px;max-height:32px;overflow:hidden}
.st-tile-meta{font-size:11px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:grid;place-items:center;padding:16px;animation:kFade .15s ease}
.st-modal{width:min(880px,100%);max-height:min(80vh,720px);background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);display:grid;grid-template-rows:auto 1fr;overflow:hidden;animation:kModal .18s ease}
.st-modal-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}
.st-modal-head>span{flex:1}
.st-pickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;padding:12px;overflow:auto}
.st-pick{padding:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg);cursor:pointer;display:grid;color:var(--ink)}
.st-pick:hover{border-color:var(--border-strong)}
.st-pick[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.st-pick img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.st-pick-name{font-size:11px;padding:5px 7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--surface)}
@media (max-width:960px){
  .st-layout{grid-template-columns:1fr}
  .st-rail{position:static}
  .st-view{max-height:70vh}
}
@media (max-width:520px){
  .st-two{grid-template-columns:1fr}
  .st-grid{grid-template-columns:repeat(2,1fr)}
  .st-modal-head{flex-wrap:wrap}
}
@media (prefers-reduced-motion:reduce){.st-spin{animation:none}}
`;
