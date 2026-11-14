// The explorable 3D camp: a cozy low-poly Appalachian Trail base camp drawn with three.js. Walk a hiker
// round the fire, the shelter, the tents and six places to visit; each place opens a Camp panel (the
// view decides what it shows). Everything here is drawing and input: layout, collisions, the camera
// rig, quality tiers, lighting and the board summaries live in engine/camp-world.js and are tested.
//
// Progressive enhancement: the 2D pixel camp is drawn first and stays as the fallback. three.js is
// vendored and only imported here, lazily, the first time Camp is opened. If WebGL2 is missing, the
// module fails to load, the GPU drops the context or frames stay very slow, the 2D camp comes back.
// One renderer is kept for the page's life and re-attached after every re-render, so the 60 s
// background refresh never rebuilds the GPU state or moves the hiker.
import { h, fill } from "./dom.js";
import { SCENES, SHIRTS, HATS } from "./camp-scene.js";
import {
  CAMP_LOCATIONS, CAMP_START, MOVE_KEYS, QUALITY, RUN_SPEED, TENT_SPOTS, WALK_SPEED, WORLD_RADIUS,
  campColliders, campLighting, campSeats, clampPitch, followCamera, forestRing, headingOf, joystickVector,
  keysVector, lowerQuality, moveActor, nearestLocation, qualityTier, seededRandom, stepFromInput, turnToward
} from "../engine/camp-world.js";

// Session-only preferences (localStorage holds only the last-chosen hiker).
const session = { webgl: null, degraded: false, optOut: false, quality: "auto", sensitivity: 1 };
let threeModule = null;
let world = null;
let mountToken = 0;

const loadThree = () => {
  threeModule = threeModule || import("../../../vendor/three/three.module.js");
  return threeModule;
};

// Short names for the floating signs (the full names are in the prompt and the text list).
const SIGN = { roster: "Campfire", bulletin: "Bulletin Board", journal: "Trail Journal", patches: "Patches", wildlife: "Wildlife", map: "Trail Map" };
const LANTERN_SPOTS = [{ x: -3.6, z: -5.6 }, { x: 3, z: -4.8 }, { x: -4.2, z: 3.6 }, { x: 5.4, z: 4.4 }];
const SKIN = 0xe6b98f;
const WOOD = 0x7a5a3c;
const WOOD_DARK = 0x5b4636;
const WOOD_LIGHT = 0x9a7a52;
const STONE = 0x8a8a84;
const PANTS = 0x3b4a5c;
const CREAM = 0xf4ead5;
const GOLD = 0xe0a43a;

const hex = (c) => (typeof c === "number" ? c : parseInt(String(c || "#888888").slice(1), 16));
function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

// three.js r163+ needs WebGL2. Checked once per page.
export function webglAvailable() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (session.degraded || session.optOut) return false;
  if (session.webgl === null) {
    try {
      const canvas = document.createElement("canvas");
      const gl = window.WebGL2RenderingContext ? canvas.getContext("webgl2") : null;
      session.webgl = Boolean(gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch (e) { session.webgl = false; }
  }
  return session.webgl;
}

export function camp3dEnabled() { return !session.optOut; }
export function enableCamp3d() { session.optOut = false; }

function autoTier() {
  const nav = navigator;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent || "") || (nav.maxTouchPoints > 1 && coarsePointer());
  return qualityTier({ dpr: window.devicePixelRatio || 1, cores: nav.hardwareConcurrency || 4, memory: nav.deviceMemory || 4,
    mobile, saveData: Boolean(nav.connection && nav.connection.saveData) });
}
const chosenTier = () => (session.quality === "auto" ? autoTier() : QUALITY[session.quality] || QUALITY.medium);

/**
 * Show the 3D camp in `holder` (which already shows the 2D camp). Returns false straight away when
 * the 3D camp can't run here, after calling onFallback.
 * @param opts.onInteract(id)      a camp location was used (walked up to and E, the button, or a tap)
 * @param opts.onSelectHiker(id)  a hiker by the fire was tapped
 * @param opts.onFallback(reason) the 2D camp should come back ("off" | "unavailable" | "load-failed" | "context-lost" | "slow" | "error")
 * @param opts.settings           an element to fill with the Controls and Settings panel
 * @param opts.data               { fraction, toKatahdin, patches: [{ id, color }], explorers, notes, selectedId }
 */
export function mountCamp3d(holder, ctx, opts = {}) {
  const token = ++mountToken;
  if (!webglAvailable()) { opts.onFallback?.(session.optOut ? "off" : "unavailable"); return false; }
  holder.classList.add("camp3d-loading");
  loadThree().then((THREE) => attach(THREE, token, holder, ctx, opts), () => {
    holder.classList.remove("camp3d-loading");
    session.degraded = true;
    opts.onFallback?.("load-failed");
  });
  return true;
}

// Stop drawing (the app calls this before every re-render; the next mount picks up where it was).
export function pauseCamp3d() {
  if (!world) return;
  stop(world);
  world.held.clear();
  endJoystick(world);
}

// Move the gold ring to the hiker chosen in "The Hikers".
export function markCampHiker(id) {
  if (!world) return;
  world.selectedId = id;
  placeSelection(world);
}

function attach(THREE, token, holder, ctx, opts, tries = 0) {
  if (token !== mountToken) return;
  if (!holder.isConnected) {
    if (tries < 20) requestAnimationFrame(() => attach(THREE, token, holder, ctx, opts, tries + 1));
    return;
  }
  try {
    if (!world) world = createWorld(THREE);
    world.opts = opts;
    world.selectedId = (opts.data && opts.data.selectedId) || null;
    build(world, ctx, opts.data || {});
    fill(holder, world.root);
    holder.classList.remove("camp3d-loading");
    holder.classList.add("is-3d");
    if (opts.settings) fill(opts.settings, settingsPanel(world));
    resize(world);
    start(world);
  } catch (e) {
    console.warn("3D camp unavailable", e);
    holder.classList.remove("camp3d-loading");
    fallback(world, "error", opts);
  }
}

function fallback(w, reason, opts = w && w.opts) {
  if (reason !== "off") session.degraded = true;
  if (w) {
    stop(w);
    w.resizeObserver?.disconnect();
    w.intersection?.disconnect();
    document.removeEventListener("visibilitychange", w.onVisibility);
    try { w.renderer.dispose(); } catch (e) { /* already gone */ }
    w.root.remove();
  }
  world = null;
  opts?.onFallback?.(reason);
}

// ---- Building blocks -------------------------------------------------------------------------------

function geo(w, type, ...args) {
  const key = `${type}:${args.join(",")}`;
  let g = w.geos.get(key);
  if (!g) { g = new w.THREE[type](...args); w.geos.set(key, g); }
  return g;
}

function mat(w, color, { basic = false, opacity = 1, fog = true, emissive = 0, additive = false } = {}) {
  const key = `${color}|${basic}|${opacity}|${fog}|${emissive}|${additive}`;
  let m = w.mats.get(key);
  if (!m) {
    const T = w.THREE;
    const o = { color: hex(color), fog, transparent: opacity < 1 || additive, opacity };
    if (additive) Object.assign(o, { blending: T.AdditiveBlending, depthWrite: false });
    if (opacity < 1) o.depthWrite = false;
    m = basic ? new T.MeshBasicMaterial(o) : new T.MeshLambertMaterial({ ...o, emissive: hex(emissive) });
    w.mats.set(key, m);
  }
  return m;
}

