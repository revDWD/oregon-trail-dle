// Expedition engine: the original Oregon Trail DLE hunt rules, ported almost line for line and
// parameterised by a theme (engine/expedition-themes.js). Wildlife spotting uses them as follows:
// shots are frames of film, the magazine is film wound four frames at a time, and a hit is a photo
// (the animal bolts off afterwards instead of being removed).
// Pure and DOM-free. Randomness is injected (`random` returns [0, 1)) so tests are exact.

export const WIDTH = 320;
export const HEIGHT = 180;
export const MIN_Y = 62;
const AIM_SPEED = 150;
const SPAWN_EVERY = 1.1;
const MAX_ANIMALS = 6;
const HIT_PAD = 2;
const STARTLE_RADIUS = 46;
const LEAVE_AFTER = 14;
const LOCAL_CHANCE = 0.65;
// Special finds are rolled once per outing, so they stay genuinely rare: about 1 outing in 20 has a
// rare species and about 1 in 250 a legend. At most one special appears per outing.
export const RARE_CHANCE = 0.05;
export const LEGEND_CHANCE = 0.004;
const OFF_SEASON = 0.25;

export const defaultRandom = () => {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
};

const between = (random, range) => range[0] + random() * (range[1] - range[0]);
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export function speciesOf(theme, id) {
  return theme.species.find((sp) => sp.id === id) || null;
}

export function habitatOf(theme, id) {
  return theme.habitats[id] ? id : Object.keys(theme.habitats)[0];
}

// Warm-season species (insects, frogs, turtles) are much scarcer in winter; cold-season visitors
// (snowy owls) only turn up in winter.
export function inSeason(spec, winter) {
  if (spec.season === "warm") return !winter;
  if (spec.season === "cold") return Boolean(winter);
  return true;
}

export function pickSpecies(theme, habitat, random, { winter = false } = {}) {
  const raw = theme.habitats[habitatOf(theme, habitat)].animals;
  const ids = Object.keys(raw);
  const weight = (id) => raw[id] * (inSeason(speciesOf(theme, id), winter) ? 1 : OFF_SEASON);
  const total = ids.reduce((sum, id) => sum + weight(id), 0);
  let roll = random() * total;
  for (const id of ids) {
    roll -= weight(id);
    if (roll < 0) return speciesOf(theme, id);
  }
  return speciesOf(theme, ids[ids.length - 1]);
}

// Rolls for this outing's special find: null most of the time, otherwise { id, at } where `at` is the
// round clock time (seconds) it appears.
export function rollSpecial(theme, habitat, { random = defaultRandom, winter = false } = {}) {
  const place = theme.habitats[habitatOf(theme, habitat)];
  const roll = random();
  let list = null;
  if (roll < LEGEND_CHANCE) list = place.legends || [];
  else if (roll < LEGEND_CHANCE + RARE_CHANCE) list = (place.rare || []).filter((id) => inSeason(speciesOf(theme, id), winter));
  if (!list || !list.length) return null;
  return { id: list[Math.floor(random() * list.length)], at: 4 + random() * (theme.rounds.seconds - 12) };
}

// Vertical band an animal moves in: soaring birds use the sky, flitting birds and insects can rise a
// little above the horizon, everything else stays on the ground.
export function yBounds(spec) {
  const ground = HEIGHT - spec.h - 6;
  if (spec.fly === "high") return [8, MIN_Y + 6];
  if (spec.fly === "low") return [MIN_Y - 26, ground];
  return [MIN_Y, ground];
}

// Where the outing happens: usually the section the hiker (or crew) is in, sometimes somewhere else
// on the trail, as in the original. Cold habitats bring snow from November to March.
export function chooseOuting(theme, localHabitat, { random = defaultRandom, month = 6 } = {}) {
  const ids = Object.keys(theme.habitats);
  const habitat = random() < LOCAL_CHANCE ? habitatOf(theme, localHabitat) : ids[Math.floor(random() * ids.length)];
  const winter = month <= 3 || month >= 11;
  const pool = theme.habitats[habitat].cold && winter ? theme.coldWeathers : theme.weathers;
  const autumn = month >= 9 && month <= 11;
  return { habitat, weather: pool[Math.floor(random() * pool.length)], autumn, winter };
}

// options: { habitat, weather, autumn, winter, speedFactor, special } (speedFactor < 1 for reduced
// motion; special is a rollSpecial() result, or null for none).
export function newRound(theme, options = {}) {
  const r = theme.rounds;
  return {
    theme,
    random: options.random || defaultRandom,
    habitat: habitatOf(theme, options.habitat),
    weather: options.weather || "clear",
    autumn: Boolean(options.autumn),
    winter: Boolean(options.winter),
    special: options.special ? { ...options.special, shown: false } : null,
    speedFactor: options.speedFactor || 1,
    clock: 0,
    nextHerd: 1,
    clip: Math.min(r.magazine, r.ammo),
    reload: 0,
    fireCooldown: 0,
    shots: 0,
    hits: 0,
    timeLeft: r.seconds,
    ammo: r.ammo,
    score: 0,
    spotted: [],
    aim: { x: WIDTH / 2, y: HEIGHT / 2 },
    animals: [],
    popups: [],
    puffs: [],
    spawnIn: 0.2,
    flash: 0,
    over: false
  };
}

