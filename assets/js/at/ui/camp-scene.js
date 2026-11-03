// Camp diorama: a pixel-art SVG of the crew's camp on the Appalachian Trail. Backdrop follows the
// crew's trail section; tents, fire and lanterns grow with crew miles; the bear bag line holds one bag
// per hiker; the photo board fills with Wildlife Spotting points; every crew member sits at camp. Motion is CSS-only and disabled by
// prefers-reduced-motion. Interactive parts are focusable buttons that report what was chosen.
import { svg } from "./dom.js";

const W = 320;
const H = 180;
const GROUND = 120;

const SKY = { dawn: ["#f6d7b0", "#f3b98f"], day: ["#a9d6ea", "#d8eef5"], dusk: ["#e9a072", "#7d5a8c"], night: ["#16223a", "#2c3c5e"] };
const SCENES = {
  "southern-ridges": { far: "#7f9f86", near: "#4f7a55", ground: "#6f8f4a" },
  "high-balds": { far: "#8fae7c", near: "#a9c47a", ground: "#7a9a4b", bald: true },
  "blue-ridge": { far: "#7d99b3", near: "#5c7f97", ground: "#6b8c4a" },
  "rocky-ridges": { far: "#8b8f80", near: "#6f7b62", ground: "#7a7f55", rocks: true },
  lakes: { far: "#7f9fae", near: "#5d806a", ground: "#6a8a4c", water: true },
  "river-valley": { far: "#93ad86", near: "#678c56", ground: "#739350", water: true },
  alpine: { far: "#8e97a8", near: "#6c7a73", ground: "#6c8048", snowcaps: true },
  "north-woods": { far: "#5f7f72", near: "#35594a", ground: "#5a7a44", spruce: true }
};
const SHIRTS = ["#c0392b", "#2f6b9a", "#e0a43a", "#6d8f5e", "#8e5a9b", "#d4703a", "#3f8f8a", "#b04f6a"];
const HATS = ["#5b4636", "#2f5d46", "#8f2d1f", "#e8dcc0", "#3a3a3a"];

const px = (parent, x, y, w, h, fill, cls) => { const r = svg("rect", { x, y, width: w, height: h, fill, class: cls }); parent.append(r); return r; };
const group = (parent, attrs = {}) => { const g = svg("g", attrs); parent.append(g); return g; };

function hotspot(parent, id, label, onSelect, attrs = {}) {
  return group(parent, {
    ...attrs, class: `camp-hot ${attrs.class || ""}`.trim(), role: "button", tabindex: "0", "aria-label": label, "data-camp-hotspot": id,
    onClick: () => onSelect(id),
    onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }
  });
}

