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
5. **Leaderboard polling vs Realtime.** This is unchanged and still correct. RLS hides other users' activity rows from Realtime, so polling the aggregate RPC every 60 s on the Crew page is simpler and leaks nothing.
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
| `at_camp_supplies(challenge)` | Pantry and photo-board totals | Returns only aggregates: your totals, plus crew totals since the challenge started. Non-members get an error. |

Decisions:

- **Expeditions never award trail miles.** Only real activity moves you on the trail. The minigame stocks the camp (food and photos), which is cosmetic and cooperative.
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
  - The bear-bag line fills from hunt results, and the photo board from wildlife spotting.
  - A celebration banner appears soon after the crew passes a landmark.
- **Interaction:** every crew member sits at camp, and recent movers arrive. The fire, shelter register, bear bags, photo board and each hiker are focusable buttons that describe themselves.
- **The page also has:**
  - "Around the fire" stats (crew miles, section, next landmark, next group milestone, pantry, photos);
  - the dispatch archive;
  - "Your spot at camp", which holds the old Profile settings.

### 5.3 Expedition minigame (Hunting restored, built to evolve)

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
| **Weekly crew challenge** (Next) | High | New table `at_weekly_challenges(challenge_id, week_start, goal_miles, title)` that organizers write. An RPC returns crew progress for the week from `at_activities`. Show it on Camp and Crew. Cooperative, with no individual ranking. | M |
| **Recent activity feed** (Next) | High | A privacy change: other members currently see aggregates only. Add an opt-in `share_activity_feed` profile flag and an RPC `at_crew_feed(challenge, limit)` that returns name, type, credited miles and date (never notes) for opted-in members. Show it at Camp as "Who rolled into camp". | M |
| **Monthly group goal** | Medium | Same table and RPC as the weekly challenge, with `period = 'month'`. | S after weekly |
| **Virtual postcards** | Medium | When a landmark is passed, unlock a postcard: the landmark art plus a short line, collectable on the Badges page. Derived from progress, so no table is needed. | S |
| **Trail journal entries** | Medium | Notes already exist on activities and are private. Add an optional "share to camp" journal table with organizer moderation. Use Markdown via the existing renderer. | M |
| **Recent-mileage leaderboard** | Medium | Already returned by `at_leaderboard` (this week). Add a "last 7 days" sort toggle on Crew. | S |
| **Longest streak / consecutive workouts** | Careful | Rhythm already exists, with forgiving rest days. Show "best rhythm" but never a "streak lost" message, to avoid encouraging unsafe daily exercise. | S |
| **Milestone notifications** | Medium | Web Push needs a service worker plus a server-side sender (an Edge Function and keys). Defer. In-app celebration covers most of the value. | L |
| **Animated progression between landmarks** | Fun | After logging, animate the hiker marker from the old position to the new one (disabled under reduced motion). Map memory already keeps the view. | S |
| **Seasonal themes** | Fun | Camp weather is already seasonal. Add seasonal decorations (fall leaves, snow) keyed off the date. | S |
| **More expedition themes** | Fun | Birding (song ID trivia), foraging (identify safe berries, with a "look, don't eat" message), scavenger hunt (find items on the map), trail clean-up (Leave No Trace). Each is a new entry in `expedition-themes.js` plus a `reward.key`, with no engine changes. | S each |
| **Personal badges** | Exists | Landmark, distance and rhythm badges are already derived. | — |
| **Group badges** | Exists | Group milestones exist on Crew. Show them as badges on the Badges page. | S |

## 7. Phased roadmap

1. **Phase 2 (this PR):** map overhaul, Profile removed, Camp, Expedition (hunt + wildlife spotting), Trail Dispatches, docs.
2. **Phase 3, celebrate and connect:** landmark celebration screens, postcards, animated progress, the weekly crew challenge and the opt-in activity feed.
3. **Phase 4, story:** shared trail journal, monthly goals, seasonal camp, more expedition themes.
4. **Phase 5, reach:** optional email upgrade for anonymous hikers (to keep progress across devices), push notifications, and an optional real AT GIS centerline for the map, after checking its licence.
