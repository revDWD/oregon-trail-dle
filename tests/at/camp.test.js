import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { computeProgress } from "../../assets/js/at/engine/progress.js";
import { CAMP_TIMES, CAMP_TIME_LABELS, timeOfDay, weatherFor, campScale, celebrationAt, campPeople, campContext, hashString } from "../../assets/js/at/engine/camp.js";

test("time of day buckets", () => {
  assert.deepEqual([0, 4, 5, 8, 9, 12, 16, 17, 20, 21, 23, 24, -1].map(timeOfDay),
    ["night", "night", "dawn", "dawn", "day", "day", "day", "dusk", "dusk", "night", "night", "night", "night"]);
  assert.deepEqual(CAMP_TIMES.map((t) => CAMP_TIME_LABELS[t]), ["Morning", "Day", "Evening", "Night"]);
});

test("weather is deterministic and seasonal", () => {
  assert.deepEqual(weatherFor("2026-07-04", "alpine"), weatherFor("2026-07-04", "alpine"));
  const summer = new Set(); const winterHigh = new Set(); const winterLow = new Set();
  for (let d = 1; d <= 28; d += 1) {
    const day = String(d).padStart(2, "0");
    summer.add(weatherFor(`2026-07-${day}`, "alpine").id);
    winterHigh.add(weatherFor(`2026-01-${day}`, "alpine").id);
    winterLow.add(weatherFor(`2026-01-${day}`, "rocky-ridges").id);
  }
  assert.ok(!summer.has("snow"));
  assert.ok(winterHigh.has("snow"));
  assert.ok(!winterLow.has("snow") && !winterLow.has("storm"));
  assert.equal(hashString("abc"), hashString("abc"));
});

test("camp grows with miles and hikers but stays capped", () => {
  const small = campScale(0, 1);
  const big = campScale(100000, 50);
  assert.equal(small.tents, 1); assert.equal(small.fire, 1); assert.equal(small.bearBags, 1); assert.equal(small.stage, "early");
  assert.equal(big.tents, 8); assert.equal(big.hikers, 10); assert.equal(big.bearBags, 6); assert.equal(big.fire, 3); assert.equal(big.stage, "late");
  assert.equal(campScale(-5, Number.NaN).tents, 1);
  assert.equal(campScale(0, 3).bearBags, 3, "one bear bag per hiker at camp");
  assert.ok(!("foodBags" in small), "the Oregon Trail pantry is gone");
});

test("celebrations follow a recently passed landmark, not the start", () => {
  assert.equal(celebrationAt(computeProgress(TRAIL, 0)), null);
  assert.equal(celebrationAt(computeProgress(TRAIL, 35)).name, "Neel Gap");
  assert.equal(celebrationAt(computeProgress(TRAIL, 75)), null);
});

test("camp people come from hiker rows with stable seeds, recent arrivals and the selected hiker", () => {
  const board = [
    { userId: "b", displayName: "Bo", totalCreditedMiles: 5, weekCreditedMiles: 1, lastActivityDate: "2026-05-01" },
    { userId: "a", displayName: "Al", totalCreditedMiles: 20, weekCreditedMiles: 3, lastActivityDate: "2026-05-09" }
  ];
  const people = campPeople(board, { selectedId: "b", today: "2026-05-10" });
  assert.deepEqual(people.map((p) => p.name), ["Al", "Bo"]);
  assert.equal(people[0].pose, "arrive");
  assert.ok(people[1].selected && !people[1].recent && !people[0].selected);
  assert.equal(people[0].seed, campPeople(board)[0].seed);
  assert.equal(campPeople(Array.from({ length: 30 }, (_, i) => ({ userId: String(i), displayName: `H${i}`, totalCreditedMiles: i }))).length, 12);
});

test("camp context picks the region scene from crew progress", () => {
  const ctx = campContext({ trail: TRAIL, progress: computeProgress(TRAIL, 1030), board: [], supplies: { photos: 40 }, today: "2026-06-01", hour: 13 });
  assert.equal(ctx.region.id, "mid-atlantic");
  assert.equal(ctx.scene, "rocky-ridges");
  assert.equal(ctx.time, "day");
  assert.equal(ctx.scale.bearBags, 1, "a solo camp hangs one bag");
  assert.equal(ctx.supplies.photos, 40);
  assert.equal(ctx.celebration.name, "Harpers Ferry");
  assert.equal(ctx.next.name, "Pen Mar");
});
