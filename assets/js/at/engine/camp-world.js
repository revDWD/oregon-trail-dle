// The 3D camp's world: layout, movement, camera, quality and the camp-board summaries. Pure maths and
// data, no DOM and no three.js, so all of it is unit-tested. The renderer (ui/camp-3d.js) only draws
// what this module decides. Units are metres on the ground plane (x east, z south, y up).

export const WORLD_RADIUS = 21; // walkable circle around the fire
export const PLAYER_RADIUS = 0.45;
export const WALK_SPEED = 3.6; // metres per second
export const RUN_SPEED = 6;

// Places you can walk up to. `reach` is how close (from the edge of the object) the prompt appears.
// Order is the order of the Camp Locations list below the scene. `view` is the close-up the camera
// moves to while you use the place (see locationView): `distance` back toward the fire, `side` to the
// right of that line, the camera's `height`, the height it `look`s at and how far `ahead` past the
// place it looks. The campfire `orbit`s slowly instead (radians per second).
export const CAMP_LOCATIONS = Object.freeze([
  { id: "roster", name: "Hiker Roster Campfire", x: 0, z: 0, radius: 1.5, reach: 2, verb: "Sit by the fire",
    view: { orbit: 0.05, distance: 3.7, height: 2, look: 0.65 } },
  { id: "bulletin", name: "Expedition Bulletin Board", x: 7.7, z: -7.7, radius: 0.9, reach: 1.8, verb: "Read the board",
    view: { distance: 2.6, height: 1.55, look: 1.4 } },
  { id: "journal", name: "Trail Journal Tent", x: -9.1, z: -6.3, radius: 1.5, reach: 1.6, verb: "Open the journal",
    view: { distance: 4.2, height: 1.9, look: 0.9 } },
  { id: "patches", name: "Patch Collection Display", x: -8.4, z: 7, radius: 0.9, reach: 1.8, verb: "Look at the patches",
    view: { distance: 2.6, side: 0.9, height: 1.45, look: 1.5 } },
  { id: "wildlife", name: "Wildlife Observation Area", x: 11.9, z: 4.9, radius: 1, reach: 2, verb: "Check recent sightings",
    view: { distance: 2.4, height: 1.75, look: 1.3, ahead: 7 } },
  { id: "map", name: "Trail Map Table", x: 3.5, z: 9.8, radius: 1.2, reach: 1.6, verb: "Study the map",
    view: { distance: 1.5, height: 2.6, look: 0.86 } }
].map((loc) => Object.freeze({ ...loc, view: Object.freeze(loc.view) })));

// Scenery you bump into but can't use. `tall` objects block the camera too.
export const CAMP_PROPS = Object.freeze([
  { id: "shelter", x: 0, z: -15.4, radius: 2.6, tall: true },
  { id: "pump", x: 5.6, z: -2.5, radius: 0.35 },
  { id: "bear-bags", x: -14, z: -1.4, radius: 0.5, tall: true },
  { id: "signpost", x: 0, z: 16.8, radius: 0.3, tall: true },
  { id: "woodpile", x: -11.9, z: 1.7, radius: 0.7 },
  { id: "chopping-block", x: -10.4, z: -1.1, radius: 0.35 },
  { id: "supply-crates", x: 5, z: -9.6, radius: 0.6 },
  { id: "overlook-bench", x: 16.1, z: 8.4, radius: 0.6, tall: false },
  { id: "fallen-log", x: -13.3, z: 11.9, radius: 0.8, tall: false },
  // Signs of a camp in use: the camp kitchen, folding chairs, packs dropped by the trail, a drying line
  // of socks and a tree with the trail's white blaze.
  { id: "camp-kitchen", x: -2.5, z: -7, radius: 0.6 },
  { id: "camp-chairs", x: 10.6, z: 10.1, radius: 0.6, tall: false },
  { id: "pack-drop", x: -3.1, z: 11.8, radius: 0.5, tall: false },
  { id: "drying-line", x: 11.5, z: -3.6, radius: 0.4 },
  { id: "blaze-tree", x: -2, z: 19, radius: 0.35, tall: true },
  // A picnic table in front of the shelter, the trail register box by the signpost, a supply cache of
  // bear canisters and water jugs, and a junction sign where the side paths leave the trail.
  { id: "picnic-table", x: 3.8, z: -12.6, radius: 0.9, tall: false },
  { id: "trail-register", x: -1.7, z: 15.6, radius: 0.3, tall: false },
  { id: "supply-cache", x: 9, z: -11.2, radius: 0.55, tall: false },
  { id: "junction-sign", x: -1.3, z: 7.6, radius: 0.25, tall: false }
]);

