// App shell: auth gate, hash routing, state and actions. All Supabase access goes through the data layer.
import { SUPABASE_CONFIG } from "../config.js";
import { createClientFromGlobal, createDataLayer } from "../data/layer.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../trail/appalachian-trail.js";
import { computeProgress } from "../engine/progress.js";
import { DEFAULT_RULES, localDateString } from "../engine/activities.js";
import { computeRhythm, weekStart } from "../engine/game.js";
import { h, clear } from "./dom.js";
import { trailView, logView, historyView, campView, wildlifeView, badgesView } from "./views.js";

// Unknown routes fall back to the trail. Old bookmarks still work: #/hunt opens Wildlife Spotting and
// #/crew opens Camp at the "Your crew" section (the crew tab moved there). #/profile is long gone.
const ROUTES = { trail: trailView, log: logView, history: historyView, camp: campView, wildlife: wildlifeView, badges: badgesView };
const TITLES = { trail: "Trail", log: "Log", history: "History", camp: "Camp", wildlife: "Wildlife Spotting", badges: "Badges" };
const ALIASES = { hunt: "wildlife", crew: "camp" };
const ANCHORS = { crew: "crew-title" }; // aliases that focus a section instead of the page heading
const root = document.getElementById("app");
const nav = document.getElementById("nav");
const live = document.getElementById("live");
const CHALLENGE_KEY = "at.selectedChallenge"; // harmless preference only
const PAGE = 50;

const state = {
  user: null, profile: null, rules: DEFAULT_RULES, activities: [], hasMore: false, summary: { totalCreditedMiles: 0, weekCreditedMiles: 0, activeDates: [] },
  challenges: [], challenge: null, board: [], groupSummary: null, inviteCode: null, editingId: null, today: localDateString(),
  dispatches: [], dispatchesUnavailable: false, isOrganizer: false, dispatchEditing: null, supplies: {},
  campTime: null // in-memory preference only
};
let game = null; // the running expedition, stopped whenever the page re-renders
let layer = null;
let timer = null;

