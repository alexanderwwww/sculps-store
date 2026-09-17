/**
 * XERO's words, in one file.
 *
 * These live in code rather than in editable section fields on purpose. The
 * brief that specifies them is a compliance document, not a style guide: the
 * Apple disclaimer, the "design intent, not an independently tested security
 * rating" qualifier, the "not insurance" note on the 10-Year variant and the
 * "Renders and design visualisations" label are all sentences that carry legal
 * weight and are quoted verbatim. A text box invites a paraphrase, and a
 * paraphrase of any of these is the thing the brief explicitly forbids.
 *
 * Prices, stock and pictures are the opposite — they change often and belong in
 * the database. Nothing priced or pictured is hard-coded here.
 */

export const BRAND = {
  wordmark: "XERO",
  product: "Chiron",
  tagline: "Ride to the stars.",
  secondary: "Designed on Earth. Tested elsewhere.",
} as const;

export const HERO = {
  title: "XERO Chiron.",
  subtitle: "980 Nm · 120 km/h",
  body:
    "An electric off-road motorcycle designed to run without a key or a barrel. Your phone lies flat in the tank, charges while you ride, and the system is designed so that only your paired phone wakes the machine. Design intent, not an independently tested security rating.",
  process: ["Order", "Quality and safety check", "Delivered to your door"],
  bullets: [
    "Paired to your client ID before dispatch",
    "Free delivery within the United States, to your door on a tail-lift vehicle, never a parcel courier",
    "30-day returns — we arrange and pay for collection",
  ],
  /** The hero stage, in the order the reference build showed them. */
  shots: [
    "/media/xero-hero-1.webp",
    "/media/xero-hero-2.webp",
    "/media/xero-hero-3.webp",
    "/media/xero-hero-4.webp",
    "/media/xero-hero-5.webp",
    "/media/xero-hero-6.webp",
  ],
} as const;

export const GALLERY = {
  heading: "Every angle.",
  shots: ["/media/xero-gallery-1.webp", "/media/xero-gallery-2.webp", "/media/xero-gallery-3.webp"],
} as const;

export const IPHONE_KEY = {
  eyebrow: "NO KEYS. NO FOB HUNTING.",
  heading: "Your iPhone is the key.",
  sub: "Card in, card out, phone in. After that the bike knows your phone and nothing else will start it.",
  steps: [
    {
      title: "Cut for your phone",
      body: "A pocket milled into the tank to the exact size and thickness of an iPhone, with the charging coil built into the floor of it. Nothing clips on. Nothing sticks out.",
      image: "/media/xero-gallery-4.webp",
    },
    {
      title: "Tap your card once",
      body: "Your steel card carries the bike's client ID and serial. Lay it in the pocket, the NFC reader picks it up, and the machine is claimed. Then take the card straight back out.",
      image: "/media/xero-gallery-5.webp",
    },
    {
      title: "Drop your phone in",
      body: "It lies flat and flush, the magnet holds it, and it charges while you ride. From then on the bike wakes for that phone alone.",
      image: "/media/xero-gallery-6.webp",
    },
  ],
  payoff: "Designed around the phone you already carry.",
  cta: { label: "Activate your ID", href: "/pages/activate" },
  /** Mandatory wherever iPhone is named as a feature. Quoted, never reworded. */
  disclaimer:
    "XERO is an independent company and is not affiliated with, endorsed by, or sponsored by Apple Inc. iPhone is a trademark of Apple Inc.",
} as const;

/** Both reels carry the same footnote. It is the "not customer footage" rule. */
export const FILM_FOOTNOTE =
  "Filmed by XERO. Not customer footage. Riding shown on private land by an experienced rider in full protective equipment.";

