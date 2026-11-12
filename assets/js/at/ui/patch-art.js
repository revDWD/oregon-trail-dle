// Landmark patch artwork: original embroidered-style vector patches drawn in code (no photos, logos
// or real patch designs). Each patch has a border band in its trail section's colour, a cream
// "stitched" edge, a little scene for its landmark and, at full size, a ribbon banner.
//
//   patchArt(patch, { mini, label, decorative })  -> <svg class="patch-art">   (viewBox 0 0 64 64)
//   decorative: hidden from assistive tech, for art inside a button that already names the patch.
//
// `patch` comes from engine/patches.js. Locked patches get class "locked" (muted by CSS). Every
// motif is unique; a landmark without one gets a scene chosen from its kind.
import { svg } from "./dom.js";

const C = {
  sky: "#cfe3ea", far: "#9db8a6", near: "#5f8a5a", dark: "#2f5d46", rock: "#8d8273", sun: "#e0a43a", water: "#5c8fb0",
  wood: "#7a5a3c", cream: "#fffaf0", roof: "#8f2d1f", grass: "#a8c47a", stone: "#c9c2b3", bronze: "#a8743a",
  pink: "#d86fa0", blossom: "#f2a6c8", ink: "#3b2f24", foam: "#e8f3f7", night: "#2b3a55"
};

let uid = 0;

// ---- Little drawing helpers (64 x 64 field) ---------------------------------------------------------
const rect = (x, y, width, height, fill, extra = {}) => svg("rect", { x, y, width, height, fill, ...extra });
const path = (d, fill, extra = {}) => svg("path", { d, fill, ...extra });
const line = (d, stroke, width = 1.2, extra = {}) => svg("path", { d, fill: "none", stroke, "stroke-width": width, "stroke-linecap": "round", ...extra });
const dot = (cx, cy, r, fill, extra = {}) => svg("circle", { cx, cy, r, fill, ...extra });
const sky = (fill = C.sky) => rect(0, 0, 64, 64, fill);
const sun = (x = 48, y = 14, r = 5, fill = C.sun) => dot(x, y, r, fill);
const far = (y = 34) => path(`M0 ${y} L12 ${y - 10} L22 ${y - 4} L34 ${y - 14} L46 ${y - 5} L56 ${y - 11} L64 ${y - 4} L64 64 L0 64Z`, C.far);
const near = (y = 46) => path(`M0 ${y} Q16 ${y - 6} 32 ${y} T64 ${y - 2} L64 64 L0 64Z`, C.near);
const pine = (x, y, s = 1, fill = C.dark) => svg("g", { transform: `translate(${x} ${y}) scale(${s})` },
  rect(-0.8, 0, 1.6, 3, C.wood), path("M0 -9 L4.5 1 L-4.5 1Z", fill));
const leafy = (x, y, r = 5, fill = C.near) => svg("g", {}, rect(x - 0.8, y, 1.6, r + 2, C.wood), dot(x, y, r, fill));
const water = (y) => [rect(0, y, 64, 64 - y, C.water), line(`M8 ${y + 4} q3 -2 6 0 t6 0 M30 ${y + 8} q3 -2 6 0 t6 0 M46 ${y + 3} q3 -2 6 0`, C.foam, 0.9)];
const house = (x, y, w = 10, hgt = 8, fill = C.cream) => svg("g", {},
  rect(x, y, w, hgt, fill, { stroke: C.wood, "stroke-width": 0.6 }), path(`M${x - 1} ${y} L${x + w / 2} ${y - 5} L${x + w + 1} ${y}Z`, C.roof),
  rect(x + w / 2 - 1.2, y + hgt - 4, 2.4, 4, C.wood));
const hiker = (x, y, fill = C.ink) => svg("g", {}, dot(x, y, 1.3, fill),
  line(`M${x} ${y + 1.2} L${x} ${y + 5.5} M${x} ${y + 5.5} L${x - 1.5} ${y + 9} M${x} ${y + 5.5} L${x + 1.5} ${y + 9} M${x} ${y + 2.5} L${x + 2} ${y + 4.5}`, fill, 1.1),
  rect(x - 2.6, y + 1.8, 2, 3.4, C.roof, { rx: 0.6 }));
