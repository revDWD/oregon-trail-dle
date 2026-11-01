# Agent guide

Friends-based Appalachian Trail fitness game. Static site on GitHub Pages + Supabase (Auth, Postgres, RLS). Read `docs/architecture.md` first.

## Rules
- No build step; native ES modules; no runtime npm dependencies and no third-party CDN scripts. `@supabase/supabase-js` is vendored (update its checksum in `assets/vendor/supabase-js/README.md` when upgrading).
- There is no login UI by design: `auth.ensureSession()` uses Supabase anonymous sign-in. Do not add email/password flows unless asked.
- Never commit secrets. Only the public project URL and publishable key belong in `assets/js/at/config.js`. Never use a service-role/secret key in the browser.
- Supabase is the source of truth. `localStorage` may only hold harmless preferences. All Supabase calls live in `assets/js/at/data/layer.js`.
- Credited miles and conversion factors are computed by the database trigger; the client never sets `user_id`, `credited_miles` or `conversion_factor`. Keep `engine/activities.js` rules in sync with the SQL (tests enforce this).
- Any schema change goes in a new idempotent migration and must pass `bash supabase/tests/run-rls-tests.sh`. Security failures are blocking bugs.
- Render text with `textContent`/the `h()` helper only: no `innerHTML`.
- Trail data stays in `assets/js/at/trail/` (data only); logic stays in `engine/` (pure, DOM-free).
- Keep the game encouraging: no streak loss messaging, no rewards that scale with speed or daily volume, per-activity caps stay.
- Accessibility is required: keyboard use, visible focus, 44px targets, labelled fields, `aria-live` status, reduced motion, WCAG AA contrast.
- `assets/js/at/ui/us-states.js` is a generated single-line file: do not view or edit it.

## Testing
`npm test` runs everything (Node test runner). The RLS suite needs PostgreSQL binaries and is skipped with a notice otherwise; CI installs them. Add tests with every feature.
