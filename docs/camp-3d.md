# The 3D Community Camp

How the explorable camp is built, how its life and photo camera work, and where it could go next. For the project as a whole, read `AGENTS.md` first. The history is in `docs/review-and-roadmap.md` §21–24.

## 1. Layers

| File | Job | Tested |
| --- | --- | --- |
| `engine/camp-world.js` | Layout (`CAMP_LOCATIONS`, `CAMP_PROPS`, benches, lanterns), colliders and `moveActor`, the follow camera, each place's close-up (`view`, `locationView`, `blocksView`), `QUALITY` tiers, `campLighting`, and the bulletin and roster summaries | `tests/at/camp-world.test.js` |
| `engine/camp-life.js` | What happens in camp: hikers' activities, wildlife visitors, each section's plants, and photo framing | `tests/at/camp-life.test.js` |
| `ui/camp-3d.js` | Drawing and input only (three.js, loaded lazily) | Static checks plus a visual check |
| `ui/views.js` (`campExplorer`, `campPlaceBody`) | The text side: Camp Locations, each place's in-world sheet, Around Camp Now and the Camp Camera Roll | Static checks |

The engine files import nothing from the DOM or three.js. Everything the renderer draws is a plain object (`{ x, z, heading, pose, item }`), so rules can be tested in Node and the 2D pixel camp stays a complete fallback.

No SQL and no new tables. The camp reads what the app already loads: the roster, today's logs, the section, the season and the device clock.

### Close-ups and in-world sheets

Camp is the page: the frame fills the content width at a viewport-based height (`.camp-frame`), and a **Full screen** button appears where `requestFullscreen` is supported (sheets, prompts and the shutter all live inside the frame, so they come along).

Visiting a place (E, a tap, or its Camp Locations button) calls `focusCamp3d(id)`. The renderer eases the camera to the place's `view` (`locationView`: back toward the fire by `distance`, at `height`, looking at `look`; the campfire `orbit`s slowly instead, a calm viewing mode) and `campExplorer` fills the sheet from `campPlaceBody`, themed per place (cork notes, journal pages, a felt blanket, polaroids and find cards, a parchment map, a low dark bar by the fire).

- **Where the sheet goes.** In 3D it is drawn over the camp: a bottom sheet in narrow frames, a right-hand panel in wide ones. `focusInset` reports how much of the camp it covers and `applyView` shifts the projection with `setViewOffset`, so the place sits in the middle of what's still visible (a bottom sheet also widens the field of view so the place keeps its size). In the 2D camp the sheet flows beneath the scene.
- **A clean shot.** The player, the place's floating sign and gold ring, and any hiker or visitor standing between the camera and the place (`blocksView`, pure and tested) are hidden while the close-up lasts. The campfire keeps its company.
- **Leaving.** Escape, Close or the same button again hands the camera back to the follow camera from where the close-up left it, and focus returns to what opened the sheet.
- **Collections live in History.** The sheets show recent things and link onward ("Read the whole Expedition Journal in History", "Open the full Expedition Patch Collection"); the patch collection, hikers' badges and trail register themselves are History's.

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

**Idle animation** (`HIKER_GESTURES`, `gesturesFor`, `VISITOR_IDLES`, `idlesFor`)

- A hiker standing or sitting at an activity now and then plays a short gesture that suits the pose: looking around, sipping coffee, checking the map, adjusting a pack or stretching. `gesturesFor(pose)` returns none while walking, sleeping or busy with both hands (chopping, carrying). Gestures are state on the NPC (`gesture`, `gestureT`), so they are tested in Node; the renderer only poses arms and head.
- A hiker the player walks up to waves (once, then a cooldown), turned towards the player (`waveAt`). `stepCampLife` takes `{ player }` for this.
- A visitor that is resting picks an idle that suits its model: pecking, foraging, looking round, grooming or listening (ears up, head still). Reduced motion turns gestures and idles off.

**Plants** (`REGION_FLORA`, `campFlora`, `CAMP_PATHS`)

- Each of the eight sections has a pine share and a ground-plant mix. `campFlora` scatters plants (seeded) away from the paths, colliders and activity spots. Thickets and boulders are solid.

