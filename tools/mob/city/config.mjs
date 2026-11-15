// THE CITY: one config = the whole town. Mirrors .claude/skills/gem/MAP.md (engines -> districts, skills -> buildings).
// Add a business/skill: add ONE entry to BUILDINGS (or one to PLOTS). Layout, sign, panel and minimap are generated.
// status: "open" (running) | "construction" (being built) | "planned" (only on the map) | "closed" (retired) | "auto"
//   auto (stores only) = open if a paid order or >= MIN_VISITS visits in the last STATUS_DAYS days, else `idle`.
// To flip anything by hand: change that one `status:` line. Manual always wins over auto.
export const STATUS_DAYS = 60;
export const MIN_VISITS = 5;

export const DISTRICTS = {
  stores:   { name: "Stores (Kerberos)",        engine: "Engine 4", r: 38, a0: -58, a1: 58,  rowGap: 13 },
  reselling:{ name: "Reselling",                engine: "Engine 1", r: 46, a0: 72,  a1: 108, rowGap: 12 },
  clipping: { name: "Clipping",                 engine: "Engine 2", r: 46, a0: 118, a1: 146, rowGap: 12 },
  core:     { name: "Core / HQ",                engine: "Core",     r: 50, a0: 158, a1: 202, rowGap: 12 },
  whatif:   { name: "WHAT IF studio",           engine: "Engine 3", r: 48, a0: 214, a1: 226, rowGap: 12 },
  trading:  { name: "Trading market",           engine: "Engine 6", r: 46, a0: 232, a1: 256, rowGap: 12 },
  organic:  { name: "Organic / Ads",            engine: "Engine 5", r: 46, a0: 266, a1: 290, rowGap: 12 },
  side:     { name: "Side hustles",             engine: "Engine 7", r: 66, a0: -100, a1: -72, rowGap: 12 },
  personal: { name: "Personal",                 engine: "Personal", r: 70, a0: -62,  a1: -52, rowGap: 12 },
  home:     { name: "Home",                     engine: "Home",     r: 0, a0: 0, a1: 0, rowGap: 12 },
  finance:  { name: "Finance",                  engine: "Finance",  r: 22, a0: 80,   a1: 80,  rowGap: 12 },
};

