import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, DEFAULT_THEME, themeFor } from "../../assets/js/at/engine/expedition-themes.js";
import { WIDTH, HEIGHT, MIN_Y, speciesOf, habitatOf, pickSpecies, chooseOuting, newRound, startle, step, animalAt, fire, spottedList, summary,
  rollSpecial, inSeason, yBounds, RARE_CHANCE, LEGEND_CHANCE }
  from "../../assets/js/at/engine/expedition.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";

const theme = THEMES.wildlife;
// Deterministic random source: cycles through the given values.
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const round = (extra = {}) => newRound(theme, { random: seq(0.5), habitat: "blue-ridge", ...extra });
const place = (state, kind, x, y, extra = {}) => { state.animals.push({ kind, x, y, dir: 1, ...extra }); return state.animals[state.animals.length - 1]; };
const aimAt = (state, animal) => { const sp = speciesOf(theme, animal.kind); state.aim.x = animal.x + sp.w / 2; state.aim.y = animal.y + sp.h / 2; };
const tick = (state, seconds) => { for (let t = 0; t < seconds; t += 0.05) step(state, 0.05, { dx: 0, dy: 0 }); };

test("wildlife spotting is the only theme and its data is complete", () => {
  assert.deepEqual(Object.keys(THEMES), ["wildlife"]);
  assert.equal(DEFAULT_THEME, "wildlife");
  assert.equal(themeFor("hunt"), theme, "old hunt rows fall back to wildlife");
  assert.match(theme.id, /^[a-z][a-z0-9-]{1,30}$/, "matches the at_expedition_runs theme check");
  assert.ok(theme.rounds.maxScore <= 400, "server caps a run at 400");
  assert.ok(theme.rounds.ammo <= 100);
  const words = JSON.stringify(theme) + Object.values(theme.text).filter((f) => typeof f === "function").map(String).join(" ");
  assert.ok(!/\b(hunt|shoot|shot|kill|rifle|bullet|meat|food)\b/i.test(words), "no hunting language");
  const ids = new Set(theme.species.map((sp) => sp.id));
  theme.species.forEach((sp) => {
    assert.ok(sp.value > 0 && sp.speed > 0 && sp.w > 0 && sp.h > 0, sp.id);
    assert.equal(sp.colors.length, 2);
    ["pause", "turn", "drift"].forEach((k) => assert.equal(typeof sp.behavior[k], "number", `${sp.id}.${k}`));
    sp.parts.forEach((p) => {
      assert.ok(p.length === 5 || p.length === 6, `${sp.id} part ${p}`);
      assert.ok([0, 1, 2, 3].includes(p[4]));
      if (p[4] === 3) assert.ok(sp.accent, `${sp.id} accent colour`);
      // Ears and antlers may poke above the hit box (as in the original sprites), nothing else.
      assert.ok(p[0] >= 0 && p[0] + p[2] <= sp.w && p[1] >= -10 && p[1] + p[3] <= sp.h + 7, `${sp.id} part ${p} inside its box`);
      if (p.length === 6) assert.ok([1, 2, -1, -2].includes(p[5]));
    });
  });
  // Every trail region has a habitat, and every habitat spawns only known species.
  assert.deepEqual(Object.keys(theme.habitats).sort(), [...new Set(TRAIL.regions.map((r) => r.scene))].sort());
  Object.entries(theme.habitats).forEach(([id, hab]) => {
    assert.ok(["hills", "balds", "ridges", "peaks"].includes(hab.backdrop), id);
    Object.keys(hab.animals).forEach((sp) => assert.ok(ids.has(sp), `${id} → ${sp}`));
  });
});

test("habitat decides which wildlife appears", () => {
  const seen = (habitat) => { const out = new Set(); for (let i = 0; i < 200; i += 1) out.add(pickSpecies(theme, habitat, seq(i / 200)).id); return out; };
  assert.ok(seen("high-balds").has("elk"));
  assert.ok(!seen("southern-ridges").has("elk") && !seen("southern-ridges").has("moose"));
  assert.ok(seen("north-woods").has("moose"));
  assert.ok(seen("lakes").has("duck"));
  assert.equal(habitatOf(theme, "nowhere"), "southern-ridges");
});

