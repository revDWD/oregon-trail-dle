import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { LANDMARK_PATCHES } from "../../assets/js/at/trail/landmark-patches.js";
import {
  PATCH_SHAPES, RESOURCE_KINDS, RESOURCE_OFFERS, groupPatchesByState, landmarkPatches, nearbyWildlife, patchCollection, patchFor, patchForecast,
  earnedPatchIds, expeditionSummary, patchMilestones, sortPatches, stateCollections
} from "../../assets/js/at/engine/patches.js";
import { DEFAULT_THEME, themeFor } from "../../assets/js/at/engine/expedition-themes.js";
import { hikerBadges } from "../../assets/js/at/engine/hikers.js";

// A minimal SVG DOM, just enough to draw patch art.
class FakeNode {
  constructor(tag, text) { this.tag = tag; this.text = text; this.attrs = {}; this.kids = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener() {}
  append(...nodes) { this.kids.push(...nodes); }
  replaceChildren(...nodes) { this.kids = nodes; }
}
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag),
  createTextNode: (text) => new FakeNode("#text", text)
};
const { patchArt, explorerArt, PATCH_MOTIFS, motifFor } = await import("../../assets/js/at/ui/patch-art.js");
const walk = (n, out = []) => { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); return out; };

// The whole expedition (expeditionSummary): shared miles, activities and the day it set out.
const hiker = (totalMiles, extra = {}) => ({ totalMiles, activityCount: totalMiles > 0 ? 3 : 0, firstActivityDate: totalMiles > 0 ? "2026-03-01" : null, ...extra });
const markFor = (miles, reachedOn) => ({ kind: "group", mark: miles, reachedOn });

