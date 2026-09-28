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
