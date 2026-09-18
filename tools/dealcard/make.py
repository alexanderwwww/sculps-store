"""
The marketplace deal card, drawn rather than generated.

The style is the one every listing on Temu and half of Meta runs: a starburst,
a ribbon, a trust strip, and a price the size of a fist. It sells, and it is
worth copying.

It is drawn here, in code, rather than asked of an image model, for one
reason: every number on it is a claim. A model asked to render "$129.00" will
cheerfully produce "$12900" or "$129.0O", and a price that is wrong on an ad
is worse than no ad. Drawing it means the price, the saving and the struck
figure come straight from the database and are right by construction — and
that regenerating all seven products after a price change is one command.

Nothing on the card is decoration pretending to be a fact. The saving is real
arithmetic, the deadline is the real deadline, and there is no star rating or
units-sold figure until there are real ones to print.

    python3 tools/dealcard/make.py --photo x.jpg --out card.jpg \
        --title "The Black Reaper" --price 12900 --compare 19800 \
        --ribbon "ORDER BY 20 OCT" --corner "2 FOR $129"
"""
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
ITAL = "/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf"

ORANGE = (245, 130, 31)
YELLOW = (255, 214, 10)
RED = (214, 32, 32)
INK = (17, 17, 19)
PAPER = (255, 255, 255)


def font(size, italic=False):
    return ImageFont.truetype(ITAL if italic else BOLD, size)


def fit(draw, text, box_w, start, italic=False, floor=12):
    """The largest size at which the words still fit the space they are given."""
    size = start
    while size > floor:
        f = font(size, italic)
        if draw.textlength(text, font=f) <= box_w:
            return f
        size -= 2
    return font(floor, italic)


def money(cents):
    return f"${cents / 100:,.2f}"


def starburst(draw, cx, cy, r, points=18):
    pts = []
    import math
    for i in range(points * 2):
        a = math.pi * i / points - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.76
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    draw.polygon(pts, fill=YELLOW, outline=INK)


def build(args):
    S = 1200
    card = Image.new("RGB", (S, S), PAPER)

    # The photograph, filling the top three quarters.
    photo_h = int(S * 0.78)
    src = Image.open(args.photo).convert("RGB")
    scale = max(S / src.width, photo_h / src.height)
    src = src.resize((int(src.width * scale), int(src.height * scale)), Image.LANCZOS)
    # Crop from a third of the way down rather than the middle. These are tall
    # objects photographed head-to-foot, and a centre crop reliably removes the
    # head — which on a reaper is the entire product.
    top = max(0, min(int((src.height - photo_h) * 0.18), src.height - photo_h))
    left = max(0, (src.width - S) // 2)
    card.paste(src.crop((left, top, left + S, top + photo_h)), (0, 0))

    d = ImageDraw.Draw(card)

    # --- the ribbon, top right ------------------------------------------
    if args.ribbon:
        f = font(40)
        w = d.textlength(args.ribbon, font=f) + 46
        d.rectangle([S - w - 18, 18, S - 18, 18 + 62], fill=RED)
        d.rectangle([S - w - 18, 18, S - 18, 18 + 62], outline=PAPER, width=4)
        d.text((S - w / 2 - 18, 18 + 31), args.ribbon, font=f, fill=PAPER, anchor="mm")

    # --- the saving, as a starburst, top left ----------------------------
    if args.compare and args.compare > args.price:
        saved = args.compare - args.price
        cx, cy, r = 190, 190, 150
        starburst(d, cx, cy, r)
        # Dollars, never a percentage: a percentage is a number somebody has to
        # do arithmetic on before it means anything.
        big = f"${saved // 100}"
        fb = fit(d, big, r * 1.35, 108)
        d.text((cx, cy - 22), big, font=fb, fill=INK, anchor="mm")
        d.text((cx, cy + 44), "OFF", font=font(52), fill=INK, anchor="mm")

    # --- the corner flag, right edge -------------------------------------
    if args.corner:
        fw, fh = 108, int(S * 0.52)
        flag = Image.new("RGBA", (fh, fw), (0, 0, 0, 0))
        fd = ImageDraw.Draw(flag)
        fd.polygon([(0, 0), (fh, 0), (fh - 46, fw // 2), (fh, fw), (0, fw)], fill=ORANGE + (255,))
        ff = fit(fd, args.corner, fh - 90, 52)
        fd.text((fh / 2 - 18, fw / 2), args.corner, font=ff, fill=INK, anchor="mm")
        card.paste(flag.rotate(-90, expand=True), (S - fw - 16, 100), flag.rotate(-90, expand=True))

    # --- the trust strip --------------------------------------------------
    strip_h = 62
    y = photo_h - strip_h
    d.rectangle([0, y, S, photo_h], fill=INK)
    f = fit(d, args.trust, S - 40, 36)
    d.text((S / 2, y + strip_h / 2), args.trust, font=f, fill=PAPER, anchor="mm")

    # --- the price block --------------------------------------------------
    #
    # The button is placed first and the price is then fitted to what is left.
    # Doing it the other way round is how the struck-through figure ended up
    # underneath the button: the price was sized against the full width and
    # everything after it had to go somewhere.
    d.rectangle([0, photo_h, S, S], fill=YELLOW)
    mid = photo_h + (S - photo_h) // 2

    bw, bh = 380, 104
    bx, by = S - bw - 36, mid - bh // 2
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=16, fill=RED)
    d.text((bx + bw / 2, by + bh / 2), "SHOP NOW", font=font(54), fill=PAPER, anchor="mm")

    room = bx - 36 - 40
    price = money(args.price)
    was = money(args.compare) if args.compare and args.compare > args.price else ""
    fw2 = font(42)
    was_w = (d.textlength(was, font=fw2) + 24) if was else 0
    fp = fit(d, price, room - was_w, 140)
    d.text((40, mid), price, font=fp, fill=INK, anchor="lm")

    if was:
        wx = 40 + d.textlength(price, font=fp) + 22
        wy = mid + 18
        d.text((wx, wy), was, font=fw2, fill=(122, 98, 0), anchor="lm")
        tw = d.textlength(was, font=fw2)
        d.line([wx - 4, wy, wx + tw + 4, wy], fill=RED, width=6)

    card.save(args.out, quality=92)
    print(args.out)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--photo", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--title", default="")
    p.add_argument("--price", type=int, required=True, help="cents")
    p.add_argument("--compare", type=int, default=0, help="cents")
    p.add_argument("--ribbon", default="")
    p.add_argument("--corner", default="")
    p.add_argument("--trust", default="FREE SHIPPING  ·  30-DAY RETURNS  ·  BEFORE HALLOWEEN")
    build(p.parse_args())