export const REELS = [
  {
    kicker: "IN THE CITY",
    heading: "we made it with love",
    sub: "we build it like a spaceship",
    video: "/media/xero-reel-1.mp4",
    poster: "/media/xero-reel-1-poster.webp",
  },
  {
    kicker: "ON THE TRAIL",
    heading: "watch it move",
    sub: "Handheld footage from our own rides. Forest singletrack, rock, wet roots, after dark.",
    video: "/media/xero-box-4.mp4",
    poster: "/media/xero-box-4-poster.webp",
  },
] as const;

export const SPECS = {
  kicker: "SPECIFICATIONS",
  heading: "Every number.",
  sub: "The whole sheet. No asterisks, no small print, nothing withheld.",
  groups: [
    {
      name: "POWERTRAIN",
      rows: [
        { label: "Peak power", value: "82", unit: "hp" },
        { label: "Torque at the wheel", value: "980", unit: "Nm" },
        { label: "Motor speed", value: "15,000", unit: "rpm" },
        { label: "Transmission", value: "Direct drive", unit: "" },
      ],
    },
    {
      name: "PERFORMANCE",
      rows: [
        { label: "Top speed", value: "120", unit: "km/h" },
        { label: "0–60 km/h", value: "2.3", unit: "s" },
      ],
    },
    {
      name: "BATTERY (ASTRA ULTIMUM)",
      rows: [
        { label: "Capacity", value: "8.4", unit: "kWh" },
        { label: "Charge 0–100%", value: "55", unit: "min" },
        { label: "Cycles to 80%", value: "1,500", unit: "" },
        { label: "Swap time", value: "11", unit: "sec" },
      ],
    },
    {
      name: "CHASSIS",
      rows: [
        { label: "Weight, all in", value: "104", unit: "kg" },
        { label: "Suspension travel", value: "310", unit: "mm" },
        { label: "Front brake", value: "280", unit: "mm 4-piston" },
      ],
    },
  ],
  /** Required. The brief forbids "certified", "tested to" and "rated". */
  footnote:
    "Manufacturer specifications. Real-world figures vary with terrain, rider weight, temperature, tyre choice and setup.",
} as const;

export const BOX = {
  kicker: "WHAT ARRIVES FIRST",
  heading: "The key lands before the bike.",
  sub: "A machined aluminium case arrives days ahead of delivery. Inside: your key and your card. Nothing else.",
  images: ["/media/xero-box-1.webp", "/media/xero-box-2.webp", "/media/xero-box-3.webp"],
  card: {
    heading: "Milled steel. Your number on it.",
    body: "Every Chiron ships with a solid steel card carrying its serial and client ID, laser-etched. Tap it into the tank once and the bike is paired to you.",
    cta: { label: "Track your build", href: "/pages/track" },
    image: "/media/xero-box-5.webp",
  },
} as const;

export const ASTRA = {
  heading: "A new kind of battery.",
  image: "/media/xero-box-6.webp",
  stats: [
    { value: "8.4 kWh", label: "Capacity" },
    { value: "11 sec", label: "To swap" },
    { value: "1,500", label: "Cycles to 80%" },
  ],
} as const;

export const VIBES = {
  heading: "Out of the trailer. Into the night.",
  shots: [
    { image: "/media/xero-box-1.webp", caption: "OUT OF THE TRAILER" },
    { image: "/media/xero-box-2.webp", caption: "FIRST RIDE" },
  ],
} as const;

