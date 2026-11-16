# Mega prompt for ChatGPT: build the Aquarius WORLD (Alex, 2026-11-16: "he made the nice image and he understands the style; let him do the world")
Style reference = the gameplay image ChatGPT made (third-person, hero crossing the canal bridge toward the AQUARIUS dome, six god statues, purple-and-white tunics, WoW-style HUD). Claude keeps building the brain and the control panel; ChatGPT builds only the 3D world.

---
You are building the 3D WORLD of AQUARIUS, a browser game that is the live face of a trading system. Claude builds the trading brain and the control panel; you build only the world and its assets. The target look is exactly the gameplay image you made for me (hero crossing the canal bridge toward the AQUARIUS dome): stylized, chunky, hand-painted, World of Warcraft feeling, rich detail, full of life. Not flat, not empty, not Roblox.

WHERE THE CODE IS
- Repository: https://github.com/alexanderwwww/sculps-store , branch `claude/kerberos-phase1-db-setup-6vjdq9`.
- Create your own branch from it named `aquarius-world-gpt` and push only there. Never push to `main` and never to Claude's branch.
- Your folder: `tools/mob/aq/world/` (plus `tools/mob/aq/textures.js` and `tools/mob/aq/assets/`). Read `tools/mob/aq/CONTRACT.md` first.
- Do NOT touch: `tools/mob/src/**` (the trading brain and server), `tools/mob/aq/main.js`, `tools/mob/aq/desk.js`, `tools/mob/aq/style.css` (the control panel), or anything outside `tools/mob/aq/`.

HOW THE WORLD PLUGS IN (keep this exactly)
- Entry: `tools/mob/aq/world/index.js` exports `async function start(stage, A)` and returns an object with `dispose()`. `stage` is the DOM element to render into. `A` gives you the live data and UI helpers: `A.store.state` (latest state), `A.onState(fn)` (called every 3 s with new state), `A.openWorker(dept, workerId)`, `A.openMenu()`, `A.sellAllDialog()`, `A.transferDialog()`, `A.DEPTS`, `A.GODS`, `A.fmt`, `A.setMode("bot")`.
- It must also set `window.__aqWorld = { teleport(x, z, yaw), toggleOverview() }` for the screenshot script.
- three.js is bundled (import from "three" and "three/addons/..."). No CDN, no external requests: the page blocks them. Assets load from `/aq/assets/<file>`.
- Build: from `tools/mob`, run `node aq/build.mjs`. Local preview with fake data: `node aq/dev/server.mjs` then open the printed address with `?mode=world`. Screenshots: `node aq/dev/shoot.mjs <outdir>`.
- The existing world code in that folder is a rejected first pass (too plain and blocky). Replace it freely, but keep the entry contract above. `world/statues.js` has six finished god statues (`makeStatue("zeus"|"athena"|"apollo"|"hermes"|"dionysus"|"hecate")`): reuse or improve them.
- Characters: `assets/body.glb` and `assets/anims.glb` are free CC0 Quaternius humans with idle, walk, run, sit and work animations. You may add other CC0 models and textures (keep the licence file next to each, total assets under 25 MB).

WHAT THE WORLD IS
A floating island city, ancient Greece in the future. Every building has a real job and shows real data from `state`:
- Centre: the AQUARIUS headquarters (the domed building in your image, built as a Colosseum-like arena you can walk into). Inside: a giant amethyst crystal on a gold floor sigil (pentagram inside a circle inside a triangle, ringed by Olympian symbols), the CEO desk, and two giant screens: WALLET (equity, profit, open trades from `state`) and X FEED (`state.xfeed`). Over the entrance, the big screen from your image (network graph and equity line).
- The plaza and the bridge approach from your image, with the six statues: Hecate with two torches, Apollo with lyre, Dionysus with grapes and cup, Athena with spear and shield, Zeus, Hermes with winged sandals.
- Twelve districts around it, each a distinct, richly detailed building you can enter, with signposts like in your image. Ids and what they are: `scouts_sol` lighthouse-observatory and harbour gate (Hecate), `scouts_stocks` columned stoa with ticker boards, `whales` whale fountain with banner poles, `news` amphitheatre and market square (Dionysus), `setups` drafting academy with a golden-spiral mosaic (Athena), `costs` mint with giant scales, `council` small golden domed pavilion with a round table and a verdict stone (green PASS, red BLOCK from `state.council.last`), `risk` fortress with a red kill-switch lever (Zeus), `execution` dock with a trireme (Hermes), `review` courthouse-library, `learning` sacred grove with a glowing tree (Apollo), `ops` engine house with a crystal reactor. Plus a small embassy for the helper bots.
- Workers are real: `state.departments[i].workers[]` (about 144). Each stands or sits at its department. Status drives the animation: `busy` works or walks, `idle` sits, `blocked` shows a red marker. Our bots wear WHITE Greek tunics with a sash in the department colour (`A.DEPTS`). Workers with `power: "grok"` wear BLACK. Clicking a worker calls `A.openWorker`.
- Survival: `state.survival.stage` changes the world. thriving and healthy = bright and sunny; hurt = cracks and darker sky; critical = storm and fires; destroyed = ruins.
- Fill the ground like your image: canals and bridges, stairs, terraces, cliffs with waterfalls, cypress and olive trees, banners, braziers, lamp posts, market stalls, amphorae, flower beds. No empty grass.

PLAY
Third-person hero (the CEO, in the blue-and-gold outfit from your image), WASD to move, Shift to run, mouse to orbit, wheel to zoom, E to enter a building, O for an overview camera. World of Warcraft proportions: the hero is human-sized and the buildings tower over him. The camera must not clip through walls. On a phone, an on-screen joystick. Do not draw your own HUD: the control panel's HUD already sits on top.

QUALITY RULES
1. Look at what you build. After every change, run the screenshot script and compare with your own concept image. Fix what is plain, flat, blocky or empty before moving on.
2. It must run smoothly on a normal laptop: target 60 fps, under 300 draw calls on the plaza (merge geometry, instance trees and props, share materials, bake detail into textures).
3. Zero console errors. Missing data shows a dash, never an invented number.
4. `dispose()` must free everything (renderer, textures, listeners).
5. Before you say it is done: `cd tools/mob && node aq/build.mjs && npm test` must pass.

DELIVER
Push to `aquarius-world-gpt`. Save screenshots in `tools/mob/aq/shots/gpt-*.png`: the bridge approach (same view as your image), the plaza with the six statues, inside the headquarters, inside the council, one district outside and inside, the overview, and a phone view. End with a short note: what is finished, what is weak, how many draw calls and what frame rate you measured.
