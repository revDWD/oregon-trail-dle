# AT Fitness Tracker

A friends-based fitness game: log walks, hikes, runs and rides, and turn them into progress along the Appalachian Trail. Live site: https://atfitnesstracker.abbydavid.com

- **The expedition**: one shared journey from Springer Mountain to Katahdin. Every activity is logged for an official hiker (David, Kevin, ...), and everyone's miles move the group together
- **Interactive trail map**: zoom/pan/pinch, regional sections, mile posts, landmark detail cards with original illustrations
- **Trail Dispatches**: the organizer's announcements ("Message from Camp" on the Trail page, full archive at Camp), with simple formatting
- **Camp, the hub**: a pixel-art camp that follows the device clock (morning, day, evening, night) and grows with the expedition's miles. Pick a hiker to see their miles contributed, badges, milestones and journey; the trail register shows who carried the group past each landmark
- **Per-hiker badges** with original pixel art: mileage (First Steps 10 mi up to Katahdin Bound 1,000 mi), firsts, landmarks, group milestones and a forgiving activity rhythm
- **Wildlife Spotting**: the original Oregon Trail DLE hunt minigame, restored and re-themed with a camera and Appalachian Trail wildlife. Photos are pinned to a hiker on the photo board at Camp and never add trail miles
- Per-hiker totals and badge dates are computed in Postgres (not in the browser), and each device can only see its own raw activity rows
- Static frontend (GitHub Pages) + Supabase Auth/Postgres with Row Level Security
- No login and no joining: each browser gets a Supabase anonymous user automatically. Pick your name, log an activity, and everything updates
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
| `docs/` | Architecture, Phase 2/3 reviews and roadmap, trail data sources, deployment |

## Pages

| Tab | What it is |
|---|---|
| Trail | "Message from Camp", expedition progress, the interactive map, this week by hiker, landmarks |
| Log Activity | Log an activity for a hiker (the dropdown remembers the last hiker on this device) |
| Camp | Camp scene (automatic time of day), **the hikers** (pick one: miles, badges, milestones, journey), the trail register, Trail Dispatches (organizers can post) |
| Wildlife Spotting | Photograph trail wildlife in 30 seconds with 12 frames of film; choose who's spotting; the habitat follows the expedition's section |
| History | Activities logged on this device: edit, delete, or assign a hiker to older entries |

### Hikers

The roster lives in the `at_hikers` table. In the Supabase SQL Editor:

```sql
insert into public.at_hikers (name, sort_order) values ('Sarah', 3);              -- add a hiker
update public.at_hikers set active = false where name = 'Sarah';               -- retire (their miles stay)
```

Anyone using the site can log for any hiker on the roster. A new hiker shows up at Camp (and in the Log Activity dropdown) as soon as they're added.

## Setup and deployment

See `docs/deployment.md` for the Supabase values, the SQL migrations (run them all, in order), how to make the organizer (Kevin) able to post dispatches, Auth URLs, DNS and Pages. See `docs/architecture.md` for the design and `docs/review-and-roadmap.md` for the Phase 2, 3 and 8 reviews and what's next.

Updating the site: merge to `main` and GitHub Pages redeploys in a minute or two. Database changes are new files in `supabase/migrations/` that are pasted into the Supabase SQL Editor.

Old bookmarks still work: `#/hunt` opens Wildlife Spotting; `#/crew`, `#/badges` and `#/hikers` open Camp at "The hikers". The previous Oregon Trail version is preserved at the git tag `oregon-trail-final`.
