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
//              2 = light, 3 = accent. leg 1/2 lengthens the part on alternate steps; -1/-2 shortens it
//              (wings use the same trick to flap).
//   group      "mammal" | "bird" | "insect" | "herp" (reptiles and amphibians): field guide sections.
//   rarity     "common" | "uncommon" | "rare" | "legend". Rare and legendary species never use the
//              habitat weights: each habitat lists them in `rare` / `legends`, and the engine rolls for
//              one at most once per outing (see RARE_CHANCE / LEGEND_CHANCE in engine/expedition.js).
//   fly        "high" (soars over the treetops) or "low" (flits just above the ground). Ground otherwise.
//   season     "warm": much scarcer from November to March (insects, frogs, turtles, salamanders);
//              "cold": a winter-only visitor.
//   fact/range one short, accurate field-guide fact and where along the trail to look.
// Habitats are keyed by the region `scene` in trail/appalachian-trail.js. `animals` holds spawn weights
// by species id; `rare` and `legends` list the special finds possible there; `fact` is a habitat note. Colours and scenery counts drive the seeded backdrop.
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
  moose: { pause: 0.35, turn: 0.1, mult: [0.7, 1.2], drift: 8, timer: [1.5, 3], pauseTime: [1, 2] },
  songbird: { pause: 0.15, turn: 0.3, mult: [0.9, 1.6], drift: 30, timer: [0.4, 1], pauseTime: [0.3, 0.8] },
  soar: { pause: 0, turn: 0.15, mult: [0.8, 1.3], drift: 12, timer: [1, 2.2], pauseTime: [0, 0] },
  owl: { pause: 0.5, turn: 0.1, mult: [0.7, 1.1], drift: 10, timer: [1, 2], pauseTime: [1, 2] },
  flutter: { pause: 0.15, turn: 0.35, mult: [0.6, 1.4], drift: 55, timer: [0.25, 0.7], pauseTime: [0.3, 0.9] },
  dart: { pause: 0.4, turn: 0.3, mult: [1, 2.4], drift: 40, timer: [0.3, 0.8], pauseTime: [0.4, 1] },
  hover: { pause: 0.3, turn: 0.3, mult: [0.7, 1.3], drift: 35, timer: [0.3, 0.9], pauseTime: [0.3, 0.8] },
  creep: { pause: 0.55, turn: 0.15, mult: [0.6, 1.1], drift: 6, timer: [1, 2.2], pauseTime: [1, 2.2] },
  scurry: { pause: 0.35, turn: 0.3, mult: [1, 2.2], drift: 30, timer: [0.25, 0.7], pauseTime: [0.3, 0.7] },
  sneak: { pause: 0.4, turn: 0.1, mult: [0.8, 1.4], drift: 6, timer: [1, 2], pauseTime: [0.6, 1.4] }
});

const freezeAll = (list) => Object.freeze(list.map((item) => Object.freeze(item)));

const CLASSIC = [
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
];

// Field guide details for the original nine.
const CLASSIC_INFO = {
  cottontail: { group: "mammal", rarity: "common", fact: "Cottontails zigzag when chased and flash their white tail, which may help confuse a predator.", range: "Fields and forest edges at lower elevations." },
  turkey: { group: "bird", rarity: "common", fact: "Wild turkeys roost in trees at night. They nearly vanished by 1900 and have made a big comeback.", range: "Woods and clearings along the whole trail." },
  grouse: { group: "bird", rarity: "common", fact: "In spring the male drums by beating his wings, a low thump you can feel as much as hear.", range: "Young forests from Georgia to Maine." },
  duck: { group: "bird", rarity: "uncommon", fact: "Wood duck chicks leap from their tree-hole nest the day after hatching, sometimes from very high up.", range: "Wooded ponds, lakes and slow rivers." },
  fox: { group: "mammal", rarity: "uncommon", fact: "A red fox can hear a mouse under the snow, then pounces nose-first to catch it.", range: "Forest edges and fields along the whole trail." },
  deer: { group: "mammal", rarity: "common", fact: "When alarmed, a white-tailed deer raises its tail like a white flag to warn the others.", range: "The whole trail; very easy to see in Shenandoah." },
  elk: { group: "mammal", rarity: "uncommon", fact: "Elk disappeared from the Smokies in the 1800s and were brought back to the Cataloochee valley in 2001.", range: "Mostly around the Great Smoky Mountains." },
  bear: { group: "mammal", rarity: "uncommon", fact: "Black bears can be brown or cinnamon too. Hikers hang their snacks or use canisters so bears stay wild.", range: "The whole trail, especially Shenandoah and the Smokies." },
  moose: { group: "mammal", rarity: "uncommon", fact: "Moose are strong swimmers and wade into ponds to munch water plants.", range: "Northern New England, especially Maine." }
};

