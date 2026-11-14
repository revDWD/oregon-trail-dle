# The 3D Community Camp

How the explorable camp is built, how its life and photo camera work, and where it could go next. For the project as a whole, read `AGENTS.md` first. The history is in `docs/review-and-roadmap.md` §21–22.

## 1. Layers

| File | Job | Tested |
| --- | --- | --- |
| `engine/camp-world.js` | Layout (`CAMP_LOCATIONS`, `CAMP_PROPS`, benches, lanterns), colliders and `moveActor`, the follow camera, `QUALITY` tiers, `campLighting`, and the bulletin and roster summaries | `tests/at/camp-world.test.js` |
| `engine/camp-life.js` | What happens in camp: hikers' activities, wildlife visitors, each section's plants, and photo framing | `tests/at/camp-life.test.js` |
| `ui/camp-3d.js` | Drawing and input only (three.js, loaded lazily) | Static checks plus a visual check |
| `ui/views.js` (`campExplorer`, `campPlaceBody`) | The text side: Camp Locations, the place panel, Around Camp Now and Camp Photos | Static checks |

The engine files import nothing from the DOM or three.js. Everything the renderer draws is a plain object (`{ x, z, heading, pose, item }`), so rules can be tested in Node and the 2D pixel camp stays a complete fallback.

No SQL and no new tables. The camp reads what the app already loads: the roster, today's logs, the section, the season and the device clock.

## 2. Camp life

**Hikers** (`CAMP_ACTIVITIES`, `createCampLife`, `stepCampLife`)

- Each roster hiker (up to 12, as in the pixel camp) becomes an NPC. An activity has a label (or one per time of day), a pose, weights for dawn/day/dusk/night, optional weather `cover` (`shelter` grows in rain or snow, `outdoor` shrinks), an optional held `item`, and either fixed `spots` or a `route` between two spots (fetching water, carrying firewood).
- The choice is weighted by the clock, the weather and a seeded favourite per hiker. A spot can only be claimed by one hiker. Hikers who logged today start "just back from the trail".
- Walking is simple steering: head for the target, slide along colliders with `moveActor`, and take a sideways detour when stuck. The final step onto a bench or into the shelter ignores colliders. No navmesh or physics.
- The simulation starts over only when what it depends on changes (the roster, who logged today, time of day, weather, section, tents, lanterns or the quality tier), so the 60 s background refresh doesn't shuffle everyone.

**Visitors** (`CAMP_VISITORS`, `createVisitors`, `stepVisitors`)

- Every visitor id is an existing species in `expedition-themes.js`. Its colours, behaviour class and name come from there; the visitor entry adds only `tier`, a renderer `model`, where it goes (`place`: trees, edge, perch, outskirts or treeline), `size`, chances by time of day, and optional `scenes`.
- Weight = tier weight (`VISITOR_TIERS`) × the time-of-day factor; birds ×0.4 in rain or snow. Arrivals are 12–40 s apart and capped by `QUALITY.visitors` (1, 2 or 3).
- A visitor walks or flies in from the edge, rests (grazes, perches, sniffs about) and leaves. Within `waryDistance` (wary × 2.5 m) of the player it reacts with its Wildlife Spotting class: `flee`, `flush` (birds) or `ignore`.
- `describeVisitor` keeps it nameless ("Something is moving at the edge of camp") until it has been photographed.

**Plants** (`REGION_FLORA`, `campFlora`, `CAMP_PATHS`)

- Each of the eight sections has a pine share and a ground-plant mix. `campFlora` scatters plants (seeded) away from the paths, colliders and activity spots. Thickets and boulders are solid.

## 3. The photo camera

- C or 📷 Camera switches to first person at eye height. Drag, arrows or WASD aim; the wheel or +/− zoom (field of view); Space, Enter, a tap or the shutter takes the photo; Escape or C puts it away.
- `framePhoto(subjects, cam)` projects every subject (`projectPoint`) and drops anything out of frame, too small (under 3% of the frame) or blocked. "Blocked" is a raycast from the lens against occluders (tents, trees, thickets, boulders, the shelter). The best subject is scored by kind (wildlife > hikers > fire > places > props), size and centring, and any animal filling at least 6% of the frame wins. It returns the subject, a few others, `fill`, `distance`, `centered` and `speciesId`.
- `photoCaption` turns that into "Close-up: …", "Nicely framed: …" or "Snapshot: …", with a scenery caption when nothing is in frame.
- The picture is `canvas.toDataURL("image/jpeg", 0.7)` straight after a render. **Camp Photos** keeps at most 12 in memory for the session; nothing is uploaded or stored (`localStorage` holds only the hiker).
- "Aim camera" (Around Camp Now) is the text route to the same photo. `vantagePoints` lists free spots 1–5 m beyond the animal's comfort zone on the player's side (the current spot first if it already works). The renderer takes the first with a clear line of sight, aims, zooms so the animal fills about a fifth of the frame, and follows it until the player aims by hand.