// A mesh in `parent` at (x, y, z), turned (rx, ry, rz) and stretched (sx, sy, sz).
function part(w, parent, [type, ...args], color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, ...look } = {}) {
  const mesh = new w.THREE.Mesh(geo(w, type, ...args), mat(w, color, look));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function group(w, parent, { x = 0, y = 0, z = 0, ry = 0 } = {}) {
  const g = new w.THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

// A canvas texture, remembered so a rebuild can free it.
function canvasTexture(w, width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const tex = new w.THREE.CanvasTexture(canvas);
  tex.colorSpace = w.THREE.SRGBColorSpace;
  w.disposables.push(tex);
  return tex;
}

function roundRect(g, x, y, width, height, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, width, height, r); else g.rect(x, y, width, height);
  g.fill();
}

// A name tag that always faces the camera.
function labelSprite(w, text, { height = 0.32, bg = "rgba(255,248,232,0.92)", ink = "#3b2f25" } = {}) {
  const font = "600 28px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + 28;
  const tex = canvasTexture(w, width, 44, (g, cw, ch) => {
    g.fillStyle = bg;
    roundRect(g, 0, 0, cw, ch, 12);
    g.font = font;
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, cw / 2, ch / 2 + 1);
  });
  const material = new w.THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  w.disposables.push(material);
  const sprite = new w.THREE.Sprite(material);
  sprite.scale.set((height * width) / 44, height, 1);
  return sprite;
}

// Soft round glow, shared by smoke, lanterns and the fire.
function softTexture(w) {
  if (!w.soft) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const g = canvas.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    w.soft = new w.THREE.CanvasTexture(canvas);
  }
  return w.soft;
}

function glowSprite(w, color, size, opacity = 0.8) {
  const material = new w.THREE.SpriteMaterial({ map: softTexture(w), color: hex(color), transparent: true, opacity,
    blending: w.THREE.AdditiveBlending, depthWrite: false, fog: false });
  w.disposables.push(material);
  const sprite = new w.THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

const shadow = (w, parent, r = 0.45, x = 0, z = 0) =>
  part(w, parent, ["CircleGeometry", 1, 16], 0x000000, { x, y: 0.025, z, rx: -Math.PI / 2, sx: r, sy: r, basic: true, opacity: 0.22 });

// A hiker: hat, head, shirt, arms and legs on hinges so walking can swing them. Faces +z.
function hikerModel(w, parent, { shirt, hat, pack = false, seated = false, pose = "sit" }) {
  const g = group(w, parent);
  const body = group(w, g, { y: seated ? -0.1 : 0 });
  const limb = (x, y, color, len, width) => {
    const hinge = group(w, body, { x, y });
    part(w, hinge, ["BoxGeometry", width, len, width], color, { y: -len / 2 });
    return hinge;
  };
  const legL = limb(-0.1, 0.5, PANTS, 0.5, 0.15);
  const legR = limb(0.1, 0.5, PANTS, 0.5, 0.15);
  part(w, body, ["BoxGeometry", 0.42, 0.5, 0.26], shirt, { y: 0.75 });
  const armL = limb(-0.28, 0.98, shirt, 0.46, 0.11);
  const armR = limb(0.28, 0.98, shirt, 0.46, 0.11);
  part(w, body, ["SphereGeometry", 0.17, 10, 8], SKIN, { y: 1.18 });
  part(w, body, ["CylinderGeometry", 0.17, 0.19, 0.12, 10], hat, { y: 1.33 });
  part(w, body, ["CylinderGeometry", 0.28, 0.28, 0.03, 12], hat, { y: 1.28 });
  if (pack) {
    part(w, body, ["BoxGeometry", 0.36, 0.46, 0.2], 0x7a5a3c, { y: 0.82, z: -0.22 });
    part(w, body, ["CylinderGeometry", 0.08, 0.08, 0.36, 8], 0x2f5d46, { y: 1.1, z: -0.24, rz: Math.PI / 2 });
  }
  if (seated) {
    legL.rotation.x = legR.rotation.x = -1.45;
    armL.rotation.x = armR.rotation.x = -0.5;
  }
  if (pose === "wave") armR.rotation.z = 2.5;
  if (pose === "read") part(w, body, ["BoxGeometry", 0.3, 0.04, 0.22], CREAM, { y: 0.78, z: 0.3, rx: -0.6 });
  if (pose === "cook") part(w, armR, ["CylinderGeometry", 0.015, 0.015, 0.9, 4], WOOD_DARK, { y: -0.45, z: 0.35, rx: 1.1 });
  g.userData.rig = { body, legL, legR, armL, armR, pose };
  return g;
}

// ---- The world (created once) ------------------------------------------------------------------

function createWorld(THREE) {
  const tier = chosenTier();
  const renderer = new THREE.WebGLRenderer({ antialias: tier.antialias, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
  const canvas = renderer.domElement;
  canvas.className = "camp3d-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-roledescription", "3D camp");
  canvas.setAttribute("aria-label", "Explorable 3D camp. Use W A S D or the arrow keys to walk, comma and period to turn the camera, and E to visit the nearest place. Every place is also in the Camp Locations list below.");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 170);
  const touch = coarsePointer();
  const ui = {
    status: h("p", { class: "sr-only", "aria-live": "polite" }),
    verb: h("span", {}),
    place: h("span", { class: "camp3d-place" }),
    knob: h("span", { class: "camp3d-knob" }),
    hint: h("p", { class: "camp3d-hint", "aria-hidden": "true" }, touch
      ? "Drag on the left to walk · drag on the right to look · tap a place to visit"
      : "Click the camp, then W A S D or arrows to walk · drag to look · E to visit")
  };
  ui.joy = h("div", { class: "camp3d-joy", hidden: true, "aria-hidden": "true" }, ui.knob);
  ui.act = h("button", { type: "button", class: "camp3d-act", onClick: () => { if (w.near) interact(w, w.near.id); } },
    h("kbd", { class: "camp3d-key", "aria-hidden": "true" }, "E"), ui.verb, ui.place);
  ui.prompt = h("div", { class: "camp3d-prompt", hidden: true }, ui.act);
  const w = {
    THREE, renderer, canvas, scene, camera, tier, ui,
    geos: new Map(), mats: new Map(), disposables: [], key: null,
    dynamic: new THREE.Group(),
    player: { x: CAMP_START.x, z: CAMP_START.z, heading: CAMP_START.heading, phase: 0, speed: 0 },
    cam: { yaw: 0, pitch: 0.42, pos: null },
    held: new Set(), joy: null, drag: null, near: null, running: false, raf: 0, last: 0, clock: 0,
    fps: { frames: 0, since: 0, slow: 0, warm: 0 }, colliders: campColliders(), pickables: [], anim: null,
    visible: true, selectedId: null, opts: {},
    raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(), camPos: new THREE.Vector3(), camLook: new THREE.Vector3()
  };
  scene.add(w.dynamic);
  w.playerMesh = hikerModel(w, scene, { shirt: 0xd4703a, hat: 0x2f5d46, pack: true, pose: "walk" });
  shadow(w, w.playerMesh, 0.42);
  const you = labelSprite(w, "You", { height: 0.3, bg: "rgba(224,164,58,0.95)" });
  you.position.y = 1.85;
  w.playerMesh.add(you);
  w.disposables = []; // the player's label lives for the page, never freed on rebuild
  w.root = h("div", { class: "camp3d" }, canvas, ui.joy, ui.prompt, ui.hint, ui.status);
  bindInput(w);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); fallback(w, "context-lost"); });
  w.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize(w)) : null;
  w.resizeObserver?.observe(w.root);
  w.intersection = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => { w.visible = entries.some((en) => en.isIntersecting); if (w.visible) start(w); else stop(w); })
    : null;
  w.intersection?.observe(w.root);
  w.onVisibility = () => { if (document.hidden) stop(w); else start(w); };
  document.addEventListener("visibilitychange", w.onVisibility);
  return w;
}

