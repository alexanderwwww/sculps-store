/**
 * Three replacements for the columns, drawn and looked at before anything
 * ships. Same 216pt squircle, same cluttered desktop behind it, two states
 * each — working, and waiting on him.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const CONCEPTS = {
  /* A. LIQUID — a real body of light with a surface. It has a level that
     rises through the day, a meniscus that tilts when the thing is moved, and
     it swells when it is working. Nothing is a bar; it is a substance. */
  liquid: `
    var lvl=0, tilt=0;
    function paint(x,w,h,t,S){
      lvl += ((S.working? 0.52 : 0.34) - lvl)*0.03;
      tilt += ((S.working? Math.sin(t*1.2)*0.06 : 0)-tilt)*0.05;
      var top=h*(1-lvl);
      // the body
      var g=x.createLinearGradient(0,top,0,h);
      g.addColorStop(0,S.bright); g.addColorStop(1,S.deep);
      x.beginPath(); x.moveTo(0,h);
      for(var px=0;px<=w;px+=3){
        var y=top + Math.sin(px/48+t*(S.working?3.2:1.0))*h*(S.working?0.035:0.012)
                  + Math.sin(px/113-t*(S.working?1.9:0.6))*h*0.018
                  + tilt*(px/w-0.5)*h;
        x.lineTo(px,y);
      }
      x.lineTo(w,h); x.closePath(); x.fillStyle=g; x.fill();
      // the meniscus: a bright line where the liquid meets the glass
      x.save(); x.globalCompositeOperation="lighter";
      x.beginPath();
      for(var px2=0;px2<=w;px2+=3){
        var y2=top + Math.sin(px2/48+t*(S.working?3.2:1.0))*h*(S.working?0.035:0.012)
                   + Math.sin(px2/113-t*(S.working?1.9:0.6))*h*0.018 + tilt*(px2/w-0.5)*h;
        if(px2===0) x.moveTo(px2,y2); else x.lineTo(px2,y2);
      }
      x.strokeStyle="rgba(255,255,255,"+(S.working?0.85:0.5)+")"; x.lineWidth=1.6; x.stroke();
      x.restore();
      // light thrown up onto the glass above the surface
      var up=x.createLinearGradient(0,top-h*0.3,0,top);
      up.addColorStop(0,"rgba(255,255,255,0)"); up.addColorStop(1,S.glow);
      x.fillStyle=up; x.fillRect(0,top-h*0.3,w,h*0.3);
    }`,

  /* B. AURORA — no surface at all. Three ribbons of light refracting through
     the glass, drifting slowly when idle and folding fast when working. The
     Apple Intelligence edge, brought inside. */
  aurora: `
    function paint(x,w,h,t,S){
      x.save(); x.globalCompositeOperation="lighter";
      for(var i=0;i<3;i++){
        var sp=(S.working?1.0:0.28)*(0.6+i*0.3);
        var amp=h*(0.10+i*0.03)*(S.working?1.5:0.7);
        var mid=h*(0.42+i*0.10);
        var g=x.createLinearGradient(0,mid-amp,0,mid+amp);
        g.addColorStop(0,"rgba(255,255,255,0)");
        g.addColorStop(0.5, i===1? S.bright : S.deep);
        g.addColorStop(1,"rgba(255,255,255,0)");
        x.beginPath();
        for(var px=0;px<=w;px+=3){
          var y=mid+Math.sin(px/(70-i*14)+t*sp*2.4)*amp
                   +Math.sin(px/(150+i*30)-t*sp*1.3)*amp*0.6;
          if(px===0) x.moveTo(px,y); else x.lineTo(px,y);
        }
        for(var px3=w;px3>=0;px3-=3){
          var y3=mid+Math.sin(px3/(70-i*14)+t*sp*2.4)*amp
                    +Math.sin(px3/(150+i*30)-t*sp*1.3)*amp*0.6;
          x.lineTo(px3,y3+h*(S.working?0.10:0.06));
        }
        x.closePath(); x.fillStyle=g; x.fill();
      }
      x.restore();
    }`,

  /* C. PEARL — one body of light, breathing. Calm and centred when idle, tight
     and travelling when working, perfectly still when it wants him. Siri's orb
     rather than a chart. */
  pearl: `
    function paint(x,w,h,t,S){
      var cx=w/2+(S.working?Math.sin(t*1.7)*w*0.10:0);
      var cy=h*0.56+(S.working?Math.cos(t*2.3)*h*0.05:Math.sin(t*0.5)*h*0.02);
      var r=h*(S.working?0.30+Math.sin(t*4)*0.03:0.24);
      x.save(); x.globalCompositeOperation="lighter";
      for(var k=3;k>=1;k--){
        var g=x.createRadialGradient(cx,cy,1,cx,cy,r*k*0.9);
        g.addColorStop(0,k===1?"rgba(255,255,255,.95)":S.bright);
        g.addColorStop(1,"rgba(255,255,255,0)");
        x.fillStyle=g; x.beginPath(); x.arc(cx,cy,r*k*0.9,0,Math.PI*2); x.fill();
      }
      // a caustic ring cast on the floor of the glass
      var ring=x.createRadialGradient(cx,h*0.86,2,cx,h*0.86,r*1.6);
      ring.addColorStop(0,S.glow); ring.addColorStop(1,"rgba(255,255,255,0)");
      x.fillStyle=ring; x.fillRect(0,h*0.62,w,h*0.38);
      x.restore();
    }`,
};

