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

/* ===================================================================== */
/*  The sourcing record: facts, questions, drafts.                        */
/*                                                                        */
/*  Everything below exists to make one thing impossible: a number in the */
/*  shortlist that nobody actually said. Alex signs a five-figure cheque   */
/*  off this table, so a blank is worth more than a guess.                 */
/* ===================================================================== */

/** The questions, with ids, so an answer can be filed against the one asked. */
export const QUESTIONS = [
  {
    id: "chillTime",
    ask: "What is your MEASURED time for a 500 ml PET bottle, room temperature to 4°C, and what does it take to get there?",
    zh: "请问 500 毫升 PET 瓶装水从室温降到 4°C，你们实测需要多长时间？靠什么实现？",
    why: "This one decides the product. It is asked first and never softened.",
  },
  { id: "oem", ask: "Can you build to our own design and tooling (OEM/ODM), or only modify an existing model of yours?", zh: "你们能按我们的图纸开模生产（OEM/ODM）吗？还是只能在你们现有机型上改？" },
  { id: "price", ask: "Unit price at 500 / 1,000 / 3,000 / 5,000 units, EXW.", zh: "500 / 1,000 / 3,000 / 5,000 台的出厂单价分别是多少？" },
  { id: "moq", ask: "What is the minimum order quantity?", zh: "起订量是多少？" },
  { id: "sample", ask: "Sample cost and sample lead time?", zh: "样品费用和样品交期？" },
  { id: "tooling", ask: "Tooling / mould cost, and who owns the tooling afterwards?", zh: "开模费用多少？模具归谁所有？" },
  { id: "certs", ask: "Which certifications do you hold: CE, FCC, UL, RoHS, and UN38.3 for the battery?", zh: "你们有哪些认证：CE、FCC、UL、RoHS，电池的 UN38.3？" },
  { id: "cartridge", ask: "Is the cold cartridge something you make, or something we source separately?", zh: "冷媒/蓄冷盒是你们自己做，还是需要我们另外找供应商？" },
];

export const QUESTION_IDS = QUESTIONS.map((q) => q.id);
export const FIRST_QUESTION = QUESTIONS[0];
export const questionById = (id) => QUESTIONS.find((q) => q.id === id) ?? null;

/** The query shapes a search stage runs, English and Chinese. */
export function sourcingQueries(product = "bottle chiller") {
  const p = String(product || "bottle chiller").trim();
  return [
    { site: "alibaba", q: p },
    { site: "alibaba", q: `${p} OEM manufacturer` },
    { site: "alibaba", q: "rapid beverage chiller machine" },
    { site: "alibaba", q: "spinning can cooler appliance" },
    { site: "1688", q: "快速冷饮机" },
    { site: "1688", q: "瓶装水速冷机" },
    { site: "1688", q: "小家电 制冷 代工" },
  ];
}

/**
 * A fact, and where it came from.
 *
 * There is no way to build one without a source, and the record only accepts
 * these. That is the whole enforcement: not a convention, a constructor that
 * throws.
 */
export function fact(value, source) {
  const s = source && typeof source === "object" ? source : null;
  const kind = s?.kind;
  if (kind !== "message" && kind !== "page") {
    throw new Error("a fact needs a source: { kind: 'message'|'page', ref, quote }");
  }
  if (!s.ref || !String(s.ref).trim()) throw new Error("a fact's source needs a ref (message id or url)");
  const quote = String(s.quote ?? "").trim();
  if (!quote) throw new Error("a fact's source needs the words it came from");
  if (value === undefined || value === null || value === "") throw new Error("a fact needs a value");
  return {
    value,
    source: { kind, ref: String(s.ref), quote: quote.slice(0, 600), at: s.at ?? new Date().toISOString() },
  };
}

export const isFact = (f) =>
  Boolean(f && typeof f === "object" && "value" in f && f.source && (f.source.kind === "message" || f.source.kind === "page") && f.source.ref && f.source.quote);

