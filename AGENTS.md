# Agent guide

Friends-based Appalachian Trail fitness game for a hiking group. Static site on GitHub Pages (https://atfitnesstracker.abbydavid.com, repo `revDWD/oregon-trail-dle`) + Supabase project `eojzvyyhzdapwgsrtyne` (anonymous Auth, Postgres, RLS). Read `docs/architecture.md` (design) and `docs/review-and-roadmap.md` (Phase 2 and 3 decisions and roadmap) first.

## Product context
- Purpose: motivation, accountability, friendly competition and community. Real exercise becomes trail miles. The crew progresses together along the Appalachian Trail.
- The organizer (Kevin) posts **Trail Dispatches**: encouragement, stories, milestone notes. These are the latest/pinned card on the Trail page plus the archive at Camp. Organizers are rows in `at_organizers`, added only via the SQL editor (see `docs/deployment.md`).
- Tabs (6): Trail, Log, History, Camp, Wildlife Spotting, Badges. **There is no Profile or Crew tab** (Profile removed in Phase 2, Crew in Phase 3). Trail name, weekly goal and hiker ID live in Camp's "Your spot at camp" card; starting/joining a crew, standings, invite and leave live in Camp's "Your crew" section (`crewSection` in `views.js`). Old bookmarks are aliases in `app.js`: `#/crew` opens Camp focused on "Your crew", `#/hunt` opens Wildlife Spotting. Unknown routes fall back to Trail.
- **Camp** is the crew's gathering place: a pixel SVG scene driven by `engine/camp.js` (crew miles, section scenery, seasonal weather, crew size, photo board) plus the crew standings and dispatch archive. The bear-bag line shows one bag per hiker at camp (the Oregon pantry/food is gone). Planned growth: activity feed, weekly challenges, journal.
- **Wildlife Spotting** is the original Oregon Trail DLE hunt (tag `oregon-trail-final`, `assets/js/hunt-game.js`) restored and re-themed: same 30 s / 12 frames / 4-frame "film wind" / 1.1 s winding / startle / herd / pop-up pacing and the same pixel renderer, with a camera viewfinder, AT species and per-section habitats. `engine/expedition.js` holds the rules (pure, injectable RNG), `engine/expedition-themes.js` is data only (`wildlife`: species with sprites and behaviour, habitats keyed by region `scene`, words), and `ui/expedition-view.js` is the canvas, input and sound. Future AT activities (birding, foraging, scavenger hunts, clean-up) should be **new theme objects**, not new engines. Rounds auto-save to the crew photo board when they score; empty rounds are not saved. Results **never award trail miles**. Old `hunt` rows in `at_expedition_runs` are simply ignored.

## Rules
- No build step; native ES modules; no runtime npm dependencies and no third-party CDN scripts. `@supabase/supabase-js` is vendored (update its checksum in `assets/vendor/supabase-js/README.md` when upgrading).
- There is no login UI by design: `auth.ensureSession()` uses Supabase anonymous sign-in. Do not add email/password flows unless asked.
- Never commit secrets. Only the public project URL and publishable key belong in `assets/js/at/config.js`. Never use a service-role/secret key in the browser.
- Supabase is the source of truth. `localStorage` may only hold the selected-challenge preference (test-enforced). Other UI preferences (camp time, map zoom) stay in memory. All Supabase calls live in `assets/js/at/data/layer.js`.
- Credited miles and conversion factors are computed by the database trigger; the client never sets `user_id`, `credited_miles`, `conversion_factor`, `created_by` or `played_on`. Keep `engine/activities.js` rules in sync with the SQL (tests enforce this).
- Any schema change goes in a **new** idempotent migration (never edit an applied one) and must pass `bash supabase/tests/run-rls-tests.sh`, which applies every migration in order twice. The owner applies migrations by pasting them into the Supabase SQL Editor, so always give them the SQL inline. Security failures are blocking bugs.
- Render text with `textContent`/the `h()`/`svg()` helpers only: no `innerHTML` (test-enforced). Rich text goes through `engine/markdown.js` → `ui/markdown-view.js` (https links only).
- Trail data stays in `assets/js/at/trail/` (data only); logic stays in `engine/` (pure, DOM-free); `ui/map.js` keeps its view maths pure and exported for tests.
- Every view has exactly one `h1` with `data-focus` (test-enforced). The app re-renders the whole view on changes. A running Wildlife Spotting round must be stopped on re-render (`game.stop()` in `render()`); its keyboard listeners are on `document` while a round runs and are removed in `stop()`. Background leaderboard refreshes only re-render Camp when the data changed and nobody is typing (`typing()` in `app.js`).
- Keep the game encouraging: no streak loss messaging, no rewards that scale with speed or daily volume, per-activity caps stay, minigames never add miles and are capped at 10 runs a day.
- Accessibility is required: keyboard use, visible focus, 44px targets, labelled fields, `aria-live` status, reduced motion (CSS animations off; the game runs slower), WCAG AA contrast. Anything drawn (map, camp, canvas) must also be available as text.
- `assets/js/at/ui/us-states.js` is a generated single-line file: do not view or edit it.
- Use original artwork only (no ATC logos, blazes or photos). Trail facts are approximate; see `docs/trail-data-sources.md`.

## Testing
`npm test` runs everything (Node test runner). The RLS suite needs PostgreSQL binaries and is skipped with a notice otherwise; CI installs them. Add tests with every feature. For visual checks, serve with `python3 -m http.server 8000` and use a 375px viewport. Supabase may be unreachable in sandboxes, in which case render views with synthetic state.

## Roadmap
See `docs/review-and-roadmap.md` §6–8. Next: landmark celebration screens, postcards, animated progress, weekly crew challenges, and an opt-in crew activity feed (needs a privacy-model change: members currently see aggregates only).
