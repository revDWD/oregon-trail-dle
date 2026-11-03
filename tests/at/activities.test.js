import test from "node:test";
import assert from "node:assert/strict";
import {
  validateActivity, applyEdit, ruleFor, creditedMiles, DEFAULT_RULES, parseDate, daysBetween, totalCredited, localDateString
} from "../../assets/js/at/engine/activities.js";

const today = "2026-06-15";
const ok = (input) => validateActivity({ type: "walking", date: today, miles: 3, ...input }, { today });

test("walking, hiking and running credit one trail mile per mile", () => {
  for (const type of ["walking", "hiking", "running"]) {
    const result = ok({ type, miles: 4.25 });
    assert.equal(result.ok, true);
    assert.equal(result.value.creditedMiles, 4.25, type);
    assert.equal(result.value.actualMiles, 4.25);
    assert.equal(result.value.conversionFactor, 1);
  }
});

test("cycling and other use their configurable factors and persist both distances", () => {
  const ride = ok({ type: "cycling", miles: 20 });
  assert.deepEqual([ride.value.actualMiles, ride.value.creditedMiles, ride.value.conversionFactor], [20, 5, 0.25]);
  const other = ok({ type: "other", miles: 3 });
  assert.deepEqual([other.value.actualMiles, other.value.creditedMiles], [3, 1.5]);
});

test("credited miles round to two decimals", () => {
  assert.equal(creditedMiles(3.333, 0.25), 0.83);
  assert.equal(ok({ type: "cycling", miles: 1.1 }).value.creditedMiles, 0.28);
});

test("rule changes only affect activities on or after the new rule's effective date", () => {
  const rules = [...DEFAULT_RULES, { type: "cycling", factor: 0.5, maxActualMiles: 150, effectiveFrom: "2026-07-01" }];
  assert.equal(ruleFor(rules, "cycling", "2026-06-30").factor, 0.25);
  assert.equal(ruleFor(rules, "cycling", "2026-07-01").factor, 0.5);
  assert.equal(ruleFor(rules, "swimming", "2026-07-01"), null);
});

test("editing keeps the stored factor unless type, date or distance changes", () => {
  const rules = [...DEFAULT_RULES, { type: "cycling", factor: 0.5, maxActualMiles: 150, effectiveFrom: "2026-06-01" }];
  const old = { type: "cycling", date: "2026-05-20", actualMiles: 20, durationMinutes: null, notes: "", conversionFactor: 0.25, creditedMiles: 5 };
  const notesOnly = applyEdit(old, { notes: "Windy" }, { rules, today });
  assert.equal(notesOnly.value.creditedMiles, 5);
  assert.equal(notesOnly.value.conversionFactor, 0.25);
  const longer = applyEdit(old, { miles: 30 }, { rules, today });
  assert.equal(longer.value.creditedMiles, 7.5); // 30 miles at the rule effective on 2026-05-20 (0.25)
  const moved = applyEdit(old, { date: "2026-06-10" }, { rules, today });
  assert.equal(moved.value.creditedMiles, 10); // now falls under the newer rule
});

test("distance bounds and per-activity safety caps", () => {
  assert.match(ok({ miles: 0.09 }).errors.miles, /at least/);
  assert.equal(ok({ miles: 0.1 }).ok, true);
  assert.equal(ok({ type: "running", miles: 50 }).ok, true);
  assert.match(ok({ type: "running", miles: 50.01 }).errors.miles, /no more than 50/);
  assert.equal(ok({ type: "cycling", miles: 150 }).ok, true);
  for (const bad of ["", "abc", NaN, null, undefined, -3, Infinity]) assert.ok(ok({ miles: bad }).errors.miles, String(bad));
  assert.equal(ok({ miles: "2.5" }).value.actualMiles, 2.5);
});

test("type validation rejects unknown activities", () => {
  for (const type of ["swimming", "", undefined, 5]) assert.ok(ok({ type }).errors.type, String(type));
});

test("date validation: real dates only, not future, bounded back-dating", () => {
  assert.equal(ok({ date: "2026-06-15" }).ok, true);
  assert.equal(ok({ date: "2026-04-16" }).ok, true); // 60 days back
  assert.match(ok({ date: "2026-04-15" }).errors.date, /60 days/);
  assert.match(ok({ date: "2026-06-16" }).errors.date, /future/);
  for (const bad of ["2026-02-30", "06/15/2026", "", undefined, "2026-6-5"]) assert.match(ok({ date: bad }).errors.date, /valid date/, String(bad));
  assert.equal(parseDate("2024-02-29") !== null, true);
  assert.equal(parseDate("2025-02-29"), null);
  assert.equal(daysBetween("2026-06-01", "2026-06-15"), 14);
});

test("duration and notes validation", () => {
  assert.equal(ok({ durationMinutes: 45 }).value.durationMinutes, 45);
  assert.equal(ok({ durationMinutes: "" }).value.durationMinutes, null);
  for (const bad of [0, 1441, 2.5, "x"]) assert.ok(ok({ durationMinutes: bad }).errors.durationMinutes, String(bad));
  assert.equal(ok({ notes: "x".repeat(240) }).ok, true);
  assert.ok(ok({ notes: "x".repeat(241) }).errors.notes);
  assert.equal(ok({ notes: "  hi  " }).value.notes, "hi");
});

test("totalCredited sums persisted credited miles, ignoring bad values", () => {
  assert.equal(totalCredited([{ creditedMiles: 1.1 }, { creditedMiles: 2.2 }, { creditedMiles: "x" }]), 3.3);
  assert.equal(totalCredited([]), 0);
});

test("localDateString uses the local calendar date", () => {
  assert.equal(localDateString(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});
