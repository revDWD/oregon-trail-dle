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
    { id: "fort_kearny", miles: 319, name: "Fort Kearny", shortName: "Fort Kearny", state: "NE", coordinates: [-98.9962, 40.6642], description: "A major supply stop on the Platte River in Nebraska." },
    { id: "chimney_rock", miles: 604, name: "Chimney Rock", shortName: "Chimney Rock", state: "NE", coordinates: [-103.3496, 41.7033], markerOffset: [12, -17], description: "A prominent natural landmark that guided travelers across the Nebraska plains." },
    { id: "scotts_bluff", miles: 626, name: "Scotts Bluff", shortName: "Scotts Bluff", state: "NE", coordinates: [-103.6672, 41.8358], markerOffset: [12, 17], description: "A striking bluff and landmark along the North Platte River." },
    { id: "fort_laramie", miles: 688, name: "Fort Laramie", shortName: "Fort Laramie", state: "WY", coordinates: [-104.5472, 42.2097], markerOffset: [-12, -17], description: "An important trading post and resupply point in present-day Wyoming." },
    { id: "independence_rock", miles: 865, name: "Independence Rock", shortName: "Independence Rock", state: "WY", coordinates: [-107.1147, 42.4933], description: "A granite landmark on the Sweetwater River, traditionally reached by Independence Day." },
    { id: "south_pass", miles: 973, name: "South Pass", shortName: "South Pass", state: "WY", coordinates: [-108.8868, 42.3533], description: "The broad Rocky Mountain crossing that opened the route west." },
    { id: "fort_bridger", miles: 1101, name: "Fort Bridger", shortName: "Fort Bridger", state: "WY", coordinates: [-110.3888, 41.3172], description: "A key supply stop in the Green River valley." },
    { id: "fort_hall", miles: 1294, name: "Fort Hall", shortName: "Fort Hall", state: "ID", coordinates: [-112.4383, 43.0324], description: "A Hudson's Bay Company post near the Snake River in present-day Idaho." },
    { id: "blue_mountains", miles: 1750, name: "Blue Mountains", shortName: "Blue Mountains", state: "OR", coordinates: [-118, 45.3], description: "A challenging mountain crossing on the final approach to the Columbia River." },
    { id: "the_dalles", miles: 1951, name: "The Dalles", shortName: "The Dalles", state: "OR", coordinates: [-121.1787, 45.5946], markerOffset: [10, -12], description: "A Columbia River passage and key stopping point before the final leg." },
    { id: "oregon_city", miles: 2040, name: "Oregon City, Oregon", shortName: "Oregon City", state: "OR", coordinates: [-122.6068, 45.3573], markerOffset: [-2, 14], description: "The traditional destination of the Oregon Trail in the Willamette Valley." }
  ],

  // The Donner Party's 1846 journey, drawn as a second, dashed route and compared with community miles.
  // Miles use the same map ruler as the community route (shared with it as far as Fort Bridger), so a stop's
  // mile is where the community wagon would stand on the same point of the map. Dates come from historical
  // accounts (e.g. Rarick, Stewart, Johnson); where sources differ only a label is given.
  // Stop shape: { id, name, miles, date?: "YYYY-MM-DD", dateLabel, kind, text, education, coordinates? }.
  // Stops without coordinates sit on the shared route. route lists the path after Fort Bridger (points or stop ids).
  donnerParty: {
    departure: "1846-05-12",
    party: 87,
    survivors: 48,
    route: [[-110.9, 41.1], "wasatch", [-111.9, 40.77], [-112.6, 40.65], "salt_lake_desert", "humboldt", [-115.76, 40.83], [-117.0, 40.6], [-118.6, 40.0], "truckee_river", "truckee_lake", "sutters_fort"],
    stops: [
      { id: "independence", name: "Independence, Missouri", miles: 0, date: "1846-05-12", dateLabel: "May 12, 1846", kind: "start", text: "Nine wagons carrying 32 members of the Reed and Donner families left Independence at the very back of the year's migration, with almost 500 wagons already ahead of them.", education: "Leaving in mid-May was late but not yet dangerous. Timing mattered: too early meant mud and no grass, too late meant snow in the mountains." },
      { id: "alcove_spring", name: "Alcove Spring, Kansas", miles: 157, date: "1846-05-29", dateLabel: "May 29, 1846", kind: "loss", text: "Sarah Keyes, Margret Reed's 70-year-old mother, died here and was buried beside the trail under a stone inscribed with her name and the date.", education: "Illness, not conflict, was the leading cause of death on the trail, and emigrants often buried loved ones along the route." },
      { id: "fort_kearny", name: "The Platte River road", miles: 319, dateLabel: "early June 1846", kind: "route", text: "Within a week of leaving Independence the Reeds and Donners had joined a train of about 50 wagons. They followed the Platte River west in good spirits; Tamsen Donner wrote that the trouble was 'all in getting started'.", education: "Fort Kearny did not exist yet in 1846 (it was founded in 1848), so travelers on the Platte had no army post to resupply at." },
      { id: "fort_laramie", name: "Fort Laramie, Wyoming", miles: 688, dateLabel: "late June 1846", kind: "decision", text: "At Fort Laramie James Reed met an old friend, James Clyman, who had just come from California. Clyman warned him not to take the Hastings Cutoff because wagons could not make it.", education: "Fort Laramie was the last big trading post for supplies before the mountains. Good advice was available here, and it was ignored later." },
      { id: "independence_rock", name: "Independence Rock, Wyoming", miles: 865, dateLabel: "mid-July 1846", kind: "route", text: "The party was now weeks behind the early trains and still traveling at roughly 15 miles a day, the usual pace for ox-drawn wagons.", education: "Emigrants hoped to reach Independence Rock by July 4 to be sure of crossing the mountains before winter. The Donner Party was about two weeks late." },
      { id: "south_pass", name: "South Pass, Wyoming", miles: 973, dateLabel: "mid-July 1846", kind: "route", text: "On July 12 Lansford Hastings's riders handed the party a letter promising a faster way to California by a new road south of the Great Salt Lake.", education: "South Pass is where wagon routes split for Oregon and California. Hastings had never driven wagons over the route he was promoting." },
      { id: "little_sandy", name: "Little Sandy River, Wyoming", miles: 1016, date: "1846-07-20", dateLabel: "July 20, 1846", kind: "decision", text: "Most of the train kept to the established trail toward Fort Hall. A smaller group chose Fort Bridger and the Hastings Cutoff and elected George Donner as its captain.", education: "This was the fork that decided the story. The Fort Hall road was longer on paper but proven; the cutoff was only a rumor of a shortcut." },
      { id: "fort_bridger", name: "Fort Bridger, Wyoming", miles: 1101, date: "1846-07-27", dateLabel: "July 27-31, 1846", kind: "decision", text: "The party rested four days and repaired wagons while Hastings had already left with another group. Jim Bridger told them the shortcut would save 350 miles. They left on July 31, eleven days behind that group.", education: "The Hastings Cutoff actually added about 125 to 150 miles. A fort that profited from emigrant trade had little reason to discourage the detour." },
      { id: "wasatch", name: "Wasatch Mountains, Utah", miles: 1172, date: "1846-08-06", dateLabel: "Aug 6-27, 1846", coordinates: [-111.45, 41.0], kind: "delay", text: "Finding the trail far harder than promised, the party spent about three weeks cutting a new road through brush and canyons, sometimes covering only a mile and a half a day. On August 20 they first saw the Great Salt Lake.", education: "Delays like this burned through food and strength that the party could not replace. By now they were 87 people in 60 to 80 wagons." },
      { id: "salt_lake_desert", name: "Great Salt Lake Desert, Utah", miles: 1331, date: "1846-08-30", dateLabel: "Aug 30-Sep 4, 1846", coordinates: [-113.9, 40.75], kind: "disaster", text: "Promised a two-day, 40-mile dry stretch, the party faced 80 miles of salt flat that took six days. Many oxen died or bolted for water and several wagons were abandoned.", education: "Losing draft animals was the most serious setback an emigrant family could face, and most of the group's later troubles trace back to this crossing." },
      { id: "humboldt", name: "Humboldt River, Nevada", miles: 1403, date: "1846-09-26", dateLabel: "Sept 26, 1846", coordinates: [-114.96, 41.11], kind: "route", text: "Two months after turning onto the cutoff, the party rejoined the main California trail. The shortcut had probably cost them about a month.", education: "Wagon trains that stayed on the established road generally reached California without trouble in the same year." },
      { id: "truckee_river", name: "Truckee River, Nevada", miles: 1734, date: "1846-10-20", dateLabel: "Oct 20, 1846", coordinates: [-119.8, 39.53], kind: "route", text: "Charles Stanton returned from Sutter's Fort with mules, food and two Miwok guides, and word that the pass would be open until mid-November. Hopes rose and the families pressed on.", education: "Help from Sutter's Fort came because two riders had been sent ahead weeks earlier. Planning and teamwork kept the party alive here." },
      { id: "truckee_lake", name: "Truckee Lake (Donner Lake), California", miles: 1766, dateLabel: "late Oct-Nov 1846", coordinates: [-120.24, 39.32], kind: "disaster", text: "Early snow closed the pass, only miles from the summit. Sixty people made winter camp at the lake in three cabins and the Donner families camped farther down at Alder Creek. A rescue party of snowshoers, the Forlorn Hope, set out on December 16, and relief parties arrived beginning in mid-February 1847.", education: "Of the 87 members of the party, 48 survived. The pass and the lake now bear the Donner name." },
      { id: "sutters_fort", name: "Sutter's Fort, California", miles: 1867, dateLabel: "winter-spring 1847", coordinates: [-121.49, 38.57], kind: "end", text: "The destination the party never reached together. The survivors were brought out in relief parties and found refuge in the Sacramento Valley.", education: "The disaster led emigrants to scrutinize guidebooks and shortcuts, and it is still taught as a lesson about haste, bad information and group decision making." }
    ]
  },

  // How the Donner Party's experience compares with each landmark, shown on the landmark card.
  donnerNotes: {
    independence: "The Donner-Reed party left here on May 12, 1846, near the back of the year's migration.",
    fort_kearny: "Fort Kearny did not exist in 1846. The Donner Party passed this stretch of the Platte in early June, weeks before reaching Fort Laramie.",
    chimney_rock: "The Donner wagons passed here in June 1846 still traveling in good time, well before the decisions that changed their journey.",
    scotts_bluff: "Like most 1846 emigrants, the party followed the North Platte past the bluffs; trouble had not yet begun.",
    fort_laramie: "James Reed was warned here by James Clyman not to take the Hastings Cutoff. The party reached Fort Laramie in late June.",
    independence_rock: "The Donner Party reached the Sweetwater River in mid-July, about two weeks behind the traditional July 4 target.",
    south_pass: "On July 12, near here, the party received Lansford Hastings's letter promising a shortcut to California.",
    fort_bridger: "The Donner Party rested here July 27-31 and then turned southwest onto the Hastings Cutoff, which added 125 to 150 miles.",
    fort_hall: "The Donner Party never came here. Most 1846 wagon trains reached Fort Hall; the Donners took the cutoff instead, bound for California.",
    blue_mountains: "The Donner Party was in the Great Basin and Sierra Nevada far to the south at this stage of the story.",
    the_dalles: "Oregon-bound travelers floated or rafted the Columbia here. The Donner Party was heading to California and never saw the river.",
    oregon_city: "The Donner Party's destination was California's Sacramento Valley, not Oregon, and they were stopped by snow only miles from the pass."
  },

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
