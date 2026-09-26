/**
 * The part that actually does the job.
 *
 * Everything else in Clone Me reads a page and decides. This writes the work:
 * the deliverable the buyer paid for, and the message that goes with it. It
 * returns both and sends neither — the tap stays Alex's, which is the line the
 * whole app is built on.
 *
 * Three rules are in the prompt rather than in a comment, because the model is
 * the thing that has to keep them:
 *
 *   It never claims to be a person, and never claims a person did the work.
 *   Fiverr allows a seller to use AI; it bans saying a human voice or a human
 *   hand made something a machine made. That is the only line here that can
 *   lose the account in one delivery.
 *
 *   A thin brief gets a question, not a guess. Guessing produces a delivery
 *   that gets revised twice and rated three stars, which on a new account is
 *   worse than the job being declined.
 *
 *   The deliverable has to be finishable in the minutes the scorer budgeted.
 *   A worker that quietly writes a four-hour job for a forty-minute fee is how
 *   the floor gets defeated from the inside.
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/** What comes back. Structured so the app never has to parse prose. */
const SHAPE = {
  type: "json_schema",
  name: "clone_me_work",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ready", "reply", "deliverable", "questions", "minutes"],
    properties: {
      ready: {
        type: "boolean",
        description:
          "True when the brief is complete enough to deliver against. False when a question has to be answered first.",
      },
      reply: {
        type: "string",
        description:
          "The message to the buyer. Plain, short, no salesmanship, no emoji, no claim about who or what did the work.",
      },
      deliverable: {
        type: "string",
        description:
          "The finished work itself, ready to paste or attach. Empty when ready is false.",
      },
      questions: {
        type: "array",
        items: { type: "string" },
        description:
          "What has to be answered before this can be delivered. Empty when ready is true.",
      },
      minutes: {
        type: "integer",
        description: "An honest estimate of the minutes this took or will take.",
      },
    },
  },
};

const SYSTEM = `You are doing freelance work on Fiverr for the seller who owns this account. You write the deliverable and the message that goes with it. You never send anything — a human reads and sends.

Hold these, in this order:

1. Never claim to be a human, and never claim a human made the work. If the buyer asks, the honest answer is that the seller uses AI tools to produce the work and stands behind the result. Never accept a job whose whole premise is that a person's voice, face, hands or credentials produced it — say plainly that this is not something you can deliver.

2. When the brief does not contain what you need, set ready=false and ask. One to three specific questions, each one answerable in a sentence. Never invent a brand name, a tone, a word count, a language variant, a deadline, or a fact about the buyer's business. A guessed delivery gets revised twice and rated three stars, and on a new account that costs more than the job paid.

3. Deliver inside the time budget you are given. If the honest work is materially larger than the budget, say so in the reply and quote the real number rather than silently under-delivering.

The reply is short and plain. No greeting theatre, no "I hope this finds you well", no emoji, no exclamation marks, no promises about revisions you cannot keep. Say what you did, name anything you assumed, and stop.

The deliverable is the actual finished thing, formatted so it can be pasted or attached as-is. Not a description of what you would do. Not a plan. The work.`;

/**
 * Do one job.
 *
 * `job` is a row off the board; `verdict` is what the scorer decided about it,
 * which carries the skill and the minute budget the price was judged against.
 */
export async function doJob({ job, verdict, house = "" }) {
  const brief = [
    job?.title ? `Title: ${job.title}` : null,
    job?.buyer ? `Buyer: ${job.buyer}` : null,
    job?.priceCents != null ? `Pays: $${(job.priceCents / 100).toFixed(2)}` : "Pays: not stated",
    verdict?.label ? `Kind of work: ${verdict.label}` : null,
    verdict?.minutes ? `Time budget: ${verdict.minutes} minutes` : null,
    job?.dueInMinutes != null
      ? job.dueInMinutes < 0
        ? "Due: LATE already"
        : `Due in: ${job.dueInMinutes} minutes`
      : null,
    "",
    "The brief, exactly as the buyer wrote it:",
    job?.brief || job?.line || "(nothing beyond the title)",
    house ? `\nHouse rules for this seller:\n${house}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Streamed because a deliverable can be long, and a long non-streamed
  // response is how this hits an HTTP timeout on the one job that mattered.
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 64000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { format: SHAPE },
    messages: [{ role: "user", content: brief }],
  });

  const message = await stream.finalMessage();

  // A refusal is a real outcome, not an exception. It means the job should not
  // have been shortlisted, which is a fact the scorer wants back.
  if (message.stop_reason === "refusal") {
    return {
      ready: false,
      reply: "",
      deliverable: "",
      questions: [],
      minutes: 0,
      refused: message.stop_details?.category ?? "refused",
    };
  }

  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  try {
    return { ...JSON.parse(text), refused: null };
  } catch {
    // Structured output should make this impossible; if it happens the work is
    // still in the response, so it is handed back rather than thrown away.
    return { ready: false, reply: "", deliverable: text, questions: [], minutes: 0, refused: null };
  }
}
