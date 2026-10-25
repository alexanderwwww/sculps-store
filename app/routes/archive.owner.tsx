/**
 * The owner's private way in. Not linked from anywhere. One long code, then the
 * Messages tab turns into the inbox for every conversation.
 */
import { useState } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/archive.owner";
import { resolveStore } from "~/lib/store.server";
import { MA_SLUG, readOwner } from "~/lib/ma-offers.server";
import css from "~/storefronts/mysterious-archive/theme.css?url";

export const links = () => [
  { rel: "stylesheet", href: css },
  { rel: "icon", type: "image/png", href: "/archive-icon.png" },
];
export const meta = () => [
  { title: "Owner — Mysterious Archive" },
  { name: "robots", content: "noindex,nofollow" },
  { tagName: "link", rel: "manifest", href: "/archive-owner.webmanifest" },
  { tagName: "link", rel: "apple-touch-icon", href: "/archive-app-180.png" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-title", content: "MA Inbox" },
  { name: "apple-mobile-web-app-status-bar-style", content: "black" },
  { name: "theme-color", content: "#000000" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store || store.slug !== MA_SLUG) throw new Response("Not found", { status: 404 });
  const query = url.searchParams.has("store") ? "?store=mysterious-archive" : "";
  if (await readOwner(context.db, store.id, request)) throw redirect("/archive/account" + query);
  return { query };
}

export default function Owner({ loaderData }: Route.ComponentProps) {
  const { query } = loaderData;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/archive/api/owner-signin", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code }),
        credentials: "same-origin",
      });
      const r = (await res.json()) as { ok?: boolean; reason?: string };
      if (r.ok) {
        window.location.href = "/archive/account" + query;
        return;
      }
      setError(r.reason || "That code is not right.");
    } catch {
      setError("Connection problem. Try again.");
    }
    setBusy(false);
  };
  return (
    <div className="ma">
      <div className="ma-top">A private collection. An independent perspective.</div>
      <header>
        <Link className="ma-logo" to={"/archive" + query}><img src="/archive-logo-script.png" alt="Mysterious Archive" /></Link>
      </header>
      <main className="ma-acct-signin">
        <div className="ma-acct-card">
          <h1>Owner</h1>
          <form onSubmit={submit}>
            <p>Enter your owner code.</p>
            <label>
              Owner code
              <input type="password" name="code" autoComplete="current-password" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="ma-acct-primary" disabled={busy || code.length < 8}>{busy ? "Checking…" : "Open inbox"}</button>
          </form>
          {error && <p className="ma-acct-error" role="alert">{error}</p>}
        </div>
      </main>
    </div>
  );
}