const active = (state) => state.animals.filter((animal) => !animal.snapped);

// Herd animals sometimes arrive as a small group that tends to move together.
function spawn(state, forced) {
  const spec = forced || pickSpecies(state.theme, state.habitat, state.random, { winter: state.winter });
  const fromLeft = state.random() < 0.5;
  const [low, high] = yBounds(spec);
  const baseY = spec.fly ? low + state.random() * (high - low) : MIN_Y + 8 + state.random() * (HEIGHT - MIN_Y - 8 - spec.h - 8);
  let count = 1;
  const groupSize = spec.herd || spec.flock;
  if (groupSize && state.random() < 0.5) count = Math.min(1 + Math.ceil(state.random() * (groupSize - 1)), MAX_ANIMALS + 1 - active(state).length);
  const herdId = count > 1 ? state.nextHerd++ : 0;
  for (let i = 0; i < Math.max(count, 1); i += 1) {
    state.animals.push({
      kind: spec.id,
      herdId,
      x: fromLeft ? -spec.w - i * (spec.w + 6) : WIDTH + i * (spec.w + 6),
      y: clamp(baseY + (i % 2 ? 10 : -4) * (i ? 1 : 0), low, high),
      dir: fromLeft ? 1 : -1
    });
  }
}

// Animals pushed by tests or spawn() get their behaviour state lazily so plain {kind, x, y, dir} objects work.
function prepare(state, animal) {
  if (animal.age !== undefined) return;
  animal.age = 0;
  animal.phase = state.random() * 6;
  animal.mult = 1;
  animal.drift = 0;
  animal.pause = 0;
  animal.timer = 0.3 + state.random();
}

function decide(state, animal, spec) {
  const rule = spec.behavior;
  const random = state.random;
  const inside = animal.x > 16 && animal.x + spec.w < WIDTH - 16;
  const roll = random();
  animal.timer = between(random, rule.timer);
  const mate = animal.herdId ? state.animals.find((other) => other !== animal && other.herdId === animal.herdId && !other.snapped) : null;
  if (mate && random() < 0.6) {
    animal.dir = mate.dir;
    animal.mult = mate.mult;
    animal.drift = mate.drift;
    return;
  }
  if (roll < rule.pause) {
    animal.pause = between(random, rule.pauseTime);
    animal.drift = 0;
    return;
  }
  if (roll < rule.pause + rule.turn && inside && animal.age < LEAVE_AFTER) animal.dir = -animal.dir;
  animal.mult = between(random, rule.mult);
  animal.drift = (random() * 2 - 1) * rule.drift;
}

function move(state, animal, dt) {
  const spec = speciesOf(state.theme, animal.kind);
  prepare(state, animal);
  animal.age += dt;
  if (animal.age >= LEAVE_AFTER && animal.pause > 0) animal.pause = 0;
  if (animal.pause > 0) {
    animal.pause -= dt;
    return;
  }
  animal.timer -= dt;
  if (animal.timer <= 0 && !animal.snapped) decide(state, animal, spec);
  animal.phase += dt * 9 * animal.mult;
  animal.x += animal.dir * spec.speed * animal.mult * state.speedFactor * dt;
  const [low, high] = yBounds(spec);
  animal.y = clamp(animal.y + animal.drift * dt, low, high);
  if (animal.y === low || animal.y === high) animal.drift = -animal.drift;
}

function bolt(state, animal, dir) {
  prepare(state, animal);
  animal.dir = dir;
  animal.pause = 0;
  animal.mult = 2;
  animal.timer = 1.2;
}

// A photo or a missed frame spooks nearby skittish animals so they bolt away from the viewfinder;
// their herd-mates follow.
export function startle(state) {
  const { x, y } = state.aim;
  const spooked = [];
  state.animals.forEach((animal) => {
    const spec = speciesOf(state.theme, animal.kind);
    if (!spec.skittish || animal.snapped) return;
    const dx = animal.x + spec.w / 2 - x;
    const dy = animal.y + spec.h / 2 - y;
    if (Math.hypot(dx, dy) > STARTLE_RADIUS) return;
    bolt(state, animal, dx >= 0 ? 1 : -1);
    spooked.push(animal);
  });
  spooked.forEach((scared) => {
    if (!scared.herdId) return;
    state.animals.forEach((mate) => {
      if (mate.herdId !== scared.herdId || mate === scared || mate.snapped) return;
      bolt(state, mate, scared.dir);
    });
  });
  return spooked.length;
}

function ageEffects(list, dt, life) {
  list.forEach((item) => { item.age += dt; });
  return list.filter((item) => item.age < life);
}

