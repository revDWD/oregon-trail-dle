# Phase 2 review, recommendations and roadmap

Written on 2026-11-03, after Phase 1 (the AT game, anonymous sign-in and the friends leaderboard) went live at https://atfitnesstracker.abbydavid.com. The brief asked for five things: a map overhaul, removing Profile, restoring Camp and the Hunting minigame, and organizer announcements. It also asked for reviews and an engagement plan. This document records what was found, what was decided and what comes next.

## 1. UX review (Phase 1 as shipped)

| Finding | Impact | Phase 2 response |
|---|---|---|
| The map was a static picture: one dashed line, dots and a marker. You could not explore it, and landmark facts lived in a separate list. | The "adventure" feeling was weak, and the most motivating screen was the least interactive. | **Interactive map** (§5.1) as the Trail page's centrepiece. |
| Profile was a dead end: two fields, plus an explanation that there is no login. It was the 6th tab and rarely needed. | Navigation clutter. | **Removed.** Trail name, weekly goal, hiker ID and the "About your progress" note moved into a "Your spot at camp" card. `#/profile` now falls back to the Trail page. |
| Nothing on the home screen came from the people running the group. | Kevin's encouragement, stories and jokes are the glue of the group, but the app had nowhere to put them. | **Trail Dispatches** (§5.4), shown at the top of the Trail page. |
| There was nowhere to "hang out". The Oregon version's camp scene and hunt gave people a reason to open the app on rest days. | Engagement dropped on days without activity. | **Camp** and the **Expedition** minigame are restored (§5.2, §5.3). |
| The crew had no presence on the map. | Competition and cooperation were only visible on the Crew tab. | Crew-mates and the crew's combined position (a "crew camp" marker) are drawn on the map. |
| The weekly goal said "set it on the Profile page". | It pointed to the page that was being removed. | Now links to Camp. |

## 2. Architecture review

Strengths to keep:

- Static ES modules with no build step.
- Pure `engine/` modules, DOM-free and unit-tested.
- A single data layer (`data/layer.js`) is the only Supabase caller. A static test enforces this.
- `h()`/`svg()` DOM helpers mean no `innerHTML` anywhere (also test-enforced).
- RLS is tested against real Postgres.

Technical debt found, and what happened to it:

1. **Map rendering and maths were mixed together and untestable.** The new `ui/map.js` exports pure view maths (`clampView`, `zoomView`, `panView`, `fitView`, `routeSlice`, `landmarkStatus`), now covered by `tests/at/map.test.js`. DOM wiring stays in `renderTrailMap`.
2. **Whole-page re-render on every change.** It is fine at this size. Map zoom and selection survive re-renders through a small module-level memory. A long-running canvas game must be stopped on re-render: `app.js` does this, and a test checks it. Revisit (keyed partial renders) only if pages get heavy.
3. **No rich-text story.** Announcements need formatting, but `innerHTML` is banned. The answer is a tiny Markdown subset parser (`engine/markdown.js`, pure and tested) plus a DOM renderer (`ui/markdown-view.js`).
   - Supported: paragraphs, headings, lists, quotes, bold, italics and links.
   - Links must be `https:` (anything else renders as plain text), and open in a new tab with `rel="noopener noreferrer nofollow"`.
4. **Theme-specific minigame code.** The Oregon hunt hard-coded species, sprites and rules inside its canvas loop. The rebuild splits it into three parts:
   - `engine/expedition.js`: the rules, independent of theme, with injectable randomness so tests are exact.
   - `engine/expedition-themes.js`: themes, which are data only.
   - `ui/expedition-view.js`: canvas and input.

   Adding a "birding" or "trail clean-up" theme is a data change.
5. **Leaderboard polling vs Realtime.** This is unchanged and still correct. RLS hides other users' activity rows from Realtime, so polling the aggregate RPC every 60 s (on the Crew page, which is Camp's crew section since Phase 3) is simpler and leaks nothing.
6. **`localStorage` rule.** Camp time-of-day and expedition-theme choices are kept in memory, not in storage, so the "only the selected challenge in localStorage" rule still holds.

## 3. Database review

Existing schema (`20261101000000_at_fitness_schema.sql`): `at_profiles`, `at_conversion_rules`, `at_activities`, `at_challenges` and `at_challenge_members`, plus the leaderboard and summary RPCs.

- It is well constrained, and RLS is tight.
- Credited miles are computed by a trigger, so history is stable when rules change.
- Indexes cover `(user_id, activity_date)`.
- Nothing needed to change.

New migration: `20261103000000_at_camp_dispatches.sql`. It is idempotent and only touches `at_*` objects.

| Object | Purpose | Security model |
|---|---|---|
| `at_organizers(user_id, note)` | Who may post dispatches | RLS on, and all API privileges revoked. Rows are added only from the SQL editor. Clients ask through `at_is_organizer()` (SECURITY DEFINER, fixed `search_path`). |
| `at_dispatches` | Kevin's announcements | Everyone signed in can read **published public** dispatches. Members can also read their crew's. Only organizers can insert, update or delete. A trigger trims fields and forces `created_by = auth.uid()`. `created_by` is not even selectable. Future `published_at` means scheduled (hidden until then). |
| `at_expedition_runs` | Minigame results | Insert and read **own** rows only, and there is no update or delete. A trigger forces `user_id`, `played_on` and `created_at`, and caps runs at **10 per day**. Score is 0–400 and hits ≤ shots ≤ 100. |
| `at_camp_supplies(challenge)` | Photo-board totals (per theme) | Returns only aggregates: your totals, plus crew totals since the challenge started. Non-members get an error. |

Decisions:

- **Expeditions never award trail miles.** Only real activity moves you on the trail. The minigame fills the camp photo board, which is cosmetic and cooperative.
- **No achievements table yet.** Badges are still derived (deterministic, so they cannot drift).
- **Public dispatches are visible to any visitor.** Every visitor is an anonymous signed-in user, so anything posted as "Everyone" is effectively public. Crew-only dispatches are limited by RLS. Kevin should not post private information as "Everyone".

