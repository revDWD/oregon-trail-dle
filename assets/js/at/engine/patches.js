// Landmark patches: a collectible patch for every landmark, earned by the whole expedition when its
// shared miles reach the landmark. Pure functions, no DOM, no network.
//
// The expedition is collaborative, so there is one collection and every hiker shares it: when the
// group reaches a landmark, everyone owns that patch. Nothing is stored. A patch is earned while the
// expedition's credited miles cover the landmark's distance, and its date comes from the server's
// group marks (at_expedition_marks, already fetched for the trail register): the day the group's
// cumulative miles first crossed it. The start (mile 0) is earned with the expedition's first
// activity. Patches therefore follow every device and reset with the expedition, like the trail.

import { landmarksInOrder, regionAtMarker, round2 } from "./progress.js";
import { daysBetween, localDateString, parseDate } from "./activities.js";
import { DEFAULT_THEME, themeFor } from "./expedition-themes.js";
import { landmarkStory } from "../trail/landmark-stories.js";
import { LANDMARK_PATCHES, NPS_TRAIL, PATCH_STORE, STATE_EMBLEMS, TRAIL_HOME } from "../trail/landmark-patches.js";

export const STATE_NAMES = Object.freeze({
  GA: "Georgia", NC: "North Carolina", TN: "Tennessee", VA: "Virginia", WV: "West Virginia", MD: "Maryland",
  PA: "Pennsylvania", NJ: "New Jersey", NY: "New York", CT: "Connecticut", MA: "Massachusetts", VT: "Vermont",
  NH: "New Hampshire", ME: "Maine"
});

// Collection milestones: they supplement the achievement badges and never replace them. Counts above
// the number of patches on the trail are hidden; "All" always shows.
export const PATCH_MILESTONES = Object.freeze([
  { id: "patches-1", count: 1, title: "First Patch Earned" },
  { id: "patches-10", count: 10, title: "10 Patches Collected" },
  { id: "patches-25", count: 25, title: "25 Patches Collected" },
  { id: "patches-50", count: 50, title: "50 Patches Collected" },
  { id: "patches-100", count: 100, title: "100 Patches Collected" },
  { id: "patches-all", count: Infinity, title: "All Patches Collected" }
]);

export const PATCH_SORTS = Object.freeze({ trail: "Trail order", state: "State", earned: "Date earned" });
export const PATCH_SHAPES = Object.freeze(["circle", "shield", "hexagon"]);

// "Related Resources" kinds, best first: where a real patch or souvenir is most likely, down to the
// authoritative page for the landmark. Links are listed in this order.
export const RESOURCE_KINDS = Object.freeze({
  patch: "Official Patch",
  "park-store": "Park Store",
  "state-park-store": "State Park Store",
  "conservancy-store": "Conservancy Store",
  outfitter: "Trail Outfitter",
  "patch-shop": "Patch Shop",
  "trail-club": "Trail Club",
  "visitor-center": "Visitor Center",
  history: "History",
  official: "Official Site",
  learn: "Learn More"
});
const KIND_ORDER = Object.keys(RESOURCE_KINDS);

// What a resource offers, shown as small tags. Only set where the page itself shows it.
export const RESOURCE_OFFERS = Object.freeze({ patch: "Patch available", souvenir: "Souvenirs", visitor: "Visitor information", hiking: "Hiking information" });

const key = (miles) => String(round2(Number(miles) || 0));

export function patchId(landmarkId) {
  return `patch-${landmarkId}`;
}

export function stateCodes(state) {
  return String(state || "").split("/").map((s) => s.trim()).filter(Boolean);
}

export function stateName(code) {
  return STATE_NAMES[code] || code;
}

// "Related Resources": the patch's own links, the landmark story's official page, then the
// Appalachian Trail Conservancy store, ordered by RESOURCE_KINDS (patches and stores first). Falls
// back to the trail-wide pages. https only, no duplicates.
export function patchResources(landmarkId, entry = LANDMARK_PATCHES[landmarkId]) {
  const story = landmarkStory(landmarkId);
  const own = [...((entry && entry.resources) || [])];
  if (story && story.learnMore) own.push({ ...story.learnMore, kind: "learn" });
  const list = own.length ? [...own, PATCH_STORE] : [NPS_TRAIL, TRAIL_HOME, PATCH_STORE];
  const seen = new Set();
  return list
    .filter((r) => r && typeof r.url === "string" && r.url.startsWith("https://") && !seen.has(r.url) && seen.add(r.url))
    .map((r) => {
      const kind = RESOURCE_KINDS[r.kind] ? r.kind : "learn";
      const offers = (Array.isArray(r.offers) ? r.offers : []).filter((o) => RESOURCE_OFFERS[o]);
      return { label: r.label, url: r.url, kind, kindLabel: RESOURCE_KINDS[kind], offers, offerLabels: offers.map((o) => RESOURCE_OFFERS[o]) };
    })
    .map((r, i) => [r, i])
    .sort(([a, i], [b, j]) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || i - j)
    .map(([r]) => r);
}