function resize(w) {
  const width = Math.max(1, w.root.clientWidth);
  const height = Math.max(1, w.root.clientHeight);
  w.renderer.setSize(width, height, false);
  w.camera.aspect = width / height;
  w.camera.updateProjectionMatrix();
}

function setTier(w, tier) {
  w.tier = tier;
  w.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
  resize(w);
  w.key = null;
  if (w.lastCtx) build(w, w.lastCtx, w.lastData || {});
}

// ---- The scene (rebuilt only when what it shows changes) -----------------------------------------

function clearDynamic(w) {
  w.dynamic.clear();
  w.disposables.forEach((d) => d.dispose());
  w.disposables = [];
  w.pickables = [];
}

function build(w, ctx, data) {
  w.lastCtx = ctx;
  w.lastData = data;
  const patches = (data.patches || []).slice(0, 12);
  const key = JSON.stringify([ctx.time, ctx.weather && ctx.weather.id, ctx.scene, ctx.scale, w.tier.id,
    ctx.people.map((p) => [p.id, p.name, p.pose, p.recent ? 1 : 0, p.seed]), patches.map((p) => p.id),
    data.explorers || 0, Math.min(data.notes || 0, 8), Math.round((data.fraction || 0) * 400), Math.round(data.toKatahdin || 0)]);
  if (key === w.key) { placeSelection(w); return; }
  w.key = key;
  clearDynamic(w);
  const T = w.THREE;
  const root = w.dynamic;
  const look = SCENES[ctx.scene] || SCENES["southern-ridges"];
  const light = campLighting(ctx.time, ctx.weather);
  const reduced = reducedMotion();
  const anim = { flames: [], smoke: [], fireflies: null, precip: null, wanderers: [], rings: [], wavers: [], fireLight: null, reduced };
  w.anim = anim;

  // Sky, fog and light.
  w.scene.background = new T.Color(light.sky);
  w.scene.fog = new T.Fog(light.fog, light.fogNear, light.fogFar);
  root.add(new T.HemisphereLight(light.ambient, hex(look.ground), light.ambientIntensity));
  const sun = new T.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(10, 4 + light.sunHeight * 14, 7);
  root.add(sun);

  // Ground, the clearing, the trail through camp and footpaths to each place.
  const ground = hex(look.ground);
  const dirt = mix(ground, 0x9a8462, 0.65);
  part(w, root, ["CircleGeometry", 1, 48], ground, { rx: -Math.PI / 2, sx: 80, sy: 80 });
  part(w, root, ["CircleGeometry", 1, 48], mix(ground, 0xc8b48a, 0.3), { y: 0.005, rx: -Math.PI / 2, sx: WORLD_RADIUS + 0.6, sy: WORLD_RADIUS + 0.6 });
  part(w, root, ["PlaneGeometry", 1, 1], dirt, { y: 0.01, rx: -Math.PI / 2, sx: 1.2, sy: 90 });
  part(w, root, ["CircleGeometry", 1, 24], dirt, { y: 0.012, rx: -Math.PI / 2, sx: 2.4, sy: 2.4 });
  CAMP_LOCATIONS.filter((l) => l.id !== "roster").forEach((l) => {
    const len = Math.hypot(l.x, l.z);
    part(w, root, ["PlaneGeometry", 1, 1], dirt, { x: l.x / 2, y: 0.011, z: l.z / 2, rx: -Math.PI / 2, rz: Math.atan2(l.x, l.z), sx: 0.8, sy: len });
  });

  // Hills: a near ridge fades into the fog, a far range stays as a silhouette against the sky.
  const rand = seededRandom(31);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
    const r = 34 + rand() * 6;
    const hgt = 6 + rand() * 6;
    part(w, root, ["ConeGeometry", 1, 1, 6], mix(hex(look.near), light.fog, 0.15), { x: Math.sin(a) * r, y: hgt / 2, z: Math.cos(a) * r, sx: 9 + rand() * 6, sy: hgt, sz: 9 + rand() * 6, ry: rand() });
  }
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.2;
    const r = 70 + rand() * 12;
    const hgt = 16 + rand() * 14;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    part(w, root, ["ConeGeometry", 1, 1, 7], mix(hex(look.far), light.sky, 0.4), { x, y: hgt / 2, z, sx: 16 + rand() * 10, sy: hgt, sz: 16 + rand() * 10, fog: false });
    if (look.snowcaps) part(w, root, ["ConeGeometry", 1, 1, 7], mix(0xffffff, light.sky, 0.2), { x, y: hgt * 0.86, z, sx: 4.5, sy: hgt * 0.28, sz: 4.5, fog: false });
  }

  // Water and boulders where the section has them.
  const water = look.water ? { x: -21, z: 10, r: 7 } : null;
  if (water) part(w, root, ["CircleGeometry", 1, 32], 0x5d8fb0, { x: water.x, y: 0.03, z: water.z, rx: -Math.PI / 2, sx: water.r, sy: water.r * 0.7 });
  if (look.rocks) {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      if (Math.abs(Math.sin(a)) < 0.15) continue;
      const r = 15.8 + rand() * 1.5;
      const s = 0.5 + rand() * 0.8;
      part(w, root, ["DodecahedronGeometry", 1, 0], STONE, { x: Math.sin(a) * r, y: s * 0.4, z: Math.cos(a) * r, sx: s * 1.3, sy: s, sz: s, ry: rand() * 3 });
    }
  }

  // The forest ring, instanced (two draw calls per kind, however many trees).
  const trees = forestRing(w.tier.trees).map((t) => (Math.abs(t.x) < 1.8 ? { ...t, x: t.x + Math.sign(t.x || 1) * 2.4 } : t))
    .filter((t) => !water || Math.hypot(t.x - water.x, t.z - water.z) > water.r + 1);
  const pines = trees.filter((t) => look.spruce || t.kind === "pine");
  const broad = trees.filter((t) => !(look.spruce || t.kind === "pine"));
  const dummy = new T.Object3D();
  const instanced = (list, geometry, color, place) => {
    if (!list.length) return;
    const m = new T.InstancedMesh(geometry, mat(w, color), list.length);
    list.forEach((t, i) => { place(t); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    root.add(m);
    w.disposables.push({ dispose: () => m.dispose() });
  };
  const reset = () => { dummy.rotation.set(0, 0, 0); };
  instanced(trees, geo(w, "CylinderGeometry", 0.14, 0.2, 1, 6), WOOD_DARK, (t) => { reset(); dummy.position.set(t.x, 0.6 * t.scale, t.z); dummy.scale.set(t.scale, 1.2 * t.scale, t.scale); });
  instanced(pines, geo(w, "ConeGeometry", 1, 1, 7), mix(hex(look.near), 0x1f3a2a, look.spruce ? 0.45 : 0.25), (t) => { reset(); dummy.position.set(t.x, 1 + 1.4 * t.scale, t.z); dummy.scale.set(1.1 * t.scale, 2.8 * t.scale, 1.1 * t.scale); });
  instanced(broad, geo(w, "IcosahedronGeometry", 1, 0), hex(look.near), (t) => { reset(); dummy.position.set(t.x, 1.3 + 1.1 * t.scale, t.z); dummy.rotation.set(0, t.x, 0); dummy.scale.set(1.3 * t.scale, 1.2 * t.scale, 1.3 * t.scale); });

  // The campfire: stones, logs, flames that flicker, a warm light and rising smoke.
  const fire = group(w, root);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    part(w, fire, ["DodecahedronGeometry", 1, 0], STONE, { x: Math.sin(a) * 0.85, y: 0.1, z: Math.cos(a) * 0.85, sx: 0.24, sy: 0.18, sz: 0.24, ry: a });
  }
  [0, 1.05, 2.1].forEach((a) => part(w, fire, ["CylinderGeometry", 0.08, 0.08, 1.1, 6], WOOD, { y: 0.12, rz: Math.PI / 2, ry: a }));
  const size = 0.75 + (ctx.scale.fire || 1) * 0.25;
  [[0xff7a1a, 0.42, 1.0], [0xffb52e, 0.3, 0.75], [0xffe08a, 0.16, 0.5]].forEach(([color, r, hgt], i) => {
    const flame = part(w, fire, ["ConeGeometry", 1, 1, 6], color, { y: 0.2 + (hgt * size) / 2, sx: r * size, sy: hgt * size, sz: r * size, basic: true });
    flame.userData.base = { sy: hgt * size, y: 0.2 + (hgt * size) / 2, phase: i * 1.7 };
    anim.flames.push(flame);
  });
  const glow = glowSprite(w, 0xff9a40, 3.2 * size, 0.55);
  glow.position.y = 0.6;
  fire.add(glow);
  anim.glow = glow;
  const fireLight = new T.PointLight(0xff9a40, light.fireIntensity, 16, 1.4);
  fireLight.position.set(0, 1.1, 0);
  root.add(fireLight);
  anim.fireLight = fireLight;
  anim.fireBase = light.fireIntensity;
  for (let i = 0; i < w.tier.smoke; i += 1) {
    const puff = glowSprite(w, light.stars ? 0x6a7080 : 0xb8b8b8, 0.6, 0.3);
    puff.material.blending = T.NormalBlending;
    puff.userData.phase = i / w.tier.smoke;
    fire.add(puff);
    anim.smoke.push(puff);
  }
  w.pickables.push(tagPick(fire, "location", "roster"));

  // The expedition's hikers, sitting round the fire on stumps, each with a name tag.
  const seats = campSeats(ctx.people.length);
  const seatColliders = [];
  w.hikerSpots = new Map();
  ctx.people.forEach((p, i) => {
    const seat = seats[i];
    const spot = group(w, root, { x: seat.x, z: seat.z, ry: seat.heading });
    part(w, spot, ["CylinderGeometry", 0.24, 0.27, 0.4, 8], WOOD, { y: 0.2, z: -0.05 });
    const model = hikerModel(w, spot, { shirt: SHIRTS[p.seed % SHIRTS.length], hat: HATS[(p.seed >> 3) % HATS.length], seated: true, pose: p.pose, pack: false });
    if (p.pose === "wave") anim.wavers.push(model);
    if (p.recent) part(w, spot, ["BoxGeometry", 0.34, 0.46, 0.2], 0x7a5a3c, { x: 0.5, y: 0.23, z: 0.05, ry: 0.4 });
    shadow(w, spot, 0.4);
    const tag = labelSprite(w, p.name, { height: 0.28 });
    tag.position.y = 1.62;
    spot.add(tag);
    w.pickables.push(tagPick(spot, "hiker", p.id));
    w.hikerSpots.set(p.id, seat);
    seatColliders.push({ id: `seat-${p.id}`, x: seat.x, z: seat.z, radius: 0.35, tall: false });
  });
  w.selectionRing = part(w, root, ["RingGeometry", 0.5, 0.64, 28], GOLD, { y: 0.03, rx: -Math.PI / 2, basic: true });
  placeSelection(w);

  // Tents, growing with the miles, doors turned to the fire.
  TENT_SPOTS.slice(0, ctx.scale.tents).forEach((t, i) => {
    const g = group(w, root, { x: t.x, z: t.z, ry: headingOf(-t.x, -t.z) });
    part(w, g, ["ConeGeometry", 1, 1, 4], SHIRTS[(i * 3 + 1) % SHIRTS.length], { y: 0.7, sx: 1.25, sy: 1.4, sz: 1.25, ry: Math.PI / 4 });
    part(w, g, ["BoxGeometry", 0.42, 0.62, 0.03], 0x2a2420, { y: 0.31, z: 0.47, rx: -0.55 });
  });

  // The shelter: an open-front lean-to on the trail, facing camp.
  const shelter = group(w, root, { x: 0, z: -11 });
  part(w, shelter, ["BoxGeometry", 4.6, 0.3, 2.8], WOOD_LIGHT, { y: 0.35 });
  part(w, shelter, ["BoxGeometry", 4.6, 2, 0.16], WOOD, { y: 1.3, z: -1.35 });
  part(w, shelter, ["BoxGeometry", 0.16, 2, 2.8], WOOD, { x: -2.3, y: 1.3 });
  part(w, shelter, ["BoxGeometry", 0.16, 2, 2.8], WOOD, { x: 2.3, y: 1.3 });
  [-2.2, 2.2].forEach((x) => part(w, shelter, ["CylinderGeometry", 0.09, 0.09, 2.5, 6], WOOD_DARK, { x, y: 1.25, z: 1.35 }));
  part(w, shelter, ["BoxGeometry", 5.2, 0.14, 3.6], WOOD_DARK, { y: 2.55, z: 0.1, rx: -0.3 });
  part(w, shelter, ["BoxGeometry", 0.4, 0.06, 0.3], CREAM, { x: 1.4, y: 0.53, z: 0.6 });

  // Trail Journal Tent: a canvas wall tent with a lantern by the door.
  const journal = place(w, root, "journal", { facing: "in" });
  part(w, journal, ["BoxGeometry", 2.4, 1.1, 2.6], 0xe8dcc0, { y: 0.55 });
  part(w, journal, ["CylinderGeometry", 1.45, 1.45, 2.7, 3], 0xd9c9a3, { y: 1.8, rx: -Math.PI / 2 });
  part(w, journal, ["BoxGeometry", 0.7, 0.95, 0.04], 0x5b4636, { y: 0.48, z: 1.31 });
  part(w, journal, ["BoxGeometry", 0.5, 0.5, 0.36], WOOD, { x: 0.85, y: 0.25, z: 1.7 });
  part(w, journal, ["BoxGeometry", 0.3, 0.05, 0.22], 0x8f2d1f, { x: 0.85, y: 0.53, z: 1.7 });

  // Expedition Bulletin Board: one note pinned per recent update.
  const board = place(w, root, "bulletin", { facing: "in" });
  [-0.75, 0.75].forEach((x) => part(w, board, ["CylinderGeometry", 0.07, 0.07, 2.1, 6], WOOD_DARK, { x, y: 1.05 }));
  part(w, board, ["BoxGeometry", 1.7, 1.1, 0.08], WOOD_LIGHT, { y: 1.35 });
  part(w, board, ["BoxGeometry", 1.95, 0.08, 0.5], WOOD_DARK, { y: 2.02, rx: 0.3 });
  const notes = Math.max(1, Math.min(data.notes || 0, 8));
  for (let i = 0; i < notes; i += 1) {
    part(w, board, ["BoxGeometry", 0.3, 0.24, 0.01], [CREAM, 0xf6cf5a, 0xcfe3c4, 0xf2c2b0][i % 4], { x: -0.55 + (i % 4) * 0.37, y: 1.6 - Math.floor(i / 4) * 0.42, z: 0.05, rz: (i % 3 - 1) * 0.08 });
  }

  // Patch Collection Display: an easel of the Expedition's newest patches, gold for State Explorers.
  const easel = place(w, root, "patches", { facing: "in" });
  [-0.8, 0.8].forEach((x) => part(w, easel, ["CylinderGeometry", 0.06, 0.06, 2, 6], WOOD_DARK, { x, y: 1, z: -0.05, rx: -0.12 }));
  part(w, easel, ["BoxGeometry", 1.8, 1.35, 0.06], 0x2f5d46, { y: 1.3 });
  if (!patches.length) part(w, easel, ["TorusGeometry", 0.17, 0.015, 6, 20], CREAM, { y: 1.3, z: 0.05 });
  patches.forEach((p, i) => {
    const px = -0.6 + (i % 4) * 0.4;
    const py = 1.75 - Math.floor(i / 4) * 0.4;
    part(w, easel, ["CylinderGeometry", 0.15, 0.15, 0.03, 16], p.color || SHIRTS[i % SHIRTS.length], { x: px, y: py, z: 0.05, rx: Math.PI / 2 });
    part(w, easel, ["TorusGeometry", 0.15, 0.02, 6, 16], CREAM, { x: px, y: py, z: 0.07 });
  });
  if (data.explorers) {
    part(w, easel, ["CylinderGeometry", 0.22, 0.22, 0.04, 20], 0xd9a520, { y: 2.2, z: 0.03, rx: Math.PI / 2, emissive: 0x3a2a00 });
  }

  // Wildlife Observation Area: a viewing deck and binoculars, looking out to the woods.
  const deck = place(w, root, "wildlife", { facing: "out" });
  part(w, deck, ["BoxGeometry", 2.2, 0.3, 2.2], WOOD_LIGHT, { y: 0.15 });
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([x, z]) => part(w, deck, ["CylinderGeometry", 0.05, 0.05, 0.9, 6], WOOD_DARK, { x, y: 0.75, z }));
  part(w, deck, ["BoxGeometry", 2.1, 0.06, 0.06], WOOD_DARK, { y: 1.15, z: 1 });
  [-0.35, 0, 0.35].forEach((x, i) => part(w, deck, ["CylinderGeometry", 0.025, 0.025, 1.2, 4], 0x3a3a3a, { x: x * 0.5, y: 0.85, z: 0.2 + (i - 1) * 0.05, rz: x * 0.6 }));
  [-0.08, 0.08].forEach((x) => part(w, deck, ["CylinderGeometry", 0.06, 0.06, 0.3, 8], 0x3a3a3a, { x, y: 1.45, z: 0.3, rx: Math.PI / 2 }));

  // Trail Map Table: the whole trail on parchment with the Expedition's spot marked.
  const table = place(w, root, "map", { facing: "in" });
  part(w, table, ["BoxGeometry", 2, 0.1, 1.3], WOOD, { y: 0.8 });
  [[-0.9, -0.55], [0.9, -0.55], [-0.9, 0.55], [0.9, 0.55]].forEach(([x, z]) => part(w, table, ["BoxGeometry", 0.08, 0.8, 0.08], WOOD_DARK, { x, y: 0.4, z }));
  const map = new T.Mesh(geo(w, "PlaneGeometry", 1.8, 1.1), new T.MeshLambertMaterial({ map: trailMapTexture(w, data.fraction || 0) }));
  w.disposables.push(map.material);
  map.position.set(0, 0.86, 0);
  map.rotation.x = -Math.PI / 2;
  table.add(map);

  // The pump, the bear bag line (one bag per hiker) and the trail signpost.
  const pump = group(w, root, { x: 4, z: -1.8 });
  part(w, pump, ["CylinderGeometry", 0.35, 0.4, 0.15, 10], STONE, { y: 0.07 });
  part(w, pump, ["CylinderGeometry", 0.11, 0.13, 1, 8], 0x2f5d46, { y: 0.6 });
  part(w, pump, ["BoxGeometry", 0.08, 0.08, 0.35], 0x2f5d46, { y: 0.85, z: 0.2 });
  part(w, pump, ["BoxGeometry", 0.05, 0.05, 0.6], 0x3a3a3a, { y: 1.15, z: -0.2, rx: 0.4 });
  const line = group(w, root, { x: -10, z: -1 });
  [-1.3, 1.3].forEach((z) => part(w, line, ["CylinderGeometry", 0.09, 0.11, 3.4, 6], WOOD_DARK, { y: 1.7, z }));
  part(w, line, ["CylinderGeometry", 0.015, 0.015, 2.6, 4], 0xd8cfb8, { y: 3.2, rx: Math.PI / 2 });
  const bags = Math.min(ctx.scale.bearBags || 0, 12);
  for (let i = 0; i < bags; i += 1) {
    const z = -1.1 + (2.2 * (i + 0.5)) / Math.max(bags, 1);
    part(w, line, ["CylinderGeometry", 0.006, 0.006, 0.4, 3], 0xd8cfb8, { y: 3, z });
    part(w, line, ["SphereGeometry", 0.15, 8, 6], SHIRTS[i % SHIRTS.length], { y: 2.7, z, sy: 1.3 });
  }
  const sign = group(w, root, { x: 0.9, z: 12 });
  part(w, sign, ["CylinderGeometry", 0.08, 0.08, 2.2, 6], WOOD_DARK, { y: 1.1 });
  part(w, sign, ["BoxGeometry", 0.9, 0.22, 0.05], WOOD_LIGHT, { y: 1.85, x: -0.25 });
  part(w, sign, ["BoxGeometry", 0.9, 0.22, 0.05], WOOD_LIGHT, { y: 1.5, x: 0.25 });
  const signText = labelSprite(w, data.toKatahdin > 0 ? `Katahdin ${Math.round(data.toKatahdin).toLocaleString("en-US")} mi ↑` : "Katahdin reached!", { height: 0.3, bg: "rgba(90,70,54,0.92)", ink: "#f4ead5" });
  signText.position.y = 2.4;
  sign.add(signText);

  // Lanterns on posts (more as the miles grow), lit in the evening and at night.
  LANTERN_SPOTS.slice(0, ctx.scale.lanterns || 0).forEach((s) => {
    const g = group(w, root, { x: s.x, z: s.z });
    part(w, g, ["CylinderGeometry", 0.05, 0.06, 1.6, 6], WOOD_DARK, { y: 0.8 });
    part(w, g, ["BoxGeometry", 0.18, 0.24, 0.18], light.lanterns ? 0xffe28a : 0x8a8a7a, { y: 1.72, basic: light.lanterns });
    if (light.lanterns) { const halo = glowSprite(w, 0xffc85a, 1.4, 0.6); halo.position.y = 1.72; g.add(halo); }
    seatColliders.push({ id: `lantern-${s.x}`, x: s.x, z: s.z, radius: 0.15, tall: false });
  });

  // Gold rings and signs mark the places you can visit.
  CAMP_LOCATIONS.forEach((l) => {
    const ring = part(w, root, ["RingGeometry", l.radius + 0.3, l.radius + 0.45, 32], GOLD, { x: l.x, y: 0.035, z: l.z, rx: -Math.PI / 2, basic: true, opacity: 0.45 });
    ring.userData.id = l.id;
    anim.rings.push(ring);
    const tag = labelSprite(w, SIGN[l.id], { height: 0.3, bg: "rgba(47,93,70,0.9)", ink: "#f4ead5" });
    tag.position.set(l.x, l.id === "roster" ? 2.5 : 2.75, l.z);
    root.add(tag);
  });

  // Camp life: fireflies at dusk, wildlife wandering the tree line, stars, rain or snow.
  if (light.fireflies) {
    const n = w.tier.fireflies;
    const pos = new Float32Array(n * 3);
    const seeds = Array.from({ length: n }, (_, i) => ({ a: rand() * Math.PI * 2, r: 4 + rand() * 10, y: 0.6 + rand() * 1.8, s: 0.2 + rand() * 0.5, i }));
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    const points = new T.Points(geometry, new T.PointsMaterial({ color: 0xfff27a, size: 0.14, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
    w.disposables.push(geometry, points.material);
    root.add(points);
    anim.fireflies = { points, seeds };
  }
  if (light.stars) {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const a = rand() * Math.PI * 2;
      const up = 0.15 + rand() * 0.85;
      const r = 120;
      pos.set([Math.cos(a) * Math.cos(up) * r, Math.sin(up) * r, Math.sin(a) * Math.cos(up) * r], i * 3);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    const stars = new T.Points(geometry, new T.PointsMaterial({ color: 0xffffff, size: 0.7, fog: false, transparent: true, opacity: 0.85 }));
    w.disposables.push(geometry, stars.material);
    root.add(stars);
  }
  if (light.rain || light.snow) {
    const n = w.tier.id === "low" ? 160 : 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) pos.set([(rand() - 0.5) * 26, rand() * 12, (rand() - 0.5) * 26], i * 3);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    const points = new T.Points(geometry, new T.PointsMaterial({ color: light.snow ? 0xffffff : 0xc8dcff, size: light.snow ? 0.12 : 0.06, transparent: true, opacity: 0.8, depthWrite: false }));
    w.disposables.push(geometry, points.material);
    root.add(points);
    anim.precip = { points, speed: light.snow ? 1.3 : 11, snow: light.snow };
  }
  const critters = [deerModel, rabbitModel, foxModel];
  for (let i = 0; i < w.tier.wanderers; i += 1) {
    const g = critters[i % critters.length](w, root);
    anim.wanderers.push({ g, r: 17 + i * 1.3, a: i * 2.1, speed: [0.05, 0.09, 0.07][i % 3] * (i % 2 ? -1 : 1), graze: i === 0 });
  }

  w.colliders = campColliders({ tents: ctx.scale.tents, extra: seatColliders });
  w.near = undefined;
}

// A camp location's group, turned to face the fire ("in") or away from it ("out").
function place(w, root, id, { facing }) {
  const l = CAMP_LOCATIONS.find((x) => x.id === id);
  const toFire = headingOf(-l.x, -l.z);
  const g = group(w, root, { x: l.x, z: l.z, ry: facing === "in" ? toFire : toFire + Math.PI });
  w.pickables.push(tagPick(g, "location", id));
  return g;
}

function tagPick(object, type, id) {
  object.userData.pick = { type, id };
  return object;
}

function placeSelection(w) {
  const seat = w.selectedId && w.hikerSpots && w.hikerSpots.get(w.selectedId);
  if (!w.selectionRing) return;
  w.selectionRing.visible = Boolean(seat);
  if (seat) w.selectionRing.position.set(seat.x, 0.03, seat.z);
}

function trailMapTexture(w, fraction) {
  return canvasTexture(w, 256, 160, (g, cw, ch) => {
    g.fillStyle = "#e9dcb8";
    g.fillRect(0, 0, cw, ch);
    g.strokeStyle = "#c9b98f";
    g.lineWidth = 6;
    g.strokeRect(3, 3, cw - 6, ch - 6);
    const rand = seededRandom(5);
    const pts = Array.from({ length: 24 }, (_, i) => { const t = i / 23; return [24 + t * 208 + (rand() - 0.5) * 10, 140 - t * 116 + (rand() - 0.5) * 14]; });
    const path = (upto) => { g.beginPath(); pts.slice(0, upto).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    g.lineCap = "round";
    g.lineWidth = 4;
    g.strokeStyle = "#8a6a4a";
    g.setLineDash([6, 5]);
    path(pts.length);
    g.setLineDash([]);
    const done = Math.max(1, Math.min(pts.length, Math.round(fraction * (pts.length - 1)) + 1));
    g.strokeStyle = "#c0392b";
    g.lineWidth = 5;
    path(done);
    const [x, y] = pts[done - 1];
    g.fillStyle = "#e0a43a";
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b2f25";
    g.font = "600 15px system-ui, sans-serif";
    g.fillText("Springer", 12, 154);
    g.textAlign = "right";
    g.fillText("Katahdin", 246, 20);
  });
}

function deerModel(w, root) {
  const g = group(w, root);
  const c = 0x8a6a4a;
  part(w, g, ["BoxGeometry", 0.36, 0.42, 0.95], c, { y: 0.85 });
  part(w, g, ["BoxGeometry", 0.16, 0.45, 0.16], c, { y: 1.2, z: 0.45, rx: -0.4 });
  part(w, g, ["BoxGeometry", 0.18, 0.18, 0.3], c, { y: 1.42, z: 0.6 });
  part(w, g, ["BoxGeometry", 0.1, 0.12, 0.06], 0xf4ead5, { y: 0.98, z: -0.5 });
  [[-0.12, 0.35], [0.12, 0.35], [-0.12, -0.35], [0.12, -0.35]].forEach(([x, z]) => part(w, g, ["BoxGeometry", 0.07, 0.64, 0.07], 0x5b4636, { x, y: 0.32, z }));
  shadow(w, g, 0.55);
  return g;
}

function rabbitModel(w, root) {
  const g = group(w, root);
  part(w, g, ["SphereGeometry", 0.18, 8, 6], 0xb49a7a, { y: 0.18, sz: 1.3 });
  part(w, g, ["SphereGeometry", 0.11, 8, 6], 0xb49a7a, { y: 0.32, z: 0.2 });
  [-0.04, 0.04].forEach((x) => part(w, g, ["BoxGeometry", 0.04, 0.18, 0.03], 0xb49a7a, { x, y: 0.48, z: 0.18 }));
  part(w, g, ["SphereGeometry", 0.05, 6, 4], 0xffffff, { y: 0.22, z: -0.24 });
  shadow(w, g, 0.25);
  return g;
}

function foxModel(w, root) {
  const g = group(w, root);
  const c = 0xd4703a;
  part(w, g, ["BoxGeometry", 0.24, 0.24, 0.6], c, { y: 0.4 });
  part(w, g, ["BoxGeometry", 0.2, 0.2, 0.22], c, { y: 0.55, z: 0.36 });
  part(w, g, ["ConeGeometry", 0.06, 0.2, 4], 0x3b2f25, { y: 0.55, z: 0.52, rx: Math.PI / 2 });
  part(w, g, ["CylinderGeometry", 0.03, 0.1, 0.5, 6], c, { y: 0.45, z: -0.48, rx: -1.2 });
  [[-0.08, 0.2], [0.08, 0.2], [-0.08, -0.2], [0.08, -0.2]].forEach(([x, z]) => part(w, g, ["BoxGeometry", 0.05, 0.3, 0.05], 0x3b2f25, { x, y: 0.15, z }));
  shadow(w, g, 0.35);
  return g;
}

// ---- Input ----------------------------------------------------------------------------------------

const TURN_KEYS = { Comma: 1, Period: -1 };

function bindInput(w) {
  const c = w.canvas;
  c.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (MOVE_KEYS.includes(e.code) || TURN_KEYS[e.code]) { w.held.add(e.code); e.preventDefault(); dismissHint(w); }
    else if (e.code === "ShiftLeft" || e.code === "ShiftRight") w.held.add("Shift");
    else if ((e.code === "KeyE" || e.key === "Enter" || e.key === " ") && w.near) { e.preventDefault(); interact(w, w.near.id); }
  });
  c.addEventListener("keyup", (e) => { w.held.delete(e.code === "ShiftLeft" || e.code === "ShiftRight" ? "Shift" : e.code); });
  c.addEventListener("blur", () => w.held.clear());
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  c.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    c.focus({ preventScroll: true });
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (e.pointerType !== "mouse" && !w.joy && x < r.width * 0.45) {
      w.joy = { id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0, sx: e.clientX, sy: e.clientY, moved: false };
      Object.assign(w.ui.joy.style, { left: `${x}px`, top: `${y}px` });
      w.ui.knob.style.transform = "translate(-50%, -50%)";
      w.ui.joy.hidden = false;
    } else if (!w.drag) {
      w.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    } else return;
    c.setPointerCapture?.(e.pointerId);
    dismissHint(w);
  });
  c.addEventListener("pointermove", (e) => {
    if (w.joy && e.pointerId === w.joy.id) {
      const r = c.getBoundingClientRect();
      let dx = e.clientX - r.left - w.joy.ox;
      let dy = e.clientY - r.top - w.joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > 48) { dx = (dx / len) * 48; dy = (dy / len) * 48; }
      w.joy.dx = dx;
      w.joy.dy = dy;
      if (Math.hypot(e.clientX - w.joy.sx, e.clientY - w.joy.sy) > 8) w.joy.moved = true;
      w.ui.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (w.drag && e.pointerId === w.drag.id) {
      const k = session.sensitivity;
      w.cam.yaw -= (e.clientX - w.drag.x) * 0.006 * k;
      w.cam.pitch = clampPitch(w.cam.pitch + (e.clientY - w.drag.y) * 0.004 * k);
      w.drag.x = e.clientX;
      w.drag.y = e.clientY;
      if (Math.hypot(e.clientX - w.drag.sx, e.clientY - w.drag.sy) > 8) w.drag.moved = true;
    }
  });
  const end = (e) => {
    if (w.joy && e.pointerId === w.joy.id) {
      const tap = !w.joy.moved && e.type === "pointerup";
      endJoystick(w);
      if (tap) pick(w, e.clientX, e.clientY);
    } else if (w.drag && e.pointerId === w.drag.id) {
      const tap = !w.drag.moved && e.type === "pointerup";
      w.drag = null;
      if (tap) pick(w, e.clientX, e.clientY);
    }
  };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
}

