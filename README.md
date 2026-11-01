# AT Fitness Tracker

A friends-based fitness game: log walks, hikes, runs and rides, and turn them into progress along the Appalachian Trail. Live site: https://atfitnesstracker.abbydavid.com

- Individual progress, an SVG trail map, landmarks, trivia and badges
- Friends challenges with a leaderboard computed in Postgres (not in the browser)
- Forgiving weekly goals and activity rhythm: encouraging, never punitive
- Static frontend (GitHub Pages) + Supabase Auth/Postgres with Row Level Security
- Unofficial and unaffiliated with the Appalachian Trail Conservancy. Mileage is approximate (see `docs/trail-data-sources.md`).

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # Node 20+; the RLS tests also need PostgreSQL server binaries
```

No build step and no runtime npm dependencies. `@supabase/supabase-js` is vendored in `assets/vendor/`.

## Layout

| Path | Purpose |
|---|---|
| `index.html`, `assets/css/at.css` | Single-page shell and styles |
| `assets/js/at/trail/` | Trail data only (mileage, landmarks, milestones) |
| `assets/js/at/engine/` | Pure logic: progress, activity validation/conversion, game mechanics |
| `assets/js/at/data/` | The only code that talks to Supabase |
| `assets/js/at/ui/` | DOM helpers, map, views, app shell |
| `supabase/migrations/` | Schema, RLS, RPCs |
| `supabase/tests/` | RLS tests run against real PostgreSQL |
| `tests/at/` | Node tests |
| `docs/` | Architecture, trail data sources, deployment |

## Setup and deployment

See `docs/deployment.md` for the Supabase values, SQL migration, Auth URLs, DNS and Pages steps, and `docs/architecture.md` for the design.

The previous Oregon Trail version is preserved at the git tag `oregon-trail-final`.
