// Looks and steps. Everything here runs inside one phone's lane, one call at a time.
// Routes and body keys: routes.mjs (each cited to the pinned WDA source).
import { BUTTONS } from './routes.mjs';
import { flatten, lines, fingerprint, findByLabel, centre, capLines } from './tree.mjs';
import { decodeScreenshot, mapping, toPoints, fit } from './screen.mjs';
import { Refusal, guardWalletGesture, refuseSecretTyping, refuseWalletAlert } from './guard.mjs';

export const LIMITS = {
  lookMaxAgeMs: 15000, // a coordinate from a look older than this is refused
  imageMaxPx: 900,     // starting target for the long side (PLAN section 3: not final)
  maxHoldSeconds: 10,
  maxWaitMs: 10000,
  maxSteps: 20,
  // What one look may send. finger's own starting numbers, set well under the one limit
  // that has been read: a finger-link result is one SQLite string, and a Durable Object
  // allows 8 MB for a string or row (SOURCES.md section 4). link.mjs has the last check.
  treeMaxLines: 500,
  treeMaxBytes: 64 * 1024,
  imageMaxBytes: 2 * 1000 * 1000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ctx: { wda, looks, udid, profile, caps, now, resize }

export async function readTree(ctx) {
  const root = await ctx.wda.call('source', { query: { format: 'json' } });
  const elements = flatten(root);
  return { elements, fp: fingerprint(elements) };
}

export async function foregroundApp(ctx) {
  const info = await ctx.wda.call('activeApp');
  return info && typeof info.bundleId === 'string' ? info.bundleId : null;
}

// /screenshot itself needs no session, but the JPEG setting is applied through one, so a
// session is made first. If the bytes still come back as HEIC (WDA restarted and lost its
// settings), a new session is made and the screenshot taken once more.
async function screenshot(ctx) {
  await ctx.wda.ensureSession();
  try {
    return decodeScreenshot(await ctx.wda.call('screenshot'));
  } catch (e) {
    if (e.code !== 'BAD_IMAGE') throw e;
    await ctx.wda.newSession();
    return decodeScreenshot(await ctx.wda.call('screenshot'));
  }
}

// mode: tree | image | both. The tree is always read, because its fingerprint is what a
// later coordinate tap is checked against.
export async function look(ctx, mode = 'tree') {
  if (!['tree', 'image', 'both'].includes(mode)) throw new Refusal('BAD_REQUEST', 'look mode is tree, image or both');
  const app = await foregroundApp(ctx);
  const { elements, fp } = await readTree(ctx);
  const out = { app, fingerprint: fp };
  let map = null;
  if (mode !== 'tree') {
    const shot = await screenshot(ctx);
    const image = await fit(shot, LIMITS.imageMaxPx, ctx.resize);
    map = mapping(image, await ctx.wda.call('windowSize'));
    if (image.bytes.length > LIMITS.imageMaxBytes) {
      throw new Refusal('IMAGE_TOO_BIG', `the picture is ${image.bytes.length} bytes, over the ${LIMITS.imageMaxBytes} that can be sent; look with mode "tree"`);
    }
    out.image = { base64: image.bytes.toString('base64'), mime: image.mime, width: image.width, height: image.height, downscaled: image.downscaled };
  }
  if (mode !== 'image') out.tree = capLines(lines(elements), LIMITS.treeMaxLines, LIMITS.treeMaxBytes);
  out.lookId = ctx.looks.add({ udid: ctx.udid, fp, map, mode, at: ctx.now() });
  return out;
}

// Turns {label} or {x, y, of, unit} into a point on the screen, in points, with the tree it
// was checked against.
async function target(ctx, step, what) {
  const { elements, fp } = await readTree(ctx);
  if (typeof step.label === 'string') {
    const found = findByLabel(elements, step.label);
    if (found.length === 0) throw new Refusal('NO_SUCH_LABEL', `nothing on the screen is labelled "${step.label}"`);
    if (found.length > 1) throw new Refusal('AMBIGUOUS_LABEL', `${found.length} things are labelled "${step.label}"; use a coordinate from a look`);
    return { point: centre(found[0].rect), elements };
  }
  return { point: await pointOf(ctx, step, fp, what), elements };
}

async function pointOf(ctx, step, fp, what) {
  const { x, y, of } = step;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Refusal('BAD_REQUEST', `${what} needs a label, or x and y with "of"`);
  const seen = ctx.looks.get(of);
  if (!seen || seen.udid !== ctx.udid) throw new Refusal('NO_SUCH_LOOK', `${what} by coordinate needs "of": the lookId the coordinate came from, on this phone`);
  if (ctx.now() - seen.at > LIMITS.lookMaxAgeMs) throw new Refusal('STALE_LOOK', 'that look is too old; look again');
  if (seen.fp !== fp) throw new Refusal('SCREEN_CHANGED', 'the screen has changed since that look; look again');
  const unit = step.unit || (seen.mode === 'tree' ? 'pt' : seen.mode === 'image' ? 'px' : null);
  if (unit === 'pt') return { x: Math.round(x), y: Math.round(y) };
  if (unit === 'px' && seen.map) return toPoints(seen.map, x, y);
  throw new Refusal('BAD_REQUEST', 'say unit "pt" (tree coordinates) or "px" (image coordinates)');
}

// A number of the right kind inside a range, or a Refusal. true, "5" and null are not numbers.
function number(v, min, max, what) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Refusal('BAD_REQUEST', `${what} must be a number from ${min} to ${max}`);
  return v;
}

