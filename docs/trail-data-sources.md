# Trail data sources and accuracy

`assets/js/at/trail/appalachian-trail.js` is the only file that contains Appalachian Trail geography. The engine and UI read it through the trail object, so another trail (or a corrected AT table) can be dropped in without touching logic.

## What the numbers are

- **Total length: 2,198 miles.** The Appalachian Trail Conservancy (ATC) publishes an official length that changes by a few miles most years because of reroutes; recent figures are about 2,190–2,200 miles. 2,198 is used as a stable game value. Change `totalMiles` and the last landmark together if you prefer another figure (a test enforces they agree).
- **Landmark mile markers** are rounded northbound distances from Springer Mountain, GA, collected from the commonly published ATC / A.T. Guide / Wikitrail-style mileage tables. They were assembled from general knowledge and a web search summary, **not copied from one specific edition of the data book, and have not been individually verified**. Treat them as accurate to within roughly 5–10 miles. The least certain values are Monson, Bear Mountain, Pen Mar, Mount Washington and Mahoosuc Notch.
- **Coordinates** are approximate decimal-degree latitude/longitude of each landmark, accurate to roughly a mile. The map line between landmarks is a simple polyline (landmarks plus a few unnamed shape points), **not the real GPS track** of the trail.
- **Southbound** distances are computed as `totalMiles − marker`.

## What is not included

No ATC logos, photographs, trail blazes or artwork are used. Landmark facts are short original descriptions written for this project.

## Improving accuracy later

1. Replace values from the ATC's current Data Book or the official GIS centerline (ATC publishes the route as GIS data; check its licence before copying).
2. Keep `landmarks` strictly increasing; run `npm test` (`validateTrail` checks order, range, coordinates and milestones).
3. Changing mile markers changes where players appear to be, but never changes stored activity data (activities store credited miles, not positions).
