/*
 * The agent core, piece by piece, without a browser or the API:
 * guard (what waits for Alex), snapshot compaction, profiles, limits, config,
 * the request builder and the cost meter, tool input validation, and the rule
 * that the core never names a site.
 *
 *   node test/agent-unit.test.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clickKind, enterIsFinal, navigateKind, secretField, priceField } from "../src/agent/guard.mjs";
import { compact, findLines, refsIn, parseLine } from "../src/agent/snapshot.mjs";
import { loadProfiles, render } from "../src/agent/profiles.mjs";
import { createLimits } from "../src/agent/limits.mjs";
import { loadConfig, saveKey, DEFAULTS } from "../src/agent/config.mjs";
import { buildParams, costOf, BETAS, SYSTEM, DEFAULT_MODEL } from "../src/agent/brain.mjs";
import { TOOLS, validate, format } from "../src/agent/tools.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../src");
let failed = 0, passed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const yes = (name, cond, detail) => eq(name, Boolean(cond), true) || (detail && !cond && console.log("      ", detail));

/* ------------------------------------------------------------------ guard */
const P = { finalWords: ["Bump"], priceWords: ["asking"] };
const kinds = [
  ["Post listing", "publish"], ["Publish", "publish"], ["List item", "publish"],
  ["Send", "send"], ["Send message", "send"],
  ["Buy now", "buy"], ["Checkout", "buy"], ["Place order", "buy"], ["Pay now", "buy"],
  ["Delete listing", "delete"], ["Delete", "delete"], ["Remove", "delete"],
  ["Save changes", "save"], ["Save draft", "save"], ["Update price", "save"], ["Confirm", "save"],
  ["Accept offer", "offer"], ["Decline", "offer"], ["Mark as sold", "offer"],
  ["Submit", "submit"], ["Bump", "other"],
  ["Sell", null], ["Messages", null], ["Add photos", null], ["Search", null], ["Cancel", null],
  ["Edit listing", null], ["Remove photo", null], ["Done", null], ["Apply filters", null],
];
for (const [name, want] of kinds) eq(`click "${name}" -> ${want}`, clickKind({ name, role: "button" }, "none", P), want);
eq("a cookie banner's Accept is not final", clickKind({ name: "Accept", inConsent: true }, "none", P), null);
eq("an offer's Accept still is", clickKind({ name: "Accept", inConsent: false }, "none", P), "offer");
eq("a cookie banner never hides a declared final", clickKind({ name: "Accept", inConsent: true }, "buy", P), null);
eq("declared final on an ordinary name counts", clickKind({ name: "Next" }, "publish", P), "publish");
eq("unknown declared kind becomes other", clickKind({ name: "Next" }, "weird", P), "other");
eq("Enter in a search box is not final", enterIsFinal({ role: "searchbox", name: "Search" }), false);
eq("Enter in an input named search is not final", enterIsFinal({ role: "textbox", name: "Search items" }), false);
eq("Enter in a chat box is final", enterIsFinal({ role: "textbox", name: "Write a message", multiline: true }), true);
eq("Enter with nothing focused is final", enterIsFinal(null), true);
eq("navigate to checkout is final", navigateKind("https://shop.example/checkout/123"), "buy");
eq("navigate to a delete URL is final", navigateKind("https://shop.example/item/9/delete"), "delete");
eq("navigate to an item is not", navigateKind("https://shop.example/item/9/"), null);
eq("password field refused", !!secretField({ type: "password" }), true);
eq("one-time code refused", !!secretField({ autocomplete: "one-time-code" }), true);
eq("card number by name refused", !!secretField({ name: "Card number" }), true);
eq("cvv by field name refused", !!secretField({ fieldName: "cvv" }), true);
eq("description is fine", secretField({ name: "Description", tag: "textarea" }), null);
eq("price field", priceField("Price", P), true);
eq("profile price word", priceField("Your asking amount", P), true);
eq("size is not price", priceField("Size", P), false);

