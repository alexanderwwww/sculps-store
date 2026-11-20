// Looks and steps. Everything here runs inside one phone's lane, one call at a time.
// Routes and body keys: routes.mjs (each cited to the pinned WDA source).
import { BUTTONS } from './routes.mjs';
import { flatten, lines, fingerprint, findByLabel, centre } from './tree.mjs';
import { decodeScreenshot, mapping, toPoints, fit } from './screen.mjs';
import { Refusal, refuseIfTouchesConfirm, refuseSecretTyping } from './guard.mjs';

export const LIMITS = {
  lookMaxAgeMs: 15000, // a coordinate from a look older than this is refused
  imageMaxPx: 900,     // starting target for the long side (PLAN section 3: not final)
  maxHoldSeconds: 10,
  maxSwipeSeconds: 10,
  maxWaitMs: 10000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ctx: { wda, looks, udid, profile, now, resize }

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
    out.image = { base64: image.bytes.toString('base64'), mime: image.mime, width: image.width, height: image.height, downscaled: image.downscaled };
  }
  if (mode !== 'image') out.tree = lines(elements);
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

const STEPS = {
  async tap(ctx, s) {
    const { point, elements } = await target(ctx, s, 'tap');
    await guardPoints(ctx, elements, [point]);
    await ctx.wda.call('tap', { body: point });
    return `tap sent at ${point.x},${point.y}`;
  },
  async double(ctx, s) {
    const { point, elements } = await target(ctx, s, 'double');
    await guardPoints(ctx, elements, [point]);
    await ctx.wda.call('doubleTap', { body: point });
    return `double tap sent at ${point.x},${point.y}`;
  },
  async hold(ctx, s) {
    const seconds = s.seconds === undefined ? 1 : s.seconds;
    if (!(seconds > 0 && seconds <= LIMITS.maxHoldSeconds)) throw new Refusal('BAD_REQUEST', `hold seconds must be above 0 and at most ${LIMITS.maxHoldSeconds}`);
    const { point, elements } = await target(ctx, s, 'hold');
    await guardPoints(ctx, elements, [point]);
    await ctx.wda.call('touchAndHold', { body: { ...point, duration: seconds } });
    return `hold sent at ${point.x},${point.y} for ${seconds} s`;
  },
  async swipe(ctx, s) {
    const seconds = s.seconds === undefined ? 0.3 : s.seconds;
    if (!(seconds >= 0 && seconds <= LIMITS.maxSwipeSeconds)) throw new Refusal('BAD_REQUEST', `swipe seconds must be 0 to ${LIMITS.maxSwipeSeconds}`);
    if (!Array.isArray(s.from) || !Array.isArray(s.to)) throw new Refusal('BAD_REQUEST', 'swipe needs from:[x,y] and to:[x,y]');
    const { elements, fp } = await readTree(ctx);
    const a = await pointOf(ctx, { x: s.from[0], y: s.from[1], of: s.of, unit: s.unit }, fp, 'swipe');
    const b = await pointOf(ctx, { x: s.to[0], y: s.to[1], of: s.of, unit: s.unit }, fp, 'swipe');
    await guardPoints(ctx, elements, [a, b]);
    await ctx.wda.call('drag', { body: { fromX: a.x, fromY: a.y, toX: b.x, toY: b.y, duration: seconds } });
    return `swipe sent from ${a.x},${a.y} to ${b.x},${b.y}`;
  },
  async type(ctx, s) {
    if (typeof s.text !== 'string' || s.text === '') throw new Refusal('BAD_REQUEST', 'type needs text');
    refuseSecretTyping({ text: s.text, appBundleId: await foregroundApp(ctx), profile: ctx.profile });
    // "value" is an array of characters: FBElementCommands.m:555 joins it.
    await ctx.wda.call('keys', { body: { value: [...s.text] } });
    return `typed ${s.text.length} characters`;
  },
  async home(ctx) {
    await ctx.wda.call('homescreen');
    return 'home sent';
  },
  async press(ctx, s) {
    if (!BUTTONS.includes(s.button)) throw new Refusal('BAD_REQUEST', `button is one of: ${BUTTONS.join(', ')}`);
    await ctx.wda.call('pressButton', { body: { name: s.button } });
    return `${s.button} button pressed`;
  },
  async open(ctx, s) {
    if (typeof s.bundleId !== 'string' || s.bundleId === '') throw new Refusal('BAD_REQUEST', 'open needs a bundleId');
    await ctx.wda.call('appActivate', { body: { bundleId: s.bundleId } });
    return `open sent for ${s.bundleId}`;
  },
  async close(ctx, s) {
    if (typeof s.bundleId !== 'string' || s.bundleId === '') throw new Refusal('BAD_REQUEST', 'close needs a bundleId');
    const was = await ctx.wda.call('appTerminate', { body: { bundleId: s.bundleId } });
    return was ? `${s.bundleId} closed` : `${s.bundleId} was not running`;
  },
  async alert(ctx, s) {
    const body = typeof s.name === 'string' ? { name: s.name } : {};
    if (s.accept === true) await ctx.wda.call('alertAccept', { body });
    else if (s.dismiss === true) await ctx.wda.call('alertDismiss', { body });
    else throw new Refusal('BAD_REQUEST', 'alert needs accept:true or dismiss:true');
    return s.accept ? 'pop-up accepted' : 'pop-up dismissed';
  },
  async wait(ctx, s) {
    if (!(s.ms >= 0 && s.ms <= LIMITS.maxWaitMs)) throw new Refusal('BAD_REQUEST', `wait ms must be 0 to ${LIMITS.maxWaitMs}`);
    await sleep(s.ms);
    return `waited ${s.ms} ms`;
  },
};

export const STEP_NAMES = Object.keys(STEPS);

async function guardPoints(ctx, elements, points) {
  if (!ctx.profile || !ctx.profile.bundleId) return;
  refuseIfTouchesConfirm({ elements, appBundleId: await foregroundApp(ctx), profile: ctx.profile, points });
}

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
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 20) throw new Refusal('BAD_REQUEST', 'steps is a list of 1 to 20 steps');
  const results = [];
  for (let i = 0; i < steps.length; i++) {
    try {
      const { name, arg } = parseStep(steps[i]);
      if (alertOpen !== null && name !== 'alert') throw new Refusal('ALERT_OPEN', `a pop-up is open: "${alertOpen}". Answer it with an alert step first.`);
      const sent = await STEPS[name](ctx, arg);
      if (name === 'alert') alertOpen = null;
      results.push({ step: i + 1, action: name, ok: true, sent });
    } catch (e) {
      results.push({ step: i + 1, ok: false, code: e.code || 'ERROR', error: e.message });
      return { ok: false, results };
    }
  }
  return { ok: true, results };
}
