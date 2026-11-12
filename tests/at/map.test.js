import test from "node:test";
import assert from "node:assert/strict";
import { APPALACHIAN_TRAIL as TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";
import { computeProgress } from "../../assets/js/at/engine/progress.js";
import {
  project, mapViewBox, MIN_ZOOM, MAX_ZOOM, defaultView, clampView, viewBoxOf, zoomView, panView, fitView, routeSlice, landmarkStatus, clusterPoints
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

test("patch icons cluster when they would overlap and split apart as the map zooms in", () => {
  const pts = TRAIL.landmarks.map((l) => ({ id: l.id, ...project(l.lat, l.lon) }));
  const wide = clusterPoints(pts, 17);
  const close = clusterPoints(pts, 17 / MAX_ZOOM);
  assert.equal(wide.flatMap((g) => g.members).length, pts.length, "every patch is in exactly one group");
  assert.ok(wide.length < pts.length, "dense landmarks cluster at the default zoom");
  assert.ok(close.length > wide.length, "zooming in separates them");
  wide.forEach((g) => {
    const mx = g.members.reduce((s, m) => s + m.x, 0) / g.members.length;
    assert.ok(Math.abs(g.x - mx) < 1e-9, "a cluster sits at its members' centre");
  });
  assert.deepEqual(clusterPoints([{ x: 0, y: 0 }, { x: 50, y: 0 }], 10).map((g) => g.members.length), [1, 1]);
  assert.deepEqual(clusterPoints([], 10), []);
});