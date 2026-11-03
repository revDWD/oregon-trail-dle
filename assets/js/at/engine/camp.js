// Camp: pure helpers that turn crew progress into a living camp scene. No DOM, no network.
// Everything is deterministic (same inputs, same camp) so every crew member sees the same weather.

import { regionAtMarker } from "./progress.js";

export const CAMP_TIMES = Object.freeze(["dawn", "day", "dusk", "night"]);
export const CAMP_TIME_LABELS = Object.freeze({ dawn: "Morning", day: "Day", dusk: "Evening", night: "Night" });

export const WEATHER = Object.freeze({
  clear: { label: "Clear skies", text: "Clear skies over the shelter." },
  breezy: { label: "Breezy", text: "A cool breeze moves through the trees." },
  fog: { label: "Fog", text: "Fog drifts low through the ridges." },
  rain: { label: "Rain", text: "Rain patters on the shelter roof. A good day for dry socks." },
  storm: { label: "Thunderstorms nearby", text: "Thunder rumbles far off. The hikers wait it out under the roof." },
  snow: { label: "Snow flurries", text: "Snowflakes drift down over the high ridges." }
});

const HIGH_SCENES = new Set(["high-balds", "alpine", "north-woods"]);

// FNV-1a: tiny stable hash for deterministic picks.
export function hashString(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// Camp follows the device clock: morning 5-9, day 9-17, evening 17-21, night 21-5.
export function timeOfDay(hour) {
  const h = ((Math.trunc(Number(hour)) % 24) + 24) % 24;
  if (h >= 21 || h < 5) return "night";
  if (h >= 17) return "dusk";
  if (h < 9) return "dawn";
  return "day";
}

// Same answer for the whole crew on a given day; snow only in cold months on high ground,
// thunderstorms only in warm months.
export function weatherFor(dateString, scene) {
  const month = Number(String(dateString).slice(5, 7)) || 1;
  const pool = ["clear", "clear", "clear", "breezy", "breezy", "fog", "rain", "rain"];
  if (month >= 5 && month <= 9) pool.push("storm");
  if (HIGH_SCENES.has(scene) && (month <= 3 || month >= 11)) pool.push("snow", "snow");
  const id = pool[hashString(`${dateString}|${scene}`) % pool.length];
  return { id, ...WEATHER[id] };
}

// How busy the camp looks. Grows with the crew's miles and size, always capped.
export function campScale(groupMiles, people = 1) {
  const miles = Math.max(Number(groupMiles) || 0, 0);
  const hikers = Math.min(Math.max(Number(people) || 0, 1), 10);
  return {
    tents: Math.min(1 + Math.floor(miles / 200), 8),
    hikers,
    fire: miles < 250 ? 1 : miles < 1000 ? 2 : 3,
    bearBags: Math.min(hikers, 6), // one bear bag hung per hiker at camp
    lanterns: Math.min(Math.floor(miles / 500), 4),
    stage: miles < 700 ? "early" : miles < 1500 ? "middle" : "late"
  };
}

// A recently passed landmark worth celebrating (within `withinMiles` of travel).
export function celebrationAt(progress, withinMiles = 40) {
  const last = progress.lastLandmark;
  if (!last || last.distance === 0) return null;
  return progress.distanceMiles - last.distance <= withinMiles ? { id: last.id, name: last.name, miles: last.distance } : null;
}

const POSES = ["sit", "stretch", "cook", "read", "wave"];

// Campers: the expedition's hikers, each with a stable look and a pose. `selected` marks the hiker
// whose page is open. `recent` = moved in the last two days (they get to arrive at camp).
export function campPeople(board, { selectedId = null, today = null, limit = 10 } = {}) {
  return [...(board || [])]
    .sort((a, b) => b.totalCreditedMiles - a.totalCreditedMiles || String(a.displayName).localeCompare(String(b.displayName)))
    .slice(0, limit)
    .map((row, index) => {
      const seed = hashString(row.userId || row.displayName);
      const recent = Boolean(today && row.lastActivityDate && daysApart(row.lastActivityDate, today) <= 2);
      return {
        id: row.userId, name: row.displayName, selected: row.userId === selectedId, rank: index + 1, seed,
        pose: recent ? "arrive" : POSES[seed % POSES.length], recent,
        totalMiles: row.totalCreditedMiles, weekMiles: row.weekCreditedMiles, lastActivityDate: row.lastActivityDate || null
      };
    });
}

function daysApart(a, b) {
  const t = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.abs(Math.round((t(b) - t(a)) / 86400000));
}

// Everything the scene and the camp page need, derived from the expedition's progress.
export function campContext({ trail, progress, board = [], supplies = { photos: 0 }, today, hour, selectedId }) {
  const region = regionAtMarker(trail, progress.position.marker);
  const people = campPeople(board, { selectedId, today });
  const scene = region ? region.scene : "southern-ridges";
  return {
    region, scene, people,
    time: timeOfDay(hour),
    weather: weatherFor(today, scene),
    scale: campScale(progress.creditedMiles, people.length),
    celebration: celebrationAt(progress),
    next: progress.nextLandmark ? { name: progress.nextLandmark.name, miles: progress.distanceToNext } : null,
    supplies
  };
}