/** A blank supplier record. Every fact slot starts empty and stays visibly empty. */
export function newSupplier({ name, site, url = null } = {}) {
  if (!name || !isDesk(site)) throw new Error("a supplier needs a name and a known site");
  const answers = {};
  for (const q of QUESTIONS) answers[q.id] = { asked: null, answered: false, note: null, fact: null, why: "not asked yet" };
  return {
    id: `${site}:${String(name).trim()}`,
    name: String(name).trim(),
    site,
    url: url ? String(url) : null,
    makes: null,        // fact: what they make, off their page
    oem: null,          // fact: true/false — do they claim OEM/ODM
    priceTiers: null,   // fact: { "500": n, ... }
    moq: null,          // fact
    sampleCost: null,   // fact
    sampleLeadDays: null, // fact
    chillTime: null,    // fact — only if MEASURED
    tooling: null,      // fact
    certs: null,        // fact: array of names they claimed
    answers,
    messages: [],       // every message either way, with timestamps
    shortlisted: false,
    shortlistBecause: [],
    threadOpen: false,
    at: new Date().toISOString(),
  };
}

const FACT_FIELDS = new Set(["makes", "oem", "priceTiers", "moq", "sampleCost", "sampleLeadDays", "chillTime", "tooling", "certs"]);

/**
 * Put a fact on a supplier. Refuses anything that is not a sourced fact, and
 * refuses a field the record does not have — a typo'd field is a lost number.
 */
export function record(supplier, field, value, source) {
  if (!FACT_FIELDS.has(field)) throw new Error(`not a fact field: ${field}`);
  const f = isFact(value) && source === undefined ? value : fact(value, source);
  supplier[field] = f;
  return f;
}

/** Every message, in order, with the time it happened. */
export function logMessage(supplier, { dir, text, at = new Date().toISOString(), ref = null, asks = [] }) {
  if (dir !== "out" && dir !== "in") throw new Error("a message goes 'out' or comes 'in'");
  const id = ref ?? `${supplier.id}#${supplier.messages.length + 1}`;
  const m = { id, dir, at, text: String(text ?? ""), asks: [...asks] };
  supplier.messages.push(m);
  return m;
}

/* -------------------------------------------------------- reading a reply */

const TIME_WORDS = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s\b|minutes?|mins?|m\b|hours?|hrs?)/i;
/** Words that mean somebody actually put a thermometer in a bottle. */
const MEASURED = /(measured|measurement|we tested|tested it|test report|lab|测试|实测|检测报告|data sheet|datasheet|test data|according to our test)/i;

/**
 * Did this reply answer the question, or did it just agree?
 *
 * "Yes, 30 seconds" is the failure case the whole desk exists to catch: a
 * number with nothing behind it. For the chill-time question a reply counts
 * only when it carries both a time and evidence somebody measured it. For the
 * rest, a number or a plain statement is enough — but silence on a question
 * is silence, and never gets rounded up to an answer.
 */
