// Appalachian Trail map: the centrepiece of the Trail page.
// US state outlines, coloured regional sections, the route, mile posts, landmark buttons with a detail
// panel, the hiker, the crew camp and crew-mates. Zoom and pan with buttons, keyboard, wheel, drag
// or pinch. Everything shown on the map is also available as text (detail panel + lists).
import { h, svg, formatMiles } from "./dom.js";
import { landmarkArt } from "./illustrations.js";
import { mileMarkers, regionsInOrder, positionFor } from "../engine/progress.js";

// Same simplified Albers projection that generated us-states.js (viewBox 0 0 1000 570).
const P = {
  phi1: 29.5 * Math.PI / 180, phi2: 45.5 * Math.PI / 180, phi0: 37.5 * Math.PI / 180, lambda0: -96 * Math.PI / 180,
  minX: -0.368884145, maxY: 0.245812912, scale: 1195.745075957, offsetX: 68.338458614, offsetY: 12
};

export function project(lat, lon) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const n = (Math.sin(P.phi1) + Math.sin(P.phi2)) / 2;
  const c = Math.cos(P.phi1) ** 2 + 2 * n * Math.sin(P.phi1);
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(P.phi0)) / n;
  const rho = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
  const theta = n * (lambda - P.lambda0);
  return { x: P.offsetX + (rho * Math.sin(theta) - P.minX) * P.scale, y: P.offsetY + (P.maxY - (rho0 - rho * Math.cos(theta))) * P.scale };
}

