# promptbot

Types prompts into Gemini or ChatGPT in **your own logged-in Chrome**, waits for
the images, and saves them to a folder. Then, if you want, pushes them straight
into the store's media bucket.

The point is the free tier. You already pay for Gemini and ChatGPT; the image
APIs cost credits per picture. This spends neither — it uses the same browser
window you'd use by hand, it just does the typing and the downloading.

It drives a real Chrome that you started yourself, with your real profile and
your real login. Nothing logs in on your behalf and no password is stored
anywhere. If Chrome isn't running with a debug port open, it does nothing.

## What it can't do

It clicks a website that is not built to be clicked by a program. When Google
changes their page, it breaks — usually by finding nothing and timing out, not
by doing something wrong. Every selector it depends on is in one block at the
top of `run.mjs` so it's a two-minute fix rather than a rewrite. Both sites'
terms say not to automate them; nothing here hides that it's a browser doing
the typing, so treat it as a tool that will stop working one day, not a
pipeline to build on.

## The easy way

Double-click **`wand.command`**.

It checks what's installed, opens a Chrome with the debug port on (its own
profile — your everyday Chrome and its tabs are untouched), waits for you to be
logged in, then runs the wand over `prompts.txt`. If something's missing it says
which thing rather than failing halfway.

The first double-click installs what it needs and takes a couple of minutes.
Every one after that is instant.

Edit `prompts.txt` before you run it: one prompt per block, a blank line between
blocks. To use ChatGPT instead, run `SITE=chatgpt ./wand.command` in Terminal.

**macOS will refuse the first double-click** with "cannot be opened because it is
from an unidentified developer". Right-click the file → Open → Open. Once only.

## What you see

A 🪄 flies across the Chrome window to the message box, sparks, types the
prompt, flies to the send button, sparks. A black panel bottom-right says which
prompt is in flight and how many pictures have landed. Then it moves to the next
one on its own — it does not stop to ask.

**Press Esc in the browser to stop.** The panel goes red and nothing further is
typed. No confirm, no undo.

## The long way, if you'd rather drive

```bash
cd tools/promptbot
npm install
```

## Every time

**1. Start Chrome with the debug port open.** Quit Chrome completely first, then:

macOS
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir="$HOME/.promptbot-chrome"
```

Windows (PowerShell)
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\.promptbot-chrome"
```

The first time, log into Gemini (or ChatGPT) in that window. It's a separate
profile, so it doesn't touch your normal Chrome, and the login sticks.

**2. Put your prompts in a file.** One prompt per block, blank line between:

```
A five metre inflatable in a suburban front yard at dusk...

The same inflatable from across the street, a parked car in the foreground...
```

**3. Run it.**

```bash
node run.mjs --site gemini --prompts prompts.txt --out ./images
```

It sends the first prompt, waits for the pictures, saves them, then sends the
next one. It does not stop to ask between prompts.

## Flags

| Flag | What it does |
|---|---|
| `--site gemini\|chatgpt` | Which one to drive. Default `gemini`. |
| `--prompts <file>` | The prompt file. Blocks separated by blank lines. |
| `--out <dir>` | Where the images land. Default `./images`. |
| `--wait <seconds>` | How long to wait for images per prompt. Default 180. |
| `--fresh` | Start a new chat before each prompt, so they don't influence each other. |
| `--port <n>` | Chrome's debug port. Default 9222. |

## Getting them into the store

```bash
node upload.mjs --dir ./images --store reaper --prefix scream
```

Puts every image in the R2 bucket, registers it in the media library, and
prints the `/media/...` path for each one. They show up in the admin's image
picker straight away.
