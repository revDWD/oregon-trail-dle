# AT Fitness Tracker: Strategic Review & Roadmap

A planning and design review written after the terrain sprint (roadmap §28). Nothing here is implemented yet, and no SQL is needed until item 1 or 7 is approved.
Grounded in `AGENTS.md`, the README, `docs/camp-3d.md` and `docs/review-and-roadmap.md` (§1–28).

## 1. Product review

### Core loops

| Loop | Cadence | State |
| --- | --- | --- |
| Log activity → shared miles → landmark, patch, badge, journal | Daily | Strong. One source of truth, everything derives from it. |
| Visit Camp → see the group, wander, take photos | Daily, optional | Charming, but nothing you do there lasts. |
| Photo outing → species → field guide → species badges | Daily, capped at 10 | Solid rules and server checks, but it is a 2D game hidden behind a 3D place. |
| Read dispatches, landmark stories, journal | Weekly | Good, depends on Kevin posting. |

### Strongest systems
- **Shared trail progression and Landmark Patches.** Collaborative ownership ("The Expedition reached X") is the heart of the product and is unique to it.
- **The derived data model.** Two tables drive everything; resets, badges and the journal cost no extra storage. This is why features have stayed cheap.
- **Community Camp.** The only place where the group is *seen*. It has the most personality per visit.
- **Field guide and species catalogue.** One object per species, lifetime per hiker, 56 species, server-enforced.

### Weakest systems
- **Two wildlife systems, one of which counts.** The 2D outing fills the guide; the 3D camp visitors, which are more immersive, give nothing. Users will reasonably expect a camp photo of a turkey to count.
- **Camp Camera Roll.** Twelve photos, gone on refresh. A keepsake that isn't kept.
- **Camp does not react to the expedition.** Reaching a landmark, a state or a milestone changes a sheet's text but not the place.
- **Between-landmark gaps.** When the next landmark is far off, a log changes one number. There is little short-range reward that isn't speed-based.
- **Dispatches depend on one person.** When Kevin is quiet, the Trail tab is static.

### Highest potential
1. Camp photography feeding the field guide (joins the two wildlife systems).
2. A Wildlife Trail that replaces the 2D outing as the main photo activity.
3. Camp as a trophy room: the place itself records what the group has done.

### Overlap and bloat risks
- History holds seven panels. It works because they collapse; do not add an eighth. New records should be entries in the Expedition Journal.
- Three collection types (achievement badges, species badges, patches) is the ceiling. New collectibles should be a new *tier or source* of an existing type, not a fourth type.
- The 2D outing and a 3D Wildlife Trail must not both be first-class. One becomes the fallback of the other.
- `camp-3d.js` is very large. A Wildlife Trail must not be added to it; it needs its own renderer module on shared helpers.

## 2. Community Camp evaluation

**Strengths:** a real sense of place (terrain, pond, section flora, clock and season), the roster alive as NPCs, six locations that surface existing data in-world, a working photo camera, quality tiers, a text equivalent for everything, and a pixel fallback.

**Weaknesses:** nothing done in Camp persists; there is no reason to return *today* other than curiosity; visitors are few (1–3); NPCs steer rather than pathfind; moving things have blob shadows; one very large UI file.

**Missed opportunities:** landmark trophies and patch-driven decoration, arrival celebrations at the fire, today's loggers telling you what they did, weather and season events, sound.

**Should Camp become the primary player experience?**
Yes as the **emotional centre**, no as the **source of progress**.
- Logging stays the single source of truth and the fastest path (select name → log → done). Camp never gates logging and never adds miles.
- Camp becomes where progress is *felt*: you log, then the camp shows it.
- Trail stays the journey view; History stays the archive. No new tabs.
- Every Camp feature keeps a text route and works in the 2D camp, or degrades to nothing gracefully.

## 3. Camp realism and visual quality

Target: stylized and cohesive, not photoreal. Ranked by impact per cost.

| # | Improvement | Why | Cost / risk |
| --- | --- | --- | --- |
| 1 | **Lighting and atmosphere pass**: height and distance fog tinted by time of day, a warmer fire light with a visible pool, hemisphere light matched to the sky dome, soft dawn/dusk gradients, low mist over the pond in the morning | The biggest perceived-quality gain for almost no geometry | Low. Uniform and colour work only. |
| 2 | **Wind**: vertex-shader sway on instanced foliage and grass, drifting smoke direction, drying line movement | Makes a still scene feel outdoors | Low–medium. One `onBeforeCompile` patch; off under reduced motion. |
| 3 | **Ambient sound** (opt-in, session setting): fire crackle, birdsong by time of day, rain, wind; positional for the fire and pond | Immersion that costs no frames | Low. Small self-hosted, openly licensed clips; off by default. |
| 4 | **Forest depth**: a mid-ring of taller trunks, billboard tree line beyond the groves, fallen needles and leaf litter decals on paths | Removes the "clearing in a bowl" look | Medium. Instanced; tier-scaled. |
| 5 | **Ground detail on High**: instanced grass tufts and ferns near the camera, fading with distance | Close-up shots look much richer | Medium. High tier only. |
| 6 | **Hiker behaviour**: waypoint graph over the paths (replaces steering), pairs that talk, sitting on the benches properly, reacting to rain together, a short wave or nod to each other | Camp reads as a group, not twelve separate loops | Medium. Pure logic in `camp-life.js`, testable. |
| 7 | **Wildlife behaviour**: approach routes along cover, animals drinking at the pond, birds flying between perches, small groups (deer pairs, turkey flocks), tracks or sounds as cues before they appear | Makes finding wildlife a skill | Medium. Extends `CAMP_VISITORS` data. |
| 8 | **Storytelling props from data**: one trophy per landmark reached, state pennants on the shelter, the latest patch on a pack, boots by the tent of whoever logged today | The camp becomes the expedition's record | Low–medium. Data-driven, no new tables. |
| 9 | **Hero GLBs**: map table, patch board, rigid bear and moose | Better silhouettes at the points people look at | Medium. Pipeline exists; budgets test-enforced. |
| 10 | **Water**: a small stream into the pond with a simple scrolling normal and sound | A landmark within camp | Medium. |

