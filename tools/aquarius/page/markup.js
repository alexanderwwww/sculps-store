// The genie's markup, mounted inside a shadow root (so claude.ai's styles never reach him, nor his theirs).
export const CSS = `
:host{all:initial}
#stage{position:relative;width:260px;height:320px;pointer-events:none;-webkit-user-select:none;user-select:none}
canvas{position:absolute;left:0;top:0;width:260px;height:320px;pointer-events:none}
#gl{image-rendering:pixelated;image-rendering:crisp-edges}
#hit{position:absolute;pointer-events:auto;cursor:pointer;border-radius:40%}
#bubble{position:absolute;left:12px;top:8px;width:236px;box-sizing:border-box;padding:9px 12px 10px;border-radius:14px;
  background:#fbfdff;color:#0b1e3a;border:2px solid #0b1e3a;box-shadow:0 3px 0 #0b1e3a;
  font:600 13px/1.32 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s;
  max-height:118px;overflow:hidden;pointer-events:none;word-wrap:break-word}
#bubble.show{opacity:1;transform:none}
#bubble:after{content:"";position:absolute;left:112px;bottom:-11px;border:9px solid transparent;border-top:9px solid #0b1e3a;border-bottom:0}
#bubble:before{content:"";position:absolute;left:115px;bottom:-6px;border:6px solid transparent;border-top:6px solid #fbfdff;border-bottom:0;z-index:1}
#bubble[data-state=typing] #btext:after{content:"▌";color:#2f8fe0;margin-left:1px}
#menu{position:absolute;left:40px;top:132px;width:180px;padding:6px;box-sizing:border-box;border-radius:12px;background:#0e1430;border:1.5px solid #f2c14e;
  box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 13px -apple-system,"Helvetica Neue",Arial,sans-serif;color:#eef6ff;display:none;pointer-events:auto}
#menu.show{display:block}
#menu .h{padding:6px 10px 7px;border-bottom:1px solid rgba(242,193,78,.35);margin-bottom:4px}
#menu .h b{display:block;font-size:14px;color:#f2c14e}#menu .h span{font-size:11px;color:#9fb3d9;font-weight:500}
#menu button{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:7px 10px;border-radius:7px;cursor:pointer}
#menu button:hover{background:#24306a}
#menu button.off{color:#ff9d9d}`;
export const HTML = `<div id="stage">
<canvas id="gl" width="130" height="160"></canvas><canvas id="fx"></canvas><div id="hit" title="Aquarius"></div>
<div id="bubble" data-state="idle"><span id="btext"></span></div>
<div id="menu"><div class="h"><b>Aquarius</b><span id="mbuild">CEO · build</span></div>
<button data-act="suit" id="msuit">Suit on</button>
<button data-act="listen" id="mlisten">Listening: on</button>
<button data-act="hide">Hide 1 hour</button>
<button data-act="off" class="off">Turn off</button></div></div>`;
