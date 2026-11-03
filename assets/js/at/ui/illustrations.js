// Original, simple vector illustrations for landmark kinds (no photos, logos or trail artwork).
import { svg } from "./dom.js";

const C = { sky: "#cfe3ea", far: "#9db8a6", near: "#5f8a5a", dark: "#2f5d46", rock: "#8d8273", sun: "#e0a43a", water: "#5c8fb0", wood: "#7a5a3c", cream: "#fffaf0", roof: "#8f2d1f", grass: "#a8c47a" };

const hills = (y = 52) => [
  svg("path", { d: `M0 ${y} L20 ${y - 18} L38 ${y - 6} L60 ${y - 26} L84 ${y - 8} L102 ${y - 20} L120 ${y - 4} L120 72 L0 72Z`, fill: C.far }),
  svg("path", { d: `M0 ${y + 6} Q30 ${y - 6} 60 ${y + 4} T120 ${y} L120 72 L0 72Z`, fill: C.near })
];
const tree = (x, y, s = 1) => svg("g", { transform: `translate(${x} ${y}) scale(${s})` },
  svg("rect", { x: -1.2, y: 0, width: 2.4, height: 6, fill: C.wood }), svg("path", { d: "M0 -14 L7 2 L-7 2Z", fill: C.dark }));
const sun = (x = 98, y = 14) => svg("circle", { cx: x, cy: y, r: 6, fill: C.sun });

const ART = {
  terminus: () => [sun(), svg("path", { d: "M0 60 L40 22 L58 36 L74 18 L120 60 L120 72 L0 72Z", fill: C.far }), ...hills(58),
    svg("rect", { x: 70, y: 30, width: 2.5, height: 18, fill: C.wood }), svg("rect", { x: 60, y: 26, width: 22, height: 9, rx: 1.5, fill: C.cream, stroke: C.wood })],
  gap: () => [sun(20, 14), svg("path", { d: "M0 56 L28 20 L52 48 L68 48 L92 18 L120 56 L120 72 L0 72Z", fill: C.far }), ...hills(60),
    svg("path", { d: "M54 72 L58 48 L62 48 L72 72Z", fill: "#b9ab92" }), tree(24, 52), tree(98, 54)],
  border: () => [sun(), ...hills(50), svg("line", { x1: 60, y1: 30, x2: 60, y2: 72, stroke: C.cream, "stroke-width": 1.5, "stroke-dasharray": "3 3" }),
    svg("path", { d: "M60 30 Q50 34 46 42 M60 34 Q70 36 74 44", stroke: C.wood, "stroke-width": 3, fill: "none" }), svg("circle", { cx: 60, cy: 28, r: 12, fill: C.dark })],
  river: () => [sun(), svg("path", { d: "M0 40 L30 16 L46 44 L74 44 L92 14 L120 40 L120 72 L0 72Z", fill: C.far }),
    svg("path", { d: "M46 44 L74 44 L90 72 L30 72Z", fill: C.water }), svg("path", { d: "M44 56 q6 -3 12 0 t12 0 M50 64 q6 -3 12 0 t12 0", stroke: C.cream, fill: "none" }), tree(18, 46), tree(104, 48)],
  landmark: () => [sun(20, 14), svg("path", { d: "M0 44 L30 20 L60 40 L90 18 L120 44 L120 72 L0 72Z", fill: C.far }),
    svg("rect", { x: 22, y: 38, width: 76, height: 14, fill: "#c9c2b3" }), svg("rect", { x: 22, y: 52, width: 76, height: 20, fill: C.water }),
    ...[30, 46, 62, 78].map((x) => svg("rect", { x, y: 41, width: 8, height: 6, fill: "#a99f8d" }))],
  summit: () => [sun(), svg("path", { d: "M0 72 L48 14 L60 24 L68 18 L120 72Z", fill: C.rock }), svg("path", { d: "M40 24 L48 14 L60 24 L54 28 L46 24Z", fill: C.cream }),
    ...hills(62), svg("rect", { x: 66, y: 8, width: 4, height: 11, fill: C.wood })],
  town: () => [sun(), ...hills(46), ...[[16, 48], [44, 44], [74, 48]].map(([x, y]) => svg("g", {},
    svg("rect", { x, y, width: 22, height: 16, fill: C.cream, stroke: C.wood }), svg("path", { d: `M${x - 2} ${y} L${x + 11} ${y - 10} L${x + 24} ${y}Z`, fill: C.roof }),
    svg("rect", { x: x + 8, y: y + 7, width: 6, height: 9, fill: C.wood }))), tree(108, 56)],
  bald: () => [sun(96, 16), svg("path", { d: "M0 72 Q60 8 120 72Z", fill: C.grass }), svg("path", { d: "M0 72 Q30 48 60 58 T120 60 L120 72Z", fill: C.near }),
    svg("path", { d: "M40 40 l3 -4 l3 4 M70 34 l3 -4 l3 4", stroke: C.dark, fill: "none" })],
  park: () => [sun(), ...hills(48), svg("g", { transform: "translate(52 50)" },
    svg("rect", { x: 0, y: 0, width: 18, height: 8, rx: 3, fill: C.wood }), svg("rect", { x: 15, y: -6, width: 5, height: 9, rx: 2, fill: C.wood }),
    ...[1, 5, 12, 16].map((x) => svg("rect", { x, y: 7, width: 2, height: 7, fill: C.wood }))), tree(16, 50), tree(100, 52)],
  notch: () => [svg("path", { d: "M0 0 L44 72 L0 72Z", fill: C.dark }), svg("path", { d: "M120 0 L76 72 L120 72Z", fill: C.dark }),
    ...[[46, 60, 9], [60, 64, 8], [72, 58, 7], [56, 52, 6]].map(([cx, cy, r]) => svg("circle", { cx, cy, r, fill: C.rock, stroke: "#6e6455" }))]
};

export function landmarkArt(kind, label) {
  const draw = ART[kind] || ART.summit;
  return svg("svg", { class: "landmark-art", viewBox: "0 0 120 72", role: "img", "aria-label": label || `${kind} illustration`, focusable: "false" },
    svg("rect", { width: 120, height: 72, fill: C.sky }), ...draw());
}

export const ART_KINDS = Object.freeze(Object.keys(ART));
