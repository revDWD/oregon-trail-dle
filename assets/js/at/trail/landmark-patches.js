// Landmark patches: one collectible patch per landmark. DATA ONLY (no DOM, no network).
//
// A hiker earns a landmark's patch when their own logged miles reach it (engine/patches.js). Nothing
// is stored: like mileage badges, earned dates come from the server's personal marks.
//
// Keyed by landmark id from appalachian-trail.js. Every field is optional; a landmark without an
// entry still gets a patch, with art chosen from its `kind` and links from its story. Fields:
//   shape        "circle" | "shield" | "hexagon"            (default "circle")
//   motif        art key in ui/patch-art.js (unique per patch; default: the landmark id if drawn,
//                otherwise a scene chosen from the landmark's kind)
//   banner       short ribbon text, at most 13 characters  (default: the landmark name)
//   description  one or two friendly, original sentences
//   resources    [{ label, url, kind }]: real pages only, https only. kind is "official" (Official site),
//                "learn" (Learn more) or "patch" (Patch information). The story's learnMore link and the
//                Appalachian Trail Conservancy's Trail Store are added automatically.
//
// Patch art is original pixel-vector artwork drawn in code. No Appalachian Trail Conservancy logos,
// branding or real patch designs. To add a patch for a new landmark: add the landmark, then (optionally)
// an entry here; `npm test` checks every landmark has a valid patch.

