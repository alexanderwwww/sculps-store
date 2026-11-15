// node tools/whatif/scene/styles/v3-render.mjs <outdir> stills A,B,C,D
// node tools/whatif/scene/styles/v3-render.mjs <outdir> motion A
import { createRequire } from 'module'; import http from 'http'; import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const [out, mode, ids = 'A,B,C,D'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const server = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}/tools/whatif/scene/styles/v3-page.html`;
const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
async function open(id) { const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } }); page.on('pageerror', e => console.error('page error:', e.message)); page.on('console', m => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(base); await page.waitForFunction('window.ready === true'); await page.evaluate(id => window.setup(id), id); return { browser, page }; }
if (mode === 'stills') for (const id of ids.split(',')) { const { browser, page } = await open(id); for (const cam of ['wide', 'hero']) { const t0 = Date.now(); save(path.join(out, `${id}-${cam}.jpg`), await page.evaluate(([c]) => window.frame(1.3, c), [cam])); console.log(id, cam, Date.now() - t0, 'ms'); } await browser.close(); }
if (mode === 'motion') { const id = ids; const { browser, page } = await open(id); const dir = path.join(out, 'motion-' + id); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 90; i++) { const t = i / 30; const u = t / 3, z = -1.4 + u * 2.6, x = -.9 + u * 1.1;
    const cam = { pos: [lerp(3.2, 1.6, u), lerp(1.3, 1.6, u), lerp(6.0, 6.4, u) ], look: [x * .7, 1.45, z * .8], fov: 38, hero: { x, z, ry: .4 - u * .2, walk: 1, look: 0 } };
    save(path.join(dir, `f${String(i).padStart(3, '0')}.jpg`), await page.evaluate(([t, c]) => window.frame(t, c), [t, cam])); if (i % 15 === 0) console.log('frame', i); }
  await browser.close(); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%03d.jpg'), '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, `motion-${id}.mp4`)]); }
function lerp(a, b, t) { return a + (b - a) * t; }
server.close();
