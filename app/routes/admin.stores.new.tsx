/**
 * Create a store.
 *
 * This is the screen the prototype never had, because the prototype's three
 * stores were typed into the file. Creating one here also creates its live
 * theme, its product page, and the fifteen sections in their fixed order — a
 * store is never half-built.
 */
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin.stores.new";
import { requireUser } from "~/lib/auth.server";
import { createStore, listStores } from "~/lib/admin.server";
import { card, cardHeader, Field, input, primaryButton, secondaryButton } from "~/admin/ui";

export function meta() {
  return [{ title: "Add store — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const existing = await listStores(context.db);
  return { count: existing.length };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();

  const name = String(form.get("name") || "").trim();
  const domain = String(form.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const slug = slugify(String(form.get("slug") || "") || name);
  const contactEmail = String(form.get("contactEmail") || "").trim() || null;
  const color = String(form.get("color") || "#4CAF7D");

  if (!name) return { error: "Give the store a name." };
  if (!slug) return { error: "That name does not make a usable short code — add a short code yourself." };
  if (!domain) {
    return {
      error:
        "A domain is required. If you have not bought one yet, put a placeholder like mystore.pending and change it later in Settings.",
    };
  }

  const existing = await listStores(context.db);
  if (existing.some((s) => s.slug === slug)) return { error: `Another store already uses the short code "${slug}".` };
  if (existing.some((s) => s.domain === domain)) return { error: `Another store already uses ${domain}.` };

  const store = await createStore(context.db, { name, slug, domain, contactEmail, color });
  return new Response(null, { status: 302, headers: { Location: `/admin?store=${store.slug}` } });
}

const COLORS = ["#4CAF7D", "#F28C28", "#3B82F6", "#A78BFA", "#E5484D", "#0EA5E9"];

export default function NewStore({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link to="/admin" style={{ ...secondaryButton, textDecoration: "none" }}>
          ←
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>Add store</h1>
      </div>

      {actionData?.error ? (
        <div
          style={{
            background: "var(--b-critical-bg)",
            color: "var(--b-critical-fg)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {actionData.error}
        </div>
      ) : null}

      <Form method="post" style={card}>
        <div style={cardHeader}>Store details</div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Store name" help="What you call it in here. Customers see it in emails.">
            <input name="name" style={input} placeholder="Garden Kneeler" required />
          </Field>

          <Field
            label="Domain"
            help="The address customers visit. Placeholders are fine — change it in Settings once the real one is bought."
          >
            <input name="domain" style={input} placeholder="kneelwell.com" required />
          </Field>

          <Field label="Short code" help="Used in admin links. Left blank, it comes from the name.">
            <input name="slug" style={input} placeholder="garden-kneeler" />
          </Field>

          <Field label="Contact email" help="Where customer replies go. Optional for now.">
            <input name="contactEmail" type="email" style={input} placeholder="you@example.com" />
          </Field>

          <Field label="Dot colour" help="How you tell this store apart in the switcher.">
            <div style={{ display: "flex", gap: 8 }}>
              {COLORS.map((color, index) => (
                <label key={color} style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="color"
                    value={color}
                    defaultChecked={index === 0}
                    style={{ position: "absolute", opacity: 0 }}
                  />
                  <span
                    style={{
                      display: "block",
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: color,
                      border: "2px solid var(--surface)",
                      boxShadow: "0 0 0 1px var(--border)",
                    }}
                  />
                </label>
              ))}
            </div>
          </Field>
        </div>
        <div
          style={{
            padding: 16,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Link to="/admin" style={{ ...secondaryButton, textDecoration: "none" }}>
            Cancel
          </Link>
          <button type="submit" disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Creating…" : "Create store"}
          </button>
        </div>
      </Form>

      <p style={{ color: "var(--ink-2)", fontSize: 12, margin: 0 }}>
        Creating a store also creates its live theme and its product page with the fifteen sections
        already in place. Payments, domain and Meta are set up per store afterwards, in Settings.
      </p>
    </div>
  );
}
