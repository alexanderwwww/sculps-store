---
name: shipping
description: Every failure that reached Alex on a build he had to open, find broken and hand back — and the rule that stops each one. Load this before packing, deploying, or telling him something works, on any app: flip, Magic Wand, OrganicX, Kerberos. Trigger it when the work touches a build, a zip, an install, a deploy, a "it's fixed", or when a fix has already failed once. These were paid for in his time and his credits; re-deriving them is the same as repeating them.
---

# Shipping

He asked for this written down: *"all the mistakes you did and all the flops and all
the bullshit you did make it a skill save it."*

Not a list of regrets. A gate. Read it before anything leaves the container.

## The one pattern

**Almost none of these were logic bugs. The code did what it said.** What was wrong was
an assumption about the environment it ran in — macOS, WebKit, Chrome, Node, the
installer — never checked, shipped as if it had been.

That is why each one survived several rounds: the next fix was another guess at the
same layer.

So, before anything ships:

1. **Name the assumption in one sentence.** "This is clear because the material is
   thin." "This arrives because the launcher copies it." If it cannot be said, it has
   not been thought about.
2. **Prove it or mark it unproven — to him, in writing.** A thing that cannot be
   verified from here is not a thing to stay quiet about.
3. **When a fix fails twice at the same layer, the layer is wrong.** Stop tuning it.
   Four builds went into thinning a material that was never in the way.
4. **Put the version on the screen.** Two rounds were spent arguing about a build that
   was not the build.

"I found the real bug" is not a finding. A mechanism that explains **every**
observation — including the ones that looked like magic — is a finding.

## The flops, by what actually broke

### Startup and process

- **A top-level `await` on another process took the whole app down.** `if (await
  useChrome())` — everything below that line, every timer, the status heartbeat, the
  pass scheduler, only registers once it resolves. Chrome opened, the attach hung, and
  the rest of the worker never came into existence. From outside: Chrome on screen,
  window connected, nothing ever sent. **Nothing that talks to another process belongs
  in a top-level await.**
- **A navigation reloads the page, and the page greets on load.** Starting work on a
  greeting, when the work begins with a navigation, is an infinite loop. It reloaded
  his window about once a second.
- **`cloud.knowledge is not a function`** reached him because nothing between the
  keyboard and his Dock had ever started the worker.

### Installs and caches

- **The installer only copied when the new number was higher.** So the first worker
  that ever landed was the one he ran forever and every fix looked like it was never
  made. The rule is **different in either direction** — the bundle in front of you is
  the truth.
- **He ends up with several copies of the app.** The launcher now says so by name when
  a newer build has already run on that Mac.

### Sessions and identity

- **The shell binary was named after a hash of its source**, so every build was a new
  process name — and WebKit gives a new process name a new cookie jar. **Every build he
  received was a browser that had never heard of him.** That is why signing in only
  worked when the builds stopped. One name, forever; the key goes in a file beside it.
- **A "safety" guard on the data store** changed which jar was used and turned a
  signed-in app into a signed-out one. Whatever returns that location must never
  change again, for any reason, including a good one.

### Windows and views

- **`WKWebView` composites an opaque white base under its page.** `drawsBackground` is
  private and does not take on his macOS. That white rectangle sat on top of every
  material and every canvas — the milk, for four builds.
- **The orb's web view carries the connection to the worker.** `isHidden` stopped it
  loading, so nothing reached the window and the boot screen was indistinguishable
  from a quiet shop. Parking it 1×1 offscreen is not safe either — WebKit suspends a
  view that is not really visible. `check-swift.mjs` refuses `orb?.isHidden = true`.
- **A control is not done when it is drawn.** Drawn, positioned and *reachable by the
  mouse* are three different things — three buttons did nothing for a build because the
  window handed every click to the drag machinery.
- **A pane whose hit frame is the whole window leaves nothing to grab.** The phone
  could not be moved at all.

### Browsers and sign-in

- **Continue with Google and Continue with Apple cannot complete in any embedded web
  view.** Google refuses the flow; Apple hands you to iCloud and iCloud hands you back
  to the login screen, forever. Only email works — which is why flip drives his real
  Chrome.
