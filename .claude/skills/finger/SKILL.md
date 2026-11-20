---
name: finger
description: finger is Alex's Mac app that works any USB-connected iPhone like a finger and eyes (see, tap, swipe, type, open apps), first used for Phantom's Up/Down markets; load it whenever the work touches finger, driving an iPhone, WebDriverAgent, or Phantom on the phone.
---

# finger

**Status 2026-11-20: build 1 written and tested on Linux against fake phones only. Nothing run on a Mac or an iPhone. Nothing deployed. No zip.**
The plan is `tools/finger/PLAN.md`. What is proven, unproven and not started is `tools/finger/STATUS.md`. Every outside fact and its source is `tools/finger/SOURCES.md`. Read all three before writing a line.

WebDriverAgent pin: `appium/appium-ios`, `packages/webdriveragent`, commit `a20438d81ea63ce3f985497fd0759295a7ddf58c` (version 17.0.12). Whether it builds with his Xcode 16.x is unproven.
Known since the plan: MacBook Air 2020 Intel i3, 8 GB, macOS Sequoia 15.7.4, Xcode 16.x installed; target iPhones on iOS 17 and up; free Apple account by default; spare iPhone's exact iOS still unknown.

## His words (2026-11-20), the specification

> "build it so it can work on any iPhone, because I might use two iPhones later, and they're gonna be connected with a USB."
> "the app is going to be able to do anything on the iPhone, like as a finger."
> "without mistakes, without sloppy code, without old apps. Now this is a serious build."
> "One person that makes the code, other one that it inspects, and the inspector for mistakes."
> "So the game is Phantom Wallet ... Sometimes I bet 2, sometimes I bet 5, sometimes I bet 10."
> "First BTC, then Sol, then Ethereum."

## Settled

- Name: **finger**, lowercase.
- Route: USB + Xcode + WebDriverAgent. iPhone Mirroring is unavailable in the EU.
- Mac side: bash-stub app with a bundled Node x64 binary, a page on 127.0.0.1, zero npm dependencies. No Swift shell, no Terminal window, no terminal steps for Alex.
- Own usbmux client; `xcodebuild` keeps WDA alive; never `devicectl` launch.
- Cloud side: new worker `finger-link` with a Durable Object queue. Tools: `finger_status`, `finger_look`, `finger_act`, `finger_buy`, `finger_result`, `finger_journal`, `finger_selftest`.
- Any iPhone, two later: everything keyed by UDID; alias stored on first sight; a buy carries the UDID.
- One bundle id, generated once, kept forever.
- Written new. Nothing copied from ultracursor, organic or any other app. No self-update, no cloud flags, no approval cards.
- Team: coder, inspector, mistake-hunter, then Alexander C2O. Linux tests and the macOS runner jobs must be green before any zip reaches Alex.
- finger never types or stores a passcode, PIN or seed phrase.
- Stakes: $2, $5 or $10 only. Order: BTC, SOL, ETH.
- Money limits are numbers Alex types on the page, enforced on the Mac. Mode starts PAPER.
- No readable confirm screen in Phantom means no live mode. No blind taps on money.
- Paper never touches the wallet: zero balance until the first $2 bet, which he watches.
- Round length is read from the screen, never assumed to be 5 minutes.

## Not settled: waiting on Alex (one line each)

- Spare iPhone's iOS version, and that the Mac is still the 2020 Intel MacBook Air on Sequoia. Gate zero in PLAN.md: no code before this.
- Rule 31 (AGENTS.md) says all trading is from Aquarius. His request today asks for Phantom on the iPhone. Reading: finger trades in Phantom, everything else stays on Aquarius. Confirm with him, then record his answer here with the date.
- `.claude/skills/up-or-down/SKILL.md` says real money only through Kalshi's API. On his yes, amend it and date it.
- Go-live gate numbers (minimum paper rounds per coin, hit-rate margin over price plus fee, $5 and $10 unlock levels): unset. Live mode stays off until he sets them.
- Free or paid Apple developer account.

## Unproven until his Mac

usbmux forwarding on his iOS, signing with his Apple account, and whether Phantom shows readable text and buttons. Never say finger "works" before those are seen.

## Alex, 2026-11-21: orders and live updates
- "Make sure u can give it orders and u can update it on the spot like all apps." This REPLACES plan decision 30 (no self-update).
- Orders: Claude drives finger through the finger-link tools (look, tap, swipe, type, open app), any time the app is open.
- Updates: finger checks for a newer published build and installs it itself ("different in either direction", build number on screen), no new zip for Alex. To add after M1+M2 pass inspection.
- Unchanged: the money limits live in a file on his Mac that only he types; an update never ships or edits that file.