test("outings are usually local, snowy only in cold habitats in winter, and autumn colours in the fall", () => {
  assert.equal(chooseOuting(theme, "alpine", { random: seq(0.1, 0.4), month: 7 }).habitat, "alpine");
  assert.equal(chooseOuting(theme, "alpine", { random: seq(0.9, 0), month: 7 }).habitat, "southern-ridges");
  const winter = new Set(); const summer = new Set();
  for (let i = 0; i < 20; i += 1) {
    winter.add(chooseOuting(theme, "alpine", { random: seq(0.1, i / 20), month: 1 }).weather);
    summer.add(chooseOuting(theme, "alpine", { random: seq(0.1, i / 20), month: 7 }).weather);
  }
  assert.ok(winter.has("snow") && !summer.has("snow"));
  assert.ok(!chooseOuting(theme, "lakes", { random: seq(0.1, 0.99), month: 1 }).weather.includes("snow"));
  assert.equal(chooseOuting(theme, "lakes", { random: seq(0.1), month: 10 }).autumn, true);
  assert.equal(chooseOuting(theme, "lakes", { random: seq(0.1), month: 6 }).autumn, false);
});

test("a photo scores once: the animal is snapped, bolts away and cannot be photographed again", () => {
  const s = round();
  const deer = place(s, "deer", 100, 100);
  aimAt(s, deer);
  const out = fire(s);
  assert.equal(out.result, "hit");
  assert.equal(out.value, 40);
  assert.equal(s.score, 40);
  assert.ok(deer.snapped && deer.mult > 2);
  assert.equal(s.popups[0].text, "+40 pts");
  assert.equal(animalAt(s, s.aim.x, s.aim.y), -1, "snapped animals are out of frame");
  s.fireCooldown = 0;
  assert.equal(fire(s).result, "miss");
  assert.deepEqual(s.spotted, ["deer"]);
});

test("the photo board caps a round at the server's maximum", () => {
  const s = round();
  s.score = theme.rounds.maxScore - 10;
  const moose = place(s, "moose", 100, 100);
  aimAt(s, moose);
  assert.equal(fire(s).value, 10);
  const bear = place(s, "bear", 200, 120);
  aimAt(s, bear); s.fireCooldown = 0;
  const out = fire(s);
  assert.equal(out.result, "hit");
  assert.equal(out.value, 0);
  assert.equal(s.popups[s.popups.length - 1].text, "Board full");
  assert.equal(summary(s).score, theme.rounds.maxScore);
});

test("film is wound four frames at a time, winds automatically, and running out ends the outing", () => {
  const s = round();
  s.aim = { x: 5, y: 175 };
  for (let i = 0; i < theme.rounds.magazine; i += 1) { assert.equal(fire(s).result, "miss"); s.fireCooldown = 0; }
  assert.equal(s.clip, 0);
  assert.equal(fire(s).result, "reloading");
  step(s, theme.rounds.reloadSeconds / 2, {}); step(s, theme.rounds.reloadSeconds / 2 + 0.01, {});
  // step clamps dt to 0.1, so finish winding with small ticks.
  tick(s, theme.rounds.reloadSeconds);
  assert.equal(s.clip, theme.rounds.magazine);
  while (s.ammo > 0) { s.fireCooldown = 0; s.reload = 0; if (s.clip === 0) s.clip = theme.rounds.magazine; fire(s); }
  assert.equal(s.shots, theme.rounds.ammo);
  tick(s, 0.3);
  assert.equal(s.over, true);
  assert.equal(fire(s).result, "over");
});

test("holding steady: rapid frames are blocked by the cooldown", () => {
  const s = round();
  s.aim = { x: 5, y: 175 };
  assert.equal(fire(s).result, "miss");
  assert.equal(fire(s).result, "cooldown");
  tick(s, theme.rounds.cooldownSeconds + 0.05);
  assert.equal(fire(s).result, "miss");
});