## 3. The photo camera

- C or the 📷 shutter button (bottom centre of the scene, 72 px, the camera app's place for it) switches to first person at eye height. Drag, arrows or WASD aim; the wheel or +/− zoom (field of view); Space, Enter, a tap or the shutter takes the photo; Escape or C puts it away.
- `framePhoto(subjects, cam)` projects every subject (`projectPoint`) and drops anything out of frame, too small (under 3% of the frame) or blocked. "Blocked" is a raycast from the lens against occluders (tents, trees, thickets, boulders, the shelter). The best subject is scored by kind (wildlife > hikers > fire > places > props), size and centring, and any animal filling at least 6% of the frame wins. It returns the subject, a few others, `fill`, `distance`, `centered` and `speciesId`.
- `photoCaption` turns that into "Close-up: …", "Nicely framed: …" or "Snapshot: …", with a scenery caption when nothing is in frame.
- **Feedback.** A shot always answers: a white flash, the viewfinder corners snap in and the shutter button presses (all skipped with reduced motion), a short shutter click (WebAudio noise, no file; "Shutter sound" in Controls and Settings turns it off for the session), then a **review card** (a polaroid with the picture, its caption, "Taken at 8:23 AM" and "Wildlife identified: …" when an animal is the subject). Focus moves to **Continue**, which returns to the viewfinder and shows a toast ("📸 Saved to the Camp Camera Roll (3)"); **Return to camp** puts the camera away. Escape is Continue. The shutter does nothing while the card is open.
- The picture is rendered and read back in the same task (the drawing buffer isn't preserved), scaled to 960 px wide, JPEG at 0.8 (about 60–120 KB as a data URL).
- The **Camp Camera Roll** (under Around Camp Now) keeps the 12 newest, with caption, time and a 🐾 tag for wildlife. They live in memory for the session; nothing is uploaded or stored (`localStorage` holds only the hiker).

**Where camera roll photos could live later**

| Option | Fit | Notes |
| --- | --- | --- |
| In memory (today) | ✓ | Survives re-renders and tab switches, not a reload. No quota, no privacy questions. |
| `sessionStorage` | ✗ | Strings only, about 5 MB per origin: a dozen data URLs is 1–1.5 MB, plus base64 overhead, and it shares the quota with everything else. Would also break the "`localStorage` holds only the hiker" spirit. |
| IndexedDB (Blobs) | Best next step | Store `canvas.toBlob` JPEGs (no base64), keep the last 24–50, show "Photos stay on this device". Survives reloads; per device. Add a tiny `data/photo-store.js` and a test that nothing else touches it. |
| Supabase Storage | Later | Needed only for sharing (photo of the week, dispatch pictures). Needs a bucket with RLS per hiker, size limits, an owner-only delete, moderation, and a migration plus RLS tests (AGENTS.md §6). |
| Download | Small win | An `<a download>` on each roll photo saves it to the device with no storage at all. |
- "Aim camera" (Around Camp Now) is the text route to the same photo. `vantagePoints` lists free spots 1–5 m beyond the animal's comfort zone on the player's side (the current spot first if it already works). The renderer takes the first with a clear line of sight, aims, zooms so the animal fills about a fifth of the frame, and follows it until the player aims by hand.

## 4. Photo recognition: crediting camp photos

Camp photos give **no** miles, points or discoveries today. Wildlife Spotting is the only way into the field guide, and its outings are checked by the database (daily cap, species per outing ≤ photos, trigger-written observations). `framePhoto` already returns `speciesId`, so crediting is a small client change. The hard part is trust. Options, simplest first:

1. **Keepsake only (today).** No credit, no risk.
2. **Client-side recognition, server-side limits.** Record a camp sighting through a new SECURITY DEFINER RPC (say `at_camp_sighting(hiker, species)`) that writes an observation with `source = 'camp'`. It would allow only species in `CAMP_VISITORS`, at most a few per hiker per day, and never mark `is_first` for a rare tier. Cheap, but a determined user could call it directly. That is acceptable for a friends' game, *if* it only adds sightings and never badges.
3. **Signed encounters.** The server decides which visitor appears (an RPC returns a signed encounter id with a species and expiry). The client can only claim an encounter it was given, once. Honest and still simple, but camp then needs the network to spawn wildlife.
4. **Image recognition** (a model checking the picture). Not worth it: the scene is synthetic, so the renderer already knows exactly what is in frame, and uploading images would break the "nothing stored" rule.

**Recommendation:** if wanted, choose option 2 for common and uncommon visitors only, shown in the field guide as "seen at camp" (not a first photo, and no badge). Any of these needs a new idempotent migration plus RLS tests, per AGENTS.md §6.

## 5. Performance

**Budget.** Nothing is downloaded but three.js itself (about 2 MB, vendored, dynamic `import()` on Camp only). There are no models or textures: everything is primitives, vertex colours and small canvas textures (signs, the ground at 512 or 1024 px).

**How it stays light**

- *Instancing.* Trees and plants are `InstancedMesh`es, one per kind, so a hundred-odd plants cost about a dozen draw calls. Since Sprint 7 the hills (near, far, snow caps), the scattered rocks and the fire-ring stones are instanced too. Geometries and materials are shared (`geo`, `mat` caches) and disposed when the scene is rebuilt.
- *Shadows only where they're free.* On Medium and High the sun casts a real PCF shadow map (1024 or 2048 px, `QUALITY.shadows`, radius 3), but **only still scenery casts** (tents, the shelter, trees, props). The map is drawn once per scene build or tier change (`shadowMap.autoUpdate = false`, `w.shadowDirty`), not every frame: the sun's shadow camera is fixed over the clearing, so a static map stays valid. Things that move (`userData.moving`: the player, hikers, visitors, the axe) keep their soft blob shadows and receive real ones. Low has blob shadows only. Flat things (ground, paths, rugs) only receive.
- *Cheap colour.* `NeutralToneMapping` with a per-time-of-day exposure (`campLighting().exposure`) and shadow strength (`.shadow`), plus a CSS vignette over the canvas: a graded look with no post-processing pass.
- `QUALITY` (low, medium, high) scales pixel ratio, antialiasing, trees, plants, ground texture size, smoke, fireflies, visitors and shadows. The tier comes from the device (`qualityTier`) and steps down when frames stay slow. Low caps at about 30 fps, and a sustained ~10 fps on Low falls back to the 2D camp.
- Simulation steps are clamped (at most 0.1 s), NPC walking is plain steering over a few dozen circle colliders, and raycasts happen only when a photo is taken, aimed or tapped.
- Drawing stops when the tab is hidden, the canvas is off screen, or the view re-renders (`pauseCamp3d`). The renderer and world survive re-renders; the scene is rebuilt only when what it shows changes.

**Audit (Sprint 7).** Draw calls per frame from the default view with 12 hikers, measured by counting WebGL draws in headless Edge:

| Tier | Before Sprint 7 | First pass (every mesh casting) | Shipped |
| --- | --- | --- | --- |
| Low | 107 | 96 | 96–109 |
| Medium | 194 | 324 | ~201 |
| High | 176 | 485–506 | ~230 |

- Low is cheaper despite more props: instancing the hills, rocks and stones paid for them.
- The first shadow pass made 273 of 333 visible meshes casters, so the shadow pass alone nearly doubled the draws, every frame. Filtering small casters barely helped; drawing the map once for still scenery did. Medium and High now cost the same per frame as before, plus the new props and detail.
- Each hiker is a group of small meshes (body, limbs, head, hat, pack, held item) and the hikers are the largest remaining per-frame cost. That is fine at 12 and is the first thing to batch if the roster grows (§8).

**Considered, not needed today**

- *GLB, Draco, Meshopt.* There are no model files to compress: geometry is built from primitives in code, so the payload is three.js alone. Draco also needs a WASM decoder of a few hundred KB, which would cost more than it saves.
- *Texture compression (KTX2/Basis).* Only two or three small canvas textures exist.
- *LOD.* The clearing is about 40 m across and the far hills are already single cones; there's nothing far enough away to simplify. Frustum culling (three.js default) already skips meshes behind the camera; an instanced kind is culled as a whole, which is fine at this size.
- *Post-processing.* Bloom, SSAO and FXAA each add one or more full-screen passes. On a phone at pixel ratio 1.5–2 that is the most expensive thing we could add, for a look the tone mapping and vignette mostly give already.
## 6. Technical review

What works well:

- The pure-engine split. Every rule a contributor might change (spots, weights, tiers, plants, framing) is data plus a tested function.
- Text parity. Around Camp Now, unnamed visitors and captioned photos make the scene usable without seeing it.
- No new persistence or SQL, so nothing can drift from the database.

Known limits, deliberately accepted:

- NPC steering is not pathfinding. With a very crowded camp, a hiker can take the long way round; a 30 s walk limit makes them arrive anyway.
- Hikers don't collide with each other while walking (only spots are exclusive). Avoiding that would cost more than it adds.
- Photos live only for the session and vanish on reload. That is intentional until there is a sharing feature (see §3 for storage options).
- Moving things (the player, hikers, visitors, the axe) have soft blob shadows rather than real ones, so the shadow map can be drawn once (§5).
- `camp-3d.js` is large (about 1,970 lines) because it holds every model. If it grows much further, split the models (`camp-models.js`) from the loop and input.

## 7. Future ideas

Each should reuse existing data and be a `CAMP_LOCATIONS` entry, a prop, an activity or a visitor rather than a new system:

- Photo missions on the bulletin board ("photograph a bird at dawn"), rewarded with a caption stamp, not miles.
- Seasonal visitors and themes: fireflies in June, a snowshoe hare in winter, pumpkins in October.
- Hikers reacting to visitors (pointing, whispering) and to milestones (a cheer at the fire when a landmark is reached).
- Landmark trophies on a shelf, trail trivia at the signpost, a camp pet, shelter upgrades as the miles grow.
- Download or share a camp photo (a plain download link; no upload).

## 8. Technology roadmap

Where the camp's tech can reasonably go over the next few sprints, cheapest and most useful first.

| Area | Today | Next step | When it's worth it |
| --- | --- | --- | --- |
| Instancing | Trees, plants, hills, rocks, fire stones | `BatchedMesh` (in the vendored three.js) for the hikers' body parts, or merge each still prop (`BufferGeometryUtils.mergeGeometries`) into one mesh per material | A roster above ~20, or props above ~60 |
| Assets | Procedural primitives | A small GLB pipeline (Blender → glTF → `gltf-transform` with Meshopt, whose decoder is far smaller than Draco's) for a few hero props: shelter, a moose, a bear | When a model needs more shape than boxes and cones give. Keep the procedural fallback, lazy-load per model, and record licences as for photos |
| Animation | Hand-posed limbs from pure state (`applyPose`) | Keep state in `camp-life.js`; if GLB characters arrive, drive an `AnimationMixer` from the same `pose`/`gesture` fields | With skinned models only. Mixers cost CPU per character; share clips and pause off-screen actors |
| LOD | Not needed | `THREE.LOD` for GLB models (full, simple, impostor sprite) | With GLB models or a larger camp map |
| Wildlife | 1–3 visitors | Up to ~6 on High is safe (each is 5–10 meshes and a few-dozen-line step). Keep rarity, not count, as the thrill | Seasonal events (a flock of turkeys) can instance a herd |
| NPCs | 12 hikers, steering only | ~20 with batching. Beyond that: a coarse grid path planner and hikers avoiding each other | Visiting hikers or a bigger roster |
| Shadows | Static map, still scenery | Re-render the map every few seconds for slowly moving casters, or contact shadows for hikers on High | If blob shadows ever look wrong in screenshots |
| Post-processing | None (tone mapping + CSS vignette) | High tier only: one `EffectComposer` pass with mild bloom on fire and lanterns at night, or a cheap colour grade (LUT) | Only behind the High tier, measured on a mid-range phone first |
| Photos | In memory, 12 | IndexedDB Blobs, then a download button; Supabase Storage only for sharing (§3) | When hikers ask to keep them |

Guardrails for all of it: no build step, vendor anything new with a checksum, load it only on Camp, keep a text equivalent, and measure draw calls and frame time on a phone before and after.