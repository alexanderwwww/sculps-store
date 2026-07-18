# AETOS — your GMGN scalper

A small Windows program that trades memecoins on GMGN for you, with strict robot discipline:
tiny bets, quick profits ("take the 80 cents"), fast stop-losses, rug protection,
and automatic cool-downs when it loses.

It looks like a floating iPhone on your desktop. No browser needed.

---

## Install (one time)

1. **Download this folder** to your computer (e.g. `C:\AETOS`).
2. Double-click **`SETUP.bat`**.
   - If it says Python is missing: install Python from the page it opens
     (**tick "Add python.exe to PATH"**), then run `SETUP.bat` again.
3. The app opens. Next time, just double-click **AETOS** on your desktop.

## Connect to GMGN (one time, inside the app)

The app opens the Setup screen automatically:

1. **Generate my key** → copy the public key it shows.
2. Go to **gmgn.ai → GMGN API Management → Create API Key**
   → paste the public key → turn ON **Enable Reading** → Create → copy the API key.
3. Paste the API key back into the app → **Save + Test connection**.
4. Press **START**. The bot now paper-trades with real live market data.

## Going LIVE (real money — later, when paper looks good)

1. In GMGN, edit your API key: turn ON **Enable Trading** (needs 2FA).
2. In the app Setup: paste your **GMGN Solana wallet address**.
3. Fund that wallet with a SMALL amount you are 100% OK losing.
4. Settings → **Switch to LIVE…** → type `ARM` → press START.

On live buys the bot also attaches **server-side take-profit/stop-loss on GMGN itself**,
so your safety exits exist even if your PC sleeps.

## The rules the robot follows

| Rule | Default |
|---|---|
| Bet size | $5 per trade |
| Max open trades | 2 |
| Take profit | +25% (or earlier if the pump fades after +10%) |
| Stop loss | −18% |
| Time stop | exit stale trades after 12 min |
| Safety checks | honeypot, rug ratio, mint/freeze authority, liquidity, top-10 holders |
| 3 losses in a row | 45-minute cooldown |
| Daily loss cap | −$15 → stops for the day |

Change any of these with the ⚙ button.

## Honest warnings

- Memecoin scalping is **high risk**. Most bots lose money. Paper-trade first, watch it for days.
- Only fund what you can afford to lose completely.
- Your private key stays in `gmgn_private.pem` in this folder. **Never send it to anyone.**
- `PANIC` sells everything and stops — that's your big red button.

## Files

- `SETUP.bat` — one-time installer
- `AETOS.bat` / desktop shortcut — start the app
- `MAKE_EXE.bat` — optional: build a single `AETOS.exe`
- `aetos.py`, `brain.py`, `gmgn_client.py`, `ui.html` — the program
- `selftest.py` — run `venv\Scripts\python selftest.py` to check everything
- `config.json`, `state.json`, `gmgn_private.pem` — your data (never share)
