// Community progress client. Supabase is the only source of truth for community miles:
// nothing here reads or writes localStorage for totals (only an anonymous per-device "source" id).
// Zero dependencies: plain fetch for REST/RPC and a small Phoenix-protocol client for Realtime.
(function () {
  "use strict";

  const SETTINGS = window.OTDLE_SUPABASE || {};
  const MIN_MILES = 0.1;
  const MAX_MILES = 1000;
  const POLL_MS = 30000;
  const LOG_LIMIT = 200;
  const MAX_FOOD = 500;
  const HEARTBEAT_MS = 25000;
  const SOURCE_KEY = "oregon-trail-dle:source";
  const PENDING_KEY = "oregon-trail-dle:pending-contribution";
  const TAG = "[community]";

  const baseUrl = String(SETTINGS.url || "").replace(/\/+$/, "");
  const anonKey = String(SETTINGS.anonKey || "");
  const enabled = /^https:\/\/[^/]+$/.test(baseUrl) && anonKey.length > 20;

  const log = (...args) => console.info(TAG, ...args);
  const fail = (...args) => console.error(TAG, ...args);

  const listeners = new Set();
  let snapshot = null;
  let socket = null;
  let realtimeJoined = false;
  let pollTimer = null;
  let heartbeatTimer = null;
  let retryDelay = 1000;
  let started = false;
  let pendingSubmission = null;
  let memorySource = null;

  function newId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Anonymous, random, per-browser label used only for server-side rate limiting.
  function getSource() {
    try {
      let value = localStorage.getItem(SOURCE_KEY);
      if (!value) {
        value = newId();
        localStorage.setItem(SOURCE_KEY, value);
      }
      return value;
    } catch (error) {
      if (!memorySource) memorySource = newId();
      return memorySource;
    }
  }

  const NAME_KEY = "oregon-trail-dle:name";

  // The display name is the only contributor detail kept in the browser; it is public by design.
  function getName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (error) { return ""; }
  }

  function setName(value) {
    try { localStorage.setItem(NAME_KEY, cleanName(value) === "Traveler" && !String(value || "").trim() ? "" : cleanName(value)); } catch (error) { /* name is optional */ }
  }

  function getPendingSubmission(key) {
    if (pendingSubmission && pendingSubmission.key !== key) pendingSubmission = null;
    if (!pendingSubmission) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY));
        if (saved && saved.key === key && typeof saved.id === "string") pendingSubmission = saved;
      } catch (error) {
        // sessionStorage can be unavailable in private browsing; keep the id in memory instead.
      }
    }
    if (!pendingSubmission) pendingSubmission = { id: newId(), key };
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pendingSubmission)); } catch (error) { /* memory fallback */ }
    return pendingSubmission.id;
  }

  function clearPendingSubmission() {
    pendingSubmission = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (error) { /* memory fallback */ }
  }

  function headers(extra) {
    const result = { apikey: anonKey, "Content-Type": "application/json", ...extra };
    if (anonKey.startsWith("eyJ")) result.Authorization = `Bearer ${anonKey}`;
    return result;
  }

  async function request(path, options) {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers: headers(options && options.headers) });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).message || ""; } catch (error) { /* non-JSON error body */ }
      const error = new Error(detail || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function normalize(row) {
    return {
      totalMiles: Number(row.total_miles) || 0,
      totalContributions: Number(row.total_contributions) || 0,
      totalFood: Number(row.total_food) || 0,
      updatedAt: row.updated_at || null
    };
  }

  function publish(next, reason) {
    const keep = snapshot || {};
    snapshot = {
      ...next,
      recent: next.recent || keep.recent || [],
      journal: next.journal || keep.journal || [],
      largest: next.largest || keep.largest || [],
      contributors: next.contributors || keep.contributors || []
    };
    listeners.forEach((listener) => listener(snapshot, reason));
  }

  function cleanName(value) {
    const name = String(value || "").replace(/[^A-Za-z0-9 '.\-]/g, "").trim().slice(0, 24);
    return name || "Traveler";
  }

  // Top contributors are computed from the latest LOG_LIMIT rows to keep reads cheap.
  function summarizeLog(rows) {
    const byName = new Map();
    rows.forEach((row) => {
      const entry = byName.get(row.name) || { name: row.name, miles: 0, food: 0, count: 0 };
      entry.miles += row.miles;
      entry.food += row.food;
      entry.count += 1;
      byName.set(row.name, entry);
    });
    return {
      recent: rows.slice(0, 10),
      journal: rows,
      largest: rows.filter((row) => row.miles > 0).sort((a, b) => b.miles - a.miles).slice(0, 3),
      contributors: Array.from(byName.values()).sort((a, b) => (b.miles + b.food / 10) - (a.miles + a.food / 10)).slice(0, 5)
    };
  }

  async function fetchRecent() {
    const rows = await request(`/rest/v1/mileage_log?select=id,miles_added,food_added,contributor_name,kind,timestamp&order=timestamp.desc&limit=${LOG_LIMIT}`);
    log(`DB read: mileage_log (latest ${LOG_LIMIT})`, rows.length);
    return summarizeLog(rows.map((row) => ({
      id: row.id,
      miles: Number(row.miles_added) || 0,
      food: Number(row.food_added) || 0,
      name: row.contributor_name || "Traveler",
      kind: row.kind,
      timestamp: row.timestamp
    })));
  }

  function withLog(entries) {
    return entries ? { recent: entries.recent, journal: entries.journal, largest: entries.largest, contributors: entries.contributors } : {};
  }
  async function load(reason) {
    try {
      const rows = await request("/rest/v1/community_progress?select=total_miles,total_food,total_contributions,updated_at&id=eq.1");
      log(`DB read: community_progress (${reason || "load"})`, rows[0]);
      if (!rows.length) throw new Error("community_progress row missing; run supabase/schema.sql");
      const entries = await fetchRecent().catch((error) => { fail("recent read failed", error); return null; });
      publish({ ...normalize(rows[0]), ...withLog(entries), error: null }, reason || "load");
    } catch (error) {
      fail("DB read failed", error);
      if (snapshot) snapshot = { ...snapshot, error: error.message };
      listeners.forEach((listener) => listener(snapshot || { error: error.message }, "error"));
    }
  }

  function validateMiles(value) {
    const miles = Number(value);
    if (!Number.isFinite(miles) || miles < MIN_MILES || miles > MAX_MILES) {
      return { ok: false, message: `Enter a distance from ${MIN_MILES} to ${MAX_MILES.toLocaleString()} miles.` };
    }
    return { ok: true, miles: Math.round(miles * 100) / 100 };
  }

  // One submission id per attempt: retrying after a network error reuses it, so the
  // server's unique constraint guarantees the same contribution is never counted twice.
  async function contribute({ name, miles, food }) {
    if (!enabled) throw new Error("Community progress is not configured.");
    const body = { p_name: cleanName(name), p_miles: miles, p_food: food, p_source: getSource() };
    body.p_submission_id = getPendingSubmission(`${body.p_name}|${miles}|${food}`);
    log("Contribution submitting", body);
    try {
      const row = await request("/rest/v1/rpc/add_community_contribution", { method: "POST", body: JSON.stringify(body) });
      log("DB write OK: add_community_contribution", row);
      clearPendingSubmission();
      const result = Array.isArray(row) ? row[0] : row;
      publish({ ...normalize(result), error: null }, "submit");
      fetchRecent().then((entries) => publish({ ...snapshot, ...withLog(entries), error: null }, "submit")).catch((error) => fail("recent read failed", error));
    } catch (error) {
      fail("Contribution failed", error);
      if (error.status && error.status < 500) clearPendingSubmission();
      throw error;
    }
  }

  async function submit(value, name) {
    const check = validateMiles(value);
    if (!check.ok) throw new Error(check.message);
    await contribute({ name, miles: check.miles, food: 0 });
    return check.miles;
  }

  async function submitFood(value, name) {
    const food = Math.round(Number(value));
    if (!Number.isFinite(food) || food < 1 || food > MAX_FOOD) throw new Error(`Hunts add 1 to ${MAX_FOOD} lbs of food.`);
    await contribute({ name, miles: 0, food });
    return food;
  }
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { if (!realtimeJoined) load("poll"); }, POLL_MS);
  }

  function send(message) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
  }

  function connectRealtime() {
    if (typeof WebSocket === "undefined") {
      log("Realtime unavailable (no WebSocket); polling every", POLL_MS / 1000, "s");
      return;
    }
    const url = `${baseUrl.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`;
    let ref = 0;
    try { socket = new WebSocket(url); } catch (error) { fail("Realtime connect failed", error); return; }

    socket.addEventListener("open", () => {
      log("Realtime socket open");
      send({
        topic: "realtime:community-progress",
        event: "phx_join",
        ref: String(++ref),
        payload: {
          config: {
            broadcast: { ack: false, self: false },
            presence: { key: "" },
            postgres_changes: [{ event: "*", schema: "public", table: "community_progress" }],
            private: false
          }
        }
      });
      heartbeatTimer = setInterval(() => send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }), HEARTBEAT_MS);
    });

    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      if (message.event === "phx_reply" && message.topic === "realtime:community-progress") {
        realtimeJoined = message.payload && message.payload.status === "ok";
        if (realtimeJoined) {
          log("Realtime subscribed to community_progress");
          retryDelay = 1000;
          load("realtime-subscribed");
        } else {
          fail("Realtime join rejected; falling back to polling", message.payload);
        }
      } else if (message.event === "postgres_changes") {
        const record = message.payload && message.payload.data && message.payload.data.record;
        log("Realtime update", record);
        if (record && record.total_miles !== undefined) {
          publish({ ...normalize(record), error: null }, "realtime");
          fetchRecent().then((entries) => publish({ ...snapshot, ...withLog(entries), error: null }, "realtime")).catch((error) => fail("recent read failed", error));
        } else {
          load("realtime-refetch");
        }
      } else if (message.event === "phx_error" || message.event === "phx_close") {
        realtimeJoined = false;
      }
    });

    const closed = () => {
      if (!socket) return;
      socket = null;
      realtimeJoined = false;
      clearInterval(heartbeatTimer);
      log(`Realtime disconnected; retrying in ${retryDelay / 1000}s (polling continues)`);
      setTimeout(connectRealtime, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    };
    socket.addEventListener("close", closed);
    socket.addEventListener("error", (error) => fail("Realtime error", error));
  }

  function start() {
    if (!enabled || started) return;
    started = true;
    log("Connecting to", baseUrl);
    load("initial");
    connectRealtime();
    startPolling();
  }

  window.OTDLE_COMMUNITY = {
    enabled,
    start,
    submit,
    submitFood,
    cleanName,
    getName,
    setName,
    validateMiles,
    refresh: () => load("manual"),
    getSnapshot: () => snapshot,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
})();
