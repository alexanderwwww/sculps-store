"""Render the recovered HELIOS theme to a single static HTML file.

This is a verification harness, not a Shopify emulator. It runs the real Liquid
through python-liquid with the real saved settings, so a broken or truncated
section fails here instead of looking fine in a mock-up.

Shopify-only tags ({% schema %}, {% stylesheet %}, {% javascript %}) are pulled
out first: schema is discarded, stylesheet is hoisted into one <style>, and
javascript is dropped (previews do not need cart AJAX).
"""
import json, re, sys, html
from pathlib import Path
from liquid import Environment

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent.parent / "preview" / "helios-preview.html"

CDN = "https://cdn.shopify.com/s/files/1/0808/6949/0929/files/"
IMG_MAP = {
    "shopify://shop_images/helios-sg-detail-3.png": CDN + "helios-sg-detail-3.png?v=1785072543",
    "shopify://shop_images/helios-sg-detail-4.png": CDN + "helios-sg-detail-4.png?v=1785072543",
    "shopify://shop_images/helios-sg-detail-6.png": CDN + "helios-sg-detail-6.png?v=1785072543",
    "shopify://shop_images/helios-sg-detail-1.jpg": CDN + "helios-sg-detail-1.jpg",
}
PLACEHOLDER = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'>"
               "<rect width='100%' height='100%' fill='%23eef2f4'/><text x='50%' y='50%' fill='%2390a0aa' "
               "font-family='sans-serif' font-size='30' text-anchor='middle'>image</text></svg>")

# ---------- Shopify filters (only the ones these sections actually use) ----------
def f_image_url(v, **kw):
    if not v: return PLACEHOLDER
    s = str(v)
    if s.startswith("shopify://"): return IMG_MAP.get(s, PLACEHOLDER)
    return s
def f_escape(v): return html.escape(str(v or ""))
def f_money(v):
    try: return "${:,.2f}".format(float(v) / 100.0)
    except Exception: return str(v)
def f_newline_to_br(v): return str(v or "").replace("\n", "<br>")
def f_video_tag(v, **kw):
    if not v: return ""
    src = IMG_MAP.get(str(v), "")
    return f'<video muted loop playsinline poster="{PLACEHOLDER}" src="{src}"></video>'
def f_payment_type_svg_tag(v, **kw): return ""
def f_t(v, **kw): return str(v)
def f_handleize(v): return re.sub(r"[^a-z0-9]+", "-", str(v or "").lower()).strip("-")
def f_img_tag(v, *a, **kw): return f'<img src="{f_image_url(v)}" alt="">'

def build_env():
    env = Environment()
    env.filters.update({
        "image_url": f_image_url, "img_url": f_image_url, "asset_url": lambda v: str(v),
        "escape": f_escape, "money": f_money, "money_with_currency": f_money,
        "newline_to_br": f_newline_to_br, "video_tag": f_video_tag,
        "payment_type_svg_tag": f_payment_type_svg_tag, "t": f_t,
        "handleize": f_handleize, "handle": f_handleize, "image_tag": f_img_tag,
        "stylesheet_tag": lambda v: "", "script_tag": lambda v: "",
    })
    return env

STRIP = [
    (re.compile(r"\{%-?\s*schema\s*-?%\}.*?\{%-?\s*endschema\s*-?%\}", re.S), ""),
    (re.compile(r"\{%-?\s*javascript\s*-?%\}.*?\{%-?\s*endjavascript\s*-?%\}", re.S), ""),
    (re.compile(r"<script\b.*?</script>", re.S | re.I), ""),
]
RE_CSS = re.compile(r"\{%-?\s*stylesheet\s*-?%\}(.*?)\{%-?\s*endstylesheet\s*-?%\}", re.S)

RESERVED = ("cols", "offset", "limit", "range", "reversed")
RE_FORM = re.compile(r"\{%-?\s*form\s+.*?-?%\}", re.S)
RE_ENDFORM = re.compile(r"\{%-?\s*endform\s*-?%\}")

def prep(src):
    css = "\n".join(RE_CSS.findall(src))
    body = RE_CSS.sub("", src)
    for rx, rep in STRIP:
        body = rx.sub(rep, body)
    # {% form %} is a Shopify-only tag; a plain <form> is enough for a preview.
    body = RE_FORM.sub("<form>", body)
    body = RE_ENDFORM.sub("</form>", body)
    for w in RESERVED:
        body = re.sub(r"\.%s\b" % w, "['%s']" % w, body)
    return body, css

_IMGS = [CDN + n for n in ("helios-sg-detail-3.png", "helios-sg-detail-4.png",
                           "helios-sg-detail-6.png", "helios-sg-detail-1.jpg")]
PRODUCT = {
    "title": "HELIOS Super Glide",
    "handle": "helios-super-glide",
    "images": _IMGS,
    "featured_image": _IMGS[0],
    "price": 129900,
    "compare_at_price": 179900,
    "available": True,
    "selected_or_first_available_variant": {
        "id": 42424242, "title": "Default", "price": 129900,
        "compare_at_price": 179900, "available": True, "featured_image": _IMGS[0],
    },
    "variants": [{"id": 1, "title": "Default", "price": 129900, "available": True}],
}

