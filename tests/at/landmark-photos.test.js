import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAllowedLicense, plainText, choosePhoto, photoEntry, renderPhotosModule } from "../../scripts/lib/commons.mjs";
import { LANDMARK_PHOTOS } from "../../assets/js/at/trail/landmark-photos.js";
import { LANDMARK_STORIES } from "../../assets/js/at/trail/landmark-stories.js";
import { APPALACHIAN_TRAIL } from "../../assets/js/at/trail/appalachian-trail.js";

const page = (title, { index = 1, license = "CC BY-SA 4.0", artist = "<a href='x'>Jane &amp; Co</a>", width = 4000, height = 2600, mime = "image/jpeg" } = {}) => ({
  title, index,
  imageinfo: [{ mime, width, height, thumburl: `https://upload.wikimedia.org/thumb/${index}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
    extmetadata: { LicenseShortName: { value: license }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
      Artist: { value: artist }, ImageDescription: { value: "<p>View from the <b>summit</b></p>" }, DateTimeOriginal: { value: "2019-10-05 10:00" } } }]
});

test("only public domain, CC0, CC BY and CC BY-SA photos are allowed", () => {
  ["Public domain", "PD-USGov-Interior-NPS", "CC0", "CC BY 2.0", "CC BY-SA 4.0", "CC-BY-SA-3.0"].forEach((l) => assert.ok(isAllowedLicense(l), l));
  ["CC BY-NC 2.0", "CC BY-ND 4.0", "CC BY-NC-SA 3.0", "GFDL", "Fair use", "", "All rights reserved"].forEach((l) => assert.ok(!isAllowedLicense(l), l));
});

test("the chosen photo is the best-ranked landscape JPEG with an allowed license and a credit", () => {
  const pages = [
    page("File:Katahdin portrait.jpg", { index: 1, width: 2000, height: 3000 }),
    page("File:Katahdin NC.jpg", { index: 2, license: "CC BY-NC 2.0" }),
    page("File:Katahdin trail map.jpg", { index: 3 }),
    page("File:Katahdin anon.jpg", { index: 4, artist: "" }),
    page("File:Katahdin small.jpg", { index: 5, width: 800, height: 500 }),
    page("File:Katahdin.png", { index: 6, mime: "image/png" }),
    page("File:Katahdin PD.jpg", { index: 8, license: "Public domain", artist: "" }),
    page("File:Katahdin from Abol.jpg", { index: 7 })
  ];
  assert.equal(choosePhoto(pages).title, "File:Katahdin from Abol.jpg");
  assert.equal(choosePhoto(pages.slice(0, 6)), null);
  const entry = photoEntry("katahdin", pages.at(-1), "Mount Katahdin");
  assert.deepEqual(entry, { src: "assets/img/landmarks/katahdin.jpg", alt: "Mount Katahdin: View from the summit", credit: "Jane & Co",
    license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Katahdin from Abol.jpg", year: "2019" });
  assert.equal(plainText("a".repeat(200), 10).length, 10);
  assert.match(renderPhotosModule({ katahdin: entry }), /export const LANDMARK_PHOTOS = Object\.freeze\(\{\n  "katahdin"/);
});

test("every landmark photo is credited, openly licensed, linked to its source and self-hosted", () => {
  const ids = new Set(APPALACHIAN_TRAIL.landmarks.map((l) => l.id));
  const photos = [...Object.entries(LANDMARK_PHOTOS), ...Object.entries(LANDMARK_STORIES).filter(([, s]) => s.photo).map(([id, s]) => [id, s.photo])];
  photos.forEach(([id, p]) => {
    assert.ok(ids.has(id), `${id} is a landmark`);
    assert.ok(p.credit && p.alt && isAllowedLicense(p.license), `${id} credit, alt text, license`);
    assert.match(p.sourceUrl || "", /^https:\/\//, `${id} source link`);
    assert.match(p.src, /^assets\/img\/landmarks\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/, `${id} is self-hosted`);
    assert.ok(existsSync(p.src), `${p.src} exists`);
  });
});
