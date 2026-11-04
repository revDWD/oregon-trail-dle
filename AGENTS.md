# Agent guide: AT Fitness Tracker

This is the authoritative onboarding document for agents working on this repo. Read it fully before changing anything. Deeper history and the reasons behind decisions are in `docs/review-and-roadmap.md` (§1–14, one section per sprint) and `docs/architecture.md`. Deployment is in `docs/deployment.md` and data sources in `docs/trail-data-sources.md`.

## 1. What this is and why it exists

A friends' fitness game. A small group of real people walk, hike, run and cycle in real life. Every logged mile moves **one shared expedition** northbound along the Appalachian Trail, from Springer Mountain, GA to Mount Katahdin, ME (2,198 mi). It exists for **motivation, accountability, friendly competition and community**. It is not a fitness-tracking product.

- **People**
  - **David** created the project and leads its design and direction. He is credited quietly in the site footer.
  - **Kevin** is the expedition organizer. He posts Trail Dispatches and writes "Kevin's Trail Notes".
  - **The roster** has eleven hikers: Alden, Amanda, Andrew, David, Elizabeth, Kayla, Kevin, Kelsey, Matthew, Shuva, Will.
- **Live site and services**
  - Site: https://atfitnesstracker.abbydavid.com. Static GitHub Pages, repo `revDWD/oregon-trail-dle`.
  - Supabase project `eojzvyyhzdapwgsrtyne`: anonymous Auth, Postgres, RLS.
- **Origins.** The repo began as an Oregon Trail game (preserved at git tag `oregon-trail-final`). Its spirit lives on in playful, Oregon Trail-flavoured badge art and the restored Wildlife Spotting minigame. The *setting* is the Appalachian Trail.
- **Experience goals:** "less clutter, more personality". It should feel charming, personal, educational and immersive. A cozy pixel-art trail journal, not a dashboard.

## 2. Design principles (preserve these)

1. **Select name → log activity → everything updates.**
   - No accounts UI, invite codes, join steps or participation gates.
   - Logging is the single source of truth. It drives trail progress, Camp, History, badges and the field guide.
2. **Encouraging, never punitive.**
   - No streak-loss messaging and no rewards that scale with speed or daily volume.
   - Per-activity distance caps stay.
   - Minigames never add miles and count at most 10 runs a day.
   - Never add Donner Party comparisons (owner request).
3. **Less clutter.**
   - Each page has one job. Remove duplicates rather than add cards.
   - Before adding a card, ask what it replaces.
4. **Personal.** Hikers should see themselves: their miles, badges, milestones, photos and place in Camp.
5. **Discovery.**
   - Locked badges are silhouettes with no title or text.
   - Undiscovered species show "???" plus a where-to-look hint.
   - Legends are hidden until found.
6. **Educational, curated and accurate.**
   - Short, friendly facts that hedge when unsure.
   - Mileages are approximate.
   - Sources are listed in `docs/trail-data-sources.md`.
7. **Accessible by default.**
   - Keyboard use, visible focus, 44px targets, labelled fields and `aria-live` status messages.
   - Reduced motion and WCAG AA contrast.
   - Anything drawn (map, camp, canvas) must also be available as text.
8. **Simple and maintainable.**
   - No build step and no runtime dependencies.
   - Data-only content files that the owner can edit on GitHub.
   - Avoid new systems when a data entry will do.

## 3. Architecture

- **Static front end.** Native ES modules, no bundler.
  - `index.html` loads the vendored `@supabase/supabase-js`, `ui/us-states.js` (generated; never view or edit it) and `assets/js/at/ui/app.js`.
