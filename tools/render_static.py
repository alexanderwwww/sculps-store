#!/usr/bin/env python3
"""Render the live Shopify home page to static HTML for a non-Shopify host.

Reads snapshot/index.json.live (the section order and the owner's real editor
settings) plus sections/*.liquid, and renders each section with a Liquid engine
so the output is the page as it actually shipped - not a hand transcription.

Shopify-only objects (product, cart, form, routes) are stubbed: the money path
is rebuilt on the target platform, never copied.
"""
import json, re, os, sys
from liquid import Environment
from liquid import Markup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_PREFIX = "img/xero/"

# ---------------------------------------------------------------- filters

def image_url(val, **kw):
    """shopify://shop_images/NAME.png -> img/xero/NAME.webp"""
    if not val:
        return ""
    s = str(val)
    name = s.split("/")[-1].split("?")[0]
    stem = os.path.splitext(name)[0]
    return IMG_PREFIX + stem + ".webp"

def asset_url(val, **kw):
    """Route by extension: Stencil keeps css/js/img in separate asset trees."""
    if not val:
        return ""
    name = str(val).split("/")[-1].split("?")[0]
    ext = os.path.splitext(name)[1].lower()
    if ext == ".css":
        return "css/" + name
    if ext in (".js", ".mjs"):
        return "js/" + name
    if ext in (".mp4", ".webm", ".mov"):
        return IMG_PREFIX + name
    return IMG_PREFIX + name

def file_url(val, **kw):
    return asset_url(val)

def img_tag(val, alt="", **kw):
    return Markup('<img src="%s" alt="%s" loading="lazy">' % (val, alt))

def script_tag(val, **kw):
    return Markup('<script src="%s" defer></script>' % val)

def stylesheet_tag(val, **kw):
    return Markup('<link rel="stylesheet" href="%s">' % val)

def money(val, **kw):
    try:
        return "$%s" % format(float(val) / 100.0, ",.2f").rstrip("0").rstrip(".")
    except Exception:
        return str(val)

def handleize(val, **kw):
    return re.sub(r"[^a-z0-9]+", "-", str(val).lower()).strip("-")

def placeholder_svg_tag(val, cls="", **kw):
    return Markup("")

def noop(val, *a, **kw):
    return val

def video_tag(val, **kw):
    """Shopify video object -> plain <video> pointing at the archived file."""
    src = ""
    if isinstance(val, str):
        src = asset_url(val)
    elif isinstance(val, dict):
        srcs = val.get("sources") or []
        if srcs:
            src = asset_url(srcs[0].get("url", ""))
    attrs = " ".join(
        k.replace("_", "-") for k, v in kw.items()
        if v is True and k not in ("image_size", "class")
    )
    cls = kw.get("class", "")
    return Markup('<video src="%s" class="%s" %s playsinline></video>' % (src, cls, attrs))

def default_filter(val, fallback="", **kw):
    """Shopify's default:, tolerant of the trailing kwargs sections pass it."""
    if val is None or val == "" or val is False:
        return fallback
    return val

# ---------------------------------------------------------------- stubs

class Undef(dict):
    """Anything Shopify-side we deliberately do not carry over."""
    def __getattr__(self, k):
        # dunders must stay missing, or the engine's protocol probes
        # (__liquid__, __html__) resolve to a non-callable and blow up
        if k.startswith("__") and k.endswith("__"):
            raise AttributeError(k)
        return Undef()
    def __getitem__(self, k):
        return Undef()
    def __str__(self):
        return ""
    def __bool__(self):
        return False
    def __iter__(self):
        return iter(())

def strip_schema(src):
    src = re.sub(r"\{%-?\s*schema\s*-?%\}.*?\{%-?\s*endschema\s*-?%\}", "", src, flags=re.S)
    # {% style %} / {% stylesheet %} carry plain CSS - unwrap, keep the CSS
    src = re.sub(r"\{%-?\s*(style|stylesheet)\s*-?%\}", "<style>", src)
    src = re.sub(r"\{%-?\s*end(style|stylesheet)\s*-?%\}", "</style>", src)
    src = re.sub(r"\{%-?\s*(javascript)\s*-?%\}", "<script>", src)
    src = re.sub(r"\{%-?\s*end(javascript)\s*-?%\}", "</script>", src)
    # {% form %} is Shopify's money/account path. It is never carried over -
    # the target platform's own form replaces it. Unwrap to a plain element so
    # the markup inside (which is ours) still renders.
    src = re.sub(r"\{%-?\s*form\s+[^%]*?-?%\}", '<form data-was-shopify-form>', src)
    src = re.sub(r"\{%-?\s*endform\s*-?%\}", "</form>", src)
    # {% section 'x' %} in the layout -> render the section file in place
    src = re.sub(r"\{%-?\s*section\s+'([^']+)'\s*-?%\}", r"{% render '\1' %}", src)
    return src


