/**
 * RETOLD — Family Voice-Page Worker (Component 3)
 * ------------------------------------------------
 * This is the little always-on program that runs on Cloudflare's network and
 * powers the private web page each family gets. When someone scans a QR code
 * printed inside their RETOLD book, this Worker serves the page that lets them
 * HEAR their parent's / grandparent's real recorded voice, chapter by chapter.
 *
 * What it does (three jobs):
 *
 *   1) POST /provision   — Called ONCE by the production engine after a book is
 *                          made. It registers the order, remembers which audio
 *                          clips belong to which chapter, and returns the secret
 *                          "token" that goes into every printed QR code.
 *
 *   2) GET  /f/:token    — The family voice page itself. A warm, RETOLD-styled
 *                          HTML page: one section per chapter, each with an audio
 *                          player. Supports #chapter-N jump links (so a chapter's
 *                          QR lands you right on that chapter) and ?from=Name
 *                          (so a grandchild's little "card" QR greets them by
 *                          name). The page is PRIVATE — you can only reach it if
 *                          you know the unguessable token.
 *
 *   3) GET  /f/:token/audio/:file
 *                        — Streams one chapter's audio clip straight out of our
 *                          private R2 storage bucket, WITHOUT ever making the
 *                          bucket public (this is the "zero-egress" streaming the
 *                          build contract asks for). Supports seeking/scrubbing
 *                          in the player via HTTP Range requests.
 *
 * HONESTY: every clip streamed here is the REAL parent's recording — only
 * trimmed by the engine, never cloned or synthesised. This Worker just serves it.
 *
 * ---------------------------------------------------------------------------
 * FROZEN CONTRACTS (do not change casually — printed QR codes depend on them):
 *
 *   • URL shape ...................  https://retold.family/f/<token>
 *   • Chapter anchor .............  https://retold.family/f/<token>#chapter-<N>
 *   • Grandchild card link .......  https://retold.family/f/<token>?from=<Name>
 *   • Token scheme ...............  URL-safe base64 of 16 random bytes, i.e. the
 *                                   exact same shape as the engine's Python
 *                                   secrets.token_urlsafe(12). Once a book is
 *                                   printed with a token, that token is permanent.
 *
 * If you re-provision the same order_id, you get the SAME token back, so nothing
 * that was already printed can ever break.
 * ---------------------------------------------------------------------------
 *
 * Cloudflare bindings this Worker expects (see wrangler.toml):
 *   • CF_R2_BUCKET  — the R2 bucket that holds the audio clips (private).
 *   • FAMILIES      — a KV namespace that remembers each family's page metadata.
 *   • env.RETOLD_DOMAIN (optional var) — defaults to "retold.family".
 */

const DEFAULT_DOMAIN = "retold.family";

/* RETOLD brand palette + type — kept in one place so the page always matches
   the printed book and the film. */
const BRAND = {
  cream: "#F4EDDB",
  forest: "#1F4934",
  gold: "#C7A44B",
  serif: "Georgia, 'Times New Roman', serif",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      // --- Health check (handy for the owner to confirm it's alive) ----------
      if (pathname === "/" || pathname === "/health") {
        return json({ ok: true, service: "retold-voice-page" });
      }

      // --- 1) Provision a new family page -----------------------------------
      if (pathname === "/provision" && request.method === "POST") {
        return await handleProvision(request, env);
      }

      // --- 3) Stream a chapter's audio clip from private R2 -----------------
      //     Matches /f/<token>/audio/<file>
      const audioMatch = pathname.match(/^\/f\/([^/]+)\/audio\/([^/]+)$/);
      if (audioMatch && request.method === "GET") {
        return await handleAudio(request, env, decodeURIComponent(audioMatch[1]), decodeURIComponent(audioMatch[2]));
      }

      // --- 2) Serve the family voice page ------------------------------------
      //     Matches /f/<token>
      const pageMatch = pathname.match(/^\/f\/([^/]+)\/?$/);
      if (pageMatch && request.method === "GET") {
        return await handlePage(env, decodeURIComponent(pageMatch[1]), url);
      }

      return notFound();
    } catch (err) {
      // Never leak internals to a family; log for the owner.
      console.error("RETOLD worker error:", err && err.stack ? err.stack : err);
      return new Response("Something went wrong on our end.", { status: 500 });
    }
  },
};

/* ========================================================================== *
 *  1) PROVISION
 * ========================================================================== */

