/**
 * Studio — image, video and UGC ads, generated through Higgsfield's API.
 *
 * Three tabs, one gallery. Image and Video map one to one onto the models in
 * their developer API. UGC ad is this app's own two-step chain (a Soul still
 * of a creator with the product, then Veo talks over it), because Marketing
 * Studio itself is not in their API. Everything that finishes is copied into
 * this store's media so the editor can use it.
 */
import * as React from "react";
import { Form, useFetcher, useNavigation, useRevalidator } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.studio";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listMedia, addMedia } from "~/lib/admin.server";
import { studioConfig } from "~/db/schema";
import { encryptSecret, encryptionReady } from "~/lib/crypto.server";
import { MODELS, modelById, testKey, StudioNotConfigured } from "~/lib/higgsfield.server";
import { listGenerations, startGeneration, deleteGeneration } from "~/lib/studio.server";
import type { GenerationRow } from "~/lib/studio.server";
import { card, Empty, primaryButton, secondaryButton, criticalButton, input, textarea, fieldLabel } from "~/admin/ui";

export function meta() {
  return [{ title: "Studio — Shop Admin" }];
}

const PUBLIC_MODELS = MODELS.map(({ body: _body, ...rest }) => rest);

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, config: null, rows: [], pictures: [], models: PUBLIC_MODELS, encryption: false, tab: "image" };

  const [config] = await context.db.select().from(studioConfig).where(eq(studioConfig.storeId, store.id)).limit(1);
  const rows = await listGenerations(context.db, store.id);
  const pictures = (await listMedia(context.db, store.id))
    .filter((m) => m.mime.startsWith("image/") && !m.key.startsWith("http"))
    .slice(0, 80)
    .map((m) => ({ key: m.key, filename: m.filename }));

  const tab = ["image", "video", "ugc"].includes(url.searchParams.get("tab") ?? "") ? String(url.searchParams.get("tab")) : "image";
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

type Result = { ok?: string; error?: string };

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
    const keyId = text("keyId");
    const secret = text("secret");
    if (!keyId || !secret) return { error: "Both the key id and the secret are needed." };
    if (!encryptionReady(env)) return { error: "Not saved: no ENCRYPTION_KEY on the Worker, and an API secret will not be stored in the clear." };
    const check = await testKey({ keyId, secret });
    if (!check.ok) return { error: check.reason };
    const secretEnc = await encryptSecret(env, secret);
    if (!secretEnc) return { error: "Could not encrypt the secret." };
    await context.db
      .insert(studioConfig)
      .values({ storeId: store.id, keyId, secretEnc, connectedAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({ target: studioConfig.storeId, set: { keyId, secretEnc, connectedAt: new Date(), updatedAt: new Date() } });
    return { ok: "Connected. Higgsfield accepted the key." };
  }

  if (intent === "disconnect") {
    await context.db.delete(studioConfig).where(eq(studioConfig.storeId, store.id));
    return { ok: "Key removed." };
  }

  if (intent === "delete") {
    await deleteGeneration(context.db, store.id, text("id"));
    return { ok: "Deleted." };
  }

  if (intent === "generate") {
    const kind = text("kind") as "image" | "video" | "ugc";
    if (!["image", "video", "ugc"].includes(kind)) return { error: "Unknown tab." };

    // The input picture: a fresh upload wins over a picked one.
    let inputKey = text("inputKey") || null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return { error: "The input has to be a picture." };
      if (file.size > 25 * 1024 * 1024) return { error: "That file is over 25 MB." };
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
        if (!product) return { error: "Say what the product is." };
        if (!script) return { error: "Write what she says. That is the ad." };
        if (!inputKey) return { error: "A UGC ad starts from a picture of the product." };
        const still = modelById("soul-reference")!;
        const imagePrompt =
          `Candid iPhone photo, no retouching, slightly imperfect light. ${creator} in ${setting}, ` +
          `holding and showing ${product} to the camera as if filming a selfie video. Keep the product exactly as in the reference picture. ` +
          `Real skin, real clothes, nothing staged, no studio.`;
        const videoPrompt =
          `She talks directly to the camera like a TikTok, natural handheld phone movement, casual energy. ` +
          `She says: "${script}". Keep the product exactly as shown. Ambient room sound.`;
        await startGeneration(context.db, env, store.id, {
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
          videoModel: text("videoModel") || "veo-i2v",
        });
        return { ok: "Started. The still comes first, then the video on top of it." };
      }

      const model = modelById(text("model"));
      if (!model || model.kind !== kind) return { error: "Pick a model." };
      const prompt = text("prompt");
      if (!prompt) return { error: "Write a prompt." };
      await startGeneration(context.db, env, store.id, {
        kind,
        model,
        prompt,
        aspect: text("aspect") || model.aspects[0],
        duration: text("duration") || model.durations?.[0] || "6",
        audio: form.get("audio") === "on",
        count: Math.min(4, Math.max(1, Number(text("count") || 1))),
        inputKey: model.needsImage ? inputKey : null,
      });
      return { ok: "Started." };
    } catch (error) {
      if (error instanceof StudioNotConfigured) return { error: error.message };
      return { error: error instanceof Error ? error.message : "Higgsfield did not accept the request." };
    }
  }

  return { error: "Unknown action." };
}

