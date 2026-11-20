// HTTP to WebDriverAgent, sent straight down a usbmux Connect socket (one socket per request).
// Reply envelope {sessionId, value}; on error value = {error, message, traceback}:
// WebDriverAgentLib/Routing/FBResponsePayload.m:139-154 in the pinned commit (routes.mjs).
import http from 'node:http';
import { ROUTES, SESSION_SETTINGS, WDA_ERRORS } from './routes.mjs';

export class WdaError extends Error {
  // kind 'wda'       : WDA answered with an error envelope (code = its error string)
  // kind 'transport' : no usable answer (code = REFUSED | BAD_DEVICE | NOT_PLUGGED | TIMEOUT | NOT_JSON | HTTP_STATUS | CLOSED)
  constructor(kind, code, message, httpStatus) {
    super(message);
    this.kind = kind;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function send(sock, method, path, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = { Host: 'localhost', Connection: 'close', Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    let done = false;
    let timer = null;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); fn(v); };
    // The request is written to the socket usbmux gave us; nothing is dialled here.
    const agent = new http.Agent({ keepAlive: false });
    agent.createConnection = () => sock;
    const req = http.request({ method, path, headers, agent });
    timer = setTimeout(() => {
      finish(reject, new WdaError('transport', 'TIMEOUT', `${method} ${path} got no answer in ${timeoutMs} ms`));
      req.destroy();
    }, timeoutMs);
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => finish(resolve, { status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) => finish(reject, new WdaError('transport', 'CLOSED', e.message)));
    });
    req.on('error', (e) => finish(reject, new WdaError('transport', 'CLOSED', `${method} ${path}: ${e.message}`)));
    req.end(payload || undefined);
  });
}

export class WdaClient {
  // connect(): resolves a fresh raw socket to the phone's WDA port.
  constructor({ connect }) {
    this.connect = connect;
    this.sessionId = null;
  }

  // One request, no session handling, no retry.
  async raw(name, { body, query, sessionId, timeoutMs } = {}) {
    const route = ROUTES[name];
    if (!route) throw new Error(`unknown WDA route "${name}"`);
    if (route.session === 'yes' && !sessionId) throw new Error(`route "${name}" needs a session`);
    let path = route.session === 'yes' ? `/session/${sessionId}${route.path}` : route.path;
    if (query) path += '?' + new URLSearchParams(query).toString();
    let sock;
    try {
      sock = await this.connect();
    } catch (e) {
      throw new WdaError('transport', e.code || 'CLOSED', e.message);
    }
    const res = await send(sock, route.method, path, body, timeoutMs || route.timeoutMs);
    let envelope;
    try { envelope = JSON.parse(res.text); } catch {
      throw new WdaError('transport', 'NOT_JSON', `${route.method} ${path} answered HTTP ${res.status} that is not JSON`, res.status);
    }
    // WDA always answers with the envelope {value, sessionId}. JSON without it (the bare
    // word null, a proxy's JSON error) is not WDA speaking, and is not a "done".
    if (envelope === null || typeof envelope !== 'object' || !('value' in envelope)) {
      throw new WdaError('transport', 'NOT_JSON', `${route.method} ${path} answered HTTP ${res.status} without the WDA envelope`, res.status);
    }
    const v = envelope.value;
    if (v && typeof v === 'object' && typeof v.error === 'string') {
      throw new WdaError('wda', v.error, v.message || v.error, res.status);
    }
    if (res.status !== 200) throw new WdaError('transport', 'HTTP_STATUS', `${route.method} ${path} answered HTTP ${res.status}`, res.status);
    return v;
  }

  // Creating a session kills the previous one (FBSessionCommands.m:93) and resets session
  // settings (:281), so settings are applied again every time.
  async newSession() {
    this.sessionId = null;
    const v = await this.raw('newSession', { body: { capabilities: { alwaysMatch: {} } } });
    if (!v || typeof v.sessionId !== 'string') throw new WdaError('transport', 'NOT_JSON', 'POST /session gave no sessionId');
    await this.raw('settings', { sessionId: v.sessionId, body: { settings: SESSION_SETTINGS } });
    this.sessionId = v.sessionId;
    return v.sessionId;
  }

  async ensureSession() {
    if (!this.sessionId) await this.newSession();
    return this.sessionId;
  }

  // A route call with session handling. A lost session is recreated and the call retried once,
  // unless retry is false (a buy is never retried).
  async call(name, { body, query, timeoutMs, retry = true } = {}) {
    const route = ROUTES[name];
    if (!route) throw new Error(`unknown WDA route "${name}"`);
    if (route.session !== 'yes') return this.raw(name, { body, query, timeoutMs });
    if (!this.sessionId) await this.newSession();
    try {
      return await this.raw(name, { body, query, timeoutMs, sessionId: this.sessionId });
    } catch (e) {
      if (!(e.kind === 'wda' && e.code === WDA_ERRORS.noSession)) throw e;
      this.sessionId = null;
      if (!retry) throw e;
      await this.newSession();
      return this.raw(name, { body, query, timeoutMs, sessionId: this.sessionId });
    }
  }

  // null when no alert is open (the "no such alert" envelope), else its text.
  async alertText() {
    try {
      return await this.call('alertText');
    } catch (e) {
      if (e.kind === 'wda' && e.code === WDA_ERRORS.noAlert) return null;
      throw e;
    }
  }
}
