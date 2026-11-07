// The species catalogue validator: every species is one object in engine/expedition-themes.js, and
// these checks catch the easy mistakes when adding one (see docs/adding-species.md).
import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, BEHAVIOR, RARITY_VALUE } from "../../assets/js/at/engine/expedition-themes.js";
import { GROUPS, buildFieldGuide, speciesBadges, wildlifeCollection, whereToLook } from "../../assets/js/at/engine/field-guide.js";
import { pickSpecies, rollSpecial, LEGEND_CHANCE } from "../../assets/js/at/engine/expedition.js";

const theme = THEMES.wildlife;
const habitatIds = Object.keys(theme.habitats);
const special = (sp) => sp.rarity === "rare" || sp.rarity === "legend";

test("every species is defined once, with valid group, rarity, home and words", () => {
  const ids = theme.species.map((sp) => sp.id);
  assert.equal(new Set(ids).size, ids.length, "species ids are unique");
  const names = theme.species.map((sp) => sp.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, "species names are unique");
  theme.species.forEach((sp) => {
    assert.match(sp.id, /^[a-z][a-z0-9-]{1,30}$/, `${sp.id}: matches the database species check`);
    assert.ok(GROUPS.some((g) => g.id === sp.group), `${sp.id}: group`);
    assert.ok(["common", "uncommon", "rare", "legend"].includes(sp.rarity), `${sp.id}: rarity`);
    assert.equal(sp.group === "legend", sp.rarity === "legend", `${sp.id}: legends live in the Trail Legends group`);
    assert.ok(BEHAVIOR[sp.behavior.name], `${sp.id}: behaviour is one of BEHAVIOR.* (or a variant of one)`);
    assert.equal(sp.skittish, sp.behavior.react !== "ignore", `${sp.id}: skittish follows the behaviour class`);
    assert.ok(Number.isInteger(sp.value) && sp.value > 0 && sp.value <= 400, `${sp.id}: value`);
    if (special(sp)) assert.equal(sp.value, RARITY_VALUE[sp.rarity], `${sp.id}: special finds score by rarity`);
    assert.ok(!sp.season || ["warm", "cold"].includes(sp.season), `${sp.id}: season`);
    assert.ok(!sp.fly || ["high", "low"].includes(sp.fly), `${sp.id}: fly`);
    assert.ok(sp.light && sp.colors.length === 2, `${sp.id}: colours`);
    assert.ok(sp.fact && sp.fact.length <= 200, `${sp.id}: a short fact`);
    assert.ok(sp.range, `${sp.id}: range`);
    if (special(sp)) {
      assert.ok(sp.where === "everywhere" || (Array.isArray(sp.where) && sp.where.length && sp.where.every((id) => habitatIds.includes(id))),
        `${sp.id}: rare and legendary species list known habitats (or "everywhere")`);
    } else {
      const entries = Object.entries(sp.where || {});
      assert.ok(entries.length, `${sp.id}: lives somewhere`);
      entries.forEach(([id, w]) => {
        assert.ok(habitatIds.includes(id), `${sp.id}: unknown habitat ${id}`);
        assert.ok(Number.isFinite(w) && w > 0 && w <= 5, `${sp.id}: weight in ${id}`);
      });
    }
  });
});

test("habitat spawn tables are derived from each species' home", () => {
  theme.species.forEach((sp) => {
    habitatIds.forEach((id) => {
      const hab = theme.habitats[id];
      if (special(sp)) {
        const listed = (sp.rarity === "rare" ? hab.rare : hab.legends).includes(sp.id);
        assert.equal(listed, sp.where === "everywhere" || sp.where.includes(id), `${sp.id} in ${id}`);
        assert.equal(hab.animals[sp.id], undefined, `${sp.id}: special finds never use spawn weights`);
      } else {
        assert.equal(hab.animals[sp.id], sp.where[id], `${sp.id} weight in ${id}`);
      }
    });
  });
  Object.entries(theme.habitats).forEach(([id, hab]) => {
    assert.ok(Object.keys(hab.animals).length >= 5, `${id}: plenty of everyday wildlife`);
    assert.ok(hab.rare.length >= 1, `${id}: has a rare find`);
    assert.ok(hab.legends.length >= 1, `${id}: has a legend`);
  });
});

test("every species can appear in a game, gets a guide entry, a badge and a hint", () => {
  const seen = new Set();
  const seq = (...values) => { let k = 0; return () => values[k++ % values.length]; };
  habitatIds.forEach((id) => {
    for (let i = 0; i < 400; i += 1) seen.add(pickSpecies(theme, id, () => i / 400).id);
    // rollSpecial draws: the rarity roll, then which species from the local list, then when it appears.
    const hab = theme.habitats[id];
    hab.rare.forEach((_, n) => [false, true].forEach((winter) =>
      seen.add(rollSpecial(theme, id, { winter, random: seq(LEGEND_CHANCE + 0.001, (n + 0.5) / hab.rare.length, 0) })?.id)));
    hab.legends.forEach((_, n) => seen.add(rollSpecial(theme, id, { random: seq(0, (n + 0.5) / hab.legends.length, 0) })?.id));
  });
  assert.deepEqual(theme.species.map((sp) => sp.id).filter((id) => !seen.has(id)), [], "every species can spawn somewhere");
  const rows = theme.species.map((sp, i) => ({ hikerId: "h1", species: sp.id,
    habitat: special(sp) ? (sp.where === "everywhere" ? habitatIds[0] : sp.where[0]) : Object.keys(sp.where)[0],
    firstSeen: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`, sightings: 1, photos: 1, thisExpedition: true }));
  const guide = buildFieldGuide(rows, { hikerId: "h1" });
  assert.equal(guide.found, guide.total, "every regular species fills a guide entry");
  assert.equal(guide.legendsFound, guide.legendsTotal);
  const badges = speciesBadges(rows, { hikerId: "h1" });
  assert.equal(badges.length, theme.species.length, "one species badge per species");
  assert.ok(badges.every((b) => b.earned));
  assert.equal(speciesBadges([], { hikerId: "h1" }).length, theme.species.filter((sp) => sp.rarity !== "legend").length, "legends stay secret");
  assert.equal(wildlifeCollection(rows, { hikerId: "h1" }).percent, 100);
  theme.species.filter((sp) => sp.rarity !== "legend").forEach((sp) => assert.ok(whereToLook(sp).places.length, `${sp.id}: a where-to-look hint`));
});