function backdrop(root, scene, time, rngSeed) {
  const s = SCENES[scene] || SCENES["southern-ridges"];
  const sky = SKY[time];
  const defs = svg("defs", {}, svg("linearGradient", { id: "camp-sky", x1: 0, y1: 0, x2: 0, y2: 1 },
    svg("stop", { offset: "0", "stop-color": sky[1] }), svg("stop", { offset: "1", "stop-color": sky[0] })));
  root.append(defs);
  px(root, 0, 0, W, H, "url(#camp-sky)");
  if (time === "night") {
    const stars = group(root, { class: "camp-stars" });
    for (let i = 0; i < 26; i += 1) px(stars, (i * 73 + rngSeed) % W, (i * 37) % 70 + 4, 1, 1, "#fdf6d8", i % 3 ? "" : "twinkle");
    px(root, 262, 18, 10, 10, "#f4ecd0"); px(root, 266, 18, 6, 6, SKY.night[1]);
  } else {
    px(root, time === "dusk" ? 40 : time === "dawn" ? 24 : 250, time === "day" ? 16 : 52, 12, 12, "#f6cf5a", "camp-sun");
  }
  const clouds = group(root, { class: "camp-clouds" });
  [[30, 22], [150, 12], [230, 30]].forEach(([x, y]) => { px(clouds, x, y, 26, 5, "rgba(255,255,255,.7)"); px(clouds, x + 6, y - 3, 14, 3, "rgba(255,255,255,.7)"); });

  root.append(svg("path", { d: "M0 92 L40 60 L70 78 L110 48 L150 74 L190 52 L230 76 L270 50 L320 80 L320 120 L0 120Z", fill: s.far }));
  if (s.snowcaps) root.append(svg("path", { d: "M104 53 L110 48 L117 54 Z M184 57 L190 52 L196 57Z M264 55 L270 50 L276 55Z", fill: "#f4f4f4" }));
  if (s.bald) root.append(svg("path", { d: "M90 96 Q150 52 210 96Z", fill: "#bcd38e" }));
  root.append(svg("path", { d: "M0 104 L30 86 L60 96 L100 80 L140 98 L180 84 L220 100 L260 82 L300 96 L320 90 L320 122 L0 122Z", fill: s.near }));
  if (s.water) px(root, 0, 112, W, 6, "#6f9fbf", "camp-water");
  if (s.spruce || scene === "southern-ridges" || scene === "blue-ridge") {
    const trees = group(root, {});
    for (let i = 0; i < 9; i += 1) {
      const x = 8 + i * 36 + (i % 2) * 7;
      trees.append(svg("path", { d: `M${x} ${GROUND - 2} L${x + 6} ${GROUND - 22} L${x + 12} ${GROUND - 2}Z`, fill: s.spruce ? "#20402f" : "#2f5d46" }));
    }
  }
  px(root, 0, GROUND - 4, W, H - GROUND + 4, s.ground);
  const grass = group(root, { class: "camp-grass" });
  for (let i = 0; i < 30; i += 1) px(grass, (i * 41 + rngSeed) % W, GROUND + (i * 17) % 50, 1, 3, "rgba(30,60,30,.45)");
  if (s.rocks) [[40, 150], [280, 140], [250, 166]].forEach(([x, y]) => { px(root, x, y, 12, 6, "#8d8273"); px(root, x + 2, y - 3, 7, 3, "#a39886"); });
}

function shelter(root, onSelect, label) {
  const g = hotspot(root, "shelter", label, onSelect);
  px(g, 14, 92, 64, 6, "#5b4636");
  root.append(g);
  g.append(svg("path", { d: "M10 96 L44 74 L82 96Z", fill: "#7a5a3c" }));
  px(g, 18, 96, 56, 28, "#8a6a4a");
  px(g, 22, 100, 48, 22, "#3b2f25");
  px(g, 24, 116, 44, 4, "#a0805e");
  px(g, 30, 84, 32, 5, "#f4ead5");
  px(g, 34, 86, 24, 1, "#5b4636");
}

function tent(root, x, y, color) {
  root.append(svg("path", { d: `M${x} ${y} L${x + 11} ${y - 14} L${x + 22} ${y}Z`, fill: color }));
  root.append(svg("path", { d: `M${x + 9} ${y} L${x + 11} ${y - 6} L${x + 13} ${y}Z`, fill: "#2c2c2c" }));
}

function fire(root, level, onSelect, label) {
  const g = hotspot(root, "fire", label, onSelect);
  px(g, 146, 150, 28, 4, "#5b4636"); px(g, 150, 146, 20, 4, "#7a5a3c");
  const flames = group(g, { class: "camp-fire" });
  const tall = 8 + level * 5;
  px(flames, 152, 146 - tall, 16, tall, "#e0702c");
  px(flames, 155, 146 - tall + 4, 10, tall - 4, "#f2a93b", "flick");
  px(flames, 158, 146 - tall + 8, 4, tall - 8, "#fde68a");
  const smoke = group(g, { class: "camp-smoke" });
  [0, 1, 2].forEach((i) => px(smoke, 158 + i * 2, 120 - tall - i * 8, 4, 4, "rgba(220,220,220,.55)"));
}

