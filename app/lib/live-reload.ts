/**
 * Reload the page the moment a new build is live.
 *
 * Every build ships a hashed manifest. The page keeps asking for its own
 * manifest with HEAD; when the answer is 404 a new version has replaced it,
 * and the page reloads itself unless someone is typing. Served only to
 * signed-in admins viewing the storefront, so a shopper is never interrupted.
 */
export function liveReloadScript(intervalMs = 10_000): string {
  return `(function(){var m=Array.prototype.slice.call(document.querySelectorAll('link[rel=modulepreload],script[src]')).map(function(e){return e.href||e.src}).filter(function(h){return /\\/assets\\/manifest-[^/]+\\.js$/.test(h)})[0];if(!m)return;var stale=false;function go(){if(!stale)return;var a=document.activeElement;var typing=a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.isContentEditable);if(!typing&&!document.hidden)location.reload()}function check(){fetch(m,{method:'HEAD',cache:'no-store'}).then(function(r){if(r.status===404){stale=true;go()}}).catch(function(){})}setInterval(check,${intervalMs});document.addEventListener('visibilitychange',go);document.addEventListener('focusout',go)})();`;
}