## 4. Announcement options and recommendation

| Option | Pros | Cons |
|---|---|---|
| A: "Trail Dispatches" featured card | Very visible | No history |
| B: "Message From Camp" campfire card | Warm and on-theme | No history |
| C: Bulletin-board feed | Full history | Pushes progress down the home page and is noisy |
| **D: Featured latest plus archive** | Visible, with history, and pinning for important notes | Slightly more UI |

**Chosen: Option D, combining A, B and C.**

- The top of the Trail page shows a featured **"Message from Camp"** card: the newest dispatch, or a pinned one.
- Camp holds the full **Trail Dispatches** archive. Organizers see a compose form there, with edit and delete on each item.
- Dispatches support Markdown formatting, pinning, crew-only audience and (via `published_at` in the table editor) scheduling.
- **How Kevin posts:**
  - **In the app:** after he is added as an organizer, a "Write a dispatch" button appears at Camp.
  - **From the dashboard:** Kevin, or anyone with dashboard access, can also add rows in Supabase > Table Editor > `at_dispatches`.
  - See `docs/deployment.md` §2b for the one-line SQL that makes Kevin an organizer.

## 5. What was built in Phase 2

### 5.1 The map, now the centrepiece of the Trail page

- **Zoom and pan:** buttons (+, −, Find me, Whole trail), the keyboard when the map is focused (+/− and arrows), the mouse wheel, drag, and two-finger pinch. When fully zoomed out, the page scrolls normally on touch screens.
- **Regional sections:** eight coloured bands (Georgia → Maine). Below the map is a "Trail sections" list with per-section progress bars and "you are here". Choosing a section zooms the map to it.
- **Mile posts** every 250 miles, in your direction of travel.
- **Landmarks** are real buttons that open a **detail panel** with:
  - an original illustration for its kind (summit, gap, bald, river, town, notch…);
  - status (passed, next with miles to go, or miles ahead);
  - trail mile, approximate elevation, section, typical trailhead access, and trivia.
- The next landmark pulses and is selected by default.
- **Walked path, crew-mates and crew camp** (combined miles) are drawn on the map, with a legend.
- **Accessibility:** everything on the map is also available as text. Changes are announced through a live region. Markers keep their on-screen size while zooming. Pulse animation is off under reduced motion.

### 5.2 Camp (restored)

The Oregon camp diorama is rebuilt as an Appalachian Trail camp.

- **Scenery:**
  - The backdrop follows the crew's trail section: balds, Blue Ridge, rocky Pennsylvania, lakes, the Hudson valley, alpine New Hampshire and the Maine north woods.
  - Weather is deterministic per day and season.
  - Time of day follows the local clock, with Dawn/Day/Sunset/Night preview buttons.
- **The camp grows with progress:**
  - Tents, fire and lanterns grow with miles.
  - The bear-bag line holds one bag per hiker at camp (Phase 3; it used to fill from hunt results), and the photo board fills from Wildlife Spotting.
  - A celebration banner appears soon after the crew passes a landmark.
- **Interaction:** every crew member sits at camp, and recent movers arrive. The fire, shelter register, bear bags, photo board and each hiker are focusable buttons that describe themselves.
- **The page also has:**
  - "Around the fire" stats (crew miles, section, next landmark, photo board, hikers at camp);
  - "Your crew" (Phase 3: start/join, standings, group milestone, invite);
  - the dispatch archive;
  - "Your spot at camp", which holds the old Profile settings.

### 5.3 Expedition minigame (Hunting restored, built to evolve)

> Superseded in Phase 3 (§8): the hunt theme and the theme switch are gone, and Wildlife Spotting now uses the original hunt's full rules and renderer.

- **Camp hunt** keeps the Oregon rules: 30 s, 12 shots, a 4-round magazine, a 1.1 s reload, and misses that startle nearby animals.
- **Wildlife spotting** is the first Appalachian Trail replacement theme. It uses a camera, one photo per animal, and rarer animals score more.
- Species weighting follows your trail section's habitat.
- Controls: keyboard (arrows/WASD + Space), tap or click. A live status line reports hits and misses.
- Results are saved to camp (10 runs a day count). Rounds with no shots are not saved.

### 5.4 Trail Dispatches

See §4.

## 6. Engagement opportunities: proposals and plans

Each proposal is scored by motivation value against complexity. **Next** items are recommended for Phase 3.

| Idea | Value | Plan | Size |
|---|---|---|---|
| **Landmark celebration screen** (Next) | High | On the first render after `passedLandmarks` grows, show a dismissible full-card celebration with the landmark art and trivia. Remember the last celebrated landmark id per challenge in `localStorage`; it is a harmless preference. Respect reduced motion. | S |
| **Weekly crew challenge** (Next) | High | New table `at_weekly_challenges(challenge_id, week_start, goal_miles, title)` that organizers write. An RPC returns crew progress for the week from `at_activities`. Show it in Camp's crew section. Cooperative, with no individual ranking. | M |
| **Recent activity feed** (Next) | High | A privacy change: other members currently see aggregates only. Add an opt-in `share_activity_feed` profile flag and an RPC `at_crew_feed(challenge, limit)` that returns name, type, credited miles and date (never notes) for opted-in members. Show it at Camp as "Who rolled into camp". | M |
| **Monthly group goal** | Medium | Same table and RPC as the weekly challenge, with `period = 'month'`. | S after weekly |
| **Virtual postcards** | Medium | When a landmark is passed, unlock a postcard: the landmark art plus a short line, collectable on the Badges page. Derived from progress, so no table is needed. | S |
| **Trail journal entries** | Medium | Notes already exist on activities and are private. Add an optional "share to camp" journal table with organizer moderation. Use Markdown via the existing renderer. | M |
| **Recent-mileage leaderboard** | Medium | Already returned by `at_leaderboard` (this week). Add a "last 7 days" sort toggle to the standings on Camp. | S |
| **Longest streak / consecutive workouts** | Careful | Rhythm already exists, with forgiving rest days. Show "best rhythm" but never a "streak lost" message, to avoid encouraging unsafe daily exercise. | S |
| **Milestone notifications** | Medium | Web Push needs a service worker plus a server-side sender (an Edge Function and keys). Defer. In-app celebration covers most of the value. | L |
| **Animated progression between landmarks** | Fun | After logging, animate the hiker marker from the old position to the new one (disabled under reduced motion). Map memory already keeps the view. | S |
| **Seasonal themes** | Fun | Camp weather is already seasonal. Add seasonal decorations (fall leaves, snow) keyed off the date. | S |
| **More expedition themes** | Fun | Birding (song ID trivia), foraging (identify safe berries, with a "look, don't eat" message), scavenger hunt (find items on the map), trail clean-up (Leave No Trace). Each is a new entry in `expedition-themes.js` (species/subjects, habitats, words), with no engine changes. | S each |
| **Personal badges** | Exists | Landmark, distance and rhythm badges are already derived. | — |
| **Group badges** | Exists | Group milestones exist in Camp's crew section. Show them as badges on the Badges page. | S |