const blaze = (x, y) => rect(x, y, 2, 4, "#ffffff", { stroke: "#d9d4c7", "stroke-width": 0.3 });
const rays = (cx, cy, r1, r2, n = 10, stroke = C.sun) => line(Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return `M${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2).toFixed(1)}`;
}).join(" "), stroke, 1.2);

// ---- One scene per landmark --------------------------------------------------------------------------
const MOTIFS = {
  "springer-mountain": () => [sky(), sun(48, 13), far(30), pine(12, 30, 1.1), pine(54, 32),
    path("M6 50 Q32 30 58 50 L58 64 L6 64Z", C.rock), path("M14 46 Q32 34 50 46", "none", { stroke: "#a39883", "stroke-width": 1 }),
    rect(23, 37, 16, 9, C.bronze, { stroke: "#6b4a22", "stroke-width": 0.8, rx: 1 }), hiker(31, 37.6, "#6b4a22"),
    rect(45, 24, 4, 18, C.wood), blaze(46, 28)],
  "neel-gap": () => [sky(), far(32), near(48),
    path("M14 29 L32 18 L50 29Z", C.wood), rect(16, 29, 32, 17, "#b3a690", { stroke: "#7d725f", "stroke-width": 0.6 }),
    ...[[19, 32], [25, 35], [41, 33], [44, 39], [20, 40]].map(([x, y]) => rect(x, y, 3, 2, "#9b8e78")),
    path("M28 46 L28 39 Q32 33 36 39 L36 46Z", C.ink),
    leafy(8, 20, 6, C.dark), line("M5 24 L5 29 M10 24 L10 31", C.ink, 0.5), rect(4, 29, 2.4, 1.6, C.roof), rect(9, 31, 2.4, 1.6, C.wood)],
  "bly-gap": () => [sky(), sun(14, 12, 4), path("M0 46 Q32 30 64 46 L64 64 L0 64Z", C.grass), near(54),
    line("M32 26 L32 64", C.cream, 1, { "stroke-dasharray": "2.4 2" }),
    line("M24 46 Q22 36 30 28", C.wood, 2.6), svg("ellipse", { cx: 36, cy: 25, rx: 11, ry: 6, fill: C.dark, transform: "rotate(-12 36 25)" }),
    svg("text", { x: 20, y: 42, "font-size": 5, "font-weight": 700, fill: C.dark, "text-anchor": "middle" }, "GA"),
    svg("text", { x: 44, y: 42, "font-size": 5, "font-weight": 700, fill: C.dark, "text-anchor": "middle" }, "NC")],
  "nantahala": () => [sky(), rays(32, 11, 6, 9, 10), sun(32, 11, 4.5),
    path("M0 8 L24 46 L18 64 L0 64Z", C.dark), path("M64 8 L40 46 L46 64 L64 64Z", C.dark),
    path("M0 20 L16 40 L10 64 L0 64Z", C.near), path("M64 20 L48 40 L54 64 L64 64Z", C.near),
    path("M24 46 L40 46 L46 64 L18 64Z", C.water), line("M24 52 q2 -2 4 0 t4 0 t4 0 t4 0 M22 58 q2 -2 4 0 t4 0 t4 0 t4 0 t4 0", C.foam, 0.9),
    svg("ellipse", { cx: 32, cy: 54, rx: 5, ry: 1.8, fill: "#e0622b" }), dot(30, 51.6, 1, C.ink), dot(34, 51.6, 1, C.ink)],
  "fontana-dam": () => [sky(), far(26), rect(0, 22, 64, 8, C.water),
    path("M6 30 L58 30 L62 46 L2 46Z", C.stone, { stroke: "#a99f8d", "stroke-width": 0.6 }),
    line("M14 31 L12 46 M24 31 L23 46 M40 31 L41 46 M50 31 L52 46", "#a99f8d", 0.7),
    line("M6 30 L58 30", C.cream, 0.9, { "stroke-dasharray": "2 1.5" }), hiker(36, 21.5),
    ...water(46)],
  "clingmans-dome": () => [sky(), far(36), ...[8, 16, 48, 56].map((x, i) => pine(x, 44 + (i % 2) * 3, 1.3)),
    rect(30, 20, 4, 26, C.stone), line("M32 46 Q12 42 22 35 Q38 30 33 24", "#e6e1d5", 2.4),
    svg("ellipse", { cx: 32, cy: 20, rx: 8, ry: 2.4, fill: "#e6e1d5", stroke: "#a99f8d", "stroke-width": 0.5 }),
    rect(0, 48, 64, 16, C.near), svg("ellipse", { cx: 32, cy: 50, rx: 34, ry: 3, fill: "#ffffff", opacity: 0.55 })],
  "hot-springs": () => [sky(), sun(50, 12, 4), far(30), house(10, 36, 11, 8), house(26, 34, 10, 9, "#f3e6c9"), house(40, 37, 10, 7),
    rect(0, 44, 64, 3, C.grass), ...water(47),
    line("M18 46 q-3 -4 0 -8 t0 -8 M32 46 q3 -4 0 -8 t0 -9 M46 46 q-3 -4 0 -8 t0 -7", C.cream, 1.3, { opacity: 0.9 })],
  "max-patch": () => [sky(), rays(32, 20, 8, 13, 12), sun(32, 20, 6),
    path("M0 54 Q32 20 64 54 L64 64 L0 64Z", C.grass), path("M0 58 Q20 50 40 56 T64 54 L64 64 L0 64Z", C.near),
    hiker(30, 30), line("M12 44 l1.5 -2 l1.5 2 M48 42 l1.5 -2 l1.5 2", C.near, 0.8)],
  "roan-highlands": () => [sky(), sun(14, 12, 4), svg("ellipse", { cx: 46, cy: 20, rx: 10, ry: 3, fill: "#ffffff", opacity: 0.85 }),
    path("M0 40 Q16 26 32 36 T64 32 L64 64 L0 64Z", C.grass), path("M0 52 Q20 42 40 50 T64 46 L64 64 L0 64Z", C.near),
    ...[[12, 42], [24, 46], [44, 40], [52, 50], [34, 52]].map(([x, y]) => svg("g", {},
      dot(x, y + 1.5, 4, C.dark), dot(x - 2, y, 2, C.pink), dot(x + 2, y - 0.5, 2, C.blossom), dot(x, y - 2, 2, C.pink)))],
  "damascus": () => [sky(), far(28), house(8, 26, 9, 7), house(46, 25, 10, 8, "#f3e6c9"),
    rect(0, 34, 64, 3, C.wood), line("M4 37 L12 50 L20 37 L28 50 L36 37 L44 50 L52 37 L60 50", C.wood, 1.2),
    line("M4 37 L4 50 M20 37 L20 50 M36 37 L36 50 M52 37 L52 50", C.wood, 1.4), ...water(50), hiker(30, 25)],
  "grayson-highlands": () => [sky(), sun(50, 12, 4), far(30), rect(0, 40, 64, 24, C.grass), path("M44 42 L50 34 L58 36 L62 42Z", C.rock),
    rect(24, 33, 18, 9, "#8b5a3c", { rx: 4 }), path("M25 35 L20 25 L15 27 L14 30.5 L19 31.5 L22 40Z", "#8b5a3c"),
    line("M20.5 25 L24.5 35", C.ink, 2), line("M41.5 35 q5 2 3 10", C.ink, 2),
    ...[26, 29, 37, 40].map((x) => rect(x, 41, 2.2, 8, "#7a4c32")), dot(16.5, 28.5, 0.6, C.ink)],
  "pearisburg": () => [sky(), far(30), path("M0 46 Q20 40 30 48 T64 44 L64 64 L0 64Z", C.near),
    path("M0 52 Q22 46 34 54 T64 52 L64 60 Q40 58 30 62 T0 60Z", C.water),
    rect(36, 30, 11, 14, C.cream, { stroke: C.wood, "stroke-width": 0.6 }), path("M35 30 L41.5 14 L48 30Z", C.roof),
    line("M41.5 9 L41.5 14 M39.5 11 L43.5 11", C.wood, 1), rect(40, 37, 3, 7, C.wood), house(14, 36, 10, 8)],
  "dragons-tooth": () => [sky(), sun(14, 14, 4), far(40),
    path("M26 52 L28 30 L33 8 L37 22 L40 34 L42 52Z", C.rock), path("M33 8 L37 22 L35 26 L32 18Z", "#b3a690"),
    line("M36 30 L38 30 M36.5 34 L38.5 34", C.ink, 0.7), near(50), pine(14, 52, 1.2), pine(52, 52, 1.2)],
  "mcafee-knob": () => [sky("#f4c58a"), rect(0, 22, 64, 42, "#f0a868"), sun(48, 28, 6, "#e0622b"),
    path("M0 40 L14 32 L26 38 L40 30 L54 36 L64 32 L64 64 L0 64Z", "#9a7fa0"), path("M0 48 Q20 42 40 48 T64 46 L64 64 L0 64Z", "#6d5a7d"),
    path("M0 38 L40 36 L44 40 L30 43 L0 47Z", "#4a3f36"), hiker(36, 26.4, "#2b221c")],
  "rockfish-gap": () => [sky(), sun(48, 12, 4),
    path("M0 28 L16 20 L32 26 L48 18 L64 24 L64 64 L0 64Z", "#b7cfe0"), path("M0 36 L20 28 L36 34 L52 26 L64 32 L64 64 L0 64Z", "#8fb0cc"),
    path("M0 44 L14 38 L30 44 L48 36 L64 42 L64 64 L0 64Z", "#6a8fb0"), path("M0 52 Q32 42 64 52 L64 64 L0 64Z", "#4a6f90"),
    line("M24 64 Q32 54 28 46 Q26 42 32 40", "#d8cdb6", 2.4), line("M24 64 Q32 54 28 46 Q26 42 32 40", C.sun, 0.5, { "stroke-dasharray": "1.5 1.5" })],
  "big-meadows": () => [sky("#e8d7b4"), sun(14, 16, 5, "#e0a43a"), ...[6, 14, 22, 42, 50, 58].map((x) => pine(x, 30, 1.2)),
    rect(0, 32, 64, 32, C.grass), line("M6 50 l1 -3 l1 3 M54 54 l1 -3 l1 3 M14 58 l1 -3 l1 3", C.near, 0.8),
    svg("ellipse", { cx: 32, cy: 40, rx: 8, ry: 4.2, fill: "#b07a4a" }), path("M38 39 L42 30 L45 30 L41 40Z", "#b07a4a"),
    svg("ellipse", { cx: 44, cy: 29.5, rx: 3.2, ry: 2, fill: "#b07a4a" }), path("M42.5 28 L41.5 25 L43.5 27.5Z M45 28 L45.5 25 L46 28Z", "#8a5c36"),
    ...[26, 29, 35, 38].map((x) => rect(x, 43, 1.5, 7, "#8a5c36")), rect(23.5, 37.5, 2.6, 2, C.cream, { rx: 1 }),
    ...[[10, 60], [13, 61], [50, 59]].map(([x, y]) => dot(x, y, 1, "#3d4f8f"))],
  "harpers-ferry": () => [sky(), path("M0 30 L14 22 L24 30Z M40 30 L52 20 L64 28 L64 30Z", C.dark), rect(0, 30, 64, 10, C.far),
    path("M0 40 L28 54 L26 64 L0 64Z", C.water), path("M64 40 L36 54 L38 64 L64 64Z", C.water),
    path("M8 40 L32 32 L56 40 L36 54 L28 54Z", C.grass), path("M25 54 L39 54 L40 64 L24 64Z", C.water),
    house(22, 40, 8, 6), rect(34, 36, 6, 9, C.cream, { stroke: C.wood, "stroke-width": 0.5 }), path("M33.5 36 L37 27 L40.5 36Z", C.roof),
    line("M44 54 Q48 48 52 54 Q56 48 60 54 M42 54 L64 54", C.stone, 1.2)],
  "pen-mar": () => [sky(), far(32), rect(0, 40, 64, 24, C.grass), line("M0 50 L64 50", C.cream, 1, { "stroke-dasharray": "2.4 2" }),
    path("M22 34 L28 30 L34 34Z", "#bdb6a6"), rect(23, 34, 10, 22, "#d9d4c7", { stroke: "#9b9484", "stroke-width": 0.6 }),
    svg("text", { x: 28, y: 42, "font-size": 6, "font-weight": 700, fill: C.ink, "text-anchor": "middle" }, "P"),
    svg("text", { x: 28, y: 53, "font-size": 6, "font-weight": 700, fill: C.ink, "text-anchor": "middle" }, "M"),
    path("M40 30 L50 24 L60 30Z", C.roof), rect(42, 30, 1.6, 10, C.wood), rect(56.4, 30, 1.6, 10, C.wood), rect(40, 39, 20, 1.6, C.wood)],
  "delaware-water-gap": () => [sky(), sun(32, 12, 4.5), path("M0 16 L24 32 L28 64 L0 64Z", C.dark), path("M64 14 L40 32 L36 64 L64 64Z", C.near),
    path("M0 30 L18 40 L14 64 L0 64Z", C.near), path("M24 40 L40 40 L52 64 L12 64Z", C.water),
    line("M24 48 q2 -1.5 4 0 t4 0 t4 0 M20 56 q2 -1.5 4 0 t4 0 t4 0 t4 0 t4 0", C.foam, 0.9), pine(8, 28), pine(56, 26)],
  "bear-mountain": () => [sky(), path("M0 34 L18 20 L34 32 L50 18 L64 30 L64 64 L0 64Z", C.far), ...water(44),
    rect(14, 18, 3, 26, C.stone), rect(47, 18, 3, 26, C.stone),
    line("M0 30 Q8 20 15.5 18 Q32 38 48.5 18 Q56 20 64 30", "#5a5a5a", 1), line("M22 26 L22 40 M28 31 L28 40 M36 31 L36 40 M42 26 L42 40", "#5a5a5a", 0.5),
    rect(0, 40, 64, 2.4, "#6a6a6a")],
  "mount-greylock": () => [sky(C.night), dot(12, 12, 0.7, C.cream), dot(52, 8, 0.7, C.cream), dot(20, 22, 0.6, C.cream),
    path("M0 50 Q32 28 64 50 L64 64 L0 64Z", C.dark), path("M27 46 L29 18 L35 18 L37 46Z", "#d9d4c7"),
    rect(28, 16, 8, 3, "#bdb6a6"), dot(32, 13, 7, "#f7e08a", { opacity: 0.3 }), dot(32, 13, 3.4, "#f7e08a"),
    pine(10, 50, 1.2, "#1f3d30"), pine(54, 50, 1.2, "#1f3d30")],
  "hanover": () => [sky(), sun(50, 12, 4), rect(0, 40, 64, 6, C.grass), ...water(46),
    rect(18, 28, 28, 12, C.cream, { stroke: C.wood, "stroke-width": 0.6 }), path("M16 28 L32 22 L48 28Z", C.roof),
    rect(29, 15, 6, 8, C.cream, { stroke: C.wood, "stroke-width": 0.5 }), path("M28 15 L32 9 L36 15Z", C.near),
    ...[22, 26, 36, 40].map((x) => rect(x, 31, 2.4, 3.4, C.wood)), rect(30.5, 34, 3, 6, C.wood),
    leafy(8, 30, 6), leafy(56, 30, 6), rect(0, 49, 64, 2, C.wood)],
  "mount-washington": () => [sky(), line("M4 12 q8 -3 16 0 M10 18 q8 -3 16 0 M2 24 q6 -2 12 0", C.cream, 1.2),
    path("M0 56 L38 22 L64 40 L64 64 L0 64Z", C.rock), path("M30 30 L38 22 L46 28Z", "#b3a690"),
    rect(36, 16, 9, 7, C.stone, { stroke: "#7d725f", "stroke-width": 0.5 }), rect(39, 12, 2, 4, "#7d725f"),
    ...[[16, 48], [26, 39]].map(([x, y]) => svg("g", {}, svg("ellipse", { cx: x, cy: y, rx: 4, ry: 1.8, fill: "#6e6455" }),
      svg("ellipse", { cx: x, cy: y - 2.6, rx: 3, ry: 1.5, fill: "#8d8273" }), svg("ellipse", { cx: x, cy: y - 4.8, rx: 2, ry: 1.2, fill: "#a39883" })))],
  "mahoosuc-notch": () => [sky(), path("M0 0 L24 64 L0 64Z", C.dark), path("M64 0 L40 64 L64 64Z", C.dark),
    path("M0 12 L14 64 L0 64Z", "#244a38"), path("M64 12 L50 64 L64 64Z", "#244a38"),
    ...[[30, 54, 8], [42, 58, 6], [22, 60, 6], [34, 42, 6], [26, 46, 4]].map(([cx, cy, r]) => dot(cx, cy, r, C.rock, { stroke: "#6e6455", "stroke-width": 0.8 })),
    hiker(35, 27.5)],
  "monson": () => [sky("#dbe8ea"), ...[6, 14, 50, 58].map((x) => pine(x, 30, 1.3)), rect(0, 32, 64, 4, C.near), ...water(36),
    rect(22, 24, 16, 9, "#4a3427", { rx: 3 }), path("M22 26 L19 19 L15 21 L14 24 L18 25 L20 30Z", "#4a3427"),
    line("M18 19 L15 14 M18 19 L21 14 M18 17 L13 15 M18 17 L23 15", "#c9a97a", 1.3), path("M23 24 L30 21 L37 24Z", "#4a3427"),
    ...[24, 27, 33, 36].map((x) => rect(x, 32, 1.8, 8, "#3b2a1f")), svg("ellipse", { cx: 48, cy: 46, rx: 3, ry: 1.2, fill: C.ink }), dot(50.5, 44.8, 1, C.ink)],
  "katahdin": () => [sky(), sun(52, 12, 4), path("M0 54 L18 30 L28 16 L34 22 L42 12 L64 46 L64 64 L0 64Z", "#7d7468"),
    path("M24 22 L28 16 L34 22 L30 24Z M38 18 L42 12 L46 18Z", C.cream), near(54),
    rect(21, 34, 2, 14, C.wood), rect(41, 34, 2, 14, C.wood), rect(18, 30, 28, 10, "#8a6845", { stroke: "#5c4227", "stroke-width": 0.8, rx: 0.8 }),
    line("M22 33.5 L42 33.5 M24 36.5 L40 36.5", "#e6d3b0", 1)]
};

