// XML property list, the subset usbmuxd speaks: dict, array, string, integer, real,
// true/false, data. Nothing else is accepted.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const UNESC = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ESC[c]);
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => UNESC[m]);

function node(v) {
  if (typeof v === 'string') return `<string>${esc(v)}</string>`;
  if (typeof v === 'boolean') return v ? '<true/>' : '<false/>';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('plist: number is not finite');
    return Number.isInteger(v) ? `<integer>${v}</integer>` : `<real>${v}</real>`;
  }
  if (Buffer.isBuffer(v)) return `<data>${v.toString('base64')}</data>`;
  if (Array.isArray(v)) return `<array>${v.map(node).join('')}</array>`;
  if (v && typeof v === 'object') {
    const body = Object.entries(v)
      .filter(([, x]) => x !== undefined && x !== null)
      .map(([k, x]) => `<key>${esc(k)}</key>${node(x)}`)
      .join('');
    return `<dict>${body}</dict>`;
  }
  throw new Error(`plist: cannot write ${typeof v}`);
}

export function buildPlist(obj) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">${node(obj)}</plist>\n`
  );
}

export function parsePlist(input) {
  const xml = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  const start = xml.indexOf('<plist');
  if (start < 0) throw new Error('plist: no <plist> element');
  const tokens = [];
  const re = /<(\/?)([a-zA-Z]+)[^>]*?(\/?)>|([^<]+)/g;
  re.lastIndex = xml.indexOf('>', start) + 1;
  let m;
  while ((m = re.exec(xml))) {
    if (m[4] !== undefined) tokens.push({ text: m[4] });
    else tokens.push({ tag: m[2], close: m[1] === '/', self: m[3] === '/' });
  }
  let i = 0;
  const skipSpace = () => {
    while (tokens[i] && tokens[i].text !== undefined && tokens[i].text.trim() === '') i++;
  };
  const textOf = (tag) => {
    let s = '';
    while (tokens[i] && tokens[i].text !== undefined) s += tokens[i++].text;
    const end = tokens[i++];
    if (!end || !end.close || end.tag !== tag) throw new Error(`plist: <${tag}> not closed`);
    return s;
  };
  const value = () => {
    skipSpace();
    const t = tokens[i++];
    if (!t || t.tag === undefined || t.close) throw new Error('plist: value expected');
    if (t.tag === 'true') return true;
    if (t.tag === 'false') return false;
    if (t.self) {
      if (t.tag === 'dict') return {};
      if (t.tag === 'array') return [];
      if (t.tag === 'string') return '';
      if (t.tag === 'data') return Buffer.alloc(0);
      throw new Error(`plist: empty <${t.tag}/>`);
    }
    if (t.tag === 'string') return unesc(textOf('string'));
    if (t.tag === 'integer') {
      const n = Number(textOf('integer').trim());
      if (!Number.isInteger(n)) throw new Error('plist: bad integer');
      return n;
    }
    if (t.tag === 'real') return Number(textOf('real').trim());
    if (t.tag === 'data') return Buffer.from(textOf('data').replace(/\s+/g, ''), 'base64');
    if (t.tag === 'array') {
      const out = [];
      for (;;) {
        skipSpace();
        if (tokens[i] && tokens[i].close && tokens[i].tag === 'array') { i++; return out; }
        out.push(value());
      }
    }
    if (t.tag === 'dict') {
      const out = {};
      for (;;) {
        skipSpace();
        const k = tokens[i++];
        if (k && k.close && k.tag === 'dict') return out;
        if (!k || k.tag !== 'key' || k.close) throw new Error('plist: <key> expected');
        const key = k.self ? '' : unesc(textOf('key'));
        out[key] = value();
      }
    }
    throw new Error(`plist: unsupported <${t.tag}>`);
  };
  return value();
}
