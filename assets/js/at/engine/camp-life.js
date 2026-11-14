// Camp life for the 3D camp: what the hikers are doing, the wildlife that wanders through, the
// section's plants and the photo camera's framing. Pure maths and data (no DOM, no three.js), so it is
// all unit-tested; ui/camp-3d.js only draws it. Units and headings follow engine/camp-world.js.
//
// Nothing here is saved or sent anywhere: camp life is decoration built from data already loaded.
// Photos taken in camp add no miles, points or discoveries (see docs/camp-3d.md for how a future
// recognition step could connect them to the field guide).

import { BENCH_SEATS, CAMP_LOCATIONS, CAMP_PROPS, LANTERN_SPOTS, PLAYER_RADIUS, TENT_SPOTS, WORLD_RADIUS, headingOf, moveActor, seededRandom, turnToward } from "./camp-world.js";
import { CAMP_TIME_LABELS, WEATHER } from "./camp.js";
import { themeFor } from "./expedition-themes.js";

const TIME_INDEX = { dawn: 0, day: 1, dusk: 2, night: 3 };
const timeIndex = (time) => TIME_INDEX[time] ?? 1;
const wetWeather = (weather) => Boolean(weather && ["rain", "storm"].includes(weather.id));
const coldWeather = (weather) => Boolean(weather && weather.id === "snow");

export const NPC_RADIUS = 0.3;
export const NPC_WALK = 1.4; // metres per second

// ---- Spots -------------------------------------------------------------------------------------------
// A spot is where a hiker stands (or sits) to do something: { key, x, z, heading, y, seat }.
// `seat` spots may sit inside a collider (a bench, the shelter floor); hikers glide the last step.

const spot = (key, x, z, faceX, faceZ, extra = {}) => ({ key, x, z, heading: headingOf(faceX - x, faceZ - z), y: 0, seat: false, ...extra });
const round = (n) => Math.round(n * 100) / 100;
const deg = (d) => (d * Math.PI) / 180;
const toFire = (key, r, d, extra) => spot(key, round(Math.sin(deg(d)) * r), round(Math.cos(deg(d)) * r), 0, 0, extra);
// Two seats along a bench or log centred at (x, z) and facing `heading` (local x is the bench's length).
const seatsAlong = (key, x, z, heading, offsets, extra = {}) => offsets.map((off, i) => ({
  key: `${key}-${i + 1}`, x: round(x + Math.cos(heading) * off), z: round(z - Math.sin(heading) * off), heading, y: 0, seat: true, ...extra
}));
const prop = (id) => CAMP_PROPS.find((p) => p.id === id);
const loc = (id) => CAMP_LOCATIONS.find((l) => l.id === id);
const outward = (p) => headingOf(p.x, p.z);
const inward = (p) => headingOf(-p.x, -p.z);

// The overlook bench faces out over the valley; the fallen log faces camp.
export const OVERLOOK = Object.freeze({ ...prop("overlook-bench"), heading: outward(prop("overlook-bench")) });
export const FALLEN_LOG = Object.freeze({ ...prop("fallen-log"), heading: inward(prop("fallen-log")) });

const tentSpots = (tents, key, dist, turn, face) => tents.map((t, i) => {
  const a = Math.atan2(-t.x, -t.z) + turn;
  const x = round(t.x + Math.sin(a) * dist);
  const z = round(t.z + Math.cos(a) * dist);
  return face === "tent" ? spot(`${key}-${i + 1}`, x, z, t.x, t.z) : spot(`${key}-${i + 1}`, x, z, 0, 0, { y: -0.3 });
});

// ---- Activities --------------------------------------------------------------------------------------
// weights: how likely at [dawn, day, dusk, night]. cover: "shelter" activities grow in the rain,
// "outdoor" ones shrink. route: walk back and forth between the two spots, `carry` naming what is held
// on the way to each end and `poses` the pose at each end.

