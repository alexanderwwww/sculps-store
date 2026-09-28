/**
 * How flip behaves on the clock, so it reads as a person working.
 *
 * The pacing itself is the same module the Organic app uses — the typing with
 * real typos and backspaces, the awake windows, the rest. This file is only
 * the part that is specific to being a seller rather than a scroller, which is
 * mostly about answering speed.
 *
 * The tell that gets a freelancer account looked at is not the writing. It is
 * a reply that lands eleven seconds after the message, at four in the morning,
 * every time, at exactly the same interval. A person reads first, sometimes
 * gets distracted, and is asleep for eight hours a day.
 */
import { between, chance, intBetween, isAwake, keystrokes } from "./human.mjs";

/**
 * The seller's hours.
 *
 * Greek time, because that is where he is and pretending otherwise is the
 * thing that does not survive one buyer asking where he ships from. A shop
 * that answers at 4am Athens time every night is a shop nobody is running.
 */
export const SELLER = {
  hours: [
    { start: "09:30", end: "13:30" },
    { start: "16:00", end: "21:30" },
    // The late one, because freelancers do answer at night, just not nightly.
    { start: "22:30", end: "00:30" },
  ],
  daysOff: [0], // Sunday
  typing: { cpsMin: 4.8, cpsMax: 9.5, typoRate: 0.03 },
};

/** Awake now? The late window is only used some nights. */
/**
 * Always. There are no hours.
 *
 * It kept a persona's waking hours and a day off, carried over from an app
 * whose job was to look like a person posting. A shop does not sleep, and the
 * buyer asking at 3am is the one nobody else answers. Kept as a function so
 * nothing downstream has to change, and so a real reason to stop — a cap, a
 * rate limit, being signed out — lives where it belongs, in the rules.
 */
export function working() {
  return true;
}


/**
 * How long before a reply goes out.
 *
 * Long enough to have read it, and scattered, because a constant lag is the
 * signature. A first message from a new buyer gets more time than the fourth
 * message in a thread that is already moving.
 */
/**
 * Kept, and near zero.
 *
 * It used to hold a reply for up to fifty minutes so it would read as a person
 * getting round to it. Depop ranks on reply time and the buyer asking at 3am is
 * the one nobody else answers — the human part is the words, not the waiting.
 * A beat for the page to be ready, and that is all.
 */
export function replyAfterMs() {
  return 400;
}


/**
 * The keystrokes for a reply, so it is typed into the box rather than pasted —
 * some fields only register real key events. The CADENCE is a machine's: Depop
 * receives a message, not a performance of somebody typing it, and the old
 * four-to-nine-characters-a-second put a normal reply past the bridge's own
 * deadline mid-sentence.
 */
export function typeReply(text, persona = SELLER) {
  const strokes = keystrokes(String(text ?? ""), persona);
  return strokes.map((stroke) => ({ ...stroke, delayMs: 8 }));
}

/**
 * How many jobs to take today.
 *
 * Twenty is the floor, his number. The earlier version ramped from one, on the
 * reasoning that a new seller who accepts nine jobs on day one and delivers six
 * late has ended the account faster than one who took none. He overruled it and
 * it is his account.
 *
 * Worth knowing what this number actually does, though: it is a ceiling, not a
 * target. It cannot conjure orders. A new account with no reviews is not shown
 * twenty briefs a day — the limiter on day one is how much work exists on the
 * board, and this only stops the app being the thing in the way. It starts
 * mattering the week the orders outnumber it.
 */
export const FLOOR_PER_DAY = 20;

export function takeBudget(daysSelling = 0) {
  if (daysSelling < 7) return FLOOR_PER_DAY;
  if (daysSelling < 21) return FLOOR_PER_DAY + intBetween(0, 10);
  return FLOOR_PER_DAY + intBetween(5, 25);
}

/** Between two actions on the site — never the same gap twice. */
export function betweenActionsMs() {
  /*
   * A machine's pace, not a person's.
   *
   * "When I say like human, I mean talk like human to customers. Other than
   * that, it's a fucking robot." So this is only the small gap a page needs to
   * settle after a navigation or a click — not a performance of being someone
   * scrolling. What protects the account is the caps in work.mjs and the
   * refresh rules, which are Depop's arithmetic rather than mime.
   */
  if (process.env.FLIP_FAST) return 20;
  return Math.round(between(150, 600));
}

