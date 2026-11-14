import test from "node:test";
import assert from "node:assert/strict";
import { LANTERN_SPOTS, TENT_SPOTS, WORLD_RADIUS, campColliders } from "../../assets/js/at/engine/camp-world.js";
import {
  CAMP_ACTIVITIES, CAMP_PATHS, CAMP_VISITORS, NPC_RADIUS, PERCHES, REGION_FLORA, activityLabel, activityWeight, allActivitySpots,
  campFlora, createCampLife, createVisitors, describeNpc, describeVisitor, framePhoto, onPath, photoCaption, projectPoint,
  stepCampLife, stepVisitors, vantagePoints, visitorPool, visitorRoute, waryDistance
} from "../../assets/js/at/engine/camp-life.js";
import { seededRandom } from "../../assets/js/at/engine/camp-world.js";
import { themeFor } from "../../assets/js/at/engine/expedition-themes.js";

const FULL = { tents: TENT_SPOTS.length, lanterns: LANTERN_SPOTS.length };
const colliders = campColliders({ tents: TENT_SPOTS.length, extra: LANTERN_SPOTS });
const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, name: `Hiker ${i}`, seed: i * 37 + 5, recent: false }));
const SCENES = Object.keys(REGION_FLORA);

test("every activity spot is inside camp, uniquely named and clear of everything unless it is a seat", () => {
  const spots = allActivitySpots();
  const keys = spots.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, "spot keys are unique");
  for (const s of spots) {
    assert.ok(Math.hypot(s.x, s.z) < WORLD_RADIUS - NPC_RADIUS, `${s.key} inside the camp`);
    assert.ok(Number.isFinite(s.heading), `${s.key} has a heading`);
    if (s.seat) continue;
    for (const c of colliders) assert.ok(Math.hypot(s.x - c.x, s.z - c.z) >= c.radius + NPC_RADIUS, `${s.key} clear of ${c.id}`);
  }
  for (const a of CAMP_ACTIVITIES) {
    assert.equal(a.weights.length, 4, a.id);
    assert.ok(activityLabel(a, "dusk").length > 3 && /^[a-z]/.test(activityLabel(a, "dawn")), `${a.id} has a sentence-case label`);
    if (a.route) assert.equal(a.spots(FULL).length, 2, `${a.id} route has two ends`);
  }
});

test("routines follow the clock and the weather", () => {
  const fire = CAMP_ACTIVITIES.find((a) => a.id === "fire");
  const chop = CAMP_ACTIVITIES.find((a) => a.id === "chop");
  const sleep = CAMP_ACTIVITIES.find((a) => a.id === "sleep");
  assert.ok(activityWeight(fire, { time: "dusk" }) > activityWeight(fire, { time: "day" }));
  assert.equal(activityWeight(chop, { time: "night" }), 0);
  assert.equal(activityWeight(sleep, { time: "day" }), 0);
  assert.ok(activityWeight(sleep, { time: "night", weather: { id: "rain" } }) > activityWeight(sleep, { time: "night" }));
  assert.ok(activityWeight(chop, { time: "day", weather: { id: "storm" } }) < activityWeight(chop, { time: "day" }));
  assert.equal(activityWeight(chop, { time: "day", favourite: "chop" }), activityWeight(chop, { time: "day" }) * 2);
  assert.equal(activityLabel("cook", "dawn"), "cooking breakfast");
  assert.equal(activityLabel("cook", "dusk"), "cooking supper");
});

test("camp life puts every hiker somewhere different, never doing the impossible", () => {
  for (const time of ["dawn", "day", "dusk", "night"]) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const life = createCampLife({ people: people(12), time, tents: 4, lanterns: 2, seed });
      assert.equal(life.npcs.length, 12);
      const claims = life.npcs.map((n) => n.claim);
      assert.equal(new Set(claims).size, 12, "no two hikers share a spot");
      for (const n of life.npcs) {
        const a = CAMP_ACTIVITIES.find((x) => x.id === n.activity);
        assert.ok(a.weights[["dawn", "day", "dusk", "night"].indexOf(time)] > 0, `${a.id} happens at ${time}`);
        assert.equal(n.state, "act");
        assert.match(describeNpc(n, time), /^Hiker \d+ is [a-z].+\.$/);
      }
    }
  }
  // Nobody tends a tent that hasn't been pitched.
  const life = createCampLife({ people: people(12), time: "night", tents: 0, lanterns: 0, seed: 3 });
  assert.ok(life.npcs.every((n) => !["gear", "tent-rest", "lantern-read"].includes(n.activity)));
  // A hiker who logged today has just walked in.
  const back = createCampLife({ people: [{ id: "k", name: "Kevin", seed: 2, recent: true }], seed: 9 });
  assert.equal(back.npcs[0].activity, "arrive");
  assert.equal(back.npcs[0].pose, "wave");
});