/* ------------------------------------------------------------------ snapshot */
const Y = [
  "- generic [ref=e1]:",
  "  - banner [ref=e2]:",
  '    - link "Sell" [ref=e3] [cursor=pointer]:',
  "      - /url: /sell/",
  '  - textbox "Price" [ref=e12]: "10"',
  '  - button "Post listing" [ref=e17]',
  '  - iframe [ref=e18]:',
  '    - button "Inside frame" [ref=f1e2]',
  '  - button "Say \\"hi\\"" [ref=e19]',
].join("\n");
eq("parseLine role/name/ref", (({ role, name, ref }) => ({ role, name, ref }))(parseLine('  - button "Post listing" [ref=e17]')), { role: "button", name: "Post listing", ref: "e17" });
eq("parseLine escaped quotes", parseLine(Y.split("\n")[8]).name, 'Say "hi"');
const refs = refsIn(Y);
eq("refsIn finds frame refs", refs.get("f1e2"), { role: "button", name: "Inside frame" });
eq("refsIn count", refs.size, 8);
eq("small snapshot unchanged", compact(Y, 9000).text, Y);
const big = Array.from({ length: 3000 }, (_, i) => i % 10 === 0 ? `  - button "Item ${i}" [ref=e${i}]` : i % 3 === 0 ? `  - generic [ref=e${i}]:` : `  - text: some words number ${i} that go on for a while`).join("\n");
const c = compact(big, 9000);
yes("big snapshot fits the cap", c.text.length <= 9200, c.text.length);
yes("compaction keeps every button it can", (c.text.match(/- button/g) || []).length >= 200, (c.text.match(/- button/g) || []).length);
yes("compaction says what it hid", /more lines not shown/.test(c.text));
eq("findLines", findLines(Y, "post", 5), ['- button "Post listing" [ref=e17]']);