export const LANDMARK_PATCHES = Object.freeze({
  "springer-mountain": {
    shape: "shield", banner: "SPRINGER",
    description: "Where every northbound journey begins: a bronze plaque, the first white blaze and 2,198 miles ahead.",
    resources: [{ label: "Georgia Appalachian Trail Club", url: "https://georgia-atclub.org/", kind: "learn" }]
  },
  "neel-gap": {
    shape: "circle", banner: "NEEL GAP",
    description: "The stone outfitter at the gap, where old boots hang in the trees and many hikers lighten their packs.",
    resources: [{ label: "Mountain Crossings at Walasi-Yi", url: "https://www.mountaincrossings.com/", kind: "official" }]
  },
  "bly-gap": {
    shape: "hexagon", banner: "BLY GAP",
    description: "Goodbye Georgia, hello North Carolina: the first state line, marked by a wind-bent oak.",
    resources: [{ label: "National Forests in North Carolina (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/northcarolina", kind: "learn" }]
  },
  "nantahala": {
    shape: "circle", banner: "NANTAHALA",
    description: "The land of the noonday sun: a deep gorge, cold whitewater and rafts bobbing past the trail.",
    resources: [{ label: "Nantahala Outdoor Center", url: "https://noc.com/", kind: "official" }]
  },
  "fontana-dam": {
    shape: "shield", banner: "FONTANA",
    description: "Walk across the top of the tallest dam in the East, then climb into the Smokies.",
    resources: [{ label: "Fontana Village Resort", url: "https://fontanavillage.com/", kind: "learn" }]
  },
  "clingmans-dome": {
    shape: "circle", banner: "CLINGMANS",
    description: "The highest point on the whole trail, crowned by a spiral observation tower above the spruce.",
    resources: [{ label: "Great Smoky Mountains Association", url: "https://smokieslife.org/", kind: "patch" }]
  },
  "hot-springs": {
    shape: "hexagon", banner: "HOT SPRINGS",
    description: "A warm welcome: blazes in the sidewalk, a riverside town and steam rising from the springs.",
    resources: [{ label: "Hot Springs, North Carolina", url: "https://www.hotspringsnc.org/", kind: "official" }]
  },
  "max-patch": {
    shape: "circle", banner: "MAX PATCH",
    description: "A wide grassy bald with a sky full of sunshine and a 360-degree view.",
    resources: [{ label: "National Forests in North Carolina (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/northcarolina", kind: "learn" }]
  },
  "roan-highlands": {
    shape: "shield", banner: "ROAN",
    description: "Rolling balds blooming pink with rhododendron, high above the clouds.",
    resources: [{ label: "Southern Appalachian Highlands Conservancy", url: "https://appalachian.org/", kind: "learn" }]
  },
  "damascus": {
    shape: "hexagon", banner: "DAMASCUS",
    description: "Trail Town USA, where the Virginia Creeper Trail rolls in on an old railroad trestle.",
    resources: [{ label: "Visit Damascus", url: "https://visitdamascus.org/", kind: "official" }]
  },
  "grayson-highlands": {
    shape: "circle", banner: "GRAYSON",
    description: "High meadows where wild ponies roam. Admire them, never feed them!",
    resources: [{ label: "Grayson Highlands State Park (Virginia DCR)", url: "https://www.dcr.virginia.gov/state-parks/grayson-highlands", kind: "official" }]
  },
  "pearisburg": {
    shape: "shield", banner: "PEARISBURG",
    description: "A friendly resupply town beside the New River, one of the oldest rivers in North America.",
    resources: [{ label: "Town of Pearisburg", url: "https://www.pearisburg.org/", kind: "official" }]
  },
  "dragons-tooth": {
    shape: "shield", banner: "DRAGONS TOOTH",
    description: "A fin of quartzite stabbing the sky: the first jewel of Virginia's Triple Crown.",
    resources: [{ label: "Roanoke Appalachian Trail Club", url: "https://www.ratc.org/", kind: "learn" }]
  },
  "mcafee-knob": {
    shape: "circle", banner: "MCAFEE KNOB",
    description: "The famous overhanging ledge, glowing at sunset over the Catawba Valley.",
    resources: [
      { label: "Roanoke Appalachian Trail Club", url: "https://www.ratc.org/", kind: "learn" },
      { label: "Visit Roanoke", url: "https://www.visitroanokeva.com/", kind: "official" }
    ]
  },
  "rockfish-gap": {
    shape: "hexagon", banner: "ROCKFISH",
    description: "Blue ridges fading into blue ridges, where the Parkway ends and Skyline Drive begins.",
    resources: [
      { label: "Blue Ridge Parkway (NPS)", url: "https://www.nps.gov/blri/", kind: "official" },
      { label: "Blue Ridge Parkway Foundation", url: "https://www.blueridgeparkway.org/", kind: "learn" }
    ]
  },
  "big-meadows": {
    shape: "circle", banner: "BIG MEADOWS",
    description: "A wide Shenandoah meadow where deer graze at dusk and blueberries ripen in summer.",
    resources: [{ label: "Shenandoah National Park Association", url: "https://snpbooks.org/", kind: "patch" }]
  },
  "harpers-ferry": {
    shape: "shield", banner: "HARPERS FERRY",
    description: "Two rivers meet below a historic town: the trail's \"psychological halfway point\".",
    resources: [{ label: "Harpers Ferry Park Association", url: "https://www.harpersferryhistory.org/", kind: "patch" }]
  },
  "pen-mar": {
    shape: "hexagon", banner: "PEN MAR",
    description: "Step over the Mason-Dixon Line into Pennsylvania, where the rocks begin.",
    resources: []
  },
  "delaware-water-gap": {
    shape: "circle", banner: "WATER GAP",
    description: "A great river carving a notch through the mountain, from Pennsylvania into New Jersey.",
    resources: []
  },
  "bear-mountain": {
    shape: "shield", banner: "BEAR MTN",
    description: "Where the very first miles of the trail opened in 1923, beside the Hudson and its bridge.",
    resources: [{ label: "Bear Mountain State Park (New York State Parks)", url: "https://parks.ny.gov/visit/state-parks/bear-mountain-state-park", kind: "official" }]
  },
  "mount-greylock": {
    shape: "circle", banner: "GREYLOCK",
    description: "The highest point in Massachusetts, topped by a glowing memorial tower.",
    resources: [{ label: "Mount Greylock State Reservation (Mass.gov)", url: "https://www.mass.gov/locations/mount-greylock-state-reservation", kind: "official" }]
  },
  "hanover": {
    shape: "hexagon", banner: "HANOVER",
    description: "A college town on the Connecticut River, known for kindness to passing hikers.",
    resources: [
      { label: "Hanover Area Chamber of Commerce", url: "https://www.hanovernh.org/", kind: "official" },
      { label: "Dartmouth Outing Club", url: "https://outdoors.dartmouth.edu/dartmouth-outing-club/about-doc", kind: "learn" }
    ]
  },
  "mount-washington": {
    shape: "shield", banner: "PRESIDENTIALS",
    description: "Miles above treeline, cairn to cairn, on the mountain famous for the world's wildest wind.",
    resources: [
      { label: "Mount Washington Observatory", url: "https://mountwashington.org/", kind: "learn" },
      { label: "White Mountain National Forest (USDA Forest Service)", url: "https://www.fs.usda.gov/r09/whitemountain", kind: "official" },
      { label: "Appalachian Mountain Club", url: "https://www.outdoors.org/", kind: "learn" }
    ]
  },
  "mahoosuc-notch": {
    shape: "hexagon", banner: "MAHOOSUC",
    description: "Over, under and between house-sized boulders: the hardest, or most fun, mile of the trail.",
    resources: [{ label: "Appalachian Mountain Club", url: "https://www.outdoors.org/", kind: "learn" }]
  },
  "monson": {
    shape: "circle", banner: "MONSON",
    description: "The last town before the Hundred-Mile Wilderness of lakes, loons and moose.",
    resources: [{ label: "Maine Appalachian Trail Club", url: "https://www.matc.org/", kind: "learn" }]
  },
  "katahdin": {
    shape: "shield", banner: "KATAHDIN",
    description: "The greatest mountain and the weathered sign at the end of the trail. You made it!",
    resources: [{ label: "Maine Appalachian Trail Club", url: "https://www.matc.org/", kind: "learn" }]
  }
});

// Added to every patch after its own links: the Appalachian Trail Conservancy's store sells real
// trail patches and souvenirs, and its main site covers every section of the trail.
export const PATCH_STORE = Object.freeze({ label: "Appalachian Trail Conservancy Trail Store", url: "https://www.atctrailstore.org/", kind: "patch" });
export const TRAIL_HOME = Object.freeze({ label: "Appalachian Trail Conservancy", url: "https://appalachiantrail.org/", kind: "official" });
export const NPS_TRAIL = Object.freeze({ label: "Appalachian National Scenic Trail (National Park Service)", url: "https://www.nps.gov/appa/", kind: "learn" });