test("hikers walk to their next activity and settle there, and reduced motion keeps them still", () => {
  const life = createCampLife({ people: people(8), time: "day", tents: 8, lanterns: 4, seed: 4 });
  const solid = campColliders({ tents: 8, extra: LANTERN_SPOTS });
  const seen = new Set(life.npcs.map((n) => n.activity));
  let walking = 0;
  let changes = 0;
  for (let t = 0; t < 600; t += 0.1) {
    changes += stepCampLife(life, 0.1, solid).length;
    for (const n of life.npcs) {
      seen.add(n.activity);
      if (n.state !== "act") walking += 1;
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.z));
      assert.ok(Math.hypot(n.x, n.z) < WORLD_RADIUS, `${n.name} stays in camp`);
      if (n.state === "act") {
        assert.ok(Math.abs(n.x - n.target.x) < 1e-9 && Math.abs(n.z - n.target.z) < 1e-9, `${n.name} is on their spot`);
      }
    }
  }
  assert.ok(changes > 8, `hikers change activity (${changes})`);
  assert.ok(walking > 0, "hikers walk between activities");
  assert.ok(seen.size >= 8, `a varied day (${[...seen].join(", ")})`);
  const claims = life.npcs.map((n) => n.claim);
  assert.equal(new Set(claims).size, claims.length, "still no shared spots");

  const still = createCampLife({ people: people(4), seed: 4, reduced: true });
  const before = JSON.stringify(still.npcs.map((n) => [n.x, n.z, n.activity]));
  assert.deepEqual(stepCampLife(still, 1, solid), []);
  assert.equal(JSON.stringify(still.npcs.map((n) => [n.x, n.z, n.activity])), before);
});

test("wildlife visitors are real species, follow the clock, the weather and the section", () => {
  const species = new Map(themeFor("wildlife").species.map((s) => [s.id, s]));
  for (const v of CAMP_VISITORS) {
    assert.ok(species.has(v.id), `${v.id} is in the species catalogue`);
    assert.equal(v.times.length, 4);
    assert.ok(v.size > 0);
  }
  const ids = (opts) => visitorPool(opts).map((x) => x.visitor.id);
  assert.ok(!ids({ scene: "southern-ridges" }).includes("moose"), "no moose down south");
  assert.ok(ids({ scene: "north-woods" }).includes("moose"), "moose in Maine");
  assert.ok(!ids({ time: "day" }).includes("barred-owl"), "owls only at night");
  assert.ok(ids({ time: "night" }).includes("barred-owl"));
  const weight = (opts, id) => visitorPool(opts).find((x) => x.visitor.id === id).weight;
  assert.ok(weight({ weather: { id: "rain" } }, "blue-jay") < weight({}, "blue-jay"), "fewer birds in the rain");
  assert.ok(weight({}, "chipmunk") > weight({}, "fox") && weight({}, "fox") > weight({}, "coyote") && weight({ scene: "north-woods" }, "coyote") > weight({ scene: "north-woods" }, "bear"));
  for (let i = 0; i < 40; i += 1) {
    for (const v of CAMP_VISITORS) {
      const route = visitorRoute(v, seededRandom(i + 1), colliders);
      assert.ok(route.length >= 3, v.id);
      assert.ok(Math.hypot(route[0].x, route[0].z) > WORLD_RADIUS, `${v.id} arrives from the woods`);
      assert.ok(Math.hypot(route.at(-1).x, route.at(-1).z) > WORLD_RADIUS, `${v.id} leaves into the woods`);
      if (v.id === "barred-owl") assert.ok(route.slice(1, -2).every((p) => ["signpost", "bear-pole-1", "bear-pole-2", "shelter-post"].some((id) => PERCHES.find((x) => x.id === id).x === p.x)));
    }
  }
});

