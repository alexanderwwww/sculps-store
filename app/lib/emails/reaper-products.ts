/**
 * What each Black Reaper product needs a customer to know once the box is
 * on the doormat.
 *
 * Every line here is taken from the product's own page in the database —
 * its description, its "In the box" list and its FAQ — not from memory.
 * Nothing is a spec the page does not already make. The after-delivery
 * emails read from this map, so a fact corrected here is corrected in every
 * message at once.
 *
 * Two things this file will never say: a percentage (the shop only ever
 * talks in dollars) and a power source a product does not have. The Reaper
 * and the Zombie run on batteries; the Scream, the Theater and the Projector
 * plug in.
 */

export type ReaperProductHandle =
  | "black-reaper"
  | "the-scream"
  | "crawling-zombie"
  | "halloween-movie-theater"
  | "haunted-projector";

export interface ReaperProductGuide {
  /** The name as the page prints it. */
  name: string;
  /** A site-relative photo of the thing, for the top of the message. */
  image: string;
  /** Numbered, in the order a person actually does them. */
  setupSteps: string[];
  /** The things people find out on the second night. */
  setupTips: string[];
  /** Exactly what is in the box, as the product page lists it. */
  inBox: string[];
  /** The questions that arrive by reply after delivery. */
  faq: { q: string; a: string }[];
  /** One sentence, asked a few days in. */
  reviewAsk: string;
}

