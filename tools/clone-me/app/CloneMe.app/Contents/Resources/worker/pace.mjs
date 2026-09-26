/**
 * How Clone Me behaves on the clock, so it reads as a person working.
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
 * thing that does not survive one buyer asking what timezone he is in. Fiverr
 * shows a seller's local time to buyers anyway.
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
export function working(now = new Date(), persona = SELLER) {
  const hour = now.getHours();
  if ((hour >= 22 || hour < 1) && !chance(0.35)) return false;
  return isAwake(persona, now);
}

/**
 * How long before a reply goes out.
 *
 * Long enough to have read it, and scattered, because a constant lag is the
 * signature. A first message from a new buyer gets more time than the fourth
 * message in a thread that is already moving.
 */
export function replyAfterMs({ words = 40, firstContact = false, urgent = false } = {}) {
  // Reading is real time: a person does not answer a 600-word brief in nine
  // seconds, and answering it that fast is worse than answering it slowly.
  const reading = (words / 3.2) * 1000;
  const thinking = firstContact ? between(90_000, 20 * 60_000) : between(25_000, 9 * 60_000);
  const distracted = chance(0.18) ? between(12 * 60_000, 50 * 60_000) : 0;
  const total = reading + thinking + distracted;
  // A late order is the one thing that justifies answering quickly.
  return Math.round(urgent ? Math.min(total, 4 * 60_000) : total);
}

/** The keystrokes for a reply, so it is typed rather than pasted. */
export function typeReply(text, persona = SELLER) {
  return keystrokes(String(text ?? ""), persona);
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
  return Math.round(chance(0.15) ? between(20_000, 120_000) : between(2_500, 14_000));
}