/* ------------------------------------------------------------------ view */

const TABS: [string, string][] = [
  ["image", "Image"],
  ["video", "Video"],
  ["ugc", "UGC ad"],
];

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    queued: ["var(--b-neutral-bg)", "var(--b-neutral-fg)"],
    in_progress: ["var(--b-info-bg)", "var(--b-info-fg)"],
    completed: ["var(--b-success-bg)", "var(--b-success-fg)"],
    failed: ["var(--b-critical-bg)", "var(--b-critical-fg)"],
    nsfw: ["var(--b-warning-bg)", "var(--b-warning-fg)"],
    canceled: ["var(--b-neutral-bg)", "var(--b-neutral-fg)"],
  };
  const [bg, fg] = map[status] ?? map.queued;
  const label = status === "in_progress" ? "Generating" : status === "queued" ? "Queued" : status[0].toUpperCase() + status.slice(1);
  return (
    <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>
  );
}

export default function Studio({ loaderData, actionData }: Route.ComponentProps) {
  const { store, config, rows: loaded, pictures, models, encryption, tab } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const poll = useFetcher<{ rows: GenerationRow[]; pending: number }>();
  const revalidator = useRevalidator();
  const rows = poll.data?.rows ?? loaded;
  const pending = rows.some((r) => r.status === "queued" || r.status === "in_progress");
  const [inputKey, setInputKey] = React.useState<string>("");
  const suffix = store ? `?store=${store.slug}` : "";

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

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = actionData as Result | undefined;
  const tabModels = models.filter((m) => m.kind === (tab === "ugc" ? "video" : tab));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Studio</h1>
        {config ? (
          <Form method="post" onSubmit={(e) => (window.confirm("Remove the Higgsfield key?") ? undefined : e.preventDefault())}>
            <input type="hidden" name="intent" value="disconnect" />
            <span style={{ fontSize: 12, color: "var(--ink-2)", marginRight: 10 }}>Higgsfield key …{config.keyId.slice(-4)}</span>
            <button style={secondaryButton} disabled={busy}>Disconnect</button>
          </Form>
        ) : null}
      </div>

      {result?.error ? <Notice kind="critical">{result.error}</Notice> : null}
      {result?.ok ? <Notice kind="success">{result.ok}</Notice> : null}

      {!config ? (
        <div style={{ ...card, padding: 20, maxWidth: 560 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Connect Higgsfield</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 14 }}>
            Create an API key in your Higgsfield dashboard and load API credits there. The secret is encrypted before it is stored.
          </div>
          {!encryption ? <Notice kind="critical">The Worker has no ENCRYPTION_KEY, so the secret cannot be stored yet.</Notice> : null}
          <Form method="post" style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="intent" value="connect" />
            <div>
              <label style={fieldLabel}>Key id</label>
              <input name="keyId" style={input} autoComplete="off" required />
            </div>
            <div>
              <label style={fieldLabel}>Key secret</label>
              <input name="secret" type="password" style={input} autoComplete="off" required />
            </div>
            <div>
              <button style={primaryButton} disabled={busy || !encryption}>{busy ? "Checking…" : "Connect"}</button>
            </div>
          </Form>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", gap: 2, background: "var(--bg)", borderRadius: 9, padding: 3, marginBottom: 14 }}>
              {TABS.map(([key, label]) => (
                <a
                  key={key}
                  href={`/admin/studio${suffix}${suffix ? "&" : "?"}tab=${key}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    height: 26,
                    lineHeight: "26px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                    color: "var(--ink)",
                    background: tab === key ? "var(--surface)" : "transparent",
                    boxShadow: tab === key ? "var(--shadow)" : "none",
                  }}
                >
                  {label}
                </a>
              ))}
            </div>

            <Form method="post" encType="multipart/form-data" style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="intent" value="generate" />
              <input type="hidden" name="kind" value={tab} />

              {tab === "ugc" ? (
                <>
                  <Field label="Product" help="Name it the way she would say it.">
                    <input name="product" style={input} placeholder="the bodies board in Lilac Heat" required />
                  </Field>
                  <Field label="Creator">
                    <input name="creator" style={input} placeholder="Latina in her mid twenties, hair in a claw clip, oversized tee" />
                  </Field>
                  <Field label="Where">
                    <input name="setting" style={input} placeholder="her small Brooklyn living room, morning light" />
                  </Field>
                  <Field label="What she says" help="8 seconds is about 20 words.">
                    <textarea name="script" style={textarea} required placeholder="okay this folds under my bed and I did 20 minutes before work, I'm never going back to the studio" />
                  </Field>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Video model">
                      <select name="videoModel" style={input} defaultValue="veo-i2v">
                        <option value="veo-i2v">Veo 3.1</option>
                        <option value="veo-fast-i2v">Veo 3.1 Fast</option>
                      </select>
                    </Field>
                    <Field label="Length">
                      <select name="duration" style={input} defaultValue="8">
                        {["4", "6", "8"].map((d) => <option key={d} value={d}>{d}s</option>)}
                      </select>
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Prompt">
                    <textarea name="prompt" style={textarea} required placeholder={tab === "image" ? "Candid iPhone photo of…" : "Slow push in, she looks up and smiles…"} />
                  </Field>
                  <Field label="Model">
                    <select name="model" style={input} defaultValue={tabModels[0]?.id}>
                      {tabModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
                      ))}
                    </select>
                  </Field>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Aspect">
                      <select name="aspect" style={input} defaultValue={tab === "video" ? "9:16" : "3:4"}>
                        {Array.from(new Set(tabModels.flatMap((m) => m.aspects))).map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </Field>
                    {tab === "video" ? (
                      <Field label="Length">
                        <select name="duration" style={input} defaultValue="6">
                          {["4", "5", "6", "8", "10"].map((d) => <option key={d} value={d}>{d}s</option>)}
                        </select>
                      </Field>
                    ) : (
                      <Field label="How many">
                        <select name="count" style={input} defaultValue="1">
                          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    )}
                  </div>
                  {tab === "video" ? (
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" name="audio" defaultChecked /> Generate sound
                    </label>
                  ) : null}
                </>
              )}

              <Field label={tab === "image" ? "Start from a picture (optional)" : "Start from a picture"} help="Upload one or pick from your media.">
                <input type="file" name="file" accept="image/*" style={{ fontSize: 12 }} />
                <input type="hidden" name="inputKey" value={inputKey} />
                {pictures.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, maxHeight: 132, overflow: "auto" }}>
                    {pictures.map((p) => (
                      <button
                        type="button"
                        key={p.key}
                        title={p.filename}
                        onClick={() => setInputKey(inputKey === p.key ? "" : p.key)}
                        style={{
                          width: 56,
                          height: 56,
                          padding: 0,
                          borderRadius: 8,
                          overflow: "hidden",
                          border: inputKey === p.key ? "2px solid var(--accent)" : "1px solid var(--border)",
                          background: "var(--bg)",
                          cursor: "pointer",
                        }}
                      >
                        <img src={`/media/${p.key}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </Field>

              <div>
                <button style={{ ...primaryButton, height: 34, padding: "0 16px", fontSize: 13 }} disabled={busy}>
                  {busy ? "Sending…" : tab === "ugc" ? "Make the ad" : "Generate"}
                </button>
              </div>
            </Form>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.length === 0 ? (
              <div style={card}>
                <Empty title="Nothing generated yet" help="Whatever you make lands here and in Media." />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {rows.map((row) => (
                  <Card key={row.id} row={row} busy={busy} label={models.find((m) => m.id === row.model)?.label ?? row.model} onUse={(key) => setInputKey(key)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ row, busy, label, onUse }: { row: GenerationRow; busy: boolean; label: string; onUse: (key: string) => void }) {
  const remove = useFetcher();
  const done = row.status === "completed";
  const files = done ? row.outputKeys : [];
  const isVideo = (key: string) => /\.(mp4|webm|mov)$/i.test(key);
  const working = row.status === "queued" || row.status === "in_progress";
  return (
    <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ aspectRatio: "4 / 5", background: "var(--bg)", position: "relative", display: "grid", placeItems: "center" }}>
        {files.length ? (
          isVideo(files[0]) ? (
            <video src={`/media/${files[0]}`} controls playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <img src={`/media/${files[0]}`} alt={row.prompt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )
        ) : working ? (
          <div style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 12, padding: 12 }}>
            {row.stillKey ? <img src={`/media/${row.stillKey}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, opacity: 0.5 }} /> : null}
            <span style={{ position: "relative" }}>{row.kind === "ugc" && row.stage === 2 ? "Still done, making the video…" : "Generating…"}</span>
          </div>
        ) : (
          <div style={{ color: "var(--critical)", fontSize: 12, padding: 12, textAlign: "center" }}>{row.error ?? "Did not finish."}</div>
        )}
        <span style={{ position: "absolute", top: 8, left: 8 }}>{statusBadge(row.status)}</span>
        {files.length > 1 ? (
          <span style={{ position: "absolute", top: 8, right: 8, fontSize: 11, fontWeight: 600, background: "rgba(0,0,0,.6)", color: "#fff", padding: "2px 7px", borderRadius: 8 }}>
            {files.length}
          </span>
        ) : null}
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{label} · {row.kind === "ugc" ? "UGC ad" : row.kind}</div>
        <div style={{ fontSize: 12, lineHeight: "17px", maxHeight: 34, overflow: "hidden" }} title={row.prompt}>{row.prompt}</div>
        {files.length > 1 ? (
          <div style={{ display: "flex", gap: 4 }}>
            {files.map((k) => (
              <a key={k} href={`/media/${k}`} target="_blank" rel="noreferrer" style={{ width: 36, height: 36, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                <img src={`/media/${k}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </a>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {files[0] && !isVideo(files[0]) ? (
            <button type="button" style={secondaryButton} onClick={() => onUse(files[0])}>Use as input</button>
          ) : null}
          {files[0] ? (
            <a href={`/media/${files[0]}`} download style={{ ...secondaryButton, textDecoration: "none" }}>Download</a>
          ) : null}
          <remove.Form method="post" onSubmit={(e) => (window.confirm("Delete this generation?") ? undefined : e.preventDefault())}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={row.id} />
            <button style={criticalButton} disabled={busy}>Delete</button>
          </remove.Form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {children}
      {help ? <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{help}</div> : null}
    </div>
  );
}

function Notice({ kind, children }: { kind: "critical" | "success"; children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, fontSize: 13, background: `var(--b-${kind}-bg)`, color: `var(--b-${kind}-fg)` }}>{children}</div>
  );
}
