#!/usr/bin/env node
// Finds an openly licensed photo for each landmark on Wikimedia Commons, downloads an 1024 px copy to
// assets/img/landmarks/<id>.jpg and records its credit in assets/js/at/trail/landmark-photos.js.
// Needs internet access. Easiest: run the "Landmark photos" GitHub Action, which opens a PR to review.
//   node scripts/landmark-photos.mjs              fill in landmarks that have no photo yet
//   node scripts/landmark-photos.mjs --only=katahdin,max-patch --refresh   re-pick these (add bad picks to REJECTED first)
import { writeFile, mkdir, rm } from "node:fs/promises";
import { APPALACHIAN_TRAIL } from "../assets/js/at/trail/appalachian-trail.js";
import { LANDMARK_PHOTOS } from "../assets/js/at/trail/landmark-photos.js";
import { choosePhoto, photoEntry, renderPhotosModule } from "./lib/commons.mjs";

// Search terms that find the landmark itself (not the town hall or a trail sign).
const SEARCH = {
  "springer-mountain": "Springer Mountain plaque Appalachian Trail", "neel-gap": "Mountain Crossings Walasi-Yi Neel Gap",
  "bly-gap": "Bly Gap North Carolina Georgia", "nantahala": "Nantahala River rafting", "fontana-dam": "Fontana Dam Little Tennessee River",
  "clingmans-dome": "Clingmans Dome", "hot-springs": "Hot Springs North Carolina French Broad River",
  "max-patch": "Max Patch bald", "roan-highlands": "Roan Mountain grassy bald", "damascus": "Virginia Creeper Trail Damascus",
  "grayson-highlands": "Grayson Highlands ponies", "pearisburg": "Pearisburg Virginia",
  "dragons-tooth": "Dragons Tooth Virginia", "mcafee-knob": "McAfee Knob", "rockfish-gap": "Rockfish Gap Afton Mountain",
  "big-meadows": "Big Meadows Shenandoah meadow", "harpers-ferry": "Harpers Ferry", "pen-mar": "Pen Mar Park",
  "delaware-water-gap": "Delaware Water Gap", "bear-mountain": "Bear Mountain Bridge Hudson",
  "mount-greylock": "Mount Greylock", "hanover": "Dartmouth College Hanover", "mount-washington": "Presidential Range Mount Washington",
  "mahoosuc-notch": "Mahoosuc Notch", "monson": "Monson Maine", "katahdin": "Mount Katahdin"
};

// Commons files a human reviewed and rejected (wrong place, off-topic or unsuitable); never pick them again.
const REJECTED = new Set([
  "File:21-07-024-dowdell.jpg", "File:South Mountain, Maryland (7235278532).jpg",
  "File:Jason Mays searches for snails uphill from the Nantahala River (47967213478).jpg",
  "File:Fontana Village Resort in Fontana Dam, North Carolina, and Graham County 01.jpg",
  "File:Hurricane Helene Damage (Damascus, VA).jpg", "File:Bathroom at Big Meadows Campground Shenandoah 2022-06-19 12-20-55 1.jpg"
]);

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const only = args.only ? new Set(args.only.split(",")) : null;
const headers = { "User-Agent": "ATFitnessTracker-landmark-photos/1.0 (https://atfitnesstracker.abbydavid.com)" };
const photos = { ...LANDMARK_PHOTOS };

async function search(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({ action: "query", format: "json", formatversion: "2", generator: "search", gsrnamespace: "6", gsrlimit: "20",
    gsrsearch: `${query} filetype:bitmap`, prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1024",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription|DateTimeOriginal" }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Commons search failed (${res.status}) for ${query}`);
  return (await res.json()).query?.pages || [];
}

await mkdir("assets/img/landmarks", { recursive: true });
for (const landmark of APPALACHIAN_TRAIL.landmarks) {
  if (only && !only.has(landmark.id)) continue;
  if (photos[landmark.id] && !args.refresh) continue;
  const page = choosePhoto((await search(SEARCH[landmark.id] || landmark.name)).filter((p) => !REJECTED.has(p.title)));
  if (!page) {
    if (args.refresh && photos[landmark.id]) { // a re-pick found nothing better: fall back to pixel art
      delete photos[landmark.id];
      await rm(`assets/img/landmarks/${landmark.id}.jpg`, { force: true });
    }
    console.log(`- ${landmark.id}: no suitable openly licensed photo found`); continue;
  }
  const img = await fetch(page.imageinfo[0].thumburl, { headers });
  if (!img.ok) { console.log(`- ${landmark.id}: download failed (${img.status})`); continue; }
  await writeFile(`assets/img/landmarks/${landmark.id}.jpg`, Buffer.from(await img.arrayBuffer()));
  photos[landmark.id] = photoEntry(landmark.id, page, landmark.name);
  console.log(`+ ${landmark.id}: ${page.title} (${photos[landmark.id].license}, ${photos[landmark.id].credit})`);
  await new Promise((r) => setTimeout(r, 500)); // be gentle with the Commons API
}
await writeFile("assets/js/at/trail/landmark-photos.js", renderPhotosModule(photos));
