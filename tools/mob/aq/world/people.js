// Characters: Quaternius CC0 base body + Universal Animation Library clips (same rig, bone names match).
// Workers share the body; a modeled Greek tunic (chiton) in the department colour sits on the pelvis/spine bones.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { M } from "./kit.js";

const BASE = (window.AQ_ASSETS || "/aq/assets/");
let body = null, clips = {};
export async function loadPeople() {
  const L = new GLTFLoader();
  const [b, a] = await Promise.all([L.loadAsync(BASE + "body.glb"), L.loadAsync(BASE + "anims.glb")]);
  body = b.scene;
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = true; if (o.material) { o.material.roughness = 0.75; o.material.metalness = 0; } } });
  for (const c of a.animations) {
    // strip root translation (in-place locomotion) so the controller moves the body
    c.tracks = c.tracks.filter((t) => !(/(root|pelvis)\.position$/i.test(t.name) && /Walk|Jog|Sprint/.test(c.name)) || true);
    clips[c.name] = c;
  }
  return { body, clips };
}

function tunicGeo() {
  // chiton skirt: lathe with soft folds
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.17 + t * 0.12 + Math.sin(t * 3) * 0.01, -t * 0.42)); }
  const g = new THREE.LatheGeometry(pts, 28); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(z, x), f = 1 + 0.06 * Math.sin(a * 9) * (-y / 0.42); p.setX(i, x * f * 1.05); p.setZ(i, z * f * 0.85); }
  g.computeVertexNormals(); return g;
}
function torsoGeo() { const g = new THREE.CylinderGeometry(0.15, 0.175, 0.44, 24, 1, true); g.scale(1.1, 1, 0.8); return g; }
let TG, TO, SASH, HAIR; const hairMats = {}; const hairMat = (c) => (hairMats[c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const tunicMats = {};
function tunicMat(col) { if (!tunicMats[col]) tunicMats[col] = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, side: THREE.DoubleSide }); return tunicMats[col]; }

export function findBone(root, re) { let f = null; root.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; }

export class Person {
  constructor(color = "#f2ede2", { ceo = false, trim = null, emblem = null } = {}) {
    this.root = new THREE.Group();
    this.model = skClone(body); this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {}; this.cur = null;
    TG ||= tunicGeo(); TO ||= torsoGeo(); SASH ||= new THREE.TorusGeometry(0.175, 0.018, 6, 24);
    const pelvis = findBone(this.model, /^pelvis$/i) || findBone(this.model, /pelvis|hips/i);
    const spine = findBone(this.model, /spine_02|spine2|spine_03/i);
    const mat = tunicMat(color);
    if (pelvis) { const sk = new THREE.Mesh(TG, mat); sk.castShadow = true; pelvis.add(sk); sk.position.set(0, 0.06, 0); this.skirt = sk; this.fixUp(sk, pelvis); }
    if (spine) { const to = new THREE.Mesh(TO, mat); to.castShadow = true; spine.add(to); this.fixUp(to, spine, 0.05);
      const sash = new THREE.Mesh(SASH, ceo ? M.gold : tunicMat(trim || "#c9a35a")); spine.add(sash); this.fixUp(sash, spine, -0.2); sash.rotateX(Math.PI / 2); sash.scale.multiplyScalar(0.9); }
    if (emblem && spine) { const em = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: emblem, side: THREE.DoubleSide })); spine.add(em); this.fixUp(em, spine, 0.12, 0.155); }
    const head = findBone(this.model, /^head$/i);
    if (head) { HAIR ||= (() => { const g = new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5); g.scale(0.98, 0.85, 1.1); return g; })();
      const hair = new THREE.Mesh(HAIR, hairMat(ceo ? "#2a1a10" : ["#2a1a10", "#4a2e18", "#111", "#6b4a2a"][Math.floor(Math.random() * 4)])); head.add(hair); this.fixUp(hair, head, 0.125, -0.03); this.hair = hair; }
    if (ceo && spine) { // gold-trimmed cape
      const cg = new THREE.PlaneGeometry(0.44, 0.9, 8, 10); { const q = cg.attributes.position; for (let i = 0; i < q.count; i++) { const x = q.getX(i), y = q.getY(i); q.setZ(i, -x * x * 1.6 - (y < 0 ? -y * 0.12 : 0) + Math.sin(x * 30) * 0.012 * (0.45 - y)); q.setX(i, x * (1 + (0.45 - y) * 0.35)); } cg.computeVertexNormals(); } cg.translate(0, -0.42, 0);
      const cape = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: "#7a1020", roughness: 0.8, side: THREE.DoubleSide }));
      spine.add(cape); this.fixUp(cape, spine, 0.2); cape.position.add(new THREE.Vector3(0, 0, -0.17).applyQuaternion(cape.quaternion.clone())); this.cape = cape;
    }
    this.speed = 0;
  }
  // bones in this rig are not world-axis aligned: orient attachments so they hang along world -Y in bind pose
  fixUp(mesh, bone, dy = 0, dz = 0) {
    this.model.updateMatrixWorld(true);
    const bq = bone.getWorldQuaternion(new THREE.Quaternion()), rq = this.model.getWorldQuaternion(new THREE.Quaternion());
    mesh.quaternion.copy(bq.invert().multiply(rq));
    const s = bone.getWorldScale(new THREE.Vector3()); const ms = this.model.getWorldScale(new THREE.Vector3());
    mesh.scale.multiplyScalar(ms.x / s.x);
    mesh.position.copy(new THREE.Vector3(0, dy, dz).applyQuaternion(mesh.quaternion).multiplyScalar(ms.x / s.x));
  }
  play(name, fade = 0.25, ts = 1) {
    if (this.cur === name) { if (this.actions[name]) this.actions[name].timeScale = ts; return; }
    const c = clips[name]; if (!c) return;
    const a = this.actions[name] || (this.actions[name] = this.mixer.clipAction(c));
    a.reset().setEffectiveWeight(1).fadeIn(fade).play(); a.timeScale = ts;
    if (this.cur && this.actions[this.cur]) this.actions[this.cur].fadeOut(fade);
    this.cur = name;
  }
  update(dt) { this.mixer.update(dt); }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
}

// A statue: pose the body once, bake skinned vertices into a static marble mesh (no runtime skinning).
export function bakeStatue(pose, mat) {
  const m = skClone(body); m.updateMatrixWorld(true);
  const bones = {}; m.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  if (pose) pose(bones, m);
  m.updateMatrixWorld(true);
  const geos = [];
  m.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (/eye/i.test(o.material?.name || "")) return;
    o.skeleton.update();
    const src = o.geometry, n = src.attributes.position.count, pos = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); pos.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); if (src.index) g.setIndex(src.index.clone());
    g.computeVertexNormals(); geos.push(g);
  });
  const grp = new THREE.Group(); for (const g of geos) { const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh); }
  grp.userData.bones = bones;
  grp.userData.boneWorld = (name) => { const b = bones[name]; return b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(); };
  return grp;
}
