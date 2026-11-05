// The expedition journal: one dated record of everything meaningful that has happened on the
// journey, newest first. Pure and DOM-free; built entirely from data the app already loads
// (the trail register, at_expedition_marks, at_expedition_hikers and at_field_guide rows).
//
// Entry: { id, date: "YYYY-MM-DD" | null, kind, title, detail, art?, species?, rarity?, hikerId? }
//   kind: "landmark" | "milestone" | "species" | "guide" | "section" | "badge"
// Species badges are one entry per hiker per day, leaving out species that hiker found first for the
// whole expedition that day (the "First photo" entry already tells that story).
// Undated entries (rare; e.g. a mark recorded before dates were tracked) sort last.
import { THEMES } from "./expedition-themes.js";
import { buildFieldGuide, listTitles, regionProgress, speciesBadgeDays, speciesBadges, speciesTitle } from "./field-guide.js";
import { hikerBadges } from "./hikers.js";

// Field-guide counts worth celebrating as an expedition (the full guide is added automatically).
export const GUIDE_MILESTONES = Object.freeze([10, 25]);

// Same-day ties: the bigger story first.
const ORDER = { landmark: 0, milestone: 1, guide: 2, section: 3, species: 4, badge: 5 };

export function expeditionJournal({ hikers = [], register = [], marks = [], sightings = [], today, theme = THEMES.wildlife } = {}) {
  const names = new Map(hikers.map((x) => [x.id, x.name]));
  const out = [];

  register.forEach((r) => out.push({
    id: `mark-${r.id}`, date: r.reachedOn || null, kind: r.kind === "landmark" ? "landmark" : "milestone",
    art: r.kind === "landmark" ? "flag" : "wheel", hikerId: r.hikerId || null,
    title: r.kind === "landmark" ? `Reached ${r.title}` : `Group milestone: ${r.title}`,
    detail: `Mile ${r.miles}${r.hikerName ? ` · carried by ${r.hikerName}` : ""}`
  }));

  const guide = buildFieldGuide(sightings, { theme });
  guide.entries.filter((e) => e.found).forEach((e) => {
    const rarity = e.spec.rarity === "rare" || e.spec.rarity === "legend" ? e.spec.rarity : null;
    const who = names.get(e.firstBy);
    const lead = rarity === "legend" ? "Legend sighted" : rarity === "rare" ? "Rare find" : "First photo";
    out.push({ id: `species-${e.spec.id}`, date: e.firstSeen, kind: "species", species: e.spec, rarity, hikerId: e.firstBy,
      title: `${lead}: ${speciesTitle(e.spec.name)}`, detail: who ? `Photographed by ${who}` : "Added to the field guide" });
  });

  // Field-guide milestones count the regular species (legends are a bonus, like the guide itself).
  const firsts = guide.entries.filter((e) => e.found && e.spec.rarity !== "legend").map((e) => e.firstSeen).filter(Boolean).sort();
  [...new Set([...GUIDE_MILESTONES.filter((n) => n < guide.total), guide.total])].forEach((n) => {
    if (firsts.length < n) return;
    const all = n === guide.total;
    out.push({ id: `guide-${all ? "all" : n}`, date: firsts[n - 1], kind: "guide", art: all ? "laurel" : "book",
      title: all ? "The field guide is complete!" : `${n} species in the field guide`,
      detail: all ? `All ${n} species photographed by the expedition` : `${guide.total - n} still to find` });
  });

  regionProgress(sightings, { theme }).filter((r) => r.completedOn).forEach((r) => out.push({
    id: `section-${r.id}`, date: r.completedOn, kind: "section", art: "fern",
    title: `Section complete: ${r.label}`, detail: `Every local species photographed there (${r.total})`
  }));

  hikers.forEach((hk) => {
    hikerBadges(hk, { marks, register, today, sightings }).filter((b) => b.earned).forEach((b) => out.push({
      id: `badge-${hk.id}-${b.id}`, date: b.earnedOn || null, kind: "badge", art: b.art, prestige: !!b.prestige, hikerId: hk.id,
      title: `${hk.name} earned ${b.title}`, detail: b.description
    }));
  });

  const firstBy = new Map(guide.entries.filter((e) => e.found).map((e) => [`species-${e.spec.id}`, `${e.firstBy}|${e.firstSeen}`]));
  hikers.forEach((hk) => {
    speciesBadgeDays(speciesBadges(sightings, { hikerId: hk.id, theme })).forEach((d) => {
      const titles = d.badges.filter((b) => firstBy.get(b.id) !== `${hk.id}|${d.date}`).map((b) => b.title);
      if (!titles.length) return;
      out.push({ id: `species-badges-${hk.id}-${d.date}`, date: d.date, kind: "badge", art: "camera", hikerId: hk.id,
        title: `${hk.name} earned ${titles.length === 1 ? "a species badge" : `${titles.length} species badges`}`, detail: listTitles(titles) });
    });
  });

  return out.sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : -1;
    }
    return (ORDER[a.kind] - ORDER[b.kind]) || a.title.localeCompare(b.title);
  });
}
