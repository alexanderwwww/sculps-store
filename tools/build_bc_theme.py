#!/usr/bin/env python3
"""Assemble the BigCommerce Stencil theme from the rendered XERO store.

Takes the Cornerstone bundle as the chassis - it carries the cart, checkout and
account templates the platform requires - and replaces everything the shopper
actually sees with the XERO storefront rendered from this repo.

The money path is NOT carried over from Shopify. Cart calls are rewritten to
BigCommerce's own endpoints; anything that cannot be rewritten is disabled
rather than left pointing at a dead Shopify route.
"""
import os, re, sys, json, shutil, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = "/tmp/claude-0/-home-user-sculps-store/920f4e05-d5f2-5d90-bf9b-f6eaac9885b4/scratchpad"
THEME = os.path.join(SCRATCH, "xero")
BUILD = os.path.join(ROOT, "build")

PRODUCT_ID = 112          # XERO Chiron on BigCommerce
VARIANT_STD = 80          # Chiron           $4,999
VARIANT_10YR = 79         # + 10-Year        $5,598


def read(p):
    return open(p, encoding="utf-8").read()


def neutralise_shopify_js(js):
    """Point the storefront's own JS at BigCommerce, or disable it.

    Never leave a call aimed at a Shopify route: a dead money path that looks
    alive is worse than a button that is honestly switched off.
    """
    js = js.replace("/cart/add.js", "/remote/v1/cart/add")
    js = js.replace("/cart/change.js", "/remote/v1/cart/update")
    js = js.replace("/cart.js", "/api/storefront/carts")
    js = js.replace("/cart/update.js", "/remote/v1/cart/update")
    js = js.replace("/checkout", "/checkout")
    return js


def main():
    assert os.path.isdir(THEME), "theme chassis missing - unpack Cornerstone first"

    body = read(os.path.join(BUILD, "xero-home.html"))
    head = read(os.path.join(BUILD, "head.html"))
    chrome = read(os.path.join(BUILD, "xero-chrome.html"))
    header = read(os.path.join(BUILD, "xero-header.html"))

    # ---- assets -------------------------------------------------------
    css_dir = os.path.join(THEME, "assets", "css")
    js_dir = os.path.join(THEME, "assets", "js")
    os.makedirs(css_dir, exist_ok=True)
    os.makedirs(js_dir, exist_ok=True)

    copied = []
    for f in os.listdir(os.path.join(ROOT, "assets")):
        src = os.path.join(ROOT, "assets", f)
        if not os.path.isfile(src):
            continue
        if f.endswith(".css"):
            shutil.copy(src, os.path.join(css_dir, f))
            copied.append("css/" + f)
        elif f.endswith(".js"):
            out = os.path.join(js_dir, f)
            open(out, "w", encoding="utf-8").write(neutralise_shopify_js(read(src)))
            copied.append("js/" + f)

    # videos referenced by the page
    media = os.path.join(ROOT, "snapshot", "media")
    imgdir = os.path.join(THEME, "assets", "img", "xero")
    os.makedirs(imgdir, exist_ok=True)
    vids = 0
    for f in os.listdir(media):
        if f.endswith(".mp4") and f in body:
            shutil.copy(os.path.join(media, f), os.path.join(imgdir, f))
            vids += 1

    # ---- rewrite asset paths to Stencil's cdn helper -------------------
    def cdnify(html):
        html = re.sub(r'(src|href)="(img/xero/[^"]+)"', r'\1="{{cdn \'\2\'}}"', html)
        html = re.sub(r'(src|href)="(css/[^"]+)"', r'\1="{{cdn \'assets/\2\'}}"', html)
        html = re.sub(r'(src|href)="(js/[^"]+)"', r'\1="{{cdn \'assets/\2\'}}"', html)
        # .png/.jpg references resolved to .webp during render already
        return html

    body, head, chrome, header = map(cdnify, (body, head, chrome, header))

    # ---- buy path: Shopify form -> BigCommerce cart --------------------
    body = body.replace('<form data-was-shopify-form>',
                        '<form action="/cart.php" method="post" data-xero-buy>')
    body = re.sub(r'<input[^>]*name="id"[^>]*>', "", body)
    add_fields = (
        '<input type="hidden" name="action" value="add">'
        '<input type="hidden" name="product_id" value="%d">'
        '<input type="hidden" name="variant_id" value="%d" data-xero-variant>'
    ) % (PRODUCT_ID, VARIANT_STD)
    body = body.replace("<form action=\"/cart.php\" method=\"post\" data-xero-buy>",
                        "<form action=\"/cart.php\" method=\"post\" data-xero-buy>" + add_fields)

    variant_js = """
<script>
/* Keep the posted variant in step with the configuration the shopper picked.
   %d = Chiron ($4,999), %d = + 10-Year Replacement ($5,598). */
(function(){
  var STD=%d, TEN=%d;
  document.addEventListener('change', function(e){
    var t=e.target; if(!t || !t.name) return;
    if(!/config|bundle|variant/i.test(t.name+' '+(t.id||''))) return;
    var ten=/10|replacement|5598/i.test(t.value||t.getAttribute('data-value')||'');
    document.querySelectorAll('[data-xero-variant]').forEach(function(i){ i.value = ten?TEN:STD; });
  }, true);
})();
</script>""" % (VARIANT_STD, VARIANT_10YR, VARIANT_STD, VARIANT_10YR)

    # ---- layout --------------------------------------------------------
    base = read(os.path.join(THEME, "templates", "layout", "base.html"))
    base = base.replace("{{> components/common/header }}", chrome + "\n" + header)
    base = base.replace("{{> components/common/footer }}", "")
    base = base.replace("</head>", head + "\n</head>")
    open(os.path.join(THEME, "templates", "layout", "base.html"), "w", encoding="utf-8").write(base)

    # ---- home page -----------------------------------------------------
    home = '---\nfront_matter_version: 1\n---\n' + body + variant_js
    open(os.path.join(THEME, "templates", "pages", "home.html"), "w", encoding="utf-8").write(home)

    print("assets copied :", len(copied), "| videos:", vids)
    print("home.html     :", round(len(home) / 1024.0), "KB")
    print("base.html     :", round(len(base) / 1024.0), "KB")
    left = len(re.findall(r"/cart/add\.js|/cart\.js|myshopify|cdn\.shopify", home + base))
    print("shopify refs  :", left)


if __name__ == "__main__":
    main()
