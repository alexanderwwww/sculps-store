# Paste this into ChatGPT / Codex

---

You are building **plug** for Alex, alongside another agent (Claude). This is the whole
job. Read it all before you touch anything.

## Step 1 — read these two files, in this order

The repo is **`alexanderwwww/sculps-store`**, branch
**`claude/kerberos-phase1-db-setup-6vjdq9`**.

1. **`PLUG.md`** at the repo root — the product brief. What plug is, the two
   marketplaces, what it does, what it must never do, and the definition of done. That
   file is the spec. This one is only how to work.
2. **`AGENTS.md`** at the repo root — who Alex is, how he wants to be worked with, and
   every other project he runs. It loads itself in Codex, but read it consciously.

Then, as you need them: `.claude/skills/depop-scout` (how to read demand),
`.claude/skills/depop-dropship` (the selling method and what it refuses),
`.claude/skills/flip-negotiator` (the offer ladder and where it has no authority),
`.claude/skills/shipping` (every failure that has already reached him, and the rule that
stops each one — read this before you ever send him a build).

They are plain Markdown. Nothing in them is Claude-specific.

## Step 2 — what you have access to

**The repository**, in full. Clone it, branch from the branch above, commit, push.
Do not push to `main`: it is hundreds of commits stale and deploying it would take down
his live stores.

**A real browser with real tabs, on his machine.** This is the thing you have and Claude
does not, and it decides how the work should be split.

**Cloudflare**, for the MCP connector that lets an agent in chat read each shop's board
and write listings and replies. The pattern already exists in `app/routes/flip.$.tsx`
and is deployed at `https://kerberos.gardenbuddystore.workers.dev`. Secrets live in
`.dev.vars`, which is gitignored — never commit a token or a connection string, and if
one leaks, say so immediately and rotate it.

**His Mac**, indirectly. Swift is compiled there at first launch, so nothing in the
container can prove the window builds. There is a name validator, `check-swift.mjs`, and
it is not a compiler.

## Step 3 — the split, and why

- **Anything that needs a live page is yours.** Depop's and Vestiaire's selectors have
  **never been checked against the real sites**. Everything written so far was written
  blind from a sandbox. You can open both, signed in, and read what is actually there.
  That is the single thing blocking the whole app.
- **Anything that needs a Mac is his**, and neither of us can prove it from a container.
  Say so rather than guessing.
- **Repo work, tests, the worker, the connector** — either of us.

If Claude has already written selectors, treat every one as a guess until you have seen
the page. Correcting them from a live site is worth more than anything else you could
do first.

## Step 4 — build order, and do not skip it

**The sign-in comes first and everything waits on it.** `PLUG.md` says why and gives the
three requirements. It is not the easy part — it is the part that has broken every
previous attempt, four separate ways.

The gate: **he signs into Depop and Vestiaire once, three rebuilds are installed, and he
is still signed into both.** Nothing else gets written until that is true. If you find
yourself building listing logic before that gate is passed, stop.

After it: read both shop floors → route an item to the right site → list it → answer a
buyer → take a sale through to shipped, including Vestiaire's authentication leg.

## Step 5 — how to ship to him

He is not a developer and his time is the scarce thing in every project he runs.

- **Never send him to a Terminal and never ask him to paste anything into a console.**
  He has said it twice. A fix that needs either is the wrong fix — put it in the app.
- **Never send him anything you have not RUN.** Not compiled, not syntax-checked. Run
  it. Several builds have already reached him where his Mac was the first machine to
  execute the code.
- **A syntax check is not a test.** If it has a loop, a test must drive the loop.
- **Anything he will look at, render it and open it.** Four rounds were lost on a
  visual detail that was being written blind.
- **State the build number** in your message and make sure it is visible in the app.
  Two rounds were spent arguing about a build that was not the build.
- **Say out loud any assumption you could not prove.** That honesty is worth more to him
  than confidence.
- One step at a time. Lead with the answer. Build when he says build — he thinks out
  loud, and that is not an instruction. **When he says it is broken, he is right.**

## Step 6 — the thing that actually goes wrong

Read `.claude/skills/shipping` for the full list, but this is the pattern behind almost
all of it:

**Most failures were not logic bugs. The code did what it said. What was wrong was an
assumption about the environment** — macOS, WebKit, Chrome, Node, the installer — never
checked, and shipped as if it had been. Each one survived several rounds because the
next fix was another guess at the same layer.

So: **name the assumption in one sentence, then prove it or flag it as unproven. And
when a fix fails twice at the same layer, the layer is wrong — stop tuning it.**

Four builds were spent thinning a window material that was never the thing in the way.

## Step 7 — coordinate

Claude is working the same branch. Before you start, read the recent commits so you are
not rebuilding something that exists. Write what you settle into a skill file before the
session ends — a decision that lives only in a transcript is one Alex pays for twice.

He is tired of this app not working. Finish it.
