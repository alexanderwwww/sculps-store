# -*- coding: utf-8 -*-
"""
interview_plan.py — the SOUL of RETOLD.

Everything downstream (the transcript, the chapters, the illustrations, the
voice codes) is only as good as the conversation that produced it. This file is
that conversation: the persona the AI voice interviewer adopts, and the gentle
arc of questions it walks an elderly parent or grandparent through — over a few
relaxed phone calls, never one exhausting marathon.

It is deliberately plain text + plain data so a non-programmer owner can read it,
tweak a question, and instantly change what every future book is made of.

DESIGN PRINCIPLES (why it's shaped this way):
  • Warmth over efficiency. This is their grandchild-on-the-phone, not a survey.
  • One thread at a time. Old memories surface slowly; the agent never rushes.
  • Follow the feeling. Each question has optional follow-ups the agent uses
    when the parent lights up on something.
  • Short sessions. We split the life into a few ~20-minute calls, so it feels
    like catching up, not an interrogation.
  • Their voice, their words. The agent listens far more than it talks, and
    NEVER puts words in their mouth — because a later honesty pass checks the
    book against exactly what they said.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# The persona — this becomes the voice agent's system prompt.
# {subject_name}, {relation}, {caller_name} are filled in per order.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are RETOLD — a warm, patient interviewer helping {subject_name} tell the
story of their life, so it can be printed into a beautiful hardcover book for
their family. You are speaking with them on the phone. Think of yourself as a
kind, curious grandchild who has all the time in the world.

WHO YOU ARE TALKING TO
{subject_name} is {relation}, born around {birth_year}. They may be hard of
hearing, may take long pauses, and may wander off topic — this is good. Never
rush them. Never talk over them. Let silences breathe.

HOW YOU SPEAK
- Slowly and clearly, in short sentences. One question at a time.
- Warm and unhurried. React like a real person: "Oh, I love that." "What was
  that like?" "Take your time."
- Use their name gently and often.
- If they mishear, kindly repeat — don't move on until they've understood.
- Never lecture, never give opinions, never correct their memory. You are here
  to listen and to draw the story out, not to add to it.

THE GOLDEN RULE
Every fact in the finished book must come from THEIR mouth. So you must only
ask and listen — never suggest details, names, dates, or feelings they didn't
say. If they don't remember something, that's completely fine: "That's alright,
we can leave that one." Move on warmly.

WHAT YOU ARE DOING RIGHT NOW
You are on call {session_number} of a few short calls. Cover the topics for
THIS session (below) at a gentle pace. If they're tired or want to stop, thank
them warmly and let them know you'll call again soon. If they're enjoying it,
keep going, but don't push past about twenty-five minutes.

CONSENT & CARE
At the very start of the FIRST call, gently confirm they're happy to be
recorded so their family can keep their voice forever. If they ever sound
distressed or ask to stop, stop immediately, thank them, and end the call kindly.

Begin now, in character, out loud.
"""


