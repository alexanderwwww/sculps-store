// Sky, sea, clouds, snow (zone based, GPU driven), chimney smoke, light halos, day/night presets.
import { THREE, canvasTex, hash, lerp, smooth, G, Geo } from "./gfx.js";
const C = (h) => new THREE.Color(h);
// presets: [day, golden, night]
export const PRESETS = {
  day:    { top: "#2f7bd8", mid: "#8cc4f4", low: "#e8f0f8", sun: "#fff4e0", key: "#fff0dc", keyI: 3.2, hemiS: "#bcd8ff", hemiG: "#8a8a5a", hemiI: 0.9, fog: "#cfe4f2", env: 0.55, sea: "#2a9ac0", exp: 1.0, glow: 0.0, sunDir: [0.5, 0.75, 0.4] },
  golden: { top: "#2a5ad0", mid: "#7aa8f0", low: "#ffc890", sun: "#ffb060", key: "#ffc890", keyI: 3.3, hemiS: "#a8c8ff", hemiG: "#b08a5a", hemiI: 1.0, fog: "#f0c8a0", env: 0.55, sea: "#2a8ab0", exp: 1.05, glow: 0.35, sunDir: [-0.72, 0.34, 0.6] },
  night:  { top: "#0a1440", mid: "#243a88", low: "#6a5aa8", sun: "#aac0ff", key: "#9ab4ff", keyI: 1.7, hemiS: "#7a8ad8", hemiG: "#4a4a7a", hemiI: 1.5, fog: "#2a3578", env: 0.25, sea: "#14507a", exp: 1.35, glow: 1.0, sunDir: [0.4, 0.5, -0.6] },
};
export function mixPreset(hour) {
  // 0-24 -> weights for night/day/golden
  const n = 1 - smooth(5.5, 7.5, hour) + smooth(18.8, 20.6, hour) , d = smooth(6.5, 9, hour) * (1 - smooth(15.5, 18, hour)), gd = Math.max(0, 1 - n - d);
  const nn = Math.min(1, n), dd = Math.min(1, d) * (1 - nn), gg = Math.max(0, 1 - nn - dd);
  const out = {}; const parts = [[PRESETS.night, nn], [PRESETS.day, dd], [PRESETS.golden, gg]];
  for (const k of Object.keys(PRESETS.day)) {
    const v0 = PRESETS.day[k];
    if (typeof v0 === "string") { const c = new THREE.Color(0, 0, 0); for (const [p, w] of parts) c.add(C(p[k]).multiplyScalar(w)); out[k] = c; }
    else if (Array.isArray(v0)) out[k] = v0.map((_, i) => parts.reduce((a, [p, w]) => a + p[k][i] * w, 0));
    else out[k] = parts.reduce((a, [p, w]) => a + p[k] * w, 0);
  }
  out.night = nn; return out;
}

export function makeSky() {
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: C("#2a5ad0") }, mid: { value: C("#7aa8f0") }, low: { value: C("#ffc890") }, sun: { value: C("#ffb060") }, sd: { value: new THREE.Vector3(-0.7, 0.3, 0.6).normalize() }, stars: { value: 0 } },
    vertexShader: "varying vec3 vd; void main(){ vd=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `varying vec3 vd; uniform vec3 top,mid,low,sun,sd; uniform float stars;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){ float y=clamp(vd.y,-0.2,1.0); vec3 c=mix(low,mid,smoothstep(0.0,0.28,y)); c=mix(c,top,smoothstep(0.25,0.9,y));
        float s=max(dot(normalize(vd),normalize(sd)),0.0); c+=sun*(pow(s,6.0)*0.45+pow(s,180.0)*1.6);
        if(stars>0.01){ vec2 q=floor(vd.xz/(vd.y+1.2)*140.0); float st=step(0.985,h(q))*smoothstep(0.1,0.5,vd.y); c+=vec3(st)*stars; }
        gl_FragColor=vec4(c,1.0);
