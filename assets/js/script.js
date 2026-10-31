(function () {
  "use strict";

  const CONFIG = window.OTDLE_CONFIG;
  const TRAIL_MILES = CONFIG.trailMiles;
  const MAX_ENTRY_MILES = 1000;
  const MAP_PROJECTION = {
    phi1: 29.5 * Math.PI / 180,
    phi2: 45.5 * Math.PI / 180,
    phi0: 37.5 * Math.PI / 180,
    lambda0: -96 * Math.PI / 180,
    minX: -0.368884145,
    maxX: 0.353111789,
    minY: -0.210806155,
    maxY: 0.245812912,
    scale: 1195.745075957,
    offsetX: 68.338458614,
    offsetY: 12
  };
  const HUNT_LOCATIONS = [
    { id: "tree", name: "Old pine", icon: "🌲" },
    { id: "bush", name: "Sagebrush", icon: "🌿" },
    { id: "log", name: "Fallen log", icon: "🪵" }
  ];
  const HUNT_ANIMALS = [
    { id: "rabbit", name: "rabbit", icon: "🐇" },
    { id: "turkey", name: "turkey", icon: "🦃" },
    { id: "deer", name: "deer", icon: "🦌" },
    { id: "bison", name: "bison", icon: "🦬" }
  ];
  let campaignState = null;
  // Copied because getRouteModel rewrites miles to match the drawn route.
  const LANDMARKS = CONFIG.landmarks.map((landmark) => ({ ...landmark }));


  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) ||
        date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[3])) {
      return null;
    }
    return date;
  }

  const STORAGE_KEY = "oregon-trail-dle:v1";
  const HUNT_FOOD = { rabbit: [1, 3], turkey: [2, 4], deer: [4, 7], bison: [6, 10] };
  let memoryStore = null;
  let storageWarning = false;

  function emptyStore() {
    return { entries: [], hunts: [], journal: [] };
  }

  const JOURNAL_TYPES = ["landmark", "seasonStart", "seasonComplete", "achievement", "event"];
  const MAX_JOURNAL = 1000;

  const HUNT_LOCATION_IDS = HUNT_LOCATIONS.map((item) => item.id);
  const HUNT_ANIMAL_IDS = HUNT_ANIMALS.map((item) => item.id);

  // Drops anything malformed so a damaged save or bad import can never produce NaN miles or crash the page.
  function sanitizeStore(parsed) {
    if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.hunts)) return null;
    const seen = new Set();
    const entries = [];
    parsed.entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const miles = Number(entry.miles);
      if (!Number.isFinite(miles) || miles < 0.1 || miles > MAX_ENTRY_MILES) return;
      if (typeof entry.date !== "string" || !parseDate(entry.date)) return;
      let id = typeof entry.id === "string" && entry.id ? entry.id : `${Date.now().toString(36)}${randomInt(1e6).toString(36)}`;
      while (seen.has(id)) id += "x";
      seen.add(id);
      entries.push({
        id,
        miles: Math.round(miles * 100) / 100,
        date: entry.date,
        notes: typeof entry.notes === "string" ? entry.notes.slice(0, 240) : ""
      });
    });
    const hunts = [];
    parsed.hunts.forEach((hunt, index) => {
      if (!hunt || typeof hunt !== "object") return;
      const finished = HUNT_LOCATION_IDS.includes(hunt.selected);
      if (hunt.selected !== null && !finished) return;
      if (finished && (!HUNT_LOCATION_IDS.includes(hunt.hidden) || !HUNT_ANIMAL_IDS.includes(hunt.animal))) return;
      const food = Number(hunt.food);
      hunts.push({
        milestoneMiles: (hunts.length + 1) * 5,
        hidden: finished ? hunt.hidden : null,
        animal: HUNT_ANIMAL_IDS.includes(hunt.animal) ? hunt.animal : HUNT_ANIMALS[0].id,
        selected: finished ? hunt.selected : null,
        succeeded: finished && hunt.selected === hunt.hidden,
        food: finished && hunt.selected === hunt.hidden && Number.isFinite(food) && food > 0 ? Math.floor(food) : 0
      });
    });
    // Only the last hunt may still be waiting for a pick.
    const open = hunts.findIndex((hunt) => hunt.selected === null);
    if (open !== -1) hunts.length = open + 1;
    const journal = [];
    const journalKeys = new Set();
    (Array.isArray(parsed.journal) ? parsed.journal : []).forEach((item) => {
      if (!item || typeof item !== "object" || journal.length >= MAX_JOURNAL) return;
      if (typeof item.key !== "string" || !item.key || item.key.length > 80 || journalKeys.has(item.key)) return;
      if (!JOURNAL_TYPES.includes(item.type) || typeof item.title !== "string" || !item.title) return;
      if (typeof item.date !== "string" || !parseDate(item.date)) return;
      const season = Math.floor(Number(item.season));
      journalKeys.add(item.key);
      journal.push({
        key: item.key,
        type: item.type,
        season: Number.isFinite(season) && season >= 1 ? season : 1,
        date: item.date,
        title: item.title.slice(0, 120),
        text: typeof item.text === "string" ? item.text.slice(0, 300) : ""
      });
    });
    return { entries, hunts, journal };
  }

  // Saves are stored as { version, timestamp, gameState }. Add an entry to SAVE_MIGRATIONS[n] to upgrade
  // a version-n gameState to version n+1 whenever the store shape changes, then bump SAVE_VERSION.
  const SAVE_VERSION = 1;
  const SAVE_MIGRATIONS = {};

  function migrateGameState(gameState, version) {
    let state = gameState;
    for (let v = version; v < SAVE_VERSION; v += 1) {
      if (SAVE_MIGRATIONS[v]) state = SAVE_MIGRATIONS[v](state);
    }
    return state;
  }

  // Accepts the versioned envelope or the original unversioned { entries, hunts } save; returns a clean store or null.
  function parseSave(raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.gameState && typeof parsed.gameState === "object") {
      const version = Number(parsed.version);
      if (!Number.isInteger(version) || version < 1) return null;
      return sanitizeStore(migrateGameState(parsed.gameState, version));
    }
    return sanitizeStore(parsed);
  }

  function loadStore() {
    if (memoryStore) return memoryStore;
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      storageWarning = true;
      return emptyStore();
    }
    if (!raw) return emptyStore();
    try {
      const clean = parseSave(raw);
      if (clean) return clean;
    } catch {
      // fall through to the recovery copy below
    }
    // Keep an untouched copy of an unreadable save so the next write cannot destroy it.
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:unreadable`, raw);
    } catch {
      storageWarning = true;
    }
    console.warn("Oregon Trail DLE: the saved journey could not be read; starting fresh. A copy was kept for recovery.");
    return emptyStore();
  }

  // Every state change calls saveStore directly after the (single) mutation, so writes are already one small
  // synchronous call per user action; no debounce is needed.
  // If the browser blocks storage, keep working in memory for this visit and warn the user.
  function saveStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, timestamp: new Date().toISOString(), gameState: store }));
      memoryStore = null;
    } catch {
      memoryStore = store;
      storageWarning = true;
      console.warn("Oregon Trail DLE: browser storage is unavailable; progress will only last for this visit.");
    }
  }

  function hasSave() {
    if (memoryStore) return memoryStore.entries.length > 0 || memoryStore.hunts.length > 0;
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function clearSave() {
    memoryStore = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(`${STORAGE_KEY}:unreadable`);
    } catch {
      storageWarning = true;
    }
  }

  function randomInt(max) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function daysBetween(startDate, endDate) {
    return Math.round((parseDate(endDate) - parseDate(startDate)) / 86400000) + 1;
  }

  // Seasons are derived from lifetime miles: season n covers lifetime miles (n-1)*TRAIL_MILES to n*TRAIL_MILES.
  // Nothing is reset, so lifetime totals and past seasons always stay intact.
  function computeSeasons(entries) {
    const sorted = entries.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const seasons = [];
    const steps = [];
    const ensure = (number) => {
      while (seasons.length < number) seasons.push({ number: seasons.length + 1, startDate: null, completedDate: null, days: null });
      return seasons[number - 1];
    };
    ensure(1);
    let total = 0;
    sorted.forEach((entry) => {
      const before = total;
      total = round2(total + entry.miles);
      steps.push({ miles: total, date: entry.date });
      for (let number = Math.floor(before / TRAIL_MILES) + 1; (number - 1) * TRAIL_MILES < total; number++) {
        const season = ensure(number);
        if (!season.startDate) season.startDate = entry.date;
        if (total >= number * TRAIL_MILES && !season.completedDate) {
          season.completedDate = entry.date;
          season.days = daysBetween(season.startDate, entry.date);
        }
      }
    });
    ensure(Math.floor(total / TRAIL_MILES) + 1);
    // The date on which lifetime miles first reached a threshold (null if not yet reached).
    const dateAtMiles = (miles) => {
      const step = steps.find((item) => item.miles >= miles);
      return step ? step.date : null;
    };
    return { seasons, total, dateAtMiles };
  }

  function buildState() {
    const store = loadStore();
    const entries = store.entries.map((entry) => ({ ...entry, miles: Number(entry.miles) }));
    const groupMiles = Math.round(sumMiles(entries) * 100) / 100;
    const { seasons, dateAtMiles } = computeSeasons(entries);
    const season = Math.floor(groupMiles / TRAIL_MILES) + 1;
    const seasonMiles = round2(groupMiles - (season - 1) * TRAIL_MILES);
    const earned = Math.floor(groupMiles / 5);
    const last = store.hunts[store.hunts.length - 1];
    const active = last && last.selected === null ? { milestoneMiles: last.milestoneMiles } : null;
    const finished = store.hunts.filter((hunt) => hunt.selected !== null);
    const recent = finished[finished.length - 1];
    let streak = 0;
    for (let i = finished.length - 1; i >= 0 && finished[i].succeeded; i--) streak++;
    const food = finished.reduce((total, hunt) => total + hunt.food, 0);
    const won = finished.filter((hunt) => hunt.succeeded).length;
    return {
      participant: { miles: groupMiles },
      groupMiles,
      season,
      seasonMiles,
      seasons,
      dateAtMiles,
      journal: store.journal.slice(),
      metrics: {
        lifetimeMiles: groupMiles,
        seasonsCompleted: season - 1,
        huntsWon: won,
        foodGathered: food,
        entriesLogged: entries.length
      },
      entries,
      hunt: {
        earned,
        completed: finished.length,
        won,
        streak,
        remaining: Math.max(earned - store.hunts.length, 0),
        food,
        groupMiles,
        active,
        recent: recent ? {
          milestoneMiles: recent.milestoneMiles,
          location: recent.hidden,
          animal: recent.animal,
          selectedLocation: recent.selected,
          succeeded: recent.succeeded,
          foodAwarded: recent.food
        } : null
      }
    };
  }

  function addEntry(miles, date, notes) {
    const store = loadStore();
    store.entries.push({ id: `${Date.now().toString(36)}${randomInt(1e6).toString(36)}`, miles, date, notes });
    saveStore(store);
  }

  function startHunt() {
    const store = loadStore();
    const last = store.hunts[store.hunts.length - 1];
    if (last && last.selected === null) return;
    const state = buildState();
    if (state.hunt.remaining <= 0) throw new Error("Log 5 more miles to unlock the next trail search.");
    store.hunts.push({
      milestoneMiles: (store.hunts.length + 1) * 5,
      hidden: null,
      animal: HUNT_ANIMALS[randomInt(HUNT_ANIMALS.length)].id,
      selected: null,
      succeeded: false,
      food: 0
    });
    saveStore(store);
  }

  // The hiding place is chosen only when the player picks, so it can't be read from saved data beforehand.
  function resolveHunt(location) {
    const store = loadStore();
    const round = store.hunts[store.hunts.length - 1];
    if (!round || round.selected !== null) throw new Error("There is no active search. Start the next hunt first.");
    if (!HUNT_LOCATION_IDS.includes(location)) throw new Error("Choose one of the three hiding places.");
    const [min, max] = HUNT_FOOD[round.animal];
    round.hidden = HUNT_LOCATIONS[randomInt(HUNT_LOCATIONS.length)].id;
    round.selected = location;
    round.succeeded = location === round.hidden;
    round.food = round.succeeded ? min + randomInt(max - min + 1) : 0;
    saveStore(store);
  }

  function deleteEntry(id) {
    const store = loadStore();
    store.entries = store.entries.filter((entry) => entry.id !== id);
    saveStore(store);
  }

  function fillTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])));
  }

  function makeRecord(key, type, season, date, values) {
    const message = CONFIG.messages[type];
    return { key, type, season, date, title: fillTemplate(message.title, values), text: fillTemplate(message.text, values) };
  }

  // Lists every journey-log record the current progress has earned, driven entirely by CONFIG.
  // Keys are stable ids, so a record is only ever announced once even if entries are later deleted.
  function evaluateJourney(state) {
    getRouteModel();
    const today = localDateString(new Date());
    const records = [];
    state.seasons.forEach((season) => {
      const number = season.number;
      const base = (number - 1) * TRAIL_MILES;
      const finished = number < state.season;
      if (number > 1) {
        const previous = state.seasons[number - 2];
        records.push(makeRecord(`season:${number}:start`, "seasonStart", number, previous.completedDate || today, { season: number }));
      }
      LANDMARKS.forEach((landmark) => {
        if (landmark.miles <= 0 || landmark.miles >= TRAIL_MILES) return;
        if (!finished && state.seasonMiles < landmark.miles) return;
        records.push(makeRecord(`season:${number}:landmark:${landmark.id}`, "landmark", number, state.dateAtMiles(base + landmark.miles) || today, { ...landmark, season: number }));
      });
      if (finished) {
        records.push(makeRecord(`season:${number}:complete`, "seasonComplete", number, season.completedDate || today, { season: number, days: season.days }));
      }
    });
    CONFIG.achievements.forEach((achievement) => {
      if (!(state.metrics[achievement.metric] >= achievement.threshold)) return;
      let date = today;
      if (achievement.metric === "lifetimeMiles") date = state.dateAtMiles(achievement.threshold) || today;
      if (achievement.metric === "seasonsCompleted") date = (state.seasons[achievement.threshold - 1] || {}).completedDate || today;
      records.push(makeRecord(`achievement:${achievement.id}`, "achievement", state.season, date, achievement));
    });
    CONFIG.events.forEach((event) => {
      const miles = sumMiles(state.entries.filter((entry) => entry.date >= event.start && entry.date <= event.end));
      if (miles < event.goalMiles) return;
      records.push(makeRecord(`event:${event.id}`, "event", state.season, today > event.end ? event.end : today, { ...event, miles: formatNumber(miles), goal: formatNumber(event.goalMiles) }));
    });
    return records.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Appends newly earned records to the saved journey log and returns them so the UI can celebrate.
  function recordProgress() {
    const store = loadStore();
    const known = new Set(store.journal.map((item) => item.key));
    const fresh = evaluateJourney(buildState()).filter((record) => !known.has(record.key));
    if (!fresh.length) return [];
    store.journal.push(...fresh);
    if (store.journal.length > MAX_JOURNAL) store.journal.splice(0, store.journal.length - MAX_JOURNAL);
    saveStore(store);
    return fresh;
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "oregon-trail-dle", version: 1, ...loadStore() }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `oregon-trail-backup-${localDateString(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function importBackup(text) {
    let clean = null;
    try {
      clean = parseSave(text);
    } catch {
      clean = null;
    }
    if (!clean) throw new Error("That file is not an Oregon Trail DLE backup.");
    saveStore(clean);
    return clean;
  }

  function showAppError(error) {
    document.querySelectorAll("[data-storage-status]").forEach((element) => {
      element.textContent = error.message;
      element.hidden = false;
      element.setAttribute("role", "alert");
      element.classList.add("is-error");
    });
  }

  function showStorageWarning() {
    if (!storageWarning) return;
    showAppError(new Error("Your browser is blocking saved data, so miles will be lost when you leave this page. Allow site storage (or leave private browsing) to keep your journey."));
  }

  function renderCamp(hunt, message) {
    if (!hunt) return;
    const active = Boolean(hunt.active);
    const recent = hunt.recent;
    const animal = recent && HUNT_ANIMALS.find((item) => item.id === recent.animal);
    document.querySelectorAll("[data-camp-food]").forEach((element) => {
      element.textContent = formatNumber(hunt.food, 0);
    });
    document.querySelectorAll("[data-hunts-won]").forEach((element) => {
      element.textContent = `${hunt.won || 0} / ${hunt.completed || 0}`;
    });
    document.querySelectorAll("[data-hunt-streak]").forEach((element) => {
      element.textContent = String(hunt.streak || 0);
    });
    document.querySelectorAll("[data-hunts-remaining]").forEach((element) => {
      element.textContent = String(hunt.remaining);
    });
    document.querySelectorAll("[data-hunt-opportunity-note]").forEach((element) => {
      const remainingMiles = 5 - (hunt.groupMiles % 5);
      element.textContent = active
        ? `Search unlocked at mile ${formatNumber(hunt.active.milestoneMiles)}. Pick a hiding place.`
        : hunt.remaining > 0
          ? `You have ${formatNumber(hunt.remaining, 0)} search${hunt.remaining === 1 ? "" : "es"} ready from your mileage.`
          : `Every 5 miles unlocks a search. ${formatNumber(remainingMiles)} more ${remainingMiles === 1 ? "mile" : "miles"} to the next one.`;
    });

    document.querySelectorAll("[data-hunt-location]").forEach((button) => {
      const location = HUNT_LOCATIONS.find((item) => item.id === button.dataset.huntLocation);
      const revealed = recent && recent.milestoneMiles === (hunt.active && hunt.active.milestoneMiles || recent.milestoneMiles);
      const animalIsHere = revealed && recent.location === location.id;
      const isEmptyPick = revealed && !recent.succeeded && recent.selectedLocation === location.id;
      const icon = button.querySelector("[data-location-illustration]");
      const reveal = button.querySelector("[data-location-reveal]");
      if (icon) icon.textContent = animalIsHere ? animal.icon : location.icon;
      if (reveal) {
        reveal.textContent = animalIsHere
          ? `${animal.name[0].toUpperCase()}${animal.name.slice(1)} found`
          : isEmptyPick
            ? "Nothing here"
            : revealed
              ? "Quiet"
              : active
                ? "Choose here"
                : "Search locked";
      }
      button.classList.toggle("is-found", Boolean(animalIsHere));
      button.classList.toggle("is-empty", Boolean(isEmptyPick));
      button.disabled = !active;
      button.setAttribute("aria-label", animalIsHere
        ? `${location.name}: ${animal.name} found`
        : `${location.name}${isEmptyPick ? ": no animal here" : ""}`);
    });

    const nextHunt = document.querySelector("[data-next-hunt]");
    if (nextHunt) {
      nextHunt.hidden = active || hunt.remaining <= 0;
      nextHunt.disabled = hunt.remaining <= 0;
      nextHunt.textContent = hunt.completed === 0 ? "Begin the hunt" : "Search again";
    }
    const statusMessage = document.querySelector("[data-hunt-message]");
    if (statusMessage) {
      statusMessage.classList.remove("is-error");
      if (message) {
        statusMessage.textContent = message;
      } else if (active) {
        statusMessage.textContent = "Choose one hiding place to search.";
      } else if (recent) {
        const locationName = HUNT_LOCATIONS.find((item) => item.id === recent.location).name.toLowerCase();
        statusMessage.textContent = recent.succeeded
          ? `Well spotted! The ${animal.name} by the ${locationName} adds ${recent.foodAwarded} lb to your food stores.`
          : `The ${animal.name} slipped away from the ${locationName}; no food this time.`;
      } else {
        statusMessage.textContent = hunt.remaining > 0
          ? "A search is ready."
          : "Log miles to unlock the first search.";
      }
    }
  }

  function formatNumber(number, maximumFractionDigits) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: maximumFractionDigits || 1 }).format(number);
  }

  function formatMiles(number) {
    return `${formatNumber(number)} ${number === 1 ? "mile" : "miles"}`;
  }

  function formatDate(value, options) {
    const date = parseDate(value);
    if (!date) return value;
    return new Intl.DateTimeFormat(undefined, options || { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function sumMiles(entries) {
    return entries.reduce((total, entry) => total + entry.miles, 0);
  }

  function getLocation(totalMiles) {
    getRouteModel();
    const progressMiles = Math.min(totalMiles, TRAIL_MILES);
    let current = LANDMARKS[0].name;
    for (const landmark of LANDMARKS) {
      if (progressMiles >= landmark.miles) current = landmark.name;
    }
    return current;
  }

  function createEntryRow(entry, deletable) {
    const row = document.createElement("article");
    row.className = "entry-row";

    const date = document.createElement("time");
    date.className = "entry-date";
    date.dateTime = entry.date;
    date.textContent = formatDate(entry.date);

    const miles = document.createElement("strong");
    miles.className = "entry-miles";
    miles.textContent = formatMiles(entry.miles);

    const notes = document.createElement("span");
    notes.className = "entry-notes";
    notes.textContent = entry.notes || "No notes";

    row.append(date, miles, notes);
    if (deletable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "entry-delete";
      remove.dataset.deleteEntry = entry.id;
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${formatMiles(entry.miles)} entry from ${formatDate(entry.date)}`);
      row.append(remove);
    }
    return row;
  }

  function renderEntryList(container, entries, emptyText, deletable) {
    container.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }
    entries.forEach((entry) => container.append(createEntryRow(entry, deletable)));
  }

  function createSvgElement(name, attributes) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function projectMapPoint(coordinates) {
    const [longitude, latitude] = coordinates;
    const phi = latitude * Math.PI / 180;
    const lambda = longitude * Math.PI / 180;
    const { phi1, phi2, phi0, lambda0, scale, offsetX, offsetY } = MAP_PROJECTION;
    const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
    const C = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
    const rho0 = Math.sqrt(C - 2 * n * Math.sin(phi0)) / n;
    const rho = Math.sqrt(C - 2 * n * Math.sin(phi)) / n;
    const theta = n * (lambda - lambda0);
    const x = rho * Math.sin(theta);
    const y = rho0 - rho * Math.cos(theta);
    return {
      x: offsetX + (x - MAP_PROJECTION.minX) * scale,
      y: offsetY + (MAP_PROJECTION.maxY - y) * scale
    };
  }

  // Approximate emigrant route (lon, lat). Strings reference landmarks by shortName.
  const ROUTE_WAYPOINTS = [
    "Independence", [-95.3, 39.25], [-96.1, 39.5], [-96.65, 39.84], [-97.6, 40.15], [-98.3, 40.4],
    "Fort Kearny", [-99.6, 40.78], [-100.8, 41.05], [-101.7, 41.13], [-102.4, 41.45], [-103.07, 41.69],
    "Chimney Rock", "Scotts Bluff", "Fort Laramie", [-105.4, 42.4], [-106.3, 42.85],
    "Independence Rock", [-107.9, 42.47], "South Pass", [-109.4, 42.0], [-109.9, 41.5], "Fort Bridger",
    [-110.96, 42.08], [-111.6, 42.65], "Fort Hall", [-112.85, 42.79], [-113.7, 42.58], [-114.46, 42.56],
    [-115.3, 42.96], [-116.2, 43.62], [-116.98, 43.83], [-117.23, 44.28], [-117.83, 44.78],
    "Blue Mountains", [-118.8, 45.67], [-119.4, 45.92], [-120.2, 45.72], "The Dalles", [-121.9, 45.7],
    [-122.3, 45.55], "Oregon City"
  ];
  let routeModel = null;

  // Landmark mileposts are derived from the drawn route so one mile spans the same map distance everywhere.
  function getRouteModel() {
    if (routeModel) return routeModel;
    const points = [];
    const landmarkDistances = new Map();
    let length = 0;
    ROUTE_WAYPOINTS.forEach((waypoint) => {
      const landmark = typeof waypoint === "string" ? LANDMARKS.find((item) => item.shortName === waypoint) : null;
      const point = projectMapPoint(landmark ? landmark.coordinates : waypoint);
      if (points.length) {
        const previous = points[points.length - 1];
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
      }
      points.push({ ...point, distance: length });
      if (landmark) landmarkDistances.set(landmark, length);
    });
    routeModel = { points, length };
    LANDMARKS.forEach((landmark, index) => {
      if (index === 0) landmark.miles = 0;
      else if (index === LANDMARKS.length - 1) landmark.miles = TRAIL_MILES;
      else landmark.miles = Math.round(landmarkDistances.get(landmark) / length * TRAIL_MILES);
    });
    return routeModel;
  }

  function getRoutePath(fromMiles, toMiles) {
    const { points, length } = getRouteModel();
    const from = fromMiles / TRAIL_MILES * length;
    const to = toMiles / TRAIL_MILES * length;
    const pointAt = (distance) => {
      const index = Math.max(1, points.findIndex((point) => point.distance >= distance));
      const a = points[index - 1];
      const b = points[index];
      const portion = b.distance === a.distance ? 0 : (distance - a.distance) / (b.distance - a.distance);
      return { x: a.x + (b.x - a.x) * portion, y: a.y + (b.y - a.y) * portion };
    };
    const start = pointAt(from);
    const inner = points.filter((point) => point.distance > from && point.distance < to);
    const end = pointAt(to);
    return [start, ...inner, end].map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  }

  function getWagonPosition(svg, miles) {
    const { points, length } = getRouteModel();
    const distance = Math.max(0, Math.min(miles, TRAIL_MILES)) / TRAIL_MILES * length;
    const index = Math.max(1, points.findIndex((point) => point.distance >= distance));
    const a = points[index - 1];
    const b = points[index];
    const portion = b.distance === a.distance ? 0 : (distance - a.distance) / (b.distance - a.distance);
    return { x: a.x + (b.x - a.x) * portion, y: a.y + (b.y - a.y) * portion };
  }

  // Hand-placed (lon, lat) scenery so rivers and ranges sit where they really are on the projected map.
  const MAP_RIVERS = [
    { name: "Missouri", label: [-98.6, 43.35], points: [[-100.3, 44.4], [-98.5, 42.9], [-96.9, 42.5], [-96.0, 41.2], [-95.8, 40.2], [-94.6, 39.1], [-92.5, 38.95], [-90.2, 38.8]] },
    { name: "Mississippi", label: [-91.0, 36.0], points: [[-93.2, 44.9], [-91.2, 43.0], [-90.2, 41.5], [-91.4, 40.2], [-90.2, 38.8], [-90.1, 37.0], [-89.5, 36.0], [-90.5, 34.5], [-91.2, 33.0], [-91.6, 31.0], [-89.4, 29.1]] },
    { name: "Platte", points: [[-104.8, 42.1], [-103.7, 41.9], [-102.0, 41.2], [-100.8, 41.1], [-99.6, 40.75], [-98.0, 40.8], [-96.5, 41.05], [-95.9, 41.05]] },
    { name: "Snake", points: [[-110.6, 43.8], [-111.5, 43.5], [-112.4, 43.0], [-113.5, 42.6], [-115.0, 42.8], [-116.4, 43.7], [-116.9, 44.3], [-117.0, 45.0], [-116.6, 45.8], [-117.0, 46.4], [-119.0, 46.2]] },
    { name: "Columbia", points: [[-119.0, 46.2], [-119.4, 45.95], [-120.5, 45.7], [-121.2, 45.6], [-122.0, 45.6], [-122.8, 45.65], [-123.8, 46.2]] }
  ];
  const MAP_RANGES = [
    { name: "Rocky Mountains", label: [-107.2, 39.2], peaks: [[-112.5, 47.5], [-110.8, 46.0], [-110.3, 44.2], [-107.5, 41.0], [-106.4, 39.9], [-105.9, 38.2], [-106.0, 36.2]] },
    { name: "Cascades", label: [-119.6, 48.2], peaks: [[-121.6, 48.4], [-121.6, 46.8], [-121.8, 45.0], [-122.1, 43.5], [-122.2, 41.8]] },
    { name: "Sierra Nevada", label: [-121.4, 37.3], peaks: [[-120.3, 40.0], [-119.9, 38.7], [-118.9, 37.2], [-118.3, 36.0]] },
    { name: "Appalachians", label: [-80.4, 33.9], peaks: [[-78.4, 40.8], [-79.8, 39.0], [-81.4, 37.6], [-82.6, 36.2], [-83.6, 35.2]] }
  ];
  const MAP_WATERS = [
    { name: "PACIFIC", at: [-125.7, 44.2] },
    { name: "ATLANTIC OCEAN", at: [-71.5, 35.5] },
    { name: "GULF OF MEXICO", at: [-90.5, 27.6] },
    { name: "GREAT PLAINS", at: [-100.5, 37.3] }
  ];

  function renderStates(svg) {
    const base = svg.querySelector("[data-map-base]");
    if (!base || base.childElementCount || !window.OTDLE_STATES) return;
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${window.OTDLE_STATES}</svg>`, "image/svg+xml");
    Array.from(doc.documentElement.childNodes).forEach((node) => base.append(document.importNode(node, true)));
  }

  function renderFeatures(svg) {
    renderStates(svg);
    const layer = svg.querySelector("[data-map-features]");
    if (!layer) return;
    layer.replaceChildren();
    const at = (coords) => projectMapPoint(coords);
    const text = (className, coords, content, dx, dy) => {
      const point = at(coords);
      const element = createSvgElement("text", { class: className, x: point.x + (dx || 0), y: point.y + (dy || 0) });
      element.textContent = content;
      layer.append(element);
    };
    MAP_RIVERS.forEach((river) => {
      const d = river.points.map((coords, i) => {
        const point = at(coords);
        return `${i ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      }).join(" ");
      layer.append(createSvgElement("path", { class: "map-river", d }));
      if (river.label) text("map-feature-label map-river-label", river.label, river.name);
    });
    MAP_RANGES.forEach((range) => {
      range.peaks.forEach((coords) => {
        const point = at(coords);
        layer.append(createSvgElement("path", { class: "map-peak", d: `M${point.x - 7} ${point.y + 4}L${point.x} ${point.y - 7}L${point.x + 7} ${point.y + 4}Z` }));
        layer.append(createSvgElement("path", { class: "map-peak-cap", d: `M${point.x - 2.4} ${point.y - 2}L${point.x} ${point.y - 7}L${point.x + 2.4} ${point.y - 2}Z` }));
      });
      text("map-feature-label map-range-label", range.label, range.name.toUpperCase());
    });
    MAP_WATERS.forEach((water) => text("map-feature-label map-water-label", water.at, water.name));
  }

  function renderRoute(svg, progressMiles) {
    renderFeatures(svg);
    const remainingLayer = svg.querySelector("[data-route-remaining]");
    const completedLayer = svg.querySelector("[data-route-completed]");
    const stopLayer = svg.querySelector("[data-route-stops]");
    const wagonLayer = svg.querySelector("[data-wagon-layer]");
    if (!remainingLayer || !completedLayer || !stopLayer || !wagonLayer) return;

    remainingLayer.replaceChildren();
    completedLayer.replaceChildren();
    stopLayer.replaceChildren();
    wagonLayer.replaceChildren();

    getRouteModel();
    remainingLayer.append(createSvgElement("path", { d: getRoutePath(0, TRAIL_MILES), class: "route-remaining" }));
    if (progressMiles > 0) {
      completedLayer.append(createSvgElement("path", { d: getRoutePath(0, progressMiles), class: "route-completed" }));
    }

    LANDMARKS.forEach((landmark, index) => {
      const point = projectMapPoint(landmark.coordinates);
      const [offsetX, offsetY] = landmark.markerOffset || [0, 0];
      const markerX = point.x + offsetX;
      const markerY = point.y + offsetY;
      const marker = createSvgElement("g", {
        class: `map-waypoint${progressMiles >= landmark.miles ? " is-passed" : ""}`,
        role: "button",
        tabindex: "0",
        "data-landmark-index": index,
        "aria-pressed": "false",
        "aria-label": `${landmark.name}, mile ${formatNumber(landmark.miles)}`
      });
      const title = createSvgElement("title", {});
      title.textContent = `${landmark.name} · mile ${formatNumber(landmark.miles)}`;
      marker.append(title);

      if (markerX !== landmark.x || markerY !== landmark.y) {
        marker.append(createSvgElement("line", {
          class: "waypoint-leader",
          x1: point.x,
          y1: point.y,
          x2: markerX,
          y2: markerY
        }));
      }
      const circle = createSvgElement("circle", { cx: markerX, cy: markerY, r: 9 });
      const number = createSvgElement("text", { x: markerX, y: markerY + 3 });
      number.textContent = String(index + 1);
      marker.append(circle, number);
      stopLayer.append(marker);
    });

    const position = getWagonPosition(svg, progressMiles);
    const wagon = createSvgElement("g", {
      class: "map-wagon",
      transform: `translate(${position.x} ${position.y})`
    });
    wagon.append(
      createSvgElement("path", { class: "wagon-shadow", d: "M-16 12 Q0 14 18 11" }),
      createSvgElement("path", { class: "wagon-cover", d: "M-11 -4 C-13 -8 -12 -16 -7 -18 Q1 -21 8 -18 C13 -15 12 -8 10 -4Z" }),
      createSvgElement("path", { class: "wagon-cover-rib", d: "M-7 -5 C-9 -9 -9 -15 -5 -18 M0 -5 C-2 -9 -2 -16 1 -19 M7 -5 C9 -9 8 -15 6 -18" }),
      createSvgElement("path", { class: "wagon-bed", d: "M-13 -5 H12 L15 2 H-14Z" }),
      createSvgElement("path", { class: "wagon-axle", d: "M-13 3 H14 L17 5 H-15Z" }),
      createSvgElement("circle", { class: "wagon-wheel", cx: -8, cy: 7, r: 4.4 }),
      createSvgElement("circle", { class: "wagon-wheel", cx: 10, cy: 7, r: 4.4 }),
      createSvgElement("path", { class: "wagon-spoke", d: "M-8 3 V11 M-12 7 H-4 M10 3 V11 M6 7 H14" }),
      createSvgElement("circle", { class: "wagon-hub", cx: -8, cy: 7, r: 1.3 }),
      createSvgElement("circle", { class: "wagon-hub", cx: 10, cy: 7, r: 1.3 })
    );
    wagonLayer.append(wagon);
  }

  function renderLandmarkList(container, progressMiles) {
    container.replaceChildren();
    LANDMARKS.forEach((landmark, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `landmark-chip${progressMiles >= landmark.miles ? " is-passed" : ""}`;
      button.dataset.landmarkIndex = String(index);
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", `${landmark.name}, mile ${formatNumber(landmark.miles)}`);

      const name = document.createElement("span");
      name.textContent = landmark.shortName;
      const distance = document.createElement("small");
      distance.textContent = formatNumber(landmark.miles);
      button.append(name, distance);
      container.append(button);
    });
  }

  function selectLandmark(index, totalMiles, map) {
    const landmark = LANDMARKS[index];
    if (!landmark || !map) return;
    const name = map.querySelector("[data-landmark-name]");
    const mileage = map.querySelector("[data-landmark-mileage]");
    const distance = map.querySelector("[data-landmark-distance]");
    if (!name || !mileage || !distance) return;

    name.textContent = landmark.name;
    mileage.textContent = `Mile ${formatNumber(landmark.miles)} · ${landmark.state}`;
    if (landmark.miles === totalMiles) {
      distance.textContent = "Your wagon is at this landmark.";
    } else if (landmark.miles > totalMiles) {
      distance.textContent = `${formatNumber(landmark.miles - totalMiles)} miles ahead · ${landmark.description}`;
    } else {
      distance.textContent = `${formatNumber(totalMiles - landmark.miles)} miles behind your wagon · ${landmark.description}`;
    }

    map.querySelectorAll("[data-landmark-index]").forEach((element) => {
      const selected = Number(element.dataset.landmarkIndex) === index;
      element.setAttribute("aria-pressed", String(selected));
      element.classList.toggle("is-selected", selected);
    });
  }

  function renderTrail(totalMiles, lifetimeMiles) {
    getRouteModel();
    const progressMiles = Math.min(totalMiles, TRAIL_MILES);
    const percent = Math.min(Math.round((progressMiles / TRAIL_MILES) * 100), 100);
    const location = getLocation(totalMiles);
    const currentIndex = LANDMARKS.reduce((lastPassed, landmark, index) =>
      progressMiles >= landmark.miles ? index : lastPassed, 0
    );
    const nextLandmark = LANDMARKS[currentIndex + 1];

    document.querySelectorAll("[data-total-miles]").forEach((element) => {
      element.textContent = formatNumber(lifetimeMiles);
    });
    document.querySelectorAll("[data-trail-mileage]").forEach((element) => {
      element.textContent = `${formatNumber(progressMiles)} of ${formatNumber(TRAIL_MILES)} miles`;
    });
    document.querySelectorAll("[data-current-location]").forEach((element) => {
      element.textContent = location;
    });
    document.querySelectorAll("[data-distance-remaining]").forEach((element) => {
      element.textContent = formatNumber(Math.max(TRAIL_MILES - totalMiles, 0));
    });
    document.querySelectorAll("[data-progress-label]").forEach((element) => {
      element.textContent = `${percent}% complete`;
    });
    document.querySelectorAll("[data-progressbar]").forEach((element) => {
      element.setAttribute("aria-valuenow", String(percent));
    });
    document.querySelectorAll("[data-progress-fill]").forEach((element) => {
      element.style.width = `${percent}%`;
    });
    document.querySelectorAll("[data-map-current]").forEach((element) => {
      element.textContent = totalMiles >= TRAIL_MILES ? "Oregon City, Oregon" : location;
    });
    document.querySelectorAll("[data-next-landmark]").forEach((element) => {
      element.textContent = nextLandmark ? nextLandmark.name : "Oregon City reached";
    });
    document.querySelectorAll("[data-next-distance]").forEach((element) => {
      element.textContent = nextLandmark
        ? `${formatNumber(nextLandmark.miles - progressMiles)} miles ahead`
        : "End of the trail";
    });

    document.querySelectorAll("[data-trail-map]").forEach((map) => {
      const svg = map.querySelector("svg");
      if (!svg) return;
      renderRoute(svg, progressMiles);
      const landmarkList = map.querySelector("[data-landmark-list]");
      if (landmarkList) renderLandmarkList(landmarkList, progressMiles);
      selectLandmark(currentIndex, totalMiles, map);
    });
  }

  function initializeMapInteractions() {
    document.querySelectorAll("[data-trail-map]").forEach((map) => {
      const handleSelection = (target) => {
        const marker = target.closest("[data-landmark-index]");
        if (!marker || !map.contains(marker)) return;
        try {
          if (!campaignState) return;
          selectLandmark(Number(marker.dataset.landmarkIndex), campaignState.groupMiles, map);
        } catch (error) {
          showAppError(error);
        }
      };

      map.addEventListener("click", (event) => {
        if (event.target instanceof Element) handleSelection(event.target);
      });
      map.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!(event.target instanceof Element)) return;
        const marker = event.target.closest(".map-waypoint");
        if (!marker || !map.contains(marker)) return;
        event.preventDefault();
        handleSelection(marker);
      });
    });
  }

  function getWeekStart(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    return start;
  }

  function renderSharedSummary(state) {
    document.querySelectorAll("[data-group-miles]").forEach((element) => {
      element.textContent = formatNumber(state.groupMiles);
    });
    const days = new Set(state.entries.map((entry) => entry.date)).size;
    document.querySelectorAll("[data-avg-pace]").forEach((element) => {
      element.textContent = days ? formatNumber(state.groupMiles / days) : "0";
    });
  }

  // Community miles come only from Supabase (see community.js); null until the first read succeeds.
  let communitySnapshot = null;

  function communitySeasonMiles(total) {
    return round2(total - Math.floor(total / TRAIL_MILES) * TRAIL_MILES);
  }

  function renderTrailForState(state) {
    if (communitySnapshot && communitySnapshot.totalMiles !== undefined) {
      renderTrail(communitySeasonMiles(communitySnapshot.totalMiles), communitySnapshot.totalMiles);
    } else {
      renderTrail(state.seasonMiles, state.groupMiles);
    }
  }

  function renderCommunity(snapshot, reason) {
    const panel = document.querySelector("[data-community-panel]");
    if (snapshot && snapshot.totalMiles !== undefined) communitySnapshot = snapshot;
    if (campaignState) renderTrailForState(campaignState);
    if (!panel) return;
    const set = (name, text) => {
      const element = panel.querySelector(`[data-community-${name}]`);
      if (element) element.textContent = text;
    };
    const status = (text, isError) => {
      set("status", text);
      panel.querySelector("[data-community-status]")?.classList.toggle("is-error", Boolean(isError));
    };
    if (!window.OTDLE_COMMUNITY || !window.OTDLE_COMMUNITY.enabled) {
      status("Not connected", true);
      set("miles", "Not connected");
      set("landmark", "Set up Supabase (see README)");
      set("percent", "--");
      set("contributions", "--");
      return;
    }
    if (!communitySnapshot) {
      status(reason === "error" ? "Cannot reach the community" : "Connecting...", reason === "error");
      return;
    }
    const total = communitySnapshot.totalMiles;
    const seasonMiles = communitySeasonMiles(total);
    const percent = Math.min(Math.round((seasonMiles / TRAIL_MILES) * 100), 100);
    set("miles", formatNumber(total));
    set("landmark", getLocation(seasonMiles));
    set("percent", `${percent}%`);
    set("contributions", formatNumber(communitySnapshot.totalContributions || 0, 0));
    status(reason === "error" ? "Offline - showing last known total" : "Live", reason === "error");

    const list = panel.querySelector("[data-community-recent]");
    if (list) {
      list.replaceChildren();
      const recent = communitySnapshot.recent || [];
      if (!recent.length) {
        const item = document.createElement("li");
        item.textContent = "No contributions yet. Be the first to log miles.";
        list.append(item);
      }
      recent.forEach((row) => {
        const item = document.createElement("li");
        const when = new Date(row.timestamp);
        item.textContent = `${formatMiles(row.miles)} - ${Number.isNaN(when.getTime()) ? "" : when.toLocaleString()}`;
        list.append(item);
      });
    }
  }

  function initializeCommunity() {
    const community = window.OTDLE_COMMUNITY;
    if (!community) return;
    community.onChange(renderCommunity);
    renderCommunity(null);
    community.start();
  }

  function renderHome(state) {
    const entries = state.entries;
    const days = new Set(entries.map((entry) => entry.date)).size;
    document.querySelectorAll("[data-days-traveled]").forEach((element) => {
      element.textContent = formatNumber(days, 0);
    });
    const recent = entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 3);
    const recentContainer = document.querySelector("[data-recent-entries]");
    if (recentContainer) renderEntryList(recentContainer, recent, "Your first entry is waiting. Log some miles to get underway.");
    renderTrailForState(state);
  }

  function renderProgress(state) {
    const entries = state.entries;
    const days = new Set(entries.map((entry) => entry.date)).size;
    document.querySelectorAll("[data-days-traveled]").forEach((element) => {
      element.textContent = formatNumber(days, 0);
    });

    const today = new Date();
    const weekStart = getWeekStart(today);
    const monthPrefix = localDateString(new Date(today.getFullYear(), today.getMonth(), 1)).slice(0, 7);
    const weeklyEntries = entries.filter((entry) => {
      const date = parseDate(entry.date);
      return date >= weekStart && date <= today;
    });
    const monthlyEntries = entries.filter((entry) => entry.date.startsWith(monthPrefix));

    const weekMiles = document.querySelector("[data-week-miles]");
    const monthMiles = document.querySelector("[data-month-miles]");
    const entryCount = document.querySelector("[data-entry-count]");
    if (weekMiles) weekMiles.textContent = `${formatNumber(sumMiles(weeklyEntries))} mi`;
    if (monthMiles) monthMiles.textContent = `${formatNumber(sumMiles(monthlyEntries))} mi`;
    if (entryCount) entryCount.textContent = formatNumber(entries.length, 0);

    const sortedEntries = entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const history = document.querySelector("[data-history-entries]");
    if (history) renderEntryList(history, sortedEntries, "No miles logged yet. Add your first entry to begin your journey.", true);
    renderTrailForState(state);
    renderSeasonHistory(state);
    renderJourneyLog(state);
  }

  function renderSeasonHistory(state) {
    const list = document.querySelector("[data-season-history]");
    if (!list) return;
    list.replaceChildren();
    state.seasons.forEach((season) => {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = `Season ${season.number}: `;
      const text = document.createElement("span");
      if (season.completedDate) text.textContent = `Completed in ${formatNumber(season.days, 0)} ${season.days === 1 ? "day" : "days"}`;
      else if (season.startDate) text.textContent = `In progress (${formatNumber(state.seasonMiles)} of ${formatNumber(TRAIL_MILES)} miles)`;
      else text.textContent = "Not started";
      item.append(label, text);
      list.append(item);
    });
  }

  function renderJourneyLog(state) {
    const list = document.querySelector("[data-journey-log]");
    if (!list) return;
    list.replaceChildren();
    if (!state.journal.length) {
      const empty = document.createElement("li");
      empty.textContent = "Milestones you reach will be recorded here.";
      list.append(empty);
      return;
    }
    state.journal.slice().reverse().forEach((record) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = record.title;
      const date = document.createElement("time");
      date.dateTime = record.date;
      date.textContent = ` ${formatDate(record.date)}`;
      item.append(title, date);
      if (record.text) {
        const text = document.createElement("p");
        text.textContent = record.text;
        item.append(text);
      }
      list.append(item);
    });
  }

  // Generic banner for any newly recorded journey-log records (landmarks, achievements, seasons, events).
  function showCelebration(records) {
    document.querySelector("[data-celebration]")?.remove();
    const main = document.querySelector("main");
    if (!records.length || !main) return;
    const latest = records[records.length - 1];
    const banner = document.createElement("div");
    banner.className = "celebration";
    banner.dataset.celebration = "";
    banner.setAttribute("role", "status");
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = latest.title;
    const text = document.createElement("p");
    text.textContent = records.length > 1
      ? `${latest.text} (${records.length - 1} more milestone${records.length === 2 ? "" : "s"} recorded in your journey log.)`
      : latest.text;
    body.append(title, text);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "button button-secondary button-small";
    close.textContent = "Dismiss";
    close.addEventListener("click", () => banner.remove());
    banner.append(body, close);
    main.prepend(banner);
  }

  function setFieldError(field, message) {
    field.setAttribute("aria-invalid", "true");
    field.setCustomValidity(message);
  }

  function clearFieldError(field) {
    field.removeAttribute("aria-invalid");
    field.setCustomValidity("");
  }

  function initializeLogForm() {
    const form = document.querySelector("[data-mileage-form]");
    if (!form) return;

    const milesField = form.elements.namedItem("miles");
    const dateField = form.elements.namedItem("date");
    const notesField = form.elements.namedItem("notes");
    const message = document.querySelector("[data-form-message]");
    const noteCount = document.querySelector("[data-note-count]");
    const submitButton = form.querySelector('[type="submit"]');
    let submitting = false;
    dateField.value = localDateString(new Date());
    dateField.max = localDateString(new Date());

    [milesField, dateField].forEach((field) => {
      field.addEventListener("input", () => clearFieldError(field));
      field.addEventListener("change", () => clearFieldError(field));
    });

    notesField.addEventListener("input", () => {
      if (noteCount) noteCount.textContent = String(notesField.value.length);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      message.textContent = "";
      message.classList.remove("is-error");
      let valid = true;
      const miles = Number(milesField.value);
      if (!Number.isFinite(miles) || miles < 0.1 || miles > MAX_ENTRY_MILES) {
        setFieldError(milesField, "Enter a distance from 0.1 to 1,000 miles.");
        valid = false;
      }
      const date = parseDate(dateField.value);
      if (!date || dateField.value > localDateString(new Date())) {
        setFieldError(dateField, "Choose a valid date that is not in the future.");
        valid = false;
      }
      if (!valid) {
        message.textContent = "Check the highlighted fields and try again.";
        message.classList.add("is-error");
        form.querySelector('[aria-invalid="true"]').focus();
        return;
      }

      const rounded = Math.round(miles * 100) / 100;
      const community = window.OTDLE_COMMUNITY;
      const finish = () => {
        try {
          addEntry(rounded, dateField.value, notesField.value.trim());
        } catch (error) {
          message.textContent = error.message;
          message.classList.add("is-error");
          return;
        }
        message.textContent = community && community.enabled
          ? `${formatMiles(rounded)} added to the community expedition.`
          : `${formatMiles(rounded)} added to your journey.`;
        form.reset();
        dateField.value = localDateString(new Date());
        dateField.max = localDateString(new Date());
        if (noteCount) noteCount.textContent = "0";
        milesField.focus();
        refreshCampaign();
        showStorageWarning();
      };

      if (!community || !community.enabled) {
        finish();
        return;
      }
      if (submitting) return;
      submitting = true;
      submitButton.disabled = true;
      message.textContent = "Sending your miles to the community...";
      community.submit(rounded).then(finish, (error) => {
        message.textContent = `Could not record your miles: ${error.message}. Nothing was saved; try again.`;
        message.classList.add("is-error");
      }).finally(() => {
        submitting = false;
        submitButton.disabled = false;
      });
    });
  }

  function refreshCampaign() {
    const fresh = recordProgress();
    const state = buildState();
    campaignState = state;
    renderSharedSummary(state);
    const page = document.body.dataset.page;
    if (page === "home") renderHome(state);
    if (page === "progress") renderProgress(state);
    renderCamp({ ...state.hunt, groupMiles: state.groupMiles });
    if (fresh.length) showCelebration(fresh);
  }

  let huntBusy = false;

  function initializeHunting() {
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll("[data-hunt-location]").forEach((button) => {
      button.addEventListener("click", () => {
        if (huntBusy || button.disabled) return;
        huntBusy = true;
        const buttons = document.querySelectorAll("[data-hunt-location]");
        buttons.forEach((item) => { item.disabled = true; });
        button.classList.add("is-searching");
        const message = document.querySelector("[data-hunt-message]");
        if (message) message.textContent = "Searching...";
        setTimeout(() => {
          button.classList.remove("is-searching");
          huntBusy = false;
          try {
            resolveHunt(button.dataset.huntLocation);
            refreshCampaign();
          } catch (error) {
            refreshCampaign();
            renderCamp({ ...campaignState.hunt, groupMiles: campaignState.groupMiles }, error.message);
          }
          showStorageWarning();
        }, reduceMotion ? 0 : 750);
      });
    });
    document.querySelector("[data-next-hunt]")?.addEventListener("click", () => {
      try {
        startHunt();
        refreshCampaign();
      } catch (error) {
        refreshCampaign();
        renderCamp({ ...campaignState.hunt, groupMiles: campaignState.groupMiles }, error.message);
      }
      showStorageWarning();
    });
  }

  function initializeHistoryAndBackup() {
    const history = document.querySelector("[data-history-entries]");
    if (history) {
      history.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-delete-entry]") : null;
        if (!button || !window.confirm("Delete this entry? Your wagon will move back by those miles.")) return;
        deleteEntry(button.dataset.deleteEntry);
        refreshCampaign();
        showStorageWarning();
      });
    }
    const status = document.querySelector("[data-backup-message]");
    const say = (text, isError) => {
      if (!status) return;
      status.textContent = text;
      status.classList.toggle("is-error", Boolean(isError));
    };
    document.querySelector("[data-export-backup]")?.addEventListener("click", () => {
      exportBackup();
      say("Backup downloaded. Keep the file somewhere safe.");
    });
    document.querySelector("[data-import-backup]")?.addEventListener("change", async (event) => {
      const input = event.target;
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return say("That file is too large to be a backup.", true);
      if (!window.confirm("Restoring replaces the miles and hunts saved in this browser. Continue?")) return;
      try {
        const clean = importBackup(await file.text());
        refreshCampaign();
        say(`Restored ${clean.entries.length} ${clean.entries.length === 1 ? "entry" : "entries"}.`);
      } catch (error) {
        say(error.message, true);
      }
      showStorageWarning();
    });
    document.querySelector("[data-reset-save]")?.addEventListener("click", () => {
      if (!window.confirm("Start a new game? This permanently erases the miles, hunts and food saved in this browser. Download a backup first if you want to keep them.")) return;
      clearSave();
      refreshCampaign();
      say("Saved journey erased. You are back at Independence.");
    });
  }

  if (window.__OTDLE_EXPOSE__) {
    window.__OTDLE_EXPOSE__.api = { buildState, addEntry, startHunt, resolveHunt, deleteEntry, importBackup, sanitizeStore, hasSave, clearSave, recordProgress, evaluateJourney };
  }

  document.addEventListener("DOMContentLoaded", () => {
    initializeLogForm();
    initializeMapInteractions();
    initializeHunting();
    initializeHistoryAndBackup();
    refreshCampaign();
    initializeCommunity();
    showStorageWarning();
    // Pick up miles logged in another tab of this browser.
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) refreshCampaign();
    });
  });
})();
