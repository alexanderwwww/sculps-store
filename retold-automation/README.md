# RETOLD — the automation behind the memory book

Turn one Shopify order + a recorded interview with a parent or grandparent into a
**finished, print-ready memory book** (and, optionally, a short **memory film**) —
with almost no human work in between.

> **This README assumes you are not a programmer.** It explains what every piece
> is, what you set up once, and how an order flows through by itself. Take it one
> section at a time.

---

## 1. What this actually is

A customer buys a book on your Shopify store and tells us the parent's **phone
number**. From there this system runs **entirely on its own — no human in the
loop**:

0. **Interviews the parent by AI voice call** — a warm agent phones them over a
   few short, gentle sessions (childhood → love → wisdom) and records it all.
   The agent asks the questions in its *own* neutral voice; the **parent's real
   voice is only recorded, never cloned.** (This is the `interview/` component.)
1. **Transcribes** the recording (turns the voice into text, with speaker labels).
2. **Writes the book** — Claude drafts warm, first-person chapters *in the
   speaker's own words*, then a **separate honesty check** re-reads the transcript
   and flags anything invented. Nothing is made up.
3. **Illustrates** each chapter with a soft painterly picture (never a fake photo
   of a real face — a promise baked into the code).
4. **Cuts the real voice** into a short clip per chapter (only trimmed — **never
   cloned or faked**).
5. **Makes QR codes** so that, inside the printed book, a family member can scan a
   chapter and *hear the parent's real voice* on a private web page.
6. **Renders two press-ready PDFs** — the interior pages and the wrap cover.
7. **Sends them to a print-on-demand printer** that prints and ships the book.
8. **Emails the customer** at each step ("we're writing it", "it's printing",
   "it's on its way").
9. For the film product, also **renders a short movie** — the same illustrations
   gently panning, with the real voice and captions.