export const CAMP_ACTIVITIES = Object.freeze([
  { id: "fire", label: { dawn: "sitting by the morning fire", day: "sitting by the fire", dusk: "swapping stories by the fire", night: "sitting by the fire" }, pose: "sit", weights: [2, 1, 6, 5],
    spots: () => BENCH_SEATS.map((s) => ({ key: s.id, x: s.x, z: s.z, heading: s.heading, y: 0, seat: true })) },
  { id: "warm", label: "warming their hands at the fire", pose: "warm", weights: [4, 0.5, 2, 1],
    spots: () => [32, 122, -140, -75].map((d, i) => toFire(`warm-${i + 1}`, 2.15, d)) },
  { id: "cook", label: { dawn: "cooking breakfast", day: "making lunch", dusk: "cooking supper", night: "brewing a late cup of tea" }, pose: "cook", weights: [5, 1, 4, 0.5],
    spots: () => [-165, 75].map((d, i) => toFire(`cook-${i + 1}`, 1.85, d)) },
  { id: "water", label: "fetching water from the pump", route: true, carry: ["jug", "jug"], poses: ["pump", "cook"], weights: [4, 2, 1, 0], cover: "outdoor",
    spots: () => [spot("water-pump", 3.6, -1.2, 4, -1.8), spot("water-fire", 1.9, -0.5, 0, 0)] },
  { id: "logs", label: "carrying firewood", route: true, carry: [null, "logs"], poses: ["crouch", "crouch"], weights: [2, 3, 3, 0], cover: "outdoor",
    spots: () => [spot("logs-pile", -7.5, 1.9, -8.5, 1.2), spot("logs-fire", -1.98, 0.28, 0, 0)] },
  { id: "chop", label: "splitting kindling", pose: "chop", item: "axe", weights: [1, 4, 1, 0], cover: "outdoor",
    spots: () => [spot("chop", -7.4, -0.05, -7.4, -0.8)] },
  { id: "map", label: { dawn: "planning the day's miles", day: "studying the trail map", dusk: "tracing tomorrow's route", night: "studying the trail map" }, pose: "lean", weights: [5, 2, 1, 0],
    spots: () => [[0.95, 7.1], [4.05, 6.9], [2.5, 8.6]].map(([x, z], i) => spot(`map-${i + 1}`, x, z, loc("map").x, loc("map").z)) },
  { id: "gear", label: { dawn: "packing up gear", day: "airing out gear", dusk: "sorting gear", night: "sorting gear" }, pose: "crouch", weights: [3, 2, 1, 0], cover: "shelter",
    spots: (ctx) => tentSpots(ctx.tents, "gear", 1.8, 0, "tent") },
  { id: "stretch", label: "stretching sore legs", pose: "stretch", weights: [4, 1, 0.5, 0], cover: "outdoor",
    spots: () => [spot("stretch-1", 6.8, -2.8, 0, 0), spot("stretch-2", -4.4, 8.4, 0, 0)] },
  { id: "birdwatch", label: "watching birds", pose: "binoculars", weights: [3, 3, 1, 0], cover: "outdoor",
    spots: () => [[9.6, 4.6], [7.3, 4.6]].map(([x, z], i) => spot(`birdwatch-${i + 1}`, x, z, x * 2, z * 2)) },
  { id: "photo", label: "taking photos", pose: "photo", item: "camera", weights: [2, 3, 2, 0.3], cover: "outdoor",
    spots: () => [[12.6, 2.8], [-12.6, 1.2], [7.5, -12]].map(([x, z], i) => spot(`photo-${i + 1}`, x, z, x * 2, z * 2)) },
  { id: "overlook", label: { dawn: "watching the sunrise", day: "enjoying the view", dusk: "watching the sunset", night: "stargazing" }, pose: "sit", weights: [2, 3, 3, 0.5], cover: "outdoor",
    spots: () => seatsAlong("overlook", OVERLOOK.x, OVERLOOK.z, OVERLOOK.heading, [-0.35, 0.35]) },
  { id: "journal", label: "writing in the trail journal", pose: "write", weights: [1, 2, 4, 2], cover: "shelter",
    spots: () => [spot("journal", -4.94, -3.42, loc("journal").x, loc("journal").z)] },
  { id: "board", label: "reading the bulletin board", pose: "look", weights: [2, 3, 2, 0.5],
    spots: () => [[4.93, -4.23], [4.23, -4.93]].map(([x, z], i) => spot(`board-${i + 1}`, x, z, loc("bulletin").x, loc("bulletin").z)) },
  { id: "patches", label: "admiring the Expedition's patches", pose: "look", weights: [1, 2, 2, 0.5],
    spots: () => [[-4.75, 4.55], [-5.33, 3.85]].map(([x, z], i) => spot(`patches-${i + 1}`, x, z, loc("patches").x, loc("patches").z)) },
  { id: "relax", label: "resting on the fallen log", pose: "sit", weights: [0.5, 3, 2, 0], cover: "outdoor",
    spots: () => seatsAlong("relax", FALLEN_LOG.x, FALLEN_LOG.z, FALLEN_LOG.heading, [-0.45, 0.45], { y: -0.05 }) },
  { id: "shelter-read", label: "reading in the shelter", pose: "read", weights: [1, 2, 2, 2], cover: "shelter",
    spots: () => [-0.8, 0.8].map((x, i) => ({ key: `shelter-read-${i + 1}`, x, z: -9.75, heading: 0, y: 0.1, seat: true })) },
  { id: "sleep", label: "asleep in the shelter", pose: "sleep", weights: [0, 0, 0, 4], cover: "shelter",
    spots: () => [-1.4, 0, 1.4].map((x, i) => ({ key: `sleep-${i + 1}`, x, z: -11.3, heading: 0, y: 0.5, seat: true })) },
  { id: "tent-rest", label: { dawn: "waking up by their tent", day: "resting by their tent", dusk: "settling in by their tent", night: "turning in for the night" }, pose: "read", weights: [0.5, 0.5, 1, 3], cover: "shelter",
    spots: (ctx) => tentSpots(ctx.tents, "tent-rest", 1.95, 0.6, "fire") },
  { id: "lantern-read", label: "reading by lantern light", pose: "read", weights: [0, 0, 2, 3],
    spots: (ctx) => ctx.lanterns.map((l, i) => {
      const d = Math.hypot(l.x, l.z);
      return spot(`lantern-read-${i + 1}`, round(l.x - (l.x / d) * 0.75), round(l.z - (l.z / d) * 0.75), 0, 0, { y: -0.3 });
    }) },
  { id: "mingle", label: "chatting around camp", pose: "look", weights: [0.5, 0.5, 0.5, 0.3],
    spots: () => Array.from({ length: 12 }, (_, i) => toFire(`mingle-${i + 1}`, 5.4, i * 30))
      .filter((s) => LANTERN_SPOTS.every((l) => Math.hypot(s.x - l.x, s.z - l.z) > 0.8)) },
  // Only for a hiker who logged today, on arrival.
  { id: "arrive", label: "just back from the trail", pose: "wave", weights: [0, 0, 0, 0],
    spots: () => [spot("arrive-1", -0.6, 10.6, 0, 0), spot("arrive-2", 0.7, 10.4, 0, 0)] }
].map((a) => Object.freeze(a)));

const ACTIVITY = new Map(CAMP_ACTIVITIES.map((a) => [a.id, a]));
// Everyday activities a hiker can have as a favourite (twice as likely for them).
const FAVOURITES = CAMP_ACTIVITIES.filter((a) => !["sleep", "arrive", "mingle"].includes(a.id)).map((a) => a.id);

export function campContextFor({ tents = 0, lanterns = 0 } = {}) {
  return { tents: TENT_SPOTS.slice(0, Math.max(0, Math.min(tents, TENT_SPOTS.length))), lanterns: LANTERN_SPOTS.slice(0, Math.max(0, Math.min(lanterns, LANTERN_SPOTS.length))) };
}

export function activitySpots(activity, ctx = campContextFor()) {
  return activity.spots(ctx);
}