function endJoystick(w) {
  w.joy = null;
  w.drag = null;
  if (w.ui) w.ui.joy.hidden = true;
}

function dismissHint(w) {
  if (w.ui.hint.isConnected) w.ui.hint.remove();
}

// Tap or click: a place opens its panel, a hiker shows their page below.
function pick(w, cx, cy) {
  const r = w.canvas.getBoundingClientRect();
  w.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  w.raycaster.setFromCamera(w.ndc, w.camera);
  const hit = w.raycaster.intersectObjects(w.pickables, true).find((x) => x.object.type === "Mesh");
  let o = hit && hit.object;
  while (o && !o.userData.pick) o = o.parent;
  if (!o) return;
  const { type, id } = o.userData.pick;
  if (type === "location") interact(w, id);
  else if (type === "hiker") w.opts.onSelectHiker?.(id);
}

function interact(w, id) {
  w.held.clear();
  w.opts.onInteract?.(id);
}

function setNear(w, loc) {
  if (w.near === loc) return;
  w.near = loc;
  w.ui.prompt.hidden = !loc;
  if (!loc) { w.ui.status.textContent = ""; return; }
  w.ui.verb.textContent = loc.verb;
  w.ui.place.textContent = loc.name;
  w.ui.status.textContent = `Near the ${loc.name}. Press E or choose “${loc.verb}”.`;
}

