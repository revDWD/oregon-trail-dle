import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const pages = ["index.html", "pages/log-mileage.html", "pages/progress.html"];

test("the site is static: no server or database, and only community.js touches the network", async () => {
  const client = await read("assets/js/script.js");
  assert.doesNotMatch(client, /fetch\(|XMLHttpRequest|\/api\//);
  const community = await read("assets/js/community.js");
  assert.doesNotMatch(community, /localStorage\.(get|set)Item\((?!SOURCE_KEY)/);
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
  assert.match(client, /function startHunt/);
  assert.match(client, /function resolveHunt/);
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
  assert.match(home, /data-next-hunt/);
  for (const page of [home, progress]) {
    assert.match(page, /data-map-features/);
    assert.match(page, /data-map-base/);
    assert.match(page, /us-states\.js/);
    assert.doesNotMatch(page, /hillshade|us-relief|usgs/i);
  }
  assert.match(await read("README.md"), /hand-placed/);
});
