// The admin shell. Shop Admin's tokens, base rules and keyframes (src/shopadmin.mjs, copied byte for byte) plus
// mob's components. Light theme only. Pages are drawn by the client app (src/client.mjs) from /ui/data/* JSON.
import { FONT_LINK, BASE_CSS } from "./shopadmin.mjs";
import { LOGO } from "./logo.mjs";
import { app } from "./client.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Section 0 of the spec: the only new tokens, appended to :root.
const MOB_TOKENS = `:root{--yt:#FF0033;--ig:#E1306C;--tt:#000000;--money:#0C5132;--skel:#EBEBEB;--skel-hi:#F7F7F7;--page-in:.18s}
@keyframes kShine{from{background-position:-200px 0}to{background-position:calc(200px + 100%) 0}}
@keyframes kPage{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes kDraw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
@keyframes kGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes kSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.sk,.spin,.draw,.grow,.wcard,.wglow,.wlogo,.wstep-in,.welcome:before,.banner{animation:none !important}}`;

export const CSS = `
body{font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:20px;color:var(--ink);-webkit-font-smoothing:antialiased}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden}
.top{height:56px;flex:none;display:flex;align-items:center;gap:8px;padding:0 16px;background:var(--topbar);color:var(--topbar-ink);position:relative;z-index:50}
.brand{display:flex;align-items:center;gap:9px;flex:none;margin-right:4px}.brand img{width:26px;height:26px;display:block}.brand b{font-weight:650;font-size:13px;color:#fff;letter-spacing:-.01em}
.search{flex:1;display:flex;justify-content:center;min-width:0}.search label{width:100%;max-width:520px;height:32px;border-radius:8px;background:var(--search);color:#B5B5B5;display:flex;align-items:center;gap:8px;padding:0 10px;cursor:text}
.search input{flex:1;min-width:0;border:0;background:transparent;color:#fff;outline:0;font-size:13px}.search input:focus{outline:0}.search input::placeholder{color:#B5B5B5}
.kbd{font-size:11px;border:1px solid #616161;border-radius:5px;padding:0 5px;line-height:16px;color:#B5B5B5}
.switch{position:relative;flex:none}.switch>button{display:flex;align-items:center;gap:8px;height:34px;padding:0 8px 0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);cursor:pointer;color:#fff;font-weight:600}
.switch>button:hover{background:rgba(255,255,255,.12)}.dots{display:flex;gap:3px}
.ham{display:none;width:36px;height:36px;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#fff;place-items:center}
.body{flex:1;display:flex;min-height:0}
.side{width:240px;flex:none;background:var(--side);border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0}
.side nav{padding:12px 12px 4px;display:flex;flex-direction:column;gap:2px;overflow:auto;flex:1}
.nav{display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border-radius:8px;font-weight:550;font-size:13px;color:var(--ink);text-decoration:none;border:0;background:transparent;width:100%;text-align:left;cursor:pointer}
.nav:hover{background:var(--side-hover);text-decoration:none}.nav.on{background:var(--side-active);box-shadow:var(--shadow)}.nav svg{flex:none;color:var(--ink-2)}.nav.on svg{color:var(--ink)}
.nav.sub{height:28px;padding-left:46px;font-weight:450;font-size:12.5px;color:var(--ink-2);position:relative}.nav.sub:before{content:"";position:absolute;left:18px;top:-4px;bottom:50%;width:12px;border-left:1.5px solid var(--border-strong);border-bottom:1.5px solid var(--border-strong);border-bottom-left-radius:6px}.nav.sub.on{color:var(--ink);font-weight:550}.nav .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{min-width:22px;height:20px;padding:0 6px;border-radius:6px;background:var(--b-neutral-bg);font-size:12px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
.livedot{width:7px;height:7px;border-radius:50%;background:#22C55E;animation:kPulse 1.6s ease-out infinite;flex:none;display:inline-block}
.slabel{font-size:12px;font-weight:600;color:var(--ink-2);padding:14px 10px 4px}.num{font-variant-numeric:tabular-nums}
.side .foot{padding:8px 12px 12px;border-top:1px solid var(--border)}.build{font-size:11px;color:var(--ink-3);padding:2px 10px 0}
main{flex:1;min-width:0;overflow:auto;padding:20px 24px 40px}
.page{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:16px;animation:kPage var(--page-in) ease-out}
.ph{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.ph h1{font-size:20px;line-height:28px;font-weight:650;margin:0;flex:1;display:flex;align-items:center;gap:10px;min-width:0}
.ph .sub{font-size:13px;font-weight:450;color:var(--ink-2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:12px;font-weight:550;box-shadow:var(--shadow);cursor:pointer;white-space:nowrap;color:var(--ink);text-decoration:none}
.btn:hover{background:var(--hover);text-decoration:none}.btn.pri{border:0;background:var(--accent);color:var(--accent-ink);font-weight:600;height:32px;padding:0 14px}.btn.pri:hover{background:var(--accent-hover)}
.btn.sm{height:28px}.btn.danger{color:var(--critical)}.btn.big{height:44px;width:100%;font-size:14px;justify-content:flex-start;gap:12px;padding:0 12px}.btn[disabled]{opacity:.5;cursor:default}
.link{border:0;background:none;color:var(--link);font-size:12px;font-weight:550;cursor:pointer;padding:0}.link:hover{text-decoration:underline}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}
.ch{padding:12px 16px;font-weight:650;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;min-height:49px}.ch .grow{flex:1}
.cb{padding:14px 16px}.note{font-size:11px;color:var(--ink-3)}.lbl{font-size:12px;font-weight:550;color:var(--ink-2)}.muted{color:var(--ink-2)}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.col{display:flex;flex-direction:column;gap:16px;min-width:0}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}.cell{padding:14px 16px 10px;border-right:1px solid var(--border);min-width:0}.cell:last-child{border-right:0}
.cell .v{font-size:22px;line-height:28px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin-top:4px;display:flex;align-items:baseline;gap:8px;overflow:hidden}
.delta{font-size:12px;font-weight:600}.up{color:var(--success)}.down{color:var(--critical)}.money{color:var(--money)}
.spark{width:100%;height:30px;display:block;margin-top:6px}
.badge{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:8px;font-size:12px;font-weight:550;white-space:nowrap;background:var(--b-neutral-bg);color:var(--b-neutral-fg)}
.badge:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.8}.badge.nodot:before{display:none}
.b-success{background:var(--b-success-bg);color:var(--b-success-fg)}.b-warning{background:var(--b-warning-bg);color:var(--b-warning-fg)}.b-critical{background:var(--b-critical-bg);color:var(--b-critical-fg)}
.b-info{background:var(--b-info-bg);color:var(--b-info-fg)}.b-purple{background:var(--b-purple-bg);color:var(--b-purple-fg)}
.b-anim:before{animation:kPulse 1.6s ease-out infinite}
.spin{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:kSpin .8s linear infinite;flex:none}
.badge.withspin:before{display:none}
.pdot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}.p-youtube{background:var(--yt)}.p-instagram{background:var(--ig)}.p-tiktok{background:var(--tt)}
.tile{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none;color:#fff}.tile.l{width:40px;height:40px;border-radius:10px}
.t-youtube{background:var(--yt)}.t-instagram{background:linear-gradient(45deg,#F58529,var(--ig) 55%,#8134AF)}.t-tiktok{background:var(--tt)}
.row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border);min-height:44px}.row:last-child{border-bottom:0}
.row .t{flex:1;min-width:0}.row .t>b{font-weight:550;display:block}.row .t>span{font-size:12px;color:var(--ink-2);display:flex;align-items:center;gap:6px;min-width:0}
.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button.row{width:100%;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:left;cursor:pointer;font:inherit;color:inherit}button.row:hover{background:var(--hover)}
.tbl .tr{display:grid;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--border);min-height:44px;width:100%;border-left:0;border-right:0;border-top:0;background:transparent;text-align:left;font:inherit;color:inherit}
.tbl .th{min-height:36px;font-size:12px;font-weight:550;color:var(--ink-2);background:var(--surface)}.tbl button.tr{cursor:pointer}.tbl button.tr:hover{background:var(--hover)}
.tbl .tr:last-child{border-bottom:0}.r{text-align:right;font-variant-numeric:tabular-nums}.tbl .tr>.badge{justify-self:start}.tbl .tot{font-weight:650}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow)}
.seg button{height:26px;padding:0 10px;border:0;background:transparent;font-size:12px;font-weight:550;cursor:pointer;color:var(--ink-2)}.seg button+button{border-left:1px solid var(--border)}
.seg button.on{background:var(--bg);color:var(--ink)}
.tog{width:38px;height:22px;border-radius:11px;background:var(--ink-3);border:0;position:relative;cursor:pointer;flex:none;transition:background .18s}
.tog:after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .18s}.tog.on{background:var(--accent)}.tog.on:after{left:18px}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 16px;gap:4px}.empty .ic{width:40px;height:40px;border-radius:10px;background:var(--bg);display:grid;place-items:center;color:var(--ink-3);margin-bottom:6px}
.empty b{font-weight:600}.empty span{color:var(--ink-2)}.empty .btn{margin-top:10px}
.sk{display:block;background:linear-gradient(90deg,var(--skel) 0,var(--skel-hi) 40px,var(--skel) 80px);background-size:200px 100%;animation:kShine 1.2s linear infinite;border-radius:6px}
.sk.t{height:10px;margin:5px 0}.sk.v{height:22px;width:50%;margin-top:6px}.fadein{animation:kFade .15s ease-out}
.chart{position:relative;display:grid;grid-template-columns:44px 1fr;padding:12px 16px 8px}.chart .ax{display:flex;flex-direction:column;justify-content:space-between;height:180px;font-size:11px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.chart svg.plot{width:100%;height:180px;display:block;overflow:visible}.chart .xl{grid-column:2;display:flex;justify-content:space-between;font-size:11px;color:var(--ink-2);margin-top:6px}
.draw{stroke-dasharray:var(--len);animation:kDraw .6s ease-out both}.area{opacity:0;animation:kFade .3s ease-out .6s forwards}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 10px;border-radius:8px;font-size:12px;white-space:nowrap;opacity:0;transition:opacity .1s;z-index:5;font-variant-numeric:tabular-nums}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink-2);padding:0 16px 12px 60px}.legend i{display:inline-block;width:14px;height:2px;background:var(--chart);vertical-align:middle;margin-right:6px}
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.chan{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:14px 16px;display:flex;flex-direction:column;gap:12px;transition:transform .15s,box-shadow .15s;cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%}
.chan:hover{transform:translateY(-1px);box-shadow:var(--shadow-lg)}
.av{position:relative;width:40px;height:40px;flex:none}.av img,.av .ini{width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--bg);display:grid;place-items:center;font-weight:650;color:var(--ink-2)}
.av .pb{position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;border:2px solid #fff}
.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mini div{min-width:0}.mini b{display:block;font-size:15px;font-weight:650;font-variant-numeric:tabular-nums}
.thumb{width:32px;height:56px;border-radius:6px;object-fit:cover;background:#1A1A1A;flex:none;display:block}
.bar{height:6px;border-radius:3px;background:var(--bg);overflow:hidden}.bar i{display:block;height:100%;background:var(--chart);transform-origin:left;animation:kGrow .6s ease-out both}
.clips{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.clip{position:relative;aspect-ratio:9/16;border-radius:12px;border:1px solid var(--border);overflow:hidden;background:#1A1A1A;cursor:pointer;transition:transform .15s;padding:0;display:block;width:100%}
.clip:hover{transform:scale(1.02)}.clip video{width:100%;height:100%;object-fit:cover;display:block}
.clip .ov{position:absolute;inset:auto 0 0 0;padding:28px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.72));color:#fff;text-align:left}
.clip .ov b{font-size:12px;font-weight:550;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:16px}.clip .ov span{font-size:11px;opacity:.8}
.clip .pd{position:absolute;top:8px;right:8px;display:flex;gap:3px}.clip .pd .pdot{border:1.5px solid #fff;width:10px;height:10px}
.clip .ck{position:absolute;top:8px;left:8px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.25);opacity:0;transition:opacity .15s;display:grid;place-items:center;color:#fff}
.clip:hover .ck,.clip.sel .ck{opacity:1}.clip.sel{outline:2px solid var(--focus);outline-offset:1px}.clip.sel .ck{background:var(--focus);border-color:var(--focus)}
.clip .skel{position:absolute;inset:0;border-radius:0}
.dropov{position:fixed;inset:0;z-index:80;background:rgba(241,241,241,.85);border:2px dashed var(--focus);display:none;place-items:center;font-size:15px;font-weight:650;color:var(--focus)}.dropov.on{display:grid}
.savebar{position:fixed;top:0;left:0;right:0;height:56px;background:var(--topbar);color:#fff;display:flex;align-items:center;gap:12px;padding:0 16px;z-index:90;animation:kDrop .18s ease-out}
.savebar .grow{flex:1;font-weight:600}.savebar button{height:32px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}.savebar .o{border:1px solid #616161;background:transparent;color:#fff}.savebar .w{border:0;background:#fff;color:#1A1A1A}
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;display:grid;place-items:center;padding:16px;animation:kFade .12s}
.modal{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--surface);border-radius:14px;box-shadow:var(--shadow-lg);animation:kModal .16s ease-out}
.modal.w{width:min(720px,100%)}.mh{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}.mh b{font-size:15px;font-weight:650;flex:1}
.mb{padding:16px 20px;display:flex;flex-direction:column;gap:12px}.mf{padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px}
.x{width:28px;height:28px;border:0;background:transparent;border-radius:8px;cursor:pointer;display:grid;place-items:center;color:var(--ink-2)}.x:hover{background:var(--hover)}
.fld{display:flex;flex-direction:column;gap:4px}.fld>span{font-size:12px;font-weight:550;color:var(--ink-2)}.hint{font-size:12px;font-weight:450;color:var(--ink-2)}
.in{height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--input-border);background:var(--input);font-size:14px;width:100%}textarea.in{height:auto;padding:8px 12px;resize:vertical}
.mono{font-family:'JetBrains Mono',monospace;font-size:12px}.teststrip{background:var(--bg);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chipb{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:12px;font-weight:550}
.chipb.on{border-color:var(--focus);background:var(--sel);box-shadow:inset 0 0 0 1px var(--focus)}.chipb[disabled]{opacity:.45;cursor:default}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:var(--surface);box-shadow:var(--shadow-lg);z-index:101;display:flex;flex-direction:column;animation:kDrawer .2s ease-out}
.drawer .mb{flex:1;overflow:auto}.tl{display:flex;flex-direction:column;gap:10px;border-left:2px solid var(--border);padding-left:12px}
.toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column-reverse;gap:8px;z-index:200;align-items:center}
.toast{background:#303030;color:#fff;height:40px;border-radius:10px;padding:0 8px 0 16px;display:flex;align-items:center;gap:10px;animation:kFeed .2s ease-out;box-shadow:var(--shadow-lg);white-space:nowrap}
.toast .x{color:#B5B5B5}.toast .x:hover{background:rgba(255,255,255,.1)}.toast .dot{width:8px;height:8px;border-radius:50%;background:var(--critical)}.toast .act{color:#fff;font-weight:600;border:0;background:transparent;cursor:pointer;text-decoration:underline}
.feed{animation:kFeed .3s ease-out}.tint{animation:kTint .8s ease-out}
.pop{position:absolute;top:calc(100% + 6px);right:0;min-width:240px;background:var(--surface);color:var(--ink);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;animation:kPop .14s ease-out;z-index:60}
.pop button,.pop a{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;width:100%;border:0;background:transparent;cursor:pointer;color:var(--ink);font-size:13px;text-align:left}.pop button:hover,.pop a:hover{background:var(--hover);text-decoration:none}
.tabs{display:flex;gap:4px;padding:8px 8px 0;border-bottom:1px solid var(--border);overflow-x:auto}.tabs button{height:32px;padding:0 10px;border:0;background:transparent;font-size:13px;font-weight:550;color:var(--ink-2);cursor:pointer;border-bottom:2px solid transparent;display:flex;gap:6px;align-items:center;white-space:nowrap}
.tabs button.on{color:var(--ink);border-bottom-color:var(--ink)}
.cal{display:grid;grid-template-columns:52px repeat(7,minmax(0,1fr));position:relative}.cal .hd{position:sticky;top:0;background:var(--surface);z-index:3;padding:8px 6px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;text-align:center}
.cal .hd.today{color:var(--focus)}.cal .tm{font-size:11px;color:var(--ink-2);text-align:right;padding-right:8px;height:48px;transform:translateY(-7px);font-variant-numeric:tabular-nums}
.cal .day{position:relative;border-left:1px solid var(--border);background-image:linear-gradient(var(--border) 1px,transparent 1px);background-size:100% 48px}
.ev{position:absolute;left:3px;right:3px;height:22px;border-radius:6px;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--b-neutral-fg);display:flex;align-items:center;gap:5px;padding:0 5px;font-size:11px;font-weight:550;overflow:hidden;cursor:grab;box-shadow:var(--shadow);z-index:2}
.ev.live{border-left-color:var(--success)}.ev.failed{border-left-color:var(--critical)}.ev img,.ev video{width:12px;height:20px;border-radius:2px;object-fit:cover;background:#1A1A1A}
.ev.ghost{opacity:.6;box-shadow:var(--shadow-lg);cursor:grabbing}.nowline{position:absolute;left:0;right:0;height:1px;background:var(--critical);z-index:4}.nowline:before{content:"";position:absolute;left:-4px;top:-3px;width:7px;height:7px;border-radius:50%;background:var(--critical)}
.rail{position:fixed;top:72px;right:16px;bottom:16px;width:280px;background:var(--surface);border-radius:12px;box-shadow:var(--shadow-lg);z-index:70;display:flex;flex-direction:column;animation:kDrawer .2s ease-out;overflow:auto}
.rail .slot{margin:4px 12px;padding:10px 12px;border:1px dashed var(--border-strong);border-radius:10px;font-size:12px}.rail .slot.over{border-color:var(--focus);background:var(--sel)}
.welcome{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);position:relative;overflow:hidden}.wcard{position:relative;width:min(560px,100%);background:var(--surface);border-radius:14px;box-shadow:var(--shadow-lg);overflow:hidden;animation:kRise .42s cubic-bezier(.2,.8,.2,1) both}
.wglow{position:absolute;inset:-20% -10% auto -10%;height:70%;background:radial-gradient(60% 60% at 30% 30%,rgba(41,132,90,.16),transparent 70%),radial-gradient(50% 50% at 75% 20%,rgba(0,91,211,.12),transparent 70%);animation:kDrift 14s ease-in-out infinite alternate;pointer-events:none}
.wlogo{animation:kPopIn .5s .15s cubic-bezier(.2,1.4,.4,1) both}.wstep-in{animation:kStep .32s cubic-bezier(.2,.8,.2,1) both}
@keyframes kRise{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:none}}@keyframes kStep{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes kPopIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}@keyframes kDrift{from{transform:translate3d(-3%,0,0)}to{transform:translate3d(3%,4%,0)}}
@media (max-width:600px){.welcome{place-items:end stretch;padding:0;background:linear-gradient(180deg,var(--topbar) 0%,var(--topbar) 38%,var(--bg) 38%)}.welcome:before{content:"mob";position:absolute;top:calc(env(safe-area-inset-top) + 18vh);left:0;right:0;text-align:center;color:#fff;font-size:44px;font-weight:700;letter-spacing:-.04em;animation:kPopIn .5s cubic-bezier(.2,1.4,.4,1) both}.wglow{display:none}
 .wcard{width:100%;border-radius:22px 22px 0 0;min-height:62vh;padding-bottom:env(safe-area-inset-bottom);animation:kSheet .45s cubic-bezier(.2,.8,.2,1) both}.wbody .btn.pri{height:48px !important}}
@keyframes kSheet{from{transform:translateY(100%)}to{transform:none}}
.banner{display:flex;align-items:center;gap:14px;padding:14px 16px;margin-bottom:16px;animation:kFeed .3s ease-out}.banner .t{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}.banner .t span{color:var(--ink-2);font-size:13px}.banner .bico{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--b-info-bg,#EAF4FF);flex:none}
@media (max-width:600px){.banner{flex-wrap:wrap}.banner .btn{width:100%;justify-content:center}}
.chsub{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sdot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--b-neutral-fg,#8A8A8A)}.sdot.ok{background:var(--success,#29845A)}.sdot.warn{background:#E2A400}
.held{color:var(--ink-2);font-size:11.5px;font-weight:450;white-space:nowrap}.spark.ghost{opacity:.8}.strip.is-empty .v{color:var(--ink-2)}
.steps{display:flex;gap:6px;justify-content:center;padding:16px 0 0}.steps i{width:6px;height:6px;border-radius:3px;background:var(--border);transition:width .2s,background .2s}.steps i.on{width:18px;background:var(--ink)}
.wbody{padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px}.wbody h2{margin:0;font-size:20px;line-height:28px;font-weight:650}.wbody p{margin:0;color:var(--ink-2)}
.check{width:44px;height:44px}.check path{stroke-dasharray:30;animation:kDraw .3s ease-out both;--len:30}
.tabbar{display:none}
.boot{padding:16px;color:var(--ink-2)}
@media (max-width:1100px){.grid2{grid-template-columns:1fr}}
@media (max-width:899px){
 .side{position:fixed;left:0;top:0;bottom:0;width:280px;z-index:120;display:none;animation:kSlide .2s ease-out}.side.open{display:flex}.side .nav{height:40px}
 .shade{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:110;animation:kFade .12s}
 .ham{display:grid}.brand b{display:none}.search label{max-width:none}.kbd{display:none}.switch .nm{display:none}
 main{padding:16px 16px 88px}.cell{border-right:0;border-bottom:1px solid var(--border)}.strip{grid-template-columns:repeat(2,minmax(0,1fr))}
 .strip .cell:nth-child(odd){border-right:1px solid var(--border)}
 .tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;height:56px;background:#fff;border-top:1px solid var(--border);z-index:60}
 .tabbar button{flex:1;border:0;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;font-weight:550;color:var(--ink-2);cursor:pointer;min-height:44px}
 .tabbar button.on{color:var(--ink)}.btn{min-height:36px}.row{min-height:48px}
 .clips{grid-template-columns:repeat(2,minmax(0,1fr))}.rail{display:none}.ph .seg{order:3;width:100%}.ph .seg button{flex:1}
 .toasts{bottom:72px}.wbody .row{flex-wrap:wrap}.wbody .row .t{flex-basis:calc(100% - 40px)}.wbody .row .badge{margin-left:40px}
}`;

