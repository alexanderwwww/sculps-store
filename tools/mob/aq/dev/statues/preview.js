// Statue preview scene (dev only): dusk sky, ground, three-point light, soft shadows. Driven by shoot.mjs through window.__show.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeStatue } from "../../world/statues.js";
import { initMaterials } from "../../world/kit.js";
if (new URLSearchParams(location.search).get("kit")) initMaterials(); globalThis.__STATUE_DEBUG = true;
const GODS = ["zeus", "athena", "apollo", "hermes", "dionysus", "hecate"];
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.style.margin = 0; document.body.appendChild(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
{ const c = document.createElement("canvas"); c.width = 4; c.height = 256; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#2c3a66"); gr.addColorStop(0.55, "#8f7fa6"); gr.addColorStop(0.8, "#e2a98c"); gr.addColorStop(1, "#f1cfa0"); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x8d8674, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a6a48, 1.1));
const key = new THREE.DirectionalLight(0xffd6a0, 2.6); key.position.set(-9, 14, 11).multiplyScalar(5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); { const w = new URLSearchParams(location.search).get("kit") ? 70 : 20; Object.assign(key.shadow.camera, { left: -w, right: w, top: w, bottom: -w, near: 1, far: 400 }); } key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; scene.add(key);
const fill = new THREE.DirectionalLight(0x9db8ff, 0.7); fill.position.set(10, 6, 6); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe2c0, 1.3); rim.position.set(4, 9, -12); scene.add(rim);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 300); const controls = new OrbitControls(camera, renderer.domElement);
const q0 = new URLSearchParams(location.search); const holder = new THREE.Group(); scene.add(holder); const made = {};
const get = (g) => (made[g] = made[g] || makeStatue(g, { sync: q0.get("sync") === "1" }));
window.__show = async (god, view = "front") => {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight;
  holder.clear(); let target = new THREE.Vector3(0, 3.9, 0), dist = 19, az = 0, el = 0.08; const t0 = performance.now();
  if (god === "lineup") { GODS.forEach((g, i) => { const s = get(g); s.position.set((i - 2.5) * 4.6, 0, 0); s.rotation.y = 0; holder.add(s); }); dist = 30; target.y = 3.9; camera.fov = 30; el = 0.06; if (view === "34") az = 0.5; }
  else { const s = get(god); s.position.set(0, 0, 0); holder.add(s); camera.fov = 32;
    if (view === "34") az = -0.7; if (view === "34b") az = 0.7; if (view === "side") az = -Math.PI / 2; if (view === "back") az = Math.PI;
    if (view === "face") { target.set(0, 6.8, 0); dist = 5.2; az = -0.35; el = 0.02; } if (view === "far") { dist = 130; target.y = 3.6; } if (view === "top") { target.set(0, 6.2, 0); dist = 9; az = -0.5; el = 0.25; } if (view === "feet") { target.set(0, 2.6, 0); dist = 9; az = -0.4; el = 0.15; } }
  camera.updateProjectionMatrix(); camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist); controls.target.copy(target); controls.update();
  await Promise.all(holder.children.map((s) => s.userData.ready)); const buildMs = Math.round(performance.now() - t0);
  renderer.info.reset(); renderer.render(scene, camera);
  const st = {}; holder.traverse((o) => { if (o.isMesh) { st.meshes = (st.meshes || 0) + 1; st.tris = (st.tris || 0) + o.geometry.index.count / 3; } });
  return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, statueMeshes: st.meshes, statueTris: st.tris, ms: buildMs, flames: holder.children.map((s) => s.userData.flames.length) };
};
const q = q0; await window.__show(q.get("god") || "zeus", q.get("view") || "front");
controls.addEventListener("change", () => renderer.render(scene, camera)); addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); }); window.__ready = true; // render on demand
