/** Signing out deletes the session row, so the cookie cannot be replayed. */
import type { Route } from "./+types/admin.logout";
import { destroySession, clearedSessionCookie } from "~/lib/auth.server";

export async function action({ context, request }: Route.ActionArgs) {
  await destroySession(context.db, request);
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: { Location: "/admin/login", "Set-Cookie": clearedSessionCookie(url) },
  });
}

export async function loader() {
  return new Response(null, { status: 302, headers: { Location: "/admin" } });
}
