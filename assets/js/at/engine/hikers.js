// Hikers: the expedition's official roster (David, Kevin, ...) and everything personal about each one:
// miles contributed, badges, milestones and a dated progression. Pure functions, no DOM, no network.
//
// Inputs come from two server-side aggregates (supabase/migrations/20261104000000_at_hikers.sql):
//   hikers: at_expedition_hikers() rows -> { id, name, totalMiles, weekMiles, activityCount,
//           firstActivityDate, lastActivityDate, activeDates, wildlifeRuns, wildlifeScore, firstSpottedOn }
//   marks:  at_expedition_marks() rows  -> { kind: "group" | "personal", mark, hikerId, reachedOn }
// Badges are never taken away: every rule below only ever looks at totals that can grow, or at dates
// that are already in the past.

import { GROUP_MILESTONES, RHYTHM_BADGES, computeRhythm } from "./game.js";
import { landmarksInOrder, round2 } from "./progress.js";
import { wildlifeBadges } from "./field-guide.js";

// Miles each hiker has personally contributed. `art` names a sprite in ui/badge-art.js.
export const MILE_BADGES = Object.freeze([
  { id: "miles-10", title: "First Steps", miles: 10, art: "boots" },
  { id: "miles-50", title: "Trail Walker", miles: 50, art: "blaze" },
  { id: "miles-100", title: "Pathfinder", miles: 100, art: "compass" },
  { id: "miles-200", title: "Wagon Scout", miles: 200, art: "wagon" },
  { id: "miles-500", title: "Frontier Traveler", miles: 500, art: "oxen" },
  { id: "miles-1000", title: "Katahdin Bound", miles: 1000, art: "mountain" }
]);

const RHYTHM_ART = Object.freeze({ "rhythm-3": "sapling", "rhythm-7": "pine", "rhythm-14": "forest" });

export const PERSONAL_MARKS = Object.freeze(MILE_BADGES.map((b) => b.miles));

const key = (miles) => String(round2(Number(miles) || 0));

// Every mark the whole expedition can pass, in trail order: landmarks (not the start) and the
// cooperative group milestones. Sent to at_expedition_marks so the server can say who carried the
// expedition across each one, and when.
export function groupMarks(trail, direction) {
  const landmarks = landmarksInOrder(trail, direction)
    .filter((l) => l.distance > 0)
    .map((l) => ({ id: `landmark-${l.id}`, kind: "landmark", title: l.name, miles: round2(l.distance) }));
  const milestones = GROUP_MILESTONES.map((m) => ({
    id: m.id, kind: "milestone", title: m.title, miles: round2(m.fractionOfTrail ? trail.totalMiles * m.fractionOfTrail : m.miles)
  }));
  return [...landmarks, ...milestones].sort((a, b) => a.miles - b.miles);
}

export function expeditionTotals(hikers = []) {
  const sum = (field) => round2(hikers.reduce((total, hiker) => total + (Number(hiker[field]) || 0), 0));
  return {
    totalMiles: sum("totalMiles"),
    weekMiles: sum("weekMiles"),
    activityCount: hikers.reduce((n, hiker) => n + (Number(hiker.activityCount) || 0), 0),
    wildlifeScore: hikers.reduce((n, hiker) => n + (Number(hiker.wildlifeScore) || 0), 0),
    hikerCount: hikers.length
  };
}

// Whole-number share of the expedition's miles (0 when nobody has moved yet).
export function hikerShare(hiker, totals) {
  return totals.totalMiles > 0 ? Math.round(((Number(hiker.totalMiles) || 0) / totals.totalMiles) * 100) : 0;
}

