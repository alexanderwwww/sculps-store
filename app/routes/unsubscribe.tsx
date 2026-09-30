/**
 * One page, two doors.
 *
 * GET shows a button (mail scanners open links, so a GET must not unsubscribe
 * anyone). POST does it: the button, and the mail client's one-click
 * List-Unsubscribe-Post.
 */
import type { Route } from "./+types/unsubscribe";
import { suppress, validUnsubscribe } from "~/lib/suppression.server";

const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;background:#0E0A0C;color:#f4efe8;font-family:Inter,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px">${title}</h1>${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const e = url.searchParams.get("e") ?? "";
  const s = url.searchParams.get("s") ?? "";
  if (!(await validUnsubscribe(context.cloudflare.env, e, s))) return page("That link does not work", `<p>It may be incomplete. Reply to any of our emails and we will take you off the list by hand.</p>`);
  return page(
    "Stop these reminders?",
    `<p style="opacity:.75">${esc(e)}</p><form method="post"><input type="hidden" name="e" value="${esc(e)}"><input type="hidden" name="s" value="${esc(s)}"><button style="padding:14px 28px;border:0;border-radius:4px;background:#FF7A1A;color:#140A02;font-weight:700;font-size:15px">Unsubscribe</button></form>`,
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const e = String(form?.get("e") ?? url.searchParams.get("e") ?? "");
  const s = String(form?.get("s") ?? url.searchParams.get("s") ?? "");
  if (!(await validUnsubscribe(context.cloudflare.env, e, s))) return page("That link does not work", `<p>Reply to any of our emails and we will take you off the list by hand.</p>`);
  await suppress(context.db, e);
  return page("You are unsubscribed", `<p>No more reminders to ${esc(e)}.</p>`);
}
