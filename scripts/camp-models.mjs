// Builds the camp's hand-made hero models (see CAMP_MODELS in assets/js/at/engine/camp-world.js) and
// writes them to assets/models/camp/ as GLB files.
//
//   node scripts/camp-models.mjs
//
// Each model is modelled here from three.js primitives, with more detail than the camp builds at
// runtime, then merged into one primitive per palette material and written as an untextured glTF
// binary. The output is deterministic, and a test rebuilds every model and compares it with the
// committed file, so edit this script (not the .glb) and re-run it. A model made in Blender can
// replace a generated one: export glTF Binary (+Y up, metres, transforms applied, no textures), name
// its materials after MODEL_MATERIALS, add the hook nodes, and remove its builder here.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as THREE from "../assets/vendor/three/three.module.js";
import { mergeGeometries } from "../assets/vendor/three/BufferGeometryUtils.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MODEL_DIR = join(ROOT, "assets/models/camp");

// Viewer colours only: the camp redraws every material with its own palette (camp-3d.js).
const PREVIEW = { wood: 0x7a5a3c, "wood-light": 0x9a7a52, "wood-dark": 0x5b4636, cream: 0xf4ead5, stone: 0x8a8a80 };

// A small modelling kit: every part is a primitive moved into place, grouped by material.
function kit() {
  const parts = new Map();
  const add = (material, geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) => {
    geometry.deleteAttribute("uv");
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(m);
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry);
  };
  const box = (material, w, h, d, at) => add(material, new THREE.BoxGeometry(w, h, d), at);
  // A log of radius r and length len along "x", "y" or "z".
  const log = (material, r, len, axis, at, sides = 6) => {
    const g = new THREE.CylinderGeometry(r, r, len, sides);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    if (axis === "z") g.rotateX(Math.PI / 2);
    add(material, g, at);
  };
  return { parts, box, log };
}

// The trail shelter: a log lean-to with an open front facing camp (+z), a raised plank sleeping
// platform, a shingled roof rising to the front on a header beam between two posts, gable logs, gear
// pegs on the back wall and a split-log step. Origin on the ground at its centre. It keeps the
// procedural shelter's working heights, which camp-life.js relies on: the platform top at 0.5 (hikers
// asleep), the open front edge at z 1.25 (hikers reading) and the right-hand post top at (2.2, 2.55,
// 1.35), where birds perch.
export function shelter() {
  const { parts, box, log } = kit();
  const course = 0.25;
  const pitch = 0.2; // the roof's rise per unit of depth
  const slope = Math.atan(pitch);
  const roofAt = (z) => 2.36 + (z - 0.1) * pitch; // the rafters' centre line
  // Corner piers and the sleeping platform.
  [[-2.1, -1.1], [2.1, -1.1], [-2.1, 1.1], [2.1, 1.1]].forEach(([x, z]) => box("wood-dark", 0.4, 0.4, 0.4, { x, y: 0.2, z }));
  box("wood-light", 4.45, 0.1, 2.5, { y: 0.45, z: 0 });
  // Back wall, and the side walls interlocking half a log higher at the corners.
  for (let i = 0; i < 7; i += 1) log("wood", 0.13, 4.85, "x", { y: 0.35 + i * course, z: -1.32 });
  for (let i = 0; i < 7; i += 1) [-2.3, 2.3].forEach((x) => log("wood", 0.13, 2.95, "z", { x, y: 0.475 + i * course, z: 0 }));
  // A sloped top log closes each gable under the roof.
  [-2.3, 2.3].forEach((x) => log("wood", 0.11, 2.9, "z", { x, y: roofAt(0.05) - 0.2, z: 0.05, rx: -slope }));
  // Front posts and the header beam between them, carrying the rafters.
  [-2.3, 2.3].forEach((x) => log("wood", 0.12, 2.55, "y", { x, y: 1.275, z: 1.38 }));
  log("wood", 0.12, 4.5, "x", { y: 2.42, z: 1.4 });
  // Roof: rafters, the deck and shingle courses.
  [-2.4, -1.2, 0, 1.2, 2.4].forEach((x) => box("wood-dark", 0.1, 0.14, 3.8, { x, y: roofAt(0.1), z: 0.1, rx: -slope }));
  box("wood-dark", 5.1, 0.06, 3.9, { y: roofAt(0.1) + 0.1, z: 0.1, rx: -slope });
  for (let i = 0; i < 6; i += 1) {
    const t = -1.65 + i * 0.66; // along the roof, back to front
    const z = 0.1 + Math.cos(slope) * t;
    box("wood-light", 5.2, 0.05, 0.72, { y: roofAt(z) + 0.16 + i * 0.004, z, rx: -slope });
  }
  // Gear pegs on the back wall and a split-log step. (The camp hangs the name board and the lantern.)
  [-1.75, -1.05, -0.35, 0.35, 1.05, 1.75].forEach((x) => log("wood-dark", 0.025, 0.22, "z", { x, y: 1.45, z: -1.12 }, 4));
  log("wood", 0.13, 1.4, "x", { y: 0.13, z: 1.75 });
  return { name: "shelter", parts, hooks: { "lantern-hook": [-1.6, 2.2, 1.22], "sign-hook": [0, 2.42, 1.53] } };
}