## 4. Photo recognition: crediting camp photos

Camp photos give **no** miles, points or discoveries today. Wildlife Spotting is the only way into the field guide, and its outings are checked by the database (daily cap, species per outing ≤ photos, trigger-written observations). `framePhoto` already returns `speciesId`, so crediting is a small client change. The hard part is trust. Options, simplest first:

1. **Keepsake only (today).** No credit, no risk.
2. **Client-side recognition, server-side limits.** Record a camp sighting through a new SECURITY DEFINER RPC (say `at_camp_sighting(hiker, species)`) that writes an observation with `source = 'camp'`. It would allow only species in `CAMP_VISITORS`, at most a few per hiker per day, and never mark `is_first` for a rare tier. Cheap, but a determined user could call it directly. That is acceptable for a friends' game, *if* it only adds sightings and never badges.
3. **Signed encounters.** The server decides which visitor appears (an RPC returns a signed encounter id with a species and expiry). The client can only claim an encounter it was given, once. Honest and still simple, but camp then needs the network to spawn wildlife.
4. **Image recognition** (a model checking the picture). Not worth it: the scene is synthetic, so the renderer already knows exactly what is in frame, and uploading images would break the "nothing stored" rule.

**Recommendation:** if wanted, choose option 2 for common and uncommon visitors only, shown in the field guide as "seen at camp" (not a first photo, and no badge). Any of these needs a new idempotent migration plus RLS tests, per AGENTS.md §6.

## 5. Performance

- Nothing is downloaded but three.js itself (about 2 MB, vendored, dynamic `import()` on Camp only). There are no models or textures: everything is primitives, vertex colours and small canvas textures (signs, the ground at 512 or 1024 px).
- Trees and plants are `InstancedMesh`es, one per kind, so a hundred-odd plants cost about a dozen draw calls. Geometries and materials are shared and disposed when the scene is rebuilt.
- `QUALITY` (low, medium, high) scales pixel ratio, antialiasing, trees, plants, ground texture size, smoke, fireflies and visitors. The tier comes from the device (`qualityTier`) and steps down when frames stay slow. Low caps at about 30 fps, and a sustained ~10 fps on Low falls back to the 2D camp.
- Simulation steps are clamped (at most 0.1 s), NPC walking is plain steering over a few dozen circle colliders, and raycasts happen only when a photo is taken, aimed or tapped.
- Drawing stops when the tab is hidden, the canvas is off screen, or the view re-renders (`pauseCamp3d`). The renderer and world survive re-renders; the scene is rebuilt only when what it shows changes.

## 6. Technical review

What works well:

- The pure-engine split. Every rule a contributor might change (spots, weights, tiers, plants, framing) is data plus a tested function.
- Text parity. Around Camp Now, unnamed visitors and captioned photos make the scene usable without seeing it.
- No new persistence or SQL, so nothing can drift from the database.

Known limits, deliberately accepted:

- NPC steering is not pathfinding. With a very crowded camp, a hiker can take the long way round; a 30 s walk limit makes them arrive anyway.
- Hikers don't collide with each other while walking (only spots are exclusive). Avoiding that would cost more than it adds.
- Photos live only for the session and vanish on reload. That is intentional until there is a sharing feature.
- `camp-3d.js` is large (about 1,650 lines) because it holds every model. If it grows much further, split the models (`camp-models.js`) from the loop and input.

## 7. Future ideas

Each should reuse existing data and be a `CAMP_LOCATIONS` entry, a prop, an activity or a visitor rather than a new system:

- Photo missions on the bulletin board ("photograph a bird at dawn"), rewarded with a caption stamp, not miles.
- Seasonal visitors and themes: fireflies in June, a snowshoe hare in winter, pumpkins in October.
- Hikers reacting to visitors (pointing, whispering) and to milestones (a cheer at the fire when a landmark is reached).
- Landmark trophies on a shelf, trail trivia at the signpost, a camp pet, shelter upgrades as the miles grow.
- Download or share a camp photo (a plain download link; no upload).