// Bounding box of the eastern US corners; the conic projection bends, so all four corners are needed.
export function mapViewBox() {
  const corners = [[47.8, -87.5], [47.8, -66.5], [33.2, -87.5], [33.2, -66.5]].map(([lat, lon]) => project(lat, lon));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// ---- Pure view maths (tested) ----------------------------------------------------------------------
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function defaultView(base = mapViewBox()) {
  return { cx: base.x + base.width / 2, cy: base.y + base.height / 2, zoom: 1 };
}

// Keep the zoom in range and the visible window inside the base map.
export function clampView(view, base = mapViewBox()) {
  const zoom = Math.min(Math.max(Number(view.zoom) || 1, MIN_ZOOM), MAX_ZOOM);
  const halfW = base.width / zoom / 2;
  const halfH = base.height / zoom / 2;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  return {
    zoom,
    cx: clamp(Number.isFinite(view.cx) ? view.cx : base.x + base.width / 2, base.x + halfW, base.x + base.width - halfW),
    cy: clamp(Number.isFinite(view.cy) ? view.cy : base.y + base.height / 2, base.y + halfH, base.y + base.height - halfH)
  };
}

export function viewBoxOf(view, base = mapViewBox()) {
  const v = clampView(view, base);
  const w = base.width / v.zoom;
  const hgt = base.height / v.zoom;
  return { x: v.cx - w / 2, y: v.cy - hgt / 2, width: w, height: hgt };
}

// Zoom by `factor`, keeping the map point under `focus` (map coordinates) fixed on screen.
export function zoomView(view, factor, focus = null, base = mapViewBox()) {
  const v = clampView(view, base);
  const zoom = Math.min(Math.max(v.zoom * factor, MIN_ZOOM), MAX_ZOOM);
  if (!focus) return clampView({ ...v, zoom }, base);
  const k = v.zoom / zoom;
  return clampView({ zoom, cx: focus.x + (v.cx - focus.x) * k, cy: focus.y + (v.cy - focus.y) * k }, base);
}

export function panView(view, dx, dy, base = mapViewBox()) {
  const v = clampView(view, base);
  return clampView({ ...v, cx: v.cx + dx, cy: v.cy + dy }, base);
}

// A view that frames a set of lat/lon points with some padding.
export function fitView(points, base = mapViewBox(), pad = 30) {
  if (!points.length) return defaultView(base);
  const ps = points.map((p) => project(p.lat, p.lon));
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const hgt = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const zoom = Math.min(base.width / w, base.height / hgt);
  return clampView({ zoom, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 }, base);
}

// Route points (and interpolated ends) inside a northbound mile range.
export function routeSlice(trail, from, to) {
  const inside = trail.route.filter((r) => r.miles > from && r.miles < to);
  const at = (m) => positionFor(trail, m, "nobo");
  return [{ miles: from, ...at(from) }, ...inside, { miles: to, ...at(to) }];
}

// ---- Rendering ----------------------------------------------------------------------------------------
// Map state survives re-renders of the page (the app redraws views when data changes).
const memory = { view: null, selectedId: null };

function addStates(layer, markup) {
  if (!markup) return;
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
  doc.querySelectorAll("path.state-shapes, .state-shapes path").forEach((node) => layer.append(document.importNode(node, true)));
}

const line = (points) => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
const projectAll = (points) => points.map((r) => project(r.lat, r.lon));

export function landmarkStatus(landmark, progress) {
  if (landmark.passed) return landmark.distance === 0 && progress.distanceMiles === 0 ? "Starting point" : "Passed";
  if (progress.nextLandmark && landmark.id === progress.nextLandmark.id) return `Next up: ${formatMiles(progress.distanceToNext)} to go`;
  return `${formatMiles(landmark.distance - progress.distanceMiles)} ahead`;
}

function detailPanel(trail, progress, landmark) {
  const region = (trail.regions || []).find((r) => landmark.miles >= r.start && landmark.miles <= r.end);
  return h("div", { class: `map-detail${landmark.passed ? " passed" : ""}` },
    landmarkArt(landmark.kind, `Illustration: ${landmark.kind} scenery`),
    h("div", {},
      h("h3", {}, landmark.name, h("span", { class: "hint" }, `, ${landmark.state}`)),
      h("p", { class: "tag" }, landmarkStatus(landmark, progress)),
      h("dl", { class: "facts" },
        h("dt", {}, "Trail mile"), h("dd", {}, `${formatMiles(landmark.distance)} from ${trail.directions[progress.direction].from.split(",")[0]}`),
        landmark.elevationFt ? [h("dt", {}, "Elevation"), h("dd", {}, `about ${landmark.elevationFt.toLocaleString("en-US")} ft`)] : null,
        region ? [h("dt", {}, "Section"), h("dd", {}, region.name)] : null,
        landmark.access ? [h("dt", {}, "Trailhead"), h("dd", {}, landmark.access)] : null),
      h("p", {}, landmark.trivia)));
}

/**
 * @param trail     trail data
 * @param progress  computeProgress() result for the player
 * @param options   { crew: [{ name, me, totalMiles }], crewMiles: number|null, stateMarkup }
 */
export function renderTrailMap(trail, progress, { crew = [], crewMiles = null, stateMarkup = globalThis.AT_US_STATES } = {}) {
  const base = mapViewBox();
  let view = memory.view ? clampView(memory.view, base) : defaultView(base);
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  const zoomLabel = h("span", { class: "zoom-level", "aria-hidden": "true" });

  const root = svg("svg", { class: "trail-map", role: "group", "aria-labelledby": "trail-map-title trail-map-desc", tabindex: "0" });
  root.append(
    svg("title", { id: "trail-map-title" }, `${trail.name} map`),
    svg("desc", { id: "trail-map-desc" }, `${progress.percent}% of the ${trail.name} completed. ${progress.nextLandmark ? `Next landmark: ${progress.nextLandmark.name}, ${progress.distanceToNext} miles away.` : "The trail is complete."} Use the map buttons, or plus, minus and arrow keys, to zoom and pan. Landmarks are buttons that show details below the map.`)
  );
  const states = svg("g", { class: "map-states", "aria-hidden": "true" });
  addStates(states, stateMarkup);
  root.append(states);

  // Regional sections as soft coloured bands under the route.
  const bands = svg("g", { class: "map-regions", "aria-hidden": "true" });
  (trail.regions || []).forEach((r) => bands.append(svg("path", { class: "map-region", d: line(projectAll(routeSlice(trail, r.start, r.end))), stroke: r.color, "data-region": r.id })));
  root.append(bands);
  root.append(svg("path", { class: "map-route", d: line(projectAll(trail.route)), "aria-hidden": "true" }));

  // Walked part, in the player's direction.
  const marker = progress.position.marker;
  const walkedPts = progress.direction === "sobo" ? routeSlice(trail, marker, trail.totalMiles) : routeSlice(trail, 0, marker);
  if (progress.distanceMiles > 0) root.append(svg("path", { class: "map-walked", d: line(projectAll(walkedPts)), "aria-hidden": "true" }));

  // Mile posts.
  const posts = svg("g", { class: "map-posts", "aria-hidden": "true" });
  mileMarkers(trail, progress.direction, 250).forEach((m) => {
    const p = project(m.lat, m.lon);
    posts.append(svg("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 1.6 }),
      svg("text", { x: (p.x + 5).toFixed(1), y: (p.y + 3).toFixed(1) }, String(m.distance)));
  });
  root.append(posts);

  // Crew-mates and the crew camp (combined miles).
  const others = svg("g", { class: "map-crew", "aria-hidden": "true" });
  crew.filter((c) => !c.me).forEach((c) => {
    const pos = positionFor(trail, c.totalMiles, progress.direction);
    const p = project(pos.lat, pos.lon);
    others.append(svg("circle", { class: "map-mate", cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3.4 }, svg("title", {}, `${c.name}: ${formatMiles(c.totalMiles)}`)));
  });
  if (crewMiles !== null) {
    const pos = positionFor(trail, crewMiles, progress.direction);
    const p = project(pos.lat, pos.lon);
    others.append(svg("path", { class: "map-camp", d: `M${(p.x - 6).toFixed(1)},${(p.y + 4).toFixed(1)} L${p.x.toFixed(1)},${(p.y - 6).toFixed(1)} L${(p.x + 6).toFixed(1)},${(p.y + 4).toFixed(1)}Z` }));
  }
  root.append(others);

  // Landmarks: focusable buttons that fill the detail panel.
  const panel = h("div", { class: "map-detail-wrap" });
  const marks = svg("g", { class: "map-landmarks" });
  const nodes = new Map();
  const select = (id, { announce = true } = {}) => {
    const lm = progress.landmarks.find((l) => l.id === id) || progress.nextLandmark || progress.landmarks[progress.landmarks.length - 1];
    memory.selectedId = lm.id;
    nodes.forEach((node, key) => node.setAttribute("aria-pressed", key === lm.id ? "true" : "false"));
    panel.replaceChildren(detailPanel(trail, progress, lm));
    if (announce) live.textContent = `${lm.name}: ${landmarkStatus(lm, progress)}. Details below the map.`;
  };
  progress.landmarks.forEach((lm) => {
    const p = project(lm.lat, lm.lon);
    const isNext = progress.nextLandmark && lm.id === progress.nextLandmark.id;
    const g = svg("g", {
      class: `map-landmark${lm.passed ? " passed" : ""}${isNext ? " next" : ""}`, role: "button", tabindex: "0",
      "aria-label": `${lm.name}, ${lm.state}. ${landmarkStatus(lm, progress)}.`, "aria-pressed": "false", "data-landmark": lm.id,
      onClick: () => select(lm.id),
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(lm.id); } }
    },
    svg("circle", { class: "hit", cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 12 }),
    isNext ? svg("circle", { class: "pulse", cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 7 }) : null,
    svg("circle", { class: "dot", cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: lm.kind === "terminus" ? 4.4 : 3.4 }));
    nodes.set(lm.id, g);
    marks.append(g);
  });
  root.append(marks);

  const here = project(progress.position.lat, progress.position.lon);
  root.append(svg("g", { class: "map-hiker", "aria-hidden": "true" },
    svg("circle", { cx: here.x.toFixed(1), cy: here.y.toFixed(1), r: 9, class: "map-hiker-halo" }),
    svg("circle", { cx: here.x.toFixed(1), cy: here.y.toFixed(1), r: 5, class: "map-hiker-dot" })));

  // ---- View handling -------------------------------------------------------------------------------
  const apply = () => {
    memory.view = view;
    const b = viewBoxOf(view, base);
    root.setAttribute("viewBox", `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.width.toFixed(1)} ${b.height.toFixed(1)}`);
    // Markers and labels keep roughly the same on-screen size as you zoom.
    root.style.setProperty("--z", String(view.zoom));
    root.style.touchAction = view.zoom > 1.01 ? "none" : "pan-y";
    zoomLabel.textContent = `${Math.round(view.zoom * 10) / 10}×`;
  };
  const setView = (next, text) => { view = clampView(next, base); apply(); if (text) live.textContent = text; };
  const toMap = (clientX, clientY) => {
    const r = root.getBoundingClientRect();
    const b = viewBoxOf(view, base);
    return { x: b.x + ((clientX - r.left) / r.width) * b.width, y: b.y + ((clientY - r.top) / r.height) * b.height };
  };
  const panStep = () => viewBoxOf(view, base).width * 0.15;
  const focusHere = () => fitView([progress.position, ...(progress.nextLandmark ? [progress.nextLandmark] : [])], base, 50);

  root.addEventListener("keydown", (e) => {
    if (e.target !== root) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key === "+" || e.key === "=") setView(zoomView(view, 1.5, null, base), "Zoomed in.");
    else if (e.key === "-" || e.key === "_") setView(zoomView(view, 1 / 1.5, null, base), "Zoomed out.");
    else if (moves[e.key] && view.zoom > 1) setView(panView(view, moves[e.key][0] * panStep(), moves[e.key][1] * panStep(), base));
    else return;
    e.preventDefault();
  });
  root.addEventListener("wheel", (e) => {
    if (view.zoom === 1 && e.deltaY > 0) return; // fully zoomed out: let the page scroll
    e.preventDefault();
    setView(zoomView(view, e.deltaY < 0 ? 1.25 : 0.8, toMap(e.clientX, e.clientY), base));
  }, { passive: false });

  const pointers = new Map();
  let pinch = null;
  let dragged = false;
  root.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  });
  root.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      const target = pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / (pinch.dist || 1));
      setView(zoomView(view, target / view.zoom, mid, base));
      dragged = true;
    } else if (pointers.size === 1 && view.zoom > 1) {
      const r = root.getBoundingClientRect();
      const b = viewBoxOf(view, base);
      const dx = ((prev.x - e.clientX) / r.width) * b.width;
      const dy = ((prev.y - e.clientY) / r.height) * b.height;
      if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) > 2) dragged = true;
      setView(panView(view, dx, dy, base));
    }
  });
  const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
  // A drag that ends on a landmark should not select it.
  root.addEventListener("click", (e) => { if (dragged) { e.stopPropagation(); dragged = false; } }, true);

  const btn = (label, text, onClick) => h("button", { class: "btn small", type: "button", "aria-label": label, onClick }, text);
  const toolbar = h("div", { class: "map-tools", role: "toolbar", "aria-label": "Map controls" },
    btn("Zoom in", "+", () => setView(zoomView(view, 1.5, null, base), "Zoomed in.")),
    btn("Zoom out", "−", () => setView(zoomView(view, 1 / 1.5, null, base), "Zoomed out.")),
    zoomLabel,
    btn("Show where I am and the next landmark", "Find me", () => setView(focusHere(), "Showing your position and the next landmark.")),
    btn("Show the whole trail", "Whole trail", () => setView(defaultView(base), "Showing the whole trail.")));

  // Sections: progress per region; choosing one frames it on the map.
  const sections = h("ol", { class: "sections" }, regionsInOrder(trail, progress).map((r) => h("li", { class: r.current ? "current" : r.percent >= 100 ? "done" : "" },
    h("button", { type: "button", class: "section-btn", style: `--region:${r.color}`,
      "aria-label": `${r.name} (${r.states}), ${formatMiles(r.lengthMiles)}, ${r.percent}% walked${r.current ? ", you are here" : ""}. Show on map.`,
      onClick: () => { setView(fitView(routeSlice(trail, r.start, r.end), base, 24), `Showing ${r.name}.`); root.scrollIntoView?.({ block: "nearest" }); } },
      h("span", { class: "swatch", "aria-hidden": "true" }),
      h("span", { class: "section-name" }, r.name, r.current ? h("span", { class: "you" }, " · you are here") : null),
      h("span", { class: "section-bar", "aria-hidden": "true" }, h("span", { style: `width:${r.percent}%` })),
      h("span", { class: "hint" }, `${r.states} · ${formatMiles(r.lengthMiles)} · ${r.percent}%`)))));

  const legend = h("ul", { class: "map-legend", "aria-label": "Map key" },
    h("li", {}, h("span", { class: "key you", "aria-hidden": "true" }), "You"),
    h("li", {}, h("span", { class: "key walked", "aria-hidden": "true" }), "Walked"),
    h("li", {}, h("span", { class: "key next", "aria-hidden": "true" }), "Next landmark"),
    crew.some((c) => !c.me) ? h("li", {}, h("span", { class: "key mate", "aria-hidden": "true" }), "Crew-mates") : null,
    crewMiles !== null ? h("li", {}, h("span", { class: "key camp", "aria-hidden": "true" }), "Crew camp (combined miles)") : null,
    h("li", {}, h("span", { class: "key post", "aria-hidden": "true" }), "Mile posts every 250 mi"));

  apply();
  select(memory.selectedId, { announce: false });
  return h("div", { class: "map-wrap" }, toolbar, h("div", { class: "map-frame" }, root), legend, live, panel,
    h("h3", { class: "sections-title" }, "Trail sections"), sections);
}

// Testing hook: forget remembered zoom/selection.
export function resetMapMemory() { memory.view = null; memory.selectedId = null; }