## 7. Phased roadmap

1. **Phase 2 (done):** map overhaul, Profile removed, Camp, Expedition (hunt + wildlife spotting), Trail Dispatches, docs.
2. **Phase 3 (done):** Wildlife Spotting restored from the original hunt, Crew tab folded into Camp, six tabs, small UX fixes (§8).
3. **Phase 4, celebrate and connect:** landmark celebration screens, postcards, animated progress, the weekly crew challenge and the opt-in activity feed.
4. **Phase 5, story:** shared trail journal, monthly goals, seasonal camp, more expedition themes.
5. **Phase 6, reach:** optional email upgrade for anonymous hikers (to keep progress across devices), push notifications, and an optional real AT GIS centerline for the map, after checking its licence.

## 8. Phase 3: Wildlife Spotting restored, navigation simplified (2026-11-04)

### 8.1 What changed

- **Wildlife Spotting is the original hunt, re-themed.** The Phase 2 wildlife theme was a new, simpler game (one photo per animal, plain sprites). The original Oregon Trail DLE hunt had better pacing and visuals. It is now ported faithfully, including herds and flocks that move together, pausing and grazing animals, startled animals bolting, the 4-frame magazine and winding delay, seeded scenery with tall grass that hides wildlife, weather, pop-ups and sound. Hunting words and images are replaced: a camera viewfinder, "frames of film", "winding", "photo points" and "the photo board". Nine AT species and eight habitats follow the trail section.
- **One tab, no toggle.** The Camp hunt / Wildlife theme switch is gone. The tab is "Wildlife Spotting" (`#/wildlife`).
- **Crew tab removed.** Crew features live in Camp's "Your crew" section. Nothing was lost: start, join, standings, group milestone, invite, refresh and leave all moved. `#/crew` and `#/hunt` still work as aliases.
- **The pantry is gone.** Camp no longer mentions food. The bear-bag line shows one bag per hiker.

### 8.2 Lightweight UX review

| Finding | Change |
|---|---|
| 7 tabs on a 375px phone; Crew and Camp overlapped (both about the group). | **6 tabs.** Crew folded into Camp, so the group lives in one place. The nav labels wrap to two lines, and targets stay ≥ 44px. |
| Finishing a round needed an extra "bring it to camp" step in the original. | **Auto-save** on finish, with a status line ("Pinned to the photo board at Camp: N photo points"). The board total updates in place. |
| Empty rounds used up the 10-a-day allowance. | Rounds that score 0 are not saved. |
| The Trail page had no direct way to log after reading progress. | **"Log an activity"** button in the "This week" card. |
| Solo hikers had no hint that crews exist once the Crew tab was gone. | A "Start or join a crew at Camp" prompt on Trail, shown only when you're in no crew. It focuses the crew section. |
| Crew errors (wrong invite code) appeared in whichever status line came first. | A dedicated crew status line (`data-status="crew"`). |
| The 60 s standings poll re-rendered the whole page and could wipe typing. | Re-render only on change, and never while a form field is focused or a dispatch is being edited. |
| After joining or leaving, focus jumped to the page title. | Focus returns to the "Your crew" heading. |
| "A eastern cottontail", "1 of 1 frames". | Grammar fixed (a/an, singular/plural). |
| Weather particles still moved under reduced motion. | Frozen under reduced motion (animals move at 60% speed, as before). |

### 8.3 Recommended next (AT community fitness theme)

1. **Species collection ("Field guide")** (S): record which species each hiker has photographed (derived from `at_expedition_runs`; needs a `caught` JSON column or a small `at_sightings` table) and show it on Badges. It gives a long-term reason to play in every trail section.
2. **Section-locked rare sightings** (S): moose and elk appear only where the crew is, so reaching Maine "unlocks" moose. Celebrate the first moose photo at Camp.
3. **Weekly crew photo challenge** (M): "Photograph 5 turkeys as a crew this week", tied to the weekly crew challenge in §6.
4. **Birding theme** (S): a second theme object with songbirds, a shorter round and a "listen" hint. No engine change.
5. **Camp photo board details** (S): tap the board to see the crew's top outing this week (aggregate only).
6. **Landmark celebration + postcards** (S): still the highest-value next step from §6.


## 9. Phase 8: UX refinement and personalization (2026-11-04)

"Less clutter, more personality." Design notes: `docs/architecture.md` §10.

### 9.1 What changed