test("visitors arrive on a schedule, never beyond the cap, and react to the player", () => {
  const state = createVisitors({ cap: 2, seed: 5, colliders });
  let arrived = 0;
  let left = 0;
  for (let t = 0; t < 900; t += 0.1) {
    const r = stepVisitors(state, 0.1);
    arrived += r.arrived.length;
    left += r.left.length;
    assert.ok(state.list.length <= 2);
    if (t < 3.9) assert.equal(arrived, 0, "nobody turns up the moment you arrive");
  }
  assert.ok(arrived >= 8, `visitors keep coming (${arrived})`);
  assert.ok(left >= arrived - 2, "and wander off again");

  const species = new Map(themeFor("wildlife").species.map((s) => [s.id, s]));
  const visit = (id) => {
    const s = createVisitors({ cap: 1, seed: 1, colliders });
    const pool = [{ visitor: CAMP_VISITORS.find((v) => v.id === id), species: species.get(id), weight: 1 }];
    s.pool = pool;
    s.next = 0;
    const [v] = stepVisitors(s, 0.05).arrived;
    Object.assign(v, { x: 10, z: 0, y: 0, leg: 2, wait: 5 });
    stepVisitors(s, 0.05, { player: { x: 9.5, z: 0 } });
    return v;
  };
  const fox = visit("fox");
  assert.ok(fox.startled && !fox.route[0].fly && Math.hypot(fox.route[0].x, fox.route[0].z) > WORLD_RADIUS, "a fox slips away");
  const jay = visit("blue-jay");
  assert.ok(jay.startled && jay.route[0].fly && jay.route[0].y > 5, "a jay flushes");
  const bear = visit("bear");
  assert.ok(!bear.startled, "a bear carries on");

  const still = createVisitors({ cap: 3, seed: 2, reduced: true, colliders });
  assert.ok(still.list.length >= 1 && still.list.length <= 2);
  const pos = JSON.stringify(still.list.map((v) => [v.x, v.z]));
  assert.deepEqual(stepVisitors(still, 1), { arrived: [], left: [] });
  assert.equal(JSON.stringify(still.list.map((v) => [v.x, v.z])), pos);
});

test("visitors stay a mystery in text until photographed", () => {
  const species = themeFor("wildlife").species.find((s) => s.id === "turkey");
  const v = { visitor: CAMP_VISITORS.find((x) => x.id === "turkey"), species, photographed: false };
  assert.equal(describeVisitor(v), "Something is moving at the edge of camp.");
  assert.ok(!/turkey/i.test(describeVisitor(v)));
  v.photographed = true;
  assert.equal(describeVisitor(v), "A wild turkey is at the edge of camp.");
  const owl = { visitor: CAMP_VISITORS.find((x) => x.id === "barred-owl"), species: themeFor("wildlife").species.find((s) => s.id === "barred-owl"), photographed: false };
  assert.equal(describeVisitor(owl), "Something with wings is perched nearby.");
});

test("every section has its own plants, kept off the paths, colliders and activity spots", () => {
  const spots = allActivitySpots();
  for (const scene of SCENES) {
    const f = REGION_FLORA[scene];
    assert.ok(f.label && f.pine > 0 && f.pine < 1, scene);
    const plants = campFlora(scene, 130, { seed: 3, colliders, avoid: spots });
    assert.ok(plants.length >= 100, `${scene}: ${plants.length} plants`);
    for (const p of plants) {
      assert.ok(!onPath(p.x, p.z, p.size), `${scene} ${p.kind} off the paths`);
      for (const c of colliders) assert.ok(Math.hypot(p.x - c.x, p.z - c.z) > c.radius + p.size, `${scene} ${p.kind} clear of ${c.id}`);
      for (const s of spots) assert.ok(Math.hypot(p.x - s.x, p.z - s.z) > p.size + 0.5, `${scene} ${p.kind} clear of ${s.key}`);
    }
  }
  const kinds = (scene) => new Set(campFlora(scene, 130, { seed: 3, colliders }).map((p) => p.kind));
  assert.ok(kinds("southern-ridges").has("rhododendron"), "Georgia has rhododendron");
  assert.ok(!kinds("blue-ridge").has("rhododendron"));
  assert.ok(kinds("rocky-ridges").has("boulder"), "Pennsylvania is rocky");
  assert.ok(REGION_FLORA["north-woods"].pine > REGION_FLORA["blue-ridge"].pine, "Maine is evergreen");
  assert.ok(CAMP_PATHS.some((p) => p.id === "trail"));
});

