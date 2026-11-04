import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { THEMES } from "../../assets/js/at/engine/expedition-themes.js";
import { trailRegister } from "../../assets/js/at/engine/hikers.js";
import { expeditionJournal } from "../../assets/js/at/engine/journal.js";

const theme = THEMES.wildlife;
const david = { id: "h-david", name: "David", totalMiles: 60, weekMiles: 6, activityCount: 4, firstActivityDate: "2026-11-01",
  lastActivityDate: "2026-11-12", activeDates: ["2026-11-01"], wildlifeRuns: 2, wildlifeScore: 30, firstSpottedOn: "2026-11-03" };
const kevin = { id: "h-kevin", name: "Kevin", totalMiles: 0, weekMiles: 0, activityCount: 0, firstActivityDate: null,
  lastActivityDate: null, activeDates: [], wildlifeRuns: 1, wildlifeScore: 5, firstSpottedOn: "2026-11-04" };
const hikers = [david, kevin];
const marks = [
  { kind: "group", mark: "31", hikerId: "h-david", reachedOn: "2026-11-05" }, // Neel Gap
  { kind: "personal", mark: "10", hikerId: "h-david", reachedOn: "2026-11-02" },
  { kind: "personal", mark: "50", hikerId: "h-david", reachedOn: "2026-11-08" }
];
const register = trailRegister(TRAIL, "nobo", marks, hikers);
const row = (hikerId, species, firstSeen, habitat = "southern-ridges") => ({ hikerId, species, habitat, firstSeen, sightings: 1 });
const sightings = [
  row("h-david", "deer", "2026-11-03"),
  row("h-kevin", "deer", "2026-11-02"), // Kevin photographed it first
  row("h-david", "white-deer", "2026-11-06", "blue-ridge"),
  row("h-kevin", "bigfoot", "2026-11-07")
];
const journal = (extra = {}) => expeditionJournal({ hikers, register, marks, sightings, today: "2026-11-20", ...extra });

test("the journal records landmarks, first photos, rare and legendary finds, and badge unlocks", () => {
  const list = journal();
  const ids = list.map((e) => e.id);
  const neel = list.find((e) => e.id === "mark-landmark-neel-gap");
  assert.equal(neel.kind, "landmark");
  assert.equal(neel.title, "Reached Neel Gap");
  assert.match(neel.detail, /carried by David/);
  const deer = list.find((e) => e.id === "species-deer");
  assert.equal(deer.date, "2026-11-02", "the expedition's first photo of a species is the one recorded");
  assert.match(deer.detail, /Kevin/);
  assert.equal(list.find((e) => e.id === "species-white-deer").rarity, "rare");
  assert.match(list.find((e) => e.id === "species-white-deer").title, /^Rare find/);
  assert.match(list.find((e) => e.id === "species-bigfoot").title, /^Legend sighted/);
  assert.ok(ids.includes("badge-h-david-miles-50"), "mileage badges are unlocks");
  assert.ok(ids.includes("badge-h-kevin-first-wildlife"));
  assert.ok(ids.includes("badge-h-david-rare-find"), "wildlife badges are unlocks too");
  assert.ok(!ids.some((id) => id.startsWith("badge-h-kevin-miles")), "badges that aren't earned never appear");
  assert.equal(new Set(ids).size, ids.length, "every entry has a unique id");
});

test("the journal is newest first, undated entries last, bigger stories first on the same day", () => {
  const list = journal();
  const dated = list.filter((e) => e.date).map((e) => e.date);
  assert.deepEqual(dated, [...dated].sort().reverse());
  const firstUndated = list.findIndex((e) => !e.date);
  if (firstUndated >= 0) assert.ok(list.slice(firstUndated).every((e) => !e.date));
  const sameDay = list.filter((e) => e.date === "2026-11-05");
  assert.equal(sameDay[0].kind, "landmark", "the landmark leads the badge it earned");
});

test("field-guide milestones and completed trail sections are celebrated once each", () => {
  const regular = theme.species.filter((sp) => sp.rarity !== "legend");
  const day = (i) => `2026-12-${String(1 + Math.floor(i / 2)).padStart(2, "0")}`;
  const all = regular.map((sp, i) => row("h-david", sp.id, day(i)));
  const local = Object.keys(theme.habitats["alpine"].animals).map((id) => row("h-kevin", id, "2027-01-15", "alpine"));
  const list = journal({ sightings: [...all, ...local] });
  const guide = list.filter((e) => e.kind === "guide");
  assert.deepEqual(guide.map((e) => e.id).sort(), ["guide-10", "guide-25", "guide-all"]);
  assert.equal(list.find((e) => e.id === "guide-10").date, day(9), "dated by the 10th new species");
  assert.equal(list.find((e) => e.id === "guide-all").title, "The field guide is complete!");
  const sections = list.filter((e) => e.kind === "section");
  assert.ok(sections.some((e) => e.id === "section-alpine" && e.date === "2027-01-15"));
  assert.ok(list.some((e) => e.id === "badge-h-david-complete-field-guide" && e.prestige), "Master Naturalist is marked prestigious");
});

test("an empty expedition has an empty journal, and a missing field guide just leaves wildlife out", () => {
  assert.deepEqual(expeditionJournal({}), []);
  const list = journal({ sightings: [] });
  assert.ok(list.length > 0);
  assert.ok(!list.some((e) => e.kind === "species" || e.kind === "guide" || e.kind === "section"));
});
