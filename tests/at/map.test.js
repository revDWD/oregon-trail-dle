import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { computeProgress } from "../../assets/js/at/engine/progress.js";
import {
  project, mapViewBox, MIN_ZOOM, MAX_ZOOM, defaultView, clampView, viewBoxOf, zoomView, panView, fitView, routeSlice, landmarkStatus, layoutPatches,
  patchIconSize
} from "../../assets/js/at/ui/map.js";

const base = mapViewBox();
const inside = (b) => b.x >= base.x - 1e-6 && b.y >= base.y - 1e-6 && b.x + b.width <= base.x + base.width + 1e-6 && b.y + b.height <= base.y + base.height + 1e-6;

test("the whole trail projects inside the base map", () => {
  TRAIL.route.forEach((r) => {
    const p = project(r.lat, r.lon);
    assert.ok(p.x > base.x && p.x < base.x + base.width && p.y > base.y && p.y < base.y + base.height, `${r.lat},${r.lon}`);
  });
});

test("default view shows the whole map at zoom 1", () => {
  const b = viewBoxOf(defaultView(base), base);
  assert.equal(b.width.toFixed(3), base.width.toFixed(3));
  assert.equal(b.x.toFixed(3), base.x.toFixed(3));
});

test("zoom is clamped and the window never leaves the map", () => {
  assert.equal(clampView({ zoom: 99, cx: 0, cy: 0 }, base).zoom, MAX_ZOOM);
  assert.equal(clampView({ zoom: 0.1, cx: 0, cy: 0 }, base).zoom, MIN_ZOOM);
  assert.ok(inside(viewBoxOf({ zoom: 3, cx: -5000, cy: 9000 }, base)));
  let v = defaultView(base);
  for (let i = 0; i < 20; i += 1) v = zoomView(v, 1.5, null, base);
  assert.equal(v.zoom, MAX_ZOOM);
  for (let i = 0; i < 20; i += 1) v = zoomView(v, 1 / 1.5, null, base);
  assert.equal(v.zoom, MIN_ZOOM);
});

test("zooming around a focus point keeps that point fixed on screen", () => {
  const start = { zoom: 2, cx: base.x + base.width / 2, cy: base.y + base.height / 2 };
  const focus = { x: start.cx + 20, y: start.cy - 10 };
  const before = viewBoxOf(start, base);
  const after = viewBoxOf(zoomView(start, 2, focus, base), base);
  const rel = (b) => [(focus.x - b.x) / b.width, (focus.y - b.y) / b.height];
  rel(before).forEach((v, i) => assert.ok(Math.abs(v - rel(after)[i]) < 1e-9));
});

test("panning moves the view only when there is room", () => {
  const d = defaultView(base);
  const still = panView(d, 50, 50, base);
  assert.ok(Math.abs(still.cx - d.cx) < 1e-6 && Math.abs(still.cy - d.cy) < 1e-6);
  const z = zoomView(d, 3, null, base);
  const moved = panView(z, 10, -5, base);
  assert.ok(Math.abs(moved.cx - z.cx - 10) < 1e-9 && Math.abs(moved.cy - z.cy + 5) < 1e-9);
});

test("fitView frames a region tightly and contains its points", () => {
  const region = TRAIL.regions.find((r) => r.id === "maine");
  const pts = routeSlice(TRAIL, region.start, region.end);
  const v = fitView(pts, base, 10);
  assert.ok(v.zoom > 2);
  const b = viewBoxOf(v, base);
  pts.forEach((p) => { const q = project(p.lat, p.lon); assert.ok(q.x >= b.x && q.x <= b.x + b.width && q.y >= b.y && q.y <= b.y + b.height); });
  assert.deepEqual(fitView([], base), defaultView(base));
});

test("routeSlice starts and ends at the requested miles", () => {
  const s = routeSlice(TRAIL, 100, 900);
  assert.equal(s[0].miles, 100);
  assert.equal(s[s.length - 1].miles, 900);
  assert.ok(s.slice(1, -1).every((r) => r.miles > 100 && r.miles < 900));
});

test("landmark status reads as passed, next, or distance ahead", () => {
  const p = computeProgress(TRAIL, 100, "nobo");
  assert.equal(landmarkStatus(p.landmarks.find((l) => l.passed && l.distance > 0), p), "Passed");
  assert.match(landmarkStatus(p.nextLandmark, p), /^Next up: /);
  assert.match(landmarkStatus(p.landmarks[p.landmarks.length - 1], p), / ahead$/);
  const zero = computeProgress(TRAIL, 0, "nobo");
  assert.equal(landmarkStatus(zero.landmarks[0], zero), "Starting point");
});

test("every earned patch stays individually visible: crowded patches nudge apart instead of hiding behind a count", () => {
  const pts = TRAIL.landmarks.map((l) => ({ id: l.id, ...project(l.lat, l.lon) }));
  const minGap = (placed, size) => {
    let gap = Infinity;
    placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => { gap = Math.min(gap, Math.hypot(a.cx - b.cx, a.cy - b.cy)); }));
    return gap / size;
  };
  for (const zoom of [1, 2, 4, MAX_ZOOM]) {
    const size = patchIconSize(zoom);
    const placed = layoutPatches(pts, size);
    assert.deepEqual(placed.map((p) => p.id), pts.map((p) => p.id), "one icon per patch, in trail order");
    assert.ok(minGap(placed, size) > 0.8, `patches overlap at most slightly at ${zoom}×`);
    placed.forEach((p) => assert.ok(Math.hypot(p.cx - p.x, p.cy - p.y) < size * 4, `${p.id} stays near its landmark at ${zoom}×`));
  }
  const moved = (zoom) => layoutPatches(pts, patchIconSize(zoom)).filter((p) => p.moved).length;
  assert.ok(moved(1) > 0, "the crowded southern sections need nudging across the whole trail");
  assert.ok(moved(MAX_ZOOM) < moved(1), "zooming in lets patches settle back beside their landmarks");
  const [alone] = layoutPatches([{ x: 100, y: 100 }], 10);
  assert.deepEqual([alone.cx, alone.cy, alone.moved], [106, 94, false], "a lone patch sits up and to the right of its landmark");
  const twins = layoutPatches([{ x: 0, y: 0 }, { x: 0, y: 0 }], 10);
  assert.ok(Math.hypot(twins[0].cx - twins[1].cx, twins[0].cy - twins[1].cy) > 8, "patches on the same spot still separate");
  assert.deepEqual(layoutPatches(pts, 16), layoutPatches(pts, 16), "the layout is deterministic");
  assert.deepEqual(layoutPatches([], 10), []);
});
test("patch icons are small across the whole trail and grow on screen as you zoom, within the zoom limits", () => {
  assert.equal(patchIconSize(1), 16, "small at 1× so crowded sections fit");
  const onScreen = (z) => patchIconSize(z) * z;
  assert.ok(onScreen(2) > onScreen(1) && onScreen(MAX_ZOOM) > onScreen(2), "grows on screen");
  assert.ok(onScreen(MAX_ZOOM) > 36 && onScreen(MAX_ZOOM) < 16 * MAX_ZOOM / 2, "large up close, but far less than the map itself");
  assert.equal(patchIconSize(MAX_ZOOM * 10), patchIconSize(MAX_ZOOM));
  assert.equal(patchIconSize(undefined), patchIconSize(1));
});