- **Layers, in `assets/js/at/`**
  - **`config.js`**: public Supabase URL and publishable key only.
  - **`data/`**: `layer.js` holds **all** Supabase calls; `mappers.js` converts snake_case to camelCase.
  - **`engine/`**: pure, DOM-free logic, all unit-tested.
    - `activities.js`: conversion rules, mirrored in SQL.
    - `progress.js`: position, regions, `journeyProgress`, `journeyWindow`.
    - `hikers.js`: roster totals, badges, milestones, register, timeline.
    - `game.js`: group milestones and rhythm.
    - `camp.js`: scene context, time of day, weather.
    - `expedition.js` and `expedition-themes.js`: Wildlife Spotting rules and data.
    - `field-guide.js`: field guide, region progress, wildlife badges.
    - `markdown.js`: safe dispatch text.
  - **`trail/`**: data only.
    - `appalachian-trail.js`: landmarks, route, milestones, regions.
    - `landmark-stories.js`: history, nature, did-you-know, `kevin`, `learnMore`, optional `photo`.
    - `landmark-photos.js`: **generated** photo credits.
  - **`ui/`**: DOM.
    - `app.js`: state, router, loading, actions.
    - `views.js`: one function per tab.
    - `map.js`: SVG trail map and landmark detail. Its view maths is pure and exported.
    - `camp-scene.js`: pixel SVG camp.
    - `expedition-view.js`: canvas game.
    - `badge-art.js`: 12×12 sprites.
    - `illustrations.js`: pixel landmark scenes.
    - `dom.js`: `h()` and `svg()` helpers.
- **Rendering.** The app re-renders a whole view on change.
  - Background refresh runs every 60 s (`loadExpedition(true)`). It redraws Trail or Camp only when data changed and nobody is typing or focused on a control.
  - A running Wildlife Spotting round is stopped on re-render (`game.stop()`).
- **Supabase**
  - Tables are prefixed `at_` because the project also hosts the old Oregon Trail tables.
  - Migrations live in `supabase/migrations/`, one idempotent file per change.
  - What other devices can see comes only from SECURITY DEFINER RPCs that return **aggregates**: `at_expedition_hikers`, `at_expedition_marks`, `at_field_guide` and `at_my_summary`.
  - Devices own, and alone can edit, the rows they logged. Credited miles and factors are set by triggers.
- **Tooling**
  - `scripts/landmark-photos.mjs` (with `scripts/lib/commons.mjs`) fetches openly licensed landmark photos.
  - `.github/workflows/roster-check.yml` (manual) runs `scripts/roster-check.mjs`, which lists the live roster exactly as a visitor sees it. Use it when hikers "don't show up": the roster lives in the database, so an unapplied migration is the usual cause.
  - `.github/workflows/test.yml` runs CI. `.github/workflows/landmark-photos.yml` is a manual photo refresh that opens a PR.

## 4. Key systems

- **Tabs (5):** Trail, Log Activity, Camp, Wildlife Spotting, History. History is the archive and sits last.
  - There is no Profile, Crew or Badges tab.
  - Old routes are aliases in `app.js`: `#/hunt` goes to Wildlife Spotting; `#/crew`, `#/badges` and `#/hikers` go to Camp's "The hikers". Unknown routes go to Trail.
- **Hikers**
  - `at_hikers` is the official roster. Its order is `sort_order`; retire a hiker with `active = false` (they keep their miles).
  - Every activity and photo outing is logged *for a hiker*. The dropdown remembers the last choice (`at.hiker` in localStorage).
  - Any signed-in device can log for any active hiker. Rows without a hiker don't count toward the expedition, and History asks the user to assign them.
  - Camp seats up to 12 campers (`campPeople` limit and `SPOTS` in `camp-scene.js`). Raise both together.
- **Activities**
  - Walking, hiking and running credit ×1; cycling ×0.25; other ×0.5. Each has a per-session cap.
  - The database trigger computes and stores `conversion_factor` and `credited_miles`, so changing a rule never rewrites history.
  - `engine/activities.js` must match the SQL (tests enforce this).
- **Trail tab**
  - Expedition progress card, latest pinned dispatch, and the map card.
  - The map card contains:
    - **Journey progress**: regions as parents and landmarks as children (✓ passed, ➜ next, ○ ahead).
    - A **Previous / Current / Next** strip.
    - The **landmark detail** panel: a real photo or the pixel-art scene, facts, story and Kevin's notes.
  - There is no "Coming up" card and no separate Landmarks card.
