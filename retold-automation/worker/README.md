# RETOLD — Family Voice-Page Worker

This is the small program that runs on Cloudflare and powers the **private web
page each family gets**. When someone scans a QR code inside their RETOLD book,
this Worker serves a warm, RETOLD-styled page where they can **hear their parent's
or grandparent's real recorded voice**, chapter by chapter.

You do **not** need to be a programmer to run this. Follow the steps below once,
and it just keeps working.

> **The voice is always real.** Every clip is the actual recording, only trimmed
> by our engine — never cloned or imitated. This Worker simply serves it.

---

## What it does

| Route | Who calls it | What happens |
|-------|--------------|--------------|
| `POST /provision` | Our production engine, once per order | Registers the family, remembers which audio clip belongs to which chapter, and returns the secret **token** that goes into every printed QR code. |
| `GET /f/<token>` | A family member (via QR) | Serves their private voice page — one section per chapter, each with an audio player. |
| `GET /f/<token>#chapter-3` | A chapter's QR code | Same page, scrolled straight to that chapter. |
| `GET /f/<token>?from=Mia` | A grandchild's card QR | Same page, with a personal hello for that grandchild. |
| `GET /f/<token>/audio/ch3.mp3` | The audio player on the page | Streams that chapter's clip straight from private storage. |

The token is **unguessable and permanent**. Re-running provision for the same
order returns the *same* token, so a QR that's already been printed can never break.

---

## One-time setup

You'll need a free/cheap **Cloudflare account** and the domain **retold.family**
added to it (Cloudflare calls this a "zone").

### 1. Install the tools
From this `worker/` folder, in a terminal:

```bash
npm install
```

### 2. Log in to Cloudflare
```bash
npx wrangler login
```
A browser window opens — click **Allow**. That's it.

### 3. Create the little database (KV) that remembers each family
```bash
npx wrangler kv namespace create FAMILIES
```
This prints something like:
```
id = "abc123def456..."
```
Copy that `id` and paste it into **`wrangler.toml`**, replacing
`PASTE_YOUR_KV_NAMESPACE_ID_HERE`.

### 4. Point it at your audio storage bucket
In **`wrangler.toml`**, make sure `bucket_name` under `[[r2_buckets]]` matches the
R2 bucket name in your project's `.env` (`CF_R2_BUCKET`). The default is
`retold-family`. If your bucket doesn't exist yet:
```bash
npx wrangler r2 bucket create retold-family
```

### 5. Deploy
```bash
npx wrangler deploy
```
It prints a live URL like `https://retold-voice-page.<you>.workers.dev`.
You can test it now: open that URL — you should see `{"ok":true,...}`.

### 6. Put it on retold.family (so printed QR codes work)
The printed QR codes point at **`https://retold.family/f/...`**, so the Worker must
answer on that domain. Easiest way, in the Cloudflare dashboard:

1. Go to **Workers & Pages → `retold-voice-page` → Settings → Domains & Routes**.
2. Add route **`retold.family/f/*`**.
3. Add route **`retold.family/provision`**.

(Advanced: you can instead un-comment the `[[routes]]` blocks in `wrangler.toml`
and re-run `npx wrangler deploy`.)

Done. The voice pages are live.

---

## How the engine talks to it

After the engine builds a book, it (or the n8n flow) calls provision **once**:

```bash
curl -X POST https://retold.family/provision \
  -H "content-type: application/json" \
  -d '{
        "order_id": "1001",
        "token": "the-token-from-book.json",
        "subject": { "name": "Rosa", "relation": "grandmother" },
        "cover":   { "title": "The Life of Rosa", "wordmark": "Retold" },
        "chapters": [
          { "n": 1, "title": "A Life Rooted in Love",
            "pull_quote": "We had nothing, and we had everything.",
            "photo_caption": "Summer in Calabria, 1961",
            "audio_clip": { "clip_file": "audio/ch1.mp3" } }
        ],
        "grandchildren": [ { "name": "Mia" }, { "name": "Luca" } ]
      }'
```

**Pass the `token` that's already in `book.json`** so the page matches the QR codes
printed in the book. (If you leave `token` out, the Worker mints one and returns it
— use that only if you provision *before* printing.)

Response:
```json
{ "token": "…", "url": "https://retold.family/f/…", "provisioned": true }
```

### Where the audio must live (frozen layout)
The engine's R2 uploader must place each chapter clip at:

```
<bucket>/<order_id>/audio/<clip-filename>
```

e.g. for order `1001`, chapter 1's `audio/ch1.mp3` goes to the R2 key
`1001/audio/ch1.mp3`. The Worker builds this key automatically from the
`order_id` + each chapter's `clip_file`, then streams it privately — the bucket
never needs to be public.

---

## Everyday commands

| I want to… | Command |
|------------|---------|
| Re-deploy after a change | `npx wrangler deploy` |
| Watch live logs (see visits/errors) | `npx wrangler tail` |
| Test locally before deploying | `npx wrangler dev` |

---

## Frozen contracts (please don't change without care)

Printed books depend on these staying identical forever:

- URL shape: `https://retold.family/f/<token>`
- Chapter jump: `…/f/<token>#chapter-<N>`
- Grandchild card: `…/f/<token>?from=<Name>`
- Token shape: URL-safe base64 of 16 random bytes (matches the engine)
- R2 audio key: `<order_id>/audio/<clip-filename>`

If any of these change, QR codes already printed in delivered books could stop
working. Provision is idempotent specifically to protect this.
