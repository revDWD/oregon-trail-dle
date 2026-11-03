// Appalachian Trail map: US state outlines, the route polyline, landmarks and the hiker marker.
import { svg } from "./dom.js";

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

function addStates(layer, markup) {
  if (!markup) return;
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
  doc.querySelectorAll("path.state-shapes, .state-shapes path").forEach((node) => layer.append(document.importNode(node, true)));
}

export function renderTrailMap(trail, progress, { stateMarkup = globalThis.AT_US_STATES } = {}) {
  const box = mapViewBox();
  const root = svg("svg", {
    class: "trail-map", viewBox: `${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.width.toFixed(1)} ${box.height.toFixed(1)}`,
    role: "img", "aria-labelledby": "trail-map-title trail-map-desc", focusable: "false"
  });
  root.append(
    svg("title", { id: "trail-map-title" }, `${trail.name} progress map`),
    svg("desc", { id: "trail-map-desc" }, `${progress.percent}% of the ${trail.name} completed. ${progress.nextLandmark ? `Next landmark: ${progress.nextLandmark.name}, ${progress.distanceToNext} miles away.` : "The trail is complete."} The landmark list below gives the same information as text.`)
  );
  const states = svg("g", { class: "map-states", "aria-hidden": "true" });
  addStates(states, stateMarkup);
  root.append(states);

  const route = trail.route;
  const pts = route.map((r) => project(r.lat, r.lon));
  const line = (points) => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  root.append(svg("path", { class: "map-route", d: line(pts), "aria-hidden": "true" }));

  // Highlight the part walked so far, in the player's direction of travel.
  const marker = progress.position.marker;
  const walkedRoute = progress.direction === "sobo" ? route.filter((r) => r.miles >= marker) : route.filter((r) => r.miles <= marker);
  const here = project(progress.position.lat, progress.position.lon);
  const walked = walkedRoute.map((r) => project(r.lat, r.lon));
  if (progress.direction === "sobo") walked.unshift(here); else walked.push(here);
  if (walked.length > 1) root.append(svg("path", { class: "map-walked", d: line(walked), "aria-hidden": "true" }));

  const dots = svg("g", { "aria-hidden": "true" });
  progress.landmarks.forEach((landmark) => {
    const p = project(landmark.lat, landmark.lon);
    dots.append(svg("circle", { class: landmark.passed ? "map-landmark passed" : "map-landmark", cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3.2 }));
  });
  root.append(dots);
  root.append(svg("g", { class: "map-hiker", "aria-hidden": "true" },
    svg("circle", { cx: here.x.toFixed(1), cy: here.y.toFixed(1), r: 9, class: "map-hiker-halo" }),
    svg("circle", { cx: here.x.toFixed(1), cy: here.y.toFixed(1), r: 5, class: "map-hiker-dot" })
  ));
  return root;
}
