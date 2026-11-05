import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { speciesBadges } from "../../assets/js/at/engine/field-guide.js";
import {
  MILE_BADGES, PERSONAL_MARKS, groupMarks, expeditionTotals, hikerShare, rhythmReachedOn, trailRegister,
  hikerMilestones, hikerBadges, nextMileBadge, hikerTimeline, badgeCollection
} from "../../assets/js/at/engine/hikers.js";

const david = {
  id: "h-david", name: "David", totalMiles: 120.5, weekMiles: 6, activityCount: 9, firstActivityDate: "2026-11-01",
  lastActivityDate: "2026-11-20", activeDates: ["2026-11-01", "2026-11-02", "2026-11-04"], wildlifeRuns: 2, wildlifeScore: 30, firstSpottedOn: "2026-11-03"
};
const kevin = {
  id: "h-kevin", name: "Kevin", totalMiles: 8, weekMiles: 0, activityCount: 1, firstActivityDate: "2026-11-15",
  lastActivityDate: "2026-11-15", activeDates: ["2026-11-15"], wildlifeRuns: 0, wildlifeScore: 0, firstSpottedOn: null
};
// What at_expedition_marks returns (numbers may arrive as strings from Postgres numeric).
const marks = [
  { kind: "group", mark: "31", hikerId: "h-david", reachedOn: "2026-11-05" }, // Neel Gap
  { kind: "group", mark: "78", hikerId: "h-david", reachedOn: "2026-11-12" }, // Bly Gap
  { kind: "group", mark: "100", hikerId: "h-kevin", reachedOn: "2026-11-15" }, // First hundred together
  { kind: "personal", mark: "10", hikerId: "h-david", reachedOn: "2026-11-02" },
  { kind: "personal", mark: "50", hikerId: "h-david", reachedOn: "2026-11-08" },
  { kind: "personal", mark: "100", hikerId: "h-david", reachedOn: "2026-11-18" }
];

test("mileage badges follow the sprint's ladder and each has its own art", () => {
  assert.deepEqual(MILE_BADGES.map((b) => [b.title, b.miles]), [
    ["First Steps", 10], ["Trail Walker", 50], ["Pathfinder", 100], ["Wagon Scout", 200], ["Frontier Traveler", 500], ["Katahdin Bound", 1000]
  ]);
  assert.deepEqual(PERSONAL_MARKS, [10, 50, 100, 200, 500, 1000]);
  const arts = hikerBadges(david, { today: "2026-11-20" }).map((b) => b.art);
  assert.equal(new Set(arts).size, arts.length, "no two badges share artwork");
});

test("group marks: every landmark after the start plus group milestones, in trail order, within the RPC cap", () => {
  const list = groupMarks(TRAIL, "nobo");
  assert.ok(!list.some((m) => m.id === "landmark-springer-mountain"));
  assert.equal(list.find((m) => m.id === "landmark-neel-gap").miles, 31);
  assert.equal(list.find((m) => m.id === "group-finish").miles, TRAIL.totalMiles);
  assert.deepEqual(list.map((m) => m.miles), [...list.map((m) => m.miles)].sort((a, b) => a - b));
  assert.ok(list.length <= 100);
  const sobo = groupMarks(TRAIL, "sobo");
  assert.ok(sobo.every((m) => m.miles > 0), "southbound skips its own start (Katahdin)");
  assert.equal(sobo.find((m) => m.id === "landmark-springer-mountain").miles, TRAIL.totalMiles);
});

test("expedition totals and each hiker's share", () => {
  const totals = expeditionTotals([david, kevin]);
  assert.deepEqual(totals, { totalMiles: 128.5, weekMiles: 6, activityCount: 10, wildlifeScore: 30, hikerCount: 2 });
  assert.equal(hikerShare(david, totals), 94);
  assert.equal(hikerShare(kevin, expeditionTotals([])), 0);
  assert.deepEqual(expeditionTotals(), { totalMiles: 0, weekMiles: 0, activityCount: 0, wildlifeScore: 0, hikerCount: 0 });
});

test("rhythm reached-on dates forgive one rest day", () => {
  assert.equal(rhythmReachedOn(["2026-11-04", "2026-11-01", "2026-11-02", "2026-11-02"], 3), "2026-11-04");
  assert.equal(rhythmReachedOn(["2026-11-01", "2026-11-04", "2026-11-05"], 3), null);
  assert.equal(rhythmReachedOn([], 3), null);
});

