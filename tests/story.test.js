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
  assert.equal(story.campRegion(0).id, "missouri");
  assert.equal(story.campRegion(500).id, "plains");
  assert.equal(story.campRegion(800).id, "wyoming");
  assert.equal(story.campRegion(1200).id, "mountains");
  assert.equal(story.campRegion(1900).id, "oregon");
  assert.equal(story.campMonuments(0).length, 0);
  assert.ok(story.campMonuments(900).some((item) => item.id === "independence_rock"));
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

test("Donner Party data lines up with landmarks and the journal", () => {
  const { story, config: cfg } = loadStory();
  const party = cfg.donnerParty;
  assert.ok(party.stops.length >= 10);
  party.stops.forEach((stop, index) => {
    assert.ok(stop.text && stop.education && stop.dateLabel, stop.id);
    if (index) assert.ok(stop.miles > party.stops[index - 1].miles, `${stop.id} is in route order`);
  });
  cfg.landmarks.forEach((landmark) => assert.ok(cfg.donnerNotes[landmark.id], `${landmark.id} has a Donner note`));
  assert.equal(story.donnerAt(0).previous.id, "independence");
  assert.equal(story.donnerAt(700).previous.id, "fort_laramie");
  assert.equal(story.donnerAt(700).next.id, "independence_rock");
  assert.equal(story.donnerAt(5000).finished, true);

  const entries = story.buildJournal([row("1", "Ann", 400, 0, "2026-01-01T00:00:00Z")], 700, 0);
  assert.ok(entries.some((entry) => entry.kind === "donner" && /Fort Laramie/.test(entry.text)));
  assert.equal(story.buildJournal([row("1", "Ann", 400, 0, "2026-01-01T00:00:00Z")], 700, 0, 1).length, 1);
  assert.equal(story.unlockedDonnerMembers(0).filter((person) => person.unlocked).length, 0);
  assert.equal(story.unlockedDonnerMembers(319).filter((person) => person.unlocked)[0].id, "george-donner");
  assert.equal(story.unlockedDonnerMembers(865).filter((person) => person.unlocked).length, 4);
  cfg.donnerMemorial.forEach((person) => assert.ok(person.biography && person.role && person.significance && person.outcome && person.source));
});

