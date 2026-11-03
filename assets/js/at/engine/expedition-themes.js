// Expedition themes: DATA ONLY. engine/expedition.js runs the rules and ui/expedition-view.js draws them.
// The rules are the original Oregon Trail DLE hunt (pacing, herds, startling, film/magazine, pop-ups),
// re-themed for the Appalachian Trail. A future activity (birding, foraging, scavenger hunts, trail
// clean-up) is a new theme object with its own words, species and habitats. The engine and view
// don't change.
//
// Species
//   value      points per photo. Rarer animals are worth more.
//   speed      logical pixels per second; w/h is the sprite box in logical pixels (canvas is 320x180).
//   behavior   chance to pause or turn each time the animal re-decides, speed multiplier and drift
//              ranges, and the decision and pause timers. Same model as the original hunt.
//   herd/flock maximum group size; groups arrive together and tend to move together.
//   parts      pixel sprite facing right: [x, y, w, h, colour, leg]. Colour 0 = body, 1 = dark,
//              2 = light. leg 1/2 lengthens the part on alternate steps; -1/-2 shortens it.
// Habitats are keyed by the region `scene` in trail/appalachian-trail.js. `animals` holds spawn weights
// by species id. Colours and scenery counts drive the seeded backdrop.
//
// Results go to the crew's photo board at Camp. They NEVER award trail miles.

const BEHAVIOR = Object.freeze({
  rabbit: { pause: 0.45, turn: 0.15, mult: [1, 2], drift: 45, timer: [0.35, 1], pauseTime: [0.3, 0.8] },
  turkey: { pause: 0.4, turn: 0.25, mult: [0.8, 1.9], drift: 20, timer: [0.5, 1.4], pauseTime: [0.5, 1.2] },
  grouse: { pause: 0.5, turn: 0.2, mult: [0.8, 1.7], drift: 18, timer: [0.5, 1.3], pauseTime: [0.6, 1.4] },
  fox: { pause: 0.2, turn: 0.2, mult: [0.9, 1.8], drift: 30, timer: [0.6, 1.5], pauseTime: [0.4, 1] },
  deer: { pause: 0.2, turn: 0.2, mult: [0.7, 1.5], drift: 24, timer: [1, 2.4], pauseTime: [0.8, 1.7] },
  duck: { pause: 0.08, turn: 0.08, mult: [0.9, 1.6], drift: 8, timer: [0.8, 1.7], pauseTime: [0.2, 0.5] },
  elk: { pause: 0.25, turn: 0.12, mult: [0.7, 1.4], drift: 18, timer: [1.2, 2.6], pauseTime: [0.9, 1.8] },
  bear: { pause: 0.3, turn: 0.15, mult: [0.6, 1.3], drift: 14, timer: [1.5, 3], pauseTime: [0.8, 1.6] },
  moose: { pause: 0.35, turn: 0.1, mult: [0.7, 1.2], drift: 8, timer: [1.5, 3], pauseTime: [1, 2] }
});

const freezeAll = (list) => Object.freeze(list.map((item) => Object.freeze(item)));

