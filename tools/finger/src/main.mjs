// The finger worker on the Mac: finds the plugged-in iPhones, keeps one lane per phone,
// runs the commands that arrive through finger-link, and serves the page.
// Loops are independent (heartbeat and take in link.mjs, usbmux Listen, health timer);
// nothing at the top level waits on a phone.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Usbmux } from './usbmux.mjs';
import { Registry } from './devices.mjs';
import { Lane } from './lane.mjs';
import { Caps, Refusal, BUILT, checkProfile } from './guard.mjs';
import { Ledger } from './ledger.mjs';
import { CommandJournal } from './journal.mjs';
import { buy } from './buy.mjs';
import { Link } from './link.mjs';
import { startPage } from './ui.mjs';
import { WDA_PIN } from './routes.mjs';
import { probe } from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

export function readBuild() {
  return fs.readFileSync(path.join(ROOT, 'BUILD'), 'utf8').trim();
}

export function createApp({
  home,                  // folder for everything finger remembers
  usbmuxSocket,          // undefined = the real /var/run/usbmuxd
  linkBase = null,       // https://<worker>/k/<key>, or null for no link
  pagePort = 0,
  profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'phantom.json'), 'utf8')),
  now = Date.now,
  healthMs = 10000,
  linkOptions = {},
  built = BUILT,         // what finger can do by itself (guard.mjs); the tests stand in for parts not built
}) {
  checkProfile(profile); // a profile finger cannot guard does not load
  fs.mkdirSync(home, { recursive: true });
  const build = readBuild();
  const usbmux = new Usbmux(usbmuxSocket ? { socketPath: usbmuxSocket } : {});
  const registry = new Registry({ file: path.join(home, 'devices.json') });
  const caps = new Caps({ file: path.join(home, 'caps.json'), built });
  const ledger = new Ledger({ file: path.join(home, 'ledger.jsonl'), now });
  const commands = new CommandJournal({ file: path.join(home, 'commands.jsonl') });
  const lanes = new Map();
  let usbmuxError = null;
  let mac = null; // filled once by the probe, a moment after start
  let listener = null;
  let stopped = false;
  const timers = [];

  const laneFor = (udid) => {
    const k = udid.toLowerCase();
    if (!lanes.has(k)) lanes.set(k, new Lane({ udid, usbmux, registry, profile, caps, now }));
    return lanes.get(k);
  };

  function onUsb(ev) {
    if (ev.type === 'attached') {
      if (ev.connectionType !== 'USB' || !ev.udid) return;
      const known = registry.attach({ deviceId: ev.deviceId, udid: ev.udid });
      laneFor(known.udid).onAttach();
    } else {
      const gone = registry.detach(ev.deviceId);
      if (gone) laneFor(gone.udid).onDetach();
    }
  }

  // Listen tells us about every phone already plugged in, then about each change.
  async function watchUsb() {
    if (stopped) return;
    try {
      listener = await usbmux.listen(onUsb, () => {
        listener = null;
        for (const d of registry.list()) if (d.attached) { registry.detach(registry.deviceId(d.udid)); laneFor(d.udid).onDetach(); }
        if (!stopped) timers.push(setTimeout(watchUsb, 1000));
      });
      usbmuxError = null;
    } catch (e) {
      usbmuxError = e.message;
      if (!stopped) timers.push(setTimeout(watchUsb, 2000));
    }
  }

  // Never throws: a damaged file shows up as a line in "problems", not as a dead page.
  function status() {
    const c = caps.read();
    const s = ledger.summary();
    const problems = [];
    if (c.problem) problems.push(c.problem);
    if (s.damaged) problems.push(`${s.damaged}. Buying is stopped until it is repaired; looking and tapping still work.`);
    if (s.torn) problems.push(`${s.torn} unfinished row${s.torn === 1 ? ' was' : 's were'} found at the end of the money ledger and set aside (ledger.jsonl.torn).`);
    if (commands.bad) problems.push(`${commands.bad} line${commands.bad === 1 ? '' : 's'} of the command journal could not be read and ${commands.bad === 1 ? 'was' : 'were'} skipped.`);
    if (registry.problem) problems.push(registry.problem);
    if (profile.readable !== true && c.walletSetup) problems.push('Wallet setup is ON: finger may tap anywhere inside the wallet and nothing guards its buy button. The wallet balance must be zero. Switch it off when setup is done.');
    return {
      build,
      wda: WDA_PIN.version,
      mode: c.mode,
      // Read from the wallet screen once the profile exists (M4). Until then it is not known.
      balance: null,
      spentToday: s.spentToday,
      lossToday: s.lossToday,
      openStakes: s.openStakes,
      openSince: s.openSince,
      unknownBets: s.unknown.length,
      unknown: s.unknown,
      problems,
      walletRecorded: profile.readable === true,
      walletSetup: c.walletSetup,
      caps: { perBetCap: c.perBetCap, dailyCap: c.dailyCap, dailyLossLimit: c.dailyLossLimit, lossStop: c.lossStop, minSecondsLeft: c.minSecondsLeft, maxStake: c.maxStake },
      usbmuxError,
      mac,
      devices: registry.list().map((d) => ({ ...d, ...laneFor(d.udid).status() })),
    };
  }

  // Every result carries the same header (PLAN section 2).
  const stamp = (udid, body) => {
    const c = caps.read();
    const lane = udid ? laneFor(udid).status() : null;
    return {
      device: udid ? registry.label(udid) : null, udid: udid || null, build, wda: WDA_PIN.version, mode: c.mode,
      balance: null, spentToday: ledger.summary().spentToday, lastLookAgeMs: lane ? lane.lastLookAgeMs : null, ...body,
    };
  };

  async function runCommand(cmd) {
    const args = cmd.args || {};
    if (cmd.expiresAt && now() > cmd.expiresAt) return stamp(null, { ok: false, code: 'EXPIRED', error: 'this call arrived after its lifetime; nothing was done' });
    // Written before anything runs. A second delivery of the same id stops here.
    if (!commands.begin(cmd.id, cmd.tool)) return stamp(null, { ok: false, code: 'ALREADY_RUN', error: 'this call was already started once; it is not run again' });
    let udid = null;
    // The lifetime is checked here and again when the call's turn in the phone's lane comes.
    const life = { expiresAt: cmd.expiresAt };
    try {
      if (cmd.tool === 'finger_look') {
        udid = registry.resolve(args.device);
        return stamp(udid, { ok: true, ...(await laneFor(udid).look(args.mode || 'tree', life)) });
      }
      if (cmd.tool === 'finger_act') {
        udid = registry.resolve(args.device);
        const done = await laneFor(udid).act(args.steps, args.then || 'tree', life);
        // The picture rides at the top of the result, where finger-link looks for it.
        const image = done.after ? done.after.image : undefined;
        if (image) delete done.after.image;
        return stamp(udid, { ...done, image });
      }
      if (cmd.tool === 'finger_buy') {
        udid = registry.resolve(args.udid, { forBuy: true });
        const req = { udid, coin: args.coin, side: args.side, stake: args.stake, round: args.round, createdAt: cmd.createdAt };
        return stamp(udid, await buy(req, { lane: laneFor(udid), caps, ledger, profile, now, ...life }));
      }
      if (cmd.tool === 'finger_selftest') {
        return stamp(null, { ok: false, code: 'NOT_BUILT', error: 'the self-test is not built yet (milestone M3)' });
      }
      return stamp(null, { ok: false, code: 'BAD_REQUEST', error: `finger does not know the tool ${cmd.tool}` });
    } catch (e) {
      return stamp(udid, { ok: false, code: e.code || 'ERROR', error: e.message });
    }
  }

  const link = linkBase ? new Link({ base: linkBase, getStatus: status, onCommand: runCommand, outboxFile: path.join(home, 'outbox.json'), ...linkOptions }) : null;
  let page = null;

  return {
    registry, caps, ledger, lanes, laneFor, status, runCommand, profile,
    get pageUrl() { return page ? page.url : null; },
    async start() {
      await watchUsb();
      probe().then((m) => { mac = m; }).catch((e) => { mac = { error: e.message }; });
      timers.push(setInterval(() => { for (const lane of lanes.values()) lane.healthTick(); }, healthMs));
      page = await startPage({ port: pagePort, getStatus: () => ({ ...status(), link: link ? { lastOkAt: link.lastOkAt, error: link.lastError, undelivered: Object.keys(link.outbox).length } : null }), caps, ledger, profile });
      if (link) link.start();
      return this;
    },
    async stop() {
      stopped = true;
      timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
      if (link) link.stop();
      if (listener) listener.close();
      if (page) await page.close();
    },
  };
}