class SnippetLoader:
    """Serve sections/ and snippets/ to {% render %} and {% include %}."""
    def __init__(self, root):
        self.root = root

    def get_source(self, env, name, **kw):
        from liquid.loader import TemplateSource
        for d in ("snippets", "sections"):
            p = os.path.join(self.root, d, name + ".liquid")
            if os.path.exists(p):
                return TemplateSource(strip_schema(open(p).read()), name, None)
        return TemplateSource("", name, None)

    async def get_source_async(self, env, name, **kw):
        return self.get_source(env, name, **kw)

    def load(self, env, name, **kw):
        src = self.get_source(env, name, **kw)
        return env.from_string(src.text if hasattr(src, "text") else src.source, name=name)

    async def load_async(self, env, name, **kw):
        return self.load(env, name, **kw)


def build_env():
    env = Environment(loader=SnippetLoader(ROOT))
    for name, fn in [
        ("video_tag", video_tag), ("default", default_filter),
        ("image_url", image_url), ("asset_url", asset_url), ("file_url", file_url),
        ("asset_img_url", image_url), ("img_url", image_url),
        ("image_tag", img_tag), ("script_tag", script_tag),
        ("stylesheet_tag", stylesheet_tag), ("money", money),
        ("money_with_currency", money), ("handleize", handleize), ("handle", handleize),
        ("placeholder_svg_tag", placeholder_svg_tag), ("payment_button", noop),
        ("payment_terms", noop), ("global_asset_url", asset_url),
        ("shopify_asset_url", asset_url), ("t", noop), ("json", noop),
        ("within", noop), ("link_to", noop), ("weight_with_unit", noop),
        ("metafield_tag", noop), ("metafield_text", noop),
    ]:
        try:
            env.filters[name] = fn
        except Exception:
            pass
    return env


def main():
    raw = re.sub(r"/\*.*?\*/", "", open(os.path.join(ROOT, "snapshot/index.json.live")).read(), flags=re.S)
    live = json.loads(raw)
    order = live.get("order", [])
    sections = live.get("sections", {})

    skip = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else set()

    env = build_env()
    out_parts, report = [], []

    for key in order:
        conf = sections.get(key, {})
        stype = conf.get("type")
        if not stype or stype in skip:
            report.append((key, stype, "SKIPPED"))
            continue
        path = os.path.join(ROOT, "sections", stype + ".liquid")
        if not os.path.exists(path):
            report.append((key, stype, "NO FILE"))
            continue
        src = strip_schema(open(path).read())

        blocks = []
        bconf = conf.get("blocks") or {}
        border = conf.get("block_order") or list(bconf.keys())
        for i, bk in enumerate(border):
            b = bconf.get(bk, {})
            blocks.append({
                "id": bk, "type": b.get("type", ""),
                "settings": b.get("settings", {}),
                "shopify_attributes": "",
            })

        ctx = {
            "section": {
                "id": key, "settings": conf.get("settings", {}),
                "blocks": blocks, "blocks_count": len(blocks),
                "index": 1, "index0": 0, "location": "template",
            },
            "settings": {}, "shop": {"name": "XERO", "url": ""},
            "product": Undef(), "collections": Undef(), "all_products": Undef(),
            "cart": Undef(), "customer": Undef(), "routes": {
                "cart_url": "/cart.php", "root_url": "/", "search_url": "/search.php",
                "cart_add_url": "/cart.php", "account_url": "/login.php",
            },
            "request": {"design_mode": False, "page_type": "index", "path": "/"},
            "template": "index", "content_for_header": "", "images": Undef(),
            "linklists": Undef(), "pages": Undef(), "blogs": Undef(),
            "forloop": Undef(), "block": Undef(),
        }
        try:
            html = env.from_string(src).render(**ctx)
            leftovers = len(re.findall(r"\{\{|\{%", html))
            # Shopify's platform - not the theme - wrapped every section in
            # <div id="shopify-section-KEY" class="shopify-section">. Several
            # sections style themselves through that id, so the wrapper has to
            # be recreated or those rules match nothing.
            wrapped = '<div id="shopify-section-%s" class="shopify-section">%s</div>' % (key, html)
            out_parts.append("\n<!-- ===== %s (%s) ===== -->\n" % (key, stype) + wrapped)
            report.append((key, stype, "OK %d chars%s" % (len(html), (" LEFTOVER:%d" % leftovers) if leftovers else "")))
        except Exception as e:
            report.append((key, stype, "ERROR " + type(e).__name__ + ": " + str(e)[:120]))

    body = "\n".join(out_parts)
    outp = os.path.join(ROOT, "build/xero-home.html")
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    open(outp, "w").write(body)

    print("%-22s %-20s %s" % ("KEY", "TYPE", "RESULT"))
    for r in report:
        print("%-22s %-20s %s" % r)
    print("\nwrote %s (%.0f KB)" % (outp, len(body) / 1024.0))


if __name__ == "__main__":
    main()
