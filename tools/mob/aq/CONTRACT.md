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

## AQUARIUS ULTIMUM: Council seat, fast alerts, war room (engine: src/aq/seat.mjs; sent by the engine since 2026-11-16)
Helpers (grok, chatgpt, codex) sit on the Council through the helper MCP link (POST /api/aq/helper/<AQ_HELPER_KEY>/mcp). They never control money:
a vote is one soft rule, an alert only makes the engine check a position's own stop/target at a real sell quote, chat is talk.
State additions (GET /api/aq/state):
 council.seats:[{helper, votes, right, wrong, weight, laneWeight, effective, lastVoteAt}]   // weight = from the helper's own graded votes (1 until 10 graded, 0.2..3);
                                                                                           // laneWeight = its paper lane's evidence weight; effective = weight x laneWeight, kept in 0.2..3 = what one vote is multiplied by
 council.votes:[{helper, mint, symbol, vote:"BUY"|"SKIP"|"EXIT", confidence, reason, at, expiresAt}]   // live votes only (5 minutes)
 council.last / council.vetoes[] / council.recent[] entries gain, only when a helper vote was in that decision:
   seat:{votes:[{id, rule:"council_seat:<helper>", helper, vote, confidence, weight, laneWeight, mult, points}], delta, scoreBefore, scoreAfter, moved:string|null}
   // moved = null when the verdict would have been the same; else e.g. "BLOCK became PASS", "PASS became BLOCK", "EXPLORE became BLOCK", "lifted from EXPLORE-WEAK to a normal entry". The same numbers are in `reason`.
 warroom:{messages:[{id, at, from, to|null, text}] (last 30, oldest first), unread:{alex, claude, grok, chatgpt, codex}, lastRead:{<name>:id}}
 alerts:[{id, at, helper, symbol, mint, kind:"stop"|"target"|"narrative_dead", price, note, confirmed:bool, result, tradeId|null}]   // newest first, max 20
 recent[].reason / trades may now read "council exit vote (<helper>)", "stop confirmed after <helper> alert", "target confirmed after <helper> alert".
War room HTTP (the sender comes from the sign-in, never from the body):
- POST /api/aq/chat {text (1-2000 chars), to?: "alex"|"claude"|"grok"|"chatgpt"|"codex"}   admin session -> from "alex"; bearer MOB_API_TOKEN -> from "claude";
       header x-aq-helper-key: <AQ_HELPER_KEY> + body.helper "claude"|"grok"|"chatgpt"|"codex" -> from that name (never "alex"). 201 {message}; 429 over 10 a minute.
- GET  /api/aq/chat?since=<id>&mark=1   -> {as, messages, lastId, unread}; without `since` the last 30; mark=1 marks them read for the caller (with the helper code add &helper=<name>).
- POST /api/aq/chat/read                -> marks everything read for the caller, {as, messages, lastId, unread}. The panel calls this when Alex opens the war room.
Helper MCP tools added (every tool takes `helper`):
- aq_council_cases {}                                   -> {cases:[{symbol, mint, tier, strategy, strength, roundTripPct, atr5Pct, plan:{stopPct,targetPct,holdMin,stopUsd,targetUsd}, softObjections, score, verdict, reason, number, blockKind, hardBlocksClear, seat, judgedAt, votes, canVote}], positions:[{id, symbol, mint, entryUsd, nowUsd, stopUsd, targetUsd, stopPct, targetPct, pnlPct, ageMin, openedAt, timeStopAt, exitWarningBy, votes, canVote:["EXIT"]}], voteTtlSec, how}
- aq_council_vote {mint, vote:"BUY"|"SKIP"|"EXIT", confidence 0..1, reason, labels[]}   BUY/SKIP: the coin must be a case (judged in the last 30 min, not held); EXIT: the coin must be an open position.
- aq_alert {mint, kind:"stop"|"target"|"narrative_dead", price?, note?}                 -> {confirmed, closed, result, quotedUsd, stopUsd, targetUsd, netPctIfSold}
- aq_chat_post {text, to?}   aq_chat_read {since?}
Rules the engine applies (so the panel can explain them):
- vote points = +/-10 x confidence x effective; fresh for 5 minutes; one live vote per helper per coin (a newer one replaces it). A net vote of -5 or lower keeps a coin out of EXPLORE.
  A partial setup is lifted to a normal entry when strength + points/10 >= 1 and the score passes. Never past a hard block, the cost/ATR gates, cash, slots, kill switch, survival; size is the normal position size.
- EXIT vote: effective confidence = confidence x effective (max 1). >= 0.7 and the sell quote is under the entry price: sold ("council exit vote (<helper>)"). >= 0.7 above entry: time stop moves in to 5 min. 0.4-0.7: to 10 min. Under 0.4: recorded. Stop and target never move.
- grading: BUY right when the coin is more than its round-trip cost higher 15 min later (or the trade it was part of won); SKIP right when not; EXIT right when the coin is lower 15 min later. Same vote repeated on a coin inside 15 min counts once.
- limits: 20 votes, 6 alerts, 10 chat messages a minute per name. "claude-test" is a wiring-check name: stored and answered, never applied, graded or able to close anything.

## GROK DESK section (aq/grok.js): what it reads today, and the ENGINE WISHLIST
Reads today: helpers.{grok,chatgpt,codex} + helpers.<k>LastAt (badge: green under 20 min, amber after, grey when "not connected"), xfeed (X radar text parsed into a table, raw text if the pattern changes),
lanes (helper "grok" vs "aquarius"), brain rows starting "LANE:grok pick" (closed picks as the review desk logged them), marketFeed rows with source "grok".
Draws the moment they appear (nothing to change in the client):
 warroom:[{at, from:"grok"|"claude"|"alex"|"chatgpt"|"codex", to, text}]  (last 30, any order)   + POST /api/aq/chat {text} -> 2xx (JSON {error} shows as the error; 404/405 shows "the engine has no chat yet")
 council.seats:[{helper, votes, right, wrong, weight, lastVoteAt}]
 alerts:[{at, text, kind|level ("info"|"warn"|"critical"|...), from}]   // shape assumed: the client also accepts message/title, severity/type, source, or a plain string
ENGINE WISHLIST (not in buildState today, the section says so on screen instead of guessing):
 1. lanePicks:[{id, helper, symbol, mint, status:"queued"|"open"|"closed"|"rejected", verdict, verdictReason, thesis, labels, stopPct, targetPct, costPct, pnlPct, outcome, createdAt, openedAt, closedAt}]
    from mob_aq_picks (newest 20). Today only the lane summary is sent, so open and rejected picks cannot be listed.
 2. helperFeed:[{at, from, section, text, labels:[...], weight, channel}] = every helper post, not only channel 'x'. Today xfeed is channel='x' AND from_helper='grok' only,
    so Grok's non-X posts (his whale watcher, his "war room, first change" opinion) never reach the page. xfeed also carries only the first label; send labels:[...].
 3. helpers.grokFirstAt (first post ever) and helpers.grokPosts / grokRadars (totals). Today the page can only say "heard since >= the oldest of the last 30 posts" and "N radars of the last 30 posts".
 4. The radar as data next to the text: xfeed[].radar = {sweepAt, posts, rows:[{rank, name, posts, authors, perMin, window, growth, tickers, ca, cred, swarm}]} so a wording change cannot break the table.
