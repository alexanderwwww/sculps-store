// Server-rendered admin pages. Light theme only (tokens copied from design/prototype/Shop Admin.dc.html).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `:root{--bg:#F1F1F1;--elev:#FFFFFF;--hover:#F7F7F7;--sel:#EAF4FF;--side-active:#FFFFFF;
--ink:#303030;--ink-2:#616161;--ink-3:#B5B5B5;--border:#E3E3E3;--border-strong:#8A8A8A;--input:#FFFFFF;--input-border:#8A8A8A;
--accent:#303030;--accent-hover:#1A1A1A;--accent-ink:#FFFFFF;--accent-soft:#F1F1F1;--link:#005BD3;--focus:#005BD3;--critical:#E51C00;--critical-bg:#FEDAD9;
--b-success-bg:#CDFEE1;--b-success-fg:#0C5132;--b-warning-bg:#FFEF9D;--b-warning-fg:#4F4700;--b-critical-bg:#FEDAD9;--b-critical-fg:#8E1F0B;
--b-info-bg:#E0F0FF;--b-info-fg:#00527C;--b-neutral-bg:#E3E3E3;--b-neutral-fg:#303030;--yt:#FF0033;--ig:#E1306C;--tt:#000000;
--shadow:0 1px 0 rgba(0,0,0,.05);--shadow-lg:0 8px 24px rgba(0,0,0,.14),0 1px 2px rgba(0,0,0,.08);--r-card:12px;--r-ctl:8px;--r-pill:999px}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:13px/20px Inter,system-ui,sans-serif}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}a{color:var(--link);text-decoration:none}
.side{position:fixed;inset:0 auto 0 0;width:220px;padding:16px 12px;display:flex;flex-direction:column;gap:2px}
.side .brand{font-weight:700;font-size:20px;padding:4px 10px 16px}.side a{color:var(--ink);padding:8px 10px;border-radius:var(--r-ctl);transition:background .15s ease-out}
.side a:hover{background:var(--hover)}.side a.on{background:var(--side-active);box-shadow:var(--shadow);font-weight:600}.side .build{margin-top:auto;color:var(--ink-3);font-size:11px;padding:0 10px}
main{margin-left:220px;padding:24px;max-width:1144px}h1{font-size:20px;line-height:28px;font-weight:650;margin:0 0 16px}h2{font-size:14px;margin:24px 0 8px}
.card{background:var(--elev);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow);padding:16px;margin-bottom:12px}
.grey{opacity:.55}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat .n{font:600 28px/32px "JetBrains Mono",monospace}.lbl{font-size:12px;line-height:16px;color:var(--ink-2)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:var(--r-ctl);border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:600;cursor:pointer;transition:background .15s ease-out}
.btn:hover{background:var(--accent-hover)}.btn.sec{background:var(--elev);color:var(--ink);border-color:var(--border-strong)}.btn.ghost{background:none;border:0;color:var(--link);padding:0 6px}
.badge{display:inline-block;padding:2px 8px;border-radius:var(--r-pill);font-size:12px;font-weight:550}
.b-success{background:var(--b-success-bg);color:var(--b-success-fg)}.b-warning{background:var(--b-warning-bg);color:var(--b-warning-fg)}
.b-critical{background:var(--b-critical-bg);color:var(--b-critical-fg)}.b-info{background:var(--b-info-bg);color:var(--b-info-fg)}.b-neutral{background:var(--b-neutral-bg);color:var(--b-neutral-fg)}
.chip{display:inline-flex;align-items:center;gap:6px;margin-right:8px}.dot{width:8px;height:8px;border-radius:50%}
.row{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--border);flex-wrap:wrap}.row:first-child{border-top:0}.grow{flex:1;min-width:0;overflow-wrap:anywhere}
.err{color:var(--b-critical-fg);width:100%;padding-left:2px}.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
input,textarea,select{font:inherit;color:var(--ink);background:var(--input);border:1px solid var(--input-border);border-radius:var(--r-ctl);padding:7px 10px;width:100%}
input:focus,textarea:focus,select:focus{outline:2px solid var(--focus);outline-offset:1px}label{display:block;margin:10px 0 4px}.inline{display:flex;gap:8px;align-items:center}
.inline input[type=checkbox],.inline input[type=radio]{width:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.clip{position:relative}.clip video{width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:12px;background:#000;display:block}
.clip .pick{position:absolute;top:8px;left:8px;width:20px;height:20px}.thumb{width:40px;height:71px;object-fit:cover;border-radius:6px;background:#000}
.steps{display:flex;gap:8px;margin-bottom:12px}.steps span{padding:4px 12px;border-radius:var(--r-pill);background:var(--elev);border:1px solid var(--border)}
.copy{display:flex;gap:8px}.copy input{font-family:"JetBrains Mono",monospace}.ok{background:var(--b-success-bg);color:var(--b-success-fg);padding:10px 14px;border-radius:var(--r-ctl);margin-bottom:12px}
.bad{background:var(--b-critical-bg);color:var(--b-critical-fg);padding:10px 14px;border-radius:var(--r-ctl);margin-bottom:12px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-top:1px solid var(--border)}th{font-size:12px;color:var(--ink-2);font-weight:550}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:var(--r-ctl);box-shadow:var(--shadow-lg);animation:t 3s forwards}
@keyframes t{0%,85%{opacity:1}100%{opacity:0}}.top{display:none}.tabs{display:none}.sticky{}
@media (max-width:767px){.side{display:none}main{margin:0;padding:16px 16px 140px}.top{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;font-weight:700;font-size:18px}
.top a{min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.tabs{display:flex;position:fixed;left:0;right:0;bottom:0;height:56px;background:var(--elev);border-top:1px solid var(--border);z-index:5}.tabs a{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;color:var(--ink-2);min-height:44px;font-size:11px;padding:0 2px;white-space:nowrap;overflow:hidden}.tabs a.on{color:var(--ink);font-weight:650}
.stats{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}.btn{height:44px}.steps{display:none}.row>.grow{flex-basis:100%}
.sticky{position:fixed;left:16px;right:16px;bottom:64px;z-index:4}.sticky .btn{width:100%}table,tbody,tr,td{display:block}thead{display:none}tr{border-top:1px solid var(--border);padding:6px 0}td{border:0;padding:2px 0}}`;

const NAV = [["/", "Dashboard"], ["/accounts", "Accounts"], ["/clips", "Library"], ["/schedule", "Schedule"], ["/campaigns", "Campaigns"], ["/settings", "Settings"]];
const TABS = [["/", "Home"], ["/accounts", "Accounts"], ["/clips", "Library"], ["/schedule", "Schedule"], ["/campaigns", "Campaigns"]];

const JS = `document.querySelectorAll('.clip video').forEach(v=>{v.muted=true;v.loop=true;v.playsInline=true;
v.addEventListener('mouseenter',()=>v.play().catch(()=>{}));v.addEventListener('mouseleave',()=>v.pause());
v.addEventListener('touchstart',()=>v.paused?v.play().catch(()=>{}):v.pause(),{passive:true})});
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied'}));
const cap=document.getElementById('caption');if(cap){const f=()=>document.querySelectorAll('[data-limit]').forEach(e=>{e.textContent=cap.value.length+' / '+e.dataset.limit});cap.addEventListener('input',f);f()}`;

export function page(title, active, body, { build, toast } = {}) {
  const nav = NAV.map(([h, n]) => `<a href="${h}" class="${h === active ? "on" : ""}">${n}</a>`).join("");
  const tabs = TABS.map(([h, n]) => `<a href="${h}" class="${h === active ? "on" : ""}">${n}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · mob</title><link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;550;600;650;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"><style>${CSS}</style></head>
<body><aside class="side"><div class="brand">mob</div>${nav}<div class="build mono">build ${esc(build)}</div></aside>
<div class="top"><span>mob</span><a href="/settings" aria-label="Settings">&#9881;</a></div>
<main><h1>${esc(title)}</h1>${body}</main><nav class="tabs">${tabs}</nav>${toast ? `<div class="toast">${esc(toast)}</div>` : ""}<script>${JS}</script></body></html>`;
}

export function loginPage(error, build) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mob</title><style>${CSS}</style></head>
<body><main style="margin:0 auto;max-width:360px;padding:80px 16px"><div class="brand" style="font-weight:700;font-size:24px;margin-bottom:16px">mob</div>
${error ? `<div class="bad">${esc(error)}</div>` : ""}<form method="post" action="/login" class="card"><label>Password</label><input type="password" name="password" autofocus required>
<div style="margin-top:12px"><button class="btn" style="width:100%">Sign in</button></div></form><div class="lbl mono">build ${esc(build)}</div></main></body></html>`;
}

const COLORS = { youtube: "--yt", instagram: "--ig", tiktok: "--tt" };
const NAMES = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
export const chip = (p) => `<span class="chip"><span class="dot" style="background:var(${COLORS[p] || "--ink-3"})"></span>${NAMES[p] || esc(p)}</span>`;
const BADGES = {
  posted: ["Posted", "success"], connected: ["Connected", "success"], scheduled: ["Queued", "warning"], publishing: ["Posting", "info"], processing: ["Posting", "info"],
  failed: ["Failed", "critical"], needs_reconnect: ["Expired", "critical"], skipped: ["Skipped", "neutral"], canceled: ["Off", "neutral"], disabled: ["Off", "neutral"],
  set: ["Set", "success"], unset: ["Not set", "neutral"], submitted: ["Pending", "warning"], approved: ["Approved", "success"], rejected: ["Rejected", "critical"], paid: ["Paid", "success"], active: ["Active", "success"],
};
export const badge = (s) => { const [t, c] = BADGES[s] || [s, "neutral"]; return `<span class="badge b-${c}">${esc(t)}</span>`; };
export const athens = (d) => d ? new Date(d).toLocaleString("en-GB", { timeZone: "Europe/Athens", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const mb = (n) => `${(Number(n || 0) / 1048576).toFixed(1)} MB`;

const maybeLive = (p) => p.status === "failed" && (!!p.upload_started_at || /^Worker interrupted/.test(p.error || ""));
export function postRow(p, mediaUrl) {
  const failed = p.status === "failed" || p.status === "skipped";
  return `<div class="row"><span class="mono">${athens(p.scheduled_at)}</span><video class="thumb" src="${esc(mediaUrl)}#t=0.5" preload="metadata" muted></video>
<span class="grow one">${esc(p.caption || p.title || p.clip_key)}</span>${p.platform ? chip(p.platform) : ""}<span class="mono">@${esc(p.handle || "")}</span>${badge(p.status)}
${p.remote_url ? `<a href="${esc(p.remote_url)}" target="_blank" rel="noopener">Open</a>` : ""}
${p.status === "scheduled" ? `<form method="post" action="/posts/${p.id}/cancel"><button class="btn ghost">Cancel</button></form>` : ""}
${failed ? `<div class="err">${esc(p.error || "")} <form method="post" action="/posts/${p.id}/retry" style="display:inline"${maybeLive(p) ? ` onsubmit="return confirm('This post may already be live on @${esc(p.handle || "")}. Posting again makes a duplicate. Retry anyway?')"><input type="hidden" name="confirm" value="1"><button class="btn ghost">Retry anyway</button>` : `><button class="btn ghost">Retry</button>`}</form></div>` : ""}</div>`;
}