test("a missed frame startles nearby skittish wildlife and its herd, but not bears", () => {
  const s = round();
  const deer = place(s, "deer", 150, 100, { herdId: 7 });
  const mate = place(s, "deer", 290, 150, { herdId: 7 });
  const bear = place(s, "bear", 140, 95);
  const far = place(s, "fox", 10, 170);
  s.aim = { x: 140, y: 90 };
  const n = startle(s);
  assert.equal(n, 1);
  const flee = speciesOf(theme, "deer").behavior.flee;
  assert.equal(deer.mult, flee);
  assert.ok(deer.pause > 0 && deer.fleeing, "a cautious deer freezes, head up, before it bolts");
  assert.equal(mate.mult, flee, "herd-mates follow");
  assert.equal(mate.dir, deer.dir);
  assert.ok(!bear.fleeing);
  assert.equal(far.mult, undefined, "out of range animals are untouched");
});

test("every species inherits a behaviour class, and only unflappable species ignore the camera", () => {
  theme.species.forEach((sp) => {
    const b = sp.behavior;
    assert.ok(b.name && b.label && b.habit, `${sp.id} has a named class with a field-guide habit`);
    assert.ok(["flee", "flush", "ignore"].includes(b.react), sp.id);
    assert.equal(b.react === "ignore", !sp.skittish, `${sp.id}: ignore ⇔ not skittish`);
    if (b.react === "flush") assert.ok(b.climb > 0, sp.id);
    if (b.wobble) assert.ok(b.wobble.length === 2 && b.wobble.every((v) => v > 0), sp.id);
  });
  const cls = (id) => speciesOf(theme, id).behavior.name;
  assert.equal(cls("deer"), "grazer");
  assert.equal(cls("bear"), "largeMammal");
  assert.equal(cls("cottontail"), "skittish");
  assert.equal(cls("monarch"), "butterfly");
  assert.equal(cls("darner"), "darter");
  assert.equal(cls("blue-jay"), "songbird");
});

test("behaviour classes react differently to a photo", () => {
  const s = round();
  const snap = (kind, x) => { const a = place(s, kind, x, 110); aimAt(s, a); s.fireCooldown = 0; assert.equal(fire(s).result, "hit"); return a; };
  const deer = snap("deer", 20);
  assert.ok(deer.fleeing && deer.mult > 3 && deer.pause === 0, "a photographed deer bolts at once, fast");
  const bear = snap("bear", 200);
  const before = { dir: bear.dir, mult: bear.mult };
  assert.ok(bear.snapped && !bear.fleeing, "a bear carries on along its path");
  assert.deepEqual({ dir: bear.dir, mult: bear.mult }, before);
  const s2 = round();
  const turkey = place(s2, "turkey", 150, 120); aimAt(s2, turkey); fire(s2);
  const y0 = turkey.y;
  s2.spawnIn = 99; tick(s2, 0.5);
  assert.ok(turkey.climb < 0 && turkey.y < y0 - 15, "a ground bird flushes up into the air");
  assert.ok(turkey.y < MIN_Y || turkey.y < y0, "flushed birds may leave the ground band");
});

test("wary grazers notice the shutter from further away than other animals", () => {
  const s = round();
  const deer = place(s, "deer", 100, 100);
  const fox = place(s, "fox", 100, 100);
  const dist = 46 * 1.2; // beyond the normal radius, inside the deer's wider one
  s.aim = { x: 100 + speciesOf(theme, "deer").w / 2 + dist, y: 100 + speciesOf(theme, "deer").h / 2 };
  startle(s);
  assert.ok(deer.fleeing);
  assert.ok(!fox.fleeing);
});

test("fluttering and hovering insects bob; skittish animals zigzag when they flee", () => {
  const s = round({ random: seq(0.1, 0.9, 0.3, 0.7) });
  s.spawnIn = 99;
  const monarch = place(s, "monarch", 100, 100, { age: 0, phase: 0, seed: 0, mult: 1, drift: 0, pause: 0, timer: 99 });
  const ys = [];
  for (let i = 0; i < 20; i += 1) { step(s, 0.05, {}); ys.push(monarch.y); }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 2, "the butterfly's path bobs up and down");
  const bee = place(s, "bumble-bee", 150, 100, { age: 0, phase: 0, seed: 0, mult: 1, drift: 0, pause: 5, timer: 99 });
  const phase0 = bee.phase; step(s, 0.1, {});
  assert.ok(bee.phase > phase0 && bee.x === 150, "a hovering bee stays put but keeps its wings going");
  const r = round({ random: seq(0.1, 0.2, 0.9, 0.2) });
  r.spawnIn = 99;
  const rabbit = place(r, "cottontail", 160, 120, { age: 0, phase: 0, seed: 0, mult: 1, drift: 0, pause: 0, timer: 99 });
  r.aim = { x: 150, y: 120 }; startle(r);
  const drifts = new Set();
  for (let i = 0; i < 20; i += 1) { step(r, 0.05, {}); drifts.add(Math.sign(rabbit.drift)); }
  assert.ok(drifts.has(1) && drifts.has(-1), "a fleeing rabbit zigzags");
});