- **`/json/new` wants PUT** in current Chrome; it answered GET for years.
- **An injected agent must be re-injected on every navigation**, or the first click
  loses it.

### Tests and previews that lie

- **A syntax check is not a test.** `node --check` passes on every file in a dead app.
  If it has a loop, a test must drive the loop — one fake page found eight defects in
  an hour.
- **A preview that flatters is worse than none.** `preview.mjs` modelled the window
  material as a 6% tint. Every render looked perfect and shipped as a white slab. **It
  was a second opinion that agreed with me.**
- **A find-and-replace that matches nothing fails silently.** Assert the anchor, then
  check the result.
- **Code that reports success it did not have.** A type that failed inside the page was
  counted as typed, so the app told him work was done that never happened.

### Him

- **Never send him to Terminal.** He has said it twice and it is not negotiable. A fix
  that needs a terminal is the wrong fix — put it in the app.
- **Never ask him to paste anything into a console.** Same rule.
- **Answer the question he asked.** He asked eleven times to sign in through his own
  Chrome and kept getting a true answer to a different question. He was right the whole
  time.
- **Do not hand work back to him.** A "you press the button" step, or a phased plan
  where the intelligence lands last, is the app failing at its only job.
- **Never carry another app's model over wholesale.** Fiverr pacing arrived in flip
  with Sunday off and two-minute waits, in an app whose point is to work while he
  sleeps.
- **When he says it is broken, he is right.** Every time. The argument is time not
  spent finding out why.

## Before packing, all of these or it does not go

1. Every test in `pack.sh` green — and if the change has no test that would have caught
   it, write one first.
2. Anything he will look at, rendered and **opened**.
3. The build number visible in the app and stated in the message.
4. The one assumption that could not be proved, said out loud to him.

## His Mac is Intel

Not Apple Silicon. A build packaged `--arm64` refuses to open on it — *"not
supported by this Mac"* — and he has already lost a download to that guess.

Universal would solve it, but **it cannot be built from Linux** — Apple's
`lipo` is required and @electron/universal refuses. So build **x64**: native on
his Intel Mac and fine under Rosetta on Apple Silicon, which is one download
that works on any Mac. And on Apple Silicon an unsigned arm64 binary is killed by
the kernel and reads as *"damaged and can't be opened"*, so `rcodesign sign`
the bundle either way: electron-builder skips signing on Linux and says so in a
line that is easy to read past.

It is the same failure as all the others — an assumption about the environment,
never checked, shipped as if it had been. **Ask, or build for both.**

## The packed app is a different program from the source tree

plug shipped and died on launch: *"Cannot find module './shops.js'"*.
electron-builder ships only what its `build.files` list names, and that file
was not on it. **Every test passed**, because every test ran from the source
tree, where the file is obviously present.

A test that runs from source cannot tell you what is in the bundle. So there is
now one that reads every local import in the source and asks whether the packed
app would contain it — no packing needed, a second to run, and it catches the
whole class.

The same trap covers anything loaded by path rather than by import: icons,
HTML, the worker. If the app reads it at runtime, name it in `files` and assert
it.

## His Mac, and what it can afford

**MacBook Air 13-inch, 2020 — 1.1 GHz dual-core Core i3, Intel Iris Plus,
8 GB, Retina, macOS Sequoia.** The slowest Mac Apple shipped that year, on
integrated graphics, driving a 2560×1600 screen.

Build for that, not for a machine that absorbs sloppiness. Two things made plug
crawl and both were free to avoid:

1. **Never animate anything over a `backdrop-filter`, ever, endlessly.**
   Chromium re-evaluates the filter whenever anything above it changes, so a
   one-second infinite spinner meant three displacement maps recomputed sixty
   times a second — forever, whether the app was working or not. A transition
   that *ends* is fine. `infinite` is a burned core for a decoration.
2. **Never capture the screen whole, at Retina scale, as PNG, on a short
   timer.** It was every 1.2s at full backing resolution, base64'd over IPC. It
   is now 900px wide, JPEG at 58, at most every 8 seconds, skipped entirely
   when the window is not visible, and never two at once — the picture lives
   behind refracting glass where it is bent past recognition, so resolution is
   the cheapest thing in the app to give away.

