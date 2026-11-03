# Appalachian Trail Fitness Tracker — architecture and plan

Production URL: https://ATFitnessTracker.abbydavid.com (GitHub Pages + Supabase).

This document is the Feature 1 deliverable: what the Oregon Trail codebase gave us, what is reused, what is replaced, the Supabase design, and the feature plan with acceptance criteria.

## 1. Findings from the existing repository

| Area | What exists | Decision |
|---|---|---|
| Hosting | Static multi-page site, no build, Pages legacy build from `main` at `/`, HTTPS enforced, no custom domain, no workflows | **Keep.** Add `CNAME` and a CI test workflow. |
| Stack | Vanilla ES2020 JS, zero npm dependencies, `node --test` | **Keep.** New code is native ES modules (`<script type="module">`) so pure logic is imported directly by tests (no `node:vm` sandbox). |
| Data | Anonymous community totals via `add_community_*` RPC; private journal in `localStorage`; random device id for rate limits | **Replace.** No accounts, no per-user rows, localStorage was authoritative for personal data. The new model needs Supabase Auth and per-user rows. The old tables are left untouched in the Supabase project. |
| Map | Hand-placed lon/lat route + simplified Albers projection (`projectMapPoint`) + `us-states.js` outlines, route model measures distance along the polyline | **Reuse the idea and the data.** The projection and state outlines are generalised into `assets/js/at/map.js`; route waypoints become Appalachian Trail data. |
| Milestones | `trail-config.js` landmarks/milestones, `evaluateJourney` | **Generalise** into a pure trail/progress engine independent of any trail. |
| Validation | `sanitizeStore`, strict `parseDate`, `localDateString` (no `toISOString()` for "today"), 0.1–1000 mile bounds mirrored in HTML and JS | **Reuse the principles**; bounds are now per-activity and mirrored in SQL checks. |
| DOM safety | `createElement` + `textContent` only, no `innerHTML`; `data-*` hooks | **Keep as rules** (enforced by a static test). |
| Accessibility | `:focus-visible`, `aria-live`, keyboard operable markers, `prefers-reduced-motion`, labels on inputs | **Keep and extend.** |
| CSS | One 2,760-line pixel/parchment stylesheet, Oregon-specific | **Replace** with a new AT design system; reuse the "custom properties on `:root`" convention. |
| Realtime | Hand-written Phoenix websocket client + polling fallback | **Not reused** (see §4). |
| Oregon-only | wagon/camp scene, hunting minigame, Donner Party, food, settlers | **Removed** at Feature 5 (Oregon final state is preserved by the git tag `oregon-trail-final`). Camp and the hunt were **rebuilt for the AT in Phase 2** (§8). |
| Tests | 34 passing tests: logic (vm), community client, story, static guardrails | Logic/community/story tests for removed code are deleted **with** that code. Static guardrail tests are rewritten for the new rules. |
| AGENTS.md | Forbids accounts, leaderboards and network access outside one file | **Rewritten** (the new product explicitly requires them). Retained: no secrets, `textContent` only, no third-party CDN, zero npm runtime dependencies, tests required. |

Note: `AGENTS.md` and the README refer to `revDWD/oregon-trail-dle`; the repository lives under the `revDWD` account.

## 2. Awesome Copilot assets reviewed

Cloned `github/awesome-copilot` and read these before use:

| Asset | Read | Use |
|---|---|---|
| `skills/postgresql-code-review` | yes | Checklist for the schema/RLS/function review (security definer, `search_path`, indexes, constraints). |
| `instructions/a11y.instructions.md` (WCAG 2.2 AA) | yes | Accessibility checklist for the UI and the final audit. |
| `instructions/security-and-owasp.instructions.md` | yes | Broken-access-control and secrets checklist for the security review. |
| `skills/web-design-reviewer` | yes (workflow) | Browser-based visual/responsive review at the polish step, using the Playwright tools. |
| `skills/breakdown-plan`, `create-implementation-plan` | skimmed | Overly heavy (GitHub issue hierarchies). Not used; §6 is the plan. |
| `skills/publish-to-pages` | yes | Not applicable (it converts PPTX/PDF). Pages is configured directly with `gh api`. |
| Supabase-specific skill/agent | searched | **None exists** in the repository. Supabase guidance comes from the Supabase docs. |