/**
 * POST /provision
 * Body: {
 *   order_id:  "1001",                      // required — the Shopify order id
 *   token:     "abc123..."                  // optional — pass the token the
 *                                           //   engine already put in book.json
 *                                           //   so the QR codes match. If omitted
 *                                           //   we mint one and return it.
 *   subject:   { name, relation, ... },     // optional — for the page heading
 *   cover:     { title, wordmark, ... },    // optional — for the page title
 *   chapters:  [ { n, title, pull_quote, photo_caption,
 *                  audio_clip: { clip_file } } , ... ],
 *   grandchildren: [ { name }, ... ] or [ "Mia", ... ]
 * }
 *
 * Idempotent: calling twice for the same order_id returns the SAME token, so a
 * printed QR can never be orphaned.
 *
 * Returns: { token, url, provisioned: true }
 */
async function handleProvision(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const orderId = String(body.order_id || "").trim();
  if (!orderId) return json({ error: "order_id is required." }, 400);

  const domain = env.RETOLD_DOMAIN || DEFAULT_DOMAIN;

  // Idempotency: if this order was already provisioned, reuse its token so the
  // token that may already be printed on paper stays valid forever.
  const existingToken = await env.FAMILIES.get(`order:${orderId}`);
  const token = existingToken || (isSafeToken(body.token) ? body.token : mintToken());

  // Normalise chapters into exactly what the page needs. We store the R2 object
  // KEY for each clip rather than a public URL (zero-egress streaming).
  const chapters = (Array.isArray(body.chapters) ? body.chapters : []).map((ch) => {
    const clipFile = ch && ch.audio_clip ? ch.audio_clip.clip_file : ch && ch.clip_file;
    const clipName = basename(clipFile) || `ch${ch.n}.mp3`;
    return {
      n: Number(ch.n),
      title: String(ch.title || `Chapter ${ch.n}`),
      anchor: `chapter-${ch.n}`,
      pull_quote: ch.pull_quote ? String(ch.pull_quote) : "",
      photo_caption: ch.photo_caption ? String(ch.photo_caption) : "",
      // Frozen R2 layout: <order_id>/audio/<clip_basename>.  The engine's R2
      // uploader writes clips to exactly this key.
      clip_key: `${orderId}/audio/${clipName}`,
      // The relative URL the browser's <audio> element will hit; the Worker maps
      // it back to clip_key and streams from private R2.
      clip_url: `audio/${clipName}`,
    };
  });

  // Grandchildren may arrive as plain strings or as objects — accept both.
  const grandchildren = (Array.isArray(body.grandchildren) ? body.grandchildren : []).map((gc) =>
    typeof gc === "string" ? { name: gc } : { name: String(gc.name || "") }
  ).filter((gc) => gc.name);

  const record = {
    order_id: orderId,
    token,
    subject: body.subject || {},
    cover: body.cover || {},
    chapters,
    grandchildren,
    provisioned_at: new Date().toISOString(),
  };

  // Store both directions: token -> page data, and order -> token (idempotency).
  await env.FAMILIES.put(`family:${token}`, JSON.stringify(record));
  await env.FAMILIES.put(`order:${orderId}`, token);

  return json({
    token,
    url: `https://${domain}/f/${token}`,
    provisioned: true,
    reused: Boolean(existingToken),
  });
}

/* ========================================================================== *
 *  2) THE FAMILY VOICE PAGE
 * ========================================================================== */

async function handlePage(env, token, url) {
  const raw = await env.FAMILIES.get(`family:${token}`);
  if (!raw) return notFound(); // unknown / guessed token → looks like any 404

  const data = JSON.parse(raw);
  const fromName = sanitizeName(url.searchParams.get("from"));

  const html = renderPage(data, fromName);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Private page: don't let shared caches store it, and keep it out of
      // search engines.
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}

/* ========================================================================== *
 *  3) ZERO-EGRESS AUDIO STREAMING FROM R2
 * ========================================================================== */