test("the photo camera finds what's in frame and favours wildlife", () => {
  const cam = { x: 0, y: 1.5, z: 0, yaw: 0, pitch: 0, fov: (55 * Math.PI) / 180, aspect: 1.5 };
  const ahead = projectPoint(cam, { x: 0, y: 1.5, z: 5 });
  assert.ok(ahead.visible && Math.abs(ahead.x) < 1e-9 && Math.abs(ahead.y) < 1e-9 && Math.abs(ahead.depth - 5) < 1e-9);
  assert.ok(!projectPoint(cam, { x: 0, y: 1.5, z: -5 }).visible, "behind the camera");
  assert.ok(projectPoint(cam, { x: -1, y: 1.5, z: 5 }).x > 0, "looking +z, -x is on the right");
  assert.ok(projectPoint(cam, { x: 0, y: 3, z: 5 }).y > 0, "up is up");
  const turned = projectPoint({ ...cam, yaw: Math.PI / 2 }, { x: 5, y: 1.5, z: 0 });
  assert.ok(turned.visible && Math.abs(turned.x) < 1e-9);

  const hiker = { kind: "hiker", id: "k", name: "Kevin", x: 0.5, y: 1, z: 5, size: 1.6, detail: "cooking supper" };
  const fox = { kind: "wildlife", id: "fox", name: "red fox", x: -0.6, y: 0.3, z: 6, size: 0.7 };
  const shot = framePhoto([hiker, fox], cam);
  assert.equal(shot.subject.id, "fox");
  assert.equal(shot.speciesId, "fox");
  assert.match(photoCaption(shot), /red fox visiting camp, with Kevin in the shot\.$/);
  assert.equal(framePhoto([{ ...fox, blocked: true }, hiker], cam).subject.id, "k", "a fox behind a tent doesn't count");
  assert.equal(photoCaption(framePhoto([hiker], cam)), "Close-up: Kevin, cooking supper.");
  assert.equal(framePhoto([{ ...fox, z: 400 }], cam), null, "a speck in the distance is scenery");
  assert.equal(framePhoto([], cam), null);
  assert.equal(photoCaption(null, { time: "dusk", weather: { id: "fog" } }), "Scenery: evening light over camp. Fog drifts low through the ridges.");
});

test("Aim camera finds a free spot outside the animal's comfort zone, preferring a short walk", () => {
  const target = { x: 0, z: -13 };
  const spots = vantagePoints(target, { x: 0, z: 0 }, colliders, { near: 3, far: 7 });
  assert.ok(spots.length > 0);
  for (const s of spots) {
    const d = Math.hypot(s.x - target.x, s.z - target.z);
    assert.ok(d >= 3 - 1e-9 && d <= 7 + 1e-9, "within near..far of the animal");
    assert.ok(Math.hypot(s.x, s.z) <= WORLD_RADIUS, "inside camp");
    assert.ok(colliders.every((c) => Math.hypot(s.x - c.x, s.z - c.z) >= c.radius), "not inside anything");
  }
  const cost = spots.map((s) => Math.hypot(s.x, s.z));
  assert.deepEqual(cost, [...cost].sort((a, b) => a - b), "shortest walk first");
  // Already at a good distance: stay put.
  assert.deepEqual(vantagePoints(target, { x: 0, z: -8 }, colliders)[0], { x: 0, z: -8 });
  // Too close (it would startle) or too far: move.
  assert.notDeepEqual(vantagePoints(target, { x: 0, z: -11.5 }, colliders)[0], { x: 0, z: -11.5 });
  const skittish = { species: { behavior: { wary: 1.6 } } };
  assert.ok(waryDistance(skittish) > waryDistance({ species: {} }));
});
