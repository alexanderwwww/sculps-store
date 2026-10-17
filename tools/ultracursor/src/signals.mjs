/*
 * Buying signals in comment text.
 *
 * A comment that says "where can I buy this" or "link??" or "just ordered
 * mine" is somebody holding money. This finds those and says which kind:
 *
 *   where   asking where to get it        ("where can i buy", "link?", "name of this")
 *   price   asking what it costs          ("how much", "price?")
 *   bought  says they bought it           ("just ordered", "bought 2", "got mine")
 *   want    says they want it             ("i need this", "take my money", "adding to cart")
 *   gift    wants it for someone          ("getting this for my mom")
 *
 * Plain patterns, no model: the counts must be the same every time the same
 * comments are read, so Claude can compare one product with another.
 * A comment is one signal at most (its strongest kind).
 */

const RULES = [
  ["bought", /\b(just\s+)?(ordered|bought|purchased|got)\s+(mine|one|it|two|2|3|this|these)\b|\b(i|we)\s+(ordered|bought)\b|\bmine\s+(came|arrived|just came)\b/i],
  ["where", /\bwhere\s+(can|do|did|to|could)\s+(i|you|u|we)\s+(buy|get|find|order)\b|\bwhere('?s| is)?\s+(it|this)\s+from\b|\blink\s*\??\s*(pls|please|plz)?\s*\??$|\bdrop\s+(the\s+)?link\b|\bneed\s+(the\s+)?link\b|\b(what('?s| is)\s+the\s+)?name\s+of\s+(this|the|it)\b|\bwhere\s+(to\s+)?buy\b|\bis\s+it\s+on\s+(amazon|tiktok\s*shop)\b/i],
  ["price", /\bhow\s+much\b|\bprice\s*\?|\bwhat('?s| is)\s+the\s+price\b|\bhow\s+expensive\b|\bcost\s*\?/i],
  ["gift", /\b(for|get(ting)?|buy(ing)?)\s+(this\s+)?(for\s+)?(my\s+)?(mom|mum|dad|wife|husband|girlfriend|boyfriend|sister|brother|daughter|son|kids?|friend|bestie|grandma|grandpa)\b.*\b(gift|christmas|xmas|birthday|stocking)|\b(christmas|xmas|birthday|stocking)\s+(gift|present|stuffer)\b|\bperfect\s+gift\b/i],
  ["want", /\bi\s+(need|want)\s+(this|one|it|these)\b|\btake\s+my\s+money\b|\badd(ing|ed)?\s+(it\s+)?to\s+(my\s+)?cart\b|\bneed\s+(this|one)\s+(asap|now)\b|\bwant\s+one\b/i],
];

/** The kind of buying signal in one comment, or null. */
export function kindOf(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length < 3) return null;
  for (const [kind, re] of RULES) if (re.test(s)) return kind;
  return null;
}

/** [{text, kind}] for every comment that carries a signal (text trimmed to 200 chars). */
export function find(comments) {
  const out = [];
  for (const c of comments || []) {
    const kind = kindOf(c);
    if (kind) out.push({ text: String(c).replace(/\s+/g, " ").trim().slice(0, 200), kind });
  }
  return out;
}

/** {where, price, bought, want, gift} counts. */
export function tally(signals) {
  const t = { where: 0, price: 0, bought: 0, want: 0, gift: 0 };
  for (const s of signals || []) if (s && t[s.kind] !== undefined) t[s.kind]++;
  return t;
}