The whole thing is stitched together by **n8n** (a visual "when this happens, do
that" tool — no coding), and the private voice pages run on **Cloudflare**.

### The honesty promise (this is a selling point, and it's enforced in code)
- The **interview is run by AI, but the parent's voice is real** — the agent
  only asks questions; the parent's answers are recorded, never cloned.
- The **voice is always real** — only trimmed, never synthesized or cloned.
- **No invented facts or quotes** — a dedicated Claude QC pass checks every draft
  against the transcript.
- **Illustrations never render a photoreal real face** — figures are shown from
  behind, at a distance, or stylized.

---

## 2. The pieces (folders in this project)

| Folder | Plain-English job | Do you touch it? |
|--------|-------------------|------------------|
| `interview/` | The AI voice interviewer. Phones the parent and records the story — no human interviewer. | Edit the questions; else run it. |
| `engine/` | The brain. One command turns an order into the whole book. | Run it; don't edit. |
| `templates/` | Turns the book's data into the two beautiful PDFs. | No. |
| `worker/` | The little Cloudflare program that serves each family's private voice page. | Deploy once (its own README). |
| `n8n/` | The visual pipeline that runs everything automatically on each order. | Import once. |
| `integrations/` | Small connectors to Shopify, Lulu, Peecho, Shotstack, Klaviyo. | No. |
| `film/` | The look-and-feel template for the memory movie. | Optional tweaks. |
| `samples/` | A pretend order + interview so you can test with no real data. | For testing. |

**The one thing worth understanding:** every component talks through a single file
called **`book.json`**. The engine *writes* it; the PDF maker, the film, and the
voice page all *read* it. If you ever peek inside `out/<order>/book.json` you can
see the whole book as plain data.

---

## 3. Try it right now (no accounts, no keys, 2 minutes)

This proves the machine works before you sign up for anything.

```bash
# from this folder:
make setup        # installs the Python tools and creates your .env
make test-mock    # builds a COMPLETE sample book — no API keys, no internet
```

Then open the results in `out/test/`:
- **`interior.pdf`** — the inside pages of a sample memory book.
- **`cover.pdf`** — the full wrap cover.
- **`book.json`** — the master data object.
- `assets/`, `audio/` — the illustrations, QR codes, and voice clips.

Everything you see there was generated from the pretend order in
`samples/sample_order.json`. When you plug in real keys, the same command
produces the real thing (real transcription, real writing, real art).

> If `make` isn't available on your computer, run the same thing directly:
> `python engine/produce.py --order samples/sample_order.json --out out/test/ --mock`

---

## 4. One-time setup (do this once, in order)

You do **not** need everything at once — see the phased rollout in section 6. But
here is the full list.

### Step A — Install the tools
```bash
make setup
```
This installs the Python packages and copies `.env.example` to `.env`.

The book PDF renderer (**WeasyPrint**) also needs a few system graphics
libraries. Install them with your operating system's package manager:
- **macOS:** `brew install weasyprint` (or `brew install pango cairo gdk-pixbuf libffi`)
- **Ubuntu/Debian:** `sudo apt-get install libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi-dev`
- To cut real audio clips you also want **ffmpeg**: `brew install ffmpeg` or
  `sudo apt-get install ffmpeg`.

*(If WeasyPrint or ffmpeg are missing, the engine still finishes — it just uses a
plainer proof PDF and simple audio slices. Great for testing, install them for
production quality.)*

### Step B — Make these accounts and copy their keys
Open your new **`.env`** file and paste each key next to its name. `.env.example`
tells you exactly where to click for each one. In short:

| Account | Why you need it | Free to start? |
|---------|-----------------|----------------|
| **Anthropic (Claude)** | Writes the chapters + honesty check | Pay-as-you-go |
| **AssemblyAI** | Transcribes the interview | Free tier |
| **fal.ai** | Paints the chapter illustrations | Pay-as-you-go |
| **Shopify** | Where orders come from | Your store |
| **Lulu** | Prints & ships the book (use SANDBOX first) | Sandbox free |
| **Peecho** | Prints the grandchild voice cards | Pay-per-print |
| **Cloudflare** | Private audio storage + voice pages | Free tier |
| **Klaviyo** | The customer status emails | Free tier |
| **Shotstack** *(film only)* | Renders the memory movie | Free stage |
| **Bunny** *(film only)* | Hosts the finished film | Cheap |

> **Never paste keys anywhere except `.env`.** Every part of this project reads
> from `.env` and nothing is ever hardcoded. Don't share or commit that file.

### Step C — Deploy the voice-page Worker
The QR codes in the printed book point at `https://retold.family/f/…`. That page
is served by the small program in **`worker/`**. Follow **`worker/README.md`** —
it walks you through `npx wrangler login`, creating the storage, and deploying.
Takes about ten minutes and you only do it once.

### Step D — Import the pipeline into n8n
**n8n** is a free visual automation tool (think: a flowchart that actually runs).
1. Get n8n — the easiest is **n8n Cloud** (n8n.io) or run it yourself.
2. In n8n click **Import from File** and choose **`n8n/retold-pipeline.json`**.
3. You'll see the whole flow as labelled boxes (Webhook → verify → transcribe →
   write book → proof → print → email). Open **Credentials** and paste the same
   keys from your `.env` where n8n asks (Shopify, Klaviyo, etc.).
4. In Shopify, add a **webhook** for **"Order payment"** pointing at the URL n8n
   shows for its first node. Now every paid order starts the pipeline.

### Step E — Point your Shopify products at it
Make sure your two products use the SKUs the engine understands:
- **`book`** — the book only.
- **`book_film`** — the book **and** the memory film.

That's it. The rest runs itself.

---

## 5. How one order flows (the whole story)