// size [w,d,h]; prop = rooftop/front landmark (see city/props.js); brain = regex source matched against aquarius_brain.business+idea
export const BUILDINGS = [
  // ---- Stores (live data from Neon orders/carts/visits) ----
  { id: "reaper",   name: "Black Reaper",       district: "stores", kind: "store", slug: "reaper", purpose: "Halloween store, driven by organic reels.", status: "auto", idle: "closed", accent: "#15151a", trim: "#ff7a1a", prop: "reaper", brain: "reaper|halloween", next: ["Second processor before more ads (payments checklist)."] },
  { id: "archive",  name: "Mysterious Archive", district: "stores", kind: "store", slug: "mysterious-archive", purpose: "Genuine Chrome Hearts, sourced one piece at a time.", status: "auto", idle: "closed", accent: "#25252e", trim: "#c9ccd6", prop: "cross", brain: "archive|chrome", next: ["Reviews first: they set the price ceiling."] },
  { id: "bodies",   name: "bodies",             district: "stores", kind: "store", slug: "bodies", purpose: "Portable smart Pilates board: Icy Swan, Lilac Heat, Matcha.", status: "auto", idle: "closed", accent: "#9a7ad8", trim: "#f2e6ff", prop: "ring", brain: "bodies|pilates" },
  { id: "cryo",     name: "cryo",               district: "stores", kind: "store", slug: "cryo", purpose: "Countertop bottle chiller. No fridge, no ice.", status: "auto", idle: "closed", accent: "#4ab6e8", trim: "#e8fbff", prop: "ice", brain: "cryo" },
  { id: "snowman",  name: "Snow Buddy",         district: "stores", kind: "store", slug: "snowman", purpose: "Snow machine: your house is the only one on the street with snow.", status: "auto", idle: "construction", accent: "#7fb6ff", trim: "#ffffff", prop: "snowman", brain: "snow" },
  { id: "garden",   name: "Garden Buddy",       district: "stores", kind: "store", slug: "garden-buddy", purpose: "Garden kneeler. Live on Shopify (amboras.com) and on Kerberos.", status: "auto", idle: "closed", accent: "#3f8f3a", trim: "#f7f3d0", prop: "planter", brain: "garden|amboras" },
  { id: "ceiling",  name: "Ceiling Buddy",      district: "stores", kind: "store", slug: "ceiling-buddy", purpose: "Ceiling-mounted helper store.", status: "auto", idle: "closed", accent: "#e8b84a", trim: "#fff6d8", prop: "lamp", brain: "ceiling" },
  { id: "xero",     name: "XERO",               district: "stores", kind: "store", slug: "xero", purpose: "XERO store.", status: "auto", idle: "closed", accent: "#2f6fb8", trim: "#ffffff", prop: "windmill", brain: "xero" },
  { id: "scream",   name: "Giant Scream",       district: "stores", kind: "store", slug: "giant-scream", purpose: "Giant Scream store.", status: "auto", idle: "closed", accent: "#d8d8e0", trim: "#1a1a22", prop: "scream", brain: "scream" },
  { id: "kerberos", name: "Kerberos HQ",        district: "stores", kind: "skill", skill: "kerberos", purpose: "Our own Shopify replacement running every store above.", status: "open", accent: "#1c3d6e", trim: "#f0c040", prop: "gate", brain: "kerberos", next: ["Phase 1 left: on-site checkout proven in test mode, Meta pixel + Conversions API, confirmation emails, real domain."] },
  { id: "projector",name: "HoloHaunt projector",district: "stores", kind: "skill", skill: "black-reaper-projector", purpose: "Halloween/Christmas projector add-on for Black Reaper.", status: "planned", accent: "#a04ad8", trim: "#ffd8ff", prop: "projector", brain: "projector|holohaunt" },

  // ---- Finance ----
  { id: "bank",     name: "The Bank",           district: "finance", kind: "bank", skill: "payments", purpose: "Where the money lives: processors, orders, manual income.", status: "open", accent: "#5c5348", trim: "#f0c040", prop: "bank", size: [9, 7, 5.4], brain: "payment|stripe|bank", next: ["Two processors before ads (payments law)."] },

  // ---- Core / HQ ----
  { id: "hq",       name: "Aquarius HQ",        district: "core", kind: "skill", skill: "gem + aquarius", purpose: "Alex's CEO genie: gem runs the whole map every day.", status: "open", accent: "#1c4fb8", trim: "#f0c040", prop: "hq", big: true, pos: [0, -62], size: [13, 10, 7], brain: "aquarius|gem|hustle", next: ["Keep the daily loop running; one real money step per run."] },
  { id: "lean",     name: "Lean tower",         district: "core", kind: "skill", skill: "lean", purpose: "Token saver so Alex's usage lasts. Always on.", status: "open", accent: "#3aa876", trim: "#e8fff0", prop: "battery" },
  { id: "laws",     name: "Hall of Laws",       district: "core", kind: "skill", skill: "never-again + shipping + payments", purpose: "Every mistake already paid for, and the rule that stops it.", status: "open", accent: "#8a6a3a", trim: "#f6ecd0", prop: "pillars" },
  { id: "cursor",   name: "Cursor workshop",    district: "core", kind: "skill", skill: "cursor", purpose: "Personal agent app that drives the real internet.", status: "open", accent: "#d85a8a", trim: "#ffe8f0", prop: "pointer" },

  // ---- Reselling (Engine 1) ----
  { id: "flip",     name: "flip (Depop)",       district: "reselling", kind: "skill", skill: "flip + ultracursor-depop", purpose: "Automated Depop seller, depop.com/alleqsh. US account, 0% fee.", status: "open", accent: "#d83a3a", trim: "#ffffff", prop: "hanger", brain: "flip|depop|grailed|resell", next: ["Reviews unlock price: 5 reviews makes 850 credible, 20 makes 5200 credible."] },
  { id: "scout",    name: "Scout tower",        district: "reselling", kind: "skill", skill: "depop-scout + depop-dropship", purpose: "Reads Depop demand and turns it into a hunt list.", status: "open", accent: "#4a7ab8", trim: "#eaf3ff", prop: "telescope" },
  { id: "negotiator",name:"Negotiation desk",   district: "reselling", kind: "skill", skill: "flip-negotiator", purpose: "How flip answers buyers, counters and closes.", status: "open", accent: "#9a5a2a", trim: "#fff0d8", prop: "scales" },
  { id: "supplier", name: "Supplier post office",district:"reselling", kind: "skill", skill: "supplier-messages", purpose: "Alibaba / 1688 / WhatsApp messages to suppliers.", status: "open", accent: "#c8a24a", trim: "#fff8e0", prop: "mail" },

  // ---- Clipping (Engine 2) ----
  { id: "mob",      name: "mob studio",         district: "clipping", kind: "clipping", skill: "mob", purpose: "Our own posting platform: YouTube, Instagram, TikTok, Content Rewards.", status: "open", accent: "#ff6a3a", trim: "#fff0e0", prop: "billboard", brain: "clip|mob|whop", next: ["Publish the Google app (privacy/terms done), connect Instagram and TikTok."] },
  { id: "clipper",  name: "Cursor Clipper",     district: "clipping", kind: "skill", skill: "cursor-clipper", purpose: "Mac app that works Whop Content Rewards and YouTube. No trading, ever.", status: "open", accent: "#e8a020", trim: "#fff4d0", prop: "clapper" },
  { id: "leonida",  name: "Leonida Daily",      district: "clipping", kind: "skill", skill: "leonida-daily", purpose: "GTA 6 YouTube Shorts channel and the machine behind it.", status: "open", accent: "#d84ad8", trim: "#ffe8ff", prop: "tv" },

  // ---- WHAT IF (Engine 3) ----
  { id: "whatif",   name: "WHAT IF studio",     district: "whatif", kind: "skill", skill: "whatif", purpose: "Faceless Shorts made from code. 1 a day, science first. Needs 1k subs to pay.", status: "open", accent: "#4a3aa8", trim: "#d8ccff", prop: "observatory", brain: "what.?if", next: ["Make the next one; style v3 is locked."] },

  // ---- Trading (Engine 6) ----
  { id: "stocks",   name: "Stock trading floor",district: "trading", kind: "skill", skill: "trader-master + 11 trader-* skills", purpose: "Scan, news, entry, exit, budget, risk, broker. Paper first.", status: "construction", accent: "#2a8a5a", trim: "#e8fff4", prop: "candles", brain: "trad|stock", next: ["Alpaca paper account, then the pipeline end to end."] },
  { id: "memecoins",name: "GMGN memecoin pit",  district: "trading", kind: "trading", skill: "gmgn-fib + ultra-growth", purpose: "Fibonacci memecoin scalps on a separate wallet, inside the caps.", status: "open", accent: "#7a3ad8", trim: "#f0e0ff", prop: "coin", brain: "gmgn|memecoin|solana" },
  { id: "ultra",    name: "ultracursor lab",    district: "trading", kind: "skill", skill: "ultracursor", purpose: "Product-research Mac app, and the cursor that does the trades.", status: "open", accent: "#2a7ad8", trim: "#e0f0ff", prop: "pointer" },

  // ---- Organic / Ads (Engine 5) ----
  { id: "organicx", name: "OrganicX",           district: "organic", kind: "skill", skill: "organicx", purpose: "Organic dropshipping: real browsers and a real phone post the reels.", status: "open", accent: "#e85a2a", trim: "#fff0e0", prop: "phone", brain: "organic|reel|tiktok" },
  { id: "ugc",      name: "UGC studio",         district: "organic", kind: "skill", skill: "ugc-master-prompter + micro-trust + xugc", purpose: "Every video/ad prompt, written to look real. Paid video only when Alex says generate.", status: "open", accent: "#d83a8a", trim: "#ffe0f0", prop: "camera", brain: "ugc|video|ad" },
  { id: "wand",     name: "Magic Wand",         district: "organic", kind: "skill", skill: "magic-wand + listing-images", purpose: "Mac app that makes and places the product pictures.", status: "open", accent: "#6a4ad8", trim: "#f0e8ff", prop: "wand" },

  // ---- Side hustles (Engine 7) ----
  { id: "hustle",   name: "Hustle lab",         district: "side", kind: "skill", skill: "hustle", purpose: "Always trying one new way to make money with the tools we have.", status: "open", accent: "#d8a82a", trim: "#fff8d8", prop: "bulb", brain: "hustle|side-hustle|digital|saas|website", next: ["Local-business websites, SMB automation retainers (see brain ideas below)."] },
  { id: "realestate",name:"Real estate office", district: "side", kind: "skill", skill: "real-estate", purpose: "US wholesaling from Greece: leads, comps, cash-buyer list.", status: "construction", accent: "#2a6a9a", trim: "#e8f4ff", prop: "minihouse", brain: "real.?estate|wholesal", next: ["Needs a US LLC, a US phone and a closing attorney before the first contract."] },
  { id: "miner",    name: "Miner workshop",     district: "side", kind: "miner", skill: "miner", purpose: "Crypto mining rig. Waiting for the machine.", status: "construction", accent: "#6a6a72", trim: "#ffd84a", prop: "gear", brain: "mining|asic" },

  // ---- Alex's house (spawn) ----
  { id: "home",     name: "Alex's villa",       district: "home", kind: "home", skill: "home", purpose: "Home on the hill by the sea. Pool, lounge, olive trees.", status: "open", accent: "#c8643a", trim: "#fffaf0", prop: "villa", pos: [66, 50], size: [10, 7, 4.6], big: true },

  // ---- Personal ----
  { id: "kcal",     name: "kcal gym",           district: "personal", kind: "skill", skill: "kcal", purpose: "Alex's weight and calorie tracker. Goal 96 kg by 25 Dec.", status: "open", accent: "#d85a3a", trim: "#fff0e8", prop: "dumbbell" },
];