export function judge(questionId, text = "") {
  const t = String(text);
  const has = (re) => re.test(t);
  if (questionId === "chillTime") {
    const time = TIME_WORDS.exec(t);
    if (!time) return { answered: false, why: "no time given at all" };
    if (!MEASURED.test(t)) {
      return {
        answered: false,
        why: `claimed ${time[0]} with no measurement behind it`,
        claimed: time[0],
      };
    }
    return { answered: true, why: `measured: ${time[0]}`, claimed: time[0] };
  }
  if (questionId === "oem") {
    if (has(/\b(oem|odm|custom(?:ized|ise|ize)?|your design|开模|定制|代工)\b/i)) return { answered: true, why: "spoke to custom build" };
    return { answered: false, why: "did not say whether they can build to our design" };
  }
  if (questionId === "price") {
    if (has(/(?:US\s*\$|\$|¥|￥|USD)\s*[\d.,]+/)) return { answered: true, why: "gave a price" };
    return { answered: false, why: "no price given" };
  }
  if (questionId === "moq") {
    if (has(/(?:MOQ|minimum order|min\.?\s*order|起订)\D{0,12}[\d,]+/i)) return { answered: true, why: "gave an MOQ" };
    return { answered: false, why: "no MOQ given" };
  }
  if (questionId === "sample") {
    if (has(/sample|样品/i) && has(/(?:US\s*\$|\$|¥|￥)\s*[\d.,]+|\d+\s*days|\d+\s*天/i)) return { answered: true, why: "gave a sample cost or lead time" };
    return { answered: false, why: "nothing on the sample" };
  }
  if (questionId === "tooling") {
    if (has(/(tooling|mould|mold|开模|模具)/i) && has(/(?:US\s*\$|\$|¥|￥)\s*[\d.,]+|free|免费/i)) return { answered: true, why: "gave a tooling cost" };
    return { answered: false, why: "no tooling cost" };
  }
  if (questionId === "certs") {
    const found = ["CE", "FCC", "UL", "RoHS", "UN38.3"].filter((c) => new RegExp(c.replace(".", "\\."), "i").test(t));
    if (found.length) return { answered: true, why: `named ${found.join(", ")}`, certs: found };
    return { answered: false, why: "named no certification" };
  }
  if (questionId === "cartridge") {
    if (has(/(cartridge|cold pack|phase change|brine|蓄冷|冷媒|相变)/i)) return { answered: true, why: "spoke to the cartridge" };
    return { answered: false, why: "nothing on the cold cartridge" };
  }
  return { answered: false, why: "unknown question" };
}

/**
 * File a whole reply against the questions that were put to this supplier.
 * Only what was actually addressed moves; everything else stays unanswered,
 * with the reason showing.
 */
export function readReply(supplier, { text, at = new Date().toISOString(), ref = null } = {}) {
  const m = logMessage(supplier, { dir: "in", text, at, ref });
  const source = { kind: "message", ref: m.id, quote: String(text ?? "").slice(0, 600), at };
  const moved = [];
  for (const q of QUESTIONS) {
    const slot = supplier.answers[q.id];
    if (!slot.asked) continue;          // never asked, so nothing to file
    if (slot.answered) continue;        // already answered, keep the first
    const v = judge(q.id, text);
    slot.note = { at, ref: m.id, why: v.why, claimed: v.claimed ?? null, quote: source.quote };
    slot.why = v.why;
    if (!v.answered) continue;
    slot.answered = true;
    slot.at = at;
    moved.push(q.id);
    const num = (re) => { const x = re.exec(String(text)); return x ? Number(String(x[1]).replace(/,/g, "")) : null; };
    if (q.id === "chillTime") record(supplier, "chillTime", v.claimed, source);
    if (q.id === "oem") record(supplier, "oem", true, source);
    if (q.id === "moq") { const n = num(/(?:MOQ|minimum order|min\.?\s*order|起订)\D{0,12}([\d,]+)/i); if (n) record(supplier, "moq", n, source); }
    if (q.id === "price") { const tiers = priceTiersIn(text); if (tiers) record(supplier, "priceTiers", tiers, source); }
    if (q.id === "sample") {
      const c = num(/sample\D{0,40}(?:US\s*\$|\$|¥|￥)\s*([\d.,]+)/i); if (c) record(supplier, "sampleCost", c, source);
      const d = num(/(\d{1,3})\s*(?:working\s*)?(?:days|天)/i); if (d) record(supplier, "sampleLeadDays", d, source);
    }
    if (q.id === "tooling") { const c = num(/(?:tooling|mould|mold|开模|模具)\D{0,30}(?:US\s*\$|\$|¥|￥)\s*([\d.,]+)/i); record(supplier, "tooling", c ?? "quoted, see message", source); }
    if (q.id === "certs") record(supplier, "certs", v.certs, source);
  }
  return { message: m, moved, unanswered: unanswered(supplier) };
}

