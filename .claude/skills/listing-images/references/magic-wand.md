# The Magic Wand pipeline

The app on Alex's Mac that drives a real Chrome, types prompts into Gemini or ChatGPT,
and sends the pictures back. Claude queues the work, approves it, watches it, downloads
the result and puts it on the store. **Alex opens the app and that is all he does.**

## The loop

1. **Queue one job.** `wand_queue_set` — one product, one reference picture, the prompts.
2. **Approve it.** `wand_order continue`. Claude approves its own job; Alex does not press
   Submit. Send it twice if the first lands before the card is up — an extra one answers
   "nothing to do" and is harmless.
3. **Watch it.** A `Monitor` polling `/wand/<key>/status` every 10s, emitting only on a
   change. Never poll in a loop by hand, and never `sleep` waiting for it.
4. **Fetch each picture as it lands** from
   `…/wand/<key>/file/<job-slug>/<NN>-01.png` — the slug is the job name lowercased with
   every run of non-word characters turned into a single hyphen.
5. **Look at it.** Open every single one with Read. This is not optional.
6. **Place it.** Convert to webp, upload to R2 under a **new** filename, update the
   product's `images` array in Neon. The page changes immediately — no deploy.
7. **Show Alex** with SendUserFile as each one lands, so he sees the work happening.

## Rules learned the hard way

**One product per job.** Four products in one job means parts, and a part that opens a new
chat used to keep the previous part's pin — so parts 2, 3 and 4 came back drawn as
product 1. Fixed in build 39, but one product per job is better anyway: it is cheaper to
re-run and easier to judge.

**One reference picture per job**, attached once. The app says "references already in this
chat" for every prompt after the first, and that is correct behaviour.

**Never overwrite an R2 key.** `/media/*` is served `immutable, max-age=31536000`.
Overwriting a key changes nothing on his screen for a year. Always a new filename.

**Read the log, not just the state.** `wand_status`'s `tail` shows `attached 1 (pasted)`,
`sent`, `captured blob:…`, `[n/m] 1 image`. `captured` means the picture came from the
page's own image response — good. Any mention of a screenshot is a bug.

**Check the dimensions before placing.** `file x.png` must say `1024x1024` or another true
square. A 16:9 picture in a square frame is grey bands and a smaller product, and it is
the most repeated complaint on this project.

**The app carries its own copy of the runtime.** `tools/promptbot/live.mjs` and `wand.mjs`
are copied into `app/Magic Wand.app/Contents/Resources/` and the .app installs them into
`~/Library/Application Support/Magic Wand/runtime/` on launch. Committing to
`tools/promptbot/` alone and calling it shipped is false — it cost a day of running old
code under a new build number.

**Do not make him download a new version mid-session.** A fix that matters waits for the
next time he closes the app anyway.

## Writing the prompts

Every job starts with the standing brief — the shop, the product, its facts, the panel
format, the look, the ban list — and then one line per picture saying which panel it is.
The brief goes in front of the first prompt only; the app keeps the chat, so prompts 2..n
inherit it.

Give the model the **exact words** to draw. Never "a headline about size" — write
`3 FT / 0.9 M`. Every word on a finished image should be a word that was in the prompt.

Name the job after the product and the batch: `Zombie — panels`. The slug comes from it,
and that slug is how the pictures are fetched.

## When a picture is wrong

Re-queue that **one** prompt as its own job with no `newChat`, so it runs in the chat that
already holds the reference. Say what was wrong and what to do instead, in that order. One
bad picture costs one prompt, not a whole run.

## Which site, and why it matters

**Alex has no Gemini quota. Everything runs on ChatGPT** unless he says otherwise.

The app remembers the site it was told to use, in a `.site` file beside the runtime,
and an order naming a site outranks whatever `site` a queued job carries. Send
`{"cmd":"chatgpt"}` once and it holds across restarts and updates. Before build 52 it
was held in memory only, so every update reopened Gemini and burned a run.

Still set `"site": "chatgpt"` on every job. Belt and braces, and it is one line.

## References are not optional

From build 52 the app REFUSES to send a prompt whose reference pictures did not all
reach the composer. It retries, waits for slow uploads, and then skips the prompt with
a red line and a `problem` on the status rather than drawing from nothing.

