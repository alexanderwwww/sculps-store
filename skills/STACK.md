# 🧩 Patchd Growth Stack — Claude Code Skills

A freestyle, end-to-end growth system: **research → validate → create → launch → audit**.

## The loop
```
product-research  →  ditto (synthetic pre-test)  →  claude-ads (create/run/audit)
      ↑  claude-seo (demand/keywords)        ↑  scrapling (scrape what blocks you)
```

## Bundled in this repo (`skills/`)
| Skill | What it does | Source |
|-------|--------------|--------|
| **product-research** | Competitor ad teardown, review mining, offer/pricing analysis, angle bank — with an ads-operator's compliance brain | built here |
| **ditto-product-research** | Synthetic persona pre-test (pricing, positioning, ad creative, deal-breakers) before you spend | github.com/Ask-Ditto/ditto-product-research-skill |

## Install the rest (run on your machine)
Skills live in `~/.claude/skills/`. One line each:

```bash
mkdir -p ~/.claude/skills && cd ~/.claude/skills

# Your ads engine (the zip you already have) — or:
# git clone <claude-ads repo>  ads

# Real keyword + demand research (same author as claude-ads)
git clone https://github.com/AgriciDaniel/claude-seo            seo

# Bot-block / Cloudflare bypass scraping (fixes the 403s on competitor sites)
git clone https://github.com/Cedriccmh/claude-code-skill-scrapling   scrapling

# Executable marketing & positioning frameworks
git clone https://github.com/BrianRWagner/ai-marketing-claude-code-skills  marketing

# Bundled research + ditto from this repo
cp -r <this-repo>/skills/product-research      ~/.claude/skills/
cp -r <this-repo>/skills/ditto-product-research ~/.claude/skills/
```

Then set up Ditto's free tier (no card):
```bash
curl -sL https://app.askditto.io/scripts/free-tier-auth.sh | bash
```

## Honest notes
- I can't auto-install on your machine or pull external repos *into* this repo (GitHub access
  here is scoped to `sculps-store`). The commands above are yours to run locally.
- These multiply your *output*; they don't replace the real lever — a converting funnel and
  real sales data. Use them to make better bets, then let real numbers decide.

## Bonus
`app/patchd-os.html` — a macOS-style "Patchd OS" product showcase (real catalog + live images).
Open it in any browser. Pure HTML/CSS/JS, no build step.
