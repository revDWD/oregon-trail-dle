import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { LANDMARK_PATCHES } from "../../assets/js/at/trail/landmark-patches.js";
import {
  PATCH_SHAPES, RESOURCE_KINDS, groupPatchesByState, landmarkPatches, patchCollection, patchFor, patchMarks, patchMilestones, sortPatches
} from "../../assets/js/at/engine/patches.js";
import { PERSONAL_MARKS, hikerBadges } from "../../assets/js/at/engine/hikers.js";

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
const { patchArt, PATCH_MOTIFS, motifFor } = await import("../../assets/js/at/ui/patch-art.js");
const walk = (n, out = []) => { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); return out; };

const hiker = (totalMiles, extra = {}) => ({ id: "h1", name: "Kayla", totalMiles, activityCount: totalMiles > 0 ? 3 : 0, firstActivityDate: totalMiles > 0 ? "2026-03-01" : null, ...extra });
const markFor = (miles, reachedOn, hikerId = "h1") => ({ kind: "personal", mark: miles, hikerId, reachedOn });

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
    });
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

test("patches unlock from the hiker's own miles, dated by their personal marks", () => {
  const none = landmarkPatches(TRAIL, "nobo", hiker(0), []);
  assert.equal(none.filter((p) => p.earned).length, 0, "nobody earns Springer before setting out");
  const second = landmarkPatches(TRAIL, "nobo")[1];
  const miles = second.distance + 1;
  const marks = [markFor(second.distance, "2026-03-09"), markFor(second.distance, "2026-03-02", "someone-else")];
  const ps = landmarkPatches(TRAIL, "nobo", hiker(miles), marks);
  const springer = ps.find((p) => p.distance === 0);
  assert.ok(springer.earned && springer.earnedOn === "2026-03-01", "Springer: the first activity");
  ps.filter((p) => p.earned).forEach((p) => assert.ok(p.distance <= miles));
  assert.equal(ps[1].earnedOn, "2026-03-09", "uses this hiker's mark, not someone else's");
  const next = ps.find((p) => !p.earned);
  assert.equal(next.milesToGo, Math.round((next.distance - miles) * 100) / 100);
  assert.equal(landmarkPatches(TRAIL, "nobo", null, marks).filter((p) => p.earned).length, 0, "no hiker, no patches");
  assert.ok(landmarkPatches(TRAIL, "nobo", hiker(TRAIL.totalMiles), []).every((p) => p.earned), "Katahdin completes the set");
});

test("patch marks ride along with the personal marks request, within its limit", () => {
  const marks = patchMarks(TRAIL, "nobo");
  assert.equal(marks.length, TRAIL.landmarks.length - 1, "every landmark past the start");
  assert.ok(marks.every((m) => m > 0));
  assert.ok(PERSONAL_MARKS.length + marks.length <= 100, "at_expedition_marks accepts at most 100 values");
  const app = readFileSync("assets/js/at/ui/app.js", "utf8");
  assert.match(app, /personal: \[\.\.\.PERSONAL_MARKS, \.\.\.patchMarks\(TRAIL, DIRECTION\)\]/);
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
  assert.equal(hikerBadges(hiker(600), { today: "2026-11-20" }).length, 24);
});

test("the Trail tab keeps patches off the landmark detail card", () => {
  const map = readFileSync("assets/js/at/ui/map.js", "utf8");
  const detail = map.slice(map.indexOf("function detailPanel"), map.indexOf("/**", map.indexOf("function storyBlock")));
  assert.ok(detail.length > 100);
  assert.doesNotMatch(detail, /patch/i);
});

test("Camp shows each hiker's patch collection, and resource links open safely in a new tab", () => {
  const views = readFileSync("assets/js/at/ui/views.js", "utf8");
  const panel = views.slice(views.indexOf("function hikerPanel"));
  assert.match(panel, /patchSection\(s, hk\)/);
  assert.match(views, /h\("a", \{ href: r\.url, target: "_blank", rel: "noopener noreferrer" \}/);
  assert.match(views, /opens in a new tab/);
});