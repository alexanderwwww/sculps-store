/*
 * The request the brain sends, checked against the official SDK's own
 * TypeScript types (rule 15: never guess an API shape).
 *
 * buildParams() is called for real with every kind of message the agent ever
 * sends: the task with photos, an assistant turn exactly as the API returns it
 * (thinking block with its signature, tool_use), tool results as text, as an
 * error, and with a screenshot. The result is written into a .ts file as an
 * object literal typed as the SDK's beta MessageCreateParamsNonStreaming, and
 * tsc (the repo's TypeScript) must accept it: a misspelled or unknown field
 * fails as an excess property. The appended assistant turn is typed as the
 * SDK's BetaMessage content, proving "append response.content unchanged" is
 * a valid request.
 *
 *   node test/brain-types.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildParams } from "../src/agent/brain.mjs";
import { TOOLS } from "../src/agent/tools.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const TSC = path.join(REPO, "node_modules", "typescript", "bin", "tsc");
const SDK = path.join(REPO, "node_modules", "@anthropic-ai", "sdk", "package.json");
let failed = 0, passed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `\n${detail}` : ""}`); }
};

if (!fs.existsSync(TSC) || !fs.existsSync(SDK)) {
  console.log(`FAIL  typescript or @anthropic-ai/sdk missing in ${REPO}/node_modules`);
  process.exit(1);
}
const sdkVersion = JSON.parse(fs.readFileSync(SDK, "utf8")).version;
const wanted = JSON.parse(fs.readFileSync(path.join(HERE, "../src/package.json"), "utf8")).dependencies["@anthropic-ai/sdk"];
check(`checked against the SDK version the app installs (${wanted})`, sdkVersion === wanted, `repo has ${sdkVersion}`);

const tinyJpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==";
const response = {
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", container: null, context_management: null,
  content: [
    { type: "thinking", thinking: "", signature: "sig-abc" },
    { type: "tool_use", id: "toolu_1", name: "click", input: { ref: "e17", why: "post it", final: "publish" } },
  ],
  stop_reason: "tool_use", stop_sequence: null, stop_details: null,
  usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
};
const messages = [
  { role: "user", content: [
    { type: "text", text: "Task: list this\nFiles: a.jpg" },
    { type: "text", text: "Photo 1: a.jpg" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: tinyJpeg } },
  ] },
  { role: "assistant", content: response.content },
  { role: "user", content: [
    { type: "tool_result", tool_use_id: "toolu_1", content: "ok: true\ndid: clicked" },
  ] },
  { role: "assistant", content: [{ type: "tool_use", id: "toolu_2", name: "screenshot", input: {} }, { type: "tool_use", id: "toolu_3", name: "look", input: {} }] },
  { role: "user", content: [
    { type: "tool_result", tool_use_id: "toolu_2", content: [{ type: "text", text: "ok: true" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: tinyJpeg } }] },
    { type: "tool_result", tool_use_id: "toolu_3", content: "ok: false\nerror: no", is_error: true },
  ] },
];
const params = buildParams({ tools: TOOLS, messages });

const file = path.join(HERE, `.brain-types-${process.pid}.ts`);
const ts = `import Anthropic from "@anthropic-ai/sdk";
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
// What a response's content is typed as in the SDK (the blocks the agent appends unchanged).
const content: Anthropic.Beta.Messages.BetaContentBlock[] = ${JSON.stringify(response.content, null, 2)};
const appended: Anthropic.Beta.Messages.BetaMessageParam = { role: "assistant", content };
const params: Params = ${JSON.stringify(params, null, 2)};
export { params, appended };
`;
fs.writeFileSync(file, ts);
let out = "";
let ok = false;
try {
  out = execFileSync(process.execPath, [TSC, "--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", file], { cwd: REPO, encoding: "utf8", stdio: "pipe" });
  ok = true;
} catch (e) {
  out = String(e.stdout || "") + String(e.stderr || "");
} finally {
  fs.rmSync(file, { force: true });
}
check("buildParams() is a valid beta.messages.create request (SDK types, excess properties checked)", ok, out.split("\n").slice(0, 30).join("\n"));
check("an API response's content appended unchanged is a valid assistant message", ok);

// And the same check catches a wrong field: prove it bites.
const bad = path.join(HERE, `.brain-types-bad-${process.pid}.ts`);
fs.writeFileSync(bad, `import Anthropic from "@anthropic-ai/sdk";
const p: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = { model: "claude-opus-5-5", max_tokens: 10, messages: [], fallback: "default" };
export { p };
`);
let biting = "";
try { execFileSync(process.execPath, [TSC, "--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", bad], { cwd: REPO, stdio: "pipe" }); }
catch (e) { biting = String(e.stdout || "") + String(e.stderr || ""); }
finally { fs.rmSync(bad, { force: true }); }
check("the type check rejects a misspelled field (fallback instead of fallbacks)", /'fallback' does not exist/.test(biting) && !/TS5112/.test(biting), biting.slice(0, 400));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
