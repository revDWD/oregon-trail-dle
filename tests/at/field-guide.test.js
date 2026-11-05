import test from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../../assets/js/at/engine/expedition-themes.js";
import { buildFieldGuide, regionProgress, whereToLook, wildlifeBadges, WILDLIFE_BADGES, GROUPS, speciesBadges, speciesBadgeDays, speciesTitle, listTitles } from "../../assets/js/at/engine/field-guide.js";
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
  ["trail-photographer", "wildlife-expert", "complete-field-guide", "insect-explorer"].forEach((id) => assert.equal(badges[id].earned, true, id));
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

test("regional completion: every local species photographed in that section, dated by the last one", () => {
  const [id, hab] = Object.entries(theme.habitats)[0];
  const local = Object.keys(hab.animals);
  const rows = local.map((sp, i) => row("h1", sp, id, `2026-11-${String(10 + i).padStart(2, "0")}`));
  const elsewhere = Object.keys(theme.habitats).find((x) => x !== id);
  const partial = [...rows.slice(1), row("h1", local[0], elsewhere, "2026-11-01")];
  const p = regionProgress(partial).find((r) => r.id === id);
  assert.deepEqual([p.found, p.total, p.completedOn], [local.length - 1, local.length, null], "photographed elsewhere doesn't count");
  const done = regionProgress(rows).find((r) => r.id === id);
  assert.equal(done.completedOn, rows.at(-1).firstSeen);
  assert.equal(regionProgress(rows, { hikerId: "h2" }).find((r) => r.id === id).found, 0);
  const badge = (rs) => wildlifeBadges(rs).find((b) => b.id === "regional-naturalist");
  assert.deepEqual([badge(partial).earned, badge(partial).progress.count], [false, local.length - 1]);
  assert.deepEqual([badge(rows).earned, badge(rows).earnedOn], [true, rows.at(-1).firstSeen]);
});

test("group badges and the prestigious Master Naturalist", () => {
  const byGroup = (g) => theme.species.filter((sp) => sp.group === g && sp.rarity !== "legend").map((sp) => sp.id);
  const rows = [...byGroup("mammal").slice(0, 6), ...byGroup("herp").slice(0, 3)].map((sp) => row("h1", sp, "blue-ridge", "2026-11-05"));
  const got = Object.fromEntries(wildlifeBadges(rows).map((b) => [b.id, b]));
  assert.equal(got["mammal-tracker"].earned, true);
  assert.equal(got["creek-explorer"].earned, true);
  assert.equal(got["rare-find"].title, "Rare Species Finder");
  const master = got["complete-field-guide"];
  assert.deepEqual([master.title, master.prestige, master.earned, master.art], ["Master Naturalist", true, false, "laurel"]);
  assert.equal(WILDLIFE_BADGES.filter((b) => b.prestige).length, 1, "only one top honour");
  ["paw", "frog", "laurel"].forEach((name) => assert.ok(SPRITES[name], name));
});

test("species names read as Title Case badge names", () => {
  assert.equal(speciesTitle("white-tailed deer"), "White-tailed Deer");
  assert.equal(speciesTitle("Canada lynx"), "Canada Lynx");
  assert.equal(speciesTitle("six-spotted tiger beetle"), "Six-spotted Tiger Beetle");
  assert.equal(listTitles([]), "");
  assert.equal(listTitles(["Elk"]), "Elk");
  assert.equal(listTitles(["Black Bear", "Elk"]), "Black Bear and Elk");
  assert.equal(listTitles(["Black Bear", "Elk", "Moose"]), "Black Bear, Elk and Moose");
});

test("every regular species has a badge; legends appear only once photographed", () => {
  const regular = theme.species.filter((sp) => sp.rarity !== "legend");
  const fresh = speciesBadges([], { hikerId: "h1" });
  assert.equal(fresh.length, regular.length, "one badge per regular species, legends kept secret");
  assert.ok(fresh.every((b) => !b.earned && b.earnedOn === null && !b.bonus && b.kind === "species"));
  assert.equal(new Set(fresh.map((b) => b.id)).size, fresh.length);
  assert.deepEqual(fresh.map((b) => b.id), regular.map((sp) => `species-${sp.id}`));
  assert.equal(fresh.find((b) => b.id === "species-deer").title, "White-tailed Deer");
  assert.equal(fresh.find((b) => b.id === "species-deer").description, "Photograph a white-tailed deer in Wildlife Spotting.");
  assert.equal(fresh.find((b) => b.id === "species-elk").description, "Photograph an elk in Wildlife Spotting.");
  assert.ok(fresh.every((b) => b.spec && Array.isArray(b.spec.parts) && b.spec.parts.length), "every species badge has the sprite as art");
});

test("a species badge is earned with the hiker's own first photo; repeats and other hikers change nothing", () => {
  const rows = [
    row("h1", "deer", "southern-ridges", "2026-11-05", 4),
    row("h1", "deer", "blue-ridge", "2026-11-03"),
    row("h2", "bear", "southern-ridges", "2026-11-01"),
    row("h1", "bigfoot", "blue-ridge", "2026-11-06")
  ];
  const mine = speciesBadges(rows, { hikerId: "h1" });
  const deer = mine.find((b) => b.id === "species-deer");
  assert.equal(deer.earned, true);
  assert.equal(deer.earnedOn, "2026-11-03", "the first photo anywhere on the trail");
  assert.equal(mine.find((b) => b.id === "species-bear").earned, false, "another hiker's photo doesn't count");
  const legend = mine.find((b) => b.id === "species-bigfoot");
  assert.ok(legend.earned && legend.bonus, "a legend badge is a bonus");
  assert.equal(mine.length, theme.species.filter((sp) => sp.rarity !== "legend").length + 1);
  assert.equal(speciesBadges(rows, { hikerId: "h2" }).filter((b) => b.earned).length, 1);
});

test("species badges earned the same day are grouped into one story line", () => {
  const rows = [row("h1", "elk", "blue-ridge", "2026-11-03"), row("h1", "bear", "blue-ridge", "2026-11-03"), row("h1", "moose", "north-woods", "2026-11-09")];
  const days = speciesBadgeDays(speciesBadges(rows, { hikerId: "h1" }));
  assert.deepEqual(days.map((d) => [d.date, d.titles]), [["2026-11-03", ["Black Bear", "Elk"]], ["2026-11-09", ["Moose"]]]);
  assert.deepEqual(days[0].ids, ["species-bear", "species-elk"], "ids line up with titles");
});
