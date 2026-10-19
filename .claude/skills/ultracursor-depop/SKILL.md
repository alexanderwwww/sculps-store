---
name: ultracursor-depop
description: Fast playbook for listing on Depop (chromejesus) by driving ultracursor through the MCP link. Use whenever Alex says "list this" on Depop.
---
# Listing on Depop through ultracursor, fast

Shop: depop.com/chromejesus ("Chrome Jesus"), US account, 0% selling fee. Messages are signed "Alexander".
Tools: mcp__ultracursor__ultra_status, ultra_act, ultra_result (load them with ToolSearch).

## Before starting
1. Call ultra_status and check it says "connected".
2. Get the photos as flat public URLs. Upload them to R2 at `blackreaper.us/media/<name>.jpg`. Subfolder paths return 404.
3. You need four things from Alex: item, size, condition, price. If one is missing, ask once in one line. Never save a draft (Alex, 2026-10-19: "never save as draft just post").

## Steps (about 15 actions)
1. navigate https://www.depop.com/products/create/
2. upload: the file input with all the photo URLs in one call.
3. type the Description: lowercase title line, the facts line (size in inches and cm, clasp, tags/stamps), then 5 hashtags.
   Depop then auto-fills Brand and Color. Check them.
4. Category: type "Jewelry" (or the right one) and pick Men > Accessories > Jewelry. Then Type (Necklaces, Rings…).
5. Condition: click the combobox. The options are Brand new / Like new / Used - Excellent / Used - Good / Used - Fair.
6. Item price: type with clear:true.
7. Package size: Extra small is under 8 oz (all jewelry).
8. Re-read the whole form with `look`. Worldwide shipping must be OFF unless Alex set a price for it. Source/Age tags must be empty unless he gave them.
9. Click Post (final: publish). After that, read_text and look for "There was a problem listing your product".

## Known problems
- The Type and Condition dropdowns stay open and block clicks. Press Escape, then click.
- After a refused Post, the edit page has shown worldwide shipping turned on at $0 and Vintage/Antique tags we never set. Always re-check before posting again.
- 2026-10-19: a $16,000 22K chain was refused twice. Right after, Depop returned 403 Forbidden ("Sorry, not authorized") on every page. Stop on any 403, end the session with `done`, and do not retry for at least an hour. Fast repeated Post/Update clicks after an error may be what triggers the block.
- One item at a time. Wait about 2 s between posts. Never hammer Post.

## Settled (Alex, 2026-10-19)
- Alex talks to Depop buyers himself. Never offer or build automatic buyer replies.
- He has only a few items. Don't pitch bulk overnight listing.