// Log benches around the fire, in the gaps between the paths (headings in degrees, atan2(x, z)).
// Each seats two, facing the flames.
const BENCH_RING = 3.3;
export const FIRE_BENCHES = Object.freeze([43.6, 88, 157.5, -152, -100, -25].map((deg, i) => {
  const a = (deg * Math.PI) / 180;
  return Object.freeze({ id: `bench-${i + 1}`, x: Math.sin(a) * BENCH_RING, z: Math.cos(a) * BENCH_RING, radius: 0.5, tall: false, heading: a });
}));
export const BENCH_SEATS = Object.freeze(FIRE_BENCHES.flatMap((b) => [-0.35, 0.35].map((off, k) => {
  const x = b.x + Math.cos(b.heading) * off;
  const z = b.z - Math.sin(b.heading) * off;
  return Object.freeze({ id: `${b.id}-${k ? "b" : "a"}`, bench: b.id, x, z, heading: Math.atan2(-x, -z) });
})));

export const CAMP_START = Object.freeze({ x: 0, z: 5.2, heading: Math.PI });

// Lantern posts (campScale adds them as the miles grow), lit in the evening and at night.
export const LANTERN_SPOTS = Object.freeze([{ x: -5, z: -7.8 }, { x: 4.2, z: -6.7 }, { x: -5.9, z: 5 }, { x: 7.6, z: 6.2 }]
  .map((spot, i) => Object.freeze({ id: `lantern-${i + 1}`, ...spot, radius: 0.15, tall: false })));

// Where the expedition's tents go as the miles grow (up to campScale's 8), clear of every path.
export const TENT_SPOTS = Object.freeze([
  { x: -5.3, z: -10.6 }, { x: -15.4, z: 6.3 }, { x: 14.7, z: -9.1 }, { x: 9.1, z: 14 },
  { x: -15.4, z: -8.4 }, { x: 16.1, z: -0.7 }, { x: -4.9, z: 15.4 }, { x: 7, z: -14 }
].map((spot, i) => ({ id: `tent-${i + 1}`, ...spot, radius: 1.3, tall: true })));

// Every circle that blocks walking.
export function campColliders({ tents = 0, benches = true, extra = [] } = {}) {
  return [...CAMP_LOCATIONS, ...CAMP_PROPS, ...TENT_SPOTS.slice(0, Math.max(0, Math.min(tents, TENT_SPOTS.length))),
    ...(benches ? FIRE_BENCHES : []), ...extra]
    .map(({ id, x, z, radius, tall }) => ({ id, x, z, radius, tall: tall !== undefined ? Boolean(tall) : id !== "roster" }));
}

// Move a circle by (dx, dz), sliding along anything it bumps and staying inside the camp.
export function moveActor(pos, dx, dz, colliders = [], { radius = PLAYER_RADIUS, bound = WORLD_RADIUS } = {}) {
  let x = pos.x + (Number(dx) || 0);
  let z = pos.z + (Number(dz) || 0);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const c of colliders) {
      const ox = x - c.x;
      const oz = z - c.z;
      const min = c.radius + radius;
      const d = Math.hypot(ox, oz);
      if (d >= min) continue;
      // Exactly on a centre: push east.
      const nx = d > 1e-6 ? ox / d : 1;
      const nz = d > 1e-6 ? oz / d : 0;
      x = c.x + nx * min;
      z = c.z + nz * min;
    }
  }
  const limit = bound - radius;
  const r = Math.hypot(x, z);
  if (r > limit) { x = (x / r) * limit; z = (z / r) * limit; }
  return { x, z };
}

// The closest location within reach of the player, or null.
export function nearestLocation(pos, locations = CAMP_LOCATIONS) {
  let best = null;
  let bestGap = Infinity;
  for (const loc of locations) {
    const gap = Math.hypot(pos.x - loc.x, pos.z - loc.z) - loc.radius;
    if (gap <= loc.reach + PLAYER_RADIUS && gap < bestGap) { best = loc; bestGap = gap; }
  }
  return best;
}