const SPECIES = freezeAll([
  { id: "cottontail", name: "eastern cottontail", value: 4, speed: 80, w: 14, h: 9, skittish: true, behavior: BEHAVIOR.rabbit,
    colors: ["#b79d7c", "#6e5a43"], light: "#fffaf0",
    parts: [[2, 3, 9, 6, 0], [9, 2, 5, 5, 0], [10, -3, 2, 5, 0], [0, 4, 3, 3, 2], [12, 3, 1, 1, 1], [3, 9, 3, 2, 1, -1], [8, 9, 3, 2, 1, -2]] },
  { id: "turkey", name: "wild turkey", value: 12, speed: 46, w: 14, h: 13, skittish: true, graze: true, herd: 3, behavior: BEHAVIOR.turkey,
    colors: ["#7a5230", "#3f2a18"], light: "#c0392b",
    parts: [[2, 4, 9, 6, 0], [0, 1, 4, 7, 1], [9, 2, 3, 5, 0], [10, 0, 3, 3, 0], [12, 1, 2, 1, 2], [11, 3, 1, 2, 2], [5, 10, 1, 3, 1, 1], [8, 10, 1, 3, 1, 2]] },
  { id: "grouse", name: "ruffed grouse", value: 10, speed: 40, w: 14, h: 11, skittish: true, graze: true, behavior: BEHAVIOR.grouse,
    colors: ["#8a6a48", "#4a3622"], light: "#e2cfa6",
    parts: [[3, 4, 8, 5, 0], [0, 2, 4, 6, 1], [1, 3, 2, 1, 2], [9, 1, 4, 4, 0], [10, 0, 2, 1, 1], [13, 2, 1, 1, 1], [4, 7, 6, 1, 2], [5, 9, 1, 2, 1, 1], [8, 9, 1, 2, 1, 2]] },
  { id: "duck", name: "wood duck", value: 14, speed: 68, w: 18, h: 11, skittish: true, flock: 3, behavior: BEHAVIOR.duck,
    colors: ["#5a4a3a", "#1f5a3a"], light: "#f0e6d0",
    parts: [[5, 3, 10, 5, 0], [12, 1, 4, 4, 1], [14, 3, 3, 2, 2], [1, 4, 5, 3, 0], [13, 4, 3, 1, 2], [7, 8, 2, 3, 1, 1], [12, 8, 2, 3, 1, 2], [7, 0, 5, 1, 2]] },
  { id: "fox", name: "red fox", value: 30, speed: 64, w: 25, h: 12, skittish: true, behavior: BEHAVIOR.fox,
    colors: ["#c8642a", "#2b1c14"], light: "#f6efe2",
    parts: [[5, 4, 13, 6, 0], [7, 8, 9, 2, 2], [0, 3, 6, 4, 0], [0, 4, 2, 2, 2], [17, 1, 6, 6, 0], [18, -1, 2, 2, 1], [21, -1, 2, 2, 1],
      [22, 4, 3, 2, 2], [24, 4, 1, 1, 1], [7, 10, 2, 2, 1, 1], [10, 10, 2, 2, 1, 2], [14, 10, 2, 2, 1, 1], [16, 10, 2, 2, 1, 2]] },
  { id: "deer", name: "white-tailed deer", value: 40, speed: 58, w: 26, h: 18, skittish: true, graze: true, herd: 2, behavior: BEHAVIOR.deer,
    colors: ["#b5703a", "#5e3a1e"], light: "#f4ead5",
    parts: [[4, 5, 17, 8, 0], [6, 11, 13, 2, 2], [18, 0, 5, 9, 0], [20, 0, 6, 5, 0], [24, 3, 2, 2, 1], [21, -4, 1, 4, 2], [23, -4, 1, 4, 2], [2, 4, 3, 4, 2],
      [6, 13, 2, 5, 1, 1], [11, 13, 2, 5, 1, 2], [16, 13, 2, 5, 1, 1], [19, 13, 2, 5, 1, 2]] },
  { id: "elk", name: "elk", value: 70, speed: 52, w: 32, h: 22, skittish: true, graze: true, herd: 3, behavior: BEHAVIOR.elk,
    colors: ["#9a6a3c", "#4a2f1c"], light: "#e3cfa0",
    parts: [[5, 6, 20, 9, 0], [8, 13, 14, 2, 2], [17, 5, 6, 8, 1], [22, 1, 5, 9, 0], [25, 0, 6, 5, 0], [29, 3, 3, 2, 1],
      [23, -6, 1, 6, 2], [27, -6, 1, 6, 2], [21, -9, 3, 1, 2], [27, -9, 4, 1, 2], [3, 7, 3, 4, 2],
      [7, 15, 2, 6, 1, 1], [12, 15, 2, 6, 1, 2], [19, 15, 2, 6, 1, 1], [23, 15, 2, 6, 1, 2]] },
  { id: "bear", name: "black bear", value: 80, speed: 40, w: 28, h: 18, skittish: false, behavior: BEHAVIOR.bear,
    colors: ["#2a2420", "#121010"], light: "#a07a52",
    parts: [[3, 4, 20, 11, 0], [8, 1, 9, 4, 0], [20, 5, 8, 8, 0], [25, 9, 3, 4, 2], [21, 3, 3, 3, 1], [5, 15, 5, 3, 1, 1], [17, 15, 5, 3, 1, 2]] },
  { id: "moose", name: "moose", value: 100, speed: 30, w: 35, h: 24, skittish: false, graze: true, behavior: BEHAVIOR.moose,
    colors: ["#4a3426", "#24180f"], light: "#c9b48a",
    parts: [[4, 7, 22, 11, 0], [10, 4, 10, 4, 0], [22, 6, 5, 8, 0], [25, 7, 9, 6, 0], [31, 11, 4, 4, 1], [27, 13, 2, 4, 1],
      [22, 0, 6, 3, 2], [29, 0, 6, 3, 2], [25, 3, 1, 4, 2], [30, 3, 1, 4, 2], [2, 8, 2, 3, 1],
      [6, 18, 2, 6, 1, 1], [11, 18, 2, 6, 1, 2], [19, 18, 2, 6, 1, 1], [23, 18, 2, 6, 1, 2]] }
]);