Nothing is "used" merely by being listed: each row says how it is applied, and the final report states what was actually applied.

## 3. Architecture

```
index.html            landing/dashboard (auth gate)
pages/*.html          log, history, leaderboard, trail, achievements (mobile-first)
assets/js/at/
  config.js           public Supabase URL + publishable key (no secrets)
  trail/              DATA ONLY: appalachian-trail.js (route, landmarks, milestones, sources)
  engine/             PURE logic, no DOM/network: activities, progress, achievements, leaderboard
  data/               ONLY place that calls Supabase: auth, activities, challenges, leaderboard
  ui/                 DOM rendering + event wiring; calls engine + data, never Supabase directly
supabase/migrations/  versioned SQL (+ tests/rls/ SQL tests run against real Postgres)
docs/                 this file, deployment guide, data sources
```

Rules: trail data is separate from UI; `engine` is pure; `ui` never imports the Supabase client; the data layer is injectable so tests use fakes. Supabase JS is vendored (pinned, with checksum) so the site keeps "no CDN / no build" — decided in Feature 3.

Authority: Postgres owns activities, challenge membership, conversion rules and credited miles. The browser may cache preferences/drafts in `localStorage` only.

## 4. Supabase schema (tables are prefixed `at_` because the project already hosts Oregon Trail tables)

- `at_profiles(id → auth.users, display_name 1–24, weekly_goal_miles, created_at)`; created by trigger on sign-up. Own row readable/editable; `display_name` of people who share a challenge with you is readable. `weekly_goal_miles` stays private.
- `at_conversion_rules(activity_type, factor, max_actual_miles, effective_from)`: read-only for clients. Initial: walking/hiking/running 1.0, cycling 0.25, other 0.5.
- `at_activities(id, user_id default auth.uid(), activity_date, activity_type, actual_miles, duration_minutes, conversion_factor, credited_miles, notes, created_at, updated_at)`. A `BEFORE INSERT/UPDATE` trigger computes `conversion_factor`/`credited_miles` from the rule effective on the activity date (clients cannot set them) and re-computes only when type, date or distance change, so later rule changes never rewrite history. RLS: select/insert/update/delete only where `user_id = auth.uid()`. Check constraints: distance bounds, date not in the future or older than 60 days, notes ≤240.
- `at_challenges(id, name, trail_id, direction, start_date, end_date, owner_id, invite_code)`: visible to members; `invite_code` is not selectable by clients (owner reads it via RPC).
- `at_challenge_members(challenge_id, user_id, role, joined_at)`: visible to co-members. No direct inserts; join/leave through RPCs.
- RPCs (security definer, fixed `search_path`, check `auth.uid()`): `at_create_challenge`, `at_join_challenge(code)`, `at_leave_challenge`, `at_get_invite_code`, `at_leaderboard(challenge)` (rank-agnostic aggregates: display name, credited miles, activity count, last active date, this week), `at_challenge_summary(challenge)` (group total for cooperative milestones).
- Achievements: **derived, not persisted** (deterministic from credited miles, landmarks and dates). Persisting would risk drift when trail data changes; revisit only if "earned on" history is wanted.
- Leaderboard shares only aggregates; other members never see activity rows, notes, types, or goals. Realtime on `at_activities` would be blocked by RLS for other users' rows, so a cooperative live view would need extra tables/broadcast. **Decision: no Realtime.** Refetch the RPC on load, on tab focus, after logging, and every 60 s while visible.

## 5. Public configuration the owner must provide

See `docs/deployment.md`. In short: Supabase project URL, publishable (anon) key, applying the migrations, enabling anonymous sign-ins (no login screen, decided 2026-11-01), DNS records.

## 6. Feature plan and acceptance criteria

