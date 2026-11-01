// Pure storytelling helpers: journal entries, camp scale and trail events derived from community data.
// No DOM, network or storage access; everything is deterministic so every visitor reads the same story.
(function () {
  "use strict";

  const CONFIG = window.OTDLE_CONFIG || {};
  const TRAIL_MILES = CONFIG.trailMiles || 2040;
  const MAX_JOURNAL = 20;

  const round2 = (value) => Math.round(value * 100) / 100;
  const format = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });

  const TRAVEL_LINES = [
    "{name} traveled {miles} miles west.",
    "{name} pushed the wagons {miles} miles along the trail.",
    "{name} added {miles} miles to the day's march."
  ];
  const HUNT_LINES = [
    "{name} hunted {food} lbs of food.",
    "{name} brought {food} lbs of game back to camp.",
    "{name} returned from the hunt with {food} lbs of meat."
  ];

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key]));
  }

  // Event cards repeat every eventEveryMiles; the card is picked by index so it never differs per browser.
  function eventAt(milestoneIndex) {
    const events = CONFIG.trailEvents || [];
    if (!events.length || milestoneIndex < 1) return null;
    return { ...events[(milestoneIndex - 1) % events.length], atMiles: milestoneIndex * (CONFIG.eventEveryMiles || 250) };
  }

  function currentEvent(totalMiles) {
    const every = CONFIG.eventEveryMiles || 250;
    return eventAt(Math.floor(Math.max(totalMiles, 0) / every));
  }

  // rows: newest first, as returned by the community client. Totals are the current community totals.
  function buildJournal(rows, totalMiles, totalFood, limit) {
    const landmarks = CONFIG.landmarks || [];
    const milestones = CONFIG.mileMilestones || [];
    const every = CONFIG.eventEveryMiles || 250;
    const entries = [];
    let miles = totalMiles;
    let food = totalFood;

    (rows || []).forEach((row, index) => {
      const after = miles;
      const before = round2(miles - row.miles);
      const foodAfter = food;

      const stamp = row.timestamp;
      const derived = [];
      for (let lap = 0; lap <= Math.floor(after / TRAIL_MILES); lap += 1) {
        landmarks.forEach((landmark) => {
          if (landmark.miles === 0 && lap === 0) return;
          const mark = lap * TRAIL_MILES + landmark.miles;
          if (before < mark && after >= mark) {
            derived.push({ kind: "landmark", text: `The expedition reached ${landmark.name}.` });
          }
        });
      }
      ((CONFIG.donnerParty || {}).stops || []).forEach((stop) => {
        if (stop.miles > 0 && before < stop.miles && after >= stop.miles) {
          derived.push({ kind: "donner", text: `Historically, the Donner Party reached ${stop.name} around ${stop.dateLabel}. ${stop.text}` });
        }
      });
      milestones.forEach((mark) => {
        if (before < mark && after >= mark) derived.push({ kind: "milestone", text: `The community crossed ${format(mark)} total miles.` });
      });
      for (let step = Math.floor(before / every) + 1; step <= Math.floor(after / every); step += 1) {
        const event = eventAt(step);
        if (event) derived.push({ kind: "event", text: `${event.title}. ${event.text}` });
      }

      derived.forEach((item, position) => entries.push({ key: `${row.id}-d${position}`, timestamp: stamp, ...item }));

      const values = { name: row.name, miles: format(row.miles), food: format(row.food) };
      if (row.miles > 0) {
        entries.push({ key: row.id, timestamp: stamp, kind: "travel", text: fill(TRAVEL_LINES[index % TRAVEL_LINES.length], values) });
      }
      if (row.food > 0) {
        entries.push({
          key: `${row.id}-food`,
          timestamp: stamp,
          kind: "hunt",
          text: `${fill(HUNT_LINES[index % HUNT_LINES.length], values)} The wagon train now holds ${format(foodAfter)} lbs of food.`
        });
      }
      miles = before;
      food = Math.max(round2(food - row.food), 0);
    });

    return entries.slice(0, limit || MAX_JOURNAL);
  }

  // Everything in the camp scene scales with the community totals; counts are capped to keep it light.
  function campScale(totalMiles, totalFood) {
    const miles = Math.max(totalMiles || 0, 0);
    const food = Math.max(totalFood || 0, 0);
    return {
      wagons: Math.min(1 + Math.floor(miles / 300), 8),
      tents: Math.min(Math.floor(miles / 200), 10),
      settlers: Math.min(2 + Math.floor(miles / 150), 14),
      fire: miles < 300 ? 1 : miles < 1000 ? 2 : 3,
      crates: Math.min(Math.floor(food / 100), 12),
      oxen: Math.min(Math.floor(miles / 250), 4),
      horses: Math.min(Math.floor(miles / 700), 3),
      dogs: miles >= 100 ? 1 : 0,
      stage: miles < 700 ? "early" : miles < 1500 ? "mid" : "late"
    };
  }

  function campRegion(totalMiles) {
    const miles = Math.max(totalMiles || 0, 0);
    if (miles >= 1750) return { id: "oregon", label: "Oregon Territory" };
    if (miles >= 973) return { id: "mountains", label: "Mountain country" };
    if (miles >= 688) return { id: "wyoming", label: "Wyoming high plains" };
    if (miles >= 319) return { id: "plains", label: "Great Plains" };
    return { id: "missouri", label: "Missouri" };
  }

  function campMonuments(totalMiles) {
    const miles = Math.max(totalMiles || 0, 0);
    return (CONFIG.landmarks || [])
      .filter((landmark) => landmark.miles > 0 && landmark.miles <= miles)
      .map((landmark) => ({ id: landmark.id, name: landmark.shortName || landmark.name, miles: landmark.miles }));
  }

  const hashText = (text) => {
    let hash = 0;
    String(text).split("").forEach((char) => { hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0; });
    return hash;
  };

  function timeOfDay(hour) {
    if (hour >= 21 || hour < 5) return "night";
    if (hour >= 18) return "dusk";
    if (hour < 8) return "dawn";
    return "day";
  }

  // Everyone sees the same weather: it depends only on the calendar day and the community's region of the trail.
  const WEATHER = {
    clear: { label: "Clear skies", text: "Clear skies over camp." },
    windy: { label: "Windy", text: "A steady wind snaps the wagon covers." },
    rain: { label: "Rain", text: "Rain drums on the wagon covers." },
    fog: { label: "Fog", text: "Morning fog hangs low over the camp." },
    snow: { label: "Snow", text: "Snow drifts down from the mountains." }
  };

  function weatherFor(totalMiles, dayNumber) {
    const mountains = Math.max(totalMiles || 0, 0) >= 1400;
    const pool = ["clear", "clear", "clear", "clear", "windy", "windy", "rain", "rain", "fog"];
    if (mountains) pool.push("snow", "snow", "snow");
    const id = pool[hashText(`${Math.floor(dayNumber || 0)}:${mountains ? "m" : "p"}`) % pool.length];
    return { id, ...WEATHER[id] };
  }

  // Settlers for the camp, built from the latest log rows (newest first). Top contributors come first,
  // then the most recent travelers; a fresh hunter is always included and shown returning to camp.
  function campPeople(rows, contributors, hunterName, limit) {
    const byName = new Map();
    (rows || []).forEach((row) => {
      const entry = byName.get(row.name) || { name: row.name, miles: 0, food: 0, firstSeen: row.timestamp, latest: row };
      entry.miles += row.miles || 0;
      entry.food += row.food || 0;
      entry.firstSeen = row.timestamp;
      byName.set(row.name, entry);
    });
    const order = [];
    (contributors || []).forEach((person) => { if (byName.has(person.name) && !order.includes(person.name)) order.push(person.name); });
    byName.forEach((entry, name) => { if (!order.includes(name)) order.push(name); });
    const max = limit || 8;
    let names = order.slice(0, max);
    if (hunterName && byName.has(hunterName) && !names.includes(hunterName)) names = names.slice(0, max - 1).concat(hunterName);
    const activities = ["walk", "sit", "carry", "tend"];
    return names.map((name, index) => {
      const entry = byName.get(name);
      return {
        name,
        miles: round2(entry.miles),
        food: round2(entry.food),
        firstSeen: entry.firstSeen,
        latest: { kind: entry.latest.food > 0 ? "hunt" : "travel", miles: entry.latest.miles, food: entry.latest.food, timestamp: entry.latest.timestamp },
        activity: name === hunterName ? "returning" : activities[(index + hashText(name)) % activities.length],
        seed: hashText(name)
      };
    });
  }

  // The newest hunt in the log, and whether it is recent enough (default 6 hours) to show the hunter walking in.
  function latestHunt(rows, nowMs, freshMs) {
    const row = (rows || []).find((item) => item.food > 0);
    if (!row) return null;
    const when = new Date(row.timestamp).getTime();
    const fresh = Number.isFinite(when) && Number.isFinite(nowMs) && nowMs - when >= 0 && nowMs - when <= (freshMs || 6 * 3600 * 1000);
    return { name: row.name, food: row.food, timestamp: row.timestamp, fresh };
  }

  // The camp celebrates a landmark for the next few miles after the wagon train reaches it.
  function celebrationAt(totalMiles, withinMiles) {
    const miles = Math.max(totalMiles || 0, 0);
    if (miles >= TRAIL_MILES) return null;
    const reach = withinMiles || 40;
    const passed = (CONFIG.landmarks || []).filter((landmark) => landmark.miles > 0 && landmark.miles <= miles);
    const last = passed[passed.length - 1];
    return last && miles - last.miles <= reach ? { name: last.name, miles: last.miles } : null;
  }

  // Where the Donner Party stood at the same mileage: last stop passed, next stop, and miles between.
  function donnerAt(totalMiles) {
    const stops = (CONFIG.donnerParty || {}).stops || [];
    if (!stops.length) return null;
    const miles = Math.max(totalMiles || 0, 0);
    let index = 0;
    stops.forEach((stop, i) => { if (stop.miles <= miles) index = i; });
    const next = stops[index + 1] || null;
    return { previous: stops[index], next, milesToNext: next ? Math.max(Math.round(next.miles - miles), 0) : 0, finished: !next };
  }

  function unlockedDonnerMembers(totalMiles) {
    const miles = Math.max(totalMiles || 0, 0);
    return (CONFIG.donnerMemorial || []).map((person) => ({ ...person, unlocked: miles >= person.unlockAt }));
  }

  window.OTDLE_STORY = { buildJournal, campScale, campRegion, campMonuments, currentEvent, donnerAt, timeOfDay, weatherFor, campPeople, latestHunt, celebrationAt, unlockedDonnerMembers, weatherInfo: (id) => ({ id, ...(WEATHER[id] || WEATHER.clear) }) };
})();
