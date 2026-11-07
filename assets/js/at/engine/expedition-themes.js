// Expedition themes: DATA ONLY. engine/expedition.js runs the rules and ui/expedition-view.js draws them.
// The rules are the original Oregon Trail DLE hunt (pacing, herds, startling, film/magazine, pop-ups),
// re-themed for the Appalachian Trail. A future activity (birding, foraging, scavenger hunts, trail
// clean-up) is a new theme object with its own words, species and habitats. The engine and view
// don't change.
//
// Species (how to add one: docs/adding-species.md). Each species is ONE object; everything else (spawn
// tables, field guide, species badge, collector stats, journal, hints) derives from it.
//   id         lowercase-with-dashes, at most 31 characters (the database checks this). Never rename
//              one that has been photographed: saved discoveries refer to it.
//   name       lower case unless a proper name ("Canada lynx", "Bigfoot").
//   group      "mammal" | "bird" | "insect" | "herp" (reptiles and amphibians) | "legend": field guide sections.
//   rarity     "common" | "uncommon" | "rare" | "legend". Rare and legendary species never use spawn
//              weights: the engine rolls for one special find at most once per outing (see
//              RARE_CHANCE / LEGEND_CHANCE in engine/expedition.js).
//   where      where it lives. Common/uncommon: spawn weights by habitat id, { "north-woods": 3, alpine: 1 }
//              (higher = seen more often; 1 is scarce, 5 is everywhere you look). Rare/legend: a list of
//              habitat ids, or "everywhere". Habitat ids are the region `scene`s in trail/appalachian-trail.js.
//   value      points per photo. Rarer animals are worth more; rare and legend default to RARITY_VALUE.
//   speed      logical pixels per second; w/h is the sprite box in logical pixels (canvas is 320x180).
//   behavior   one of the behaviour classes below (BEHAVIOR.*): how it wanders, flies and reacts. It also
//              decides `skittish` (startled by the camera) unless the class ignores the camera.
//   herd/flock maximum group size; groups arrive together and tend to move together.
//   graze      nods its head while it stands still.
//   colors     [body, dark]; light, accent: the other two sprite colours (accent is optional).
//   parts      pixel sprite facing right: [x, y, w, h, colour, leg]. Colour 0 = body, 1 = dark,
//              2 = light, 3 = accent. leg 1/2 lengthens the part on alternate steps; -1/-2 shortens it
//              (wings use the same trick to flap). The same sprite is the field guide art and species badge.
//   fly        "high" (soars over the treetops) or "low" (flits just above the ground). Ground otherwise.
//   season     "warm": much scarcer from November to March (insects, frogs, turtles, salamanders);
//              "cold": a winter-only visitor.
//   fact/range one short, accurate field-guide fact (at most 200 characters) and where along the trail to look.
// Habitat scenery is keyed by the same region `scene`; `fact` is a habitat note. Colours and scenery
// counts drive the seeded backdrop.
//
// Results go to the crew's photo board at Camp. They NEVER award trail miles.

// Behaviour classes: every species inherits one (a few tweak it with a spread), so realism comes from a
// handful of maintainable profiles rather than per-species code. The original hunt's wandering model
// (pause / turn / mult / drift / timer / pauseTime) is kept; the class adds how the animal moves and reacts:
//   react    what a photo, or a frame fired nearby, does: "flee" (runs off), "flush" (takes off and flies
//            away) or "ignore" (carries on along its path; only for species that aren't skittish).
//   flee     speed multiplier while fleeing (×1.2 when it was the one photographed).
//   alert    seconds a cautious animal freezes, head up, before it bolts (startle only).
//   wary     multiplier on the startle radius.
//   zigzag   vertical dodging speed while fleeing (px/s).
//   climb    take-off speed for "flush" (px/s, upward).
//   wobble   [amplitude px, cycles per second]: a bobbing, undulating or gliding flight path.
//   hover    keeps wings beating (and bobbing) while it pauses in mid-air.
//   label / habit  shown in the field guide ("How it moves").
const cls = (name, label, habit, rule) => Object.freeze({ name, label, habit, react: "flee", flee: 2, ...rule });
export const BEHAVIOR = Object.freeze({
  grazer: cls("grazer", "Grazer", "Browses with long pauses. When alarmed it freezes, head up, then bounds away fast.",
    { pause: 0.35, turn: 0.15, mult: [0.5, 1.1], drift: 16, timer: [1.2, 2.6], pauseTime: [1, 2.4], flee: 3, alert: 0.4, wary: 1.4 }),
  skittish: cls("skittish", "Skittish", "Moves in quick bursts with sudden turns, and zigzags when it flees.",
    { pause: 0.45, turn: 0.35, mult: [1.2, 2.4], drift: 45, timer: [0.25, 0.7], pauseTime: [0.3, 0.9], flee: 3, zigzag: 60 }),
  predator: cls("predator", "Predator", "Trots with purpose, stops now and then to listen, and slips away once it's seen.",
    { pause: 0.15, turn: 0.15, mult: [1, 1.6], drift: 20, timer: [0.8, 1.8], pauseTime: [0.4, 0.9], flee: 2 }),
  largeMammal: cls("largeMammal", "Large mammal", "Confident and unhurried: it usually carries on along its path. Give it plenty of room anyway.",
    { pause: 0.3, turn: 0.08, mult: [0.6, 1.1], drift: 10, timer: [1.6, 3], pauseTime: [0.9, 1.8], react: "ignore" }),
  groundBird: cls("groundBird", "Ground bird", "Walks and pecks through the leaves, then bursts into flight when startled.",
    { pause: 0.45, turn: 0.25, mult: [0.7, 1.5], drift: 18, timer: [0.5, 1.4], pauseTime: [0.5, 1.3], react: "flush", flee: 2.2, climb: 55 }),
  songbird: cls("songbird", "Songbird", "Perches, then makes short, bounding flights from branch to branch.",
    { pause: 0.4, turn: 0.3, mult: [1, 1.7], drift: 30, timer: [0.4, 1.1], pauseTime: [0.8, 2], react: "flush", flee: 2.2, climb: 45, wobble: [4, 2.5] }),
  raptor: cls("raptor", "Soaring bird", "Glides on rising air in slow, wide circles, barely flapping.",
    { pause: 0, turn: 0.12, mult: [0.8, 1.2], drift: 8, timer: [1.2, 2.4], pauseTime: [0, 0], flee: 1.4, wobble: [6, 0.3] }),
  owl: cls("owl", "Owl", "Sits still for long spells, then glides off on silent wings.",
    { pause: 0.6, turn: 0.1, mult: [0.7, 1.1], drift: 8, timer: [1, 2], pauseTime: [1.5, 3], react: "flush", flee: 1.4, climb: 25 }),
  swimmer: cls("swimmer", "Swimmer", "Paddles steadily along the water's edge and slips away when disturbed.",
    { pause: 0.1, turn: 0.1, mult: [0.8, 1.4], drift: 8, timer: [0.9, 1.8], pauseTime: [0.3, 0.8], flee: 2 }),
  butterfly: cls("butterfly", "Fluttering insect", "Wanders on an erratic, bobbing path that's hard to predict.",
    { pause: 0.12, turn: 0.35, mult: [0.6, 1.4], drift: 50, timer: [0.2, 0.6], pauseTime: [0.4, 1.2], flee: 1.4, wobble: [7, 1.8] }),
  darter: cls("darter", "Darting insect", "Hovers, then darts off in a new direction in the blink of an eye.",
    { pause: 0.45, turn: 0.4, mult: [1.6, 3], drift: 70, timer: [0.2, 0.5], pauseTime: [0.3, 0.9], flee: 3, hover: true, wobble: [1.5, 5] }),
  hoverer: cls("hoverer", "Hovering insect", "Hovers, drifts a little way, then hangs in mid-air again.",
    { pause: 0.35, turn: 0.3, mult: [0.6, 1.2], drift: 30, timer: [0.3, 0.9], pauseTime: [0.4, 1], flee: 1.5, hover: true, wobble: [2.5, 1.6] }),
  crawler: cls("crawler", "Slow crawler", "Creeps along slowly and stays put rather than run.",
    { pause: 0.55, turn: 0.15, mult: [0.6, 1.1], drift: 6, timer: [1, 2.2], pauseTime: [1, 2.2], react: "ignore" }),
  cryptid: cls("cryptid", "Trail legend", "Lurks at the edge of the trees. Nobody has a clear photo… yet.",
    { pause: 0.4, turn: 0.1, mult: [0.8, 1.4], drift: 6, timer: [1, 2], pauseTime: [0.6, 1.4], flee: 2.6 })
});
// A paddling duck takes off when startled, unlike the other swimmers.
const DABBLER = Object.freeze({ ...BEHAVIOR.swimmer, react: "flush", climb: 50, flee: 2.2, habit: "Dabbles along the shallows and springs straight up into flight when startled." });

