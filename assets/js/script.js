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

  // The Donner Party shares the community route to Fort Bridger, then follows the Hastings Cutoff.
  // Distances use the community route's ruler, so miles are comparable on both paths.
  let donnerModel = null;

  function getDonnerModel() {
    if (donnerModel) return donnerModel;
    const party = window.OTDLE_CONFIG.donnerParty;
    const route = getRouteModel();
    if (!party) return null;
    const stops = party.stops || [];
    const ids = new Map(stops.filter((stop) => stop.coordinates).map((stop) => [stop.id, stop.coordinates]));
    const bridgeAt = ROUTE_WAYPOINTS.indexOf("Fort Bridger");
    const coordinates = [...ROUTE_WAYPOINTS.slice(0, bridgeAt + 1), ...party.route].map((waypoint) => {
      if (Array.isArray(waypoint)) return waypoint;
      const landmark = LANDMARKS.find((item) => item.shortName === waypoint);
      return landmark ? landmark.coordinates : ids.get(waypoint);
    });
    const points = [];
    let length = 0;
    coordinates.forEach((coords) => {
      const point = projectMapPoint(coords);
      if (points.length) length += Math.hypot(point.x - points[points.length - 1].x, point.y - points[points.length - 1].y);
      points.push({ ...point, distance: length });
    });
    donnerModel = { points, ruler: route.length / TRAIL_MILES, branchDistance: points[bridgeAt].distance, branchIndex: bridgeAt };
    return donnerModel;
  }

  function getDonnerPoint(model, miles) {
    const distance = Math.max(0, miles) * model.ruler;
    const index = Math.max(1, model.points.findIndex((point) => point.distance >= distance));
    const a = model.points[index - 1];
    const b = model.points[index] || a;
    const portion = b.distance === a.distance ? 0 : Math.min((distance - a.distance) / (b.distance - a.distance), 1);
    return { x: a.x + (b.x - a.x) * portion, y: a.y + (b.y - a.y) * portion };
  }

  function renderDonnerRoute(svg, progressMiles) {
    const layer = svg.querySelector("[data-route-donner]");
    if (!layer) return;
    layer.replaceChildren();
    const model = getDonnerModel();
    if (!model) return;
    const branch = model.points.slice(model.branchIndex);
    layer.append(createSvgElement("path", {
      class: "route-donner",
      d: branch.map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
    }));
    window.OTDLE_CONFIG.donnerParty.stops.filter((stop) => stop.coordinates).forEach((stop) => {
      const point = getDonnerPoint(model, stop.miles);
      const mark = createSvgElement("path", { class: "donner-stop", d: `M${point.x} ${point.y - 4.5}L${point.x + 4.5} ${point.y}L${point.x} ${point.y + 4.5}L${point.x - 4.5} ${point.y}Z` });
      const title = createSvgElement("title", {});
      title.textContent = `Donner Party: ${stop.name} (${stop.dateLabel})`;
      mark.append(title);
      layer.append(mark);
    });
    if (progressMiles > model.branchDistance / model.ruler) {
      const stops = window.OTDLE_CONFIG.donnerParty.stops;
      const point = getDonnerPoint(model, Math.min(progressMiles, stops[stops.length - 1].miles));
      const ghost = createSvgElement("g", { class: "donner-marker", transform: `translate(${point.x} ${point.y})` });
      ghost.append(createSvgElement("circle", { r: 6.5 }), createSvgElement("path", { d: "M-3 2L0 -3L3 2Z" }));
      const title = createSvgElement("title", {});
      title.textContent = "Where the Donner Party would be at the community's mileage";
      ghost.append(title);
      layer.append(ghost);
    }
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
    renderDonnerRoute(svg, progressMiles);
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

    const details = (window.OTDLE_CONFIG.landmarkDetails || {})[landmark.id] || {};
    [["importance", details.importance], ["relevance", details.relevance], ["funfact", details.funFact], ["donner", (window.OTDLE_CONFIG.donnerNotes || {})[landmark.id]]].forEach(([key, text]) => {
      const element = map.querySelector(`[data-landmark-${key}]`);
      if (element) element.textContent = text || "";
    });
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
      element.removeAttribute("aria-valuetext");
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
          selectLandmark(Number(marker.dataset.landmarkIndex), displayMiles(), map);
        } catch (error) {
          showAppError(error);
        }
      };

      map.addEventListener("click", (event) => {
        if (event.target instanceof Element) handleSelection(event.target);
      });
      map.addEventListener("mouseover", (event) => {
        if (event.target instanceof Element && event.target.closest(".map-waypoint")) handleSelection(event.target);
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

  function renderPersonalSummary(state) {
    const days = new Set(state.entries.map((entry) => entry.date)).size;
    document.querySelectorAll("[data-avg-pace]").forEach((element) => {
      element.textContent = days ? formatNumber(state.groupMiles / days) : "0";
    });
    document.querySelectorAll("[data-personal-miles]").forEach((element) => {
      element.textContent = `${formatNumber(state.groupMiles)} mi`;
    });
  }

  // Community miles come only from Supabase (see community.js); null until the first read succeeds.
  let communitySnapshot = null;

  function communitySeasonMiles(total) {
    return round2(total - Math.floor(total / TRAIL_MILES) * TRAIL_MILES);
  }

  function displayMiles() {
    if (communitySnapshot && communitySnapshot.totalMiles !== undefined) return communitySeasonMiles(communitySnapshot.totalMiles);
    return 0;
  }

  function renderTrailForState(unavailable) {
    if (communitySnapshot && communitySnapshot.totalMiles !== undefined) {
      renderTrail(communitySeasonMiles(communitySnapshot.totalMiles), communitySnapshot.totalMiles);
    } else {
      const failed = unavailable || !window.OTDLE_COMMUNITY || !window.OTDLE_COMMUNITY.enabled;
      renderTrail(0, 0);
      document.querySelectorAll("[data-total-miles]").forEach((element) => {
        element.textContent = failed ? "Unavailable" : "Loading…";
      });
      document.querySelectorAll("[data-trail-mileage]").forEach((element) => {
        element.textContent = failed ? "Community progress unavailable" : "Loading community progress…";
      });
      document.querySelectorAll("[data-map-current]").forEach((element) => {
        element.textContent = failed ? "Unavailable" : "Loading community progress…";
      });
      document.querySelectorAll("[data-current-location]").forEach((element) => {
        element.textContent = failed ? "Unavailable" : "Loading…";
      });
      document.querySelectorAll("[data-next-landmark]").forEach((element) => {
        element.textContent = failed ? "Unavailable" : "Loading…";
      });
      document.querySelectorAll("[data-next-distance], [data-distance-remaining]").forEach((element) => {
        element.textContent = failed ? "Unavailable" : "Loading…";
      });
      document.querySelectorAll("[data-landmark-name], [data-landmark-mileage], [data-landmark-distance]").forEach((element) => {
        element.textContent = failed ? "Community progress unavailable" : "Loading community progress…";
      });
      document.querySelectorAll("[data-progress-label]").forEach((element) => {
        element.textContent = failed ? "Unavailable" : "Loading…";
      });
      document.querySelectorAll("[data-progressbar]").forEach((element) => {
        element.removeAttribute("aria-valuenow");
        element.setAttribute("aria-valuetext", failed ? "Community progress unavailable" : "Loading community progress");
      });
    }
  }

  function renderCommunity(snapshot, reason) {
    const panel = document.querySelector("[data-community-panel]");
    if (snapshot && snapshot.totalMiles !== undefined) communitySnapshot = snapshot;
    if (campaignState) {
      renderTrailForState(reason === "error" && !communitySnapshot);
      renderPersonalSummary(campaignState);
    }
    if (!panel) {
      if (communitySnapshot) renderCommunityStory(communitySnapshot);
      return;
    }
    const set = (name, text) => {
      const element = document.querySelector(`[data-community-${name}]`);
      if (element) element.textContent = text;
    };
    const status = (text, isError) => {
      set("status", text);
      const chip = panel.querySelector("[data-community-status]");
      if (chip) chip.hidden = !text;
      panel.querySelector("[data-community-status]")?.classList.toggle("is-error", Boolean(isError));
    };
    if (!window.OTDLE_COMMUNITY || !window.OTDLE_COMMUNITY.enabled) {
      status("Not connected", true);
      set("miles", "Not connected");
      set("landmark", "Community service unavailable");
      set("percent", "Unavailable");
      set("food", "Unavailable");
      set("contributions", "Unavailable");
      document.querySelector(".community-stats")?.setAttribute("aria-busy", "false");
      if (campaignState) renderTrailForState(true);
      return;
    }
    if (!communitySnapshot) {
      const failed = reason === "error";
      status(failed ? "Community unavailable" : "Loading community progress…", failed);
      set("miles", failed ? "Unavailable" : "Loading…");
      set("landmark", failed ? "Unavailable" : "Loading…");
      set("percent", failed ? "Unavailable" : "Loading…");
      set("food", failed ? "Unavailable" : "Loading…");
      set("contributions", failed ? "Unavailable" : "Loading…");
      document.querySelector(".community-stats")?.setAttribute("aria-busy", String(!failed));
      if (campaignState) renderTrailForState(failed);
      return;
    }
    const total = communitySnapshot.totalMiles;
    const seasonMiles = communitySeasonMiles(total);
    const percent = Math.min(Math.round((seasonMiles / TRAIL_MILES) * 100), 100);
    set("miles", formatNumber(total));
    set("landmark", getLocation(seasonMiles));
    set("percent", `${percent}%`);
    set("contributions", formatNumber(communitySnapshot.totalContributions || 0, 0));
    status(reason === "error" ? "Offline - showing last known total" : "", reason === "error");
    document.querySelector(".community-stats")?.setAttribute("aria-busy", "false");

    renderCommunityStory(communitySnapshot);
    const list = document.querySelector("[data-community-recent]");
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
        const what = row.miles > 0 ? `${formatMiles(row.miles)}` : `${formatNumber(row.food, 0)} lbs of food hunted`;
        item.textContent = `${row.name}: ${what} - ${Number.isNaN(when.getTime()) ? "" : when.toLocaleString()}`;
        list.append(item);
      });
    }
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  let campSelected = null;
  let campPeopleList = [];

  function pixel(parent, x, y, width, height, color, className) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", color);
    if (className) rect.setAttribute("class", className);
    parent.append(rect);
    return rect;
  }

  // Living camp diorama. Counts and people come from OTDLE_STORY (community totals and the recent log);
  // motion is pure CSS (see "Community camp diorama" in style.css) so it stays light and honors reduced motion.
  function svgEl(parent, name, attrs) {
    const element = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((key) => element.setAttribute(key, String(attrs[key])));
    parent.append(element);
    return element;
  }

  function decor(parent, className, attrs) {
    return svgEl(parent, "g", { class: className, "aria-hidden": "true", ...attrs });
  }

  function drawFigure(parent, seed, pose) {
    const shirt = ["#9a3f2b", "#3f6f8f", "#5f7f3f", "#7a5a8a", "#b07a2a"][seed % 5];
    const hat = ["#3b2a18", "#6b4a2b", "#d9c7a0"][seed % 3];
    pixel(parent, 0, 0, 6, 2, hat);
    pixel(parent, 1, 2, 4, 3, "#f0c9a0");
    if (pose === "sit") {
      pixel(parent, 0, 5, 6, 5, shirt);
      pixel(parent, 0, 10, 9, 2, "#3b2a18");
      return;
    }
    pixel(parent, 0, 5, 6, 6, shirt);
    pixel(parent, 0, 11, 2, 3, "#3b2a18");
    pixel(parent, 4, 11, 2, 3, "#3b2a18");
    if (pose === "carry") {
      pixel(parent, -1, -6, 8, 6, "#b98a4a");
      pixel(parent, -1, -6, 8, 2, "#7a5230");
    } else if (pose === "tend") {
      pixel(parent, 7, 5, 1, 9, "#6b4a2b");
      pixel(parent, 6, 4, 3, 2, "#8d8a80");
    } else if (pose === "returning") {
      pixel(parent, 6, 6, 7, 5, "#7a5a3a");
      pixel(parent, 11, 5, 2, 2, "#4a3520");
    }
  }

  function drawCritter(parent, kind, x, y, delay, distance) {
    const spot = svgEl(decor(parent, "camp-critter"), "g", { transform: `translate(${x} ${y})` });
    const mover = svgEl(spot, "g", { class: `camp-wander camp-${kind}`, style: `--walk:${distance}px;--delay:-${delay}s` });
    if (kind === "ox") {
      pixel(mover, 0, 0, 15, 8, "#5a3d2a");
      pixel(mover, 13, -1, 6, 6, "#4a3220");
      pixel(mover, 14, -3, 1, 2, "#e8dcc0");
      pixel(mover, 18, -3, 1, 2, "#e8dcc0");
      pixel(mover, 2, 8, 2, 4, "#2f2119");
      pixel(mover, 11, 8, 2, 4, "#2f2119");
    } else if (kind === "horse") {
      pixel(mover, 0, 0, 14, 7, "#8a5a34");
      pixel(mover, 12, -4, 4, 8, "#8a5a34");
      pixel(mover, 14, -5, 4, 3, "#6f4527");
      pixel(mover, 2, 7, 2, 5, "#4a3018");
      pixel(mover, 10, 7, 2, 5, "#4a3018");
      pixel(mover, -3, 0, 3, 6, "#3b2412", "camp-tail");
    } else {
      pixel(mover, 0, 0, 8, 4, "#c9a26b");
      pixel(mover, 7, -2, 4, 4, "#b58b55");
      pixel(mover, 0, 4, 2, 2, "#8a6a40");
      pixel(mover, 6, 4, 2, 2, "#8a6a40");
      pixel(mover, -2, -1, 2, 2, "#c9a26b", "camp-tail");
    }
  }

  function drawWeather(svg, weatherId) {
    const layer = decor(svg, `camp-weather camp-weather-${weatherId}`);
    if (weatherId === "rain" || weatherId === "snow") {
      const flakes = weatherId === "snow";
      const drops = svgEl(layer, "g", { class: "camp-drops" });
      for (let band = 0; band < 5; band += 1) {
        for (let i = 0; i < 12; i += 1) {
          const x = (i * 37 + band * 13) % 400;
          const y = band * 40 + ((i * 17) % 40);
          if (flakes) pixel(drops, x, y, 2, 2, "#ffffff");
          else pixel(drops, x, y, 1, 6, "#dbe9f0");
        }
      }
    } else if (weatherId === "fog") {
      [[-60, 70, 300, 30], [-50, 76, 280, 18], [-40, 81, 260, 8]].forEach(([x, y, w, h]) => pixel(layer, x, y, w, h, "rgba(240, 244, 244, 0.2)", "camp-fog-bank"));
      [[170, 100, 300, 44], [180, 108, 280, 28], [190, 116, 260, 12]].forEach(([x, y, w, h]) => pixel(layer, x, y, w, h, "rgba(240, 244, 244, 0.2)", "camp-fog-bank camp-fog-slow"));
    } else if (weatherId === "windy") {
      for (let i = 0; i < 6; i += 1) pixel(layer, (i * 83) % 380, 30 + i * 17, 16, 1, "rgba(255, 255, 255, 0.7)", "camp-gust");
    }
  }

  function renderCampScene(scene, scale, context) {
    const svg = scene.querySelector("svg");
    if (!svg) return;
    const { time, weather, people, hunt, celebration } = context;
    const signature = JSON.stringify([scale, time, weather.id, people.map((p) => [p.name, p.miles, p.food, p.activity]), celebration && celebration.name]);
    if (svg.dataset.campSignature === signature) return;
    svg.dataset.campSignature = signature;
    svg.replaceChildren();
    svg.setAttribute("role", "group");
    svg.dataset.time = time;
    svg.setAttribute("class", `camp-svg stage-${scale.stage} weather-${weather.id}`);

    const sky = decor(svg, "camp-sky-layer");
    pixel(sky, 0, 0, 400, 112, "#cfe0e8", "camp-sky");
    for (let i = 0; i < 16; i += 1) pixel(sky, (i * 53 + 17) % 396, 6 + ((i * 29) % 60), 2, 2, "#fff6c8", "camp-star");
    svgEl(sky, "circle", { cx: 340, cy: 26, r: 9, class: "camp-sun" });
    svgEl(sky, "circle", { cx: 340, cy: 26, r: 7, class: "camp-moon" });
    [[30, 14], [210, 26], [300, 10]].forEach(([x, y], i) => {
      const cloud = svgEl(sky, "g", { class: "camp-cloud", style: `--delay:-${i * 31}s;--y:${y}px` });
      pixel(cloud, 0, 4, 34, 6, "#ffffff");
      pixel(cloud, 6, 0, 18, 6, "#ffffff");
    });
    pixel(sky, 0, 100, 400, 10, "#a9b49c");
    for (let x = 0; x < 400; x += 10) pixel(sky, x, 94 + Math.round(Math.sin(x / 31) * 4 + 4), 10, 16, "#98a58c");

    const ground = decor(svg, "camp-ground");
    pixel(ground, 0, 110, 400, 50, "#8a6b3f", "camp-soil");
    pixel(ground, 0, 110, 400, 4, "#6f8f4e", "camp-grass-line");
    for (let i = 0; i < 24; i += 1) {
      const blade = svgEl(ground, "g", { class: "camp-grass", style: `--delay:-${(i * 7) % 5}s`, transform: `translate(${(i * 47 + 11) % 392} ${116 + ((i * 13) % 40)})` });
      pixel(blade, 0, 0, 1, 3, "#6f8f4e");
      pixel(blade, 2, -1, 1, 4, "#7fa05a");
    }

    const camp = decor(svg, "camp-structures");
    for (let i = 0; i < scale.tents; i += 1) {
      const x = 20 + (i % 5) * 62 + Math.floor(i / 5) * 24;
      const y = 78 - Math.floor(i / 5) * 10;
      const tent = svgEl(camp, "g", { class: "camp-tent", transform: `translate(${x} ${y})` });
      pixel(tent, 12, 0, 4, 4, "#d9c7a0");
      pixel(tent, 8, 4, 12, 4, "#d9c7a0");
      pixel(tent, 4, 8, 20, 4, "#d9c7a0");
      pixel(tent, 0, 12, 28, 8, "#c9b185");
      pixel(tent, 11, 14, 6, 6, "#5b4528", "camp-flap");
    }

    for (let i = 0; i < scale.wagons; i += 1) {
      const x = 16 + i * 46;
      const wagon = svgEl(camp, "g", { class: "camp-wagon", style: `--delay:-${i * 1.3}s`, transform: `translate(${x} 0)` });
      pixel(wagon, 4, 100, 30, 4, "#f5efe0");
      pixel(wagon, 0, 104, 36, 6, "#7a5230");
      pixel(wagon, 4, 112, 6, 6, "#3b2a18", "camp-wheel");
      pixel(wagon, 26, 112, 6, 6, "#3b2a18", "camp-wheel");
      if (i < 3) {
        pixel(wagon, 36, 105, 3, 4, "#ffd86a", "camp-lantern-lamp");
        svgEl(wagon, "circle", { cx: 37, cy: 107, r: 13, class: "camp-lantern" });
      }
    }

    for (let i = 0; i < scale.oxen; i += 1) drawCritter(svg, "ox", 30 + i * 34, 119 + (i % 2) * 4, i * 3, 10 + i * 3);
    for (let i = 0; i < scale.horses; i += 1) drawCritter(svg, "horse", 292 + i * 30, 118 + (i % 2) * 5, i * 4 + 1, 12);
    for (let i = 0; i < scale.dogs; i += 1) drawCritter(svg, "dog", 205, 141, 2, 22);

    const fireX = 188;
    const fire = decor(svg, `camp-fire${celebration ? " is-celebrating" : ""}`);
    svgEl(fire, "circle", { cx: fireX + 12, cy: 124, r: celebration ? 46 : 34, class: "camp-glow" });
    pixel(fire, fireX, 128, 24, 4, "#4a3520");
    pixel(fire, fireX + 3, 126, 18, 3, "#6b4a2b");
    const level = Math.min(scale.fire + (celebration ? 1 : 0), 4);
    for (let i = 0; i < level; i += 1) {
      pixel(fire, fireX + 6 + i * 2, 124 - i * 6, Math.max(12 - i * 4, 4), 6, i === 0 ? "#d9622b" : "#f2b632", `camp-flame f${i % 3}`);
    }
    for (let i = 0; i < 4; i += 1) pixel(fire, fireX + 8 + (i % 2) * 6, 100 - i * 2, 4, 4, "rgba(220, 220, 214, 0.55)", "camp-smoke");
    fire.lastElementChild.style.setProperty("--delay", "-3s");
    fire.querySelectorAll(".camp-smoke").forEach((puff, i) => puff.style.setProperty("--delay", `-${i}s`));

    const supplies = decor(svg, "camp-supplies-layer");
    for (let i = 0; i < scale.crates; i += 1) {
      pixel(supplies, 300 + (i % 4) * 14, 140 - Math.floor(i / 4) * 10, 12, 8, "#b98a4a");
      pixel(supplies, 300 + (i % 4) * 14, 140 - Math.floor(i / 4) * 10, 12, 2, "#7a5230");
    }
    if (hunt && hunt.fresh) {
      pixel(supplies, 164, 140, 10, 7, "#9b6a3a", "camp-new-crate");
      pixel(supplies, 164, 140, 10, 2, "#6b4a2b", "camp-new-crate");
    }

    const crowd = decor(svg, "camp-crowd");
    for (let i = people.length; i < scale.settlers; i += 1) {
      const figure = svgEl(crowd, "g", { class: "camp-extra", transform: `translate(${140 + ((i * 29) % 130)} ${134 + (i % 3) * 6})` });
      drawFigure(figure, i + 2, "stand");
    }

    people.forEach((person, index) => {
      const pose = person.activity === "walk" ? "stand" : person.activity;
      let x = 40 + (person.seed % 280);
      let y = 132 + (person.seed % 3) * 5;
      if (pose === "sit") { x = [158, 222, 140, 240][index % 4]; y = 136; }
      if (pose === "tend") { x = 16 + (index % Math.max(scale.wagons, 1)) * 46 + 38; y = 106; }
      if (pose === "returning") { x = 168; y = 134; }
      const walks = pose === "stand" || pose === "carry" ? 14 + (person.seed % 18) : 0;
      const spot = svgEl(svg, "g", {
        class: `camp-settler is-${person.activity}`,
        transform: `translate(${x} ${y})`,
        role: "button",
        tabindex: "0",
        "data-camp-name": person.name,
        "aria-pressed": "false",
        "aria-label": `${person.name}, settler. Show details.`
      });
      const mover = svgEl(spot, "g", { class: "camp-mover", style: `--walk:${walks}px;--delay:-${person.seed % 9}s;--dur:${9 + (person.seed % 6)}s` });
      pixel(mover, -5, -8, 18, 24, "transparent", "camp-hit");
      drawFigure(mover, person.seed, pose);
      const label = svgEl(mover, "text", { x: 3, y: -10, class: "camp-name", "text-anchor": "middle" });
      label.textContent = person.name;
    });

    if (celebration) {
      const banner = decor(svg, "camp-banner");
      pixel(banner, 88, 50, 3, 62, "#6b4a2b");
      pixel(banner, 309, 50, 3, 62, "#6b4a2b");
      ["#9b482e", "#d29a35", "#315b3d", "#547985"].forEach((color, c) => {
        for (let i = c; i < 15; i += 4) {
          const flag = svgEl(banner, "polygon", { points: `0,0 13,0 6.5,13`, fill: color, class: "camp-flag", transform: `translate(${92 + i * 14.4} ${54 + Math.round(Math.sin(i / 2.2) * 3 + 3)})`, style: `--delay:-${i * 0.2}s` });
          flag.setAttribute("stroke", "#2a1d12");
          flag.setAttribute("stroke-width", "0.6");
        }
      });
      const board = svgEl(banner, "rect", { x: 112, y: 20, width: 176, height: 24, rx: 2, class: "camp-board" });
      board.setAttribute("fill", "#f0e5c8");
      const title = svgEl(banner, "text", { x: 200, y: 36, class: "camp-banner-text", "text-anchor": "middle" });
      title.textContent = `Welcome to ${celebration.name}!`;
    }

    svgEl(svg, "rect", { x: 0, y: 0, width: 400, height: 160, class: "camp-dark", "aria-hidden": "true" });
    drawWeather(svg, weather.id);
  }

  function selectCampPerson(scene, name) {
    campSelected = name;
    const story = scene.querySelector("[data-camp-person]");
    const person = campPeopleList.find((item) => item.name === name);
    scene.querySelectorAll("[data-camp-name]").forEach((node) => {
      const on = node.dataset.campName === name;
      node.classList.toggle("is-selected", on);
      node.setAttribute("aria-pressed", String(on));
    });
    if (!story) return;
    if (!person) {
      story.textContent = campPeopleList.length ? "Select a settler to see their story." : "Log miles or go hunting to bring settlers to camp.";
      return;
    }
    const parts = [`${person.name} has contributed ${formatNumber(person.miles)} mi${person.food > 0 ? ` and ${formatNumber(person.food, 0)} lbs of food` : ""}.`];
    parts.push(person.latest.kind === "hunt"
      ? `Latest: hunted ${formatNumber(person.latest.food, 0)} lbs on ${formatWhen(person.latest.timestamp)}.`
      : `Latest: traveled ${formatNumber(person.latest.miles)} mi on ${formatWhen(person.latest.timestamp)}.`);
    parts.push(`First seen ${formatWhen(person.firstSeen)} in the recent log.`);
    story.textContent = parts.join(" ");
  }

  function renderCampRoster(scene, people) {
    campPeopleList = people;
    const roster = scene.querySelector("[data-camp-roster]");
    if (roster && roster.dataset.names !== people.map((p) => p.name).join("|")) {
      roster.dataset.names = people.map((p) => p.name).join("|");
      roster.replaceChildren();
      people.forEach((person) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "camp-roster-button";
        button.dataset.campName = person.name;
        button.setAttribute("aria-pressed", "false");
        button.textContent = person.name;
        item.append(button);
        roster.append(item);
      });
    }
    if (!scene.dataset.campBound) {
      scene.dataset.campBound = "1";
      scene.addEventListener("click", (event) => {
        const target = event.target.closest ? event.target.closest("[data-camp-name]") : null;
        if (target) selectCampPerson(scene, target.dataset.campName);
      });
      scene.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target.closest ? event.target.closest(".camp-settler") : null;
        if (!target) return;
        event.preventDefault();
        selectCampPerson(scene, target.dataset.campName);
      });
    }
    selectCampPerson(scene, people.some((p) => p.name === campSelected) ? campSelected : null);
  }

  // Time of day follows the visitor's clock; weather follows the UTC date and trail region so all visitors agree.
  // ?preview=night,rain (any time/weather ids) is a harmless way to look at the other states.
  function campContext(snapshot, story) {
    const now = Date.now();
    let time = story.timeOfDay(new Date(now).getHours());
    let weather = story.weatherFor(snapshot.totalMiles, Math.floor(now / 86400000));
    try {
      const preview = (new URLSearchParams(window.location.search).get("preview") || "").split(",");
      preview.forEach((token) => {
        if (["dawn", "day", "dusk", "night"].includes(token)) time = token;
        else if (["clear", "windy", "rain", "fog", "snow"].includes(token)) weather = story.weatherInfo(token);
      });
    } catch (error) {
      time = time || "day";
    }
    const hunt = story.latestHunt(snapshot.journal, now);
    const people = story.campPeople(snapshot.journal, snapshot.contributors, hunt && hunt.fresh ? hunt.name : null, 8);
    return { time, weather, hunt, people, celebration: story.celebrationAt(snapshot.totalMiles) };
  }

  function listItem(text, className) {
    const item = document.createElement("li");
    if (className) item.className = className;
    item.textContent = text;
    return item;
  }

  function formatWhen(value) {
    const when = new Date(value);
    return Number.isNaN(when.getTime()) ? "" : when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const JOURNAL_FILTERS = [
    { id: "all", label: "All" },
    { id: "travel", label: "Miles" },
    { id: "hunt", label: "Hunts" },
    { id: "landmark", label: "Landmarks" },
    { id: "milestone", label: "Milestones" },
    { id: "event", label: "Events" },
    { id: "donner", label: "Donner Party" }
  ];
  const JOURNAL_PAGE_LIMIT = 80;
  let journalFilter = "all";

  function renderDonnerCard(totalMiles) {
    const card = document.querySelector("[data-donner-card]");
    const story = window.OTDLE_STORY;
    if (!card || !story || !story.donnerAt) return;
    const at = story.donnerAt(totalMiles);
    card.hidden = !at;
    if (!at) return;
    const set = (name, text) => {
      const element = card.querySelector(`[data-donner-${name}]`);
      if (element) element.textContent = text;
    };
    const stop = at.previous;
    set("lead", stop.miles === 0
      ? `At this point in the journey, the Donner Party had just left Independence on ${stop.dateLabel}.`
      : `Historically, the Donner Party reached ${stop.name} around ${stop.dateLabel}.`);
    set("text", stop.text);
    set("education", stop.education);
    set("next", at.next ? `Next on their route: ${at.next.name}, about ${formatNumber(at.milesToNext, 0)} miles ahead of the community wagon.` : "The community wagon has passed the end of the Donner Party's route.");
  }

  function renderJournal(snapshot) {
    const journal = document.querySelector("[data-trail-journal]");
    const story = window.OTDLE_STORY;
    if (!journal || !story) return;
    const filters = document.querySelector("[data-journal-filters]");
    const onJournalPage = Boolean(filters);
    if (filters && !filters.childElementCount) {
      JOURNAL_FILTERS.forEach((filter) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "journal-filter";
        button.textContent = filter.label;
        button.dataset.journalFilter = filter.id;
        button.addEventListener("click", () => {
          journalFilter = filter.id;
          renderJournal(communitySnapshot);
        });
        filters.append(button);
      });
    }
    filters?.querySelectorAll("[data-journal-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.journalFilter === journalFilter));
    });

    journal.replaceChildren();
    const all = story.buildJournal(snapshot.journal || [], snapshot.totalMiles, snapshot.totalFood || 0, onJournalPage ? 200 : undefined);
    const entries = all.filter((entry) => journalFilter === "all" || entry.kind === journalFilter).slice(0, onJournalPage ? JOURNAL_PAGE_LIMIT : 20);
    if (!entries.length) {
      journal.append(listItem(journalFilter === "all" ? "The wagon train is waiting for its first traveler." : "No entries of this kind yet."));
    }
    entries.forEach((entry) => {
      const item = listItem("", `journal-entry is-${entry.kind}`);
      const text = document.createElement("span");
      text.textContent = entry.text;
      const when = document.createElement("small");
      when.textContent = formatWhen(entry.timestamp);
      item.append(text, when);
      journal.append(item);
    });
  }

  // Community story: food, camp scene, historical event, trail journal and contributor lists.
  function renderCommunityStory(snapshot) {
    const story = window.OTDLE_STORY;
    if (!snapshot || !story) return;
    const totalFood = snapshot.totalFood || 0;
    document.querySelectorAll("[data-community-food]").forEach((element) => {
      element.textContent = `${formatNumber(totalFood, 0)} lbs`;
    });

    document.querySelectorAll("[data-camp-scene]").forEach((scene) => {
      const scale = story.campScale(snapshot.totalMiles, totalFood);
      const context = campContext(snapshot, story);
      renderCampScene(scene, scale, context);
      renderCampRoster(scene, context.people);
      const news = scene.querySelector("[data-camp-news]");
      if (news) {
        const lines = [];
        if (context.celebration) lines.push(`The wagon train has reached ${context.celebration.name}! The camp is celebrating.`);
        if (context.hunt && context.hunt.fresh) lines.push(`Just in: ${context.hunt.name} returned from the hunt with ${formatNumber(context.hunt.food, 0)} lbs of game.`);
        lines.push(context.weather.text);
        news.textContent = lines.join(" ");
      }
      const caption = scene.querySelector("[data-camp-caption]");
      if (caption) {
        caption.textContent = `${scale.wagons} ${scale.wagons === 1 ? "wagon" : "wagons"}, ${scale.settlers} settlers, ${scale.tents} ${scale.tents === 1 ? "tent" : "tents"} and ${formatNumber(totalFood, 0)} lbs of food at camp.`;
      }
    });

    const eventCard = document.querySelector("[data-event-card]");
    if (eventCard) {
      const current = story.currentEvent(snapshot.totalMiles);
      eventCard.hidden = !current;
      if (current) {
        eventCard.querySelector("[data-event-title]").textContent = current.title;
        eventCard.querySelector("[data-event-text]").textContent = `${current.text} ${current.effect}`;
        eventCard.querySelector("[data-event-education]").textContent = current.education;
        eventCard.querySelector("[data-event-mile]").textContent = `Mile ${formatNumber(current.atMiles, 0)}`;
      }
    }

    renderDonnerCard(snapshot.totalMiles);
    renderJournal(snapshot);

    const contributors = document.querySelector("[data-community-contributors]");
    if (contributors) {
      contributors.replaceChildren();
      (snapshot.contributors || []).forEach((person) => {
        const parts = [`${formatNumber(person.miles)} mi`];
        if (person.food > 0) parts.push(`${formatNumber(person.food, 0)} lbs food`);
        contributors.append(listItem(`${person.name} - ${parts.join(", ")}`));
      });
      if (!contributors.children.length) contributors.append(listItem("No contributors yet."));
    }

    const largest = document.querySelector("[data-community-largest]");
    if (largest) {
      largest.replaceChildren();
      (snapshot.largest || []).forEach((row) => largest.append(listItem(`${row.name} - ${formatMiles(row.miles)}`)));
      if (!largest.children.length) largest.append(listItem("No contributions yet."));
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
    renderTrailForState();
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
    const nameField = form.elements.namedItem("traveler");
    if (nameField && window.OTDLE_COMMUNITY) nameField.value = window.OTDLE_COMMUNITY.getName();
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
      if (submitting) return;
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
      if (!community || !community.enabled) {
        message.textContent = "Community contributions are unavailable. No miles were saved. Try again when the service is available.";
        message.classList.add("is-error");
        return;
      }

      const finish = () => {
        try {
          addEntry(rounded, dateField.value, notesField.value.trim());
        } catch (error) {
          message.textContent = error.message;
          message.classList.add("is-error");
          return;
        }
        message.textContent = `${formatMiles(rounded)} added to the community expedition.`;
        form.reset();
        dateField.value = localDateString(new Date());
        dateField.max = localDateString(new Date());
        if (noteCount) noteCount.textContent = "0";
        milesField.focus();
        refreshCampaign();
        showStorageWarning();
      };

      submitting = true;
      submitButton.disabled = true;
      message.textContent = "Sending your miles to the community...";
      if (nameField) community.setName(nameField.value);
      community.submit(rounded, nameField ? nameField.value : "").then(finish, (error) => {
        message.textContent = `Could not confirm your contribution: ${error.message}. Retrying the same amount is safe.`;
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
    renderPersonalSummary(state);
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
        if (!button || !window.confirm("Delete this private journal entry? Your community contribution will remain recorded, but your local wagon and hunt progress will move back by those miles.")) return;
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
      if (!window.confirm("Start a new game? This permanently erases the miles, hunts and food saved in this browser. Community contributions remain recorded online. Download a backup first if you want to keep your private journal.")) return;
      clearSave();
      refreshCampaign();
      say("Private journey erased. Community contributions remain recorded online.");
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