const DEER_PARTS = CLASSIC.find((sp) => sp.id === "deer").parts;

// New in the Wildlife Spotting sprint: birds, insects, reptiles and amphibians, rare finds and legends.
const NEW_SPECIES = [
  // Mammals
  { id: "beaver", name: "beaver", group: "mammal", rarity: "uncommon", value: 35, speed: 30, w: 22, h: 10, skittish: true, behavior: BEHAVIOR.bear,
    colors: ["#7a4e2d", "#3a2616"], light: "#e8a33a",
    parts: [[4, 2, 13, 7, 0], [0, 5, 6, 3, 1], [15, 1, 6, 6, 0], [20, 3, 2, 2, 1], [19, 6, 2, 2, 2], [17, 0, 2, 1, 1], [6, 9, 2, 1, 1, 1], [13, 9, 2, 1, 1, 2]],
    fact: "Beaver dams make ponds and wetlands that frogs, ducks and even moose depend on.", range: "Streams and ponds, more common farther north." },
  { id: "coyote", name: "coyote", group: "mammal", rarity: "uncommon", value: 30, speed: 62, w: 25, h: 13, skittish: true, behavior: BEHAVIOR.fox,
    colors: ["#a08a6a", "#4a3a2a"], light: "#e8dcc4",
    parts: [[5, 4, 13, 6, 0], [7, 8, 9, 2, 2], [0, 5, 6, 3, 0], [0, 6, 2, 2, 1], [17, 1, 6, 6, 0], [18, -1, 2, 2, 1], [21, -1, 2, 2, 1],
      [22, 4, 3, 2, 2], [24, 4, 1, 1, 1], [7, 10, 2, 3, 1, 1], [10, 10, 2, 3, 1, 2], [14, 10, 2, 3, 1, 1], [16, 10, 2, 3, 1, 2]],
    fact: "Coyotes spread into the East only in the last century; eastern coyotes are often bigger than western ones.", range: "The whole trail, though rarely seen." },
  { id: "otter", name: "river otter", group: "mammal", rarity: "uncommon", value: 45, speed: 56, w: 26, h: 8, skittish: true, behavior: BEHAVIOR.duck,
    colors: ["#5a3e2a", "#2e1f14"], light: "#c9b08a",
    parts: [[4, 2, 16, 5, 0], [0, 4, 6, 2, 0], [19, 1, 6, 5, 0], [24, 3, 2, 1, 1], [22, 2, 1, 1, 1], [21, 5, 4, 1, 2], [6, 7, 2, 1, 1, 1], [15, 7, 2, 1, 1, 2]],
    fact: "River otters love to play and slide down muddy or snowy banks.", range: "Clean rivers and lakes, mostly in the north." },
  // Reptiles and amphibians
  { id: "box-turtle", name: "eastern box turtle", group: "herp", rarity: "uncommon", season: "warm", value: 20, speed: 10, w: 15, h: 8, skittish: false, behavior: BEHAVIOR.creep,
    colors: ["#6b4a22", "#3a2a14"], light: "#e0a43a",
    parts: [[2, 0, 10, 5, 0], [4, 1, 2, 1, 2], [8, 2, 2, 1, 2], [5, 3, 1, 1, 2], [1, 4, 12, 2, 1], [12, 3, 3, 2, 2], [3, 6, 2, 2, 1, 1], [9, 6, 2, 2, 1, 2]],
    fact: "A box turtle can shut its hinged shell tight like a box, and can live for many decades.", range: "Southern and Mid-Atlantic forests." },
  { id: "red-eft", name: "red eft", group: "herp", rarity: "common", season: "warm", value: 18, speed: 12, w: 12, h: 4, skittish: false, behavior: BEHAVIOR.creep,
    colors: ["#e2622a", "#8a3418"], light: "#ffd060",
    parts: [[2, 1, 8, 2, 0], [0, 2, 3, 1, 0], [9, 0, 3, 3, 0], [11, 1, 1, 1, 1], [4, 1, 1, 1, 2], [7, 1, 1, 1, 2], [3, 3, 1, 1, 1, 1], [8, 3, 1, 1, 1, 2]],
    fact: "The bright orange eft is a young eastern newt that lives on land for a few years. Its colour warns that it is toxic.", range: "Damp forest floors along the whole trail." },
  { id: "wood-frog", name: "wood frog", group: "herp", rarity: "common", season: "warm", value: 15, speed: 70, w: 11, h: 7, skittish: true, behavior: BEHAVIOR.rabbit,
    colors: ["#a07848", "#3a2818"], light: "#f0e2c0",
    parts: [[1, 2, 8, 4, 0], [7, 0, 4, 4, 0], [7, 2, 4, 1, 1], [9, 1, 1, 1, 1], [2, 5, 6, 1, 2], [0, 4, 3, 2, 0], [2, 6, 4, 1, 1, 1], [7, 5, 2, 2, 1, -2]],
    fact: "Wood frogs can survive being partly frozen all winter and thaw out in spring.", range: "Woodland pools all the way to Maine." },
  // Birds
  { id: "bald-eagle", name: "bald eagle", group: "bird", rarity: "uncommon", fly: "high", value: 60, speed: 54, w: 26, h: 12, skittish: true, behavior: BEHAVIOR.soar,
    colors: ["#4a3020", "#2a1a10"], light: "#fffaf0", accent: "#e0a43a",
    parts: [[6, 5, 13, 4, 0], [8, 1, 10, 4, 1, 1], [9, 9, 8, 2, 1, -2], [18, 3, 5, 4, 2], [22, 5, 3, 2, 3], [20, 4, 1, 1, 1], [0, 5, 7, 3, 2], [11, 9, 1, 2, 3], [14, 9, 1, 2, 3]],
    fact: "Bald eagles were endangered in the 1970s and recovered after the pesticide DDT was banned.", range: "Big lakes and rivers, especially in the north." },
  { id: "red-tailed-hawk", name: "red-tailed hawk", group: "bird", rarity: "common", fly: "high", value: 35, speed: 50, w: 22, h: 11, skittish: true, behavior: BEHAVIOR.soar,
    colors: ["#8a5a32", "#4a2e1a"], light: "#f4e8d0", accent: "#c8642a",
    parts: [[5, 4, 11, 4, 0], [6, 7, 9, 2, 2], [7, 0, 8, 4, 1, 1], [8, 8, 7, 2, 1, -2], [15, 2, 5, 4, 0], [19, 4, 2, 2, 1], [17, 3, 1, 1, 1], [0, 4, 6, 3, 3]],
    fact: "Its scream is the \"eagle cry\" heard in movies. Every fall thousands of hawks ride the winds along Pennsylvania's ridges.", range: "Open ridges and fields along the whole trail." },
  { id: "blue-jay", name: "blue jay", group: "bird", rarity: "common", fly: "low", value: 12, speed: 66, w: 14, h: 9, skittish: true, behavior: BEHAVIOR.songbird,
    colors: ["#3f7fc0", "#1f2f4f"], light: "#f4f4f4",
    parts: [[3, 3, 7, 4, 0], [4, 6, 6, 2, 2], [9, 1, 4, 5, 0], [10, 0, 2, 1, 0], [12, 3, 2, 1, 1], [11, 2, 1, 1, 1], [0, 3, 4, 2, 0], [4, 2, 5, 2, 1, 1]],
    fact: "Blue jays can copy a hawk's call, and they help plant oak forests by burying acorns.", range: "Woods along the whole trail." },
  { id: "meadowlark", name: "eastern meadowlark", group: "bird", rarity: "uncommon", value: 16, speed: 42, w: 14, h: 10, skittish: true, behavior: BEHAVIOR.grouse,
    colors: ["#a07848", "#3a2818"], light: "#f0d040",
    parts: [[2, 3, 8, 4, 0], [6, 5, 4, 3, 2], [7, 5, 1, 1, 1], [8, 6, 1, 1, 1], [9, 1, 4, 4, 0], [12, 3, 2, 1, 1], [0, 3, 3, 2, 0], [5, 8, 1, 2, 1, 1], [8, 8, 1, 2, 1, 2]],
    fact: "Despite its name, the meadowlark is a blackbird, not a lark. Its song is a sweet, clear whistle.", range: "Open meadows and pastures in the south and Mid-Atlantic." },
  { id: "barred-owl", name: "barred owl", group: "bird", rarity: "uncommon", fly: "low", value: 40, speed: 34, w: 14, h: 14, skittish: true, behavior: BEHAVIOR.owl,
    colors: ["#8a7458", "#4a3a2a"], light: "#efe6d4",
    parts: [[3, 4, 8, 8, 0], [4, 6, 6, 5, 2], [5, 7, 1, 1, 1], [8, 8, 1, 1, 1], [3, 0, 8, 5, 0], [4, 1, 2, 2, 1], [8, 1, 2, 2, 1], [6, 3, 2, 1, 1], [0, 4, 3, 6, 1, 1], [11, 4, 3, 6, 1, 2]],
    fact: "Its call sounds like \"Who cooks for you? Who cooks for you-all?\"", range: "Old, damp forests along the whole trail." },
  { id: "loon", name: "common loon", group: "bird", rarity: "uncommon", value: 45, speed: 40, w: 22, h: 9, skittish: true, behavior: BEHAVIOR.duck,
    colors: ["#1a1a1a", "#0a0a0a"], light: "#f4f4f4", accent: "#a8382a",
    parts: [[3, 3, 14, 5, 0], [5, 4, 2, 1, 2], [9, 4, 2, 1, 2], [13, 4, 2, 1, 2], [15, 0, 4, 6, 0], [18, 2, 4, 2, 1], [16, 1, 1, 1, 3], [14, 6, 2, 1, 2]],
    fact: "Loons have heavy, solid bones that help them dive deep. Their wild call echoes across northern lakes.", range: "Northern lakes in New Hampshire and Maine." },
  // Insects
  { id: "monarch", name: "monarch butterfly", group: "insect", rarity: "common", fly: "low", season: "warm", value: 25, speed: 34, w: 10, h: 8, skittish: true, behavior: BEHAVIOR.flutter,
    colors: ["#e07820", "#1a1a1a"], light: "#fffaf0",
    parts: [[4, 2, 2, 5, 1], [0, 0, 4, 4, 0, 1], [6, 0, 4, 4, 0, 2], [0, 4, 4, 3, 0, -1], [6, 4, 4, 3, 0, -2], [1, 1, 1, 1, 1], [8, 1, 1, 1, 1], [1, 5, 1, 1, 2], [8, 5, 1, 1, 2]],
    fact: "Eastern monarchs fly up to about 3,000 miles to Mexico every fall.", range: "Meadows and balds in summer and early fall." },
  { id: "darner", name: "green darner dragonfly", group: "insect", rarity: "common", fly: "low", season: "warm", value: 28, speed: 80, w: 14, h: 7, skittish: true, behavior: BEHAVIOR.dart,
    colors: ["#2f8a7a", "#1a3a3a"], light: "#d8eef0",
    parts: [[0, 3, 11, 2, 0], [10, 2, 4, 3, 1], [3, 0, 3, 2, 2, 1], [7, 0, 3, 2, 2, 2], [3, 5, 3, 2, 2, -1], [7, 5, 3, 2, 2, -2]],
    fact: "Green darners are big dragonflies that migrate south in the fall, a bit like monarchs.", range: "Ponds, lakes and wet meadows." },
  { id: "firefly", name: "firefly", group: "insect", rarity: "uncommon", fly: "low", season: "warm", value: 30, speed: 26, w: 8, h: 6, skittish: true, behavior: BEHAVIOR.hover,
    colors: ["#3a2a1a", "#1a1010"], light: "#f8f070",
    parts: [[2, 1, 4, 3, 0], [6, 1, 2, 2, 1], [0, 2, 3, 3, 2], [2, 0, 3, 1, 2, 1]],
    fact: "In early summer one kind of firefly in the Smokies flashes in sync, lighting up the forest together.", range: "Warm, damp evenings along the trail." },
  { id: "bumble-bee", name: "bumble bee", group: "insect", rarity: "common", fly: "low", season: "warm", value: 20, speed: 30, w: 9, h: 7, skittish: true, behavior: BEHAVIOR.hover,
    colors: ["#e0b020", "#1a1a1a"], light: "#e8f4f8",
    parts: [[1, 2, 7, 4, 0], [3, 2, 1, 4, 1], [6, 2, 1, 4, 1], [7, 3, 2, 2, 1], [2, 0, 3, 2, 2, 1], [5, 0, 3, 2, 2, 2]],
    fact: "Bumble bees shiver their flight muscles to warm up, so they can fly on chilly mountain mornings.", range: "Flowery meadows and balds." },
  { id: "mantis", name: "Carolina mantis", group: "insect", rarity: "uncommon", season: "warm", value: 30, speed: 16, w: 14, h: 11, skittish: false, behavior: BEHAVIOR.creep,
    colors: ["#7aa04a", "#3a5a2a"], light: "#c8e090",
    parts: [[1, 5, 9, 2, 0], [9, 1, 2, 6, 0], [10, 0, 3, 2, 0], [12, 0, 1, 1, 1], [11, 3, 2, 1, 2], [12, 4, 1, 3, 2], [2, 7, 1, 4, 1, 1], [6, 7, 1, 4, 1, 2]],
    fact: "The Carolina mantis is native to the East and can turn its head to look over its shoulder.", range: "Fields and gardens in the south and Mid-Atlantic." },
  { id: "tiger-beetle", name: "six-spotted tiger beetle", group: "insect", rarity: "common", season: "warm", value: 24, speed: 74, w: 9, h: 6, skittish: true, behavior: BEHAVIOR.scurry,
    colors: ["#2a9a5a", "#1a4a2a"], light: "#fffaf0",
    parts: [[1, 1, 6, 4, 0], [6, 2, 3, 2, 1], [2, 2, 1, 1, 2], [4, 3, 1, 1, 2], [2, 4, 1, 1, 2], [1, 5, 1, 1, 1, 1], [6, 5, 1, 1, 1, 2]],
    fact: "This shiny green beetle sprints ahead of hikers on sunny paths, then stops and waits.", range: "Sunny trails through the woods." },
  // Rare finds
  { id: "white-deer", name: "white deer", group: "mammal", rarity: "rare", value: 150, speed: 52, w: 26, h: 18, skittish: true, graze: true, behavior: BEHAVIOR.deer,
    colors: ["#efeadf", "#8a7f70"], light: "#ffffff", parts: DEER_PARTS,
    fact: "Most white deer are piebald or leucistic white-tailed deer, not true albinos. Seeing one is a rare treat.", range: "Anywhere deer live, very rarely." },
  { id: "hellbender", name: "eastern hellbender", group: "herp", rarity: "rare", season: "warm", value: 150, speed: 14, w: 20, h: 6, skittish: false, behavior: BEHAVIOR.creep,
    colors: ["#6a5a3a", "#3a2f1e"], light: "#9a8a5a",
    parts: [[3, 1, 13, 4, 0], [0, 3, 4, 2, 0], [15, 1, 5, 3, 0], [18, 2, 1, 1, 1], [5, 1, 2, 1, 2], [10, 2, 2, 1, 2], [4, 5, 2, 1, 1, 1], [13, 5, 2, 1, 1, 2]],
    fact: "North America's biggest salamander breathes mostly through its wrinkly skin. The southern Appalachians have more kinds of salamander than anywhere on Earth.", range: "Clean, rocky mountain streams in the south and Mid-Atlantic." },
  { id: "golden-warbler", name: "golden-winged warbler", group: "bird", rarity: "rare", fly: "low", value: 150, speed: 60, w: 12, h: 8, skittish: true, behavior: BEHAVIOR.songbird,
    colors: ["#9aa0a8", "#2a2a2a"], light: "#f4f4f4", accent: "#f0c020",
    parts: [[2, 3, 6, 3, 0], [3, 5, 5, 2, 2], [7, 1, 4, 4, 0], [7, 0, 3, 1, 3], [10, 3, 2, 1, 1], [8, 2, 1, 1, 1], [3, 2, 4, 2, 3, 1], [0, 3, 3, 2, 0]],
    fact: "A tiny songbird with golden wing patches. It has grown rare, and nests in young, shrubby mountain forest.", range: "Open mountain slopes in the south, Virginia and the Highlands." },
  { id: "gray-petaltail", name: "gray petaltail", group: "insect", rarity: "rare", fly: "low", season: "warm", value: 150, speed: 70, w: 20, h: 9, skittish: true, behavior: BEHAVIOR.dart,
    colors: ["#5a5e62", "#1a1a1a"], light: "#e4ecf0",
    parts: [[0, 4, 15, 2, 0], [14, 3, 5, 4, 1], [16, 4, 1, 1, 2], [4, 0, 4, 3, 2, 1], [9, 0, 4, 3, 2, 2], [4, 6, 4, 3, 2, -1], [9, 6, 4, 3, 2, -2], [2, 4, 1, 2, 1], [6, 4, 1, 2, 1], [10, 4, 1, 2, 1]],
    fact: "A big dragonfly from an ancient family that dates back to the dinosaurs. It sometimes lands on hikers!", range: "Seepy mountain slopes from Georgia to Pennsylvania." },
  { id: "snowy-owl", name: "snowy owl", group: "bird", rarity: "rare", fly: "low", season: "cold", value: 150, speed: 30, w: 18, h: 14, skittish: true, behavior: BEHAVIOR.owl,
    colors: ["#f8f8f4", "#3a3a3a"], light: "#ffffff", accent: "#e0b020",
    parts: [[4, 4, 10, 9, 0], [4, 0, 10, 5, 0], [6, 2, 2, 1, 3], [10, 2, 2, 1, 3], [8, 3, 2, 1, 1], [5, 6, 1, 1, 1], [9, 8, 1, 1, 1], [12, 6, 1, 1, 1], [0, 4, 4, 7, 0, 1], [14, 4, 4, 7, 0, 2]],
    fact: "Snowy owls nest in the Arctic. Only in some winters do a few wander south to New England.", range: "A rare winter visitor in the north." },
  { id: "lynx", name: "Canada lynx", group: "mammal", rarity: "rare", value: 150, speed: 48, w: 24, h: 15, skittish: true, behavior: BEHAVIOR.fox,
    colors: ["#b8a890", "#3a2f24"], light: "#efe6d4",
    parts: [[4, 4, 14, 7, 0], [6, 9, 10, 2, 2], [2, 3, 3, 3, 0], [2, 3, 1, 1, 1], [17, 1, 6, 6, 0], [17, -2, 1, 3, 1], [22, -2, 1, 3, 1], [19, 5, 4, 2, 2], [21, 3, 1, 1, 1],
      [5, 11, 3, 4, 0, 1], [9, 11, 3, 4, 0, 2], [14, 11, 3, 4, 0, 1], [17, 11, 3, 4, 0, 2]],
    fact: "Lynx have huge furry paws that work like snowshoes. In the East they live mainly in northern Maine.", range: "Deep north woods of Maine." },
  // Legends: purely for fun.
  { id: "bigfoot", name: "Bigfoot", group: "legend", rarity: "legend", value: 200, speed: 28, w: 18, h: 26, skittish: true, behavior: BEHAVIOR.sneak,
    colors: ["#5a3a24", "#2a1a10"], light: "#a07a52",
    parts: [[4, 6, 10, 12, 0], [5, 0, 8, 7, 0], [7, 2, 4, 4, 2], [7, 3, 1, 1, 1], [10, 3, 1, 1, 1], [1, 7, 3, 10, 0, 1], [14, 7, 3, 10, 0, 2], [4, 18, 4, 8, 0, 1], [10, 18, 4, 8, 0, 2]],
    fact: "Stories tell of a tall, hairy wild man in the eastern mountains. Nobody has ever proven it, but you got the photo!", range: "Rumoured everywhere." },
  { id: "jackalope", name: "jackalope", group: "legend", rarity: "legend", value: 200, speed: 84, w: 16, h: 16, skittish: true, behavior: BEHAVIOR.rabbit,
    colors: ["#b79d7c", "#6e5a43"], light: "#fffaf0", accent: "#c9a46a",
    parts: [[2, 8, 9, 6, 0], [9, 7, 5, 5, 0], [10, 4, 2, 4, 0], [0, 9, 3, 3, 2], [12, 8, 1, 1, 1], [10, 0, 1, 4, 3], [13, 0, 1, 4, 3], [9, 1, 1, 1, 3], [14, 1, 1, 1, 3],
      [3, 14, 3, 2, 1, -1], [8, 14, 3, 2, 1, -2]],
    fact: "A rabbit with antlers from Western folklore. What is it doing on the Appalachian Trail?", range: "Rumoured: a very long way from Wyoming." },
  { id: "snallygaster", name: "Snallygaster", group: "legend", rarity: "legend", fly: "high", value: 200, speed: 46, w: 30, h: 18, skittish: true, behavior: BEHAVIOR.soar,
    colors: ["#5a7a4a", "#2a3a22"], light: "#e8d8a0", accent: "#c0392b",
    parts: [[6, 7, 16, 7, 0], [8, 11, 12, 2, 2], [0, 9, 7, 3, 0], [21, 4, 7, 5, 0], [27, 6, 3, 2, 2], [24, 5, 1, 1, 3], [9, 0, 10, 7, 1, 1], [24, 1, 1, 3, 2], [10, 14, 2, 4, 1, 1], [18, 14, 2, 4, 1, 2]],
    fact: "A winged monster from Maryland folklore, said to haunt South Mountain, which the trail crosses.", range: "Rumoured: Maryland's South Mountain." },
  { id: "wampus-cat", name: "Wampus cat", group: "legend", rarity: "legend", value: 200, speed: 58, w: 25, h: 13, skittish: true, behavior: BEHAVIOR.sneak,
    colors: ["#3a3530", "#151210"], light: "#e8e050",
    parts: [[5, 4, 14, 6, 0], [0, 1, 6, 3, 0], [0, 0, 2, 2, 0], [18, 1, 6, 6, 0], [19, -2, 2, 3, 0], [22, -2, 2, 3, 0], [21, 3, 1, 1, 2], [23, 3, 1, 1, 2],
      [6, 10, 2, 3, 1, 1], [10, 10, 2, 3, 1, 2], [15, 10, 2, 3, 1, 1], [18, 10, 2, 3, 1, 2]],
    fact: "A mysterious cat from Appalachian folklore, said to prowl the woods at night with glowing eyes.", range: "Rumoured: the southern mountains." }
];