// Scenes for landmarks without their own motif (by kind).
const KIND_SCENES = {
  terminus: () => [sky(), sun(), far(30), path("M0 56 L32 18 L64 56Z", C.rock), near(54), rect(30, 26, 2, 10, C.wood), rect(26, 24, 10, 5, C.cream)],
  gap: () => [sky(), sun(14, 12, 4), path("M0 46 L20 18 L32 40 L44 18 L64 46 L64 64 L0 64Z", C.far), near(52), pine(14, 52), pine(50, 52)],
  border: () => [sky(), sun(), near(42), line("M32 20 L32 64", C.cream, 1, { "stroke-dasharray": "2.4 2" })],
  river: () => [sky(), sun(), far(30), ...water(44)],
  landmark: () => [sky(), far(30), rect(12, 30, 40, 16, C.stone), ...water(46)],
  summit: () => [sky(), sun(), path("M0 56 L32 16 L64 56Z", C.rock), path("M26 24 L32 16 L38 24Z", C.cream), near(54)],
  town: () => [sky(), sun(), far(30), house(10, 38, 12, 8), house(28, 36, 10, 10, "#f3e6c9"), house(44, 38, 10, 8), rect(0, 46, 64, 18, C.grass)],
  bald: () => [sky(), sun(32, 16, 6), path("M0 56 Q32 20 64 56 L64 64 L0 64Z", C.grass)],
  park: () => [sky(), sun(), far(32), rect(0, 42, 64, 22, C.grass), pine(12, 42, 1.3), pine(52, 42, 1.3)],
  notch: () => [sky(), path("M0 0 L24 64 L0 64Z", C.dark), path("M64 0 L40 64 L64 64Z", C.dark), dot(32, 56, 7, C.rock)]
};

