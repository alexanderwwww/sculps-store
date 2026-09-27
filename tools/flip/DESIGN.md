# flip — the user flow

The whole design, written for the person who uses it, not for the person who builds it.
Alex is Greek, in Greece, not a developer, impatient, does not read instructions, and
judges this in ten seconds. Everything below is decided. There are no options.

One sentence the whole app has to earn: **he can see it working, and he presses one
button per job.**

---

## 0. The three objects

Three things on screen, ever. **The orb** (216×216 squircle, always, the live face: waves,
columns, one line of copy, one counter, the Depop page frosted behind it). **The phone**
(393×852, when he clicks the orb: Depop itself with the board sheet at the bottom). **The
card** (a macOS notification, when something needs him and the orb is not on screen: one
line, one button). Everything else is deleted — `pill` and `desk` go (§5).

---

## 1. The first five minutes

### 1.1 What he actually does

1. Downloads `Flip.app`, drags to Applications, double-clicks.
2. Gatekeeper: "Flip.app cannot be opened because the developer cannot be verified."
3. He right-clicks → Open, or he gives up.
4. The orb appears.
5. He clicks it.
6. He signs in.
7. It starts working.

Steps 2–3 are the first dead end and they are fatal. **Ship the app notarized, or ship a
`.dmg` whose background is a single arrow and the words "right-click → Open the first
time".** No third option. If notarization is not ready, the launcher `.command` script
must not be the delivery mechanism — a Terminal window opening is where he stops.

### 1.2 The sequence, frame by frame

**t=0s — the orb is on screen.** Not a splash, not a Dock bounce, not "waking the crew…".
The window is built and shown before the worker is reached. Bottom-right of his screen,
above everything, 216pt.

Copy on the orb: **`getting up`**. Columns: two, slow, dim violet.

Current code shows `waking` and the pane behind it shows `waking the crew…`. Both go.
"crew" is a word from another app and means nothing to him.

**t≤3s — the worker is up, the page has loaded depop.com.** The orb has read one fact:
is he signed in. Three outcomes, and the app must never guess:

**t=3s, signed out (the case that will actually happen):**

Orb copy: **`tap me — you're not signed in`**
Columns: flat, one row of low amber. Tint: amber.
And the orb **pulses once every 4 seconds** — a 3% scale breath. It is the only time the
orb ever moves to get attention while folded.

**t=4s — he clicks.** The window swells to the phone. Depop's mobile login is already
loaded (not depop.com — the login page, because the app knows he is signed out and should
not make him find it).

**t=5s — the sign-in sheet.** This is the screen that decides whether the app lives.

It is not the four floating chips that exist today. It is one sheet over the page, and it
says exactly this:

```
        sign in

  Google won't let you sign in
  inside an app like this. Two
  ways round it. Both take a minute.

  ┌───────────────────────────────┐
  │  make a password        (1)   │   ← primary, black
  └───────────────────────────────┘
  opens Depop in Chrome → "forgot
  password" → check your mail → come
  back here and type it in.

  ┌───────────────────────────────┐
  │  paste it from Chrome   (2)   │   ← secondary, grey
  └───────────────────────────────┘
  already signed in on Chrome? copy
  your cookies, press this.

                          skip for now
```

Rules for this sheet:

- **Five lines of explanation, total.** He does not read a wall. The reason Google is
  named is that he has clicked "Continue with Google" and watched it die, and naming the
  thing he already saw is what makes him trust the rest.
- **"make a password" is primary** because it is the one that works without him knowing
  what a cookie is.
- Pressing (1) opens `https://www.depop.com/login/` in **his** browser, and the sheet
  **changes on the spot** to: `go set it, then come back. I'll be here.` with one field
  and one button: `email` / `password` / **sign me in**. He returns to a form that is
  already waiting, not to the same sheet he already read.
- Pressing (2) shows a three-step card with the exact keystrokes, no jargon:
  `open depop.com in Chrome` / `⌥⌘I → Console → paste: copy(document.cookie)` /
  `come back, press this again`. Second press reads the clipboard and imports. The
  existing `importCookiesFromClipboard` is correct; only its discoverability is wrong.
- **"skip for now"** folds to the orb, which then reads `not signed in — nothing can run`.
  He is never trapped.