```
Customer buys on Shopify
        │
        ▼
 n8n receives "order paid"  ──►  verifies it's really from Shopify (HMAC)
        │
        ▼
 Customer gets an email + a link to book the interview / upload the recording
        │
        ▼
 Recording arrives ──► stored privately in Cloudflare R2
        │
        ▼
 AssemblyAI transcribes it  (speaker labels + word timings)
        │
        ▼
 THE ENGINE runs:  python engine/produce.py --order … --out out/<order>/
   • Claude writes the chapters, in the speaker's own voice
   • a SEPARATE Claude pass checks nothing was invented
   • fal.ai paints each chapter (no photoreal faces)
   • the real voice is trimmed into one clip per chapter
   • gold QR codes + grandchild cards are made
   • interior.pdf + cover.pdf are rendered
   • book.json + voice_page.json are written
        │
        ▼
 You get a "proof ready" email and approve it  (a human gate — optional to keep)
        │
        ▼
 Voice page is provisioned on Cloudflare  (QR codes now work)
 Lulu prints & ships the book   +   Peecho prints the grandchild cards
 (book_film only) Shotstack renders the movie
        │
        ▼
 Customer gets "it's printing" then "it's on its way" emails (Klaviyo)
```

At every step the customer is kept warm with an email, and **you** only really do
one thing by hand: capture the interview, and (if you keep the gate) click
"approve" on the proof.

---

## 6. Rolling it out in three phases

Don't try to switch everything on at once. This order de-risks it.

### Phase 1 — Prove the book (this week, ~$0)
- Run `make test-mock` and inspect `out/test/interior.pdf`. Love the look.
- Add just **three keys**: `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `FAL_KEY`.
- Record one real interview, drop the file next to a small order JSON, and run
  the engine **for real** (no `--mock`):
  `make produce ORDER=my_order.json OUT=out/9001`
- Hold the finished PDF proof in your hands (order one from Lulu's sandbox).
  **Goal: you trust the book quality.**

### Phase 2 — Make it a real product (next)
- Deploy the **Worker** (section C) and confirm scanning a QR plays the voice.
- Turn on **Lulu** (start in `LULU_SANDBOX=true`), **Peecho**, **Cloudflare R2**,
  and **Klaviyo** emails.
- Fulfil a handful of real orders **semi-manually** — run the engine yourself,
  eyeball each proof, then let it print. **Goal: end-to-end with a human driving.**

### Phase 3 — Automate the pipeline (scale)
- Import **`n8n/retold-pipeline.json`**, wire the Shopify webhook, and let orders
  flow on their own. Keep the **proof-approval gate** on until you've shipped
  enough books to trust it blind.
- Flip Lulu to production (`LULU_SANDBOX=false`).
- Turn on the **film** (`book_film` SKU → Shotstack + Bunny) once the book line is
  humming. **Goal: an order arrives and a book ships with a single approval click.**

---

## 7. The credit-spending rule (please respect it)
Some steps cost real money each time (Claude writing, transcription, art, print).
Before you flip anything from sandbox/mock to live, **know the per-order cost** and
turn services on one at a time. `--mock` and Lulu **sandbox** let you rehearse the
entire flow for free — use them generously.

---

## 8. Everyday commands

| I want to… | Command |
|------------|---------|
| Prove it works with no keys | `make test-mock` |
| Build a real order | `make produce ORDER=path/to/order.json OUT=out/1234` |
| See a finished book | open `out/<order>/interior.pdf` and `cover.pdf` |
| Re-deploy the voice page | in `worker/`: `npx wrangler deploy` |
| Delete generated files | `make clean` |

---

## 9. If something looks wrong
- **The PDF looks plain / typewriter-ish.** WeasyPrint isn't installed — the
  engine used its built-in proof renderer. Install WeasyPrint (section A) for the
  branded book.
- **Audio clips are silent/short or QR codes look like a placeholder box.** ffmpeg
  and/or the `segno` package aren't installed. Install them (`make setup` covers
  `segno`; `ffmpeg` is a system install). The pipeline still completes without
  them — the output is just placeholder-quality.
- **A step says it "flagged possible fabrications."** That's the honesty QC doing
  its job. Open `out/<order>/book.json` and read the `_qc` section before
  printing.
- **The engine ran with no keys and still produced a book.** That's `--mock` (or a
  missing key) using sample content — never sell mock output as a real customer's
  book.

Everything here is built to **degrade gracefully**: a run always finishes with a
complete, openable proof, so you're never stuck.
