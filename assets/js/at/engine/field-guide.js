// Wildlife field guide: which species the expedition (or one hiker) has photographed, where and when,
// plus the wildlife photography badges. Pure and DOM-free.
// Input rows come from the at_field_guide() RPC: { hikerId, species, habitat, firstSeen, sightings },
// one row per hiker x species x habitat.
import { THEMES } from "./expedition-themes.js";

export const GROUPS = Object.freeze([
  { id: "mammal", label: "Mammals" },
  { id: "bird", label: "Birds" },
  { id: "insect", label: "Insects" },
  { id: "herp", label: "Reptiles & Amphibians" },
  { id: "legend", label: "Trail Legends" }
]);

const earliest = (dates) => dates.filter(Boolean).sort()[0] || null;
const isLegend = (sp) => sp.rarity === "legend";

// Habitats to try for a species, best first (at most two labels), plus a season hint.
export function whereToLook(spec, theme = THEMES.wildlife) {
  const places = Object.entries(theme.habitats)
    .map(([id, hab]) => ({ id, label: hab.label, weight: hab.animals[spec.id] || ((hab.rare || []).includes(spec.id) ? 0.5 : 0) }))
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2);
  const season = spec.season === "warm" ? "Warm months." : spec.season === "cold" ? "Only in winter." : "";
  return { places, season, text: places.length ? `Look in: ${places.map((p) => p.label).join(", ")}.${season ? ` ${season}` : ""}` : "Nobody knows where to look." };
}

export function buildFieldGuide(sightings = [], { hikerId = null, theme = THEMES.wildlife } = {}) {
  const known = new Set(theme.species.map((sp) => sp.id));
  const rows = sightings.filter((r) => known.has(r.species) && (!hikerId || r.hikerId === hikerId));
  const entries = theme.species.map((spec) => {
    const mine = rows.filter((r) => r.species === spec.id);
    const byHiker = new Map();
    mine.forEach((r) => { if (r.hikerId && (!byHiker.has(r.hikerId) || r.firstSeen < byHiker.get(r.hikerId))) byHiker.set(r.hikerId, r.firstSeen); });
    return {
      spec,
      found: mine.length > 0,
      firstSeen: earliest(mine.map((r) => r.firstSeen)),
      sightings: mine.reduce((sum, r) => sum + (Number(r.sightings) || 0), 0),
      habitats: [...new Set(mine.map((r) => r.habitat).filter((id) => theme.habitats[id]))],
      firstBy: [...byHiker].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([id]) => id)[0] || null
    };
  });
  const regular = entries.filter((e) => !isLegend(e.spec));
  const legends = entries.filter((e) => isLegend(e.spec));
  return {
    entries,
    groups: GROUPS.map((g) => ({ ...g, entries: entries.filter((e) => e.spec.group === g.id) })),
    found: regular.filter((e) => e.found).length,
    total: regular.length,
    legendsFound: legends.filter((e) => e.found).length,
    legendsTotal: legends.length,
    latest: entries.filter((e) => e.found).sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : a.firstSeen > b.firstSeen ? -1 : 0))[0] || null
  };
}

// Wildlife photography badges for one hiker. Each is dated by the first sighting that completed it.
// Per trail section: how many of its local species have been photographed *there*.
// completedOn is the date the last missing local species was first photographed in that section.
export function regionProgress(sightings = [], { hikerId = null, theme = THEMES.wildlife } = {}) {
  return Object.entries(theme.habitats).map(([id, hab]) => {
    const local = Object.keys(hab.animals);
    const firsts = local.map((sp) => earliest(sightings
      .filter((r) => r.habitat === id && r.species === sp && (!hikerId || r.hikerId === hikerId))
      .map((r) => r.firstSeen || "0000-00-00")));
    const found = firsts.filter(Boolean).length;
    return { id, label: hab.label, found, total: local.length,
      completedOn: found === local.length ? firsts.sort().at(-1) : null };
  });
}

export const WILDLIFE_BADGES = Object.freeze([
  { id: "trail-photographer", art: "camera", title: "Trail Photographer", description: "Photograph 10 different species.", count: 10 },
  { id: "bird-watcher", art: "bird", title: "Bird Watcher", description: "Photograph 5 different kinds of bird.", count: 5, group: "bird" },
  { id: "insect-explorer", art: "butterfly", title: "Insect Explorer", description: "Photograph 4 different insects, from monarchs to fireflies.", count: 4, group: "insect" },
  { id: "mammal-tracker", art: "paw", title: "Mammal Tracker", description: "Photograph 6 different mammals.", count: 6, group: "mammal" },
  { id: "creek-explorer", art: "frog", title: "Creek Explorer", description: "Photograph 3 reptiles or amphibians.", count: 3, group: "herp" },
  { id: "trail-naturalist", art: "fern", title: "Trail Naturalist", description: "Photograph wildlife in 4 different trail habitats.", habitats: 4 },
  { id: "regional-naturalist", art: "book", title: "Regional Naturalist", description: "Photograph every local species of one trail section, in that section.", region: true },
  { id: "wildlife-expert", art: "binoculars", title: "Wildlife Expert", description: "Photograph 20 different species.", count: 20 },
  { id: "rare-find", art: "star", title: "Rare Species Finder", description: "Photograph one of the trail's rare species.", count: 1, rarity: "rare" },
  { id: "complete-field-guide", art: "laurel", title: "Master Naturalist", description: "Photograph every species in the field guide. The trail's highest honour.", all: true, prestige: true },
  { id: "trail-legend", art: "footprint", title: "Trail Legend", description: "Photograph something nobody will believe.", count: 1, rarity: "legend" }
]);

export function wildlifeBadges(sightings = [], theme = THEMES.wildlife) {
  const guide = buildFieldGuide(sightings, { theme });
  const firstByHabitat = new Map();
  sightings.forEach((r) => {
    if (!theme.habitats[r.habitat]) return;
    if (!firstByHabitat.has(r.habitat) || r.firstSeen < firstByHabitat.get(r.habitat)) firstByHabitat.set(r.habitat, r.firstSeen);
  });
  const nth = (dates, n) => { const sorted = dates.filter(Boolean).sort(); return sorted.length >= n ? sorted[n - 1] : null; };
  const regions = regionProgress(sightings, { theme });
  return WILDLIFE_BADGES.map((b) => {
    const base = { id: b.id, kind: "wildlife", art: b.art, title: b.title, description: b.description, prestige: !!b.prestige };
    if (b.region) {
      const done = regions.map((r) => r.completedOn).filter(Boolean).sort();
      const best = [...regions].sort((x, y) => (y.found / y.total) - (x.found / x.total))[0] || { found: 0, total: 1, label: "" };
      return { ...base, earned: done.length > 0, earnedOn: done[0] || null,
        progress: done.length ? { count: 1, need: 1 } : { count: best.found, need: best.total, label: best.label } };
    }
    let dates;
    let need = b.count;
    if (b.habitats) { dates = [...firstByHabitat.values()]; need = b.habitats; } else {
      const pool = guide.entries.filter((e) => e.found && (!b.group || e.spec.group === b.group)
        && (b.rarity ? e.spec.rarity === b.rarity : !isLegend(e.spec)));
      dates = pool.map((e) => e.firstSeen);
      if (b.all) need = guide.total;
    }
    const count = dates.length;
    const earned = count >= need;
    return { ...base, earned, earnedOn: earned ? nth(dates, need) : null, progress: { count: Math.min(count, need), need } };
  });
}
