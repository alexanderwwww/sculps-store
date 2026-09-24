/**
 * The desk's rules, on their own: a fact needs a source, an unapproved draft
 * cannot be sent, and a reply that agrees without measuring has answered
 * nothing. These are the three things a five-figure order rests on.
 */
import {
  fact, isFact, record, newSupplier, readReply, judge, unanswered,
  Outbox, sendApproved, openingDraft, followUpDraft, shortlistCase, priceTiersIn,
} from "../worker/desk.mjs";
import { sourcingTable } from "../worker/report.mjs";
import { check, failures } from "./lib.mjs";

const threw = (fn) => { try { fn(); return false; } catch { return true; } };

/* ---- a fact carries where it came from, or it is not a fact ---- */
check("a fact with no source is refused", threw(() => fact(1200, undefined)));
check("a fact with a source but no quote is refused", threw(() => fact(1200, { kind: "message", ref: "d-1" })));
check("a fact from nowhere-in-particular is refused", threw(() => fact(1200, { kind: "vibes", ref: "x", quote: "y" })));
const f = fact(1200, { kind: "page", ref: "https://alibaba.com/x", quote: "MOQ 1200 pieces" });
check("a sourced fact keeps its quote and ref", isFact(f) && f.source.quote.includes("1200"));

const s = newSupplier({ name: "Ningbo Culi Electronics", site: "alibaba", url: "https://alibaba.com/culi" });
check("a new supplier has every fact blank", [s.moq, s.priceTiers, s.chillTime, s.certs].every((x) => x === null));
check("every question starts not asked", Object.values(s.answers).every((a) => !a.asked && !a.answered));
check("an unsourced number cannot enter the record", threw(() => record(s, "moq", 1000, null)));
check("a made-up field cannot enter the record", threw(() => record(s, "profitMargin", 3, { kind: "page", ref: "u", quote: "q" })));
record(s, "moq", 1000, { kind: "page", ref: "https://alibaba.com/culi", quote: "MOQ: 1000 sets" });
check("a sourced number does enter, with its page", s.moq.value === 1000 && s.moq.source.kind === "page");

/* ---- "yes, 30 seconds" is not an answer ---- */
check("a bare yes answers nothing", judge("chillTime", "Yes, no problem.").answered === false);
const bluff = judge("chillTime", "yes 30 seconds no problem!");
check("a number with no measurement answers nothing", bluff.answered === false, bluff.why);
check("and the claim it made is kept, so the table can show it", bluff.claimed === "30 seconds");
check("a measured number does answer", judge("chillTime", "We tested it: 500ml PET bottle 22C to 4C in 150 seconds in our lab.").answered === true);

for (const id of ["chillTime", "oem", "price", "moq", "sample"]) s.answers[id].asked = new Date().toISOString();
const filed = readReply(s, { text: "Yes! 30 seconds, very fast. Please tell us your quantity.", ref: "m1" });
check("a reply that answers nothing moves nothing", filed.moved.length === 0, filed.moved.join(","));
check("and it is still recorded as a message", s.messages.some((m) => m.dir === "in" && m.id === "m1"));
check("the chill time stays blank in the record", s.chillTime === null);
check("with the reason visible", /no measurement/.test(s.answers.chillTime.note.why));
check("the unanswered list still holds all five", unanswered(s).length === 5, unanswered(s).join(","));

const real = readReply(s, {
  text: "We measured it in our lab: 500ml PET 22C to 4C in 165 seconds. We can do OEM to your drawings. MOQ 500 pcs. 500pcs: $62, 1000pcs: $55, 3000pcs: $49. Sample cost $180, sample lead time 25 days.",
  ref: "m2",
});
check("a real reply files what it actually said", real.moved.includes("chillTime") && real.moved.includes("moq") && real.moved.includes("price"));
check("the chill time now has a measured value and its message", s.chillTime.value === "165 seconds" && s.chillTime.source.ref === "m2");
check("price tiers came off the words, not a guess", s.priceTiers.value["1000"] === 55 && s.priceTiers.value["3000"] === 49);
check("the sample cost and lead time both landed", s.sampleCost.value === 180 && s.sampleLeadDays.value === 25);
check("what was never asked is still never asked", s.answers.certs.asked === null && s.certs === null);
check("price tiers read nothing out of an empty line", priceTiersIn("we will send a quotation") === null);

