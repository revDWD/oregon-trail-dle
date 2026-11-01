# AGENTS.md — Oregon Trail Dle

Guidance for AI coding agents. Read this first; it should get you productive in ~5 minutes.

## Project Overview

**What it is:** A fitness tracker with a game layer. Contributions from all visitors move a shared 2,040-mile Oregon Trail (Independence, MO → Oregon City, OR) in Supabase. Each browser also keeps a private mileage journal; every 5 locally logged miles unlocks a hunting minigame (pick 1 of 3 hiding places, 1-in-3 odds) that earns local food. Live at https://revdwd.github.io/oregon-trail-dle/

**Primary users:** A single person tracking their own exercise on their own device (phone first).

**Goals:** Make contributing miles fun and low-friction; keep the shared expedition durable; keep journal notes and game state private on-device; keep the static site trivially hostable.

**Non-goals (do not add unless explicitly asked):**
- A backend, database, API calls, or analytics **beyond the explicitly requested Supabase community progress** (`assets/js/community.js` is the only file allowed to use the network; `script.js` must not call `fetch(`). Community totals must never be stored in localStorage. Only the public anon key may appear in the repo; never the `service_role` key.
- Accounts, login, per-user leaderboards. (Anonymous community-wide miles are now a feature; HTML still must not use the forbidden wording below.)
- A build step, bundler, framework, or runtime dependencies.
- Real-time GPS/fitness-device integration.

This repo is also an experiment in building web use cases with AI (see README).

## Architecture

Static multi-page site. No server. All logic runs in the browser.

```
index.html (home) ─┐
pages/log-mileage.html ─┤
pages/hunt.html ─────────┼─ each loads assets/js/script.js (deferred)
pages/progress.html ────┘     home loads assets/js/us-states.js first
```

- **Page logic:** `assets/js/script.js` is one `"use strict"` IIFE. It reads `document.body.dataset.page` (`home` | `log` | `hunt` | `progress`); `assets/js/community.js` separately owns Supabase reads, writes, polling and Realtime.
- **Personal data flow:** local mileage/hunt actions → `saveStore` → `refreshCampaign` → `buildState` → page renderers. Personal history, notes, hunts, food and season log remain in the browser.
- **Community data flow:** mileage form → `community.submit` → `add_community_miles` RPC → atomic log + total transaction. Community totals come from Supabase; they are never read from or written to localStorage.
- **Personal state:** a store object in `localStorage` under key `oregon-trail-dle:v1`:
  `{ entries: [{id, miles, date, notes≤240}], hunts: [{milestoneMiles, hidden, animal, selected, succeeded, food}] }`.
  Personal totals, food, current landmark and hunts are **derived** in `buildState`; do not persist those derived values.
  - `sanitizeStore` validates/drops malformed data on load and import.
  - An unreadable save is preserved under `oregon-trail-dle:v1:unreadable`.
  - If localStorage is blocked, `saveStore` falls back to an in-memory store and shows a warning.
  - A `storage` event listener syncs other tabs.
- **Map:** Home SVG built with `createElementNS` and driven by the Supabase community total. State outlines come from `window.OTDLE_STATES` (`us-states.js`); route, landmarks, rivers, ranges and waters are hand-placed lon/lat constants projected by `projectMapPoint` (simplified Albers).
- **Randomness:** `randomInt` uses `crypto.getRandomValues`. The hunt's hidden spot is chosen only when the player picks (in `resolveHunt`), not beforehand.
- **Test hook:** `window.__OTDLE_EXPOSE__.api = { buildState, addEntry, startHunt, resolveHunt, deleteEntry, importBackup, sanitizeStore }` — only populated when a test sets `__OTDLE_EXPOSE__` first.

## Technology Stack

- HTML5, CSS3 (custom properties), vanilla ES2020+ JavaScript. **Zero dependencies.**
- Tests: Node's built-in runner (`node --test`), Node ≥ 20. `package.json` is `private`, `type: module`, has no `dependencies`, and there is no lockfile.
- Hosting: GitHub Pages, legacy build from `main` at `/`, HTTPS enforced. No custom workflows besides GitHub's `pages-build-deployment`.
- **Deploy:** push to `main` → Pages rebuilds in ~1 minute. There is no staging. `main` is protected against force-push and deletion (PRs are not required).

## File Structure

