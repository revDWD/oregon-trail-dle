import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { computeProgress } from "../../assets/js/at/engine/progress.js";
import {
  weekStart, computeRhythm, weeklyGoalStatus, computeBadges, groupMilestoneStatus, triviaFor, pickTip, SAFETY_TIPS
} from "../../assets/js/at/engine/game.js";

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-06-15"), "2026-06-15"); // Monday
  assert.equal(weekStart("2026-06-21"), "2026-06-15"); // Sunday
  assert.equal(weekStart("2026-06-22"), "2026-06-22");
  assert.equal(weekStart("2026-01-01"), "2025-12-29");
  assert.throws(() => weekStart("nope"), RangeError);
});

test("rhythm forgives a single rest day between active days", () => {
  const r = computeRhythm(["2026-06-10", "2026-06-12", "2026-06-14", "2026-06-15"], "2026-06-15");
  assert.deepEqual([r.current, r.longest, r.alive], [4, 4, true]);
});

test("rhythm survives today being a rest day, and two rest days end it gently", () => {
  assert.equal(computeRhythm(["2026-06-13", "2026-06-14"], "2026-06-15").alive, true);
  assert.equal(computeRhythm(["2026-06-13", "2026-06-14"], "2026-06-16").alive, true);
  const quiet = computeRhythm(["2026-06-13", "2026-06-14"], "2026-06-17");
  assert.deepEqual([quiet.alive, quiet.current, quiet.longest], [false, 0, 2]); // longest is never lost
});

test("a gap of two or more rest days starts a new run; longest keeps the best", () => {
  const r = computeRhythm(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-06-14", "2026-06-15"], "2026-06-15");
  assert.deepEqual([r.current, r.longest], [2, 4]);
});

test("rhythm ignores duplicates, bad and future dates, and handles empty input", () => {
  assert.deepEqual(computeRhythm([], "2026-06-15"), { current: 0, longest: 0, alive: false, lastActive: null });
  const r = computeRhythm(["2026-06-15", "2026-06-15", "bad", "2026-07-01"], "2026-06-15");
  assert.deepEqual([r.current, r.longest], [1, 1]);
});

test("weekly goal status is encouraging and capped at 100%", () => {
  assert.deepEqual(weeklyGoalStatus(null, 5), { hasGoal: false, miles: 5, percent: 0, met: false, remaining: 0 });
  const part = weeklyGoalStatus(10, 4.5);
  assert.deepEqual([part.percent, part.met, part.remaining], [45, false, 5.5]);
  const done = weeklyGoalStatus(10, 25);
  assert.deepEqual([done.percent, done.met, done.remaining], [100, true, 0]);
});

test("badges: landmark, milestone and rhythm badges are earned from progress", () => {
  const badges = computeBadges(TRAIL, computeProgress(TRAIL, 110), { longest: 7 });
  const earned = (id) => badges.find((b) => b.id === id).earned;
  assert.equal(badges.find((b) => b.id === "landmark-springer-mountain"), undefined); // the start is not a badge
  assert.equal(earned("landmark-neel-gap"), true);
  assert.equal(earned("landmark-nantahala"), false);
  assert.equal(earned("milestone-hundred-miles"), true);
  assert.equal(earned("milestone-halfway"), false);
  assert.equal(earned("rhythm-7"), true);
  assert.equal(earned("rhythm-14"), false);
  assert.equal(new Set(badges.map((b) => b.id)).size, badges.length);
});

test("group milestones track the combined miles and the cooperative weekly goal", () => {
  const s = groupMilestoneStatus(TRAIL, 260, [{ weekCreditedMiles: 3 }, { weekCreditedMiles: 1 }]);
  assert.deepEqual(s.steps.filter((x) => x.reached).map((x) => x.id), ["group-100", "group-250"]);
  assert.equal(s.next.id, "group-500");
  assert.equal(s.remainingToNext, 240);
  assert.equal(s.everyoneMovedThisWeek, true);
  assert.equal(groupMilestoneStatus(TRAIL, 0, [{ weekCreditedMiles: 3 }, { weekCreditedMiles: 0 }]).everyoneMovedThisWeek, false);
  assert.equal(groupMilestoneStatus(TRAIL, 5000).next, null);
  assert.equal(groupMilestoneStatus(TRAIL, 2198).steps.at(-1).reached, true);
});

test("trivia previews the next landmark, or recalls the last one at the end", () => {
  assert.equal(triviaFor(computeProgress(TRAIL, 5)).title, "Neel Gap");
  const end = triviaFor(computeProgress(TRAIL, 2198));
  assert.equal(end.title, "Mount Katahdin");
  assert.equal(end.upcoming, false);
});

test("safety tips never push intensity", () => {
  assert.ok(SAFETY_TIPS.every((tip) => !/faster|harder|no pain|push through|streak lost/i.test(tip)));
  assert.equal(typeof pickTip(-7), "string");
});