// One copy only. The pidfile names the copy that is already running.
function claimPidfile(file) {
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    let alive = false;
    try { process.kill(pid, 0); alive = pid > 0; } catch { alive = false; }
    if (alive && pid !== process.pid) throw new Refusal('ALREADY_RUNNING', `finger is already running (process ${pid})`);
  }
  fs.writeFileSync(file, String(process.pid));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.env.FINGER_HOME || path.join(os.homedir(), 'Library', 'Application Support', 'finger');
  fs.mkdirSync(home, { recursive: true });
  try {
    claimPidfile(path.join(home, 'finger.pid'));
  } catch (e) {
    console.error(e.message);
    process.exit(3);
  }
  // The link address is kept in link.json ({"base": "https://.../k/<key>"}) once finger-link is deployed.
  const linkFile = path.join(home, 'link.json');
  let linkBase = null;
  try {
    if (fs.existsSync(linkFile)) linkBase = JSON.parse(fs.readFileSync(linkFile, 'utf8')).base || null;
  } catch (e) {
    console.error(`link.json cannot be read (${e.message}); starting without the link to Claude`);
  }
  const app = createApp({ home, usbmuxSocket: process.env.FINGER_USBMUXD, linkBase, pagePort: Number(process.env.FINGER_PORT || 4747) });
  await app.start();
  fs.writeFileSync(path.join(home, 'page.url'), app.pageUrl);
  console.log(`finger build ${readBuild()} page ${app.pageUrl}`);
  const quit = async () => { await app.stop(); fs.rmSync(path.join(home, 'finger.pid'), { force: true }); process.exit(0); };
  process.on('SIGTERM', quit);
  process.on('SIGINT', quit);
}