// ---- Settings (session only) ----------------------------------------------------------------------

function settingsPanel(w) {
  const quality = h("select", { id: "camp3d-quality", onChange: (e) => {
    session.quality = e.target.value;
    w.fps.slow = 0;
    setTier(w, chosenTier());
  } }, [["auto", "Automatic"], ["low", "Low (smoothest)"], ["medium", "Medium"], ["high", "High (sharpest)"]]
    .map(([value, label]) => h("option", { value, selected: value === session.quality }, label)));
  const sensitivity = h("input", { id: "camp3d-sensitivity", type: "range", min: "0.4", max: "2", step: "0.1", value: String(session.sensitivity),
    "aria-describedby": "camp3d-sensitivity-hint", onInput: (e) => { session.sensitivity = Number(e.target.value) || 1; } });
  return h("details", { class: "timeline-wrap camp3d-settings" },
    h("summary", {}, "Controls and Settings"),
    h("ul", { class: "camp3d-help" },
      h("li", {}, "Walk: W A S D or the arrow keys (hold Shift to jog). On a touchscreen, drag on the left side of the camp."),
      h("li", {}, "Look around: drag with the mouse, or a finger on the right side. The comma and period keys turn the camera too."),
      h("li", {}, "Visit a place: walk up to it and press E or the button that appears, or click or tap it."),
      h("li", {}, "Tap a hiker by the fire to see their badges below.")),
    h("div", { class: "camp3d-fields" },
      h("div", { class: "field" }, h("label", { for: "camp3d-sensitivity" }, "Camera sensitivity"), sensitivity,
        h("p", { class: "hint", id: "camp3d-sensitivity-hint" }, "How fast dragging turns the camera.")),
      h("div", { class: "field" }, h("label", { for: "camp3d-quality" }, "Graphics quality"), quality)),
    h("button", { type: "button", class: "btn small", onClick: () => { session.optOut = true; fallback(w, "off"); } }, "Use the 2D camp instead"));
}