**t=~90s — signed in.** The moment `signedIn()` flips true, the phone does one thing:
a checkmark wipes across the sheet, the sheet dissolves, and the window folds itself back
to the orb **without him pressing anything**. He watches the app put itself away. That
single unprompted animation is worth more than any onboarding copy.

Orb copy: **`signed in as @handle — having a look`**. Tint crosses from amber to mint over
about two seconds.

**t=~2min — the first pass finishes.** Orb copy is one of the real work lines from §4.

### 1.3 Knowing which of the three states he is in

The worker must ask before it does anything. Today it does not — `onePass()` calls
`goto` then `read: listings` and never once calls `signedIn`. That is the single worst
bug in the flow, because a signed-out Alex is currently told
**"Nothing on the shop floor yet."** He reads that as "this app is empty and broken".

The fix, stated as a rule: **every pass begins with `read: status`, and the pass does not
continue unless `signedIn === true`.**

Three states, distinguished by what the page says, never by memory:

| state | how it is known | orb |
|---|---|---|
| **never signed in** | `signedIn()` false, and no handle was ever stored | `tap me — you're not signed in`, amber, breathing |
| **signed in** | `signedIn()` true and `who()` returns a handle | normal work copy, mint |
| **half signed in** | `signedIn()` true but `who()` is null, **or** signed in on `/messages` but a `/login` redirect happened in the last pass, **or** a `read` returned rows on one screen and a login form on the other | `half in — depop wants you again`, amber, breathing, and tapping goes straight to the sign-in sheet with `paste it from Chrome` promoted to primary |

The half-signed-in case is real and today it is invisible. Depop expires a web session
into a state where the shell renders but every action redirects. The app must treat "I
found the account menu but the handle is null" as suspicious, not as success.

`who()` must be widened to read the handle from `/messages` and from the sell screen, not
only from a header profile link, or half-signed-in will fire constantly as a false alarm.

### 1.4 The dead ends currently in this path, named

1. **Gatekeeper.** Not notarized. He stops here.
2. **`startingHTML` says "waking the crew…"** on a white page inside a phone-shaped
   window with no context. Delete.
3. **The orb says `waking` forever.** `show()` pushes state to `page.ask("panel", …)` —
   the board inside the Depop page, which is *behind the frost and invisible when folded*.
   Nothing ever sends `{t:"window", do:"status"}` to Swift, so `setStatus` is never called
   and `window.__orb.set` is never reached. **The orb, which is the entire product, is
   wired to nothing.** Fix: every `show()` sends both — the panel push *and* a window
   status message carrying `text`, `dot`, `taken`, `budget`.
4. **Four chips, always visible, always the same.** "Sign in to Depop", "Reset password",
   "Paste login", "Fold away" float over Depop whether he is signed in or not. Three of
   them are dead weight 99% of the time and the naming does not say which to press.
   Replaced by the sheet, which only exists when signed out.
5. **"Reset password" opens the browser and then says nothing on screen** — the
   instruction goes to `note()`, which writes into the page ticker, behind the frost. He
   presses the button, a browser opens, and the app looks unchanged.
6. **No signed-in check anywhere in the loop.** Covered above.
7. **The counter reads `0 LISTED · 20 LIVE`.** `budget` is the day's action cap, not live
   listings. It is a lie on the face of the app. Fix in §4.7.
8. **Three cookie jars named alibaba / 1688 / spare.** Wrong app. One jar, named `depop`.

---

## 2. The daily loop

### 2.1 He opens the laptop

flip is a login item and it was never quit. The orb is where he left it, bottom-right,
showing the truth from the last completed pass. Within 20 seconds of wake it has done a
pass and the line is current.

He should not have to touch it. The target is: **he touches flip only to press Take.**

### 2.2 What the orb shows through a normal day

Greek time, his hours (`09:30–13:30`, `16:00–21:30`, sometimes `22:30–00:30`, Sundays off).

- **09:35** `2 buyers waiting` → amber, columns high and busy. He taps.
- **10:10** `nothing due — all answered` → mint, columns low and slow.
- **12:30** `refreshing the 6 most-liked` → mint, columns pumping. No tap needed; refresh
  never asks him.
- **14:00** off the clock: `off the clock — back at 4` → violet, columns nearly still.
  **The line names the time it comes back.** "Off the clock" alone is the copy of an app
  that broke.