/* ---- nothing goes out unapproved ---- */
const out = new Outbox();
const d = out.draft({ supplierId: s.id, site: "alibaba", name: s.name, text: openingDraft(s).text, asks: ["chillTime"] });
check("a draft starts pending", d.status === "pending");
check("the opening asks the measured chill time first", /MEASURED time for a 500 ml PET bottle/.test(d.text));
check("a pending draft cannot be released", threw(() => out.release(d.id)));
let typed = [];
const send = async (p) => { typed.push(p.text); return { ok: true }; };
const refused = await sendApproved(out, d.id, send).then(() => "sent", (e) => e.message);
check("sending a pending draft throws rather than sending", refused !== "sent" && typed.length === 0, String(refused).slice(0, 60));
check("a rejected draft cannot be sent either", (() => {
  const r = out.draft({ supplierId: s.id, site: "alibaba", name: s.name, text: "hi" });
  out.reject(r.id, "too keen");
  return threw(() => out.release(r.id));
})());
out.approve(d.id);
const went = await sendApproved(out, d.id, send);
check("an approved draft does go, once", went.ok && typed.length === 1);
check("and cannot be sent a second time", threw(() => out.release(d.id)));
check("approving something twice is refused", threw(() => out.approve(d.id)));

/* ---- it survives being written down and read back ---- */
const back = new Outbox(JSON.parse(JSON.stringify(out.toJSON())));
check("statuses survive a round trip to disk", back.get(d.id).status === "sent");
check("and a fresh draft does not reuse an id", back.draft({ supplierId: s.id, text: "x" }).id !== d.id);
check("a restored pending draft is still unsendable", (() => {
  const o = new Outbox();
  const p = o.draft({ supplierId: s.id, text: "please quote" });
  const o2 = new Outbox(JSON.parse(JSON.stringify(o.toJSON())));
  return threw(() => o2.release(p.id));
})());

/* ---- the follow-up only re-asks what is open ---- */
check("nothing to follow up when everything asked was answered", followUpDraft(s) === null);

/* ---- the table never softens the difference ---- */
const bluffer = newSupplier({ name: "Da Pan Electric", site: "1688" });
bluffer.answers.chillTime.asked = new Date().toISOString();
readReply(bluffer, { text: "yes 30 seconds ok", ref: "b1" });
bluffer.answers.moq.asked = new Date().toISOString();
const fu = followUpDraft(bluffer);
check("the follow-up names only the open questions", Boolean(fu) && fu.asks.join(",") === unanswered(bluffer).join(","), fu?.asks.join(","));
check("and it presses on the measurement in the factory's own language", /实测/.test(fu.text));
const table = sourcingTable([s, bluffer]);
const rows = Object.fromEntries(table.rows.map((r) => [r.name, r]));
check("the measured factory reads measured", rows["Ningbo Culi Electronics"].chillTime.state === "measured");
check("the bluffing factory reads claimed, not measured", rows["Da Pan Electric"].chillTime.state === "claimed, not measured");
check("the headline counts only measured answers", /1 of 2 factories/.test(table.headline), table.headline);
check("a blank cell says unknown rather than a number", rows["Da Pan Electric"].moq.unknown === true);

/* ---- the shortlist is made of what the page said ---- */
check("a listing with nothing on it is not shortlisted", shortlistCase({ title: "cup" }).keep === false);
check("a listing that says OEM factory is", shortlistCase({ title: "OEM rapid drink chiller", blurb: "manufacturer, 8 years" }).keep === true);

console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