const freezeAll = (list) => Object.freeze(list.map((item) => Object.freeze(item)));

const CLASSIC = [
  { id: "cottontail", name: "eastern cottontail", group: "mammal", rarity: "common", value: 4, speed: 80, w: 14, h: 9, behavior: BEHAVIOR.skittish,
    where: { "southern-ridges": 3, "high-balds": 3, "blue-ridge": 2, "rocky-ridges": 3, lakes: 2, "river-valley": 3, alpine: 1, "north-woods": 1 },
    colors: ["#b79d7c", "#6e5a43"], light: "#fffaf0",
    parts: [[2, 3, 9, 6, 0], [9, 2, 5, 5, 0], [10, -3, 2, 5, 0], [0, 4, 3, 3, 2], [12, 3, 1, 1, 1], [3, 9, 3, 2, 1, -1], [8, 9, 3, 2, 1, -2]],
    fact: "Cottontails zigzag when chased and flash their white tail, which may help confuse a predator.", range: "Fields and forest edges at lower elevations." },
  { id: "turkey", name: "wild turkey", group: "bird", rarity: "common", value: 12, speed: 46, w: 14, h: 13, graze: true, herd: 3, behavior: BEHAVIOR.groundBird,
    where: { "southern-ridges": 4, "high-balds": 2, "blue-ridge": 3, "rocky-ridges": 2, lakes: 1, "river-valley": 3 },
    colors: ["#7a5230", "#3f2a18"], light: "#c0392b",
    parts: [[2, 4, 9, 6, 0], [0, 1, 4, 7, 1], [9, 2, 3, 5, 0], [10, 0, 3, 3, 0], [12, 1, 2, 1, 2], [11, 3, 1, 2, 2], [5, 10, 1, 3, 1, 1], [8, 10, 1, 3, 1, 2]],
    fact: "Wild turkeys roost in trees at night. They nearly vanished by 1900 and have made a big comeback.", range: "Woods and clearings along the whole trail." },
  { id: "grouse", name: "ruffed grouse", group: "bird", rarity: "common", value: 10, speed: 40, w: 14, h: 11, graze: true, behavior: BEHAVIOR.groundBird,
    where: { "southern-ridges": 1, "high-balds": 2, "blue-ridge": 1, alpine: 3, "north-woods": 2 },
    colors: ["#8a6a48", "#4a3622"], light: "#e2cfa6",
    parts: [[3, 4, 8, 5, 0], [0, 2, 4, 6, 1], [1, 3, 2, 1, 2], [9, 1, 4, 4, 0], [10, 0, 2, 1, 1], [13, 2, 1, 1, 1], [4, 7, 6, 1, 2], [5, 9, 1, 2, 1, 1], [8, 9, 1, 2, 1, 2]],
    fact: "In spring the male drums by beating his wings, a low thump you can feel as much as hear.", range: "Young forests from Georgia to Maine." },
  { id: "duck", name: "wood duck", group: "bird", rarity: "uncommon", value: 14, speed: 68, w: 18, h: 11, flock: 3, behavior: DABBLER,
    where: { lakes: 5, "river-valley": 3, "north-woods": 3 },
    colors: ["#5a4a3a", "#1f5a3a"], light: "#f0e6d0",
    parts: [[5, 3, 10, 5, 0], [12, 1, 4, 4, 1], [14, 3, 3, 2, 2], [1, 4, 5, 3, 0], [13, 4, 3, 1, 2], [7, 8, 2, 3, 1, 1], [12, 8, 2, 3, 1, 2], [7, 0, 5, 1, 2]],
    fact: "Wood duck chicks leap from their tree-hole nest the day after hatching, sometimes from very high up.", range: "Wooded ponds, lakes and slow rivers." },
  { id: "fox", name: "red fox", group: "mammal", rarity: "uncommon", value: 30, speed: 64, w: 25, h: 12, behavior: BEHAVIOR.predator,
    where: { "southern-ridges": 2, "high-balds": 1, "blue-ridge": 2, "rocky-ridges": 2, lakes: 1, "river-valley": 2, alpine: 1, "north-woods": 1 },
    colors: ["#c8642a", "#2b1c14"], light: "#f6efe2",
    parts: [[5, 4, 13, 6, 0], [7, 8, 9, 2, 2], [0, 3, 6, 4, 0], [0, 4, 2, 2, 2], [17, 1, 6, 6, 0], [18, -1, 2, 2, 1], [21, -1, 2, 2, 1],
      [22, 4, 3, 2, 2], [24, 4, 1, 1, 1], [7, 10, 2, 2, 1, 1], [10, 10, 2, 2, 1, 2], [14, 10, 2, 2, 1, 1], [16, 10, 2, 2, 1, 2]],
    fact: "A red fox can hear a mouse under the snow, then pounces nose-first to catch it.", range: "Forest edges and fields along the whole trail." },
  { id: "deer", name: "white-tailed deer", group: "mammal", rarity: "common", value: 40, speed: 58, w: 26, h: 18, graze: true, herd: 2, behavior: BEHAVIOR.grazer,
    where: { "southern-ridges": 4, "high-balds": 3, "blue-ridge": 5, "rocky-ridges": 4, lakes: 2, "river-valley": 3, alpine: 2, "north-woods": 2 },
    colors: ["#b5703a", "#5e3a1e"], light: "#f4ead5",
    parts: [[4, 5, 17, 8, 0], [6, 11, 13, 2, 2], [18, 0, 5, 9, 0], [20, 0, 6, 5, 0], [24, 3, 2, 2, 1], [21, -4, 1, 4, 2], [23, -4, 1, 4, 2], [2, 4, 3, 4, 2],
      [6, 13, 2, 5, 1, 1], [11, 13, 2, 5, 1, 2], [16, 13, 2, 5, 1, 1], [19, 13, 2, 5, 1, 2]],
    fact: "When alarmed, a white-tailed deer raises its tail like a white flag to warn the others.", range: "The whole trail; very easy to see in Shenandoah." },
  { id: "elk", name: "elk", group: "mammal", rarity: "uncommon", value: 70, speed: 52, w: 32, h: 22, graze: true, herd: 3, behavior: BEHAVIOR.grazer,
    where: { "high-balds": 4 },
    colors: ["#9a6a3c", "#4a2f1c"], light: "#e3cfa0",
    parts: [[5, 6, 20, 9, 0], [8, 13, 14, 2, 2], [17, 5, 6, 8, 1], [22, 1, 5, 9, 0], [25, 0, 6, 5, 0], [29, 3, 3, 2, 1],
      [23, -6, 1, 6, 2], [27, -6, 1, 6, 2], [21, -9, 3, 1, 2], [27, -9, 4, 1, 2], [3, 7, 3, 4, 2],
      [7, 15, 2, 6, 1, 1], [12, 15, 2, 6, 1, 2], [19, 15, 2, 6, 1, 1], [23, 15, 2, 6, 1, 2]],
    fact: "Elk disappeared from the Smokies in the 1800s and were brought back to the Cataloochee valley in 2001.", range: "Mostly around the Great Smoky Mountains." },
  { id: "bear", name: "black bear", group: "mammal", rarity: "uncommon", value: 80, speed: 40, w: 28, h: 18, behavior: BEHAVIOR.largeMammal,
    where: { "southern-ridges": 1, "high-balds": 3, "blue-ridge": 2, "rocky-ridges": 1, lakes: 1, alpine: 1, "north-woods": 2 },
    colors: ["#2a2420", "#121010"], light: "#a07a52",
    parts: [[3, 4, 20, 11, 0], [8, 1, 9, 4, 0], [20, 5, 8, 8, 0], [25, 9, 3, 4, 2], [21, 3, 3, 3, 1], [5, 15, 5, 3, 1, 1], [17, 15, 5, 3, 1, 2]],
    fact: "Black bears can be brown or cinnamon too. Hikers hang their snacks or use canisters so bears stay wild.", range: "The whole trail, especially Shenandoah and the Smokies." },
  { id: "moose", name: "moose", group: "mammal", rarity: "uncommon", value: 100, speed: 30, w: 35, h: 24, graze: true, behavior: BEHAVIOR.largeMammal,
    where: { alpine: 2, "north-woods": 5 },
    colors: ["#4a3426", "#24180f"], light: "#c9b48a",
    parts: [[4, 7, 22, 11, 0], [10, 4, 10, 4, 0], [22, 6, 5, 8, 0], [25, 7, 9, 6, 0], [31, 11, 4, 4, 1], [27, 13, 2, 4, 1],
      [22, 0, 6, 3, 2], [29, 0, 6, 3, 2], [25, 3, 1, 4, 2], [30, 3, 1, 4, 2], [2, 8, 2, 3, 1],
      [6, 18, 2, 6, 1, 1], [11, 18, 2, 6, 1, 2], [19, 18, 2, 6, 1, 1], [23, 18, 2, 6, 1, 2]],
    fact: "Moose are strong swimmers and wade into ponds to munch water plants.", range: "Northern New England, especially Maine." }
];

