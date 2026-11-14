import test from "node:test";
import assert from "node:assert/strict";
import {
  BENCH_SEATS, CAMP_LOCATIONS, CAMP_PROPS, CAMP_START, CAMERA, FIRE_BENCHES, PLAYER_RADIUS, QUALITY, TENT_SPOTS, WORLD_RADIUS,
  bulletinBoard, blocksView, campColliders, campLighting, followCamera, forestRing, joystickVector, keysVector,
  locationView, lowerQuality, moveActor, nearestLocation, qualityTier, rosterCampfire, stepFromInput, turnToward
} from "../../assets/js/at/engine/camp-world.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("the camp has the six interactive locations, each reachable and not overlapping anything", () => {
  assert.deepEqual(CAMP_LOCATIONS.map((l) => l.id), ["roster", "bulletin", "journal", "patches", "wildlife", "map"]);
  const all = [...CAMP_LOCATIONS, ...CAMP_PROPS, ...TENT_SPOTS];
  for (const a of all) {
    assert.ok(Math.hypot(a.x, a.z) + a.radius < WORLD_RADIUS, `${a.id} inside the camp`);
    for (const b of all) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.radius + b.radius + PLAYER_RADIUS * 2, `${a.id} and ${b.id} leave a path`);
  }
  for (const loc of CAMP_LOCATIONS) {
    assert.ok(loc.name && loc.verb, loc.id);
    // Walking straight at it from the start ends with its prompt showing.
    const colliders = campColliders({ tents: TENT_SPOTS.length });
    let pos = { x: CAMP_START.x, z: CAMP_START.z };
    for (let i = 0; i < 400; i += 1) {
      const dx = loc.x - pos.x; const dz = loc.z - pos.z; const d = Math.hypot(dx, dz) || 1;
      pos = moveActor(pos, (dx / d) * 0.05, (dz / d) * 0.05, colliders);
      // Sidestep around anything in the way.
      if (i % 40 === 39) pos = moveActor(pos, -dz / d * 0.6, dx / d * 0.6, colliders);
    }
    assert.equal(nearestLocation(pos)?.id, loc.id, `${loc.id} is reachable`);
  }
  assert.equal(nearestLocation({ x: 11, z: -11 }), null, "nothing to use in an empty corner");
});

test("location names are unique Title Case headings with a sentence-case verb", () => {
  const minor = new Set(["a", "an", "the", "and", "of", "to", "in", "on", "for", "at", "by", "or", "with"]);
  assert.equal(new Set(CAMP_LOCATIONS.map((l) => l.name)).size, CAMP_LOCATIONS.length);
  for (const loc of CAMP_LOCATIONS) {
    loc.name.split(" ").forEach((w, i) => assert.ok(/^[A-Z]/.test(w) || (i > 0 && minor.has(w)), `${loc.name}: "${w}"`));
    assert.match(loc.verb, /^[A-Z][a-z]+( [a-z]+)*$/, `${loc.id} verb reads as a button label`);
  }
});

test("every place has a close-up view from inside camp, clear of anything solid, looking at it", () => {
  const solid = campColliders({ tents: TENT_SPOTS.length }).filter((c) => c.tall);
  const check = (loc, view, label) => {
    assert.ok(Math.hypot(view.x, view.z) < WORLD_RADIUS - 0.5, `${label} camera inside camp`);
    assert.ok(view.y > 0.8 && view.y < 4, `${label} camera at a sensible height`);
    for (const c of solid) assert.ok(Math.hypot(view.x - c.x, view.z - c.z) > c.radius + 0.2, `${label} camera clear of ${c.id}`);
    const toPlace = Math.hypot(loc.x - view.x, loc.z - view.z);
    const toLook = Math.hypot(view.look.x - view.x, view.look.z - view.z);
    assert.ok(toPlace > 0.8 && toPlace < 5, `${label} camera close to the place`);
    // Looking toward the place (the wildlife area looks past it into the woods).
    const dot = ((loc.x - view.x) * (view.look.x - view.x) + (loc.z - view.z) * (view.look.z - view.z)) / (toPlace * toLook);
    assert.ok(dot > 0.9, `${label} looks at the place`);
  };
  for (const loc of CAMP_LOCATIONS) {
    assert.ok(loc.view, `${loc.id} has a view`);
    if (loc.view.orbit !== undefined) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) check(loc, locationView(loc, { angle: a }), `${loc.id} at ${a.toFixed(2)}`);
    } else check(loc, locationView(loc), loc.id);
  }
  const wild = locationView(CAMP_LOCATIONS.find((l) => l.id === "wildlife"));
  assert.ok(Math.hypot(wild.look.x, wild.look.z) > Math.hypot(8.5, 3.5), "the observation area looks out into the woods");
});