test("trail register says who carried the expedition past each mark", () => {
  const register = trailRegister(TRAIL, "nobo", marks, [david, kevin]);
  assert.deepEqual(register.map((r) => [r.title, r.hikerName, r.reachedOn]), [
    ["Neel Gap", "David", "2026-11-05"], ["Bly Gap", "David", "2026-11-12"], ["First hundred together", "Kevin", "2026-11-15"]
  ]);
  assert.deepEqual(trailRegister(TRAIL, "nobo", [], []), []);
});

test("milestones: landmarks carried and group milestones joined", () => {
  const register = trailRegister(TRAIL, "nobo", marks, [david, kevin]);
  const d = hikerMilestones(david, register);
  assert.deepEqual(d.landmarks.map((l) => l.title), ["Neel Gap", "Bly Gap"]);
  assert.deepEqual(d.groupMilestones.map((m) => [m.title, m.carried]), [["First hundred together", false]]);
  const k = hikerMilestones(kevin, register);
  assert.deepEqual(k.landmarks, []);
  assert.deepEqual(k.groupMilestones.map((m) => [m.title, m.carried]), [["First hundred together", true]]);
  assert.deepEqual(hikerMilestones({ ...kevin, firstActivityDate: "2026-11-16" }, register).groupMilestones, [], "joined after the milestone");
});

test("hiker badges: miles, firsts, landmark, milestone and rhythm, with earned dates", () => {
  const register = trailRegister(TRAIL, "nobo", marks, [david, kevin]);
  const badges = hikerBadges(david, { marks, register, today: "2026-11-20" });
  const get = (id) => badges.find((b) => b.id === id);
  assert.deepEqual([get("miles-10").earned, get("miles-10").earnedOn], [true, "2026-11-02"]);
  assert.deepEqual([get("miles-100").earned, get("miles-100").earnedOn], [true, "2026-11-18"]);
  assert.deepEqual([get("miles-200").earned, get("miles-200").earnedOn], [false, null]);
  assert.deepEqual([get("first-activity").earned, get("first-activity").earnedOn], [true, "2026-11-01"]);
  assert.deepEqual([get("first-wildlife").earned, get("first-wildlife").earnedOn], [true, "2026-11-03"]);
  assert.deepEqual([get("landmark-reached").earned, get("landmark-reached").earnedOn], [true, "2026-11-05"]);
  assert.deepEqual([get("milestone-participation").earned, get("milestone-participation").earnedOn], [true, "2026-11-15"]);
  assert.deepEqual([get("rhythm-3").earned, get("rhythm-3").earnedOn], [true, "2026-11-04"]);
  assert.equal(get("rhythm-7").earned, false);

  const kb = hikerBadges(kevin, { marks, register, today: "2026-11-20" });
  assert.deepEqual(kb.filter((b) => b.earned).map((b) => b.id), ["first-activity", "milestone-participation"]);
  assert.equal(new Set(badges.map((b) => b.id)).size, badges.length);
});

test("a fresh hiker has every badge still to earn", () => {
  const fresh = { id: "h-new", name: "Sarah", totalMiles: 0, activityCount: 0, activeDates: [] };
  assert.ok(hikerBadges(fresh, { today: "2026-11-20" }).every((b) => !b.earned && b.earnedOn === null));
  assert.deepEqual(nextMileBadge(fresh), { ...MILE_BADGES[0], remaining: 10, percent: 0 });
});

test("next mileage badge and the hiker's timeline", () => {
  assert.equal(nextMileBadge(david).title, "Wagon Scout");
  assert.equal(nextMileBadge(david).remaining, 79.5);
  assert.equal(nextMileBadge({ totalMiles: 1200 }), null);
  const register = trailRegister(TRAIL, "nobo", marks, [david, kevin]);
  const timeline = hikerTimeline(hikerBadges(david, { marks, register, today: "2026-11-20" }), hikerMilestones(david, register));
  assert.deepEqual(timeline.map((t) => t.date), [...timeline.map((t) => t.date)].sort());
  assert.equal(timeline[0].text, "Earned First Activity Logged");
  assert.ok(timeline.some((t) => t.text === "Carried the expedition to Neel Gap"));
});