// The close-up camera for a place: on the fire side of it (the side every place faces), looking at it.
// The campfire has no "fire side", so its view circles the flames at `angle` (a heading from the fire;
// the renderer advances it by view.orbit per second for the calm campfire mode).
export function locationView(loc, { angle = 0 } = {}) {
  const v = loc.view || { distance: 3, height: 1.6, look: 1 };
  let ux;
  let uz;
  if (v.orbit !== undefined) { ux = Math.sin(angle); uz = Math.cos(angle); } else {
    const d = Math.hypot(loc.x, loc.z) || 1;
    ux = -loc.x / d;
    uz = -loc.z / d;
  }
  const side = v.side || 0;
  const ahead = v.ahead || 0;
  const x = loc.x + ux * v.distance + uz * side;
  const z = loc.z + uz * v.distance - ux * side;
  // Heights are above the place's own ground; the camera never dips below the slope where it stands.
  const g = groundHeight(loc.x, loc.z);
  return {
    x,
    y: Math.max(g + v.height, groundHeight(x, z) + 0.6),
    z,
    look: { x: loc.x - ux * ahead, y: g + v.look, z: loc.z - uz * ahead }
  };
}

// True when something at `point` stands between a close-up camera (`view`, from locationView) and its
// place, so the renderer can step it out of shot as it does the player. The sight line widens towards
// the place to cover the prop. The campfire view keeps its company: hikers round the fire stay.
export function blocksView(loc, view, point, clearance = 0.55) {
  if (!loc || !view || !point || (loc.view && loc.view.orbit !== undefined)) return false;
  const bx = loc.x - view.x;
  const bz = loc.z - view.z;
  const t = ((point.x - view.x) * bx + (point.z - view.z) * bz) / (bx * bx + bz * bz || 1);
  if (t < -0.1 || t > 0.95) return false;
  return Math.hypot(point.x - (view.x + bx * t), point.z - (view.z + bz * t)) < clearance + loc.radius * t;
}

// A virtual joystick's offset (in px) to a direction: y up is forward. Inside the dead zone it is
// still; beyond `max` it is full speed.
export function joystickVector(dx, dy, max = 48, deadzone = 0.18) {
  const len = Math.hypot(dx, dy);
  const raw = max > 0 ? len / max : 0;
  if (!len || raw <= deadzone) return { forward: 0, right: 0, strength: 0 };
  const strength = Math.min((raw - deadzone) / (1 - deadzone), 1);
  return { forward: (-dy / len) * strength, right: (dx / len) * strength, strength };
}

// Held keys to a direction. WASD and the arrow keys both work.
const KEY_DIRS = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
export const MOVE_KEYS = Object.freeze(Object.keys(KEY_DIRS));
export function keysVector(held) {
  let forward = 0;
  let right = 0;
  for (const code of held || []) {
    const dir = KEY_DIRS[code];
    if (dir) { forward += dir[0]; right += dir[1]; }
  }
  forward = Math.max(-1, Math.min(1, forward));
  right = Math.max(-1, Math.min(1, right));
  const len = Math.hypot(forward, right);
  return len > 1 ? { forward: forward / len, right: right / len, strength: 1 } : { forward, right, strength: len };
}

// Turn camera-relative input into a ground step. The camera sits behind the player at `yaw`
// (0 = looking north, toward -z), so "forward" always means "away from the camera".
export function stepFromInput(input, yaw, speed, dt) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const s = speed * Math.max(0, Math.min(dt, 0.1));
  return { dx: (fx * input.forward + rx * input.right) * s, dz: (fz * input.forward + rz * input.right) * s };
}

// The heading a hiker faces when walking along (dx, dz); three.js rotation.y for a model facing +z.
export const headingOf = (dx, dz) => Math.atan2(dx, dz);

// Ease an angle toward a target the short way round.
export function turnToward(current, target, maxStep) {
  let diff = ((target - current + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Math.abs(diff) > maxStep) diff = Math.sign(diff) * maxStep;
  return current + diff;
}

export const CAMERA = Object.freeze({ distance: 6.5, minDistance: 1.6, minPitch: 0.12, maxPitch: 1.05, height: 1.3 });

export const clampPitch = (pitch) => Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, pitch));