test("a close-up steps out of shot only whoever stands between the camera and the place", () => {
  const board = CAMP_LOCATIONS.find((l) => l.id === "patches");
  const view = locationView(board);
  const along = (t, off = 0) => {
    const dx = board.x - view.x; const dz = board.z - view.z; const d = Math.hypot(dx, dz);
    return { x: view.x + dx * t - (dz / d) * off, z: view.z + dz * t + (dx / d) * off };
  };
  assert.ok(blocksView(board, view, along(0.5)), "in front of the board");
  assert.ok(blocksView(board, view, along(0.8, 0.6)), "beside the board but covering its edge");
  assert.ok(!blocksView(board, view, along(0.5, 2)), "off to the side");
  assert.ok(!blocksView(board, view, along(1.3)), "behind the board");
  assert.ok(!blocksView(board, view, along(-0.6)), "behind the camera");
  const fire = CAMP_LOCATIONS.find((l) => l.id === "roster");
  const fireView = locationView(fire, { angle: 0 });
  assert.ok(!blocksView(fire, fireView, { x: (fire.x + fireView.x) / 2, z: (fire.z + fireView.z) / 2 }), "the campfire keeps its company");
});

test("moving slides around colliders and stays inside the camp", () => {
  const rock = [{ id: "rock", x: 0, z: 0, radius: 1 }];
  const hit = moveActor({ x: -2, z: 0 }, 1.5, 0, rock);
  close(Math.hypot(hit.x, hit.z), 1 + PLAYER_RADIUS);
  const slide = moveActor({ x: -1.5, z: -0.2 }, 0.3, 0, rock);
  assert.ok(slide.z < -0.2, "glances off to the side instead of stopping dead");
  const out = moveActor({ x: 14, z: 0 }, 5, 0, []);
  close(Math.hypot(out.x, out.z), WORLD_RADIUS - PLAYER_RADIUS);
  const centre = moveActor({ x: 0, z: 0 }, 0, 0, rock);
  close(Math.hypot(centre.x, centre.z), 1 + PLAYER_RADIUS);
  assert.deepEqual(moveActor({ x: 1, z: 2 }, 0, 0, []), { x: 1, z: 2 });
});

test("joystick, keys and camera-relative steps", () => {
  assert.deepEqual(joystickVector(3, 2, 48), { forward: 0, right: 0, strength: 0 }, "dead zone");
  const up = joystickVector(0, -100, 48);
  close(up.forward, 1); close(up.right, 0); close(up.strength, 1);
  const half = joystickVector(30, 0, 48);
  assert.ok(half.right > 0 && half.right < 1 && half.forward === 0);
  assert.deepEqual(keysVector([]), { forward: 0, right: 0, strength: 0 });
  assert.equal(keysVector(["KeyW", "ArrowUp"]).forward, 1, "same direction twice is not faster");
  const diag = keysVector(["KeyW", "KeyD"]);
  close(Math.hypot(diag.forward, diag.right), 1);
  assert.equal(keysVector(["KeyW", "KeyS"]).strength, 0);
  // Camera behind the player looking north (yaw 0): forward is -z, right is +x.
  const f = stepFromInput({ forward: 1, right: 0 }, 0, 20, 0.05);
  close(f.dx, 0); close(f.dz, -1);
  const r = stepFromInput({ forward: 0, right: 1 }, 0, 20, 0.05);
  close(r.dx, 1); close(r.dz, 0);
  const capped = stepFromInput({ forward: 1, right: 0 }, 0, 2, 5);
  close(capped.dz, -0.2, 1e-9);
  close(Math.cos(turnToward(3, -3, 10)), Math.cos(-3), 1e-9);
  assert.ok(turnToward(3, -3, 0.1) > 3, "turns the short way across ±π");
});

