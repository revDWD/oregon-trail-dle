# How to add a new species

Wildlife Spotting, the Field Guide, the Camp species badges, the collector stats and the Expedition Journal all read **one species catalogue** in `assets/js/at/engine/expedition-themes.js`. To add an animal you write **one object** there. It holds the definition and its pixel sprite. Everything else derives from it:

| What | Where it comes from |
|---|---|
| Spawning in each trail section | `where` → `habitatsFrom()` builds each habitat's `animals` / `rare` / `legends` |
| Rare and legend points | `rarity` → `RARITY_VALUE` (150 / 200) |
| Reaction to the camera (`skittish`) | `behavior.react` (anything but `"ignore"` is skittish) |
| Field Guide entry, group and tag | `group`, `rarity`, `fact`, `range`, `season`, `behavior` |
| Species badge (Camp) | the sprite in a medallion, one per species, automatically |
| Locked hint ("Look in: …") | the best `where` habitat |
| Collector stats, Badge Collection bar, Master Naturalist, Rare Species Finder | counted from the catalogue |
| Saving discoveries | the `id`, which the database stores. No SQL change is ever needed. |

Then run `npm test`. `tests/at/species-catalogue.test.js` checks the new species and proves it can spawn, fills a guide entry and earns a badge.

## 1. Pick an id and a home

- **id**: lowercase letters, digits and dashes, 2–31 characters (`"pileated-woodpecker"`). The database stores it in every saved discovery. **Never rename or remove an id once photographed.**
- **where**: where along the trail it lives. Habitats are the region `scene`s in `trail/appalachian-trail.js`:

  | Habitat id | Trail section | Feel |
  |---|---|---|
  | `southern-ridges` | Georgia | Hardwood ridges |
  | `high-balds` | North Carolina / Tennessee (Smokies) | Grassy balds, spruce-fir peaks |
  | `blue-ridge` | Virginia | Layered Blue Ridge hardwoods |
  | `rocky-ridges` | West Virginia / Maryland / Pennsylvania | Rocky ridges and cliffs |
  | `lakes` | New Jersey / New York | Lakes and wetlands |
  | `river-valley` | Connecticut / Massachusetts | River valleys and farmland edges |
  | `alpine` | Vermont / New Hampshire | Above treeline, stunted fir |
  | `north-woods` | Maine | Spruce, fir, lakes and moose |

  - **Common and uncommon** species use spawn weights: `where: { "north-woods": 3, alpine: 1 }`. A weight of 1 is scarce and 5 means everywhere you look; most species use 1–3. Leave out the habitats where it doesn't live.
  - **Rare and legend** species use a list: `where: ["alpine"]`, or `where: "everywhere"`.

## 2. Fill in the definition

```js
{ id: "spruce-grouse", name: "spruce grouse", group: "bird", rarity: "uncommon", value: 30, speed: 36, w: 14, h: 11, graze: true, behavior: BEHAVIOR.groundBird,
  where: { alpine: 1, "north-woods": 2 },
  colors: ["#5a5650", "#1a1a1a"], light: "#e8e4dc", accent: "#d8302a",
  parts: [[3, 4, 8, 5, 0], [0, 3, 4, 4, 1], /* … */ [8, 9, 1, 2, 1, 2]],
  fact: "Spruce grouse are so calm around people that old-timers called them \"fool hens\".", range: "Spruce and fir forests in northern New England." },
```

### Required

| Field | Notes |
|---|---|
| `id` | See above. |
| `name` | Lower case unless a proper name ("American toad", "Mothman"). Must be unique. Shown in Title Case in headings. |
| `group` | `"mammal"`, `"bird"`, `"insect"`, `"herp"` (reptiles and amphibians) or `"legend"` (legends only). |
| `rarity` | See below. |
| `where` | See above. |
| `value` | Points per photo, common and uncommon only (rare and legend are automatic). Common 8–25, uncommon 25–70. Harder, rarer animals are worth more. |
| `speed`, `w`, `h` | Logical pixels per second, and the sprite box (the canvas is 320×180). Small birds are about 11×8, a deer is about 28×20. |
| `behavior` | One of the classes below, e.g. `BEHAVIOR.songbird`. |
| `colors`, `light` | `[body, dark]` and a light colour. |
| `parts` | The sprite (see below). |
| `fact` | One short, friendly, accurate fact, at most 200 characters. Hedge when unsure ("may", "about"). |
| `range` | Where along the trail to look. |