| Area | Change |
|---|---|
| Trail | Removed "Welcome to the Trail" and "Hiking is better with friends". The page is now expedition progress (miles together, miles to go), the map, this week by hiker, the next group milestone and landmarks. |
| Log Activity | A required **Hiker** dropdown (David, Kevin; roster in `at_hikers`). It preselects the last hiker chosen on this device. |
| Navigation | Trail · Log Activity · Camp · Wildlife Spotting · History. History is last, as the archive. Badges is no longer a tab. |
| Camp | Removed join-a-crew, start-a-crew, "Your spot at camp" and "About your progress". The time of day follows the device clock (morning/day/evening/night), with no buttons. New **The hikers** section: pick a hiker (or tap them in the scene) to see miles contributed, share of the expedition, this week, badges earned, progress to the next badge, milestones reached, and their journey timeline. New **Trail register**: every landmark and group milestone, with the date and whose miles carried the expedition there. |
| Badges | Per hiker. Mileage badges First Steps (10), Trail Walker (50), Pathfinder (100), Wagon Scout (200), Frontier Traveler (500) and Katahdin Bound (1,000, renamed from "Oregon Bound" to fit the AT). Also First Activity Logged, First Wildlife Discovery, Landmark Reached, Milestone Participation, and three forgiving rhythm badges. Each has original pixel art: boots, trail-marker post, compass, covered wagon, ox, mountain, campfire, bear, flag, wagon wheel, sapling, pine and forest. |
| Wildlife Spotting | "Who's spotting?" pins each outing to a hiker. Photo points show per hiker. |
| History | Shows the hiker on each entry, flags entries with no hiker (they don't count yet), and lets you assign one by editing, even for old entries. The device ID moved here ("About this device"). |

Interpretations to confirm: "Memorials" became the **Trail register** (a record of landmarks reached, not anything somber). There are no Donner Party comparisons anywhere. Weekly goals (a per-device setting) were dropped along with "Your spot at camp".

### 9.2 Holistic review

**Clutter we could still remove**
1. The **Landmarks** list at the bottom of Trail repeats the map's landmark buttons. Collapse it into a `<details>` ("All 26 landmarks") or drop it.
2. The **"Coming up"** card on Trail repeats the map's selected-landmark card. Merge them.
3. The hero's four stats could become two (miles together, next landmark), with the rest on the map card.
4. Crew-only dispatch targeting is the last crew UI. Remove it if crews stay retired.

**Personalization**
1. **Hiker colours/avatars**: let each hiker pick a shirt and hat colour for the camp sprite (stored on `at_hikers`). They are seeded from the name today.
2. **Personal notes in the register**: let the hiker who carried the group past a landmark add a one-line journal entry (organizer-moderated, new table).
3. **Field guide per hiker**: species photographed in Wildlife Spotting (needs a `species` array on runs).
4. **Hiker of the week** card at Camp: whoever logged on the most days (rewards consistency, not volume).

**Camp as the hub**
1. Add a **"Log miles"** button in each hiker panel, prefilled with that hiker. Camp then becomes a starting point, not only a destination.
2. A **landmark celebration** overlay at Camp the first time a device opens it after a new register entry, with a postcard illustration (reuse `ui/illustrations.js`).
3. Make Camp the default route once the celebration and log shortcut exist, and keep Trail as the map page.
4. **Weekly expedition challenge** on the camp banner ("30 miles together this week"), computed from `week_credited_miles`.

### 9.3 Follow-up: open participation (2026-11-05)

The invite link and join step were removed at the owner's request: "Select Name → Log Activity → Everything Updates". Migration `20261105000000_at_open_expedition.sql` makes every signed-in (anonymous) device a participant and drops `at_expedition_settings`, `at_expedition_members`, `at_join_expedition` and `at_expedition_invite_code`. Trade-off (accepted): anyone who finds the site can log miles for a hiker. Mitigations still in place: hikers must be active roster entries, logging limits and date windows still apply, each device can only edit or delete its own rows, and other devices see aggregates only. If abuse ever happens, the fix is to retire the device's rows in SQL (by `user_id`, shown in History > "About this device").

## 10. Journey Progress and badge polish (refinement sprint)

### 10.1 Journey Progress consolidation (implemented)
The Trail tab had two overlapping lists: "Trail sections" (regions, inside the map card) and a separate "Landmarks" card. They are now one **Journey progress** list in the map card:
- **Regions are parents** (Georgia → Katahdin). The region button still frames the map on that section and shows its progress bar, plus "X of Y landmarks".
- **Landmarks are children**: ✓ passed, ➜ next (with miles to go), ○ ahead. Tapping a landmark selects it on the map and opens its detail panel.
- The data comes from a pure engine function, `journeyProgress(trail, progress)` in `engine/progress.js`. It is tested so that every landmark appears in exactly one region, in travel order, with exactly one "next".
- Nothing was lost. Landmark distances, the next landmark and region progress are all still visible, but there is one fewer card on the page.

### 10.2 Badge visibility (implemented)
- **Locked badges** show only a one-colour silhouette and the word "Locked". Screen readers hear "Not yet earned. Keep hiking to discover it." The title and description stay hidden.
- **Earned badges** show the full-colour art, title, description and earned date.
- The "next badge" hint gives the miles to go but no longer names the badge. The celebration after logging is now the reveal.

### 10.3 High-value enhancement recommendations (not yet built)
1. **Landmark postcard at Camp.** When the expedition passes a landmark, Camp shows a one-time postcard card with an original illustration, two lines of trail lore and who carried the group there. It reuses the trail register data, and no schema change is needed.
2. **Wildlife field guide per hiker.** Show the species each hiker has spotted, with silhouettes for unseen ones (the same mystery pattern as badges). Each species gets one short, accurate natural-history fact. This makes Wildlife Spotting feel collectible and educational.
3. **Weekly expedition goal on the Camp banner.** A shared, forgiving target (for example "60 group miles this week"), shown as a campfire that grows. It is computed from existing activity data.
4. **Region arrival moments.** When the expedition crosses into a new state or region, the next Camp visit shows that region's blurb as a short welcome. It is cheap because the region data already exists.

Not recommended: **Donner Party storytelling**, because the owner earlier asked for "no Donner Party comparisons". The Donner Party is also unrelated to the Appalachian Trail. **Oregon Trail education** likewise doesn't fit the AT setting. The Oregon flavour stays in the playful badge art only. Revisit either only on explicit request.

### 10.4 External data / API assessment
| Source | Fit | Recommendation |
|---|---|---|
| NPS Data API (park code `appa`: places, articles, multimedia) | Good for landmark facts and photos | **Curate once, offline.** Copy a few facts or public-domain photos per landmark into static data in `trail/`, with credits. Do **not** call it from the browser: it needs an API key (which would be exposed), and it adds a runtime dependency and rate limits. Check each image's credit and rights. |
| NPS / ATC published AT centerline GIS | Could make the map route more accurate | Optional one-time import, simplified to a few hundred points. Document the source in `docs/`. It is low priority, because the current route already reads well. |
| Oregon National Historic Trail maps/GIS | Not applicable | Skip. That is a different trail. |
| Historical photographs (general) | High charm, but rights vary | Only use public-domain sources, with attribution. Prefer the original pixel illustrations. |

None of these needs new infrastructure. The static-data approach keeps the site free, fast and offline-tolerant.

### 10.5 Prioritized plan
1. ✅ Journey progress consolidation and locked-badge mystery (this sprint)
2. Landmark postcard at Camp (small, high delight)
3. Wildlife field guide with silhouettes
4. Weekly expedition goal on the Camp banner
5. Curated NPS landmark facts/photos as static data (one-time, with credits)
6. Optional: AT centerline geometry import

## 11. Historical content and Trail Dispatches (refinement sprint)

### 11.1 Changes (implemented)
- **Trail:** removed the "Coming up" card. It duplicated the hero's "Next" stat and the map's next-landmark panel.
- **Previous / Current / Next** strip directly under the map, built from `journeyWindow()` in `engine/progress.js`:
  - It shows where we've been, the most recent landmark reached (and how far past it we are), and where we're heading.
  - Each stop opens that landmark's details on the map.
- **Landmark stories:**
  - Every landmark's map panel now has **Why it matters** (history), **Nature notes** and **Did you know?**, and optional **Kevin's Trail Notes**, a photo and a "Learn more" official link.
  - The data lives in `trail/landmark-stories.js`, which is plain data and tested.
- **Camp:** Trail Dispatches are now the first section, above the camp scene. The shelter in the scene points to them.

### 11.2 Landmark content proposal
Each landmark is a small destination with up to five short layers: history, nature, a fun fact, Kevin's personal note, and an official link.
- Keep each layer to one or two sentences, so the panel stays readable on a phone.
- Prefer accuracy over volume, and hedge uncertain claims.
- Oregon Trail facts don't apply to Appalachian Trail landmarks, so the history layer covers AT history instead: MacKaye, the CCC, the TVA, John Brown's raid, Baxter's "forever wild" gift. Donner Party content stays out, at the owner's request.

### 11.3 Historical photo integration proposal
- **Do:** curate one image per major landmark, once, as a local file with credit and licence (see `docs/trail-data-sources.md`). Use public-domain NPS or Library of Congress images, or the hikers' own photos. Lazy-load them. A test checks for alt text and credit.
- **Don't:** hot-link or call the NPS API at runtime. It needs an API key (which would be exposed in a static site), it adds rate limits and outages, and the image rights vary per item.
- Start with the 6–8 best-known landmarks: Springer, Clingmans Dome, McAfee Knob, Harpers Ferry, Bear Mountain, Mount Washington and Katahdin. If no suitable image exists, the original pixel illustrations remain the fallback.

### 11.4 Trail Dispatch architecture assessment
- **Data-driven, not hardcoded.** Dispatches are rows in Supabase (`at_dispatches`).
- **Who can write them:** organizers (`at_organizers`). This is enforced by RLS.
- **What a dispatch has:** a title, a Markdown body (safe renderer, no HTML), pinning, "Everyone" or crew visibility, and scheduling (a future `published_at`).
- **How to add one:** Kevin taps **Write a dispatch** at Camp and posts from his phone, with no deploy. The Supabase Table Editor is a backup route.
- **Why not a JSON file:** a JSON/JS file would need a GitHub commit for every update. That is fine for evergreen landmark notes, but worse for news. So we keep two channels:
  - **Dispatches (Supabase):** news, milestones, encouragement and stories. Timely, posted from the phone.
  - **Landmark notes (`landmark-stories.js` → `kevin`):** evergreen commentary tied to a place. Edited on GitHub (pencil icon), live in about a minute.

### 11.5 Dispatch authoring recommendations
- Open with a short, specific title ("We crossed into Virginia!"). The first dispatch is also the Trail page's "Message from Camp".
- Use **pinning** for the one message everyone should see this week, and unpin it afterwards.
- Schedule celebrations ahead of time by setting `published_at` in the Table Editor.
- Keep personal details out: "Everyone" dispatches are readable by any visitor.
- Possible later addition (needs a small migration): an optional `landmark_id` on a dispatch, so a dispatch can also show inside that landmark's panel. Only build it if Kevin asks for it.

### 11.6 Additional high-value recommendations
1. **Landmark postcard at Camp** when the group passes a landmark. It reuses the new story text ("Why it matters"), with no new data.
2. **Wildlife field guide**: species silhouettes until spotted, each with one nature fact. This matches the landmark "Nature notes" voice.
3. **Region welcome card** when entering a new state or region, using the region blurb plus that region's best "Did you know?".
4. **Curated photos** for 6–8 landmarks (see 11.3).
5. **"Trail quiz" from stories**: one optional multiple-choice question per passed landmark at Camp, built from existing facts. Build it only if the hikers want it.

## 12. Wildlife Spotting enhancement sprint

### 12.1 Assessment of the current game

| Area | Before this sprint | Verdict |
| --- | --- | --- |
| Fun factor | Strong: the restored hunt pacing (30 s, 12 frames, 4-frame film wind, cooldown), startle and herd behaviour, weather and pop-ups feel good. | Keep as is |
| Replayability | Weak: 9 species, so the same few animals every outing. | Main gap |
| Progression | Score only (photo board). Nothing remembered which animals you had seen. | Main gap |
| Difficulty | Well tuned: skittish vs calm species, speeds, film winding. Reduced motion slows wildlife. | Keep |
| Educational value | Low: names only. | Add short facts |
| Collection | None (runs stored score/hits only). | Needs a small schema addition |
| Long-term engagement | One "first wildlife" badge. | Add collection badges and rare moments |

### 12.2 Recommendation: enhance, don't overhaul

The core loop is the strongest part of the game and the original Oregon Trail DLE feel is what people enjoy. Rebuilding would risk that for no gain. Everything missing (variety, collection, surprise, learning) can be layered on as **data plus one small table change**, without touching the controls, pacing or renderer.

### 12.3 Implemented

- **Variety: 9 → 37 species.**
  - Mammals: + beaver, coyote, river otter.
  - Birds: turkey, grouse and wood duck, plus bald eagle, red-tailed hawk, blue jay, eastern meadowlark, barred owl and common loon.
  - Insects: monarch, green darner, firefly, bumble bee, Carolina mantis and six-spotted tiger beetle.
  - Reptiles and amphibians: eastern box turtle, red eft and wood frog.
  - New behaviours: soaring and flitting flyers, darting dragonflies, creeping turtles and efts.
  - Each species has an original pixel sprite, a one-line fact and a range.
- **Regional ecosystems.** Every habitat now has its own mix, plus a habitat fact:
  - Fireflies and elk on the Smokies balds.
  - Box turtles and mantises in the south and Mid-Atlantic.
  - The hawk flyway on Pennsylvania's ridges.
  - Beavers, otters and eagles at the lakes and rivers.
  - Loons, moose and lynx in Maine.
- **Seasons.** Insects, frogs, turtles and salamanders are four times scarcer from November to March. Snowy owls come only in winter.
- **Rare finds** (150 pts, "RARE!" pop-up and an announcement):
  - white (piebald) deer;
  - eastern hellbender;
  - golden-winged warbler;
  - gray petaltail;
  - snowy owl;
  - Canada lynx.
  
  About 1 outing in 20 has one. Each habitat lists only its authentic rare species.
- **Legends** (200 pts, about 1 outing in 250): Bigfoot, Jackalope, the Snallygaster (Maryland's South Mountain) and the Wampus cat (southern mountains). The White Buffalo was left out because it isn't part of AT lore.
- **Field guide** on the Wildlife page:
  - Collapsible sections by group, with "N of M" counts.
  - Undiscovered species are silhouettes with a "Look in: …" hint built from habitat weights.
  - Found species reveal colour art, fact, range, first photographed (date and hiker), habitats and photo count.
  - Legends stay hidden behind a campfire rumour until found.
  - The guide can be filtered to one hiker.
  - A "New in the field guide!" message appears on a first sighting.
- **Wildlife badges** (per hiker, pixel art, locked silhouettes):
  - Trail Photographer: 10 species.
  - Bird Watcher: 5 birds.
  - Butterfly Collector: 4 insects.
  - Trail Naturalist: 4 habitats.
  - Wildlife Expert: 20 species.
  - Rare Find.
  - Complete Field Guide.
  - Trail Legend.
  
  The existing "First Wildlife Discovery" remains the "first photograph" badge. Camp's hiker panel shows "Species photographed".
- **Data.** Migration `20261106000000_at_field_guide.sql`:
  - New columns: `species text[]` and `habitat` on runs.
  - Check constraints, plus a trigger that dedupes and sorts species.
  - Server-side aggregation through `at_field_guide()`, with RLS tests.
  - The client never downloads raw runs. It also saves without species if the migration isn't applied yet.

### 12.4 Regional wildlife roadmap (future, data-only)

1. **Spring warblers** in the Mid-Atlantic in May. Example: a "warbler wave" weather variant that boosts songbirds.
2. **Fall hawk watch.** Boost raptors on rocky-ridges in September and October (Hawk Mountain).
3. **Salamander nights.** A rainy-night variant in the southern habitats with more efts and salamanders.
4. **Northern bog species.** Spruce grouse and gray jay in north-woods. These need new sprites but fit under the 40-species cap.

### 12.5 Prioritized plan (status)

1. ✅ Species, regional and seasonal expansion (data only).
2. ✅ Field guide persistence plus the aggregate RPC.
3. ✅ Field guide UI.
4. ✅ Rare and legendary encounters.
5. ✅ Wildlife badges.
6. ⏭ Optional: post a Trail Dispatch automatically when someone photographs a rare or legendary find.
7. ⏭ Optional: seasonal events (12.4).


## 13. Wildlife Spotting refinement: collect them all

### 13.1 Review

The game loop was strong, but scoring rewarded photographing the same deer again and again, and up to six animals on screen made identification hard. The fix is to make scoring follow the field guide. No overhaul was needed.

### 13.2 Implemented

- **Unique photograph scoring.** Each species scores once per outing; later photos of it score 0 and show "SEEN". A species not yet in the field guide scores double (`DISCOVERY_MULTIPLIER`). "Known" means the chosen spotter's own guide, or the whole expedition's if nobody is chosen. If the field-guide migration isn't applied, there is no bonus.
- **Collection progress.** The field guide shows "N to go" and a **Trail sections** list with one bar per section. A section is complete when every local species has been photographed *in that section*. The game's opening line says how many local species are still missing.
- **Badges.** There are now 11 wildlife badges:
  - **Insect Explorer** (renamed from Butterfly Collector).
  - **Mammal Tracker** (6 mammals).
  - **Creek Explorer** (3 reptiles or amphibians).
  - **Regional Naturalist** (complete one trail section).
  - **Rare Species Finder** (renamed).
  - **Master Naturalist**: photograph every species. It is the only prestige badge, with a gold double-ring medallion, laurel art, a gold card and a double-width tile.
  
  "First Photograph" was not added because "First Wildlife Discovery" already covers it.
- **Density.** A spawn every 1.8 s (was 1.1), at most 4 animals in view (was 6), and groups of 2–3 at 35% (was 50%).

### 13.3 Next (optional, small)

1. Post a Trail Dispatch automatically when someone photographs a rare or legendary find.
2. A "species of the week" that scores a small bonus.
3. A one-question field-guide quiz on a newly found species.
4. Seasonal events (12.4).

## 14. Historical landmarks and project context

### 14.1 Findings

- The landmark detail panel already had an unused `photo` slot, so real photos needed no redesign.
- The agent sandbox cannot reach Wikimedia, NPS or web search, so no licence could be verified here. Rather than ship unverified images, photos are fetched by a reviewed GitHub Action (`landmark-photos.yml`, see `docs/trail-data-sources.md`). Until that runs, the pixel art stays.
- The hiker roster is database-driven, so adding hikers took one migration. Camp seated at most 10 campers, so it now seats 12.

### 14.2 Implemented

- Real, credited, self-hosted landmark photos:
  - `LANDMARK_PHOTOS` data, plus a story-level override;
  - the caption carries the credit, licence link and source link;
  - the pixel art is the fallback;
  - a licence filter with tests;
  - a manual workflow that opens a PR.
- Roster migration `20261107000000_at_roster_expansion.sql` with eleven hikers in the owner's order. David and Kevin keep their ids and history.
- A quiet footer credit: "Created by David · project design & direction".
- AGENTS.md rewritten as the onboarding document.

### 14.3 Recommendations (small, high value)

1. **Landmark arrival postcard.** When the expedition passes a landmark, show a one-time card at Camp with its photo, credit and Kevin's note.
2. **Kevin's notes for every landmark.** Many landmarks still have none. A short note per landmark adds the most personality for the least effort.
3. **Historical "then and now".** Where Commons has a public-domain historical photo (Fontana Dam, Harpers Ferry, Clingmans Dome tower), add it as a second photo.
4. **Hiker spotlight.** A weekly line at Camp naming one hiker's recent contribution, rotating so everyone gets a turn. Encouraging, not ranked.
5. **Maintainability.** Keep content in data files the owner can edit on GitHub. Prefer workflows that open reviewable PRs over runtime APIs.

## 15. UX polish and wildlife behaviour

### 15.1 Findings

- Heading capitalization was mixed ("The expedition", "Field guide", "Journey progress" next to "Wildlife Spotting", "Trail Dispatches").
- On iPad/iOS Safari, native date inputs keep an intrinsic width and their own chrome, so Date looked wider than the other fields.
- History listed only this device's activities, and the "About this device" card was clutter for most people.
- Wildlife moved with one shared model; per-species tuning only changed speed and pauses. Everything reacted to the camera the same way.

### 15.2 Implemented

- **Title Case** for every page title, card and section heading, `<summary>` title and field-guide group; buttons, labels and body text stay sentence case. A static test enforces it.
- **Log Activity form:** every `.field` control fills its column with one shared height; the date input's WebKit chrome is removed. Measured equal at 390px, 820px (iPad) and desktop in Chromium.
- **History:** the device card is gone (organizer setup now finds the `user_id` on an activity row; see `docs/deployment.md` §2b). A new **Expedition Journal** (`engine/journal.js`) records landmarks, group milestones, first photo of each species (rare and legendary flagged), field-guide milestones, completed trail sections and every badge unlock, newest first, from data already loaded. "Your Activities" follows.
- **Behaviour classes:** 14 classes (grazer, skittish, predator, large mammal, ground bird, songbird, soaring bird, owl, swimmer, fluttering insect, darting insect, hovering insect, slow crawler, trail legend). Deer freeze head-up and then bound away fast; bears and moose carry on along their path; rabbits zigzag; ground birds and songbirds flush and fly off; butterflies wander on bobbing paths; dragonflies hover and dart; bees hover in place. The field guide explains each as "How it moves". No scoring, density or schema changes.

### 15.3 Recommendations (small, high value)

1. **Behaviour hints in "where to look".** Locked guide entries could add the class habit ("Look for something that freezes, head up…"). This is educational and costs no new data.
2. **Journal filter by hiker.** Reuse the field guide's "Show" select on the Expedition Journal.
3. **Auto-dispatch for rare and legendary finds.** The journal already records them; a Camp highlight could reuse the same entry.
4. **Species-specific habit overrides.** A few iconic species (wild turkey's strut, loon's dive) could override the class `habit` text without new movement code.

## 16. Badges, data cleanup and fresh start

### 16.1 Species badges

- One badge per species (33, plus the 4 Trail Legends as secret bonus badges), from `speciesBadges()` in `engine/field-guide.js`. A badge is earned with the hiker's own first photo of that species and dated by it; repeat photos add nothing, matching "build a field guide" scoring.
- Art is the species' own pixel sprite in a medallion. Locked badges are silhouettes with "???", like the field guide. Rare species get a teal ring; legends a gold medallion.
- Shown at Camp in a collapsible **Species Badges (N of 33)** grid. New ones are celebrated after an outing in one line; the hiker's journey and the Expedition Journal group them per day, and the journal skips species already told by the expedition's "First photo" entry.

### 16.2 Camp progress bar

- **Finding:** the green bar under each hiker's stats was `nextMileBadge().percent`: miles so far ÷ miles for the *next* mileage badge, measured from 0, with only an aria label. It ignored the badges and species listed beside it, and jumped back when a badge was earned, so it looked disconnected. (The maths was correct for what it measured.)
- **Change:** a visibly labelled **Badge Collection** bar = (achievement badges earned + species badges earned) ÷ (24 + 33), with "X of 57 badges · Z%". The stats now read "Achievement badges X of 24" and "Species badges X of 33", so the bar is exactly the sum of what is shown. Legends are a bonus, so 100% is reachable. Mileage stays as text ("38 mi to the next mileage badge"), and its `percent` now runs from the previous mileage badge.

### 16.3 Database audit

Method: every table, view, function and trigger in the migrations, cross-checked against every `.from()`/`.rpc()` in `data/layer.js` (the only file allowed to call Supabase, test-enforced), the workflows and scripts. GitHub code search found no other repository using this Supabase project.

| Object | Status | Evidence | Action |
|---|---|---|---|
| `at_hikers`, `at_activities`, `at_conversion_rules`, `at_expedition_runs`, `at_dispatches`, `at_organizers` | Live | Used by the layer or by live RPCs/policies | Kept |
| RPCs `at_expedition_hikers`, `at_expedition_marks`, `at_field_guide`, `at_my_summary`, `at_is_organizer`, `at_is_expedition_member` | Live | Called by the layer or policies | Kept |
| `at_challenges`, `at_challenge_members` | Dead since 20261105 (open expedition) | No layer call; the UI for crews was removed | Dropped |
| `at_profiles`, `at_ensure_profile`, `at_handle_new_user` + auth trigger | Dead | Layer's `profile` API was unused; trigger wrote a row on every anonymous sign-in | Dropped (trigger falls back to a no-op if not permitted) |
| `at_create/join/leave_challenge`, `at_get_invite_code`, `at_leaderboard`, `at_challenge_summary`, `at_camp_supplies` | Dead | Photo board now from `at_expedition_hikers.wildlife_score` | Dropped |
| `at_dispatches.challenge_id` ("crew only") | Dead | No crews to address | Crew-only rows archived, column dropped, read policy simplified |
| `community_progress`, `mileage_log`, `add_community_*` (Oregon Trail DLE) | Legacy | Only the pre-AT game used them; the RPCs were callable with the public key | Tables moved to private `archive`; functions dropped |

Roadmap check: the only items that needed challenges (crew weekly challenge, crew leaderboard, opt-in profile feed) were obsoleted by the open expedition. Future weekly goals or a "species of the week" key on week and hiker, so nothing planned needs the removed tables.

Dead code removed with them: `layer.profile`, `layer.challenges`, `expeditions.supplies`, their mappers, the dispatch "Who can read it" select and "crew only" byline, `CHALLENGE_KEY` in `localStorage`.

Safety: everything is in one idempotent migration (`20261108000000_at_cleanup.sql`), applied after the frontend that stops using it. `supabase/tests/upgrade.test.sql` builds a database with the legacy schema and real-looking data, runs the cleanup twice and checks what was kept, archived and dropped. `rls.test.sql` asserts every public table is `at_*`.

### 16.4 Fresh start

`supabase/expedition-reset.sql` (not a migration) backs up and clears `at_activities` and `at_expedition_runs` in one transaction. Everything else that looks like progress is computed from those two tables, so this is the whole reset. Hikers, conversion rules, dispatches, organizers and all app-defined content (trail, landmarks, species, badges) are untouched. `supabase/tests/reset.test.sql` checks the reset, the backups, that everything can be earned again (logging, marks, field guide, first dates, daily outing caps), and the documented undo.

> Since §17 the reset keeps wildlife observations, so collections survive it.

## 17. Wildlife discovery persistence

**Finding.** `20261106000000_at_field_guide.sql` was never applied to the live project. The client fell back (fail-soft) to saving outings with score, hits and shots only, so no species was ever stored and Camp's species badges could not unlock. Those early outings cannot be recovered.

**Goal.** Each hiker builds a permanent field guide: choose a hiker, photograph animals, and the finds are saved for good, on every device and across expeditions.

### 17.1 Data model (`20261109000000_at_wildlife_discoveries.sql`)

- `at_expedition_runs` gains `species`, `habitat` and `photos` (photos per species). A trigger dedupes and sorts species (summing photos) and refuses more photos than hits.
- `at_expeditions`: one row per expedition, exactly one open (unique partial index). Seeded as "Expedition 1".
- `at_wildlife_observations`: hiker, species, outing (`run_id`), expedition, habitat, photos, date, `is_first`. Filled only by an AFTER INSERT trigger on runs, so the 10-a-day cap and every check still apply; a per-hiker advisory lock plus a unique partial index on `(hiker_id, species) where is_first` give exactly one first discovery. `run_id`/`user_id` become null if the run or device is deleted, so finds survive. No API grants; reads go through `at_field_guide()`.
- `at_wildlife_discoveries`: owner-only view (hiker, species, first/last seen, outings, photos) for the SQL editor and future statistics pages. Counts are computed, never stored, so they cannot drift.
- `at_field_guide()` now reads observations and adds `photos`, `last_seen` and `this_expedition`.
- **No `animals` table.** The species catalogue (sprites, behaviour, habitats, rarity, facts) already lives in `expedition-themes.js` and is test-checked; copying it into the database would create two sources of truth. **No `best_score`**: points are fixed by rarity, so it would add nothing.

### 17.2 Client

- Wildlife Spotting requires a hiker before the round starts (friendly message, focus moves to the picker). The spotter is fixed for the round.
- `layer.expeditions.record` sends species and photos per species; on a database without the new columns it falls back step by step and reports `discoveriesSaved: false`.
- Camp's Species Badges: unlocked badges show the find date and photo count; locked badges show "???" and where to look. Collector stats above the grid: species found (with %), rare species, photos taken, most photographed, recent finds.
- The Expedition Journal tells only the current expedition's wildlife stories (`wildlifeSince`); collections are lifetime.

### 17.3 Tests

`rls.test.sql` (observations, first discovery, isolation between hikers, no API access, photos validation), `reset.test.sql` (observations survive, new expedition opens), `upgrade.test.sql` and a new `wildlife-upgrade.test.sql` (a database with 20261106 applied and existing species is backfilled once, idempotently). JS tests for the payload, mapping, collector stats, hints and journal filtering.

### 17.4 Next

Regional field guides and expedition wildlife reports (`this_expedition`, `habitat`), rare-find dispatches, community leaderboards from `at_wildlife_discoveries`, and sighting timelines from observations.