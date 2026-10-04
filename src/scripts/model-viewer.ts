/**
 * Interactive 3D model viewer, loaded on demand by Model3D.astro: three.js and the model are only downloaded
 * when the reader taps "Explore in 3D". The figure's static HTML holds the buttons and the parts list; this
 * module builds the scene and wires them up.
 *
 * Models are in body coordinates: +x = the patient's left, +y = superior, +z = anterior.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export type Direction = 'anterior' | 'posterior' | 'superior' | 'inferior' | 'left' | 'right';
export interface ViewerPart {
  id: string;
  node: string;
  label: string;
  group: string;
  color: string;
  side?: 'right' | 'left';
  internal: boolean;
  note: string; // HTML
  href?: string;
  toName?: string;
}
export interface ViewerConfig {
  file: string;
  parts: ViewerPart[];
  views: { name: string; from: Direction | [number, number, number]; hide: string[]; note?: string }[];
  focus?: string; // part selected on load
}

/** An error whose message is meant for the reader. */
export class ViewerError extends Error {
  name = 'ViewerError';
}

// Straight up or down, the camera leans a hair so anterior stays at the top of the screen.
const DIRECTIONS: Record<Direction, [number, number, number]> = {
  anterior: [0, 0, 1],
  posterior: [0, 0, -1],
  superior: [0, 1, -0.01],
  inferior: [0, -1, 0.01],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};
const SIDE_COLORS = { right: '#3f6fd1', left: '#cf3f3a', none: '#8a55b8' };
const HIGHLIGHT = new THREE.Color('#22d3b4'); // teal: unlike any tissue or side color
const BLACK = new THREE.Color(0);
const GLASS_OPACITY = 0.16;

interface PartState {
  part: ViewerPart;
  meshes: THREE.Mesh[];
  material: THREE.MeshPhysicalMaterial;
  real: THREE.Color;
  bySide: THREE.Color;
  visible: boolean;
}

