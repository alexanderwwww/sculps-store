# OrganicX

An organic dropshipper with hands. It drives a real Chrome that you logged
into yourself, finds clips, judges them, cuts them, and runs the accounts the
way a person runs them.

## What it never does

- **Log in.** Chrome opens with its own profile and you sign in. No password is
  typed by this code, stored by it, or read by it.
- **Push through friction.** A captcha, a verification prompt, an action block —
  that account stops for the day and says why. There is no retry, because
  retrying is how accounts are lost.
- **Hide.** There is a green cursor on every page it touches. You can watch it.

## The files

| File | What it is |
|---|---|
| `human.mjs` | What a person would do — session rhythm, watch times, engagement ratios, keystrokes with the typos left in, and the list of things that mean stop. Pure: no browser, no network, no database. |
| `score.mjs` | What is worth pulling, and what for. Two lanes: proven (it travelled, and the comments read like buyers) and presentation (it did not travel, but the product looks good). |
| `browser.mjs` | The hands. Chrome, the cursor overlay, and human-speed movement, clicking, typing and scrolling. |
| `test/harness.mjs` | Proves the overlay actually draws under the content security policy the real sites serve. |

## Before shipping a build

```
node --check human.mjs && node --check score.mjs && node --check browser.mjs
node test/harness.mjs      # must print "all passed"
```

The harness matters more than it looks. `style-src` without `'unsafe-inline'`
blocks a page's inline `style=` attributes but **not** styles set through
JavaScript, which is why the overlay is written the way it is. An overlay that
relies on an injected `<style>` mounts, returns true, and draws nothing — the
wand lost a day to exactly that. The harness is the only thing that catches it.

## What it needs on the Mac

```
brew install ffmpeg yt-dlp
```

`ffmpeg` does all the editing — trim, reorder, stitch, crop to 9:16, burn in a
hook, swap audio, restamp subtitles, strip metadata. `yt-dlp` pulls clips from
all three platforms without a watermark, locally, so nothing of yours is
uploaded to a downloader site and there is no page layout to break.

## Where its memory lives

Neon, the same Postgres the stores run on — `ox_accounts`, `ox_personas`,
`ox_clips`, `ox_cuts`, `ox_gate`, `ox_schedule`, `ox_actions`, `ox_results`,
`ox_weights`, `ox_lessons`, `ox_tasks`.

Not a file on the Mac, for one reason: when it stops at three in the morning,
the answer has to be readable from somewhere other than the machine it stopped
on.

Clips on disk are temporary. A raw clip lives only as long as it takes to judge
it; the row stays so it is never pulled twice, the file does not.