- **Landmark photos**
  - Shown in the detail panel. Comes from `landmarkStory(id).photo` (a hand-picked override) or the generated `LANDMARK_PHOTOS[id]`. Otherwise the pixel art shows, and it is also the fallback if the image fails to load.
  - Every photo is self-hosted in `assets/img/landmarks/`, openly licensed (public domain, CC0, CC BY, CC BY-SA), and captioned with credit, licence link and source link (test-enforced).
  - Refresh photos from GitHub: Actions › "Landmark photos" › Run, which opens a PR so a person reviews every picture.
- **Camp (the hub)**
  - In page order:
    1. **Trail Dispatches** (top).
    2. The pixel camp scene.
    3. "The hikers": picker plus per-hiker panel showing miles, share, week, badges, species and milestones.
    4. The trail register.
    5. The dispatch archive.
  - Time of day follows the device clock: morning 5–9, day 9–17, evening 17–21, night 21–5. There are no buttons.
  - Scenery follows the expedition's section, weather follows the season, and there is one bear bag per hiker.
- **Trail Dispatches**
  - Rows in `at_dispatches`, posted from Camp by organizers. Organizers are listed in `at_organizers` and added via the SQL editor.
  - Limited Markdown is rendered safely (https links only).
  - Evergreen landmark commentary belongs in `kevin` fields in `landmark-stories.js` instead.
- **Badges**, computed per hiker in `hikerBadges()`. Earn dates come from server-computed marks and are never stored, so renaming badge ids is safe.
  - Mileage badges: First Steps 10 → Katahdin Bound 1000.
  - "First" badges, landmark badges, milestone badges and rhythm badges.
  - 11 wildlife badges.
  - Art is original 12×12 pixel sprites: unique per badge, palette-checked by tests.
  - "Master Naturalist" (`complete-field-guide`) is the only `prestige` badge and gets a gold medallion.
- **Wildlife Spotting**
  - The restored Oregon Trail DLE hunt, re-themed as photography with the same pacing and renderer. The data-only theme is in `expedition-themes.js`; rules are in `expedition.js`.
  - Species follow the section's habitat and the season. Rare finds are rolled at 5% and legends at 0.4% per outing.
  - **Scoring:** each species scores once per outing; repeats score 0 and show "SEEN". Species new to the field guide score ×2. "New" is judged against the chosen spotter's guide, or everyone's if nobody is chosen; with no guide there is no bonus.
  - **Density:** one spawn every 1.8 s, at most 4 animals in view, groups of at most 3.
  - **Field guide:** groups, "N to go", Trail sections completion (a species counts only when photographed *in* its section), first finder, and facts.
  - Rules: at most 40 species (DB cap) and no hunting words (both test-enforced). New activities should be **new theme objects**, not new engines.

## 5. How to… (common changes)

- **Add or retire a hiker:** write a new migration, e.g. `insert into public.at_hikers (name, sort_order) values ('Name', 12) on conflict (name) do nothing;`, and give the owner the SQL inline. Every dropdown, Camp and the boards pick it up automatically.
- **Add Kevin's Trail Note or landmark facts:** edit `assets/js/at/trail/landmark-stories.js` (the owner can use the GitHub pencil icon).
- **Add a dispatch:** post it from Camp as an organizer. No code change.
- **Add landmark photos:** run the "Landmark photos" workflow, then review the PR: look at every image (searches sometimes return the wrong place) and rewrite the alt text by hand. Add rejected Commons file titles to `REJECTED` in the script and re-run with those ids. For a hand-picked photo, add `photo` to the landmark's story.
- **Add a species:** add one object in `NEW_SPECIES` plus habitat weights in `expedition-themes.js`. The guide, hints and badges pick it up.
- **Add a badge:** add a data entry plus a unique sprite in `badge-art.js`; tests check the art.
- **Change the schema:** see Rules below.

## 6. Rules

