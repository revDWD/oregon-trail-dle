// The explorable 3D camp: a cozy low-poly Appalachian Trail base camp drawn with three.js. Walk a hiker
// round the fire, the shelter, the tents and six places to visit; each place opens a Camp panel (the
// view decides what it shows). The expedition's hikers go about their day around camp, wildlife
// wanders through now and then, and a photo camera (C) frames whatever you point it at. Everything here
// is drawing and input: layout, collisions, the camera rig, quality tiers and lighting live in
// engine/camp-world.js, and hikers' activities, visitors, plants and photo framing in
// engine/camp-life.js. Both are tested.
//
// Progressive enhancement: the 2D pixel camp is drawn first and stays as the fallback. three.js is
// vendored and only imported here, lazily, the first time Camp is opened. If WebGL2 is missing, the
// module fails to load, the GPU drops the context or frames stay very slow, the 2D camp comes back.
// One renderer is kept for the page's life and re-attached after every re-render, so the 60 s
// background refresh never rebuilds the GPU state or moves the hiker.
import { h, fill } from "./dom.js";
import { SCENES, SHIRTS, HATS } from "./camp-scene.js";
import {
  BENCH_SEATS, CAMP_LOCATIONS, CAMP_PROPS, CAMP_START, FIRE_BENCHES, LANTERN_SPOTS, MOVE_KEYS, PLAYER_RADIUS, QUALITY, RUN_SPEED,
  TENT_SPOTS, WALK_SPEED, WORLD_RADIUS, campColliders, campLighting, clampPitch, followCamera, forestRing, headingOf,
  joystickVector, keysVector, lowerQuality, moveActor, nearestLocation, qualityTier, seededRandom, stepFromInput, turnToward
} from "../engine/camp-world.js";
import {
  CAMP_PATHS, FALLEN_LOG, NPC_RADIUS, OVERLOOK, activityLabel, allActivitySpots, campFlora, createCampLife, createVisitors,
  describeNpc, describeVisitor, floraFor, framePhoto, photoCaption, projectPoint, stepCampLife, stepVisitors, vantagePoints, waryDistance
} from "../engine/camp-life.js";

// Session-only preferences and the photo roll (localStorage holds only the last-chosen hiker; camp
// photos live in memory until the page closes and are never uploaded).
const session = { webgl: null, degraded: false, optOut: false, quality: "auto", sensitivity: 1, photos: [] };
const MAX_PHOTOS = 12;
const EYE = 1.55; // the photo camera's height
const FOV = 55;
const MIN_FOV = 20;
let threeModule = null;
let world = null;
let mountToken = 0;

const loadThree = () => {
  threeModule = threeModule || import("../../../vendor/three/three.module.js");
  return threeModule;
};

// Short names for the floating signs (the full names are in the prompt and the text list).
const SIGN = { roster: "Campfire", bulletin: "Bulletin Board", journal: "Trail Journal", patches: "Patches", wildlife: "Wildlife", map: "Trail Map" };
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
 * @param opts.life               an element to fill with Around Camp Now and Camp Photos (the text version of camp life)
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
    if (opts.life) fill(opts.life, lifePanel(world));
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
    clearTimeout(w.toastTimer);
    try { w.renderer.dispose(); } catch (e) { /* already gone */ }
    w.root.remove();
  }
  world = null;
  if (opts?.life) fill(opts.life);
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
  canvas.setAttribute("aria-label", "Explorable 3D camp. Use W A S D or the arrow keys to walk, comma and period to turn the camera, E to visit the nearest place and C for the photo camera. Every place is also in the Camp Locations list below, and what's happening in camp is in Around Camp Now.");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 170);
  const touch = coarsePointer();
  const ui = {
    status: h("p", { class: "sr-only", "aria-live": "polite" }),
    verb: h("span", {}),
    place: h("span", { class: "camp3d-place" }),
    knob: h("span", { class: "camp3d-knob" }),
    hint: h("p", { class: "camp3d-hint", "aria-hidden": "true" }, touch
      ? "Drag on the left to walk · drag on the right to look · tap a place to visit · 📷 for photos"
      : "Click the camp, then W A S D or arrows to walk · drag to look · E to visit · C for the camera"),
    zoom: h("span", { class: "camp3d-zoom" }, "×1.0"),
    toast: h("p", { class: "camp3d-toast", hidden: true, "aria-hidden": "true" }),
    flash: h("div", { class: "camp3d-flash", "aria-hidden": "true" })
  };
  ui.joy = h("div", { class: "camp3d-joy", hidden: true, "aria-hidden": "true" }, ui.knob);
  ui.act = h("button", { type: "button", class: "camp3d-act", onClick: () => { if (w.near) interact(w, w.near.id); } },
    h("kbd", { class: "camp3d-key", "aria-hidden": "true" }, "E"), ui.verb, ui.place);
  ui.prompt = h("div", { class: "camp3d-prompt", hidden: true }, ui.act);
  ui.cameraBtn = h("button", { type: "button", class: "camp3d-camera-btn", "aria-label": "Photo camera", onClick: () => enterCamera(w) },
    h("span", { "aria-hidden": "true" }, "📷"), h("span", { class: "camp3d-camera-label" }, "Camera"));
  ui.finder = h("div", { class: "camp3d-finder", hidden: true, "aria-hidden": "true" },
    ["tl", "tr", "bl", "br"].map((c) => h("span", { class: `camp3d-corner ${c}` })), h("span", { class: "camp3d-reticle" }), ui.zoom);
  ui.shutter = h("button", { type: "button", class: "camp3d-shutter", "aria-label": "Take photo", onClick: () => takePhoto(w) });
  ui.camBar = h("div", { class: "camp3d-cambar", hidden: true, onKeydown: (e) => { if (e.key === "Escape") { e.preventDefault(); exitCamera(w, { focus: true }); } } },
    h("button", { type: "button", class: "camp3d-cam-ctl", "aria-label": "Zoom out", onClick: () => zoomCamera(w, 1) }, "−"),
    ui.shutter,
    h("button", { type: "button", class: "camp3d-cam-ctl", "aria-label": "Zoom in", onClick: () => zoomCamera(w, -1) }, "+"),
    h("button", { type: "button", class: "btn small camp3d-cam-done", onClick: () => exitCamera(w, { focus: true }) }, "Done"));
  const w = {
    THREE, renderer, canvas, scene, camera, tier, ui,
    geos: new Map(), mats: new Map(), disposables: [], key: null,
    dynamic: new THREE.Group(),
    player: { x: CAMP_START.x, z: CAMP_START.z, heading: CAMP_START.heading, phase: 0, speed: 0 },
    cam: { yaw: 0, pitch: 0.42, pos: null },
    photo: { on: false, yaw: 0, pitch: 0, fov: FOV },
    held: new Set(), joy: null, drag: null, near: null, running: false, raf: 0, last: 0, clock: 0,
    fps: { frames: 0, since: 0, slow: 0, warm: 0 }, colliders: campColliders(), pickables: [], occluders: [], anim: null,
    life: null, lifeKey: null, visitors: null, npcViews: new Map(), visitorViews: new Map(), lifeUi: null,
    playerCollider: { id: "player", x: CAMP_START.x, z: CAMP_START.z, radius: PLAYER_RADIUS, tall: false },
    playerColliders: [], npcBlockers: [],
    visible: true, selectedId: null, opts: {},
    raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(), camPos: new THREE.Vector3(), camLook: new THREE.Vector3(),
    rayFrom: new THREE.Vector3(), rayDir: new THREE.Vector3()
  };
  scene.add(w.dynamic);
  w.playerMesh = hikerModel(w, scene, { shirt: 0xd4703a, hat: 0x2f5d46, pack: true, pose: "walk" });
  shadow(w, w.playerMesh, 0.42);
  const you = labelSprite(w, "You", { height: 0.3, bg: "rgba(224,164,58,0.95)" });
  you.position.y = 1.85;
  w.playerMesh.add(you);
  w.disposables = []; // the player's label lives for the page, never freed on rebuild
  w.root = h("div", { class: "camp3d" }, canvas, ui.flash, ui.finder, ui.joy, ui.prompt, ui.cameraBtn, ui.camBar, ui.toast, ui.hint, ui.status);
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
  w.occluders = [];
  w.npcViews.clear();
  w.visitorViews.clear();
  w.lifeKey = null;
}

