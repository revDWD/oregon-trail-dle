# Oregon Trail DLE

## 🌐 Live site: [revdwd.github.io/oregon-trail-dle](https://revdwd.github.io/oregon-trail-dle/)

> **About this project:** This project is an experiment in using AI to build interesting web use cases. It is a small, dependency-free static site made to see how far AI-assisted development can go with a small need: a fitness tracker with a game layer. It now uses supabase to persist community mileage as it is entered. Lots of improvements still to be made here. 

A fitness-tracker-meets-game that follows a 2,040-mile Oregon Trail. Contribute the miles you walk, run, or ride, watch the community wagon travel from Independence, Missouri, to Oregon City, Oregon, and use every 5 miles in your private journal to unlock a food-hunting minigame.

It is a static website with no server of its own. Community contributions require a configured [Supabase](https://supabase.com) project (see below). The private journal and hunting game remain on-device; without a community connection, the site shows an unavailable status and does not save new mileage as if it were a community contribution.

## Community Expedition (Supabase)

Every logged mile is also contributed to one community-wide expedition. The community total is **read from and written to Supabase only** (never `localStorage`), so it survives refreshes, closed browsers, other devices, other users, and redeploys of the site.

### Setup

1. Create a Supabase project, open **SQL editor**, and run [supabase/schema.sql](supabase/schema.sql).
2. Put the project URL and **anon/publishable** key in [assets/js/supabase-config.js](assets/js/supabase-config.js) (`window.OTDLE_SUPABASE`). This static site has no build step or environment variables; these two values are public by design and are protected by row-level security. Never use the `service_role` key.
3. Realtime is enabled by the schema (the table is added to the `supabase_realtime` publication). Nothing else is required.

### Database schema

- `community_progress` (single row, `id = 1`): `id`, `total_miles`, `total_contributions`, `created_at`, `updated_at`.
- `mileage_log` (append-only audit log): `id`, `miles_added`, `timestamp`, `source` (anonymous per-device label, not readable by the public key), `submission_id` (unique idempotency key).

**Recommendation: maintain the total directly, keep the log for audit.** Reads and realtime then touch one tiny row instead of summing an ever-growing table. The insert and the total update happen in one transaction inside the `add_community_miles` function, so they cannot drift; the commented query at the bottom of the schema rebuilds the total from the log if you ever need to reconcile.

### Policies

- Row level security is on for both tables. The public key has `select` only (and only the `id`, `miles_added`, `timestamp` columns of the log). There are no insert/update/delete policies, so direct writes are rejected.
- The only write path is the `security definer` function `add_community_miles(p_miles, p_source, p_submission_id)`: it validates 0.1-1,000 miles, ignores a repeated `submission_id` (no double counting), limits each device to 10 submissions/minute and the community to 120/minute, and locks the total row so concurrent submissions are never lost. Anonymous limits are best-effort; a determined attacker can rotate device ids.

### Workflow and realtime

1. The log form validates the miles, then calls the function (button disabled while sending; a retry reuses the same submission id). If Supabase is missing or unavailable, no mileage is saved and the form reports the problem.
2. On success the entry is also saved in your local journal (used for your personal history and the hunting minigame) and the page shows the new total from the database's reply.
3. Browsers open a Realtime websocket (`postgres_changes` on `community_progress`); other users' contributions update the total, landmark, completion %, and recent list without reloading. If Realtime is unavailable, the page polls every 30 seconds, and reconnects with backoff.
4. The home page shows the map and Community Expedition. The Journal page is deliberately personal and device-local. If Supabase is not configured or unreachable, the community card and map show an explicit status instead of presenting local miles as the global total.
5. Open the browser console to see `[community]` logs for every database read, write, realtime event, and error. Landmarks live in [assets/js/trail-config.js](assets/js/trail-config.js).

### Community food, names, journal, camp and events

- **Schema additions:** `community_progress.total_food`; `mileage_log.contributor_name` (public, sanitized, 1-24 chars, default "Traveler"), `food_added` (0-500) and `kind` (`miles` or `hunt`). Existing databases get these via the idempotent section 6 of [supabase/schema.sql](supabase/schema.sql). Writes go through `add_community_contribution(p_name, p_miles, p_food, p_source, p_submission_id)`, with the same idempotency and rate limits as before; `add_community_miles` remains for compatibility.
- **Privacy:** only the optional display name, miles/food and an anonymous device id are sent. Notes and journal history never leave the browser. Names are public.
- **Trail journal, camp scene, events:** derived in the browser from the totals and the latest 200 log rows by [assets/js/trail-story.js](assets/js/trail-story.js); nothing extra is stored. The pixel camp grows with miles and food. A historical event card appears every 250 community miles (display-only, configured in `trail-config.js`). "Most active travelers" counts only those latest 200 rows.
- **Hunt page:** a 30-second canvas hunt ([assets/js/hunt-game.js](assets/js/hunt-game.js)): WASD/arrows aim, Space/click fires. Food (capped at 400 per round) is added to community stores. The older local hunt logic in `script.js` is legacy and unused by the page.
- **Donner Party layer (Phase 3b):** a dashed second route on the map branches at Fort Bridger (Hastings Cutoff) and tracks the 1846 Donner-Reed party; a ghost marker shows where the Donner Party stood at the community's mileage. Stops, dates and per-landmark notes are static data in `trail-config.js` (`donnerParty`, `donnerNotes`); nothing is stored. A home card compares the community with the party's history. Dates are approximate where sources differ.
- **Journal tab:** the Trail Journal lives on the Journal page with filters (all, miles, hunts, landmarks, milestones, events, Donner Party). The home page no longer shows the journal, recent private entries or a Live chip.
- **Hunt polish:** animals pause, turn and vary speed, startle after misses; scenery is seeded; hits show feedback and optional WebAudio sound with a mute button.

### Verify persistence

1. Add 100 miles on **Log miles**; the console shows `DB write OK`, the Community panel shows 100.
2. Refresh: still 100 (`DB read: community_progress`). Close and reopen the browser: still 100.
3. Open a second browser (or a private window / phone) on the site: 100.
4. Add 50 there: it shows 150, and the first browser changes to 150 within a moment without reloading (`Realtime update` in its console).
5. In Supabase **Table editor**, `community_progress` shows 150 / 2 contributions and `mileage_log` has both rows.
6. Redeploy the site: the total is unchanged, because it lives in Supabase.

## How your personal data is stored

- Your personal journal (entries, hunts, food) lives in your browser's `localStorage` on the device you use; the community total does not (see above).
- Miles survive refreshes and browser restarts. They are **not** shared between devices or browsers, and clearing the site's browsing data erases them.
- If the browser blocks storage (for example some private-browsing modes), the site still works for that visit and shows a warning that miles will not be kept.
- The hunting minigame is derived from your private journal: every 5 miles recorded in that browser unlocks one hunt. Pick one of three hiding places; the animal's spot is only decided when you pick, so it's a fair 1-in-3 guess. Results, food stores, win count, and streak are saved alongside your entries. Hunting lives on its own **Hunt** page.
- The private journal is not stored in Supabase. Use **Journal → Back up your journey** to download a JSON backup and restore it in another browser or device. Mistyped local entries can be deleted from the history list.
- Damaged or hand-edited saves are sanitized on load; an unreadable save is kept under the `oregon-trail-dle:v1:unreadable` key instead of being overwritten, a console warning is logged, and the app starts a fresh journey instead of crashing.

### Persistence details

- **Where:** `localStorage` key `oregon-trail-dle:v1`. Persistence lives in one section of `assets/js/script.js` (`loadStore`, `saveStore`, `hasSave`, `clearSave`, `parseSave`).
- **Schema:** `{ "version": 1, "timestamp": "<ISO date>", "gameState": { "entries": [...], "hunts": [...] } }`. Totals, food, current landmark and statistics are derived from `gameState` and never stored.
- **Auto-save:** every action (logging miles, deleting an entry, starting or resolving a hunt, importing a backup) saves immediately in one small write, so no debounce is needed. On load the save is validated and sanitized, with defaults applied. Saves from before versioning (a bare `{ entries, hunts }`) load automatically.
- **Continue / New game:** the private journey resumes automatically when you open the site. To start over, use **Journal → New game / reset save** (confirmation required; download a backup first). This only erases local journal/game data; community contributions remain recorded online. You can also clear the site's data in your browser settings.
- **Versioning and migration:** bump `SAVE_VERSION` when the shape changes and add a `SAVE_MIGRATIONS[oldVersion]` function that upgrades the old `gameState`; loads run every migration from the save's version up to the current one before sanitizing. Adding an optional field (like `journal`) only needs a default in `sanitizeStore`.

## Trail configuration, seasons and the journey log

Everything content-like lives in [assets/js/trail-config.js](assets/js/trail-config.js) (`window.OTDLE_CONFIG`): trail length, landmarks and distances, message templates, achievements, and timed event definitions. Most updates are edits to that file, not to `script.js`.

- **Landmark milestones:** reaching a landmark records a journey-log entry and shows a dismissible celebration banner.
- **Achievements:** `{ id, name, description, metric, threshold }` where metric is `lifetimeMiles`, `seasonsCompleted`, `huntsWon`, `foodGathered` or `entriesLogged`.
- **Events:** `{ id, name, description, start, end, goalMiles }` (empty by default; the foundation counts miles dated inside the window).
- **Seasons:** finishing Oregon City records the completion and the next season starts automatically (miles 2,040+ begin Season 2, and so on). Seasons are derived from the entries, so lifetime totals and past seasons ("Season 1: completed in 87 days") are never lost. See **Journal → Seasons and journey log**.
- **No duplicate announcements:** each record has a stable key (for example `season:1:landmark:fort_kearny`) saved in the journal, so deleting and re-adding entries never re-announces it. Changing a landmark or achievement `id` makes it count as new.
- Personal progress is local to your browser; community progress is online in Supabase.

## Run it

Open `index.html` in a browser, or serve the folder with any static file server (for example `python -m http.server`). For free hosting, push the folder to GitHub Pages, Netlify, Cloudflare Pages, or similar; no build step or settings are needed.

## Tests

`npm test` runs the Node test suite, which checks game logic, the community client, page structure, and static-site guardrails. `node --check assets/js/script.js` and `node --check assets/js/community.js` check syntax.

## Navigation and data boundaries

- **Home:** community map and aggregate progress, followed by recent private journal entries.
- **Log miles:** validates and submits to the shared Supabase total; notes and the matching private mileage entry remain in the current browser.
- **Hunt:** standalone canvas minigame; hunted food goes to the community stores.
- **Journal:** private dates, notes, weekly/monthly totals, season log, delete, export, and restore. The map is kept on Home to avoid duplicate dashboards.
- Public contribution totals are never cached in localStorage. The browser stores only an anonymous device identifier and, temporarily in `sessionStorage`, an idempotency key for an in-flight contribution.

## Oregon Trail map

The route follows an approximate polyline of the emigrant trail through Independence, Fort Kearny, Chimney Rock, Scotts Bluff, Fort Laramie, Independence Rock, South Pass, Fort Bridger, Fort Hall, the Blue Mountains, The Dalles, and Oregon City (not for navigation). Landmark mileposts are derived from the drawn route length scaled to 2,040 miles, so one mile covers the same map distance everywhere and the wagon moves at a steady pace. State shapes in `assets/js/us-states.js` are a simplified Albers projection adapted from [us-atlas](https://github.com/topojson/us-atlas), whose geometry is derived from U.S. Census Bureau cartographic boundaries. Rivers and mountain ranges are hand-placed and approximate, drawn at their real latitude/longitude through the same projection; trail mileage and the route are approximate too.



> Deploy note: HTML uses versioned `?v=N` asset URLs to refresh cached code/styles after a release. Bump the version in the affected pages whenever JavaScript or CSS changes.