const DEER_PARTS = CLASSIC.find((sp) => sp.id === "deer").parts;

// New in the Wildlife Spotting sprint: birds, insects, reptiles and amphibians, rare finds and legends.
const NEW_SPECIES = [
  // Mammals
  { id: "beaver", name: "beaver", group: "mammal", rarity: "uncommon", value: 35, speed: 30, w: 22, h: 10, behavior: BEHAVIOR.swimmer,
    where: { lakes: 2, "river-valley": 2, "north-woods": 3 },
    colors: ["#7a4e2d", "#3a2616"], light: "#e8a33a",
    parts: [[4, 2, 13, 7, 0], [0, 5, 6, 3, 1], [15, 1, 6, 6, 0], [20, 3, 2, 2, 1], [19, 6, 2, 2, 2], [17, 0, 2, 1, 1], [6, 9, 2, 1, 1, 1], [13, 9, 2, 1, 1, 2]],
    fact: "Beaver dams make ponds and wetlands that frogs, ducks and even moose depend on.", range: "Streams and ponds, more common farther north." },
  { id: "coyote", name: "coyote", group: "mammal", rarity: "uncommon", value: 30, speed: 62, w: 25, h: 13, behavior: BEHAVIOR.predator,
    where: { "southern-ridges": 1, "high-balds": 1, "blue-ridge": 2, "rocky-ridges": 2, "river-valley": 2, alpine: 1, "north-woods": 1 },
    colors: ["#a08a6a", "#4a3a2a"], light: "#e8dcc4",
    parts: [[5, 4, 13, 6, 0], [7, 8, 9, 2, 2], [0, 5, 6, 3, 0], [0, 6, 2, 2, 1], [17, 1, 6, 6, 0], [18, -1, 2, 2, 1], [21, -1, 2, 2, 1],
      [22, 4, 3, 2, 2], [24, 4, 1, 1, 1], [7, 10, 2, 3, 1, 1], [10, 10, 2, 3, 1, 2], [14, 10, 2, 3, 1, 1], [16, 10, 2, 3, 1, 2]],
    fact: "Coyotes spread into the East only in the last century; eastern coyotes are often bigger than western ones.", range: "The whole trail, though rarely seen." },
  { id: "otter", name: "river otter", group: "mammal", rarity: "uncommon", value: 45, speed: 56, w: 26, h: 8, behavior: BEHAVIOR.swimmer,
    where: { lakes: 1, "river-valley": 2, "north-woods": 2 },
    colors: ["#5a3e2a", "#2e1f14"], light: "#c9b08a",
    parts: [[4, 2, 16, 5, 0], [0, 4, 6, 2, 0], [19, 1, 6, 5, 0], [24, 3, 2, 1, 1], [22, 2, 1, 1, 1], [21, 5, 4, 1, 2], [6, 7, 2, 1, 1, 1], [15, 7, 2, 1, 1, 2]],
    fact: "River otters love to play and slide down muddy or snowy banks.", range: "Clean rivers and lakes, mostly in the north." },
  // Reptiles and amphibians
  { id: "box-turtle", name: "eastern box turtle", group: "herp", rarity: "uncommon", season: "warm", value: 20, speed: 10, w: 15, h: 8, behavior: BEHAVIOR.crawler,
    where: { "southern-ridges": 2, "blue-ridge": 2, "rocky-ridges": 1, lakes: 1 },
    colors: ["#6b4a22", "#3a2a14"], light: "#e0a43a",
    parts: [[2, 0, 10, 5, 0], [4, 1, 2, 1, 2], [8, 2, 2, 1, 2], [5, 3, 1, 1, 2], [1, 4, 12, 2, 1], [12, 3, 3, 2, 2], [3, 6, 2, 2, 1, 1], [9, 6, 2, 2, 1, 2]],
    fact: "A box turtle can shut its hinged shell tight like a box, and can live for many decades.", range: "Southern and Mid-Atlantic forests." },
  { id: "red-eft", name: "red eft", group: "herp", rarity: "common", season: "warm", value: 18, speed: 12, w: 12, h: 4, behavior: BEHAVIOR.crawler,
    where: { "southern-ridges": 2, "high-balds": 2, "blue-ridge": 1, "rocky-ridges": 1 },
    colors: ["#e2622a", "#8a3418"], light: "#ffd060",
    parts: [[2, 1, 8, 2, 0], [0, 2, 3, 1, 0], [9, 0, 3, 3, 0], [11, 1, 1, 1, 1], [4, 1, 1, 1, 2], [7, 1, 1, 1, 2], [3, 3, 1, 1, 1, 1], [8, 3, 1, 1, 1, 2]],
    fact: "The bright orange eft is a young eastern newt that lives on land for a few years. Its colour warns that it is toxic.", range: "Damp forest floors along the whole trail." },
  { id: "wood-frog", name: "wood frog", group: "herp", rarity: "common", season: "warm", value: 15, speed: 70, w: 11, h: 7, behavior: BEHAVIOR.skittish,
    where: { "southern-ridges": 1, lakes: 2, "river-valley": 2, "north-woods": 2 },
    colors: ["#a07848", "#3a2818"], light: "#f0e2c0",
    parts: [[1, 2, 8, 4, 0], [7, 0, 4, 4, 0], [7, 2, 4, 1, 1], [9, 1, 1, 1, 1], [2, 5, 6, 1, 2], [0, 4, 3, 2, 0], [2, 6, 4, 1, 1, 1], [7, 5, 2, 2, 1, -2]],
    fact: "Wood frogs can survive being partly frozen all winter and thaw out in spring.", range: "Woodland pools all the way to Maine." },
  // Birds
  { id: "bald-eagle", name: "bald eagle", group: "bird", rarity: "uncommon", fly: "high", value: 60, speed: 54, w: 26, h: 12, behavior: BEHAVIOR.raptor,
    where: { lakes: 2, "river-valley": 1, "north-woods": 2 },
    colors: ["#4a3020", "#2a1a10"], light: "#fffaf0", accent: "#e0a43a",
    parts: [[6, 5, 13, 4, 0], [8, 1, 10, 4, 1, 1], [9, 9, 8, 2, 1, -2], [18, 3, 5, 4, 2], [22, 5, 3, 2, 3], [20, 4, 1, 1, 1], [0, 5, 7, 3, 2], [11, 9, 1, 2, 3], [14, 9, 1, 2, 3]],
    fact: "Bald eagles were endangered in the 1970s and recovered after the pesticide DDT was banned.", range: "Big lakes and rivers, especially in the north." },
  { id: "red-tailed-hawk", name: "red-tailed hawk", group: "bird", rarity: "common", fly: "high", value: 35, speed: 50, w: 22, h: 11, behavior: BEHAVIOR.raptor,
    where: { "southern-ridges": 1, "high-balds": 2, "blue-ridge": 2, "rocky-ridges": 4, "river-valley": 1, alpine: 1 },
    colors: ["#8a5a32", "#4a2e1a"], light: "#f4e8d0", accent: "#c8642a",
    parts: [[5, 4, 11, 4, 0], [6, 7, 9, 2, 2], [7, 0, 8, 4, 1, 1], [8, 8, 7, 2, 1, -2], [15, 2, 5, 4, 0], [19, 4, 2, 2, 1], [17, 3, 1, 1, 1], [0, 4, 6, 3, 3]],
    fact: "Its scream is the \"eagle cry\" heard in movies. Every fall thousands of hawks ride the winds along Pennsylvania's ridges.", range: "Open ridges and fields along the whole trail." },
  { id: "blue-jay", name: "blue jay", group: "bird", rarity: "common", fly: "low", value: 12, speed: 66, w: 14, h: 9, behavior: BEHAVIOR.songbird,
    where: { "southern-ridges": 3, "high-balds": 1, "blue-ridge": 2, "rocky-ridges": 2, lakes: 1, "river-valley": 2 },
    colors: ["#3f7fc0", "#1f2f4f"], light: "#f4f4f4",
    parts: [[3, 3, 7, 4, 0], [4, 6, 6, 2, 2], [9, 1, 4, 5, 0], [10, 0, 2, 1, 0], [12, 3, 2, 1, 1], [11, 2, 1, 1, 1], [0, 3, 4, 2, 0], [4, 2, 5, 2, 1, 1]],
    fact: "Blue jays can copy a hawk's call, and they help plant oak forests by burying acorns.", range: "Woods along the whole trail." },
  { id: "meadowlark", name: "eastern meadowlark", group: "bird", rarity: "uncommon", value: 16, speed: 42, w: 14, h: 10, behavior: BEHAVIOR.groundBird,
    where: { "high-balds": 2, "blue-ridge": 3 },
    colors: ["#a07848", "#3a2818"], light: "#f0d040",
    parts: [[2, 3, 8, 4, 0], [6, 5, 4, 3, 2], [7, 5, 1, 1, 1], [8, 6, 1, 1, 1], [9, 1, 4, 4, 0], [12, 3, 2, 1, 1], [0, 3, 3, 2, 0], [5, 8, 1, 2, 1, 1], [8, 8, 1, 2, 1, 2]],
    fact: "Despite its name, the meadowlark is a blackbird, not a lark. Its song is a sweet, clear whistle.", range: "Open meadows and pastures in the south and Mid-Atlantic." },
  { id: "barred-owl", name: "barred owl", group: "bird", rarity: "uncommon", fly: "low", value: 40, speed: 34, w: 14, h: 14, behavior: BEHAVIOR.owl,
    where: { "southern-ridges": 1, "high-balds": 1, "blue-ridge": 1, lakes: 1, "north-woods": 2 },
    colors: ["#8a7458", "#4a3a2a"], light: "#efe6d4",
    parts: [[3, 4, 8, 8, 0], [4, 6, 6, 5, 2], [5, 7, 1, 1, 1], [8, 8, 1, 1, 1], [3, 0, 8, 5, 0], [4, 1, 2, 2, 1], [8, 1, 2, 2, 1], [6, 3, 2, 1, 1], [0, 4, 3, 6, 1, 1], [11, 4, 3, 6, 1, 2]],
    fact: "Its call sounds like \"Who cooks for you? Who cooks for you-all?\"", range: "Old, damp forests along the whole trail." },
  { id: "loon", name: "common loon", group: "bird", rarity: "uncommon", value: 45, speed: 40, w: 22, h: 9, behavior: BEHAVIOR.swimmer,
    where: { "north-woods": 4 },
    colors: ["#1a1a1a", "#0a0a0a"], light: "#f4f4f4", accent: "#a8382a",
    parts: [[3, 3, 14, 5, 0], [5, 4, 2, 1, 2], [9, 4, 2, 1, 2], [13, 4, 2, 1, 2], [15, 0, 4, 6, 0], [18, 2, 4, 2, 1], [16, 1, 1, 1, 3], [14, 6, 2, 1, 2]],
    fact: "Loons have heavy, solid bones that help them dive deep. Their wild call echoes across northern lakes.", range: "Northern lakes in New Hampshire and Maine." },
  // Insects
  { id: "monarch", name: "monarch butterfly", group: "insect", rarity: "common", fly: "low", season: "warm", value: 25, speed: 34, w: 10, h: 8, behavior: BEHAVIOR.butterfly,
    where: { "southern-ridges": 1, "high-balds": 2, "blue-ridge": 3, "river-valley": 2 },
    colors: ["#e07820", "#1a1a1a"], light: "#fffaf0",
    parts: [[4, 2, 2, 5, 1], [0, 0, 4, 4, 0, 1], [6, 0, 4, 4, 0, 2], [0, 4, 4, 3, 0, -1], [6, 4, 4, 3, 0, -2], [1, 1, 1, 1, 1], [8, 1, 1, 1, 1], [1, 5, 1, 1, 2], [8, 5, 1, 1, 2]],
    fact: "Eastern monarchs fly up to about 3,000 miles to Mexico every fall.", range: "Meadows and balds in summer and early fall." },
  { id: "darner", name: "green darner dragonfly", group: "insect", rarity: "common", fly: "low", season: "warm", value: 28, speed: 80, w: 14, h: 7, behavior: BEHAVIOR.darter,
    where: { lakes: 3, "river-valley": 2, "north-woods": 2 },
    colors: ["#2f8a7a", "#1a3a3a"], light: "#d8eef0",
    parts: [[0, 3, 11, 2, 0], [10, 2, 4, 3, 1], [3, 0, 3, 2, 2, 1], [7, 0, 3, 2, 2, 2], [3, 5, 3, 2, 2, -1], [7, 5, 3, 2, 2, -2]],
    fact: "Green darners are big dragonflies that migrate south in the fall, a bit like monarchs.", range: "Ponds, lakes and wet meadows." },
  { id: "firefly", name: "firefly", group: "insect", rarity: "uncommon", fly: "low", season: "warm", value: 30, speed: 26, w: 8, h: 6, behavior: BEHAVIOR.hoverer,
    where: { "southern-ridges": 2, "high-balds": 3, "blue-ridge": 2, "river-valley": 1 },
    colors: ["#3a2a1a", "#1a1010"], light: "#f8f070",
    parts: [[2, 1, 4, 3, 0], [6, 1, 2, 2, 1], [0, 2, 3, 3, 2], [2, 0, 3, 1, 2, 1]],
    fact: "In early summer one kind of firefly in the Smokies flashes in sync, lighting up the forest together.", range: "Warm, damp evenings along the trail." },
  { id: "bumble-bee", name: "bumble bee", group: "insect", rarity: "common", fly: "low", season: "warm", value: 20, speed: 30, w: 9, h: 7, behavior: BEHAVIOR.hoverer,
    where: { "southern-ridges": 2, "high-balds": 3, "blue-ridge": 2, "rocky-ridges": 1, alpine: 1 },
    colors: ["#e0b020", "#1a1a1a"], light: "#e8f4f8",
    parts: [[1, 2, 7, 4, 0], [3, 2, 1, 4, 1], [6, 2, 1, 4, 1], [7, 3, 2, 2, 1], [2, 0, 3, 2, 2, 1], [5, 0, 3, 2, 2, 2]],
    fact: "Bumble bees shiver their flight muscles to warm up, so they can fly on chilly mountain mornings.", range: "Flowery meadows and balds." },
  { id: "mantis", name: "Carolina mantis", group: "insect", rarity: "uncommon", season: "warm", value: 30, speed: 16, w: 14, h: 11, behavior: BEHAVIOR.crawler,
    where: { "southern-ridges": 1, "blue-ridge": 2, "rocky-ridges": 1 },
    colors: ["#7aa04a", "#3a5a2a"], light: "#c8e090",
    parts: [[1, 5, 9, 2, 0], [9, 1, 2, 6, 0], [10, 0, 3, 2, 0], [12, 0, 1, 1, 1], [11, 3, 2, 1, 2], [12, 4, 1, 3, 2], [2, 7, 1, 4, 1, 1], [6, 7, 1, 4, 1, 2]],
    fact: "The Carolina mantis is native to the East and can turn its head to look over its shoulder.", range: "Fields and gardens in the south and Mid-Atlantic." },
  { id: "tiger-beetle", name: "six-spotted tiger beetle", group: "insect", rarity: "common", season: "warm", value: 24, speed: 74, w: 9, h: 6, behavior: BEHAVIOR.skittish,
    where: { "southern-ridges": 2, "high-balds": 1, "rocky-ridges": 2 },
    colors: ["#2a9a5a", "#1a4a2a"], light: "#fffaf0",
    parts: [[1, 1, 6, 4, 0], [6, 2, 3, 2, 1], [2, 2, 1, 1, 2], [4, 3, 1, 1, 2], [2, 4, 1, 1, 2], [1, 5, 1, 1, 1, 1], [6, 5, 1, 1, 1, 2]],
    fact: "This shiny green beetle sprints ahead of hikers on sunny paths, then stops and waits.", range: "Sunny trails through the woods." },
  // Rare finds
  { id: "white-deer", name: "white deer", group: "mammal", rarity: "rare", speed: 52, w: 26, h: 18, graze: true, behavior: BEHAVIOR.grazer,
    where: "everywhere",
    colors: ["#efeadf", "#8a7f70"], light: "#ffffff", parts: DEER_PARTS,
    fact: "Most white deer are piebald or leucistic white-tailed deer, not true albinos. Seeing one is a rare treat.", range: "Anywhere deer live, very rarely." },
  { id: "hellbender", name: "eastern hellbender", group: "herp", rarity: "rare", season: "warm", speed: 14, w: 20, h: 6, behavior: BEHAVIOR.crawler,
    where: ["southern-ridges", "high-balds", "blue-ridge", "rocky-ridges"],
    colors: ["#6a5a3a", "#3a2f1e"], light: "#9a8a5a",
    parts: [[3, 1, 13, 4, 0], [0, 3, 4, 2, 0], [15, 1, 5, 3, 0], [18, 2, 1, 1, 1], [5, 1, 2, 1, 2], [10, 2, 2, 1, 2], [4, 5, 2, 1, 1, 1], [13, 5, 2, 1, 1, 2]],
    fact: "North America's biggest salamander breathes mostly through its wrinkly skin. The southern Appalachians have more kinds of salamander than anywhere on Earth.", range: "Clean, rocky mountain streams in the south and Mid-Atlantic." },
  { id: "golden-warbler", name: "golden-winged warbler", group: "bird", rarity: "rare", fly: "low", speed: 60, w: 12, h: 8, behavior: BEHAVIOR.songbird,
    where: ["high-balds", "blue-ridge", "lakes"],
    colors: ["#9aa0a8", "#2a2a2a"], light: "#f4f4f4", accent: "#f0c020",
    parts: [[2, 3, 6, 3, 0], [3, 5, 5, 2, 2], [7, 1, 4, 4, 0], [7, 0, 3, 1, 3], [10, 3, 2, 1, 1], [8, 2, 1, 1, 1], [3, 2, 4, 2, 3, 1], [0, 3, 3, 2, 0]],
    fact: "A tiny songbird with golden wing patches. It has grown rare, and nests in young, shrubby mountain forest.", range: "Open mountain slopes in the south, Virginia and the Highlands." },
  { id: "gray-petaltail", name: "gray petaltail", group: "insect", rarity: "rare", fly: "low", season: "warm", speed: 70, w: 20, h: 9, behavior: BEHAVIOR.darter,
    where: ["southern-ridges", "high-balds", "rocky-ridges"],
    colors: ["#5a5e62", "#1a1a1a"], light: "#e4ecf0",
    parts: [[0, 4, 15, 2, 0], [14, 3, 5, 4, 1], [16, 4, 1, 1, 2], [4, 0, 4, 3, 2, 1], [9, 0, 4, 3, 2, 2], [4, 6, 4, 3, 2, -1], [9, 6, 4, 3, 2, -2], [2, 4, 1, 2, 1], [6, 4, 1, 2, 1], [10, 4, 1, 2, 1]],
    fact: "A big dragonfly from an ancient family that dates back to the dinosaurs. It sometimes lands on hikers!", range: "Seepy mountain slopes from Georgia to Pennsylvania." },
  { id: "snowy-owl", name: "snowy owl", group: "bird", rarity: "rare", fly: "low", season: "cold", speed: 30, w: 18, h: 14, behavior: BEHAVIOR.owl,
    where: ["alpine", "north-woods"],
    colors: ["#f8f8f4", "#3a3a3a"], light: "#ffffff", accent: "#e0b020",
    parts: [[4, 4, 10, 9, 0], [4, 0, 10, 5, 0], [6, 2, 2, 1, 3], [10, 2, 2, 1, 3], [8, 3, 2, 1, 1], [5, 6, 1, 1, 1], [9, 8, 1, 1, 1], [12, 6, 1, 1, 1], [0, 4, 4, 7, 0, 1], [14, 4, 4, 7, 0, 2]],
    fact: "Snowy owls nest in the Arctic. Only in some winters do a few wander south to New England.", range: "A rare winter visitor in the north." },
  { id: "lynx", name: "Canada lynx", group: "mammal", rarity: "rare", speed: 48, w: 24, h: 15, behavior: BEHAVIOR.predator,
    where: ["north-woods"],
    colors: ["#b8a890", "#3a2f24"], light: "#efe6d4",
    parts: [[4, 4, 14, 7, 0], [6, 9, 10, 2, 2], [2, 3, 3, 3, 0], [2, 3, 1, 1, 1], [17, 1, 6, 6, 0], [17, -2, 1, 3, 1], [22, -2, 1, 3, 1], [19, 5, 4, 2, 2], [21, 3, 1, 1, 1],
      [5, 11, 3, 4, 0, 1], [9, 11, 3, 4, 0, 2], [14, 11, 3, 4, 0, 1], [17, 11, 3, 4, 0, 2]],
    fact: "Lynx have huge furry paws that work like snowshoes. In the East they live mainly in northern Maine.", range: "Deep north woods of Maine." },
  // Legends: purely for fun.
  { id: "bigfoot", name: "Bigfoot", group: "legend", rarity: "legend", speed: 28, w: 18, h: 26, behavior: BEHAVIOR.cryptid,
    where: "everywhere",
    colors: ["#5a3a24", "#2a1a10"], light: "#a07a52",
    parts: [[4, 6, 10, 12, 0], [5, 0, 8, 7, 0], [7, 2, 4, 4, 2], [7, 3, 1, 1, 1], [10, 3, 1, 1, 1], [1, 7, 3, 10, 0, 1], [14, 7, 3, 10, 0, 2], [4, 18, 4, 8, 0, 1], [10, 18, 4, 8, 0, 2]],
    fact: "Stories tell of a tall, hairy wild man in the eastern mountains. Nobody has ever proven it, but you got the photo!", range: "Rumoured everywhere." },
  { id: "jackalope", name: "jackalope", group: "legend", rarity: "legend", speed: 84, w: 16, h: 16, behavior: BEHAVIOR.skittish,
    where: "everywhere",
    colors: ["#b79d7c", "#6e5a43"], light: "#fffaf0", accent: "#c9a46a",
    parts: [[2, 8, 9, 6, 0], [9, 7, 5, 5, 0], [10, 4, 2, 4, 0], [0, 9, 3, 3, 2], [12, 8, 1, 1, 1], [10, 0, 1, 4, 3], [13, 0, 1, 4, 3], [9, 1, 1, 1, 3], [14, 1, 1, 1, 3],
      [3, 14, 3, 2, 1, -1], [8, 14, 3, 2, 1, -2]],
    fact: "A rabbit with antlers from Western folklore. What is it doing on the Appalachian Trail?", range: "Rumoured: a very long way from Wyoming." },
  { id: "snallygaster", name: "Snallygaster", group: "legend", rarity: "legend", fly: "high", speed: 46, w: 30, h: 18, behavior: BEHAVIOR.raptor,
    where: ["rocky-ridges"],
    colors: ["#5a7a4a", "#2a3a22"], light: "#e8d8a0", accent: "#c0392b",
    parts: [[6, 7, 16, 7, 0], [8, 11, 12, 2, 2], [0, 9, 7, 3, 0], [21, 4, 7, 5, 0], [27, 6, 3, 2, 2], [24, 5, 1, 1, 3], [9, 0, 10, 7, 1, 1], [24, 1, 1, 3, 2], [10, 14, 2, 4, 1, 1], [18, 14, 2, 4, 1, 2]],
    fact: "A winged monster from Maryland folklore, said to haunt South Mountain, which the trail crosses.", range: "Rumoured: Maryland's South Mountain." },
  { id: "wampus-cat", name: "Wampus cat", group: "legend", rarity: "legend", speed: 58, w: 25, h: 13, behavior: BEHAVIOR.cryptid,
    where: ["southern-ridges", "high-balds"],
    colors: ["#3a3530", "#151210"], light: "#e8e050",
    parts: [[5, 4, 14, 6, 0], [0, 1, 6, 3, 0], [0, 0, 2, 2, 0], [18, 1, 6, 6, 0], [19, -2, 2, 3, 0], [22, -2, 2, 3, 0], [21, 3, 1, 1, 2], [23, 3, 1, 1, 2],
      [6, 10, 2, 3, 1, 1], [10, 10, 2, 3, 1, 2], [15, 10, 2, 3, 1, 1], [18, 10, 2, 3, 1, 2]],
    fact: "A mysterious cat from Appalachian folklore, said to prowl the woods at night with glowing eyes.", range: "Rumoured: the southern mountains." }
];