// Every spot in camp with everything built (for keeping plants off them and for tests).
export function allActivitySpots(ctx = campContextFor({ tents: TENT_SPOTS.length, lanterns: LANTERN_SPOTS.length })) {
  return CAMP_ACTIVITIES.flatMap((a) => a.spots(ctx).map((s) => ({ ...s, activity: a.id })));
}

export function activityLabel(activity, time = "day") {
  const a = typeof activity === "string" ? ACTIVITY.get(activity) : activity;
  if (!a) return "around camp";
  return typeof a.label === "string" ? a.label : a.label[time] || a.label.day;
}

// How likely `activity` is for this hiker now (0 when it can't happen).
export function activityWeight(activity, { time = "day", weather = null, favourite = null, current = null } = {}) {
  let w = activity.weights[timeIndex(time)] || 0;
  if (!w) return 0;
  if (wetWeather(weather)) w *= activity.cover === "shelter" ? 3 : activity.cover === "outdoor" ? 0.3 : 1;
  else if (coldWeather(weather) && activity.cover === "outdoor") w *= 0.6;
  if (favourite === activity.id) w *= 2;
  if (current === activity.id) w *= 0.15;
  return w;
}

function pickWeighted(list, rand) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const x of list) { r -= x.weight; if (r <= 0) return x; }
  return list[list.length - 1];
}

// ---- Hikers ------------------------------------------------------------------------------------------

function freeSpots(life, activity) {
  if (activity.route) return life.taken.has(`route:${activity.id}`) ? [] : [activity.spots(life.ctx)[0]];
  return activity.spots(life.ctx).filter((s) => !life.taken.has(s.key));
}

function claim(life, npc, activity, chosen) {
  release(life, npc);
  npc.claim = activity.route ? `route:${activity.id}` : chosen.key;
  life.taken.add(npc.claim);
  npc.activity = activity.id;
}

function release(life, npc) {
  if (npc.claim) life.taken.delete(npc.claim);
  npc.claim = null;
}

function chooseNext(life, npc, { first = false } = {}) {
  const options = [];
  if (first && npc.recent) {
    const a = ACTIVITY.get("arrive");
    const spots = freeSpots(life, a);
    if (spots.length) return { activity: a, spot: spots[Math.floor(life.rand() * spots.length)] };
  }
  for (const a of CAMP_ACTIVITIES) {
    const weight = activityWeight(a, { time: life.time, weather: life.weather, favourite: npc.favourite, current: npc.activity });
    if (!weight) continue;
    const spots = freeSpots(life, a);
    if (spots.length) options.push({ activity: a, spots, weight });
  }
  const pick = pickWeighted(options, life.rand);
  if (!pick) return null;
  return { activity: pick.activity, spot: pick.spots[Math.floor(life.rand() * pick.spots.length)] };
}

function actTime(life, npc) {
  const a = ACTIVITY.get(npc.activity);
  if (a && a.route) return 3 + life.rand() * 3;
  if (npc.activity === "sleep") return 60 + life.rand() * 60;
  if (npc.activity === "arrive") return 6 + life.rand() * 4;
  return (14 + life.rand() * 16) * (life.time === "night" ? 2 : 1);
}

// Small idle gestures a hiker slips in while doing something calm, with how long each lasts (s).
// They never change the activity or the spot; they only make the camp look less like a diorama.
export const HIKER_GESTURES = Object.freeze({
  "look-around": 3, coffee: 3.5, "check-map": 4, "adjust-pack": 2.5, "stretch-arms": 3, wave: 2.2
});
const GESTURES_BY_POSE = {
  look: ["look-around", "coffee", "check-map", "adjust-pack", "stretch-arms"],
  lean: ["look-around", "coffee", "stretch-arms"],
  warm: ["coffee", "look-around"],
  sit: ["coffee", "look-around", "stretch-arms"],
  read: ["look-around"],
  cook: ["look-around"],
  write: ["look-around", "stretch-arms"]
};
// Which gestures suit a pose (none while walking, sleeping or busy with both hands).
export function gesturesFor(pose) {
  return GESTURES_BY_POSE[pose] || [];
}
const WAVE_RANGE = 3.2;
const WAVE_COOLDOWN = 25;
const nextGestureIn = (life) => 4 + life.rand() * 8;

function settle(life, npc) {
  const a = ACTIVITY.get(npc.activity);
  const s = npc.target;
  Object.assign(npc, { x: s.x, z: s.z, y: s.y || 0, heading: s.heading, state: "act", moving: false, timer: actTime(life, npc),
    gesture: null, gestureT: 0, nextGesture: nextGestureIn(life) });
  if (a && a.route) { npc.pose = a.poses[npc.leg]; npc.item = a.carry[npc.leg]; }
  else { npc.pose = a ? a.pose : "look"; npc.item = (a && a.item) || null; }
}

function walkTo(npc, target, item = null) {
  Object.assign(npc, { target, state: "walk", moving: true, pose: "walk", item, y: 0, walked: 0, check: 0, checkDist: Infinity, detour: 0, gesture: null, gestureT: 0 });
}

// Start the next thing: the other end of a route, or a new activity.
function nextTask(life, npc) {
  const a = ACTIVITY.get(npc.activity);
  if (a && a.route && npc.trips > 0) {
    if (npc.leg === 1) npc.trips -= 1;
    const leg = 1 - npc.leg;
    if (npc.trips > 0 || leg === 1) {
      npc.leg = leg;
      walkTo(npc, a.spots(life.ctx)[leg], a.carry[leg]);
      return;
    }
  }
  const next = chooseNext(life, npc);
  if (!next) { npc.timer = 5; return; }
  claim(life, npc, next.activity, next.spot);
  if (next.activity.route) {
    npc.leg = 0;
    npc.trips = 2 + Math.floor(life.rand() * 2);
    walkTo(npc, next.activity.spots(life.ctx)[0], next.activity.carry[0]);
  } else walkTo(npc, next.spot);
}

