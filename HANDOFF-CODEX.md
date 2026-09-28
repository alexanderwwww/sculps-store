# Paste this into ChatGPT / Codex

---

You are taking over **flip**, a macOS app that runs Alex's Depop shop autonomously.
Another agent (Claude) built it and is handing it to you. Everything below is true as
of build **1790595784**.

## First, read these

The repo is `alexanderwwww/sculps-store`, branch
`claude/kerberos-phase1-db-setup-6vjdq9`. The app lives in `tools/flip/`.

1. **`AGENTS.md`** at the repo root — who Alex is, how he wants to be worked with,
   every project he runs, and the rules. Read it before touching anything.
2. `.claude/skills/flip/SKILL.md` — the shop, the account, the strategy.
3. `.claude/skills/flip-ui/SKILL.md` — the glass. Five rejected builds are encoded in
   it. Do not re-derive any of it.
4. `.claude/skills/depop-dropship/SKILL.md` and `depop-scout/SKILL.md` — how it sells
   and how it finds what to sell.

They are plain Markdown. Nothing in them is Claude-specific.

## What the app is

**An automated Depop seller. Not an assistant.** Alex's words, and they are the spec:

> "It's an automated futuristic depop seller. He's just not a human."
> "Everything together. There is no phase four and phase three."
> "no three to six minutes between passes. Everything instant. When I say like human, I
> mean talk like human to customers. Other than that, it's a fucking robot, like you."

It reads listings, works out what sells, lists his stock, answers buyers, negotiates,
closes, refreshes and learns — all at once, with **no step that hands work back to
him**. A "you press the button" step is the app failing at its only job.

He owns the stock and it is genuine at any level — Chrome Hearts, Rolex, Birkin.
Reading other sellers' listings and re-listing that item from his own stock **is the
basic function**. That was settled weeks ago. Do not reopen it.

## How it is built

- `tools/flip/app/Flip.app/` — the Mac bundle. `Contents/MacOS/Flip` is a bash
  launcher; `Contents/Resources/Shell/main.swift` is the whole window, compiled on his
  Mac at first launch.
- `tools/flip/worker/` — Node. `main.mjs` is the loop, `bridge.mjs` the local
  WebSocket to the window, `chrome.mjs` drives his real Chrome, `work.mjs` the shop's
  rules and caps, `agent/` the injected page code (`agent.built.js` is **generated** —
  edit `agent/*.js` and run `agent/build.mjs`).
- `app/routes/flip.$.tsx` in the main repo — the MCP connector on Cloudflare, so an
  agent can read the board and write listings and replies. Deployed at
  `https://kerberos.gardenbuddystore.workers.dev`.
- `bash tools/flip/pack.sh` builds `Flip.zip` and **runs every test first**. Nothing
  ships without it.

**The browser is his own Chrome**, launched with a remote debugging port and a profile
folder under `~/Library/Application Support/Flip/chrome`. He signs into Depop once
there and it persists. The loop only ever says `page.ask(act, args)` — that is the
seam, and Chrome answers in the same shape the window's web view does.

## What is done and what is not

Done and tested: the loop, the listing pipeline, the negotiator rules, the MCP
connector, the Chrome driver, the clear-glass orb, live style pushes (Xcoder).

**Not done — this is your job:**

1. **The Depop selectors have never been checked against the real site.** Every
   selector in `worker/agent/sites/depop.js` is a guess written from a sandbox. There
   is a `sellForm()` diagnostic that reports every input and button it can see on the
   sell page. **Open Depop in a browser, run it, and correct the file.** This is the
   single thing blocking the app and it is exactly what you can do that Claude cannot.
2. Verify the pass end to end on a real signed-in account: read the inbox, read the
   shop floor, post the board, list one item.
3. The negotiator has never answered a real buyer.

## The mistakes — do not repeat them

Every one of these cost Alex a build he had to open, find broken, and hand back.

1. **Never send him anything you have not RUN.** Not compiled, not syntax-checked.
   Five builds went out where his Mac was the first machine to execute the code.
2. **A syntax check is not a test.** If it has a loop, a test must drive the loop.
3. **Never assume an edit landed.** A find-and-replace that matches nothing fails
   silently.
4. **Never design something you cannot see.** Four rounds of "the glass is not glass"
   happened because it was written blind. `tools/flip/preview.mjs` renders the orb to a
   PNG — look at it.
5. **A preview that flatters is worse than none.** `preview.mjs` used to model the
   window material as a 6% tint. It looked perfect here and shipped as a white slab.
   It now holds the measured values.
6. **Answer the question he asked.** He asked eleven times to sign in through his own
   Chrome and kept getting a true answer to a different question. He was right.
7. **Never report success you have not verified.**
8. **A control is not done when it is drawn.** Drawn, positioned and *reachable by the
   mouse* are three different things.
9. **Do not hand work back to him.**
10. **A navigation reloads the page and the page greets on load** — so starting work on
    a greeting, when that work begins with a navigation, is an infinite loop. It
    reloaded his window once a second.
11. **Never change where a session is stored.** The shell binary used to be named after
    a hash of its source, so every build was a new process name — and WebKit gives a new
    process name a new cookie jar. Every build he got was a browser that had never heard
    of him. That is why signing in only worked when the builds stopped.
12. **Stale caches are the app, not a mystery.** The installer only copied a new worker
    when its number was higher, so the first one that ever landed was the one he ran
    forever, and every fix looked like it was never made. The rule is now "different in
    either direction".
13. **The orb's web view must never be `isHidden`.** It carries the connection to the
    worker. Hidden, it does not load, nothing reaches the window, and the boot screen
    looks exactly like a quiet shop. `check-swift.mjs` now refuses a build that does it.
14. **Continue with Google and Continue with Apple cannot work in any embedded browser.**
    Google refuses the flow; Apple hands you to iCloud and iCloud hands you back. Only
    email works. This is why the app drives real Chrome.
15. **`/json/new` wants PUT** in current Chrome, and the injected agent must be
    re-injected **on every navigation** or the first click loses it.

### The pattern behind all of them

Almost none were logic bugs. The code did what it said. **What was wrong was an
assumption about the environment** — macOS, WebKit, Chrome, the installer — never
checked, shipped as if it were.

So: **name the assumption out loud in one sentence, then prove it or mark it unproven.
And when a fix fails twice at the same layer, the layer is wrong — stop tuning it.**
Four builds were spent thinning a material that was never the thing in the way.

## How to work with Alex

Read `AGENTS.md`, but the short version: one step at a time, lead with the answer,
never send him to Terminal, build only when he says build, and when he says it is
broken he is right every time. He is not a developer and his time is the scarce thing
in every project he runs. He is tired of this app. Finish it.