test("every landmark has exactly one patch with complete, valid data", () => {
  const ids = TRAIL.landmarks.map((l) => l.id);
  assert.deepEqual(Object.keys(LANDMARK_PATCHES).sort(), [...ids].sort(), "one data entry per landmark, no strays");
  const patches = landmarkPatches(TRAIL, "nobo");
  assert.equal(patches.length, TRAIL.landmarks.length);
  assert.equal(new Set(patches.map((p) => p.id)).size, patches.length);
  patches.forEach((p) => {
    assert.ok(PATCH_SHAPES.includes(p.shape), `${p.id} shape`);
    assert.ok(p.banner && p.banner.length <= 13 && p.banner === p.banner.toUpperCase(), `${p.id} banner "${p.banner}"`);
    assert.ok(p.description.length > 40, `${p.id} description`);
    assert.ok(p.name.endsWith(" Patch") && p.landmarkName && p.state && p.stateNames.length && Number.isFinite(p.mile), `${p.id} fields`);
    assert.ok(p.region && /^#/.test(p.region.color), `${p.id} region colour`);
    assert.ok(p.resources.length > 0, `${p.id} has related resources`);
    p.resources.forEach((r) => {
      assert.match(r.url, /^https:\/\//, `${p.id} ${r.url}`);
      assert.ok(RESOURCE_KINDS[r.kind] && r.kindLabel === RESOURCE_KINDS[r.kind], `${p.id} ${r.kind}`);
      assert.ok(r.offers.every((o) => RESOURCE_OFFERS[o]) && r.offerLabels.length === r.offers.length, `${p.id} ${r.url} offers`);
    });
    const order = Object.keys(RESOURCE_KINDS);
    const ranks = p.resources.map((r) => order.indexOf(r.kind));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${p.id} resources are listed best first`);
    assert.equal(new Set(p.resources.map((r) => r.url)).size, p.resources.length, `${p.id} resources are not repeated`);
  });
});

test("every patch has its own motif, and new landmarks fall back to a scene for their kind", () => {
  const patches = landmarkPatches(TRAIL, "nobo");
  const motifs = patches.map((p) => motifFor(p));
  motifs.forEach((m, i) => assert.ok(PATCH_MOTIFS.includes(m), `${patches[i].id} motif`));
  assert.equal(new Set(motifs).size, motifs.length, "motifs are unique");
  const newcomer = patchFor({ id: "brand-new-gap", name: "Brand New Gap", state: "VA", miles: 700, distance: 700, kind: "gap", lat: 37, lon: -80 }, TRAIL);
  assert.equal(motifFor(newcomer), null, "no motif of its own");
  assert.ok(newcomer.resources.length && newcomer.shape, "defaults still give it resources and a shape");
  assert.doesNotThrow(() => patchArt(newcomer));
});

test("patch art draws every patch with a unique clip, muted when locked and silent when decorative", () => {
  const patches = landmarkPatches(TRAIL, "nobo", hiker(600), []);
  const clips = new Set();
  patches.forEach((p) => {
    const art = patchArt(p);
    assert.match(art.attrs.class, new RegExp(`patch-art patch-${p.shape} ${p.earned ? "earned" : "locked"}`));
    assert.equal(art.attrs.role, "img");
    assert.ok(art.attrs["aria-label"].startsWith(p.name));
    const nodes = walk(art);
    assert.ok(nodes.some((n) => n.tag === "text" && n.kids.some((k) => k.text === p.banner)), `${p.id} banner text`);
    clips.add(nodes.find((n) => n.tag === "clipPath").attrs.id);
  });
  assert.equal(clips.size, patches.length);
  const mini = patchArt(patches[0], { mini: true, decorative: true });
  assert.equal(mini.attrs["aria-hidden"], "true");
  assert.equal(mini.attrs.role, undefined);
  assert.ok(!walk(mini).some((n) => n.attrs && n.attrs.class === "patch-banner"), "mini patches have no banner");
});

test("patches unlock from the expedition's shared miles, dated by its group marks", () => {
  const none = landmarkPatches(TRAIL, "nobo", hiker(0), []);
  assert.equal(none.filter((p) => p.earned).length, 0, "nobody earns Springer before the expedition sets out");
  const second = landmarkPatches(TRAIL, "nobo")[1];
  const miles = second.distance + 1;
  const marks = [markFor(second.distance, "2026-03-09"), { kind: "personal", mark: second.distance, hikerId: "h1", reachedOn: "2026-03-02" }];
  const ps = landmarkPatches(TRAIL, "nobo", hiker(miles), marks);
  const springer = ps.find((p) => p.distance === 0);
  assert.ok(springer.earned && springer.earnedOn === "2026-03-01", "Springer: the expedition's first activity");
  ps.filter((p) => p.earned).forEach((p) => assert.ok(p.distance <= miles));
  assert.equal(ps[1].earnedOn, "2026-03-09", "uses the group mark, never a hiker's personal one");
  const next = ps.find((p) => !p.earned);
  assert.equal(next.milesToGo, Math.round((next.distance - miles) * 100) / 100);
  assert.equal(landmarkPatches(TRAIL, "nobo", null, marks).filter((p) => p.earned).length, 0, "no expedition, no patches");
  assert.ok(landmarkPatches(TRAIL, "nobo", hiker(TRAIL.totalMiles), []).every((p) => p.earned), "Katahdin completes the set");
});

test("the expedition summary pools the roster, and the trail totals win when given", () => {
  const crew = [
    { totalMiles: 10.5, activityCount: 2, firstActivityDate: "2026-03-04" },
    { totalMiles: 20, activityCount: 3, firstActivityDate: "2026-03-01" },
    { totalMiles: 0, activityCount: 0, firstActivityDate: null }
  ];
  assert.deepEqual(expeditionSummary(crew), { totalMiles: 30.5, activityCount: 5, firstActivityDate: "2026-03-01" });
  assert.deepEqual(expeditionSummary(crew, { totalMiles: 31, activityCount: 6 }), { totalMiles: 31, activityCount: 6, firstActivityDate: "2026-03-01" });
  assert.deepEqual(expeditionSummary([]), { totalMiles: 0, activityCount: 0, firstActivityDate: null });
  // Every hiker shares one collection: it depends only on the expedition, never on who is asking.
  const a = earnedPatchIds(landmarkPatches(TRAIL, "nobo", expeditionSummary(crew), []));
  const b = earnedPatchIds(landmarkPatches(TRAIL, "nobo", expeditionSummary([...crew].reverse()), []));
  assert.deepEqual(a, b);
});

test("patch dates come from the group marks the app already requests", () => {
  const app = readFileSync("assets/js/at/ui/app.js", "utf8");
  assert.match(app, /personal: PERSONAL_MARKS/);
  assert.doesNotMatch(app, /patchMarks/);
  assert.match(app, /expeditionSummary\(/);
});

test("collection stats: completion, nearest collectible and next state completion", () => {
  const hk = hiker(600);
  const ps = landmarkPatches(TRAIL, "nobo", hk, []);
  const c = patchCollection(ps, hk);
  const earned = ps.filter((p) => p.earned).length;
  assert.equal(c.earned, earned);
  assert.equal(c.total, TRAIL.landmarks.length);
  assert.equal(c.percent, Math.floor((earned / c.total) * 100));
  assert.equal(c.nearest.id, ps.find((p) => !p.earned).id);
  assert.equal(c.nearest.milesAway, Math.round((c.nearest.distance - 600) * 100) / 100);
  assert.ok(c.nextState && !c.nextState.complete);
  const georgia = c.stateProgress.find((s) => s.code === "GA");
  assert.ok(georgia.complete && georgia.percent === 100);
  // Two-state landmarks count toward both states.
  const twoState = ps.filter((p) => p.states.length > 1);
  assert.ok(twoState.length > 0);
  assert.equal(c.stateProgress.reduce((n, s) => n + s.total, 0), ps.length + twoState.length);
  const done = patchCollection(landmarkPatches(TRAIL, "nobo", hiker(TRAIL.totalMiles), []), hiker(TRAIL.totalMiles));
  assert.equal(done.percent, 100);
  assert.equal(done.nearest, null);
  assert.equal(done.nextState, null);
});

test("collection milestones fit the set and are dated by the nth patch", () => {
  const ps = landmarkPatches(TRAIL, "nobo", hiker(TRAIL.totalMiles), []).map((p, i) => ({ ...p, earnedOn: `2026-04-${String(i + 1).padStart(2, "0")}` }));
  const ms = patchMilestones(ps);
  assert.deepEqual(ms.map((m) => m.title), ["First Patch Earned", "10 Patches Collected", "25 Patches Collected", "All Patches Collected"],
    "50 and 100 wait until there are that many landmarks");
  assert.ok(ms.every((m) => m.earned));
  assert.equal(ms[1].earnedOn, "2026-04-10");
  assert.equal(ms[3].count, ps.length);
  const some = patchMilestones(landmarkPatches(TRAIL, "nobo", hiker(600), []));
  assert.deepEqual(some.map((m) => m.earned), [true, true, false, false]);
});

test("patches sort by trail order, by state and by date earned", () => {
  const ps = landmarkPatches(TRAIL, "nobo", hiker(600), [markFor(landmarkPatches(TRAIL, "nobo")[1].distance, "2026-03-20")]);
  assert.deepEqual(sortPatches(ps, "trail").map((p) => p.id), ps.map((p) => p.id));
  const byState = sortPatches(ps, "state").map((p) => p.stateNames[0]);
  assert.deepEqual(byState, [...byState].sort((a, b) => a.localeCompare(b)));
  const byDate = sortPatches(ps, "earned");
  assert.equal(byDate[0].earnedOn, "2026-03-20", "newest dated first");
  const firstLocked = byDate.findIndex((p) => !p.earned);
  assert.ok(byDate.slice(firstLocked).every((p) => !p.earned), "locked patches last");
  const groups = groupPatchesByState(ps);
  assert.equal(groups.reduce((n, g) => n + g.patches.length, 0), ps.length);
  assert.equal(new Set(groups.map((g) => g.state)).size, groups.length);
});

test("achievement badges are untouched by patches", () => {
  assert.equal(hikerBadges({ id: "h1", name: "Kayla", ...hiker(600) }, { today: "2026-11-20" }).length, 24);
});

test("state collections: border landmarks count for both states, and the Explorer patch is dated by the last landmark", () => {
  const ps = landmarkPatches(TRAIL, "nobo", hiker(600), []).map((p, i) => ({ ...p, earnedOn: p.earned ? `2026-05-${String(i + 1).padStart(2, "0")}` : null }));
  const states = stateCollections(ps);
  const codes = states.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  ps.forEach((p) => p.states.forEach((code) => assert.ok(states.find((s) => s.code === code).patches.includes(p), `${p.id} in ${code}`)));
  const ga = states.find((s) => s.code === "GA");
  assert.ok(ga.complete && ga.explorer.earned);
  assert.equal(ga.explorer.name, "Georgia Explorer");
  assert.equal(ga.explorer.id, "explorer-GA");
  assert.equal(ga.explorer.earnedOn, [...ga.patches.map((p) => p.earnedOn)].sort().at(-1));
  assert.equal(ga.explorer.landmarks, ga.total);
  const me = states.find((s) => s.code === "ME");
  assert.ok(!me.complete && !me.explorer.earned && me.explorer.earnedOn === null);
  const undated = stateCollections(landmarkPatches(TRAIL, "nobo", hiker(600), []));
  assert.equal(undated.find((s) => s.code === "GA").explorer.earnedOn, null, "no date unless every landmark has one");
});

test("the patch forecast follows the expedition's weekly pace, never sooner than a week", () => {
  const hk = hiker(100, { firstActivityDate: "2026-03-01" });
  const ps = landmarkPatches(TRAIL, "nobo", hk, []);
  const f = patchForecast(ps, hk, "2026-03-29");
  assert.equal(f.weeklyMiles, 25);
  const next = ps.find((p) => !p.earned);
  assert.equal(f.next.patch.id, next.id);
  assert.equal(f.next.weeks, Math.max(Math.ceil((next.distance - 100) / 25), 1));
  assert.equal(f.complete.patch.id, ps.at(-1).id);
  assert.ok(f.complete.date > f.next.date);
  const early = patchForecast(ps, hk, "2026-03-02");
  assert.equal(early.weeklyMiles, 100, "the first week counts as a whole week");
  assert.equal(patchForecast(ps, hiker(0), "2026-03-29"), null, "no pace yet");
  assert.equal(patchForecast(ps, null, "2026-03-29"), null);
  const done = hiker(TRAIL.totalMiles);
  const all = patchForecast(landmarkPatches(TRAIL, "nobo", done, []), done, "2026-09-01");
  assert.ok(all && all.next === null && all.complete === null, "nothing left to forecast");
});

test("nearby wildlife lists common species from the landmark's section only", () => {
  const theme = themeFor(DEFAULT_THEME);
  const rarity = new Map(theme.species.map((sp) => [sp.id, sp.rarity]));
  landmarkPatches(TRAIL, "nobo").forEach((p) => {
    const list = nearbyWildlife(p);
    assert.ok(list.length > 0 && list.length <= 4, `${p.id} wildlife`);
    list.forEach((w) => {
      assert.equal(rarity.get(w.id), "common", `${p.id} ${w.id}`);
      assert.ok(theme.habitats[p.region.scene].animals[w.id] > 0, `${p.id} ${w.id} lives here`);
    });
  });
  assert.deepEqual(nearbyWildlife({ region: null }), []);
});

test("State Explorer patch art is unique per state, gold-edged, and muted until earned", () => {
  const states = stateCollections(landmarkPatches(TRAIL, "nobo", hiker(600), []));
  const ids = new Set();
  states.forEach((s) => {
    const art = explorerArt(s.explorer);
    assert.match(art.attrs.class, new RegExp(`patch-art explorer-art ${s.complete ? "earned" : "locked"}`));
    assert.ok(art.attrs["aria-label"].includes(s.explorer.name));
    const nodes = walk(art);
    assert.ok(nodes.some((n) => n.kids && n.kids.some((k) => k.text === "EXPLORER")), `${s.code} says EXPLORER`);
    nodes.filter((n) => n.attrs && n.attrs.id).forEach((n) => { assert.ok(!ids.has(n.attrs.id), `duplicate id ${n.attrs.id}`); ids.add(n.attrs.id); });
  });
  const shadowed = patchArt(landmarkPatches(TRAIL, "nobo")[0], { shadow: true });
  assert.ok(walk(shadowed).some((n) => n.tag === "filter"), "a sewn-on drop shadow");
});

test("the Trail tab keeps patches off the landmark detail card", () => {
  const map = readFileSync("assets/js/at/ui/map.js", "utf8");
  const detail = map.slice(map.indexOf("function detailPanel"), map.indexOf("/**", map.indexOf("function storyBlock")));
  assert.ok(detail.length > 100);
  assert.doesNotMatch(detail, /patch/i);
});

test("Camp shows one shared Expedition collection, and resource links open safely in a new tab", () => {
  const views = readFileSync("assets/js/at/ui/views.js", "utf8");
  const camp = views.slice(views.indexOf("export function campView"));
  assert.match(camp, /patchSection\(s\)/);
  const panel = views.slice(views.indexOf("function hikerPanel"), views.indexOf("function hikersSection"));
  assert.doesNotMatch(panel, /patch/i, "no per-hiker patches on a hiker's page");
  assert.doesNotMatch(views, /patch-hiker|Show landmark patches for/, "no per-hiker patch picker on the map");
  assert.match(views, /Unlocked by the Expedition/);
  assert.match(views, /h\("a", \{ href: r\.url, target: "_blank", rel: "noopener noreferrer" \}/);
  assert.match(views, /opens in a new tab/);
  const map = readFileSync("assets/js/at/ui/map.js", "utf8");
  assert.doesNotMatch(map, /hikerName/);
});