// Everyone already doing something when you arrive. `people` comes from campPeople() (camp.js).
export function createCampLife({ people = [], time = "day", weather = null, tents = 0, lanterns = 0, seed = 1, reduced = false } = {}) {
  const life = { time, weather, ctx: campContextFor({ tents, lanterns }), rand: seededRandom(seed), taken: new Set(), reduced, npcs: [] };
  for (const p of people) {
    const npc = { id: p.id, name: p.name, seed: p.seed || 0, recent: Boolean(p.recent), favourite: FAVOURITES[(p.seed || 0) % FAVOURITES.length],
      x: 0, z: 0, y: 0, heading: 0, pose: "look", item: null, moving: false, state: "act", timer: 0, activity: null, claim: null, target: null, leg: 0, trips: 0,
      gesture: null, gestureT: 0, nextGesture: 0, waveCooldown: 0 };
    const next = chooseNext(life, npc, { first: true });
    if (!next) continue;
    claim(life, npc, next.activity, next.spot);
    if (next.activity.route) {
      npc.leg = life.rand() < 0.5 ? 0 : 1;
      npc.trips = 1 + Math.floor(life.rand() * 2);
      npc.target = next.activity.spots(life.ctx)[npc.leg];
    } else npc.target = next.spot;
    settle(life, npc);
    npc.timer *= 0.3 + life.rand() * 0.7; // not everyone gets up at once
    life.npcs.push(npc);
  }
  return life;
}

// Advance everyone by dt seconds. Returns the hikers whose activity changed (for the text list).
// With `player`, hikers who are idling nearby look up and wave now and then.
export function stepCampLife(life, dt, colliders = [], { player = null } = {}) {
  if (life.reduced || !(dt > 0)) return [];
  const changed = [];
  const step = Math.min(dt, 0.1);
  for (const npc of life.npcs) {
    const before = npc.activity;
    stepNpc(life, npc, step, colliders, player);
    if (npc.activity !== before) changed.push(npc);
  }
  return changed;
}

function stepGesture(life, npc, dt, player) {
  npc.waveCooldown = Math.max(0, (npc.waveCooldown || 0) - dt);
  if (npc.gesture) {
    npc.gestureT += dt;
    if (npc.gestureT >= HIKER_GESTURES[npc.gesture]) { npc.gesture = null; npc.gestureT = 0; npc.nextGesture = nextGestureIn(life); }
    return;
  }
  const options = gesturesFor(npc.pose);
  if (!options.length) return;
  if (player && npc.waveCooldown <= 0 && Math.hypot(player.x - npc.x, player.z - npc.z) < WAVE_RANGE) {
    Object.assign(npc, { gesture: "wave", gestureT: 0, waveCooldown: WAVE_COOLDOWN, waveAt: headingOf(player.x - npc.x, player.z - npc.z) });
    return;
  }
  npc.nextGesture -= dt;
  if (npc.nextGesture <= 0) {
    npc.gesture = options[Math.floor(life.rand() * options.length)];
    npc.gestureT = 0;
  }
}

function stepNpc(life, npc, dt, colliders, player) {
  if (npc.state === "act") {
    npc.timer -= dt;
    if (npc.timer <= 0) { nextTask(life, npc); return; }
    stepGesture(life, npc, dt, player);
    return;
  }
  const t = npc.target;
  const dx = t.x - npc.x;
  const dz = t.z - npc.z;
  const dist = Math.hypot(dx, dz);
  const s = NPC_WALK * dt;
  // The last step (onto a bench or into the shelter) ignores colliders.
  if (npc.state === "approach") {
    if (dist <= s) { settle(life, npc); return; }
    npc.x += (dx / dist) * s;
    npc.z += (dz / dist) * s;
    npc.heading = turnToward(npc.heading, headingOf(dx, dz), 8 * dt);
    return;
  }
  npc.walked += dt;
  npc.check += dt;
  if (dist < 1.2 || npc.walked > 30) { npc.state = "approach"; return; }
  if (npc.check >= 1) {
    if (npc.checkDist - dist < 0.3) {
      if (dist < 4) { npc.state = "approach"; return; }
      npc.detour = 1;
      npc.side = npc.side === 1 ? -1 : 1;
    }
    npc.checkDist = dist;
    npc.check = 0;
  }
  let angle = Math.atan2(dx, dz);
  if (npc.detour > 0) { angle += (npc.side || 1) * 1.2; npc.detour -= dt; }
  const moved = moveActor(npc, Math.sin(angle) * s, Math.cos(angle) * s, colliders, { radius: NPC_RADIUS });
  const mx = moved.x - npc.x;
  const mz = moved.z - npc.z;
  if (Math.hypot(mx, mz) > 1e-4) npc.heading = turnToward(npc.heading, headingOf(mx, mz), 8 * dt);
  npc.x = moved.x;
  npc.z = moved.z;
}

// "Kayla is cooking supper." A hiker on the way to something is described by what they're about to do.
export function describeNpc(npc, time = "day") {
  return `${npc.name} is ${activityLabel(npc.activity, time)}.`;
}

// ---- Wildlife visitors -------------------------------------------------------------------------------
// Animals that wander into camp now and then. They are never named until photographed. `model` is the
// renderer's shape; colours come from the species in expedition-themes.js. `times` scales the chance at
// [dawn, day, dusk, night]; `scenes` limits a visitor to some sections.

export const VISITOR_TIERS = Object.freeze({ common: 10, uncommon: 4, rare: 1.2, "very-rare": 0.35 });