// Third-person follow camera. Pulled in when a tall object (or the edge of the camp) would sit between
// the camera and the hiker, so the view never ends up inside the shelter or a tree. Heights follow the
// ground under the hiker (`target.y`, 0 by default), and the camera stays above the slope behind them.
export function followCamera(target, yaw, pitch, colliders = [], { distance = CAMERA.distance, bound = WORLD_RADIUS + 6, ground = null } = {}) {
  const p = clampPitch(pitch);
  const flat = Math.cos(p);
  const dir = { x: Math.sin(yaw) * flat, y: Math.sin(p), z: Math.cos(yaw) * flat };
  let reach = distance;
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    const t = (distance * i) / steps;
    const x = target.x + dir.x * t;
    const z = target.z + dir.z * t;
    const hit = Math.hypot(x, z) > bound || colliders.some((c) => c.tall && Math.hypot(x - c.x, z - c.z) < c.radius + 0.25);
    if (hit) { reach = Math.max(CAMERA.minDistance, t - distance / steps); break; }
  }
  const base = (target.y || 0) + CAMERA.height;
  const x = target.x + dir.x * reach;
  const z = target.z + dir.z * reach;
  const y = Math.max(base + dir.y * reach, ground ? ground(x, z) + 0.5 : -Infinity);
  return { x, y, z, look: { x: target.x, y: base, z: target.z }, distance: reach };
}

// Rendering budget from what the device tells us. Low keeps phones cool; nothing here is required
// to enjoy camp. `fps` (measured) can lower a tier later. `visitors` caps the wildlife in camp at
// once, `flora` the ground plants (ferns, shrubs, flowers, stones) and `ground` the ground texture size.
// `shadows` is the sun's shadow map size for the still scenery (0: soft blob shadows only).
// `models` swaps the hand-made hero models (CAMP_MODELS) in for their procedural stand-ins.
export const QUALITY = Object.freeze({
  low: { id: "low", pixelRatio: 1, antialias: false, trees: 26, fireflies: 12, smoke: 6, visitors: 1, flora: 60, ground: 512, shadows: 0, models: false },
  medium: { id: "medium", pixelRatio: 1.5, antialias: true, trees: 42, fireflies: 26, smoke: 10, visitors: 2, flora: 130, ground: 1024, shadows: 1024, models: true },
  high: { id: "high", pixelRatio: 2, antialias: true, trees: 60, fireflies: 42, smoke: 14, visitors: 3, flora: 200, ground: 1024, shadows: 2048, models: true }
});

// Hero models: a few hand-made GLB models for key places, in assets/models/camp/. Everything else stays
// procedural. Each model replaces a prop's procedural body on Medium and High once it has loaded; the
// procedural one stays on Low, while loading and if the file fails. Models carry no textures: each
// material is named after a camp palette colour (MODEL_MATERIALS) and drawn with the camp's own
// materials, so time of day, weather and shadows light it like the rest of camp. `hooks` are empty
// nodes where live parts attach (the shelter's lantern and name board). Budgets are test-enforced.
export const MODEL_MATERIALS = Object.freeze(["wood", "wood-light", "wood-dark", "cream", "stone"]);
export const MODEL_BUDGET = Object.freeze({ bytes: 60000, totalBytes: 300000, drawCalls: 3, triangles: 3000 });
export const CAMP_MODELS = Object.freeze([
  { id: "shelter", prop: "shelter", file: "shelter.glb", hooks: ["lantern-hook", "sign-hook"],
    credit: "Original model made for this project (scripts/camp-models.mjs)", licence: "Same licence as this repository" }
]);

export function qualityTier({ dpr = 1, cores = 4, memory = 4, mobile = false, saveData = false } = {}) {
  if (saveData || cores <= 2 || memory <= 2) return QUALITY.low;
  if (mobile) return cores >= 8 && memory >= 6 ? QUALITY.medium : QUALITY.low;
  if (cores >= 8 && dpr <= 2) return QUALITY.high;
  return QUALITY.medium;
}

// One step down when frames are slow (null when already at the bottom).
export function lowerQuality(tier) {
  return tier.id === "high" ? QUALITY.medium : tier.id === "medium" ? QUALITY.low : null;
}