const ICON = {
  home: "M3 9.5 10 3l7 6.5V17H12v-4.5H8V17H3z",
};

export function shell({ build, route = "/", boot = "" }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>mob</title><link rel="icon" href="${LOGO}"><link rel="preconnect" href="https://fonts.googleapis.com">
${FONT_LINK}
<style>${BASE_CSS}
${MOB_TOKENS}
${CSS}</style></head>
<body><div id="root" data-build="${esc(build)}" data-route="${esc(route)}" data-logo="${LOGO}"><div class="boot page"><b>mob</b> <span class="note">${esc(build)}</span><p>${esc(boot)}</p></div></div>
<script src="/static/app.js?v=${esc(build)}"></script></body></html>`;
}

export function loginPage(error, build) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mob</title>
<link rel="preconnect" href="https://fonts.googleapis.com">${FONT_LINK}<style>${BASE_CSS}
${MOB_TOKENS}
${CSS}</style></head>
<body><div class="welcome"><form method="post" action="/login" class="wcard" style="width:min(400px,100%)">
<div class="wbody"><div style="display:flex;align-items:center;gap:10px"><span class="tile" style="background:var(--topbar)"><img src="${LOGO}" width="18" height="18" alt=""></span><h2>Sign in to mob</h2></div>
${error ? `<div class="badge b-critical" style="align-self:flex-start">${esc(error)}</div>` : ""}
<label class="fld"><span>Password</span><input class="in" type="password" name="password" autofocus required></label>
<button class="btn pri" style="height:36px">Sign in</button><div class="note">build ${esc(build)}</div></div></form></div></body></html>`;
}

let cached = null;
// Wrangler's bundler (keep_names) wraps inner functions in __name(fn, "x") calls; give the browser a no-op one.
export const appScript = () => (cached ??= `var __name = function (f) { return f; };\n(${app.toString()})();`);
