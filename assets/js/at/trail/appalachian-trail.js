// Appalachian Trail route data. DATA ONLY: no DOM, no network, no game logic.
//
// All mile markers are measured NORTHBOUND from Springer Mountain, GA (mile 0).
// The engine converts them for southbound travel. The real trail is re-routed a little every
// year (official length is roughly 2,190-2,200 miles), so every value here is an APPROXIMATION
// made for a friendly fitness game, not for navigation. See docs/trail-data-sources.md.
//
// Coordinates are approximate [latitude, longitude] in decimal degrees (WGS84). The "route" array
// is the polyline used by the map: landmarks plus a few unnamed shape points.

const landmarks = [
  { id: "springer-mountain", name: "Springer Mountain", state: "GA", miles: 0, lat: 34.6268, lon: -84.1938, kind: "terminus",
    trivia: "The southern end of the trail sits on a rocky summit in the Georgia mountains." },
  { id: "neel-gap", name: "Neel Gap", state: "GA", miles: 31, lat: 34.7359, lon: -83.9172, kind: "gap",
    trivia: "The trail passes straight through a stone outfitter building here, where hikers often sort their packs." },
  { id: "bly-gap", name: "Bly Gap", state: "GA/NC", miles: 78, lat: 34.9895, lon: -83.5658, kind: "border",
    trivia: "A gnarled old oak marks the move from Georgia into North Carolina." },
  { id: "nantahala", name: "Nantahala Gorge", state: "NC", miles: 136, lat: 35.3331, lon: -83.5919, kind: "river",
    trivia: "The Nantahala River is famous for whitewater, and the trail drops to its gorge before climbing out again." },
  { id: "fontana-dam", name: "Fontana Dam", state: "NC", miles: 165, lat: 35.4511, lon: -83.8097, kind: "landmark",
    trivia: "The trail crosses the top of one of the tallest dams in the eastern United States on the way into the Smokies." },
  { id: "clingmans-dome", name: "Clingmans Dome", state: "NC/TN", miles: 200, lat: 35.5628, lon: -83.4986, kind: "summit",
    trivia: "At about 6,600 feet, this is the highest point on the entire trail." },
  { id: "hot-springs", name: "Hot Springs", state: "NC", miles: 274, lat: 35.8972, lon: -82.8264, kind: "town",
    trivia: "The trail runs right down the main street of this small mountain town." },
  { id: "max-patch", name: "Max Patch", state: "NC", miles: 289, lat: 35.7967, lon: -82.9622, kind: "bald",
    trivia: "A grassy mountaintop bald with wide views in every direction." },
  { id: "roan-highlands", name: "Roan Highlands", state: "NC/TN", miles: 378, lat: 36.1048, lon: -82.1342, kind: "bald",
    trivia: "A string of high, open balds with views and rolling meadows." },
  { id: "damascus", name: "Damascus", state: "VA", miles: 469, lat: 36.6354, lon: -81.7787, kind: "town",
    trivia: "Known as Trail Town USA, it hosts a big hiker festival every May." },
  { id: "grayson-highlands", name: "Grayson Highlands", state: "VA", miles: 494, lat: 36.6376, lon: -81.503, kind: "park",
    trivia: "Wild ponies roam the open high country here." },
  { id: "pearisburg", name: "Pearisburg", state: "VA", miles: 634, lat: 37.3293, lon: -80.7342, kind: "town",
    trivia: "A friendly stop where the trail crosses the New River valley." },
  { id: "dragons-tooth", name: "Dragon's Tooth", state: "VA", miles: 699, lat: 37.3694, lon: -80.162, kind: "summit",
    trivia: "A jagged rock spire that is a fun scramble with a big reward." },
  { id: "mcafee-knob", name: "McAfee Knob", state: "VA", miles: 711, lat: 37.3917, lon: -80.0364, kind: "summit",
    trivia: "A cliff-edge ledge that is one of the most photographed spots on the trail." },
  { id: "rockfish-gap", name: "Rockfish Gap", state: "VA", miles: 861, lat: 38.0337, lon: -78.8625, kind: "gap",
    trivia: "The trail leaves the Blue Ridge Parkway and enters Shenandoah National Park here." },
  { id: "big-meadows", name: "Big Meadows", state: "VA", miles: 906, lat: 38.52, lon: -78.439, kind: "park",
    trivia: "Open meadows in Shenandoah National Park are a good place to spot deer at dusk." },
  { id: "harpers-ferry", name: "Harpers Ferry", state: "WV", miles: 1026, lat: 39.3254, lon: -77.7388, kind: "town",
    trivia: "The unofficial psychological halfway point, and home to the trail's national headquarters." },
  { id: "pen-mar", name: "Pen Mar", state: "MD/PA", miles: 1068, lat: 39.704, lon: -77.5154, kind: "border",
    trivia: "Hikers cross the Mason-Dixon line here, traditionally the divide between south and north." },
  { id: "delaware-water-gap", name: "Delaware Water Gap", state: "PA/NJ", miles: 1298, lat: 40.9712, lon: -75.1346, kind: "river",
    trivia: "The trail crosses the Delaware River on a bridge to enter New Jersey." },
  { id: "bear-mountain", name: "Bear Mountain", state: "NY", miles: 1408, lat: 41.3126, lon: -73.989, kind: "summit",
    trivia: "The trail passes through a zoo here, and it is the lowest point on the whole route." },
  { id: "mount-greylock", name: "Mount Greylock", state: "MA", miles: 1583, lat: 42.6377, lon: -73.1662, kind: "summit",
    trivia: "The highest point in Massachusetts, topped with a tall stone tower." },
  { id: "hanover", name: "Hanover", state: "NH", miles: 1742, lat: 43.7022, lon: -72.2896, kind: "town",
    trivia: "A college town where the trail follows the sidewalks right through the middle of town." },
  { id: "mount-washington", name: "Presidential Range", state: "NH", miles: 1862, lat: 44.2706, lon: -71.3033, kind: "summit",
    trivia: "A rugged stretch above treeline with some of the fastest-changing weather in the country." },
  { id: "mahoosuc-notch", name: "Mahoosuc Notch", state: "ME", miles: 1921, lat: 44.5436, lon: -70.9647, kind: "notch",
    trivia: "A boulder-filled gorge often called one of the most fun and slowest miles on the trail." },
  { id: "monson", name: "Monson", state: "ME", miles: 2085, lat: 45.2889, lon: -69.5, kind: "town",
    trivia: "The last town before the Hundred-Mile Wilderness." },
  { id: "katahdin", name: "Mount Katahdin", state: "ME", miles: 2198, lat: 45.9044, lon: -68.9213, kind: "terminus",
    trivia: "The northern end of the trail, a big granite mountain with a famous summit sign." }
];