// Light and sky for the device clock and the day's weather. Colours are hex numbers for three.js.
// `exposure` balances the tone mapping per time of day (a touch brighter at night so the camp stays
// readable, a touch lower at noon so the colours don't wash out); `shadow` is how dark sun shadows get.
const SKIES = {
  dawn: { sky: 0xf2c7a5, fog: 0xe7c3a8, ambient: 0xffe2c8, ambientIntensity: 1.2, sun: 0xffc48a, sunIntensity: 1.3, sunHeight: 0.35, exposure: 1.05, shadow: 0.5 },
  day: { sky: 0x9fd0ee, fog: 0xc4e0ef, ambient: 0xffffff, ambientIntensity: 1.4, sun: 0xfff2d6, sunIntensity: 1.8, sunHeight: 1, exposure: 0.95, shadow: 0.6 },
  dusk: { sky: 0xd98a6a, fog: 0x9a6f72, ambient: 0xf0b8a0, ambientIntensity: 1, sun: 0xff9a5c, sunIntensity: 1, sunHeight: 0.22, exposure: 1.1, shadow: 0.45 },
  night: { sky: 0x101a33, fog: 0x141d33, ambient: 0x6a7fb5, ambientIntensity: 0.55, sun: 0x9fb4ff, sunIntensity: 0.35, sunHeight: 0.7, exposure: 1.25, shadow: 0.25 }
};
const GREY = { rain: 0.45, storm: 0.6, fog: 0.35, snow: 0.3 };

function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

export function campLighting(time = "day", weather = { id: "clear" }) {
  const base = SKIES[time] || SKIES.day;
  const grey = GREY[weather && weather.id] || 0;
  const night = time === "night";
  const glow = night || time === "dusk";
  return {
    ...base,
    sky: mix(base.sky, night ? 0x1c2233 : 0x8a949c, grey),
    fog: mix(base.fog, night ? 0x1c2233 : 0x9aa3aa, grey),
    sunIntensity: base.sunIntensity * (1 - grey * 0.6),
    shadow: base.shadow * (1 - grey), // overcast days have no crisp shadows
    fogNear: weather && weather.id === "fog" ? 8 : 18,
    fogFar: weather && weather.id === "fog" ? 32 : 62,
    fireIntensity: night ? 9 : glow ? 6 : 2.5,
    lanterns: glow,
    fireflies: glow && !(weather && ["rain", "storm", "snow"].includes(weather.id)),
    stars: night && grey < 0.4,
    rain: Boolean(weather && ["rain", "storm"].includes(weather.id)),
    snow: Boolean(weather && weather.id === "snow")
  };
}

// Deterministic 0..1 values for placing scenery (same camp on every device).
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Terrain: the camp sits in a clearing on a wooded hillside ----------------------------------
// groundHeight(x, z) is the ground's height in metres, the same on every device. Inside camp the
// ground rolls gently and rises toward the shelter (north) so it sits up on a rise; past the clearing's
// ragged edge the banks climb into wooded slopes, except where the trail notches through (north and
// south along x = 0) and where the ground falls away below the overlook (the vista, east-south-east).
// Everything you can use or bump into stands on a level pad (TERRAIN_PADS), so props, seats and spots
// keep their heights; the fire's pad is at 0. A pond sits in a hollow west of camp.
const smooth = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise, 0..1.
function noise2(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx); const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz); const b = hash2(ix + 1, iz); const c = hash2(ix, iz + 1); const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => noise2(x, z) * 0.62 + noise2(x * 2.1 + 17, z * 2.1 - 9) * 0.26 + noise2(x * 4.3 - 31, z * 4.3 + 5) * 0.12;

export const TERRAIN = Object.freeze({
  rise: 0.036, // how much the camp climbs per metre toward the shelter
  roll: 0.3, // gentle rolls inside the clearing (metres, peak to peak)
  bank: 7.5, // how high the wooded banks climb past the clearing
  edge: WORLD_RADIUS + 1.5, // where the clearing ends (give or take its ragged edge)
  vista: { angle: Math.atan2(17, 7), width: 0.5, drop: 4 }, // below the overlook bench
  pond: { x: -29, z: 13, radius: 8, depth: 0.45 },
  span: 140 // the terrain mesh's width; the woods beyond fade into fog and the far hills
});

// How much of the vista lies in direction `angle` (heading atan2(x, z)): 1 straight out, 0 off to the side.
export function vistaShare(angle) {
  const d = Math.atan2(Math.sin(angle - TERRAIN.vista.angle), Math.cos(angle - TERRAIN.vista.angle));
  return 1 - smooth(TERRAIN.vista.width * 0.4, TERRAIN.vista.width, Math.abs(d));
}

