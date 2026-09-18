"""
Puts the real logo onto a photograph of a plain box.

Asking an image model to render "BLACK REAPER" produces BLAKC REPAER often
enough that every box shot has to be checked, and a misspelt logo on a product
page is worse than no box shot at all. The model is very good at photographing
a plain cardboard box; it is bad at lettering. So it does the box and this does
the lettering, from the actual file.

Four corners, given in pixels, describe where the logo sits on the box face.
The mark is warped to fit them, so it follows the perspective of the photograph
instead of being pasted on flat, and it is blended with the cardboard's own
light and grain so it reads as printed rather than stuck on.

    python3 tools/brandbox/stamp.py --photo box.jpg --out branded.jpg \
        --corners 310,240 790,300 770,520 300,455
"""
import argparse
from PIL import Image, ImageFilter, ImageEnhance

MARK = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/br-mark.png"


def coeffs(src, dst):
    """The perspective transform PIL wants: destination corners -> source."""
    matrix = []
    for (sx, sy), (dx, dy) in zip(src, dst):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    import numpy as np
    A = np.matrix(matrix, dtype=float)
    B = np.array(src).reshape(8)
    return np.array(np.dot(np.linalg.inv(A.T * A) * A.T, B)).reshape(8)


def stamp(photo, mark, corners, opacity=0.92, blur=0.6):
    base = Image.open(photo).convert("RGBA")
    logo = Image.open(mark).convert("RGBA")

    # Warp the mark so its own four corners land on the four given points.
    src = [(0, 0), (logo.width, 0), (logo.width, logo.height), (0, logo.height)]
    warped = logo.transform(
        base.size, Image.PERSPECTIVE, coeffs(src, corners),
        resample=Image.BICUBIC,
    )

    # Printing on cardboard is never perfectly sharp and never fully opaque.
    # A touch of blur and a little transparency is the difference between
    # printed and stuck on.
    if blur:
        warped = warped.filter(ImageFilter.GaussianBlur(blur))
    if opacity < 1:
        alpha = warped.getchannel("A")
        warped.putalpha(ImageEnhance.Brightness(alpha).enhance(opacity))

    out = Image.alpha_composite(base, warped)
    return out.convert("RGB")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--photo", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--mark", default=MARK)
    p.add_argument("--corners", required=True,
                   help="four x,y pairs clockwise from the top left of the logo")
    p.add_argument("--opacity", type=float, default=0.92)
    p.add_argument("--blur", type=float, default=0.6)
    a = p.parse_args()
    pts = [tuple(float(n) for n in pair.split(",")) for pair in a.corners.split()]
    if len(pts) != 4:
        raise SystemExit("need exactly four corners")
    stamp(a.photo, a.mark, pts, a.opacity, a.blur).save(a.out, quality=93)
    print(a.out)
