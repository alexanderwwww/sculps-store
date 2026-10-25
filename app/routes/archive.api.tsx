/**
 * Mysterious Archive: sign-in, offers and messages. One POST endpoint, one
 * operation per request, JSON out for the page and a redirect for plain forms.
 */
import type { Route } from "./+types/archive.api";
import { resolveStore } from "~/lib/store.server";
import {
  MA_SLUG,
  acceptCounter,
  addMessage,
  declineCounter,
  clearOwnerCookie,
  clearSessionCookie,
  acceptOffer,
  counterOffer,
  rejectOffer,
  sendTestMail,
  endOwner,
  ownerCookie,
  ownerSignIn,
  readOwner,
  createOffer,
  endSession,
  normEmail,
  readSession,
  redeemOffer,
  requestCode,
  sameOrigin,
  sessionCookie,
  setTyping,
  startChat,
  verifyCode,
  withdrawOffer,
} from "~/lib/ma-offers.server";

function json(body: unknown, init: { status?: number; cookies?: string[] } = {}): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of init.cookies ?? []) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export async function loader() {
  return new Response("Not found", { status: 404 });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store || store.slug !== MA_SLUG) return json({ ok: false, reason: "Not found." }, { status: 404 });
  if (request.method !== "POST" || !sameOrigin(request)) return json({ ok: false, reason: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env as Env;
  const form = await request.formData();
  const text = (k: string) => String(form.get(k) ?? "");
  const origin = url.origin;

  switch (params.op) {
    case "code": {
      const email = normEmail(text("email"));
      if (!email) return json({ ok: false, reason: "Enter a valid email." }, { status: 400 });
      const sent = await requestCode(context.db, env, store, email);
      return json(sent, { status: sent.ok ? 200 : 429 });
    }
    case "verify": {
      const email = normEmail(text("email"));
      if (!email) return json({ ok: false, reason: "Enter a valid email." }, { status: 400 });
      const token = await verifyCode(context.db, store, email, text("code"));
      if (!token) return json({ ok: false, reason: "That code is not right or has expired." }, { status: 401 });
      return json({ ok: true, email }, { cookies: [sessionCookie(token, url)] });
    }
    case "signout": {
      await endSession(context.db, store.id, request);
      return json({ ok: true }, { cookies: [clearSessionCookie(url)] });
    }
  }

  if (params.op === "owner-signin") {
    const res = await ownerSignIn(context.db, env, store, text("code"), request);
    if (!res.ok) return json(res, { status: 401 });
    return json({ ok: true }, { cookies: [ownerCookie(res.token, url)] });
  }
  if (params.op.startsWith("owner-")) {
    if (!(await readOwner(context.db, store.id, request))) return json({ ok: false, reason: "Owner sign-in needed.", signIn: true }, { status: 401 });
    const offerId = text("offerId");
    switch (params.op) {
      case "owner-signout":
        await endOwner(context.db, store.id, request);
        return json({ ok: true }, { cookies: [clearOwnerCookie(url)] });
      case "owner-mailtest": {
        const res = await sendTestMail(env, "getsculps@gmail.com");
        return json(res, { status: res.ok ? 200 : 500 });
      }
      case "owner-reply": {
        const res = await addMessage(context.db, env, store, offerId, "owner", text("body"), origin);
        return json(res, { status: res.ok ? 200 : 400 });
      }
      case "owner-accept": {
        const res = await acceptOffer(context.db, env, store, offerId, null, origin);
        return json(res, { status: res.ok ? 200 : 400 });
      }
      case "owner-counter": {
        const cents = Math.round(Number(text("amount").replace(/[$,\s]/g, "")) * 100);
        const res = await counterOffer(context.db, env, store, offerId, cents, origin);
        return json(res, { status: res.ok ? 200 : 400 });
      }
      case "owner-reject": {
        const res = await rejectOffer(context.db, env, store, offerId, origin);
        return json(res, { status: res.ok ? 200 : 400 });
      }
      default:
        return json({ ok: false, reason: "Unknown request." }, { status: 404 });
    }
  }

  const session = await readSession(context.db, store.id, request);
  if (!session) return json({ ok: false, reason: "Sign in first.", signIn: true }, { status: 401 });

  switch (params.op) {
    case "offer": {
      const dollars = Number(text("amount").replace(/[$,\s]/g, ""));
      const cents = Math.round(dollars * 100);
      const res = await createOffer(context.db, env, store, session.email, text("variantId"), cents, text("note"), origin);
      return json(res, { status: res.ok ? 200 : 400 });
    }
    case "chat": {
      const res = await startChat(context.db, env, store, session.email, text("variantId"), text("note"), origin);
      return json(res, { status: res.ok ? 200 : 400 });
    }
    case "message": {
      const { getThread } = await import("~/lib/ma-offers.server");
      const thread = await getThread(context.db, store, text("offerId"), { email: session.email });
      if (!thread) return json({ ok: false, reason: "Conversation not found." }, { status: 404 });
      const res = await addMessage(context.db, env, store, thread.offer.id, "customer", text("body"), origin);
      return json(res, { status: res.ok ? 200 : 400 });
    }
    case "counter-accept": {
      const res = await acceptCounter(context.db, env, store, text("offerId"), session.email, origin);
      return json(res, { status: res.ok ? 200 : 400 });
    }
    case "counter-decline": {
      const ok = await declineCounter(context.db, env, store, text("offerId"), session.email, origin);
      return json({ ok }, { status: ok ? 200 : 400 });
    }
    case "typing": {
      await setTyping(context.db, store, text("offerId"), session.email);
      return json({ ok: true });
    }
    case "withdraw": {
      const ok = await withdrawOffer(context.db, store, text("offerId"), session.email);
      return json({ ok }, { status: ok ? 200 : 400 });
    }
    case "redeem": {
      const res = await redeemOffer(context.db, store, request, text("offerId"), session.email);
      if (!res.ok) return json(res, { status: 400 });
      return json({ ok: true, to: "/checkout" }, { cookies: [res.cookie] });
    }
    default:
      return json({ ok: false, reason: "Unknown request." }, { status: 404 });
  }
}
