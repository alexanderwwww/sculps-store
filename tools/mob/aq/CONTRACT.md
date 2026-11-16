# Aquarius contract between the engine (src/aq/*) and the game (aq/*). Both sides follow it exactly.
Route base: mob worker. All behind the mob admin session (same gate as /city); /api/aq/* also accepts bearer MOB_API_TOKEN.
- GET /aq            -> AQ_PAGE (from src/aq-bundle.mjs, built by aq/build.mjs)
- GET /aq/app.js     -> AQ_JS
- GET /aq/assets/<f> -> R2 object key `aq/<f>` (GLB, textures), long cache
- GET /api/aq/state  -> JSON below. Game polls every 3 s.
- POST /api/aq/bots {name, dept, job, rules, skills:[], power:"claude"|"grok"|"chatgpt"} -> CEO-made bot, no vote, starts paper.
- POST /api/aq/kill {on:true|false}
Department ids (clockwise): scouts_sol, scouts_stocks, whales, news, setups, costs, council, risk, execution, review, learning, ops.
Gods: hecate@scouts_sol(gate), apollo@scouts_stocks... no: apollo@news? -> FIXED: hecate=scouts_sol gate, apollo=learning, athena=setups, zeus=risk, hermes=execution, dionysus=news (market square).

state = {
 build, mode:"PAPER"|"LIVE", killSwitch:bool, updatedAt,
 equitySol, startSol, pnlTodaySol, pnlTotalSol,
 trades:{n, wins, winRate, expectancyPct, ci95:[lo,hi], evidence:"NO EVIDENCE yet"|"EDGE"|"NO EDGE"},
 positions:[{id, symbol, mint, entryPrice, price, stopPct, targetPct, sizeSol, openedAt, pnlPct, strategy}],
 recent:[{id, symbol, side:"buy"|"sell", sizeSol, pnlSol, reason, at}],
 flows:[{id, kind:"buy"|"sell"|"fee"|"win"|"loss", sol, dept, label, at}],   // newest first, max 40, id monotonic
 council:{last:{verdict:"PASS"|"BLOCK", symbol, reason, number, at}|null, vetoes:[same, max 10]},
 departments:[{id, name, god|null, live:bool, lastRunAt, workers:[{id, name, job, status:"idle"|"busy"|"blocked", note, skills:[], power:"code"|"claude"|"grok"|"chatgpt"}]}],  // 12 x 12 seeded + CEO-made extras
 market:{sol:{price,ch24}|null, btc:{price,ch24}|null, fearGreed:{value,label}|null, trending:[{symbol, ch1h, liqUsd, boosted:bool}]},
 brain:[{at, dept, text}],           // newest first, max 30: lessons, findings
 strategies:[{id, name, trades, pnlSol, alive:bool}],
 helpers:{grok:"not connected"|"connected", chatgpt:"not connected"|"connected"}
}
Missing data = null, never invented.

## Later additions the desk already reads (engine: src/aq/engine.mjs buildState)
 survival:{health, stage:"thriving"|"healthy"|"hurt"|"critical"|"destroyed", sizeMult, maxOpen}, health:{<feed>:bool}, replay:{trades, expectancyPct, ci95, costPct, evidence}|null,
 shadow:{tag, n, winRate, expectancyPct, open, byReason:[{reason, n, expectancyPct}]}, lanes:[{helper, tag, n, winRate, expectancyPct, open, rejected, weight}],
 xfeed:[{at, section, text, label, source, weight}], helpers:{grok, chatgpt, grokLastAt, chatgptLastAt}, tools:[...], departments[].skills

## PROPOSED, not sent by the engine yet (the desk draws them the moment they appear; until then it says what is missing)
 tape:{symbol, mint, src:"own"|"geckoterminal", verdict:"PASS"|"BLOCK"|null, candles:[{t(sec), o, h, l, c, v}] (1m, oldest first, <= 60),
       fib:{high, low, entry, stop, target}|null}|null     // the active candidate, else the most recently judged coin -> THE TAPE candlesticks
 flows[].kind "fee" with the buy it belongs to, or costs:[{symbol, rtPct, at}]   // measured Jupiter round trips -> THE PRICER gauge (today it only has fee flows / open target)
 council.vetoes carries BLOCKs only; PASS verdicts older than `last` are not in state, so the trace cannot list them.
