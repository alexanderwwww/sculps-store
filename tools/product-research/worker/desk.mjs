/**
 * The supplier desk: his own Alibaba and 1688, in the same window.
 *
 * There is no API behind either of them. 1688 — the Chinese domestic side,
 * where the real prices are — has none at all, and Alibaba's is for sellers.
 * A browser he is signed into is not a workaround, it is the only door.
 *
 * His personal WhatsApp is deliberately not here. Driving it from a linked
 * device is against WhatsApp's terms and the penalty falls on the number, not
 * on the app — the number his family, his bank and his suppliers all use. The
 * sourcing happens where the suppliers already are.
 *
 * So: one saved session per site, signed in by him, and everything after that
 * happens where he can watch it. Three rules hold this together.
 *
 *   Nothing is sent that he has not seen. A message is drafted, shown, and
 *   sent on his word — these go to real factories, under his name.
 *
 *   Nothing is typed instantly. Keystrokes come from the same pacing every
 *   other part of this app uses. A composer that fills in one frame is the
 *   loudest automation signal there is, and this is his account, not a burner.
 *
 *   Nothing is guessed. A thread is opened by the exact name the list shows,
 *   and a price is whatever the row printed. No fuzzy matching on a
 *   conversation that is about to receive a message.
 */

export const DESKS = {
  alibaba: {
    id: "alibaba",
    label: "Alibaba",
    url: "https://www.alibaba.com/",
    messages: "https://message.alibaba.com/message/messenger.htm",
    signIn: "Sign in with your Alibaba account.",
  },
  "1688": {
    id: "1688",
    label: "1688",
    url: "https://www.1688.com/",
    messages: "https://work.1688.com/",
    signIn: "Sign in with your 1688 account — the Alibaba account usually works.",
  },
};

export const isDesk = (id) => Object.hasOwn(DESKS, String(id));

/** Where a search for a product goes, per site. */
export function searchUrl(site, query) {
  const q = encodeURIComponent(String(query));
  if (site === "1688") return `https://s.1688.com/selloffer/offer_search.htm?keywords=${q}`;
  return `https://www.alibaba.com/trade/search?SearchText=${q}`;
}

/**
 * What a sourcing conversation has to establish, in the order that matters.
 *
 * The first one can kill the product, so it is asked first and its answer is
 * never softened in the report: a factory that says "yes, 30 seconds" without
 * a measurement behind it has told us nothing at all.
 */
export const ASKS = [
  "measured time for a 500 ml PET bottle, room temperature to 4°C, and what it takes",
  "whether they can build to our design or only modify one of their own",
  "unit price at 500 / 1,000 / 3,000 / 5,000 units",
  "minimum order quantity",
  "sample cost and lead time",
  "tooling cost, and who owns the tooling afterwards",
  "certifications held: CE, FCC, UL, RoHS, and UN38.3 for the battery",
  "whether the cold cartridge is something they make or something we source",
];

/**
 * A finding the desk pulled out of a reply.
 *
 * Deliberately narrow: a number a factory wrote, the message it came from,
 * and nothing inferred. What a supplier did not say stays unknown, because an
 * assumed MOQ or an assumed price is the kind of thing that ends up in a
 * spreadsheet and then in a decision.
 */
export function noteFrom(message = "", { who = null, site = null } = {}) {
  const text = String(message);
  const found = {};
  const price = /(?:US\s*\$|\$|¥|￥)\s*([\d.,]+)/.exec(text);
  const moq = /(?:MOQ|minimum order|min\.?\s*order)\D{0,12}([\d,]+)/i.exec(text);
  const sample = /sample\D{0,40}(?:US\s*\$|\$|¥|￥)\s*([\d.,]+)/i.exec(text);
  const days = /(\d{1,3})\s*(?:working\s*)?days/i.exec(text);
  const num = (v) => Number(String(v).replace(/,/g, ""));
  if (price) found.price = num(price[1]);
  if (moq) found.moq = num(moq[1]);
  if (sample) found.sampleCost = num(sample[1]);
  if (days) found.leadDays = num(days[1]);
  return { who, site, at: new Date().toISOString(), said: text.slice(0, 2000), found };
}