**Three.js practice to hold to:** keep instancing and the one-time shadow map; no post-processing chain on Low or Medium (a single cheap tone-map and optional vignette on High at most); no PMREM environment map unless materials go PBR; split `camp-3d.js` into scene, actors, camera and photo modules before adding more; keep every moving feature behind reduced motion and quality tiers.

**Not recommended:** photoreal assets, real-time shadows for moving actors, SSAO or bloom on mobile, a larger walkable world.

## 4. Wildlife photography roadmap

Vision: Explore Camp → Find Wildlife → Photograph → Identify → Update Field Guide → Earn Progress.

- **Phase A, Keep the photos.** Camera Roll stored on the device (IndexedDB blobs, per hiker, capped, with a download button). No server change. Fixes the weakest system first.
- **Phase B, Camp sightings count.** A photographed camp visitor is credited through a new server function with an allowed-species list and a daily cap. Common and uncommon species only. The review card says "New in your Field Guide". The guide shows where it was first seen ("at camp").
- **Phase C, Finding is a skill.** Cues before an animal appears (tracks, calls, rustling), better approach behaviour, photo quality (framing, distance, facing) that affects the review card wording but never gates the discovery.
- **Phase D, Wildlife Trail.** A short walk out of camp with section-specific wildlife, including rare finds and legends. Becomes the main photo activity.
- **Phase E, Retire the tab-less 2D outing to fallback.** The canvas game stays for devices without WebGL2, reduced-capability devices and anyone who prefers it. Same save path, same caps.
- **Phase F, Photo goals.** Gentle, non-timed prompts ("photograph something at the pond at dawn") and a Photo Board in Camp of the group's best shots. Sharing between devices needs Supabase Storage and moderation thought, so it comes last.

Rules that hold throughout: no miles from photos, daily caps, no speed rewards, a hiker is required, never named until photographed, legends stay secret.

## 5. Wildlife Trail concept

**What it is:** a short, generated footpath that leaves camp through the trail notch. One walk is 2–4 minutes. It is a corridor, not a world.

**How it works**
- **Entry:** the junction sign at the north notch becomes a seventh Camp Location, "Wildlife Trail". Its text button and close-up work like the others. The existing "Go on a photo outing" button at the Observation Area points to it.
- **Generation:** a seeded spline (seed = date + hiker + walk number) through three to five "rooms" chosen from a small set per section: thicket, bald, boulder field, stream crossing, pond edge, overlook, spruce stand. The ground reuses the `groundHeight` approach, flora reuses `REGION_FLORA`, and trees reuse the instanced groves. The player is kept on a path ribbon a few metres wide, so collision and camera stay simple.
- **Wildlife:** spawned from the existing habitat tables in `expedition-themes.js` for the expedition's current section and season, with the same rare (5%) and legend (0.4%) rolls per walk and the same behaviour classes (flee, flush, ignore). Each room has two or three hiding spots; cues hint at them.
- **Play:** walk, notice, raise the camera, shoot. Film is limited (12 frames, as today), so choosing shots matters. No timer pressure beyond the film; slow walking is rewarded because wary animals flush when you jog.
- **End:** an end-of-trail review, like today's results: species found, new ones marked, a line for the journal. Then back to camp.
- **Saving:** one row in `at_expedition_runs` per walk, through the existing path, so the daily cap of 10, the species-per-outing limit and the trigger that writes observations all apply unchanged. Scoring keeps today's rules (each species once, new ×2).
- **Replay value:** the daily seed changes the layout; time of day, weather, season and section change who is out; rooms are added as data.
- **Mobile:** the existing joystick and shutter. On Low, shorter draw distance and fewer plants. The path can also auto-walk ("Stroll") so the player only aims, which is also the keyboard-light and one-handed route.
- **Accessibility:** a text list of "what you can see from here" with "Aim camera" buttons, as in camp. Reduced motion stills ambient movement. Without WebGL2, the 2D outing is offered instead.

