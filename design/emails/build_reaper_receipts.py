#!/usr/bin/env python3
"""Two branded Black Reaper order emails, rendered from real order data (design preview).
   python3 build_reaper_receipts.py  ->  order-1006-scream.html, order-1005-projector.html"""
import json, html, base64, sys
INLINE = "--urls" not in sys.argv  # preview files carry their pictures; --urls writes the version that points at blackreaper.us
def pic(name, mime):
    return ("data:%s;base64," % mime) + base64.b64encode(open("img/" + name, "rb").read()).decode() if INLINE else "https://blackreaper.us/media/" + name
O = json.load(open("/tmp/orders2.json"))
BG, CARD, BONE, META, RULE, ORANGE, RED = "#0A0A0A", "#121212", "#F3EEE6", "#8D8A84", "#26231F", "#F5821F", "#E0301E"
F = "Archivo,'Helvetica Neue',Arial,sans-serif"; B = "Inter,'Helvetica Neue',Arial,sans-serif"
money = lambda c: "${:,.2f}".format(c / 100)
e = html.escape

def step(i, label, sub, on):
    dot = f"background:{ORANGE};border-color:{ORANGE}" if on else f"background:transparent;border-color:#4a463f"
    return f"""<td valign="top" width="25%" style="padding:0 4px"><div style="height:4px;border-radius:2px;background:{ORANGE if on else RULE};margin-bottom:10px"></div>
<div style="font:700 11px {F};letter-spacing:.14em;color:{BONE if on else META}">{label}</div><div style="margin-top:3px;font:12px/1.4 {B};color:{META}">{sub}</div></td>"""

