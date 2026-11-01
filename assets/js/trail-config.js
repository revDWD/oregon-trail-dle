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

  // Educational copy for the landmark info card, keyed by landmark id.
  landmarkDetails: {
    independence: { importance: "Jumping-off town for emigrants who outfitted wagons, oxen and supplies before crossing the plains.", relevance: "Most 1840s wagon trains gathered here in April and May, waiting for prairie grass to grow enough to feed livestock.", funFact: "A typical wagon carried roughly 1,000 lbs of food for a family of four." },
    fort_kearny: { importance: "Established in 1848 on the Platte River to protect and resupply emigrants.", relevance: "The first major landmark on the Platte road, where travelers repaired wagons and mailed letters home.", funFact: "The Platte was described as 'a mile wide and an inch deep' by pioneers." },
    chimney_rock: { importance: "A 300-foot spire rising above the North Platte valley, visible for a day or more before travelers reached it.", relevance: "Pioneer diaries mention it more than almost any other site; it signaled the plains were giving way to the West.", funFact: "Diarists guessed its height anywhere from 40 feet to 1,000 feet." },
    scotts_bluff: { importance: "A massive bluff that forced wagons through nearby Mitchell Pass.", relevance: "Marked the approach to the high plains and the Rocky Mountains.", funFact: "It is named for Hiram Scott, a fur trader said to have died near the bluff." },
    fort_laramie: { importance: "The most important supply post on the trail, first a fur-trading fort and later a military post.", relevance: "Emigrants rested, traded and lightened overloaded wagons here before the hard climb into the mountains.", funFact: "Travelers often abandoned heavy furniture along the road near the fort." },
    independence_rock: { importance: "A granite dome on the Sweetwater River where emigrants carved their names.", relevance: "Reaching it by July 4 meant the party was on schedule to cross the mountains before snow.", funFact: "Thousands of names were carved into the rock, and some are still visible." },
    south_pass: { importance: "A wide, gentle gap in the Rocky Mountains crossing the Continental Divide.", relevance: "It made wagon travel to Oregon possible without climbing steep peaks.", funFact: "Many travelers barely noticed they had crossed the Continental Divide." },
    fort_bridger: { importance: "A trading post built by mountain man Jim Bridger in the Green River valley.", relevance: "A chance to buy fresh supplies and trade worn-out stock after the dry Wyoming stretch.", funFact: "Later in 1857 it was burned by Mormon militia during the Utah War." },
    fort_hall: { importance: "A Snake River trading post where the Oregon and California routes diverged.", relevance: "Emigrants here faced the long Snake River plain and the tough decision of what to leave behind.", funFact: "Some wagons were sold or traded here because teams were too worn out to continue." },
    blue_mountains: { importance: "A forested range that slowed wagons just before the Columbia River.", relevance: "Steep grades and thick timber made this one of the final tests of the journey.", funFact: "Emigrants called the dense evergreen slopes 'the Blues'." },
    the_dalles: { importance: "The Columbia River gateway to the Willamette Valley, and the end of the overland wagon road in early years.", relevance: "Travelers loaded wagons onto rafts or later took the Barlow Road around Mount Hood.", funFact: "The Barlow Road, opened in 1846, charged a toll of $5 per wagon." },
    oregon_city: { importance: "Founded in 1829 and the end of the Oregon Trail, with the land office for claims.", relevance: "Settlers filed land claims in the Willamette Valley, building new lives after about six months on the road.", funFact: "It was the first incorporated city west of the Rocky Mountains." }
  },

  // Light, deterministic storytelling cards. One fires each time the community passes another
  // eventEveryMiles; the card is chosen by index so every browser shows the same story.
  // Effects are display-only (they are never written to the database).
  eventEveryMiles: 250,
  trailEvents: [
    { id: "buffalo", title: "Buffalo herd sighted", text: "A great herd crosses the plains. Hunters bring back fresh meat.", effect: "The wagon train celebrates a full supper.", education: "Millions of bison once roamed the Great Plains; emigrants relied on them for fresh meat and fuel in the form of dried chips." },
    { id: "river", title: "River crossing ahead", text: "The scouts find a shallow ford and the wagons cross carefully.", effect: "Everyone arrives safely on the far bank.", education: "Rivers such as the Platte and Snake were among the most dangerous parts of the trail." },
    { id: "storm", title: "Thunderstorm on the plains", text: "Lightning flashes and the oxen grow restless, but the circle of wagons holds.", effect: "The camp waits out the storm and presses on at dawn.", education: "Prairie storms stampeded livestock and soaked supplies, so travelers circled their wagons for safety." },
    { id: "shortcut", title: "Trail shortcut discovered", text: "A scout finds a faster path across the divide.", effect: "The party saves a day of travel.", education: "Cutoffs like Sublette's saved days but crossed long stretches without water." },
    { id: "trading", title: "Trading post encounter", text: "A trading post offers flour, bacon and news from the road ahead.", effect: "Supplies are restocked and letters are sent east.", education: "Posts charged high prices because goods came a long way, but emigrants also traded for fresh oxen." },
    { id: "letters", title: "Letters left on a rock", text: "Travelers find names and messages carved by earlier wagon trains.", effect: "The camp adds its own names to the stone.", education: "Emigrants used landmarks as a message board, leaving notes for friends traveling behind." }
  ],

  // Community miles that trigger special journal entries.
  mileMilestones: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],

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