// The screen in points, asked once per call (run is the state of one runSteps call).
async function windowSize(ctx, run) {
  if (!run.size) {
    const s = await ctx.wda.call('windowSize');
    if (!s || !(s.width > 0) || !(s.height > 0)) throw new Refusal('NO_SCREEN_SIZE', 'the phone did not say how big its screen is');
    run.size = { width: s.width, height: s.height };
  }
  return run.size;
}

// Before any touch is sent: every point is on the screen, and the wallet guard agrees.
async function mayTouch(ctx, run, elements, points) {
  const size = await windowSize(ctx, run);
  for (const p of points) {
    if (!(p.x >= 0 && p.x <= size.width && p.y >= 0 && p.y <= size.height)) {
      throw new Refusal('OFF_SCREEN', `${p.x},${p.y} is not on the screen (${size.width} x ${size.height} points)`);
    }
  }
  if (!ctx.profile) return;
  guardWalletGesture({
    profile: ctx.profile, appBundleId: await foregroundApp(ctx), elements, points, windowSize: size,
    walletSetup: ctx.caps ? ctx.caps.read().walletSetup === true : false,
  });
}

// Sends one action to the phone. When no clean answer comes back, the action may still
// have landed, and the result says so instead of calling it a plain failure.
async function send(ctx, route, body) {
  try {
    return await ctx.wda.call(route, body === undefined ? {} : { body });
  } catch (e) {
    if (e.kind !== 'transport' || !['TIMEOUT', 'CLOSED', 'NOT_JSON', 'HTTP_STATUS'].includes(e.code)) throw e;
    const err = new Error(`no answer from the phone (${e.message}). It may or may not have landed: look before repeating it.`);
    err.code = 'NO_ANSWER';
    err.noAnswer = true;
    throw err;
  }
}

