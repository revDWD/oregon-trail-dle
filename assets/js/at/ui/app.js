// App shell: auth gate, hash routing, state and actions. All Supabase access goes through the data layer.
import { SUPABASE_CONFIG } from "../config.js";
import { createClientFromGlobal, createDataLayer } from "../data/layer.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../trail/appalachian-trail.js";
import { computeProgress } from "../engine/progress.js";
import { DEFAULT_RULES, localDateString } from "../engine/activities.js";
import { computeRhythm, weekStart } from "../engine/game.js";
import { h, clear } from "./dom.js";
import { trailView, logView, historyView, crewView, badgesView, profileView } from "./views.js";

const ROUTES = { trail: trailView, log: logView, history: historyView, crew: crewView, badges: badgesView, profile: profileView };
const root = document.getElementById("app");
const nav = document.getElementById("nav");
const live = document.getElementById("live");
const CHALLENGE_KEY = "at.selectedChallenge"; // harmless preference only
const PAGE = 50;

const state = {
  user: null, profile: null, rules: DEFAULT_RULES, activities: [], hasMore: false, summary: { totalCreditedMiles: 0, weekCreditedMiles: 0, activeDates: [] },
  challenges: [], challenge: null, board: [], groupSummary: null, inviteCode: null, editingId: null, today: localDateString()
};
let layer = null;
let timer = null;

const announce = (text) => { live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); };
const route = () => { const r = location.hash.replace(/^#\/?/, ""); return ROUTES[r] ? r : "trail"; };
const friendly = (e) => (e && e.message) || "Something went wrong.";

function derived() {
  const direction = state.challenge?.direction || TRAIL.defaultDirection;
  state.progress = computeProgress(TRAIL, state.summary.totalCreditedMiles, direction);
  state.rhythm = computeRhythm(state.summary.activeDates, state.today);
}

function setStatus(text) { const el = root.querySelector("[data-status]"); if (el) el.textContent = text; }

function render({ focus = false } = {}) {
  state.today = localDateString();
  clear(root);
  nav.hidden = !state.user;
  if (!state.user) {
    root.append(h("p", { class: "card", role: "status" }, "Getting your trail ready…"));
  } else {
    derived();
    const name = route();
    root.append(ROUTES[name](state, actions));
    nav.querySelectorAll("a").forEach((a) => (a.getAttribute("href") === `#/${name}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.title = `${name[0].toUpperCase()}${name.slice(1)} · AT Fitness Tracker`;
  }
  if (focus) root.querySelector("[data-focus]")?.focus();
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
    await loadBoard(false);
    render({ focus: true });
  } catch (e) { root.replaceChildren(h("p", { class: "card", role: "alert" }, friendly(e))); }
}

async function loadBoard(draw = true) {
  if (!state.challenge) { state.board = []; state.groupSummary = null; return; }
  try {
    const [board, groupSummary] = await Promise.all([layer.challenges.leaderboard(state.challenge.id, weekStart(state.today)), layer.challenges.summary(state.challenge.id)]);
    state.board = board; state.groupSummary = groupSummary;
    if (draw && route() === "crew") render();
  } catch (e) { announce(friendly(e)); }
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
      await loadBoard(false); render({ focus: true }); announce("Challenge created.");
    } catch (e) { announce(friendly(e)); setStatus(friendly(e)); }
  },
  async joinChallenge(code) {
    try {
      await layer.challenges.join(String(code).trim());
      state.challenges = await layer.challenges.listMine();
      state.challenge = state.challenges[state.challenges.length - 1];
      localStorage.setItem(CHALLENGE_KEY, state.challenge.id);
      await loadBoard(false); render({ focus: true }); announce("Joined the challenge.");
    } catch (e) { announce(friendly(e)); setStatus(friendly(e)); }
  },
  async leaveChallenge() {
    if (!confirm("Leave this challenge? Your activities stay yours.")) return;
    try {
      await layer.challenges.leave(state.challenge.id);
      state.challenges = await layer.challenges.listMine();
      state.challenge = state.challenges[0] || null; state.inviteCode = null;
      await loadBoard(false); render({ focus: true });
    } catch (e) { announce(friendly(e)); }
  },
  async showInvite() {
    try { state.inviteCode = await layer.challenges.inviteCode(state.challenge.id); render(); } catch (e) { announce(friendly(e)); }
  },
  async refresh() { await loadBoard(true); announce("Leaderboard refreshed."); },
  async saveProfile({ displayName, weeklyGoalMiles }) {
    try {
      const goal = weeklyGoalMiles === "" || weeklyGoalMiles === null ? null : Number(weeklyGoalMiles);
      state.profile = await layer.profile.update({ displayName, weeklyGoalMiles: goal });
      setStatus("Saved."); announce("Profile saved.");
    } catch (e) { setStatus(friendly(e)); }
  }
};

function onAuth(event, user) {
  if (!user || user.id === state.user?.id) return;
  state.user = user;
  clearInterval(timer);
  loadAll();
  // Leaderboard polling, not Realtime: RLS (correctly) hides other users' rows from realtime subscriptions.
  timer = setInterval(() => { if (!document.hidden && route() === "crew") loadBoard(true); }, 60000);
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
  window.addEventListener("hashchange", () => { if (state.user) { state.editingId = null; render({ focus: true }); if (route() === "crew") loadBoard(true); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) { loadBoard(true); } });
}

start();