1. **Repository analysis + architecture** — this document. *Done when* findings, reuse decisions, schema, plan and required configuration are written and reviewed.
2. **Trail data + progress engine** — Appalachian Trail data (miles, direction, landmarks with coordinates, milestones, documented sources) and pure functions for position, percent, passed/next landmark, remaining distance, direction reversal. *Done when* unit tests cover boundaries (0, exactly on a landmark, finish, overshoot, both directions) and data-integrity checks (sorted, unique, within length, coordinates in range).
3. **Activity rules** — validation and conversion mirrored from SQL. *Done when* tests cover each type, bounds, date rules, rounding, rule versioning (old activities keep their factor).
4. **Supabase schema + RLS** — migrations and SQL tests against a real Postgres. *Done when* tests prove user B cannot select/insert/update/delete user A's activities, cannot forge `user_id` or `credited_miles`, anon gets nothing, non-members cannot read a challenge, leaderboard returns aggregates only.
5. **Auth + data layer** — automatic anonymous session (login removed at the owner's request; RLS unchanged), profile, activity CRUD behind `data/`. *Done when* tests with an injected fake client cover auth boundaries (signed-out calls rejected), error mapping and CRUD.
6. **Personal dashboard + map** — logging form, history with edit/delete, progress, map, landmarks. Remove the Oregon UI/code/tests here.
7. **Challenges + leaderboard** — create/join by code, leaderboard, group total.
8. **Game mechanics** — landmark badges, milestones, trivia, weekly goal, forgiving streaks, cooperative milestones; all with safety caps and no punitive loss states.
9. **Accessibility/mobile polish + security review** — Playwright checks at 375 px, keyboard, reduced motion; contrast check; secret scan; OWASP review.
10. **Deployment** — `CNAME`, Pages custom domain + HTTPS, CI workflow, DNS and Supabase URL docs.

## 7. Safety design

Per-activity distance caps, a bounded back-dating window, no "streak lost" messaging (streaks forgive one rest day per week), no rewards that scale with speed or daily volume, and rest-friendly copy. Leaderboard emphasises the group total.

## 8. Phase 2: map, Camp, Expeditions, Trail Dispatches (2026-11-03)

Full review and rationale: `docs/review-and-roadmap.md`.

```
assets/js/at/
  trail/appalachian-trail.js   + regions (8 sections with scene/colour), landmark elevation + access, more shape points
  engine/progress.js           + regionAtMarker, regionsInOrder, mileMarkers, positionFor
  engine/camp.js               camp context: time of day, seasonal weather, scale, campers, celebrations
  engine/expedition.js         minigame rules (spawn/move/fire/startle/summary), injectable RNG
  engine/expedition-themes.js  themes as data (Phase 3: wildlife only; species, sprites, habitats)
  engine/markdown.js           safe Markdown subset -> tree (https links only)
  data/layer.js                + dispatches.{list,create,update,remove,isOrganizer}, expeditions.{record,supplies}
  ui/map.js                    interactive map (pure view maths exported + renderTrailMap)
  ui/camp-scene.js             pixel SVG camp; hotspots are buttons
  ui/expedition-view.js        canvas + keyboard/pointer input; returns { element, stop }
  ui/markdown-view.js          Markdown tree -> DOM nodes
  ui/illustrations.js          original SVG landmark art by kind
supabase/migrations/20261103000000_at_camp_dispatches.sql
```

- **Schema:** `at_organizers` (no API access), `at_dispatches` (published public or own-crew readable; organizer-only writes), `at_expedition_runs` (own rows; insert-only; 10/day; never touches miles), and `at_camp_supplies(challenge)` (aggregates only).
- **Fail-soft:** if the Phase 2 migration has not been applied, `loadCamp()` swallows dispatch and supplies errors, and the rest of the app works.
- **Map state** (zoom, selected landmark) lives in module memory so data refreshes don't reset it.
- **Camp** uses crew progress (the group's combined credited miles in the challenge direction) when in a challenge, otherwise personal progress.
- **Realtime is still not used.** Dispatches load with the app and after organizer edits.

## 9. Phase 3: Wildlife Spotting restored, six tabs (2026-11-04)

- **Navigation:** Trail, Log, History, Camp, Wildlife Spotting, Badges. The Crew tab is gone; its features (start/join, standings, group milestone, invite, leave) are the "Your crew" section on Camp, because Camp already follows the crew's combined miles. `app.js` keeps `ALIASES = { hunt: "wildlife", crew: "camp" }` so old links work, and `#/crew` focuses the crew heading.
- **Wildlife Spotting** replaces the two-theme Expedition page (no theme switch). It is the original `assets/js/hunt-game.js` from tag `oregon-trail-final`, ported:
  - `engine/expedition.js`: the original rules almost line for line (spawn timing, herds/flocks, per-species behaviour timers, startle radius, 4-frame magazine with 1.1 s reload, 0.28 s cooldown, 12 frames, 30 s, 400-point cap). A photographed animal is marked `snapped` and bolts off instead of being removed.
  - `engine/expedition-themes.js`: 9 AT species (cottontail to moose) with outlined pixel-part sprites and walk cycles, and 8 habitats keyed by the trail region `scene` (elk only on the southern balds, moose only in the north). The outing is local 65% of the time; cold habitats snow in winter; hardwoods turn in autumn.
  - `ui/expedition-view.js`: the original canvas renderer (seeded scenery, backdrops, tall grass drawn over animals, weather, pop-ups, flash), a camera viewfinder instead of a rifle sight, the 4-box HUD (Time / Film left / Winding / Photo points), Web Audio tones with a sound toggle, document-level keys while running, tap/click to snap.
  - Results auto-save on finish (no extra "bring it to camp" click). Rounds that score 0 are not saved, so they never use the 10-a-day allowance.
- **Camp engine:** `campScale(miles, people)` no longer takes food; `bearBags` = hikers at camp (max 6). `campContext` supplies are `{ photos }`.
- **Background refresh:** the 60 s standings poll re-renders Camp only when the data changed and nobody is typing in a form, so dispatch drafts and trail-name edits are never wiped.
- **Database:** unchanged. No migration. `at_expedition_runs.theme` already accepts `wildlife`; old `hunt` rows are ignored by the UI.


## 10. Phase 8: the hiker roster and per-hiker badges (2026-11-04)

"Less clutter, more personality." Full review: `docs/review-and-roadmap.md` §9.

```
assets/js/at/
  engine/hikers.js       MILE_BADGES, PERSONAL_MARKS, groupMarks, expeditionTotals, trailRegister,
                         hikerMilestones, hikerBadges, nextMileBadge, hikerTimeline (pure)
  ui/badge-art.js        13 original 12x12 pixel sprites -> SVG medallions (locked = greyscale)
  engine/activities.js   validateActivity({ hikers, originalDate }): hiker required when a roster exists
  engine/camp.js         timeOfDay(hour): morning/day/evening/night from the device clock
  data/layer.js          + expedition.{hikers, marks}
supabase/migrations/20261104000000_at_hikers.sql
```

- **Why a roster, not accounts:** there is no login, and devices are anonymous. The roster (`at_hikers`) names the real people. A device is just a pen they write with: it may log for any active hiker (no joining since 20261105), and still alone owns its rows. This keeps the existing "own rows only" RLS unchanged.
- **Schema:** `at_hikers` (roster, no API access) and `hiker_id` on `at_activities` / `at_expedition_runs` (the invite-code and membership tables were dropped in 20261105). The `at_check_hiker` trigger allows a hiker only for signed-in devices (42501) and only active roster hikers (23503); an unchanged hiker on an old row is always allowed.
- **Reads are aggregates only:** `at_expedition_hikers(week_start)` (per hiker: total/week miles, counts, first/last dates, distinct active dates, photo points, first wildlife date) and `at_expedition_marks(group[], personal[])` (who crossed each mile mark, and when, max 100 marks). Both are `SECURITY DEFINER` with `search_path = ''`, signed-in only. No notes, device IDs or per-activity rows leave a device.
- **Badges are derived, not stored:** mileage badges from per-hiker totals and personal marks; "Landmark Reached" and "Milestone Participation" from group marks; rhythm from active dates with one rest day allowed. They can't be lost (dates are all-time), so there's nothing punitive. New badges are celebrated once, after logging (`newlyEarned` in `app.js`).
- **Removed from the UI:** crews (join/start), "Your spot at camp" (trail name, weekly goal), the About card, the manual day/night buttons, the Badges tab, and the Trail welcome and friends cards. The challenge tables and RPCs stay in the database (dispatches can still target a crew).
- **Fail-soft:** before the migration, the roster RPCs fail with a non-network error, so `expeditionUnavailable` hides the join card and hiker field, and logging works as before.
