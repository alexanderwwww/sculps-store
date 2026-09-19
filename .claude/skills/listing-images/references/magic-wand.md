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
