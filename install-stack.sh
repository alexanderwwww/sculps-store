#!/usr/bin/env bash
# Patchd Growth Stack installer — sets up all skills in ~/.claude/skills/
# Run on YOUR machine (where Claude Code lives), from the repo root:
#   bash install-stack.sh
set -uo pipefail

SKILLS="${HOME}/.claude/skills"
REPO="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SKILLS"
echo "→ Installing into $SKILLS"

clone() { # $1=url  $2=dir
  if [ -d "$SKILLS/$2/.git" ]; then
    echo "  ✓ $2 present — updating"; git -C "$SKILLS/$2" pull --ff-only >/dev/null 2>&1 || true
  else
    echo "  ↓ cloning $2"; git clone --depth 1 "$1" "$SKILLS/$2" >/dev/null 2>&1 \
      && echo "    done" || echo "    ⚠ clone failed (check network/URL)"
  fi
}

# --- external skills (public repos) ---
clone https://github.com/AgriciDaniel/claude-seo                       seo
clone https://github.com/Cedriccmh/claude-code-skill-scrapling         scrapling
clone https://github.com/BrianRWagner/ai-marketing-claude-code-skills  marketing

# --- bundled in this repo ---
for s in product-research ditto-product-research; do
  if [ -d "$REPO/skills/$s" ]; then cp -r "$REPO/skills/$s" "$SKILLS/" && echo "  ✓ bundled $s"; fi
done

# --- claude-ads (you have it as a zip) ---
echo "  • claude-ads: unzip your claude-ads zip into $SKILLS/ads  (separate, not a public clone)"

echo
echo "→ Ditto free tier (no card):  curl -sL https://app.askditto.io/scripts/free-tier-auth.sh | bash"
echo "→ Done. Restart Claude Code to load the new skills."