test("hunt: animals pause, turn and change speed, and a miss startles rabbits", () => {
  const hunt = loadHunt();
  let seed = 24;
  const state = hunt.newRound(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  state.spawnIn = 1000;
  state.animals.push({ kind: "deer", x: 100, y: 100, dir: 1 });
  const dirs = new Set();
  const mults = new Set();
  let paused = false;
  for (let i = 0; i < 300 && !state.over; i += 1) {
    hunt.step(state, 0.1, { dx: 0, dy: 0 });
    state.animals.filter((animal) => animal.kind === "deer").forEach((deer) => {
      dirs.add(deer.dir);
      mults.add(Math.round(deer.mult * 10));
      paused = paused || deer.pause > 0;
    });
  }
  assert.ok(mults.size > 2 && paused);
  assert.ok(dirs.size > 1);

  const fresh = hunt.newRound(() => 0.5);
  fresh.animals.push({ kind: "rabbit", x: 120, y: 100, dir: 1 });
  fresh.aim.x = 110;
  fresh.aim.y = 90;
  assert.equal(hunt.fire(fresh), null);
  assert.equal(fresh.animals[0].dir, 1);
  fresh.aim.x = 150;
  hunt.step(fresh, 0.3, { dx: 0, dy: 0 });
  fresh.animals[0].x = 100;
  hunt.fire(fresh);
  assert.equal(fresh.animals[0].dir, -1);
  assert.ok(fresh.puffs.length === 2);
  const hit = hunt.newRound(() => 0.5);
  hit.animals.push({ kind: "deer", x: 100, y: 100, dir: 1 });
  hit.aim.x = 110;
  hit.aim.y = 108;
  hunt.fire(hit);
  assert.equal(hit.popups[0].text, "+50 lbs");
});

test("hunt: regional wildlife, automatic reload and accuracy are reported", () => {
  const hunt = loadHunt();
  assert.equal(hunt.ANIMALS.antelope.food, 55);
  assert.equal(hunt.ANIMALS.waterfowl.food, 14);
  assert.equal(hunt.ANIMALS.blacktail.food, 55);
  assert.equal(hunt.pickAnimal(() => 0.3, "prairie"), "antelope");
  assert.equal(hunt.pickAnimal(() => 0.6, "riverbank"), "waterfowl");
  assert.equal(hunt.pickAnimal(() => 0.8, "mountains"), "bear");
  const state = hunt.newRound(() => 0.5, { biome: "prairie" });
  for (let shot = 0; shot < 4; shot += 1) {
    state.animals.push({ kind: "deer", x: 100, y: 100, dir: 1 });
    state.aim.x = 110;
    state.aim.y = 108;
    assert.ok(hunt.fire(state));
    if (shot < 3) hunt.step(state, 0.3, { dx: 0, dy: 0 });
  }
  assert.equal(state.shots, 4);
  assert.equal(state.hits, 4);
  assert.equal(state.reload, 1.1);
  assert.equal(state.clip, 0);
  assert.equal(hunt.fire(state), null);
  hunt.step(state, 1.1, { dx: 0, dy: 0 });
  assert.equal(state.clip, 4);
  assert.equal(state.reload, 0);
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

test("weather and time of day are deterministic, with snow only in the mountains", () => {
  const { story } = loadStory();
  assert.equal(story.weatherFor(500, 20000).id, story.weatherFor(500, 20000).id);
  for (let day = 0; day < 200; day += 1) {
    assert.notEqual(story.weatherFor(500, day).id, "snow");
  }
  const seen = new Set();
  for (let day = 0; day < 200; day += 1) seen.add(story.weatherFor(1600, day).id);
  assert.ok(seen.has("snow"));
  assert.equal(story.timeOfDay(2), "night");
  assert.equal(story.timeOfDay(12), "day");
});

test("camp people, fresh hunts and celebrations come from the community log", () => {
  const { story } = loadStory();
  const now = Date.parse("2025-01-02T12:00:00Z");
  const rows = [
    { id: 2, name: "Sarah", kind: "food", miles: 0, food: 84, timestamp: "2025-01-02T10:00:00Z" },
    { id: 1, name: "David", kind: "miles", miles: 30, food: 0, timestamp: "2025-01-01T10:00:00Z" }
  ];
  const people = story.campPeople(rows, [], null);
  assert.equal(people.map((person) => person.name).sort().join(","), "David,Sarah");
  assert.equal(people.find((person) => person.name === "Sarah").food, 84);
  assert.equal(story.latestHunt(rows, now).fresh, true);
  assert.equal(story.latestHunt(rows, now + 7 * 3600 * 1000).fresh, false);
  assert.ok(story.celebrationAt(330));
  assert.equal(story.celebrationAt(100), null);
});

test("hunt: new animals and grounds have distinct weights and herds flee together", () => {
  const hunt = loadHunt();
  assert.ok(hunt.ANIMALS.turkey && hunt.ANIMALS.elk);
  assert.ok(hunt.ANIMALS.turkey.food < hunt.ANIMALS.elk.food);
  assert.equal(Object.keys(hunt.BIOMES).length, 6);
  assert.equal(hunt.biomeForMiles(0), "grassland");
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(hunt.pickAnimal(() => i / 200, "mountains"));
  assert.ok(!seen.has("buffalo"));
  const state = hunt.newRound(() => 0.5, { biome: "forest", weather: "rain" });
  assert.equal(state.biome, "forest");
  state.animals.push({ kind: "deer", x: 100, y: 100, dir: 1, herdId: 1 }, { kind: "deer", x: 300, y: 150, dir: 1, herdId: 1 });
  state.aim = { x: 105, y: 105 };
  hunt.fire(state);
  state.aim = { x: 0, y: 0 };
  hunt.fire(state);
  assert.ok(state.ammo < hunt.AMMO);
});