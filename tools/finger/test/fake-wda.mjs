// A fake WebDriverAgent. Its routes are transcribed from the pinned source on their own
// (not imported from src/routes.mjs), so a mistake in either table shows up as a failed test.
// Pinned: appium/appium-ios a20438d81ea63ce3f985497fd0759295a7ddf58c, packages/webdriveragent/WebDriverAgentLib
//   envelope {value, sessionId}; errors {error, message, traceback}   Routing/FBResponsePayload.m:139-154
//   error names and HTTP codes                                        Routing/FBCommandStatus.m:11-77
//   a route needs /session/<id> unless .withoutSession                Routing/FBRoute.m:106-122,153-169
//   unknown paths -> "unknown command"                                Commands/FBUnknownCommands.m:26-29
//   one request at a time (main queue)                                Routing/FBWebServer.m:80
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// [method, path, where]  where: 'session' | 'plain' | 'both'
const TABLE = [
  ['GET',  '/status',                    'plain'],   // FBSessionCommands.m:52
  ['POST', '/session',                   'plain'],   // FBSessionCommands.m:44
  ['POST', '/appium/settings',           'session'], // FBSessionCommands.m:59
  ['GET',  '/source',                    'both'],    // FBDebugCommands.m:26-27
  ['GET',  '/screenshot',                'both'],    // FBScreenshotCommands.m:21-22
  ['GET',  '/window/size',               'both'],    // FBElementCommands.m:61,63
  ['GET',  '/wda/activeAppInfo',         'both'],    // FBCustomCommands.m:60-61
  ['GET',  '/wda/locked',                'both'],    // FBCustomCommands.m:54-55
  ['GET',  '/alert/text',                'both'],    // FBAlertViewCommands.m:24-25
  ['POST', '/alert/accept',              'both'],    // FBAlertViewCommands.m:27-28
  ['POST', '/alert/dismiss',             'both'],    // FBAlertViewCommands.m:29-30
  ['POST', '/wda/tap',                   'session'], // FBElementCommands.m:123
  ['POST', '/wda/doubleTap',             'session'], // FBElementCommands.m:95
  ['POST', '/wda/touchAndHold',          'session'], // FBElementCommands.m:106
  ['POST', '/wda/dragfromtoforduration', 'session'], // FBElementCommands.m:114
  ['POST', '/wda/keys',                  'session'], // FBElementCommands.m:127
  ['POST', '/wda/pressButton',           'session'], // FBCustomCommands.m:69
  ['POST', '/wda/homescreen',            'plain'],   // FBCustomCommands.m:47
  ['POST', '/wda/apps/activate',         'session'], // FBSessionCommands.m:46
  ['POST', '/wda/apps/terminate',        'session'], // FBSessionCommands.m:47
];

const ERR = {
  unknownCommand: ['unknown command', 404],
  noSession: ['invalid session id', 404],
  noAlert: ['no such alert', 404],
  invalidArgument: ['invalid argument', 400],
  unknown: ['unknown error', 500],
  sessionNotCreated: ['session not created', 500],
};

class Fail extends Error {
  constructor(kind, message) { super(message || ERR[kind][0]); this.kind = kind; }
}

