// Pure activity validation and mileage conversion. Mirrors the database trigger in
// supabase/migrations (the database is authoritative; this gives instant form feedback and
// lets tests pin the rules down).

import { round2 } from "./progress.js";

export const ACTIVITY_TYPES = Object.freeze(["walking", "hiking", "running", "cycling", "other"]);
export const ACTIVITY_LABELS = Object.freeze({
  walking: "Walking", hiking: "Hiking", running: "Running", cycling: "Cycling", other: "Other / manual"
});

export const MIN_ACTUAL_MILES = 0.1;
export const MAX_NOTES_LENGTH = 240;
export const MAX_DURATION_MINUTES = 1440;
export const MAX_BACKDATE_DAYS = 60;

// Default rule set; must match the seed rows in the migration. effectiveFrom lets a future rule
// change apply to new activities only (old activities keep the factor stored on their row).
export const DEFAULT_RULES = Object.freeze([
  { type: "walking", factor: 1, maxActualMiles: 100, effectiveFrom: "2000-01-01" },
  { type: "hiking", factor: 1, maxActualMiles: 60, effectiveFrom: "2000-01-01" },
  { type: "running", factor: 1, maxActualMiles: 50, effectiveFrom: "2000-01-01" },
  { type: "cycling", factor: 0.25, maxActualMiles: 150, effectiveFrom: "2000-01-01" },
  { type: "other", factor: 0.5, maxActualMiles: 100, effectiveFrom: "2000-01-01" }
]);

export function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Strict YYYY-MM-DD parsing; returns a UTC-midnight Date or null (rejects 2025-02-30, etc.).
export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function daysBetween(fromDate, toDate) {
  return Math.round((parseDate(toDate) - parseDate(fromDate)) / 86400000);
}

export function ruleFor(rules, type, date) {
  const matches = rules
    .filter((rule) => rule.type === type && rule.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return matches[0] || null;
}

export function creditedMiles(actualMiles, factor) {
  return round2(Math.round(actualMiles * 100) / 100 * factor);
}

// Returns { ok, errors: {field: message}, value }. `today` is a local YYYY-MM-DD string.
export function validateActivity(input, { rules = DEFAULT_RULES, today = localDateString() } = {}) {
  const errors = {};
  const type = typeof input.type === "string" ? input.type : "";
  if (!ACTIVITY_TYPES.includes(type)) errors.type = "Choose an activity type.";

  const date = typeof input.date === "string" ? input.date : "";
  if (!parseDate(date)) errors.date = "Enter a valid date.";
  else if (date > today) errors.date = "Activities cannot be dated in the future.";
  else if (daysBetween(date, today) > MAX_BACKDATE_DAYS) errors.date = `Activities can be added up to ${MAX_BACKDATE_DAYS} days back.`;

  const rawMiles = input.miles;
  const miles = typeof rawMiles === "number" ? rawMiles : (typeof rawMiles === "string" && rawMiles.trim() !== "" ? Number(rawMiles) : NaN);
  const rule = !errors.type && !errors.date ? ruleFor(rules, type, date) : null;
  if (!Number.isFinite(miles)) errors.miles = "Enter the distance in miles.";
  else if (miles < MIN_ACTUAL_MILES) errors.miles = `Distance must be at least ${MIN_ACTUAL_MILES} miles.`;
  else if (rule && miles > rule.maxActualMiles) errors.miles = `Please log no more than ${rule.maxActualMiles} miles for one ${type} session.`;

  let duration = null;
  if (input.durationMinutes !== undefined && input.durationMinutes !== null && input.durationMinutes !== "") {
    duration = Number(input.durationMinutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_MINUTES) {
      errors.durationMinutes = `Duration must be a whole number of minutes from 1 to ${MAX_DURATION_MINUTES}.`;
    }
  }

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES_LENGTH) errors.notes = `Notes can be at most ${MAX_NOTES_LENGTH} characters.`;

  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  const actualMiles = Math.round(miles * 100) / 100;
  return {
    ok: true,
    errors: {},
    value: {
      type, date, actualMiles, durationMinutes: duration, notes,
      conversionFactor: rule.factor,
      creditedMiles: creditedMiles(actualMiles, rule.factor)
    }
  };
}

// Mirrors the update trigger: keep the stored factor unless type, date or distance changed.
export function applyEdit(existing, changes, options) {
  const merged = {
    type: changes.type ?? existing.type,
    date: changes.date ?? existing.date,
    miles: changes.miles ?? existing.actualMiles,
    durationMinutes: changes.durationMinutes === undefined ? existing.durationMinutes : changes.durationMinutes,
    notes: changes.notes ?? existing.notes
  };
  const result = validateActivity(merged, options);
  if (!result.ok) return result;
  const unchanged = merged.type === existing.type && merged.date === existing.date && result.value.actualMiles === existing.actualMiles;
  if (unchanged) {
    result.value.conversionFactor = existing.conversionFactor;
    result.value.creditedMiles = existing.creditedMiles;
  }
  return result;
}

export function totalCredited(activities) {
  return round2(activities.reduce((sum, activity) => sum + (Number(activity.creditedMiles) || 0), 0));
}