/** "500pcs $58, 1000pcs $52" → { "500": 58, "1000": 52 }. Nothing invented. */
export function priceTiersIn(text = "") {
  const out = {};
  const re = /([\d,]{3,6})\s*(?:pcs|pieces|units|台|个)?\s*[:：\-–—]?\s*(?:US\s*\$|\$|¥|￥|USD\s*)\s*([\d.,]+)/gi;
  let m;
  while ((m = re.exec(String(text)))) {
    const qty = Number(m[1].replace(/,/g, ""));
    const price = Number(m[2].replace(/,/g, ""));
    if (Number.isFinite(qty) && Number.isFinite(price) && qty >= 100) out[String(qty)] = price;
  }
  return Object.keys(out).length ? out : null;
}

/** The questions this supplier has been asked and has still not answered. */
export const unanswered = (supplier) =>
  QUESTION_IDS.filter((id) => supplier.answers[id]?.asked && !supplier.answers[id]?.answered);

export const neverAsked = (supplier) =>
  QUESTION_IDS.filter((id) => !supplier.answers[id]?.asked);

/**
 * A listing, turned into a shortlist decision on what the page showed.
 * Reasons are quotes off the page; a listing with nothing readable on it does
 * not get shortlisted on optimism.
 */
export function shortlistCase(listing = {}) {
  const text = `${listing.title ?? ""} ${listing.blurb ?? ""} ${listing.tags ?? ""}`;
  const because = [];
  if (/\b(oem|odm|customiz|custom made|开模|定制|代工)\b/i.test(text)) because.push("page says OEM/ODM");
  if (/\b(chill|cool|冷|制冷|refrigerat)/i.test(text)) because.push("page is about chilling");
  if (/\b(manufacturer|factory|工厂|生产厂家)\b/i.test(text)) because.push("page says manufacturer, not trader");
  if (Number(listing.years) >= 3) because.push(`${listing.years} years on the site`);
  if (/\b(aluminium|aluminum|铝)\b/i.test(text)) because.push("works in aluminium");
  return { keep: because.length >= 2, because };
}

/* ===================================================================== */
/*  The outbox: drafted here, approved by Alex, and only then sent.       */
/* ===================================================================== */

/**
 * Nothing leaves this app that he has not read.
 *
 * The rule is not a habit, it is the shape of the object: the text of a draft
 * can be *shown* to him freely, but the only function that hands it over for
 * typing is `release`, and `release` throws on anything that is not approved.
 * A caller that skips it has no message to send — there is no other way to
 * get a sendable payload out of here, and every release is stamped so a
 * second send of the same draft fails too.
 */
export class Outbox {
  #items = new Map();   // id -> item
  #seq = 0;

  constructor(saved = null) {
    for (const it of saved?.items ?? []) {
      this.#items.set(it.id, { ...it });
      const n = Number(String(it.id).split("-")[1]);
      if (Number.isFinite(n)) this.#seq = Math.max(this.#seq, n);
    }
  }

  /** The brain drafts. Status is pending and nothing else can be passed in. */
  draft({ supplierId, site, name = null, text, asks = [], kind = "ask" }) {
    if (!supplierId) throw new Error("a draft needs a supplier");
    const body = String(text ?? "").trim();
    if (!body) throw new Error("a draft needs words");
    const id = `d-${++this.#seq}`;
    const item = {
      id, supplierId, site: site ?? null, name, kind,
      text: body, asks: [...asks],
      status: "pending", draftedAt: new Date().toISOString(),
      approvedAt: null, rejectedAt: null, sentAt: null, why: null, by: null,
    };
    this.#items.set(id, item);
    return { ...item };
  }