// Unnamed shape points that bend the map line between landmarks (miles are NORTHBOUND markers).
const shapePoints = [
  { miles: 110, lat: 35.19, lon: -83.65 },
  { miles: 240, lat: 35.78, lon: -83.1 },
  { miles: 420, lat: 36.3, lon: -82.0 },
  { miles: 560, lat: 36.95, lon: -81.1 },
  { miles: 780, lat: 37.65, lon: -79.45 },
  { miles: 960, lat: 38.7, lon: -78.2 },
  { miles: 1180, lat: 40.2, lon: -77.05 },
  { miles: 1350, lat: 41.2, lon: -74.7 },
  { miles: 1500, lat: 41.95, lon: -73.45 },
  { miles: 1950, lat: 44.75, lon: -70.6 },
  { miles: 2020, lat: 45.05, lon: -70.1 }
];

const route = [
  ...landmarks.map(({ miles, lat, lon, id }) => ({ miles, lat, lon, landmarkId: id })),
  ...shapePoints
].sort((a, b) => a.miles - b.miles);

// Progress milestones. `miles` is credited trail miles from the player's start; `fraction` is of the
// total length. Exactly one of the two is given.
const milestones = [
  { id: "first-steps", title: "First steps", miles: 1, description: "Your first credited trail mile." },
  { id: "ten-miles", title: "Trailhead warm-up", miles: 10, description: "Ten miles on the trail." },
  { id: "hundred-miles", title: "Hundred-mile club", miles: 100, description: "One hundred credited miles." },
  { id: "quarter", title: "A quarter of the way", fraction: 0.25, description: "25% of the trail complete." },
  { id: "five-hundred", title: "Five hundred miles", miles: 500, description: "Five hundred credited miles." },
  { id: "halfway", title: "Halfway there", fraction: 0.5, description: "Half of the trail complete." },
  { id: "three-quarters", title: "Three quarters done", fraction: 0.75, description: "75% of the trail complete." },
  { id: "two-thousand", title: "Two thousand miles", miles: 2000, description: "Two thousand credited miles." },
  { id: "finish", title: "Trail complete", fraction: 1, description: "You walked the whole trail." }
];

export const APPALACHIAN_TRAIL = Object.freeze({
  id: "appalachian-trail",
  name: "Appalachian Trail",
  totalMiles: 2198,
  // Direction in which `miles` markers increase; the default challenge direction.
  defaultDirection: "nobo",
  directions: Object.freeze({
    nobo: Object.freeze({ label: "Northbound (Georgia to Maine)", from: "Springer Mountain, GA", to: "Mount Katahdin, ME" }),
    sobo: Object.freeze({ label: "Southbound (Maine to Georgia)", from: "Mount Katahdin, ME", to: "Springer Mountain, GA" })
  }),
  landmarks: Object.freeze(landmarks.map((item) => Object.freeze(item))),
  route: Object.freeze(route.map((item) => Object.freeze(item))),
  milestones: Object.freeze(milestones.map((item) => Object.freeze(item))),
  dataNotes: "Approximate northbound mile markers; see docs/trail-data-sources.md."
});
