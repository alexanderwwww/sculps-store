/**
 * Sign in.
 *
 * Two doors, and only one of them is open at a time. If Google credentials are
 * configured, Google is the only way in. Until then a single long access code
 * held as a Worker secret lets him in, so the admin is usable before the
 * Google setup is done.
 */
import { Form, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.login";
import {
  googleConfig,
  googleAuthUrl,
  newState,
  currentUser,
  checkAccessCode,
  createSession,
  sessionCookie,
  loginAllowed,
  recordFailedLogin,
  clientIp,
} from "~/lib/auth.server";
import adminHref from "~/admin/admin.css?url";

export function links() {
  return [
    { rel: "icon", href: "/favicon.ico", sizes: "any" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;650;700&display=swap",
    },
    { rel: "stylesheet", href: adminHref },
  ];
}

export function meta() {
  return [{ title: "Sign in — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const user = await currentUser(context.db, request);
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/admin";

  if (user) {
    return new Response(null, { status: 302, headers: { Location: next } });
  }

  const config = googleConfig(context.cloudflare.env);
  return {
    googleReady: Boolean(config),
    codeReady: Boolean(context.cloudflare.env.ADMIN_ACCESS_CODE),
    next,
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const next = String(form.get("next") || "/admin");
  const safeNext = next.startsWith("/admin") ? next : "/admin";

  if (intent === "google") {
    const config = googleConfig(context.cloudflare.env);
    if (!config) return { error: "Google sign-in is not configured yet." };
    const state = newState(safeNext);
    return new Response(null, {
      status: 302,
      headers: {
        Location: googleAuthUrl(config, url, state.state),
        "Set-Cookie": state.cookie(url),
      },
    });
  }

  if (intent === "code") {
    const ip = clientIp(request);
    if (!(await loginAllowed(context.db, ip))) {
      return { error: "Too many attempts. Wait fifteen minutes and try again." };
    }
    const submitted = String(form.get("code") || "");
    const user = await checkAccessCode(context.db, context.cloudflare.env, submitted);
    if (!user) {
      await recordFailedLogin(context.db, ip);
      // Deliberately vague: a wrong code and an unknown user look the same.
      return { error: "That code is not right." };
    }
    const token = await createSession(context.db, user.id, request);
    return new Response(null, {
      status: 302,
      headers: { Location: safeNext, "Set-Cookie": sessionCookie(token, url) },
    });
  }

  return { error: "Unknown sign-in method." };
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { googleReady, codeReady, next } = loaderData;
  const error = actionData?.error;

  return (
    <div
      className="k-app"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div style={{ width: "min(400px, 100%)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "linear-gradient(135deg,#A78BFA,#6D3DF5)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            S
          </span>
          <span style={{ fontWeight: 650, fontSize: 18 }}>Shop Admin</span>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            padding: 20,
          }}
        >
          <h1 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 650 }}>Sign in</h1>
          <p style={{ margin: "0 0 16px", color: "var(--ink-2)", fontSize: 13 }}>
            This admin is private. Only accounts that have been added can open it.
          </p>

          {error ? (
            <div
              style={{
                background: "var(--b-critical-bg)",
                color: "var(--b-critical-fg)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          {googleReady ? (
            <Form method="post">
              <input type="hidden" name="intent" value="google" />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid var(--input-border)",
                  background: "#fff",
                  color: "#303030",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
                  <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.4V4.9H.9a9 9 0 0 0 0 8.1l3-2.4z" />
                  <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 4.9l3 2.3C4.6 5.1 6.6 3.6 9 3.6z" />
                </svg>
                Continue with Google
              </button>
            </Form>
          ) : null}

          {googleReady && codeReady ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "16px 0",
                color: "var(--ink-3)",
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
              or
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
          ) : null}

          {codeReady ? (
            <Form method="post" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="hidden" name="intent" value="code" />
              <input type="hidden" name="next" value={next} />
              <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>
                Access code
              </label>
              <input
                name="code"
                type="password"
                autoComplete="current-password"
                placeholder="Paste your access code"
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid var(--input-border)",
                  padding: "0 12px",
                  fontSize: 14,
                }}
              />
              <button
                type="submit"
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sign in
              </button>
            </Form>
          ) : null}

          {!googleReady && !codeReady ? (
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
              No sign-in method is configured yet. Set either <code>ADMIN_ACCESS_CODE</code> or the
              Google credentials as Worker secrets.
            </div>
          ) : null}
        </div>

        <p style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12, marginTop: 14 }}>
          Sessions last 30 days and renew while you use them.
        </p>
      </div>
    </div>
  );
}