  get(id) { const it = this.#items.get(id); return it ? { ...it } : null; }
  all() { return [...this.#items.values()].map((it) => ({ ...it })); }
  pending() { return this.all().filter((it) => it.status === "pending"); }
  approved() { return this.all().filter((it) => it.status === "approved"); }
  forSupplier(supplierId) { return this.all().filter((it) => it.supplierId === supplierId); }

  approve(id, by = "alex") {
    const it = this.#items.get(id);
    if (!it) throw new Error(`no such draft: ${id}`);
    if (it.status !== "pending") throw new Error(`draft ${id} is ${it.status}, not pending`);
    it.status = "approved"; it.approvedAt = new Date().toISOString(); it.by = by;
    return { ...it };
  }

  reject(id, why = "", by = "alex") {
    const it = this.#items.get(id);
    if (!it) throw new Error(`no such draft: ${id}`);
    if (it.status === "sent") throw new Error(`draft ${id} has already gone out`);
    it.status = "rejected"; it.rejectedAt = new Date().toISOString(); it.why = String(why || ""); it.by = by;
    return { ...it };
  }

  /**
   * The only door out. Approved, unsent, or it throws — and the throw is the
   * point: an unapproved draft has no text to give anybody.
   */
  release(id) {
    const it = this.#items.get(id);
    if (!it) throw new Error(`no such draft: ${id}`);
    if (it.status !== "approved") throw new Error(`draft ${id} is ${it.status} — Alex has not approved this text`);
    it.status = "sending";
    return { id: it.id, supplierId: it.supplierId, site: it.site, name: it.name, text: it.text, asks: [...it.asks] };
  }

  /** It went. Or it did not, and it goes back to approved for another try. */
  landed(id, ok = true, why = "") {
    const it = this.#items.get(id);
    if (!it) throw new Error(`no such draft: ${id}`);
    if (ok) { it.status = "sent"; it.sentAt = new Date().toISOString(); }
    else { it.status = "approved"; it.why = String(why || "the phone did not send it"); }
    return { ...it };
  }

  toJSON() { return { items: this.all() }; }
}

/**
 * Send one approved draft, through the phone, and only through here.
 *
 * `typeAndSend` gets the released payload; it never sees a draft object, so
 * it cannot be handed a pending one by mistake.
 */
export async function sendApproved(outbox, id, typeAndSend) {
  const payload = outbox.release(id);          // throws unless approved
  try {
    const out = await typeAndSend(payload);
    if (out?.ok === false) { outbox.landed(id, false, out.error ?? ""); return { ok: false, error: out.error ?? "not sent" }; }
    outbox.landed(id, true);
    return { ok: true, payload };
  } catch (e) {
    outbox.landed(id, false, e?.message ?? String(e));
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/* --------------------------------------------------------- the words sent */

/** The opening message: the question that decides the product goes first. */
export function openingDraft(supplier, { product = "a portable countertop bottle chiller", asks = QUESTION_IDS.slice(0, 5) } = {}) {
  const zh = supplier.site === "1688";
  const qs = asks.map((id) => questionById(id)).filter(Boolean);
  const first = qs[0]?.id === FIRST_QUESTION.id ? qs : [FIRST_QUESTION, ...qs.filter((q) => q.id !== FIRST_QUESTION.id)];
  const lines = first.map((q, i) => `${i + 1}. ${zh ? (q.zh ?? q.ask) : q.ask}`);
  const head = zh
    ? `您好，我们在开发一款${product === "a portable countertop bottle chiller" ? "桌面便携式瓶装水速冷机" : product}，正在找代工厂。有几个问题：`
    : `Hello — we are developing ${product} and are looking for a manufacturing partner. A few questions:`;
  const tail = zh ? "谢谢！" : "Thank you.";
  return { text: [head, "", ...lines, "", tail].join("\n"), asks: first.map((q) => q.id) };
}

/** The nudge: only the questions still open, named, so nothing is re-asked. */
export function followUpDraft(supplier) {
  const open = unanswered(supplier);
  if (!open.length) return null;
  const zh = supplier.site === "1688";
  const qs = open.map((id) => questionById(id)).filter(Boolean);
  const head = zh ? "您好，再确认几个还没回复的问题：" : "Hello again — a few questions from before that are still open:";
  const lines = qs.map((q, i) => `${i + 1}. ${zh ? (q.zh ?? q.ask) : q.ask}`);
  const note = open.includes("chillTime")
    ? (zh ? "特别是实测的降温时间（500 毫升 PET 瓶，室温到 4°C），我们需要实测数据，不是估计。" : "In particular the MEASURED chill time for a 500 ml PET bottle, room temperature to 4°C — we need measured data, not an estimate.")
    : null;
  return { text: [head, "", ...lines, ...(note ? ["", note] : [])].join("\n"), asks: open };
}
