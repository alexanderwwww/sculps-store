/**
 * Garden Buddy's checkout chrome.
 *
 * A checkout is not a page of the shop: it is the end of one. So the store's
 * header comes across with the logo and nothing else — no menu, no cart icon,
 * no "Order Now" — because every one of those is a door out of a page someone
 * is already standing in. The footer keeps the policy links, which are the
 * only links a person actually needs here (and the ones Stripe looks for).
 *
 * The icons and the three trust lines below are the theme's own, carried over
 * from `index.tsx` character for character — the same SVG paths and the same
 * words that already render in the header's top bar and the footer's trust
 * strip. Nothing here is new copy.
 */
import type { NavLink } from "~/lib/store.server";

export interface CheckoutChromeStore {
  name: string;
  logoUrl: string | null;
}

/* ------------------------------------------------------------------ icons */
/* Copied from the theme's header/footer. Inline SVG on the live theme. */

export const IcoTruck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M1.5 6.5h11v9h-11z" /><path d="M12.5 9.5h4.6l2.9 3v3h-7.5z" /><circle cx="6" cy="17.5" r="2" /><circle cx="16.5" cy="17.5" r="2" /></svg>
);
export const IcoShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 2.5l7.5 3v6c0 4.6-3.1 8.4-7.5 10-4.4-1.6-7.5-5.4-7.5-10v-6z" /><path d="M8.6 11.8l2.4 2.4 4.4-4.6" /></svg>
);
export const IcoHeadset = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 14v-2.5a7.5 7.5 0 0 1 15 0V14" /><path d="M4.5 12.5h2V18h-2a1.5 1.5 0 0 1-1.5-1.5v-2.5a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M19.5 12.5h-2V18h2a1.5 1.5 0 0 0 1.5-1.5v-2.5a1.5 1.5 0 0 0-1.5-1.5z" /><path d="M19 18v.8a2.7 2.7 0 0 1-2.7 2.7H13" /></svg>
);

/** The store's own three promises, in the order the theme's trust strip uses. */
export const TRUST = [
  { icon: IcoTruck, lead: "Free", rest: "Shipping" },
  { icon: IcoShield, lead: "30-Day", rest: "Money Back Guarantee" },
  { icon: IcoHeadset, lead: "24/7", rest: "Support" },
];

function Logo({ store, wordClass, imgClass }: { store: CheckoutChromeStore; wordClass: string; imgClass: string }) {
  if (!store.logoUrl) return <span className={wordClass}>{store.name}</span>;
  return <img src={store.logoUrl} alt={store.name} className={imgClass} />;
}

export function CheckoutHeader({ store, home }: { store: CheckoutChromeStore; home: string }) {
  return (
    <header className="gb-co__bar">
      <div className="gb-wrap gb-co__bar-in">
        <a className="gb-co__logo" href={home} aria-label={store.name}>
          <Logo store={store} wordClass="gb-co__wordmark" imgClass="gb-co__logo-img" />
        </a>
      </div>
    </header>
  );
}

export function CheckoutFooter({
  store,
  links,
  contactEmail,
}: {
  store: CheckoutChromeStore;
  links: NavLink[];
  contactEmail: string | null;
}) {
  return (
    <footer className="gb-co__foot">
      <div className="gb-wrap gb-co__foot-in">
        <small className="gb-co__legal">
          © {new Date().getFullYear()} {store.name}
        </small>
        {links.length > 0 ? (
          <nav className="gb-co__foot-links" aria-label="Policies">
            {links.map((l) => (
              <a key={l.href + l.label} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
        ) : null}
        {contactEmail ? <small className="gb-co__legal">{contactEmail}</small> : null}
      </div>
    </footer>
  );
}

/** The three promises, rendered next to the button that takes the money. */
export function TrustRow() {
  return (
    <ul className="gb-co__trust">
      {TRUST.map((t) => (
        <li key={t.lead}>
          {t.icon}
          <span>
            <strong>{t.lead}</strong>
            {t.rest}
          </span>
        </li>
      ))}
    </ul>
  );
}