// ---- The loop -------------------------------------------------------------------------------------

function start(w) {
  if (w.running || !w.root.isConnected || !w.visible || document.hidden) return;
  w.running = true;
  w.last = performance.now();
  w.fps = { frames: 0, since: w.last, slow: w.fps.slow || 0, warm: w.last + 2500 };
  const frame = (now) => {
    if (!w.running) return;
    if (!w.root.isConnected) { stop(w); return; }
    w.raf = requestAnimationFrame(frame);
    const gap = now - w.last;
    if (w.tier.id === "low" && gap < 30) return; // about 30 fps keeps phones cool
    w.last = now;
    const dt = Math.min(gap / 1000, 0.1);
    update(w, dt);
    w.renderer.render(w.scene, w.camera);
    measure(w, now);
  };
  w.raf = requestAnimationFrame(frame);
}

function stop(w) {
  w.running = false;
  cancelAnimationFrame(w.raf);
}

// Automatic quality: step down when frames stay slow; give up on 3D only if even Low can't keep up.
function measure(w, now) {
  const f = w.fps;
  if (now < f.warm) { f.since = now; f.frames = 0; return; }
  f.frames += 1;
  const span = now - f.since;
  if (span < 2000) return;
  const fps = (f.frames * 1000) / span;
  f.frames = 0;
  f.since = now;
  if (session.quality !== "auto") return;
  if (fps >= 22) { f.slow = 0; return; }
  f.slow += 1;
  if (f.slow < 2) return;
  f.slow = 0;
  const lower = lowerQuality(w.tier);
  if (lower) { setTier(w, lower); f.warm = now + 2000; } else if (fps < 10) fallback(w, "slow");
}

