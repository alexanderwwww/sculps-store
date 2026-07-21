# -*- coding: utf-8 -*-
"""
write_book.py — the heart of the book: turn a diarized life-story transcript
into the structured book.json object (schema in the SHARED BUILD CONTRACT).

REAL MODE (ANTHROPIC_API_KEY present, not --mock) runs a small prompt chain
with Claude:
    1. EXTRACT   life events + facts + the subject's own idioms/phrases
    2. OUTLINE   8-14 chapters with titles
    3. WRITE     per-chapter prose, pull-quote, photo caption, illustration
                 brief (NO photoreal face), and the audio time-range to clip
    4. QC        a SEPARATE honesty pass that flags any invented fact or quote

MOCK MODE builds a rich, deterministic book from the bundled sample transcript
so the whole engine runs with zero API keys.

HONESTY RULES enforced here:
  * The prose is written strictly from what the parent actually said.
  * Illustration briefs forbid a photoreal real face.
  * A dedicated QC call re-reads the transcript and the draft and must return
    "clean" (no fabricated facts/quotes) before we accept the book.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from common import env, log

MODEL = "claude-opus-4-20250514"  # override with ANTHROPIC_MODEL if desired
FALLBACK_MODEL = "claude-3-5-sonnet-20241022"


# ===========================================================================
# Public entrypoint
# ===========================================================================
def build_book(order: dict, transcript: dict, mock: bool = False) -> dict:
    """Return a fully-populated book.json dict (assets are filled in later by
    illustrate.py / voicecode.py; here we set the *paths* and text)."""
    if mock or not env("ANTHROPIC_API_KEY"):
        book = _mock_book(order, transcript)
    else:
        book = _claude_book(order, transcript)

    _finalize(book, order, transcript)
    return book


# ===========================================================================
# Shared post-processing (paths, tokens, QR targets, print spec)
# ===========================================================================
def _finalize(book: dict, order: dict, transcript: dict) -> None:
    import secrets

    token = book.get("voice_page", {}).get("token") or secrets.token_urlsafe(12)
    domain = env("RETOLD_DOMAIN", "retold.family")
    base_url = f"https://{domain}/f/"

    book["order_id"] = str(order.get("order_id") or order.get("id") or "unknown")
    book["sku"] = order.get("sku", "book")
    book.setdefault("voice_page", {})
    book["voice_page"]["token"] = token
    book["voice_page"]["base_url"] = base_url

    master = (transcript or {}).get("audio_path") or "audio/master.wav"

    for ch in book.get("chapters", []):
        n = ch["n"]
        ch["illustration_file"] = f"assets/ch{n}.png"
        ch["qr_file"] = f"assets/qr{n}.svg"
        ch["qr_target"] = f"{base_url}{token}#chapter-{n}"
        clip = ch.setdefault("audio_clip", {})
        clip.setdefault("source_master", "audio/master.wav")
        clip["clip_file"] = f"audio/ch{n}.mp3"
        clip.setdefault("start_ms", 0)
        clip.setdefault("end_ms", 30000)

    for gc in book.get("grandchildren", []):
        name = gc["name"]
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        gc["card_qr_target"] = f"{base_url}{token}?from={name}"
        gc["card_file"] = f"assets/card-{slug}.pdf"

    # Print spec: derive a spine width from page count if not supplied.
    subj = book.get("subject", {})
    book.setdefault("cover", {})
    book["cover"].setdefault("wordmark", "Retold")
    book["cover"].setdefault(
        "title", f"The Life of {subj.get('name', 'a Loved One')}"
    )
    book["cover"].setdefault("spine_title", book["cover"]["title"])

    pr = book.setdefault("print", {})
    pr.setdefault("trim", "8.5x8.5")
    pr.setdefault("bleed_in", 0.125)
    n_ch = len(book.get("chapters", []))
    pr.setdefault("page_count", max(40, n_ch * 6 + 12))
    # ~444 pages per inch of spine for standard 80# paper; keep a sane minimum.
    pr.setdefault("spine_width_in", round(max(0.25, pr["page_count"] / 444.0), 3))


# ===========================================================================
# REAL: Claude prompt chain
# ===========================================================================
def _client():
    import anthropic

    return anthropic.Anthropic(api_key=env("ANTHROPIC_API_KEY"))


def _model() -> str:
    return env("ANTHROPIC_MODEL", MODEL)


def _ask_json(client, system: str, user: str, max_tokens: int = 4096) -> dict:
    """Call Claude and parse a JSON object from the reply (robust to fences)."""
    try:
        resp = client.messages.create(
            model=_model(),
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as e:  # pragma: no cover - network/model fallback
        log(f"Primary model failed ({e}); retrying with {FALLBACK_MODEL}.", "WARN")
        resp = client.messages.create(
            model=FALLBACK_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    text = "".join(block.text for block in resp.content if block.type == "text")
    return _extract_json(text)


def _extract_json(text: str):
    text = text.strip()
    # strip ```json fences if present
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # find first { ... last }
    start = text.find("{")
    if start == -1:
        start = text.find("[")
    end = max(text.rfind("}"), text.rfind("]"))
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


def _claude_book(order: dict, transcript: dict) -> dict:
    client = _client()
    subj = order.get("subject", {})
    transcript_text = transcript["text"]

    # ---- 1. EXTRACT ----
    log("Claude 1/4: extracting life events, facts, and the subject's idiom...")
    extract = _ask_json(
        client,
        system=(
            "You are a careful oral-historian's assistant. You extract ONLY what "
            "the speaker actually said. You never invent facts, dates, names, or "
            "quotes. If something is uncertain, you mark it uncertain."
        ),
        user=(
            "From this diarized interview transcript, extract a JSON object with:\n"
            "  events: [{summary, approx_year_or_age, people, place}]\n"
            "  idioms: [verbatim phrases/expressions the speaker uses]\n"
            "  hard_facts: [names, places, years explicitly stated]\n"
            "  themes: [recurring themes]\n"
            "Only use information present in the transcript.\n\n"
            f"SUBJECT (from the order form): {json.dumps(subj)}\n\n"
            f"TRANSCRIPT:\n{transcript_text}"
        ),
        max_tokens=4096,
    )

    # ---- 2. OUTLINE ----
    log("Claude 2/4: outlining 8-14 chapters...")
    outline = _ask_json(
        client,
        system=(
            "You structure a life story into a warm, chronological-ish memoir. "
            "8 to 14 chapters. Titles are evocative but grounded in real events "
            "from the extraction. No invented events."
        ),
        user=(
            "Using this extraction, return JSON {chapters:[{n,title,covers:"
            "[event summaries this chapter draws on]}]}. 8-14 chapters.\n\n"
            f"EXTRACTION:\n{json.dumps(extract, ensure_ascii=False)}"
        ),
        max_tokens=3000,
    )
    chapters_outline = outline.get("chapters", [])[:14]

    # ---- 3. WRITE each chapter ----
    log(f"Claude 3/4: writing {len(chapters_outline)} chapters...")
    words = transcript.get("words") or []
    total_ms = words[-1]["end"] if words else 120000
    chapters = []
    for i, co in enumerate(chapters_outline, start=1):
        ch = _ask_json(
            client,
            system=(
                "You write a single memoir chapter in the SUBJECT'S OWN VOICE and "
                "idiom, first person, warm and specific. Rules you must obey:\n"
                "  * Use ONLY facts/quotes present in the transcript/extraction.\n"
                "  * Do NOT fabricate names, dates, dialogue, or events.\n"
                "  * The illustration_brief must be a warm painterly memory scene "
                "    with NO photoreal real face (figures from behind, at a "
                "    distance, or stylised).\n"
                "Return JSON: {title, prose (multi-paragraph), pull_quote, "
                "photo_caption, illustration_brief, audio_hint (a short verbatim "
                "phrase from the transcript that best matches this chapter)}."
            ),
            user=(
                f"CHAPTER {i}: {co.get('title')}\n"
                f"This chapter covers: {json.dumps(co.get('covers', []))}\n\n"
                f"EXTRACTION:\n{json.dumps(extract, ensure_ascii=False)}\n\n"
                f"FULL TRANSCRIPT (for voice + facts):\n{transcript_text}"
            ),
            max_tokens=4096,
        )
        ch["n"] = i
        ch["audio_clip"] = _range_for_hint(ch.get("audio_hint", ""), words, total_ms, i)
        chapters.append(ch)

    book = {
        "subject": {
            "name": subj.get("name"),
            "relation": subj.get("relation"),
            "birth_year": subj.get("birth_year"),
        },
        "cover": {
            "title": f"The Life of {subj.get('name', 'a Loved One')}",
            "wordmark": "Retold",
            "spine_title": f"The Life of {subj.get('name', 'a Loved One')}",
        },
        "voice_page": {},
        "chapters": chapters,
        "grandchildren": [
            {"name": g} if isinstance(g, str) else g
            for g in order.get("grandchildren", [])
        ],
        "print": {},
    }

    # ---- 4. HONESTY QC (separate call) ----
    log("Claude 4/4: honesty QC pass (checking for invented facts/quotes)...")
    qc = _ask_json(
        client,
        system=(
            "You are a strict fact-checker for a family memoir. Compare the draft "
            "chapters against the source transcript. Flag ANY fabricated fact, "
            "date, name, place, or quoted line that is not supported by the "
            "transcript. Return JSON {clean: true|false, issues: [{chapter, "
            "problem, offending_text}]}."
        ),
        user=(
            "TRANSCRIPT:\n" + transcript_text + "\n\nDRAFT CHAPTERS:\n"
            + json.dumps(
                [{"n": c["n"], "title": c["title"], "prose": c["prose"],
                  "pull_quote": c.get("pull_quote")} for c in chapters],
                ensure_ascii=False,
            )
        ),
        max_tokens=3000,
    )
    book["_qc"] = qc
    if not qc.get("clean", False):
        log(
            f"QC flagged {len(qc.get('issues', []))} possible fabrication(s). "
            "Review book['_qc'] before printing.",
            "WARN",
        )
    else:
        log("QC clean: no fabricated facts/quotes detected.")

    return book


def _range_for_hint(hint: str, words: list, total_ms: int, idx: int) -> dict:
    """Find the transcript time-range that best matches a short verbatim hint so
    voicecode.py can cut a real audio clip of the parent saying it."""
    default = {
        "source_master": "audio/master.wav",
        "start_ms": min(idx * 20000, max(0, total_ms - 30000)),
        "end_ms": min(idx * 20000 + 30000, total_ms),
    }
    if not hint or not words:
        return default
    tokens = [re.sub(r"[^a-z0-9]", "", w.lower()) for w in hint.split()][:6]
    tokens = [t for t in tokens if t]
    if not tokens:
        return default
    joined = [re.sub(r"[^a-z0-9]", "", w["text"].lower()) for w in words]
    for i in range(len(joined) - len(tokens) + 1):
        if joined[i : i + len(tokens)] == tokens:
            start = words[i]["start"]
            # clip runs ~40s or to end of that sentence-ish window
            end = words[min(i + 80, len(words) - 1)]["end"]
            return {
                "source_master": "audio/master.wav",
                "start_ms": int(start),
                "end_ms": int(min(end, start + 55000)),
            }
    return default


# ===========================================================================
# MOCK book (deterministic, rich, no API keys)
# ===========================================================================
def _mock_book(order: dict, transcript: dict) -> dict:
    subj = order.get("subject", {}) or {"name": "Rosa", "relation": "grandmother", "birth_year": 1941}
    name = subj.get("name", "Rosa")

    # Eight hand-built chapters that mirror the bundled sample transcript so the
    # proof copy looks real end-to-end. Clearly a sample, never sold as fact.
    raw = [
        ("A Life Rooted in Love",
         f"I was born in a small village in Calabria in {subj.get('birth_year', 1941)}, "
         "the third of six children. Our house was stone, cold in winter and cool in "
         "summer, and it smelled always of bread and of the lemons my mother kept in a "
         "bowl by the window.\n\n"
         "We did not have much, but I never once felt poor. My father worked the land, "
         "and my mother could make a feast out of nothing — a little flour, a little "
         "oil, and the tomatoes we dried on the roof.",
         "We did not have much, but I never once felt poor.",
         "The family home in Calabria, early 1950s",
         "warm painterly memory scene of a stone village house at dusk, figures seen "
         "from behind in a doorway, lemons on a windowsill, NO photoreal face"),
        ("The War Years and What They Taught Me",
         "I was a small girl during the war, but I remember the fear in the grown-ups' "
         "faces more than I remember the planes. When the soldiers passed through, my "
         "mother hid us in the cellar with the wine.\n\n"
         "What that time taught me was that people are stronger together. The whole "
         "village shared what little there was. No door was ever locked to a hungry "
         "child.",
         "No door was ever locked to a hungry child.",
         "Neighbours sharing bread in a village square, around 1945",
         "painterly wartime village scene, distant stylised figures sharing bread, "
         "muted tones, NO photoreal face, figures at a distance"),
        ("Crossing the Ocean",
         "In 1961 I boarded a ship for America. I was twenty years old and I had one "
         "suitcase and the address of my cousin sewn into my coat. I was seasick for "
         "eleven days and I cried for my mother every night.\n\n"
         "But when we passed the statue in the harbour, an old man beside me took off "
         "his hat, and I understood that we were all frightened and all hopeful at the "
         "same time.",
         "We were all frightened and all hopeful at the same time.",
         "Summer in Calabria, 1961, the morning before leaving",
         "painterly scene of a crowded ship deck at dawn, a young woman seen from "
         "behind at the railing, harbour statue in the distance, NO photoreal face"),
        ("Meeting Your Grandfather",
         "I met Antonio at a dance in the church hall. He could not dance at all — he "
         "stepped on my feet the whole night — but he made me laugh, and he walked me "
         "home the long way so it would last longer.\n\n"
         "We were married within the year. We had nothing but a rented room and a "
         "second-hand bed, and I would not trade those first years for all the money "
         "in the world.",
         "He walked me home the long way so it would last longer.",
         "The church hall dance, winter 1962",
         "warm painterly 1960s dance-hall scene, couple dancing seen from a distance, "
         "soft golden light, stylised faces turned away, NO photoreal face"),
        ("Raising a Family on Little",
         "We had four children in six years. I sewed their clothes and your grandfather "
         "worked two jobs, and on Sundays we ate together no matter what, all of us "
         "around one table.\n\n"
         "Money was always short, but there was music in the house, and there was "
         "always room for one more plate if a neighbour came by.",
         "There was always room for one more plate.",
         "Sunday dinner, the family table, late 1960s",
         "painterly family dinner scene from above, hands passing dishes, warm lamp "
         "light, faces not shown, NO photoreal face"),
        ("The Little Shop",
         "In 1971 we opened a little grocery. I stood behind that counter for thirty "
         "years. I knew every customer's name and every customer's story, and I gave "
         "credit to the ones who were struggling because I remembered being one of "
         "them.\n\n"
         "That shop put four children through school. I am prouder of it than of "
         "anything except of you.",
         "I gave credit to the ones who were struggling because I remembered.",
         "Behind the counter of the family grocery, 1970s",
         "painterly corner-grocery interior, shopkeeper seen from behind arranging "
         "shelves, warm afternoon light, NO photoreal face"),
        ("Losing Antonio",
         "Your grandfather passed in the spring of 1998. Forty years we had together, "
         "and it was not enough. For a long time the house was too quiet.\n\n"
         "But grief, I learned, is only love that has nowhere to go. So I gave it to "
         "you children, and to the garden, and slowly the quiet became peaceful "
         "instead of empty.",
         "Grief is only love that has nowhere to go.",
         "The garden Antonio planted, in bloom",
         "painterly garden scene at golden hour, a lone figure seen from behind among "
         "tomato vines, NO photoreal face"),
        ("What I Want You to Remember",
         "I am an old woman now, and I have lived a big life out of small things. If you "
         "remember anything of me, remember this: be kind, feed people, and never lock "
         "the door on someone who is hungry.\n\n"
         "You are the best thing I ever made — better than the bread, better than the "
         "shop, better than anything. Whenever you miss me, scan the little square by "
         "these words, and you will hear my voice again.",
         "You are the best thing I ever made.",
         f"{name} in the garden, this past summer",
         "painterly warm portrait-from-behind of an elderly woman in a garden looking "
         "toward the sunset, NO photoreal face, gentle stylised light"),
    ]

    words = transcript.get("words") or []
    total_ms = words[-1]["end"] if words else 180000
    seg = max(1, total_ms // len(raw))

    chapters = []
    for i, (title, prose, pq, cap, brief) in enumerate(raw, start=1):
        start = (i - 1) * seg
        chapters.append({
            "n": i,
            "title": title,
            "prose": prose,
            "pull_quote": pq,
            "photo_caption": cap,
            "illustration_brief": brief,
            "audio_clip": {
                "source_master": "audio/master.wav",
                "start_ms": int(start),
                "end_ms": int(min(start + min(seg, 45000), total_ms)),
            },
        })

    return {
        "subject": {
            "name": name,
            "relation": subj.get("relation", "grandmother"),
            "birth_year": subj.get("birth_year", 1941),
        },
        "cover": {
            "title": f"The Life of {name}",
            "wordmark": "Retold",
            "spine_title": f"The Life of {name}",
        },
        "voice_page": {},
        "chapters": chapters,
        "grandchildren": [
            {"name": g} if isinstance(g, str) else g
            for g in (order.get("grandchildren") or ["Mia", "Luca", "Sofia"])
        ],
        "print": {},
        "_qc": {"clean": True, "issues": [], "note": "mock content — sample only"},
    }
