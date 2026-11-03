import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, themeFor, DEFAULT_THEME } from "../../assets/js/at/engine/expedition-themes.js";
import { createRound, step, fire, pickSpecies, startle, summary, animalAt, spriteSize, WIDTH } from "../../assets/js/at/engine/expedition.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";

// Deterministic generator for exact tests.
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

function placeAnimal(state, kind, x = 100, y = 100) {
  const sp = state.theme.species.find((s) => s.id === kind);
  const size = spriteSize(sp);
  const a = { id: 99, kind, group: 42, w: size.w, h: size.h, x, y, dir: 1, mult: 1, timer: 5, paused: 5, age: 0, startled: false, photographed: false };
  state.animals.push(a);
  state.aim = { x: x + 2, y: y + 2 };
  return a;
}

test("every theme is complete and valid data", () => {
  const scenes = new Set(TRAIL.regions.map((r) => r.scene));
  for (const theme of Object.values(THEMES)) {
    assert.ok(theme.title && theme.intro && theme.actionLabel && theme.reward.unit, theme.id);
    assert.ok(theme.ammo > 0 && theme.magazine > 0 && theme.roundSeconds > 0 && theme.maxScore <= 400);
    assert.match(theme.id, /^[a-z][a-z0-9-]{1,30}$/, "theme id must satisfy the database check");
    for (const sp of theme.species) {
      assert.ok(sp.sprite && sp.sprite.length, `${theme.id}/${sp.id} sprite`);
      sp.sprite.join("").split("").forEach((c) => assert.ok(c === "." || theme.palette[c], `${sp.id} colour ${c}`));
      assert.ok(sp.value > 0 && sp.speed > 0 && sp.weight > 0);
      Object.keys(sp.habitats).forEach((scene) => assert.ok(scenes.has(scene), `${sp.id} habitat ${scene} is a real region scene`));
    }
  }
  assert.equal(themeFor("nope").id, DEFAULT_THEME);
  assert.equal(themeFor("wildlife").id, "wildlife");
});

test("habitat changes which species appear", () => {
  const theme = THEMES.hunt;
  const count = (scene) => { const rng = seeded(7); let n = 0; for (let i = 0; i < 4000; i += 1) if (pickSpecies(theme, scene, rng).id === "duck") n += 1; return n; };
  assert.ok(count("lakes") > count("rocky-ridges") * 2);
});

test("hunt: a hit scores, removes the animal and is capped", () => {
  const state = createRound(THEMES.hunt, { rng: seeded(3) });
  placeAnimal(state, "deer");
  const out = fire(state);
  assert.equal(out.result, "hit");
  assert.equal(state.score, 50);
  assert.equal(state.animals.length, 0);
  assert.deepEqual(state.caught, { deer: 1 });
  state.score = 395; state.cooldown = 0;
  placeAnimal(state, "bear");
  fire(state);
  assert.equal(state.score, 400);
});

test("hunt: magazine empties, reloads automatically, and ammo ends the round", () => {
  const state = createRound(THEMES.hunt, { rng: seeded(5) });
  state.aim = { x: 1, y: 1 };
  for (let i = 0; i < 4; i += 1) { state.cooldown = 0; assert.equal(fire(state).result, "miss"); }
  assert.equal(state.loaded, 0);
  assert.equal(fire(state).result, "reloading");
  step(state, 0.1); step(state, 0.1);
  for (let t = 0; t < 1.2; t += 0.1) step(state, 0.1);
  assert.equal(state.loaded, 4);
  while (!state.over) { state.cooldown = 0; state.reload = 0; if (state.loaded === 0) state.loaded = 4; fire(state); }
  assert.equal(state.ammo, 0);
  assert.equal(fire(state).result, "over");
  assert.equal(summary(state).shots, 12);
});

test("cooldown blocks rapid fire", () => {
  const state = createRound(THEMES.hunt, { rng: seeded(1) });
  fire(state);
  assert.equal(fire(state).result, "cooldown");
});

test("a miss startles nearby skittish herds but not bears", () => {
  const state = createRound(THEMES.hunt, { rng: seeded(2) });
  const deer = placeAnimal(state, "deer", 100, 100);
  const bear = placeAnimal(state, "bear", 120, 100); bear.group = 7;
  assert.equal(startle(state, 95, 100), 1);
  assert.ok(deer.startled && !bear.startled);
  assert.equal(deer.dir, 1, "flees away from the shot");
});

test("wildlife: photos keep the animal, cannot double count, never reload, never startle", () => {
  const state = createRound(THEMES.wildlife, { rng: seeded(4) });
  const owl = placeAnimal(state, "owl");
  assert.equal(fire(state).result, "hit");
  assert.equal(state.score, 20);
  assert.ok(owl.photographed && state.animals.includes(owl));
  assert.equal(animalAt(state, state.aim.x, state.aim.y), null);
  state.cooldown = 0;
  assert.equal(fire(state).result, "miss");
  assert.equal(state.reload, 0);
});

test("time runs out and the aim stays on screen", () => {
  const state = createRound(THEMES.hunt, { rng: seeded(9) });
  for (let i = 0; i < 400; i += 1) step(state, 0.1, { dx: 1, dy: -1 });
  assert.ok(state.over);
  assert.equal(state.aim.x, WIDTH);
  assert.equal(state.aim.y, 0);
  assert.ok(state.animals.length <= 6);
  assert.equal(summary(state).accuracy, 0);
});

test("reduced-motion speed factor slows animals", () => {
  const fast = createRound(THEMES.hunt, { rng: seeded(11) });
  const slow = createRound(THEMES.hunt, { rng: seeded(11), speedFactor: 0.5 });
  [fast, slow].forEach((s) => { const a = placeAnimal(s, "rabbit", 100, 100); a.paused = 0; a.timer = 99; });
  step(fast, 0.1); step(slow, 0.1);
  assert.ok(fast.animals[0].x - 100 > (slow.animals[0].x - 100) * 1.9);
});