function bearBagLine(root, bags, onSelect, label) {
  const g = hotspot(root, "bags", label, onSelect);
  px(g, 236, 68, 4, 56, "#5b4636"); px(g, 296, 66, 4, 58, "#5b4636");
  g.append(svg("path", { d: "M238 74 Q268 84 298 72", stroke: "#e8dcc0", fill: "none", "stroke-width": 1 }));
  for (let i = 0; i < Math.max(bags, 0); i += 1) {
    const x = 246 + i * 8;
    px(g, x + 1, 78, 1, 6, "#e8dcc0");
    px(g, x - 1, 84, 6, 8, ["#c0392b", "#2f6b9a", "#e0a43a"][i % 3], "camp-bag");
  }
  if (!bags) px(g, 262, 82, 10, 4, "rgba(255,255,255,.35)");
}

function board(root, photos, onSelect, label) {
  const g = hotspot(root, "board", label, onSelect);
  px(g, 104, 112, 3, 22, "#5b4636"); px(g, 125, 112, 3, 22, "#5b4636");
  px(g, 100, 96, 32, 20, "#a0805e"); px(g, 102, 98, 28, 16, "#d9c7a0");
  const pinned = Math.min(Math.floor(photos / 25), 6);
  for (let i = 0; i < pinned; i += 1) px(g, 104 + (i % 3) * 9, 100 + Math.floor(i / 3) * 7, 7, 5, ["#6f9fbf", "#7a9a5b", "#e0a43a"][i % 3]);
  px(g, 104, 101, 22, 1, pinned ? "transparent" : "#8a6a4a"); px(g, 104, 105, 16, 1, pinned ? "transparent" : "#8a6a4a");
}

function hiker(parent, person, x, y, onSelect) {
  const shirt = SHIRTS[person.seed % SHIRTS.length];
  const hat = HATS[(person.seed >> 3) % HATS.length];
  const g = hotspot(parent, `person:${person.id}`, `${person.name}${person.me ? " (you)" : ""}: ${Math.round(person.totalMiles)} miles${person.recent ? ", just arrived at camp" : ""}`,
    onSelect, { class: `camp-person pose-${person.pose}${person.me ? " me" : ""}` });
  const body = group(g, { class: "camp-body" });
  if (person.me) px(body, x + 2, y - 16, 4, 3, "#e0a43a", "me-mark");
  px(body, x + 1, y - 12, 6, 2, hat);
  px(body, x + 2, y - 10, 4, 4, "#e6b98f");
  px(body, x + 1, y - 6, 6, 6, shirt);
  if (person.pose === "wave") px(body, x + 7, y - 10, 2, 5, "#e6b98f", "camp-wave");
  if (person.pose === "read") px(body, x + 6, y - 4, 4, 3, "#f4ead5");
  if (person.pose === "cook") px(body, x + 7, y - 3, 6, 1, "#3b2f25");
  px(body, x + 1, y, 2, person.pose === "sit" ? 2 : 4, "#3b4a5c"); px(body, x + 5, y, 2, person.pose === "sit" ? 2 : 4, "#3b4a5c");
  if (person.recent) px(body, x - 2, y - 7, 3, 6, "#7a5a3c");
}

function critters(root, time) {
  const g = group(root, { class: "camp-critters", "aria-hidden": "true" });
  const deer = group(g, { class: "camp-wander" });
  px(deer, 200, 104, 12, 5, "#8a6a4a"); px(deer, 210, 99, 4, 6, "#8a6a4a"); px(deer, 201, 109, 1, 4, "#5b4636"); px(deer, 210, 109, 1, 4, "#5b4636");
  const rabbit = group(g, { class: "camp-hop" });
  px(rabbit, 88, 160, 6, 4, "#b49a7a"); px(rabbit, 92, 157, 2, 3, "#b49a7a");
  if (time === "night") { px(g, 299, 60, 6, 7, "#6d5b47"); px(g, 300, 62, 1, 1, "#e0a43a"); px(g, 303, 62, 1, 1, "#e0a43a"); }
}

