# Trail data sources and accuracy

`assets/js/at/trail/appalachian-trail.js` is the only file that contains Appalachian Trail geography. The engine and UI read it through the trail object, so another trail (or a corrected AT table) can be dropped in without touching logic.

## What the numbers are

- **Total length: 2,198 miles.** The Appalachian Trail Conservancy (ATC) publishes an official length that changes by a few miles most years because of reroutes; recent figures are about 2,190–2,200 miles. 2,198 is used as a stable game value. Change `totalMiles` and the last landmark together if you prefer another figure (a test enforces they agree).
- **Landmark mile markers** are rounded northbound distances from Springer Mountain, GA, collected from the commonly published ATC / A.T. Guide / Wikitrail-style mileage tables. They were assembled from general knowledge and a web search summary, **not copied from one specific edition of the data book, and have not been individually verified**. Treat them as accurate to within roughly 5–10 miles. The least certain values are Monson, Bear Mountain, Pen Mar, Mount Washington and Mahoosuc Notch.
- **Coordinates** are approximate decimal-degree latitude/longitude of each landmark, accurate to roughly a mile. The map line between landmarks is a simple polyline (landmarks plus a few unnamed shape points), **not the real GPS track** of the trail.
- **Southbound** distances are computed as `totalMiles − marker`.

- **Elevations** (`elevationFt`) are rounded approximations from general knowledge (USGS-style summit and gap figures, as commonly quoted). They are not survey values.
- **Trailhead access notes** (`access`) name a commonly used road crossing or trailhead near each landmark. Check current conditions with the ATC or the land manager before relying on them for a real hike.
- **Regions** (`regions`) are this project's own grouping of the trail into eight sections for the map and the Camp scenery. Their boundaries are rounded mile markers, not official ATC section definitions.
- **Shape points** (unnamed points in `route`) only make the map line look like the trail's general course. They are approximate.

## What is not included

No ATC logos, photographs, trail blazes or artwork are used. Landmark facts are short original descriptions written for this project. Landmark illustrations (`ui/illustrations.js`), the camp scene and the expedition sprites are original, simple SVG/pixel drawings made for this project.

## Improving accuracy later

1. Replace values from the ATC's current Data Book or the official GIS centerline (ATC publishes the route as GIS data; check its licence before copying).
2. Keep `landmarks` strictly increasing; run `npm test` (`validateTrail` checks order, range, coordinates and milestones).
3. Changing mile markers changes where players appear to be, but never changes stored activity data (activities store credited miles, not positions).

## Landmark stories (history, nature, Kevin's Trail Notes)

`assets/js/at/trail/landmark-stories.js` holds the educational text shown in each landmark's detail panel: **Why it matters**, **Nature notes**, **Did you know?** and the optional **Kevin's Trail Notes**. The text is original. It was written for this game from widely published general knowledge (National Park Service park pages, state park information and common trail references), and uncertain claims are hedged ("said to be", "usually translated"). It is not copied from any source. `learnMore` links point to official pages (nps.gov/appa, /grsm, /shen, /hafe, /dewa, and baxterstatepark.org).

## Landmark photos

The landmark detail panel shows a real photo when one is available, and falls back to the original pixel art if there is none or it fails to load.

- **Source.** Photos come from [Wikimedia Commons](https://commons.wikimedia.org/), chosen by `scripts/landmark-photos.mjs` through the Commons API. The licence is read from each file's metadata, and only **public domain** (including US government works such as NPS, USFS and USGS), **CC0**, **CC BY** and **CC BY-SA** files are accepted. NC, ND, GFDL-only, unclear and fair-use files are rejected (`scripts/lib/commons.mjs`, unit-tested). The script prefers landscape JPEGs at least 1,200 px wide and skips maps and signs.
- **Self-hosted.** Each photo is downloaded once, about 1,024 px wide, to `assets/img/landmarks/<id>.jpg`, so visitors' browsers never contact a third party and links can't rot. Credits live in the generated `assets/js/at/trail/landmark-photos.js`.
- **Attribution.** The caption shows the author, the year if known, a linked licence and a link to the Commons source page. This meets the CC BY and CC BY-SA attribution terms. Resizing is the only change made.
- **Maintenance.** Run Actions › "Landmark photos". The workflow needs internet access and a reviewer, so the result is always a pull request. Hand-picked photos can override a generated one: add `photo: { src, alt, credit, license, licenseUrl, sourceUrl, year }` to the landmark in `landmark-stories.js`. Your own photos and Library of Congress "No known restrictions" items also qualify.
- **Why not the NPS API?** It needs an API key, and NPS media often carries mixed or third-party rights. Commons exposes machine-readable licences, and its search already includes many NPS public-domain photos.

A test checks that every photo has alt text, a credit, an allowed licence and a source link, and that the file exists.