GLOBALS = {
    "shop": {"name": "HELIOS", "url": "https://helios-wins.com", "enabled_payment_types": [],
             "policies": [], "money_format": "${{amount}}"},
    "routes": {"root_url": "/", "cart_url": "/cart", "cart_add_url": "/cart/add",
               "all_products_collection_url": "/collections/all", "search_url": "/search",
               "account_url": "/account", "predictive_search_url": "/search/suggest"},
    "request": {"design_mode": False, "page_type": "index", "locale": {"iso_code": "en"}},
    "cart": {"item_count": 0, "items": [], "total_price": 0},
    "product": PRODUCT, "settings": {}, "template": {"name": "index"},
}

def render_template(tpl_path, title):
    raw = tpl_path.read_text()
    data = json.loads(raw[raw.index("{"):])
    env = build_env()
    css_all, html_all, problems = [], [], []

    for key in data["order"]:
        sec = data["sections"][key]
        stype = sec["type"]
        src_path = ROOT / "sections" / f"{stype}.liquid"
        if not src_path.exists():
            problems.append((key, stype, "section file missing")); continue
        body, css = prep(src_path.read_text())
        css_all.append(f"/* ---- {stype} ---- */\n{css}")

        blocks = [dict(id=bid, type=b.get("type", ""), settings=b.get("settings", {}),
                       shopify_attributes="")
                  for bid, b in ((k, sec.get("blocks", {})[k]) for k in sec.get("block_order", []))]
        ctx = dict(GLOBALS)
        _set = dict(sec.get("settings", {}))
        if isinstance(_set.get("product"), str):
            _set["product"] = PRODUCT if _set["product"] else None
        ctx["section"] = {"id": key, "settings": _set,
                          "blocks": blocks, "index": 0}
        try:
            out = env.from_string(body).render(**ctx)
            html_all.append(f"\n<!-- ===== {key} :: {stype} ===== -->\n" + out)
        except Exception as e:
            problems.append((key, stype, f"{type(e).__name__}: {str(e)[:160]}"))
            html_all.append(f'\n<div style="padding:14px;background:#ffe9e9;border:1px solid #d33;'
                            f'font:13px monospace;color:#900">RENDER FAILED — {stype}: '
                            f'{html.escape(str(e)[:200])}</div>')
    return css_all, html_all, problems, data

def main():
    pages = [("templates/index.json", "Homepage"),
             ("templates/product.helios-super-glide.json", "Product page")]
    parts, all_problems = [], []
    for rel, title in pages:
        css, body, probs, data = render_template(ROOT / rel, title)
        all_problems += [(title,) + p for p in probs]
        parts.append((title, "\n".join(css), "\n".join(body), len(data["order"])))

    doc = ["<!doctype html><html><head><meta charset='utf-8'>",
           "<meta name='viewport' content='width=device-width,initial-scale=1'>",
           "<title>HELIOS — recovered theme preview</title>",
           "<style>body{margin:0}img{max-width:100%}"
           ".pv-bar{position:sticky;top:0;z-index:99999;background:#0b0e11;color:#fff;"
           "font:600 12px/1.4 -apple-system,system-ui,sans-serif;padding:10px 14px;"
           "display:flex;gap:14px;flex-wrap:wrap;align-items:center}"
           ".pv-bar a{color:#7fb1d4;text-decoration:none}"
           ".pv-note{background:#fff8e1;border-bottom:1px solid #e8d9a0;padding:10px 14px;"
           "font:13px/1.5 -apple-system,system-ui,sans-serif;color:#5a4a1a}</style>"]
    for _, css, _, _ in parts:
        doc.append(f"<style>{css}</style>")
    doc.append("</head><body>")
    doc.append("<div class='pv-bar'><b>HELIOS recovered theme — static preview</b>"
               + "".join(f"<a href='#pg{i}'>{t}</a>" for i, (t, _, _, _) in enumerate(parts))
               + "</div>")
    doc.append("<div class='pv-note'>Static render of the recovered Liquid with your real saved "
               "settings. Product data, cart and JS are stubbed, so prices/variants show as "
               "placeholders and buttons do nothing. Images load from the old store's CDN and may "
               "not resolve.</div>")
    for i, (title, _, body, n) in enumerate(parts):
        doc.append(f"<h2 id='pg{i}' style=\"font:700 15px -apple-system,system-ui,sans-serif;"
                   f"background:#eef2f4;margin:0;padding:12px 14px\">{title} — {n} sections</h2>")
        doc.append(body)
    doc.append("</body></html>")
    OUT.write_text("\n".join(doc))

    print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes)")
    if all_problems:
        print("\nSECTIONS THAT FAILED TO RENDER:")
        for p in all_problems: print("  ", p)
    else:
        print("\nAll sections rendered with no Liquid errors.")

main()
