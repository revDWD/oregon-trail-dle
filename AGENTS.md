# Agent guide

Friends-based Appalachian Trail fitness game for a hiking group. Static site on GitHub Pages (https://atfitnesstracker.abbydavid.com, repo `revDWD/oregon-trail-dle`) + Supabase project `eojzvyyhzdapwgsrtyne` (anonymous Auth, Postgres, RLS). Read `docs/architecture.md` (design) and `docs/review-and-roadmap.md` (Phase 2 decisions and roadmap) first.

## Product context
- Purpose: motivation, accountability, friendly competition and community. Real exercise becomes trail miles. The crew progresses together along the Appalachian Trail.
- The organizer (Kevin) posts **Trail Dispatches**: encouragement, stories, milestone notes. These are the latest/pinned card on the Trail page plus the archive at Camp. Organizers are rows in `at_organizers`, added only via the SQL editor (see `docs/deployment.md`).
- Tabs: Trail, Log, History, Crew, Camp, Hunt, Badges. **There is no Profile page** (removed in Phase 2). Trail name, weekly goal and hiker ID live in the "Your spot at camp" card. Unknown routes fall back to Trail.
- **Camp** is the crew's gathering place: a pixel SVG scene driven by `engine/camp.js` (crew miles, section scenery, seasonal weather, supplies). Planned growth: activity feed, weekly challenges, journal.
- **Expeditions** (the Hunt tab): `engine/expedition.js` holds the rules, `engine/expedition-themes.js` is themes as data only (`hunt`, `wildlife`), and `ui/expedition-view.js` is the canvas. New Appalachian Trail activities (birding, foraging, scavenger hunts, clean-up) should be **new theme objects**, not new engines. Results stock the camp and **never award trail miles**.

## Rules
- No build step; native ES modules; no runtime npm dependencies and no third-party CDN scripts. `@supabase/supabase-js` is vendored (update its checksum in `assets/vendor/supabase-js/README.md` when upgrading).
- There is no login UI by design: `auth.ensureSession()` uses Supabase anonymous sign-in. Do not add email/password flows unless asked.
- Never commit secrets. Only the public project URL and publishable key belong in `assets/js/at/config.js`. Never use a service-role/secret key in the browser.
- Supabase is the source of truth. `localStorage` may only hold the selected-challenge preference (test-enforced). Other UI preferences (camp time, expedition theme, map zoom) stay in memory. All Supabase calls live in `assets/js/at/data/layer.js`.
- Credited miles and conversion factors are computed by the database trigger; the client never sets `user_id`, `credited_miles`, `conversion_factor`, `created_by` or `played_on`. Keep `engine/activities.js` rules in sync with the SQL (tests enforce this).
- Any schema change goes in a **new** idempotent migration (never edit an applied one) and must pass `bash supabase/tests/run-rls-tests.sh`, which applies every migration in order twice. The owner applies migrations by pasting them into the Supabase SQL Editor, so always give them the SQL inline. Security failures are blocking bugs.
- Render text with `textContent`/the `h()`/`svg()` helpers only: no `innerHTML` (test-enforced). Rich text goes through `engine/markdown.js` → `ui/markdown-view.js` (https links only).
- Trail data stays in `assets/js/at/trail/` (data only); logic stays in `engine/` (pure, DOM-free); `ui/map.js` keeps its view maths pure and exported for tests.
- Every view has exactly one `h1` with `data-focus` (test-enforced). The app re-renders the whole view on changes. A running expedition must be stopped on re-render (`game.stop()` in `render()`).
- Keep the game encouraging: no streak loss messaging, no rewards that scale with speed or daily volume, per-activity caps stay, minigames never add miles and are capped at 10 runs a day.
- Accessibility is required: keyboard use, visible focus, 44px targets, labelled fields, `aria-live` status, reduced motion (CSS animations off; the game runs slower), WCAG AA contrast. Anything drawn (map, camp, canvas) must also be available as text.
- `assets/js/at/ui/us-states.js` is a generated single-line file: do not view or edit it.
- Use original artwork only (no ATC logos, blazes or photos). Trail facts are approximate; see `docs/trail-data-sources.md`.

## Testing
`npm test` runs everything (Node test runner). The RLS suite needs PostgreSQL binaries and is skipped with a notice otherwise; CI installs them. Add tests with every feature. For visual checks, serve with `python3 -m http.server 8000` and use a 375px viewport. Supabase may be unreachable in sandboxes, in which case render views with synthetic state.

## Roadmap
See `docs/review-and-roadmap.md` §6–7. Next: landmark celebration screens, postcards, animated progress, weekly crew challenges, and an opt-in crew activity feed (needs a privacy-model change: members currently see aggregates only).
