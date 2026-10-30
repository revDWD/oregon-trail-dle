import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = await readFile(fileURLToPath(new URL("../assets/js/script.js", import.meta.url)), "utf8");
const configSource = await readFile(fileURLToPath(new URL("../assets/js/trail-config.js", import.meta.url)), "utf8");

function load(initial) {
  const data = new Map(initial ? [["oregon-trail-dle:v1", initial]] : []);
  const localStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
  const expose = {};
  const window = { localStorage, crypto: webcrypto, __OTDLE_EXPOSE__: expose };
  const document = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, body: { dataset: {} } };
  const console = { warn() {} };
  const context = vm.createContext({ window, document, console, Intl, Math, Date, JSON, Number, Set, Map, Uint32Array, Error, Array, Object, String, Boolean, Element: class {} });
  vm.runInContext(configSource, context);
  vm.runInContext(source, context);
  return { api: expose.api, data };
}

test("landmark milestones and achievements are recorded once, with historical dates", () => {
  const { api } = load();
  api.addEntry(350, "2026-01-01", "");
  const first = api.recordProgress();
  assert.ok(first.some((r) => r.key === "season:1:landmark:fort_kearny" && r.date === "2026-01-01"));
  assert.ok(first.some((r) => r.key === "achievement:miles_100"));
  assert.equal(api.recordProgress().length, 0);
  api.deleteEntry(api.buildState().entries[0].id);
  assert.equal(api.recordProgress().length, 0);
  assert.ok(api.buildState().journal.length >= 3);
});

test("completing the trail starts a new season and keeps lifetime totals", () => {
  const { api } = load();
  api.addEntry(1000, "2026-01-01", "");
  api.addEntry(1000, "2026-01-03", "");
  api.addEntry(140, "2026-01-05", "");
  let state = api.buildState();
  assert.equal(state.season, 2);
  assert.equal(state.seasonMiles, 100);
  assert.equal(state.groupMiles, 2140);
  assert.equal(state.seasons[0].days, 5);
  assert.equal(state.seasons[1].completedDate, null);
  const keys = api.recordProgress().map((r) => r.key);
  assert.ok(keys.includes("season:1:complete") && keys.includes("season:2:start") && keys.includes("achievement:oregon_complete"));
  assert.equal(new Set(keys).size, keys.length);
  api.addEntry(1000, "2026-01-06", "");
  api.addEntry(940, "2026-01-06", "");
  state = api.buildState();
  assert.equal(state.season, 3);
  assert.equal(state.seasons[1].days, 2);
  assert.equal(state.groupMiles, 4080);
});

test("journal entries survive sanitizing; bad ones are dropped", () => {
  const raw = JSON.stringify({ entries: [], hunts: [], journal: [
    { key: "a", type: "landmark", season: 1, date: "2026-01-01", title: "ok", text: "t" },
    { key: "a", type: "landmark", season: 1, date: "2026-01-01", title: "dup" },
    { key: "b", type: "bogus", date: "2026-01-01", title: "x" },
    { key: "c", type: "event", date: "nope", title: "x" }
  ] });
  const { api } = load(raw);
  assert.equal(JSON.stringify(api.buildState().journal.map((r) => r.key)), '["a"]');
});

test("saves are versioned, round-trip, and can be cleared", () => {
  const { api, data } = load();
  assert.equal(api.hasSave(), false);
  api.addEntry(12, "2026-01-01", "walk");
  assert.equal(api.hasSave(), true);
  const saved = JSON.parse(data.get("oregon-trail-dle:v1"));
  assert.equal(saved.version, 1);
  assert.ok(!Number.isNaN(Date.parse(saved.timestamp)));
  assert.equal(saved.gameState.entries[0].miles, 12);
  const reloaded = load(data.get("oregon-trail-dle:v1"));
  assert.equal(reloaded.api.buildState().groupMiles, 12);
  api.clearSave();
  assert.equal(api.hasSave(), false);
  assert.equal(api.buildState().groupMiles, 0);
});

test("legacy unversioned saves still load and corrupt envelopes fall back safely", () => {
  const legacy = load(JSON.stringify({ entries: [{ id: "a", miles: 7, date: "2026-01-01" }], hunts: [] }));
  assert.equal(legacy.api.buildState().groupMiles, 7);
  for (const raw of ["{not json", JSON.stringify({ version: "x", gameState: {} }), JSON.stringify({ version: 1, gameState: { entries: 5 } })]) {
    const { api, data } = load(raw);
    assert.equal(api.buildState().groupMiles, 0);
    assert.equal(data.get("oregon-trail-dle:v1:unreadable"), raw);
  }
});

test("every 5 miles earns exactly one hunt", () => {
  const { api } = load();
  api.addEntry(4.9, "2026-01-01", "");
  assert.equal(api.buildState().hunt.remaining, 0);
  api.addEntry(0.1, "2026-01-02", "");
  assert.equal(api.buildState().hunt.remaining, 1);
  api.startHunt();
  api.startHunt();
  assert.equal(api.buildState().hunt.active.milestoneMiles, 5);
  api.resolveHunt("bush");
  assert.equal(api.buildState().hunt.remaining, 0);
  assert.throws(() => api.startHunt());
});

test("a hunt is won only when the pick matches and food stays in range", () => {
  const { api } = load();
  api.addEntry(500, "2026-01-01", "");
  let wins = 0;
  const rounds = 60;
  for (let i = 0; i < rounds; i++) {
    api.startHunt();
    api.resolveHunt(["tree", "bush", "log"][i % 3]);
    const { recent } = api.buildState().hunt;
    assert.equal(recent.succeeded, recent.selectedLocation === recent.location);
    assert.equal(recent.succeeded ? recent.foodAwarded > 0 : recent.foodAwarded === 0, true);
    if (recent.succeeded) wins++;
  }
  assert.ok(wins > 5 && wins < 40, `unexpected win count ${wins}`);
  assert.throws(() => api.resolveHunt("tree"));
});

test("damaged saves are sanitized and unreadable ones are preserved", () => {
  const bad = JSON.stringify({
    entries: [{ miles: "x", date: "2026-01-01" }, { id: "a", miles: 3, date: "2026-02-30" }, { id: "b", miles: 2.5, date: "2026-01-05", notes: "ok" }],
    hunts: [{ selected: "nowhere" }]
  });
  const { api } = load(bad);
  const state = api.buildState();
  assert.equal(state.groupMiles, 2.5);
  assert.equal(state.entries.length, 1);

  const garbage = load("{not json");
  assert.equal(garbage.api.buildState().groupMiles, 0);
  assert.equal(garbage.data.get("oregon-trail-dle:v1:unreadable"), "{not json");
});

test("backup import validates and entries can be deleted", () => {
  const { api } = load();
  assert.throws(() => api.importBackup("[]"));
  api.importBackup(JSON.stringify({ entries: [{ id: "q", miles: 7, date: "2026-03-01" }], hunts: [] }));
  assert.equal(api.buildState().groupMiles, 7);
  api.deleteEntry("q");
  assert.equal(api.buildState().groupMiles, 0);
});