const SPECIES = freezeAll([...CLASSIC.map((sp) => ({ ...sp, ...CLASSIC_INFO[sp.id] })), ...NEW_SPECIES]);

// backdrop: "hills" | "ridges" (layered Blue Ridge) | "balds" (grassy tops) | "peaks" (above treeline).
// water: "stream" | "lake". pines: conifers instead of round hardwoods (hardwoods turn in autumn).
const HABITATS = Object.freeze({
  "southern-ridges": { label: "Georgia hardwood ridge", backdrop: "hills", sky: "#b9d6e0", haze: "#d4e6ea", far: "#5f7f55", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35",
    trees: 12, pines: false, shrubs: 10, rocks: 4, logs: 3, tall: 10, animals: { cottontail: 3, turkey: 4, grouse: 1, fox: 2, deer: 4, bear: 1, coyote: 1, "box-turtle": 2, "red-eft": 2, "wood-frog": 1, "red-tailed-hawk": 1, "blue-jay": 3, "barred-owl": 1, monarch: 1, firefly: 2, "bumble-bee": 2, mantis: 1, "tiger-beetle": 2 },
    rare: ["white-deer", "hellbender", "gray-petaltail"], legends: ["bigfoot", "jackalope", "wampus-cat"],
    fact: "Georgia's ridges are covered in oak and hickory forest, with mountain laurel in late spring." },
  "high-balds": { label: "Grassy bald in the Smokies", backdrop: "balds", sky: "#bcd9e6", haze: "#d6e8ee", far: "#6d8f5e", ground: "#b9c77a", band: "#a9b96a", patch: "#9fb260", tuft: "#4f7a3a",
    trees: 3, pines: true, shrubs: 8, rocks: 3, logs: 0, tall: 30, animals: { cottontail: 3, turkey: 2, grouse: 2, fox: 1, deer: 3, elk: 4, bear: 3, coyote: 1, "red-eft": 2, "red-tailed-hawk": 2, "blue-jay": 1, meadowlark: 2, "barred-owl": 1, monarch: 2, firefly: 3, "bumble-bee": 3, "tiger-beetle": 1 },
    rare: ["white-deer", "hellbender", "golden-warbler", "gray-petaltail"], legends: ["bigfoot", "jackalope", "wampus-cat"],
    fact: "Grassy balds are treeless mountaintops. Nobody is quite sure how all of them first formed." },
  "blue-ridge": { label: "Blue Ridge meadow", backdrop: "ridges", sky: "#c4dcea", haze: "#dce9f0", far: "#5c7f97", ground: "#a9b874", band: "#99a965", patch: "#8fa05c", tuft: "#4a7038",
    trees: 6, pines: false, shrubs: 8, rocks: 3, logs: 1, tall: 18, animals: { cottontail: 2, turkey: 3, grouse: 1, fox: 2, deer: 5, bear: 2, coyote: 2, "box-turtle": 2, "red-eft": 1, "red-tailed-hawk": 2, "blue-jay": 2, meadowlark: 3, "barred-owl": 1, monarch: 3, firefly: 2, "bumble-bee": 2, mantis: 2 },
    rare: ["white-deer", "golden-warbler", "hellbender"], legends: ["bigfoot", "jackalope"],
    fact: "The Blue Ridge looks blue from afar partly because of a natural haze given off by its trees." },
  "rocky-ridges": { label: "Rocky Pennsylvania ridge", backdrop: "hills", sky: "#c0d6e4", haze: "#d9e6ee", far: "#7b7f6c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52",
    trees: 7, pines: false, shrubs: 5, rocks: 16, logs: 2, tall: 6, animals: { cottontail: 3, turkey: 2, fox: 2, deer: 4, bear: 1, coyote: 2, "box-turtle": 1, "red-eft": 1, "red-tailed-hawk": 4, "blue-jay": 2, "bumble-bee": 1, mantis: 1, "tiger-beetle": 2 },
    rare: ["white-deer", "gray-petaltail", "hellbender"], legends: ["bigfoot", "jackalope", "snallygaster"],
    fact: "Pennsylvania's ridges are famous for sharp rocks, and for hawks riding the wind along them each fall." },
  lakes: { label: "Lakeshore in the Highlands", backdrop: "hills", water: "lake", sky: "#bcd9e6", haze: "#d6e8ee", far: "#5d806a", ground: "#a8b878", band: "#98a86a", patch: "#8e9e60", tuft: "#4f7a3a",
    trees: 8, pines: false, shrubs: 7, rocks: 6, logs: 2, tall: 12, animals: { cottontail: 2, turkey: 1, duck: 5, fox: 1, deer: 2, bear: 1, beaver: 2, otter: 1, "box-turtle": 1, "wood-frog": 2, "bald-eagle": 2, "blue-jay": 1, "barred-owl": 1, darner: 3 },
    rare: ["white-deer", "golden-warbler"], legends: ["bigfoot", "jackalope"],
    fact: "The Highlands of New Jersey and New York are dotted with lakes left behind by Ice Age glaciers." },
  "river-valley": { label: "New England river valley", backdrop: "hills", water: "stream", sky: "#bcd9e6", haze: "#d6e8ee", far: "#678c56", ground: "#b2b878", band: "#a2a86a", patch: "#98a060", tuft: "#5d8a45",
    trees: 6, pines: false, shrubs: 8, rocks: 7, logs: 2, tall: 16, animals: { cottontail: 3, turkey: 3, duck: 3, fox: 2, deer: 3, coyote: 2, beaver: 2, otter: 2, "wood-frog": 2, "bald-eagle": 1, "red-tailed-hawk": 1, "blue-jay": 2, monarch: 2, darner: 2, firefly: 1 },
    rare: ["white-deer"], legends: ["bigfoot", "jackalope"],
    fact: "New England's river valleys were carved and smoothed by Ice Age glaciers." },
  alpine: { label: "Above treeline in the Whites", backdrop: "peaks", sky: "#c5d5e2", haze: "#dfe8ef", far: "#6f7a8c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52",
    trees: 5, pines: true, shrubs: 4, rocks: 14, logs: 1, tall: 5, cold: true, animals: { cottontail: 1, grouse: 3, fox: 1, deer: 2, bear: 1, moose: 2, coyote: 1, "red-tailed-hawk": 1, "bumble-bee": 1 },
    rare: ["snowy-owl", "white-deer"], legends: ["bigfoot", "jackalope"],
    fact: "Above treeline, plants grow low and slow. A few alpine flowers here grow almost nowhere else." },
  "north-woods": { label: "Maine north woods", backdrop: "hills", water: "lake", sky: "#b9d3d6", haze: "#d0e2e2", far: "#35594a", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35",
    trees: 16, pines: true, shrubs: 8, rocks: 5, logs: 3, tall: 8, cold: true, animals: { cottontail: 1, grouse: 2, duck: 3, fox: 1, deer: 2, bear: 2, moose: 5, coyote: 1, beaver: 3, otter: 2, loon: 4, "bald-eagle": 2, "wood-frog": 2, "barred-owl": 2, darner: 2 },
    rare: ["lynx", "snowy-owl", "white-deer"], legends: ["bigfoot", "jackalope"],
    fact: "Maine's north woods are a land of spruce, fir, lakes, loons and moose." }
});

export const THEMES = Object.freeze({
  wildlife: Object.freeze({
    id: "wildlife",
    title: "Wildlife Spotting",
    intro: "You have 30 seconds and 12 frames of film. Each species scores once per outing, and a species new to the field guide scores double. Fill the guide!",
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
      hit: (sp, value) => (value > 0 ? `Snap! ${/^[A-Z]/.test(sp.name) ? "" : /^[aeiou]/i.test(sp.name) ? "An " : "A "}${sp.name} for ${value} points.` : `Snap! The photo board is already full, but what a sight: ${sp.name}!`),
      rare: (sp) => `A rare find: ${sp.name}! Hold steady…`,
      legend: (sp) => `Wait… is that ${/^[A-Z]/.test(sp.name) ? "" : "a "}${sp.name}?! Get the photo!`,
      discovery: (sp) => `New in the field guide: ${sp.name}! Double points.`,
      repeat: (sp) => `Already got ${/^[A-Z]/.test(sp.name) ? "" : /^[aeiou]/i.test(sp.name) ? "an " : "a "}${sp.name} this outing. Look for something new.`,
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
