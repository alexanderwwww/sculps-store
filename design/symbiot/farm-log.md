# Symbiot super-farming log

Fake money, 1.618 SOL a trade. One row per check-in.

| time (UTC) | build | trades | W | L | plus | minus | net | fees | open | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-20 10:20 | 33 | 69 | 18 | 51 | 4.235 | −6.955 | −2.720 | 5.722 | 57 | fees > losses; most trades bought before the 3% fee cap |
| 2026-10-20 10:58 | 34 | 128 | 27 | 101 | 8.023 | −13.648 | −5.625 | 2.081* | 0 | STALLED: learning blocked every coin (all symbiot trades shared the shape "young"/"e:any"; 7,417 skips). Win rate 21%. Fixed in build 35: symbiot records lessons, never blocks; shapes = age, pool, hour, source. *fee counter reset at restart |
| 2026-10-20 11:08 | 35 | 167 | 38 | 129 | 10.414 | −18.637 | −8.224 | 3.628 | 17 | trading again after the fix; win rate 23%. 3% fee cap skips most pump.fun pools (4–8% round trip measured). |
| 2026-10-20 10:56 | 35 | 202 | 43 | 159 | 12.781 | −25.514 | −12.732 | 6.789 | 11 | win rate 21%; losses are about 2× wins in SOL. App restarting into build 36 (post-mortems). |
| 2026-10-20 11:29 | 39 | — | — | — | — | — | — | — | — | OFFLINE: app last seen 11:24 starting build 39 with "Chrome is not open"; no status since. |
| 2026-10-20 11:58 | 39 | — | — | — | — | — | — | — | — | 1-hour report: no data. App offline since ~11:25 (last status: "Chrome is not open"). Last real numbers: 202 trades, 21% wins, net −12.73 at 10:56. |
| 2026-10-20 12:02 | 39 | 243 | 46 | 197 | 13.439 | −31.314 | −17.875 | — | 0 | Post-mortems (26): fee-ate-it 19 (avg −5.6%), bought-the-top 6 (−13%), good 1. LESSON: most losses are coins that don't move at all for 2 min; the fee is the whole loss. Offline again since ~12:02. |
| 2026-10-20 18:13 | 39 | 243 | 46 | 197 | 13.439 | −31.314 | −17.875 | — | 0 | Paused: Alex closed the app ("we start later"). Check-ins stopped until he restarts. |