// Where the clearing ends in direction `angle`: a ragged edge, never inside the walkable camp.
export function clearingEdge(angle) {
  return Math.max(WORLD_RADIUS + 0.5, TERRAIN.edge + (noise2(Math.cos(angle) * 2.2 + 40, Math.sin(angle) * 2.2 + 40) - 0.5) * 4);
}

// The camp's broad lie: up toward the shelter (north), with one slow swell. Pads level to this; the
// slope eases off past the clearing so the banks do the climbing.
function broadHeight(x, z) {
  return -Math.max(-16, Math.min(26, z)) * TERRAIN.rise + (noise2(x / 16 + 3, z / 16 - 7) - 0.5) * TERRAIN.roll;
}

// `fine` scales the small rolls (they fade out over the pads).
function baseHeight(x, z, fine = 1) {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(x, z);
  const inside = 1 - smooth(TERRAIN.edge - 6, TERRAIN.edge + 2, r);
  let h = broadHeight(x, z) + (fbm(x / 7 + 13, z / 7 - 2) - 0.5) * TERRAIN.roll * fine;
  const out = smooth(clearingEdge(angle) - 1, clearingEdge(angle) + 22, r);
  const trail = 1 - smooth(2.5, 9, Math.abs(x)); // the trail's notch through the banks
  const vista = vistaShare(angle);
  const bank = TERRAIN.bank * (0.7 + fbm(x / 9, z / 9) * 0.8) * (1 - 0.55 * trail * (1 - inside));
  h += out * bank * (1 - vista) - out * TERRAIN.vista.drop * vista;
  // Knolls and hollows in the woods.
  h += out * (fbm(x / 6 - 11, z / 6 + 23) - 0.5) * 2.4;
  return h;
}

// Pads: the small rolls smooth out under everything you can use or bump into, so nothing rocks on a
// bump; the broad lie stays (it is gentle, a few centimetres across a tent). The fire circle and the
// shelter are `flat`: truly level, blending back into the slope by `radius + PAD_BLEND`.
const PAD_BLEND = 2;
const FLAT_BLEND = 3.5;
const padOf = (o, extra) => ({ x: o.x, z: o.z, radius: o.radius + extra });
export const TERRAIN_PADS = Object.freeze([
  { x: 0, z: 0, radius: 4, flat: true }, // the fire and its benches
  ...CAMP_LOCATIONS.filter((l) => l.id !== "roster").map((l) => padOf(l, 0.6)),
  ...CAMP_PROPS.map((p) => (p.id === "shelter" ? { ...padOf(p, 1.4), flat: true } : padOf(p, 0.4))),
  ...TENT_SPOTS.map((t) => padOf(t, 0.3)),
  ...LANTERN_SPOTS.map((l) => padOf(l, 0.35))
].map((p) => Object.freeze({ ...p, level: broadHeight(p.x, p.z) - broadHeight(0, 0) })));

const ORIGIN = broadHeight(0, 0);

export function groundHeight(x, z) {
  let fine = 1;
  let flat = 0;
  let level = 0;
  if (Math.hypot(x, z) < TERRAIN.edge + 4) {
    for (const p of TERRAIN_PADS) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (p.flat && d < p.radius + FLAT_BLEND) {
        const w = 1 - smooth(p.radius, p.radius + FLAT_BLEND, d);
        if (w > flat) { flat = w; level = p.level; }
      }
      if (d < p.radius + PAD_BLEND) fine = Math.min(fine, smooth(p.radius, p.radius + PAD_BLEND, d));
    }
  }
  let h = baseHeight(x, z, fine) - ORIGIN;
  // The pond's hollow: a flat shore at `level`, dipping under the water in the middle.
  const pond = TERRAIN.pond;
  const dp = Math.hypot(x - pond.x, z - pond.z);
  if (dp < pond.radius + 5) {
    const shore = 1 - smooth(pond.radius - 1, pond.radius + 5, dp);
    const dip = dp < pond.radius ? pond.depth * (1 - (dp / pond.radius) ** 2) : 0;
    h = h + (POND_LEVEL - h) * shore - dip;
  }
  return h + (level - h) * flat;
}