- **19:30** second refresh window, same as 12:30.
- **20:40** `chrome hearts ring — offer written` → amber, breathing. He taps, reads,
  presses Take.
- **23:10** `9 done today` → mint, columns settling.

### 2.3 If he ignores it for six hours

Nothing degrades and nothing queues up into a wall. Specifically:

- Refreshes and the clock-based work **happen without him**. Six ignored hours still
  produce two refresh windows of work done.
- Jobs that need a Take **stay on the board and do not expire** — `waitForTap` already has
  no timeout, which is right.
- But the pass **must not block on one of them.** Today `onePass` awaits `waitForTap(id)`
  forever, inside a `for` loop, inside a `passing` mutex. One unread reply at 09:35 stops
  every refresh, every offer and every other reply **for the rest of the day**. This is
  the bug that makes the app look dead after six hours. Fix: **a pass never waits for a
  tap.** It writes the job to the board and moves on; taps are handled out of band by a
  small handler that does the reading-delay and the typing when a Take arrives.
- The board is capped at **8 jobs**. Beyond that, the oldest non-urgent job is dropped and
  the orb says `8 waiting — more behind them`. A list of forty is a list he closes.

After six hours the orb says, for example: `4 waiting on you · 2h oldest`.

### 2.4 The attention model

The orb is ambient. It changes colour and copy and never makes a sound.

**flip is allowed to interrupt him — a real macOS notification — in exactly three cases:**