// backdrop: "hills" | "ridges" (layered Blue Ridge) | "balds" (grassy tops) | "peaks" (above treeline).
// water: "stream" | "lake". pines: conifers instead of round hardwoods (hardwoods turn in autumn).
const HABITATS = Object.freeze({
  "southern-ridges": { label: "Georgia hardwood ridge", backdrop: "hills", sky: "#b9d6e0", haze: "#d4e6ea", far: "#5f7f55", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35",
    trees: 12, pines: false, shrubs: 10, rocks: 4, logs: 3, tall: 10, animals: { cottontail: 3, turkey: 4, grouse: 1, fox: 2, deer: 4, bear: 1 } },
  "high-balds": { label: "Grassy bald in the Smokies", backdrop: "balds", sky: "#bcd9e6", haze: "#d6e8ee", far: "#6d8f5e", ground: "#b9c77a", band: "#a9b96a", patch: "#9fb260", tuft: "#4f7a3a",
    trees: 3, pines: true, shrubs: 8, rocks: 3, logs: 0, tall: 30, animals: { cottontail: 3, turkey: 2, grouse: 2, fox: 1, deer: 3, elk: 4, bear: 3 } },
  "blue-ridge": { label: "Blue Ridge meadow", backdrop: "ridges", sky: "#c4dcea", haze: "#dce9f0", far: "#5c7f97", ground: "#a9b874", band: "#99a965", patch: "#8fa05c", tuft: "#4a7038",
    trees: 6, pines: false, shrubs: 8, rocks: 3, logs: 1, tall: 18, animals: { cottontail: 2, turkey: 3, grouse: 1, fox: 2, deer: 5, bear: 2 } },
  "rocky-ridges": { label: "Rocky Pennsylvania ridge", backdrop: "hills", sky: "#c0d6e4", haze: "#d9e6ee", far: "#7b7f6c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52",
    trees: 7, pines: false, shrubs: 5, rocks: 16, logs: 2, tall: 6, animals: { cottontail: 3, turkey: 2, fox: 2, deer: 4, bear: 1 } },
  lakes: { label: "Lakeshore in the Highlands", backdrop: "hills", water: "lake", sky: "#bcd9e6", haze: "#d6e8ee", far: "#5d806a", ground: "#a8b878", band: "#98a86a", patch: "#8e9e60", tuft: "#4f7a3a",
    trees: 8, pines: false, shrubs: 7, rocks: 6, logs: 2, tall: 12, animals: { cottontail: 2, turkey: 1, duck: 5, fox: 1, deer: 2, bear: 1 } },
  "river-valley": { label: "New England river valley", backdrop: "hills", water: "stream", sky: "#bcd9e6", haze: "#d6e8ee", far: "#678c56", ground: "#b2b878", band: "#a2a86a", patch: "#98a060", tuft: "#5d8a45",
    trees: 6, pines: false, shrubs: 8, rocks: 7, logs: 2, tall: 16, animals: { cottontail: 3, turkey: 3, duck: 3, fox: 2, deer: 3 } },
  alpine: { label: "Above treeline in the Whites", backdrop: "peaks", sky: "#c5d5e2", haze: "#dfe8ef", far: "#6f7a8c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52",
    trees: 5, pines: true, shrubs: 4, rocks: 14, logs: 1, tall: 5, cold: true, animals: { cottontail: 1, grouse: 3, fox: 1, deer: 2, bear: 1, moose: 2 } },
  "north-woods": { label: "Maine north woods", backdrop: "hills", water: "lake", sky: "#b9d3d6", haze: "#d0e2e2", far: "#35594a", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35",
    trees: 16, pines: true, shrubs: 8, rocks: 5, logs: 3, tall: 8, cold: true, animals: { cottontail: 1, grouse: 2, duck: 3, fox: 1, deer: 2, bear: 2, moose: 5 } }
});

export const THEMES = Object.freeze({
  wildlife: Object.freeze({
    id: "wildlife",
    title: "Wildlife Spotting",
    intro: "You have 30 seconds and 12 frames of film. Every good photo adds points to the photo board at Camp.",
    start: "Start spotting",
    again: "Spot again",
    action: "snap",
    shotsLabel: "Film left",
    reloadLabel: "Winding",
    scoreLabel: "Photo points",
    unit: "photo points",
    unitShort: "pts",
    fullText: "Board full",
    rounds: { seconds: 30, ammo: 12, magazine: 4, reloadSeconds: 1.1, cooldownSeconds: 0.28, maxScore: 400 },
    text: {
      intro: (where) => `${where} Aim with W A S D or the arrow keys. Press Space or tap to snap a photo. Four frames are wound at a time; winding the next ones is automatic.`,
      hit: (sp, value) => (value > 0 ? `Snap! ${/^[aeiou]/i.test(sp.name) ? "An" : "A"} ${sp.name} for ${value} points.` : `Snap! The photo board is already full, but what a sight: ${sp.name}!`),
      miss: (reloading) => (reloading ? `Nothing in frame. Winding film for ${reloading} seconds.` : "Nothing in frame. Nearby wildlife may have been startled."),
      reloading: (seconds) => `Winding film: ${seconds} seconds.`,
      cooldown: "Hold steady before the next photo.",
      finish: (s, spotted) => (s.score > 0
        ? `The outing is over. You photographed ${s.hits} ${s.hits === 1 ? "animal" : "animals"} for ${s.score} photo points${spotted ? `: ${spotted}` : ""}. ${s.hits} of ${s.shots} ${s.shots === 1 ? "frame" : "frames"} on target (${s.accuracy}%).`
        : `The outing is over. Nothing on film from ${s.shots} ${s.shots === 1 ? "frame" : "frames"} this time; the woods are big and the critters are shy.`)
    },
    species: SPECIES,
    habitats: HABITATS,
    weathers: Object.freeze(["clear", "clear", "clear", "clear", "windy", "rain", "fog"]),
    coldWeathers: Object.freeze(["clear", "clear", "snow", "fog", "windy"])
  })
});

export const DEFAULT_THEME = "wildlife";

export function themeFor(id) {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}
