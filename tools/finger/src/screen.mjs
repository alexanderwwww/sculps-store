// Screenshots and looks: what the bytes are, how image pixels map to points, and the
// record of each look so a later coordinate tap can be refused when the screen has changed.

export class ScreenError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Magic bytes. JPEG starts FF D8 FF; PNG starts 89 "PNG" 0D 0A 1A 0A; HEIC has "ftyp" at byte 4.
export function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'heic';
  return null;
}

export function imageSize(buf, format) {
  if (format === 'png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (format === 'jpeg') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) throw new ScreenError('BAD_IMAGE', 'JPEG marker expected');
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    throw new ScreenError('BAD_IMAGE', 'JPEG has no size marker');
  }
  throw new ScreenError('BAD_IMAGE', `cannot read the size of a ${format} image`);
}

// Decodes what /screenshot returned. Only JPEG and PNG are accepted: HEIC means the
// screenshotQuality setting did not take (routes.mjs SESSION_SETTINGS), and that is an error.
export function decodeScreenshot(base64) {
  if (typeof base64 !== 'string' || base64 === '') throw new ScreenError('BAD_IMAGE', 'screenshot is empty');
  const bytes = Buffer.from(base64, 'base64');
  const format = sniff(bytes);
  if (format !== 'jpeg' && format !== 'png') {
    throw new ScreenError('BAD_IMAGE', `screenshot is ${format || 'an unknown format'}, expected JPEG`);
  }
  return { bytes, format, mime: `image/${format}`, ...imageSize(bytes, format) };
}

// Pixels per point, X and Y worked out separately. A rotated phone or an app that does not
// fill the screen gives two different ratios, and then no coordinate can be trusted.
export function mapping(image, windowSize) {
  const w = windowSize && windowSize.width;
  const h = windowSize && windowSize.height;
  if (!(w > 0) || !(h > 0)) throw new ScreenError('BAD_MAPPING', 'window size is missing');
  const sx = image.width / w;
  const sy = image.height / h;
  if (Math.abs(sx - sy) / Math.max(sx, sy) > 0.01) {
    throw new ScreenError('BAD_MAPPING', `image ${image.width}x${image.height} does not match screen ${w}x${h} points`);
  }
  return { sx, sy };
}

export const toPoints = (map, x, y) => ({ x: Math.round(x / map.sx), y: Math.round(y / map.sy) });

// Makes the image small enough to send. The resampler is passed in, because Node has none
// built in; with no resampler the original goes out and the result says so.
export async function fit(image, maxPx, resize) {
  if (Math.max(image.width, image.height) <= maxPx || !resize) return { ...image, downscaled: false };
  const small = await resize(image.bytes, maxPx);
  const format = sniff(small);
  if (format !== 'jpeg' && format !== 'png') throw new ScreenError('BAD_IMAGE', 'the resized image is not JPEG or PNG');
  return { bytes: small, format, mime: `image/${format}`, ...imageSize(small, format), downscaled: true };
}

export class LookStore {
  constructor({ keep = 30 } = {}) { this.keep = keep; this.looks = new Map(); this.n = 0; }
  add(look) {
    // The phone is in the id, so a lookId from one phone can never match a look on another.
    const id = `L${String(look.udid || '').slice(-4)}-${++this.n}`;
    this.looks.set(id, { ...look, id });
    while (this.looks.size > this.keep) this.looks.delete(this.looks.keys().next().value);
    return id;
  }
  get(id) { return this.looks.get(id) || null; }
}