// The date a forgiving rhythm (at most one rest day between active days) first reached `days`.
export function rhythmReachedOn(activeDates, days) {
  const dates = [...new Set(activeDates || [])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  let run = 0;
  for (let i = 0; i < dates.length; i += 1) {
    const gap = i ? (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000 : Infinity;
    run = gap <= 2 ? run + 1 : 1;
    if (run >= days) return dates[i];
  }
  return null;
}

// The trail register: every group mark the expedition has passed, who carried it there and when.
export function trailRegister(trail, direction, marks = [], hikers = []) {
  const reached = new Map(marks.filter((m) => m.kind === "group").map((m) => [key(m.mark), m]));
  const names = new Map(hikers.map((h) => [h.id, h.name]));
  return groupMarks(trail, direction)
    .filter((m) => reached.has(key(m.miles)))
    .map((m) => {
      const hit = reached.get(key(m.miles));
      return { ...m, reachedOn: hit.reachedOn || null, hikerId: hit.hikerId || null, hikerName: names.get(hit.hikerId) || null };
    });
}

// Group marks this hiker carried the expedition across, plus group milestones they were part of
// (they had logged at least one activity on or before the day it was reached).
export function hikerMilestones(hiker, register = []) {
  const carried = register.filter((r) => r.hikerId === hiker.id);
  const joined = register.filter((r) => r.kind === "milestone" && hiker.firstActivityDate && r.reachedOn && hiker.firstActivityDate <= r.reachedOn);
  return {
    landmarks: carried.filter((r) => r.kind === "landmark").map((r) => ({ id: r.id, title: r.title, miles: r.miles, reachedOn: r.reachedOn })),
    groupMilestones: joined.map((r) => ({ id: r.id, title: r.title, miles: r.miles, reachedOn: r.reachedOn, carried: r.hikerId === hiker.id }))
  };
}

// Every badge a hiker can earn, earned or not, with the date it was earned when known.
// `sightings` are at_field_guide() rows (all hikers; this hiker's are picked out) for the wildlife badges.
export function hikerBadges(hiker, { marks = [], register = [], today, sightings = [] } = {}) {
  const personal = new Map(marks.filter((m) => m.kind === "personal" && m.hikerId === hiker.id).map((m) => [key(m.mark), m.reachedOn]));
  const total = Number(hiker.totalMiles) || 0;
  const milestones = hikerMilestones(hiker, register);
  const firstOf = (list) => list.map((r) => r.reachedOn).filter(Boolean).sort()[0] || null;
  const rhythm = computeRhythm(hiker.activeDates || [], today || "9999-12-31");
  const badges = MILE_BADGES.map((b) => ({
    id: b.id, kind: "miles", art: b.art, title: b.title,
    description: `Contribute ${b.miles} trail miles to the expedition.`,
    earned: total >= b.miles, earnedOn: total >= b.miles ? personal.get(key(b.miles)) || null : null
  }));
  badges.push(
    { id: "first-activity", kind: "first", art: "campfire", title: "First Activity Logged", description: "Log a first activity for the expedition.",
      earned: (Number(hiker.activityCount) || 0) > 0, earnedOn: hiker.firstActivityDate || null },
    { id: "first-wildlife", kind: "first", art: "bear", title: "First Wildlife Discovery", description: "Spot your first animal in Wildlife Spotting.",
      earned: Boolean(hiker.firstSpottedOn), earnedOn: hiker.firstSpottedOn || null },
    { id: "landmark-reached", kind: "landmark", art: "flag", title: "Landmark Reached", description: "Your miles carry the expedition past a trail landmark.",
      earned: milestones.landmarks.length > 0, earnedOn: firstOf(milestones.landmarks) },
    { id: "milestone-participation", kind: "milestone", art: "wheel", title: "Milestone Participation", description: "Be on the trail when the expedition reaches a group milestone.",
      earned: milestones.groupMilestones.length > 0, earnedOn: firstOf(milestones.groupMilestones) });
  RHYTHM_BADGES.forEach((b) => {
    const earned = rhythm.longest >= b.days;
    badges.push({ id: b.id, kind: "rhythm", art: RHYTHM_ART[b.id], title: b.title,
      description: `${b.days} active days with no more than one rest day between them.`,
      earned, earnedOn: earned ? rhythmReachedOn(hiker.activeDates, b.days) : null });
  });
  badges.push(...wildlifeBadges(sightings.filter((r) => r.hikerId === hiker.id)));
  return badges;
}

// The next mileage badge a hiker is walking toward (null once they have them all).
export function nextMileBadge(hiker) {
  const total = Number(hiker.totalMiles) || 0;
  const next = MILE_BADGES.find((b) => total < b.miles);
  return next ? { ...next, remaining: round2(next.miles - total), percent: Math.floor((total / next.miles) * 100) } : null;
}

// A hiker's story so far, oldest first: badges earned and landmarks they carried the expedition past.
export function hikerTimeline(badges, milestones) {
  const items = [
    ...badges.filter((b) => b.earned && b.earnedOn).map((b) => ({ date: b.earnedOn, kind: "badge", id: b.id, art: b.art, text: `Earned ${b.title}` })),
    ...milestones.landmarks.filter((l) => l.reachedOn).map((l) => ({ date: l.reachedOn, kind: "landmark", id: l.id, art: "flag", text: `Carried the expedition to ${l.title}` }))
  ];
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.text.localeCompare(b.text)));
}