const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const shuffle = <T>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function mount(fig: HTMLElement, cfg: ViewerConfig) {
  const $ = <T extends Element = HTMLElement>(sel: string) => fig.querySelector<T>(sel)!;
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...fig.querySelectorAll<T>(sel)];
  const stage = $('.m3d-stage');
  const status = $('[data-status]');
  const info = $('[data-info]');
  const hint = info.innerHTML;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- renderer, scene, camera ----------
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    throw new ViewerError("This browser can't show 3D graphics (WebGL is turned off or not supported).");
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'm3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', fig.dataset.alt ?? '3D model');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 10);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(0.6, 1, 0.8); // relative to the camera, so the lit side follows the view
  camera.add(keyLight);
  scene.add(camera);

  // ---------- model ----------
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let gltf: GLTF;
  try {
    gltf = await loader.loadAsync(cfg.file, (e) => {
      status.textContent = e.total
        ? `Loading 3D model… ${Math.round((e.loaded / e.total) * 100)}%`
        : `Loading 3D model… ${(e.loaded / 1e6).toFixed(1)} MB`;
    });
  } catch {
    renderer.dispose();
    throw new ViewerError("The 3D model couldn't load. Check your connection and try again.");
  }
  const root = gltf.scene;
  const parts = new Map<string, PartState>();
  const byMesh = new Map<THREE.Object3D, PartState>();
  for (const part of cfg.parts) {
    const obj = root.getObjectByName(part.node);
    if (!obj) {
      console.warn(`[3D] "${part.node}" is not in ${cfg.file}`);
      continue;
    }
    const real = new THREE.Color(part.color);
    const state: PartState = {
      part,
      meshes: [],
      real,
      bySide: new THREE.Color(SIDE_COLORS[part.side ?? 'none']).lerp(real, 0.3),
      material: new THREE.MeshPhysicalMaterial({
        color: real,
        roughness: 0.55,
        clearcoat: 0.35, // a wet sheen, like fresh tissue
        clearcoatRoughness: 0.35,
        side: THREE.DoubleSide,
      }),
      visible: true,
    };
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.material = state.material;
      o.renderOrder = part.internal ? 0 : 1; // see-through walls draw after what's inside them
      state.meshes.push(o);
      byMesh.set(o, state);
    });
    parts.set(part.id, state);
  }
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !byMesh.has(o)) o.visible = false; // unlisted meshes
  });
  const box = new THREE.Box3();
  for (const mesh of byMesh.keys()) box.expandByObject(mesh);
  root.position.sub(box.getCenter(new THREE.Vector3()));
  scene.add(root);
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduceMotion;
  controls.minDistance = radius * 1.1;
  controls.maxDistance = radius * 8;
  controls.screenSpacePanning = true;

  // ---------- render loop (only draws when something changed; pauses off-screen) ----------
  let dirty = true;
  let tween: ((now: number) => boolean) | null = null;
  let raf = 0;
  controls.addEventListener('change', () => (dirty = true));
  controls.addEventListener('start', () => (tween = null)); // the reader grabbed the model mid-swing
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (tween && !tween(now)) tween = null;
    if (!tween) controls.update();
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
  };
  const start = () => (raf ||= requestAnimationFrame(frame));
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(stage);

  const fitDistance = () => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.8; // the bounding sphere is roomier than the outline
  };
  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  /** Swings the camera round to look from `from` (a direction from the model's center), framing the whole model. */
  function look(from: ViewerConfig['views'][number]['from'], animate = !reduceMotion) {
    const target = new THREE.Vector3(...(Array.isArray(from) ? from : DIRECTIONS[from])).normalize();
    const toDist = fitDistance();
    if (!animate) {
      controls.target.set(0, 0, 0);
      camera.position.copy(target).multiplyScalar(toDist);
      camera.lookAt(0, 0, 0);
      controls.update();
      dirty = true;
      return;
    }
    const fromTarget = controls.target.clone();
    const offset = camera.position.clone().sub(fromTarget);
    const fromDist = offset.length();
    const turn = new THREE.Quaternion().setFromUnitVectors(offset.normalize(), target);
    const q = new THREE.Quaternion();
    const t0 = performance.now();
    tween = (now) => {
      const t = Math.min(1, (now - t0) / 650);
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
      q.identity().slerp(turn, k);
      controls.target.lerpVectors(fromTarget, new THREE.Vector3(), k);
      camera.position
        .copy(offset)
        .applyQuaternion(q)
        .multiplyScalar(THREE.MathUtils.lerp(fromDist, toDist, k))
        .add(controls.target);
      camera.lookAt(controls.target);
      dirty = true;
      if (t === 1) controls.update();
      return t < 1;
    };
  }

  // ---------- state ----------
  let selected: PartState | null = null;
  let glass = false; // see-through walls
  let bySide = false; // right heart blue, left heart red
  let quiz: { target: PartState; score: number; asked: number; answered: boolean } | null = null;

  function paint() {
    for (const s of parts.values()) {
      const m = s.material;
      const color = bySide ? s.bySide : s.real;
      m.color.copy(color);
      if (s === selected) m.color.lerp(HIGHLIGHT, 0.7);
      const see = glass && !s.part.internal;
      if (m.transparent !== see) m.needsUpdate = true;
      m.transparent = see;
      m.depthWrite = !see;
      m.opacity = see ? (s === selected ? 0.4 : GLASS_OPACITY) : 1;
      m.emissive.copy(s === selected ? HIGHLIGHT : BLACK);
      m.emissiveIntensity = s === selected ? 0.3 : 0;
      for (const mesh of s.meshes) mesh.visible = s.visible;
      const row = $(`[data-part="${s.part.id}"]`);
      row.querySelector<HTMLElement>('.m3d-swatch')!.style.background = '#' + color.getHexString();
      row.querySelector<HTMLInputElement>('[data-show]')!.checked = s.visible;
      row.querySelector('[data-select]')!.setAttribute('aria-pressed', String(s === selected && !quiz));
    }
    $('[data-toggle="glass"]').setAttribute('aria-pressed', String(glass));
    $('[data-toggle="side"]').setAttribute('aria-pressed', String(bySide));
    dirty = true;
  }

  function describe(s: PartState | null) {
    if (!s) return (info.innerHTML = hint);
    const p = s.part;
    info.innerHTML =
      `<p><strong>${esc(p.label)}</strong> <span class="muted small">· ${esc(p.group)}</span></p>` +
      (p.note ? `<p class="small">${p.note}</p>` : '') +
      (p.href ? `<p class="small">Atlas entry: <a href="${esc(p.href)}">${esc(p.toName)} →</a></p>` : '');
  }

  function select(id: string | null) {
    selected = (id && parts.get(id)) || null;
    if (selected) {
      selected.visible = true;
      if (selected.part.internal) glass = true;
    }
    paint();
    describe(selected);
  }

  // ---------- quiz: name the highlighted part ----------
  function ask() {
    const pool = [...parts.values()];
    const prev = quiz!.target;
    const target = shuffle(pool.filter((s) => s !== prev))[0];
    // distractors from the same group first, so the choice isn't obvious
    const others = shuffle(pool.filter((s) => s !== target));
    others.sort((a, b) => Number(b.part.group === target.part.group) - Number(a.part.group === target.part.group));
    const choices = shuffle([target, ...others.slice(0, 3)]);
    quiz = { ...quiz!, target, answered: false };
    for (const s of pool) s.visible = true;
    selected = target;
    glass = target.part.internal;
    paint();
    info.innerHTML =
      `<p><strong>Which part is highlighted?</strong> <span class="muted small">Score ${quiz.score}/${quiz.asked}</span></p>` +
      `<div class="m3d-choices">${choices
        .map((c) => `<button type="button" class="btn" data-answer="${c.part.id}">${esc(c.part.label)}</button>`)
        .join('')}</div>`;
  }

  function answer(btn: HTMLElement) {
    if (!quiz || quiz.answered) return;
    const right = btn.dataset.answer === quiz.target.part.id;
    quiz.answered = true;
    quiz.asked++;
    if (right) quiz.score++;
    for (const b of info.querySelectorAll<HTMLButtonElement>('[data-answer]')) {
      b.disabled = true;
      if (b.dataset.answer === quiz.target.part.id) b.classList.add('right');
      else if (b === btn) b.classList.add('wrong');
    }
    info.querySelector('.small')!.textContent = `Score ${quiz.score}/${quiz.asked}`;
    const p = quiz.target.part;
    info.insertAdjacentHTML(
      'beforeend',
      `<p class="small"><strong>${right ? 'Correct.' : `It's the ${esc(p.label.toLowerCase())}.`}</strong> ${p.note}</p>` +
        `<button type="button" class="btn tool-btn" data-next>Next part</button>`,
    );
  }

  function setQuiz(on: boolean) {
    quiz = on ? { target: null as unknown as PartState, score: 0, asked: 0, answered: false } : null;
    fig.classList.toggle('m3d-quizzing', on);
    const btn = $('[data-quiz]');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'End quiz' : 'Quiz me';
    if (on) ask();
    else select(null);
  }

  // ---------- events ----------
  const pointer = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    const tap = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6;
    down = null;
    if (!tap || quiz) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects([...byMesh.keys()].filter((m) => m.visible), false);
    // with see-through walls, a tap goes to what's inside them
    const hit = (glass && hits.find((h) => byMesh.get(h.object)!.part.internal)) || hits[0];
    select(hit ? byMesh.get(hit.object)!.part.id : null);
  });

  $$('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const view = cfg.views[Number(btn.dataset.view)];
      if (quiz) setQuiz(false);
      for (const s of parts.values()) s.visible = !view.hide.includes(s.part.id);
      selected = null;
      paint();
      info.innerHTML = `<p class="small"><strong>${esc(view.name)}.</strong> ${esc(view.note ?? '')}</p>`;
      look(view.from);
    }),
  );
  $('[data-toggle="glass"]').addEventListener('click', () => {
    glass = !glass;
    paint();
  });
  $('[data-toggle="side"]').addEventListener('click', () => {
    bySide = !bySide;
    paint();
  });
  $('[data-quiz]').addEventListener('click', () => setQuiz(!quiz));
  info.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-answer]')) answer(el.closest<HTMLElement>('[data-answer]')!);
    else if (el.closest('[data-next]')) ask();
  });
  $$<HTMLInputElement>('[data-show]').forEach((box) =>
    box.addEventListener('change', () => {
      const s = parts.get(box.dataset.show!)!;
      s.visible = box.checked;
      if (!s.visible && s === selected) select(null);
      else paint();
    }),
  );
  $$('[data-select]').forEach((btn) =>
    btn.addEventListener('click', () => select(btn.dataset.select === selected?.part.id ? null : btn.dataset.select!)),
  );

  // ---------- go ----------
  look(cfg.views[0]?.from ?? 'anterior', false);
  stage.append(canvas);
  if (cfg.focus) select(cfg.focus);
  else paint();
  renderer.render(scene, camera);
  fig.classList.add('m3d-live');
  $('.m3d-controls').hidden = false;
  start();
}