**Architecture**
- `engine/wildlife-trail.js`: pure, tested. Seeded path, rooms, spawn plan, cues, film and scoring (delegating to `expedition.js`).
- `ui/trail-3d.js`: its own renderer module on helpers shared with the camp, rather than more code in `camp-3d.js`. This needs the camp file split first.
- Rooms and cues as data, so a new room is one entry.

**Open risks:** the size of the UI work, trust (see §6), keeping it a corridor, and not letting it outshine the trail progress it is meant to decorate.

## 6. Photography integration

**Benefits**
- One wildlife system instead of two; what looks like a discovery is one.
- A reason to visit Camp daily that isn't tied to speed or volume.
- Field guide entries gain a place and a moment ("first seen at camp, at dusk").

**Risks and answers**

| Risk | Answer |
| --- | --- |
| The client can claim any species (anon key is public) | Server function validates: active hiker, species key on an allowed list, daily cap per device and per hiker, rate limit. Accept that a friends' game needs proportionate, not perfect, defence. |
| Rarity is devalued | Camp credits common and uncommon only. Rare finds and legends stay with outings and the Wildlife Trail, with server-side rolls. |
| Farming the cap | Camp sightings get their own small daily cap (for example five), separate from the ten outings. Repeats add a sighting, never a second "first". |
| Section completion is distorted | Camp is in the expedition's current section, so a camp sighting counts for that section, as an outing would. |
| Migration not yet applied | Fail-soft as elsewhere: a missing function means photos stay keepsakes and a quiet notice shows. |
| Reset behaviour | Observations are kept across resets already; camp sightings follow the same rule and are backed up the same way. |
| Accessibility parity | "Aim camera" already gives a text route to the same photo; it must credit identically. |
| Two sources in one table | Add a `source` column (`outing`, `camp`, later `trail`) rather than a new table; `at_field_guide` stays the single read path. |

**Approach (when approved)**
1. A new idempotent migration: `source` on `at_wildlife_observations`, an allowed-species table or check, and a SECURITY DEFINER function `at_camp_sighting(hiker, species)` that inserts through the same uniqueness rule for firsts. No direct grants on the table.
2. `at_field_guide` returns where each species was first seen.
3. Client: `data/layer.js` call, review card wording, guide line, journal entry, species badge celebration (reusing the existing one-line celebration).
4. Tests: RLS suite (caps, allowed list, no duplicate first, hiker A versus B, reset), engine tests, fail-soft test.
5. Stronger trust (server-issued encounter tokens) only if abuse ever appears.

**Achievements:** the 11 wildlife badges and 50 species badges read from the field guide, so they update without change. Add no new badge type; at most one or two achievement badges ("Camp Naturalist", "Trail Photographer") using existing data.

## 7. Prioritized roadmap (top 10)

| # | Enhancement | Pillars | Depends on | SQL? |
| --- | --- | --- | --- | --- |
| 1 | **Camp photos count**: camp sightings credited to the field guide (common and uncommon) | Wildlife, photography, collection | none | Yes, one migration |
| 2 | **Keep the Camera Roll**: on-device storage per hiker, download button | Photography | none | No |
| 3 | **Atmosphere pass**: fog, light, wind, pond mist, opt-in ambient sound | Immersion | none | No |
| 4 | **The camp remembers**: landmark trophies, state pennants, latest patch, arrival celebration at the fire | Camp, AT identity, collection | none | No |
| 5 | **Split `camp-3d.js`** into scene, actors, camera and photo modules with shared helpers | Enabler | none | No |
| 6 | **Living camp**: path-following hikers, group moments, richer wildlife approach, cues, small groups, pond visits | Immersion, wildlife | 5 | No |
| 7 | **Wildlife Trail v1**: seeded corridor, three to five rooms, saved as an outing; the 2D outing becomes the fallback | Exploration, wildlife, photography | 1, 5 | Small (a `source` value) |
| 8 | **Landmark arrival moments**: a one-time postcard with the real photo, patch and Kevin's note, shown on Trail and pinned at the Bulletin Board | AT identity | none | No |
| 9 | **Photo goals and species of the week**: gentle, untimed prompts from existing data; rare finds auto-noted in the journal and on the board | Wildlife, retention | 1 | No |
| 10 | **Seasonal camp and section showpieces**: seasonal dressing, one signature feature per trail section (a bald, a boulder field, spruce and granite), more hero GLBs | Immersion, AT identity | 3 | No |

**Suggested order:** 1 and 2 together (the photo loop pays off), then 3 and 4 (the camp feels and remembers), then 5 and 6 (foundation), then 7 (the big one), with 8–10 as smaller sprints between.

**Deliberately excluded:** leaderboards by speed or volume, streaks, calorie or pace stats, device integrations, a larger open world, a fourth collectible type, new tabs, image recognition, anything that adds miles from play.

## Notes
- Every item keeps the principles: logging is the source of truth, encouraging not punitive, text parity, no build step, no new tabs, fail-soft.
- Only items 1 and 7 touch the database. Each needs a new idempotent migration, the RLS suite, and SQL given to the owner as plain text.
- Decided by the owner for item 1: a photograph of wildlife at camp is a full discovery. It goes in the hiker's field guide and unlocks the species badge, for common and uncommon species. There is no separate "seen at camp" mark.