export const PATCH_MOTIFS = Object.freeze(Object.keys(MOTIFS));
export const PATCH_KIND_SCENES = Object.freeze(Object.keys(KIND_SCENES));

export function motifFor(patch) {
  if (MOTIFS[patch.motif]) return patch.motif;
  if (MOTIFS[patch.landmarkId]) return patch.landmarkId;
  return null;
}

function scene(patch) {
  const motif = motifFor(patch);
  if (motif) return MOTIFS[motif]();
  return (KIND_SCENES[patch.kind] || KIND_SCENES.summit)();
}

// Patch outlines, all inside 0..64. Inner field and stitching are the same shape, scaled about the centre.
function outline(shape) {
  if (shape === "shield") return "M32 2 L59 9 L58 36 Q55 52 32 62 Q9 52 6 36 L5 9Z";
  if (shape === "hexagon") return "M32 1.5 L58.5 16.75 L58.5 47.25 L32 62.5 L5.5 47.25 L5.5 16.75Z";
  return "M32 1.5 A30.5 30.5 0 1 1 31.99 1.5Z";
}
const scaled = (s) => `translate(32 32) scale(${s}) translate(-32 -32)`;

function banner(text, color) {
  const label = String(text || "").slice(0, 14);
  const size = Math.min(6, 46 / Math.max(label.length * 0.66, 1));
  return svg("g", { class: "patch-banner" },
    path("M3 44 L9 44 L9 54 L3 54 L6 49Z M61 44 L55 44 L55 54 L61 54 L58 49Z", color, { stroke: C.ink, "stroke-width": 0.5 }),
    path("M8 42.5 L56 42.5 L56 54.5 L8 54.5Z", C.cream, { stroke: color, "stroke-width": 1.4 }),
    svg("text", { x: 32, y: 48.6 + size * 0.36, "font-size": size.toFixed(2), "font-weight": 800, "font-family": "system-ui, -apple-system, Segoe UI, sans-serif",
      "letter-spacing": 0.2, fill: C.ink, "text-anchor": "middle" }, label));
}

export function patchArt(patch, { mini = false, label, decorative = false } = {}) {
  const id = `patch-clip-${++uid}`;
  const color = (patch.region && patch.region.color) || C.near;
  const d = outline(patch.shape);
  const classes = ["patch-art", `patch-${patch.shape || "circle"}`, patch.earned ? "earned" : "locked", mini ? "mini" : ""].filter(Boolean).join(" ");
  const name = label || `${patch.name}${patch.earned ? "" : " (not yet earned)"}`;
  return svg("svg", { class: classes, viewBox: "0 0 64 64", ...(decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": name }), focusable: "false" },
    svg("defs", {}, svg("clipPath", { id }, path(d, "#000", { transform: scaled(0.8) }))),
    path(d, color, { stroke: C.ink, "stroke-width": 1.2 }),
    path(d, "none", { stroke: C.cream, "stroke-width": 1.1, "stroke-dasharray": "2.2 1.6", transform: scaled(0.9) }),
    svg("g", { "clip-path": `url(#${id})` }, scene(patch)),
    path(d, "none", { stroke: C.ink, "stroke-width": 1.4, transform: scaled(0.8) }),
    mini ? null : banner(patch.banner, color));
}
