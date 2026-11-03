# AT Fitness Tracker

A friends-based fitness game: log walks, hikes, runs and rides, and turn them into progress along the Appalachian Trail. Live site: https://atfitnesstracker.abbydavid.com

- **Interactive trail map**: zoom/pan/pinch, regional sections, mile posts, landmark detail cards with original illustrations, crew-mates and the crew camp
- **Trail Dispatches**: the organizer's announcements ("Message from Camp" on the home page, full archive at Camp), with simple formatting
- **Camp**: a pixel-art camp that grows with the crew's miles, with crew stats and your settings
- **Expeditions**: the camp hunt minigame (restored from the Oregon version) and wildlife spotting. Results stock the camp and never add trail miles
- Individual progress, landmarks, trivia and badges
- Friends challenges with a leaderboard computed in Postgres (not in the browser)
- Forgiving weekly goals and activity rhythm: encouraging, never punitive
- Static frontend (GitHub Pages) + Supabase Auth/Postgres with Row Level Security
- No login: each browser gets a Supabase anonymous user automatically (enable anonymous sign-ins in Supabase)
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
| `assets/js/at/engine/` | Pure logic: progress, activity validation/conversion, game mechanics, camp, expedition rules and themes, Markdown |
| `assets/js/at/data/` | The only code that talks to Supabase |
| `assets/js/at/ui/` | DOM helpers, map, camp scene, expedition canvas, illustrations, views, app shell |
| `supabase/migrations/` | Schema, RLS, RPCs |
| `supabase/tests/` | RLS tests run against real PostgreSQL |
| `tests/at/` | Node tests |
| `docs/` | Architecture, Phase 2 review and roadmap, trail data sources, deployment |

## Pages

| Tab | What it is |
|---|---|
| Trail | "Message from Camp", progress, the interactive map, this week, landmarks |
| Log / History | Add, edit and delete activities |
| Crew | Create or join a challenge, leaderboard, group milestones |
| Camp | Camp scene, crew stats, the Trail Dispatches archive (organizers can post), trail name and weekly goal |
| Hunt | Expedition minigame: camp hunt or wildlife spotting |
| Badges | Earned and upcoming badges |

## Setup and deployment

See `docs/deployment.md` for the Supabase values, the SQL migrations (run **both**, in order), how to make the organizer (Kevin) able to post dispatches, Auth URLs, DNS and Pages. See `docs/architecture.md` for the design and `docs/review-and-roadmap.md` for the Phase 2 review and what's next.

Updating the site: merge to `main` and GitHub Pages redeploys in a minute or two. Database changes are new files in `supabase/migrations/` that are pasted into the Supabase SQL Editor.

The previous Oregon Trail version is preserved at the git tag `oregon-trail-final`.