1. **A buyer has waited more than 3 hours 30 minutes** and a reply is written and
   untaken. (Depop's four-hour ranking window, minus the reading delay.) Copy:
   `maria's been waiting 3h. reply's written.` Button: **Take**.
2. **Signed out mid-session.** Copy: `depop signed you out.` Button: **Sign in**.
3. **A sale.** Copy: `sold — the carhartt jacket, €95.` No button. This one is a reward,
   not a task, and it is the reason he leaves the app installed.

**Never interrupt for:** a refresh, an offer, a listing draft, the worker restarting, a
pass finishing, being off the clock, or anything at all between 00:30 and 09:30 Athens
time, or on a Sunday before 16:00.

**Ceiling: three notifications a day.** After the third, the orb breathes and that is all.
An app that notifies six times is an app he mutes, and a muted app cannot tell him about
the sale.

Clicking any notification opens the phone directly on that job, board sheet already up.

---

## 3. The Take flow

### 3.1 Where he sees it

Not in the current bottom sheet inside the Depop page. That sheet is injected into the
site, sits behind the frost when folded, and duplicates the orb's job.

**The board is one sheet, over the phone, and it appears when he opens the phone.** Same
frosted material, same bottom position, but it is drawn by the app over the page, not
inside it, so it survives Depop navigating and never disappears when a selector moves.

One job per card, **only one card expanded at a time**, the rest collapsed to a line.

```
┌──────────────────────────────────────┐
│  ● flip      2 waiting       6 today │  ← the bar. tap to close.
├──────────────────────────────────────┤
│  maria_k                    waiting  │
│  reply · 3h — past the four hours    │    2h 51m
│                                      │
│  ┌────────────────────────────────┐  │
│  │ "is this real chrome hearts?"  │  │  ← her words, first, always
│  └────────────────────────────────┘  │
│                                      │
│  yeah 100% — got it from the london  │  ← the written reply
│  store in 2019, i still have the     │
│  receipt and the box. happy to send  │
│  pics of the stamp and the hallmark  │
│  if you want before you decide x     │
│                                      │
│  ┌──────────┐  ┌────────┐  ┌──────┐  │
│  │  Take    │  │  Edit  │  │ Skip │  │
│  └──────────┘  └────────┘  └──────┘  │
├──────────────────────────────────────┤
│  levi's 501 · offer · 12 likes, 19d  │  ← collapsed
└──────────────────────────────────────┘
```

What he reads, in order: **who**, **what they said**, **what flip wrote**. The buyer's own
words go above the reply and are never omitted — he cannot judge a reply without the
question, and today the panel shows only the reply.

**Edit** is new and it is not optional. He is the voice of the shop. Edit makes the reply
an editable text area in place; Take then types whatever is in the box. Without Edit his
only choices are "send words I would not say" or "Skip", and he will Skip, and then the
app does nothing.

### 3.2 What happens when he presses Take

The card changes immediately. No spinner anywhere in this app.

1. **`reading it over…`** — the human reading delay, shown as a thin progress line across
   the card with the seconds counting down: `typing in 40s`. He can press **Now** to skip
   the wait. He will, and that is fine — the pacing exists for rhythm across a day, and
   one impatient job does not break it.
2. **`typing…`** — the phone comes forward if it was folded, Depop is on the right thread,
   and the words go in character by character with the real typos and backspaces. **He
   watches this happen.** This is the moment the app proves itself and it must never be
   hidden behind the orb.
3. **`typed — press send`** — and the card shows one last thing: a thin arrow pointing at
   Depop's own send button, drawn over the page. The app does not press it. Ever.
4. When the page shows the message in the thread, the card collapses to a green line:
   `sent · 2m ago` and drops off the board after 60 seconds.

The counter on the orb goes up **on step 4 only** — when the page confirms it — never on
Take. Counting work that did not happen is the failure that ends trust in an app like
this, and it is called out in the worker's own comments.

### 3.3 The failure case: typing failed

Depop changed the page, or the thread scrolled away, or the composer is behind a modal.
`type` returns `found: false`.

Today the card says `could not find the box — open it on screen and it will try again` —
and it never tries again. That sentence is a lie and lies are what five broken builds feel
like.

What happens instead:

1. The card turns amber and says: **`can't find the message box. it's on screen — paste it
   in?`**
2. Two buttons: **Copy it** (puts the text on the clipboard, changes to `copied — paste
   it in`) and **Try again** (re-navigates to the thread and retries once, exactly once).
3. The phone stays open, on the thread, with the text visible. He can always finish by
   hand in eight seconds. **Every automated action in this app has a manual escape that
   takes under ten seconds.**
4. The failure is logged to the back end with the URL and what was searched for, so the
   selector gets fixed. Alex is never asked to report anything.
5. The day's counter does not move.

If the same selector fails **three times in one day**, flip stops attempting that action
type and the orb says `depop moved something — typing's off till it's fixed`. It keeps
reading and keeps showing written work with **Copy it** as the primary button. Degraded,
honest, still useful. It does not keep failing at him.

---

## 4. Every state, and what the orb says

`copy` is the line on the glass, lowercase, his voice. `columns` is the canvas behaviour.
`tint` is the wave colour. `breathe` means the 3%-scale pulse every 4s that asks for a tap.

### 4.1 never signed in
- copy: **`tap me — you're not signed in`**
- columns: one flat low row, no movement
- tint: amber · breathe: yes
- tap → sign-in sheet

### 4.2 signed out mid-session
- copy: **`depop signed you out. tap me`**
- columns: collapse to the floor over 1s, then still
- tint: amber · breathe: yes · notification: yes (one)
- tap → sign-in sheet with **paste it from Chrome** promoted, because a session that died
  was a session that existed and cookies are the fastest way back

### 4.3 half signed in
- copy: **`half in — depop wants you again`**
- columns: two, flickering irregularly
- tint: amber · breathe: yes
- tap → sign-in sheet

### 4.4 no stock to list
- copy: **`no stock waiting. shoot something`**
- columns: low, slow, even
- tint: violet · breathe: no
- This is the honest line for the gap in §6. It tells him the app is fine and the shop is
  the thing that is empty.

### 4.5 nothing due
- copy: **`all answered. nothing due`**
- columns: low, slow, even, gentle drift
- tint: mint · breathe: no

### 4.6 working
- copy: whatever it is doing, in plain words, and never a gerund with no object:
  `reading the inbox` / `refreshing the 6 most-liked` / `writing to maria_k` /
  `typing — watch` (the last one also un-folds the window)
- columns: full height, fast
- tint: mint · breathe: no

### 4.7 waiting on Claude
- copy: **`thinking about 3`**
- columns: a slow travelling wave left to right — visibly different from working, so the
  difference between "doing" and "thinking" is legible from across the room
- tint: mint, dimmer · breathe: no
- After 3 minutes: `still thinking about 3`. After 20 minutes it gives up on that job,
  the card says `couldn't write this one — tap to ask again`, and the pass continues.

### 4.8 waiting on him
- copy: **`2 waiting on you`** — and when one is late, **`maria's waited 3h`**, because a
  name and a number beat a count
- columns: all sixteen held at mid height, completely still. Stillness at height reads as
  held breath and is the strongest attention signal on the glass without motion.
- tint: amber · breathe: yes after 30 minutes · notification at 3h30m

### 4.9 rate-limited by its own rules
- copy: **`done enough today — 20`** or, in a window, **`too soon to touch these again`**
- columns: fade to 15% over 2s and hold
- tint: violet · breathe: no
- This is a success state and it must not look like an error. The rules that keep the
  account alive are the product.

### 4.10 off the clock
- copy: **`off the clock — back at 4`** (the real next hour, computed from `SELLER.hours`)
- columns: nearly still, a long slow swell
- tint: violet · breathe: no
- The **Work anyway** button moves here: a small chip that appears on the orb on hover.
  Today it lives inside the injected panel, which is invisible when folded — i.e. it is
  unreachable in exactly the state it exists for.

### 4.11 offline
- copy: **`no internet`**
- columns: all sixteen drop to the floor and stay there
- tint: grey, waves nearly flat
- Detected by a failed `cloud.status` **plus** a failed page navigation, not by one of
  them. It retries every 30s and says nothing more.

### 4.12 worker crashed / the app can't reach itself
- copy: **`something broke. restarting`**, then after two failed restarts
  **`broken. quit and open me again`**
- columns: frozen mid-animation for 1s, then flat
- tint: red · breathe: yes
- The worker is relaunched automatically twice. Only the third failure is his problem, and
  the instruction is one action he can actually do.
- Today: the Swift side shows a modal `NSAlert` saying "flip could not reach its worker on
  port N. Quit flip and open it again." A port number is noise to him. Kill the alert; the
  orb is the place.

### 4.13 sold
- copy: **`sold — carhartt jacket €95`** for 60 seconds, then back to the real state
- columns: one bright sweep left to right
- tint: full mint, briefly brighter · notification: yes

---

## 5. What to cut

Delete, in this order:

1. **The `pill` shape** (320×64). Never reached by any code path. It duplicates the orb
   with less information. Remove `Shape.pill`, `pillSize`, and both status-line layouts
   that exist only for it.
2. **The `desk` shape** (1400×820, three panes side by side). It is Clone Me's furniture.
   There is one site. Remove `Shape.desk`, `deskSize`, the three-pane layout, the active-
   pane ring, `activatePane`, and the `pane` window verb.
3. **The three cookie jars — `alibaba`, `1688`, `spare`.** One store, one identifier,
   named `depop`. Keep the identifier constant and written down; changing it signs him out.
4. **`switchProfile` and the `profile` verb.** One shop, one account.
5. **`statusDot` and `statusLabel`** (the native dot and text field). They are only ever
   visible in the shapes being deleted. The orb's canvas is the status.
6. **The four floating chips.** Replaced by the sign-in sheet, which exists only when
   signed out. The only persistent control on the phone is **Fold away**, and even that is
   secondary to Esc and ⌘W, which already work.
7. **`startingHTML`** ("waking the crew…"). The orb is up before the page is; there is
   nothing for this page to say.
8. **`takeShot` and the `snapshot` verb.** Nothing in flip's loop needs a PNG. It was for
   reading QR codes off a supplier page. Delete until the photo pipeline (§6) needs it, at
   which point it gets rewritten for a different job anyway.
9. **`--selftest` staying in the shipped binary.** Keep it in the build; strip the code
   path from the release. He will never run it and a diagnostic he cannot use is a
   diagnostic that only exists to fail in front of him.
10. **The panel's `pays` / money column and the `WAND` tag.** Copied from the other app.
    A Depop job does not "pay per hour". Show the price where it matters (an offer) and
    nowhere else.
11. **The `NSAlert` on worker failure and the `NSAlert` for page JS alerts.** Both are
    modal boxes over a borderless glass app. Route both to the orb line.
12. **`FLIP_UA=mac`.** The iPhone agent is the only one that signs in. An env var that
    breaks sign-in is a trap.

Kept, explicitly, against the instinct to cut: the wave canvas, the frosted live page
behind the orb, the drag-lean physics. They are the entire reason he believes it is
working, and they are cheap. **The orb is the product. The Depop window is the receipt.**

---

## 6. What is missing between "reads Depop" and "money arrives"

### Blockers — nothing sells without these

**1. There is no way to create a listing.** `work.mjs` decides `act: "list"` on a row with
`kind: "draft"`, and `sites/depop.js` never produces a `draft` row. Nothing does. The
entire listing half of the app is unreachable. The `list` verdict is currently dead code.

The fix is a **stock list**, and it must be the simplest possible thing: a folder.
`~/Library/Application Support/Flip/stock/`. One subfolder per item. He drops photos in
from his phone (AirDrop straight into the folder). The worker watches the folder; a new
subfolder with at least one image becomes a `draft` row on the board. That is the whole
intake mechanism and it needs no UI he has to learn.

**2. There is no way to fill Depop's listing form.** Typing into a message composer and
filling a multi-step listing form with photo upload, category, brand, size, condition and
price are not the same problem. This needs `sites/depop.js` to learn the sell flow, and
it needs the hands to drive a file input.

Decision: **the app fills every field and uploads the photos, then stops at the last
screen with everything filled in, and he presses List.** Same rule as messages.

**3. Photographs.** The playbook is explicit: four photos, styled first, detail, flat lay
with measurements, flaws. The app cannot take them and should not pretend to. What it
**must** do is refuse to build a listing from fewer than four photos and say so in his
words: `only 2 pics on the dickies. need 4 — you know the order`. A listing with one bad
photo is a listing that sits, and a shop of listings that sit is the failure mode.

**4. Measurements.** Every description needs pit-to-pit and length in inches, and PayPal
does not cover "not as described", so on those orders the listing is the entire defence.
The app cannot measure. So: when a draft appears, the card asks for exactly the
measurements that garment type needs — two or three number fields, nothing else — and the
listing is not written until they are filled. This is the one place the app is allowed to
make him type.

**5. The orb is not wired to Swift.** Restated here because it belongs on the blocker
list: today the orb cannot display a single real value. Nothing else in this document
works until `show()` emits `{t:"window", do:"status", text, dot, taken, budget}`.

### Can wait

- **Offers.** `act: "offer"` currently routes to the generic write-then-type-into-a-
  composer path, which is wrong — a Depop offer is a price change or an offer control, not
  a message. Until the control is mapped, **downgrade an offer to a price drop he
  confirms**, which notifies likers for free and is most of the value anyway.
- **Shipping.** He has no Depop labels, arranges his own courier, and carries the IOSS
  burden. That is a real cost and it is not software's yet. Later: a card after each sale
  with the address formatted for the courier, and nothing more.
- **Comp lookup.** Pricing against sold comps is currently Claude reading the playbook and
  guessing. A real sold-comp reader is a large piece of work and the shop can run on
  judgement plus his own floor price until volume justifies it.
- **Sold tracking / what sat.** Nice, not load-bearing. One number on the orb beats a
  dashboard he opens twice.
- **Cross-listing to Vinted or eBay.** Not until Depop is producing money weekly.
- **DAC7 / tax.** Not the app's job. An accountant's.

---

## 7. The ten-second test

He double-clicks. Ten seconds later, one of two things is true, or he never opens it again.

**What must be true, non-negotiable:**

1. **Something is on screen inside one second**, and it is the orb, not a white page, not
   a Dock bounce, not Terminal.
2. **The line on the orb is the truth about his shop**, in his language, and it is
   specific. `2 buyers waiting` passes. `waking the crew…` fails. `Ready` fails. Any
   sentence with a port number in it fails.
3. **It is visibly alive** — the columns move, the light slides when he drags it. A still
   image of a status is indistinguishable from a frozen app, and he has seen five frozen
   apps.
4. **If it needs something from him, it says exactly one thing and it is tappable.** Not
   four chips. Not a paragraph. One line, one tap.
5. **He does not have to press anything to make it start.** No "Start", no "Connect", no
   settings, no API key, no onboarding carousel. It is already working, or it is already
   telling him the one reason it is not.
6. **Nothing on screen is a lie.** No counter that counts Takes instead of sends, no "it
   will try again" from something that will not, no "Nothing on the shop floor" when the
   truth is "you are signed out". One lie caught is the end of the app, because he has
   already been lied to by five builds.

**The ten-second sentence he should be able to say out loud after opening it:**

> "it's working, and there's two people waiting for me."

If he cannot say that, nothing else in this document matters.