async function handleAudio(request, env, token, file) {
  // The token must resolve to a real family, and the requested file must be one
  // of THAT family's chapter clips. This stops anyone poking at other people's
  // audio by guessing filenames.
  const raw = await env.FAMILIES.get(`family:${token}`);
  if (!raw) return notFound();
  const data = JSON.parse(raw);

  const cleanFile = basename(file);
  const chapter = data.chapters.find((c) => basename(c.clip_url) === cleanFile);
  if (!chapter) return notFound();

  const key = chapter.clip_key;

  // Support HTTP Range so the player can seek/scrub and mobile browsers stream
  // instead of downloading the whole clip up front.
  const range = request.headers.get("range");
  const rangeObj = parseRange(range);

  const object = await env.CF_R2_BUCKET.get(key, rangeObj ? { range: rangeObj } : undefined);
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", object.httpMetadata?.contentType || "audio/mpeg");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  headers.set("etag", object.httpEtag);

  const size = object.size; // full object size (R2 reports this even on a range get)
  if (rangeObj && object.range) {
    const start = object.range.offset;
    const length = object.range.length;
    const end = start + length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(size));
  return new Response(object.body, { status: 200, headers });
}

/* ========================================================================== *
 *  HTML RENDERING — RETOLD cream / forest green / gold, Georgia serif
 * ========================================================================== */