| Path | Purpose |
|---|---|
| `index.html` | Home: community trail map and expedition card, recent private entries |
| `pages/log-mileage.html` | Mileage entry form |
| `pages/hunt.html` | Standalone local hunting minigame |
| `pages/progress.html` | Private journal, history (with delete), backup/restore JSON |
| `assets/js/script.js` | Personal game/journal logic and rendering |
| `assets/js/community.js` | Supabase API, contribution RPC, polling and Realtime |
| `assets/js/supabase-config.js` | Public Supabase project URL and anon/publishable key |
| `assets/js/trail-config.js` | Trail milestones, achievements, messages and events |
| `supabase/schema.sql` | Community tables, RLS policies, atomic contribution RPC and Realtime publication |
| `assets/js/us-states.js` | ~97 KB single-line SVG path string. **Never view, diff, or hand-edit.** Regenerate from us-atlas / Census data if it must change |
| `assets/css/style.css` | All styles (~2,000 lines, one file) |
| `tests/logic.test.js` | Game/state logic tests (runs `script.js` in a `node:vm` sandbox) |
| `tests/community.test.js` | Community client tests with mocked Supabase requests and Realtime |
| `tests/static-site.test.js` | Guardrail tests on the HTML/JS/package structure |
| `README.md`, `package.json`, `.gitignore` | Docs, test script, ignores |

**Caution areas**
- `us-states.js` (huge, generated).
- `script.js` constants block (`LANDMARKS`, `ROUTE_WAYPOINTS`, `MAP_*`): changing miles or waypoints shifts every user's progress display and the map geometry. `getRouteModel` also mutates `LANDMARKS[].miles` at runtime.
- `STORAGE_KEY` and the store shape: any change needs migration/back-compat in `sanitizeStore`, or users lose data. Bump the key version only with a migration.
- Pages in `pages/` use `../` relative paths; `index.html` does not.

## Development Principles

- **Simplicity first; maintainability over cleverness.** Plain functions, no abstractions "for later".
- **Minimize dependencies:** the answer is almost always "don't add one".
- **Mobile-first:** base styles target phones; breakpoints exist at 760px, 520px and 380px. Verify at ~375px wide before desktop.
- **Accessibility:** keep `:focus-visible` styles; landmark markers are keyboard-operable (`role="button"`, `tabindex="0"`, `aria-pressed`, `aria-label`); status/error text uses `role="status"` / `aria-live`; respect `prefers-reduced-motion`; keep color contrast on the dark palette; every input has a label.
- **Offline / privacy:** the private journal works offline and stays on-device except for explicit backup export. Community contributions require an online Supabase request; only aggregate miles and a random device identifier are sent, never notes or personal journal history.

## Coding Standards

