// Every command id is written here BEFORE the command runs. An id that is already there is
// never run again, so a crash or a double delivery cannot repeat an action.
// (The decision journal Claude writes with finger_journal lives in finger-link.)
// A line that cannot be read is skipped and counted: the ids on the good lines still hold.
import { appendJsonl, readJsonl, repairTail } from './jsonl.mjs';

export class CommandJournal {
  constructor({ file }) {
    this.file = file;
    repairTail(file); // an unfinished last row: that command never started
    const { rows, bad } = readJsonl(file);
    this.bad = bad.length;
    this.seen = new Set(rows.map((r) => r.id));
  }
  // true = first time, go ahead. false = this id was already started once.
  begin(id, tool) {
    if (typeof id !== 'string' || id === '') throw new Error('a command needs an id');
    if (this.seen.has(id)) return false;
    appendJsonl(this.file, { id, tool, t: Date.now() });
    this.seen.add(id);
    return true;
  }
}