export const FAQ = {
  heading: "Questions.",
  video: "/media/xero-faq-1.mp4",
  poster: "/media/xero-faq-1-poster.webp",
  rows: [
    ["How fast is it?", "120 km/h, about 75 mph."],
    ["How much torque?", "980 Nm at the rear wheel, with 82 hp peak. There is no gearbox between the motor and the rear wheel."],
    ["What does it weigh?", "104 kg, all in. A single-piece cast frame carries the pack, so there is no subframe underneath."],
    ["How far does it go?", "An 8.4 kWh ASTRA ULTIMUM pack, good for a long day of trail riding. A second pack swaps in."],
    ["How long does it charge?", "About 55 minutes from empty to full, and the pack holds over 80% of its capacity after 1,500 cycles."],
    ["How does the key work?", "There is no key. A steel card ships with the bike and pairs it to you once. After that your phone wakes it."],
    ["What if someone tries to take it?", "It stays locked, the same way your phone does in somebody else's hand. Without the paired phone it will not run."],
    ["What comes with it?", "The bike, its charger, the wireless key and your steel owner card."],
    ["What is 10-Year Replacement?", "A second configuration of the bike rather than an add-on. A replacement term from us — not insurance. See terms."],
    ["When does it ship?", "Four to six weeks from order. Your key case arrives days before the bike does."],
    ["How is it delivered?", "To your door on a tail-lift vehicle, by our own team or a specialist vehicle carrier we appoint. Never a parcel courier."],
    ["What servicing does it need?", "No oil, no chain, no filters and no valve clearances. Tyres, brake pads and battery care only."],
  ] as ReadonlyArray<readonly [string, string]>,
} as const;

export const SECURITY = {
  kicker: "SECURITY",
  heading: "impossible to ride without you.",
  sub: "pairs with iPhone Find My app",
  image: "/media/xero-film-2.webp",
  locks: [
    {
      title: "Paired to one phone",
      body: "Your steel card claims the bike once, to you. From then on it wakes for your iPhone and refuses every other device.",
    },
    {
      title: "No key to copy",
      body: "There is no barrel, no blade and no fob to clone. There is nothing on the machine to pick, drill or hotwire.",
    },
    {
      title: "Dead without you",
      body: "The design puts the lock in the controller rather than in a barrel, so cutting the loom is not intended to defeat it. This describes the design intent of the system, not an independently tested security rating.",
    },
  ],
  findMy: {
    heading: "Designed to tell you where it is.",
    body: "Planned: the Chiron reports its position to the companion app, so a stolen bike is a tracked bike. The app is in development and is not available at launch — location reporting is a design goal, not a shipped feature.",
  },
  payoff: "Designed to be worthless to anyone but you.",
} as const;

export const FILMS = [
  { video: "/media/xero-film-1.mp4", poster: "/media/xero-film-1-poster.webp" },
  { video: "/media/xero-film-3.mp4", poster: "/media/xero-film-3-poster.webp" },
] as const;

export const VISUALS = {
  kicker: "THE CHIRON",
  heading: "Design visualisations.",
  /** Required label. These are renders and must never read as owner photos. */
  sub: "Renders and design visualisations. Not photographs of a customer machine.",
  shots: [
    "/media/xero-visual-1.webp",
    "/media/xero-visual-2.webp",
    "/media/xero-visual-3.webp",
    "/media/xero-visual-4.webp",
    "/media/xero-visual-5.webp",
    "/media/xero-visual-6.webp",
  ],
} as const;

export const UPDATES = {
  kicker: "ALWAYS IN THE LOOP",
  heading: "Updates and notifications at every step.",
  body: "From the moment your card is etched to the day your bike arrives. Build, quality check, dispatch and delivery updates land on your phone/email.",
} as const;

export const TRACK = {
  eyebrow: "BUILT, CHECKED, DELIVERED",
  heading: "Follow it to your door.",
  features: ["Free delivery within the US", "Delivered to your door", "Updates at every stage"],
  cta: "Track",
  hint: "Enter the client ID etched on your steel card.",
} as const;

export const FOOTER = {
  newsletterHeading: "ride to the stars",
  newsletterSub: "order — quality check — ship",
  ticker: "RIDE TO THE STARS",
  signOff: "Ride to the stars.",
  legal: [
    { label: "Refund policy", href: "/pages/refund-policy" },
    { label: "Shipping policy", href: "/pages/shipping-policy" },
    { label: "Terms of service", href: "/pages/terms-of-service" },
    { label: "Privacy policy", href: "/pages/privacy-policy" },
    { label: "Legal notice", href: "/pages/legal-notice" },
  ],
} as const;
