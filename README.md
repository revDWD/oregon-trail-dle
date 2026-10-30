# Oregon Trail DLE

## 🌐 Live site: [dwdyck.github.io/oregon-trail-dle](https://dwdyck.github.io/oregon-trail-dle/)

> **About this project:** an experiment in using AI to build interesting web use cases. It is a small, dependency-free static site made to see how far AI-assisted development can go with a playful idea: a fitness tracker with a game layer.

A fitness-tracker-meets-game that follows a 2,040-mile Oregon Trail. Log the miles you walk, run, or ride, watch your covered wagon travel from Independence, Missouri, to Oregon City, Oregon, and spend the food-hunting minigame you earn every 5 miles.

It is a plain static website: no server, no database, no account, and nothing to pay for.

## How your data is stored

- Everything lives in your browser's `localStorage` on the device you use. Nothing is sent anywhere.
- Miles survive refreshes and browser restarts. They are **not** shared between devices or browsers, and clearing the site's browsing data erases them.
- If the browser blocks storage (for example some private-browsing modes), the site still works for that visit and shows a warning that miles will not be kept.
- The hunting minigame is derived from your saved miles: every 5 miles unlocks one hunt. Pick one of three hiding places; the animal's spot is only decided when you pick, so it's a fair 1-in-3 guess. Results, food stores, win count, and streak are saved alongside your entries.
- Because there is no database, use **Progress â†’ Back up your journey** to download a JSON backup and restore it in another browser or device. Mistyped entries can be deleted from the history list.
- Damaged or hand-edited saves are sanitized on load; an unreadable save is kept under the `oregon-trail-dle:v1:unreadable` key instead of being overwritten, a console warning is logged, and the app starts a fresh journey instead of crashing.

### Persistence details

- **Where:** `localStorage` key `oregon-trail-dle:v1`. Persistence lives in one section of `assets/js/script.js` (`loadStore`, `saveStore`, `hasSave`, `clearSave`, `parseSave`).
- **Schema:** `{ "version": 1, "timestamp": "<ISO date>", "gameState": { "entries": [...], "hunts": [...] } }`. Totals, food, current landmark and statistics are derived from `gameState` and never stored.
- **Auto-save:** every action (logging miles, deleting an entry, starting or resolving a hunt, importing a backup) saves immediately in one small write, so no debounce is needed. On load the save is validated and sanitized, with defaults applied. Saves from before versioning (a bare `{ entries, hunts }`) load automatically.
- **Continue / New game:** the journey resumes automatically when you open the site. To start over, use **Progress → New game / reset save** (confirmation required; download a backup first). You can also clear the site's data in your browser settings.
- **Versioning and migration:** bump `SAVE_VERSION` when the shape changes and add a `SAVE_MIGRATIONS[oldVersion]` function that upgrades the old `gameState`; loads run every migration from the save's version up to the current one before sanitizing. Adding an optional field (like `journal`) only needs a default in `sanitizeStore`.

## Trail configuration, seasons and the journey log

Everything content-like lives in [assets/js/trail-config.js](assets/js/trail-config.js) (`window.OTDLE_CONFIG`): trail length, landmarks and distances, message templates, achievements, and timed event definitions. Most updates are edits to that file, not to `script.js`.

- **Landmark milestones:** reaching a landmark records a journey-log entry and shows a dismissible celebration banner.
- **Achievements:** `{ id, name, description, metric, threshold }` where metric is `lifetimeMiles`, `seasonsCompleted`, `huntsWon`, `foodGathered` or `entriesLogged`.
- **Events:** `{ id, name, description, start, end, goalMiles }` (empty by default; the foundation counts miles dated inside the window).
- **Seasons:** finishing Oregon City records the completion and the next season starts automatically (miles 2,040+ begin Season 2, and so on). Seasons are derived from the entries, so lifetime totals and past seasons ("Season 1: completed in 87 days") are never lost. See **Progress → Seasons and journey log**.
- **No duplicate announcements:** each record has a stable key (for example `season:1:landmark:fort_kearny`) saved in the journal, so deleting and re-adding entries never re-announces it. Changing a landmark or achievement `id` makes it count as new.
- Everything is local to your browser; there is no shared or online progress.

## Run it

Open `index.html` in a browser, or serve the folder with any static file server (for example `npx serve`). For free hosting, push the folder to GitHub Pages, Netlify, Cloudflare Pages, or similar; no build step or settings are needed.

## Tests

`npm test` runs the Node test suite, which checks the trail-route model and that the site stays a static, self-contained app. `node --check assets/js/script.js` checks syntax.

## Oregon Trail map

The route follows an approximate polyline of the emigrant trail through Independence, Fort Kearny, Chimney Rock, Scotts Bluff, Fort Laramie, Independence Rock, South Pass, Fort Bridger, Fort Hall, the Blue Mountains, The Dalles, and Oregon City (not for navigation). Landmark mileposts are derived from the drawn route length scaled to 2,040 miles, so one mile covers the same map distance everywhere and the wagon moves at a steady pace. State shapes in `assets/js/us-states.js` are a simplified Albers projection adapted from [us-atlas](https://github.com/topojson/us-atlas), whose geometry is derived from U.S. Census Bureau cartographic boundaries. Rivers and mountain ranges are hand-placed and approximate, drawn at their real latitude/longitude through the same projection; trail mileage and the route are approximate too.


