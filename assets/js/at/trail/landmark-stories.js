// Landmark stories: the educational layer of each landmark. DATA ONLY (no DOM, no network).
//
// Keyed by landmark id from appalachian-trail.js. Every field is optional:
//   history     why the place matters to people (one or two sentences)
//   nature      geology, ecology, plants or wildlife
//   didYouKnow  one fun fact
//   kevin       "Kevin's Trail Notes": the organizer's own commentary. Add it in plain text.
//   photo       { src, alt, credit, license, sourceUrl }. Only use images you have the right to show
//               (public domain or your own). Put files in assets/img/landmarks/ and keep the credit.
//   learnMore   { label, url } for an official page (National Park Service, state park, etc.)
//
// Text is original, written for this game from general public knowledge (see
// docs/trail-data-sources.md). Keep it short, friendly and accurate; hedge when unsure.
// To add a note: edit this file on GitHub (pencil icon), add `kevin: "..."` to a landmark, commit.

const NPS_AT = { label: "Appalachian National Scenic Trail (National Park Service)", url: "https://www.nps.gov/appa/" };

export const LANDMARK_STORIES = Object.freeze({
  "springer-mountain": {
    history: "The trail was first proposed by Benton MacKaye in 1921 and finished in 1937. Springer became the southern end in 1958, when the terminus moved here from Mount Oglethorpe.",
    nature: "Oak and hickory forest of the Chattahoochee National Forest, with mountain laurel blooming in late spring.",
    didYouKnow: "A bronze plaque of a hiker sits on the summit rock, and the first white blaze is painted beside it.",
    learnMore: NPS_AT
  },
  "neel-gap": {
    history: "The stone building at the gap was built by the Civilian Conservation Corps in the 1930s. It is one of the only places where the trail passes through a building.",
    nature: "Just south is Blood Mountain, the highest point on the trail in Georgia (about 4,458 ft).",
    didYouKnow: "By tradition, hikers who give up toss their boots into the trees outside, so the branches are full of old footwear."
  },
  "bly-gap": {
    history: "Bly Gap marks the end of Georgia's roughly 78 trail miles and the start of North Carolina.",
    nature: "Wind-shaped oaks grow on the open, grassy saddle; the climbs that follow are some of the steepest in the south."
  },
  "nantahala": {
    history: "Nantahala is usually translated from Cherokee as \"land of the noonday sun\": the gorge walls are so steep the sun reaches the bottom only around midday. This is the Cherokee homeland.",
    nature: "The cold, clear Nantahala River is a famous whitewater paddling river.",
    didYouKnow: "The trail crosses the river right beside a busy rafting center."
  },
  "fontana-dam": {
    history: "The Tennessee Valley Authority built Fontana Dam in 1942–44 to power wartime industry. At about 480 ft it is the tallest dam east of the Rocky Mountains.",
    nature: "The trail walks across the top of the dam, then climbs into Great Smoky Mountains National Park.",
    didYouKnow: "The roomy shelter by the lake is nicknamed the \"Fontana Hilton\"."
  },
  "clingmans-dome": {
    history: "The highest point on the whole Appalachian Trail (6,643 ft), named for Thomas Clingman, a 19th-century senator who measured mountains. Great Smoky Mountains National Park, created in 1934, is the most visited national park in the country.",
    nature: "A cool spruce-fir forest like those much farther north. Many Fraser firs here were killed by an invasive insect, the balsam woolly adelgid.",
    didYouKnow: "A spiral ramp leads up an observation tower; on clear days you can see into several states.",
    learnMore: { label: "Great Smoky Mountains National Park (NPS)", url: "https://www.nps.gov/grsm/" }
  },
  "hot-springs": {
    history: "Natural warm springs drew visitors here for over a century. During World War I, German merchant sailors were interned at the town's hotel.",
    nature: "The French Broad River, said to be one of the oldest rivers in the world, runs right past town.",
    didYouKnow: "White blazes are set into the sidewalk: the trail walks straight down the main street."
  },
  "max-patch": {
    history: "This bald was cleared for pasture long ago and is now mowed to keep it open for its views.",
    nature: "Grassy balds are rare in the southern mountains, and scientists still debate how the natural ones first formed.",
    didYouKnow: "On a clear day the 360-degree view takes in the Smokies to the west."
  },
  "roan-highlands": {
    history: "The longest stretch of grassy balds on the trail. Grazing animals have helped keep them open.",
    nature: "Wild Catawba rhododendrons flower in huge pink gardens here, usually in June.",
    didYouKnow: "Roan High Knob Shelter, above 6,000 ft, is one of the highest shelters on the trail."
  },
  "damascus": {
    history: "Damascus calls itself \"Trail Town USA\" and hosts the Trail Days festival every spring, when past and present hikers gather.",
    nature: "The Virginia Creeper Trail, an old railroad turned bike path, meets the AT in town.",
    didYouKnow: "Virginia holds about a quarter of the whole trail, more than any other state."
  },
  "grayson-highlands": {
    history: "Wild ponies were released here in the 1970s to graze and keep the high meadows open. They still roam today.",
    nature: "Nearby Mount Rogers (about 5,729 ft) is Virginia's highest point, wrapped in a spruce-fir forest.",
    didYouKnow: "The ponies are wild: admire them, but never feed or pet them."
  },
  "pearisburg": {
    history: "A small town named for George Pearis, an early settler, and a resupply stop for hikers.",
    nature: "The trail crosses the New River, which, despite its name, is thought to be one of the oldest rivers in North America."
  },
  "dragons-tooth": {
    history: "One of the \"Virginia Triple Crown\" with McAfee Knob and Tinker Cliffs.",
    nature: "The tooth is a tall fin of hard Tuscarora quartzite that resisted the erosion around it.",
    didYouKnow: "The final scramble uses metal rungs drilled into the rock."
  },
  "mcafee-knob": {
    history: "Often called the most photographed spot on the Appalachian Trail.",
    nature: "The overhanging sandstone ledge looks over the Catawba Valley and North Mountain.",
    didYouKnow: "Sunrise and sunset hikes here are a local tradition."
  },
  "rockfish-gap": {
    history: "In 1818 a commission met at Rockfish Gap and chose Charlottesville as the site of the University of Virginia. Today the gap is where the Blue Ridge Parkway ends and Skyline Drive begins.",
    nature: "North of the gap the trail enters Shenandoah National Park."
  },
  "big-meadows": {
    history: "President Franklin D. Roosevelt dedicated Shenandoah National Park at Big Meadows in 1936. Creating the park moved hundreds of mountain families from their homes, a hard part of its story.",
    nature: "The large open meadow is kept open on purpose. White-tailed deer graze it at dusk, and wild blueberries ripen in late summer.",
    didYouKnow: "The Civilian Conservation Corps built many of the park's stone walls and overlooks.",
    learnMore: { label: "Shenandoah National Park (NPS)", url: "https://www.nps.gov/shen/" }
  },
  "harpers-ferry": {
    history: "John Brown's 1859 raid on the armory here helped push the country toward the Civil War. The town is also home to the Appalachian Trail Conservancy's headquarters.",
    nature: "The Shenandoah and Potomac rivers meet here, cutting through the Blue Ridge. Thomas Jefferson called the view one of the most stupendous scenes in nature.",
    didYouKnow: "Hikers stop at the Conservancy to have their photo taken. It is often called the trail's \"psychological halfway point\".",
    learnMore: { label: "Harpers Ferry National Historical Park (NPS)", url: "https://www.nps.gov/hafe/" }
  },
  "pen-mar": {
    history: "The trail crosses the Mason-Dixon Line, surveyed in the 1760s. In the late 1800s Pen Mar Park was a popular railroad resort with dances and an observatory.",
    nature: "Pennsylvania's rocky ridges begin: a famous test for hikers' feet."
  },
  "delaware-water-gap": {
    history: "The trail crosses the Delaware River on a highway bridge from Pennsylvania into New Jersey.",
    nature: "Over millions of years the river cut a deep notch through Kittatinny Mountain, leaving Mount Tammany and Mount Minsi facing each other.",
    learnMore: { label: "Delaware Water Gap National Recreation Area (NPS)", url: "https://www.nps.gov/dewa/" }
  },
  "bear-mountain": {
    history: "The very first section of the Appalachian Trail opened here in 1923.",
    nature: "The trail passes through the Trailside Museums and Zoo, home to animals that cannot return to the wild. It also dips to the lowest elevation on the whole trail, barely above sea level.",
    didYouKnow: "Right after the zoo, the trail crosses the Hudson River on the Bear Mountain Bridge."
  },
  "mount-greylock": {
    history: "The highest point in Massachusetts. Henry David Thoreau climbed it in 1844, and Herman Melville could see it from his writing desk.",
    nature: "A small spruce-fir forest grows on top, more like northern New England than the valleys below.",
    didYouKnow: "The tall stone Veterans War Memorial Tower stands on the summit."
  },
  "hanover": {
    history: "Home of Dartmouth College, whose Outing Club helps look after the trail nearby.",
    nature: "The trail crosses the Connecticut River from Vermont into New Hampshire.",
    didYouKnow: "Town businesses are known for small kindnesses to passing hikers."
  },
  "mount-washington": {
    history: "In 1934 a weather station on Mount Washington measured a wind gust of 231 mph, a world record for decades.",
    nature: "Miles of trail run above treeline, through fragile alpine plants that grow only a few inches a year. Stay on the path!",
    didYouKnow: "The Mount Washington Cog Railway, opened in 1869, still climbs to the summit."
  },
  "mahoosuc-notch": {
    history: "Often called the hardest, or most fun, mile of the whole trail.",
    nature: "A jumble of house-sized boulders fills a narrow notch. Ice can hide in its shady caves into summer.",
    didYouKnow: "Hikers climb over, under and between the rocks, sometimes taking off their packs to squeeze through."
  },
  "monson": {
    history: "A slate-quarrying town. Monson slate is said to have been used for President Kennedy's grave at Arlington.",
    nature: "North of town is the Hundred-Mile Wilderness: lakes, loons and moose with almost no road crossings."
  },
  "katahdin": {
    history: "Governor Percival Baxter bought this land over many years and gave it to Maine to be kept \"forever wild\" as Baxter State Park. Thoreau wrote about climbing Katahdin in 1846.",
    nature: "Katahdin is a great granite mountain; its name is usually translated from Penobscot as \"the greatest mountain\".",
    didYouKnow: "A weathered wooden sign on the summit marks the end of the trail for northbound hikers.",
    learnMore: { label: "Baxter State Park", url: "https://baxterstatepark.org/" }
  }
});

export function landmarkStory(id) {
  return LANDMARK_STORIES[id] || null;
}