test("animals spawn over time and the viewfinder stays on screen", () => {
  const s = round({ random: seq(0.3, 0.7, 0.1, 0.9) });
  tick(s, 3);
  assert.ok(s.animals.length > 0);
  s.animals.forEach((a) => { const [low, high] = yBounds(speciesOf(theme, a.kind)); assert.ok(a.y >= low && a.y <= high, a.kind); });
  for (let i = 0; i < 40; i += 1) step(s, 0.1, { dx: 1, dy: -1 });
  assert.deepEqual([s.aim.x, s.aim.y], [WIDTH, 0]);
  tick(s, theme.rounds.seconds);
  assert.equal(s.over, true);
  assert.equal(s.timeLeft, 0);
});

test("reduced motion slows wildlife down", () => {
  const fast = round(); const slow = round({ speedFactor: 0.6 });
  [fast, slow].forEach((s) => { const a = place(s, "fox", 100, 100); a.age = 0; a.phase = 0; a.mult = 1; a.drift = 0; a.pause = 0; a.timer = 10; s.spawnIn = 99; });
  step(fast, 0.1, {}); step(slow, 0.1, {});
  assert.ok(slow.animals[0].x - 100 < fast.animals[0].x - 100);
  assert.ok(Math.abs((slow.animals[0].x - 100) / (fast.animals[0].x - 100) - 0.6) < 1e-9);
});

test("summary and spotted list describe the outing", () => {
  const s = round();
  ["deer", "turkey"].forEach((kind, i) => { const a = place(s, kind, 40 + i * 120, 100); aimAt(s, a); s.fireCooldown = 0; fire(s); });
  const d = place(s, "deer", 100, 140); aimAt(s, d); s.fireCooldown = 0; fire(s);
  s.aim = { x: 5, y: 175 }; s.fireCooldown = 0; fire(s);
  assert.equal(spottedList(theme, s.spotted), "2 white-tailed deer, 1 wild turkey");
  assert.deepEqual(summary(s), { theme: "wildlife", score: 52, hits: 3, shots: 4, accuracy: 75, caught: { deer: 2, turkey: 1 }, species: ["deer", "turkey"], newSpecies: [], habitat: "blue-ridge" });
  assert.match(theme.text.finish(summary(s), spottedList(theme, s.spotted)), /3 animals for 52 photo points: 2 white-tailed deer/);
  assert.match(theme.text.finish({ score: 0, hits: 0, shots: 1, accuracy: 0 }, ""), /1 frame this time/);
  assert.equal(theme.text.hit(speciesOf(theme, "cottontail"), 4), "Snap! An eastern cottontail for 4 points.");
  assert.equal(theme.text.hit(speciesOf(theme, "moose"), 100), "Snap! A moose for 100 points.");
});

test("the field guide has birds, insects, reptiles and amphibians, each with a fact and a range", () => {
  const groups = new Set(theme.species.map((sp) => sp.group));
  assert.deepEqual([...groups].sort(), ["bird", "herp", "insect", "legend", "mammal"]);
  ["bald-eagle", "red-tailed-hawk", "turkey", "blue-jay", "meadowlark", "barred-owl", "monarch", "darner", "firefly", "bumble-bee", "mantis", "tiger-beetle",
    "fox", "beaver", "coyote", "otter", "box-turtle", "wood-frog"].forEach((id) => assert.ok(speciesOf(theme, id), id));
  theme.species.forEach((sp) => {
    assert.ok(sp.fact && sp.fact.length <= 200 && sp.range, `${sp.id} fact/range`);
    assert.ok(["common", "uncommon", "rare", "legend"].includes(sp.rarity), sp.id);
    assert.match(sp.id, /^[a-z][a-z0-9-]{1,30}$/, "matches the species id check");
    assert.ok(sp.value <= theme.rounds.maxScore);
  });
  const special = new Set(theme.species.filter((sp) => sp.rarity === "rare" || sp.rarity === "legend").map((sp) => sp.id));
  Object.entries(theme.habitats).forEach(([id, hab]) => {
    assert.ok(hab.fact, `${id} fact`);
    Object.keys(hab.animals).forEach((sp) => assert.ok(!special.has(sp), `${sp} never spawns by weight in ${id}`));
    hab.rare.forEach((sp) => assert.equal(speciesOf(theme, sp).rarity, "rare"));
    hab.legends.forEach((sp) => assert.equal(speciesOf(theme, sp).rarity, "legend"));
  });
  assert.ok(theme.species.length <= 40, "a run can record every species (database cap is 40)");
});