export const REAPER_PRODUCTS: Record<ReaperProductHandle, ReaperProductGuide> = {
  "black-reaper": {
    name: "The Black Reaper",
    image: "/media/br-s1-hero.webp",
    setupSteps: [
      "Push the sectional steel stake into the lawn where he can see the front door.",
      "Slide the figure onto the stake and let the robe and hood fall straight.",
      "Check the batteries are seated. They come fitted, and a spare set is in the box.",
      "Switch on the lantern. It lights itself at dusk from then on.",
    ],
    setupTips: [
      "On a driveway, decking or concrete, use the sandbag loops at the base instead of the stake.",
      "The fabric is weather-treated and he is built to stay out all month. Bring him in for a real storm.",
      "Face him at the path. He is taller than the front door, and the effect is him looking straight at whoever walks up.",
    ],
    inBox: [
      "The Black Reaper — 8 ft 6 in, robe, hood and skull",
      "The lantern, fitted and lit, with the ghost strand",
      "Sectional steel ground stake",
      "Sandbag loops, for a driveway or decking",
      "Batteries, fitted, plus a spare set",
    ],
    faq: [
      {
        q: "Does it need a plug?",
        a: "No. The lantern and the ghost lights run on batteries, so he can stand anywhere in the garden with nothing trailing to him.",
      },
      {
        q: "How tall is he?",
        a: "Eight and a half feet, 2.6 metres, and 4.2 pounds. Taller than your front door.",
      },
      {
        q: "What if the lantern goes dim?",
        a: "Swap in the spare set of batteries from the box. That is what they are there for.",
      },
    ],
    reviewAsk: "Has anyone stopped in the street yet? Tell us how The Black Reaper is doing on your lawn.",
  },

  "the-scream": {
    name: "The Scream",
    image: "/media/scr-s1-hero.webp",
    setupSteps: [
      "Unroll him flat on the lawn with the mask facing the street.",
      "Plug the blower's sealed outdoor lead into an ordinary outdoor extension cord. It pulls about as much as a table lamp.",
      "Switch it on. He is standing in about ninety seconds.",
      "Drive the six steel stakes through the base loops, then tension the four guy ropes.",
    ],
    setupTips: [
      "The fan runs the whole time he is out. That is what holds him up.",
      "In a storm, unplug him and he lays down flat on his own. Staked properly he handles an ordinary autumn night.",
      "The LEDs are inside the head and body, so the face glows after dark. That is the shot everyone films.",
    ],
    inBox: [
      "The Scream — 16.4 ft, weatherproof nylon, lit from inside",
      "Blower unit, fitted, with a sealed outdoor lead",
      "Six steel ground stakes, 10 in",
      "Four guy ropes with tensioners",
      "Repair patch kit",
    ],
    faq: [
      {
        q: "How tall is he really?",
        a: "16.4 feet, 5 metres. His head sits level with the upstairs windows.",
      },
      {
        q: "What if he gets a tear?",
        a: "There is a repair patch kit in the box. Patch it, plug him back in.",
      },
      {
        q: "How do I put him away?",
        a: "Unplug, let him settle, fold him into the bag he arrived in. One person can carry it.",
      },
    ],
    reviewAsk: "Sixteen feet of him is on your lawn now. Tell us what the street made of The Scream.",
  },

  "crawling-zombie": {
    name: "The Crawling Zombie",
    image: "/media/cz-s1c-hero.webp",
    setupSteps: [
      "Lift it out, unfold the arms and head, and pull the torn clothing straight.",
      "Put it down on the path or the lawn, facing the way people walk up.",
      "Switch it on. The batteries are already in it, and there is nothing to plug in.",
      "Press the remote once to test it: the arms pull, the body drags forward, the head lifts and turns, and it screams.",
      "Leave it on the motion trigger, or flip the always-on switch in the chest for a party.",
    ],
    setupTips: [
      "The volume switch is underneath. Loud enough for the sidewalk, quiet enough to keep the neighbors.",
      "Keep the base out of standing water and bring it in for a real storm. It lives outside the rest of the month.",
      "Set it just off the main path so trick-or-treaters can choose whether to go near it.",
    ],
    inBox: [
      "The Crawling Zombie — arms, torso, head, torn clothing",
      "The motor unit, sealed into the body",
      "Motion sensor in the chest, with an always-on switch",
      "Lit red eyes, on while it moves",
      "Batteries, fitted, plus a spare set",
      "Remote — on, off, and the motion trigger",
    ],
    faq: [
      {
        q: "Where is the cable?",
        a: "There is none. It runs on batteries with a remote for on, off and the motion trigger. Nothing to plug in and no lead across the lawn.",
      },
      {
        q: "How does it know someone is there?",
        a: "A motion sensor in the chest. Somebody steps onto the path and it starts on its own, then resets and waits for the next one.",
      },
      {
        q: "What when the batteries go?",
        a: "A spare set is in the box. Swap them and switch it back on.",
      },
    ],
    reviewAsk: "Has the mailman run yet? Tell us how The Crawling Zombie is doing on your path.",
  },

  "halloween-movie-theater": {
    name: "The Halloween Movie Theater",
    image: "/media/mt-s1-hero.webp",
    setupSteps: [
      "Unroll the screen on the grass with the front facing where everyone will sit.",
      "Plug the blower into its outdoor lead. It stands the screen up on its own.",
      "Peg the four corners and tension the tethers. That is the two minutes.",
      "Set the projector back from the screen and run the HDMI to your phone, laptop or stick.",
      "Press play and sit down.",
    ],
    setupTips: [
      "Leave the blower running the whole evening. It is what holds the screen up, and it is quieter than the film.",
      "The sound comes off your own speaker, so bring one out with the chairs.",
      "It packs down smaller than a folding chair. Everything goes back in the bag, and the bag goes in the garage.",
    ],
    inBox: [
      "The screen — 12 ft wide, inflatable, stands on the grass",
      "The projector — plays from a phone, a laptop or a stick",
      "The blower, quiet enough to run all evening",
      "Four ground pegs and tethers",
      "Outdoor lead for the blower, HDMI for the projector",
      "The bag it all goes back into",
    ],
    faq: [
      {
        q: "What can we watch on it?",
        a: "Anything your phone or laptop plays. Plug it in, press play.",
      },
      {
        q: "How big is the screen?",
        a: "Twelve feet across, 3.6 metres, standing on the grass. Nobody has to see round anybody.",
      },
      {
        q: "Is it only for Halloween?",
        a: "No. It is a garden cinema in June as well. It just happens to arrive in October.",
      },
    ],
    reviewAsk: "First film on yet? Tell us how The Halloween Movie Theater went down in your garden.",
  },

  "haunted-projector": {
    name: "The Haunted Projector",
    image: "/media/hp-o1-hero.webp",
    setupSteps: [
      "Stick the window film on the inside of a front window and smooth it flat.",
      "Stand the projector on the windowsill inside, lens pointed at the glass.",
      "Plug it in. A 16 ft outdoor extension cord is in the box if the socket is far.",
      "Pick one of the twelve loops on the remote, or let them cycle on their own.",
      "Set the timer: four or six hours, then it switches itself off.",
    ],
    setupTips: [
      "Step outside once it is dark. From the street the ghosts walk across the pane.",
      "It can also go out on the lawn: the adjustable stake mount angles it up a wall, and from about sixteen feet back the picture is thirteen feet wide.",
      "Outdoors, the housing is weather-sealed but the plug end has to stay dry. Use an outdoor socket cover.",
    ],
    inBox: [
      "The projector, with twelve loops built in",
      "Ground stake mount, adjustable angle",
      "Window film, for the indoor-glass effect",
      "16 ft outdoor extension cord",
      "Remote — loop and timer",
    ],
    faq: [
      {
        q: "Does it make any noise?",
        a: "None at all. It is a projector, not a speaker.",
      },
      {
        q: "Does it turn itself off?",
        a: "Yes. The timer on the remote runs it for four or six hours and then it stops until the next night.",
      },
      {
        q: "What does it actually show?",
        a: "Twelve loops: ghosts drifting past, a skeleton, bats, a witch, moving shadows. They cycle, or you fix one.",
      },
    ],
    reviewAsk: "Are there ghosts in your window yet? Tell us how The Haunted Projector looks from the street.",
  },
};

export const REAPER_PRODUCT_HANDLES = Object.keys(REAPER_PRODUCTS) as ReaperProductHandle[];

/** The guide for a handle, or nothing: an order line for a product not in this map still gets an email, just without steps. */
export function reaperProduct(handle: string | null | undefined): ReaperProductGuide | null {
  if (!handle) return null;
  return (REAPER_PRODUCTS as Record<string, ReaperProductGuide>)[handle] ?? null;
}

/** Every product this shop has a guide for, for looking one up by name. */
export const reaperHandles: ReaperProductHandle[] = [
  "black-reaper",
  "the-scream",
  "crawling-zombie",
  "halloween-movie-theater",
  "haunted-projector",
];
