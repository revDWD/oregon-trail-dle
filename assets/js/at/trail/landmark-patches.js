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
//   since        { year, note }: the year the landmark joined the trail, only when it is well documented
//   resources    [{ label, url, kind, offers }]: real pages only, https only. kind (engine/patches.js
//                RESOURCE_KINDS, listed best first): "patch" (Official Patch: the landmark's own
//                park or conservancy selling its patch), "park-store", "state-park-store",
//                "conservancy-store", "outfitter", "patch-shop" (an independent shop's patch for this
//                landmark), "trail-club", "visitor-center", "history", "official" (Official Site) or
//                "learn" (Learn More). offers: any of "patch", "souvenir", "visitor", "hiking", and only
//                what the page itself shows. The story's learnMore link and the Appalachian Trail
//                Conservancy's Trail Store are added automatically. Links were checked by hand
//                (HTTP 200) when added; recheck them when editing.
//
// Patch art is original pixel-vector artwork drawn in code. No Appalachian Trail Conservancy logos,
// branding or real patch designs. To add a patch for a new landmark: add the landmark, then (optionally)
// an entry here; `npm test` checks every landmark has a valid patch.

export const LANDMARK_PATCHES = Object.freeze({
  "springer-mountain": {
    shape: "shield", banner: "SPRINGER",
    since: { year: 1958, note: "when the southern end of the trail moved here from Mount Oglethorpe" },
    description: "Where every northbound journey begins: a bronze plaque, the first white blaze and 2,198 miles ahead.",
    resources: [
      { label: "Springer Mountain Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/springer-mountain-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Georgia Appalachian Trail Club", url: "https://georgia-atclub.org/", kind: "trail-club", offers: ["hiking"] },
      { label: "Amicalola Falls Lodge: the Approach Trail", url: "https://amicalolafallslodge.com/appalachian-trail-gateway/", kind: "visitor-center", offers: ["visitor", "hiking"] },
      { label: "Springer Mountain Trailhead (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/chattahoochee-oconee/recreation/springer-mountain-trailhead", kind: "learn", offers: ["hiking"] }
    ]
  },
  "neel-gap": {
    shape: "circle", banner: "NEEL GAP",
    description: "The stone outfitter at the gap, where old boots hang in the trees and many hikers lighten their packs.",
    resources: [
      { label: "Mountain Crossings: Gifts and Patches", url: "https://www.mountaincrossings.com/Appalachain-Trail-Gifts-Patches-s/2034.htm", kind: "outfitter", offers: ["patch", "souvenir"] },
      { label: "Georgia Appalachian Trail Club", url: "https://georgia-atclub.org/", kind: "trail-club", offers: ["hiking"] },
      { label: "Appalachian Trail in Georgia (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/chattahoochee-oconee/recreation/trails/appalachian-trail-georgia", kind: "learn", offers: ["hiking"] }
    ]
  },
  "bly-gap": {
    shape: "hexagon", banner: "BLY GAP",
    description: "Goodbye Georgia, hello North Carolina: the first state line, marked by a wind-bent oak.",
    resources: [
      { label: "Appalachian Trail Georgia Patch (Mountain Crossings)", url: "https://www.mountaincrossings.com/Trail-Gifts-Patches-AT-Gerogia-Patch-p/patch-atga.htm", kind: "outfitter", offers: ["patch"] },
      { label: "Nantahala Hiking Club", url: "https://www.nantahalahikingclub.org/", kind: "trail-club", offers: ["hiking"] }
    ]
  },
  "nantahala": {
    shape: "circle", banner: "NANTAHALA",
    description: "The land of the noonday sun: a deep gorge, cold whitewater and rafts bobbing past the trail.",
    resources: [
      { label: "NOC Outfitters Store", url: "https://noc.com/locations/noc-outfitters-store/", kind: "outfitter", offers: ["souvenir", "visitor"] },
      { label: "National Forests in North Carolina (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/northcarolina", kind: "learn", offers: ["hiking"] }
    ]
  },
  "fontana-dam": {
    shape: "shield", banner: "FONTANA",
    description: "Walk across the top of the tallest dam in the East, then climb into the Smokies.",
    resources: [
      { label: "Fontana Reservoir and visitor center (TVA)", url: "https://lakeinfo.tva.gov/web/sites/fontana.htm", kind: "visitor-center", offers: ["visitor", "hiking"] },
      { label: "Fontana Dam (National Park Service)", url: "https://www.nps.gov/places/fontana-dam.htm", kind: "learn", offers: ["hiking"] },
      { label: "Fontana Village Resort", url: "https://fontanavillage.com/", kind: "official", offers: ["visitor"] }
    ]
  },
  "clingmans-dome": {
    shape: "circle", banner: "CLINGMANS",
    description: "The highest point on the whole trail, crowned by a spiral observation tower above the spruce.",
    resources: [
      { label: "Smokies Life: Kuwohi gifts", url: "https://smokieslife.org/shop-kuwohi-products/", kind: "park-store", offers: ["souvenir"] },
      { label: "Kuwohi (Clingmans Dome) visitor information (NPS)", url: "https://www.nps.gov/grsm/planyourvisit/kuwohi-nfg.htm", kind: "official", offers: ["visitor", "souvenir", "hiking"] }
    ]
  },
  "hot-springs": {
    shape: "hexagon", banner: "HOT SPRINGS",
    description: "A warm welcome: blazes in the sidewalk, a riverside town and steam rising from the springs.",
    resources: [
      { label: "Visit Hot Springs, North Carolina", url: "https://www.hotspringsnc.org/", kind: "visitor-center", offers: ["visitor", "hiking"] },
      { label: "Hot Springs, NC: A.T. Community (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/protect/conservation/at-community-program/hot-springs-nc/", kind: "learn", offers: ["visitor"] }
    ]
  },
  "max-patch": {
    shape: "circle", banner: "MAX PATCH",
    description: "A wide grassy bald with a sky full of sunshine and a 360-degree view.",
    resources: [
      { label: "Max Patch: plan your visit", url: "https://www.maxpatch.org/", kind: "trail-club", offers: ["visitor", "hiking"] },
      { label: "Max Patch (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/northcarolina/recreation/max-patch", kind: "official", offers: ["visitor", "hiking"] },
      { label: "Hike Max Patch (Visit Hot Springs)", url: "https://www.hotspringsnc.org/hike-max-patch-nc/", kind: "visitor-center", offers: ["hiking"] }
    ]
  },
  "roan-highlands": {
    shape: "shield", banner: "ROAN",
    description: "Rolling balds blooming pink with rhododendron, high above the clouds.",
    resources: [
      { label: "Roan Mountain State Park visitor center gift shop", url: "https://tnstateparks.com/parks/roan-mountain", kind: "state-park-store", offers: ["souvenir", "visitor"] },
      { label: "A.T. State Patches (Appalachian Trail Conservancy Trail Store)", url: "https://www.atctrailstore.org/guides-maps/planning-by-state/maine/a-t-state-patches/", kind: "conservancy-store", offers: ["patch"] },
      { label: "Roan Mountain, TN: A.T. Community (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/protect/conservation/at-community-program/roan-mountain-tn/", kind: "learn", offers: ["hiking"] }
    ]
  },
  "damascus": {
    shape: "hexagon", banner: "DAMASCUS",
    description: "Trail Town USA, where the Virginia Creeper Trail rolls in on an old railroad trestle.",
    resources: [
      { label: "Damascus Trail Center (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/experience/visit-us/damascus-trail-center/", kind: "visitor-center", offers: ["visitor", "souvenir"] },
      { label: "Visit Damascus", url: "https://visitdamascus.org/", kind: "visitor-center", offers: ["visitor"] },
      { label: "Appalachian Trail Days festival", url: "https://visitdamascus.org/traildays/", kind: "official", offers: ["visitor"] }
    ]
  },
  "grayson-highlands": {
    shape: "circle", banner: "GRAYSON",
    description: "High meadows where wild ponies roam. Admire them, never feed them!",
    resources: [
      { label: "Grayson Highlands Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/grayson-highlands-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Grayson Highlands State Park (Virginia DCR)", url: "https://www.dcr.virginia.gov/state-parks/grayson-highlands", kind: "official", offers: ["visitor", "hiking"] },
      { label: "Mount Rogers National Recreation Area (USDA Forest Service)", url: "https://www.fs.usda.gov/r08/gwj/recreation/mount-rogers-national-recreation-area", kind: "learn", offers: ["hiking"] }
    ]
  },
  "pearisburg": {
    shape: "shield", banner: "PEARISBURG",
    description: "A friendly resupply town beside the New River, one of the oldest rivers in North America.",
    resources: [
      { label: "Pearisburg day trip and visitors center (Virginia Tourism)", url: "https://www.virginia.org/listing/wanderlove-pearisburg-day-trip/14292/", kind: "visitor-center", offers: ["visitor", "souvenir"] },
      { label: "Pearisburg, VA: A.T. Community (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/protect/conservation/at-community-program/pearisburg-va/", kind: "learn", offers: ["hiking"] }
    ]
  },
  "dragons-tooth": {
    shape: "shield", banner: "DRAGONS TOOTH",
    description: "A fin of quartzite stabbing the sky: the first jewel of Virginia's Triple Crown.",
    resources: [
      { label: "Dragon's Tooth Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/dragons-tooth-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Roanoke Appalachian Trail Club", url: "https://www.ratc.org/", kind: "trail-club", offers: ["hiking"] },
      { label: "Hiking Dragon's Tooth (Visit Roanoke)", url: "https://www.visitroanokeva.com/things-to-do/outdoor-adventure/appalachian-trail/dragons-tooth/", kind: "visitor-center", offers: ["visitor", "hiking"] }
    ]
  },
  "mcafee-knob": {
    shape: "circle", banner: "MCAFEE KNOB",
    description: "The famous overhanging ledge, glowing at sunset over the Catawba Valley.",
    resources: [
      { label: "McAfee Knob Badge Patch (Appalachian Trail Conservancy Trail Store)", url: "https://www.atctrailstore.org/mcafee-knob-badge-patch/", kind: "patch", offers: ["patch"] },
      { label: "McAfee Knob Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/mcafee-knob-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Roanoke Appalachian Trail Club", url: "https://www.ratc.org/", kind: "trail-club", offers: ["hiking"] },
      { label: "McAfee Knob (Visit Roanoke)", url: "https://www.visitroanokeva.com/things-to-do/outdoor-adventure/appalachian-trail/mcafee-knob/", kind: "visitor-center", offers: ["visitor", "hiking"] }
    ]
  },
  "rockfish-gap": {
    shape: "hexagon", banner: "ROCKFISH",
    description: "Blue ridges fading into blue ridges, where the Parkway ends and Skyline Drive begins.",
    resources: [
      { label: "Blue Ridge Parkway Foundation", url: "https://www.blueridgeparkway.org/", kind: "official", offers: ["souvenir"] },
      { label: "Visit Waynesboro", url: "https://www.visitwaynesboro.com/", kind: "visitor-center", offers: ["visitor"] },
      { label: "Blue Ridge Parkway (NPS)", url: "https://www.nps.gov/blri/", kind: "official", offers: ["visitor"] }
    ]
  },
  "big-meadows": {
    shape: "circle", banner: "BIG MEADOWS",
    description: "A wide Shenandoah meadow where deer graze at dusk and blueberries ripen in summer.",
    resources: [
      { label: "Shenandoah National Park Association: patches", url: "https://snpbooks.org/product-category/gifts-keepsakes/patch/", kind: "park-store", offers: ["patch", "souvenir"] },
      { label: "Big Meadows (National Park Service)", url: "https://www.nps.gov/places/big-meadows.htm", kind: "learn", offers: ["visitor", "hiking"] }
    ]
  },
  "harpers-ferry": {
    shape: "shield", banner: "HARPERS FERRY",
    description: "Two rivers meet below a historic town: the trail's \"psychological halfway point\".",
    resources: [
      { label: "Harpers Ferry Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/harpers-ferry-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Harpers Ferry Park Association", url: "https://www.harpersferryhistory.org/", kind: "park-store", offers: ["souvenir"] },
      { label: "Harpers Ferry Visitor Center (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/experience/visit-us/harpers-ferry-visitor-center/", kind: "visitor-center", offers: ["visitor", "souvenir"] }
    ]
  },
  "pen-mar": {
    shape: "hexagon", banner: "PEN MAR",
    description: "Step over the Mason-Dixon Line into Pennsylvania, where the rocks begin.",
    resources: [
      { label: "Patches, pins and medallions (Appalachian Trail Conservancy Trail Store)", url: "https://www.atctrailstore.org/gifts-souvenirs/patches-pins-medallions/", kind: "conservancy-store", offers: ["patch"] },
      { label: "Potomac Appalachian Trail Club", url: "https://www.patc.net/", kind: "trail-club", offers: ["hiking"] },
      { label: "Pen Mar Park (Washington County, Maryland)", url: "https://www.washco-md.net/parks-facilities/county-park/parks-pen-mar/", kind: "official", offers: ["visitor"] }
    ]
  },
  "delaware-water-gap": {
    shape: "circle", banner: "WATER GAP",
    description: "A great river carving a notch through the mountain, from Pennsylvania into New Jersey.",
    resources: [
      { label: "Delaware Water Gap park stores (NPS)", url: "https://www.nps.gov/dewa/learn/bookstore.htm", kind: "park-store", offers: ["souvenir"] },
      { label: "Delaware Water Gap collection (America's National Parks)", url: "https://shop.americasnationalparks.org/collections/delaware-water-gap-national-recreation-area", kind: "park-store", offers: ["souvenir"] },
      { label: "Delaware Water Gap, PA: A.T. Community (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/protect/conservation/at-community-program/delaware-water-gap-pa/", kind: "learn", offers: ["hiking"] }
    ]
  },
  "bear-mountain": {
    shape: "shield", banner: "BEAR MTN",
    since: { year: 1923, note: "when the very first section of the trail opened here" },
    description: "Where the very first miles of the trail opened in 1923, beside the Hudson and its bridge.",
    resources: [
      { label: "Bear Mountain State Park (New York State Parks)", url: "https://parks.ny.gov/visit/state-parks/bear-mountain-state-park", kind: "state-park-store", offers: ["souvenir", "visitor"] },
      { label: "New York-New Jersey Trail Conference", url: "https://www.nynjtc.org/", kind: "trail-club", offers: ["hiking"] },
      { label: "Trailside Museums and Zoo", url: "https://trailsidemuseumsandzoo.org/", kind: "history", offers: ["visitor"] }
    ]
  },
  "mount-greylock": {
    shape: "circle", banner: "GREYLOCK",
    description: "The highest point in Massachusetts, topped by a glowing memorial tower.",
    resources: [
      { label: "Mount Greylock Traverse Patch (Berkshire Hiking Challenges)", url: "https://www.berkshirehikingchallenges.com/store-U9Qxe/p/mount-greylock-traverse-completion-patch-and-sticker", kind: "patch-shop", offers: ["patch"] },
      { label: "Mount Greylock State Reservation (Mass.gov)", url: "https://www.mass.gov/locations/mount-greylock-state-reservation", kind: "official", offers: ["visitor", "hiking"] },
      { label: "Mount Greylock Magic", url: "https://mountgreylockmagic.com/", kind: "visitor-center", offers: ["souvenir"] }
    ]
  },
  "hanover": {
    shape: "hexagon", banner: "HANOVER",
    description: "A college town on the Connecticut River, known for kindness to passing hikers.",
    resources: [
      { label: "Dartmouth Outdoors (Dartmouth Outing Club)", url: "https://outdoors.dartmouth.edu/", kind: "trail-club", offers: ["hiking"] },
      { label: "Hanover, NH: A.T. Community (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/protect/conservation/at-community-program/hanover-nh/", kind: "visitor-center", offers: ["visitor", "hiking"] },
      { label: "The Appalachian Trail at Dartmouth (Dartmouth Libraries)", url: "https://www.library.dartmouth.edu/the-appalachian-trail-at-dartmouth", kind: "history", offers: ["hiking"] }
    ]
  },
  "mount-washington": {
    shape: "shield", banner: "PRESIDENTIALS",
    description: "Miles above treeline, cairn to cairn, on the mountain famous for the world's wildest wind.",
    resources: [
      { label: "Mt. Washington State Park summit gift shop (NH State Parks)", url: "https://www.nhstateparks.org/find-parks-trails/mt-washington-state-park", kind: "state-park-store", offers: ["visitor", "souvenir"] },
      { label: "Mount Washington Observatory Shop: patches", url: "https://shop.mountwashington.org/collections/patches", kind: "patch-shop", offers: ["patch", "souvenir"] },
      { label: "White Mountain National Forest (USDA Forest Service)", url: "https://www.fs.usda.gov/r09/whitemountain", kind: "learn", offers: ["hiking"] }
    ]
  },
  "mahoosuc-notch": {
    shape: "hexagon", banner: "MAHOOSUC",
    description: "Over, under and between house-sized boulders: the hardest, or most fun, mile of the trail.",
    resources: [
      { label: "Maine Appalachian Trail Club", url: "https://www.matc.org/", kind: "trail-club", offers: ["hiking"] },
      { label: "Appalachian Mountain Club: Maine", url: "https://www.outdoors.org/destinations/maine/", kind: "learn", offers: ["hiking"] },
      { label: "Maine Bureau of Parks and Lands", url: "https://www.maine.gov/dacf/parks/", kind: "official", offers: ["visitor"] }
    ]
  },
  "monson": {
    shape: "circle", banner: "MONSON",
    description: "The last town before the Hundred-Mile Wilderness of lakes, loons and moose.",
    resources: [
      { label: "100-Mile Wilderness Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/100-mile-wilderness-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Monson Visitor Center (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/experience/visit-us/monson-visitor-center/", kind: "visitor-center", offers: ["visitor"] },
      { label: "Monson, ME: A.T. Community (Appalachian Trail Conservancy)", url: "https://appalachiantrail.org/protect/conservation/at-community-program/monson-me/", kind: "learn", offers: ["hiking"] }
    ]
  },
  "katahdin": {
    shape: "shield", banner: "KATAHDIN",
    description: "The greatest mountain and the weathered sign at the end of the trail. You made it!",
    resources: [
      { label: "Baxter State Park Shop: Mountain patch", url: "https://baxterstatepark.org/product/patch-mountain/", kind: "patch", offers: ["patch", "souvenir"] },
      { label: "Mount Katahdin Highpoint Patch (Virginia Backpacking)", url: "https://virginiabackpacking.com/products/mount-katahdin-highpoint-patch", kind: "patch-shop", offers: ["patch"] },
      { label: "Friends of Baxter State Park Store", url: "https://www.friendsofbaxter.org/store", kind: "park-store", offers: ["souvenir"] }
    ]
  }
});

// Added to every patch after its own links: the Appalachian Trail Conservancy's store sells real
// trail patches and souvenirs, and its main site covers every section of the trail.
export const PATCH_STORE = Object.freeze({ label: "Appalachian Trail Conservancy Trail Store", url: "https://www.atctrailstore.org/", kind: "conservancy-store", offers: Object.freeze(["patch", "souvenir"]) });
export const TRAIL_HOME = Object.freeze({ label: "Appalachian Trail Conservancy", url: "https://appalachiantrail.org/", kind: "official" });
export const NPS_TRAIL = Object.freeze({ label: "Appalachian National Scenic Trail (National Park Service)", url: "https://www.nps.gov/appa/", kind: "learn" });

// The landmark whose scene sits at the centre of each state's State Explorer patch (default: the
// state's last landmark northbound). States without a landmark have no State Explorer patch.
export const STATE_EMBLEMS = Object.freeze({
  GA: "springer-mountain", NC: "max-patch", TN: "clingmans-dome", VA: "mcafee-knob", WV: "harpers-ferry",
  MD: "pen-mar", PA: "delaware-water-gap", NJ: "delaware-water-gap", NY: "bear-mountain", MA: "mount-greylock",
  NH: "mount-washington", ME: "katahdin"
});