// One patch for a landmark (with `distance` from landmarksInOrder), defaults filled in.
export function patchFor(landmark, trail) {
  const entry = LANDMARK_PATCHES[landmark.id] || {};
  const region = trail ? regionAtMarker(trail, landmark.miles) : null;
  const states = stateCodes(landmark.state);
  return {
    id: patchId(landmark.id),
    landmarkId: landmark.id,
    name: `${landmark.name} Patch`,
    landmarkName: landmark.name,
    state: landmark.state || "",
    states,
    stateNames: states.map(stateName),
    mile: landmark.miles,
    distance: round2(Number(landmark.distance ?? landmark.miles) || 0),
    kind: landmark.kind,
    elevationFt: Number(landmark.elevationFt) || null,
    trivia: landmark.trivia || "",
    since: entry.since && Number(entry.since.year) ? { year: Number(entry.since.year), note: entry.since.note || "" } : null,
    region: region ? { id: region.id, name: region.name, color: region.color, scene: region.scene } : null,
    shape: PATCH_SHAPES.includes(entry.shape) ? entry.shape : "circle",
    motif: entry.motif || landmark.id,
    banner: String(entry.banner || landmark.name).toUpperCase(),
    description: entry.description || `You've reached ${landmark.name}${landmark.state ? `, ${states.map(stateName).join(" / ")}` : ""}.`,
    resources: patchResources(landmark.id, entry)
  };
}

// The expedition as the patch engine sees it: shared miles, activity count and the day it set out
// (the earliest first activity on the roster). `totals` (expeditionTotals) wins when given, so the
// collection always matches the trail progress shown on the page.
export function expeditionSummary(hikers = [], totals = null) {
  const roster = hikers || [];
  const sum = (field) => round2(roster.reduce((n, x) => n + (Number(x[field]) || 0), 0));
  const firsts = roster.map((x) => x.firstActivityDate).filter(Boolean).sort();
  return {
    totalMiles: totals ? Number(totals.totalMiles) || 0 : sum("totalMiles"),
    activityCount: totals ? Number(totals.activityCount) || 0 : sum("activityCount"),
    firstActivityDate: firsts[0] || null
  };
}

// Every patch on the trail, in trail order, with the expedition's progress toward it.
// `expedition` is expeditionSummary(); the group rows of at_expedition_marks() date each patch.
export function landmarkPatches(trail, direction, expedition = null, marks = []) {
  const group = new Map((marks || []).filter((m) => m.kind === "group").map((m) => [key(m.mark), m.reachedOn]));
  const total = expedition ? Number(expedition.totalMiles) || 0 : 0;
  const started = expedition ? (Number(expedition.activityCount) || 0) > 0 || total > 0 : false;
  return landmarksInOrder(trail, direction).map((landmark) => {
    const patch = patchFor(landmark, trail);
    const earned = patch.distance > 0 ? total >= patch.distance : started;
    const earnedOn = !earned ? null : patch.distance > 0 ? group.get(key(patch.distance)) || null : expedition.firstActivityDate || null;
    return { ...patch, earned, earnedOn, milesToGo: earned ? 0 : round2(Math.max(patch.distance - total, 0)) };
  });
}

// Milestones that make sense for this many patches, each with when it was earned (the date of the
// nth patch, when known).
export function patchMilestones(patches = []) {
  const total = patches.length;
  const earned = patches.filter((p) => p.earned);
  const dates = earned.map((p) => p.earnedOn).filter(Boolean).sort();
  return PATCH_MILESTONES
    .filter((m) => m.count === Infinity || m.count < total)
    .map((m) => {
      const need = m.count === Infinity ? total : m.count;
      const done = total > 0 && earned.length >= need;
      return { id: m.id, title: m.title, count: need, earned: done, earnedOn: done && dates.length >= need ? dates[need - 1] : null };
    });
}

// Each state's collection, in trail order: progress, and its State Explorer patch, earned once every
// landmark in the state is reached (dated by the last of them, when known). A landmark on a border
// counts for both states. States the trail crosses without a landmark have no collection.
export function explorerId(code) {
  return `explorer-${code}`;
}

export function stateCollections(patches = []) {
  const order = [];
  const byState = new Map();
  patches.forEach((p) => p.states.forEach((code) => {
    if (!byState.has(code)) { byState.set(code, []); order.push(code); }
    byState.get(code).push(p);
  }));
  return order.map((code) => {
    const list = byState.get(code);
    const earned = list.filter((p) => p.earned).length;
    const complete = earned === list.length;
    const dates = list.map((p) => p.earnedOn);
    const name = stateName(code);
    const emblem = list.find((p) => p.landmarkId === STATE_EMBLEMS[code]) || list[list.length - 1];
    return {
      code, name, earned, total: list.length, percent: Math.floor((earned / list.length) * 100), complete,
      patches: list,
      explorer: {
        id: explorerId(code), code, name: `${name} Explorer`, stateName: name, earned: complete,
        earnedOn: complete && dates.every(Boolean) ? [...dates].sort()[dates.length - 1] : null,
        motif: emblem.motif, color: emblem.region ? emblem.region.color : null, landmarks: list.length
      }
    };
  });
}