const STATES = {
  working: { working: true, copy: "writing to maria_k",
    bright: "rgba(90,255,200,.55)", deep: "rgba(0,150,120,.40)", glow: "rgba(90,255,200,.22)" },
  waiting: { working: false, copy: "2 waiting on you",
    bright: "rgba(255,190,90,.55)", deep: "rgba(190,110,20,.40)", glow: "rgba(255,190,90,.22)" },
};

const CLUTTER = `
  <div style="position:absolute;left:24px;top:40px;width:330px;height:210px;border-radius:14px;
    background:linear-gradient(160deg,#ff5f6d,#ffc371)"></div>
  <div style="position:absolute;right:20px;top:96px;width:240px;height:280px;border-radius:14px;
    background:linear-gradient(200deg,#2193b0,#6dd5ed)"></div>
  <div style="position:absolute;left:70px;bottom:28px;width:280px;height:160px;border-radius:14px;
    background:repeating-linear-gradient(45deg,#111 0 12px,#eee 12px 24px);opacity:.8"></div>
  <div style="position:absolute;left:120px;top:150px;font:700 58px/1 -apple-system,sans-serif;
    color:rgba(255,255,255,.55)">AIGIS</div>`;

mkdirSync("out", { recursive: true });
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const [name, paint] of Object.entries(CONCEPTS)) {
  for (const [state, S] of Object.entries(STATES)) {
    const page = await browser.newPage({ viewport: { width: 460, height: 460 }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><style>
      html,body{margin:0;height:100%;background:linear-gradient(135deg,#1b2430,#2d1f3d 55%,#0f1a24)}
      .stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
      .orb{position:relative;width:216px;height:216px;border-radius:56px;overflow:hidden;
        backdrop-filter:blur(24px) saturate(1.7);-webkit-backdrop-filter:blur(24px) saturate(1.7);
        background:rgba(255,255,255,.05);
        box-shadow:0 24px 48px -16px rgba(0,0,0,.55),
                   inset 0 1.6px 0 rgba(255,255,255,.35),
                   inset 0 -12px 24px -12px rgba(0,0,0,.16)}
      canvas{position:absolute;inset:0;width:100%;height:100%}
      .f{position:absolute;left:0;right:0;top:26px;text-align:center;
        font:600 14px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;
        text-shadow:0 1px 3px rgba(0,0,0,.6),0 2px 16px rgba(0,0,0,.5);padding:0 20px}
      .n{font:700 11px/1 -apple-system,sans-serif;letter-spacing:.34em;
        color:rgba(255,255,255,.55);margin-bottom:6px}
    </style>${CLUTTER}
    <div class="stage"><div class="orb"><canvas id="c"></canvas>
      <div class="f"><div class="n">flip</div>${S.copy}</div></div></div>
    <script>
      var c=document.getElementById("c"),x=c.getContext("2d");
      var r=2; c.width=216*r; c.height=216*r; x.setTransform(r,0,0,r,0,0);
      var S=${JSON.stringify(S)};
      ${paint}
      var t=0;
      function loop(){ t+=0.016; x.clearRect(0,0,216,216); paint(x,216,216,t,S);
        requestAnimationFrame(loop); }
      loop();
    </script>`);
    await page.waitForTimeout(2600);
    const file = `out/${name}-${state}.png`;
    await page.screenshot({ path: file });
    console.log("wrote", file);
    await page.close();
  }
}
await browser.close();