export const CAMP_VISITORS = Object.freeze([
  { id: "gray-squirrel", tier: "common", model: "squirrel", place: "trees", size: 0.35, times: [1, 1, 0.5, 0] },
  { id: "chipmunk", tier: "common", model: "chipmunk", place: "edge", size: 0.25, times: [1, 1, 0.5, 0] },
  { id: "cottontail", tier: "common", model: "rabbit", place: "edge", size: 0.4, times: [1, 0.6, 1, 0.4] },
  { id: "chickadee", tier: "common", model: "songbird", place: "perch", bird: true, size: 0.2, times: [1, 1, 0.6, 0] },
  { id: "blue-jay", tier: "common", model: "songbird", place: "perch", bird: true, size: 0.3, times: [1, 1, 0.5, 0] },
  { id: "turkey", tier: "uncommon", model: "turkey", place: "edge", size: 0.9, times: [1, 1, 0.5, 0] },
  { id: "fox", tier: "uncommon", model: "fox", place: "outskirts", size: 0.7, times: [1, 0.4, 1, 0.8] },
  { id: "deer", tier: "uncommon", model: "deer", place: "treeline", size: 1.5, times: [1, 0.4, 1, 0.5] },
  { id: "coyote", tier: "rare", model: "coyote", place: "outskirts", size: 0.8, times: [0.6, 0.2, 1, 1] },
  { id: "barred-owl", tier: "rare", model: "owl", place: "perch", bird: true, size: 0.5, times: [0, 0, 0, 1] },
  { id: "bear", tier: "very-rare", model: "bear", place: "treeline", size: 1.4, times: [1, 0.6, 1, 0.4] },
  { id: "moose", tier: "very-rare", model: "moose", place: "treeline", size: 2.2, times: [1, 0.6, 1, 0.2], scenes: ["alpine", "north-woods"] }
].map((v) => Object.freeze(v)));

const speciesById = () => new Map(themeFor("wildlife").species.map((s) => [s.id, s]));

// Where birds land: post tops, the bear line, the shelter, the board, benches and logs.
export const PERCHES = Object.freeze([
  { id: "signpost", x: 0.9, z: 12, y: 2.25 },
  { id: "bear-pole-1", x: -10, z: -2.3, y: 3.45 },
  { id: "bear-pole-2", x: -10, z: 0.3, y: 3.45 },
  { id: "shelter-post", x: 2.2, z: -9.65, y: 2.55 },
  { id: "woodpile", x: -8.5, z: 1.2, y: 0.95 },
  { id: "board", x: 5.5, z: -5.5, y: 2.1 },
  { id: "overlook-bench", x: 11.5, z: 6, y: 0.5 },
  { id: "fallen-log", x: -9.5, z: 8.5, y: 0.5 }
].map((p) => Object.freeze(p)));
const OWL_PERCHES = ["signpost", "bear-pole-1", "bear-pole-2", "shelter-post"];

// Who might visit now, with a weight each.
export function visitorPool({ time = "day", weather = null, scene = "southern-ridges" } = {}) {
  const species = speciesById();
  const ti = timeIndex(time);
  const birdsDown = weather && ["rain", "storm", "snow"].includes(weather.id);
  return CAMP_VISITORS.filter((v) => species.has(v.id) && (!v.scenes || v.scenes.includes(scene)))
    .map((v) => ({ visitor: v, species: species.get(v.id), weight: VISITOR_TIERS[v.tier] * v.times[ti] * (v.bird && birdsDown ? 0.4 : 1) }))
    .filter((x) => x.weight > 0);
}

export function pickVisitor(pool, rand) {
  return pickWeighted(pool, rand);
}

const clearOf = (x, z, colliders, gap) => colliders.every((c) => Math.hypot(x - c.x, z - c.z) > c.radius + gap);
const polar = (a, r, y = 0) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r, y });

function groundPoint(rand, a, rMin, rMax, colliders, spread = 0.6) {
  for (let i = 0; i < 12; i += 1) {
    const p = polar(a + (rand() - 0.5) * spread, rMin + rand() * (rMax - rMin));
    if (clearOf(p.x, p.z, colliders, 0.6)) return p;
  }
  return polar(a, WORLD_RADIUS + 1);
}

// Waypoints { x, y, z, wait, fly } from the woods, through camp and out again.
export function visitorRoute(visitor, rand, colliders = []) {
  const a = rand() * Math.PI * 2;
  const stop = (p, wait) => ({ x: p.x, y: p.y || 0, z: p.z, wait, fly: false });
  const enter = { ...polar(a, 19), wait: 0, fly: false };
  const leave = (b) => ({ ...polar(b, 23), wait: 0, fly: false });
  const w = (lo, hi) => lo + rand() * (hi - lo);
  switch (visitor.place) {
    case "perch": {
      const owl = visitor.id === "barred-owl";
      const perches = PERCHES.filter((p) => !owl || OWL_PERCHES.includes(p.id));
      const first = perches[Math.floor(rand() * perches.length)];
      const second = perches[Math.floor(rand() * perches.length)];
      const tree = polar(a + 0.5, WORLD_RADIUS + 1.2, 3.2);
      const route = [{ ...polar(a, 21, 7), wait: 0, fly: true }, { ...first, wait: owl ? w(14, 26) : w(4, 9), fly: true }];
      if (second !== first) route.push({ ...second, wait: owl ? w(10, 18) : w(3, 7), fly: true });
      route.push({ ...tree, wait: w(2, 5), fly: true }, { ...polar(a + 1, 24, 9), wait: 0, fly: true });
      return route;
    }
    case "trees": {
      const p1 = groundPoint(rand, a, 12.5, 14.2, colliders, 0.3);
      const p2 = groundPoint(rand, a + 0.25, 11.5, 14, colliders, 0.3);
      return [{ ...polar(a, 16.5), wait: 0, fly: false }, stop(p1, w(2, 5)), stop(p2, w(2, 5)), { ...polar(a + 0.4, 17), wait: 0, fly: false }];
    }
    case "treeline": {
      const p1 = groundPoint(rand, a, 13.6, 15, colliders, 0.3);
      const p2 = groundPoint(rand, a + 0.3, 13.6, 15, colliders, 0.3);
      return [enter, stop(p1, w(6, 12)), stop(p2, w(5, 10)), leave(a + 0.8)];
    }
    case "outskirts": {
      const p1 = groundPoint(rand, a + 0.4, 11, 13.8, colliders, 0.2);
      const p2 = groundPoint(rand, a + 0.9, 11, 13.8, colliders, 0.2);
      return [enter, stop(p1, w(1.5, 4)), stop(p2, w(1.5, 4)), leave(a + 1.3)];
    }
    default: { // edge: hops and pecks round the clearing's rim
      const p1 = groundPoint(rand, a, 9.5, 13, colliders);
      const r1 = Math.hypot(p1.x, p1.z);
      const p2 = groundPoint(rand, Math.atan2(p1.x, p1.z), Math.max(9, r1 - 1.5), r1 + 1.5, colliders, 0.25);
      return [enter, stop(p1, w(3, 8)), stop(p2, w(3, 7)), leave(a + (rand() - 0.5) * 2)];
    }
  }
}

