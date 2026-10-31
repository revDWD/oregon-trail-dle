# AGENTS.md — Oregon Trail Dle

Guidance for AI coding agents. Read this first; it should get you productive in ~5 minutes.

## Project Overview

**What it is:** A fitness tracker with a game layer. The user logs walk/run/ride miles toward a 2,040-mile virtual Oregon Trail (Independence, MO → Oregon City, OR). Every 5 logged miles unlocks a hunting minigame (pick 1 of 3 hiding places, 1-in-3 odds) that earns food. Live at https://dwdyck.github.io/oregon-trail-dle/

**Primary users:** A single person tracking their own exercise on their own device (phone first).

**Goals:** Make logging miles fun and low-friction; work offline; keep data private on-device; stay trivially hostable.

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
pages/log-mileage.html ─┼─ each loads assets/js/script.js (deferred)
pages/progress.html ─┘     index + progress also load assets/js/us-states.js first
```

- **One script, one IIFE** (`assets/js/script.js`, `"use strict"`). It reads `document.body.dataset.page` (`home` | `log` | `progress`) and runs only the relevant renderers.
- **Data flow:** user action → `addEntry` / `startHunt` / `resolveHunt` / `deleteEntry` / `importBackup` → `saveStore` → `refreshCampaign` → `buildState` (derives totals, milestones, landmark, hunts) → page renderers (`renderHome`, `renderProgress`, `renderCamp`, map functions) update the DOM.
- **State:** a single store object in `localStorage` under key `oregon-trail-dle:v1`:
  `{ entries: [{id, miles, date, notes≤240}], hunts: [{milestoneMiles, hidden, animal, selected, succeeded, food}] }`.
  Everything else (miles total, food, current landmark) is **derived** in `buildState`; do not persist derived values.
  - `sanitizeStore` validates/drops malformed data on load and import.
  - An unreadable save is preserved under `oregon-trail-dle:v1:unreadable`.
  - If localStorage is blocked, `saveStore` falls back to an in-memory store and shows a warning.
  - A `storage` event listener syncs other tabs.
- **Map:** SVG built with `createElementNS`. State outlines come from `window.OTDLE_STATES` (`us-states.js`); route, landmarks, rivers, ranges and waters are hand-placed lon/lat constants projected by `projectMapPoint` (simplified Albers). Inlined as a classic script so the map works from `file://`.
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
| `index.html` | Home: trail map, landmarks, camp supplies, hunt UI, recent entries |
| `pages/log-mileage.html` | Mileage entry form |
| `pages/progress.html` | Stats, map, history (with delete), backup/restore JSON |
| `assets/js/script.js` | All app logic (~1,000 lines) |
| `assets/js/us-states.js` | ~97 KB single-line SVG path string. **Never view, diff, or hand-edit.** Regenerate from us-atlas / Census data if it must change |
| `assets/css/style.css` | All styles (~2,000 lines, one file) |
| `tests/logic.test.js` | Game/state logic tests (runs `script.js` in a `node:vm` sandbox) |
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
- **Offline / privacy:** no network calls; data never leaves the device except via the user's explicit JSON export.

## Coding Standards

- **Naming:** camelCase functions/variables, UPPER_SNAKE_CASE constants. CSS: lowercase kebab-case classes; CSS variables defined on `:root` (`--ink`, `--paper`, `--card`, `--green`, `--leather`, `--rust`, `--gold`, …). Reuse them.
- **DOM hooks:** use `data-*` attributes (e.g. `data-total-miles`, `data-hunt-location`, `data-trail-map`, `data-storage-status`), not styling classes or IDs, for JS selection. Add the attribute in HTML and query it in JS. Select the page via `body[data-page]`.
- **Organization:** keep everything inside the IIFE in the existing order: constants → date helpers → persistence → core logic → rendering → initializers → `DOMContentLoaded` wiring. Put new pure logic in the core section so it is testable.
- **Rendering text:** build DOM with `createElement` + `textContent`. **No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`** (currently none are used).
- **Dates:** local calendar dates as `YYYY-MM-DD` via `localDateString` / strict `parseDate`. Don't use `toISOString()` for "today" (UTC off-by-one).
- **Error handling:** validate at the boundary and return/display a message (`data-form-message`, `data-backup-message`, `data-storage-status`), don't throw into the UI. Imports are size-limited (2 MB) and confirm before replacing data.
- **Logging:** none. There are no `console.*` calls; don't add noisy logging. Surface problems in the UI instead.
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

1. **Understand** the existing implementation: read the relevant section of `script.js` and the page's HTML; run `npm test` first to confirm a green baseline (8/8).
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

**Automated:** `npm test` (no install needed). Currently 8/8 passing. Add a test in `tests/logic.test.js` for any new logic: entry validation, milestone/hunt math, import/export round-trips, `sanitizeStore` handling of bad data.

**Manual (serve with `python -m http.server` or just open `index.html`; the map also works from `file://`):**
1. Log a valid entry on `pages/log-mileage.html`; totals and map wagon update on home and progress.
2. Cross a 5-mile milestone → hunt unlocks; pick a spot; food and message update; hunt can't be replayed.
3. Delete an entry on progress; totals recompute.
4. Export backup, clear storage, import it back; data restored. Try an invalid / oversized file.
5. Reload and open a second tab; state persists and syncs.
6. Test at ~375px, keyboard-only (Tab through landmarks, Enter/Space to select), and with reduced-motion enabled.

**Edge cases:** 0.1 and 1000 mile boundaries; non-numeric/negative/too-large miles; notes at 240 chars; future dates; crossing 2,040 miles (end of trail); multiple milestones crossed by one big entry; blocked or corrupted localStorage; browsers without `crypto.getRandomValues`.

## Future Improvements / Known Technical Debt

- Leftover "group/participant/shared" naming from the earlier collaborative design (`groupMiles`, `participant`, `renderSharedSummary`, `data-group-miles`). Rename internally, but HTML must keep avoiding the forbidden words.
- `markerX !== landmark.x` is always true (`landmark.x` is undefined), so leader lines are drawn for every marker.
- `getWagonPosition(svg, miles)` has an unused `svg` param and duplicates the `pointAt` logic in `getRoutePath`.
- `renderCamp` is large; module-level mutable state (`campaignState`, `routeModel`, `memoryStore`, `storageWarning`, `huntBusy`) and `LANDMARKS[].miles` mutation in `getRouteModel` could be tightened.
- `style.css` is a single large file with no section comments and a late "old-school flavor" override block (~line 1860); split into commented sections.
- README has a BOM and mojibake ("Progress â†’ Back up your journey"); title/README are slightly out of sync.
- No CI, linter, or lockfile; tests don't cover DOM rendering or map code. A GitHub Action running `npm test` on push would be a low-cost win.
- Data is device-local only; the JSON backup is the only transfer path.
