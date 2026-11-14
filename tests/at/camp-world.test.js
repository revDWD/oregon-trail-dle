import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMP_LOCATIONS, CAMP_PROPS, CAMP_START, CAMERA, PLAYER_RADIUS, QUALITY, TENT_SPOTS, WORLD_RADIUS,
  bulletinBoard, campColliders, campLighting, campSeats, followCamera, forestRing, joystickVector, keysVector,
  lowerQuality, moveActor, nearestLocation, qualityTier, rosterCampfire, stepFromInput, turnToward
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
  for (const q of Object.values(QUALITY)) assert.ok(q.pixelRatio <= 2 && q.trees > 0);
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
});

test("scenery is deterministic and stays out of the walkable camp", () => {
  assert.deepEqual(forestRing(20), forestRing(20));
  for (const t of forestRing(40)) assert.ok(Math.hypot(t.x, t.z) > WORLD_RADIUS);
  const seats = campSeats(5);
  assert.equal(seats.length, 5);
  for (const s of seats) close(Math.hypot(s.x, s.z), 3.2);
  assert.deepEqual(campSeats(0), []);
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
