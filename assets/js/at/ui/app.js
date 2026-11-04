// App shell: anonymous session, hash routing, state and actions. All Supabase access goes through the data layer.
import { SUPABASE_CONFIG } from "../config.js";
import { createClientFromGlobal, createDataLayer } from "../data/layer.js";
import { isMissingFunction } from "../data/mappers.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../trail/appalachian-trail.js";
import { computeProgress } from "../engine/progress.js";
import { DEFAULT_RULES, localDateString } from "../engine/activities.js";
import { weekStart } from "../engine/game.js";
import { timeOfDay } from "../engine/camp.js";
import { PERSONAL_MARKS, expeditionTotals, groupMarks, hikerBadges, trailRegister } from "../engine/hikers.js";
import { h, clear } from "./dom.js";
import { trailView, logView, historyView, campView, wildlifeView } from "./views.js";

// Unknown routes fall back to the trail. Old bookmarks still work: #/hunt opens Wildlife Spotting;
// #/crew, #/badges and #/hikers open Camp at "The hikers" (badges now live there, per hiker).
// Old #/join/CODE bookmarks are harmless: there is nothing to join any more, so they open Camp.
const ROUTES = { trail: trailView, log: logView, camp: campView, wildlife: wildlifeView, history: historyView };
const TITLES = { trail: "Trail", log: "Log Activity", camp: "Camp", wildlife: "Wildlife Spotting", history: "History" };
const ALIASES = { hunt: "wildlife", crew: "camp", badges: "camp", hikers: "camp" };
const ANCHORS = { crew: "hikers-title", badges: "hikers-title", hikers: "hikers-title" }; // aliases that focus a section
const root = document.getElementById("app");
const nav = document.getElementById("nav");
const live = document.getElementById("live");
const CHALLENGE_KEY = "at.selectedChallenge"; // harmless preference only (crew-only dispatches)
const HIKER_KEY = "at.hiker"; // last hiker chosen on this device, to preselect the forms
const DIRECTION = TRAIL.defaultDirection; // the expedition walks northbound, Springer to Katahdin
const PAGE = 50;

const state = {
  user: null, rules: DEFAULT_RULES, activities: [], hasMore: false, editingId: null, today: localDateString(),
  expeditionUnavailable: false, expeditionError: false, deviceSummary: null, hikers: [], marks: [], fieldGuide: [], fieldGuideUnavailable: false, selectedHiker: null, lastHiker: null, flash: null,
  challenges: [], challenge: null, dispatches: [], dispatchesUnavailable: false, isOrganizer: false, dispatchEditing: null
};
let game = null; // the running expedition, stopped whenever the page re-renders
let layer = null;
let timer = null;
let shownTime = null; // camp's time of day when it was last drawn
let pendingDraw = false; // a background refresh changed data while the hiker was using the page

