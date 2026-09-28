/**
 * Brick three: the pass, driven against a page that answers.
 *
 * No browser here on purpose — this is about the loop's own decisions, and
 * they are the ones that have gone wrong before:
 *
 *   - a logged-out page reported as a quiet shop
 *   - one site being shut stopping the other
 *   - a thrown error disappearing instead of reaching the glass
 *
 * The readers themselves are tested in a real browser in vestiaire.test.mjs.
 * This drives passOne and passAll directly, which is why main.mjs exports them
 * and only starts a bridge when it is the program.
 */
import { passOne, passAll, SITES } from "../worker/main.mjs";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

/** A page that answers however the test tells it to, and remembers the asking. */
function fakePage(answers) {
  const asked = [];
  return {
    asked,
    async ask(act, args = {}) {
      asked.push({ act, ...args });
      const key = act === "read" ? `read:${args.what}` : act;
      /* Deliberately not `??`: a test that says the page answered null must
         get null, or the case it exists to cover is never reached. */
      const paneKey = `${args.pane}:${key}`;
      const answer = paneKey in answers ? answers[paneKey]
        : key in answers ? answers[key]
        : { ok: true };
      if (typeof answer === "function") return answer(args);
      return answer;
    },
  };
}

const depop = SITES[0];
const vestiaire = SITES[1];
const settleMs = 0;

/* Signed in, with stock on the shelf. */
{
  const page = fakePage({
    "read:accountStatus": { signedIn: true, who: "@alleqsh" },
    "read:listings": [{ url: "https://www.depop.com/products/a/", priceCents: 48000 }],
  });
  const shop = await passOne(page, depop, { settleMs });
  check(shop.signedIn === true, "it reports being signed in");
  check(shop.who === "@alleqsh", "the handle comes from the page, not from us");
  check(shop.listings.length === 1, "the shelf is read");
  check(shop.trouble === null, "nothing is reported as trouble when there is none");
  check(shop.doing === null, "it stops saying it is doing something once it has stopped");
  const went = page.asked.filter((a) => a.act === "goto").map((a) => a.url);
  check(went[0] === depop.home && went[1] === depop.shelf,
    "it checks the door before it reads the shelf", went.join(" then "));
  check(page.asked.every((a) => a.pane === "depop"), "every ask names the pane it is for");
}

/* Signed out. This is the one that matters most: a shut door and a quiet day
   look identical, and calling one the other is the worst lie it can tell. */
{
  const page = fakePage({
    "read:accountStatus": { signedIn: false },
    "read:listings": [{ url: "should-never-be-read" }],
  });
  const shop = await passOne(page, depop, { settleMs });
  check(shop.signedIn === false, "a shut door is reported as shut");
  check(shop.listings.length === 0, "it does not read a shelf it cannot see");
  check(/sign in/i.test(shop.trouble || ""), "it says what he has to do about it", shop.trouble);
  check(!page.asked.some((a) => a.url === depop.shelf),
    "it does not even go to the shelf when it is locked out");
}

/* A page that answers with nothing at all — which is not the same as "no". */
{
  const page = fakePage({ "read:accountStatus": null });
  const shop = await passOne(page, depop, { settleMs });
  check(shop.signedIn === null, "no answer is unknown, never a no");
  check(/did not answer/.test(shop.trouble || ""), "silence is reported", shop.trouble);
}

/* And the shape that actually turns up: the bridge answers {ok:true} to an act
   it does not know, so a renamed reader looks like a complete reply with the
   word missing. That must be unknown too, not a no. */
{
  const page = fakePage({ "read:accountStatus": { ok: true } });
  const shop = await passOne(page, depop, { settleMs });
  check(shop.signedIn === null, "a reply with no answer in it is still unknown");
  check(/did not answer/.test(shop.trouble || ""), "and it says so", shop.trouble);
}

/* A throw has to reach the glass as a sentence, not vanish. */
{
  const page = {
    async ask(act) {
      if (act === "goto") throw new Error("the page went away");
      return { ok: true };
    },
  };
  const shop = await passOne(page, vestiaire, { settleMs });
  check(/Vestiaire: the page went away/.test(shop.trouble || ""),
    "a thrown error arrives as a readable line", shop.trouble);
  check(shop.doing === null, "it does not leave a stale 'doing' behind after a failure");
}

/* And one shop being shut must never stop the other — that is the whole point
   of running two marketplaces. */
{
  const page = fakePage({
    "depop:read:accountStatus": { signedIn: false },
    "vestiaire:read:accountStatus": { signedIn: true, who: "alleqsh" },
    "vestiaire:read:listings": [{ url: "https://www.vestiairecollective.com/p/a/" }],
  });
  const { shops } = await passAll(page, SITES, { settleMs });
  check(shops.length === 2, "both marketplaces are visited");
  check(shops[0].signedIn === false && shops[1].signedIn === true,
    "each shop keeps its own answer");
  check(shops[1].listings.length === 1, "the open shop is still read when the other is shut");
}

if (bad) { console.log(`pass: ${bad} failed`); process.exit(1); }
console.log("pass: ok");
