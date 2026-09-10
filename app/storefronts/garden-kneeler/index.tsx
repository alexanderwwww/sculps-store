import { useState } from "react";
import type { LoadedProductPage, LoadedSection } from "~/lib/store.server";
import { formatMoney, savedPercent } from "~/lib/money";
import { SPEC_PENDING } from "~/lib/sections";

/**
 * Garden kneeler storefront — store one.
 *
 * Every word and image on this page comes out of the database. Nothing here
 * invents content: an empty section is skipped, an unmeasured spec renders as
 * a visible "Spec pending", and reviews come from the reviews table only.
 */

type Vals = Record<string, string>;
const val = (v: Vals, k: string) => (v[k] ?? "").trim();
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

export function GardenKneelerStorefront({ page }: { page: LoadedProductPage }) {
  const { store, product, sections } = page;

  return (
    <>
      <header className="gk-header">
        <span className="gk-logo">{store.name}</span>
        {page.nav.main.length ? (
          <nav className="gk-nav">
            {page.nav.main.map((link) => (
              <a key={link.href + link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
        <span className="gk-header-note">{store.domain}</span>
      </header>

      <main>
        {sections.map((s, i) => (
          <Section key={s.id} section={s} page={page} index={i} />
        ))}
      </main>

      <footer className="gk-footer">
        <nav>
          {page.nav.footer.map((link) => (
            <a key={link.href + link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <p className="gk-sub" style={{ marginTop: 18 }}>© {new Date().getFullYear()} {store.name}</p>
      </footer>
    </>
  );
}

function Section({
  section,
  page,
  index,
}: {
  section: LoadedSection;
  page: LoadedProductPage;
  index: number;
}) {
  const body = renderSection(section, page);
  if (!body) return null;

  // The buy box carries the page; everything after it alternates ground tone.
  const alt = index > 0 && index % 2 === 0;
  return (
    <section
      className={`gk-section${alt ? " gk-section--alt" : ""}`}
      data-section={section.type}
      id={`section-${section.type}`}
    >
      <div className="gk-wrap">{body}</div>
    </section>
  );
}

function Head({ v }: { v: Vals }) {
  if (!has(v, "heading", "subheading", "badge")) return null;
  return (
    <div className="gk-head">
      {val(v, "badge") && <span className="gk-eyebrow">{val(v, "badge")}</span>}
      {val(v, "heading") && <h2>{val(v, "heading")}</h2>}
      {val(v, "subheading") && <p className="gk-sub">{val(v, "subheading")}</p>}
    </div>
  );
}

function renderSection(s: LoadedSection, page: LoadedProductPage): React.ReactNode {
  const v = s.values;
  const blocks = s.blocks;

  switch (s.type) {
    /* ---------------------------------------------------------- buy box */
    case "buy_box":
      return <BuyBox section={s} page={page} />;

    /* ---------------------------------------------------- video with faq */
    case "video_faq": {
      const questions = blocks.filter((b) => has(b.values, "question"));
      if (!has(v, "heading", "video") && questions.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-video-faq">
            <div className="gk-video">
              {val(v, "video") ? (
                <video src={val(v, "video")} controls playsInline preload="metadata" />
              ) : (
                <div className="gk-ph">Video not added yet</div>
              )}
            </div>
            {questions.length > 0 && (
              <div className="gk-faq">
                {questions.map((b) => (
                  <details key={b.id}>
                    <summary>{val(b.values, "question")}</summary>
                    {val(b.values, "answer") && (
                      <div className="gk-faq-answer">{val(b.values, "answer")}</div>
                    )}
                  </details>
                ))}
              </div>
            )}
          </div>
        </>
      );
    }

    /* -------------------------------------------------- social proof images */
    case "social_proof_images": {
      const photos = blocks.filter((b) => has(b.values, "image"));
      if (photos.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-photos">
            {photos.map((b) => (
              <figure key={b.id} style={{ margin: 0 }}>
                <div className="gk-photo">
                  <img src={val(b.values, "image")} alt={val(b.values, "caption") || ""} loading="lazy" />
                </div>
                {val(b.values, "caption") && (
                  <figcaption className="gk-photo-caption">{val(b.values, "caption")}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      );
    }

    /* ------------------------------------------------------------ video clips */
    case "video_clips": {
      const clips = blocks.filter((b) => has(b.values, "video"));
      if (clips.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-grid gk-grid--3">
            {clips.map((b) => (
              <div className="gk-card" key={b.id}>
                <div className="gk-card-media">
                  <video src={val(b.values, "video")} controls playsInline preload="metadata" />
                </div>
                {val(b.values, "caption") && <p>{val(b.values, "caption")}</p>}
              </div>
            ))}
          </div>
        </>
      );
    }

    /* ----------------------------------------------------------- product grid */
    case "product_grid": {
      const { variants, product } = page;
      if (variants.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-grid gk-grid--3">
            {variants.map((variant) => {
              const pct = savedPercent(variant.priceCents, variant.compareAtCents);
              return (
                <div className="gk-card" key={variant.id}>
                  <h3>{variant.label}</h3>
                  {variant.sublabel && <p className="gk-sub" style={{ marginTop: 6 }}>{variant.sublabel}</p>}
                  <p className="gk-price-now" style={{ fontSize: 25, marginTop: 14 }}>
                    {formatMoney(variant.priceCents, page.store.currency)}
                  </p>
                  {variant.compareAtCents && (
                    <p style={{ margin: 0 }}>
                      <span className="gk-price-was">
                        {formatMoney(variant.compareAtCents, page.store.currency)}
                      </span>{" "}
                      {pct !== null && <span className="gk-saved">Save {pct}%</span>}
                    </p>
                  )}
                  <a className="gk-cta" href={`/cart/add?variant=${variant.id}`} style={{ marginTop: 18, textAlign: "center", textDecoration: "none", display: "block", lineHeight: "28px" }}>
                    Choose {variant.label}
                  </a>
                </div>
              );
            })}
          </div>
          {val(v, "footnote") && (
            <p className="gk-sub" style={{ marginTop: 22 }}>
              {val(v, "footnote")}
            </p>
          )}
          <p className="gk-sub" style={{ marginTop: 8, fontSize: 16 }}>
            {product.title}
          </p>
        </>
      );
    }

    /* ------------------------------------------------------------ trust icons */
    case "trust_icons": {
      const icons = blocks.filter((b) => has(b.values, "title", "text"));
      if (icons.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-trust">
            {icons.map((b) => (
              <div key={b.id}>
                <div className="gk-trust-icon">
                  {val(b.values, "icon") ? <img src={val(b.values, "icon")} alt="" /> : null}
                </div>
                {val(b.values, "title") && <h3 style={{ fontSize: 20 }}>{val(b.values, "title")}</h3>}
                {val(b.values, "text") && (
                  <p style={{ color: "var(--gk-cream-dim)", marginTop: 6 }}>{val(b.values, "text")}</p>
                )}
              </div>
            ))}
          </div>
        </>
      );
    }

    /* ------------------------------------------------------------ three steps */
    case "three_steps": {
      const steps = blocks.filter((b) => has(b.values, "title", "text"));
      if (steps.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-grid gk-grid--3">
            {steps.map((b, i) => (
              <div className="gk-card" key={b.id}>
                <div className="gk-step-n">{i + 1}</div>
                {val(b.values, "image") && (
                  <div className="gk-card-media">
                    <img src={val(b.values, "image")} alt="" loading="lazy" />
                  </div>
                )}
                {val(b.values, "title") && <h3>{val(b.values, "title")}</h3>}
                {val(b.values, "text") && <p>{val(b.values, "text")}</p>}
              </div>
            ))}
          </div>
        </>
      );
    }

    /* ------------------------------------------------------- benefits, features */
    case "benefits":
    case "features": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-grid gk-grid--3">
            {items.map((b) => (
              <div className="gk-card" key={b.id}>
                {val(b.values, "image") && (
                  <div className="gk-card-media">
                    <img src={val(b.values, "image")} alt="" loading="lazy" />
                  </div>
                )}
                {val(b.values, "title") && <h3>{val(b.values, "title")}</h3>}
                {val(b.values, "text") && <p>{val(b.values, "text")}</p>}
              </div>
            ))}
          </div>
        </>
      );
    }

    /* -------------------------------------------------------- comparison table */
    case "comparison_table": {
      const rows = blocks.filter((b) => has(b.values, "label"));
      if (rows.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-table-scroll">
            <table className="gk-table">
              <thead>
                <tr>
                  <th />
                  <th className="gk-col-us">{val(v, "usLabel") || page.store.name}</th>
                  <th>{val(v, "themLabel") || "Others"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{val(b.values, "label")}</th>
                    <td className="gk-col-us">{val(b.values, "us")}</td>
                    <td>{val(b.values, "them")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    /* ---------------------------------------------------------------- reviews */
    case "reviews": {
      // Reviews never come from blocks. One source of truth: the reviews table.
      const list = page.reviews;
      if (list.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-reviews">
            {list.map((r) => (
              <article className="gk-review" key={r.id}>
                {r.imageUrl && (
                  <div className="gk-review-photo">
                    <img src={r.imageUrl} alt="" loading="lazy" />
                  </div>
                )}
                <div className="gk-stars" aria-label={`${r.rating} out of 5`}>
                  {"★".repeat(r.rating)}
                  {"☆".repeat(Math.max(0, 5 - r.rating))}
                </div>
                {r.title && <h3 style={{ fontSize: 20, marginTop: 10 }}>{r.title}</h3>}
                {r.body && <p style={{ marginTop: 8 }}>{r.body}</p>}
                <p className="gk-review-name">{r.name}</p>
                <p className="gk-review-meta">
                  {[r.verified ? "Verified purchase" : null, r.country].filter(Boolean).join(" · ")}
                </p>
              </article>
            ))}
          </div>
        </>
      );
    }

    /* ------------------------------------------------------------ who it's for */
    case "who_its_for": {
      const people = blocks.filter((b) => has(b.values, "title", "text"));
      if (people.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-grid gk-grid--2">
            {people.map((b) => (
              <div className="gk-card" key={b.id}>
                {val(b.values, "title") && <h3>{val(b.values, "title")}</h3>}
                {val(b.values, "text") && <p>{val(b.values, "text")}</p>}
              </div>
            ))}
          </div>
        </>
      );
    }

    /* ------------------------------------------------------ what's in the box */
    case "whats_in_the_box": {
      const items = blocks.filter((b) => has(b.values, "title"));
      if (items.length === 0 && !val(v, "image")) return null;
      return (
        <>
          <Head v={v} />
          <div className="gk-video-faq">
            <div className="gk-video" style={{ aspectRatio: "4 / 3" }}>
              {val(v, "image") ? (
                <img
                  src={val(v, "image")}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div className="gk-ph">Photo not added yet</div>
              )}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((b) => (
                <li
                  key={b.id}
                  style={{ padding: "16px 0", borderBottom: "1px solid var(--gk-line)" }}
                >
                  <strong style={{ fontSize: 19 }}>{val(b.values, "title")}</strong>
                  {val(b.values, "text") && (
                    <div style={{ color: "var(--gk-cream-dim)" }}>{val(b.values, "text")}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      );
    }

    /* --------------------------------------------------------- specifications */
    case "specifications": {
      const rows = blocks.filter((b) => has(b.values, "label"));
      if (rows.length === 0) return null;
      return (
        <>
          <Head v={v} />
          <table className="gk-specs">
            <tbody>
              {rows.map((b) => {
                const value = val(b.values, "value");
                return (
                  <tr key={b.id}>
                    <th scope="row">{val(b.values, "label")}</th>
                    <td>
                      {value ? value : <span className="gk-spec-pending">{SPEC_PENDING}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      );
    }

    /* ------------------------------------------------------------ closing cta */
    case "closing_cta": {
      if (!has(v, "heading", "subheading")) return null;
      const def = page.variants.find((x) => x.isDefault) ?? page.variants[0];
      return (
        <div className="gk-closing">
          {val(v, "heading") && <h2>{val(v, "heading")}</h2>}
          {val(v, "subheading") && (
            <p className="gk-sub" style={{ margin: "14px auto 0" }}>
              {val(v, "subheading")}
            </p>
          )}
          {def && (
            <a
              className="gk-cta"
              href={`/cart/add?variant=${def.id}`}
              style={{ textDecoration: "none", lineHeight: "28px" }}
            >
              {val(v, "ctaLabel") || `Get the ${page.product.title}`}
            </a>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

/* -------------------------------------------------------------- the buy box */

function BuyBox({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
  const { product, variants, store } = page;
  const v = section.values;
  const images = section.blocks.filter((b) => has(b.values, "image"));

  const defaultIndex = Math.max(
    0,
    variants.findIndex((x) => x.isDefault),
  );
  const [selected, setSelected] = useState(defaultIndex);
  const chosen = variants[selected];

  return (
    <div className="gk-buybox">
      <div className="gk-gallery">
        <div className="gk-gallery-main">
          {images[0] ? (
            <img src={val(images[0].values, "image")} alt={val(images[0].values, "alt")} />
          ) : (
            <div className="gk-ph">Product photo not added yet</div>
          )}
        </div>
        {images.length > 1 && (
          <div className="gk-gallery-strip">
            {images.slice(1, 5).map((b) => (
              <div className="gk-gallery-thumb" key={b.id}>
                <img src={val(b.values, "image")} alt={val(b.values, "alt")} loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        {val(v, "badge") && <span className="gk-eyebrow">{val(v, "badge")}</span>}
        <h1>{val(v, "heading") || product.title}</h1>
        {val(v, "subheading") && <p className="gk-sub">{val(v, "subheading")}</p>}

        {variants.length > 0 ? (
          <>
            <div className="gk-options" role="radiogroup" aria-label="Choose your bundle">
              {variants.map((variant, i) => {
                const pct = savedPercent(variant.priceCents, variant.compareAtCents);
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={i === selected}
                    className="gk-option"
                    key={variant.id}
                    onClick={() => setSelected(i)}
                  >
                    <span className="gk-radio" aria-hidden="true" />
                    <span>
                      <span className="gk-option-label">{variant.label}</span>
                      {variant.sublabel && (
                        <span className="gk-option-sub" style={{ display: "block" }}>
                          {variant.sublabel}
                        </span>
                      )}
                    </span>
                    <span className="gk-price">
                      <span className="gk-price-now">
                        {formatMoney(variant.priceCents, store.currency)}
                      </span>
                      {variant.compareAtCents && (
                        <>
                          <br />
                          <span className="gk-price-was">
                            {formatMoney(variant.compareAtCents, store.currency)}
                          </span>
                          {pct !== null && (
                            <>
                              <br />
                              <span className="gk-saved">Save {pct}%</span>
                            </>
                          )}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <form method="post" action="/cart/add">
              <input type="hidden" name="variantId" value={chosen?.id ?? ""} />
              <button className="gk-cta" type="submit">
                {val(v, "ctaLabel") || "Add to cart"}
                {chosen ? ` — ${formatMoney(chosen.priceCents, store.currency)}` : ""}
              </button>
            </form>

            {val(v, "reassurance") && <p className="gk-reassurance">{val(v, "reassurance")}</p>}
          </>
        ) : (
          <div className="gk-empty">No bundle options yet. Add them in the admin.</div>
        )}
      </div>
    </div>
  );
}
