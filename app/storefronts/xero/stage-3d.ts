/**
 * The bike, in three dimensions.
 *
 * Loaded on demand and never on the server: three plus a 5.8 MB model is not
 * something a phone should pay for before it has painted the page. The stage
 * shows its photographs first, imports this module once the canvas is on
 * screen, and swaps to the model when it is ready. If WebGL is missing, if the
 * fetch fails, or if the reader has asked for less motion, the photographs are
 * what stay — there is no failure state where the stage is empty.
 *
 * There is no idle render loop. Frames are drawn while the model is being
 * dragged, while it is settling, and while auto-spin is on; the rest of the
 * time the canvas costs nothing.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export interface Stage {
  /** Turn the bike to an absolute heading, in radians. */
  turnTo(yaw: number): void;
  /** Nudge the heading — the chevron buttons. */
  nudge(delta: number): void;
  reset(): void;
  setSpin(on: boolean): void;
  setNight(night: boolean): void;
  destroy(): void;
}

const MODEL = "/media/xero-chiron.glb";

export async function mountStage(
  canvas: HTMLCanvasElement,
  opts: { night?: boolean; onReady?: () => void } = {},
): Promise<Stage | null> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // A key, a fill and a rim. The bike is raw brushed aluminium, so it reads as
  // metal only if there is something for it to reflect: the environment below
  // does that job, the lights shape it.
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3.2, 4.4, 2.6);
  const fill = new THREE.DirectionalLight(0xcfd6ff, 0.75);
  fill.position.set(-3.6, 1.6, -1.2);
  const rim = new THREE.DirectionalLight(0xa46bff, 1.1); // the LED's own colour
  rim.position.set(-1.4, 1.2, -3.4);
  scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.35));

  const env = new THREE.PMREMGenerator(renderer);
  scene.environment = env.fromScene(new THREE.Scene().add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x8e93a8, side: THREE.BackSide }),
  )), 0.04).texture;

  const loader = new GLTFLoader();
  // Wired as the brief asks. This particular file is uncompressed, so the
  // decoder is never actually fetched — it costs nothing until a model that
  // needs it is published.
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  loader.setDRACOLoader(draco);

  let gltf;
  try {
    gltf = await loader.loadAsync(MODEL);
  } catch {
    renderer.dispose();
    return null;
  }

  const bike = gltf.scene;
  // Sit it on the origin at a known size, whatever the file's own units and
  // pivot happen to be. Auto-fitting means a re-exported model does not need
  // the camera numbers here touched.
  const box = new THREE.Box3().setFromObject(bike);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = 1.89 / Math.max(size.x, size.z);
  bike.scale.setScalar(scale);
  bike.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);

  const pivot = new THREE.Group();
  pivot.add(bike);
  scene.add(pivot);

  camera.position.set(0, 0.95, 4.35);
  camera.lookAt(0, 0.62, 0);

  let yaw = -0.6;
  let target = yaw;
  let spin = false;
  let raf = 0;
  let last = 0;
  let alive = true;

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    // Capped at 2: past that the extra pixels are invisible and the frame cost
    // is real, especially on the phones that are most of this traffic.
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };

  function draw() {
    pivot.rotation.y = yaw;
    renderer.render(scene, camera);
  }

  /** Runs only while there is something to animate, then stops itself. */
  function pump(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (spin) target += dt * 0.45;
    // Critically damped-ish approach, frame-rate independent.
    yaw += (target - yaw) * (1 - Math.exp(-9 * dt));
    draw();
    if (spin || Math.abs(target - yaw) > 0.0008) raf = requestAnimationFrame(pump);
    else { yaw = target; draw(); raf = 0; }
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(pump); } };

  /* ------------------------------------------------------------ dragging */
  let down = false;
  let lastX = 0;
  const onDown = (e: PointerEvent) => {
    down = true; lastX = e.clientX; spin = false;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!down) return;
    // A full drag across the canvas is a bit more than one turn, which is the
    // rate that feels like pushing the object rather than scrubbing a slider.
    target += ((e.clientX - lastX) / Math.max(1, canvas.clientWidth)) * Math.PI * 2.4;
    lastX = e.clientX;
    kick();
  };
  const onUp = (e: PointerEvent) => {
    down = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  opts.onReady?.();

  return {
    turnTo(next) { target = next; kick(); },
    nudge(delta) { spin = false; target += delta; kick(); },
    reset() { spin = false; target = -0.6; kick(); },
    setSpin(on) { spin = on; if (on) kick(); },
    setNight(night) {
      rim.intensity = night ? 1.5 : 0.7;
      key.intensity = night ? 1.5 : 2.4;
      renderer.toneMappingExposure = night ? 0.9 : 1.05;
      draw();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      bike.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
      });
      env.dispose();
      renderer.dispose();
    },
  };
}
