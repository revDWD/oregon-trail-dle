// Landmark patches: a collectible patch for every landmark, earned when a hiker's own logged miles
// reach it. Pure functions, no DOM, no network.
//
// Nothing is stored. Like mileage badges, a patch is earned while the hiker's total covers the
// landmark's distance, and its date comes from the server's personal marks (at_expedition_marks):
// the day that hiker's cumulative miles first crossed it. The start (mile 0) is earned with a first
// activity. Patches therefore follow every device and reset with the expedition, like the trail.

import { landmarksInOrder, regionAtMarker, round2 } from "./progress.js";
import { landmarkStory } from "../trail/landmark-stories.js";
import { LANDMARK_PATCHES, NPS_TRAIL, PATCH_STORE, TRAIL_HOME } from "../trail/landmark-patches.js";

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
export const RESOURCE_KINDS = Object.freeze({ official: "Official site", learn: "Learn more", patch: "Patch information" });

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

// Distances the server should date for each hiker (every landmark after the start).
export function patchMarks(trail, direction) {
  return landmarksInOrder(trail, direction).filter((l) => l.distance > 0).map((l) => round2(l.distance));
}

// "Related Resources": the patch's own links, the landmark story's official page, then the
// Appalachian Trail Conservancy store. Falls back to the trail-wide pages. https only, no duplicates.
export function patchResources(landmarkId, entry = LANDMARK_PATCHES[landmarkId]) {
  const story = landmarkStory(landmarkId);
  const own = [...((entry && entry.resources) || [])];
  if (story && story.learnMore) own.push({ ...story.learnMore, kind: "learn" });
  const list = own.length ? [...own, PATCH_STORE] : [NPS_TRAIL, TRAIL_HOME, PATCH_STORE];
  const seen = new Set();
  return list
    .filter((r) => r && typeof r.url === "string" && r.url.startsWith("https://") && !seen.has(r.url) && seen.add(r.url))
    .map((r) => ({ label: r.label, url: r.url, kind: RESOURCE_KINDS[r.kind] ? r.kind : "learn", kindLabel: RESOURCE_KINDS[r.kind] || RESOURCE_KINDS.learn }));
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
    region: region ? { id: region.id, name: region.name, color: region.color } : null,
    shape: PATCH_SHAPES.includes(entry.shape) ? entry.shape : "circle",
    motif: entry.motif || landmark.id,
    banner: String(entry.banner || landmark.name).toUpperCase(),
    description: entry.description || `You've reached ${landmark.name}${landmark.state ? `, ${states.map(stateName).join(" / ")}` : ""}.`,
    resources: patchResources(landmark.id, entry)
  };
}

// Every patch on the trail, in trail order, with this hiker's progress toward it.
// `marks` are at_expedition_marks() rows (all hikers; this hiker's personal ones are picked out).
export function landmarkPatches(trail, direction, hiker = null, marks = []) {
  const personal = new Map((marks || [])
    .filter((m) => hiker && m.kind === "personal" && m.hikerId === hiker.id)
    .map((m) => [key(m.mark), m.reachedOn]));
  const total = hiker ? Number(hiker.totalMiles) || 0 : 0;
  const started = hiker ? (Number(hiker.activityCount) || 0) > 0 || total > 0 : false;
  return landmarksInOrder(trail, direction).map((landmark) => {
    const patch = patchFor(landmark, trail);
    const earned = Boolean(hiker) && (patch.distance > 0 ? total >= patch.distance : started);
    const earnedOn = !earned ? null : patch.distance > 0 ? personal.get(key(patch.distance)) || null : hiker.firstActivityDate || null;
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

// Collector statistics for one hiker's patches.
export function patchCollection(patches = [], hiker = null) {
  const total = patches.length;
  const earnedCount = patches.filter((p) => p.earned).length;
  const nextPatch = patches.find((p) => !p.earned) || null;
  const totalMiles = hiker ? Number(hiker.totalMiles) || 0 : 0;
  const states = [];
  const byState = new Map();
  patches.forEach((p) => p.states.forEach((code) => {
    if (!byState.has(code)) { byState.set(code, { code, name: stateName(code), earned: 0, total: 0 }); states.push(code); }
    const s = byState.get(code);
    s.total += 1;
    if (p.earned) s.earned += 1;
  }));
  const stateProgress = states.map((code) => {
    const s = byState.get(code);
    return { ...s, percent: Math.floor((s.earned / s.total) * 100), complete: s.earned === s.total };
  });
  return {
    earned: earnedCount,
    total,
    percent: total ? Math.floor((earnedCount / total) * 100) : 0,
    nearest: nextPatch ? { ...nextPatch, milesAway: round2(Math.max(nextPatch.distance - totalMiles, 0)) } : null,
    nextState: stateProgress.find((s) => !s.complete) || null,
    stateProgress,
    milestones: patchMilestones(patches)
  };
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

// Ids of everything earned in the collection (patches and collection milestones): used to spot new
// unlocks after an activity is logged.
export function earnedPatchIds(patches = []) {
  return [...patches.filter((p) => p.earned).map((p) => p.id), ...patchMilestones(patches).filter((m) => m.earned).map((m) => m.id)];
}