function spawnVisitor(state, pick) {
  const route = visitorRoute(pick.visitor, state.rand, state.colliders);
  const start = route[0];
  state.serial += 1;
  const v = { key: `${pick.visitor.id}-${state.serial}`, id: pick.visitor.id, visitor: pick.visitor, species: pick.species,
    x: start.x, y: start.y, z: start.z, heading: headingOf(-start.x, -start.z), route, leg: 1, wait: 0, moving: true, flying: Boolean(start.fly), startled: false, photographed: false, idle: null, idleT: 0 };
  state.list.push(v);
  return v;
}

// The visitor schedule: the first comes after a few seconds, then one every 12-40 s, never more than
// `cap` (the quality tier's `visitors`) at once. Reduced motion shows a still visitor or two instead.
export function createVisitors({ time = "day", weather = null, scene = "southern-ridges", cap = 2, seed = 1, reduced = false, colliders = [] } = {}) {
  const state = { pool: visitorPool({ time, weather, scene }), cap: Math.max(0, cap), rand: seededRandom(seed), idleRand: seededRandom(seed + 7919), list: [], next: 0, serial: 0, reduced, colliders };
  state.next = 4 + state.rand() * 6;
  if (reduced) {
    for (let i = 0; i < Math.min(state.cap, 2) && state.pool.length; i += 1) {
      const v = spawnVisitor(state, pickVisitor(state.pool, state.rand));
      const rest = v.route[1];
      Object.assign(v, { x: rest.x, y: rest.y, z: rest.z, heading: headingOf(-rest.x, -rest.z), moving: false, flying: false, wait: Infinity });
    }
  }
  return state;
}

export const visitorSpeed = (v) => ((Number(v.species && v.species.speed) || 40) / 40) * (v.flying ? 2.2 : 1) * (v.startled ? (v.species.behavior && v.species.behavior.flee) || 2 : 1);

// How close (metres) the player can get before a visitor startles.
export const waryDistance = (v) => ((v.species && v.species.behavior && v.species.behavior.wary) || 1) * 2.5;

// Startle a visitor that the player walks up to: it bolts (flee), takes off (flush) or ignores you.
function startle(v, player) {
  const b = (v.species && v.species.behavior) || {};
  if (b.react === "ignore" || v.startled) return false;
  const away = Math.atan2(v.x - player.x, v.z - player.z);
  v.startled = true;
  v.wait = 0;
  v.leg = 0;
  v.route = b.react === "flush" || v.visitor.bird ? [{ ...polar(away, 22, 8), wait: 0, fly: true }] : [{ ...polar(away, 23), wait: 0, fly: false }];
  v.flying = v.route[0].fly;
  return true;
}

// While a visitor waits at a stop it doesn't freeze: it forages, pecks, looks round, grooms or stops to
// listen, as suits the animal. `idle` is null for a still moment.
export const VISITOR_IDLES = Object.freeze({
  songbird: ["peck", "look", "groom"],
  squirrel: ["forage", "look", "groom", "listen"],
  chipmunk: ["forage", "look", "groom", "listen"],
  rabbit: ["forage", "listen", "groom"],
  turkey: ["peck", "look"],
  fox: ["listen", "look", "forage"],
  coyote: ["listen", "look", "forage"],
  deer: ["forage", "listen", "look"],
  bear: ["forage", "look"],
  moose: ["forage", "look"],
  owl: ["look", "groom"]
});
export const idlesFor = (v) => VISITOR_IDLES[v.visitor && v.visitor.model] || ["look"];

function stepIdle(state, v, dt) {
  v.idleT = (v.idleT || 0) - dt;
  if (v.idleT > 0) return;
  const options = idlesFor(v);
  v.idle = state.idleRand() < 0.35 ? null : options[Math.floor(state.idleRand() * options.length)];
  v.idleT = 1.2 + state.idleRand() * 1.8;
}

// Advance the visitors. Returns { arrived, left } so the renderer adds and removes their models.
export function stepVisitors(state, dt, { player = null, colliders = state.colliders } = {}) {
  const arrived = [];
  const left = [];
  if (state.reduced || !(dt > 0)) return { arrived, left };
  const step = Math.min(dt, 0.1);
  state.next -= step;
  if (state.next <= 0) {
    if (state.list.length < state.cap && state.pool.length) {
      arrived.push(spawnVisitor(state, pickVisitor(state.pool, state.rand)));
      state.next = 12 + state.rand() * 28;
    } else state.next = 5;
  }
  for (const v of state.list) {
    if (player && !v.startled && Math.hypot(v.x - player.x, v.z - player.z) < waryDistance(v)) startle(v, player);
    if (v.wait > 0) { v.wait -= step; v.moving = false; stepIdle(state, v, step); continue; }
    v.idle = null;
    v.idleT = 0;
    const t = v.route[v.leg];
    if (!t) { v.gone = true; continue; }
    const dx = t.x - v.x;
    const dz = t.z - v.z;
    const dy = (t.y || 0) - v.y;
    const dist = Math.hypot(dx, dz, dy);
    const s = visitorSpeed(v) * step;
    v.moving = true;
    v.flying = Boolean(t.fly);
    if (dist <= s) {
      Object.assign(v, { x: t.x, y: t.y || 0, z: t.z, wait: t.wait || 0, leg: v.leg + 1 });
      if (v.leg >= v.route.length) v.gone = true;
      continue;
    }
    if (Math.hypot(dx, dz) > 1e-4) v.heading = turnToward(v.heading, headingOf(dx, dz), 6 * step);
    if (t.fly) {
      v.x += (dx / dist) * s; v.z += (dz / dist) * s; v.y += (dy / dist) * s;
    } else {
      const moved = moveActor(v, (dx / dist) * s, (dz / dist) * s, colliders, { radius: 0.25, bound: 40 });
      v.x = moved.x; v.z = moved.z; v.y = 0;
    }
  }
  for (let i = state.list.length - 1; i >= 0; i -= 1) {
    if (state.list[i].gone) left.push(...state.list.splice(i, 1));
  }
  return { arrived, left };
}

