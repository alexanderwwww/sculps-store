// usbmuxd client. Every protocol fact here is cited in SOURCES.md section 2.
//   header  : 4 x uint32 little-endian = length (incl. header), version 1, message 8 (plist), tag
//             go-ios ios/usbmuxconnection.go:100-104,164
//   socket  : /var/run/usbmuxd                      go-ios ios/usbmuxconnection.go:54
//   Connect : PortNumber is the port byte-swapped   go-ios ios/connect.go:45, ios/utils.go:101-104
//   results : 0 ok, 2 bad device, 3 refused         usbmuxd src/usbmuxd-proto.h:39-43
//   kLibUSBMuxVersion: sent on Connect only, as go-ios does (ios/connect.go:17-36); its
//             ListDevices and Listen messages do not carry it (ios/listdevices.go:13-17,
//             ios/listen.go:11-17, where the field is unexported and so never written).
import net from 'node:net';
import { buildPlist, parsePlist } from './plist.mjs';

export const SOCKET_PATH = '/var/run/usbmuxd';
const HEADER = 16;
const VERSION = 1;
const MSG_PLIST = 8;
const MAX_FRAME = 4 * 1024 * 1024;
const CLIENT = { ProgName: 'finger', ClientVersionString: 'finger-1' };
const LIB_VERSION = 3; // go-ios ios/connect.go:34

export class UsbmuxError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // NO_USBMUXD | BAD_DEVICE | REFUSED | PROTOCOL | TIMEOUT
  }
}

export function swapPort(port) {
  return ((port & 0xff) << 8) | ((port >> 8) & 0xff);
}

export function encodeFrame(tag, obj) {
  const body = Buffer.from(buildPlist(obj), 'utf8');
  const head = Buffer.alloc(HEADER);
  head.writeUInt32LE(HEADER + body.length, 0);
  head.writeUInt32LE(VERSION, 4);
  head.writeUInt32LE(MSG_PLIST, 8);
  head.writeUInt32LE(tag, 12);
  return Buffer.concat([head, body]);
}

// Turns a byte stream into frames. Frames may arrive split or several at once.
export class FrameReader {
  constructor() { this.buf = Buffer.alloc(0); }
  feed(chunk) { this.buf = Buffer.concat([this.buf, chunk]); }
  // The next whole frame, or null when more bytes are needed.
  next() {
    if (this.buf.length < HEADER) return null;
    const length = this.buf.readUInt32LE(0);
    if (length < HEADER || length > MAX_FRAME) throw new UsbmuxError('PROTOCOL', `bad frame length ${length}`);
    if (this.buf.length < length) return null;
    const frame = {
      version: this.buf.readUInt32LE(4),
      message: this.buf.readUInt32LE(8),
      tag: this.buf.readUInt32LE(12),
      payload: this.buf.subarray(HEADER, length),
    };
    this.buf = this.buf.subarray(length);
    return frame;
  }
  push(chunk) {
    this.feed(chunk);
    const out = [];
    for (let f = this.next(); f; f = this.next()) out.push(f);
    return out;
  }
  // Bytes received but not yet read as a frame.
  rest() { const r = this.buf; this.buf = Buffer.alloc(0); return r; }
}

function open(socketPath) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ path: socketPath });
    sock.once('connect', () => { sock.removeAllListeners('error'); resolve(sock); });
    sock.once('error', (e) => reject(new UsbmuxError('NO_USBMUXD', `usbmuxd socket ${socketPath}: ${e.code || e.message}`)));
  });
}