// The clearing's ground, painted once per build: grass, a worn centre, worn footpaths (CAMP_PATHS),
// ash round the fire and scattered speckles, so the floor reads as a place and not a flat colour.
const GROUND_SPAN = 44;
function groundTexture(w, look, light) {
  const size = w.tier.ground || 1024;
  return canvasTexture(w, size, size, (g) => {
    const px = (v) => ((v + GROUND_SPAN / 2) / GROUND_SPAN) * size;
    const k = size / GROUND_SPAN;
    const ground = hex(look.ground);
    const css = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
    g.fillStyle = css(ground);
    g.fillRect(0, 0, size, size);
    const clearing = g.createRadialGradient(px(0), px(0), 0, px(0), px(0), (WORLD_RADIUS + 2) * k);
    clearing.addColorStop(0, css(mix(ground, 0xc8b48a, 0.35)));
    clearing.addColorStop(0.75, css(mix(ground, 0xc8b48a, 0.18)));
    clearing.addColorStop(1, css(ground, 0));
    g.fillStyle = clearing;
    g.fillRect(0, 0, size, size);
    const rand = seededRandom(17);
    for (let i = 0; i < size * 3; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 21;
      const shade = rand();
      g.fillStyle = css(shade < 0.5 ? mix(ground, 0x22381e, 0.35) : mix(ground, 0xe8dca0, 0.3), 0.5);
      g.fillRect(px(Math.sin(a) * r), px(Math.cos(a) * r), 1 + rand() * k * 0.08, 1 + rand() * k * 0.08);
    }
    const dirt = mix(ground, 0x9a8462, 0.65);
    g.lineCap = "round";
    CAMP_PATHS.forEach((p) => {
      g.strokeStyle = css(dirt, 0.35);
      g.lineWidth = p.width * k * 1.6;
      g.beginPath(); g.moveTo(px(p.ax), px(p.az)); g.lineTo(px(p.bx), px(p.bz)); g.stroke();
      g.strokeStyle = css(dirt, 0.9);
      g.lineWidth = p.width * k;
      g.beginPath(); g.moveTo(px(p.ax), px(p.az)); g.lineTo(px(p.bx), px(p.bz)); g.stroke();
    });
    const ash = g.createRadialGradient(px(0), px(0), 0, px(0), px(0), 1.9 * k);
    ash.addColorStop(0, "rgba(58,52,48,0.85)");
    ash.addColorStop(0.6, css(dirt, 0.9));
    ash.addColorStop(1, css(dirt, 0));
    g.fillStyle = ash;
    g.fillRect(0, 0, size, size);
    if (light.snow) { g.fillStyle = "rgba(245,248,255,0.55)"; g.fillRect(0, 0, size, size); }
  });
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
  const anim = { flames: [], smoke: [], fireflies: null, precip: null, rings: [], fireLight: null, blockAxe: null, reduced };
  w.anim = anim;

  // Sky, fog and light.
  w.scene.background = new T.Color(light.sky);
  w.scene.fog = new T.Fog(light.fog, light.fogNear, light.fogFar);
  root.add(new T.HemisphereLight(light.ambient, hex(look.ground), light.ambientIntensity));
  const sun = new T.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(10, 4 + light.sunHeight * 14, 7);
  root.add(sun);

  // Ground: the wide forest floor, then the painted clearing (worn paths, ash, speckles) and the trail
  // running on through the woods either side.
  const ground = hex(look.ground);
  const dirt = mix(ground, 0x9a8462, 0.65);
  part(w, root, ["CircleGeometry", 1, 48], light.snow ? mix(ground, 0xf4f6fb, 0.5) : ground, { rx: -Math.PI / 2, sx: 80, sy: 80 });
  const floorTex = groundTexture(w, look, light);
  floorTex.anisotropy = Math.min(4, w.renderer.capabilities.getMaxAnisotropy());
  const floor = new T.Mesh(geo(w, "PlaneGeometry", GROUND_SPAN, GROUND_SPAN), new T.MeshLambertMaterial({ map: floorTex }));
  w.disposables.push(floor.material);
  floor.position.y = 0.008;
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  [-1, 1].forEach((s) => part(w, root, ["PlaneGeometry", 1, 1], dirt, { y: 0.006, z: s * (GROUND_SPAN / 2 + 12), rx: -Math.PI / 2, sx: 1.2, sy: 24 }));

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

  // The forest ring, instanced (two draw calls per kind, however many trees). The section sets the
  // evergreen share (REGION_FLORA in camp-life.js).
  const flora = floraFor(ctx.scene);
  const trees = forestRing(w.tier.trees, 7, look.spruce ? Math.max(flora.pine, 0.85) : flora.pine)
    .map((t) => (Math.abs(t.x) < 1.8 ? { ...t, x: t.x + Math.sign(t.x || 1) * 2.4 } : t))
    .filter((t) => !water || Math.hypot(t.x - water.x, t.z - water.z) > water.r + 1);
  const pines = trees.filter((t) => t.kind === "pine");
  const broad = trees.filter((t) => t.kind !== "pine");
  const dummy = new T.Object3D();
  const instanced = (list, geometry, color, place) => {
    if (!list.length) return null;
    const m = new T.InstancedMesh(geometry, mat(w, color), list.length);
    list.forEach((t, i) => { place(t); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    root.add(m);
    w.disposables.push({ dispose: () => m.dispose() });
    return m;
  };
  const reset = () => { dummy.rotation.set(0, 0, 0); };
  const near = hex(look.near);
  [
    instanced(trees, geo(w, "CylinderGeometry", 0.14, 0.2, 1, 6), WOOD_DARK, (t) => { reset(); dummy.position.set(t.x, 0.6 * t.scale, t.z); dummy.scale.set(t.scale, 1.2 * t.scale, t.scale); }),
    instanced(pines, geo(w, "ConeGeometry", 1, 1, 7), mix(near, 0x1f3a2a, look.spruce ? 0.45 : 0.25), (t) => { reset(); dummy.position.set(t.x, 1 + 1.4 * t.scale, t.z); dummy.scale.set(1.1 * t.scale, 2.8 * t.scale, 1.1 * t.scale); }),
    instanced(broad, geo(w, "IcosahedronGeometry", 1, 0), near, (t) => { reset(); dummy.position.set(t.x, 1.3 + 1.1 * t.scale, t.z); dummy.rotation.set(0, t.x, 0); dummy.scale.set(1.3 * t.scale, 1.2 * t.scale, 1.3 * t.scale); })
  ].forEach((m) => { if (m) w.occluders.push(m); });

  // The section's undergrowth round the clearing, one instanced mesh per kind of plant. Thickets and
  // boulders are solid, so you (and the hikers) walk round them.
  const plants = campFlora(ctx.scene, w.tier.flora, { seed: ctx.scene.length * 7 + 3,
    colliders: campColliders({ tents: TENT_SPOTS.length, extra: LANTERN_SPOTS }), avoid: allActivitySpots() })
    .filter((f) => !water || Math.hypot(f.x - water.x, f.z - water.z) > water.r + 0.5);
  const byKind = (kind) => plants.filter((f) => f.kind === kind);
  const leaf = mix(near, 0x2c4a2a, 0.3);
  const bloom = { "blue-ridge": 0xe8c547, "high-balds": 0xd986b8, lakes: 0xf0f0f0, "southern-ridges": 0xe58fb4 }[ctx.scene] || 0xf2d05a;
  const plantMeshes = [
    instanced(byKind("rhododendron"), geo(w, "IcosahedronGeometry", 1, 0), mix(leaf, 0x1f3a2a, 0.3), (f) => { reset(); dummy.position.set(f.x, 0.55 * f.scale, f.z); dummy.rotation.set(0, f.rot, 0); dummy.scale.set(f.size, 0.75 * f.scale, f.size); }),
    instanced(byKind("rhododendron"), geo(w, "SphereGeometry", 1, 6, 4), mix(bloom, 0xffffff, 0.2), (f) => { reset(); dummy.position.set(f.x + 0.3 * f.scale, 1.05 * f.scale, f.z + 0.2 * f.scale); dummy.scale.set(0.16 * f.scale, 0.12 * f.scale, 0.16 * f.scale); }),
    instanced(byKind("shrub"), geo(w, "IcosahedronGeometry", 1, 0), leaf, (f) => { reset(); dummy.position.set(f.x, 0.35 * f.scale, f.z); dummy.rotation.set(0, f.rot, 0); dummy.scale.set(f.size, 0.45 * f.scale, f.size); }),
    instanced(byKind("fern"), geo(w, "ConeGeometry", 1, 1, 5), mix(leaf, 0x7fae4a, 0.35), (f) => { reset(); dummy.position.set(f.x, 0.18 * f.scale, f.z); dummy.rotation.set(0, f.rot, Math.PI); dummy.scale.set(f.size, 0.36 * f.scale, f.size); }),
    instanced(byKind("grass"), geo(w, "ConeGeometry", 1, 1, 4), mix(hex(look.ground), 0x9fbf5a, 0.35), (f) => { reset(); dummy.position.set(f.x, 0.16 * f.scale, f.z); dummy.rotation.set(0, f.rot, 0); dummy.scale.set(f.size, 0.32 * f.scale, f.size); }),
    instanced(byKind("flower"), geo(w, "SphereGeometry", 1, 5, 3), bloom, (f) => { reset(); dummy.position.set(f.x, 0.14 * f.scale, f.z); dummy.scale.set(f.size * 0.6, 0.1 * f.scale, f.size * 0.6); }),
    instanced(byKind("stone"), geo(w, "DodecahedronGeometry", 1, 0), STONE, (f) => { reset(); dummy.position.set(f.x, 0.06 * f.scale, f.z); dummy.rotation.set(0, f.rot, 0); dummy.scale.set(f.size, 0.5 * f.size, f.size * 0.8); }),
    instanced(byKind("boulder"), geo(w, "DodecahedronGeometry", 1, 0), mix(STONE, 0x5a5a56, 0.3), (f) => { reset(); dummy.position.set(f.x, 0.3 * f.scale, f.z); dummy.rotation.set(f.rot, f.rot, 0); dummy.scale.set(f.size, 0.7 * f.size, f.size * 0.9); }),
    instanced(byKind("needles"), geo(w, "CircleGeometry", 1, 9), mix(0x8a6a3a, hex(look.ground), 0.4), (f) => { reset(); dummy.position.set(f.x, 0.014, f.z); dummy.rotation.set(-Math.PI / 2, 0, f.rot); dummy.scale.set(f.size, f.size * 0.8, 1); })
  ];
  plantMeshes.forEach((m, i) => { if (m && (i === 0 || i === 7)) w.occluders.push(m); });
  const floraColliders = plants.filter((f) => f.solid).map((f, i) => ({ id: `flora-${i}`, x: f.x, z: f.z, radius: f.size * 0.8, tall: false }));

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

  // Log benches round the fire. The expedition's hikers (built by syncLife) sit here and wander off to
  // their own activities through the day.
  FIRE_BENCHES.forEach((b) => {
    const g = group(w, root, { x: b.x, z: b.z, ry: b.heading });
    part(w, g, ["CylinderGeometry", 0.2, 0.22, 1.25, 8], WOOD, { y: 0.2, rz: Math.PI / 2 });
    [-0.62, 0.62].forEach((x) => part(w, g, ["CircleGeometry", 0.2, 8], WOOD_LIGHT, { x: x + Math.sign(x) * 0.005, y: 0.2, ry: Math.sign(x) * Math.PI / 2 }));
    shadow(w, g, 0.55);
  });
  const lanternColliders = [];
  w.selectionRing = part(w, root, ["RingGeometry", 0.5, 0.64, 28], GOLD, { y: 0.03, rx: -Math.PI / 2, basic: true });
  w.selectionRing.visible = false;

  // Tents, growing with the miles, doors turned to the fire.
  TENT_SPOTS.slice(0, ctx.scale.tents).forEach((t, i) => {
    const g = group(w, root, { x: t.x, z: t.z, ry: headingOf(-t.x, -t.z) });
    part(w, g, ["ConeGeometry", 1, 1, 4], SHIRTS[(i * 3 + 1) % SHIRTS.length], { y: 0.7, sx: 1.25, sy: 1.4, sz: 1.25, ry: Math.PI / 4 });
    part(w, g, ["BoxGeometry", 0.42, 0.62, 0.03], 0x2a2420, { y: 0.31, z: 0.47, rx: -0.55 });
    w.occluders.push(g);
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
  w.occluders.push(shelter);

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
    lanternColliders.push(s);
  });

  // Camp chores and corners: a cook pot on a tripod, the woodpile and chopping block, supply crates,
  // an overlook bench facing the view and a mossy fallen log.
  const tripod = group(w, root);
  [0, 2.1, 4.2].forEach((a) => part(w, tripod, ["CylinderGeometry", 0.025, 0.025, 1.5, 4], WOOD_DARK, { x: Math.sin(a) * 0.45, y: 0.7, z: Math.cos(a) * 0.45, rx: -Math.cos(a) * 0.3, rz: Math.sin(a) * 0.3 }));
  part(w, tripod, ["CylinderGeometry", 0.006, 0.006, 0.45, 3], 0x3a3a3a, { y: 1.15 });
  part(w, tripod, ["CylinderGeometry", 0.17, 0.13, 0.2, 10], 0x3a3a3a, { y: 0.88 });
  const woodpile = group(w, root, { x: -8.5, z: 1.2, ry: 0.5 });
  [[0, 0.11, -0.25], [0, 0.11, 0], [0, 0.11, 0.25], [0, 0.31, -0.13], [0, 0.31, 0.13], [0, 0.5, 0]].forEach(([x, y, z]) =>
    part(w, woodpile, ["CylinderGeometry", 0.11, 0.11, 1, 7], WOOD, { x, y, z, rz: Math.PI / 2 }));
  const block = group(w, root, { x: -7.4, z: -0.8 });
  part(w, block, ["CylinderGeometry", 0.3, 0.33, 0.45, 9], WOOD_LIGHT, { y: 0.22 });
  const axe = group(w, block, { y: 0.45 });
  part(w, axe, ["CylinderGeometry", 0.025, 0.025, 0.6, 5], WOOD_LIGHT, { y: 0.26, rz: 0.3 });
  part(w, axe, ["BoxGeometry", 0.05, 0.12, 0.18], 0x8a8a8a, { x: 0.02, y: 0.06, rz: 0.3 });
  anim.blockAxe = axe;
  const crates = group(w, root, { x: 3.2, z: -7.4, ry: 0.4 });
  part(w, crates, ["BoxGeometry", 0.55, 0.45, 0.45], WOOD_LIGHT, { x: -0.25, y: 0.22 });
  part(w, crates, ["BoxGeometry", 0.45, 0.4, 0.4], WOOD, { x: -0.2, y: 0.65, ry: 0.3 });
  part(w, crates, ["CylinderGeometry", 0.22, 0.22, 0.6, 10], 0x6a4a2c, { x: 0.38, y: 0.3 });
  const bench = group(w, root, { x: OVERLOOK.x, z: OVERLOOK.z, ry: OVERLOOK.heading + Math.PI });
  part(w, bench, ["BoxGeometry", 1.3, 0.08, 0.4], WOOD_LIGHT, { y: 0.45 });
  [-0.5, 0.5].forEach((x) => part(w, bench, ["BoxGeometry", 0.08, 0.45, 0.35], WOOD_DARK, { x, y: 0.22 }));
  const log = group(w, root, { x: FALLEN_LOG.x, z: FALLEN_LOG.z, ry: FALLEN_LOG.heading });
  part(w, log, ["CylinderGeometry", 0.28, 0.32, 2, 9], WOOD_DARK, { y: 0.28, rz: Math.PI / 2 });
  part(w, log, ["BoxGeometry", 1.4, 0.06, 0.4], mix(near, 0x6b8e3a, 0.5), { y: 0.55 });
  [[-0.5, 0.25], [0.3, 0.3], [0.7, -0.25]].forEach(([x, z]) => {
    part(w, log, ["CylinderGeometry", 0.025, 0.03, 0.12, 5], CREAM, { x, y: 0.06, z });
    part(w, log, ["SphereGeometry", 0.07, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2], 0xb5532c, { x, y: 0.12, z });
  });
  [woodpile, crates, log].forEach((g) => w.occluders.push(g));

  // Gold rings and signs mark the places you can visit.
  CAMP_LOCATIONS.forEach((l) => {
    const ring = part(w, root, ["RingGeometry", l.radius + 0.3, l.radius + 0.45, 32], GOLD, { x: l.x, y: 0.035, z: l.z, rx: -Math.PI / 2, basic: true, opacity: 0.45 });
    ring.userData.id = l.id;
    anim.rings.push(ring);
    const tag = labelSprite(w, SIGN[l.id], { height: 0.3, bg: "rgba(47,93,70,0.9)", ink: "#f4ead5" });
    tag.position.set(l.x, l.id === "roster" ? 2.5 : 2.75, l.z);
    root.add(tag);
  });

  // Camp life: fireflies at dusk, stars, rain or snow. Hikers and wildlife visitors come from syncLife.
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
  w.colliders = campColliders({ tents: ctx.scale.tents, extra: [...lanternColliders, ...floraColliders] });
  syncLife(w, ctx);
  placeSelection(w);
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

// The gold ring under the hiker chosen in "The Hikers", wherever they are in camp.
function placeSelection(w) {
  if (!w.selectionRing) return;
  const npc = w.selectedId && w.life ? w.life.npcs.find((n) => n.id === w.selectedId) : null;
  w.selectionRing.visible = Boolean(npc);
  if (npc) w.selectionRing.position.set(npc.x, 0.03, npc.z);
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

// ---- Camp life: the expedition's hikers and wildlife visitors ---------------------------------------
// The simulation (who does what, where visitors walk) is engine/camp-life.js; here it is only drawn.

// Rebuild the hikers' and visitors' models after a scene build. The simulation itself starts over only
// when what it depends on changes (time, weather, section, tents, lanterns, the roster), so the 60 s
// background refresh doesn't send everyone back to their first activity.
function syncLife(w, ctx) {
  const reduced = w.anim ? w.anim.reduced : reducedMotion();
  const key = JSON.stringify([ctx.time, ctx.weather && ctx.weather.id, ctx.scene, ctx.scale.tents, ctx.scale.lanterns, reduced, w.tier.visitors,
    ctx.people.map((p) => [p.id, p.name, p.seed, p.recent ? 1 : 0])]);
  if (key !== w.lifeSimKey || !w.life) {
    const seed = Math.floor(Math.random() * 1e6) + 1;
    w.life = createCampLife({ people: ctx.people, time: ctx.time, weather: ctx.weather, tents: ctx.scale.tents, lanterns: ctx.scale.lanterns, seed, reduced });
    w.visitors = createVisitors({ time: ctx.time, weather: ctx.weather, scene: ctx.scene, cap: w.tier.visitors ?? 2, seed: seed + 7, reduced, colliders: w.colliders });
    w.lifeSimKey = key;
  } else w.visitors.colliders = w.colliders;
  w.lifeKey = key;
  w.npcColliders = w.life.npcs.map((n) => ({ id: n.id, x: n.x, z: n.z, radius: NPC_RADIUS, tall: false }));
  w.life.npcs.forEach((n) => w.npcViews.set(n.id, npcView(w, n)));
  w.visitors.list.forEach((v) => addVisitorView(w, v));
  w.playerColliders = [...w.colliders, ...w.npcColliders];
  w.npcBlockers = [...w.colliders, w.playerCollider];
  w.npcViews.forEach((view, id) => applyPose(view, w.life.npcs.find((n) => n.id === id), w.clock, reduced));
  w.lifeDirty = true;
  renderLife(w);
}

// One hiker in camp: the shared hiker model, the things they might hold, a name tag and a shadow.
function npcView(w, npc) {
  const g = hikerModel(w, w.dynamic, { shirt: hex(SHIRTS[npc.seed % SHIRTS.length]), hat: hex(HATS[(npc.seed >> 3) % HATS.length]), pack: npc.recent, pose: "walk" });
  const rig = g.userData.rig;
  const items = {
    book: part(w, rig.body, ["BoxGeometry", 0.3, 0.04, 0.22], CREAM, { y: 0.8, z: 0.3, rx: -0.6 }),
    stick: part(w, rig.armR, ["CylinderGeometry", 0.015, 0.015, 0.9, 4], WOOD_DARK, { y: -0.45, z: 0.35, rx: 1.1 }),
    jug: part(w, rig.armR, ["BoxGeometry", 0.16, 0.24, 0.14], 0x3a6ea5, { y: -0.52 }),
    logs: group(w, rig.body, { y: 0.78, z: 0.3 }),
    axe: group(w, rig.armR, { y: -0.46 }),
    camera: group(w, rig.body, { y: 1.16, z: 0.22 }),
    binocs: group(w, rig.body, { y: 1.2, z: 0.2 })
  };
  [-0.07, 0.07].forEach((y) => part(w, items.logs, ["CylinderGeometry", 0.07, 0.07, 0.6, 6], WOOD, { y, rz: Math.PI / 2 }));
  part(w, items.axe, ["CylinderGeometry", 0.025, 0.025, 0.6, 5], WOOD_LIGHT, { z: 0.15, rx: Math.PI / 2 });
  part(w, items.axe, ["BoxGeometry", 0.05, 0.16, 0.12], 0x8a8a8a, { z: 0.42 });
  part(w, items.camera, ["BoxGeometry", 0.22, 0.14, 0.1], 0x2a2a2a);
  part(w, items.camera, ["CylinderGeometry", 0.045, 0.045, 0.08, 8], 0x555555, { z: 0.08, rx: Math.PI / 2 });
  [-0.06, 0.06].forEach((x) => part(w, items.binocs, ["CylinderGeometry", 0.04, 0.04, 0.16, 8], 0x3a3a3a, { x, rx: Math.PI / 2 }));
  const tag = labelSprite(w, npc.name, { height: 0.26 });
  tag.position.y = 1.72;
  g.add(tag);
  shadow(w, g, 0.4);
  w.pickables.push(tagPick(g, "hiker", npc.id));
  w.occluders.push(g);
  return { g, rig, items, tag };
}

const SEATED = new Set(["sit", "read"]);

// Put a hiker's limbs in their pose; walking swings them, working poses move a little.
function applyPose(view, npc, t, reduced) {
  if (!view || !npc) return;
  const { g, rig, items, tag } = view;
  const { body, legL, legR, armL, armR } = rig;
  g.position.set(npc.x, npc.y || 0, npc.z);
  g.rotation.y = npc.heading;
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  [legL, legR, armL, armR].forEach((l) => l.rotation.set(0, 0, 0));
  const pose = npc.moving ? "walk" : npc.pose;
  const ph = t + (npc.seed % 17) * 0.7;
  const wave = (speed, size) => (reduced ? 0 : Math.sin(ph * speed) * size);
  tag.position.y = 1.72;
  if (SEATED.has(pose)) {
    body.position.y = -0.1;
    legL.rotation.x = legR.rotation.x = -1.45;
  }
  switch (pose) {
    case "walk": {
      const swing = Math.sin(ph * 8) * 0.55;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      if (npc.item === "logs") armL.rotation.x = armR.rotation.x = -1.1;
      else { armL.rotation.x = -swing * 0.8; armR.rotation.x = npc.item === "jug" ? 0.1 : swing * 0.8; }
      break;
    }
    case "sit": armL.rotation.x = -0.5; armR.rotation.x = -0.5 + wave(1.3, 0.12); break;
    case "read": armL.rotation.x = armR.rotation.x = -1; armL.rotation.z = -0.25; armR.rotation.z = 0.25; break;
    case "sleep":
      body.rotation.x = -Math.PI / 2;
      body.position.set(0, 0.13 + wave(0.8, 0.008), 0.6);
      tag.position.y = 0.9;
      break;
    case "warm": armL.rotation.x = armR.rotation.x = -1.25; armL.rotation.z = -0.15; armR.rotation.z = 0.15 + wave(2, 0.05); break;
    case "cook": armL.rotation.x = -0.4; armR.rotation.x = -0.9; armR.rotation.z = wave(2.4, 0.25); break;
    case "pump": armR.rotation.x = -0.9 + wave(5, 0.35); armL.rotation.x = -0.3; break;
    case "crouch": body.position.y = -0.2; legL.rotation.x = -1.1; legR.rotation.x = -0.4; armL.rotation.x = armR.rotation.x = -1.1 + wave(1.6, 0.15); break;
    case "chop": {
      const lift = reduced ? 0.5 : (Math.sin(ph * 3.2) + 1) / 2;
      armL.rotation.x = armR.rotation.x = -0.8 - lift * 2;
      break;
    }
    case "lean": body.rotation.x = 0.35; armL.rotation.x = armR.rotation.x = -0.7; break;
    case "stretch": armL.rotation.z = -2.7; armR.rotation.z = 2.7; body.rotation.z = wave(0.8, 0.15); break;
    case "binoculars": case "photo": armL.rotation.x = armR.rotation.x = -1.9; armL.rotation.z = -0.45; armR.rotation.z = 0.45; break;
    case "write": armL.rotation.x = -0.9; armR.rotation.x = -0.9 + wave(4, 0.08); break;
    case "wave": armR.rotation.z = 2.5 + wave(5, 0.35); break;
    default: armR.rotation.x = wave(0.7, 0.06); body.rotation.z = wave(0.5, 0.03);
  }
  items.book.visible = pose === "read" || pose === "write";
  items.book.position.set(0, pose === "write" ? 0.85 : 0.8, 0.3);
  items.stick.visible = pose === "cook" && !npc.item;
  items.jug.visible = npc.item === "jug";
  items.logs.visible = npc.item === "logs";
  items.axe.visible = npc.item === "axe" || pose === "chop";
  items.camera.visible = pose === "photo";
  items.binocs.visible = pose === "binoculars";
}

// A low-poly visitor in the species' own colours (from expedition-themes.js). Faces +z.
function visitorModel(w, v) {
  const s = v.species || {};
  const [main, dark] = (s.colors || ["#8a6a4a", "#5b4636"]).map(hex);
  const pale = hex(s.light || "#f4ead5");
  const g = group(w, w.dynamic);
  const b = group(w, g);
  const legs = (pairs, len, width, color) => pairs.forEach(([x, z]) => part(w, b, ["BoxGeometry", width, len, width], color, { x, y: len / 2, z }));
  const wings = [];
  const wing = (x, y, z, len, width, color) => {
    const hinge = group(w, b, { x, y, z });
    part(w, hinge, ["BoxGeometry", len, 0.02, width], color, { x: Math.sign(x) * len / 2 });
    wings.push(hinge);
  };
  switch (v.visitor.model) {
    case "squirrel":
      part(w, b, ["BoxGeometry", 0.12, 0.12, 0.22], main, { y: 0.1 });
      part(w, b, ["SphereGeometry", 0.07, 8, 6], main, { y: 0.17, z: 0.13 });
      part(w, b, ["BoxGeometry", 0.1, 0.26, 0.08], pale, { y: 0.24, z: -0.15, rx: 0.35 });
      break;
    case "chipmunk":
      part(w, b, ["BoxGeometry", 0.09, 0.09, 0.16], main, { y: 0.07 });
      part(w, b, ["BoxGeometry", 0.03, 0.095, 0.15], dark, { y: 0.075 });
      part(w, b, ["SphereGeometry", 0.05, 8, 6], main, { y: 0.12, z: 0.09 });
      part(w, b, ["BoxGeometry", 0.03, 0.12, 0.03], dark, { y: 0.12, z: -0.1, rx: 0.5 });
      break;
    case "rabbit":
      part(w, b, ["SphereGeometry", 0.15, 8, 6], main, { y: 0.15, sz: 1.3 });
      part(w, b, ["SphereGeometry", 0.09, 8, 6], main, { y: 0.27, z: 0.17 });
      [-0.035, 0.035].forEach((x) => part(w, b, ["BoxGeometry", 0.035, 0.16, 0.025], main, { x, y: 0.41, z: 0.15 }));
      part(w, b, ["SphereGeometry", 0.045, 6, 4], 0xffffff, { y: 0.19, z: -0.2 });
      break;
    case "songbird": {
      const k = (v.visitor.size || 0.25) / 0.25;
      part(w, b, ["SphereGeometry", 0.07 * k, 8, 6], main, { y: 0.07 * k, sz: 1.4 });
      part(w, b, ["SphereGeometry", 0.05 * k, 8, 6], dark, { y: 0.13 * k, z: 0.07 * k });
      part(w, b, ["ConeGeometry", 0.015 * k, 0.05 * k, 4], 0x3b2f25, { y: 0.13 * k, z: 0.13 * k, rx: Math.PI / 2 });
      part(w, b, ["BoxGeometry", 0.05 * k, 0.015 * k, 0.09 * k], dark, { y: 0.08 * k, z: -0.12 * k, rx: -0.3 });
      wing(-0.05 * k, 0.09 * k, 0, 0.12 * k, 0.08 * k, dark);
      wing(0.05 * k, 0.09 * k, 0, 0.12 * k, 0.08 * k, dark);
      break;
    }
    case "owl":
      part(w, b, ["SphereGeometry", 0.17, 10, 8], main, { y: 0.22, sy: 1.35 });
      part(w, b, ["SphereGeometry", 0.13, 10, 8], pale, { y: 0.48 });
      [-0.05, 0.05].forEach((x) => part(w, b, ["SphereGeometry", 0.025, 6, 4], 0x1a1410, { x, y: 0.5, z: 0.11 }));
      wing(-0.15, 0.3, 0, 0.32, 0.18, dark);
      wing(0.15, 0.3, 0, 0.32, 0.18, dark);
      break;
    case "turkey":
      part(w, b, ["SphereGeometry", 0.24, 10, 8], main, { y: 0.48, sz: 1.3 });
      part(w, b, ["CylinderGeometry", 0.035, 0.05, 0.3, 6], 0x7a8aa0, { y: 0.72, z: 0.24, rx: 0.3 });
      part(w, b, ["SphereGeometry", 0.06, 8, 6], 0xc0392b, { y: 0.88, z: 0.3 });
      part(w, b, ["CylinderGeometry", 0.3, 0.3, 0.03, 12, 1, false, 0, Math.PI], dark, { y: 0.6, z: -0.28, rx: Math.PI / 2 - 0.3, ry: Math.PI / 2 });
      legs([[-0.07, 0.02], [0.07, 0.02]], 0.28, 0.03, 0x8a6a3a);
      break;
    case "fox": case "coyote": {
      const k = v.visitor.model === "coyote" ? 1.2 : 1;
      part(w, b, ["BoxGeometry", 0.22 * k, 0.22 * k, 0.56 * k], main, { y: 0.36 * k });
      part(w, b, ["BoxGeometry", 0.18 * k, 0.18 * k, 0.2 * k], main, { y: 0.5 * k, z: 0.34 * k });
      part(w, b, ["ConeGeometry", 0.06 * k, 0.18 * k, 4], dark, { y: 0.48 * k, z: 0.5 * k, rx: Math.PI / 2 });
      [-0.06, 0.06].forEach((x) => part(w, b, ["ConeGeometry", 0.04 * k, 0.1 * k, 4], dark, { x: x * k, y: 0.64 * k, z: 0.32 * k }));
      part(w, b, ["CylinderGeometry", 0.03 * k, 0.09 * k, 0.46 * k, 6], main, { y: 0.4 * k, z: -0.44 * k, rx: -1.2 });
      part(w, b, ["SphereGeometry", 0.05 * k, 6, 4], pale, { y: 0.24 * k, z: -0.64 * k });
      legs([[-0.07, 0.18], [0.07, 0.18], [-0.07, -0.18], [0.07, -0.18]].map(([x, z]) => [x * k, z * k]), 0.26 * k, 0.05 * k, dark);
      break;
    }
    case "deer":
      part(w, b, ["BoxGeometry", 0.34, 0.4, 0.9], main, { y: 0.84 });
      part(w, b, ["BoxGeometry", 0.15, 0.45, 0.15], main, { y: 1.2, z: 0.42, rx: -0.4 });
      part(w, b, ["BoxGeometry", 0.17, 0.17, 0.3], main, { y: 1.42, z: 0.58 });
      [-0.07, 0.07].forEach((x) => part(w, b, ["ConeGeometry", 0.04, 0.14, 4], main, { x, y: 1.56, z: 0.5, rz: x * 4 }));
      part(w, b, ["BoxGeometry", 0.1, 0.14, 0.05], pale, { y: 0.98, z: -0.47 });
      legs([[-0.11, 0.33], [0.11, 0.33], [-0.11, -0.33], [0.11, -0.33]], 0.64, 0.07, dark);
      break;
    case "bear":
      part(w, b, ["BoxGeometry", 0.62, 0.58, 1.15], main, { y: 0.66 });
      part(w, b, ["BoxGeometry", 0.4, 0.38, 0.36], main, { y: 0.86, z: 0.68 });
      part(w, b, ["BoxGeometry", 0.2, 0.16, 0.18], pale, { y: 0.8, z: 0.92 });
      [-0.14, 0.14].forEach((x) => part(w, b, ["SphereGeometry", 0.07, 6, 4], main, { x, y: 1.07, z: 0.64 }));
      legs([[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.4], [0.2, -0.4]], 0.42, 0.18, dark);
      break;
    case "moose":
      part(w, b, ["BoxGeometry", 0.6, 0.72, 1.5], main, { y: 1.46 });
      part(w, b, ["BoxGeometry", 0.24, 0.5, 0.3], main, { y: 1.8, z: 0.74, rx: -0.5 });
      part(w, b, ["BoxGeometry", 0.24, 0.26, 0.56], main, { y: 1.9, z: 1.02, rx: 0.3 });
      part(w, b, ["BoxGeometry", 0.06, 0.26, 0.06], dark, { y: 1.58, z: 0.9 });
      [-1, 1].forEach((sx) => part(w, b, ["BoxGeometry", 0.5, 0.05, 0.3], pale, { x: sx * 0.36, y: 2.18, z: 0.86, rz: sx * 0.35 }));
      legs([[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]], 1.1, 0.1, dark);
      break;
    default:
      part(w, b, ["SphereGeometry", 0.15, 8, 6], main, { y: 0.15 });
  }
  if (!v.visitor.bird) shadow(w, g, Math.max(0.15, (v.visitor.size || 0.5) * 0.4));
  w.pickables.push(tagPick(g, "visitor", v.key));
  return { g, b, wings };
}

function addVisitorView(w, v) {
  if (w.visitorViews.has(v.key)) return;
  const view = visitorModel(w, v);
  view.v = v;
  w.visitorViews.set(v.key, view);
  animateVisitor(view, w.clock, true);
}

function removeVisitorView(w, v) {
  const view = w.visitorViews.get(v.key);
  if (!view) return;
  view.g.removeFromParent();
  w.pickables = w.pickables.filter((o) => o !== view.g);
  w.visitorViews.delete(v.key);
}

// Follow the simulation: hop or trot while moving, flap while flying, glide when perched.
function animateVisitor(view, t, still) {
  const { g, b, wings, v } = view;
  g.position.set(v.x, v.y || 0, v.z);
  g.rotation.y = v.heading;
  const k = still ? 0 : 1;
  const hop = v.visitor.model === "rabbit" || v.visitor.model === "squirrel" || v.visitor.model === "chipmunk";
  b.position.y = v.moving && !v.flying ? k * Math.abs(Math.sin(t * (hop ? 12 : 8) + v.x)) * (hop ? 0.08 : 0.03) : 0;
  const flap = v.flying ? Math.sin(t * 22) * 0.9 * k : 0.15;
  wings.forEach((hinge) => { hinge.rotation.z = Math.sign(hinge.position.x || 1) * flap; });
}

// ---- Around Camp Now and Camp Photos (the text version of camp life) -------------------------------

function lifePanel(w) {
  const list = h("ul", { class: "camp3d-life-list", "aria-labelledby": "camp-life-title" });
  const photos = h("div", { class: "camp3d-photos" });
  const count = h("span", { class: "camp3d-photo-count" });
  w.lifeUi = { list, photos, count, sig: null, photoSig: null };
  const roll = h("details", { class: "timeline-wrap camp3d-roll", open: Boolean(w.rollOpen), onToggle: (e) => { w.rollOpen = e.target.open; } },
    h("summary", {}, "Camp Photos", count),
    h("p", { class: "hint" }, "Photos stay on this device until you close the page."),
    photos);
  renderLife(w);
  return h("div", { class: "camp3d-life" }, h("h3", { id: "camp-life-title" }, "Around Camp Now"), list, roll);
}

function renderLife(w) {
  const ui = w.lifeUi;
  if (!ui) return;
  w.lifeDirty = false;
  w.lifeAt = w.clock;
  const time = (w.lastCtx && w.lastCtx.time) || "day";
  const visitors = ((w.visitors && w.visitors.list) || []).map((v) => ({ v, text: describeVisitor(v) }));
  const hikers = ((w.life && w.life.npcs) || []).map((n) => describeNpc(n, time));
  const sig = JSON.stringify([visitors.map((x) => [x.v.key, x.text]), hikers]);
  if (sig !== ui.sig) {
    ui.sig = sig;
    const focusKey = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.visitor;
    fill(ui.list,
      visitors.map(({ v, text }) => h("li", { class: "camp3d-life-visitor" }, h("span", {}, text), " ",
        h("button", { type: "button", class: "btn small", "data-visitor": v.key, "aria-label": `Aim the camera at ${v.photographed ? `the ${v.species.name}` : "the visitor"}`,
          onClick: () => aimAt(w, v) }, "Aim camera"))),
      hikers.map((text) => h("li", {}, text)),
      !visitors.length && !hikers.length ? h("li", {}, "Camp is quiet right now.") : null);
    if (focusKey) ui.list.querySelector(`[data-visitor="${CSS.escape(focusKey)}"]`)?.focus();
  }
  const photoSig = session.photos.map((p) => p.at).join(",");
  if (photoSig !== ui.photoSig) {
    ui.photoSig = photoSig;
    ui.count.textContent = session.photos.length ? `(${session.photos.length})` : "";
    fill(ui.photos, session.photos.length
      ? session.photos.map((p) => h("figure", { class: "camp3d-photo" },
        p.src ? h("img", { src: p.src, alt: p.caption, width: "320", height: "180", loading: "lazy" }) : null,
        h("figcaption", {}, p.caption)))
      : h("p", { class: "hint" }, "No photos yet. Press C or the 📷 Camera button in camp to take one."));
  }
}

// ---- The photo camera ------------------------------------------------------------------------------
// First person from the hiker's eyes: aim (drag, arrows or WASD), zoom (wheel, + and -) and shoot (Space,
// Enter, a tap or the shutter). framePhoto (camp-life.js) decides what the picture is of.

function enterCamera(w) {
  const ph = w.photo;
  if (!ph.on) {
    ph.on = true;
    ph.track = null;
    ph.yaw = w.cam.yaw + Math.PI;
    ph.pitch = 0;
    ph.fov = FOV;
  }
  w.held.clear();
  endJoystick(w);
  dismissHint(w);
  w.near = null;
  w.ui.prompt.hidden = true;
  w.ui.finder.hidden = false;
  w.ui.camBar.hidden = false;
  w.ui.cameraBtn.hidden = true;
  w.root.classList.add("is-camera");
  w.playerMesh.visible = false;
  updateZoom(w);
  w.ui.status.textContent = "Photo camera on. Aim with the arrow keys or by dragging, zoom with plus and minus, then press Space or the shutter. Escape puts the camera away.";
  if (document.activeElement !== w.canvas) w.ui.shutter.focus({ preventScroll: true });
}

function exitCamera(w, { focus = false } = {}) {
  const ph = w.photo;
  if (!ph.on) return;
  ph.on = false;
  ph.track = null;
  ph.fov = FOV;
  w.camera.fov = FOV;
  w.camera.updateProjectionMatrix();
  w.cam.yaw = ph.yaw - Math.PI; // the follow camera looks where you were aiming
  w.cam.pos = w.camera.position.clone();
  w.held.clear();
  w.drag = null;
  w.ui.finder.hidden = true;
  w.ui.camBar.hidden = true;
  w.ui.cameraBtn.hidden = false;
  w.root.classList.remove("is-camera");
  w.playerMesh.visible = true;
  w.ui.status.textContent = "Photo camera put away.";
  if (focus) w.canvas.focus({ preventScroll: true });
}

function zoomCamera(w, dir) {
  const ph = w.photo;
  ph.fov = Math.max(MIN_FOV, Math.min(FOV, ph.fov + dir * 7));
  updateZoom(w);
}

function updateZoom(w) {
  w.ui.zoom.textContent = `×${(FOV / w.photo.fov).toFixed(1)}`;
}

// Where a visitor's body is, for aiming and framing.
const visitorPoint = (v) => ({ x: v.x, y: (v.y || 0) + (v.visitor.size || 0.5) * 0.4, z: v.z });

// Point the photo camera from the hiker's eyes at `target`.
function aimAngles(w, target) {
  const dx = target.x - w.player.x;
  const dz = target.z - w.player.z;
  w.photo.yaw = Math.atan2(dx, dz);
  w.photo.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(target.y - EYE, Math.hypot(dx, dz))));
  return Math.hypot(dx, dz);
}

// "Aim camera" in Around Camp Now, the text route to a photo: step to the nearest spot with a clear view
// of the visitor (vantagePoints), raise the camera, zoom in a little and follow the animal until the
// player aims by hand.
function aimAt(w, v) {
  const target = visitorPoint(v);
  const colliders = w.playerColliders && w.playerColliders.length ? w.playerColliders : w.colliders;
  const near = Math.ceil(waryDistance(v) + 0.5);
  const spot = vantagePoints(target, w.player, colliders, { near, far: near + 4 }).find((s) => lineClear(w, { x: s.x, y: EYE, z: s.z }, target));
  if (spot) { w.player.x = spot.x; w.player.z = spot.z; w.playerMesh.position.set(spot.x, 0, spot.z); }
  enterCamera(w);
  const dist = aimAngles(w, target);
  w.photo.track = v;
  // Zoom so the animal fills about a fifth of the frame.
  const want = (2 * Math.atan((v.visitor.size || 0.5) / (2 * 0.2 * Math.max(dist, 0.5))) * 180) / Math.PI;
  w.photo.fov = Math.max(MIN_FOV, Math.min(FOV, want));
  updateZoom(w);
  w.root.scrollIntoView?.({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  w.ui.shutter.focus({ preventScroll: true });
}

const PROP_NAMES = {
  shelter: ["trail shelter", 1.3, 4], pump: ["water pump", 0.6, 0.9], "bear-bags": ["bear bag line", 2.6, 2.6], signpost: ["trail signpost", 1.6, 1.2],
  woodpile: ["woodpile", 0.4, 1], "chopping-block": ["chopping block", 0.3, 0.6], "supply-crates": ["supply crates", 0.4, 1],
  "overlook-bench": ["overlook bench", 0.4, 1.2], "fallen-log": ["mossy fallen log", 0.3, 1.6]
};

// Everything a photo could be of, as framePhoto subjects.
function photoSubjects(w) {
  const time = (w.lastCtx && w.lastCtx.time) || "day";
  const out = [];
  ((w.life && w.life.npcs) || []).forEach((n) => out.push({ kind: "hiker", id: n.id, name: n.name, x: n.x, y: (n.y || 0) + (n.pose === "sleep" ? 0.2 : 0.9), z: n.z,
    size: n.pose === "sleep" ? 1.2 : 1.6, detail: activityLabel(n.activity, time) }));
  ((w.visitors && w.visitors.list) || []).forEach((v) => out.push({ kind: "wildlife", id: v.id, key: v.key, name: v.species.name, x: v.x,
    y: visitorPoint(v).y, z: v.z, size: v.visitor.size || 0.5 }));
  out.push({ kind: "fire", id: "fire", name: "campfire", x: 0, y: 0.5, z: 0, size: 1.6 });
  CAMP_LOCATIONS.filter((l) => l.id !== "roster").forEach((l) => out.push({ kind: "place", id: l.id, name: l.name, x: l.x, y: 1, z: l.z, size: 2.2 }));
  CAMP_PROPS.forEach((p) => { const n = PROP_NAMES[p.id]; if (n) out.push({ kind: "prop", id: p.id, name: n[0], x: p.x, y: n[1], z: p.z, size: n[2] }); });
  return out;
}

// Nothing in w.occluders (tents, trees, the shelter…) between `from` and `to`, ignoring `own`.
function lineClear(w, from, to, own = null) {
  const dir = w.rayDir.set(to.x - from.x, to.y - from.y, to.z - from.z);
  const dist = dir.length();
  if (dist < 0.5) return true;
  w.raycaster.set(w.rayFrom.set(from.x, from.y, from.z), dir.normalize());
  w.raycaster.far = dist;
  const hit = w.raycaster.intersectObjects(w.occluders, true).find((x) => {
    let o = x.object;
    while (o && o !== own) o = o.parent;
    return !o && x.distance < dist - 0.6;
  });
  w.raycaster.far = Infinity;
  return !hit;
}

// Hikers and animals hidden behind a tent, a tree or the shelter aren't in the picture.
function markBlocked(w, subjects, cam) {
  subjects.forEach((s) => {
    if (s.kind !== "wildlife" && s.kind !== "hiker") return;
    const own = s.kind === "hiker" ? w.npcViews.get(s.id)?.g : null;
    s.blocked = !lineClear(w, cam, s, own);
  });
}

function takePhoto(w) {
  if (!w.photo.on) return;
  const ph = w.photo;
  const p = w.player;
  const cam = { x: p.x, y: EYE, z: p.z, yaw: ph.yaw, pitch: ph.pitch, fov: (ph.fov * Math.PI) / 180, aspect: w.camera.aspect };
  const subjects = photoSubjects(w);
  markBlocked(w, subjects, cam);
  const result = framePhoto(subjects, cam);
  const ctx = w.lastCtx || {};
  const caption = photoCaption(result, { time: ctx.time, weather: ctx.weather });
  if (result && result.subject.kind === "wildlife") {
    const v = w.visitors && w.visitors.list.find((x) => x.key === result.subject.key);
    if (v) v.photographed = true;
  }
  let src = "";
  try {
    w.renderer.render(w.scene, w.camera);
    src = w.canvas.toDataURL("image/jpeg", 0.7);
  } catch (e) { /* a tainted or lost canvas: keep the caption */ }
  session.photos.unshift({ src, caption, at: Date.now() + Math.random() });
  if (session.photos.length > MAX_PHOTOS) session.photos.length = MAX_PHOTOS;
  showToast(w, caption);
  w.ui.status.textContent = `Photo taken. ${caption}`;
  if (!reducedMotion()) {
    w.ui.flash.classList.remove("is-on");
    void w.ui.flash.offsetWidth;
    w.ui.flash.classList.add("is-on");
  }
  renderLife(w);
}

function showToast(w, text) {
  const t = w.ui.toast;
  t.textContent = text;
  t.hidden = false;
  clearTimeout(w.toastTimer);
  w.toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
}

// ---- Input ----------------------------------------------------------------------------------------

const TURN_KEYS = { Comma: 1, Period: -1 };

function bindInput(w) {
  const c = w.canvas;
  c.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (w.photo.on) {
      if (e.key === "Escape" || e.code === "KeyC") { e.preventDefault(); exitCamera(w, { focus: true }); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) takePhoto(w); }
      else if (e.code === "Equal" || e.code === "NumpadAdd") { e.preventDefault(); zoomCamera(w, -1); }
      else if (e.code === "Minus" || e.code === "NumpadSubtract") { e.preventDefault(); zoomCamera(w, 1); }
      else if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); w.held.add(e.code); }
      return;
    }
    if (e.code === "KeyC") { e.preventDefault(); enterCamera(w); return; }
    if (MOVE_KEYS.includes(e.code) || TURN_KEYS[e.code]) { w.held.add(e.code); e.preventDefault(); dismissHint(w); }
    else if (e.code === "ShiftLeft" || e.code === "ShiftRight") w.held.add("Shift");
    else if ((e.code === "KeyE" || e.key === "Enter" || e.key === " ") && w.near) { e.preventDefault(); interact(w, w.near.id); }
  });
  c.addEventListener("keyup", (e) => { w.held.delete(e.code === "ShiftLeft" || e.code === "ShiftRight" ? "Shift" : e.code); });
  c.addEventListener("blur", () => w.held.clear());
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  c.addEventListener("wheel", (e) => {
    if (!w.photo.on) return;
    e.preventDefault();
    zoomCamera(w, Math.sign(e.deltaY));
  }, { passive: false });
  c.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    c.focus({ preventScroll: true });
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (e.pointerType !== "mouse" && !w.joy && !w.photo.on && x < r.width * 0.45) {
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
      if (w.photo.on) {
        const ph = w.photo;
        const z = ph.fov / FOV; // aim finer when zoomed in
        ph.track = null;
        ph.yaw -= (e.clientX - w.drag.x) * 0.004 * k * z;
        ph.pitch = Math.max(-1.2, Math.min(1.2, ph.pitch - (e.clientY - w.drag.y) * 0.004 * k * z));
      } else {
        w.cam.yaw -= (e.clientX - w.drag.x) * 0.006 * k;
        w.cam.pitch = clampPitch(w.cam.pitch + (e.clientY - w.drag.y) * 0.004 * k);
      }
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
      if (tap && w.photo.on) takePhoto(w);
      else if (tap) pick(w, e.clientX, e.clientY);
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

// Tap or click: a place opens its panel, a hiker shows their page below, a visitor raises the camera.
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
  else if (type === "visitor") {
    const v = w.visitors && w.visitors.list.find((x) => x.key === id);
    if (v) aimAt(w, v);
  }
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
      h("li", {}, "Photo camera: press C or 📷, aim, then press Space or the shutter. Escape puts it away."),
      h("li", {}, "Tap a hiker in camp to see their badges below.")),
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
  const ph = w.photo;
  const keys = keysVector(w.held);
  if (ph.on) {
    // Photo camera: the arrow keys and WASD aim instead of walking.
    const k = dt * 1.4 * session.sensitivity * (ph.fov / FOV);
    const has = (...codes) => codes.some((c) => w.held.has(c));
    if (MOVE_KEYS.some((c) => w.held.has(c))) ph.track = null;
    if (ph.track) {
      if (w.visitors && w.visitors.list.includes(ph.track)) aimAngles(w, visitorPoint(ph.track));
      else ph.track = null;
    }
    ph.yaw += ((has("KeyA", "ArrowLeft") ? 1 : 0) - (has("KeyD", "ArrowRight") ? 1 : 0)) * k;
    ph.pitch = Math.max(-1.2, Math.min(1.2, ph.pitch + ((has("KeyW", "ArrowUp") ? 1 : 0) - (has("KeyS", "ArrowDown") ? 1 : 0)) * k));
    p.speed = 0;
    w.camera.position.set(p.x, EYE, p.z);
    w.camera.lookAt(w.camLook.set(p.x + Math.sin(ph.yaw) * Math.cos(ph.pitch), EYE + Math.sin(ph.pitch), p.z + Math.cos(ph.yaw) * Math.cos(ph.pitch)));
    if (Math.abs(w.camera.fov - ph.fov) > 0.01) {
      w.camera.fov += (ph.fov - w.camera.fov) * Math.min(1, dt * 12);
      w.camera.updateProjectionMatrix();
    }
  } else {
    const input = w.joy ? joystickVector(w.joy.dx, w.joy.dy) : keys;
    const turn = (w.held.has("Comma") ? 1 : 0) - (w.held.has("Period") ? 1 : 0);
    if (turn) w.cam.yaw += turn * 1.8 * dt * session.sensitivity;
    if (input.strength > 0) {
      const run = w.held.has("Shift") || (w.joy && input.strength > 0.92);
      const step = stepFromInput(input, w.cam.yaw, run ? RUN_SPEED : WALK_SPEED, dt);
      const next = moveActor(p, step.dx, step.dz, w.playerColliders.length ? w.playerColliders : w.colliders);
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
    if (w.camera.fov !== FOV) { w.camera.fov = FOV; w.camera.updateProjectionMatrix(); }
    setNear(w, nearestLocation(p));
  }
  w.playerCollider.x = p.x;
  w.playerCollider.z = p.z;

  const a = w.anim;
  if (!a) return;
  stepLife(w, dt, t, a.reduced);
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
}

// Move the hikers and visitors on, then pose them. The text list catches up at most once a second.
function stepLife(w, dt, t, reduced) {
  if (!w.life) return;
  const changed = stepCampLife(w.life, dt, w.npcBlockers);
  const npcs = w.life.npcs;
  npcs.forEach((n, i) => {
    const c = w.npcColliders[i];
    if (c) { c.x = n.x; c.z = n.z; }
    applyPose(w.npcViews.get(n.id), n, t, reduced);
  });
  if (changed.length) w.lifeDirty = true;
  if (w.visitors) {
    const { arrived, left } = stepVisitors(w.visitors, dt, { player: w.player, colliders: w.playerColliders });
    left.forEach((v) => removeVisitorView(w, v));
    arrived.forEach((v) => addVisitorView(w, v));
    if (arrived.length || left.length) w.lifeDirty = true;
    w.visitorViews.forEach((view) => animateVisitor(view, t, reduced));
  }
  if (w.anim && w.anim.blockAxe) w.anim.blockAxe.visible = !npcs.some((n) => n.item === "axe" || n.pose === "chop");
  placeSelection(w);
  if (w.lifeDirty && t - (w.lifeAt || 0) > 1) renderLife(w);
}
