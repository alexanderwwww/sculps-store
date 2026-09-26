# Clone Me

An app that works as Alex, on Alex's machine, in Alex's own signed-in session.

It is not a bot farm and it is not an account rented to a robot. It is the same
idea as Magic Wand: the laptop is his, the session is his, the tap is his — the
app just does the reading and the typing at a speed a person cannot.

## Why it is built this way

Fiverr bans fully automated order fulfilment, says so plainly in its terms, and
looks for it. Accounts caught are banned permanently with no appeal, and there
is no seller API, so anything calling itself a "Fiverr bot" is scraping the site
while the site watches for exactly that.

What Fiverr does allow is a seller using AI to do the work. So the line this app
holds is: **it reads, it scores, it drafts. It never accepts and never sends.**
Every outbound action is a tap.

That is not caution for its own sake. A new seller's only asset is the rating,
and one dispute or one late delivery costs more than the job paid.

## The parts

- `worker/agent/sites/fiverr.js` — the reader. What is waiting, who is asking,
  what they asked for, how long is left. Every field is null until the page
  actually says it: an invented deadline costs a late delivery.
- `worker/work.mjs` — the judgement. `CAN_DO` is the narrow list of things this
  machine finishes to a standard nobody disputes; `REFUSE` is what it turns down
  on sight; `scoreJob` gives every row a verdict and a reason, because a silent
  skip cannot be told apart from a bug.

## The floor

A job has to pay **$15/hour** against an honest estimate of the minutes, or it
is not shortlisted. Cheap work on a new account is how sellers end up trapped
doing $5 jobs at a one-star risk each.

## What it refuses, and why

Anything sold as a human body, voice or face — a buyer would rightly dispute it.
Fake reviews, followers or engagement — banned outright. Academic work — banned.
Anything needing a licence or a signature. These are not preferences; each one
is an account-ending category.
