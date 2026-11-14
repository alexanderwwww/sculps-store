#!/usr/bin/env node
// WHAT IF shorts, made entirely from code. No AI video, no paid API.
//   node tools/whatif/make.mjs <script.json> [--stills 0.5,4,9] [--workers 3] [--skip-facts] [--keep]
// Steps: fact check (fetch every source, find the quote) -> voice (piper) + word timings
// (faster-whisper) -> frames (three.js in headless Chromium, t = frame/30) -> audio bed
// and sfx (ffmpeg synth) -> captions are drawn into the frames -> H.264 1080x1920 30 fps.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2); const scriptPath = path.resolve(args.find(a => !a.startsWith('--') && a.endsWith('.json')) || '');
const opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
if (!fs.existsSync(scriptPath)) { console.error('usage: node tools/whatif/make.mjs <script.json>'); process.exit(1); }
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const FPS = 30; const id = script.id || path.basename(path.dirname(scriptPath));
const work = path.resolve(opt('work') || path.join(HERE, 'out', id)); const framesDir = path.join(work, 'frames');
const outMp4 = path.resolve(opt('out') || path.join(HERE, 'out', id + '.mp4'));
fs.mkdirSync(framesDir, { recursive: true });
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, ...o })?.toString() ?? '';

// ---- 1. fact check: every fact needs a source page that contains its quote ----
if (!opt('skip-facts')) {
  const norm = s => s.toLowerCase().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;|’/g, "'").replace(/&quot;|“|”/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;|\s+/g, ' ');
  const pages = {}; let bad = 0;
  for (const [i, l] of script.lines.entries()) for (const f of l.facts || []) {
    if (!pages[f.source]) { try { pages[f.source] = norm(sh('curl', ['-sL', '--max-time', '30', '-A', 'Mozilla/5.0 (X11; Linux x86_64)', f.source])); } catch { pages[f.source] = ''; } }
    for (const q of [f.quote, f.quote2].filter(Boolean)) { const ok = pages[f.source].includes(norm(q)); if (!ok) bad++; log(`fact line ${i + 1}: ${ok ? 'OK ' : 'NOT FOUND'} "${q.slice(0, 70)}" <- ${f.source}`); }
  }
  if (bad) { console.error(`${bad} fact quote(s) not found on their source page. Fix script.json or pass --skip-facts.`); process.exit(2); }
}

// ---- 2. voice + word timings ----
const model = path.join(HERE, 'models', (script.voice?.model || 'en_US-lessac-medium') + '.onnx');
if (!fs.existsSync(model)) { console.error(`voice model missing: ${model}\nget it from huggingface.co/rhasspy/piper-voices (onnx + onnx.json)`); process.exit(3); }
const timingPath = path.join(work, 'timing.json');
if (!(opt('keep') && fs.existsSync(timingPath))) { log('voice…'); sh('python3.13', [path.join(HERE, 'lib/voice.py'), scriptPath, work, model], { stdio: 'inherit' }); sh('python3', [path.join(HERE, 'lib/words.py'), work], { stdio: 'inherit' }); }
const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
const dur = timing.duration, nFrames = Math.ceil(dur * FPS);
log(`duration ${dur.toFixed(2)}s, ${nFrames} frames`);

// ---- 3. frames ----
const server = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}/tools/whatif/scene/page.html`;
const sceneScript = { ...script, scene: script.scene };
async function renderTimes(list, tag) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } }); page.on('pageerror', e => console.error('page error:', e.message)); page.on('console', m => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(base); await page.waitForFunction('window.ready === true'); await page.evaluate(([s, t]) => window.setup(s, t), [sceneScript, timing]);
  for (const [i, t, file] of list) { const url = await page.evaluate(t => window.frame(t), t); fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); if (i % 150 === 0) log(`${tag} frame ${i}`); }
  await browser.close();
}
const stills = opt('stills');
if (stills) {
  const ts = (stills === true ? '0.5' : stills).split(',').map(Number); const dir = opt('stills-dir') || work;
  await renderTimes(ts.map((t, i) => [i, t, path.join(dir, `still_${t.toFixed(2)}.jpg`)]), 'still'); server.close(); log('stills in', dir); process.exit(0);
}
const workers = Number(opt('workers') || 3); const all = [...Array(nFrames).keys()].map(i => [i, i / FPS, path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`)]);
const todo = opt('keep') ? all.filter(([, , f]) => !fs.existsSync(f)) : all;
log(`rendering ${todo.length} frames with ${workers} workers…`); const tR = Date.now();
await Promise.all([...Array(workers).keys()].map(w => renderTimes(todo.filter((_, j) => j % workers === w), 'w' + w)));
server.close(); const renderSec = (Date.now() - tR) / 1000; log(`frames done in ${renderSec.toFixed(0)}s`);

