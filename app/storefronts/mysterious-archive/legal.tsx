import { Link } from "react-router";

/**
 * The legal and policy pages of Mysterious Archive: /archive/terms, /privacy, /returns, /shipping, /contact, /about.
 *
 * Written only from what the site already says and does (one unit per piece, a printed certificate with every
 * order, signature on delivery, the full refund if a piece is ever proven not authentic, 6-hour private offer
 * links, Stripe for payment). The legal business name and street address are NOT here: they were never given,
 * and nothing is invented. Add them to Shop Admin → Settings (legal name, address) and to LEGAL_ENTITY below.
 */
export const CONTACT_EMAIL = "mysterious@mysteriousarchive.com";
export const LEGAL_ENTITY = "AIGIS LLC"; // the company behind the trade name Mysterious Archive (given by Alex, 2026-11-03)
export const OWNER = "Alexandros Bougiouklis"; // owner and operator (given by Alex, 2026-11-03)
export const COMPANY_STATEMENT = "Mysterious Archive is the trade name of " + LEGAL_ENTITY + ", owned and operated by " + OWNER + ".";
export const PLACE = "505 West 162nd Street, New York, NY, United States";   // business address, given by Alex 2026-11-08
/** The business address shown on the Legal notice. Alex 2026-11-08: New York. Put the full street address here when he gives it. */
export const ADDRESS = PLACE;

type Section = { h: string; p: string[] };
export type LegalPageDef = { title: string; lead: string; sections: Section[] };

export const LEGAL: Record<string, LegalPageDef> = {
  about: {
    title: "About Mysterious Archive",
    lead: "An independent archive of collectible pieces.",
    sections: [
      { h: "The archive", p: ["Mysterious Archive collects and offers Chrome Hearts pieces: sterling silver jewelry, leather belts and buckles, hats, eyewear and footwear. Each piece is one of a kind and is inspected and photographed before it is offered."] },
      { h: "Authenticity", p: ["Every piece is inspected and authenticated by Mysterious Archive, and every order includes a printed Mysterious Archive certificate of authenticity. If a piece is ever proven not authentic, you receive a full refund.", "Our certificates are issued independently by Mysterious Archive. They are not manufacturer certificates or gemstone laboratory reports."] },
      { h: "Independent", p: ["Mysterious Archive is an independent reseller and is not affiliated with, or endorsed by, Chrome Hearts. Chrome Hearts is a trademark of its respective owner."] },
      { h: "The company", p: [COMPANY_STATEMENT] },
      { h: "Where we are", p: [PLACE + "."] },
    ],
  },
  contact: {
    title: "Contact",
    lead: "Write to us. A person answers.",
    sections: [
      { h: "Email", p: ["Write to [[email]]"] },
      { h: "Questions about a piece", p: ["Ask about condition, sizing or details from the piece's page with “Chat”, or make an offer. Both open a conversation in your Messages, where we answer personally."] },
      { h: "Your order", p: ["Include the email you ordered with and the piece's reference (MA-xxxxxx), and we will help."] },
      { h: "The company", p: [COMPANY_STATEMENT] },
      { h: "Where we are", p: [PLACE + "."] },
    ],
  },
  shipping: {
    title: "Shipping",
    lead: "Every piece is packed with care and tracked to your door.",
    sections: [
      { h: "How your piece travels", p: ["Pieces ship from New York in Mysterious Archive packaging; some arrive in our art-piece packaging. A printed certificate of authenticity is included with every order.", "Every delivery requires a signature."] },
      { h: "Tracking", p: ["Your tracking details are emailed to you as soon as your piece is on its way."] },
      { h: "Where we ship", p: ["We ship to the delivery addresses offered at checkout."] },
      { h: "Delivery problems", p: ["If a package arrives damaged or something is wrong with the delivery, email [[email]] on the day it arrives, with photographs, and we will take care of it."] },
    ],
  },
  returns: {
    title: "Returns & refunds",
    lead: "Every customer is welcome to a refund.",
    sections: [
      { h: "Refunds, for everyone", p: ["Every customer is welcome to a refund. If a piece is not right for you, send it back and your payment comes back to you."] },
      { h: "How it works", p: ["Email [[email]] to start your return, and we arrange it with you.", "Send the piece back to us.", "The moment we receive it, your refund is issued, instantly, to the payment method you paid with."] },
      { h: "Authenticity guarantee", p: ["If a piece is ever proven not authentic, you receive a full refund."] },
    ],
  },
  privacy: {
    title: "Privacy",
    lead: "What we collect, why, and who sees it.",
    sections: [
      { h: "Who we are", p: [COMPANY_STATEMENT + " Contact: [[email]]"] },
      { h: "What we collect", p: ["Your email address, when you sign in with a code, send a message or make an offer, or place an order.", "Your name, delivery address and phone number, when you place an order.", "Your messages and offers to us.", "Basic visit information: pages viewed, device type and approximate location, and where you arrived from."] },
      { h: "Payments", p: ["Payments are processed by Stripe. Your card details go directly to Stripe and never reach our servers. We receive confirmation of the payment, and the last four digits and brand of the card."] },
      { h: "How we use it", p: ["To sign you in, answer your messages, take and deliver your order, send your order emails and keep the site secure. We also use visit information to understand how the site is used and to measure our advertising."] },
      { h: "Advertising and cookies", p: ["We use cookies to keep you signed in, to remember your bag and to recognise visits. Our advertising on Meta platforms (Facebook and Instagram) uses Meta's pixel and conversions measurement, which receives page views and purchases."] },
      { h: "Who we share it with", p: ["Only the services that run the store: Stripe for payments, our email delivery provider, our hosting provider, Meta for advertising measurement, and the carrier that delivers your order. We do not sell your information."] },
      { h: "Your choices", p: ["Email [[email]] to see, correct or delete the information we hold about you."] },
    ],
  },
  "legal-notice": {
    title: "Legal notice",
    lead: "Who operates this website.",
    sections: [
      { h: "Operator", p: ["This website, mysteriousarchive.com, is operated by " + LEGAL_ENTITY + " under the trade name Mysterious Archive."] },
      { h: "Owner", p: [OWNER + ", owner and operator."] },
      { h: "Business address", p: [ADDRESS] },
      { h: "Contact", p: ["Email: [[email]]"] },
      { h: "Payments", p: ["Payments are processed by Stripe. Card details go directly to Stripe and never reach our servers."] },
      { h: "Trademarks", p: ["Mysterious Archive is an independent reseller. It is not affiliated with, or endorsed by, Chrome Hearts. Chrome Hearts is a trademark of its respective owner."] },
      { h: "Policies", p: ["[[/terms|Terms of sale]], [[/privacy|Privacy]], [[/returns|Returns & refunds]] and [[/shipping|Shipping]] apply to every purchase."] },
    ],
  },
  terms: {
    title: "Terms of sale",
    lead: "The terms for buying from Mysterious Archive.",
    sections: [
      { h: "Who is selling", p: [COMPANY_STATEMENT, PLACE + ". Contact: [[email]]"] },
      { h: "The pieces", p: ["Every piece is a one-of-a-kind collectible and is sold as photographed. Pieces are pre-owned unless the page says new or unworn; condition is stated on each piece and the photographs show any patina or wear. Each piece exists once: if two people try to buy it, the first completed payment secures it."] },
      { h: "Prices and payment", p: ["Prices are in US dollars. Payment is taken at checkout through Stripe, with the methods shown there. Your order is confirmed when your payment is confirmed."] },
      { h: "Offers", p: ["Make an offer opens a conversation with us. When we accept an offer, you receive a private checkout link at the agreed price, for that piece and for you only, valid for 6 hours. If it is not used within 6 hours, it expires."] },
      { h: "Authenticity", p: ["Every order includes a printed Mysterious Archive certificate of authenticity. If a piece is ever proven not authentic, you receive a full refund. Certificates are issued independently by Mysterious Archive and are not manufacturer certificates or laboratory reports."] },
      { h: "Delivery, returns and refunds", p: ["Every customer is welcome to a refund: return the piece and your refund is issued the moment we receive it. [[/shipping|Shipping]] and [[/returns|Returns & refunds]] form part of these terms."] },
      { h: "Trademarks", p: ["Mysterious Archive is an independent reseller. It is not affiliated with, or endorsed by, Chrome Hearts. Chrome Hearts is a trademark of its respective owner."] },
      { h: "Privacy", p: ["Our [[/privacy|Privacy page]] explains how your information is handled."] },
    ],
  },
};

