/**
 * Marketing Studio — a chat with Claude that makes the store's assets.
 *
 * A macOS-like window inside the admin: sections on the left (Meta ad
 * photos, UGC videos, Product photos, Website photos, Organic clips), the
 * chat in the middle, Assets on the right. The owner talks; the agent in
 * studio-agent.server.ts writes the prompts, quotes the price, and runs the
 * models through fal. Everything it makes lands in Media, tagged with the
 * section, so the Assets panel is just a filtered view of the same files.
 *
 * Dark and scoped to `.ms-`; the admin shell around it stays as it is.
 */
import * as React from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.studio";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listMedia } from "~/lib/admin.server";
import { studioConfig, STUDIO_SECTIONS, type StudioSection } from "~/db/schema";
import { encryptSecret, encryptionReady } from "~/lib/crypto.server";
import { testKey, StudioNotConfigured } from "~/lib/fal.server";
import { listGenerations, deleteGeneration, listSubjects, startTraining, type GenerationRow, type SubjectRow } from "~/lib/studio.server";
import { SECTION_INFO } from "~/lib/studio-sections";
import { listThreads, threadMessages, type MessageRow, type ThreadRow } from "~/lib/studio-agent.server";
import type { ChatResult } from "./admin.studio.chat";
import type { loader as statusLoader } from "./admin.studio.status";

export function meta() {
  return [{ title: "Marketing Studio — Shop Admin" }];
}

const SECTIONS = STUDIO_SECTIONS.map((id) => ({ id, ...SECTION_INFO[id] }));

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) {
    return { store: null, config: null, encryption: false, threads: [] as ThreadRow[], messages: [] as MessageRow[], rows: [] as GenerationRow[], media: [], subjects: [] as SubjectRow[], threadId: null as string | null };
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
      ? { falKeyId: config.keyId, hasAnthropic: Boolean(config.anthropicKeyEnc), model: config.model }
      : { falKeyId: null as string | null, hasAnthropic: false, model: "claude-sonnet-5" },
    encryption: encryptionReady(context.cloudflare.env),
    threads,
    messages,
    rows,
    media: mediaRows
      .filter((m) => !m.key.startsWith("http") && !m.key.endsWith(".zip"))
      .slice(0, 600)
      .map((m) => ({ key: m.key, filename: m.filename, mime: m.mime, createdAt: m.createdAt })),
    subjects,
    threadId: thread?.id ?? null,
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
    // The fal row may not exist yet; the Anthropic key can come first.
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

  return { error: "Unknown action." };
}

/* ------------------------------------------------------------------ view */

type MediaItem = { key: string; filename: string; mime: string; createdAt: Date | string };
type Block = { type: string; [k: string]: unknown };

const PENDING = (s: string) => s === "queued" || s === "in_progress";
const isVideoKey = (k: string) => /\.(mp4|webm|mov)$/i.test(k);