const announce = (text) => { live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); };
const rawRoute = () => location.hash.replace(/^#\/?/, "");
const route = () => { const r = rawRoute(); const name = ALIASES[r] || r; return ROUTES[name] ? name : "trail"; };
// Background refreshes must not wipe something the hiker is typing (a dispatch, their trail name, a code).
const typing = () => Boolean(state.dispatchEditing || document.activeElement?.closest?.("#app input, #app textarea, #app select"));
const focusCrew = () => root.querySelector("#crew-title")?.focus();
const friendly = (e) => (e && e.message) || "Something went wrong.";

function derived() {
  const direction = state.challenge?.direction || TRAIL.defaultDirection;
  state.progress = computeProgress(TRAIL, state.summary.totalCreditedMiles, direction);
  state.rhythm = computeRhythm(state.summary.activeDates, state.today);
  // Camp follows the crew's combined miles when in a challenge, otherwise the hiker's own.
  state.campProgress = state.challenge && state.groupSummary
    ? computeProgress(TRAIL, state.groupSummary.totalCreditedMiles, direction) : state.progress;
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
    root.append(ROUTES[name](state, actions));
    nav.querySelectorAll("a").forEach((a) => (a.getAttribute("href") === `#/${name}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.title = `${TITLES[name]} · AT Fitness Tracker`;
  }
  if (focus) ((ANCHORS[rawRoute()] && document.getElementById(ANCHORS[rawRoute()])) || root.querySelector("[data-focus]"))?.focus();
}

async function loadAll() {
  try {
    state.today = localDateString();
    const ws = weekStart(state.today);
    const [profile, rules, page, summary, challenges] = await Promise.all([
      layer.profile.get(), layer.rules.list(), layer.activities.list({ limit: PAGE + 1 }), layer.activities.summary(ws), layer.challenges.listMine()
    ]);
    state.profile = profile; state.rules = rules.length ? rules : DEFAULT_RULES;
    state.hasMore = page.length > PAGE; state.activities = page.slice(0, PAGE);
    state.summary = summary; state.challenges = challenges;
    const saved = localStorage.getItem(CHALLENGE_KEY);
    state.challenge = challenges.find((c) => c.id === saved) || challenges[0] || null;
    await Promise.all([loadBoard(false), loadCamp()]);
    render({ focus: true });
  } catch (e) { root.replaceChildren(h("p", { class: "card", role: "alert" }, friendly(e))); }
}

async function loadBoard(draw = true) {
  if (!state.challenge) { state.board = []; state.groupSummary = null; return; }
  try {
    const [board, groupSummary] = await Promise.all([layer.challenges.leaderboard(state.challenge.id, weekStart(state.today)), layer.challenges.summary(state.challenge.id)]);
    const changed = JSON.stringify([board, groupSummary]) !== JSON.stringify([state.board, state.groupSummary]);
    state.board = board; state.groupSummary = groupSummary;
    if (draw && changed && route() === "camp" && !typing()) render();
  } catch (e) { announce(friendly(e)); }
}

// Camp data is optional: if the camp migration isn't applied yet the rest of the app still works.
async function loadCamp() {
  const challengeId = state.challenge?.id || null;
  const [dispatches, isOrganizer, supplies] = await Promise.all([
    layer.dispatches.list({ challengeId }).then((d) => { state.dispatchesUnavailable = false; return d; }).catch(() => { state.dispatchesUnavailable = true; return []; }),
    layer.dispatches.isOrganizer(),
    layer.expeditions.supplies(challengeId).catch(() => ({}))
  ]);
  state.dispatches = dispatches; state.isOrganizer = isOrganizer; state.supplies = supplies;
}

async function refreshSummary() {
  state.summary = await layer.activities.summary(weekStart(localDateString()));
}

async function reloadActivities() {
  const page = await layer.activities.list({ limit: PAGE + 1 });
  state.hasMore = page.length > PAGE; state.activities = page.slice(0, PAGE);
}

const actions = {
  edit(id) { state.editingId = id; render(); },
  async createActivity(value) {
    try {
      await layer.activities.create(value);
      await Promise.all([refreshSummary(), reloadActivities()]);
      await loadBoard(false);
      announce("Activity logged.");
      location.hash = "#/trail";
      render({ focus: true });
    } catch (e) { setStatus(friendly(e)); }
  },
  async updateActivity(id, value) {
    try {
      await layer.activities.update(id, value);
      state.editingId = null;
      await Promise.all([refreshSummary(), reloadActivities()]);
      await loadBoard(false);
      render({ focus: true }); announce("Activity updated.");
    } catch (e) { setStatus(friendly(e)); }
  },
  async deleteActivity(act) {
    if (!confirm(`Delete this ${act.type} activity on ${act.date}? This cannot be undone.`)) return;
    try {
      await layer.activities.remove(act.id);
      await Promise.all([refreshSummary(), reloadActivities()]);
      await loadBoard(false);
      render(); announce("Activity deleted.");
    } catch (e) { announce(friendly(e)); }
  },
  async loadMore() {
    const more = await layer.activities.list({ limit: PAGE + 1, offset: state.activities.length });
    state.hasMore = more.length > PAGE; state.activities.push(...more.slice(0, PAGE)); render();
  },
  async createChallenge({ name, direction }) {
    try {
      const created = await layer.challenges.create({ name, direction, startDate: state.today });
      state.challenges = await layer.challenges.listMine();
      state.challenge = state.challenges.find((c) => c.id === created.id) || state.challenges[0];
      state.inviteCode = created.inviteCode;
      localStorage.setItem(CHALLENGE_KEY, state.challenge.id);
      await Promise.all([loadBoard(false), loadCamp()]); render(); focusCrew(); announce("Crew started.");
    } catch (e) { setStatus(friendly(e), "crew"); }
  },
  async joinChallenge(code) {
    try {
      await layer.challenges.join(String(code).trim());
      state.challenges = await layer.challenges.listMine();
      state.challenge = state.challenges[state.challenges.length - 1];
      localStorage.setItem(CHALLENGE_KEY, state.challenge.id);
      await Promise.all([loadBoard(false), loadCamp()]); render(); focusCrew(); announce("Joined the crew.");
    } catch (e) { setStatus(friendly(e), "crew"); }
  },
  async leaveChallenge() {
    if (!confirm("Leave this crew? Your activities stay yours.")) return;
    try {
      await layer.challenges.leave(state.challenge.id);
      state.challenges = await layer.challenges.listMine();
      state.challenge = state.challenges[0] || null; state.inviteCode = null;
      await Promise.all([loadBoard(false), loadCamp()]); render(); focusCrew();
    } catch (e) { announce(friendly(e)); }
  },
  async showInvite() {
    try { state.inviteCode = await layer.challenges.inviteCode(state.challenge.id); render(); } catch (e) { announce(friendly(e)); }
  },
  async refresh() { await loadBoard(false); render(); focusCrew(); announce("Standings refreshed."); },
  registerGame(g) { game = g; },
  setCampTime(t) { state.campTime = t; render(); },
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
      await layer.expeditions.record(summary);
      state.supplies = await layer.expeditions.supplies(state.challenge?.id || null).catch(() => state.supplies);
      return `Pinned to the photo board at Camp: ${summary.score} photo points.`;
    } catch (e) { return friendly(e); }
  },
  async saveProfile({ displayName, weeklyGoalMiles }) {
    try {
      const goal = weeklyGoalMiles === "" || weeklyGoalMiles === null ? null : Number(weeklyGoalMiles);
      state.profile = await layer.profile.update({ displayName, weeklyGoalMiles: goal });
      setStatus("Saved.", "profile"); announce("Saved your spot at camp.");
    } catch (e) { setStatus(friendly(e), "profile"); }
  }
};

function onAuth(event, user) {
  if (!user || user.id === state.user?.id) return;
  state.user = user;
  clearInterval(timer);
  loadAll();
  // Leaderboard polling, not Realtime: RLS (correctly) hides other users' rows from realtime subscriptions.
  timer = setInterval(() => { if (!document.hidden && route() === "camp") loadBoard(true); }, 60000);
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
  window.addEventListener("hashchange", () => { if (state.user) { state.editingId = null; state.dispatchEditing = null; render({ focus: true }); if (route() === "camp") loadBoard(true); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) { loadBoard(true); } });
}

start();
