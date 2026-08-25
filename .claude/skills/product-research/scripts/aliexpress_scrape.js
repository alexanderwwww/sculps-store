// AliExpress supplier scrape — run inside Higgsfield sandbox_exec.
// Node + Playwright preinstalled at /usr/local/lib/node_modules/playwright.
// Usage inside sandbox:
//   node aliexpress_scrape.js "bird feeder camera" "robot window cleaner" ...
// Writes ali.json: { term: [ {title, price, sold, href} ] }
// Sorted by total orders (SortType=total_tranpro_desc) so top demand surfaces.
// Run backgrounded for many terms (each ~4s) and poll ali.json.

const { chromium } = require('/usr/local/lib/node_modules/playwright');
const fs = require('fs');
const terms = process.argv.slice(2);
if (!terms.length) { console.error('pass search terms as args'); process.exit(1); }

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    viewport: { width: 1440, height: 1200 }, locale: 'en-US'
  });
  const page = await ctx.newPage();
  const out = {};
  for (const t of terms) {
    try {
      const url = 'https://www.aliexpress.us/w/wholesale-' +
        encodeURIComponent(t).replace(/%20/g, '-') + '.html?SortType=total_tranpro_desc';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(3500);
      await page.mouse.wheel(0, 2500); await page.waitForTimeout(1500);
      out[t] = await page.evaluate(() => {
        const o = [], seen = new Set();
        document.querySelectorAll('a[href*="/item/"]').forEach(a => {
          let box = a;
          for (let i = 0; i < 7; i++) { box = box.parentElement; if (box && /\$|sold|orders/i.test(box.innerText || '')) break; }
          if (!box) return;
          const txt = box.innerText || '';
          const price = (txt.match(/\$\s?[\d,]+\.?\d*/) || [])[0] || '';
          const sold = (txt.match(/([\d,]+\+?)\s*(sold|orders)/i) || [])[0] || '';
          const title = (txt.split('\n').find(l => l.length > 18) || '').slice(0, 80);
          const href = (a.getAttribute('href') || '').split('?')[0];
          if (!price || !title) return;
          const k = title.slice(0, 30); if (seen.has(k)) return; seen.add(k);
          o.push({ title, price, sold, href: href.startsWith('//') ? 'https:' + href : href });
        });
        return o.slice(0, 6);
      });
      fs.writeFileSync('/home/user/ali.json', JSON.stringify(out, null, 1)); // checkpoint
    } catch (e) { out[t] = [{ err: String(e).slice(0, 60) }]; }
  }
  fs.writeFileSync('/home/user/ali.json', JSON.stringify(out, null, 1));
  await b.close();
  console.log('ALIDONE ' + Object.keys(out).length);
})().catch(e => { fs.writeFileSync('/home/user/err.txt', String(e)); console.log('FAIL'); });