// Open plots for the future: one entry each. Positions are fixed so they stay put when buildings are added.
export const PLOTS = [
  { id: "plot1", pos: [-62, 52] }, { id: "plot2", pos: [-30, 76] }, { id: "plot3", pos: [34, 76] }, { id: "plot4", pos: [-76, 30] },
];

// Worker NPCs: each tied to a real job. State comes from data (see src/city.mjs workers()); no data = resting.
// Hook for later: a task for a worker goes in through POST /api/aquarius/say (mob mailbox). NOT wired to any click yet.
export const WORKERS = [
  { id: "poster",     name: "Clip poster",  home: "mob",      color: "#ff6a3a" },
  { id: "keeper",     name: "Store keeper", home: "reaper",   color: "#3a7ad8" },
  { id: "trader",     name: "Trader",       home: "memecoins",color: "#7a3ad8" },
  { id: "researcher", name: "Researcher",   home: "hq",       color: "#3aa876" },
  { id: "builder",    name: "Builder",      home: "kerberos", color: "#e8a020" },
];

export const PLAZA = [0, 0];
const rad = (d) => (d * Math.PI) / 180;

// Generate x,z + facing for every building from its district arc. Entries with `pos` keep it.
export function layout(buildings = BUILDINGS, districts = DISTRICTS) {
  const by = {};
  for (const b of buildings) (by[b.district] ||= []).push(b);
  const out = [];
  for (const [dk, list] of Object.entries(by)) {
    const D = districts[dk];
    const free = list.filter((b) => !b.pos);
    for (const b of list) if (b.pos) out.push({ ...b, pos: b.pos });
    if (!free.length) continue;
    const arc = Math.abs(rad(D.a1 - D.a0)) * D.r;
    const perRow = Math.max(1, Math.floor(arc / 10.5) + 1);
    const rows = Math.ceil(free.length / perRow);
    free.forEach((b, i) => {
      const row = i % rows, idx = Math.floor(i / rows);
      const inRow = Math.ceil((free.length - row) / rows);
      const t = inRow === 1 ? 0.5 : idx / (inRow - 1);
      const a = rad(D.a0 + (D.a1 - D.a0) * t), r = D.r + row * D.rowGap;
      out.push({ ...b, pos: b.pos || [Math.round(r * Math.sin(a) * 10) / 10, Math.round(r * Math.cos(a) * 10) / 10] });
    });
  }
  return out.map((b) => ({ size: [6.4, 5.4, 4.2], ...b, ry: Math.atan2(PLAZA[0] - b.pos[0], PLAZA[1] - b.pos[1]) }));
}
