/** Where Google sends the browser back to. */
import type { Route } from "./+types/admin.auth.callback";
import {
  googleConfig,
  checkState,
  exchangeCode,
  findAllowedUser,
  createSession,
  sessionCookie,
  clearedStateCookie,
} from "~/lib/auth.server";

export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const fail = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `/admin/login?error=${encodeURIComponent(reason)}`,
        "Set-Cookie": clearedStateCookie(url),
      },
    });

  const next = checkState(request, state);
  if (!next) return fail("That sign-in link expired. Try again.");
  if (!code) return fail("Google did not return a sign-in code.");

  const config = googleConfig(context.cloudflare.env);
  if (!config) return fail("Google sign-in is not configured.");

  let profile;
  try {
    profile = await exchangeCode(config, code, url);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign-in failed.");
  }

  const user = await findAllowedUser(context.db, profile);
  if (!user) {
    // The account is real but not on the list. No row is created for it.
    return fail("That Google account cannot open this admin.");
  }

  const token = await createSession(context.db, user.id, request);
  const headers = new Headers({ Location: next });
  headers.append("Set-Cookie", sessionCookie(token, url));
  headers.append("Set-Cookie", clearedStateCookie(url));
  return new Response(null, { status: 302, headers });
}
