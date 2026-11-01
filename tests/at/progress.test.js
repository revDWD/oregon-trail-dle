import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import {
  computeProgress, validateTrail, landmarksInOrder, milestonesReached, coordinatesAtMarker, normalizeDirection
} from "../../assets/js/at/engine/progress.js";

test("trail data passes structural validation", () => {
  assert.deepEqual(validateTrail(TRAIL), []);
});

test("trail data is frozen and has the documented length and termini", () => {
  assert.equal(TRAIL.totalMiles, 2198);
  assert.equal(TRAIL.landmarks[0].name, "Springer Mountain");
  assert.equal(TRAIL.landmarks.at(-1).name, "Mount Katahdin");
  assert.ok(Object.isFrozen(TRAIL) && Object.isFrozen(TRAIL.landmarks) && Object.isFrozen(TRAIL.landmarks[0]));
  assert.ok(TRAIL.landmarks.every((l) => l.lat > 34 && l.lat < 46.5 && l.lon < -68 && l.lon > -85));
});

test("validateTrail catches bad data", () => {
  const bad = {
    ...TRAIL,
    landmarks: [TRAIL.landmarks[0], { ...TRAIL.landmarks[1], miles: 5000 }, { ...TRAIL.landmarks[1], id: TRAIL.landmarks[0].id }],
    milestones: [{ id: "x" }]
  };
  const problems = validateTrail(bad).join("|");
  assert.match(problems, /out of range/);
  assert.match(problems, /duplicate landmark/);
  assert.match(problems, /exactly one of miles\/fraction/);
});

test("zero miles: at the start, next landmark is the first after the terminus", () => {
  const p = computeProgress(TRAIL, 0);
  assert.equal(p.percent, 0);
  assert.equal(p.remainingMiles, 2198);
  assert.equal(p.lastLandmark.id, "springer-mountain");
  assert.equal(p.nextLandmark.id, "neel-gap");
  assert.equal(p.distanceToNext, 31);
  assert.equal(p.completed, false);
  assert.equal(p.position.lat, TRAIL.landmarks[0].lat);
});

test("mid-trail progress: percent, remaining, passed and next landmark", () => {
  const p = computeProgress(TRAIL, 100.5);
  assert.equal(p.creditedMiles, 100.5);
  assert.equal(p.percent, 4.5);
  assert.equal(p.remainingMiles, 2097.5);
  assert.deepEqual(p.passedLandmarks.map((l) => l.id), ["springer-mountain", "neel-gap", "bly-gap"]);
  assert.equal(p.nextLandmark.id, "nantahala");
  assert.equal(p.distanceToNext, 35.5);
});

test("landing exactly on a landmark counts it as passed", () => {
  const p = computeProgress(TRAIL, 31);
  assert.ok(p.passedLandmarks.some((l) => l.id === "neel-gap"));
  assert.equal(p.nextLandmark.id, "bly-gap");
  assert.equal(p.distanceToNext, 47);
});

test("finishing: 100% only when complete, no next landmark, bonus miles tracked", () => {
  const almost = computeProgress(TRAIL, 2197.99);
  assert.equal(almost.completed, false);
  assert.ok(almost.percent < 100);
  assert.equal(almost.nextLandmark.id, "katahdin");
  const done = computeProgress(TRAIL, 2198);
  assert.equal(done.completed, true);
  assert.equal(done.percent, 100);
  assert.equal(done.nextLandmark, null);
  assert.equal(done.distanceToNext, 0);
  const over = computeProgress(TRAIL, 2250.25);
  assert.equal(over.bonusMiles, 52.25);
  assert.equal(over.remainingMiles, 0);
  assert.equal(over.passedLandmarks.length, TRAIL.landmarks.length);
});

test("invalid miles are treated as zero", () => {
  for (const bad of [-5, NaN, undefined, null, "abc", Infinity]) {
    assert.equal(computeProgress(TRAIL, bad).creditedMiles, 0, String(bad));
  }
  assert.equal(computeProgress(TRAIL, "12.345").creditedMiles, 12.35);
});

test("southbound reverses landmark order and distances", () => {
  const order = landmarksInOrder(TRAIL, "sobo");
  assert.equal(order[0].id, "katahdin");
  assert.equal(order.at(-1).id, "springer-mountain");
  const p = computeProgress(TRAIL, 100, "sobo");
  assert.equal(p.direction, "sobo");
  assert.equal(p.passedLandmarks.map((l) => l.id).join(), "katahdin");
  assert.equal(p.nextLandmark.id, "monson");
  assert.equal(p.distanceToNext, 13);
  assert.equal(p.position.marker, 2098);
});

test("unknown directions are rejected; missing direction uses the trail default", () => {
  assert.throws(() => computeProgress(TRAIL, 1, "east"), RangeError);
  assert.equal(normalizeDirection(TRAIL), "nobo");
});

test("coordinates interpolate along the route and are clamped to its ends", () => {
  const start = coordinatesAtMarker(TRAIL, -10);
  assert.equal(start.lat, TRAIL.landmarks[0].lat);
  const end = coordinatesAtMarker(TRAIL, 99999);
  assert.equal(end.lon, TRAIL.landmarks.at(-1).lon);
  const mid = coordinatesAtMarker(TRAIL, 15.5);
  assert.ok(mid.lat > 34.6268 && mid.lat < 34.7359 && mid.lon < -83.9172 && mid.lon > -84.1938);
});

test("route latitude rises overall and never leaves the eastern United States", () => {
  for (let m = 0; m <= 2198; m += 25) {
    const c = coordinatesAtMarker(TRAIL, m);
    assert.ok(c.lat >= 34.6 && c.lat <= 45.95 && c.lon >= -84.2 && c.lon <= -68.9, `mile ${m}`);
  }
});

test("milestones resolve fractions against total length", () => {
  const at = (miles) => milestonesReached(TRAIL, miles).filter((m) => m.reached).map((m) => m.id);
  assert.deepEqual(at(0), []);
  assert.deepEqual(at(1), ["first-steps"]);
  assert.ok(at(1099).includes("five-hundred") && !at(1098).includes("halfway"));
  assert.ok(at(1099).includes("halfway"));
  assert.equal(at(2198).length, TRAIL.milestones.length);
});