### Optional

| Field | Notes |
|---|---|
| `accent` | A fourth colour (needed if any part uses colour 3). |
| `fly` | `"high"` (soars over the trees) or `"low"` (flits near the ground). Ground animals leave it out. |
| `season` | `"warm"`: much scarcer November to March (insects, snakes, frogs). `"cold"`: winter only. |
| `herd` / `flock` | Maximum group size (at most 3 animals arrive together). |
| `graze` | Nods its head while standing still. |

### Rarity

| Rarity | How it appears | Points | Field Guide and badges |
|---|---|---|---|
| `common` | Spawn weights, every outing | Your `value` | Counts toward every total |
| `uncommon` | Spawn weights (use low weights) | Your `value` | "Uncommon" tag |
| `rare` | Rolled at 5% per outing, from the local `where` list | 150 | "Rare find" tag, teal ring, counts toward Rare Species Finder |
| `legend` | Rolled at 0.4% per outing | 200 | Secret until photographed; a bonus outside every total |

Each habitat needs at least one rare find and one legend (the tests check this).

### Behaviour classes

| Class | Label | Reacts to the camera |
|---|---|---|
| `grazer` | Grazer: long pauses, freezes head-up, then bounds away | flees |
| `skittish` | Skittish: quick bursts, zigzags away | flees |
| `predator` | Predator: trots with purpose, slips away once seen | flees |
| `largeMammal` | Large mammal: unhurried, carries on | ignores |
| `groundBird` | Ground bird: walks and pecks, bursts into flight | flushes |
| `songbird` | Songbird: perches, short bounding flights | flushes |
| `raptor` | Soaring bird: slow wide circles | flees |
| `owl` | Owl: sits still, glides off silently | flushes |
| `swimmer` | Swimmer: paddles along the water's edge | flees |
| `butterfly` | Fluttering insect: erratic, bobbing path | flees |
| `darter` | Darting insect: hovers, then darts | flees |
| `hoverer` | Hovering insect: hovers and drifts | flees |
| `crawler` | Slow crawler: creeps, stays put | ignores |
| `cryptid` | Trail legend | flees |

Pick the closest class. A one-off tweak can spread a class, as the wood duck does: `Object.freeze({ ...BEHAVIOR.swimmer, react: "flush", … })`. Add a new class only if none fits.

## 3. Draw the sprite

`parts` is a list of rectangles, facing right: `[x, y, w, h, colour, leg]`.

- `colour`: 0 = body (`colors[0]`), 1 = dark (`colors[1]`), 2 = `light`, 3 = `accent`.
- `leg` (optional): `1`/`2` lengthens the part on alternate steps (legs), `-1`/`-2` shortens it (wings use this to flap).
- Keep every part inside the box: `x ≥ 0`, `x + w ≤ w`, `y + h ≤ h + 7`. Ears and antlers may poke up to 10 pixels above the box (`y ≥ -10`).
- Match the existing style: a few flat colours, no outlines, a dark eye pixel, legs as 1–2 pixel parts.
- The same sprite becomes the Field Guide art and the Camp species badge. Locked badges show it as a silhouette.
- To reuse a sprite in other colours (as the white deer and Specter Moose do), reuse the `parts` array.
- Use original pixel art only.

## 4. Add it to the catalogue

Put the object in a wave list (`TRAIL_EXPANSION`, or start a new list for a new wave and add it to `SPECIES = defineSpecies([...])`). Order within a list sets field-guide order within a group, and the order of rare and legend lists.

## 5. Check

1. `npm test`. The catalogue validator names the species and the field that's wrong.
2. Optional: serve the site locally (see AGENTS.md §7) and play Wildlife Spotting in the species' section.
3. No SQL and no migration. The database limits species *per outing* (at most 40, and never more than the photos taken), not the size of the catalogue.

## Things that are easy to forget

- Rare and legend species use a `where` **list**; common and uncommon use **weights**. The validator catches mix-ups.
- No hunting words anywhere (hunt, shoot, shot, kill, rifle, bullet, meat, food).
- Adding a regular species raises the Field Guide total, so Master Naturalist and the Badge Collection need one more find. That is intended.
- Adding a common or uncommon species to a habitat adds to that trail section's "Trail Sections" completion target.
