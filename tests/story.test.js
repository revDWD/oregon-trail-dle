import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const read = (name) => readFile(fileURLToPath(new URL(`../assets/js/${name}`, import.meta.url)), "utf8");
const [config, storySource, huntSource, communitySource] = await Promise.all([
  read("trail-config.js"), read("trail-story.js"), read("hunt-game.js"), read("community.js")
]);

function loadStory() {
  const window = {};
  const context = { window, Math, Number, String, Object, Array };
  vm.runInNewContext(config, context);
  vm.runInNewContext(storySource, context);
  return { story: window.OTDLE_STORY, config: window.OTDLE_CONFIG };
}

function loadHunt() {
  const window = {};
  const context = { window, Math, Object, Set, Uint32Array, document: { addEventListener() {} } };
  vm.runInNewContext(huntSource, context);
  return window.OTDLE_HUNT;
}

const row = (id, name, miles, food, timestamp) => ({ id, name, miles, food, timestamp });

test("every landmark has educational details and events are configured", () => {
  const { config: cfg } = loadStory();
  for (const landmark of cfg.landmarks) {
    const details = cfg.landmarkDetails[landmark.id];
    assert.ok(details && details.importance && details.relevance && details.funFact, landmark.id);
  }
  assert.ok(cfg.trailEvents.length >= 5);
});

test("trail journal narrates contributions, landmarks, milestones and food", () => {
  const { story } = loadStory();
  const rows = [
    row("c", "Emily", 0, 95, "2026-01-03T00:00:00Z"),
    row("b", "David", 55, 0, "2026-01-02T00:00:00Z"),
    row("a", "Sarah", 270, 0, "2026-01-01T00:00:00Z")
  ];
  const text = story.buildJournal(rows, 325, 95).map((entry) => entry.text).join("\n");
  assert.match(text, /Emily hunted 95 lbs of food|Emily .*95 lbs/);
  assert.match(text, /holds 95 lbs of food/);
  assert.match(text, /David .*55 miles/);
  assert.match(text, /The expedition reached Fort Kearny\./);
  assert.match(text, /Sarah .*270 miles/);
});

test("journal notes crossing community mileage milestones", () => {
  const { story } = loadStory();
  const text = story.buildJournal([row("a", "Ann", 200, 0, "2026-01-01T00:00:00Z")], 10050, 0).map((e) => e.text).join("\n");
  assert.match(text, /crossed 10,000 total miles/);
});

test("camp scale grows with miles and food, and stays capped", () => {
  const { story } = loadStory();
  const early = story.campScale(0, 0);
  const late = story.campScale(2000, 1500);
  assert.equal(early.wagons, 1);
  assert.equal(early.stage, "early");
  assert.ok(late.wagons > early.wagons && late.settlers > early.settlers && late.crates > early.crates);
  const huge = story.campScale(1e9, 1e9);
  assert.ok(huge.wagons <= 8 && huge.tents <= 10 && huge.settlers <= 14 && huge.crates <= 12);
});

test("trail events are deterministic and appear every 250 miles", () => {
  const { story } = loadStory();
  assert.equal(story.currentEvent(249), null);
  assert.equal(story.currentEvent(250).atMiles, 250);
  assert.equal(story.currentEvent(260).id, story.currentEvent(499).id);
  assert.notEqual(story.currentEvent(250).id, story.currentEvent(500).id);
});

test("hunt: shots hit animals under the crosshair and award capped food", () => {
  const hunt = loadHunt();
  const state = hunt.newRound(() => 0.5);
  state.animals.push({ kind: "buffalo", x: 100, y: 100, dir: 1 });
  state.aim.x = 110;
  state.aim.y = 108;
  assert.deepEqual({ ...hunt.fire(state) }, { kind: "buffalo", food: 100 });
  assert.equal(state.food, 100);
  assert.equal(state.ammo, hunt.AMMO - 1);
  assert.equal(hunt.fire(state), null);

  for (let i = 0; i < 20; i += 1) {
    state.ammo = 5;
    state.animals.push({ kind: "buffalo", x: 0, y: 0, dir: 1 });
    state.aim.x = 5;
    state.aim.y = 5;
    hunt.fire(state);
  }
  assert.ok(state.food <= 400);
});

test("hunt: the round ends when time or ammo runs out and aim stays in bounds", () => {
  const hunt = loadHunt();
  const state = hunt.newRound(() => 0.3);
  hunt.step(state, 1, { dx: -1, dy: -1 });
  hunt.step(state, 1, { dx: -1, dy: -1 });
  hunt.step(state, 1, { dx: -1, dy: -1 });
  assert.equal(state.aim.x, 0);
  assert.equal(state.aim.y, 0);
  for (let i = 0; i < 40 && !state.over; i += 1) hunt.step(state, 1, { dx: 0, dy: 0 });
  assert.equal(state.over, true);
  assert.equal(hunt.fire(state), null);
});

test("community client sends name and food, sanitizes names, and summarizes the log", async () => {
  const bodies = [];
  const logRows = [
    { id: "2", miles_added: 0, food_added: 40, contributor_name: "Emily", kind: "hunt", timestamp: "2026-01-02T00:00:00Z" },
    { id: "1", miles_added: 30, food_added: 0, contributor_name: "David", kind: "miles", timestamp: "2026-01-01T00:00:00Z" }
  ];
  const fetch = async (url, options) => {
    if (url.includes("/rpc/add_community_contribution")) {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ total_miles: 30, total_food: 40, total_contributions: 2 }) };
    }
    return { ok: true, status: 200, json: async () => logRows };
  };
  const window = { OTDLE_SUPABASE: { url: "https://example.supabase.co", anonKey: "x".repeat(40) }, crypto: globalThis.crypto };
  const context = {
    window, fetch, console: { info() {}, error() {} },
    localStorage: { getItem: () => "device-1", setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, Uint8Array, Math, JSON, Number, Error, Map, Array
  };
  vm.runInNewContext(communitySource, context);
  const community = window.OTDLE_COMMUNITY;
  const snapshots = [];
  community.onChange((snapshot) => snapshots.push(snapshot));

  assert.doesNotMatch(community.cleanName("<script>"), /[<>]/);
  assert.equal(community.cleanName(""), "Traveler");
  assert.equal(community.cleanName("x".repeat(60)).length, 24);

  await community.submitFood(40, "Emily");
  assert.equal(bodies[0].p_food, 40);
  assert.equal(bodies[0].p_miles, 0);
  assert.equal(bodies[0].p_name, "Emily");
  await assert.rejects(community.submitFood(0, "Emily"), /Hunts add/);
  await assert.rejects(community.submitFood(501, "Emily"), /Hunts add/);

  await new Promise((resolve) => setImmediate(resolve));
  const last = snapshots.at(-1);
  assert.equal(last.totalFood, 40);
  assert.equal(last.largest[0].name, "David");
  assert.equal(last.contributors.length, 2);
});