// Bytes that start like the real formats. Enough for a size to be read; not a full picture.
export function fakeJpeg(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8;
  sof.writeUInt16BE(height, 5); sof.writeUInt16BE(width, 7); sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
export function fakePng(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}
export function fakeHeic() {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(24, 0); b.write('ftypheic', 4, 'latin1');
  return b;
}

export const el = (type, label, x, y, w, h, extra = {}) => ({ type, label, name: label, value: null, rect: { x, y, width: w, height: h }, ...extra });
export const screen = (...children) => ({ type: 'Application', label: ' ', name: ' ', value: null, rect: { x: 0, y: 0, width: 390, height: 844 }, children });

export class FakeWda {
  constructor({ name = 'phone' } = {}) {
    this.name = name;
    this.sessionId = null;
    this.sessionsMade = 0;
    this.settings = {};
    this.locked = false;
    this.alert = null;
    this.app = 'com.apple.springboard';
    this.tree = screen(el('Button', 'Settings', 20, 100, 60, 60), el('Button', 'Safari', 100, 100, 60, 60));
    this.windowSize = { width: 390, height: 844 };
    this.pixels = { width: 1170, height: 2532 };
    this.typed = '';
    this.calls = [];      // { method, path, body }
    this.delays = {};     // path -> ms before answering
    this.html = false;    // answer with an HTML page instead of JSON
    this.onTap = null;    // (x, y) => void
    this.inFlight = 0;
    this.maxInFlight = 0;
    this.chain = Promise.resolve();
    this.server = http.createServer((req, res) => this.accept(req, res));
  }

  start() { return new Promise((r) => this.server.listen(0, '127.0.0.1', () => { this.port = this.server.address().port; r(this); })); }
  stop() { this.server.closeAllConnections(); return new Promise((r) => this.server.close(r)); }
  // WDA dies: the port stops listening.
  async die() { await this.stop(); }
  async revive() {
    this.server = http.createServer((req, res) => this.accept(req, res));
    await new Promise((r) => this.server.listen(this.port, '127.0.0.1', r));
    this.sessionId = null;
  }

  callsTo(path) { return this.calls.filter((c) => c.path === path); }

  accept(req, res) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      // One at a time, like the real one.
      this.chain = this.chain.then(() => this.answer(req, res, Buffer.concat(chunks).toString('utf8'))).catch(() => {});
    });
  }

  async answer(req, res, raw) {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      const url = new URL(req.url, 'http://x');
      let path = url.pathname;
      let sid = null;
      const m = /^\/session\/([^/]+)(\/.*)?$/.exec(path);
      if (m) { sid = m[1]; path = m[2] || ''; }
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }
      this.calls.push({ method: req.method, path, body, sid });
      if (this.delays[path]) await new Promise((r) => setTimeout(r, this.delays[path]));
      if (this.html) {
        res.writeHead(502, { 'content-type': 'text/html' });
        return res.end('<html><body>Bad Gateway</body></html>');
      }
      let status = 200;
      let value;
      try {
        if (sid !== null && sid !== this.sessionId) throw new Fail('noSession', 'Session does not exist');
        const route = TABLE.find((r) => r[0] === req.method && r[1] === path);
        const fits = route && (route[2] === 'both' || (route[2] === 'session') === (sid !== null));
        if (!fits) throw new Fail('unknownCommand');
        value = this.route(req.method, path, body, url.searchParams);
      } catch (e) {
        if (!(e instanceof Fail)) throw e;
        status = ERR[e.kind][1];
        value = { error: ERR[e.kind][0], message: e.message, traceback: '' };
      }
      const out = JSON.stringify({ value: value === undefined ? null : value, sessionId: this.sessionId });
      res.writeHead(status, { 'content-type': 'application/json;charset=UTF-8', 'content-length': Buffer.byteLength(out), server: 'WebDriverAgent/1.0' });
      res.end(out);
    } finally {
      this.inFlight--;
    }
  }

  xy(body) {
    const hasX = body.x !== undefined, hasY = body.y !== undefined;
    if (hasX !== hasY) throw new Fail('invalidArgument', 'Both x and y coordinates must be provided'); // FBElementCommands.m:770-774
    if (!hasX) throw new Fail('unknown', 'the fake needs x and y');
    return [Number(body.x), Number(body.y)];
  }

  route(method, path, body, query) {
    switch (path) {
      case '/status':
        return { ready: true, message: 'WebDriverAgent is ready to accept commands', state: 'success', os: { name: 'iOS', version: '17.5', sdkVersion: '18.0', testmanagerdVersion: 65 }, ios: { ip: null }, build: { time: 'x', productBundleIdentifier: 'com.facebook.WebDriverAgentRunner', version: '17.0.12' }, device: 'iphone' };
      case '/session':
        if (!body.capabilities || typeof body.capabilities !== 'object') throw new Fail('sessionNotCreated', "'capabilities' is mandatory to create a new session"); // :266-268
        this.sessionId = randomUUID().toUpperCase();   // the old session is gone (:93)
        this.sessionsMade++;
        this.settings = {};                            // session settings reset (:281)
        return { sessionId: this.sessionId, capabilities: { device: 'iphone' } };
      case '/appium/settings':
        if (body.settings !== undefined && (typeof body.settings !== 'object' || Array.isArray(body.settings))) throw new Fail('invalidArgument', 'settings must be a dictionary');
        Object.assign(this.settings, body.settings || {});
        return this.settings;
      case '/source':
        if ((query.get('format') || 'xml').toLowerCase() !== 'json') return '<xml/>';
        return this.tree;
      case '/screenshot': {
        const q = this.settings.screenshotQuality === undefined ? 3 : this.settings.screenshotQuality; // default 3 = HEIC
        const bytes = q === 3 ? fakeHeic() : q === 0 ? fakePng(this.pixels.width, this.pixels.height) : fakeJpeg(this.pixels.width, this.pixels.height);
        return bytes.toString('base64');
      }
      case '/window/size': return this.windowSize;
      case '/wda/activeAppInfo': return { pid: 42, bundleId: this.app, name: 'app', processArguments: { args: [], env: {} } };
      case '/wda/locked': return this.locked;
      case '/alert/text':
        if (this.alert === null) throw new Fail('noAlert');
        return this.alert;
      case '/alert/accept':
      case '/alert/dismiss':
        if (this.alert === null) throw new Fail('noAlert');
        this.alert = null;
        return null;
      case '/wda/tap': { const [x, y] = this.xy(body); if (this.onTap) this.onTap(x, y); return null; }
      case '/wda/doubleTap': this.xy(body); return null;
      case '/wda/touchAndHold': this.xy(body); if (typeof body.duration !== 'number') throw new Fail('unknown', 'duration'); return null;
      case '/wda/dragfromtoforduration':
        for (const k of ['fromX', 'fromY', 'toX', 'toY', 'duration']) if (typeof body[k] !== 'number') throw new Fail('unknown', `missing ${k}`);
        return null;
      case '/wda/keys':
        if (!Array.isArray(body.value)) throw new Fail('unknown', 'value must be an array'); // joined at :555
        this.typed += body.value.join('');
        return null;
      case '/wda/pressButton':
        if (!['home', 'volumeup', 'volumedown'].includes(body.name)) throw new Fail('unknown', `The button '${body.name}' is unknown`);
        return null;
      case '/wda/homescreen': this.app = 'com.apple.springboard'; return null;
      case '/wda/apps/activate':
        if (typeof body.bundleId !== 'string') throw new Fail('unknown', 'bundleId');
        this.app = body.bundleId;
        return null;
      case '/wda/apps/terminate': {
        const was = this.app === body.bundleId;
        if (was) this.app = 'com.apple.springboard';
        return was;
      }
      default: throw new Fail('unknownCommand');
    }
  }
}