export const LEGAL_ORDER = ["terms", "privacy", "returns", "shipping", "contact", "about", "legal-notice"] as const;
const LABEL: Record<string, string> = { terms: "Terms", privacy: "Privacy", returns: "Returns", shipping: "Shipping", contact: "Contact", about: "About", "legal-notice": "Legal notice" };

/** The row of policy links shown in the footer of every archive page. */
export function LegalLinks({ query }: { query: string }) {
  return (
    <p className="ma-legal-links">
      {LEGAL_ORDER.map((k) => (
        <Link key={k} to={"/archive/" + k + query}>{LABEL[k]}</Link>
      ))}
    </p>
  );
}

/** The line that names who is behind the site, shown in the footer of every archive page. */
export function CompanyLine() {
  return (
    <p className="ma-company">
      Mysterious Archive is the trade name of {LEGAL_ENTITY}, owned and operated by {OWNER}.<br />
      {PLACE} · <a href={"mailto:" + CONTACT_EMAIL}>{CONTACT_EMAIL}</a>
    </p>
  );
}

/** Turns [[email]] and [[/page|Label]] inside a paragraph into real links, so an address never sits at the end of a sentence next to a full stop. */
function rich(text: string, query: string) {
  return text.split(/(\[\[[^\]]+\]\])/g).map((part, i) => {
    const m = /^\[\[(.+)\]\]$/.exec(part);
    if (!m) return part;
    if (m[1] === "email") return <a key={i} className="ma-legal-mail" href={"mailto:" + CONTACT_EMAIL}>{CONTACT_EMAIL}</a>;
    const [to, label] = m[1].split("|");
    return <Link key={i} to={"/archive" + to + query}>{label}</Link>;
  });
}

export const LEGAL_UPDATED = "November 8, 2026";

export function LegalPage({ def, query = "" }: { def: LegalPageDef; query?: string }) {
  return (
    <main className="ma-legal">
      <p className="ma-eyebrow">MYSTERIOUS ARCHIVE</p>
      <h1>{def.title}</h1>
      <p className="ma-legal-lead">{def.lead}</p>
      <p className="ma-legal-date">Last updated {LEGAL_UPDATED}</p>
      {def.sections.map((s, n) => (
        <section key={s.h}>
          <h2><span>{String(n + 1).padStart(2, "0")}</span>{s.h}</h2>
          {s.p.map((t) => <p key={t}>{rich(t, query)}</p>)}
        </section>
      ))}
      <aside className="ma-legal-card">
        <h2>Questions?</h2>
        <p>A person answers every message.</p>
        <a className="ma-legal-btn" href={"mailto:" + CONTACT_EMAIL}>Email us</a>
        <span className="ma-legal-mail">{CONTACT_EMAIL}</span>
      </aside>
    </main>
  );
}
