/**
 * One Marketing Studio turn: the owner's message in, the agent's messages
 * out. Also the small thread housekeeping (new, rename, delete) so the page
 * has one place to post to.
 */
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.studio.chat";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { studioConfig, studioThreads, STUDIO_SECTIONS, type StudioSection } from "~/db/schema";
import { ensureThread, runTurn, threadMessages, type MessageRow, type ThreadRow } from "~/lib/studio-agent.server";
import { StudioNotConfigured } from "~/lib/fal.server";

export interface ChatResult {
  ok?: boolean;
  error?: string;
  thread?: ThreadRow;
  messages?: MessageRow[];
  generationIds?: string[];
  deletedThreadId?: string;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  const threadId = url.searchParams.get("thread");
  if (!store || !threadId) return { messages: [] as MessageRow[] };
  const [thread] = await context.db
    .select()
    .from(studioThreads)
    .where(and(eq(studioThreads.id, threadId), eq(studioThreads.storeId, store.id)))
    .limit(1);
  if (!thread) return { messages: [] as MessageRow[] };
  return { messages: await threadMessages(context.db, threadId) };
}

export async function action({ context, request }: Route.ActionArgs): Promise<ChatResult> {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };
  const env = context.cloudflare.env;

  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent") || "send";
  const section = (STUDIO_SECTIONS as readonly string[]).includes(text("section")) ? (text("section") as StudioSection) : "meta_photos";
  const threadId = text("threadId") || null;

  if (intent === "new") {
    const thread = await ensureThread(context.db, store.id, section, null);
    return { ok: true, thread, messages: [] };
  }

  if (intent === "delete") {
    if (threadId) await context.db.delete(studioThreads).where(and(eq(studioThreads.id, threadId), eq(studioThreads.storeId, store.id)));
    return { ok: true, deletedThreadId: threadId ?? undefined };
  }

  if (intent === "rename") {
    if (!threadId) return { error: "No thread." };
    const [thread] = await context.db
      .update(studioThreads)
      .set({ title: text("title").slice(0, 80) || "New chat" })
      .where(and(eq(studioThreads.id, threadId), eq(studioThreads.storeId, store.id)))
      .returning();
    return { ok: true, thread };
  }

  if (intent === "send") {
    const message = text("text");
    if (!message) return { error: "Say something first." };
    const [config] = await context.db.select().from(studioConfig).where(eq(studioConfig.storeId, store.id)).limit(1);
    const thread = await ensureThread(context.db, store.id, section, threadId);
    try {
      const result = await runTurn({
        db: context.db,
        env,
        origin: url.origin,
        store: { id: store.id, name: store.name, slug: store.slug },
        thread,
        text: message,
        attachments: form.getAll("attachment").map(String).filter(Boolean),
        model: text("model") || config?.model || "claude-sonnet-5",
      });
      return { ok: !result.error, error: result.error, thread: result.thread, messages: result.messages, generationIds: result.generationIds };
    } catch (error) {
      if (error instanceof StudioNotConfigured) return { error: error.message, thread };
      return { error: error instanceof Error ? error.message : "The turn failed.", thread };
    }
  }

  return { error: "Unknown action." };
}