Also: **do not resize a transparent window in steps to animate it.** Set the
size once and let CSS carry the shape. Stepping the bounds is expensive, and
every step re-triggered a capture.

`test/idle.test.mjs` fails the build on an endless animation or a capture that
has crept back up.

## A floating window eats the first click

plug's buttons "didn't work". They were drawn, positioned, reachable by the
mouse, and a headless test clicked them successfully — because there is no
window server in a container to swallow anything.

On a real Mac, a window that floats and never takes focus treats the first
click as *activate me* and consumes it. He pressed Sign in with email, the
window came forward, nothing happened. **`acceptFirstMouse: true`.**

The wider rule: a control is drawn, positioned, reachable, **and acted on**.
Those are four different things, and the last one only exists on his machine.

## Clear glass means the type must work on ANY desktop

The design's ink is a dark navy, which is correct over a pale wallpaper and
invisible over a dark one. He saw "light blue, not working on every surface" —
that is dark type through clear glass over a dark desktop, and every render I
had made was over a light one.

The capture behind the window is drawn into a 24px canvas, its perceived
brightness measured (0.2126 R + 0.7152 G + 0.0722 B, not a flat average), and
the whole screen switches between dark ink and light. Cheap, once per capture.

**Render every screen over a dark desktop as well as a light one.** A design
checked on one surface is a design checked on half of them.

## An edit that replaces a RANGE deletes what was inside it

plug's buttons did nothing, and the cause was mine from two builds earlier:
rewriting the morph handler by replacing everything between
`ipcMain.handle("shape"` and `ipcMain.handle("open-external"` — and the
`signin`, `close-shop` and `pass` handlers were sitting in that range. They
were deleted, silently, and nothing said so.

Every test still passed. They tested that the button *fires*, which it did;
the app simply had no handler to answer it. **"The click fires" is not "it
works".**

So: after any edit that replaces a range rather than an anchor, **count what
should still be there**. And test the thing he actually does — press the
button, then ask whether the marketplace is now on screen.

`test/signin.test.mjs` runs the real main.js, presses Sign in with email, and
asserts a Depop page is loaded, visible, inside the glass, with the dead
buttons already stripped. That is the test that found this.

## A control that is drawn but wired to nothing is the whole complaint

He said it as "it's like UI and also not what I asked". Four separate things in
plug were drawn as controls and connected to nothing:

- Tabs that set a variable no other code read.
- A "signed in" state rendered as a badge, so the one thing he most wanted to
  press had no button in it at all.
- Cards hidden the moment they succeeded, leaving no way back into either shop.
- A popup opened with `window.open` from inside an embedded view — it lands in a
  child window behind the app: he presses, something happens somewhere, and on
  screen nothing moves. Refuse popups, load the URL in the same view.

**Before shipping a screen, press every visible control and assert what the main
process was asked to do.** Not that it rendered — what it *called*. `click.test.mjs`
does exactly this and it is the cheapest test in the app.

Two more, from the same round:

- **A script injected on `dom-ready` only reaches the main document.** Both Depop
  and Vestiaire put parts of the sign-in sheet in iframes, which is why a
  "Continue with Google" he could see was one the app had never touched. Inject
  into every frame in the subtree, and on `did-frame-finish-load` too.
- **Adaptive ink must measure the rectangle UNDER THE WINDOW**, not the whole
  screen. A pale wallpaper with a dark patch beneath the glass averages "light"
  and picks dark type exactly where it cannot be read. And carry a halo of the
  opposite tone regardless — over clear glass the background is a photograph.


## Magic Wand, 2026-10-02: how a working app got broken in a day
The Wand worked. His new ChatGPT account changed the page; the fault was the app no longer finding the message box (no `#prompt-textarea`) and counting
attachments only as `blob:` images. I spent builds 72-76 on glass, icon, sign-in guards and lag instead of reading the page first. Rules: evidence first
(the probe in live.mjs prints what the page really has), one fix per build, keep the last good build published (71 is the last one that worked on his old
account), confirm in `wand_status` that the build number changed, then say done. A runner busy in a retry loop only updates after a stop + `update` order.