function weatherLayer(root, id) {
  const g = group(root, { class: `camp-weather weather-${id}`, "aria-hidden": "true" });
  if (id === "rain" || id === "storm") {
    if (id === "storm") px(g, 0, 0, W, 40, "rgba(40,50,70,.35)");
    for (let i = 0; i < 40; i += 1) px(g, (i * 53) % W, (i * 29) % H, 1, 5, "rgba(200,220,255,.7)", "drop");
  } else if (id === "snow") {
    for (let i = 0; i < 40; i += 1) px(g, (i * 47) % W, (i * 31) % H, 2, 2, "#ffffff", "flake");
  } else if (id === "fog") {
    [70, 100, 130].forEach((y, i) => px(g, -20, y, W + 40, 10, `rgba(240,240,240,${0.35 + i * 0.08})`, "fogbank"));
  }
}

function lanterns(root, n) {
  for (let i = 0; i < n; i += 1) { const x = 96 + i * 44; px(root, x, 126, 1, 8, "#3b2f25"); px(root, x - 2, 122, 5, 5, "#f6cf5a", "camp-lantern"); }
}

function banner(root, text) {
  const g = group(root, { class: "camp-banner", "aria-hidden": "true" });
  g.append(svg("path", { d: "M84 40 Q160 56 236 40", stroke: "#5b4636", fill: "none" }));
  for (let i = 0; i < 9; i += 1) { const x = 92 + i * 17; g.append(svg("path", { d: `M${x} ${44 + Math.sin(i / 2.8) * 4} l6 0 l-3 7z`, fill: SHIRTS[i % SHIRTS.length], class: "flag" })); }
  g.append(svg("text", { x: 160, y: 72, "text-anchor": "middle", class: "camp-banner-text" }, text));
}

const SPOTS = [[118, 158], [134, 166], [182, 162], [198, 154], [124, 140], [196, 140], [104, 150], [212, 166], [150, 170], [170, 172]];
const TENT_SPOTS = [[200, 124], [232, 136], [86, 128], [262, 150], [52, 150], [280, 128], [20, 160], [228, 168]];

/**
 * @param ctx  campContext() result plus { dispatchTitle, crewLabel, bagLabel, photoLabel }
 * @param onSelect  called with "shelter" | "fire" | "bags" | "board" | "person:<id>"
 */
export function renderCampScene(ctx, onSelect) {
  const root = svg("svg", { class: `camp-svg time-${ctx.time}`, viewBox: `0 0 ${W} ${H}`, role: "group",
    "aria-label": `Camp scene: ${ctx.time} near ${ctx.region ? ctx.region.name : "the trail"}. ${ctx.weather.label}. Choose an item for details.`, "shape-rendering": "crispEdges" });
  backdrop(root, ctx.scene, ctx.time, ctx.people.length * 7 + 3);
  critters(root, ctx.time);
  shelter(root, onSelect, ctx.dispatchTitle ? `Shelter register: latest dispatch "${ctx.dispatchTitle}"` : "Shelter register");
  for (let i = 0; i < ctx.scale.tents; i += 1) { const [x, y] = TENT_SPOTS[i]; tent(root, x, y, SHIRTS[(i * 3 + 1) % SHIRTS.length]); }
  board(root, ctx.supplies.photos || 0, onSelect, `Photo board: ${ctx.photoLabel}`);
  bearBagLine(root, ctx.scale.bearBags, onSelect, `Bear bag line: ${ctx.bagLabel}`);
  lanterns(root, ctx.scale.lanterns);
  fire(root, ctx.scale.fire, onSelect, `Campfire: ${ctx.crewLabel}`);
  const people = group(root, { class: "camp-people" });
  ctx.people.forEach((p, i) => { const [x, y] = SPOTS[i % SPOTS.length]; hiker(people, p, x, y, onSelect); });
  if (ctx.celebration) banner(root, `Passed ${ctx.celebration.name}!`);
  weatherLayer(root, ctx.weather.id);
  if (ctx.time === "night") px(root, 0, 0, W, H, "rgba(10,20,50,.28)", "camp-night-tint").setAttribute("pointer-events", "none");
  return root;
}
