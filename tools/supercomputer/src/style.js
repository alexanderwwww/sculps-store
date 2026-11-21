// The look: dark frosted glass, SF typography, restrained colour. One card, 340 px, out of the chart's way.
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; }
.card, .pill { font: 400 12px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif;
  color: rgba(255,255,255,0.92); -webkit-font-smoothing: antialiased; font-feature-settings: "tnum" 1; letter-spacing: -0.01em; }
.card { width: 340px; padding: 14px 16px 10px; border-radius: 22px; position: relative;
  background: linear-gradient(180deg, rgba(44,44,48,0.78), rgba(22,22,24,0.82));
  -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
  border: 0.5px solid rgba(255,255,255,0.14);
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.6), 0 24px 60px -12px rgba(0,0,0,0.65), 0 8px 20px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
  animation: rise .35s cubic-bezier(.2,.9,.3,1); }
@keyframes rise { from { opacity: 0; transform: translateY(8px) scale(.98); } }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.up { color: #30D158; } .dn { color: #FF453A; } .muted { color: rgba(235,235,245,0.45); } .ok { color: #30D158; } .warn { color: #FF9F0A; }

header { display: flex; align-items: center; justify-content: space-between; cursor: grab; user-select: none; margin: -2px 0 2px; }
:host(.dragging) header { cursor: grabbing; }
.coin { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.coinbtn { display: flex; align-items: center; gap: 3px; font-size: 15px; font-weight: 600; letter-spacing: -0.02em; padding: 2px 4px 2px 0; border-radius: 6px; }
.coinbtn:hover .chev { opacity: 1; }
.chev { font-size: 12px; opacity: .45; transform: translateY(-2px); }
.src { font-size: 11px; color: rgba(235,235,245,0.45); white-space: nowrap; }
.tools { display: flex; gap: 2px; }
.ico { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 13px; color: rgba(235,235,245,0.55); transition: background .15s, color .15s; }
.ico:hover { background: rgba(255,255,255,0.08); color: #fff; }

.priceRow { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 6px; }
.price { font: 600 28px/1.05 -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif; letter-spacing: -0.03em; font-feature-settings: "tnum" 1; }
.sess { font-size: 11px; color: rgba(235,235,245,0.55); display: flex; align-items: center; gap: 5px; padding-bottom: 4px; }
.sdot { width: 6px; height: 6px; border-radius: 3px; background: rgba(235,235,245,0.3); }
.sdot.on { background: #30D158; box-shadow: 0 0 6px #30D158; }
.picker { width: 100%; margin: 0 0 6px; background: rgba(118,118,128,0.24); color: #fff; border: 0; border-radius: 9px; padding: 6px 8px; font: inherit; outline: none; }

.chart { width: 100%; height: 128px; display: block; margin: 2px 0 4px; }
.legend { display: flex; gap: 12px; font-size: 10px; color: rgba(235,235,245,0.5); margin: 0 0 10px; }
.legend i { display: inline-block; width: 7px; height: 7px; border-radius: 4px; margin-right: 5px; vertical-align: 0; }
.lg { transition: opacity .3s; }

.calls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.call { background: rgba(118,118,128,0.14); border-radius: 14px; padding: 9px 11px 8px; }
.lab { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: rgba(235,235,245,0.5); }
.big { font: 600 26px/1.1 -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif; letter-spacing: -0.03em; margin: 2px 0 1px; display: flex; align-items: baseline; }
.big small { font-size: 15px; font-weight: 600; margin-left: 1px; }
.big .arr { font-size: 15px; margin-right: 4px; transform: translateY(-2px); }
.big.soft { opacity: .62; }
.rng { font-size: 11px; color: rgba(235,235,245,0.7); }
.tested { font-size: 10px; color: rgba(235,235,245,0.42); margin-top: 1px; }
.tested.ok { color: #30D158; }

.verdict { margin: 10px 0 0; font-size: 12px; color: rgba(235,235,245,0.72); padding: 0 2px; }
.verdict b { color: #fff; font-weight: 600; }
.verdict.go b { color: inherit; }
.verdict.warn { color: #FF9F0A; }

.best { margin: 10px 0 0; border-radius: 14px; padding: 10px 12px; background: rgba(118,118,128,0.12); }
.best.go { background: linear-gradient(135deg, rgba(48,209,88,0.16), rgba(48,209,88,0.05)); box-shadow: inset 0 0 0 0.5px rgba(48,209,88,0.35); }
.best.go.short { background: linear-gradient(135deg, rgba(255,69,58,0.16), rgba(255,69,58,0.05)); box-shadow: inset 0 0 0 0.5px rgba(255,69,58,0.35); }
.bh { display: flex; justify-content: space-between; align-items: baseline; }
.bh b { font-size: 13px; font-weight: 600; }
.bh span { font-size: 10px; color: rgba(235,235,245,0.45); }
.bw { font-size: 11px; color: rgba(235,235,245,0.6); margin-top: 3px; }
.gone { color: #FF9F0A; font-size: 11px; margin-top: 3px; }

.plan { display: grid; grid-template-columns: 1.35fr 1fr 1fr 0.9fr; gap: 6px; margin-top: 8px; }
.cell { text-align: left; background: rgba(118,118,128,0.18); border-radius: 10px; padding: 6px 8px; transition: background .15s, transform .1s; min-width: 0; }
.cell:hover { background: rgba(118,118,128,0.3); } .cell:active { transform: scale(.97); }
.cell span { display: block; font-size: 9.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: rgba(235,235,245,0.5); }
.cell b { display: block; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
.cell.up b { color: #30D158; } .cell.dn b { color: #FF453A; }
.cell.copied { background: rgba(10,132,255,0.35); }
.pfine { grid-column: 1 / -1; font-size: 10px; color: rgba(235,235,245,0.5); padding: 0 2px; }

.tabs { display: grid; grid-template-columns: repeat(4, 1fr); margin: 12px 0 0; background: rgba(118,118,128,0.16); border-radius: 9px; padding: 2px; }
.tabs button { font-size: 11.5px; font-weight: 500; padding: 4px 0; border-radius: 7px; color: rgba(235,235,245,0.75); transition: background .2s, color .2s; }
.tabs button.on { background: rgba(99,99,102,0.85); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
.tabbody { margin-top: 10px; max-height: 230px; overflow: auto; scrollbar-width: thin; animation: fade .2s ease; }
@keyframes fade { from { opacity: 0; transform: translateY(-3px); } }
.fine { font-size: 10.5px; color: rgba(235,235,245,0.48); margin: 6px 0 0; line-height: 1.4; }
.mv { padding: 8px 0; border-bottom: 0.5px solid rgba(255,255,255,0.08); }
.mv:first-child { padding-top: 0; }
.mvh { display: flex; justify-content: space-between; font-size: 12.5px; } .mvh b { font-weight: 600; } .mvh span { font-weight: 600; }
.mvt { display: flex; gap: 5px; align-items: center; margin-top: 3px; font-size: 10px; color: rgba(235,235,245,0.45); }
.mvt em { font-style: normal; background: rgba(118,118,128,0.22); color: rgba(235,235,245,0.8); padding: 1px 6px; border-radius: 6px; }
.mvt span { margin-left: auto; }
.mvp { font-size: 11px; margin-top: 4px; color: rgba(235,235,245,0.85); }
.mvp.muted { color: rgba(235,235,245,0.45); }
.nl { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: rgba(235,235,245,0.7); }
.nw { display: grid; grid-template-columns: 10px 1fr; column-gap: 6px; padding: 6px 0; text-decoration: none; color: inherit; border-bottom: 0.5px solid rgba(255,255,255,0.08); }
.nd { width: 7px; height: 7px; border-radius: 4px; background: rgba(235,235,245,0.3); margin-top: 4px; }
.nd.up { background: #30D158; } .nd.dn { background: #FF453A; }
.nt { font-size: 11.5px; line-height: 1.3; } .nm { grid-column: 2; font-size: 10px; color: rgba(235,235,245,0.45); margin-top: 2px; }
.nw:hover .nt { color: #fff; text-decoration: underline; text-decoration-color: rgba(255,255,255,0.3); }
.grow { display: flex; }
.gcopy, .updbtn, .chk, .done { background: #0A84FF; color: #fff; font-weight: 600; font-size: 12px; border-radius: 9px; padding: 6px 12px; transition: filter .15s, transform .1s; }
.gcopy { width: 100%; } .gcopy:active, .updbtn:active { transform: scale(.98); }
.gcopy.copied { background: #30D158; }
.gcopy:hover, .updbtn:hover, .chk:hover, .done:hover { filter: brightness(1.12); }
textarea { width: 100%; height: 58px; margin-top: 8px; resize: none; background: rgba(118,118,128,0.18); color: #fff; border: 0; border-radius: 10px; padding: 7px 9px; font: 11px/1.35 -apple-system, system-ui, sans-serif; outline: none; }
textarea:focus, input:focus { box-shadow: 0 0 0 2px rgba(10,132,255,0.6); }
.gres { margin-top: 6px; }
.sc { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 2px; }
.sc th { font-size: 9.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: rgba(235,235,245,0.45); text-align: left; padding: 3px 4px; }
.sc td { padding: 4px; border-top: 0.5px solid rgba(255,255,255,0.07); } .sc td.n { color: rgba(235,235,245,0.5); font-size: 10.5px; }
.sc em { font-style: normal; font-size: 10.5px; }
.bt { font-size: 11px; margin: 10px 0 2px; color: rgba(235,235,245,0.6); } .bt b { color: #fff; font-weight: 600; }
.bands { margin-top: 4px; }

footer { display: flex; align-items: center; gap: 5px; margin-top: 10px; font-size: 10px; color: rgba(235,235,245,0.38); white-space: nowrap; }
footer .feed.on::before { content: ""; display: inline-block; width: 5px; height: 5px; border-radius: 3px; background: #30D158; margin-right: 4px; vertical-align: 1px; }
footer .feed.off { color: #FF9F0A; }
.upd { margin-left: auto; } .updbtn { font-size: 10.5px; padding: 3px 8px; border-radius: 7px; }

.sheet { position: absolute; inset: 0; border-radius: 22px; padding: 14px 16px; overflow: auto;
  background: rgba(28,28,30,0.96); -webkit-backdrop-filter: blur(30px); backdrop-filter: blur(30px); animation: fade .2s ease; z-index: 2; }
.shead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; } .shead b { font-size: 15px; font-weight: 600; }
.done { padding: 4px 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.grid label span { display: block; font-size: 10px; color: rgba(235,235,245,0.55); margin-bottom: 3px; }
.inp { display: flex; align-items: center; background: rgba(118,118,128,0.2); border-radius: 8px; padding: 0 8px; }
.inp input { width: 100%; background: none; border: 0; color: #fff; font: 500 12px/1 -apple-system, system-ui, sans-serif; padding: 7px 0; outline: none; font-feature-settings: "tnum" 1; box-shadow: none !important; }
.inp em { font-style: normal; font-size: 11px; color: rgba(235,235,245,0.4); }
.sbtns { margin-top: 10px; }
.chk { background: rgba(118,118,128,0.3); }

.pill { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px 8px 12px; border-radius: 20px; cursor: pointer; user-select: none;
  background: rgba(30,30,32,0.8); -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%);
  border: 0.5px solid rgba(255,255,255,0.14); box-shadow: 0 12px 30px -8px rgba(0,0,0,0.6); font-size: 13px; font-weight: 600; transition: transform .15s; }
.pill:hover { transform: scale(1.03); }
.pdot { width: 7px; height: 7px; border-radius: 4px; background: rgba(235,235,245,0.35); }
.pdot.go { background: #30D158; box-shadow: 0 0 8px #30D158; }
.parrow { font-size: 11px; }
`;