const PLACE_TEXT = { edge: "at the edge of camp", trees: "in the trees", perch: "perched nearby", outskirts: "on the outskirts of camp", treeline: "along the tree line" };
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

// Unidentified visitors stay a mystery in text too: the photo is the discovery.
export function describeVisitor(v) {
  const where = PLACE_TEXT[v.visitor.place] || "nearby";
  if (!v.photographed) return v.visitor.bird ? `Something with wings is ${where}.` : `Something is moving ${where}.`;
  return `${capital(article(v.species.name))} is ${where}.`;
}

// ---- Regional plants and the ground ------------------------------------------------------------------
// Each section's undergrowth. `pine` is the evergreen share of the forest ring; `mix` weights the
// ground plants that campFlora() scatters.

export const REGION_FLORA = Object.freeze({
  "southern-ridges": { label: "Rhododendron thickets under a dense oak and hickory forest", pine: 0.3, mix: { rhododendron: 4, fern: 3, shrub: 2, grass: 2, flower: 1, stone: 1, needles: 1 } },
  "high-balds": { label: "Spruce-fir evergreens above grassy balds", pine: 0.85, mix: { grass: 4, fern: 3, needles: 2, flower: 2, rhododendron: 1, stone: 1, shrub: 1 } },
  "blue-ridge": { label: "Open ridges and wildflower meadows", pine: 0.35, mix: { grass: 5, flower: 4, shrub: 1, stone: 1, fern: 1 } },
  "rocky-ridges": { label: "Rocky ridgelines and boulder fields", pine: 0.45, mix: { stone: 5, boulder: 3, grass: 2, shrub: 1, fern: 1 } },
  lakes: { label: "Hardwood forest above quiet lakes", pine: 0.5, mix: { fern: 3, shrub: 2, grass: 2, flower: 2, stone: 1 } },
  "river-valley": { label: "Hardwood valleys and mossy old stone walls", pine: 0.4, mix: { fern: 4, shrub: 2, stone: 2, grass: 2, flower: 1 } },
  alpine: { label: "Dense northern spruce and fir forest", pine: 0.85, mix: { needles: 4, fern: 2, stone: 2, boulder: 1, shrub: 1 } },
  "north-woods": { label: "Rugged north woods on granite", pine: 0.9, mix: { needles: 4, boulder: 3, stone: 2, fern: 2, shrub: 1 } }
});

export const floraFor = (scene) => REGION_FLORA[scene] || REGION_FLORA["southern-ridges"];

// Approximate ground radius of each plant at scale 1. Thickets and boulders are solid.
export const FLORA_SIZE = Object.freeze({ rhododendron: 0.9, shrub: 0.6, fern: 0.4, grass: 0.25, flower: 0.2, stone: 0.25, boulder: 0.7, needles: 0.5 });
const SOLID = new Set(["rhododendron", "boulder"]);

// Footpaths worn into the clearing: the trail through camp and a path from the fire to each place.
export const CAMP_PATHS = Object.freeze([
  { id: "trail", ax: 0, az: -40, bx: 0, bz: 40, width: 1.2 },
  ...CAMP_LOCATIONS.filter((l) => l.id !== "roster").map((l) => ({ id: `to-${l.id}`, ax: 0, az: 0, bx: l.x, bz: l.z, width: 0.8 })),
  { id: "to-woodpile", ax: 0, az: 0, bx: -8.5, bz: 1.2, width: 0.6 },
  { id: "to-pump", ax: 0, az: 0, bx: 4, bz: -1.8, width: 0.6 },
  { id: "to-overlook", ax: 8.5, az: 3.5, bx: 11.5, bz: 6, width: 0.5 },
  { id: "to-kitchen", ax: 0, az: 0, bx: -1.8, bz: -5, width: 0.6 },
  { id: "to-chairs", ax: 8.5, az: 3.5, bx: 7.6, bz: 7.2, width: 0.5 }
].map((p) => Object.freeze(p)));

export function pathDistance(x, z, path) {
  const vx = path.bx - path.ax;
  const vz = path.bz - path.az;
  const len2 = vx * vx + vz * vz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - path.ax) * vx + (z - path.az) * vz) / len2)) : 0;
  return Math.hypot(x - (path.ax + vx * t), z - (path.az + vz * t));
}

export const onPath = (x, z, margin = 0) => CAMP_PATHS.some((p) => pathDistance(x, z, p) < p.width / 2 + margin);

// Scatter the section's plants round the clearing, off the paths, colliders and activity spots.
export function campFlora(scene, count, { seed = 11, colliders = [], avoid = [] } = {}) {
  const rand = seededRandom(seed);
  const kinds = Object.entries(floraFor(scene).mix).map(([kind, weight]) => ({ kind, weight }));
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 8; tries += 1) {
    const { kind } = pickWeighted(kinds, rand);
    const scale = 0.7 + rand() * 0.6;
    const size = FLORA_SIZE[kind] * scale;
    const a = rand() * Math.PI * 2;
    // Small plants anywhere past the fire ring; thickets and boulders only near the edge.
    const r = SOLID.has(kind) ? 12.5 + rand() * 3.5 : 3.8 + Math.sqrt(rand()) * 12;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (onPath(x, z, size + 0.15)) continue;
    if (!clearOf(x, z, colliders, size + 0.25)) continue;
    if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < size + 0.6)) continue;
    if (out.some((f) => SOLID.has(f.kind) && Math.hypot(x - f.x, z - f.z) < f.size + size)) continue;
    out.push({ kind, x: round(x), z: round(z), scale: round(scale), size: round(size), rot: round(rand() * Math.PI * 2), solid: SOLID.has(kind) });
  }
  return out;
}

