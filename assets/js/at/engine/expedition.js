// Expedition engine: the camp minigame loop (spawn, move, aim, fire, score), independent of theme
// and of the DOM. Ported from the Oregon Trail hunt and generalised so a theme (hunt, wildlife
// spotting, ...) only supplies data. Randomness is injected (`rng` returns [0, 1)) so tests are exact.

export const WIDTH = 320;
export const HEIGHT = 180;
export const MIN_Y = 62;
const AIM_SPEED = 150;
const SPAWN_EVERY = 1.1;
const MAX_ANIMALS = 6;
const HIT_PAD = 2;
const STARTLE_RADIUS = 46;
const LEAVE_AFTER = 14;

export const defaultRng = () => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
};

const between = (rng, [lo, hi]) => lo + (hi - lo) * rng();

export function spriteSize(sp) {
  return { w: Math.max(...sp.sprite.map((row) => row.length)) * 2, h: sp.sprite.length * 2 };
}

// Weighted pick of a species for a habitat scene.
export function pickSpecies(theme, scene, rng) {
  const weights = theme.species.map((sp) => sp.weight + (sp.habitats[scene] || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return theme.species[i];
  }
  return theme.species[theme.species.length - 1];
}

export function createRound(theme, { scene = "southern-ridges", rng = defaultRng, speedFactor = 1 } = {}) {
  return {
    theme, scene, speedFactor,
    time: theme.roundSeconds, ammo: theme.ammo, loaded: Math.min(theme.magazine, theme.ammo),
    reload: 0, cooldown: 0, flash: 0,
    aim: { x: WIDTH / 2, y: (HEIGHT + MIN_Y) / 2 },
    animals: [], nextSpawn: 0.3, nextId: 1, nextGroup: 1,
    score: 0, hits: 0, shots: 0, caught: {}, effects: [], over: false,
    rng
  };
}

function spawn(state) {
  if (state.animals.length >= MAX_ANIMALS) return;
  const { rng, theme } = state;
  const sp = pickSpecies(theme, state.scene, rng);
  const size = spriteSize(sp);
  const fromLeft = rng() < 0.5;
  const count = Math.min(sp.group > 1 ? 1 + Math.floor(rng() * sp.group) : 1, MAX_ANIMALS - state.animals.length);
  const group = state.nextGroup++;
  const baseY = sp.ground ? MIN_Y + 20 + rng() * (HEIGHT - MIN_Y - 24 - size.h) : 14 + rng() * (MIN_Y - 6);
  for (let i = 0; i < count; i += 1) {
    state.animals.push({
      id: state.nextId++, kind: sp.id, group, w: size.w, h: size.h,
      x: fromLeft ? -size.w - i * (size.w + 6) : WIDTH + i * (size.w + 6),
      y: Math.min(Math.max(baseY + (i % 2) * 8, sp.ground ? MIN_Y : 6), HEIGHT - size.h - 2),
      dir: fromLeft ? 1 : -1, mult: 1, timer: between(rng, sp.move.timer), paused: 0, age: 0,
      startled: false, photographed: false
    });
  }
}

function speciesOf(state, animal) {
  return state.theme.species.find((sp) => sp.id === animal.kind);
}

function moveAnimal(state, a, dt) {
  const sp = speciesOf(state, a);
  const { rng } = state;
  a.age += dt;
  if (a.paused > 0) { a.paused -= dt; return; }
  a.timer -= dt;
  if (a.timer <= 0 && !a.startled) {
    a.timer = between(rng, sp.move.timer);
    const r = rng();
    const onScreen = a.x > 0 && a.x + a.w < WIDTH;
    if (r < sp.move.pause && onScreen) a.paused = between(rng, sp.move.pauseTime);
    else if (r < sp.move.pause + sp.move.turn && onScreen && a.age < LEAVE_AFTER) a.dir *= -1;
    a.mult = between(rng, sp.move.mult);
  }
  a.x += a.dir * sp.speed * a.mult * state.speedFactor * dt;
}

export function step(state, dt, input = {}) {
  if (state.over) return state;
  const d = Math.min(Math.max(dt, 0), 0.1);
  let dx = input.dx || 0;
  let dy = input.dy || 0;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  state.aim.x = Math.min(Math.max(state.aim.x + dx * AIM_SPEED * d, 0), WIDTH);
  state.aim.y = Math.min(Math.max(state.aim.y + dy * AIM_SPEED * d, 0), HEIGHT);
  state.time = Math.max(state.time - d, 0);
  state.cooldown = Math.max(state.cooldown - d, 0);
  state.flash = Math.max(state.flash - d, 0);
  if (state.reload > 0) {
    state.reload -= d;
    if (state.reload <= 0) { state.reload = 0; state.loaded = Math.min(state.theme.magazine, state.ammo); }
  }
  state.effects = state.effects.map((e) => ({ ...e, life: e.life - d })).filter((e) => e.life > 0);
  state.nextSpawn -= d;
  if (state.nextSpawn <= 0) { spawn(state); state.nextSpawn = SPAWN_EVERY * (0.7 + state.rng() * 0.6); }
  state.animals.forEach((a) => moveAnimal(state, a, d));
  state.animals = state.animals.filter((a) => a.x > -a.w * 6 - 40 && a.x < WIDTH + a.w * 6 + 40);
  if (state.time <= 0 || state.ammo <= 0) state.over = true;
  return state;
}

export function animalAt(state, x, y) {
  return state.animals.find((a) => !a.photographed && x >= a.x - HIT_PAD && x <= a.x + a.w + HIT_PAD && y >= a.y - HIT_PAD && y <= a.y + a.h + HIT_PAD) || null;
}

// Fire / snap at the current aim. Returns what happened so the UI can announce it.
export function fire(state) {
  const theme = state.theme;
  if (state.over) return { result: "over" };
  if (state.reload > 0) return { result: "reloading" };
  if (state.cooldown > 0) return { result: "cooldown" };
  if (state.loaded <= 0 || state.ammo <= 0) return { result: "empty" };
  state.ammo -= 1; state.loaded -= 1; state.shots += 1;
  state.cooldown = theme.cooldownSeconds; state.flash = 0.08;
  const target = animalAt(state, state.aim.x, state.aim.y);
  let outcome;
  if (target) {
    const sp = speciesOf(state, target);
    state.hits += 1;
    state.caught[sp.id] = (state.caught[sp.id] || 0) + 1;
    state.score = Math.min(state.score + sp.value, theme.maxScore);
    if (theme.removeOnHit) state.animals = state.animals.filter((a) => a !== target);
    else target.photographed = true;
    state.effects.push({ kind: "hit", x: state.aim.x, y: state.aim.y, life: 0.6, text: `+${sp.value}` });
    outcome = { result: "hit", species: sp, value: sp.value };
  } else {
    state.effects.push({ kind: "miss", x: state.aim.x, y: state.aim.y, life: 0.4 });
    if (theme.startleOnMiss) startle(state, state.aim.x, state.aim.y);
    outcome = { result: "miss" };
  }
  if (state.loaded <= 0 && state.ammo > 0) state.reload = theme.reloadSeconds || 0.001;
  if (state.ammo <= 0) state.over = true;
  return outcome;
}

export function startle(state, x, y) {
  const groups = new Set();
  state.animals.forEach((a) => {
    const sp = speciesOf(state, a);
    if (!sp.skittish) return;
    if (Math.hypot(a.x + a.w / 2 - x, a.y + a.h / 2 - y) <= STARTLE_RADIUS) groups.add(a.group);
  });
  state.animals.forEach((a) => {
    if (!groups.has(a.group)) return;
    a.startled = true; a.paused = 0; a.mult = 2.2;
    a.dir = a.x + a.w / 2 < x ? -1 : 1;
  });
  return groups.size;
}

export function summary(state) {
  return {
    theme: state.theme.id,
    score: Math.min(Math.round(state.score), state.theme.maxScore),
    hits: state.hits,
    shots: state.shots,
    accuracy: state.shots ? Math.round((state.hits / state.shots) * 100) : 0,
    caught: { ...state.caught }
  };
}