// One request, one reply, on a fresh socket. Leaves the socket open and returns it with
// any bytes that arrived after the reply, because after Connect it is the raw stream.
async function ask(socketPath, msg, timeoutMs) {
  const sock = await open(socketPath);
  const tag = 1;
  return new Promise((resolve, reject) => {
    const reader = new FrameReader();
    const fail = (err) => { cleanup(); sock.destroy(); reject(err); };
    const timer = setTimeout(() => fail(new UsbmuxError('TIMEOUT', `usbmuxd did not answer ${msg.MessageType}`)), timeoutMs);
    const onData = (chunk) => {
      // Exactly one frame is read here: whatever follows it (a notification, or the raw
      // stream after Connect) is handed back untouched in "rest".
      let frame;
      try { reader.feed(chunk); frame = reader.next(); } catch (e) { return fail(e); }
      if (!frame) return;
      // The reply to our request comes first and carries our tag: usbmuxd answers Listen with
      // the Result before any notification (usbmuxd src/client.c:692).
      if (frame.tag !== tag) return fail(new UsbmuxError('PROTOCOL', `reply tag ${frame.tag}, expected ${tag}`));
      // Only message type 8 is a plist (the reference client reads nothing else as one:
      // libusbmuxd's libusbmuxd.c:436,586, a copy read without its commit). The header's version is NOT checked on purpose: neither
      // go-ios (ios/usbmuxconnection.go:139-150) nor libusbmuxd checks it on a reply, and
      // what Apple's own usbmuxd puts there is unread until his Mac.
      if (frame.message !== MSG_PLIST) return fail(new UsbmuxError('PROTOCOL', `reply is message type ${frame.message}, expected ${MSG_PLIST} (a plist)`));
      cleanup();
      let reply;
      try { reply = parsePlist(frame.payload); } catch (e) { sock.destroy(); return reject(new UsbmuxError('PROTOCOL', e.message)); }
      resolve({ sock, reply, rest: reader.rest() });
    };
    const onEnd = () => fail(new UsbmuxError('PROTOCOL', 'usbmuxd closed the socket'));
    const onErr = (e) => fail(new UsbmuxError('PROTOCOL', e.message));
    const cleanup = () => {
      clearTimeout(timer);
      sock.off('data', onData); sock.off('end', onEnd); sock.off('error', onErr);
    };
    sock.on('data', onData); sock.on('end', onEnd); sock.on('error', onErr);
    sock.write(encodeFrame(tag, { ...CLIENT, ...msg }));
  });
}

function toDevice(entry) {
  const p = entry.Properties || {};
  return { deviceId: entry.DeviceID, udid: p.SerialNumber, connectionType: p.ConnectionType };
}

export class Usbmux {
  constructor({ socketPath = SOCKET_PATH, timeoutMs = 5000 } = {}) {
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
  }

  // USB entries only: the same phone can also be listed over Network (go-ios ios/listdevices.go:66-74).
  async listDevices() {
    const { sock, reply } = await ask(this.socketPath, { MessageType: 'ListDevices' }, this.timeoutMs);
    sock.destroy();
    if (!Array.isArray(reply.DeviceList)) throw new UsbmuxError('PROTOCOL', 'ListDevices reply has no DeviceList');
    return reply.DeviceList.map(toDevice).filter((d) => d.connectionType === 'USB' && d.udid);
  }

  // Returns the raw stream to a port on the phone. One socket per connection.
  async connect(deviceId, port) {
    const { sock, reply, rest } = await ask(
      this.socketPath,
      { MessageType: 'Connect', DeviceID: deviceId, PortNumber: swapPort(port), kLibUSBMuxVersion: LIB_VERSION },
      this.timeoutMs,
    );
    if (reply.MessageType !== 'Result' || reply.Number !== 0) {
      sock.destroy();
      if (reply.Number === 2) throw new UsbmuxError('BAD_DEVICE', `phone ${deviceId} is not plugged in`);
      if (reply.Number === 3) throw new UsbmuxError('REFUSED', `nothing is listening on port ${port} of the phone`);
      throw new UsbmuxError('PROTOCOL', `Connect result ${reply.Number}`);
    }
    if (rest.length) sock.unshift(rest);
    return sock;
  }

  // Attach and detach notifications (they arrive with tag 0; go-ios ios/listen.go:21-47).
  // onEvent({type:'attached', deviceId, udid, connectionType} | {type:'detached', deviceId})
  // onClose(err) fires once when the socket ends, so the caller can start again.
  async listen(onEvent, onClose = () => {}) {
    const { sock, reply, rest } = await ask(this.socketPath, { MessageType: 'Listen' }, this.timeoutMs);
    if (reply.MessageType !== 'Result' || reply.Number !== 0) {
      sock.destroy();
      throw new UsbmuxError('PROTOCOL', `Listen result ${reply.Number}`);
    }
    const reader = new FrameReader();
    let closed = false;
    const close = (err) => { if (closed) return; closed = true; sock.destroy(); onClose(err); };
    const feed = (chunk) => {
      let frames;
      try { frames = reader.push(chunk); } catch (e) { return close(e); }
      for (const f of frames) {
        let msg;
        try { msg = parsePlist(f.payload); } catch (e) { return close(e); }
        if (msg.MessageType === 'Attached') onEvent({ type: 'attached', ...toDevice(msg) });
        else if (msg.MessageType === 'Detached') onEvent({ type: 'detached', deviceId: msg.DeviceID });
      }
    };
    sock.on('data', feed);
    sock.on('error', (e) => close(e));
    sock.on('close', () => close(null));
    if (rest.length) feed(rest);
    return { close: () => close(null) };
  }
}