// ---- 4. audio: bed + sfx + voice ----
const sfxDir = path.join(work, 'sfx'); fs.mkdirSync(sfxDir, { recursive: true });
const ff = a => sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a]);
const bed = path.join(sfxDir, 'bed.wav'), whoosh = path.join(sfxDir, 'whoosh.wav'), impact = path.join(sfxDir, 'impact.wav');
ff(['-f', 'lavfi', '-i', `aevalsrc='0.10*(sin(2*PI*110*t)+0.8*sin(2*PI*164.81*t)+0.6*sin(2*PI*220*t)+0.5*sin(2*PI*277.18*t+sin(2*PI*0.2*t)))*(0.75+0.25*sin(2*PI*0.25*t))':s=44100:d=${dur}`,
  '-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*(48+70*exp(-mod(t,0.6)*28))*mod(t,0.6))*exp(-mod(t,0.6)*8)':s=44100:d=${dur}`,
  '-f', 'lavfi', '-i', `anoisesrc=c=pink:a=0.03:d=${dur}:r=44100`,
  '-filter_complex', `[0]lowpass=f=1400,aecho=0.6:0.5:180|360:0.3|0.2[p];[1]lowpass=f=200,volume=0.8[k];[2]lowpass=f=900[n];[p][k][n]amix=inputs=3:normalize=0,afade=t=in:d=0.4,afade=t=out:st=${dur - 1.5}:d=1.5,volume=0.9`, '-ac', '2', bed]);
ff(['-f', 'lavfi', '-i', 'anoisesrc=c=white:a=0.6:d=0.9:r=44100', '-af', "bandpass=f=1200:w=900,volume='0.2+1.4*sin(PI*t/0.9)':eval=frame,afade=t=in:d=0.35,afade=t=out:st=0.45:d=0.45", '-ac', '2', whoosh]);
ff(['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(40+90*exp(-t*18))*t)*exp(-t*5)':s=44100:d=1.4", '-f', 'lavfi', '-i', 'anoisesrc=c=brown:a=0.5:d=0.35:r=44100',
  '-filter_complex', '[1]afade=t=out:st=0:d=0.3,lowpass=f=600[n];[0][n]amix=inputs=2:normalize=0', '-ac', '2', impact]);
const hits = []; script.lines.forEach((l, i) => { const st = timing.lines[i].start; (l.sfx || '').split('+').filter(Boolean).forEach(s => hits.push(s === 'whoosh' ? [whoosh, Math.max(0, st - .45)] : [impact, Math.max(0, st - .05)])); });
const inputs = ['-i', path.join(work, 'voice.wav'), '-i', bed, ...hits.flatMap(([f]) => ['-i', f])];
const fx = hits.map(([, d], i) => `[${i + 2}]adelay=${Math.round(d * 1000)}|${Math.round(d * 1000)},volume=0.55[s${i}]`).join(';');
const mixIn = hits.map((_, i) => `[s${i}]`).join('');
const audio = path.join(work, 'mix.wav');
ff([...inputs, '-filter_complex', `[0]aformat=channel_layouts=stereo,aresample=44100,highpass=f=80,acompressor=threshold=-18dB:ratio=3,volume=1.6,asplit[v][vk];[1][vk]sidechaincompress=threshold=0.03:ratio=6:release=300[b];${fx}${fx ? ';' : ''}[v][b]${mixIn}amix=inputs=${2 + hits.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9`, '-ar', '44100', audio]);
log('audio mixed');

// ---- 5. encode ----
fs.mkdirSync(path.dirname(outMp4), { recursive: true });
ff(['-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.jpg'), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outMp4]);
const probe = sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate,codec_name', '-of', 'json', outMp4]);
fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify({ out: outMp4, duration: dur, frames: nFrames, renderSec, totalSec: (Date.now() - T0) / 1000, probe: JSON.parse(probe) }, null, 1));
log('done ->', outMp4); console.log(probe);