// input: { dx, dy } in -1..1. Advances the round by dt seconds.
export function step(state, dt, input) {
  if (state.over) return state;
  const d = clamp(Number(dt) || 0, 0, 0.1);
  const move2 = input || { dx: 0, dy: 0 };
  const length = Math.hypot(move2.dx || 0, move2.dy || 0) || 1;
  const scale = length > 1 ? 1 / length : 1;
  state.aim.x = clamp(state.aim.x + (move2.dx || 0) * scale * AIM_SPEED * d, 0, WIDTH);
  state.aim.y = clamp(state.aim.y + (move2.dy || 0) * scale * AIM_SPEED * d, 0, HEIGHT);
  state.timeLeft = Math.max(state.timeLeft - d, 0);
  state.clock += d;
  state.fireCooldown = Math.max(state.fireCooldown - d, 0);
  if (state.reload > 0) {
    state.reload = Math.max(state.reload - d, 0);
    if (state.reload === 0) state.clip = Math.min(state.theme.rounds.magazine, state.ammo);
  }
  state.flash = Math.max(state.flash - d, 0);
  state.popups = ageEffects(state.popups, d, 1.1);
  state.puffs = ageEffects(state.puffs, d, 0.35);

  state.spawnIn -= d;
  const special = state.special;
  if (special && !special.shown && state.clock >= special.at && active(state).length < MAX_ANIMALS) {
    special.shown = true;
    spawn(state, speciesOf(state.theme, special.id));
  } else if (state.spawnIn <= 0 && active(state).length < MAX_ANIMALS) {
    spawn(state);
    state.spawnIn = SPAWN_EVERY;
  }
  state.animals.forEach((animal) => move(state, animal, d));
  state.animals = state.animals.filter((animal) => animal.x > -40 && animal.x < WIDTH + 40);

  if (state.timeLeft <= 0 || (state.ammo <= 0 && state.flash <= 0)) state.over = true;
  return state;
}

export function animalAt(state, x, y) {
  return state.animals.findIndex((animal) => {
    if (animal.snapped) return false;
    const spec = speciesOf(state.theme, animal.kind);
    return x >= animal.x - HIT_PAD && x <= animal.x + spec.w + HIT_PAD && y >= animal.y - HIT_PAD && y <= animal.y + spec.h + HIT_PAD;
  });
}

// Takes a photo at the current aim point; the first animal under the viewfinder is the subject.
// Returns { result: "hit" | "miss" | "reloading" | "cooldown" | "empty" | "over", species?, value? }.
export function fire(state) {
  if (state.over) return { result: "over" };
  if (state.ammo <= 0 || state.clip <= 0) return { result: state.reload > 0 ? "reloading" : "empty" };
  if (state.reload > 0) return { result: "reloading" };
  if (state.fireCooldown > 0) return { result: "cooldown" };
  const rules = state.theme.rounds;
  state.ammo -= 1;
  state.clip -= 1;
  state.shots += 1;
  state.fireCooldown = rules.cooldownSeconds;
  state.flash = 0.12;
  if (state.clip === 0 && state.ammo > 0) state.reload = rules.reloadSeconds;
  const { x, y } = state.aim;
  const index = animalAt(state, x, y);
  if (index < 0) {
    state.puffs.push({ x, y, age: 0, hit: false });
    startle(state);
    return { result: "miss" };
  }
  const animal = state.animals[index];
  const spec = speciesOf(state.theme, animal.kind);
  animal.snapped = true;
  state.hits += 1;
  startle(state);
  bolt(state, animal, animal.x + spec.w / 2 >= x ? 1 : -1);
  animal.mult = 2.4;
  const value = Math.max(Math.min(spec.value, rules.maxScore - state.score), 0);
  state.score += value;
  state.spotted.push(spec.id);
  state.puffs.push({ x, y, age: 0, hit: true });
  const tag = spec.rarity === "legend" ? "LEGEND! " : spec.rarity === "rare" ? "RARE! " : "";
  state.popups.push({ x: animal.x + spec.w / 2, y: animal.y, age: 0, special: Boolean(tag), text: value > 0 ? `${tag}+${value} ${state.theme.unitShort}` : `${tag}${state.theme.fullText}`.trim() });
  return { result: "hit", species: spec, value, rarity: spec.rarity || "common" };
}

// "2 white-tailed deer, 1 wild turkey" in the order first spotted.
export function spottedList(theme, ids) {
  const counts = new Map();
  ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  return [...counts].map(([id, n]) => `${n} ${speciesOf(theme, id).name}`).join(", ");
}

export function summary(state) {
  const caught = {};
  state.spotted.forEach((id) => { caught[id] = (caught[id] || 0) + 1; });
  return {
    theme: state.theme.id,
    score: Math.min(Math.round(state.score), state.theme.rounds.maxScore),
    hits: state.hits,
    shots: state.shots,
    accuracy: state.shots ? Math.round((state.hits / state.shots) * 100) : 0,
    caught,
    species: Object.keys(caught),
    habitat: state.habitat
  };
}