test("regional wildlife: the ecosystem changes along the trail", () => {
  const weight = (hab, id) => theme.habitats[hab].animals[id] || 0;
  assert.ok(weight("north-woods", "loon") > 0 && weight("southern-ridges", "loon") === 0, "loons only up north");
  assert.ok(weight("rocky-ridges", "red-tailed-hawk") >= Math.max(...Object.keys(theme.habitats).map((h) => weight(h, "red-tailed-hawk"))), "Pennsylvania hawk flyway");
  assert.ok(weight("high-balds", "firefly") > weight("north-woods", "firefly"));
  assert.ok(weight("southern-ridges", "box-turtle") > 0 && weight("north-woods", "box-turtle") === 0);
  assert.ok(theme.habitats["north-woods"].rare.includes("lynx") && !theme.habitats["southern-ridges"].rare.includes("lynx"));
  assert.ok(theme.habitats["rocky-ridges"].legends.includes("snallygaster"));
});

test("seasons: warm-weather species are scarce in winter, snowy owls only come in winter", () => {
  const monarch = speciesOf(theme, "monarch");
  assert.equal(inSeason(monarch, false), true);
  assert.equal(inSeason(monarch, true), false);
  assert.equal(inSeason(speciesOf(theme, "snowy-owl"), false), false);
  assert.equal(inSeason(speciesOf(theme, "deer"), true), true);
  const count = (winter) => { let n = 0; for (let i = 0; i < 1000; i += 1) if (pickSpecies(theme, "high-balds", seq(i / 1000), { winter }).season === "warm") n += 1; return n; };
  assert.ok(count(true) < count(false) / 2, "far fewer insects and frogs in winter");
  assert.equal(chooseOuting(theme, "alpine", { random: seq(0.1), month: 1 }).winter, true);
  assert.equal(chooseOuting(theme, "alpine", { random: seq(0.1), month: 7 }).winter, false);
});

test("rare and legendary finds: rolled once per outing, very rarely, from the local lists", () => {
  assert.ok(RARE_CHANCE <= 0.06 && LEGEND_CHANCE <= 0.005 && LEGEND_CHANCE < RARE_CHANCE);
  assert.equal(rollSpecial(theme, "north-woods", { random: seq(0.5) }), null);
  assert.equal(rollSpecial(theme, "north-woods", { random: seq(LEGEND_CHANCE + RARE_CHANCE + 0.001) }), null);
  const rare = rollSpecial(theme, "north-woods", { random: seq(LEGEND_CHANCE + 0.001, 0, 0.5) });
  assert.equal(rare.id, "lynx");
  assert.ok(rare.at >= 4 && rare.at <= theme.rounds.seconds - 8);
  assert.equal(speciesOf(theme, rollSpecial(theme, "rocky-ridges", { random: seq(0, 0.99, 0) }).id).rarity, "legend");
  // Out-of-season rare species are skipped: no snowy owl in July.
  for (let i = 0; i < 10; i += 1) {
    const found = rollSpecial(theme, "alpine", { random: seq(LEGEND_CHANCE + 0.001, i / 10, 0.5) });
    assert.notEqual(found && found.id, "snowy-owl");
  }
  // Over many outings the rates match the constants.
  let rares = 0; let legends = 0;
  const random = seq(...Array.from({ length: 5003 }, (_, i) => ((i * 7919) % 5003) / 5003));
  for (let i = 0; i < 5000; i += 1) {
    const found = rollSpecial(theme, "blue-ridge", { random });
    if (found && speciesOf(theme, found.id).rarity === "rare") rares += 1;
    if (found && speciesOf(theme, found.id).rarity === "legend") legends += 1;
  }
  assert.ok(rares > 0 && rares < 5000 * 0.1, `rares ${rares}`);
  assert.ok(legends < 5000 * 0.02, `legends ${legends}`);
});

