import test from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../../assets/js/at/engine/expedition-themes.js";
import { buildFieldGuide, whereToLook, wildlifeBadges, WILDLIFE_BADGES, GROUPS } from "../../assets/js/at/engine/field-guide.js";
import { hikerBadges } from "../../assets/js/at/engine/hikers.js";
import { SPRITES } from "../../assets/js/at/ui/badge-art.js";

const theme = THEMES.wildlife;
const row = (hikerId, species, habitat, firstSeen, sightings = 1) => ({ hikerId, species, habitat, firstSeen, sightings });

test("field guide aggregates sightings across habitats and hikers", () => {
  const rows = [
    row("h1", "deer", "blue-ridge", "2026-11-05", 2),
    row("h2", "deer", "lakes", "2026-11-03", 1),
    row("h1", "monarch", "blue-ridge", "2026-11-04"),
    row("h1", "not-a-species", "blue-ridge", "2026-11-01"),
    row(null, "bigfoot", "lakes", "2026-11-06")
  ];
  const guide = buildFieldGuide(rows);
  const deer = guide.entries.find((e) => e.spec.id === "deer");
  assert.deepEqual([deer.found, deer.firstSeen, deer.sightings, deer.firstBy], [true, "2026-11-03", 3, "h2"]);
  assert.deepEqual(deer.habitats.sort(), ["blue-ridge", "lakes"]);
  assert.equal(guide.found, 2, "legends and unknown ids don't count toward the guide");
  assert.equal(guide.total, theme.species.filter((sp) => sp.rarity !== "legend").length);
  assert.equal(guide.legendsFound, 1);
  assert.equal(guide.latest.spec.id, "bigfoot");
  assert.deepEqual(guide.groups.map((g) => g.id), GROUPS.map((g) => g.id));
  assert.equal(guide.groups.reduce((n, g) => n + g.entries.length, 0), theme.species.length, "every species is in exactly one group");
  const mine = buildFieldGuide(rows, { hikerId: "h2" });
  assert.equal(mine.found, 1);
  assert.equal(mine.entries.find((e) => e.spec.id === "deer").sightings, 1);
  assert.equal(buildFieldGuide([]).found, 0);
});

test("undiscovered species get a where-to-look hint from the habitat weights", () => {
  const loon = whereToLook(theme.species.find((sp) => sp.id === "loon"));
  assert.equal(loon.places[0].id, "north-woods");
  const monarch = whereToLook(theme.species.find((sp) => sp.id === "monarch"));
  assert.match(monarch.text, /^Look in: .*Warm months\.$/);
  assert.ok(whereToLook(theme.species.find((sp) => sp.id === "lynx")).places.some((p) => p.id === "north-woods"), "rare finds point to their habitats");
  assert.match(whereToLook(theme.species.find((sp) => sp.id === "snowy-owl")).text, /Only in winter/);
});

test("wildlife badges are earned by distinct species, groups, habitats and special finds, dated by the completing sighting", () => {
  const birds = ["turkey", "grouse", "duck", "blue-jay", "loon"];
  const rows = birds.map((id, i) => row("h1", id, i < 2 ? "blue-ridge" : "lakes", `2026-11-0${i + 1}`));
  let badges = Object.fromEntries(wildlifeBadges(rows).map((b) => [b.id, b]));
  assert.equal(badges["bird-watcher"].earned, true);
  assert.equal(badges["bird-watcher"].earnedOn, "2026-11-05");
  assert.equal(badges["trail-photographer"].earned, false);
  assert.deepEqual(badges["trail-photographer"].progress, { count: 5, need: 10 });
  assert.equal(badges["trail-naturalist"].earned, false);
  rows.push(row("h1", "deer", "high-balds", "2026-11-07"), row("h1", "moose", "north-woods", "2026-11-08"), row("h1", "white-deer", "lakes", "2026-11-09"));
  badges = Object.fromEntries(wildlifeBadges(rows).map((b) => [b.id, b]));
  assert.equal(badges["trail-naturalist"].earnedOn, "2026-11-08");
  assert.equal(badges["rare-find"].earnedOn, "2026-11-09");
  assert.equal(badges["trail-legend"].earned, false);
  badges = Object.fromEntries(wildlifeBadges([...rows, row("h1", "jackalope", "lakes", "2026-11-10")]).map((b) => [b.id, b]));
  assert.equal(badges["trail-legend"].earned, true);
  assert.equal(badges["trail-photographer"].earned, false, "legends don't count toward species totals");
  const all = theme.species.filter((sp) => sp.rarity !== "legend").map((sp, i) => row("h1", sp.id, "lakes", `2026-12-${String(1 + (i % 28)).padStart(2, "0")}`));
  badges = Object.fromEntries(wildlifeBadges(all).map((b) => [b.id, b]));
  ["trail-photographer", "wildlife-expert", "complete-field-guide", "butterfly-collector"].forEach((id) => assert.equal(badges[id].earned, true, id));
  assert.ok(wildlifeBadges([]).every((b) => !b.earned && b.earnedOn === null));
});

test("hiker badges include their own wildlife badges only, with unique, valid artwork", () => {
  const hiker = { id: "h1", name: "David", totalMiles: 0, activityCount: 0, activeDates: [] };
  const sightings = ["turkey", "grouse", "duck", "blue-jay", "loon"].map((id) => row("h2", id, "lakes", "2026-11-01"));
  const forOther = hikerBadges(hiker, { today: "2026-11-20", sightings });
  assert.equal(forOther.find((b) => b.id === "bird-watcher").earned, false, "Kevin's birds aren't David's");
  const mine = hikerBadges({ ...hiker, id: "h2" }, { today: "2026-11-20", sightings });
  assert.equal(mine.find((b) => b.id === "bird-watcher").earned, true);
  const arts = mine.map((b) => b.art);
  assert.equal(new Set(arts).size, arts.length, "no two badges share artwork");
  WILDLIFE_BADGES.forEach((b) => {
    const rows = SPRITES[b.art];
    assert.ok(rows && rows.length === 12 && rows.every((r) => r.length === 12 && /^[.kwlcgGyorsSbnp]+$/.test(r)), `${b.art} is a 12x12 sprite`);
  });
});