/* ------------------------------------------------------------------ profiles */
const prof = loadProfiles(path.join(SRC, "profiles"));
eq("depop.json matches www.depop.com", prof.forUrl("https://www.depop.com/products/create/").name, "depop");
eq("depop.json matches depop.com", prof.forUrl("https://depop.com/").name, "depop");
eq("not fooled by a lookalike host", prof.forUrl("https://notdepop.com/").name, "default");
eq("not fooled by a path", prof.forUrl("https://evil.example/depop.com").name, "default");
eq("unknown site gets the default", prof.forUrl("https://example.org/").name, "default");
const dp = prof.forUrl("https://www.depop.com/");
eq("profile keeps its own limits", dp.limits.finalPerHour, 10);
eq("profile inherits default fields it does not set", Array.isArray(dp.priceWords), true);
eq("brand and signature from the profile", [dp.brand, dp.signature], ["Chrome God", "Alexander"]);
yes("render carries the voice and the signature", /Sign messages to people as: Alexander/.test(render(dp)) && /Shop \/ brand name: Chrome God/.test(render(dp)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uc-unit-"));
fs.writeFileSync(path.join(tmp, "_default.json"), JSON.stringify({ limits: { stepsPerTask: 5 } }));
fs.writeFileSync(path.join(tmp, "shop.json"), JSON.stringify({ match: ["shop.example"], pacing: { minMs: 1 } }));
fs.writeFileSync(path.join(tmp, "broken.json"), "{ not json");
const logged = [];
const p2 = loadProfiles(tmp, (l) => logged.push(l));
eq("a new site is one JSON file", p2.forUrl("https://www.shop.example/x").name, "shop");
eq("deep merge keeps defaults beside overrides", [p2.forUrl("https://shop.example/").pacing.minMs, p2.forUrl("https://shop.example/").pacing.maxMs, p2.forUrl("https://shop.example/").limits.stepsPerTask], [1, 2600, 5]);
yes("a broken profile is reported, not fatal", logged.some((l) => /broken.json/.test(l)));

/* ------------------------------------------------------------------ limits */
let now = 1_000_000_000;
const lim = createLimits(path.join(tmp, "limits.json"), () => now);
const lp = { name: "shop", limits: { tasksPerHour: 2, finalPerHour: 2, finalPerDay: 3 } };
eq("task 1 allowed", lim.startTask(lp), null);
eq("task 2 allowed", lim.startTask(lp), null);
yes("task 3 in the same hour refused", /2 tasks an hour/.test(lim.startTask(lp) || ""));
lim.countFinal(lp); lim.countFinal(lp);
yes("third final in an hour refused", /2 final actions an hour/.test(lim.finalAllowed(lp) || ""));
now += 3600_001;
eq("an hour later it is allowed", lim.finalAllowed(lp), null);
lim.countFinal(lp);
yes("the day limit holds", /3 final actions a day/.test(lim.finalAllowed(lp) || ""));
const lim2 = createLimits(path.join(tmp, "limits.json"), () => now);
yes("counters survive a restart", /a day/.test(lim2.finalAllowed(lp) || ""));

/* ------------------------------------------------------------------ config */
const cfgFile = path.join(tmp, "app", "config.json");
eq("no file: defaults, no key", loadConfig(cfgFile), DEFAULTS);
yes("an empty key is refused", saveKey(cfgFile, "  "));
yes("a non-Claude key is refused", /sk-ant-/.test(saveKey(cfgFile, "sk-proj-abcdefghijklmnopqrstuvwxyz") || ""));
eq("a Claude key is saved", saveKey(cfgFile, "  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  "), null);
eq("and read back trimmed", loadConfig(cfgFile).anthropicApiKey, "sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
eq("file mode 600", (fs.statSync(cfgFile).mode & 0o777).toString(8), "600");
fs.writeFileSync(cfgFile, JSON.stringify({ anthropicApiKey: "sk-ant-x", model: "gpt-4o; rm -rf", effort: "turbo", maxUsdPerTask: 999 }));
eq("bad model/effort/cap fall back to defaults", (({ model, effort, maxUsdPerTask }) => ({ model, effort, maxUsdPerTask }))(loadConfig(cfgFile)), { model: DEFAULTS.model, effort: DEFAULTS.effort, maxUsdPerTask: DEFAULTS.maxUsdPerTask });

/* ------------------------------------------------------------------ brain */
const params = buildParams({ tools: TOOLS, messages: [{ role: "user", content: "hi" }] });
eq("model defaults to Opus 5.5", params.model, "claude-opus-5-5");
eq("adaptive thinking, stale thinking dropped not fatal", params.thinking, { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
eq("effort explicit", params.output_config, { effort: "medium" });
eq("betas", params.betas, ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"]);
eq("fallbacks default", params.fallbacks, "default");
eq("no forced tool choice", params.tool_choice, undefined);
eq("system cached", params.system[0].cache_control, { type: "ephemeral" });
eq("top-level cache", params.cache_control, { type: "ephemeral" });
yes("the system prompt is site-blind", !/depop|chrome god|alexander/i.test(SYSTEM));
eq("cost: 1M fresh input + 1M output on Opus 5.5", costOf("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 1e6 }), 24);
eq("cost: cache read is 5% of input on Opus 5.5", costOf("claude-opus-5-5", { cache_read_input_tokens: 1e6 }), 0.2);
eq("cost: unknown model priced as the default", costOf("claude-x", { input_tokens: 1e6 }), 4);

/* ------------------------------------------------------------------ tools */
eq("13 tools, fixed order", TOOLS.map((t) => t.name), ["look", "find", "read_text", "click", "type", "select", "upload", "press", "scroll", "navigate", "screenshot", "wait", "finish"]);
eq("every tool has a schema object", TOOLS.every((t) => t.input_schema && t.input_schema.type === "object"), true);
eq("click needs final", validate("click", { ref: "e1", why: "x" }), "final is required");
eq("click ok", validate("click", { ref: "e1", why: "x", final: "none" }), null);
eq("frame ref ok", validate("click", { ref: "f1e12", why: "x", final: "none" }), null);
eq("a selector is not a ref", validate("click", { ref: "#buy", why: "x", final: "none" }), "ref #buy is not a ref (refs look like e17)");
eq("unknown field refused", validate("type", { ref: "e1", text: "a", why: "x", selector: "x" }), "unknown field selector");
eq("bad enum refused", validate("scroll", { direction: "left" }), "direction must be one of down, up");
eq("files must be names", validate("upload", { ref: "e1", files: [1], why: "x" }), "files must be a list of names");
eq("unknown tool", validate("buy", {}), "there is no tool called buy");
eq("result text shape", format({ ok: true, did: "clicked" }, { url: "u", title: "t", text: "- button \"A\" [ref=e1]" }), 'ok: true\ndid: clicked\nurl: u\ntitle: t\npage:\n- button "A" [ref=e1]');
eq("error result text shape", format({ ok: false, error: "no", notes: ["n1"] }), "ok: false\nerror: no\nnote: n1");

/* ------------------------------------------------------------------ site-blind core */
const core = ["agent", "ultra.mjs", "panel.js", "ui.mjs", "overlay.js"];
const walk = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : [p];
const hits = [];
for (const c of core) {
  const p = path.join(SRC, c);
  if (!fs.existsSync(p)) continue;
  for (const f of walk(p)) {
    const t = fs.readFileSync(f, "utf8");
    // Whole words: overlay.js's hidePopover() is not a site.
    for (const w of ["depop", "chrome god", "alleqsh", "vinted", "grailed"]) if (new RegExp(`\\b${w}\\b`, "i").test(t)) hits.push(`${path.relative(SRC, f)}: ${w}`);
  }
}
eq("the core never names a site (Depop knowledge lives only in profiles/depop.json)", hits, []);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