- **Code and dependencies**
  - No build step and no third-party CDN scripts. `supabase-js` is vendored; update its checksum in `assets/vendor/supabase-js/README.md` when upgrading.
  - There is no login UI by design: `auth.ensureSession()` uses anonymous sign-in.
- **Secrets and storage**
  - Never commit secrets; only the public URL and publishable key go in `config.js`.
  - Supabase is the source of truth. `localStorage` may hold only `CHALLENGE_KEY` and `HIKER_KEY` (test-enforced). All Supabase calls stay in `data/layer.js`.
  - The client never sets `user_id`, `credited_miles`, `conversion_factor`, `created_by` or `played_on`.
- **Schema changes**
  - Every change goes in a **new** idempotent migration; never edit an applied one.
  - It must pass `bash supabase/tests/run-rls-tests.sh`, which applies every migration twice.
  - The owner pastes SQL into the Supabase SQL Editor, so always give SQL as **plain text without Markdown fences** (a pasted ``` once caused a syntax error).
  - Security failures are blocking bugs.
- **Rendering and code organisation**
  - Render text with `textContent` or `h()`/`svg()` only; no `innerHTML` (test-enforced). Rich text goes through `engine/markdown.js` → `ui/markdown-view.js`.
  - Data stays in `trail/` and `expedition-themes.js`; logic stays in `engine/`; DOM stays in `ui/`.
  - Every view has exactly one `h1` with `data-focus` (test-enforced). One-time messages use `state.flash = { route, text }`.
- **Imagery:** original pixel art, or openly licensed and credited photos (public domain, CC0, CC BY, CC BY-SA). No Appalachian Trail Conservancy logos, branding or protected artwork. Trail facts are approximate.

## 7. Testing

- `npm test` runs everything (Node test runner, about 150 tests). The RLS suite needs PostgreSQL binaries and skips with a notice otherwise; CI installs them.
- Add tests with every feature.
- **Visual checks**
  - Serve with `python3 -m http.server <port>`. Use a fresh port each time, because module caching makes reused ports serve stale code.
  - Use a temporary `zz-check.html` with `<meta charset="utf-8">` that renders a view with synthetic state. Delete it afterwards.
  - Use a 375–390px viewport.
- **Sandbox limits:** Supabase, Wikimedia and NPS are unreachable from the agent sandbox. Use synthetic data and never invent URLs, credits or licences.

## 8. Fail-soft

The app must keep working when a migration hasn't been applied yet.

- `loadCamp()` swallows dispatch errors.
- A *missing RPC* (`isMissingFunction`: PGRST202/42883) sets `state.expeditionUnavailable` (no hiker field; progress comes from `at_my_summary`) or `state.fieldGuideUnavailable` (no discovery bonus; a notice shows in the guide).
- Other errors set `expeditionError` and keep the previous roster.
- Background redraws wait while focus is inside the page.
- Missing landmark photos fall back to the pixel art.

## 9. Lessons learned

- **Owner and process**
  - The owner reviews and merges PRs on GitHub and applies SQL by hand.
  - Keep replies short, give exact SQL, and say plainly when no SQL is needed.
  - Work on one feature branch per sprint, open a PR, and include the Copilot co-author trailer.
- **Refine, don't rebuild.** Every sprint so far has been a refinement. Wildlife Spotting was enhanced rather than overhauled because its pacing was already good.
- **Removals are features.** Welcome cards, crew and invite flows, the Coming Up card, day/night buttons and duplicate landmark lists were all removed on request. Don't bring them back.
- **Keep history stable.** Store what was credited, not how to recompute it (factors per row). Compute badge dates from data instead of storing them.
- **Be honest about verification.** Never claim a test or check passed without running it. Never fabricate image licences.

## 10. Future vision (see `docs/review-and-roadmap.md` §13–14)

- Landmark arrival moments: a one-time celebration card or postcard with the photo.
- Auto-dispatch when a rare species is photographed.
- A weekly "species of the week".
- Seasonal events.
- A short field-guide quiz.
- Group milestone celebrations at Camp.

Each should reuse existing data, avoid new tabs, and keep the experience calm.