This matters because of how the failure used to look. A prompt sent without its
references comes back as a plausible picture of the wrong thing — a box with an
invented product on it, a figure that is not the product — so it reads as a bad prompt.
A whole afternoon went into rewriting words that were never the problem. **If a render
comes back showing something that is not the product, suspect the attachment before the
prompt.**

For per-product references use `parts`: each part carries its own `refs` and `prompts`,
and the app attaches that part's pictures once. A parts job has no top-level `prompts`.

## The queue holds exactly one job

POSTing a new job REPLACES whatever was queued, even if it has not run yet. Queue one
job, wait for it, then queue the next. Two jobs sent back to back means the first is
silently lost.

## Hard rules for the app itself

These were each learned by shipping the opposite. Do not re-derive them.

**Never upload the same picture twice.** Not once per part, not once per retry, not
once per drop target. It burns quota, fills the composer, trips the site's cap of 20
files per message, and buries the product among copies of the brand mark. Three
separate causes produced this, and all three are now guarded:
- the drop route dispatching at every ancestor (events bubble — drop once),
- a delivery route being retried while the first one was still uploading,
- the retry loop calling the whole attach again on a partial.
After attaching, the composer is counted: **more pictures than were sent means the
prompt is not drawn at all.** Never relax that check.

**A prompt whose references did not all arrive is never sent.** An image drawn without
its reference comes back as a plausible picture of the wrong thing, which reads as a bad
prompt — so hours go into rewriting words that were never the problem. If a render shows
something that is not the product, suspect the attachment before the prompt.

**ChatGPT only.** There is no Gemini quota. The choice is stored beside the runtime file
(`import.meta.url`, never a bare relative path — the working directory differs between a
Finder launch and a terminal launch) and an order outranks a job's own `site`.

**Run `node check.mjs` AND `node test/harness.mjs` (in `tools/promptbot/`) before publishing a build.** The harness drives the real attach code against `test/page.html` in Chromium and must print `all passed` -- it is the only thing that proves the attachment count is scoped to the composer. It compiles the emitted overlay,
looks for Node values leaked into it, and loads the runner far enough to catch a `let`
used before its declaration. Each of those three shipped broken at least once and none
of them is caught by `node --check`.

**The overlay is a template literal.** Every backtick and `${` inside `OVERLAY` — including
ones in comments — must be escaped. `node --check` reports a line nowhere near the cause.

**The queue holds exactly one job.** A second POST replaces the first silently.

## The panel

One glass surface (`GLASS`) and one entrance (`liquidIn`) shared by the status pill and
both cards, so the overlay is one piece of software rather than three. Glass has **no
colour of its own** — no violet, no brand tint. It takes what is behind it: a saturating,
brightening blur, a hard white band across the top quarter, a shadow pooled at the
bottom, and the rim drawn from the inside on all four sides for thickness.

It opens like liquid: a bead arrives, spreads wider and flatter than it will finish, then
settles back as the blur clears — the clearing lagging the shape, because matching the
durations turns it into a fade. Transform, filter and opacity only, so the page underneath
is never slowed by the thing watching it.

## `continue` resumes, it does not start

Queueing a job does not make the app take it. `continue` means *carry on with
what you were already doing*, so sending it to an app that is mid-way through
an older job restarts that older job — the new queue is untouched and the
credits go on pictures nobody asked for. This happened on 24 Sep 2026: a
projector job was resumed twice while a cryo job sat queued, and Alex paid for
both runs.

Before sending the wand any command:

1. **Read `wand_status` and look at `job`, not just `state`.** A queued job is
   not a running job, and the app will happily resume something else.
2. **`stop` leaves the old job resumable.** The app itself says "stopped at 1
   of 5 — send it again and it carries on". Stop does not clear.
3. **A frozen `at` timestamp with a closed-browser error means the app is dead,
   not busy.** Orders sent to it go nowhere. Say so instead of reporting the
   stale screen as the truth.
4. **`newChat: true` on the queue is what unpins it** from whatever chat the
   last job lived in.

The general form, and it is the standing rule of this project: before sending
any command to a running app, know what state it is in and what that command
does *in that state*. Verify, then send. Guessing at a verb's meaning is the
same failure as guessing at a fact.
