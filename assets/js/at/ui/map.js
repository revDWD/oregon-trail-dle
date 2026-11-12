// Appalachian Trail map: the centrepiece of the Trail page.
// US state outlines, coloured regional sections, the route, mile posts, landmark buttons with a detail
// panel, the hiker, the crew camp, crew-mates and a hiker's earned landmark patches. Zoom and pan with buttons, keyboard, wheel, drag
// or pinch. Everything shown on the map is also available as text (detail panel + lists).
import { h, svg, fill, formatMiles, formatDay } from "./dom.js";
import { patchArt } from "./patch-art.js";
import { landmarkArt } from "./illustrations.js";
import { mileMarkers, journeyProgress, journeyWindow, positionFor } from "../engine/progress.js";
import { landmarkStory } from "../trail/landmark-stories.js";
import { LANDMARK_PHOTOS } from "../trail/landmark-photos.js";

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
// On-screen size of a map patch icon, in base map units (about a pixel each on a phone).
const PATCH_ICON = 24;

// Map-unit size of a patch icon at this zoom: it grows gently as you zoom in (about 24px at 1× and
// 40px at 8× on screen), so patches stand out without hiding the trail.
export function patchIconSize(zoom) {
  const z = Math.min(Math.max(Number(zoom) || 1, MIN_ZOOM), MAX_ZOOM);
  return (PATCH_ICON * z ** 0.25) / z;
}

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

// Groups map points closer than `minDist` (map units) so earned patches never pile up on each other.
// Points keep their order; a group sits at the average position of its members.
// A four-point sparkle centred on (x, y), for freshly earned patches.
function sparkle(x, y, r) {
  const k = r * 0.28;
  const f = (n) => n.toFixed(2);
  return `M${f(x)} ${f(y - r)} L${f(x + k)} ${f(y - k)} L${f(x + r)} ${f(y)} L${f(x + k)} ${f(y + k)} L${f(x)} ${f(y + r)} L${f(x - k)} ${f(y + k)} L${f(x - r)} ${f(y)} L${f(x - k)} ${f(y - k)}Z`;
}

export function clusterPoints(points, minDist) {
  const groups = [];
  points.forEach((pt) => {
    const near = groups.find((g) => Math.hypot(g.x - pt.x, g.y - pt.y) < minDist);
    if (!near) { groups.push({ x: pt.x, y: pt.y, members: [pt] }); return; }
    near.members.push(pt);
    near.x += (pt.x - near.x) / near.members.length;
    near.y += (pt.y - near.y) / near.members.length;
  });
  return groups;
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
    landmarkPicture(landmark),
    h("div", {},
      h("h3", {}, landmark.name, h("span", { class: "hint" }, `, ${landmark.state}`)),
      h("p", { class: "tag" }, landmarkStatus(landmark, progress)),
      h("dl", { class: "facts" },
        h("dt", {}, "Trail mile"), h("dd", {}, `${formatMiles(landmark.distance)} from ${trail.directions[progress.direction].from.split(",")[0]}`),
        landmark.elevationFt ? [h("dt", {}, "Elevation"), h("dd", {}, `about ${landmark.elevationFt.toLocaleString("en-US")} ft`)] : null,
        region ? [h("dt", {}, "Section"), h("dd", {}, region.name)] : null,
        landmark.access ? [h("dt", {}, "Trailhead"), h("dd", {}, landmark.access)] : null),
      h("p", {}, landmark.trivia),
      storyBlock(landmark)));
}

// A real, credited photo (landmark-stories `photo` overrides the generated LANDMARK_PHOTOS), else the
// pixel-art scene. If the photo fails to load, the pixel art takes its place.
export function landmarkPhoto(id) {
  return landmarkStory(id)?.photo || LANDMARK_PHOTOS[id] || null;
}

export function landmarkPicture(landmark) {
  const art = () => landmarkArt(landmark.kind, `Illustration: ${landmark.kind} scenery`);
  const photo = landmarkPhoto(landmark.id);
  if (!photo) return art();
  const link = (href, text) => href ? h("a", { href, target: "_blank", rel: "noopener" }, text) : text;
  const figure = h("figure", { class: "story-photo" },
    h("img", { src: photo.src, alt: photo.alt || `Photograph of ${landmark.name}`, loading: "lazy", decoding: "async", width: 1024, height: 683,
      onError: () => figure.replaceWith(art()) }),
    h("figcaption", { class: "hint" }, "Photo: ", photo.credit, photo.year ? `, ${photo.year}` : "",
      photo.license ? [" · ", link(photo.licenseUrl, photo.license)] : null,
      photo.sourceUrl ? [" · ", link(photo.sourceUrl, "source")] : null));
  return figure;
}