test("a special find appears once at its time, scores its value and says so", () => {
  const s = round({ special: { id: "white-deer", at: 1 }, random: seq(0.5) });
  tick(s, 0.5);
  assert.ok(!s.animals.some((a) => a.kind === "white-deer"));
  tick(s, 1);
  const deer = s.animals.find((a) => a.kind === "white-deer");
  assert.ok(deer && s.special.shown);
  aimAt(s, deer);
  const out = fire(s);
  assert.equal(out.result, "hit");
  assert.equal(out.rarity, "rare");
  assert.equal(out.value, 150);
  assert.match(s.popups.at(-1).text, /^RARE \+150/);
  tick(s, 5);
  assert.equal(s.animals.filter((a) => a.kind === "white-deer").length <= 1, true, "never a second one");
  assert.ok(summary(s).species.includes("white-deer"));
});

test("flyers use the sky: soaring birds above the horizon, ground animals below it", () => {
  const [hawkLow, hawkHigh] = yBounds(speciesOf(theme, "bald-eagle"));
  assert.ok(hawkLow < MIN_Y && hawkHigh <= MIN_Y + 6);
  assert.ok(yBounds(speciesOf(theme, "monarch"))[0] < MIN_Y);
  assert.equal(yBounds(speciesOf(theme, "deer"))[0], MIN_Y);
  const s = round();
  const eagle = place(s, "bald-eagle", 100, 20);
  tick(s, 2);
  assert.ok(eagle.y >= hawkLow && eagle.y <= hawkHigh);
});

test("hit text reads naturally for proper names", () => {
  assert.match(theme.text.hit(speciesOf(theme, "bigfoot"), 200), /^Snap! Bigfoot for 200/);
  assert.match(theme.text.hit(speciesOf(theme, "otter"), 45), /^Snap! A river otter/);
  assert.match(theme.text.legend(speciesOf(theme, "jackalope")), /a jackalope/);
});

test("collection scoring: each species scores once per outing; new field guide species score double", () => {
  const s = round({ known: ["deer"] });
  const snap = (kind, y) => { const a = place(s, kind, 100, y); aimAt(s, a); s.fireCooldown = 0; return fire(s); };
  const deer = snap("deer", 100);
  assert.deepEqual([deer.value, deer.isNew, deer.repeat], [speciesOf(theme, "deer").value, false, false]);
  const again = snap("deer", 120);
  assert.deepEqual([again.value, again.repeat], [0, true]);
  assert.equal(s.popups.at(-1).text, "SEEN");
  assert.match(theme.text.repeat(speciesOf(theme, "deer")), /^Already got a white-tailed deer this outing/);
  const turkey = snap("turkey", 140);
  assert.deepEqual([turkey.value, turkey.isNew], [speciesOf(theme, "turkey").value * 2, true]);
  assert.match(s.popups.at(-1).text, /^NEW \+/);
  assert.deepEqual(summary(s).newSpecies, ["turkey"]);
  assert.equal(s.score, speciesOf(theme, "deer").value + speciesOf(theme, "turkey").value * 2);
  // Without a field guide (migration not applied) there is no discovery bonus.
  const plain = round();
  const t = place(plain, "turkey", 100, 100); aimAt(plain, t);
  assert.equal(fire(plain).value, speciesOf(theme, "turkey").value);
});

test("density: never more than four animals in view, arriving every couple of seconds", () => {
  const s = round({ random: seq(0.1, 0.9, 0.2, 0.05, 0.6) });
  let most = 0;
  for (let t = 0; t < 30; t += 0.05) { step(s, 0.05, { dx: 0, dy: 0 }); most = Math.max(most, s.animals.filter((a) => !a.snapped).length); }
  assert.ok(most > 0 && most <= 4, `at most 4 (saw ${most})`);
});
