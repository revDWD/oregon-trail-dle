import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const pages = ["index.html", "pages/log-mileage.html", "pages/hunt.html", "pages/progress.html"];

test("the site is static: no server or database, and only community.js touches the network", async () => {
  const client = await read("assets/js/script.js");
  assert.doesNotMatch(client, /fetch\(|XMLHttpRequest|\/api\//);
  const community = await read("assets/js/community.js");
  assert.doesNotMatch(community, /localStorage\.(get|set)Item\((?!SOURCE_KEY|NAME_KEY)/);
  for (const gone of ["server", "db"]) {
    await assert.rejects(access(path.join(root, gone)));
  }
  const manifest = JSON.parse(await read("package.json"));
  assert.equal(manifest.dependencies, undefined);
});

test("miles and hunts persist in localStorage and drive the hunting minigame", async () => {
  const client = await read("assets/js/script.js");
  assert.match(client, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(client, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(client, /Math\.floor\(groupMiles \/ 5\)/);
});

test("pages have no collaborative wording or elements", async () => {
  for (const page of pages) {
    const html = await read(page);
    assert.doesNotMatch(html, /trail hands?|trail party|shared|data-participant|data-my-miles/i, page);
    assert.match(html, /script\.js/);
  }
});

test("pages keep the map, hunt, and hand-placed scenery", async () => {
  const [home, progress] = await Promise.all([read("index.html"), read("pages/progress.html")]);
  const hunt = await read("pages/hunt.html");
  assert.ok(home.indexOf("data-community-panel") < home.indexOf("data-trail-map"));
  assert.ok(home.indexOf("data-trail-map") < home.indexOf("data-camp-scene"));
  assert.ok(home.indexOf("data-camp-scene") < home.indexOf("data-community-miles"));
  assert.ok(home.indexOf("data-community-miles") < home.indexOf("data-community-recent"));
  assert.doesNotMatch(home, /data-trail-journal|data-recent-entries/);
  assert.match(home, /data-route-donner/);
  assert.match(home, /data-donner-card/);
  assert.doesNotMatch(await read("assets/js/script.js"), /"Live"/);
  assert.match(progress, /data-trail-journal/);
  assert.match(progress, /data-journal-filters/);
  assert.match(progress, /community\.js/);
  assert.match(hunt, /data-hunt-canvas/);
  assert.match(hunt, /hunt-game\.js/);
  assert.match(home, /data-map-features/);
  assert.match(home, /data-map-base/);
  assert.match(home, /us-states\.js/);
  assert.doesNotMatch(progress, /data-trail-map|data-community-panel/);
  assert.doesNotMatch(home, /data-hunt-location/);
  assert.doesNotMatch(home, /hillshade|us-relief|usgs/i);
  assert.match(await read("README.md"), /hand-placed/);
});

test("community text remains readable on parchment cards and its source is online", async () => {
  const [css, home, log] = await Promise.all([
    read("assets/css/style.css"),
    read("index.html"),
    read("pages/log-mileage.html")
  ]);
  assert.match(css, /\.trail-card,[\s\S]*?color:\s*var\(--ink\)/);
  assert.match(css, /\.community-stats strong\s*\{[^}]*color:\s*var\(--green-dark\)/);
  assert.match(home, /data-community-miles>Loading/);
  assert.match(log, /Your name and miles are posted to the Community Expedition/);
  assert.match(log, /Community miles persist online/);
});

test("mileage is not recorded locally when community service is unavailable", async () => {
  const client = await read("assets/js/script.js");
  const formHandler = client.slice(client.indexOf("function initializeLogForm"), client.indexOf("function refreshCampaign"));
  assert.match(formHandler, /Community contributions are unavailable\. No miles were saved/);
  assert.doesNotMatch(formHandler, /added to your journey/);
  assert.match(formHandler, /community\.submit\(rounded, nameField/);
  assert.match(client, /Delete this private journal entry\? Your community contribution will remain recorded/);
  assert.match(client, /Community contributions remain recorded online/);
});
