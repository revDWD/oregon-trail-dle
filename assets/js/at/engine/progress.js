// Pure trail progress engine. Works for any trail object shaped like APPALACHIAN_TRAIL.
// No DOM, no network, no dates: given credited miles it derives everything else.

export const DIRECTIONS = Object.freeze(["nobo", "sobo"]);

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeDirection(trail, direction) {
  if (direction === undefined || direction === null) return trail.defaultDirection;
  if (!DIRECTIONS.includes(direction)) throw new RangeError(`Unknown direction: ${direction}`);
  return direction;
}

// Credited miles must be a finite, non-negative number; anything else counts as 0.
export function sanitizeMiles(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Distance a traveller has to walk from their starting terminus to reach a mile marker.
export function distanceFromStart(trail, marker, direction) {
  return direction === "sobo" ? round2(trail.totalMiles - marker) : marker;
}

// Inverse of distanceFromStart (the two are the same mirror operation).
export function markerAt(trail, distance, direction) {
  return distanceFromStart(trail, distance, direction);
}

export function landmarksInOrder(trail, direction) {
  const dir = normalizeDirection(trail, direction);
  return trail.landmarks
    .map((landmark) => ({ ...landmark, distance: distanceFromStart(trail, landmark.miles, dir) }))
    .sort((a, b) => a.distance - b.distance);
}

// Interpolated [lat, lon] for a northbound mile marker, along the route polyline.
export function coordinatesAtMarker(trail, marker) {
  const route = trail.route;
  const clamped = Math.min(Math.max(marker, route[0].miles), route[route.length - 1].miles);
  let index = route.findIndex((point) => point.miles >= clamped);
  if (index <= 0) index = 1;
  const from = route[index - 1];
  const to = route[index];
  const span = to.miles - from.miles;
  const t = span === 0 ? 0 : (clamped - from.miles) / span;
  return { lat: from.lat + (to.lat - from.lat) * t, lon: from.lon + (to.lon - from.lon) * t };
}

export function computeProgress(trail, creditedMiles, direction) {
  const dir = normalizeDirection(trail, direction);
  const total = trail.totalMiles;
  const credited = round2(sanitizeMiles(creditedMiles));
  const distance = Math.min(credited, total);
  const completed = credited >= total;
  const ordered = landmarksInOrder(trail, dir).map((landmark) => ({ ...landmark, passed: landmark.distance <= distance }));
  const passed = ordered.filter((landmark) => landmark.passed);
  const next = ordered.find((landmark) => !landmark.passed) || null;
  const marker = markerAt(trail, distance, dir);
  return {
    direction: dir,
    totalMiles: total,
    creditedMiles: credited,
    distanceMiles: distance,
    // Floor, not round, so "100%" only ever appears when the trail is actually finished.
    percent: completed ? 100 : Math.floor((distance / total) * 1000) / 10,
    remainingMiles: round2(total - distance),
    completed,
    // Credited miles beyond the end of the trail (a finisher can keep logging).
    bonusMiles: completed ? round2(credited - total) : 0,
    position: { marker, ...coordinatesAtMarker(trail, marker) },
    landmarks: ordered,
    passedLandmarks: passed,
    lastLandmark: passed.length ? passed[passed.length - 1] : null,
    nextLandmark: next,
    distanceToNext: next ? round2(next.distance - distance) : 0
  };
}

export function milestoneMiles(trail, milestone) {
  return round2(milestone.miles !== undefined ? milestone.miles : milestone.fraction * trail.totalMiles);
}

export function milestonesReached(trail, creditedMiles) {
  const credited = sanitizeMiles(creditedMiles);
  return trail.milestones.map((milestone) => {
    const miles = milestoneMiles(trail, milestone);
    return { ...milestone, targetMiles: miles, reached: credited >= miles };
  });
}

// Structural checks used by tests (and handy when editing trail data by hand).
export function validateTrail(trail) {
  const problems = [];
  const ids = new Set();
  if (!(trail.totalMiles > 0)) problems.push("totalMiles must be positive");
  trail.landmarks.forEach((landmark, index) => {
    if (ids.has(landmark.id)) problems.push(`duplicate landmark id ${landmark.id}`);
    ids.add(landmark.id);
    if (!(landmark.miles >= 0 && landmark.miles <= trail.totalMiles)) problems.push(`${landmark.id} miles out of range`);
    if (index > 0 && landmark.miles <= trail.landmarks[index - 1].miles) problems.push(`${landmark.id} is not in increasing order`);
    if (!(landmark.lat >= -90 && landmark.lat <= 90 && landmark.lon >= -180 && landmark.lon <= 180)) problems.push(`${landmark.id} coordinates invalid`);
    if (!landmark.name || !landmark.trivia) problems.push(`${landmark.id} needs a name and trivia`);
  });
  if (trail.landmarks[0].miles !== 0) problems.push("first landmark must be at mile 0");
  if (trail.landmarks[trail.landmarks.length - 1].miles !== trail.totalMiles) problems.push("last landmark must be at totalMiles");
  trail.route.forEach((point, index) => {
    if (index > 0 && point.miles < trail.route[index - 1].miles) problems.push(`route point ${index} is out of order`);
  });
  const milestoneIds = new Set();
  trail.milestones.forEach((milestone) => {
    if (milestoneIds.has(milestone.id)) problems.push(`duplicate milestone ${milestone.id}`);
    milestoneIds.add(milestone.id);
    if ((milestone.miles === undefined) === (milestone.fraction === undefined)) problems.push(`${milestone.id} needs exactly one of miles/fraction`);
  });
  return problems;
}