test("every badge has 12x12 pixel art", async () => {
  const { SPRITES } = await import("../../assets/js/at/ui/badge-art.js");
  const badges = hikerBadges(david, { marks, register: trailRegister(TRAIL, "nobo", marks, [david, kevin]), today: "2026-11-21" });
  badges.forEach((b) => assert.ok(SPRITES[b.art], `${b.id} has art "${b.art}"`));
  Object.entries(SPRITES).forEach(([name, rows]) => {
    assert.equal(rows.length, 12, `${name} has 12 rows`);
    rows.forEach((row) => assert.equal(row.length, 12, `${name} rows are 12 wide`));
  });
});

test("locked badges are silhouettes; their names and descriptions stay hidden until earned", async () => {
  const { readFileSync } = await import("node:fs");
  const views = readFileSync("assets/js/at/ui/views.js", "utf8");
  const art = readFileSync("assets/js/at/ui/badge-art.js", "utf8");
  assert.match(views, /h\("li", \{ class: "badge locked" \}, badgeArt\(b\.art, \{ earned: false \}\), h\("strong", \{\}, "Locked"\)/);
  assert.doesNotMatch(views, /: b\.description\)/, "no description for locked badges");
  assert.doesNotMatch(views, /to the \$\{next\.title\} badge/, "the next badge's name stays a surprise");
  assert.match(art, /pixels\(rows, earned \? null : "#[0-9a-f]{6}"\)/, "locked art is a one-colour silhouette");
});

test("the mileage bar measures from the last mileage badge to the next", () => {
  assert.equal(nextMileBadge({ totalMiles: 5 }).percent, 50);
  const after = nextMileBadge({ totalMiles: MILE_BADGES[0].miles });
  assert.equal(after.id, MILE_BADGES[1].id);
  assert.equal(after.percent, 0, "a new mileage badge starts the next bar from empty");
});

test("badge collection counts exactly the achievement and species badges shown at Camp", () => {
  const badges = [{ earned: true }, { earned: false }, { earned: true }, { earned: false }];
  const sightings = [{ hikerId: "h1", species: "deer", habitat: "blue-ridge", firstSeen: "2026-11-03", sightings: 3 },
    { hikerId: "h1", species: "bigfoot", habitat: "blue-ridge", firstSeen: "2026-11-04", sightings: 1 }];
  const species = speciesBadges(sightings, { hikerId: "h1" });
  const regular = species.filter((b) => !b.bonus).length;
  const all = badgeCollection(badges, species);
  assert.deepEqual(all.badges, { earned: 2, total: 4 });
  assert.deepEqual(all.species, { earned: 1, total: regular });
  assert.equal(all.legends, 1, "legends are a bonus outside the total");
  assert.equal(all.earned, 3);
  assert.equal(all.total, 4 + regular);
  assert.equal(all.percent, Math.floor((3 / (4 + regular)) * 100));
  assert.deepEqual(badgeCollection([], []), { earned: 0, total: 0, percent: 0, badges: { earned: 0, total: 0 }, species: { earned: 0, total: 0 }, legends: 0 });
  const done = badgeCollection(badges.map(() => ({ earned: true })), species.filter((b) => !b.bonus).map((b) => ({ ...b, earned: true })));
  assert.equal(done.percent, 100, "a full collection is reachable without the legends");
});

test("a hiker's timeline groups same-day species badges into one line", () => {
  const sightings = [{ hikerId: "h-david", species: "elk", habitat: "blue-ridge", firstSeen: "2026-11-03", sightings: 1 },
    { hikerId: "h-david", species: "bear", habitat: "blue-ridge", firstSeen: "2026-11-03", sightings: 2 }];
  const register = trailRegister(TRAIL, "nobo", marks, [david, kevin]);
  const timeline = hikerTimeline(hikerBadges(david, { marks, register, today: "2026-11-20", sightings }), hikerMilestones(david, register),
    speciesBadges(sightings, { hikerId: "h-david" }));
  const lines = timeline.filter((t) => t.kind === "species");
  assert.deepEqual(lines.map((t) => t.text), ["Species badges: Black Bear and Elk"]);
  assert.deepEqual(timeline.map((t) => t.date), [...timeline.map((t) => t.date)].sort());
});
