// Expedition themes: DATA ONLY. The expedition engine (engine/expedition.js) runs any theme here.
// To add a new activity (birding, foraging, scavenger hunts, trail clean-up...), add a theme object:
// no engine or UI changes are needed unless it wants brand-new mechanics.
//
// Species `weight` is the base chance to appear; `habitats` adds extra weight in a region's scene
// (see `scene` in trail/appalachian-trail.js regions). Sprites are tiny pixel grids: each character
// maps to a colour in the theme palette ("." is transparent). Sprites face right.
//
// Results stock the crew's camp (pantry or photo board). They NEVER award trail miles.

const SPRITES = Object.freeze({
  rabbit: ["..bb....", "..bb....", ".bbbbbb.", "bbbbbbbw", ".b...b.."],
  squirrel: ["tt......", "ttt.bb..", ".ttbbbb.", "..bbbbb.", "..b..b.."],
  turkey: ["..rr......", "..hh..ttt.", "...hbbbttt", "...bbbbbt.", "....bbbb..", ".....l.l.."],
  grouse: ["..hh....", "..hbbbb.", ".bbbbbbt", "..bbbbt.", "...l.l.."],
  deer: ["......aa..", ".......hh.", ".......hhn", "bbbbbbbbb.", "bbbbbbbb..", "wbbbbbbb..", ".l.l..l.l.", ".l.l..l.l."],
  bear: ["......kk..", "..kkkkkkkn", ".kkkkkkkk.", "kkkkkkkkk.", ".kk...kk..", ".kk...kk.."],
  duck: ["......gg.", "......ggy", "bbbbbbbb.", ".wbbbbb..", "..wwww..."],
  owl: [".h..h.", "hhhhhh", "hyhhyh", "hhoohh", ".hhhh.", ".l..l."],
  eft: ["......oo", "oooooooo", ".o..o..."],
  heron: ["....hh..", "....hhy.", "....h...", "..bbbb..", ".bbbbb..", "...l....", "...l...."]
});

const PALETTE = Object.freeze({
  b: "#8a6a4a", w: "#f4ead5", t: "#a0522d", r: "#c0392b", h: "#5b4636", l: "#3b2f25", a: "#c9b28a",
  n: "#1f1f1f", k: "#1c1a18", g: "#2f6b3f", y: "#e0a43a", o: "#e8692c"
});

const MOVE = Object.freeze({
  skittish: { pause: 0.35, turn: 0.15, mult: [1, 1.8], timer: [0.4, 1.2], pauseTime: [0.3, 0.9] },
  grazer: { pause: 0.4, turn: 0.2, mult: [0.7, 1.5], timer: [1, 2.4], pauseTime: [0.8, 1.7] },
  steady: { pause: 0.25, turn: 0.12, mult: [0.6, 1.3], timer: [1.5, 3], pauseTime: [0.8, 1.6] },
  flyer: { pause: 0.08, turn: 0.08, mult: [0.9, 1.6], timer: [0.8, 1.7], pauseTime: [0.2, 0.5] }
});

const species = (id, name, value, speed, opts = {}) => Object.freeze({
  id, name, value, speed, sprite: SPRITES[opts.sprite || id], skittish: opts.skittish !== false,
  group: opts.group || 1, weight: opts.weight ?? 2, habitats: Object.freeze(opts.habitats || {}),
  move: MOVE[opts.move || "skittish"], ground: opts.ground !== false
});

export const THEMES = Object.freeze({
  hunt: Object.freeze({
    id: "hunt",
    title: "Camp hunt",
    navLabel: "Hunt",
    intro: "The classic camp minigame, back from the old Oregon Trail days. Thirty seconds, twelve shots: bring food back to the crew's pantry.",
    actionLabel: "Fire",
    toolName: "shots",
    magazine: 4, ammo: 12, roundSeconds: 30, reloadSeconds: 1.1, cooldownSeconds: 0.28,
    removeOnHit: true, startleOnMiss: true, maxScore: 400,
    reward: { key: "food", unit: "lb of food", camp: "pantry" },
    resultText: (s) => `You brought back ${s.score} lb of food (${s.hits} of ${s.shots} shots on target).`,
    palette: PALETTE,
    species: Object.freeze([
      species("rabbit", "rabbit", 2, 80, { weight: 4 }),
      species("squirrel", "gray squirrel", 1, 90, { weight: 4, habitats: { "southern-ridges": 2, "river-valley": 2 } }),
      species("turkey", "wild turkey", 12, 46, { weight: 3, move: "grazer", group: 2, habitats: { "blue-ridge": 2, "southern-ridges": 2 } }),
      species("grouse", "ruffed grouse", 6, 70, { weight: 2, habitats: { alpine: 2, "north-woods": 2 } }),
      species("deer", "white-tailed deer", 50, 58, { weight: 3, move: "grazer", group: 2 }),
      species("duck", "wood duck", 14, 68, { weight: 1, move: "flyer", group: 3, ground: false, habitats: { lakes: 4, "north-woods": 3, "river-valley": 3 } }),
      species("bear", "black bear", 80, 40, { weight: 1, skittish: false, move: "steady", habitats: { "high-balds": 2, "north-woods": 2 } })
    ])
  }),
  wildlife: Object.freeze({
    id: "wildlife",
    title: "Wildlife spotting",
    navLabel: "Spotting",
    intro: "Trade the rifle for a camera. Snap the animals that live along the trail; rare sightings earn more points for the crew's photo board.",
    actionLabel: "Snap photo",
    toolName: "photos",
    magazine: 12, ammo: 12, roundSeconds: 40, reloadSeconds: 0, cooldownSeconds: 0.5,
    removeOnHit: false, startleOnMiss: false, maxScore: 400,
    reward: { key: "photos", unit: "photo points", camp: "photo board" },
    resultText: (s) => `You took ${s.hits} good photo${s.hits === 1 ? "" : "s"} worth ${s.score} points for the photo board.`,
    palette: PALETTE,
    species: Object.freeze([
      species("deer", "white-tailed deer", 5, 50, { weight: 4, move: "grazer", group: 2 }),
      species("rabbit", "cottontail", 4, 70, { weight: 4 }),
      species("turkey", "wild turkey", 8, 40, { weight: 3, move: "grazer", group: 2 }),
      species("eft", "red eft (newt)", 15, 18, { weight: 2, move: "steady", habitats: { "high-balds": 2, "blue-ridge": 2 } }),
      species("heron", "great blue heron", 12, 30, { weight: 1, move: "steady", habitats: { lakes: 4, "river-valley": 3 } }),
      species("owl", "barred owl", 20, 16, { weight: 1, move: "steady", ground: false, habitats: { "north-woods": 2, "southern-ridges": 1 } }),
      species("bear", "black bear (from a safe distance!)", 25, 36, { weight: 1, skittish: false, move: "steady", habitats: { "high-balds": 2, "north-woods": 2 } })
    ])
  })
});

export const DEFAULT_THEME = "hunt";

export function themeFor(id) {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}
