# OWASP Juice Shop — Practice Lab Checklist

> **Scope / ethics:** Everything below runs against *your own* local Juice Shop
> (`http://localhost:3000`). Juice Shop is OWASP's deliberately-vulnerable app,
> built to be hacked for training. Never point these techniques at systems you
> don't own or have **written permission** to test.

The full arc: **install → run → recon → find hidden page → break the login → tool up → level up.**

---

## Step 0 — Install Docker (the only setup)
- **Windows/Mac:** download Docker Desktop from docker.com, install, launch it.
- **Linux:** `sudo apt install docker.io` then `sudo systemctl start docker`
- Verify:
  ```bash
  docker --version
  ```

## Step 1 — Launch your target
```bash
docker run --rm -p 3000:3000 bkimminich/juice-shop
```
Wait for `Server listening on port 3000`, then open <http://localhost:3000>.
This running site is your legal practice target.

## Step 2 — Recon (look before you touch)
- [ ] Click around the shop like a normal user. Note the login page, search bar, product reviews.
- [ ] Press **F12 → Network**. Refresh. Watch the requests the site makes.
- 🎯 **Goal:** understand the app before attacking it. Real testing is 80% looking.

## Step 3 — Find the hidden admin page
- [ ] **F12 → Sources** (Chrome) / **Debugger** (Firefox).
- [ ] Search the JavaScript files for `score-board`.
- [ ] Visit <http://localhost:3000/#/score-board> — your challenge tracker.
- 🎯 **Lesson:** apps hide pages that aren't linked. Reading source reveals them.

## Step 4 — First real hack: SQL injection login bypass
- [ ] Go to **Login**.
- [ ] In the **Email** field, type exactly:
  ```
  ' OR 1=1--
  ```
- [ ] Type anything in the password box → **Log in**.
- [ ] You're now logged in as admin without the password.
- 🎯 **Why:** the site runs `...WHERE email='[your input]'`. The `'` closes the
  string, `OR 1=1` is always true, `--` comments out the rest. The DB approves
  the first user. This one flaw is behind a huge share of real-world breaches —
  which is exactly why you learn to spot and fix it.

## Step 5 — Add a real proxy tool
- [ ] Install **Burp Suite Community** (free) or **OWASP ZAP**.
- [ ] Set your browser's proxy to `127.0.0.1:8080`, route Juice Shop through it.
- [ ] Now you can intercept, read, and modify every request before it hits the
  server — the core skill of web testing.

## Step 6 — Keep climbing
- [ ] Work the Score Board challenges from ⭐ upward.
- [ ] Pair it with **PortSwigger Web Security Academy** (free, guided labs).
- [ ] Each challenge teaches one real bug class: XSS, broken access control, etc.

---
*Do Steps 1–4, then note what happened (or where it stalled) to pick the next move.*