// The pond lies in a hollow a little below the camp's west edge.
const POND_LEVEL = broadHeight(-20, 9) - ORIGIN - 0.2;
export const POND_SURFACE = POND_LEVEL - 0.06;

// The forest: thick on the banks, thinning to a few stragglers at the clearing's edge, in groves
// (noise) rather than a ring, with the trail's corridor (x = 0) and the overlook's vista left open
// and nothing in the pond. Rejection sampling keeps `count` exact and the result deterministic.
// `pineShare` is the section's share of evergreens (engine/camp-life.js REGION_FLORA).
export function forestRing(count, seed = 7, pineShare = 0.6) {
  const rand = seededRandom(seed);
  const trees = [];
  const pond = TERRAIN.pond;
  for (let tries = 0; trees.length < count && tries < count * 60; tries += 1) {
    const angle = rand() * Math.PI * 2;
    const edge = clearingEdge(angle);
    const r = edge + 0.5 + rand() ** 1.4 * 24;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    const near = 1 - smooth(edge + 0.5, edge + 6, r); // stragglers by the edge are rare
    const grove = smooth(0.3, 0.68, fbm(x / 11 + 5, z / 11 - 3));
    const keep = (0.2 + grove * 0.8) * (1 - near * 0.7) * (1 - vistaShare(angle) * 0.85)
      * smooth(2.4, 4.5, Math.abs(x)) * smooth(pond.radius + 0.5, pond.radius + 2, Math.hypot(x - pond.x, z - pond.z));
    const roll = rand();
    if (roll > keep) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    trees.push({ x, z, scale: 0.75 + rand() * 0.75 + grove * 0.2, kind: rand() < pineShare ? "pine" : "broadleaf" });
  }
  return trees;
}

// ---- Camp boards: what each location shows, built from data already loaded ------------------------

const byDateDesc = (key) => (a, b) => (String(b[key] || "") < String(a[key] || "") ? -1 : String(b[key] || "") > String(a[key] || "") ? 1 : 0);

// The bulletin board: who has been moving, the latest landmarks, the newest patches and the latest
// dispatch. Only aggregates every device can see (never another device's private activity rows).
export function bulletinBoard({ hikers = [], register = [], patches = [], dispatches = [], count = 4 } = {}) {
  return {
    movers: hikers.filter((x) => x.lastActivityDate)
      .sort((a, b) => byDateDesc("lastActivityDate")(a, b) || (Number(b.weekMiles) || 0) - (Number(a.weekMiles) || 0))
      .slice(0, count)
      .map((x) => ({ id: x.id, name: x.name, date: x.lastActivityDate, weekMiles: Number(x.weekMiles) || 0 })),
    landmarks: [...register].reverse().slice(0, 3).map((r) => ({ title: r.title, miles: r.miles, date: r.reachedOn || null, hikerName: r.hikerName || null })),
    patches: patches.filter((p) => p.earned).sort((a, b) => byDateDesc("earnedOn")(a, b) || b.mile - a.mile).slice(0, 3)
      .map((p) => ({ id: p.id, name: p.landmarkName, state: p.state, date: p.earnedOn || null })),
    dispatch: dispatches[0] ? { title: dispatches[0].title, author: dispatches[0].authorName, date: dispatches[0].publishedAt } : null
  };
}

// The campfire roster: everyone's contribution plus a few friendly numbers (no ranking language).
export function rosterCampfire(hikers = [], totals = {}) {
  const total = Number(totals.totalMiles) || 0;
  const rows = [...hikers].sort((a, b) => (Number(b.totalMiles) || 0) - (Number(a.totalMiles) || 0) || String(a.name).localeCompare(String(b.name)))
    .map((x) => ({ id: x.id, name: x.name, miles: Number(x.totalMiles) || 0, weekMiles: Number(x.weekMiles) || 0, share: total > 0 ? Math.round(((Number(x.totalMiles) || 0) / total) * 100) : 0 }));
  const busiest = [...rows].sort((a, b) => b.weekMiles - a.weekMiles)[0];
  return {
    rows,
    hikerCount: rows.length,
    totalMiles: total,
    weekMiles: Number(totals.weekMiles) || 0,
    activities: Number(totals.activityCount) || 0,
    weekStar: busiest && busiest.weekMiles > 0 ? { name: busiest.name, miles: busiest.weekMiles } : null,
    onTrailThisWeek: rows.filter((r) => r.weekMiles > 0).length
  };
}
