// A fake usbmuxd on a unix socket, speaking the real framing and plist messages
// (same sources as src/usbmux.mjs; SOURCES.md section 2). It is written against the
// protocol description, not against src/usbmux.mjs: it has its own frame code.
//   ListDevices -> {DeviceList:[{DeviceID, MessageType:'Attached', Properties:{ConnectionType, DeviceID, SerialNumber}}]}
//   Listen      -> {MessageType:'Result', Number:0}, then Attached/Detached messages with tag 0
//   Connect     -> Result 0 and the socket becomes the raw stream; 2 = no such device; 3 = nothing listening
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPlist, parsePlist } from '../src/plist.mjs';

function frame(tag, obj) {
  const body = Buffer.from(buildPlist(obj));
  const head = Buffer.alloc(16);
  head.writeUInt32LE(16 + body.length, 0);
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(8, 8);
  head.writeUInt32LE(tag, 12);
  return Buffer.concat([head, body]);
}

export class FakeUsbmuxd {
  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finger usbmuxd '));
    this.socketPath = path.join(this.dir, 'usbmuxd');
    this.phones = new Map();   // udid -> { deviceId, ports: {8100: tcpPort}, network: bool }
    this.listeners = new Set();
    this.sockets = new Set();
    this.nextId = 1;
    this.connects = [];        // every Connect seen: { deviceId, port, result }
    this.splitReplies = false; // send replies one byte at a time
    this.server = net.createServer((sock) => this.onClient(sock));
  }

  start() { return new Promise((r) => this.server.listen(this.socketPath, r)); }

  async stop() {
    for (const s of this.sockets) s.destroy();
    await new Promise((r) => this.server.close(r));
    fs.rmSync(this.dir, { recursive: true, force: true });
  }

  entry(udid, p, type = 'USB') {
    return { DeviceID: p.deviceId, MessageType: 'Attached', Properties: { ConnectionType: type, DeviceID: p.deviceId, SerialNumber: udid, ProductID: 4776 } };
  }

  // Plugs a phone in. ports: { 8100: <local tcp port of the fake WDA> }. Every plug gets a new DeviceID.
  attach(udid, ports = {}, { network = false } = {}) {
    const p = { deviceId: this.nextId++, ports, network };
    this.phones.set(udid, p);
    for (const s of this.listeners) this.write(s, frame(0, this.entry(udid, p)));
    return p.deviceId;
  }

  detach(udid) {
    const p = this.phones.get(udid);
    if (!p) return;
    this.phones.delete(udid);
    for (const s of this.sockets) if (s.fingerDevice === p.deviceId) s.destroy();
    for (const s of this.listeners) this.write(s, frame(0, { MessageType: 'Detached', DeviceID: p.deviceId }));
  }

  write(sock, buf) {
    if (!this.splitReplies) return sock.write(buf);
    for (const b of buf) sock.write(Buffer.from([b]));
  }

  onClient(sock) {
    this.sockets.add(sock);
    sock.on('close', () => { this.sockets.delete(sock); this.listeners.delete(sock); });
    sock.on('error', () => {});
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 16 && buf.length >= buf.readUInt32LE(0)) {
        const len = buf.readUInt32LE(0);
        const tag = buf.readUInt32LE(12);
        const msg = parsePlist(buf.subarray(16, len));
        buf = buf.subarray(len);
        if (this.handle(sock, tag, msg, onData, buf) === 'raw') return;
      }
    };
    sock.on('data', onData);
  }

  handle(sock, tag, msg, onData, rest) {
    if (msg.MessageType === 'ListDevices') {
      const list = [];
      for (const [udid, p] of this.phones) {
        list.push(this.entry(udid, p));
        if (p.network) list.push(this.entry(udid, { deviceId: p.deviceId + 1000 }, 'Network'));
      }
      this.write(sock, frame(tag, { DeviceList: list }));
    } else if (msg.MessageType === 'Listen') {
      this.write(sock, frame(tag, { MessageType: 'Result', Number: 0 }));
      this.listeners.add(sock);
      for (const [udid, p] of this.phones) {
        this.write(sock, frame(0, this.entry(udid, p)));
        if (p.network) this.write(sock, frame(0, this.entry(udid, { deviceId: p.deviceId + 1000 }, 'Network')));
      }
    } else if (msg.MessageType === 'Connect') {
      // The port arrives byte-swapped; swap it back.
      const port = ((msg.PortNumber & 0xff) << 8) | (msg.PortNumber >> 8);
      const phone = [...this.phones.values()].find((p) => p.deviceId === msg.DeviceID);
      const refuse = (result) => { this.connects.push({ deviceId: msg.DeviceID, port, result }); this.write(sock, frame(tag, { MessageType: 'Result', Number: result })); };
      if (!phone) { refuse(2); return undefined; }
      if (!phone.ports[port]) { refuse(3); return undefined; }
      // Result 0 only once the phone's port really answers; a dead port is result 3.
      sock.off('data', onData);
      sock.fingerDevice = phone.deviceId;
      const up = net.createConnection({ host: '127.0.0.1', port: phone.ports[port] });
      up.once('error', () => { refuse(3); sock.on('data', onData); });
      up.once('connect', () => {
        up.removeAllListeners('error');
        up.on('error', () => sock.destroy());
        this.connects.push({ deviceId: msg.DeviceID, port, result: 0 });
        this.write(sock, frame(tag, { MessageType: 'Result', Number: 0 }));
        sock.on('close', () => up.destroy());
        up.on('close', () => sock.destroy());
        if (rest.length) up.write(rest);
        sock.pipe(up);
        up.pipe(sock);
      });
      return 'raw';
    } else {
      this.write(sock, frame(tag, { MessageType: 'Result', Number: 1 }));
    }
    return undefined;
  }
}
