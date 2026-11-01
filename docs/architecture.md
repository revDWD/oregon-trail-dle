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
| Oregon-only | wagon/camp scene, hunting minigame, Donner Party, food, settlers | **Removed** at Feature 5 (Oregon final state is preserved by the git tag `oregon-trail-final`). |
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

See `docs/deployment.md`. In short: Supabase project URL, publishable (anon) key, applying the migrations, Auth Site URL and redirect URLs, SMTP decision, DNS records.

## 6. Feature plan and acceptance criteria

1. **Repository analysis + architecture** — this document. *Done when* findings, reuse decisions, schema, plan and required configuration are written and reviewed.
2. **Trail data + progress engine** — Appalachian Trail data (miles, direction, landmarks with coordinates, milestones, documented sources) and pure functions for position, percent, passed/next landmark, remaining distance, direction reversal. *Done when* unit tests cover boundaries (0, exactly on a landmark, finish, overshoot, both directions) and data-integrity checks (sorted, unique, within length, coordinates in range).
3. **Activity rules** — validation and conversion mirrored from SQL. *Done when* tests cover each type, bounds, date rules, rounding, rule versioning (old activities keep their factor).
4. **Supabase schema + RLS** — migrations and SQL tests against a real Postgres. *Done when* tests prove user B cannot select/insert/update/delete user A's activities, cannot forge `user_id` or `credited_miles`, anon gets nothing, non-members cannot read a challenge, leaderboard returns aggregates only.
5. **Auth + data layer** — sign up/in/out, session, profile, activity CRUD behind `data/`. *Done when* tests with an injected fake client cover auth boundaries (signed-out calls rejected), error mapping and CRUD.
6. **Personal dashboard + map** — logging form, history with edit/delete, progress, map, landmarks. Remove the Oregon UI/code/tests here.
7. **Challenges + leaderboard** — create/join by code, leaderboard, group total.
8. **Game mechanics** — landmark badges, milestones, trivia, weekly goal, forgiving streaks, cooperative milestones; all with safety caps and no punitive loss states.
9. **Accessibility/mobile polish + security review** — Playwright checks at 375 px, keyboard, reduced motion; contrast check; secret scan; OWASP review.
10. **Deployment** — `CNAME`, Pages custom domain + HTTPS, CI workflow, DNS and Supabase URL docs.

## 7. Safety design

Per-activity distance caps, a bounded back-dating window, no "streak lost" messaging (streaks forgive one rest day per week), no rewards that scale with speed or daily volume, and rest-friendly copy. Leaderboard emphasises the group total.