// Collector statistics for the expedition's shared collection.
export function patchCollection(patches = [], expedition = null) {
  const total = patches.length;
  const earnedCount = patches.filter((p) => p.earned).length;
  const nextPatch = patches.find((p) => !p.earned) || null;
  const totalMiles = expedition ? Number(expedition.totalMiles) || 0 : 0;
  const stateProgress = stateCollections(patches);
  return {
    earned: earnedCount,
    total,
    percent: total ? Math.floor((earnedCount / total) * 100) : 0,
    nearest: nextPatch ? { ...nextPatch, milesAway: round2(Math.max(nextPatch.distance - totalMiles, 0)) } : null,
    nextState: stateProgress.find((s) => !s.complete) || null,
    stateProgress,
    explorers: stateProgress.map((s) => s.explorer),
    milestones: patchMilestones(patches)
  };
}

// A gentle forecast from the expedition's average weekly miles since it set out (at least one week,
// so a big first day doesn't skew it). Null until there is a pace to go on.
export function patchForecast(patches = [], expedition = null, today = localDateString()) {
  if (!expedition || !expedition.firstActivityDate || !parseDate(expedition.firstActivityDate) || !parseDate(today)) return null;
  const total = Number(expedition.totalMiles) || 0;
  const weeks = Math.max(daysBetween(expedition.firstActivityDate, today) / 7, 1);
  const weekly = round2(total / weeks);
  if (!(weekly > 0)) return null;
  const left = patches.filter((p) => !p.earned);
  const weeksTo = (p) => Math.max(Math.ceil((p.distance - total) / weekly), 1);
  const dateIn = (w) => {
    const d = parseDate(today);
    d.setUTCDate(d.getUTCDate() + w * 7);
    return d.toISOString().slice(0, 10);
  };
  const next = left[0] || null;
  const last = left[left.length - 1] || null;
  return {
    weeklyMiles: weekly,
    next: next ? { patch: next, weeks: weeksTo(next), date: dateIn(weeksTo(next)) } : null,
    complete: last ? { patch: last, weeks: weeksTo(last), date: dateIn(weeksTo(last)) } : null
  };
}

// Wildlife hikers are likely to meet near a landmark: the most common species in its region's
// habitat (rare and legendary finds stay a surprise).
export function nearbyWildlife(patch, count = 4) {
  const theme = themeFor(DEFAULT_THEME);
  const habitat = patch && patch.region && theme.habitats[patch.region.scene];
  if (!habitat) return [];
  const byId = new Map(theme.species.map((sp, i) => [sp.id, { sp, i }]));
  return Object.entries(habitat.animals)
    .map(([id, weight]) => ({ ...byId.get(id), weight }))
    .filter((x) => x.sp && x.sp.rarity === "common")
    .sort((a, b) => b.weight - a.weight || a.i - b.i)
    .slice(0, count)
    .map((x) => ({ id: x.sp.id, name: x.sp.name }));
}

// Sort a copy of the patches: trail order (as given), by state (trail order within a state), or by
// date earned (newest first, then undated earned patches, then locked ones in trail order).
export function sortPatches(patches = [], by = "trail") {
  const order = new Map(patches.map((p, i) => [p.id, i]));
  const trail = (a, b) => order.get(a.id) - order.get(b.id);
  const list = [...patches];
  if (by === "state") {
    return list.sort((a, b) => (a.stateNames[0] || "").localeCompare(b.stateNames[0] || "") || trail(a, b));
  }
  if (by === "earned") {
    const rank = (p) => (p.earned && p.earnedOn ? 0 : p.earned ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 && a.earnedOn !== b.earnedOn ? (a.earnedOn < b.earnedOn ? 1 : -1) : 0) || trail(a, b));
  }
  return list.sort(trail);
}

// Patches grouped under their first state, alphabetically (for the "State" sort).
export function groupPatchesByState(patches = []) {
  const groups = new Map();
  sortPatches(patches, "state").forEach((p) => {
    const name = p.stateNames[0] || "Other";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(p);
  });
  return [...groups].map(([state, list]) => ({ state, patches: list }));
}

// Ids of everything earned in the collection (patches, State Explorer patches and collection
// milestones): used to spot new unlocks after an activity is logged.
export function earnedPatchIds(patches = []) {
  return [
    ...patches.filter((p) => p.earned).map((p) => p.id),
    ...stateCollections(patches).filter((s) => s.complete).map((s) => s.explorer.id),
    ...patchMilestones(patches).filter((m) => m.earned).map((m) => m.id)
  ];
}