const MOOSE_PARTS = CLASSIC.find((sp) => sp.id === "moose").parts;

// Trail expansion: more everyday wildlife, regional specialities from the southern balds to Maine's
// spruce-fir woods, three hard-to-find rarities and two more campfire legends.
const TRAIL_EXPANSION = [
  // Common
  { id: "chipmunk", name: "eastern chipmunk", group: "mammal", rarity: "common", value: 8, speed: 76, w: 12, h: 7, behavior: BEHAVIOR.skittish,
    where: { "southern-ridges": 2, "high-balds": 1, "blue-ridge": 3, "rocky-ridges": 3, lakes: 2, "river-valley": 3, "north-woods": 1 },
    colors: ["#a8754a", "#3a2618"], light: "#f0e0c0",
    parts: [[2, 2, 7, 4, 0], [8, 1, 4, 4, 0], [2, 2, 6, 1, 1], [2, 3, 6, 1, 2], [0, 0, 2, 4, 0], [11, 2, 1, 1, 1], [9, 0, 1, 1, 1], [3, 6, 2, 1, 1, 1], [7, 6, 2, 1, 1, 2]],
    fact: "Chipmunks stuff their cheek pouches with seeds and nuts, then carry them home to a store under the ground.", range: "Rocky woods along most of the trail." },
  { id: "gray-squirrel", name: "eastern gray squirrel", group: "mammal", rarity: "common", value: 10, speed: 72, w: 16, h: 10, behavior: BEHAVIOR.skittish,
    where: { "southern-ridges": 3, "blue-ridge": 3, "rocky-ridges": 2, lakes: 2, "river-valley": 2 },
    colors: ["#8a8a86", "#3a3a38"], light: "#f0ece4",
    parts: [[4, 4, 8, 5, 0], [5, 7, 6, 2, 2], [11, 2, 4, 5, 0], [13, 0, 1, 2, 0], [14, 3, 1, 1, 1], [0, 0, 4, 7, 0], [1, 1, 2, 5, 2], [5, 9, 2, 1, 1, 1], [10, 9, 2, 1, 1, 2]],
    fact: "Gray squirrels bury nuts one at a time. The ones they forget can sprout into new trees.", range: "Hardwood forests from Georgia to New England." },
  { id: "chickadee", name: "black-capped chickadee", group: "bird", rarity: "common", fly: "low", value: 10, speed: 64, w: 11, h: 8, behavior: BEHAVIOR.songbird,
    where: { "high-balds": 1, "rocky-ridges": 1, lakes: 2, "river-valley": 3, alpine: 1, "north-woods": 3 },
    colors: ["#8a8f94", "#1a1a1a"], light: "#f4f2ea",
    parts: [[2, 3, 6, 3, 0], [3, 5, 5, 2, 2], [7, 1, 4, 4, 1], [8, 2, 2, 2, 2], [0, 3, 3, 2, 0], [3, 2, 4, 2, 1, 1], [4, 7, 1, 1, 1, 1], [6, 7, 1, 1, 1, 2]],
    fact: "Its \"chick-a-dee-dee-dee\" call gets more \"dees\" when a predator is near. Other birds listen in.", range: "Woods from Pennsylvania north; in the south only on the highest peaks." },
  { id: "garter-snake", name: "eastern garter snake", group: "herp", rarity: "common", season: "warm", value: 18, speed: 18, w: 20, h: 4, behavior: BEHAVIOR.crawler,
    where: { "southern-ridges": 1, "high-balds": 1, "blue-ridge": 2, "rocky-ridges": 1, lakes: 1, "river-valley": 2, "north-woods": 1 },
    colors: ["#3a4a2a", "#1a2214"], light: "#e8d860",
    parts: [[0, 2, 6, 2, 0], [5, 1, 6, 2, 0], [10, 2, 6, 2, 0], [15, 1, 5, 2, 0], [1, 2, 4, 1, 2], [6, 1, 4, 1, 2], [11, 2, 4, 1, 2], [18, 1, 1, 1, 1]],
    fact: "Harmless garter snakes are among the first snakes out in spring, often basking on sunny rocks.", range: "Fields, forest edges and stream banks along the whole trail." },
  { id: "american-toad", name: "American toad", group: "herp", rarity: "common", season: "warm", value: 14, speed: 14, w: 10, h: 7, behavior: BEHAVIOR.crawler,
    where: { "southern-ridges": 1, "blue-ridge": 1, "rocky-ridges": 1, lakes: 2, "river-valley": 2, "north-woods": 1 },
    colors: ["#8a6a42", "#3a2a18"], light: "#e8d8b0",
    parts: [[1, 2, 7, 4, 0], [6, 1, 4, 3, 0], [8, 1, 1, 1, 1], [2, 3, 1, 1, 1], [4, 2, 1, 1, 1], [5, 4, 1, 1, 1], [2, 5, 5, 1, 2], [0, 4, 2, 3, 0, -1], [7, 5, 2, 2, 0, -2]],
    fact: "In spring, male toads sing a long, musical trill. Their bumps aren't warts, and touching one won't give you any.", range: "Woods, meadows and puddles along the whole trail." },
  { id: "swallowtail", name: "eastern tiger swallowtail", group: "insect", rarity: "common", fly: "low", season: "warm", value: 24, speed: 32, w: 12, h: 9, behavior: BEHAVIOR.butterfly,
    where: { "southern-ridges": 2, "high-balds": 2, "blue-ridge": 3, "rocky-ridges": 1, lakes: 1, "river-valley": 2 },
    colors: ["#f0d040", "#1a1a1a"], light: "#5a8ad8",
    parts: [[5, 2, 2, 6, 1], [0, 0, 5, 4, 0, 1], [7, 0, 5, 4, 0, 2], [1, 4, 4, 4, 0, -1], [7, 4, 4, 4, 0, -2], [1, 0, 1, 4, 1], [3, 0, 1, 4, 1], [8, 0, 1, 4, 1], [10, 0, 1, 4, 1],
      [2, 7, 1, 1, 2], [9, 7, 1, 1, 2]],
    fact: "Some females are nearly black, which may help them pass for the bad-tasting pipevine swallowtail.", range: "Sunny forest edges and meadows from Georgia to New England." },
  // Uncommon
  { id: "pileated-woodpecker", name: "pileated woodpecker", group: "bird", rarity: "uncommon", fly: "low", value: 45, speed: 52, w: 16, h: 12, behavior: BEHAVIOR.songbird,
    where: { "southern-ridges": 1, "blue-ridge": 1, "rocky-ridges": 1, lakes: 1, "river-valley": 1, "north-woods": 1 },
    colors: ["#1e1e1e", "#0a0a0a"], light: "#f4f4f0", accent: "#d8302a",
    parts: [[2, 4, 9, 5, 0], [10, 2, 4, 4, 0], [10, 0, 4, 2, 3], [13, 4, 3, 1, 1], [10, 4, 3, 1, 2], [11, 6, 2, 3, 2], [0, 5, 3, 3, 0], [4, 3, 5, 2, 2, 1],
      [6, 9, 1, 2, 1, 1], [9, 9, 1, 2, 1, 2]],
    fact: "Its big rectangular holes in dead trees are easy to find. The crow-sized bird with the red crest is harder.", range: "Mature forests along the whole trail." },
  { id: "luna-moth", name: "luna moth", group: "insect", rarity: "uncommon", fly: "low", season: "warm", value: 40, speed: 24, w: 12, h: 10, behavior: BEHAVIOR.butterfly,
    where: { "southern-ridges": 1, "blue-ridge": 1, "rocky-ridges": 1, lakes: 1 },
    colors: ["#a8e0a0", "#5a8a4a"], light: "#f4f0c0", accent: "#8a4a6a",
    parts: [[5, 1, 2, 6, 2], [0, 0, 5, 4, 0, 1], [7, 0, 5, 4, 0, 2], [1, 4, 4, 3, 0, -1], [7, 4, 4, 3, 0, -2], [0, 0, 5, 1, 3], [7, 0, 5, 1, 3], [2, 2, 1, 1, 3], [9, 2, 1, 1, 3],
      [2, 7, 1, 3, 0], [9, 7, 1, 3, 0]],
    fact: "Adult luna moths have no mouths. They live only about a week, flying at night to find a mate.", range: "Hardwood forests in late spring and early summer." },
  { id: "porcupine", name: "North American porcupine", group: "mammal", rarity: "uncommon", value: 40, speed: 14, w: 20, h: 12, behavior: BEHAVIOR.crawler,
    where: { "rocky-ridges": 1, "river-valley": 2, alpine: 1, "north-woods": 2 },
    colors: ["#4a3a2a", "#2a1e14"], light: "#d8cbb0",
    parts: [[3, 3, 13, 7, 0], [2, 1, 12, 3, 1], [3, 0, 1, 2, 2], [6, 0, 1, 2, 2], [9, 0, 1, 2, 2], [12, 0, 1, 2, 2], [15, 5, 5, 4, 0], [18, 6, 1, 1, 1], [19, 8, 1, 1, 1],
      [0, 6, 4, 3, 1], [5, 10, 2, 2, 1, 1], [12, 10, 2, 2, 1, 2]],
    fact: "A porcupine carries around 30,000 quills. It can't throw them, but they come loose at a touch.", range: "Forests from Pennsylvania north, most common in New England." },
  { id: "bobcat", name: "bobcat", group: "mammal", rarity: "uncommon", value: 70, speed: 56, w: 24, h: 14, behavior: BEHAVIOR.predator,
    where: { "southern-ridges": 1, "high-balds": 1, "blue-ridge": 1, "rocky-ridges": 1, "river-valley": 1 },
    colors: ["#b08858", "#3a2a1a"], light: "#f0e4cc",
    parts: [[4, 4, 14, 6, 0], [6, 8, 10, 2, 2], [2, 4, 3, 2, 0], [2, 4, 1, 1, 1], [17, 1, 6, 6, 0], [17, -1, 1, 2, 1], [21, -1, 1, 2, 1], [20, 4, 3, 2, 2], [21, 3, 1, 1, 1],
      [7, 5, 1, 1, 1], [11, 6, 1, 1, 1], [14, 5, 1, 1, 1], [5, 10, 2, 4, 0, 1], [9, 10, 2, 4, 0, 2], [13, 10, 2, 4, 0, 1], [16, 10, 2, 4, 0, 2]],
    fact: "A bobcat is about twice the size of a house cat and is named for its short, \"bobbed\" tail.", range: "The whole trail, though it is seldom seen." },
  { id: "peregrine", name: "peregrine falcon", group: "bird", rarity: "uncommon", fly: "high", value: 65, speed: 72, w: 22, h: 9, behavior: BEHAVIOR.raptor,
    where: { "blue-ridge": 1, "rocky-ridges": 2, alpine: 2 },
    colors: ["#5a6a7a", "#1e2630"], light: "#efeae0", accent: "#f0c030",
    parts: [[5, 3, 11, 3, 0], [6, 5, 8, 2, 2], [7, 0, 7, 3, 0, 1], [7, 6, 7, 2, 1, -2], [15, 1, 5, 4, 1], [16, 3, 2, 2, 2], [19, 3, 2, 1, 3], [0, 3, 6, 2, 0]],
    fact: "Diving after prey, a peregrine may top 200 mph. Cliffs along the trail are sometimes closed to protect their nests.", range: "Cliffs and rocky ridges, from Virginia to the White Mountains." },
  { id: "rattlesnake", name: "timber rattlesnake", group: "herp", rarity: "uncommon", season: "warm", value: 50, speed: 14, w: 24, h: 5, behavior: BEHAVIOR.crawler,
    where: { "southern-ridges": 1, "blue-ridge": 1, "rocky-ridges": 2, lakes: 1 },
    colors: ["#b09a6a", "#2a2016"], light: "#d8c8a0",
    parts: [[0, 3, 6, 2, 0], [5, 2, 7, 2, 0], [11, 3, 7, 2, 0], [17, 2, 6, 3, 0], [2, 3, 1, 2, 1], [7, 2, 1, 2, 1], [10, 2, 1, 2, 1], [13, 3, 1, 2, 1], [16, 3, 1, 2, 1],
      [0, 3, 2, 2, 2], [21, 3, 1, 1, 1]],
    fact: "Timber rattlesnakes are shy and usually rattle a warning. Give them plenty of room and they will leave you be.", range: "Sunny, rocky slopes from Georgia to New England." },
  { id: "snowshoe-hare", name: "snowshoe hare", group: "mammal", rarity: "uncommon", value: 30, speed: 82, w: 15, h: 11, behavior: BEHAVIOR.skittish,
    where: { alpine: 2, "north-woods": 2 },
    colors: ["#8a6a4a", "#2a2018"], light: "#f6f4ee",
    parts: [[2, 4, 9, 6, 0], [9, 3, 5, 5, 0], [10, -3, 2, 6, 0], [10, -3, 2, 1, 1], [13, 4, 1, 1, 1], [0, 5, 3, 3, 2], [2, 9, 5, 2, 2, -1], [9, 9, 3, 2, 2, -2]],
    fact: "Snowshoe hares turn white for winter and brown for summer. Their big furry hind feet work like snowshoes.", range: "Spruce-fir forests in northern New England." },
  { id: "spruce-grouse", name: "spruce grouse", group: "bird", rarity: "uncommon", value: 30, speed: 36, w: 14, h: 11, graze: true, behavior: BEHAVIOR.groundBird,
    where: { alpine: 1, "north-woods": 2 },
    colors: ["#5a5650", "#1a1a1a"], light: "#e8e4dc", accent: "#d8302a",
    parts: [[3, 4, 8, 5, 0], [0, 3, 4, 4, 1], [9, 1, 4, 4, 0], [11, 4, 2, 3, 1], [10, 1, 2, 1, 3], [13, 2, 1, 1, 1], [4, 6, 5, 2, 2], [5, 9, 1, 2, 1, 1], [8, 9, 1, 2, 1, 2]],
    fact: "Spruce grouse are so calm around people that old-timers called them \"fool hens\".", range: "Spruce and fir forests in northern New England." },
  // Rare finds
  { id: "bicknells-thrush", name: "Bicknell's thrush", group: "bird", rarity: "rare", fly: "low", season: "warm", speed: 58, w: 12, h: 9, behavior: BEHAVIOR.songbird,
    where: ["alpine"],
    colors: ["#7a6a52", "#2a2218"], light: "#ece4d4",
    parts: [[2, 3, 6, 3, 0], [3, 5, 5, 2, 2], [4, 5, 1, 1, 1], [6, 6, 1, 1, 1], [7, 1, 4, 4, 0], [10, 3, 2, 1, 1], [8, 2, 1, 1, 1], [0, 3, 3, 2, 0], [3, 2, 4, 2, 1, 1],
      [4, 7, 1, 2, 1, 1], [6, 7, 1, 2, 1, 2]],
    fact: "One of the Northeast's rarest songbirds. It nests only in stunted fir forest on high peaks and winters in the Caribbean.", range: "High peaks of the White Mountains and western Maine, in summer." },
  { id: "fisher", name: "fisher", group: "mammal", rarity: "rare", speed: 60, w: 26, h: 10, behavior: BEHAVIOR.predator,
    where: ["lakes", "river-valley", "north-woods"],
    colors: ["#3a2a1e", "#1a120c"], light: "#7a5a40",
    parts: [[5, 3, 15, 5, 0], [0, 3, 6, 3, 0], [0, 4, 2, 2, 1], [19, 2, 6, 5, 0], [20, 1, 1, 1, 0], [23, 1, 1, 1, 0], [19, 2, 4, 2, 2], [24, 4, 2, 1, 1], [22, 3, 1, 1, 1],
      [6, 8, 2, 2, 1, 1], [10, 8, 2, 2, 1, 2], [15, 8, 2, 2, 1, 1], [18, 8, 2, 2, 1, 2]],
    fact: "Despite the name, fishers rarely fish. This big cousin of the weasel is one of the few animals that takes on porcupines.", range: "Northern forests from New York to Maine." },
  { id: "flying-squirrel", name: "Carolina northern flying squirrel", group: "mammal", rarity: "rare", speed: 64, w: 16, h: 9, behavior: BEHAVIOR.skittish,
    where: ["high-balds"],
    colors: ["#9a8a72", "#4a3e30"], light: "#f0ece0",
    parts: [[3, 3, 9, 4, 0], [3, 6, 9, 1, 2], [2, 5, 12, 1, 1], [11, 1, 4, 4, 0], [13, 2, 1, 1, 1], [12, 0, 1, 1, 0], [0, 4, 3, 2, 0], [4, 7, 2, 2, 1, 1], [9, 7, 2, 2, 1, 2]],
    fact: "An endangered squirrel that glides between trees on folds of skin. It lives only in spruce-fir forest on a few southern peaks.", range: "The highest spruce-fir peaks of the Smokies and nearby." },
  // Legends: purely for fun.
  { id: "specter-moose", name: "Specter Moose", group: "legend", rarity: "legend", speed: 34, w: 35, h: 24, behavior: BEHAVIOR.cryptid,
    where: ["north-woods"],
    colors: ["#dfe6e8", "#8a9aa0"], light: "#ffffff", parts: MOOSE_PARTS,
    fact: "A Maine tall tale tells of a giant, ghostly pale moose that woodsmen swore they saw but could never get close to.", range: "Rumoured: deep in the Maine north woods." },
  { id: "mothman", name: "Mothman", group: "legend", rarity: "legend", fly: "high", speed: 40, w: 18, h: 20, behavior: BEHAVIOR.cryptid,
    where: ["rocky-ridges"],
    colors: ["#3a3a40", "#151518"], light: "#e82828",
    parts: [[6, 4, 6, 10, 0], [7, 0, 4, 5, 0], [7, 2, 1, 1, 2], [10, 2, 1, 1, 2], [0, 2, 6, 8, 1, 1], [12, 2, 6, 8, 1, 2], [7, 14, 2, 6, 0, 1], [9, 14, 2, 6, 0, 2]],
    fact: "A winged figure with glowing red eyes from West Virginia folklore, first reported in 1966.", range: "Rumoured: West Virginia, which the trail crosses at Harpers Ferry." }
];