test("the follow camera sits behind the hiker and pulls in rather than clipping into the shelter", () => {
  const cam = followCamera({ x: 0, z: 0 }, 0, 0.4, []);
  close(cam.distance, CAMERA.distance);
  assert.ok(cam.z > 0 && cam.y > CAMERA.height, "behind (south of) and above the hiker");
  const shelter = [{ id: "shelter", x: 0, z: 3, radius: 1, tall: true }];
  const blocked = followCamera({ x: 0, z: 0 }, 0, 0.4, shelter);
  assert.ok(blocked.distance < CAMERA.distance && blocked.distance >= CAMERA.minDistance);
  const low = followCamera({ x: 0, z: 0 }, 0, 0.4, [{ ...shelter[0], tall: false }]);
  close(low.distance, CAMERA.distance, 1e-9);
  assert.ok(followCamera({ x: 0, z: 0 }, 0, 9, []).y < CAMERA.height + CAMERA.distance, "pitch is clamped");
});

test("quality follows the device and can step down", () => {
  assert.equal(qualityTier({ mobile: true, cores: 4, memory: 4 }).id, "low");
  assert.equal(qualityTier({ mobile: true, cores: 8, memory: 8 }).id, "medium");
  assert.equal(qualityTier({ cores: 12, memory: 16, dpr: 1 }).id, "high");
  assert.equal(qualityTier({ cores: 4, memory: 8 }).id, "medium");
  assert.equal(qualityTier({ cores: 16, memory: 16, saveData: true }).id, "low");
  assert.equal(lowerQuality(QUALITY.high), QUALITY.medium);
  assert.equal(lowerQuality(QUALITY.low), null);
  for (const q of Object.values(QUALITY)) assert.ok(q.pixelRatio <= 2 && q.trees > 0 && q.visitors >= 1 && q.visitors <= 3 && q.flora > 0 && q.ground <= 1024);
  assert.equal(QUALITY.low.shadows, 0, "phones on Low keep the cheap blob shadows");
  assert.ok(QUALITY.medium.shadows > 0 && QUALITY.high.shadows >= QUALITY.medium.shadows && QUALITY.high.shadows <= 2048);
});

test("lighting follows the time of day and the weather", () => {
  const night = campLighting("night", { id: "clear" });
  assert.ok(night.lanterns && night.fireflies && night.stars);
  const day = campLighting("day", { id: "clear" });
  assert.ok(!day.lanterns && !day.fireflies && !day.stars);
  assert.ok(night.fireIntensity > day.fireIntensity);
  const rain = campLighting("dusk", { id: "rain" });
  assert.ok(rain.rain && !rain.fireflies, "no fireflies in the rain");
  assert.ok(campLighting("day", { id: "fog" }).fogFar < day.fogFar);
  assert.ok(campLighting("day", { id: "storm" }).sunIntensity < day.sunIntensity);
  assert.equal(campLighting("bogus").sky, day.sky);
  assert.ok(night.exposure > day.exposure, "night is lifted a little so the camp stays readable");
  assert.ok(campLighting("day", { id: "fog" }).shadow < day.shadow, "no crisp shadows under cloud");
});

