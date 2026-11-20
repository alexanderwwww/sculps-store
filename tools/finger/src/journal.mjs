// Every command id is written here BEFORE the command runs. An id that is already there is
// never run again, so a crash or a double delivery cannot repeat an action.
// (The decision journal Claude writes with finger_journal lives in finger-link.)
import fs from 'node:fs';

function appendLine(file, obj) {
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, JSON.stringify(obj) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export class CommandJournal {
  constructor({ file }) {
    this.file = file;
    this.seen = new Set(readLines(file).map((r) => r.id));
  }
  // true = first time, go ahead. false = this id was already started once.
  begin(id, tool) {
    if (typeof id !== 'string' || id === '') throw new Error('a command needs an id');
    if (this.seen.has(id)) return false;
    appendLine(this.file, { id, tool, t: Date.now() });
    this.seen.add(id);
    return true;
  }
}
