const { chromium } = require('/home/user/sculps-store/node_modules/playwright');
const fs = require('fs'), path = require('path');
const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), dir = __dirname;
const img = (f) => 'data:image/' + (f.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
const esc = (s) => String(s).replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
const field = (k, v) => `<div class="f"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:1280px 1600px;margin:0}html,body{margin:0;background:#fff}
.page{width:1280px;height:1600px;box-sizing:border-box;padding:28px;position:relative}
.frame{position:absolute;inset:28px;border:2px solid #222}.inner{position:absolute;inset:44px;border:1px solid #ddd}
.logo{position:absolute;top:70px;left:50%;transform:translateX(-50%);width:640px}
h1{position:absolute;top:268px;width:100%;text-align:center;margin:0;font:400 46px 'Times New Roman',Times,serif;letter-spacing:.5px;color:#111}
.rule{position:absolute;top:370px;left:120px;right:120px;border-top:1px solid #ddd}
.left{position:absolute;top:410px;left:120px;width:600px}.f{margin-bottom:58px}
.k{font:400 17px Helvetica,Arial,sans-serif;letter-spacing:1.2px;color:#777;text-transform:uppercase;margin-bottom:22px}
.v{font:400 29px 'Times New Roman',Times,serif;color:#111;line-height:1.45}
.photo{position:absolute;top:440px;left:800px;width:360px;height:360px;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;background:#fff}
.photo img{max-width:330px;max-height:330px}
.insp{position:absolute;top:855px;left:800px}.iss{position:absolute;top:1120px;left:800px}
.sig{position:absolute;top:1160px;left:170px;width:320px}.sigline{position:absolute;top:1316px;left:120px;width:480px;border-top:1.5px solid #333}
.siglab{position:absolute;top:1346px;left:120px;font:400 17px Helvetica,Arial,sans-serif;letter-spacing:1.2px;color:#777}
.seal{position:absolute;top:1210px;left:905px;width:205px}
.foot{position:absolute;top:1430px;left:120px;right:120px;border-top:1px solid #ddd;padding-top:22px;text-align:center;font:400 19px Helvetica,Arial,sans-serif;color:#555;line-height:2}
</style></head><body><div class="page"><div class="frame"></div><div class="inner"></div>
<img class="logo" src="${img('logo.png')}"><h1>CERTIFICATE OF AUTHENTICITY</h1><div class="rule"></div>
<div class="left">${field('Item', c.title)}${field('Category', c.category)}${field('Material', c.material)}${field('Hallmarks', c.hallmarks)}${field('Condition', c.condition)}</div>
<div class="photo"><img src="${img(c.photo)}"></div>
<div class="insp">${field('Inspected by', c.inspector)}</div><div class="iss">${field('Issued by', c.issuedBy)}</div>
<img class="sig" src="${img('sig.png')}"><div class="sigline"></div><div class="siglab">SIGNATURE</div>
<img class="seal" src="${img('seal.png')}">
<div class="foot">Inspected and authenticated by Mysterious Archive.<br>Independent certificate; not issued by the manufacturer.</div>
</div></body></html>`;
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 1600 } }); await p.setContent(html, { waitUntil: 'load' });
  await p.screenshot({ path: path.join(dir, c.out + '.png') }); await p.pdf({ path: path.join(dir, c.out + '.pdf'), width: '1280px', height: '1600px', printBackground: true });
  await b.close(); console.log('ok', c.out); })();
