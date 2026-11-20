// Files with one JSON row per line (the money ledger, the command journal).
// A row is appended and flushed to disk before the call returns.
//
// A write that was cut short (power cut, full disk) leaves a last line with no newline at
// its end. That row was never finished, so whoever was writing it never went on to act on
// it: the piece is moved to <file>.torn and counted. Any other line that is not a JSON
// object is damage: it is skipped and its line number is reported, and the caller decides
// what must stop because of it.
import fs from 'node:fs';

export function appendJsonl(file, obj) {
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, JSON.stringify(obj) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Moves an unfinished last line out of the file. Returns true when it did.
export function repairTail(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  if (text === '' || text.endsWith('\n')) return false;
  const cut = text.lastIndexOf('\n') + 1;
  const piece = text.slice(cut);
  let whole = false;
  try { const v = JSON.parse(piece); whole = v !== null && typeof v === 'object'; } catch { whole = false; }
  if (whole) { fs.appendFileSync(file, '\n'); return false; } // a full row that only lacks its newline
  fs.appendFileSync(`${file}.torn`, piece + '\n');
  fs.truncateSync(file, Buffer.byteLength(text.slice(0, cut), 'utf8'));
  return true;
}

// { rows, bad }: rows are the lines that are JSON objects, bad the 1-based numbers of the rest.
// An unfinished last line is left out of both (repairTail deals with it).
export function readJsonl(file) {
  if (!fs.existsSync(file)) return { rows: [], bad: [] };
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const tornTail = !text.endsWith('\n');
  const rows = [];
  const bad = [];
  lines.forEach((line, i) => {
    if (line === '') return;
    let v = null;
    try { v = JSON.parse(line); } catch { v = null; }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) rows.push(v);
    else if (!(tornTail && i === lines.length - 1)) bad.push(i + 1);
  });
  return { rows, bad };
}