// Rare finds and legends are worth a fixed amount unless a species sets its own value.
export const RARITY_VALUE = Object.freeze({ rare: 150, legend: 200 });

// Fills in what follows from other fields, so each species is written once: `skittish` comes from the
// behaviour class (a species that ignores the camera is never startled) and rare/legend values from
// the rarity. Validated by tests/at/species-catalogue.test.js.
function defineSpecies(list) {
  return freezeAll(list.map((sp) => ({ value: RARITY_VALUE[sp.rarity], skittish: sp.behavior.react !== "ignore", ...sp })));
}

const SPECIES = defineSpecies([...CLASSIC, ...NEW_SPECIES, ...TRAIL_EXPANSION]);

// Each habitat's spawn tables come from the species' own `where`, so adding a species never means
// editing the habitats: common/uncommon weights go into `animals`, rare and legendary finds into
// `rare` / `legends` (in catalogue order).
function habitatsFrom(scenery, species) {
  const special = (sp) => sp.rarity === "rare" || sp.rarity === "legend";
  const livesIn = (sp, id) => sp.where === "everywhere" || (Array.isArray(sp.where) && sp.where.includes(id));
  const table = (id) => Object.freeze({
    ...scenery[id],
    animals: Object.freeze(Object.fromEntries(species.filter((sp) => !special(sp) && sp.where && sp.where[id] > 0).map((sp) => [sp.id, sp.where[id]]))),
    rare: Object.freeze(species.filter((sp) => sp.rarity === "rare" && livesIn(sp, id)).map((sp) => sp.id)),
    legends: Object.freeze(species.filter((sp) => sp.rarity === "legend" && livesIn(sp, id)).map((sp) => sp.id))
  });
  return Object.freeze(Object.fromEntries(Object.keys(scenery).map((id) => [id, table(id)])));
}