test("scenery is deterministic and stays out of the walkable camp", () => {
  assert.deepEqual(forestRing(20), forestRing(20));
  for (const t of forestRing(40)) assert.ok(Math.hypot(t.x, t.z) > WORLD_RADIUS);
  const seats = BENCH_SEATS;
  assert.equal(seats.length, FIRE_BENCHES.length * 2);
  for (const s of seats) {
    assert.ok(Math.hypot(s.x, s.z) > 2.8 && Math.hypot(s.x, s.z) < 3.8, `${s.id} sits by the fire`);
    close(Math.cos(s.heading), Math.cos(Math.atan2(-s.x, -s.z)), 1e-9);
  }
  for (const b of FIRE_BENCHES) {
    for (const o of FIRE_BENCHES) if (o !== b) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > b.radius + o.radius + PLAYER_RADIUS * 2, `${b.id} leaves a gap`);
    for (const o of [...CAMP_LOCATIONS, ...CAMP_PROPS, ...TENT_SPOTS]) {
      if (o.id !== "roster") assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > b.radius + o.radius + PLAYER_RADIUS * 2, `${b.id} and ${o.id}`);
    }
  }
  assert.equal(campColliders({ benches: false }).some((c) => c.id.startsWith("bench")), false);
  assert.equal(campColliders().filter((c) => c.id.startsWith("bench")).every((c) => !c.tall), true, "benches never block the camera");
});

test("the bulletin board shows recent movement, landmarks, patches and the latest dispatch", () => {
  const hikers = [
    { id: "a", name: "Ann", lastActivityDate: "2026-05-01", weekMiles: 4, totalMiles: 10 },
    { id: "b", name: "Bo", lastActivityDate: "2026-05-03", weekMiles: 2, totalMiles: 30 },
    { id: "c", name: "Cy", lastActivityDate: null, weekMiles: 0, totalMiles: 0 }
  ];
  const register = [{ title: "Springer Mountain", miles: 0, reachedOn: "2026-04-01" }, { title: "Blood Mountain", miles: 28, reachedOn: "2026-05-02", hikerName: "Bo" }];
  const patches = [
    { id: "p1", landmarkName: "Springer Mountain", state: "GA", mile: 0, earned: true, earnedOn: "2026-04-01" },
    { id: "p2", landmarkName: "Blood Mountain", state: "GA", mile: 28, earned: true, earnedOn: "2026-05-02" },
    { id: "p3", landmarkName: "Max Patch", state: "NC", mile: 254, earned: false }
  ];
  const b = bulletinBoard({ hikers, register, patches, dispatches: [{ title: "Hello", authorName: "Kevin", publishedAt: "2026-05-03T10:00:00Z" }] });
  assert.deepEqual(b.movers.map((m) => m.name), ["Bo", "Ann"]);
  assert.deepEqual(b.landmarks.map((l) => l.title), ["Blood Mountain", "Springer Mountain"]);
  assert.deepEqual(b.patches.map((p) => p.name), ["Blood Mountain", "Springer Mountain"]);
  assert.equal(b.dispatch.author, "Kevin");
  const empty = bulletinBoard();
  assert.deepEqual([empty.movers, empty.landmarks, empty.patches, empty.dispatch], [[], [], [], null]);
});

test("the roster campfire lists everyone's contribution and friendly totals", () => {
  const r = rosterCampfire([
    { id: "a", name: "Ann", totalMiles: 10, weekMiles: 4 },
    { id: "b", name: "Bo", totalMiles: 30, weekMiles: 0 }
  ], { totalMiles: 40, weekMiles: 4, activityCount: 7 });
  assert.deepEqual(r.rows.map((x) => [x.name, x.share]), [["Bo", 75], ["Ann", 25]]);
  assert.deepEqual(r.weekStar, { name: "Ann", miles: 4 });
  assert.equal(r.onTrailThisWeek, 1);
  assert.equal(r.activities, 7);
  assert.equal(rosterCampfire([], {}).weekStar, null);
});