export const BUILDERS = { shelter };

// glTF 2.0 binary: one mesh with a primitive per material, plus an empty child node per hook.
export function toGlb({ name, parts, hooks = {} }) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const view = (array, target) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    chunks.push(bytes, new Uint8Array(pad));
    offset += bytes.byteLength + pad;
    return bufferViews.length - 1;
  };
  const materials = [];
  const primitives = [];
  [...parts.keys()].sort().forEach((material) => {
    const g = mergeGeometries(parts.get(material));
    const pos = g.getAttribute("position").array;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
    const count = pos.length / 3;
    const index = count < 65536 ? Uint16Array.from(g.index.array) : Uint32Array.from(g.index.array);
    accessors.push({ bufferView: view(Float32Array.from(pos), 34962), componentType: 5126, count, type: "VEC3", min, max });
    accessors.push({ bufferView: view(Float32Array.from(g.getAttribute("normal").array), 34962), componentType: 5126, count, type: "VEC3" });
    accessors.push({ bufferView: view(index, 34963), componentType: index instanceof Uint16Array ? 5123 : 5125, count: index.length, type: "SCALAR" });
    const c = new THREE.Color(PREVIEW[material] ?? 0x888888); // sRGB hex to linear
    materials.push({ name: material, pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: 0, roughnessFactor: 1 } });
    const a = accessors.length - 3;
    primitives.push({ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: materials.length - 1 });
  });
  const hookNodes = Object.entries(hooks).map(([hook, translation]) => ({ name: hook, translation }));
  const json = {
    asset: { version: "2.0", generator: "AT Fitness Tracker scripts/camp-models.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, children: hookNodes.length ? hookNodes.map((_, i) => i + 1) : undefined }, ...hookNodes],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }]
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonLength = jsonBytes.byteLength + jsonPad;
  const total = 12 + 8 + jsonLength + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  let at = 20 + jsonLength;
  dv.setUint32(at, offset, true);
  dv.setUint32(at + 4, 0x004e4942, true); // "BIN"
  at += 8;
  chunks.forEach((c) => { out.set(c, at); at += c.byteLength; });
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(MODEL_DIR, { recursive: true });
  for (const [id, build] of Object.entries(BUILDERS)) {
    const model = build();
    const bytes = toGlb(model);
    const triangles = [...model.parts.values()].flat().reduce((n, g) => n + g.index.count / 3, 0);
    writeFileSync(join(MODEL_DIR, `${id}.glb`), bytes);
    console.log(`${id}.glb: ${bytes.byteLength} bytes, ${model.parts.size} materials, ${triangles} triangles`);
  }
}