def email(*, first, ref, hero, kicker, headline, intro, banner, item, qty, line_cents, discount, disc_cents, total, ship_city, steps_title, steps, box, number):
    sub = line_cents * qty
    rows = f"""<tr><td style="padding:6px 0;font:15px {B};color:{META}">Subtotal</td><td align="right" style="font:15px {B};color:{BONE}">{money(sub)}</td></tr>"""
    if discount: rows += f"""<tr><td style="padding:6px 0;font:15px {B};color:{META}">{e(discount)}</td><td align="right" style="font:15px {B};color:{ORANGE}">&minus;{money(disc_cents)}</td></tr>"""
    rows += f"""<tr><td style="padding:6px 0;font:15px {B};color:{META}">Shipping</td><td align="right" style="font:15px {B};color:{BONE}">Free</td></tr>
<tr><td style="padding:14px 0 0;border-top:1px solid {RULE};font:800 17px {F};color:{BONE}">Total paid</td><td align="right" style="padding:14px 0 0;border-top:1px solid {RULE};font:800 22px {F};color:{ORANGE}">{money(total)}</td></tr>"""
    bx = "".join(f"""<tr><td valign="top" width="22" style="padding:7px 0;font:700 14px {F};color:{ORANGE}">&#10003;</td><td style="padding:7px 0;font:15px/1.45 {B};color:{BONE}">{b}</td></tr>""" for b in box)
    st = "".join(f"""<tr><td valign="top" width="34" style="padding:9px 0"><div style="width:24px;height:24px;border-radius:12px;background:{ORANGE};text-align:center;font:800 13px/24px {F};color:#0A0A0A">{i+1}</div></td><td style="padding:9px 0;font:15px/1.45 {B};color:{BONE}"><b style="font-family:{F}">{e(a)}</b><br><span style="color:{META}">{e(b)}</span></td></tr>""" for i, (a, b) in enumerate(steps))
    ban = f"""<tr><td style="padding:0 32px 6px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #5a2a14;background:#1c120c;border-radius:10px"><tr><td style="padding:14px 16px;font:14px/1.55 {B};color:#EBD9C8">{banner}</td></tr></table></td></tr>""" if banner else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:{BG}"><div style="display:none;max-height:0;overflow:hidden">{e(kicker)} &middot; {money(total)} paid</div>
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="{BG}"><tr><td align="center" style="padding:0 0 40px">
<table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td align="center" style="padding:26px 32px 20px"><img src="{pic('em-br-logo.png', 'image/png')}" alt="BLACK REAPER" width="150" style="display:block;border:0;height:auto"></td></tr>
<tr><td style="padding:0;font-size:0;line-height:0;background:#000"><img src="{hero}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:30px 32px 6px"><div style="font:700 12px {F};letter-spacing:.2em;color:{ORANGE}">{e(kicker)}</div>
<div style="margin-top:10px;font:800 34px/1.08 {F};letter-spacing:-.02em;color:{BONE}">{headline}</div>
<div style="margin-top:14px;font:16px/1.6 {B};color:#CFCAC1">{intro}</div></td></tr>
{ban}
<tr><td style="padding:24px 32px 4px"><table width="100%" cellpadding="0" cellspacing="0"><tr>{"".join(step(i, *s) for i, s in enumerate([("PAID", "Confirmed", True), ("PACKING", "Today", True), ("SHIPS", "1&ndash;2 business days", False), ("TRACKING", "By email", False)]))}</tr></table></td></tr>
<tr><td style="padding:26px 32px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background:{CARD};border:1px solid {RULE};border-radius:12px"><tr><td style="padding:22px 22px 8px">
<div style="font:700 11px {F};letter-spacing:.18em;color:{META}">YOUR ORDER &middot; {e(ref)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td style="font:800 20px {F};color:{BONE}">{e(item)}</td><td align="right" style="font:800 20px {F};color:{BONE}">{money(line_cents)}</td></tr><tr><td colspan="2" style="padding:2px 0 14px;font:13px {B};color:{META}">Qty {qty}</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0">{rows}</table></td></tr><tr><td style="padding:6px 22px 22px"><div style="margin-top:14px;font:700 11px {F};letter-spacing:.18em;color:{META}">SHIPPING TO</div><div style="margin-top:6px;font:16px/1.5 {B};color:{BONE}">{ship_city}</div></td></tr></table></td></tr>
<tr><td style="padding:26px 32px 0"><div style="font:800 20px {F};color:{BONE}">What&rsquo;s in the box</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">{bx}</table></td></tr>
<tr><td style="padding:26px 32px 0"><div style="font:800 20px {F};color:{BONE}">{e(steps_title)}</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">{st}</table></td></tr>
<tr><td style="padding:28px 32px 0"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid {RULE}"><tr><td style="padding:20px 0 0;font:15px/1.6 {B};color:#CFCAC1">Anything wrong, or a question before it arrives? <b style="color:{BONE}">Just reply to this email.</b> A real person reads it and we answer fast.</td></tr></table></td></tr>
<tr><td align="center" style="padding:28px 32px 0"><div style="font:800 12px {F};letter-spacing:.22em;color:{META}">BLACK REAPER</div><div style="margin-top:8px;font:12px/1.7 {B};color:{META}">Free shipping &middot; 30 days to send it back &middot; <a href="https://blackreaper.us" style="color:{META}">blackreaper.us</a></div></td></tr>
</table></td></tr></table></body></html>"""

g = O["1006"]; a = O["1005"]
sfx = "-urls" if not INLINE else ""
open("order-1006-scream%s.html" % sfx, "w").write(email(
    first="Gary", ref="BR755406", hero=pic("em-scr-hero.jpg", "image/jpeg"), kicker="ORDER CONFIRMED",
    headline="Sixteen feet of nightmare is on its way, Gary.",
    intro="Payment went through and your Scream is being packed. It stands up in about ninety seconds, and your whole street will know about it. The next email has your tracking number.",
    banner=None, item="The 16 ft Scream", qty=1, line_cents=29999, discount="REAPER20", disc_cents=2000, total=g["o"]["total_cents"], ship_city="Gary Winkler<br>5761 Old Shallotte Rd NW<br>Shallotte, NC 28470",
    steps_title="Up in ninety seconds", steps=[("Unroll it on the lawn", "Flat, with the face up."), ("Peg it and plug it in", "Six stakes, four ropes, one plug."), ("It stands itself up", "Lit from inside, head level with the upstairs windows.")],
    box=["The Scream — 16.4 ft, weatherproof nylon, lit from inside", "Blower unit, fitted, with a sealed outdoor lead", "Six steel ground stakes, 10 in", "Four guy ropes with tensioners", "Repair patch kit"], number=1006).replace("&mdash;", "—").replace("&rsquo;", "’"))
open("order-1005-projector%s.html" % sfx, "w").write(email(
    first="Adam", ref="BR234764", hero=pic("em-hp-ip-s02.jpg", "image/jpeg"), kicker="ORDER CONFIRMED",
    headline="Your Haunted Projector is on its way, Adam.",
    intro="Payment went through and your order is being packed. It throws a ghost across your window at night, and plugs in with one cord. The next email has your tracking number.",
    banner="<b style='color:#F3EEE6'>Sorry this is late.</b> The confirmation we should have sent you on September 30 never reached you. Your order has been safe and paid since the minute you bought it, and nothing about it has been delayed.",
    item="The Haunted Projector — Two windows", qty=1, line_cents=12999, discount="REAPER20", disc_cents=2000, total=a["o"]["total_cents"], ship_city="Adam Fiorenza<br>2921 Westfield Road<br>Charlotte, NC 28209",
    steps_title="Set up in two minutes", steps=[("Plug it in", "One cord, no screens, no wifi."), ("Point it at the glass", "Any window; the film makes it look like it's inside."), ("Wait for dark", "The ghosts start drifting across.")],
    box=["The projector, with twelve loops built in", "Ground stake mount, adjustable angle", "Window film, for the indoor-glass effect", "16 ft outdoor extension cord", "Remote — loop and timer"], number=1005))
print("ok")
