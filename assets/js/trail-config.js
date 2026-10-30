// All trail content lives here so most updates are data edits, not code changes.
// Loaded as a classic script before script.js (keeps the site buildless and working from file://).
// Changing landmark miles shifts every player's displayed progress; changing ids re-announces milestones.
window.OTDLE_CONFIG = {
  trailMiles: 2040,

  // Text templates. Placeholders: {name} {description} {season} {days} {miles} {goal}
  messages: {
    landmark: { title: "Reached {name}", text: "{description}" },
    seasonStart: { title: "Season {season} begins", text: "A new expedition sets out from Independence." },
    seasonComplete: { title: "Season {season} complete!", text: "You reached Oregon City in {days} days." },
    achievement: { title: "Achievement: {name}", text: "{description}" },
    event: { title: "Event complete: {name}", text: "{description}" }
  },

  landmarks: [
    { id: "independence", miles: 0, name: "Independence, Missouri", shortName: "Independence", state: "MO", coordinates: [-94.4155, 39.0911], description: "The historic starting point of the Oregon Trail, just west of the Missouri River." },
    { id: "fort_kearny", miles: 300, name: "Fort Kearny", shortName: "Fort Kearny", state: "NE", coordinates: [-98.9962, 40.6642], description: "A major supply stop on the Platte River in Nebraska." },
    { id: "chimney_rock", miles: 510, name: "Chimney Rock", shortName: "Chimney Rock", state: "NE", coordinates: [-103.3496, 41.7033], markerOffset: [12, -17], description: "A prominent natural landmark that guided travelers across the Nebraska plains." },
    { id: "scotts_bluff", miles: 560, name: "Scotts Bluff", shortName: "Scotts Bluff", state: "NE", coordinates: [-103.6672, 41.8358], markerOffset: [12, 17], description: "A striking bluff and landmark along the North Platte River." },
    { id: "fort_laramie", miles: 640, name: "Fort Laramie", shortName: "Fort Laramie", state: "WY", coordinates: [-104.5472, 42.2097], markerOffset: [-12, -17], description: "An important trading post and resupply point in present-day Wyoming." },
    { id: "independence_rock", miles: 920, name: "Independence Rock", shortName: "Independence Rock", state: "WY", coordinates: [-107.1147, 42.4933], description: "A granite landmark on the Sweetwater River, traditionally reached by Independence Day." },
    { id: "south_pass", miles: 1020, name: "South Pass", shortName: "South Pass", state: "WY", coordinates: [-108.8868, 42.3533], description: "The broad Rocky Mountain crossing that opened the route west." },
    { id: "fort_bridger", miles: 1120, name: "Fort Bridger", shortName: "Fort Bridger", state: "WY", coordinates: [-110.3888, 41.3172], description: "A key supply stop in the Green River valley." },
    { id: "fort_hall", miles: 1300, name: "Fort Hall", shortName: "Fort Hall", state: "ID", coordinates: [-112.4383, 43.0324], description: "A Hudson's Bay Company post near the Snake River in present-day Idaho." },
    { id: "blue_mountains", miles: 1830, name: "Blue Mountains", shortName: "Blue Mountains", state: "OR", coordinates: [-118, 45.3], description: "A challenging mountain crossing on the final approach to the Columbia River." },
    { id: "the_dalles", miles: 1950, name: "The Dalles", shortName: "The Dalles", state: "OR", coordinates: [-121.1787, 45.5946], markerOffset: [10, -12], description: "A Columbia River passage and key stopping point before the final leg." },
    { id: "oregon_city", miles: 2040, name: "Oregon City, Oregon", shortName: "Oregon City", state: "OR", coordinates: [-122.6068, 45.3573], markerOffset: [-2, 14], description: "The traditional destination of the Oregon Trail in the Willamette Valley." }
  ],

  // metric is one of: lifetimeMiles, seasonsCompleted, huntsWon, foodGathered, entriesLogged.
  // Unlocked once metric >= threshold. Once recorded in the journey log an achievement is never announced again.
  achievements: [
    { id: "first_steps", name: "First Steps", description: "Log your first entry.", metric: "entriesLogged", threshold: 1 },
    { id: "miles_100", name: "First 100 Miles", description: "Travel 100 miles in total.", metric: "lifetimeMiles", threshold: 100 },
    { id: "miles_1000", name: "One Thousand Miles", description: "Travel 1,000 miles in total.", metric: "lifetimeMiles", threshold: 1000 },
    { id: "miles_100000", name: "First 100,000 Miles", description: "Travel 100,000 miles in total.", metric: "lifetimeMiles", threshold: 100000 },
    { id: "miles_1000000", name: "One Million Miles", description: "Travel one million miles in total.", metric: "lifetimeMiles", threshold: 1000000 },
    { id: "oregon_complete", name: "Oregon Completion", description: "Finish the trail for the first time.", metric: "seasonsCompleted", threshold: 1 },
    { id: "hunter_10", name: "Seasoned Hunter", description: "Win 10 hunts.", metric: "huntsWon", threshold: 10 },
    { id: "food_100", name: "Well Stocked", description: "Gather 100 food.", metric: "foodGathered", threshold: 100 }
  ],

  // Timed events (weekend migrations, seasonal expeditions, ...). Shape:
  // { id, name, description, start: "YYYY-MM-DD", end: "YYYY-MM-DD", goalMiles }
  // Counts miles dated within start..end (inclusive). Reaching goalMiles records one journey-log entry.
  events: []
};