const announce = (text) => { live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); };
const rawRoute = () => location.hash.replace(/^#\/?/, "");
const route = () => { const r = rawRoute(); const name = ALIASES[r] || (/^join\//.test(r) ? "camp" : r); return ROUTES[name] ? name : "trail"; };
// Background refreshes must not wipe something the hiker is typing (a dispatch, an activity).
const typing = () => Boolean(state.dispatchEditing || document.activeElement?.closest?.("#app input, #app textarea, #app select"));
// Redrawing replaces every element, so background redraws wait while focus is on a control in the page
// (a map button, a landmark, a link): keyboard and screen-reader users keep their place.
const busy = () => typing() || Boolean(document.activeElement?.closest?.("#app button, #app a, #app summary, #app [tabindex]:not(h1)"));
const friendly = (e) => (e && e.message) || "Something went wrong.";
const readHiker = () => { try { return localStorage.getItem(HIKER_KEY); } catch (e) { return null; } };
const saveHiker = (id) => { try { if (id) localStorage.setItem(HIKER_KEY, id); } catch (e) { /* preference only */ } };

function derived() {
  state.totals = expeditionTotals(state.hikers);
  // Before the roster migration, progress comes from this device's own summary (the pre-Phase 8 behaviour).
  if (state.expeditionUnavailable && state.deviceSummary) {
    state.totals = { ...state.totals, totalMiles: state.deviceSummary.totalCreditedMiles, weekMiles: state.deviceSummary.weekCreditedMiles, activityCount: state.deviceSummary.activityCount };
  }
  state.progress = computeProgress(TRAIL, state.totals.totalMiles, DIRECTION);
  state.register = trailRegister(TRAIL, DIRECTION, state.marks, state.hikers);
}

function setStatus(text, which) {
  const el = root.querySelector(which ? `[data-status="${which}"]` : "[data-status]");
  if (el) el.textContent = text;
}

function render({ focus = false } = {}) {
  state.today = localDateString();
  if (game) { game.stop(); game = null; }
  clear(root);
  nav.hidden = !state.user;
  if (!state.user) {
    root.append(h("p", { class: "card", role: "status" }, "Getting your trail ready…"));
  } else {
    derived();
    const name = route();
    shownTime = timeOfDay(new Date().getHours());
    root.append(ROUTES[name](state, actions));
    nav.querySelectorAll("a").forEach((a) => (a.getAttribute("href") === `#/${name}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.title = `${TITLES[name]} · AT Fitness Tracker`;
  }
  if (focus) ((ANCHORS[rawRoute()] && document.getElementById(ANCHORS[rawRoute()])) || root.querySelector("[data-focus]"))?.focus();
}

async function loadAll() {
  try {
    state.today = localDateString();
    state.lastHiker = readHiker();
    const [rules, page, challenges] = await Promise.all([
      layer.rules.list(), layer.activities.list({ limit: PAGE + 1 }), layer.challenges.listMine().catch(() => [])
    ]);
    state.rules = rules.length ? rules : DEFAULT_RULES;
    state.hasMore = page.length > PAGE; state.activities = page.slice(0, PAGE);
    state.challenges = challenges;
    const saved = localStorage.getItem(CHALLENGE_KEY);
    state.challenge = challenges.find((c) => c.id === saved) || challenges[0] || null;
    await Promise.all([loadExpedition(false), loadCamp()]);
    render({ focus: true });
    if (state.flash) announce(state.flash.text);
  } catch (e) { root.replaceChildren(h("p", { class: "card", role: "alert" }, friendly(e))); }
}

// Roster, per-hiker totals and the marks behind badges and the trail register. If the roster
// migration isn't applied yet the app keeps working the old way (no hiker field).
async function loadExpedition(draw = true) {
  try {
    const [hikers, marks, fieldGuide] = await Promise.all([
      layer.expedition.hikers(weekStart(localDateString())),
      layer.expedition.marks({ group: groupMarks(TRAIL, DIRECTION).map((m) => m.miles), personal: PERSONAL_MARKS }),
      // Optional: without the field guide migration (or on a hiccup) keep the last guide we had.
      layer.expedition.fieldGuide().then((rows) => { state.fieldGuideUnavailable = false; return rows; })
        .catch((e) => { if (isMissingFunction(e)) state.fieldGuideUnavailable = true; return state.fieldGuide; })
    ]);
    const changed = state.expeditionError || JSON.stringify([hikers, marks, fieldGuide]) !== JSON.stringify([state.hikers, state.marks, state.fieldGuide]);
    Object.assign(state, { hikers, marks, fieldGuide, expeditionUnavailable: false, expeditionError: false, deviceSummary: null });
    if (!state.selectedHiker || !hikers.some((x) => x.id === state.selectedHiker)) state.selectedHiker = (hikers.find((x) => x.id === state.lastHiker) || hikers[0] || {}).id || null;
    if (draw && (changed || pendingDraw)) redrawInBackground();
  } catch (e) {
    if (isMissingFunction(e)) {
      // Migration not applied: no hiker field, progress from this device's summary.
      const deviceSummary = await layer.activities.summary(weekStart(localDateString())).catch(() => state.deviceSummary);
      const changed = !state.expeditionUnavailable || JSON.stringify(deviceSummary) !== JSON.stringify(state.deviceSummary);
      Object.assign(state, { hikers: [], marks: [], expeditionUnavailable: true, expeditionError: false, deviceSummary });
      if (draw && (changed || pendingDraw)) redrawInBackground();
      return;
    }
    // Timeouts, expired sessions, network: keep what we had (never fall back to the hiker-less
    // form) and say so. A later refresh clears the error.
    const wasError = state.expeditionError;
    state.expeditionError = true;
    if (!wasError || !draw) announce(friendly(e));
    if (draw && !wasError) redrawInBackground();
  }
}

function redrawInBackground() {
  if (!["trail", "camp", "log", "history"].includes(route())) return;
  // On History, never redraw over an open edit form (its unsaved values would be lost).
  if (busy() || (route() === "history" && state.editingId)) { pendingDraw = true; return; }
  pendingDraw = false;
  render();
}

// Camp data is optional: if the camp migration isn't applied yet the rest of the app still works.
async function loadCamp() {
  const challengeId = state.challenge?.id || null;
  const [dispatches, isOrganizer] = await Promise.all([
    layer.dispatches.list({ challengeId }).then((d) => { state.dispatchesUnavailable = false; return d; }).catch(() => { state.dispatchesUnavailable = true; return []; }),
    layer.dispatches.isOrganizer()
  ]);
  state.dispatches = dispatches; state.isOrganizer = isOrganizer;
}

async function reloadActivities() {
  const page = await layer.activities.list({ limit: PAGE + 1 });
  state.hasMore = page.length > PAGE; state.activities = page.slice(0, PAGE);
}

// Badges a hiker just unlocked (compares before/after a reload). Celebrated once, never nagged.
function newlyEarned(before) {
  const out = [];
  state.hikers.forEach((hk) => {
    const register = trailRegister(TRAIL, DIRECTION, state.marks, state.hikers);
    const had = new Set(before.get(hk.id) || []);
    hikerBadges(hk, { marks: state.marks, register, today: state.today, sightings: state.fieldGuide }).filter((b) => b.earned && !had.has(b.id)).forEach((b) => out.push(`${hk.name} earned ${b.title}!`));
  });
  return out;
}

function earnedSnapshot() {
  const register = trailRegister(TRAIL, DIRECTION, state.marks, state.hikers);
  return new Map(state.hikers.map((hk) => [hk.id, hikerBadges(hk, { marks: state.marks, register, today: state.today, sightings: state.fieldGuide }).filter((b) => b.earned).map((b) => b.id)]));
}

async function afterActivityChange() {
  const before = earnedSnapshot();
  await Promise.all([reloadActivities(), loadExpedition(false)]);
  return state.hikers.length && before.size ? newlyEarned(before) : [];
}

const actions = {
  edit(id) { state.editingId = id; render(); },
  selectHiker(id) { if (id) state.selectedHiker = id; },
  rememberHiker(id) { if (id) { state.lastHiker = id; saveHiker(id); } },
  async createActivity(value) {
    try {
      await layer.activities.create(value);
      actions.rememberHiker(value.hikerId);
      const unlocked = await afterActivityChange();
      const who = (state.hikers.find((x) => x.id === value.hikerId) || {}).name;
      const logged = `Logged ${value.creditedMiles} trail miles${who ? ` for ${who}` : ""}.`;
      state.flash = { route: "trail", text: unlocked.length ? `${logged} 🎉 ${unlocked.join(" ")}` : `${logged} Every step counts!` };
      location.hash = "#/trail";
      render({ focus: true });
      announce(state.flash.text);
    } catch (e) { setStatus(friendly(e)); }
  },
  async updateActivity(id, value) {
    try {
      await layer.activities.update(id, value);
      state.editingId = null;
      const unlocked = await afterActivityChange();
      render({ focus: true }); announce(unlocked.length ? `Activity updated. ${unlocked.join(" ")}` : "Activity updated.");
    } catch (e) { setStatus(friendly(e)); }
  },
  async deleteActivity(act) {
    if (!confirm(`Delete this ${act.type} activity on ${act.date}? This cannot be undone.`)) return;
    try {
      await layer.activities.remove(act.id);
      await afterActivityChange();
      render(); announce("Activity deleted.");
    } catch (e) { announce(friendly(e)); }
  },
  async loadMore() {
    const more = await layer.activities.list({ limit: PAGE + 1, offset: state.activities.length });
    state.hasMore = more.length > PAGE; state.activities.push(...more.slice(0, PAGE)); render();
  },
  async retryExpedition() {
    await loadExpedition(false);
    render({ focus: true });
    if (state.expeditionError) announce("Still can't reach the expedition. Check your connection and try again.");
  },
  registerGame(g) { game = g; },
  editDispatch(id) { state.dispatchEditing = id; render(); root.querySelector("#dTitle")?.focus(); },
  async saveDispatch(id, value) {
    try {
      if (id) await layer.dispatches.update(id, value); else await layer.dispatches.create(value);
      state.dispatchEditing = null;
      await loadCamp(); render(); announce(id ? "Dispatch updated." : "Dispatch posted.");
    } catch (e) { setStatus(friendly(e), "dispatch"); }
  },
  async deleteDispatch(d) {
    if (!confirm(`Delete the dispatch "${d.title}"? This cannot be undone.`)) return;
    try { await layer.dispatches.remove(d.id); await loadCamp(); render(); announce("Dispatch deleted."); } catch (e) { announce(friendly(e)); }
  },
  // Returns a message for the expedition page; does not re-render (the finished round stays on screen).
  async recordExpedition(summary) {
    try {
      const before = earnedSnapshot();
      await layer.expeditions.record(summary);
      actions.rememberHiker(summary.hikerId);
      await loadExpedition(false);
      const unlocked = before.size ? newlyEarned(before) : [];
      const who = (state.hikers.find((x) => x.id === summary.hikerId) || {}).name;
      if (who) return `Pinned to ${who}'s spot on the photo board at Camp: ${summary.score} photo points.${unlocked.length ? ` 🎉 ${unlocked.join(" ")}` : ""}`;
      return state.hikers.length ? `Saved ${summary.score} photo points. Choose who's spotting to pin the next outing to a hiker.` : `Saved ${summary.score} photo points.`;
    } catch (e) { return friendly(e); }
  }
};

function onAuth(event, user) {
  if (!user || user.id === state.user?.id) return;
  state.user = user;
  clearInterval(timer);
  loadAll();
  // Polling, not Realtime: RLS (correctly) hides other devices' rows from realtime subscriptions.
  // Camp also redraws when the time of day changes (morning, day, evening, night).
  timer = setInterval(() => {
    if (document.hidden) return;
    if (["trail", "camp"].includes(route()) || state.expeditionError) loadExpedition(true);
    if (route() === "camp" && timeOfDay(new Date().getHours()) !== shownTime && !busy()) render();
  }, 60000);
}

function startFailed() {
  root.replaceChildren(h("div", { class: "card", role: "alert" },
    h("p", {}, "We couldn't reach the trail server. Check your connection and try again."),
    h("button", { class: "btn primary", type: "button", onClick: () => { render(); boot(); } }, "Try again")));
}

function boot() {
  layer.auth.ensureSession().then((user) => onAuth("INITIAL", user)).catch(startFailed);
}

function start() {
  try {
    const client = createClientFromGlobal(SUPABASE_CONFIG, globalThis);
    layer = createDataLayer(client);
  } catch (e) {
    root.replaceChildren(h("p", { class: "card", role: "alert" }, "The app could not start. Check assets/js/at/config.js."));
    return;
  }
  layer.auth.onChange(onAuth);
  render();
  boot();
  window.addEventListener("hashchange", async () => {
    if (!state.user) return;
    state.editingId = null; state.dispatchEditing = null;
    if (state.flash && state.flash.route !== route()) state.flash = null; // shown once, on its own page
    render({ focus: true });
    pendingDraw = false; // the navigation itself just redrew the page
    if (["trail", "camp", "history"].includes(route()) || state.expeditionError) loadExpedition(true);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) loadExpedition(true); });
}

start();