function renderPage(data, fromName) {
  const subjectName = esc(data.subject?.name || "your family");
  const relation = esc(data.subject?.relation || "");
  const bookTitle = esc(data.cover?.title || `The Life of ${data.subject?.name || ""}`.trim());
  const wordmark = esc(data.cover?.wordmark || "Retold");

  // Personalised greeting when arriving via a grandchild card (?from=Name).
  const greeting = fromName
    ? `<p class="from-note">A little hello for <strong>${esc(fromName)}</strong> — press play and hear ${relation ? "your " + relation : subjectName} again.</p>`
    : "";

  const chapterSections = (data.chapters || [])
    .sort((a, b) => a.n - b.n)
    .map((ch) => renderChapter(ch))
    .join("\n");

  // A small "jump to a voice" nav for longer books.
  const chapterNav = (data.chapters || [])
    .sort((a, b) => a.n - b.n)
    .map((ch) => `<a href="#${esc(ch.anchor)}">${ch.n}. ${esc(ch.title)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${bookTitle} — ${wordmark}</title>
<style>
  :root {
    --cream: ${BRAND.cream};
    --forest: ${BRAND.forest};
    --gold: ${BRAND.gold};
    --serif: ${BRAND.serif};
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--cream);
    color: var(--forest);
    font-family: var(--serif);
    line-height: 1.65;
    font-size: 18px;
  }
  a { color: var(--forest); }
  .wrap { max-width: 720px; margin: 0 auto; padding: 0 22px 96px; }

  header.masthead {
    text-align: center;
    padding: 56px 22px 40px;
    border-bottom: 2px solid var(--gold);
  }
  .wordmark {
    text-transform: uppercase;
    letter-spacing: 0.42em;
    font-size: 13px;
    color: var(--gold);
    margin: 0 0 18px;
    padding-left: 0.42em; /* optical center for the tracking */
  }
  header.masthead h1 {
    font-size: clamp(30px, 6vw, 46px);
    font-weight: normal;
    margin: 0 0 8px;
    line-height: 1.15;
  }
  header.masthead .sub {
    font-style: italic;
    color: var(--forest);
    opacity: 0.8;
    margin: 0;
  }
  .from-note {
    text-align: center;
    font-style: italic;
    background: rgba(199,164,75,0.14);
    border: 1px solid var(--gold);
    border-radius: 10px;
    padding: 14px 18px;
    margin: 28px 0 0;
  }

  nav.chapters {
    margin: 34px 0 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    justify-content: center;
    font-size: 15px;
  }
  nav.chapters a { text-decoration: none; opacity: 0.85; }
  nav.chapters a:hover { text-decoration: underline; opacity: 1; }

  section.chapter {
    padding: 40px 0 8px;
    border-top: 1px solid rgba(31,73,52,0.18);
    scroll-margin-top: 18px;
  }
  section.chapter:first-of-type { border-top: none; }
  .chapter-num {
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 12px;
    color: var(--gold);
    margin: 0 0 6px;
  }
  section.chapter h2 {
    font-weight: normal;
    font-size: clamp(23px, 4.5vw, 30px);
    margin: 0 0 18px;
  }
  blockquote.pull {
    margin: 0 0 22px;
    padding: 6px 0 6px 20px;
    border-left: 3px solid var(--gold);
    font-style: italic;
    font-size: 20px;
    color: var(--forest);
  }

  .player {
    background: var(--forest);
    color: var(--cream);
    border-radius: 14px;
    padding: 18px 18px 16px;
    box-shadow: 0 6px 20px rgba(31,73,52,0.18);
  }
  .player .label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    letter-spacing: 0.06em;
    margin-bottom: 12px;
    color: var(--gold);
  }
  .player .label svg { flex: 0 0 auto; }
  audio {
    width: 100%;
    display: block;
    filter: saturate(1.05);
  }
  .caption {
    font-size: 14px;
    font-style: italic;
    opacity: 0.75;
    margin: 12px 2px 0;
  }

  footer.foot {
    text-align: center;
    margin-top: 64px;
    padding-top: 26px;
    border-top: 2px solid var(--gold);
    font-size: 13px;
    opacity: 0.7;
  }
  footer.foot .mark {
    text-transform: uppercase;
    letter-spacing: 0.42em;
    color: var(--gold);
    padding-left: 0.42em;
  }

  @media (max-width: 480px) {
    body { font-size: 17px; }
    header.masthead { padding-top: 40px; }
  }
</style>
</head>
<body>
  <header class="masthead">
    <p class="wordmark">${wordmark}</p>
    <h1>${bookTitle}</h1>
    ${relation ? `<p class="sub">In ${subjectName}'s own voice</p>` : `<p class="sub">In their own voice</p>`}
  </header>

  <div class="wrap">
    ${greeting}
    ${chapterNav ? `<nav class="chapters">${chapterNav}</nav>` : ""}

    ${chapterSections || `<p style="text-align:center;margin-top:48px;font-style:italic;">This voice page is being prepared.</p>`}

    <footer class="foot">
      <p class="mark">${wordmark}</p>
      <p>The voice you hear is real — recorded, gently trimmed, never imitated.</p>
    </footer>
  </div>
</body>
</html>`;
}

function renderChapter(ch) {
  const pull = ch.pull_quote ? `<blockquote class="pull">${esc(ch.pull_quote)}</blockquote>` : "";
  const caption = ch.photo_caption ? `<p class="caption">${esc(ch.photo_caption)}</p>` : "";
  // clip_url is relative to /f/<token>/, giving /f/<token>/audio/chN.mp3
  const src = esc(ch.clip_url);
  return `<section class="chapter" id="${esc(ch.anchor)}">
      <p class="chapter-num">Chapter ${ch.n}</p>
      <h2>${esc(ch.title)}</h2>
      ${pull}
      <div class="player">
        <div class="label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${BRAND.gold}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4M7 6v12M11 3v18M15 8v8M19 5v14"/></svg>
          Listen to this chapter
        </div>
        <audio controls preload="none" src="${src}"></audio>
      </div>
      ${caption}
    </section>`;
}

/* ========================================================================== *
 *  SMALL HELPERS
 * ========================================================================== */

/** Mint a fresh unguessable token: URL-safe base64 of 16 random bytes.
 *  Same shape/family as the engine's Python secrets.token_urlsafe(12). */
function mintToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Accept a caller-supplied token only if it's the safe alphabet we expect,
 *  so we never store something weird that could break a URL. */
function isSafeToken(t) {
  return typeof t === "string" && t.length >= 8 && t.length <= 64 && /^[A-Za-z0-9_-]+$/.test(t);
}

/** last path segment, no query/hash, no directory tricks. */
function basename(p) {
  if (!p) return "";
  const s = String(p).split(/[?#]/)[0];
  const parts = s.split("/");
  return parts[parts.length - 1] || "";
}

/** Names arrive from ?from= in a QR — keep them short & harmless (escaping in
 *  esc() handles HTML safety; this just trims noise). */
function sanitizeName(name) {
  if (!name) return "";
  return String(name).replace(/[^\p{L}\p{N} '.-]/gu, "").trim().slice(0, 40);
}

/** Parse an HTTP Range header into R2's { offset, length } form. Single range
 *  only (which is all browsers ask for on <audio>). */
function parseRange(header) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const start = m[1] === "" ? undefined : parseInt(m[1], 10);
  const end = m[2] === "" ? undefined : parseInt(m[2], 10);
  if (start === undefined && end === undefined) return null;
  if (start !== undefined && end !== undefined) return { offset: start, length: end - start + 1 };
  if (start !== undefined) return { offset: start }; // to end of object
  // suffix range "bytes=-N" (last N bytes)
  return { suffix: end };
}

/** HTML-escape any value that might contain user/AI text. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function notFound() {
  return new Response("Not found.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
  });
}
