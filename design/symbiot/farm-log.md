# Symbiot super-farming log

Fake money, 1.618 SOL a trade. One row per check-in.

| time (UTC) | build | trades | W | L | plus | minus | net | fees | open | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-20 10:20 | 33 | 69 | 18 | 51 | 4.235 | −6.955 | −2.720 | 5.722 | 57 | fees > losses; most trades bought before the 3% fee cap |
| 2026-10-20 10:58 | 34 | 128 | 27 | 101 | 8.023 | −13.648 | −5.625 | 2.081* | 0 | STALLED: learning blocked every coin (all symbiot trades shared the shape "young"/"e:any"; 7,417 skips). Win rate 21%. Fixed in build 35: symbiot records lessons, never blocks; shapes = age, pool, hour, source. *fee counter reset at restart |
| 2026-10-20 11:08 | 35 | 167 | 38 | 129 | 10.414 | −18.637 | −8.224 | 3.628 | 17 | trading again after the fix; win rate 23%. 3% fee cap skips most pump.fun pools (4–8% round trip measured). |
| 2026-10-20 10:56 | 35 | 202 | 43 | 159 | 12.781 | −25.514 | −12.732 | 6.789 | 11 | win rate 21%; losses are about 2× wins in SOL. App restarting into build 36 (post-mortems). |
