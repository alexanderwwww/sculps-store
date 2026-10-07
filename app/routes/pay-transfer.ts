/**
 * /pay-transfer?ref=CODE — the bank details for a direct transfer, each with
 * a real Copy button. Email apps strip scripts, so the email links here.
 */
const DETAILS: Array<[string, string]> = [
  ["Amount", "269.99"],
  ["Account name", "ALEXANDROS BOUGIOUKLIS"],
  ["Routing number (ACH & wire)", "084009519"],
  ["Account number", "905618172367712"],
  ["Account type", "Checking"],
  ["Bank", "Column N.A."],
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function loader({ request }: { request: Request }) {
  const ref = (new URL(request.url).searchParams.get("ref") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
  const rows = [...DETAILS, ...(ref ? ([["Reference", ref]] as Array<[string, string]>) : [])]
    .map(
      ([k, v]) => `<div class="row"><div><div class="k">${esc(k)}</div><div class="v">${k === "Amount" ? "$" : ""}${esc(v)}</div></div>
<button data-v="${esc(v)}" onclick="cp(this)">Copy</button></div>`,
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Bank transfer details · Black Reaper</title>
<style>
body{margin:0;background:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0B0B0C}
.bar{background:#F7A21B;text-align:center;font-size:12px;font-weight:800;letter-spacing:3px;padding:10px}
.w{max-width:520px;margin:0 auto;padding:24px 16px 48px}
.logo{display:block;margin:0 auto 18px;height:34px}
h1{font-size:30px;line-height:1.1;margin:0 0 8px;text-align:center}
p{color:#4A4740;text-align:center;line-height:1.5;margin:0 0 20px}
.box{border:2px solid #0B0B0C;border-radius:14px;overflow:hidden}
.hd{background:#0B0B0C;color:#fff;font-size:12px;font-weight:800;letter-spacing:2.5px;padding:12px 16px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid #E5E2DC}
.k{color:#8A8478;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
.v{font-family:Menlo,Consolas,monospace;font-size:18px;font-weight:800;padding-top:3px;word-break:break-all}
button{flex:none;background:#0B0B0C;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer}
button.ok{background:#1F8A4C}
.all{display:block;width:100%;margin-top:16px;padding:16px;font-size:17px}
.n{font-size:14px;margin-top:20px}
</style></head><body>
<div class="bar">DIRECT BANK TRANSFER</div>
<div class="w"><img class="logo" src="/media/br-logo.webp" alt="Black Reaper">
<h1>Your bank transfer details</h1>
<p>Send by ACH or wire from your banking app. Tap Copy next to each line and paste it in.</p>
<div class="box"><div class="hd">BANK TRANSFER DETAILS · USD</div>${rows}</div>
<button class="all" onclick="cpAll(this)">Copy all details</button>
<p class="n">Text Alex at <b>+30 698 732 0367</b> once it is sent, or reply to the email. Your order is confirmed the same day.</p>
</div>
<script>
function done(b,t){var o=b.textContent;b.textContent=t||'Copied';b.classList.add('ok');setTimeout(function(){b.textContent=o;b.classList.remove('ok')},1600)}
function put(s,b,t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){done(b,t)},function(){old(s,b,t)})}else old(s,b,t)}
function old(s,b,t){var a=document.createElement('textarea');a.value=s;a.setAttribute('readonly','');a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{document.execCommand('copy');done(b,t)}catch(e){}document.body.removeChild(a)}
function cp(b){put(b.getAttribute('data-v'),b)}
function cpAll(b){var s=[];document.querySelectorAll('.row').forEach(function(r){s.push(r.querySelector('.k').textContent+': '+r.querySelector('button').getAttribute('data-v'))});put(s.join('\\n'),b,'All copied')}
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
