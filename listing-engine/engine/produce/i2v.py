"""Image-to-video: AI motion that stays faithful to the photograph.

The reel's prompt asks a model to glide "from the entryway into the open-plan
living room… down a hallway into a cozy bedroom, finishing in a spa-like
bathroom". From one photo, every room after the first is invented. That's the
part that gets a listing pulled.

But image-to-video itself is fine, and it looks considerably better than an
ffmpeg crop-and-scale. The fix is the prompt, not the technology: constrain the
model to motion *within the photographed space* — a slow drift, a slight
parallax, light shifting, a curtain moving — and forbid it from travelling into
rooms the photo doesn't show. Same tools as the reel (OpenArt Director, Kling,
Runway, Luma). Different instruction.

Two providers ship here:

* ``PromptPackProvider`` — batches (image, prompt) pairs to a folder for pasting
  into OpenArt Director. Literally the reel's workflow, run over a whole box of
  properties, with the prompts fixed.
* ``ApiProvider`` — for a provider with an HTTP API. You supply the endpoint and
  payload shape; nothing here guesses a vendor's schema.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

# The constrained prompt. Everything in it keeps the camera inside the frame we
# actually have a photograph of.
TRUTHFUL_TEMPLATE = (
    "Subtle cinematic motion within this exact room, from this photograph. "
    "{move_phrase} "
    "The camera stays inside the space shown in the image and never travels into "
    "another room, hallway, or doorway. "
    "Do not add, remove, or alter any furniture, fixtures, window view, or "
    "architectural feature. Do not change the layout. Preserve the room's real "
    "proportions, materials, and colours exactly as photographed. "
    "Natural existing light only, no relighting. "
    "Very slight parallax and a gentle handheld float for organic feel. "
    "Photoreal, sharp, 4K, no cuts, no text, no people."
)

MOVE_PHRASES = {
    "drift_in": "A slow, steady push forward of no more than a step or two.",
    "drift_back": "A slow, steady pull back of no more than a step or two.",
    "pan_right": "A gentle pan to the right across the room already visible.",
    "pan_left": "A gentle pan to the left across the room already visible.",
    "tilt_down": "A gentle tilt downward across the room already visible.",
    "tilt_up": "A gentle tilt upward across the room already visible.",
    "settle": "An almost still shot with only a faint breathing float.",
}

# Language that asks a model to invent space. Checked against any prompt the
# operator supplies, so a pasted-in "cinematic walkthrough" prompt is caught.
FABRICATING_PATTERNS = (
    (r"\bwalk\s*through\b|\bwalkthrough\b", "implies touring rooms the photo doesn't show"),
    (r"\b(down|along|through)\s+(a|the)\s+(hallway|corridor|passage)\b",
     "moves into space outside the photograph"),
    (r"\b(into|enter\w*|through)\s+(a|the)\s+(bedroom|bathroom|kitchen|living room|doorway|door)\b",
     "travels into a room the photo doesn't show"),
    (r"\bfrom the entryway\b", "implies a route through the property"),
    (r"\badd(ing)?\b.{0,30}\b(furniture|sofa|plant|artwork|pool|view)\b",
     "adds features the property may not have"),
    (r"\b(remove|hide|conceal)\b.{0,30}\b(damage|flaw|stain|clutter|wear)\b",
     "conceals real defects"),
    (r"\breplace\b.{0,20}\b(view|window|sky)\b", "alters the real outlook"),
    (r"\bfinishing in\b", "implies a multi-room route"),
    (r"\bgliding (forward )?through\b", "implies travel beyond the photographed space"),
)


# A constraint reads as an instruction unless you look at what precedes it:
# "do not add furniture" contains "add … furniture". Anything within this many
# characters before a match is inspected for a negation.
NEGATION_WINDOW = 40
NEGATORS = ("do not", "don't", "dont", "never", "no ", "avoid", "without",
            "must not", "cannot", "can't", "refrain from")


def _is_negated(text: str, start: int) -> bool:
    window = text[max(0, start - NEGATION_WINDOW):start].lower()
    return any(n in window for n in NEGATORS)


class FabricatingPrompt(Exception):
    """Raised when a prompt would make the model invent space or features."""


def assert_prompt_truthful(prompt: str) -> None:
    """Reject prompts that ask a model to invent geometry or features.

    Negated forms are allowed: a prompt saying "do not add furniture" is a
    constraint, not an instruction, and must not be confused with one.
    """
    problems = [
        why for pat, why in FABRICATING_PATTERNS
        if any(not _is_negated(prompt, m.start())
               for m in re.finditer(pat, prompt, re.I))
    ]
    if problems:
        raise FabricatingPrompt(
            "refusing this prompt — it would misrepresent the property:\n  - "
            + "\n  - ".join(dict.fromkeys(problems))
            + "\n\nUse build_prompt() instead: it keeps the camera inside the "
              "photographed room. Content that invents rooms is what gets the "
              "client's listing suspended (COMPLIANCE.md §1)."
        )


def build_prompt(move: str = "drift_in", room_hint: str = "") -> str:
    """Build a constrained image-to-video prompt.

    ``room_hint`` is optional and descriptive only ("living room"); it never
    licenses travel to another room.
    """
    if move not in MOVE_PHRASES:
        raise ValueError(f"unknown move {move!r}; choose from {sorted(MOVE_PHRASES)}")
    prompt = TRUTHFUL_TEMPLATE.format(move_phrase=MOVE_PHRASES[move])
    if room_hint:
        prompt = prompt.replace("this exact room", f"this exact {room_hint}", 1)
    # Belt and braces: our own generated prompt must pass our own checker.
    assert_prompt_truthful(prompt)
    return prompt


@dataclass
class I2VRequest:
    image: Path
    prompt: str
    seconds: float = 5.0
    aspect: str = "9:16"


class I2VProvider(Protocol):
    def submit(self, req: I2VRequest) -> str:
        """Submit one image+prompt. Returns a job id or an output path."""
        ...


class PromptPackProvider:
    """Batch (image, prompt) pairs for pasting into OpenArt Director or similar.

    Writes a folder per property with the images, a ``prompts.txt`` you can copy
    from line by line, and a ``manifest.json``. This is the reel's manual
    workflow, run across a whole box of properties, with the prompts fixed so
    they can't drift back into "walkthrough".
    """

    def __init__(self, out_dir: str | Path):
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self._items: list[dict] = []

    def submit(self, req: I2VRequest) -> str:
        assert_prompt_truthful(req.prompt)
        idx = len(self._items)
        self._items.append({
            "index": idx,
            "image": str(req.image),
            "prompt": req.prompt,
            "seconds": req.seconds,
            "aspect": req.aspect,
        })
        return f"pack-{idx}"

    def write(self) -> Path:
        (self.out / "manifest.json").write_text(json.dumps(self._items, indent=2))
        lines = []
        for it in self._items:
            lines.append(f"### {it['index']:02d} · {Path(it['image']).name} "
                         f"· {it['seconds']}s · {it['aspect']}")
            lines.append(it["prompt"])
            lines.append("")
        (self.out / "prompts.txt").write_text("\n".join(lines))
        return self.out


class ApiProvider:
    """Generic HTTP image-to-video provider.

    Supply the endpoint and a payload builder for whichever service you use —
    this deliberately does not guess a vendor's API shape.
    """

    def __init__(self, endpoint: str, api_key: str, payload_builder,
                 timeout: int = 120):
        if not api_key:
            raise ValueError("api_key is required")
        self.endpoint = endpoint
        self.api_key = api_key
        self.payload_builder = payload_builder
        self.timeout = timeout

    def submit(self, req: I2VRequest) -> str:
        import requests

        assert_prompt_truthful(req.prompt)
        resp = requests.post(
            self.endpoint,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=self.payload_builder(req),
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("id") or data.get("job_id") or data)


def pack_property(photos: list[Path], out_dir: str | Path, *,
                  moves: list[str] | None = None, seconds: float = 5.0,
                  aspect: str = "9:16") -> Path:
    """Build a prompt pack for one property's photos."""
    from .motion import suggest_moves

    # Map the ffmpeg move vocabulary onto the constrained i2v phrasing.
    bridge = {"push_in": "drift_in", "pull_out": "drift_back",
              "pan_right": "pan_right", "pan_left": "pan_left",
              "tilt_down": "tilt_down", "tilt_up": "tilt_up",
              "push_in_left": "pan_left", "push_in_right": "pan_right",
              "hold": "settle"}
    chosen = moves or [bridge.get(m, "drift_in") for m in suggest_moves(len(photos))]

    provider = PromptPackProvider(out_dir)
    for photo, move in zip(photos, chosen):
        provider.submit(I2VRequest(image=photo, prompt=build_prompt(move),
                                   seconds=seconds, aspect=aspect))
    return provider.write()