// ---- Photo camera ------------------------------------------------------------------------------------
// cam: { x, y, z, yaw, pitch, fov (vertical, radians), aspect }. yaw follows headingOf (0 looks +z).

function basis(cam) {
  const cp = Math.cos(cam.pitch || 0);
  const f = { x: Math.sin(cam.yaw) * cp, y: Math.sin(cam.pitch || 0), z: Math.cos(cam.yaw) * cp };
  let r = { x: -f.z, y: 0, z: f.x };
  const rl = Math.hypot(r.x, r.z) || 1;
  r = { x: r.x / rl, y: 0, z: r.z / rl };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, u };
}

// Where a point lands in the frame: x and y from -1 to 1 (x right, y up) and its depth in metres.
export function projectPoint(cam, p) {
  const { f, r, u } = basis(cam);
  const d = { x: p.x - cam.x, y: (p.y || 0) - cam.y, z: p.z - cam.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  if (depth <= 0.05) return { x: 0, y: 0, depth, visible: false };
  const t = Math.tan((cam.fov || 1) / 2);
  const x = (d.x * r.x + d.y * r.y + d.z * r.z) / depth / t / (cam.aspect || 1);
  const y = (d.x * u.x + d.y * u.y + d.z * u.z) / depth / t;
  return { x, y, depth, visible: Math.abs(x) <= 1 && Math.abs(y) <= 1 };
}

const SUBJECT_WEIGHT = { wildlife: 5, hiker: 3, fire: 2, place: 1.5, prop: 1 };

// The photo's main subject among `subjects` ({ kind, id, name, x, y, z, size, blocked, detail }), or
// null for a scenery shot. Wildlife results carry `speciesId`: the hook for future field-guide
// recognition (docs/camp-3d.md); nothing is recorded today.
export function framePhoto(subjects, cam) {
  const t = Math.tan((cam.fov || 1) / 2);
  const seen = [];
  for (const s of subjects || []) {
    if (s.blocked) continue;
    const p = projectPoint(cam, s);
    if (!p.visible) continue;
    const fill = Math.min(1, (s.size || 0.5) / (2 * p.depth * t));
    if (fill < 0.03) continue;
    const off = Math.hypot(p.x, p.y);
    seen.push({ s, p, fill, off, score: (SUBJECT_WEIGHT[s.kind] || 1) * Math.min(fill, 0.5) * (1.3 - Math.min(off, 1)) });
  }
  if (!seen.length) return null;
  // Any animal clearly in the frame is the subject, however big the hiker beside it.
  const clear = (x) => (x.s.kind === "wildlife" && x.fill >= 0.06 ? 1 : 0);
  seen.sort((a, b) => clear(b) - clear(a) || b.score - a.score);
  const best = seen[0];
  return {
    subject: best.s,
    others: seen.slice(1, 4).map((x) => x.s),
    centered: best.off < 0.35,
    fill: Math.round(best.fill * 100) / 100,
    distance: Math.round(best.p.depth * 10) / 10,
    speciesId: best.s.kind === "wildlife" ? best.s.id : null
  };
}

// Where the hiker could stand to photograph `target`, best first: where they already are (if that's near
// enough but not too near), then free spots `near`–`far` m from it on the side they're coming from, nearest to `from` first.
// "Aim camera" (the text route to a photo) takes the first one with a clear line of sight.
export function vantagePoints(target, from, colliders = [], { radius = PLAYER_RADIUS, bound = WORLD_RADIUS, near = 3, far = 7 } = {}) {
  const free = (x, z) => Math.hypot(x, z) <= bound - radius && colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.radius + radius);
  const gap = Math.hypot(from.x - target.x, from.z - target.z);
  const toward = gap > 0.1 ? Math.atan2(from.x - target.x, from.z - target.z) : Math.atan2(-target.x, -target.z);
  const spots = [];
  for (let d = near; d <= far; d += 1) {
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
      const x = target.x + d * Math.sin(toward + off);
      const z = target.z + d * Math.cos(toward + off);
      if (free(x, z)) spots.push({ x, z, cost: Math.hypot(x - from.x, z - from.z) });
    }
  }
  spots.sort((a, b) => a.cost - b.cost);
  const here = gap >= near && gap <= far + 4 ? [{ x: from.x, z: from.z, cost: 0 }] : [];
  return [...here, ...spots].map(({ x, z }) => ({ x, z }));
}

// A friendly caption for the camp photo roll.
export function photoCaption(result, { time = "day", weather = null } = {}) {
  if (!result) {
    const w = weather && WEATHER[weather.id];
    return `Scenery: ${(CAMP_TIME_LABELS[time] || "Day").toLowerCase()} light over camp.${w ? ` ${w.text}` : ""}`;
  }
  const lead = result.fill >= 0.25 ? "Close-up" : result.centered ? "Nicely framed" : "Snapshot";
  const s = result.subject;
  const hiker = result.others.find((o) => o.kind === "hiker" && o !== s);
  const withHiker = hiker && s.kind !== "hiker" ? `, with ${hiker.name} in the shot` : "";
  if (s.kind === "wildlife") return `${lead}: ${article(s.name)} visiting camp${withHiker}.`;
  if (s.kind === "hiker") return `${lead}: ${s.name}${s.detail ? `, ${s.detail}` : ""}.`;
  return `${lead}: the ${s.name}${withHiker}.`;
}