// backdrop: "hills" | "ridges" (layered Blue Ridge) | "balds" (grassy tops) | "peaks" (above treeline).
// water: "stream" | "lake". pines: conifers instead of round hardwoods (hardwoods turn in autumn).
// Scenery only: which species live here comes from each species' `where`.
const SCENERY = Object.freeze({
  "southern-ridges": { label: "Georgia hardwood ridge", backdrop: "hills", sky: "#b9d6e0", haze: "#d4e6ea", far: "#5f7f55", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35",
    trees: 12, pines: false, shrubs: 10, rocks: 4, logs: 3, tall: 10,
    fact: "Georgia's ridges are covered in oak and hickory forest, with mountain laurel in late spring." },
  "high-balds": { label: "Grassy bald in the Smokies", backdrop: "balds", sky: "#bcd9e6", haze: "#d6e8ee", far: "#6d8f5e", ground: "#b9c77a", band: "#a9b96a", patch: "#9fb260", tuft: "#4f7a3a",
    trees: 3, pines: true, shrubs: 8, rocks: 3, logs: 0, tall: 30,
    fact: "Grassy balds are treeless mountaintops. Nobody is quite sure how all of them first formed." },
  "blue-ridge": { label: "Blue Ridge meadow", backdrop: "ridges", sky: "#c4dcea", haze: "#dce9f0", far: "#5c7f97", ground: "#a9b874", band: "#99a965", patch: "#8fa05c", tuft: "#4a7038",
    trees: 6, pines: false, shrubs: 8, rocks: 3, logs: 1, tall: 18,
    fact: "The Blue Ridge looks blue from afar partly because of a natural haze given off by its trees." },
  "rocky-ridges": { label: "Rocky Pennsylvania ridge", backdrop: "hills", sky: "#c0d6e4", haze: "#d9e6ee", far: "#7b7f6c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52",
    trees: 7, pines: false, shrubs: 5, rocks: 16, logs: 2, tall: 6,
    fact: "Pennsylvania's ridges are famous for sharp rocks, and for hawks riding the wind along them each fall." },
  lakes: { label: "Lakeshore in the Highlands", backdrop: "hills", water: "lake", sky: "#bcd9e6", haze: "#d6e8ee", far: "#5d806a", ground: "#a8b878", band: "#98a86a", patch: "#8e9e60", tuft: "#4f7a3a",
    trees: 8, pines: false, shrubs: 7, rocks: 6, logs: 2, tall: 12,
    fact: "The Highlands of New Jersey and New York are dotted with lakes left behind by Ice Age glaciers." },
  "river-valley": { label: "New England river valley", backdrop: "hills", water: "stream", sky: "#bcd9e6", haze: "#d6e8ee", far: "#678c56", ground: "#b2b878", band: "#a2a86a", patch: "#98a060", tuft: "#5d8a45",
    trees: 6, pines: false, shrubs: 8, rocks: 7, logs: 2, tall: 16,
    fact: "New England's river valleys were carved and smoothed by Ice Age glaciers." },
  alpine: { label: "Above treeline in the Whites", backdrop: "peaks", sky: "#c5d5e2", haze: "#dfe8ef", far: "#6f7a8c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52",
    trees: 5, pines: true, shrubs: 4, rocks: 14, logs: 1, tall: 5, cold: true,
    fact: "Above treeline, plants grow low and slow. A few alpine flowers here grow almost nowhere else." },
  "north-woods": { label: "Maine north woods", backdrop: "hills", water: "lake", sky: "#b9d3d6", haze: "#d0e2e2", far: "#35594a", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35",
    trees: 16, pines: true, shrubs: 8, rocks: 5, logs: 3, tall: 8, cold: true,
    fact: "Maine's north woods are a land of spruce, fir, lakes, loons and moose." }
});

const HABITATS = habitatsFrom(SCENERY, SPECIES);

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
