# `interview/` — the AI voice interviewer

**This is the piece that makes RETOLD fully hands-off.** It replaces the one
human step that used to exist ("*you* interview their loved one and get a
recording"). Now a warm AI voice agent phones the parent, has a few gentle
chats, and produces the recording all by itself.

> Read this like the rest of RETOLD: you set a few things up once, and then every
> order flows through on its own.

---

## What it does, in plain English

1. An order comes in with the **parent's phone number** and the buyer's OK to
   record.
2. Over a few days, the agent makes **a few short, kind phone calls** — one per
   chapter of their life (childhood → growing up → love & family → hard times &
   proud days → wisdom). The whole script lives in `interview_plan.py` and you
   can edit any question in plain text.
3. Each call is **recorded**. When the last one is done, the recordings are
   stitched into a single `master.wav`.
4. That file is handed to the **existing engine** (`engine/produce.py`) exactly
   as if a human had recorded it. **Nothing downstream changed.**

The agent has its *own* neutral voice for asking questions. The **parent's real
voice is only ever recorded — never cloned or faked.** That honesty promise is
the same one enforced everywhere else in RETOLD.

---

## The files

| File | Job |
|------|-----|
| `interview_plan.py` | The persona + the question arc. **The soul of the product** — edit questions here. |
| `vapi.py` | Talks to the voice-agent provider (Vapi by default). Builds the assistant, places the call, fetches the recording. |
| `orchestrate.py` | The runner: order → calls → `master.wav` → hands off to the engine. Has a full `--mock` mode. |
| `webhook_handler.py` | Receives "the call finished" from the provider (or let n8n's webhook node do it). |

---

## Try it right now — no account, no phone call

From the repo root:

```bash
python interview/orchestrate.py --order samples/sample_order.json --out out/1001/ --mock
```

This fabricates a `master.wav` from the bundled sample and writes
`out/1001/order.enriched.json` — the exact thing the engine then consumes. So
the full chain is:

```bash
# 1) interview (AI calls) → master.wav + enriched order
python interview/orchestrate.py --order samples/sample_order.json --out out/1001/ --mock
# 2) engine turns that into the finished book
python engine/produce.py --order out/1001/order.enriched.json --out out/1001/ --mock
```

---

## Turning it on for real (Phase 2)

You need one voice-agent account. **Vapi** (vapi.ai) is the default and does
telephony + voice + recording in one place. Add to your `.env`:

```
VAPI_API_KEY=...              # vapi.ai → API keys
VAPI_PHONE_NUMBER_ID=...      # the number Vapi calls FROM (buy/import in Vapi)
VAPI_VOICE_PROVIDER=11labs    # optional — the agent's asking voice
VAPI_VOICE_ID=sarah           # optional — pick a warm, clear voice
VAPI_WEBHOOK_SECRET=...       # optional — shared secret for the webhook
ANTHROPIC_API_KEY=...         # already needed by the engine; drives the chat too
```

Then real runs just drop the `--mock`:

```bash
python interview/orchestrate.py --order path/to/order.json --out out/1234/
```

**Swapping providers:** every other file only calls the four functions in
`vapi.py` (`build_assistant`, `place_call`, `get_call`, `parse_end_of_call`).
Re-implement those against Bland.ai or Retell and nothing else has to change.

---

## Two things to get right before you dial real people

- **Consent.** Collect the buyer's confirmation that their parent is happy to be
  called and recorded (set `consent_to_record: true` on the order). The agent
  *also* asks for consent out loud at the start of the first call — but you
  should have it in writing at intake too. Recording-consent laws vary by state
  and country; make sure your intake copy and your policies cover it.
- **The phone number.** Collect the parent's number at intake (a short form the
  buyer fills in after purchase). Put it on the order as `subject.phone` in full
  international format, e.g. `+14155550123`.