// The educational layer: history, nature, a fun fact and Kevin's notes.
function storyBlock(landmark) {
  const story = landmarkStory(landmark.id);
  if (!story) return null;
  const part = (cls, title, text) => text ? h("div", { class: `story-part ${cls}` }, h("h4", {}, title), h("p", {}, text)) : null;
  return h("div", { class: "landmark-story" },
    part("history", "Why It Matters", story.history),
    part("nature", "Nature Notes", story.nature),
    part("dyk", "Did You Know?", story.didYouKnow),
    part("kevin", "Kevin's Trail Notes", story.kevin),
    story.learnMore ? h("p", { class: "hint" }, h("a", { href: story.learnMore.url, target: "_blank", rel: "noopener" }, `Learn more: ${story.learnMore.label}`)) : null);
}

/**
 * @param trail     trail data
 * @param progress  computeProgress() result for the player
 * @param options   { crew: [{ name, me, totalMiles }], crewMiles: number|null, stateMarkup,
 *                    patches: { hikerName, list: landmarkPatches(), fresh: [patch ids just earned] } | null }
 */
export function renderTrailMap(trail, progress, { crew = [], crewMiles = null, stateMarkup = globalThis.AT_US_STATES, patches = null } = {}) {
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

  // Earned landmark patches: a sewn-on patch beside each landmark, like a passport filling in. Icons
  // grow gently with zoom and gather into a numbered cluster when they crowd. Hovering with a mouse
  // previews a patch; a click, tap or Enter pins the card open.
  const patchLayer = svg("g", { class: "map-patches" });
  const pop = h("div", { class: "patch-pop", role: "dialog", "aria-label": "Landmark patch details", hidden: "" });
  let fresh = new Set((patches && patches.fresh) || []);
  const earnedPatches = ((patches && patches.list) || []).filter((pt) => pt.earned).map((pt) => {
    const lm = progress.landmarks.find((l) => l.id === pt.landmarkId) || (trail.landmarks || []).find((l) => l.id === pt.landmarkId);
    return lm ? { ...project(lm.lat, lm.lon), patch: pt } : null;
  }).filter(Boolean);
  const earnedText = (pt) => (pt.earnedOn ? `Earned ${formatDay(pt.earnedOn)}` : "Earned");
  let returnFocus = null;
  let hovering = false;
  let hoverTimer = null;
  const closePop = ({ restoreFocus = true } = {}) => {
    clearTimeout(hoverTimer);
    if (pop.hidden) return;
    pop.hidden = true;
    hovering = false;
    if (!restoreFocus) return;
    const back = returnFocus && returnFocus.isConnected ? returnFocus : root;
    back.focus?.();
  };
  const patchFacts = (pt) => h("dl", { class: "patch-pop-facts" },
    h("dt", {}, "Landmark"), h("dd", {}, pt.landmarkName),
    h("dt", {}, "State"), h("dd", {}, pt.stateNames.join(" / ") || pt.state),
    h("dt", {}, "Mile"), h("dd", {}, `${Number(pt.mile).toLocaleString("en-US")} of ${Number(trail.totalMiles).toLocaleString("en-US")}`),
    h("dt", {}, "Earned"), h("dd", {}, `${pt.earnedOn ? formatDay(pt.earnedOn) : "Yes"}${patches.hikerName ? ` by ${patches.hikerName}` : ""}`));
  const openPatches = (list, from, { hover = false } = {}) => {
    clearTimeout(hoverTimer);
    returnFocus = from;
    hovering = hover;
    const single = list.length === 1;
    fill(pop,
      h("div", { class: "patch-pop-head" },
        h("p", { class: "patch-pop-title" }, single ? list[0].name : `${list.length} landmark patches`),
        h("button", { class: "btn small", type: "button", "aria-label": "Close patch details", onClick: () => closePop() }, "Close")),
      single
        ? h("div", { class: "patch-pop-card" },
          patchArt(list[0], { shadow: true }),
          h("div", {}, patchFacts(list[0]), h("p", { class: "patch-pop-desc" }, list[0].description)))
        : h("ul", { class: "patch-pop-list" }, list.map((pt) => h("li", { class: "patch-pop-item" },
          patchArt(pt, { shadow: true }),
          h("div", {},
            h("strong", {}, pt.name),
            h("p", { class: "hint" }, `${pt.stateNames.join(" / ") || pt.state} · Mile ${pt.mile} · ${earnedText(pt)}`),
            h("p", {}, pt.description))))));
    pop.classList.toggle("single", single);
    pop.hidden = false;
    if (!hover) pop.querySelector("button")?.focus();
    live.textContent = single ? `${list[0].name}. ${earnedText(list[0])}.` : `${list.length} landmark patches: ${list.map((pt) => pt.landmarkName).join(", ")}.`;
  };
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closePop(); } });
  pop.addEventListener("pointerenter", () => clearTimeout(hoverTimer));
  pop.addEventListener("pointerleave", (e) => { if (hovering && e.pointerType === "mouse") hoverTimer = setTimeout(() => closePop({ restoreFocus: false }), 250); });
  pop.addEventListener("focusin", () => { hovering = false; });
  const asButton = (attrs, onActivate, ...children) => svg("g", {
    ...attrs, role: "button", tabindex: "0",
    onClick: (e) => onActivate(e.currentTarget),
    onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(e.currentTarget); } }
  }, ...children);
  const sparkles = (cx, cy, size) => svg("g", { class: "patch-sparkles", "aria-hidden": "true" }, [[-0.62, -0.5], [0.6, -0.58], [0.66, 0.42]].map(([dx, dy]) =>
    svg("path", { d: sparkle(cx + dx * size, cy + dy * size, size * 0.16) })));
  const patchIcon = (group, size) => {
    // Up and to the right of the landmark dot, so the dot stays visible.
    const cx = group.x + size * 0.6;
    const cy = group.y - size * 0.6;
    if (group.members.length === 1) {
      const pt = group.members[0].patch;
      const art = patchArt(pt, { mini: true, decorative: true, shadow: true });
      art.setAttribute("x", (cx - size / 2).toFixed(2));
      art.setAttribute("y", (cy - size / 2).toFixed(2));
      art.setAttribute("width", size.toFixed(2));
      art.setAttribute("height", size.toFixed(2));
      art.setAttribute("overflow", "visible");
      const isFresh = fresh.has(pt.id);
      const icon = asButton({ class: `map-patch${isFresh ? " fresh" : ""}`, "data-patch": pt.landmarkId, "aria-label": `${pt.name}, earned${pt.earnedOn ? ` ${formatDay(pt.earnedOn)}` : ""}. Show patch.` },
        (el) => openPatches([pt], el),
        svg("title", {}, `${pt.name} · ${earnedText(pt)}`),
        svg("circle", { class: "hit", cx: cx.toFixed(2), cy: cy.toFixed(2), r: (size * 0.8).toFixed(2) }),
        svg("g", { class: "map-patch-body" }, art),
        isFresh ? sparkles(cx, cy, size) : null);
      icon.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && (pop.hidden || hovering)) openPatches([pt], icon, { hover: true }); });
      icon.addEventListener("pointerleave", (e) => { if (hovering && e.pointerType === "mouse") hoverTimer = setTimeout(() => closePop({ restoreFocus: false }), 250); });
      return icon;
    }
    const list = group.members.map((m) => m.patch);
    const names = list.map((pt) => pt.landmarkName).join(", ");
    const hasFresh = list.some((pt) => fresh.has(pt.id));
    return asButton({ class: `map-patch cluster${hasFresh ? " fresh" : ""}`, "aria-label": `${list.length} landmark patches here: ${names}. Zoom in to see them.` },
      (el) => {
        if (view.zoom >= MAX_ZOOM - 0.01) { openPatches(list, el); return; }
        setView({ zoom: Math.min(view.zoom * 2.5, MAX_ZOOM), cx: group.x, cy: group.y }, `Showing ${list.length} landmark patches: ${names}.`);
        patchLayer.querySelector(`[data-patch="${list[0].landmarkId}"]`)?.focus();
      },
      svg("title", {}, `${list.length} patches: ${names}`),
      svg("circle", { class: "hit", cx: cx.toFixed(2), cy: cy.toFixed(2), r: (size * 0.8).toFixed(2) }),
      svg("g", { class: "map-patch-body" },
        svg("circle", { class: "cluster-bg", cx: cx.toFixed(2), cy: cy.toFixed(2), r: (size / 2).toFixed(2) }),
        svg("circle", { class: "cluster-stitch", cx: cx.toFixed(2), cy: cy.toFixed(2), r: (size * 0.4).toFixed(2) }),
        svg("text", { class: "cluster-count", x: cx.toFixed(2), y: (cy + size * 0.17).toFixed(2), "font-size": (size * 0.48).toFixed(2) }, String(list.length))),
      hasFresh ? sparkles(cx, cy, size) : null);
  };
  let drawnZoom = null;
  const drawPatches = () => {
    if (!earnedPatches.length || drawnZoom === view.zoom) return;
    const first = drawnZoom === null;
    drawnZoom = view.zoom;
    const size = patchIconSize(view.zoom);
    fill(patchLayer, clusterPoints(earnedPatches, size * 1.1).map((g) => patchIcon(g, size)));
    if (first) fresh = new Set(); // the stitch-pop plays once, not on every zoom
  };
  root.append(patchLayer);

  // ---- View handling -------------------------------------------------------------------------------
  const apply = () => {
    memory.view = view;
    const b = viewBoxOf(view, base);
    root.setAttribute("viewBox", `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.width.toFixed(1)} ${b.height.toFixed(1)}`);
    // Markers and labels keep roughly the same on-screen size as you zoom.
    root.style.setProperty("--z", String(view.zoom));
    root.style.touchAction = view.zoom > 1.01 ? "none" : "pan-y";
    zoomLabel.textContent = `${Math.round(view.zoom * 10) / 10}×`;
    drawPatches();
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
  function release(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; }
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
    // A mouse released outside the map never sent pointerup here: forget it instead of panning on hover.
    if (e.pointerType === "mouse" && !e.buttons) { release(e); return; }
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
      if (!dragged && Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) > 2) {
        dragged = true;
        // Capture only once a drag starts, so plain taps still reach the landmark under the pointer.
        try { root.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
      setView(panView(view, dx, dy, base));
    }
  });
  root.addEventListener("pointerup", release);
  root.addEventListener("lostpointercapture", release);
  root.addEventListener("pointercancel", release);
  // A drag that ends on a landmark should not select it.
  root.addEventListener("click", (e) => { if (dragged) { e.stopPropagation(); dragged = false; } }, true);

  const btn = (label, text, onClick) => h("button", { class: "btn small", type: "button", "aria-label": label, onClick }, text);
  const toolbar = h("div", { class: "map-tools", role: "toolbar", "aria-label": "Map controls" },
    btn("Zoom in", "+", () => setView(zoomView(view, 1.5, null, base), "Zoomed in.")),
    btn("Zoom out", "−", () => setView(zoomView(view, 1 / 1.5, null, base), "Zoomed out.")),
    zoomLabel,
    btn("Show where the expedition is and the next landmark", "Find us", () => setView(focusHere(), "Showing the expedition and the next landmark.")),
    btn("Show the whole trail", "Whole trail", () => setView(defaultView(base), "Showing the whole trail.")));

  // Journey progress: regions (parents) with their landmarks (children). Choosing a region frames it
  // on the map; choosing a landmark opens its details, exactly like tapping it on the map.
  const landmarkRow = (l) => h("li", { class: `jl ${l.status}` },
    h("button", { type: "button", class: "jl-btn", "aria-label": `${l.name}, ${l.state}, mile ${formatMiles(l.distance)}: ${l.status === "passed" ? "reached" : l.status === "next" ? `next landmark, ${formatMiles(l.milesToGo)} to go` : `${formatMiles(l.milesToGo)} ahead`}. Show details.`,
      onClick: () => { select(l.id); panel.scrollIntoView?.({ block: "nearest" }); } },
    h("span", { class: "mark", "aria-hidden": "true" }, l.status === "passed" ? "✓" : l.status === "next" ? "➜" : "○"),
    h("span", { class: "jl-name" }, l.name, l.status === "next" ? h("span", { class: "you" }, " · next") : null),
    h("span", { class: "hint" }, l.status === "passed" ? `mile ${formatMiles(l.distance)}` : `${formatMiles(l.milesToGo)} to go`)));
  const sections = h("ol", { class: "sections journey" }, journeyProgress(trail, progress).map((r) => h("li", { class: r.current ? "current" : r.percent >= 100 ? "done" : "" },
    h("button", { type: "button", class: "section-btn", style: `--region:${r.color}`,
      "aria-label": `${r.name} (${r.states}), ${formatMiles(r.lengthMiles)}, ${r.percent}% walked${r.current ? ", the expedition is here" : ""}. Show on map.`,
      onClick: () => { setView(fitView(routeSlice(trail, r.start, r.end), base, 24), `Showing ${r.name}.`); root.scrollIntoView?.({ block: "nearest" }); } },
      h("span", { class: "swatch", "aria-hidden": "true" }),
      h("span", { class: "section-name" }, r.name, r.current ? h("span", { class: "you" }, " · we are here") : null),
      h("span", { class: "section-bar", "aria-hidden": "true" }, h("span", { style: `width:${r.percent}%` })),
      h("span", { class: "hint" }, `${r.states} · ${formatMiles(r.lengthMiles)} · ${r.percent}%${r.landmarks.length ? ` · ${r.passedCount} of ${r.landmarks.length} landmarks` : ""}`)),
    r.landmarks.length ? h("ol", { class: "journey-landmarks", "aria-label": `Landmarks in ${r.name}` }, r.landmarks.map(landmarkRow)) : null)));

  const legend = h("ul", { class: "map-legend", "aria-label": "Map key" },
    h("li", {}, h("span", { class: "key you", "aria-hidden": "true" }), "The expedition"),
    h("li", {}, h("span", { class: "key walked", "aria-hidden": "true" }), "Walked"),
    h("li", {}, h("span", { class: "key next", "aria-hidden": "true" }), "Next landmark"),
    crew.some((c) => !c.me) ? h("li", {}, h("span", { class: "key mate", "aria-hidden": "true" }), "Crew-mates") : null,
    crewMiles !== null ? h("li", {}, h("span", { class: "key camp", "aria-hidden": "true" }), "Crew camp (combined miles)") : null,
    h("li", {}, h("span", { class: "key post", "aria-hidden": "true" }), "Mile posts every 250 mi"),
    patches ? h("li", {}, h("span", { class: "key patch", "aria-hidden": "true" }),
      `${patches.hikerName ? `${patches.hikerName}'s landmark patches` : "Landmark patches"} (${earnedPatches.length} of ${patches.list.length})`) : null);

  // Previous / Current / Next: where we've been, where we are, where we're heading.
  const win = journeyWindow(progress);
  const stop = (label, lm, note, cls) => h("li", { class: `jw ${cls}` }, lm
    ? h("button", { type: "button", class: "jw-btn", "aria-label": `${label}: ${lm.name}, ${note}. Show details.`, onClick: () => select(lm.id) },
      h("span", { class: "jw-label" }, label), h("strong", {}, lm.name), h("span", { class: "hint" }, note))
    : h("div", { class: "jw-btn empty" }, h("span", { class: "jw-label" }, label), h("strong", {}, cls === "next" ? "Katahdin reached!" : "—"),
      h("span", { class: "hint" }, cls === "next" ? "Trail complete" : "Still ahead")));
  const journeyStrip = h("ol", { class: "journey-window", "aria-label": "The journey so far" },
    stop("Previous", win.previous, win.previous ? `${formatMiles(Math.round((progress.distanceMiles - win.previous.distance) * 100) / 100)} behind us` : "", "previous"),
    stop("Current", win.current, win.current ? (win.milesPastCurrent ? `${formatMiles(win.milesPastCurrent)} behind us` : "we are here") : "", "current"),
    stop("Next", win.next, win.next ? `${formatMiles(win.milesToNext)} to go` : "", "next"));

  apply();
  select(memory.selectedId, { announce: false });
  return h("div", { class: "map-wrap" }, toolbar, h("div", { class: "map-frame" }, root, pop), legend, live, journeyStrip, panel,
    h("h3", { class: "sections-title" }, "Journey Progress"), sections);
}

// Testing hook: forget remembered zoom/selection.
export function resetMapMemory() { memory.view = null; memory.selectedId = null; }
