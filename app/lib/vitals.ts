/**
 * Core Web Vitals, measured in the visitor's own browser.
 *
 * Shopify's Online Store screen reports LCP, INP and CLS at the 75th
 * percentile over the last thirty days. These are the same three metrics
 * Google ranks on, and the only honest way to have them is to measure real
 * visits — a synthetic score measured from a datacentre is a different number
 * about a different machine.
 *
 * No library. The three metrics come straight from PerformanceObserver, and
 * the report goes out with sendBeacon when the page is hidden, which is the
 * only moment INP and CLS are final.
 */
export function vitalsScript(): string {
  return `(function(){
if(!window.PerformanceObserver)return;
var sent=false,lcp=0,cls=0,inp=0;
function obs(type,cb,extra){try{var o=new PerformanceObserver(cb);o.observe(Object.assign({type:type,buffered:true},extra||{}));return o}catch(e){}}
obs('largest-contentful-paint',function(l){var es=l.getEntries();var e=es[es.length-1];if(e)lcp=e.startTime});
obs('layout-shift',function(l){l.getEntries().forEach(function(e){if(!e.hadRecentInput)cls+=e.value})});
obs('event',function(l){l.getEntries().forEach(function(e){if(e.duration>inp)inp=e.duration})},{durationThreshold:16});
function send(){
  if(sent)return;sent=true;
  var m=[];
  if(lcp>0)m.push({metric:'LCP',value:Math.round(lcp)});
  if(inp>0)m.push({metric:'INP',value:Math.round(inp)});
  m.push({metric:'CLS',value:Math.round(cls*1000)});
  if(!m.length)return;
  var body=JSON.stringify({path:location.pathname,metrics:m});
  if(navigator.sendBeacon){navigator.sendBeacon('/vitals',new Blob([body],{type:'application/json'}))}
  else{fetch('/vitals',{method:'POST',body:body,keepalive:true,headers:{'Content-Type':'application/json'}}).catch(function(){})}
}
addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')send()});
addEventListener('pagehide',send);
})();`;
}

/**
 * The 75th percentile, the way the Web Vitals report defines it: sort, then
 * take the value at 75% of the way through. Fewer than five samples is not a
 * percentile, so it returns null and the screen shows that it is still
 * collecting rather than a number built from three visits.
 */
export function p75(values: number[]): number | null {
  if (values.length < 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  return sorted[index];
}


/**
 * The heartbeat behind the globe's dots and the traffic numbers.
 *
 * It says "I am a browser and I am still here" on arrival, then every twenty
 * seconds while the tab is visible. A hidden tab stops beating — someone who
 * left the page open in another window is not on the site — and starts again
 * when it comes back. sendBeacon on pagehide is the last word, so the dot
 * does not hang around after they go.
 *
 * Nothing here identifies anyone: the visit cookie the server already set is
 * the whole of it.
 */
export function presenceScript(): string {
  return `(function(){
var EVERY=20000,last=0,timer=0;
function beat(final){
  var now=Date.now();
  if(!final&&now-last<EVERY-2000)return;
  last=now;
  var body=JSON.stringify({path:location.pathname});
  if(final&&navigator.sendBeacon){navigator.sendBeacon('/seen',new Blob([body],{type:'application/json'}));return}
  fetch('/seen',{method:'POST',body:body,keepalive:!!final,headers:{'Content-Type':'application/json'}}).catch(function(){});
}
function start(){if(timer)return;beat();timer=setInterval(function(){if(document.visibilityState==='visible')beat()},EVERY)}
function stop(){if(timer){clearInterval(timer);timer=0}}
addEventListener('visibilitychange',function(){document.visibilityState==='visible'?start():stop()});
addEventListener('pagehide',function(){stop()});
if(document.visibilityState==='visible')start();
})();`;
}