function update(w, dt) {
  w.clock += dt;
  const t = w.clock;
  const p = w.player;
  const keys = keysVector(w.held);
  const input = w.joy ? joystickVector(w.joy.dx, w.joy.dy) : keys;
  const turn = (w.held.has("Comma") ? 1 : 0) - (w.held.has("Period") ? 1 : 0);
  if (turn) w.cam.yaw += turn * 1.8 * dt * session.sensitivity;
  if (input.strength > 0) {
    const run = w.held.has("Shift") || (w.joy && input.strength > 0.92);
    const step = stepFromInput(input, w.cam.yaw, run ? RUN_SPEED : WALK_SPEED, dt);
    const next = moveActor(p, step.dx, step.dz, w.colliders);
    p.heading = turnToward(p.heading, headingOf(step.dx, step.dz), dt * 12);
    p.x = next.x;
    p.z = next.z;
    p.speed = input.strength * (run ? 1.6 : 1);
    p.phase += dt * 9 * p.speed;
  } else p.speed = Math.max(0, p.speed - dt * 6);
  w.playerMesh.position.set(p.x, 0, p.z);
  w.playerMesh.rotation.y = p.heading;
  const rig = w.playerMesh.userData.rig;
  const swing = Math.sin(p.phase) * 0.6 * Math.min(p.speed, 1);
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.8;
  rig.armR.rotation.x = swing * 0.8;

  const view = followCamera(p, w.cam.yaw, w.cam.pitch, w.colliders);
  const target = w.camPos.set(view.x, view.y, view.z);
  if (!w.cam.pos) w.cam.pos = target.clone();
  else w.cam.pos.lerp(target, 1 - Math.exp(-dt * 10));
  w.camera.position.copy(w.cam.pos);
  w.camera.lookAt(w.camLook.set(view.look.x, view.look.y, view.look.z));

  setNear(w, nearestLocation(p));
  const a = w.anim;
  if (!a) return;
  a.rings.forEach((ring) => { ring.material.opacity = w.near && w.near.id === ring.userData.id ? 0.85 : 0.45; });
  if (a.reduced) return;
  a.flames.forEach((f) => {
    const b = f.userData.base;
    const k = 1 + Math.sin(t * 9 + b.phase) * 0.08 + Math.sin(t * 23 + b.phase * 2) * 0.05;
    f.scale.y = b.sy * k;
    f.position.y = 0.2 + (b.sy * k) / 2;
    f.rotation.y = t * 0.6 + b.phase;
  });
  if (a.fireLight) a.fireLight.intensity = a.fireBase * (1 + Math.sin(t * 11) * 0.07 + Math.sin(t * 17.3) * 0.05);
  a.smoke.forEach((puff) => {
    const u = (t * 0.18 + puff.userData.phase) % 1;
    puff.position.set(Math.sin(u * 5 + puff.userData.phase * 9) * 0.3 + u * 0.6, 1 + u * 4.2, Math.cos(u * 4) * 0.2);
    const s = 0.5 + u * 1.8;
    puff.scale.set(s, s, 1);
    puff.material.opacity = 0.32 * (1 - u) * Math.min(u * 6, 1);
  });
  a.wavers.forEach((m) => { m.userData.rig.armR.rotation.z = 2.4 + Math.sin(t * 5) * 0.35; });
  if (a.fireflies) {
    const attr = a.fireflies.points.geometry.getAttribute("position");
    a.fireflies.seeds.forEach((s) => {
      const ang = s.a + t * s.s * 0.3;
      attr.setXYZ(s.i, Math.sin(ang) * s.r + Math.sin(t * 1.3 + s.i) * 0.4, s.y + Math.sin(t * 2 + s.i * 1.7) * 0.3, Math.cos(ang) * s.r);
    });
    attr.needsUpdate = true;
    a.fireflies.points.material.opacity = 0.55 + Math.sin(t * 3) * 0.35;
  }
  if (a.precip) {
    const attr = a.precip.points.geometry.getAttribute("position");
    for (let i = 0; i < attr.count; i += 1) {
      let y = attr.getY(i) - a.precip.speed * dt;
      if (y < 0) y += 12;
      attr.setY(i, y);
      if (a.precip.snow) attr.setX(i, attr.getX(i) + Math.sin(t + i) * dt * 0.3);
    }
    attr.needsUpdate = true;
    a.precip.points.position.set(p.x, 0, p.z);
  }
  a.wanderers.forEach((c) => {
    const pause = c.graze && Math.sin(t * 0.4) > 0.55;
    if (!pause) c.a += c.speed * dt;
    const x = Math.sin(c.a) * c.r;
    const z = Math.cos(c.a) * c.r;
    c.g.position.set(x, c.graze && !pause ? Math.abs(Math.sin(t * 6)) * 0.03 : 0, z);
    c.g.rotation.y = headingOf(Math.cos(c.a) * Math.sign(c.speed), -Math.sin(c.a) * Math.sign(c.speed));
    if (!c.graze) c.g.position.y = Math.abs(Math.sin(t * 7 + c.r)) * 0.12;
  });
}