#include <colorspace_fragment>
      }` });
  const m = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16), mat); m.frustumCulled = false; m.renderOrder = -10; return m;
}
export function makeSea() {
  const nrm = canvasTex(256, 256, (x) => { const id = x.createImageData(256, 256), f = (i, j) => Math.sin(i * 0.12 + Math.sin(j * 0.07) * 2) + Math.sin(j * 0.1 + i * 0.03) * 0.8 + Math.sin((i + j) * 0.17) * 0.5; for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const dx = f(i + 1, j) - f(i - 1, j), dy = f(i, j + 1) - f(i, j - 1), o = (j * 256 + i) * 4; id.data[o] = 128 + dx * 18; id.data[o + 1] = 128 + dy * 18; id.data[o + 2] = 255; id.data[o + 3] = 255; } x.putImageData(id, 0, 0); }, { repeat: true });
  nrm.colorSpace = THREE.NoColorSpace; nrm.repeat.set(70, 70);
  const mat = new THREE.MeshStandardMaterial({ color: "#2a8ab0", roughness: 0.2, metalness: 0.1, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86 });
  const m = new THREE.Mesh(new THREE.CircleGeometry(900, 48), mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.receiveShadow = true; m.userData.nrm = nrm; return m;
}
export function makeClouds() {
  const g = new Geo(); g.seed = 3;
  for (let i = 0; i < 16; i++) { const a = hash(i) * 6.283, r = 140 + hash(i + 1) * 260, y = 85 + hash(i + 2) * 60, cx = Math.cos(a) * r, cz = Math.sin(a) * r; for (let k = 0; k < 5; k++) g.part("ico", [11 + hash(i * 9 + k) * 11, 5 + hash(i + k) * 3.5, 9 + hash(i * 3 + k) * 8], [cx + (k - 2) * 12, y + (k % 2) * 2.5, cz + (hash(i + k * 2) - 0.5) * 12], k % 2 ? "#fff5ea" : "#ffeedd"); }
  const m = g.mesh("solid", new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: "#6a4a3a", emissiveIntensity: 0.5 }), false); m.castShadow = false; m.receiveShadow = false; return m;
}
const SOFT = () => canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
export function makeSnow(count = 2600) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pos[i * 3] = Math.random() * 60; pos[i * 3 + 1] = Math.random() * 26; pos[i * 3 + 2] = Math.random() * 60; seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("seed", new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 }, cam: { value: new THREE.Vector3() }, amt: { value: 0 }, tex: { value: SOFT() }, px: { value: 1 } },
    vertexShader: `attribute vec3 seed; uniform float t; uniform vec3 cam; uniform float px; varying float va; varying float vf;
      void main(){ vec3 p=position; p.y=mod(p.y-t*(1.5+seed.y*1.8),26.0); p.x+=sin(t*0.6+seed.z*6.28)*1.1; p.z+=cos(t*0.5+seed.x*6.28)*1.1;
        vec3 w=vec3(cam.x+mod(p.x-cam.x+30.0,60.0)-30.0, cam.y-9.0+p.y, cam.z+mod(p.z-cam.z+30.0,60.0)-30.0);
        vec4 mv=viewMatrix*vec4(w,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp((0.16+seed.x*0.14)*px*180.0/-mv.z,1.5,16.0); va=smoothstep(2.0,10.0,-mv.z)*(1.0-smoothstep(20.0,30.0,-mv.z)); }`,
    fragmentShader: `uniform sampler2D tex; uniform float amt; varying float va; void main(){ float a=smoothstep(1.0,0.2,length(gl_PointCoord-0.5)*2.0)*va*amt*0.9; if(a<0.01) discard; gl_FragColor=vec4(0.96,0.98,1.0,a); }` });
  const m = new THREE.Points(g, mat); m.frustumCulled = false; m.renderOrder = 5; return m;
}
export function makeSmoke(points) {
  const per = 7, n = points.length * per, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  points.forEach((p, i) => { for (let k = 0; k < per; k++) { const j = i * per + k; pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z; seed[j] = k / per + hash(i) * 0.1; } });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 }, tex: { value: SOFT() }, px: { value: 1 }, col: { value: C("#e8dcd0") } },
    vertexShader: `attribute float seed; uniform float t; uniform float px; varying float va; void main(){ float a=fract(t*0.14+seed); vec3 p=position+vec3(a*2.4+sin(a*6.0+seed*9.0)*0.3,a*5.0,sin(a*4.0+seed*7.0)*0.3); vec4 mv=viewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(1.2+a*3.2)*px*38.0/-mv.z; va=(1.0-a)*smoothstep(0.0,0.1,a)*0.5; }`,
    fragmentShader: "uniform sampler2D tex; uniform vec3 col; varying float va; void main(){ float a=smoothstep(1.0,0.1,length(gl_PointCoord-0.5)*2.0)*va; if(a<0.01) discard; gl_FragColor=vec4(col,a); }" });
  const m = new THREE.Points(g, mat); m.frustumCulled = false; return m;
}
export function makeHalos(list) {
  const n = list.length, pos = new Float32Array(n * 3), size = new Float32Array(n), a = new Float32Array(n);
  list.forEach((h, i) => { pos.set([h.p.x, h.p.y, h.p.z], i * 3); size[i] = h.s; a[i] = h.a; });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("size", new THREE.BufferAttribute(size, 1)); g.setAttribute("alpha", new THREE.BufferAttribute(a, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, k: { value: 0.3 }, tex: { value: SOFT() }, px: { value: 1 } },
    vertexShader: `attribute float size; attribute float alpha; uniform float t; uniform float k; uniform float px; varying float va; void main(){ vec4 mv=viewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(size*px*120.0/-mv.z,2.0,160.0); va=alpha*k*(0.88+0.12*sin(t*3.0+position.x*3.1+position.z)); }`,
    fragmentShader: "uniform sampler2D tex; varying float va; void main(){ float a=smoothstep(1.0,0.0,length(gl_PointCoord-0.5)*2.0)*va; gl_FragColor=vec4(1.0,0.78,0.42,a); }" });
  const m = new THREE.Points(g, mat); m.frustumCulled = false; m.renderOrder = 4; return m;
}
