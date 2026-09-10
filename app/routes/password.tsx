/** The page a visitor sees while the store is password-protected. */
import { Form } from "react-router";
import type { Route } from "./+types/password";
import { resolveStore } from "~/lib/store.server";
import { hashPassword, passwordCookie } from "~/lib/password.server";
import themeHref from "~/storefronts/garden-kneeler/theme.css?url";

export function links() {
  return [{ rel: "stylesheet", href: themeHref }];
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.store.name ?? "Coming soon" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });
  if (!store.passwordEnabled) throw new Response(null, { status: 302, headers: { Location: `/?store=${store.slug}` } });
  return { store: { name: store.name, slug: store.slug, message: store.passwordMessage || "This store is opening soon." } };
}

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });
  const form = await request.formData();
  const hash = await hashPassword(String(form.get("password") || ""));
  if (!store.passwordHash || hash !== store.passwordHash) return { error: "That password is not right." };
  return new Response(null, {
    status: 302,
    headers: { Location: `/?store=${store.slug}`, "Set-Cookie": passwordCookie(hash, url) },
  });
}

export default function PasswordPage({ loaderData, actionData }: Route.ComponentProps) {
  const { store } = loaderData;
  return (
    <div className="gk">
      <header className="gk-header">
        <span className="gk-logo">{store.name}</span>
      </header>
      <div className="gk-shell" style={{ maxWidth: 520 }}>
        <div className="gk-panel">
          <h1 style={{ marginTop: 0 }}>{store.name}</h1>
          <p style={{ fontSize: 20 }}>{store.message}</p>
          {actionData?.error ? <div className="gk-alert">{actionData.error}</div> : null}
          <Form method="post">
            <label className="gk-field">
              <span>Password</span>
              <input className="gk-input" name="password" type="password" autoFocus />
            </label>
            <button className="gk-cta" type="submit" style={{ width: "100%" }}>
              Enter
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
