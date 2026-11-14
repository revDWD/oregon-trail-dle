// The 3D camp's world: layout, movement, camera, quality and the camp-board summaries. Pure maths and
// data, no DOM and no three.js, so all of it is unit-tested. The renderer (ui/camp-3d.js) only draws
// what this module decides. Units are metres on the ground plane (x east, z south, y up).

export const WORLD_RADIUS = 15; // walkable circle around the fire
export const PLAYER_RADIUS = 0.45;
export const WALK_SPEED = 3.2; // metres per second
export const RUN_SPEED = 5.2;

// Places you can walk up to. `reach` is how close (from the edge of the object) the prompt appears.
// Order is the order of the Camp Locations list below the scene.
export const CAMP_LOCATIONS = Object.freeze([
  { id: "roster", name: "Hiker Roster Campfire", x: 0, z: 0, radius: 1.5, reach: 2, verb: "Sit by the fire" },
  { id: "bulletin", name: "Expedition Bulletin Board", x: 5.5, z: -5.5, radius: 0.9, reach: 1.8, verb: "Read the board" },
  { id: "journal", name: "Trail Journal Tent", x: -6.5, z: -4.5, radius: 1.5, reach: 1.6, verb: "Open the journal" },
  { id: "patches", name: "Patch Collection Display", x: -6, z: 5, radius: 0.9, reach: 1.8, verb: "Look at the patches" },
  { id: "wildlife", name: "Wildlife Observation Area", x: 8.5, z: 3.5, radius: 1, reach: 2, verb: "Check recent sightings" },
  { id: "map", name: "Trail Map Table", x: 2.5, z: 7, radius: 1.2, reach: 1.6, verb: "Study the map" }
]);

// Scenery you bump into but can't use. `tall` objects block the camera too.
export const CAMP_PROPS = Object.freeze([
  { id: "shelter", x: 0, z: -11, radius: 2.6, tall: true },
  { id: "pump", x: 4, z: -1.8, radius: 0.35 },
  { id: "bear-bags", x: -10, z: -1, radius: 0.5, tall: true },
  { id: "signpost", x: 0, z: 12, radius: 0.3, tall: true },
  { id: "woodpile", x: -8.5, z: 1.2, radius: 0.7 },
  { id: "chopping-block", x: -7.4, z: -0.8, radius: 0.35 },
  { id: "supply-crates", x: 3.2, z: -7.4, radius: 0.6 },
  { id: "overlook-bench", x: 11.5, z: 6, radius: 0.6, tall: false },
  { id: "fallen-log", x: -9.5, z: 8.5, radius: 0.8, tall: false }
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

export const CAMP_START = Object.freeze({ x: 0, z: 4.2, heading: Math.PI });

// Lantern posts (campScale adds them as the miles grow), lit in the evening and at night.
export const LANTERN_SPOTS = Object.freeze([{ x: -3.6, z: -5.6 }, { x: 3, z: -4.8 }, { x: -4.2, z: 3.6 }, { x: 5.4, z: 4.4 }]
  .map((spot, i) => Object.freeze({ id: `lantern-${i + 1}`, ...spot, radius: 0.15, tall: false })));

// Where the expedition's tents go as the miles grow (up to campScale's 8), clear of every path.
export const TENT_SPOTS = Object.freeze([
  { x: -3.8, z: -7.6 }, { x: -11, z: 4.5 }, { x: 10.5, z: -6.5 }, { x: 6.5, z: 10 },
  { x: -11, z: -6 }, { x: 11.5, z: -0.5 }, { x: -3.5, z: 11 }, { x: 5, z: -10 }
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
// the camera and the hiker, so the view never ends up inside the shelter or a tree.
export function followCamera(target, yaw, pitch, colliders = [], { distance = CAMERA.distance, bound = WORLD_RADIUS + 6 } = {}) {
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
  const y = CAMERA.height + dir.y * reach;
  return { x: target.x + dir.x * reach, y, z: target.z + dir.z * reach, look: { x: target.x, y: CAMERA.height, z: target.z }, distance: reach };
}

// Rendering budget from what the device tells us. Low keeps phones cool; nothing here is required
// to enjoy camp. `fps` (measured) can lower a tier later. `visitors` caps the wildlife in camp at
// once, `flora` the ground plants (ferns, shrubs, flowers, stones) and `ground` the ground texture size.
export const QUALITY = Object.freeze({
  low: { id: "low", pixelRatio: 1, antialias: false, trees: 18, fireflies: 10, smoke: 6, visitors: 1, flora: 40, ground: 512 },
  medium: { id: "medium", pixelRatio: 1.5, antialias: true, trees: 28, fireflies: 22, smoke: 10, visitors: 2, flora: 80, ground: 1024 },
  high: { id: "high", pixelRatio: 2, antialias: true, trees: 40, fireflies: 36, smoke: 14, visitors: 3, flora: 130, ground: 1024 }
});

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
const SKIES = {
  dawn: { sky: 0xf2c7a5, fog: 0xe7c3a8, ambient: 0xffe2c8, ambientIntensity: 1.2, sun: 0xffc48a, sunIntensity: 1.3, sunHeight: 0.35 },
  day: { sky: 0x9fd0ee, fog: 0xc4e0ef, ambient: 0xffffff, ambientIntensity: 1.4, sun: 0xfff2d6, sunIntensity: 1.8, sunHeight: 1 },
  dusk: { sky: 0xd98a6a, fog: 0x9a6f72, ambient: 0xf0b8a0, ambientIntensity: 1, sun: 0xff9a5c, sunIntensity: 1, sunHeight: 0.22 },
  night: { sky: 0x101a33, fog: 0x141d33, ambient: 0x6a7fb5, ambientIntensity: 0.55, sun: 0x9fb4ff, sunIntensity: 0.35, sunHeight: 0.7 }
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
    fogNear: weather && weather.id === "fog" ? 6 : 14,
    fogFar: weather && weather.id === "fog" ? 26 : 48,
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

// The forest ring: trees between the camp edge and the far hills, never on a path. `pineShare` is the
// section's share of evergreens (engine/camp-life.js REGION_FLORA).
export function forestRing(count, seed = 7, pineShare = 0.6) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.25;
    const r = WORLD_RADIUS + 1.5 + rand() * 9;
    return { x: Math.sin(angle) * r, z: Math.cos(angle) * r, scale: 0.8 + rand() * 0.7, kind: rand() < pineShare ? "pine" : "broadleaf" };
  });
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