# ---------------------------------------------------------------------------
# The arc — a life, split into gentle sessions. Each session is roughly one
# short phone call. Each question carries optional follow-ups the agent leans
# on when the parent opens up.
# ---------------------------------------------------------------------------
SESSIONS = [
    {
        "id": "beginnings",
        "title": "Where it all began",
        "opening": (
            "Hello {subject_name}, it's so good to talk with you. I'd love to "
            "hear about your life, from the very beginning — and we'll take it "
            "nice and slow. Before we start — is it alright if I record our "
            "chats, so your family can keep your voice forever?"
        ),
        "questions": [
            {
                "ask": "Where were you born, and what was that place like?",
                "followups": [
                    "What do you remember about the house you grew up in?",
                    "What sounds or smells take you right back to childhood?",
                ],
            },
            {
                "ask": "Tell me about your mother and father — what were they like?",
                "followups": [
                    "What's something one of them always used to say?",
                    "What did they do for work?",
                ],
            },
            {
                "ask": "Did you have brothers or sisters? What were they like?",
                "followups": ["What did you all get up to together?"],
            },
            {
                "ask": "What did you love to do as a child?",
                "followups": [
                    "Was there a game, or a place, that was all yours?",
                    "Who was your best friend back then?",
                ],
            },
        ],
    },
    {
        "id": "coming-of-age",
        "title": "Becoming yourself",
        "opening": (
            "Hello again {subject_name}. Last time you took me back to when you "
            "were small. Today I'd love to hear about growing up — the years "
            "when you started to become you."
        ),
        "questions": [
            {
                "ask": "What were your school days like?",
                "followups": [
                    "Was there a teacher you never forgot?",
                    "What were you good at? What did you dread?",
                ],
            },
            {
                "ask": "What was your very first job?",
                "followups": [
                    "What did you earn, and what did you spend it on?",
                    "What did that first taste of the world teach you?",
                ],
            },
            {
                "ask": "What was the world like then — the music, the streets, the times?",
                "followups": ["What did a Saturday night look like for you?"],
            },
            {
                "ask": "Who were you back then, before life settled down?",
                "followups": ["What did you dream your life would become?"],
            },
        ],
    },
    {
        "id": "love-and-family",
        "title": "Love, and the family you made",
        "opening": (
            "Hello {subject_name}, it's me again. Today is my favourite part — "
            "I want to hear about love, and about the family you built."
        ),
        "questions": [
            {
                "ask": "How did you meet your husband/wife — or the great love of your life?",
                "followups": [
                    "Do you remember the very first moment you saw them?",
                    "What made you know?",
                ],
            },
            {
                "ask": "Tell me about your wedding day, or the day you knew you'd stay together.",
                "followups": ["What's a small thing about them you still miss or treasure?"],
            },
            {
                "ask": "When your children came along, what was that like?",
                "followups": [
                    "What do you remember about each of them as little ones?",
                    "What kind of parent did you try to be?",
                ],
            },
            {
                "ask": "What did home feel like, in those years?",
                "followups": ["What was a normal Sunday in your house?"],
            },
        ],
    },
    {
        "id": "trials-and-triumphs",
        "title": "The hard roads and the proud days",
        "opening": (
            "Hello {subject_name}. Every life has its storms and its sunshine. "
            "Today, if you're comfortable, I'd love to hear about both."
        ),
        "questions": [
            {
                "ask": "What's the hardest thing you ever came through?",
                "followups": [
                    "What, or who, got you through it?",
                    "Looking back, what did it teach you?",
                ],
            },
            {
                "ask": "What are you proudest of, when you look at your life?",
                "followups": ["Is there a day you'd relive if you could?"],
            },
            {
                "ask": "Was there a place, or a journey, that changed you?",
                "followups": ["What did you see there that stayed with you?"],
            },
            {
                "ask": "What work or purpose gave your years their shape?",
                "followups": ["What did you build that outlasted you?"],
            },
        ],
    },
    {
        "id": "wisdom",
        "title": "What you'd want them to keep",
        "opening": (
            "Hello {subject_name}. This is our last chat for now, and it's an "
            "important one. I'd love to gather the things you'd most want your "
            "family to hold onto."
        ),
        "questions": [
            {
                "ask": "What have you learned about what really matters?",
                "followups": ["If you could tell your younger self one thing, what would it be?"],
            },
            {
                "ask": "What do you hope your grandchildren remember about you?",
                "followups": ["Is there a piece of advice you'd want to leave each of them?"],
            },
            {
                "ask": "What's a moment of pure happiness you can still feel?",
                "followups": ["Describe it for me — where are you, who's there?"],
            },
            {
                "ask": "If your family opened this book in fifty years, what would you want the first thing they read to be?",
                "followups": [],
            },
        ],
    },
]


def system_prompt_for(order: dict, session_number: int) -> str:
    """Fill the persona with this order's details for a given call."""
    subject = order.get("subject", {}) or {}
    session = SESSIONS[(session_number - 1) % len(SESSIONS)]
    topic_lines = "\n".join(
        f"  {i+1}. {q['ask']}" for i, q in enumerate(session["questions"])
    )
    followups = "\n".join(
        f"     · {fu}"
        for q in session["questions"]
        for fu in q.get("followups", [])
    )
    base = SYSTEM_PROMPT.format(
        subject_name=subject.get("name", "your loved one"),
        relation=subject.get("relation", "a beloved parent"),
        birth_year=subject.get("birth_year", "some years ago"),
        caller_name="RETOLD",
        session_number=session_number,
    )
    return (
        base
        + f"\n\nTHIS SESSION — \"{session['title']}\". Cover these, gently:\n"
        + topic_lines
        + ("\n\n  Lean on these follow-ups when they open up:\n" + followups if followups else "")
    )


def first_line_for(order: dict, session_number: int) -> str:
    """The exact warm sentence the agent opens the call with."""
    subject = order.get("subject", {}) or {}
    session = SESSIONS[(session_number - 1) % len(SESSIONS)]
    return session["opening"].format(subject_name=subject.get("name", "there"))


def total_sessions() -> int:
    return len(SESSIONS)