- **Naming:** camelCase functions/variables, UPPER_SNAKE_CASE constants. CSS: lowercase kebab-case classes; CSS variables defined on `:root` (`--ink`, `--paper`, `--card`, `--green`, `--leather`, `--rust`, `--gold`, …). Reuse them.
- **DOM hooks:** use `data-*` attributes (e.g. `data-total-miles`, `data-hunt-location`, `data-trail-map`, `data-storage-status`), not styling classes or IDs, for JS selection. Add the attribute in HTML and query it in JS. Select the page via `body[data-page]`.
- **Organization:** keep everything inside the IIFE in the existing order: constants → date helpers → persistence → core logic → rendering → initializers → `DOMContentLoaded` wiring. Put new pure logic in the core section so it is testable.
- **Rendering text:** build DOM with `createElement` + `textContent`. **No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`** (currently none are used).
- **Dates:** local calendar dates as `YYYY-MM-DD` via `localDateString` / strict `parseDate`. Don't use `toISOString()` for "today" (UTC off-by-one).
- **Error handling:** validate at the boundary and return/display a message (`data-form-message`, `data-backup-message`, `data-storage-status`), don't throw into the UI. Imports are size-limited (2 MB) and confirm before replacing data.
- **Logging:** the community client logs Supabase reads/writes, Realtime events and errors with the `[community]` prefix for persistence debugging; don't add console logging to the personal game/journal logic. User-facing failures must also appear in the UI.
- **Limits:** `TRAIL_MILES = 2040`, `MAX_ENTRY_MILES = 1000`, notes ≤ 240 chars. Keep the form `min/max/maxlength` attributes and JS validation in sync.

## Security Rules

- **Never expose secrets / commit credentials.** The app needs none: no keys, tokens, or endpoints. If a task seems to need one, stop and ask.
- **Sanitize all input:** form values and imported backup JSON must pass through `sanitizeStore` / existing validators. Render only via `textContent`.
- **Least privilege:** no new browser permissions (geolocation, notifications, etc.) without explicit approval and a documented reason.
- **No third-party scripts, fonts, or CDNs** (a static, self-contained site has no supply-chain exposure; keep it that way). If one is unavoidable, pin it and use Subresource Integrity.
- **Repo is public.** Never commit real personal data (exported backups, notes, location info).
- **Document any new risk** in this file and in the PR/commit message.
- GitHub secret scanning, push protection, and Dependabot alerts are enabled on the repo.

## Agent Workflows

1. **Understand** the existing implementation: read the relevant logic and page HTML; run `npm test` first to confirm a green baseline.
2. **Reuse** existing patterns (data-attribute hooks, `buildState` derivation, `sanitizeStore` for any new persisted field).
3. **Minimize scope**: touch only what the task needs; no drive-by reformatting of `script.js` or `style.css`.
4. **Explain tradeoffs** when there is more than one reasonable approach (briefly, in the PR/commit message).
5. **Identify risks before coding**: data-loss (storage shape), map geometry, test sandbox limits, accessibility.
6. **List impacted files** in your summary.
7. Verify (see Testing), then commit. Use small, descriptive commit messages. If you are an AI agent, include the trailer `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` only when committing via that tool.

## Agent Constraints

- Do **not** introduce frameworks, bundlers, TypeScript, or npm dependencies. `static-site.test.js` fails if `package.json` gains `dependencies`.
- Do **not** add `fetch(`, `XMLHttpRequest`, or `/api/` to `script.js` (the test fails). Do not add `server/` or `db/` directories.
- Do **not** reintroduce multi-user wording in HTML: `trail hand(s)`, `trail party`, `shared`, `data-participant`, `data-my-miles` (the test fails).
- Keep the README containing the phrase "hand-placed" and do not mention hillshade / us-relief / usgs in the home or progress pages (tests check).
- Prefer modifying existing code to rewriting. No premature optimization. Preserve the single-IIFE, single-store architecture unless told otherwise.
- **Test sandbox:** `logic.test.js` runs `script.js` in `node:vm` with only these globals stubbed: `window`, `document`, `Intl`, `Math`, `Date`, `JSON`, `Number`, `Set`, `Map`, `Uint32Array`, `Error`, `Array`, `Object`, `String`, `Boolean`, `Element`. A new global referenced at load time throws `ReferenceError`; either avoid it or add a stub in the test.

## Testing Expectations

**Automated:** `npm test` (no install needed). Add logic tests for new game logic, client tests for new Supabase behavior, and static checks for page wiring/accessibility hooks.

**Manual (serve with `python -m http.server` or just open `index.html`; the map also works from `file://`):**
1. Log a valid entry on `pages/log-mileage.html`; confirm Supabase contribution and map update on home.
2. Cross a 5-mile personal-journal milestone → hunt unlocks on `pages/hunt.html`; pick a spot; food and message update; hunt can't be replayed.
3. Delete a private entry in Journal; local totals recompute without changing community miles.
4. Export backup, clear storage, import it back; private data is restored. Try an invalid / oversized file.
5. Reload and open a second browser; community totals agree, while private journals remain separate.
6. Test at ~375px, keyboard-only (Tab through landmarks, Enter/Space to select), and with reduced-motion enabled.

**Edge cases:** 0.1 and 1000 mile boundaries; non-numeric/negative/too-large miles; notes at 240 chars; future dates; crossing 2,040 miles (end of trail); multiple milestones crossed by one big entry; blocked or corrupted localStorage; browsers without `crypto.getRandomValues`.

## Future Improvements / Known Technical Debt

- Leftover "group/participant/shared" naming from the earlier collaborative design (`groupMiles`, `participant`, `data-group-miles`). Rename internally, but HTML must keep avoiding the forbidden words.
- `markerX !== landmark.x` is always true (`landmark.x` is undefined), so leader lines are drawn for every marker.
- `getWagonPosition(svg, miles)` has an unused `svg` param and duplicates the `pointAt` logic in `getRoutePath`.
- `renderCamp` is large; module-level mutable state (`campaignState`, `routeModel`, `memoryStore`, `storageWarning`, `huntBusy`) and `LANDMARKS[].miles` mutation in `getRouteModel` could be tightened.
- `style.css` is a single large file with no section comments and a late "old-school flavor" override block (~line 1860); split into commented sections.
- README title and project name are slightly out of sync.
- No CI, linter, or lockfile; tests don't cover DOM rendering or map code. A GitHub Action running `npm test` on push would be a low-cost win.
- Community writes are intentionally anonymous; rate-limits based on a client-supplied device id are best-effort. The private journal is device-local and its JSON backup is the only transfer path.