/** The fal row's section, from its params (Marketing Studio rows only). */
const sectionOf = (row: GenerationRow): StudioSection | null => {
  const s = row.params.section;
  return typeof s === "string" && (STUDIO_SECTIONS as readonly string[]).includes(s) ? (s as StudioSection) : null;
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
        <linearGradient id="msGoldHi" x1="6" y1="6" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF4C8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFF4C8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M11 11.5V9a5 5 0 0 1 10 0v2.5" fill="none" stroke="url(#msGold)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6.5 11.5h19l1.6 15.2a2 2 0 0 1-2 2.3H6.9a2 2 0 0 1-2-2.3z" fill="url(#msGold)" />
      <path d="M8 13h14l.5 5.5H7.4z" fill="url(#msGoldHi)" />
      <path d="M11.2 20.4l3.4 3.2 6.6-6.4" fill="none" stroke="#3B2A05" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <path d="M11.2 20.4l3.4 3.2 6.6-6.4" fill="none" stroke="#FFF1B8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

export default function MarketingStudio({ loaderData }: Route.ComponentProps) {
  const { store, config, encryption, threads: initialThreads, messages: initialMessages, rows: initialRows, media: initialMedia, subjects: initialSubjects, threadId } = loaderData;
  const [params, setParams] = useSearchParams();
  const suffix = store ? `?store=${store.slug}` : "";
  const revalidator = useRevalidator();

  const [section, setSection] = React.useState<StudioSection>(() => {
    const fromThread = threadId ? initialThreads.find((t) => t.id === threadId)?.section : null;
    const fromUrl = params.get("section");
    return fromThread ?? ((STUDIO_SECTIONS as readonly string[]).includes(fromUrl ?? "") ? (fromUrl as StudioSection) : "meta_photos");
  });
  const [threads, setThreads] = React.useState<ThreadRow[]>(initialThreads);
  const [messages, setMessages] = React.useState<MessageRow[]>(initialMessages);
  const [rows, setRows] = React.useState<GenerationRow[]>(initialRows);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>(initialSubjects);
  const [media, setMedia] = React.useState<MediaItem[]>(initialMedia);
  const [model, setModel] = React.useState(config?.model ?? "claude-sonnet-5");
  const [showSettings, setShowSettings] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState<"chat" | "assets">("chat");
  const [rightTab, setRightTab] = React.useState<"assets" | "batches" | "subjects">("assets");
  const [attachments, setAttachments] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [picker, setPicker] = React.useState<null | "attach" | "train">(null);
  const [flash, setFlash] = React.useState<string | null>(null);

  React.useEffect(() => setThreads(initialThreads), [initialThreads]);
  React.useEffect(() => setRows(initialRows), [initialRows]);
  React.useEffect(() => setSubjects(initialSubjects), [initialSubjects]);
  React.useEffect(() => setMedia(initialMedia), [initialMedia]);
  React.useEffect(() => setMessages(initialMessages), [initialMessages]);

  const chat = useFetcher<ChatResult>();
  const threadOps = useFetcher<ChatResult>();
  const settings = useFetcher<Result>();
  const poll = useFetcher<typeof statusLoader>();
  const busy = chat.state !== "idle";

  const thread = threads.find((t) => t.id === threadId) ?? null;
  const sectionThreads = threads.filter((t) => t.section === section);

  /* ------------------------------------------------ chat result merging */
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
        setParams(next, { replace: true, preventScrollReset: true });
      }
    }
    if (data.messages?.length) setMessages((m) => [...m.filter((x) => !x.id.startsWith("local-")), ...data.messages!]);
    else setMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
    if (data.error) setFlash(data.error);
    if (data.generationIds?.length) revalidator.revalidate();
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
    } else if (data.thread) {
      setThreads((all) => [data.thread!, ...all.filter((t) => t.id !== data.thread!.id)]);
      if (data.messages) openThread(data.thread.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadOps.state, threadOps.data]);

  const lastSettings = React.useRef<Result | undefined>(undefined);
  React.useEffect(() => {
    if (settings.state !== "idle" || !settings.data || settings.data === lastSettings.current) return;
    lastSettings.current = settings.data;
    setFlash(settings.data.ok ?? settings.data.error ?? null);
    if (settings.data.ok) {
      revalidator.revalidate();
      if (settings.data.intent === "train") setPicker(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.state, settings.data]);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
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

  const needsAnthropic = !config?.hasAnthropic;
  const needsFal = !config?.falKeyId;

  /* ---------------------------------------------------------- actions */
  function openThread(id: string | null, sec?: StudioSection) {
    const next = new URLSearchParams(params);
    if (id) next.set("thread", id);
    else next.delete("thread");
    if (sec) next.set("section", sec);
    setParams(next, { preventScrollReset: true });
    if (!id) setMessages([]);
    setMobileTab("chat");
  }

  function pickSection(sec: StudioSection) {
    setSection(sec);
    const first = threads.find((t) => t.section === sec);
    openThread(first?.id ?? null, sec);
  }

  function send() {
    const text = draft.trim();
    if (!text || busy || !config?.hasAnthropic) return;
    const fd = new FormData();
    fd.set("intent", "send");
    fd.set("section", section);
    if (threadId) fd.set("threadId", threadId);
    fd.set("text", text);
    fd.set("model", model);
    for (const key of attachments) fd.append("attachment", key);
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        threadId: threadId ?? "",
        role: "user",
        content: [...attachments.map((key) => ({ type: "ms_attachment", key })), { type: "text", text }],
        createdAt: new Date(),
      } as MessageRow,
    ]);
    setDraft("");
    setAttachments([]);
    chat.submit(fd, { method: "post", action: `/admin/studio/chat${suffix}` });
  }

  function useAsReference(key: string) {
    setAttachments((a) => (a.includes(key) ? a : [...a, key]));
    setMobileTab("chat");
    composerRef.current?.focus();
  }
  function makeVideo(key: string) {
    useAsReference(key);
    setDraft((d) => d || `Make a short video from this still.`);
  }

  /** A bubble on the home grid: sections open a fresh chat, presets prefill the composer, utilities focus a panel. */
  function tapBubble(b: Bubble) {
    if (b.kind === "util") {
      if (b.id === "train") setPicker("train");
      else {
        setRightTab(b.id === "batches" ? "batches" : "assets");
        setMobileTab("assets");
      }
      return;
    }
    if (needsFal || needsAnthropic) {
      setShowSettings(true);
      setFlash(needsFal ? "Connect your fal.ai key first — it runs every model." : "Add your Anthropic key to chat here.");
      return;
    }
    const sec = b.section ?? section;
    if (b.section && b.section !== section) setSection(b.section);
    if (b.kind === "section") {
      openThread(null, sec);
      return;
    }
    if (!threadId || messages.length === 0) openThread(threadId ?? null, b.section ? sec : undefined);
    if (b.prompt) setDraft(b.prompt);
    setMobileTab("chat");
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const rowsById = React.useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  if (!store) {
    return (
      <div className="ms-desk">
        <style>{STYLE}</style>
        <div className="ms-empty-page">Create a store first.</div>
      </div>
    );
  }

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
            <GoldMark />
            <span>Marketing Studio</span>
            <span className="ms-store">{store.name}</span>
          </div>
          <div className="ms-titlebar-right">
            <div className="ms-pills" aria-label="Keys">
              <button type="button" className={`ms-pill ${needsFal ? "ms-pill-off" : "ms-pill-on"}`} onClick={() => setShowSettings(true)} title={needsFal ? "fal.ai key missing" : `fal connected: ${config?.falKeyId}`}>
                <span className="ms-pill-dot" />fal
              </button>
              <button type="button" className={`ms-pill ${needsAnthropic ? "ms-pill-off" : "ms-pill-on"}`} onClick={() => setShowSettings(true)} title={needsAnthropic ? "Anthropic key missing" : "Anthropic key saved"}>
                <span className="ms-pill-dot" />Anthropic
              </button>
            </div>
            <div className="ms-seg ms-seg-model" role="radiogroup" aria-label="Model">
              {[
                ["claude-sonnet-5", "Sonnet"],
                ["claude-opus-5", "Opus"],
              ].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={model === id} className={model === id ? "on" : ""} onClick={() => setModel(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className={`ms-icon-btn ${needsAnthropic || needsFal ? "ms-attn" : ""}`} onClick={() => setShowSettings((s) => !s)} title="Keys and settings" aria-label="Settings">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                <path d="M16.5 10a6.5 6.5 0 0 0-.1-1l1.6-1.2-1.5-2.6-1.9.7a6.6 6.6 0 0 0-1.7-1L12.6 3H7.4l-.3 2a6.6 6.6 0 0 0-1.7 1l-1.9-.7L2 7.8 3.6 9a6.5 6.5 0 0 0 0 2L2 12.2l1.5 2.6 1.9-.7a6.6 6.6 0 0 0 1.7 1l.3 2h5.2l.3-2a6.6 6.6 0 0 0 1.7-1l1.9.7 1.5-2.6-1.6-1.2c.07-.33.1-.66.1-1z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ------------------------------------------- mobile section bar */}
        <div className="ms-mobilebar">
          <div className="ms-seg ms-seg-sections">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className={section === s.id ? "on" : ""} onClick={() => pickSection(s.id)}>
                {s.short}
              </button>
            ))}
          </div>
          <div className="ms-seg ms-seg-tabs">
            <button type="button" className={mobileTab === "chat" ? "on" : ""} onClick={() => setMobileTab("chat")}>
              Chat
            </button>
            <button type="button" className={mobileTab === "assets" ? "on" : ""} onClick={() => setMobileTab("assets")}>
              Assets
            </button>
          </div>
        </div>

        {showSettings ? (
          <SettingsCard config={config} encryption={encryption} fetcher={settings} onClose={() => setShowSettings(false)} />
        ) : null}

        <div className={`ms-body ms-tab-${mobileTab}`}>
          {/* ------------------------------------------------- sidebar */}
          <aside className="ms-side">
            {SECTIONS.map((s) => {
              const list = threads.filter((t) => t.section === s.id);
              const active = section === s.id;
              return (
                <div key={s.id} className={`ms-section ${active ? "on" : ""}`}>
                  <button type="button" className="ms-section-head" onClick={() => pickSection(s.id)}>
                    <SectionIcon id={s.id} />
                    <span>{s.label}</span>
                    <span className="ms-count">{list.length || ""}</span>
                  </button>
                  {active ? (
                    <div className="ms-threads">
                      {list.map((t) => (
                        <div key={t.id} className={`ms-thread ${t.id === threadId ? "on" : ""}`}>
                          <button type="button" className="ms-thread-title" onClick={() => openThread(t.id)} title={t.title}>
                            {t.title}
                          </button>
                          <button
                            type="button"
                            className="ms-thread-x"
                            aria-label="Delete chat"
                            onClick={() => {
                              if (!window.confirm("Delete this chat? Its assets stay in Media.")) return;
                              threadOps.submit({ intent: "delete", threadId: t.id, section: s.id }, { method: "post", action: `/admin/studio/chat${suffix}` });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className="ms-newchat" onClick={() => openThread(null, s.id)}>
                        + New chat
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </aside>

          {/* ---------------------------------------------------- chat */}
          <main className="ms-chat">
            <div className="ms-chat-head">
              <div>
                <div className="ms-chat-title">{thread?.title ?? "New chat"}</div>
                <div className="ms-chat-sub">{SECTION_INFO[section].label}</div>
              </div>
              {thread?.summary ? <NotesPopover text={thread.summary} /> : null}
            </div>

            <div className={`ms-scroll ${messages.length === 0 ? "ms-scroll-home" : ""}`} ref={scrollRef}>
              {messages.length === 0 ? (
                <BubbleHome
                  media={media}
                  note={needsAnthropic ? "Add your Anthropic key in settings to chat here" : needsFal ? "Add your fal.ai key in settings to run the models" : null}
                  onTap={tapBubble}
                />
              ) : null}

              {messages.map((m) => (
                <Message key={m.id} row={m} rowsById={rowsById} onReference={useAsReference} onVideo={makeVideo} />
              ))}
              {busy ? (
                <div className="ms-row ms-row-assistant">
                  <div className="ms-bubble ms-bubble-assistant ms-typing" aria-label="Thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : null}
            </div>

            {flash ? <div className="ms-flash">{flash}</div> : null}

            <div className="ms-composer">
              {attachments.length ? (
                <div className="ms-attachments">
                  {attachments.map((key) => (
                    <span key={key} className="ms-attachment">
                      <img src={`/media/${key}`} alt="" />
                      <button type="button" aria-label="Remove" onClick={() => setAttachments((a) => a.filter((k) => k !== key))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="ms-composer-row">
                <button type="button" className="ms-icon-btn" title="Attach a picture from Media" aria-label="Attach" onClick={() => setPicker("attach")}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.5 6.5 7.8 12.2a2 2 0 1 0 2.8 2.8l6-6a4 4 0 0 0-5.6-5.6l-6.4 6.4" />
                  </svg>
                </button>
                <textarea
                  ref={composerRef}
                  className="ms-input"
                  rows={1}
                  placeholder={needsAnthropic ? "Add your Anthropic key to start" : `Tell the studio what you need… (⌘⏎ to send)`}
                  value={draft}
                  disabled={needsAnthropic || busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="button" className="ms-send" disabled={needsAnthropic || busy || !draft.trim()} onClick={send} aria-label="Send">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
                  </svg>
                </button>
              </div>
            </div>
          </main>

          {/* -------------------------------------------------- assets */}
          <aside className="ms-right">
            <div className="ms-seg ms-seg-right">
              {(["assets", "batches", "subjects"] as const).map((t) => (
                <button key={t} type="button" className={rightTab === t ? "on" : ""} onClick={() => setRightTab(t)}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {rightTab === "assets" ? (
              <AssetsGrid section={section} media={media} rows={rows} onReference={useAsReference} onVideo={makeVideo} />
            ) : rightTab === "batches" ? (
              <Batches rows={rows} suffix={suffix} />
            ) : (
              <Subjects subjects={subjects} onTrain={() => setPicker("train")} />
            )}
          </aside>
        </div>
      </div>

      {picker ? (
        <MediaPicker
          media={media}
          mode={picker}
          onClose={() => setPicker(null)}
          onPick={(keys) => {
            setAttachments((a) => Array.from(new Set([...a, ...keys])));
            setPicker(null);
          }}
          onTrain={(keys, name, trigger) => {
            const fd = new FormData();
            fd.set("intent", "train");
            fd.set("name", name);
            fd.set("trigger", trigger);
            for (const k of keys) fd.append("mediaKey", k);
            settings.submit(fd, { method: "post" });
          }}
          training={settings.state !== "idle"}
        />
      ) : null}
    </div>
  );
}

function SectionIcon({ id }: { id: StudioSection }) {
  const common = { width: 16, height: 16, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "meta_photos":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <path d="m3 13 4-4 3 3 2-2 5 5" />
          <circle cx="13" cy="8" r="1.2" />
        </svg>
      );
    case "ugc_videos":
      return (
        <svg {...common}>
          <rect x="6" y="2.5" width="8" height="15" rx="2" />
          <path d="M9 15h2" />
        </svg>
      );
    case "product_photos":
      return (
        <svg {...common}>
          <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7" />
        </svg>
      );
    case "website_photos":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="15" height="12" rx="2" />
          <path d="M2.5 8h15" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------- bubble home */

type Bubble = {
  id: string;
  label: string;
  kind: "section" | "preset" | "util";
  section?: StudioSection;
  prompt?: string;
  match: RegExp;
  icon: string; // SVG path data, 20×20 box
  weight: number; // 1 = big (section), .78 = preset, .66 = utility
};

/** One bubble per thing to make. Row layout below is the honeycomb order. */
const BUBBLES: Bubble[] = [
  { id: "exploded", label: "Exploded view", kind: "preset", section: "product_photos", prompt: "An exploded view of the product: every part floating apart in a neat vertical stack, one hue background, 1:1", match: /explod|box|kit|cables|straps|pads|charger/i, icon: "M10 3v3 M10 8v4 M10 14v3 M5 6h10 M5 11h10 M5 16h10", weight: 0.78 },
  { id: "meta_shot", label: "Meta ad shot", kind: "preset", section: "meta_photos", prompt: "Make 2 ad photos of the product on a bold one-hue background with two short sticker lines, 4:5", match: /\bad\b|-ad-|_ad_|ads?\b|band|hero|bd-g-|bd-x-/i, icon: "M3 5h14v10H3z M6 12l3-3 3 2 2-1", weight: 0.78 },
  { id: "socks", label: "Socks / accessory", kind: "preset", section: "product_photos", prompt: "A clean white-background shot of the accessory (socks/straps), recoloured to match the product, 1:1", match: /sock|strap|pad|accessor/i, icon: "M7 3h6v7l3 3v4H8l-3-3v-4l2-2z", weight: 0.78 },

  { id: "clean", label: "Clean product shot", kind: "preset", section: "product_photos", prompt: "Clean white-background shots of the product, three angles, exact product, 1:1", match: /studio|cut|render|macro/i, icon: "M4 6h12v10H4z M7 16v1h6v-1", weight: 0.78 },
  { id: "product_photos", label: "Product photos", kind: "section", section: "product_photos", match: /studio|macro|fold|screen/i, icon: "M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7", weight: 1 },
  { id: "website_photos", label: "Website photos", kind: "section", section: "website_photos", match: /hero|web|home|life/i, icon: "M2.5 4h15v12h-15z M2.5 8h15", weight: 1 },
  { id: "video", label: "Product video", kind: "preset", section: "website_photos", prompt: "A short 8s product video from the best hero still: slow push-in, soft light, with sound, 16:9", match: /studio|hero|band|bd-g-/i, icon: "M4 5h9v10H4z M13 8l3-2v8l-3-2", weight: 0.78 },

  { id: "ugc_still", label: "UGC still", kind: "preset", section: "ugc_videos", prompt: "A real-phone UGC still: a creator in her apartment holding the product, natural light, no studio, 9:16", match: /real|life|girl|apt|bd-[a-f]-/i, icon: "M7 3h6v14H7z M9 15h2", weight: 0.78 },
  { id: "ugc_videos", label: "UGC videos", kind: "section", section: "ugc_videos", match: /girl|bd-c-|bd-d-|real|apt/i, icon: "M6 2.5h8v15H6z M9 15h2", weight: 1 },
  { id: "meta_photos", label: "Meta ad photos", kind: "section", section: "meta_photos", match: /\bad\b|-ad-|_ad_|ads?\b|hero|bd-g-/i, icon: "M3 4h14v12H3z m0 9 4-4 3 3 2-2 5 5 M13 8h.01", weight: 1 },
  { id: "organic", label: "Organic clips", kind: "section", section: "organic", match: /clip|reel|tiktok|organic|fold|bd-d-/i, icon: "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z", weight: 1 },
  { id: "ugc_ad", label: "UGC ad", kind: "preset", section: "ugc_videos", prompt: "A creator in her apartment shows the product and says why she loves it, 8s, 9:16", match: /girl|real|life|bd-[a-f]-/i, icon: "M10 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M4 17c0-3 3-5 6-5s6 2 6 5", weight: 0.78 },

  { id: "assets", label: "Assets", kind: "util", match: /$^/, icon: "M4 5h12v10H4z M4 12l3-3 3 3 2-2 4 4", weight: 0.66 },
  { id: "custom", label: "Write your own", kind: "preset", match: /$^/, icon: "M4 15l9-9 2 2-9 9H4z", weight: 0.7 },
  { id: "train", label: "Train a style", kind: "util", match: /$^/, icon: "M10 3l2 4.5 5 .5-3.7 3.4 1.1 5L10 14l-4.4 2.4 1.1-5L3 8l5-.5z", weight: 0.66 },
  { id: "batches", label: "Batches", kind: "util", match: /$^/, icon: "M3 6h6v6H3z M11 6h6v6h-6z M3 14h14", weight: 0.66 },
];
/** Honeycomb rows: 3 / 4 / 5 / 4 — each row centred, so odd rows sit half a step over. */
const BUBBLE_ROWS = [3, 4, 5, 4];

const BUB_MOTION = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? false : true;

function bubbleThumb(b: Bubble, media: MediaItem[]): string | null {
  if (b.kind === "util" || b.id === "custom") return null;
  const hit = media.find((m) => m.mime.startsWith("image/") && (b.match.test(m.filename) || b.match.test(m.key)));
  return hit ? `/media/${hit.key}` : null;
}

function BubbleHome({ media, note, onTap }: { media: MediaItem[]; note: string | null; onTap: (b: Bubble) => void }) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const els = React.useRef<(HTMLButtonElement | null)[]>([]);
  const pan = React.useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const drag = React.useRef<{ id: number; x: number; y: number; moved: boolean; lx: number; ly: number; lt: number } | null>(null);
  const raf = React.useRef(0);
  const thumbs = React.useMemo(() => BUBBLES.map((b) => bubbleThumb(b, media)), [media]);

  // Nominal (unpanned) slot centres in grid units; (0,0) is the grid's centre.
  const slots = React.useMemo(() => {
    const out: { x: number; y: number }[] = [];
    const rowsY = (BUBBLE_ROWS.length - 1) / 2;
    BUBBLE_ROWS.forEach((n, r) => {
      for (let i = 0; i < n; i++) out.push({ x: i - (n - 1) / 2, y: (r - rowsY) * 0.88 });
    });
    return out;
  }, []);

  const layout = React.useCallback(() => {
    const box = wrap.current;
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H) return;
    const big = Math.max(64, Math.min(120, W * 0.2, H * 0.24));
    const small = Math.max(36, big * 0.47);
    const step = big * 1.02;
    const reach = Math.min(W, H) * 0.62;
    // Keep the grid on screen: clamp the pan to the grid's extent plus a margin.
    const maxX = (Math.max(...BUBBLE_ROWS) - 1) / 2 * step + big * 0.2;
    const maxY = ((BUBBLE_ROWS.length - 1) / 2) * 0.88 * step + big * 0.2;
    const p = pan.current;
    p.x = Math.max(-maxX, Math.min(maxX, p.x));
    p.y = Math.max(-maxY, Math.min(maxY, p.y));
    slots.forEach((s, i) => {
      const el = els.current[i];
      if (!el) return;
      const cx = W / 2 + p.x + s.x * step;
      const cy = H / 2 + p.y + s.y * step;
      const d = Math.hypot(cx - W / 2, cy - H / 2);
      const t = Math.min(1, d / reach);
      const ease = t * t * (3 - 2 * t); // smoothstep fisheye
      const size = (big - (big - small) * ease) * BUBBLES[i].weight;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${cx - size / 2}px`;
      el.style.top = `${cy - size / 2}px`;
      el.style.opacity = `${1 - ease * 0.35}`;
      el.classList.toggle("ms-bub-far", size < 62);
    });
  }, [slots]);

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
    // A tap: the bubble under the pointer.
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
      <div ref={wrap} className="ms-home-grid" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} role="group" aria-label="What to make">
        {BUBBLES.map((b, i) => (
          <button
            key={b.id}
            ref={(el) => {
              els.current[i] = el;
            }}
            type="button"
            className={`ms-bub ms-bub-${b.kind}${thumbs[i] ? " ms-bub-photo" : ""}`}
            style={BUB_MOTION ? { animationDelay: `${40 + i * 35}ms` } : { animation: "none" }}
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
              {thumbs[i] ? <img src={thumbs[i]!} alt="" draggable={false} loading="lazy" /> : null}
              <span className="ms-bub-shine" />
              <span className="ms-bub-body">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={b.icon} />
                </svg>
                <span className="ms-bub-label">{b.label}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="ms-home-hint">
        <span>Drag around · tap a bubble</span>
        {note ? <span className="ms-home-note">{note}</span> : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- messages */

function Message({
  row,
  rowsById,
  onReference,
  onVideo,
}: {
  row: MessageRow;
  rowsById: Map<string, GenerationRow>;
  onReference: (key: string) => void;
  onVideo: (key: string) => void;
}) {
  const blocks = row.content as Block[];
  if (row.role === "user") {
    const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
    const keys = blocks.filter((b) => b.type === "ms_attachment").map((b) => String(b.key));
    return (
      <div className="ms-row ms-row-user">
        <div className="ms-bubble ms-bubble-user">
          {keys.length ? (
            <div className="ms-bubble-attachments">
              {keys.map((k) => (
                <img key={k} src={`/media/${k}`} alt="" />
              ))}
            </div>
          ) : null}
          {text}
        </div>
      </div>
    );
  }
  if (row.role === "tool") {
    // Tool results: render the generations they refer to as cards.
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
          {notes.map((n, i) => (
            <div key={i} className="ms-activity">
              {n}
            </div>
          ))}
          {ids.length ? (
            <div className="ms-cards">
              {ids.map((id) => {
                const gen = rowsById.get(id);
                return gen ? <GenerationCard key={id} row={gen} onReference={onReference} onVideo={onVideo} /> : null;
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  // assistant
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "text" && String(b.text).trim()) {
          return (
            <div key={i} className="ms-row ms-row-assistant">
              <div className="ms-bubble ms-bubble-assistant">{String(b.text)}</div>
            </div>
          );
        }
        if (b.type === "tool_use") {
          return (
            <div key={i} className="ms-row ms-row-assistant">
              <div className="ms-activity">{activityLabel(String(b.name), (b.input ?? {}) as Record<string, unknown>)}</div>
            </div>
          );
        }
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
    case "list_media":
      return "Looking through Media";
    case "generate_image": {
      const n = Number(input.count ?? 1);
      return `Generating ${n} image${n > 1 ? "s" : ""} · ${input.subject_id ? "FLUX subject" : "GPT Image 2"}${cost}`;
    }
    case "generate_video":
      return `Generating a ${input.duration ?? ""}s video · ${String(input.model ?? "ltx-2-pro")}${cost}`;
    case "generate_batch":
      return `Batch of ${input.count ?? ""} clips · ${String(input.model ?? "ltx-2-pro")}${cost}`;
    case "check_generation":
      return "Waiting for the result";
    case "train_subject":
      return `Training a subject: ${String(input.name ?? "")}${cost}`;
    case "write_hooks":
      return `Wrote ${Array.isArray(input.hooks) ? input.hooks.length : ""} hooks and captions (in Notes)`;
    case "save_note":
      return "Saved a note";
    default:
      return name;
  }
}

function GenerationCard({ row, onReference, onVideo }: { row: GenerationRow; onReference: (key: string) => void; onVideo: (key: string) => void }) {
  const pending = PENDING(row.status);
  const keys = row.outputKeys;
  const label = String(row.params.label ?? row.prompt);
  if (pending) {
    return (
      <div className="ms-card">
        <div className="ms-shimmer" />
        <div className="ms-card-foot">
          <span className="ms-card-label">{row.kind === "ugc" ? (row.stage === 1 ? "Still first…" : "Now the video…") : row.status === "queued" ? "Queued" : "Rendering…"}</span>
        </div>
      </div>
    );
  }
  if (row.status !== "completed") {
    return (
      <div className="ms-card ms-card-failed">
        <div className="ms-card-err">{row.error ?? row.status}</div>
      </div>
    );
  }
  return (
    <>
      {keys.map((key) => (
        <AssetCard key={key} mediaKey={key} label={label} onReference={onReference} onVideo={onVideo} />
      ))}
    </>
  );
}

function AssetCard({ mediaKey, label, onReference, onVideo }: { mediaKey: string; label: string; onReference: (key: string) => void; onVideo: (key: string) => void }) {
  const video = isVideoKey(mediaKey);
  return (
    <div className="ms-card">
      {video ? <video src={`/media/${mediaKey}`} controls playsInline preload="metadata" /> : <img src={`/media/${mediaKey}`} alt={label} loading="lazy" />}
      <div className="ms-card-foot">
        <span className="ms-card-label" title={label}>
          Saved to Assets
        </span>
        <div className="ms-card-actions">
          <a href={`/media/${mediaKey}`} download title="Download">
            ↓
          </a>
          {!video ? (
            <>
              <button type="button" onClick={() => onReference(mediaKey)} title="Use as reference">
                Ref
              </button>
              <button type="button" onClick={() => onVideo(mediaKey)} title="Make a video">
                ▶
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NotesPopover({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="ms-notes">
      <button type="button" className="ms-chip" onClick={() => setOpen((o) => !o)}>
        Notes
      </button>
      {open ? <pre className="ms-notes-pop">{text}</pre> : null}
    </div>
  );
}

/* ------------------------------------------------------------- right panel */

function AssetsGrid({
  section,
  media,
  rows,
  onReference,
  onVideo,
}: {
  section: StudioSection;
  media: MediaItem[];
  rows: GenerationRow[];
  onReference: (key: string) => void;
  onVideo: (key: string) => void;
}) {
  const prefix = `ms-${section}-`;
  const items = media.filter((m) => m.key.startsWith(prefix));
  const pendingRows = rows.filter((r) => PENDING(r.status) && sectionOf(r) === section);
  if (!items.length && !pendingRows.length) {
    return <div className="ms-right-empty">Nothing here yet. Everything the chat makes in {SECTION_INFO[section].label} lands here.</div>;
  }
  return (
    <div className="ms-grid">
      {pendingRows.map((r) => (
        <div key={r.id} className="ms-card">
          <div className="ms-shimmer" />
        </div>
      ))}
      {items.map((m) => (
        <AssetCard key={m.key} mediaKey={m.key} label={m.filename} onReference={onReference} onVideo={onVideo} />
      ))}
    </div>
  );
}

function Batches({ rows, suffix }: { rows: GenerationRow[]; suffix: string }) {
  const groups = new Map<string, GenerationRow[]>();
  for (const r of rows) {
    const id = typeof r.params.batchId === "string" ? r.params.batchId : null;
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  if (!groups.size) return <div className="ms-right-empty">No batches yet. Ask for organic clips in the Organic section and the agent will make a batch.</div>;
  return (
    <div className="ms-batches">
      {Array.from(groups.entries()).map(([id, list]) => {
        const done = list.filter((r) => r.status === "completed").length;
        const failed = list.filter((r) => r.status === "failed").length;
        return (
          <div key={id} className="ms-batch">
            <div className="ms-batch-head">
              <div>
                <div className="ms-batch-title">Batch {id.slice(0, 8)}</div>
                <div className="ms-batch-sub">
                  {done}/{list.length} done{failed ? ` · ${failed} failed` : ""} · {timeAgo(list[0].createdAt)}
                </div>
              </div>
              {done ? (
                <a className="ms-btn ms-btn-small" href={`/admin/studio/batch${suffix}${suffix ? "&" : "?"}batch=${id}`}>
                  Download all
                </a>
              ) : null}
            </div>
            <div className="ms-batch-strip">
              {list.map((r) => {
                const key = r.outputKeys[0] ?? r.stillKey;
                return (
                  <div key={r.id} className="ms-batch-thumb" title={String(r.params.label ?? r.prompt)}>
                    {key ? isVideoKey(key) ? <video src={`/media/${key}`} muted playsInline preload="metadata" /> : <img src={`/media/${key}`} alt="" /> : <div className="ms-shimmer" />}
                    {PENDING(r.status) ? <span className="ms-batch-badge">{r.stage === 1 ? "still" : "video"}</span> : r.status === "failed" ? <span className="ms-batch-badge ms-bad">failed</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="ms-right-note">Posting to Instagram/TikTok is v2 (needs a Meta Business account and the Content Publishing API). For now: download, post by hand.</div>
    </div>
  );
}

function Subjects({ subjects, onTrain }: { subjects: SubjectRow[]; onTrain: () => void }) {
  return (
    <div className="ms-subjects">
      <button type="button" className="ms-btn ms-btn-gold ms-btn-block" onClick={onTrain}>
        Train a subject · ~$2
      </button>
      {!subjects.length ? <div className="ms-right-empty">A subject is a product or a person trained from 3–30 pictures, so the model draws it exactly every time.</div> : null}
      {subjects.map((s) => (
        <div key={s.id} className="ms-subject">
          <div className="ms-subject-thumbs">
            {s.mediaKeys.slice(0, 3).map((k) => (
              <img key={k} src={`/media/${k}`} alt="" />
            ))}
          </div>
          <div className="ms-subject-body">
            <div className="ms-subject-name">{s.name}</div>
            <div className="ms-subject-sub">
              <code>{s.triggerWord}</code> · {s.status === "ready" ? "ready" : PENDING(s.status) ? "training…" : `failed: ${s.error ?? ""}`}
            </div>
            <div className="ms-subject-id">id {s.id.slice(0, 8)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- pickers */

function MediaPicker({
  media,
  mode,
  onClose,
  onPick,
  onTrain,
  training,
}: {
  media: MediaItem[];
  mode: "attach" | "train";
  onClose: () => void;
  onPick: (keys: string[]) => void;
  onTrain: (keys: string[], name: string, trigger: string) => void;
  training: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [only, setOnly] = React.useState<"all" | "uploads" | "generated">("all");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState("");
  const list = media
    .filter((m) => m.mime.startsWith("image/"))
    .filter((m) => (only === "uploads" ? !/^(studio|ms)-/.test(m.key) : only === "generated" ? /^(studio|ms)-/.test(m.key) : true))
    .filter((m) => !q || m.filename.toLowerCase().includes(q.toLowerCase()) || m.key.toLowerCase().includes(q.toLowerCase()));
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <div className="ms-modal-back" onClick={onClose}>
      <div className="ms-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={mode === "attach" ? "Attach from Media" : "Train a subject"}>
        <div className="ms-modal-head">
          <div className="ms-modal-title">{mode === "attach" ? "Attach from Media" : "Train a subject"}</div>
          <button type="button" className="ms-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {mode === "train" ? (
          <div className="ms-modal-fields">
            <input className="ms-field" placeholder="Name, e.g. The board" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="ms-field" placeholder="Trigger word, e.g. BODIESBOARD" value={trigger} onChange={(e) => setTrigger(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
          </div>
        ) : null}
        <div className="ms-modal-tools">
          <input className="ms-field" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ms-seg">
            {(["all", "uploads", "generated"] as const).map((f) => (
              <button key={f} type="button" className={only === f ? "on" : ""} onClick={() => setOnly(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="ms-modal-grid">
          {list.map((m) => (
            <button key={m.key} type="button" className={`ms-pick ${picked.includes(m.key) ? "on" : ""}`} onClick={() => toggle(m.key)} title={m.filename}>
              <img src={`/media/${m.key}`} alt="" loading="lazy" />
            </button>
          ))}
          {!list.length ? <div className="ms-right-empty">No pictures match.</div> : null}
        </div>
        <div className="ms-modal-foot">
          <span className="ms-muted">{picked.length} picked</span>
          {mode === "attach" ? (
            <button type="button" className="ms-btn ms-btn-gold" disabled={!picked.length} onClick={() => onPick(picked)}>
              Attach
            </button>
          ) : (
            <button type="button" className="ms-btn ms-btn-gold" disabled={picked.length < 3 || !trigger || training} onClick={() => onTrain(picked, name, trigger)}>
              {training ? "Starting…" : `Train from ${picked.length} · $2`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsCard({
  config,
  encryption,
  fetcher,
  onClose,
}: {
  config: { falKeyId: string | null; hasAnthropic: boolean; model: string };
  encryption: boolean;
  fetcher: ReturnType<typeof useFetcher<Result>>;
  onClose: () => void;
}) {
  const busy = fetcher.state !== "idle";
  return (
    <div className="ms-settings">
      <div className="ms-settings-row">
        <div>
          <div className="ms-settings-title">Anthropic API key</div>
          <div className="ms-muted">{config.hasAnthropic ? "Saved and encrypted." : "console.anthropic.com → API keys."}</div>
        </div>
        {config.hasAnthropic ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="anthropic-remove" />
            <button type="submit" className="ms-btn ms-btn-small" disabled={busy}>
              Remove
            </button>
          </fetcher.Form>
        ) : (
          <fetcher.Form method="post" className="ms-keyform">
            <input type="hidden" name="intent" value="anthropic-connect" />
            <input name="secret" type="password" className="ms-field" placeholder="sk-ant-…" autoComplete="off" required />
            <button type="submit" className="ms-btn ms-btn-gold ms-btn-small" disabled={busy || !encryption}>
              Save
            </button>
          </fetcher.Form>
        )}
      </div>
      <div className="ms-settings-row">
        <div>
          <div className="ms-settings-title">fal.ai key</div>
          <div className="ms-muted">{config.falKeyId ? `Connected: ${config.falKeyId}` : "fal.ai → Dashboard → Keys. Runs every model, pay per use."}</div>
        </div>
        {config.falKeyId ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="fal-remove" />
            <button type="submit" className="ms-btn ms-btn-small" disabled={busy}>
              Remove
            </button>
          </fetcher.Form>
        ) : (
          <fetcher.Form method="post" className="ms-keyform">
            <input type="hidden" name="intent" value="fal-connect" />
            <input name="secret" type="password" className="ms-field" placeholder="key_…" autoComplete="off" required />
            <button type="submit" className="ms-btn ms-btn-gold ms-btn-small" disabled={busy || !encryption}>
              Connect
            </button>
          </fetcher.Form>
        )}
      </div>
      <div className="ms-settings-row">
        <div>
          <div className="ms-settings-title">Default model</div>
          <div className="ms-muted">Sonnet is cheap and fast; Opus for harder briefs. The switch in the title bar overrides per message.</div>
        </div>
        <fetcher.Form method="post" className="ms-keyform">
          <input type="hidden" name="intent" value="model" />
          <select name="model" defaultValue={config.model} className="ms-field">
            <option value="claude-sonnet-5">Sonnet 5</option>
            <option value="claude-opus-5">Opus 5</option>
          </select>
          <button type="submit" className="ms-btn ms-btn-small" disabled={busy}>
            Set
          </button>
        </fetcher.Form>
      </div>
      {!encryption ? <div className="ms-settings-warn">The Worker has no ENCRYPTION_KEY, so keys cannot be stored yet.</div> : null}
      <div className="ms-settings-foot">
        <span className="ms-muted">Small runs under $1 run without asking. Anything over needs your yes in the chat.</span>
        <button type="button" className="ms-btn ms-btn-small" onClick={onClose}>
          Done
        </button>
      </div>
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

/* ----------------------------------------------------------------- style */

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
.ms-desk{--bg:#0B0B0D;--win:#141416;--panel:#1A1A1D;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);--ink:#F2F2F2;--ink-2:#A7A7AD;--ink-3:#6B6B72;--gold:#C9A227;--gold-2:#F5D67A;--blue:#2F7BFF;--bubble:#26262B;
  font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:20px;color:var(--ink);background:radial-gradient(1200px 600px at 30% -10%,#1d1a12 0%,var(--bg) 60%);height:100%;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;min-height:0}
.ms-desk *{box-sizing:border-box}
.ms-desk button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.ms-desk button:disabled{opacity:.45;cursor:default}
.ms-window{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--win);border:1px solid var(--line-2);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 .5px rgba(255,255,255,.04) inset;overflow:hidden}
.ms-titlebar{display:flex;align-items:center;gap:12px;height:44px;padding:0 14px;background:linear-gradient(#1E1E21,#18181B);border-bottom:1px solid var(--line);flex:none;position:relative}
.ms-dots{display:flex;gap:7px}
.ms-dot{width:12px;height:12px;border-radius:50%;display:block;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.3)}
.ms-dot-r{background:#FF5F57}.ms-dot-y{background:#FEBC2E}.ms-dot-g{background:#28C840}
.ms-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap}
.ms-store{color:var(--ink-3);font-weight:500}
.ms-store::before{content:"·";margin-right:8px}
.ms-mark{filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.ms-titlebar-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.ms-seg{display:inline-flex;background:rgba(255,255,255,.06);border-radius:8px;padding:2px;gap:2px}
.ms-seg button{height:24px;padding:0 10px;border-radius:6px;font-size:12px;font-weight:500;color:var(--ink-2);white-space:nowrap}
.ms-seg button.on{background:rgba(255,255,255,.12);color:var(--ink)}
.ms-icon-btn{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--ink-2);flex:none}
.ms-icon-btn:hover{background:rgba(255,255,255,.08);color:var(--ink)}
.ms-icon-btn.ms-attn{color:var(--gold-2);box-shadow:0 0 0 1px rgba(201,162,39,.5)}
.ms-mobilebar{display:none}
.ms-body{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(0,1fr) 300px}
.ms-side{border-right:1px solid var(--line);background:var(--panel);overflow:auto;padding:10px 8px}
.ms-section{margin-bottom:4px}
.ms-section-head{width:100%;display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;color:var(--ink-2);font-weight:500;text-align:left}
.ms-section-head:hover{background:rgba(255,255,255,.05);color:var(--ink)}
.ms-section.on .ms-section-head{color:var(--ink);background:rgba(255,255,255,.07)}
.ms-section-head svg{color:var(--ink-3);flex:none}
.ms-section.on .ms-section-head svg{color:var(--gold-2)}
.ms-count{margin-left:auto;font-size:11px;color:var(--ink-3)}
.ms-threads{padding:4px 0 6px 12px;display:flex;flex-direction:column;gap:1px}
.ms-thread{display:flex;align-items:center;border-radius:6px}
.ms-thread.on{background:rgba(47,123,255,.18)}
.ms-thread:hover{background:rgba(255,255,255,.05)}
.ms-thread-title{flex:1;min-width:0;text-align:left;padding:5px 8px;font-size:12px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-thread.on .ms-thread-title{color:var(--ink)}
.ms-thread-x{width:22px;height:22px;color:var(--ink-3);border-radius:5px;opacity:0}
.ms-thread:hover .ms-thread-x{opacity:1}
.ms-thread-x:hover{color:var(--ink);background:rgba(255,255,255,.08)}
.ms-newchat{padding:5px 8px;font-size:12px;color:var(--gold-2);text-align:left;border-radius:6px}
.ms-newchat:hover{background:rgba(201,162,39,.12)}
.ms-chat{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--win)}
.ms-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid var(--line);flex:none}
.ms-chat-title{font-weight:600}
.ms-chat-sub{font-size:11px;color:var(--ink-3)}
.ms-scroll{flex:1;min-height:0;overflow:auto;padding:18px 18px 8px;display:flex;flex-direction:column;gap:6px}
.ms-row{display:flex;animation:msSpring .32s cubic-bezier(.2,1.2,.4,1) both;transform-origin:bottom}
.ms-row-user{justify-content:flex-end;transform-origin:bottom right}
.ms-row-assistant{justify-content:flex-start;transform-origin:bottom left}
@keyframes msSpring{from{opacity:0;transform:translateY(10px) scale(.94)}to{opacity:1;transform:none}}
.ms-bubble{max-width:min(78%,620px);padding:9px 14px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word;font-size:14px;line-height:21px}
.ms-bubble-user{background:linear-gradient(180deg,#3A86FF,#2F6FE0);color:#fff;border-bottom-right-radius:5px}
.ms-bubble-assistant{background:var(--bubble);color:var(--ink);border-bottom-left-radius:5px}
.ms-bubble-attachments{display:flex;gap:6px;margin-bottom:6px}
.ms-bubble-attachments img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.2)}
.ms-typing{display:flex;gap:4px;align-items:center;padding:12px 14px}
.ms-typing span{width:7px;height:7px;border-radius:50%;background:var(--ink-3);animation:msDots 1.2s infinite ease-in-out}
.ms-typing span:nth-child(2){animation-delay:.15s}.ms-typing span:nth-child(3){animation-delay:.3s}
@keyframes msDots{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}
.ms-activity{font-size:11.5px;color:var(--ink-3);padding:2px 6px;display:flex;align-items:center;gap:6px}
.ms-activity::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--ink-3);flex:none}
.ms-toolwrap{max-width:min(90%,720px);display:flex;flex-direction:column;gap:6px}
.ms-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.ms-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.ms-card img,.ms-card video{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#000}
.ms-card video{aspect-ratio:9/16;max-height:280px}
.ms-card-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;font-size:11px;color:var(--ink-3)}
.ms-card-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-card-actions{display:flex;gap:2px;flex:none}
.ms-card-actions a,.ms-card-actions button{height:22px;min-width:22px;padding:0 6px;border-radius:5px;color:var(--ink-2);font-size:11px;text-decoration:none;display:grid;place-items:center}
.ms-card-actions a:hover,.ms-card-actions button:hover{background:rgba(255,255,255,.1);color:var(--ink)}
.ms-card-failed{padding:10px}.ms-card-err{font-size:11px;color:#FF7B72}
.ms-shimmer{width:100%;aspect-ratio:1;background:linear-gradient(100deg,#1c1c20 30%,#2a2a30 50%,#1c1c20 70%);background-size:200% 100%;animation:msShimmer 1.4s infinite linear}
@keyframes msShimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.ms-flash{margin:0 18px 6px;padding:7px 12px;border-radius:10px;background:rgba(201,162,39,.12);border:1px solid rgba(201,162,39,.35);font-size:12px;color:var(--gold-2)}
.ms-composer{flex:none;padding:8px 14px 12px;border-top:1px solid var(--line);background:var(--win)}
.ms-attachments{display:flex;gap:6px;padding:0 0 6px}
.ms-attachment{position:relative;width:48px;height:48px}
.ms-attachment img{width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--line-2)}
.ms-attachment button{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#333;color:#fff;font-size:12px;line-height:18px;display:grid;place-items:center;border:1px solid var(--line-2)}
.ms-composer-row{display:flex;align-items:flex-end;gap:6px;background:rgba(255,255,255,.06);border:1px solid var(--line-2);border-radius:20px;padding:5px 6px 5px 6px}
.ms-composer-row:focus-within{border-color:rgba(47,123,255,.7)}
.ms-input{flex:1;background:none;border:0;outline:0;resize:none;color:var(--ink);font:inherit;font-size:14px;line-height:20px;padding:4px 4px;max-height:140px;min-height:28px;field-sizing:content}
.ms-send{width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;flex:none}
.ms-send:disabled{background:rgba(255,255,255,.12)}
.ms-right{border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.ms-seg-right{margin:10px 10px 6px}
.ms-seg-right button{flex:1}
.ms-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:6px 10px 14px;overflow:auto}
.ms-right-empty{padding:18px 14px;color:var(--ink-3);font-size:12px;text-align:center}
.ms-right-note{padding:8px 4px;color:var(--ink-3);font-size:11px}
.ms-batches{overflow:auto;padding:4px 10px 14px;display:flex;flex-direction:column;gap:10px}
.ms-batch{border:1px solid var(--line);border-radius:12px;padding:10px;background:rgba(255,255,255,.02)}
.ms-batch-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.ms-batch-title{font-weight:600;font-size:12px}
.ms-batch-sub{font-size:11px;color:var(--ink-3)}
.ms-batch-strip{display:flex;gap:6px;overflow:auto}
.ms-batch-thumb{position:relative;flex:none;width:64px;aspect-ratio:9/16;border-radius:8px;overflow:hidden;background:#000}
.ms-batch-thumb img,.ms-batch-thumb video{width:100%;height:100%;object-fit:cover;display:block}
.ms-batch-thumb .ms-shimmer{height:100%;aspect-ratio:auto}
.ms-batch-badge{position:absolute;left:4px;bottom:4px;font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff}
.ms-batch-badge.ms-bad{background:#B3261E}
.ms-subjects{overflow:auto;padding:4px 10px 14px;display:flex;flex-direction:column;gap:8px}
.ms-subject{display:flex;gap:10px;border:1px solid var(--line);border-radius:12px;padding:8px}
.ms-subject-thumbs{display:flex;gap:2px;flex:none}
.ms-subject-thumbs img{width:28px;height:28px;object-fit:cover;border-radius:6px}
.ms-subject-name{font-weight:600;font-size:12px}
.ms-subject-sub{font-size:11px;color:var(--ink-2)}
.ms-subject-sub code{color:var(--gold-2)}
.ms-subject-id{font-size:10px;color:var(--ink-3)}
.ms-btn{height:30px;padding:0 14px;border-radius:9px;background:rgba(255,255,255,.1);color:var(--ink);font-weight:500;font-size:12px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap}
.ms-btn:hover{background:rgba(255,255,255,.16)}
.ms-btn-gold{background:linear-gradient(180deg,#F5D67A,#C9A227);color:#2B1F03;font-weight:600}
.ms-btn-gold:hover{background:linear-gradient(180deg,#FFE28E,#D4AC2E)}
.ms-btn-small{height:26px;padding:0 10px;font-size:11.5px}
.ms-btn-block{width:100%}
.ms-chip{height:22px;padding:0 9px;border-radius:11px;background:rgba(255,255,255,.08);font-size:11px;color:var(--ink-2)}
.ms-notes{position:relative}
.ms-notes-pop{position:absolute;right:0;top:28px;z-index:5;width:min(360px,80vw);max-height:300px;overflow:auto;background:#222226;border:1px solid var(--line-2);border-radius:10px;padding:10px 12px;font:12px/18px Inter,system-ui,sans-serif;white-space:pre-wrap;box-shadow:0 12px 30px rgba(0,0,0,.5)}
.ms-settings{border-bottom:1px solid var(--line);background:#101012;padding:6px 16px;display:flex;flex-direction:column;flex:none}
.ms-settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.ms-settings-title{font-weight:600;font-size:12.5px}
.ms-settings-warn{color:#FFB4A8;font-size:12px;padding:6px 0}
.ms-settings-foot{display:flex;justify-content:space-between;align-items:center;padding:8px 0 4px;gap:10px}
.ms-keyform{display:flex;gap:6px;align-items:center}
.ms-field{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--line-2);background:rgba(255,255,255,.05);color:var(--ink);font:inherit;font-size:12px;min-width:0}
.ms-field:focus{outline:2px solid rgba(47,123,255,.7);outline-offset:-1px}
.ms-muted{color:var(--ink-3);font-size:12px}
.ms-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:grid;place-items:center;padding:16px;font-family:Inter,system-ui,sans-serif;color:#F2F2F2}
.ms-modal-back *{box-sizing:border-box}
.ms-modal-back button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.ms-modal{width:min(760px,100%);max-height:min(80vh,720px);background:#19191C;border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden;animation:msSpring .28s cubic-bezier(.2,1.2,.4,1) both}
.ms-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.ms-modal-title{font-weight:600}
.ms-modal-fields,.ms-modal-tools{display:flex;gap:8px;padding:10px 16px 0;flex-wrap:wrap}
.ms-modal-fields .ms-field{flex:1}
.ms-modal-tools .ms-field{flex:1}
.ms-modal-grid{flex:1;min-height:0;overflow:auto;padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;align-content:start}
.ms-pick{aspect-ratio:1;border-radius:10px;overflow:hidden;border:2px solid transparent;background:#000;padding:0}
.ms-pick img{width:100%;height:100%;object-fit:cover;display:block}
.ms-pick.on{border-color:#F5D67A;box-shadow:0 0 0 2px rgba(245,214,122,.3)}
.ms-modal-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid rgba(255,255,255,.08)}
.ms-empty-page{color:#A7A7AD;padding:40px;text-align:center}
.ms-scroll-home{padding:0;overflow:hidden}
.ms-home{flex:1;min-height:0;display:flex;flex-direction:column;position:relative;background:radial-gradient(60% 55% at 50% 48%,rgba(201,162,39,.10) 0%,rgba(201,162,39,0) 70%)}
.ms-home-grid{flex:1;min-height:0;position:relative;overflow:hidden;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;mask-image:radial-gradient(70% 70% at 50% 50%,#000 55%,transparent 100%);-webkit-mask-image:radial-gradient(70% 70% at 50% 50%,#000 55%,transparent 100%)}
.ms-home-grid.ms-home-drag{cursor:grabbing}
.ms-home-grid.ms-home-drag .ms-bub{pointer-events:none}
.ms-bub{position:absolute;width:80px;height:80px;padding:0;border-radius:50%;animation:msBubIn .6s cubic-bezier(.2,1.3,.4,1) both;will-change:left,top,width,height;-webkit-tap-highlight-color:transparent}
.ms-bub:focus-visible{outline:2px solid #F5D67A;outline-offset:3px}
@keyframes msBubIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.ms-bub-in{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:linear-gradient(160deg,#2A2A30,#141416);box-shadow:0 0 0 1px rgba(255,255,255,.14) inset,0 10px 26px rgba(0,0,0,.5);transition:transform .18s cubic-bezier(.2,1.2,.4,1),box-shadow .18s}
.ms-bub:hover .ms-bub-in{transform:scale(1.06);box-shadow:0 0 0 1px rgba(255,255,255,.24) inset,0 14px 30px rgba(0,0,0,.55)}
.ms-bub:active .ms-bub-in{transform:scale(.96)}
.ms-bub-section .ms-bub-in{background:linear-gradient(160deg,#F5D67A 0%,#C9A227 60%,#8A6A12 100%);color:#2B1F03;box-shadow:0 0 0 1px rgba(255,244,200,.45) inset,0 12px 30px rgba(201,162,39,.25)}
.ms-bub-preset .ms-bub-in{background:linear-gradient(160deg,#3A3325,#1C1913);color:#F5D67A;box-shadow:0 0 0 1px rgba(245,214,122,.22) inset,0 10px 26px rgba(0,0,0,.5)}
.ms-bub-util .ms-bub-in{color:var(--ink-2)}
.ms-bub-in img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.ms-bub-photo .ms-bub-in::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.72) 100%);border-radius:50%}
.ms-bub-photo.ms-bub-section .ms-bub-in{box-shadow:0 0 0 2px #F5D67A inset,0 0 0 3px rgba(201,162,39,.35),0 12px 30px rgba(201,162,39,.25)}
.ms-bub-shine{position:absolute;inset:0;border-radius:50%;background:radial-gradient(60% 55% at 30% 22%,rgba(255,255,255,.14),rgba(255,255,255,0) 70%);pointer-events:none;z-index:2}
.ms-bub-body{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8%;text-align:center;pointer-events:none}
.ms-bub-photo .ms-bub-body{justify-content:flex-end;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6);padding-bottom:12%}
.ms-bub-photo .ms-bub-body svg{display:none}
.ms-bub-label{font-size:11px;line-height:13px;font-weight:600;letter-spacing:-.01em;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ms-bub-section .ms-bub-label{font-size:12px;line-height:14px}
.ms-bub-far .ms-bub-label{display:none}
.ms-bub-far.ms-bub-photo .ms-bub-body svg{display:block}
.ms-home-hint{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 12px 10px;font-size:11.5px;color:var(--ink-3)}
.ms-home-note{color:var(--gold-2)}
.ms-pills{display:flex;gap:4px}
.ms-pill{height:22px;padding:0 8px 0 6px;border-radius:11px;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);color:var(--ink-2)}
.ms-pill:hover{background:rgba(255,255,255,.1);color:var(--ink)}
.ms-pill-dot{width:6px;height:6px;border-radius:50%;background:#28C840;box-shadow:0 0 6px rgba(40,200,64,.6)}
.ms-pill-off .ms-pill-dot{background:#FF5F57;box-shadow:0 0 6px rgba(255,95,87,.6)}
.ms-pill-off{color:var(--gold-2)}
@media (prefers-reduced-motion: reduce){.ms-bub{animation:none}.ms-bub-in{transition:none}}
@media (max-width: 900px){
  .ms-desk{padding:0}
  .ms-window{border-radius:0;border:0}
  .ms-title{position:static;transform:none}
  .ms-store,.ms-seg-model{display:none}
  .ms-pill{padding:0 6px;font-size:10px}
  .ms-mobilebar{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--panel)}
  .ms-seg-sections{overflow:auto}
  .ms-seg-sections button{flex:none}
  .ms-seg-tabs button{flex:1}
  .ms-body{grid-template-columns:1fr}
  .ms-side{display:none}
  .ms-right{display:none;border-left:0}
  .ms-tab-assets .ms-right{display:flex}
  .ms-tab-assets .ms-chat{display:none}
  .ms-bubble{max-width:88%}
  .ms-cards{grid-template-columns:repeat(2,1fr)}
}
`;