const STEPS = {
  async tap(ctx, s, run) {
    const { point, elements } = await target(ctx, s, 'tap');
    await mayTouch(ctx, run, elements, [point]);
    await send(ctx, 'tap', point);
    return `tap sent at ${point.x},${point.y}`;
  },
  async double(ctx, s, run) {
    const { point, elements } = await target(ctx, s, 'double');
    await mayTouch(ctx, run, elements, [point]);
    await send(ctx, 'doubleTap', point);
    return `double tap sent at ${point.x},${point.y}`;
  },
  async hold(ctx, s, run) {
    const seconds = s.seconds === undefined ? 1 : number(s.seconds, 0.1, LIMITS.maxHoldSeconds, 'hold seconds');
    const { point, elements } = await target(ctx, s, 'hold');
    await mayTouch(ctx, run, elements, [point]);
    await send(ctx, 'touchAndHold', { ...point, duration: seconds });
    return `hold sent at ${point.x},${point.y} for ${seconds} s`;
  },
  // WDA's "duration" on this route is how long the finger presses BEFORE the drag starts;
  // the drag itself runs at XCTest's default speed and cannot be set here
  // (Commands/FBElementCommands.m:463-470, Categories/XCUIApplication+FBTouchAction.m:118-129).
  // So the step has holdBefore, default 0 (a plain swipe), and no "seconds".
  async swipe(ctx, s, run) {
    if ('seconds' in s) throw new Refusal('BAD_REQUEST', 'swipe has no speed setting. holdBefore is the seconds the finger presses before it starts to move (0 for a plain swipe).');
    const holdBefore = s.holdBefore === undefined ? 0 : number(s.holdBefore, 0, LIMITS.maxHoldSeconds, 'swipe holdBefore');
    if (!Array.isArray(s.from) || !Array.isArray(s.to)) throw new Refusal('BAD_REQUEST', 'swipe needs from:[x,y] and to:[x,y]');
    const { elements, fp } = await readTree(ctx);
    const a = await pointOf(ctx, { x: s.from[0], y: s.from[1], of: s.of, unit: s.unit }, fp, 'swipe');
    const b = await pointOf(ctx, { x: s.to[0], y: s.to[1], of: s.of, unit: s.unit }, fp, 'swipe');
    await mayTouch(ctx, run, elements, [a, b]);
    await send(ctx, 'drag', { fromX: a.x, fromY: a.y, toX: b.x, toY: b.y, duration: holdBefore });
    return `swipe sent from ${a.x},${a.y} to ${b.x},${b.y}`;
  },
  async type(ctx, s) {
    if (typeof s.text !== 'string' || s.text === '') throw new Refusal('BAD_REQUEST', 'type needs text');
    refuseSecretTyping({ text: s.text, appBundleId: await foregroundApp(ctx), profile: ctx.profile });
    // "value" is an array of characters: FBElementCommands.m:555 joins it.
    await send(ctx, 'keys', { value: [...s.text] });
    return `typed ${s.text.length} characters`;
  },
  async home(ctx) {
    await send(ctx, 'homescreen');
    return 'home sent';
  },
  async press(ctx, s) {
    if (!BUTTONS.includes(s.button)) throw new Refusal('BAD_REQUEST', `button is one of: ${BUTTONS.join(', ')}`);
    await send(ctx, 'pressButton', { name: s.button });
    return `${s.button} button pressed`;
  },
  async open(ctx, s) {
    if (typeof s.bundleId !== 'string' || s.bundleId === '') throw new Refusal('BAD_REQUEST', 'open needs a bundleId');
    await send(ctx, 'appActivate', { bundleId: s.bundleId });
    return `open sent for ${s.bundleId}`;
  },
  async close(ctx, s) {
    if (typeof s.bundleId !== 'string' || s.bundleId === '') throw new Refusal('BAD_REQUEST', 'close needs a bundleId');
    const was = await send(ctx, 'appTerminate', { bundleId: s.bundleId });
    return was ? `${s.bundleId} closed` : `${s.bundleId} was not running`;
  },
  async alert(ctx, s) {
    if (s.accept !== true && s.dismiss !== true) throw new Refusal('BAD_REQUEST', 'alert needs accept:true or dismiss:true');
    if (ctx.profile) refuseWalletAlert({ step: s, appBundleId: await foregroundApp(ctx), profile: ctx.profile });
    const body = typeof s.name === 'string' ? { name: s.name } : {};
    await send(ctx, s.accept === true ? 'alertAccept' : 'alertDismiss', body);
    return s.accept === true ? 'pop-up accepted' : 'pop-up dismissed';
  },
  async wait(ctx, s) {
    number(s.ms, 0, LIMITS.maxWaitMs, 'wait ms');
    await sleep(s.ms);
    return `waited ${s.ms} ms`;
  },
};

export const STEP_NAMES = Object.keys(STEPS);

function parseStep(step) {
  if (!step || typeof step !== 'object') throw new Refusal('BAD_REQUEST', 'a step is an object with one action');
  const names = Object.keys(step).filter((k) => STEP_NAMES.includes(k));
  if (names.length !== 1 || Object.keys(step).length !== 1) throw new Refusal('BAD_REQUEST', `a step has exactly one of: ${STEP_NAMES.join(', ')}`);
  const arg = step[names[0]];
  return { name: names[0], arg: arg && typeof arg === 'object' ? arg : {} };
}

// Runs steps in order and stops at the first one that fails. A step that went through is
// reported as "sent", never as "worked": only the look afterwards shows what happened.
// alertOpen: when a pop-up is open, only alert steps are allowed.
export async function runSteps(ctx, steps, { alertOpen = null } = {}) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > LIMITS.maxSteps) throw new Refusal('BAD_REQUEST', `steps is a list of 1 to ${LIMITS.maxSteps} steps`);
  const results = [];
  const run = { size: null };
  for (let i = 0; i < steps.length; i++) {
    try {
      const { name, arg } = parseStep(steps[i]);
      if (alertOpen !== null && name !== 'alert') throw new Refusal('ALERT_OPEN', `a pop-up is open: "${alertOpen}". Answer it with an alert step first.`);
      const sent = await STEPS[name](ctx, arg, run);
      if (name === 'alert') alertOpen = null;
      results.push({ step: i + 1, action: name, ok: true, sent });
    } catch (e) {
      const failed = { step: i + 1, ok: false, code: e.code || 'ERROR', error: e.message };
      // noAnswer: the phone did not answer (dead, hung or unplugged), so asking it more is pointless.
      if (e.noAnswer || e.kind === 'transport') failed.noAnswer = true;
      results.push(failed);
      return { ok: false, results };
    }
  }
  return { ok: true, results };
}
