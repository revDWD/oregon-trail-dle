// Views: pure functions of (state, actions) that return DOM nodes.
import { h, svg, fill, formatMiles, formatDay } from "./dom.js";
import { renderTrailMap, landmarkPicture } from "./map.js";
import { renderMarkdown } from "./markdown-view.js";
import { renderCampScene, markSelectedHiker } from "./camp-scene.js";
import { campPhotos, enableCamp3d, focusCamp3d, holdCamp3d, markCampHiker, mountCamp3d } from "./camp-3d.js";
import { CAMP_LOCATIONS, bulletinBoard, rosterCampfire } from "../engine/camp-world.js";
import { createExpedition } from "./expedition-view.js";
import { badgeArt } from "./badge-art.js";
import { CAMP_TIME_LABELS, campContext } from "../engine/camp.js";
import { DEFAULT_THEME, themeFor } from "../engine/expedition-themes.js";
import { coordinatesAtMarker, regionAtMarker } from "../engine/progress.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../trail/appalachian-trail.js";
import { ACTIVITY_TYPES, ACTIVITY_LABELS, MAX_NOTES_LENGTH, validateActivity, ruleFor, localDateString } from "../engine/activities.js";
import { groupMilestoneStatus } from "../engine/game.js";
import { buildFieldGuide, regionProgress, speciesBadges, speciesTitle, whereToLook, wildlifeCollection } from "../engine/field-guide.js";
import { expeditionJournal } from "../engine/journal.js";
import { badgeCollection, expeditionTotals, hikerBadges, hikerMilestones, hikerTimeline, hikerShare, nextMileBadge } from "../engine/hikers.js";
import { PATCH_SORTS, expeditionSummary, groupPatchesByState, landmarkPatches, nearbyWildlife, patchCollection, patchForecast, sortPatches } from "../engine/patches.js";
import { landmarkStory } from "../trail/landmark-stories.js";
import { explorerArt, patchArt } from "./patch-art.js";

const field = (id, label, control, hint, error) => h("div", { class: "field" },
  h("label", { for: id }, label), control,
  hint ? h("p", { class: "hint", id: `${id}-hint` }, hint) : null,
  h("p", { class: "error", id: `${id}-error`, role: "alert" }, error || ""));

const bar = (percent, label) => h("div", { class: "bar", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent },
  h("span", { style: `width:${percent}%` }));

const stat = (label, value) => h("div", { class: "stat" }, h("dt", {}, label), h("dd", {}, value));

const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const day = formatDay;

// A one-time message (a celebration) for the page it belongs to. Newly earned landmark patches and
// State Explorer patches are shown with their art, like a patch handed over at the trailhead. Patches
// belong to the whole expedition, so the celebration is the group's.
const flashNote = (s, page) => {
  if (!s.flash || s.flash.route !== page) return null;
  const patches = s.flash.patches || [];
  const explorers = s.flash.explorers || [];
  if (!patches.length && !explorers.length) return h("p", { class: "card celebrate" }, s.flash.text);
  return h("div", { class: "card celebrate" },
    s.flash.text ? h("p", {}, s.flash.text) : null,
    h("ul", { class: "patch-earned-list" },
      explorers.map((explorer) => h("li", { class: "patch-earned explorer" },
        explorerArt(explorer, { shadow: true }),
        h("div", {},
          h("p", { class: "patch-earned-title" }, `State Patch Earned: ${explorer.name}`),
          h("p", {}, `The Expedition reached every ${explorer.stateName} landmark.`),
          h("p", { class: "hint" }, `Unlocked by the Expedition · ${explorer.landmarks} ${explorer.landmarks === 1 ? "landmark" : "landmarks"}`)))),
      patches.map((patch) => h("li", { class: "patch-earned" },
        patchArt(patch, { shadow: true }),
        h("div", {},
          h("p", { class: "patch-earned-title" }, `Patch Earned: ${patch.landmarkName}`),
          h("p", {}, `The Expedition reached ${patch.landmarkName}.`),
          h("p", { class: "hint" }, `Unlocked by the Expedition · ${patch.state} · mile ${patch.mile}`))))),
    h("p", { class: "more-link" }, h("a", { href: "#/patches" }, "See the Expedition's patch collection in History")));
};
const activeHikers = (s) => (s.hikers || []).filter((x) => x.active);
// The roster is loaded (anyone can log for any hiker; there is nothing to join).
const hasRoster = (s) => !s.expeditionUnavailable && (s.hikers || []).length > 0;
const hikerName = (s, id) => (s.hikers || []).find((x) => x.id === id)?.name || null;
// The expedition's shared Landmark Patch collection: reached together, owned by every hiker.
const expeditionOf = (s) => expeditionSummary(s.hikers, s.totals);
const expeditionPatches = (s) => landmarkPatches(TRAIL, s.progress.direction, expeditionOf(s), s.marks);


// Kevin's (the organizer's) latest message: pinned first, then newest.
function dispatchCard(d, { featured = false, actions = null } = {}) {
  return h("article", { class: `card dispatch${featured ? " featured" : ""}${d.pinned ? " pinned" : ""}`, "aria-labelledby": `dispatch-${d.id}` },
    featured ? h("p", { class: "eyebrow" }, h("span", { "aria-hidden": "true" }, "🔥 "), d.pinned ? "Pinned dispatch" : "Latest dispatch") : null,
    h("h3", { id: `dispatch-${d.id}` }, d.title),
    h("p", { class: "byline" }, `${d.authorName} · ${when(d.publishedAt)}${d.pinned ? " · pinned" : ""}`),
    renderMarkdown(d.body),
    actions);
}

// The trail map, with the Expedition's earned landmark patches pinned beside their landmarks. Patches
// just earned (the celebration after logging) get a one-time stitch-pop on the map.
function trailMap(s) {
  const list = expeditionPatches(s);
  const fresh = s.flash && s.flash.route === "trail" ? (s.flash.patches || []).map((p) => p.id) : [];
  const next = list.find((pt) => !pt.earned);
  return [
    h("p", { class: "hint map-patch-next" }, next
      ? `The Expedition's next patch: ${next.landmarkName}, ${formatMiles(next.milesToGo)} away.`
      : "The Expedition has collected every landmark patch!"),
    renderTrailMap(TRAIL, s.progress, { patches: { list, fresh } })
  ];
}

// Trail Dispatches: the organizer's updates from the trail, newest (or pinned) first, the rest one tap
// away. Organizers write, edit and delete them here.
function dispatchSection(s, a) {
  const list = s.dispatches || [];
  const editing = s.dispatchEditing;
  const tools = (d) => (s.isOrganizer ? h("div", { class: "row" },
    h("button", { class: "btn small", type: "button", "aria-label": `Edit dispatch: ${d.title}`, onClick: () => a.editDispatch(d.id) }, "Edit"),
    h("button", { class: "btn small danger", type: "button", "aria-label": `Delete dispatch: ${d.title}`, onClick: () => a.deleteDispatch(d) }, "Delete")) : null);
  const show = (d, featured) => (editing === d.id ? dispatchForm(s, a, d) : dispatchCard(d, { featured, actions: tools(d) }));
  const [first, ...earlier] = list;
  return h("section", { class: "dispatches", "aria-labelledby": "dispatches-title" },
    h("h2", { id: "dispatches-title", tabindex: "-1" }, "Trail Dispatches"),
    h("p", { class: "hint" }, "Updates, stories and encouragement from the trip organizer."),
    s.isOrganizer && editing === "new" ? dispatchForm(s, a, null) : null,
    s.isOrganizer && editing !== "new" ? h("p", { class: "row" }, h("button", { class: "btn primary", type: "button", onClick: () => a.editDispatch("new") }, "Write a dispatch")) : null,
    first ? show(first, true) : h("p", { class: "card" }, s.dispatchesUnavailable ? "Dispatches will appear here once camp is set up." : "No dispatches yet. Check back soon!"),
    earlier.length ? h("details", { class: "timeline-wrap earlier-dispatches", open: earlier.some((d) => d.id === editing) },
      h("summary", {}, `Earlier Dispatches (${earlier.length})`),
      earlier.map((d) => show(d, false))) : null);
}

export function trailView(s, a) {
  const p = s.progress;
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, p.completed ? "The Expedition Finished the Appalachian Trail!" : "The Expedition"),
    flashNote(s, "trail"),
    h("div", { class: "card hero" },
      h("p", { class: "big" }, `${p.percent}%`),
      bar(Math.floor(p.percent), "Trail completed together"),
      h("dl", { class: "stats" },
        stat("Miles hiked together", formatMiles(p.creditedMiles)),
        stat("Miles to go", formatMiles(p.remainingMiles)),
        stat("Landmarks passed", `${p.passedLandmarks.length} of ${p.landmarks.length}`),
        p.nextLandmark ? stat(`Next: ${p.nextLandmark.name}`, formatMiles(p.distanceToNext)) : stat("Next landmark", "We made it!")),
      h("p", { class: "row" }, h("a", { class: "btn primary", href: "#/log" }, "Log an activity"))),
    dispatchSection(s, a),
    h("div", { class: "card map-card" }, h("h2", {}, "Trail Map"),
      h("div", { class: "map-holder" }, trailMap(s)),
      h("p", { class: "hint" }, `${TRAIL.directions[p.direction].label}. Mileage, elevations and positions are approximate.`)));
}

// `hikers` (roster objects) makes choosing a hiker required; null keeps the pre-roster form.
export function activityForm({ rules, existing, onSubmit, onCancel, today, hikers = null, lastHikerId = null }) {
  const e = existing;
  const rule = (type) => ruleFor(rules, type, today);
  const factorHint = h("p", { class: "hint", id: "factor-hint", "aria-live": "polite" });
  const status = h("p", { class: "status", role: "status", "data-status": "" });
  const chosen = e ? e.hikerId : lastHikerId;
  const hikerSel = hikers ? h("select", { id: "hikerId", name: "hikerId", required: true, "aria-describedby": "hikerId-hint" },
    h("option", { value: "", selected: !hikers.some((x) => x.id === chosen) }, "Choose a hiker"),
    hikers.map((x) => h("option", { value: x.id, selected: x.id === chosen }, x.name))) : null;
  const typeSel = h("select", { id: "type", name: "type", "aria-describedby": "factor-hint" },
    ACTIVITY_TYPES.map((t) => h("option", { value: t, selected: (e?.type || "walking") === t }, ACTIVITY_LABELS[t])));
  const miles = h("input", { id: "miles", name: "miles", type: "number", inputmode: "decimal", step: "0.01", min: "0.1", required: true, value: e ? e.actualMiles : "" });
  const update = () => {
    const r = rule(typeSel.value);
    const val = Number(miles.value);
    factorHint.textContent = r ? `${ACTIVITY_LABELS[typeSel.value]} counts ${r.factor} trail mile per mile${val > 0 ? ` (about ${Math.round(val * r.factor * 100) / 100} trail miles)` : ""}.` : "";
  };
  typeSel.addEventListener("change", update); miles.addEventListener("input", update); update();
  const form = h("form", { class: "card", novalidate: true, "aria-labelledby": "form-title",
    onSubmit: async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const result = validateActivity({ hikerId: f.get("hikerId"), type: f.get("type"), date: f.get("date"), miles: f.get("miles"), durationMinutes: f.get("durationMinutes"), notes: f.get("notes") },
        { rules, today, hikers: hikers ? hikers.map((x) => x.id) : undefined, originalDate: e ? e.date : null });
      ["hikerId", "type", "date", "miles", "durationMinutes", "notes"].forEach((k) => {
        const node = form.querySelector(`#${k}-error`); if (node) node.textContent = result.errors[k] || "";
        const input = form.querySelector(`#${k}`); if (input) input.setAttribute("aria-invalid", result.errors[k] ? "true" : "false");
      });
      if (!result.ok) { status.textContent = "Please fix the highlighted fields."; form.querySelector("[aria-invalid=true]")?.focus(); return; }
      status.textContent = "Saving…";
      await onSubmit(result.value, status);
    } },
  h("h2", { id: "form-title" }, e ? "Edit Activity" : "Log an Activity"),
  hikerSel ? field("hikerId", "Hiker", hikerSel, "Whose miles are these?") : null,
  field("type", "Activity", typeSel),
  field("date", "Date", h("input", { id: "date", name: "date", type: "date", required: true, value: e?.date || today, max: today })),
  field("miles", "Distance (miles)", miles),
  factorHint,
  field("durationMinutes", "Duration in minutes (optional)", h("input", { id: "durationMinutes", name: "durationMinutes", type: "number", inputmode: "numeric", min: 1, max: 1440, step: 1, value: e?.durationMinutes ?? "" })),
  field("notes", "Notes (optional)", h("textarea", { id: "notes", name: "notes", rows: 2, maxlength: MAX_NOTES_LENGTH }, e?.notes || "")),
  status,
  h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, e ? "Save changes" : "Log activity"),
    onCancel ? h("button", { class: "btn", type: "button", onClick: onCancel }, "Cancel") : null));
  return form;
}

export function logView(s, a) {
  // Never fall back to a form without the hiker field while the roster is just unreachable.
  const unknown = !s.expeditionUnavailable && !hasRoster(s);
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Log Activity"),
    h("p", {}, "Every mile counts, whatever the pace. Rest when you need to."),
    unknown ? h("div", { class: "card", role: "status" }, h("p", {}, "We couldn't reach the expedition just now, so the hiker list isn't available. We'll keep trying."),
      h("button", { class: "btn primary", type: "button", onClick: () => a.retryExpedition() }, "Try again"))
      : activityForm({ rules: s.rules, today: s.today, hikers: hasRoster(s) ? activeHikers(s) : null, lastHikerId: s.lastHiker, onSubmit: a.createActivity }));
}

export function historyView(s, a) {
  // Editing an old activity of a retired hiker keeps that hiker selectable.
  const rosterFor = (act) => {
    if (!hasRoster(s)) return null;
    const list = activeHikers(s);
    const own = (s.hikers || []).find((x) => x.id === act.hikerId);
    return own && !list.includes(own) ? [...list, own] : list;
  };
  const list = s.activities.length
    ? h("ul", { class: "history" }, s.activities.map((act) => {
      if (s.editingId === act.id) return h("li", {}, activityForm({ rules: s.rules, existing: act, today: s.today, hikers: rosterFor(act), onSubmit: (v, st) => a.updateActivity(act.id, v, st), onCancel: () => a.edit(null) }));
      const name = hikerName(s, act.hikerId);
      return h("li", { class: "card" },
        h("p", {}, h("strong", {}, `${name ? `${name} · ` : ""}${ACTIVITY_LABELS[act.type]} · ${formatMiles(act.actualMiles)}`), ` on ${act.date}`),
        h("p", { class: "hint" }, `Credited ${formatMiles(act.creditedMiles)} of trail${act.durationMinutes ? ` · ${act.durationMinutes} min` : ""}`),
        !act.hikerId && hasRoster(s) ? h("p", { class: "unassigned" }, "No hiker yet, so these miles don't count for the expedition. Edit to choose who hiked them.") : null,
        act.notes ? h("p", {}, act.notes) : null,
        h("div", { class: "row" },
          h("button", { class: "btn", type: "button", "aria-label": `Edit ${ACTIVITY_LABELS[act.type]} on ${act.date}`, onClick: () => a.edit(act.id) }, "Edit"),
          h("button", { class: "btn danger", type: "button", "aria-label": `Delete ${ACTIVITY_LABELS[act.type]} on ${act.date}`, onClick: () => a.deleteActivity(act) }, "Delete")));
    }))
    : h("p", { class: "card" }, "No activities from this device yet. Log a walk to move the expedition forward.");
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "History"),
    h("p", { class: "hint" }, "The expedition's archive: its journal, collections, statistics and the trail register. Open a section to explore it."),
    journalSection(s),
    hasRoster(s) ? patchSection(s) : null,
    wildlifeSection(s),
    hikersSection(s, a),
    hasRoster(s) ? statsSection(s, a) : null,
    hasRoster(s) ? registerSection(s) : null,
    historyPanel("activities-title", `Your Activities (${s.activities.length}${s.hasMore ? "+" : ""})`, { open: Boolean(s.editingId), className: "your-activities" },
      h("p", { class: "hint" }, "Activities logged from this device. Only this device can edit or delete them."),
      list,
      s.hasMore ? h("button", { class: "btn", type: "button", onClick: a.loadMore }, "Load older activities") : null));
}

// History's sections fold away so the archive is quick to scan. Each opens on tap; which ones are open
// is remembered (in memory) while the app is open. Old links (#/patches, #/hikers) open their section.
const openPanels = new Set();
export function openHistoryPanel(titleId) { if (titleId) openPanels.add(titleId); }
function historyPanel(titleId, title, { open = false, className = "", note = null } = {}, ...content) {
  return h("details", { class: `history-panel${className ? ` ${className}` : ""}`, open: open || openPanels.has(titleId),
    onToggle: (e) => {
      if (e.target !== e.currentTarget) return; // nested details toggle on their own
      if (e.currentTarget.open) openPanels.add(titleId); else openPanels.delete(titleId);
    } },
  h("summary", {}, h("h2", { id: titleId, tabindex: "-1" }, title), note ? h("span", { class: "hint panel-note" }, note) : null),
  h("div", { class: "history-panel-body" }, content));
}

const JOURNAL_SHOWN = 12;

function journalEntry(e) {
  const icon = e.species ? speciesArt(e.species, true) : badgeArt(e.art, { size: 44, prestige: e.prestige });
  return h("li", { class: `journal-entry kind-${e.kind}${e.rarity ? ` is-${e.rarity}` : ""}${e.prestige ? " is-prestige" : ""}` },
    h("span", { class: "journal-icon" }, icon),
    h("span", { class: "journal-text" }, h("strong", {}, e.title),
      h("span", { class: "hint" }, `${e.date ? day(e.date) : "Date unknown"} · ${e.detail}`)));
}

// Everything meaningful on the journey, newest first: landmarks, group milestones, wildlife
// discoveries, field-guide milestones and badges. Built from data already loaded for Trail and Camp.
function journalSection(s) {
  const entries = s.expeditionUnavailable ? [] : expeditionJournal({ hikers: s.hikers, register: s.register, marks: s.marks,
    sightings: s.fieldGuideUnavailable ? [] : s.fieldGuide, today: s.today });
  const body = s.expeditionUnavailable
    ? h("p", { class: "card" }, "The journal fills in once the expedition is reachable again.")
    : !entries.length
      ? h("p", { class: "card" }, "The journal is blank for now. Log a walk or photograph some wildlife to write the first entry.")
      : h("div", { class: "card journal-card" },
        h("ol", { class: "journal" }, entries.slice(0, JOURNAL_SHOWN).map(journalEntry)),
        entries.length > JOURNAL_SHOWN ? h("details", { class: "timeline-wrap" }, h("summary", {}, `Older Entries (${entries.length - JOURNAL_SHOWN})`),
          h("ol", { class: "journal" }, entries.slice(JOURNAL_SHOWN).map(journalEntry))) : null);
  return historyPanel("journal-title", entries.length ? `Expedition Journal (${entries.length} ${entries.length === 1 ? "Entry" : "Entries"})` : "Expedition Journal", { className: "journal-section" },
    h("p", { class: "hint" }, "Every landmark, wildlife discovery and badge on the journey, newest first."),
    body);
}

// A species badge: the species sprite in a medallion. Locked badges stay a silhouette with a hidden
// name and a where-to-look hint; unlocked ones show when it was first photographed and how often.
const photoCount = (n) => `${n} ${n === 1 ? "photo" : "photos"}`;
const speciesBadge = (b) => (b.earned
  ? h("li", { class: `badge species-badge earned${b.bonus ? " prestige" : b.rarity === "rare" ? " rare" : ""}` },
    h("span", { class: "species-medal" }, speciesArt(b.spec, true)), h("strong", {}, b.title),
    b.bonus ? h("span", { class: "tag" }, "Legend") : b.rarity === "rare" ? h("span", { class: "tag" }, "Rare find") : null,
    h("span", { class: "hint" }, `${b.earnedOn ? `Found ${day(b.earnedOn)}` : "Found"}${b.photos ? ` · ${photoCount(b.photos)}` : ""}`))
  : h("li", { class: "badge species-badge locked" }, h("span", { class: "species-medal" }, speciesArt(b.spec, false)), h("strong", {}, "???"),
    h("span", { class: "hint" }, b.hint || "Still out there somewhere."),
    h("span", { class: "sr-only" }, "Not yet photographed. Find it on a photo outing at Camp.")));

// Collector stats for one hiker's lifetime wildlife collection.
function collectionStats(c) {
  if (!c.found && !c.legendsFound) return h("p", { class: "hint" }, "No species photographed yet. Choose this hiker for a photo outing at Camp's Wildlife Observation Area to start their collection.");
  return h("dl", { class: "stats collection-stats" },
    stat("Species found", `${c.found} of ${c.total} · ${c.percent}%`),
    stat("Rare species", `${c.rareFound} of ${c.rareTotal}`),
    stat("Photos taken", String(c.photos)),
    c.mostPhotographed ? stat("Most photographed", `${c.mostPhotographed.title} (${photoCount(c.mostPhotographed.photos)})`) : null,
    c.recent.length ? stat("Recent finds", c.recent.map((r) => r.title).join(", ")) : null);
}

// ---- Landmark Patch Collection --------------------------------------------------------------------
// One collectible patch per landmark, earned by the whole Expedition when its shared miles reach the
// landmark. There is one collection and every hiker owns it. Lives in History; the Trail map pins the
// earned ones and Camp's felt blanket shows them off.
const patchUi = { sort: "trail", selected: null };

const patchStatus = (pt) => (pt.earned ? (pt.earnedOn ? `Earned ${day(pt.earnedOn)}` : "Earned") : `${formatMiles(pt.milesToGo)} to go`);

// An inked passport stamp with the earned date.
const dateStamp = (on) => h("span", { class: "date-stamp" }, h("span", { class: "stamp-word" }, "Earned"), on ? h("span", {}, day(on)) : null);

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// Collector's edition details: the landmark photo, the patch, facts, why it matters, wildlife nearby,
// trivia and real-world resources (patch shops and official pages, best first).
function patchDetail(pt) {
  if (!pt) return h("p", { class: "hint" }, "Choose a patch to read about its landmark and find related resources.");
  const landmark = (TRAIL.landmarks || []).find((l) => l.id === pt.landmarkId);
  const story = landmarkStory(pt.landmarkId) || {};
  const wildlife = nearbyWildlife(pt);
  const trivia = [pt.trivia, story.didYouKnow].filter(Boolean);
  return h("div", { class: `patch-detail-card${pt.earned ? " earned" : ""}` },
    h("div", { class: "patch-detail-art" }, patchArt(pt, { shadow: true }), pt.earned ? dateStamp(pt.earnedOn) : null),
    h("div", { class: "patch-detail-body" },
      h("h3", {}, pt.name),
      h("p", { class: "hint" }, pt.earned ? `Unlocked by the Expedition${pt.earnedOn ? ` · ${day(pt.earnedOn)}` : ""}` : `Not yet reached · ${patchStatus(pt)} for the Expedition`),
      landmark ? h("div", { class: "patch-detail-photo" }, landmarkPicture(landmark)) : null,
      h("p", {}, pt.description),
      h("dl", { class: "facts" },
        h("dt", {}, "Landmark"), h("dd", {}, pt.landmarkName),
        h("dt", {}, "State"), h("dd", {}, pt.stateNames.join(" / ")),
        pt.elevationFt ? [h("dt", {}, "Elevation"), h("dd", {}, `about ${pt.elevationFt.toLocaleString("en-US")} ft`)] : null,
        h("dt", {}, "Mile"), h("dd", {}, `${Number(pt.mile).toLocaleString("en-US")} of ${TRAIL.totalMiles.toLocaleString("en-US")}`),
        pt.region ? [h("dt", {}, "Section"), h("dd", {}, pt.region.name)] : null,
        pt.since ? [h("dt", {}, "On the trail since"), h("dd", {}, `${pt.since.year}${pt.since.note ? `, ${pt.since.note}` : ""}`)] : null),
      story.history ? [h("h4", {}, "Why This Landmark Matters"), h("p", {}, story.history)] : null,
      wildlife.length ? [h("h4", {}, "Nearby Wildlife"),
        h("p", {}, `Often met around here: ${wildlife.map((w) => lowerFirst(w.name)).join(", ")}. Look for them on a photo outing at Camp.`)] : null,
      trivia.length ? [h("h4", {}, "Trail Trivia"), h("ul", { class: "patch-trivia" }, trivia.map((t) => h("li", {}, t)))] : null,
      pt.resources.length ? [h("h4", {}, "Related Resources"),
        h("ul", { class: "patch-links" }, pt.resources.map((r) => h("li", {},
          h("span", { class: `tag kind-${r.kind}` }, r.kindLabel), " ",
          h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.label, h("span", { class: "sr-only" }, " (opens in a new tab)")),
          r.offerLabels.length ? h("span", { class: "offers" }, r.offerLabels.map((o) => h("span", { class: `offer${o === "Patch available" ? " has-patch" : ""}` }, o))) : null))),
        h("p", { class: "hint" }, "Shops and stock change: check a page before you travel.")] : null));
}

// Gentle motivation: what's next, the state underway, and a forecast at the Expedition's own pace
// (never a deadline).
function patchMotivation(c, forecast) {
  const month = (ymd) => { const d = new Date(`${ymd}T12:00:00`); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
  const state = c.nextState;
  return h("dl", { class: "stats collection-stats patch-stats" },
    stat("Expedition patches earned", `${c.earned} of ${c.total} · ${c.percent}%`),
    stat("Next patch", c.nearest ? `${c.nearest.landmarkName} · ${formatMiles(c.nearest.milesAway)} to go` : "Every patch collected!"),
    stat("State completion progress", state ? `${state.name} · ${state.earned} of ${state.total} (${state.percent}%)` : "Every state complete!"),
    stat("State patches", `${c.explorers.filter((x) => x.earned).length} of ${c.explorers.length}`),
    forecast && forecast.next ? stat("Trail forecast", `At about ${formatMiles(forecast.weeklyMiles)} a week together: next patch around ${month(forecast.next.date)}${forecast.complete && forecast.complete.patch !== forecast.next.patch ? `, the full set around ${month(forecast.complete.date)}` : ""}`) : null);
}

// State Collections: each state's landmarks and its State Explorer patch, larger and edged in gold.
function stateCollectionList(states) {
  return h("ul", { class: "state-collections", "aria-label": "State collections" }, states.map((st) => h("li", { class: `state-collection ${st.complete ? "earned" : "locked"}` },
    h("div", { class: "state-collection-art" }, explorerArt(st.explorer, { shadow: st.complete }), st.complete ? dateStamp(st.explorer.earnedOn) : null),
    h("div", {},
      h("strong", {}, `${st.name} Collection`),
      h("p", { class: "hint" }, `${st.earned} of ${st.total} ${st.total === 1 ? "landmark" : "landmarks"} · ${st.percent}%`),
      bar(st.percent, `${st.name}: ${st.earned} of ${st.total} landmarks`),
      h("p", { class: "hint" }, st.complete ? `${st.explorer.name} patch unlocked by the Expedition.` : `When the Expedition reaches every ${st.name} landmark, everyone earns the ${st.explorer.name} patch.`)))));
}

// The Expedition's shared collection in History: summary always visible, the passport one tap away.
function patchSection(s) {
  const expedition = expeditionOf(s);
  const patches = landmarkPatches(TRAIL, s.progress.direction, expedition, s.marks);
  const c = patchCollection(patches, expedition);
  const forecast = patchForecast(patches, expedition, s.today);
  const detailId = "patch-detail";
  const detail = h("div", { id: detailId, class: "patch-detail" });
  const grid = h("div", { class: "patch-grid-wrap" });
  const tiles = new Map();
  const choose = (id, { scroll = false } = {}) => {
    const pt = patches.find((x) => x.id === id) || null;
    patchUi.selected = pt ? pt.id : null;
    tiles.forEach((btn, key) => btn.setAttribute("aria-pressed", key === patchUi.selected ? "true" : "false"));
    fill(detail, patchDetail(pt));
    if (scroll) detail.scrollIntoView?.({ block: "nearest" });
  };
  const tile = (pt) => {
    const btn = h("button", { type: "button", class: `patch-tile ${pt.earned ? "earned" : "locked"}`, "aria-pressed": "false", "aria-controls": detailId,
      onClick: () => choose(pt.id, { scroll: true }) },
    patchArt(pt, { decorative: true, shadow: pt.earned }),
    h("strong", {}, pt.landmarkName),
    h("span", { class: "hint" }, `${pt.state} · mile ${pt.mile}`),
    pt.earned ? dateStamp(pt.earnedOn) : h("span", { class: "hint patch-status" }, patchStatus(pt)));
    tiles.set(pt.id, btn);
    return h("li", {}, btn);
  };
  const drawGrid = () => {
    tiles.clear();
    fill(grid, patchUi.sort === "state"
      ? groupPatchesByState(patches).map((g) => [h("h3", { class: "patch-state" }, `${g.state} (${g.patches.filter((x) => x.earned).length} of ${g.patches.length})`),
        h("ul", { class: "patch-grid", "aria-label": `${g.state} patches` }, g.patches.map(tile))])
      : h("ul", { class: "patch-grid", "aria-label": "Landmark patches" }, sortPatches(patches, patchUi.sort).map(tile)));
    choose(patchUi.selected);
  };
  drawGrid();
  return historyPanel("patches-title", `Expedition Patch Collection (${c.earned} of ${c.total})`, { className: "patch-collection" },
    h("p", { class: "hint" }, "Each landmark has a patch. When the Expedition's shared miles reach a landmark, every hiker owns its patch, and earned patches appear on the Trail map. Reach every landmark in a state for its State Explorer patch."),
    patchMotivation(c, forecast),
    bar(c.percent, `Expedition collection progress: ${c.earned} of ${c.total} patches`),
    h("ul", { class: "patch-milestones", "aria-label": "Collection milestones" }, c.milestones.map((m) => h("li", { class: m.earned ? "earned" : "locked" },
      h("span", { "aria-hidden": "true" }, m.earned ? "★ " : "☆ "), m.title,
      h("span", { class: "hint" }, m.earned ? (m.earnedOn ? ` · ${day(m.earnedOn)}` : "") : ` · ${m.count - c.earned} to go`)))),
    h("details", { class: "timeline-wrap" },
      h("summary", {}, `Expedition Collection Progress (${c.earned} of ${c.total})`),
      h("div", { class: "patch-passport" },
        h("div", { class: "field patch-sort" },
          h("label", { for: "patch-sort" }, "Sort patches by"),
          h("select", { id: "patch-sort", onChange: (e) => { patchUi.sort = e.target.value; drawGrid(); } },
            Object.entries(PATCH_SORTS).map(([value, label]) => h("option", { value, selected: value === patchUi.sort }, label)))),
        grid,
        detail,
        h("h3", { class: "patch-state-title" }, "State Collections"),
        stateCollectionList(c.stateProgress))));
}

// One hiker's page in History: contribution, badges, milestones and their story so far.
function hikerPanel(s, hk) {
  const badges = hikerBadges(hk, { marks: s.marks, register: s.register, today: s.today, sightings: s.fieldGuide });
  const species = speciesBadges(s.fieldGuide, { hikerId: hk.id });
  const ms = hikerMilestones(hk, s.register);
  const timeline = hikerTimeline(badges, ms, species);
  const all = badgeCollection(badges, species);
  const next = nextMileBadge(hk);
  return h("article", { class: "card hiker-card", "aria-labelledby": "hiker-name" },
    h("h3", { id: "hiker-name", tabindex: "-1" }, hk.name),
    h("dl", { class: "stats" },
      stat("Miles contributed", formatMiles(hk.totalMiles)),
      stat("Share of the expedition", `${hikerShare(hk, s.totals)}%`),
      stat("This week", formatMiles(hk.weekMiles)),
      stat("Achievement badges", `${all.badges.earned} of ${all.badges.total}`),
      stat("Species badges", `${all.species.earned} of ${all.species.total}`)),
    // The bar measures exactly what is shown below it: every badge this hiker can collect.
    h("p", { class: "collection-label" }, h("strong", {}, "Badge Collection"),
      h("span", {}, `${all.earned} of ${all.total} badges · ${all.percent}%`)),
    bar(all.percent, `Badge collection: ${all.earned} of ${all.total} badges earned`),
    h("p", { class: "hint" }, next ? `${formatMiles(next.remaining)} to the next mileage badge.` : "Every mileage badge earned. Legendary!",
      all.legends ? ` Bonus: ${all.legends} Trail ${all.legends === 1 ? "Legend" : "Legends"} photographed!` : ""),
    h("h4", {}, "Achievement Badges"),
    // Locked badges stay a mystery (silhouette only); earning one reveals its art, name and story.
    h("ul", { class: "badge-grid" }, badges.map((b) => b.earned
      ? h("li", { class: `badge earned${b.prestige ? " prestige" : ""}` }, badgeArt(b.art, { earned: true, prestige: b.prestige }), h("strong", {}, b.title),
        h("span", { class: "badge-desc" }, b.description),
        h("span", { class: "hint" }, b.earnedOn ? `Earned ${day(b.earnedOn)}` : "Earned"))
      : h("li", { class: "badge locked" }, badgeArt(b.art, { earned: false }), h("strong", {}, "Locked"),
        h("span", { class: "sr-only" }, "Not yet earned. Keep hiking to discover it.")))),
    h("details", { class: "timeline-wrap species-badges" },
      h("summary", {}, `Species Badges (${all.species.earned} of ${all.species.total})`),
      collectionStats(wildlifeCollection(s.fieldGuide, { hikerId: hk.id })),
      h("p", { class: "hint" }, "Photograph a species for the first time on a photo outing at Camp to earn its badge. Finds are saved for good, across expeditions."),
      h("ul", { class: "badge-grid species-grid" }, species.map(speciesBadge))),
    h("h4", {}, "Milestones Reached"),
    ms.landmarks.length || ms.groupMilestones.length
      ? h("ul", { class: "milestones" },
        ms.landmarks.map((l) => h("li", {}, `Carried the expedition to ${l.title}`, h("span", { class: "hint" }, ` · mile ${l.miles}${l.reachedOn ? ` · ${day(l.reachedOn)}` : ""}`))),
        ms.groupMilestones.map((m) => h("li", {}, `${m.carried ? "Carried the expedition to" : "On the trail for"} “${m.title}”`, h("span", { class: "hint" }, m.reachedOn ? ` · ${day(m.reachedOn)}` : ""))))
      : h("p", { class: "hint" }, "Milestones appear here as the expedition passes landmarks and group goals."),
    timeline.length ? h("details", { class: "timeline-wrap" }, h("summary", {}, `${hk.name}'s Journey So Far (${timeline.length})`),
      h("ol", { class: "timeline" }, timeline.map((t) => h("li", {}, h("span", { class: "when" }, day(t.date)), h("span", {}, t.text))))) : null);
}

function hikersSection(s, a) {
  const hikers = s.hikers || [];
  if (!hasRoster(s)) return null;
  const panel = h("div", { id: "hiker-panel" });
  const buttons = new Map();
  const show = (id) => {
    const hk = hikers.find((x) => x.id === id) || hikers[0];
    if (!hk) return;
    a.selectHiker(hk.id);
    buttons.forEach((btn, key) => btn.setAttribute("aria-pressed", key === hk.id ? "true" : "false"));
    panel.replaceChildren(hikerPanel(s, hk));
    markCampHiker(hk.id);
  };
  const picker = h("div", { class: "hiker-picker", role: "group", "aria-label": "Choose a hiker" }, hikers.map((x) => {
    const btn = h("button", { class: "hiker-chip", type: "button", "aria-pressed": "false", "aria-controls": "hiker-panel", onClick: () => show(x.id) },
      h("span", { class: "chip-name" }, x.name), h("span", { class: "chip-miles" }, formatMiles(x.totalMiles)));
    buttons.set(x.id, btn);
    return btn;
  }));
  show(s.selectedHiker);
  const earned = hikers.reduce((sum, hk) => sum + badgeCollection(
    hikerBadges(hk, { marks: s.marks, register: s.register, today: s.today, sightings: s.fieldGuide }),
    speciesBadges(s.fieldGuide, { hikerId: hk.id })).earned, 0);
  return historyPanel("hikers-title", `The Hikers (${earned} ${earned === 1 ? "Badge" : "Badges"} Earned)`, { className: "hikers", note: "Badges, milestones and journeys" },
    hikers.length ? [picker, panel] : h("p", { class: "card" }, "No hikers on the roster yet."));
}

// Wildlife Discoveries: the field guide (every species the expedition has photographed, for good) and
// the photo board. Photos are taken on outings from Camp's Wildlife Observation Area.
function wildlifeSection(s) {
  const theme = themeFor(DEFAULT_THEME);
  const region = regionAtMarker(TRAIL, s.progress.position.marker);
  const found = s.fieldGuideUnavailable ? null : wildlifeCollection(s.fieldGuide).found;
  return historyPanel("wildlife-title", found === null ? "Wildlife Discoveries" : `Wildlife Discoveries (${found} Species)`, { className: "wildlife-records" },
    h("p", { class: "hint" }, "Every species the expedition has photographed, saved for good. Go on a photo outing from the Wildlife Observation Area at Camp to find more."),
    fieldGuideCard(s, theme, region ? region.scene : null),
    h("div", { class: "card" }, h("h3", {}, "The Photo Board"), photoBoard(s, theme),
      h("p", { class: "hint" }, "Up to 10 outings a day count toward the board. Photo outings are just for fun: only real activity adds trail miles.")));
}

// Expedition Statistics: the group's numbers in one place (what "This Week" on Trail used to show).
function statsSection(s, a) {
  const prog = s.progress;
  const roster = activeHikers(s);
  const r = rosterCampfire(roster, s.totals);
  const group = groupMilestoneStatus(TRAIL, prog.creditedMiles, roster.map((x) => ({ weekCreditedMiles: x.weekMiles })));
  return historyPanel("stats-title", "Expedition Statistics", { className: "expedition-stats", note: `${formatMiles(r.totalMiles)} together` },
    h("div", { class: "card" },
      h("dl", { class: "stats" },
        stat("Miles together", formatMiles(r.totalMiles)),
        stat("This week together", formatMiles(r.weekMiles)),
        stat("Activities logged", String(r.activities)),
        stat("Landmarks passed", `${prog.passedLandmarks.length} of ${prog.landmarks.length}`),
        stat("On the trail this week", `${r.onTrailThisWeek} of ${r.hikerCount}`),
        group.next ? stat(`Next group milestone: ${group.next.title}`, `${formatMiles(group.remainingToNext)} to go`) : stat("Group milestones", "Every one reached!")),
      group.everyoneMovedThisWeek ? h("p", {}, "Everyone moved this week. Great teamwork!") : null,
      roster.length ? [h("h3", {}, "This Week by Hiker"), h("ul", { class: "week-hikers" }, roster.map((x) => h("li", {},
        h("a", { href: "#/hikers", onClick: () => a.selectHiker(x.id) }, x.name), h("span", {}, formatMiles(x.weekMiles)))))] : null));
}

// ---- Camp locations -------------------------------------------------------------------------------
// The places in camp. Visiting one (walk up to it in the 3D camp, or choose it from Camp Locations)
// moves the camera in close and opens its sheet over the camp, styled as the thing itself: notes
// pinned on the bulletin board, patches sewn on a felt blanket, a parchment map on the table, journal
// pages, a wildlife board of photos, or a quiet seat by the fire. Each sheet is built from data
// already loaded and links to the page that does the full job. In the pixel camp it opens beneath.
const campUi = { open: null, outing: false };

// For app.js: a running photo outing keeps background redraws away, and old #/wildlife links open
// the Wildlife Observation Area.
export const campOutingOpen = () => campUi.outing;
export function openCampPlace(id) { if (CAMP_LOCATIONS.some((l) => l.id === id)) campUi.open = id; }

const campLink = (href, text) => h("p", { class: "more-link" }, h("a", { href }, text));

function campBulletin(s) {
  return bulletinBoard({ hikers: activeHikers(s), register: s.register || [], patches: hasRoster(s) ? expeditionPatches(s) : [], dispatches: s.dispatches || [] });
}

const pinnedNote = (title, body) => h("li", { class: "pinned-note" }, h("h4", {}, title), body);

// The Trail Map Table: the real shape of the trail (from the route's coordinates), the miles walked
// together, every landmark (reached ones filled, the next one ringed) and where camp is tonight.
function tableMap(s) {
  const prog = s.progress;
  const route = TRAIL.route;
  const lats = route.map((p) => p.lat);
  const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 360) * Math.PI);
  const xs = route.map((p) => p.lon * k);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...lats), Math.max(...lats)];
  const size = 200;
  const pad = 16;
  const scale = (size - pad * 2) / Math.max(x1 - x0, y1 - y0);
  const ox = (size - (x1 - x0) * scale) / 2;
  const oy = (size - (y1 - y0) * scale) / 2;
  const at = ({ lat, lon }) => [ox + (lon * k - x0) * scale, oy + (y1 - lat) * scale];
  const points = (list) => list.map((p) => at(p).map((n) => n.toFixed(1)).join(",")).join(" ");
  const marker = Number(prog.position && prog.position.marker) || 0;
  const start = prog.direction === "sobo" ? TRAIL.totalMiles : 0;
  const lo = Math.min(start, marker);
  const hi = Math.max(start, marker);
  const walked = [coordinatesAtMarker(TRAIL, lo), ...route.filter((p) => p.miles > lo && p.miles < hi), coordinatesAtMarker(TRAIL, hi)];
  const here = at(coordinatesAtMarker(TRAIL, marker));
  const next = prog.nextLandmark ? prog.nextLandmark.id : null;
  const [sx, sy] = at(route[0]);
  const [kx, ky] = at(route[route.length - 1]);
  return svg("svg", { class: "table-map", viewBox: `0 0 ${size} ${size}`, role: "img", focusable: "false",
    "aria-label": `Trail map: the Expedition has hiked ${formatMiles(prog.creditedMiles)}, ${Math.round(Number(prog.percent) || 0)}% of the way to ${prog.direction === "sobo" ? "Springer Mountain" : "Katahdin"}${prog.nextLandmark ? `. Next landmark: ${prog.nextLandmark.name}` : ""}.` },
  svg("polyline", { class: "table-route", points: points(route) }),
  hi > lo ? svg("polyline", { class: "table-walked", points: points(walked) }) : null,
  prog.landmarks.map((l) => {
    const [x, y] = at(l);
    return svg("circle", { class: `table-landmark${l.passed ? " passed" : ""}${l.id === next ? " next" : ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r: l.id === next ? 3.4 : 2.4 });
  }),
  svg("text", { class: "table-label", x: (sx + 6).toFixed(1), y: (sy + 3).toFixed(1) }, "Springer"),
  svg("text", { class: "table-label", x: (kx - 6).toFixed(1), y: (ky + 3).toFixed(1), "text-anchor": "end" }, "Katahdin"),
  svg("g", { class: "table-here", transform: `translate(${here[0].toFixed(1)} ${here[1].toFixed(1)})` },
    svg("circle", { class: "table-here-pulse", r: 7 }),
    svg("path", { d: "M0 -7 L5.5 3.5 L-5.5 3.5 Z" })));
}

function campPlaceBody(s, id, { choose, outing }) {
  const prog = s.progress;
  if (id === "roster") {
    // A seat by the fire: the camera circles slowly, and the roster is one tap away.
    if (!hasRoster(s)) return h("p", { class: "calm-line" }, "The fire crackles. The roster joins you once the expedition is reachable.");
    const r = rosterCampfire(activeHikers(s), s.totals);
    return [
      h("p", { class: "calm-line" }, `The fire crackles. ${r.hikerCount} ${r.hikerCount === 1 ? "hiker is" : "hikers are"} camped here, ${formatMiles(r.totalMiles)} up the trail together.`),
      h("details", { class: "calm-roster" }, h("summary", {}, "Who's at the Fire"),
        h("dl", { class: "stats" },
          stat("Miles together", formatMiles(r.totalMiles)),
          stat("This week", formatMiles(r.weekMiles)),
          stat("Activities logged", String(r.activities)),
          stat("On the trail this week", `${r.onTrailThisWeek} of ${r.hikerCount}`),
          r.weekStar ? stat("Most miles this week", `${r.weekStar.name} · ${formatMiles(r.weekStar.miles)}`) : null),
        h("ul", { class: "camp-roster" }, r.rows.map((row) => h("li", {},
          h("a", { href: "#/hikers", class: "btn small", "aria-label": `${row.name}: badges and milestones in History`, onClick: () => choose(row.id) }, row.name),
          h("span", { class: "hint" }, `${formatMiles(row.miles)} · ${row.share}% of the miles${row.weekMiles ? ` · ${formatMiles(row.weekMiles)} this week` : ""}`)))))];
  }
  if (id === "bulletin") {
    const b = campBulletin(s);
    const none = (text) => h("p", { class: "hint" }, text);
    return h("ul", { class: "cork-board", "aria-label": "Notes pinned on the board" },
      pinnedNote("Recently on the Trail", b.movers.length ? h("ul", { class: "camp-list" }, b.movers.map((m) => h("li", {}, `${m.name} logged miles ${day(m.date)}`,
        h("span", { class: "hint" }, m.weekMiles ? ` · ${formatMiles(m.weekMiles)} this week` : "")))) : none("No miles logged yet.")),
      pinnedNote("Latest Landmarks", b.landmarks.length ? h("ul", { class: "camp-list" }, b.landmarks.map((l) => h("li", {}, `The Expedition reached ${l.title}`,
        h("span", { class: "hint" }, ` · mile ${l.miles}${l.date ? ` · ${day(l.date)}` : ""}`)))) : none("The first landmark is just up the trail.")),
      pinnedNote("Recent Patch Unlocks", b.patches.length ? h("ul", { class: "camp-list" }, b.patches.map((p) => h("li", {}, `${p.name} patch`,
        h("span", { class: "hint" }, ` · ${p.state}${p.date ? ` · ${day(p.date)}` : ""}`)))) : none("No patches yet.")),
      pinnedNote("Expedition News", b.dispatch ? [
        h("p", {}, h("strong", {}, `“${b.dispatch.title}”`)),
        h("p", { class: "hint" }, `From ${b.dispatch.author || "the organizer"}${b.dispatch.date ? ` · ${when(b.dispatch.date)}` : ""}`),
        h("p", { class: "more-link" }, h("a", { href: "#/trail" }, "Read the dispatches on the Trail page"))] : none("No dispatches yet.")));
  }
  if (id === "journal") {
    const entries = s.expeditionUnavailable ? [] : expeditionJournal({ hikers: s.hikers, register: s.register, marks: s.marks,
      sightings: s.fieldGuideUnavailable ? [] : s.fieldGuide, today: s.today });
    return [
      h("div", { class: "journal-pages" }, entries.length ? h("ol", { class: "journal" }, entries.slice(0, 6).map(journalEntry))
        : h("p", { class: "hint" }, "The journal is blank for now. Log a walk or photograph some wildlife to write the first entry.")),
      campLink("#/history", "Read the whole Expedition Journal in History")];
  }
  if (id === "patches") {
    if (!hasRoster(s)) return h("p", { class: "hint" }, "Patches appear once the expedition is reachable.");
    const patches = expeditionPatches(s);
    const c = patchCollection(patches, expeditionOf(s));
    const earned = patches.filter((p) => p.earned);
    const states = c.explorers.filter((x) => x.earned);
    return [
      earned.length || states.length
        ? h("ul", { class: "felt-blanket", "aria-label": "Patches sewn on the blanket" },
          states.map((x) => h("li", { class: "felt-patch explorer" }, explorerArt(x, { decorative: true, shadow: true }), h("strong", {}, x.name))),
          earned.map((p) => h("li", { class: "felt-patch" }, patchArt(p, { decorative: true, shadow: true }), h("strong", {}, p.landmarkName),
            h("span", {}, p.earnedOn ? day(p.earnedOn) : p.state))))
        : h("p", { class: "felt-empty" }, c.nearest ? `The blanket is waiting for its first patch: ${c.nearest.landmarkName}, ${formatMiles(c.nearest.milesAway)} away.` : "The blanket is waiting for its first patch."),
      h("dl", { class: "stats" },
        stat("Expedition patches earned", `${c.earned} of ${c.total} · ${c.percent}%`),
        stat("Next patch", c.nearest ? `${c.nearest.landmarkName} · ${formatMiles(c.nearest.milesAway)} to go` : "Every patch collected!"),
        stat("State completion progress", c.nextState ? `${c.nextState.name} · ${c.nextState.earned} of ${c.nextState.total}` : "Every state complete!"),
        stat("State patches", `${states.length} of ${c.explorers.length}`)),
      bar(c.percent, `Expedition collection progress: ${c.earned} of ${c.total} patches`),
      campLink("#/patches", "Open the full Expedition Patch Collection in History")];
  }
  if (id === "wildlife") {
    const photos = campPhotos().slice(0, 6);
    const c = s.fieldGuideUnavailable ? null : wildlifeCollection(s.fieldGuide, { recentCount: 4 });
    const rarity = (spec) => (spec.rarity === "legend" ? "Trail Legend · " : spec.rarity === "rare" ? "Rare find · " : "");
    return [
      h("p", { class: "outing-call" }, h("button", { type: "button", class: "btn primary camp-outing-btn", onClick: outing }, "Go on a photo outing"),
        h("span", { class: "hint" }, " Choose a hiker and photograph the wildlife in this section. Finds are saved to their field guide.")),
      h("h4", {}, "Camp Photos"),
      photos.length
        ? h("ul", { class: "polaroids" }, photos.map((p) => h("li", {}, h("figure", { class: "polaroid" },
          p.src ? h("img", { src: p.src, alt: "" }) : h("span", { class: "polaroid-blank", "aria-hidden": "true" }, "📷"),
          h("figcaption", {}, p.caption)))))
        : h("p", { class: "hint" }, "No camp photos yet this visit. Use the camera to photograph a visitor or a friend; your photos are pinned here."),
      h("h4", {}, "Wildlife Discoveries"),
      !c ? h("p", { class: "hint" }, "The field guide fills in once wildlife records are reachable.")
        : !c.found && !c.legendsFound ? h("p", { class: "hint" }, "No species photographed yet. Go on a photo outing to take the first photo.")
          : [h("ul", { class: "find-cards" }, c.recent.map((r) => h("li", { class: `find-card${r.spec.rarity === "rare" || r.spec.rarity === "legend" ? " is-notable" : ""}` },
            speciesArt(r.spec, true), h("strong", {}, r.title), h("span", { class: "hint" }, `${rarity(r.spec)}${r.firstSeen ? day(r.firstSeen) : ""}`)))),
          collectionStats(c)],
      campLink("#/history", "Open the Field Guide and the Photo Board in History")];
  }
  const percent = Math.round(Number(prog.percent) || 0);
  const reached = prog.landmarks.filter((l) => l.passed);
  return [
    tableMap(s),
    h("dl", { class: "stats" },
      stat("Hiked together", `${formatMiles(prog.creditedMiles)} of ${TRAIL.totalMiles.toLocaleString("en-US")} mi · ${percent}%`),
      stat("Section", regionAtMarker(TRAIL, prog.position.marker)?.name || "—"),
      stat("Landmarks reached", `${reached.length} of ${prog.landmarks.length}`),
      stat("Next landmark", prog.nextLandmark ? `${prog.nextLandmark.name} · ${formatMiles(prog.distanceToNext)}` : "Katahdin reached!")),
    bar(percent, `Trail progress: ${percent}%`),
    reached.length ? [h("h4", {}, "Recently Reached"), h("ul", { class: "camp-list" }, reached.slice(-3).reverse().map((l) => h("li", {}, l.name,
      h("span", { class: "hint" }, ` · ${l.state} · mile ${l.miles}`))))] : null,
    campLink("#/trail", "Open the Trail map and landmark stories")];
}

const FULL_ICON = { enter: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5", exit: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" };

// The 3D camp (with the pixel camp as its fallback), its in-world sheet and the Camp Locations list.
function campExplorer(s, ctx, { scene, caption, captions, choose, a }) {
  campUi.outing = false;
  holdCamp3d(false);
  const holder = h("div", { class: "camp-stage" }, scene);
  const sheet = h("div", { id: "camp-place", class: "camp-sheet" });
  const outingLayer = h("div", { class: "camp-outing" });
  const frame = h("div", { class: "camp-frame" }, holder, sheet, outingLayer);
  const settings = h("div", { class: "camp3d-slot" });
  const life = h("div", { class: "camp3d-life-slot" });
  const buttons = new Map();
  const canvas = () => holder.querySelector(".camp3d-canvas");
  let returnTo = null;

  if (document.fullscreenEnabled && frame.requestFullscreen) {
    const icon = svg("path", { d: FULL_ICON.enter });
    const full = h("button", { type: "button", class: "camp-full", "aria-label": "Full screen", title: "Full screen", "aria-pressed": "false",
      onClick: () => (document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen()).catch(() => {}) },
    svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, icon));
    frame.addEventListener("fullscreenchange", () => {
      const on = document.fullscreenElement === frame;
      full.setAttribute("aria-pressed", on ? "true" : "false");
      icon.setAttribute("d", on ? FULL_ICON.exit : FULL_ICON.enter);
    });
    frame.append(full);
  }

  // A photo outing (Wildlife Spotting) from the Wildlife Observation Area: the game covers the camp,
  // which holds still until it is put away. Every outing belongs to one hiker (no anonymous finds).
  let game = null;
  const closeOuting = () => {
    if (!campUi.outing) return;
    if (game) { game.stop(); game = null; }
    fill(outingLayer);
    [holder, sheet, settings, life].forEach((el) => { el.inert = false; });
    campUi.outing = false;
    holdCamp3d(false);
    // The field guide may have grown: redraw the wildlife sheet from the fresh state.
    if (campUi.open === "wildlife") open("wildlife", { focus: false, restore: true });
    sheet.querySelector(".camp-outing-btn")?.focus({ preventScroll: true });
  };
  const startOuting = () => {
    if (campUi.outing) return;
    const theme = themeFor(DEFAULT_THEME);
    const region = regionAtMarker(TRAIL, s.progress.position.marker);
    const reducedMotion = Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const roster = activeHikers(s);
    const saved = h("p", { class: "status", role: "status" });
    const who = roster.length ? h("select", { id: "spotter", name: "spotter", "aria-describedby": "spotter-hint", onChange: (e) => a.rememberHiker(e.target.value) },
      h("option", { value: "", selected: !roster.some((x) => x.id === s.lastHiker) }, "Choose a hiker"),
      roster.map((x) => h("option", { value: x.id, selected: x.id === s.lastHiker }, x.name))) : null;
    let spotter = null;
    const beforeStart = () => {
      if (!roster.length) return "Photo outings need the hiker roster, which hasn't loaded. Please reload the page and try again.";
      if (!who.value) { who.focus(); return "Choose who's spotting first, so every photo goes into the right hiker's field guide."; }
      spotter = who.value;
      return null;
    };
    // Species already in the spotter's field guide: anything else is a discovery and scores double.
    const known = () => (s.fieldGuideUnavailable ? null : (s.fieldGuide || []).filter((r) => r.hikerId === who.value).map((r) => r.species));
    game = createExpedition(theme, { localHabitat: region ? region.scene : undefined, reducedMotion, known, beforeStart,
      onFinish: async (summary) => {
        // Empty outings aren't saved, so they never use up the 10-a-day allowance.
        if (!summary.score) { saved.textContent = summary.shots ? "Nothing to pin up this time. Spot again?" : "No photos taken, so nothing to pin up this time."; return; }
        if (!spotter) return;
        saved.textContent = "Saving your photos to the field guide…";
        saved.textContent = await a.recordExpedition({ ...summary, hikerId: spotter });
      } });
    a.registerGame(game);
    const title = h("h3", { id: "camp-outing-title", tabindex: "-1" }, "Photo Outing");
    fill(outingLayer, h("section", { class: "camp-outing-card", "aria-labelledby": "camp-outing-title",
      onKeydown: (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeOuting(); } } },
    h("div", { class: "camp-place-head" }, title,
      h("button", { type: "button", class: "btn small", "aria-label": "Back to camp: end the photo outing", onClick: closeOuting }, "Back to camp")),
    h("p", { class: "hint" }, theme.intro),
    who ? field("spotter", "Who's spotting?", who, "Choose a hiker before you start. Every photo is saved to their field guide and species badges, for good.") : null,
    game.element, saved));
    campUi.outing = true;
    holdCamp3d(true);
    // The camp holds still: its controls (and Around Camp Now's "Aim camera") wait for the outing to end.
    [holder, sheet, settings, life].forEach((el) => { el.inert = true; });
    title.focus({ preventScroll: true });
    if (!holder.classList.contains("is-3d")) outingLayer.scrollIntoView?.({ block: "start" });
  };

  const close = ({ refocus = true } = {}) => {
    if (!campUi.open) return;
    campUi.open = null;
    fill(sheet);
    sheet.className = "camp-sheet";
    buttons.forEach((btn) => btn.setAttribute("aria-pressed", "false"));
    focusCamp3d(null);
    const back = returnTo && returnTo.isConnected ? returnTo : canvas();
    returnTo = null;
    if (refocus && back) back.focus({ preventScroll: true });
  };
  const open = (id, { from = null, focus = true, restore = false } = {}) => {
    const loc = CAMP_LOCATIONS.find((l) => l.id === id);
    if (!loc) return;
    campUi.open = id;
    if (from) returnTo = from;
    buttons.forEach((btn, key) => btn.setAttribute("aria-pressed", key === id ? "true" : "false"));
    const title = h("h3", { id: "camp-place-title", tabindex: "-1" }, loc.name);
    const leave = id === "roster" ? ["Stand up", "Stand up and leave the campfire"] : ["Close", `Close the ${loc.name}`];
    sheet.className = `camp-sheet sheet-${id}`;
    fill(sheet, h("section", { class: "camp-place-card", "aria-labelledby": "camp-place-title",
      onKeydown: (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } } },
    h("div", { class: "camp-place-head" }, title,
      h("button", { type: "button", class: "btn small", "aria-label": leave[1], onClick: () => close() }, leave[0])),
    h("div", { class: "camp-place-body" }, campPlaceBody(s, id, { choose, outing: startOuting }))));
    // A restored sheet (after a re-render) is handed to the camp as it mounts, with no camera move.
    if (!restore) focusCamp3d(id);
    if (focus) {
      title.focus({ preventScroll: true });
      if (!holder.classList.contains("is-3d")) sheet.scrollIntoView?.({ block: "start" });
      else {
        // Chosen from Camp Locations below the scene: bring the whole camp (and its sheet) back into view.
        const box = frame.getBoundingClientRect();
        if (box.top < 0 || box.bottom > window.innerHeight - 56) frame.scrollIntoView?.({ block: "center" });
      }
    }
  };
  // The part of the camp a sheet covers (px from the right or bottom), so the place stays in view.
  const sheetInset = () => {
    if (!campUi.open || !holder.classList.contains("is-3d")) return {};
    const stage = holder.getBoundingClientRect();
    const box = sheet.getBoundingClientRect();
    if (!box.width || !box.height || !stage.width) return {};
    // A tall panel on the right (wide frames) covers the side; anything else sits along the bottom.
    const side = box.left - stage.left > stage.width * 0.25 && box.height > stage.height * 0.5;
    return side ? { right: Math.max(0, stage.right - box.left) } : { bottom: Math.max(0, stage.bottom - box.top) };
  };
  const places = h("section", { class: "camp-places", "aria-labelledby": "camp-places-title" },
    h("h3", { id: "camp-places-title" }, "Camp Locations"),
    h("ul", {}, CAMP_LOCATIONS.map((loc) => {
      const btn = h("button", { type: "button", class: "camp-place-btn", "aria-pressed": "false", "aria-controls": "camp-place",
        onClick: (e) => {
          // Choosing a place during a photo outing ends the outing and walks over there.
          if (campUi.outing) { closeOuting(); open(loc.id, { from: e.currentTarget }); return; }
          if (campUi.open === loc.id) close(); else open(loc.id, { from: e.currentTarget });
        } }, loc.name);
      buttons.set(loc.id, btn);
      return h("li", {}, btn);
    })));
  if (campUi.open) open(campUi.open, { focus: false, restore: true });

  const patches = hasRoster(s) ? expeditionPatches(s) : [];
  const earned = patches.filter((p) => p.earned).sort((a, b) => String(b.earnedOn || "").localeCompare(String(a.earnedOn || "")) || b.mile - a.mile);
  const b = campBulletin(s);
  const mount = () => {
    const going = mountCamp3d(holder, ctx, {
      settings,
      life,
      data: {
        fraction: (Number(s.progress.percent) || 0) / 100,
        toKatahdin: Math.max(0, TRAIL.totalMiles - (Number(s.progress.creditedMiles) || 0)),
        patches: earned.slice(0, 12).map((p) => ({ id: p.id, color: p.region && p.region.color })),
        explorers: hasRoster(s) ? patchCollection(patches, expeditionOf(s)).explorers.filter((x) => x.earned).length : 0,
        notes: b.movers.length + b.landmarks.length + b.patches.length + (b.dispatch ? 1 : 0),
        selectedId: s.selectedHiker || null
      },
      focus: campUi.open,
      focusInset: sheetInset,
      onLeave: () => close({ refocus: false }),
      onInteract: (id) => open(id, { from: canvas() }),
      onSelectHiker: (id) => {
        choose(id);
        const name = hikerName(s, id);
        if (name) caption.textContent = `${name} is chosen. Their badges are in History, under The Hikers.`;
      },
      onFallback: (reason) => {
        holder.classList.remove("is-3d", "camp3d-loading");
        fill(holder, scene);
        fill(life);
        caption.textContent = captions.flat;
        if (reason === "off") {
          fill(settings, h("button", { type: "button", class: "btn small", onClick: () => { enableCamp3d(); fill(settings); mount(); } }, "Explore the 3D camp"));
        } else if (reason !== "unavailable") {
          fill(settings, h("p", { class: "hint" }, "The 3D camp couldn't run smoothly here, so this is the pixel camp. It works just the same."));
        } else fill(settings);
      }
    });
    if (going) caption.textContent = captions.explore;
  };
  mount();
  return [frame, caption, places, settings, life];
}

function registerSection(s) {
  const p = s.progress;
  return historyPanel("register-title", `Trail Register (${s.register.length} ${s.register.length === 1 ? "Entry" : "Entries"})`, { className: "register" },
    h("p", { class: "hint" }, "Every landmark and group milestone the expedition has reached, and whose miles carried it there."),
    s.register.length
      ? h("ol", { class: "card register-list", reversed: true }, [...s.register].reverse().map((r) => h("li", {},
        h("strong", {}, r.title),
        h("span", { class: "hint" }, ` · mile ${r.miles}${r.reachedOn ? ` · ${day(r.reachedOn)}` : ""}${r.hikerName ? ` · carried by ${r.hikerName}` : ""}`))))
      : h("p", { class: "card" }, `The register is blank for now.${p.nextLandmark ? ` ${p.nextLandmark.name} is ${formatMiles(p.distanceToNext)} away.` : ""}`));
}

// Camp is a place to be: the camp fills the page, and its places open their notes inside it. The
// collections (patches, badges, the register) live in History, the expedition's archive.
export function campView(s, a) {
  const prog = s.progress;
  const hikers = s.hikers || [];
  const board = hikers.map((x) => ({ userId: x.id, displayName: x.name, totalCreditedMiles: x.totalMiles, weekCreditedMiles: x.weekMiles, lastActivityDate: x.lastActivityDate }));
  const photos = s.totals.wildlifeScore;
  const ctx = campContext({ trail: TRAIL, progress: prog, board, supplies: { photos }, today: s.today, hour: new Date().getHours() });
  const latest = (s.dispatches || [])[0];
  const where = ctx.region ? ctx.region.name : "Georgia";
  Object.assign(ctx, {
    dispatchTitle: latest ? latest.title : null,
    crewLabel: `the expedition has hiked ${formatMiles(prog.creditedMiles)} together${ctx.next ? `; ${formatMiles(ctx.next.miles)} to ${ctx.next.name}` : ""}`,
    bagLabel: `${ctx.scale.bearBags} bag${ctx.scale.bearBags === 1 ? "" : "s"} hung, one per hiker at camp`,
    photoLabel: `${photos} photo points pinned up`
  });
  const timeLabel = CAMP_TIME_LABELS[ctx.time];
  const captions = {
    flat: `${timeLabel} at camp in ${where}. ${ctx.weather.label}. Tap the fire, the shelter, the bear bag line, the photo board or a hiker.`,
    explore: `${timeLabel} at camp in ${where}. ${ctx.weather.label}. Walk around camp and visit a place, or choose one from Camp Locations.`
  };
  const caption = h("p", { class: "camp-caption", "aria-live": "polite" }, captions.flat);
  let scene = null;
  // Choosing a hiker in camp (tap them, or their name by the fire) shows them in History's The Hikers.
  const choose = (id) => {
    a.selectHiker(id);
    markCampHiker(id);
    if (scene) markSelectedHiker(scene, id);
  };
  const describe = (id) => {
    if (id === "fire") return `Campfire: ${ctx.crewLabel}.`;
    if (id === "shelter") return latest ? `Shelter register: “${latest.title}” from ${latest.authorName}. Read it on the Trail page.` : "Shelter register: no dispatches yet.";
    if (id === "bags") return `Bear bag line: ${ctx.bagLabel}. Food is hung away from bears every night.`;
    if (id === "board") return `Photo board: ${ctx.photoLabel}. Go on a photo outing from the Wildlife Observation Area to add more.`;
    const person = ctx.people.find((p) => `person:${p.id}` === id);
    if (!person) return "";
    choose(person.id);
    return `${person.name}: ${formatMiles(person.totalMiles)} contributed, ${formatMiles(person.weekMiles || 0)} this week${person.recent ? ". Just rolled into camp!" : "."} Their badges are in History.`;
  };
  scene = renderCampScene(ctx, (id) => { caption.textContent = describe(id); });
  return h("section", { "aria-labelledby": "page-title", class: "camp-page" },
    h("div", { class: "camp-head" },
      h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Camp"),
      h("p", { class: "hint" }, `${timeLabel} in ${where}, ${formatMiles(prog.creditedMiles)} from Springer Mountain.`)),
    flashNote(s, "camp"),
    h("div", { class: "card camp-card" },
      campExplorer(s, ctx, { scene, caption, captions, choose, a }),
      ctx.celebration ? h("p", { class: "celebrate" }, `🎉 Camp is celebrating passing ${ctx.celebration.name}!`) : null));
}

function dispatchForm(s, a, existing) {
  const d = existing || {};
  const status = h("p", { class: "status", role: "status", "data-status": "dispatch" });
  return h("form", { class: "card dispatch-form", novalidate: true, "aria-labelledby": "dispatch-form-title",
    onSubmit: (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const value = { title: String(f.get("dTitle") || "").trim(), body: String(f.get("dBody") || "").trim(), authorName: f.get("dAuthor"),
        pinned: f.get("dPinned") === "on" };
      if (!value.title || !value.body) { status.textContent = "A title and a message are both needed."; return; }
      if (value.title.length > 120 || value.body.length > 5000) { status.textContent = "Keep the title under 120 characters and the message under 5,000."; return; }
      status.textContent = "Posting…";
      a.saveDispatch(existing ? existing.id : null, value);
    } },
  h("h3", { id: "dispatch-form-title" }, existing ? "Edit Dispatch" : "Post a New Dispatch"),
  field("dTitle", "Title", h("input", { id: "dTitle", name: "dTitle", maxlength: 120, required: true, value: d.title || "" })),
  field("dBody", "Message", h("textarea", { id: "dBody", name: "dBody", rows: 7, maxlength: 5000, required: true, "aria-describedby": "dBody-hint" }, d.body || ""),
    "Formatting: **bold**, *italics*, [link text](https://example.com) (https links only), lines starting with - for lists, # for a heading, > for a quote. Leave a blank line between paragraphs."),
  field("dAuthor", "Signed as", h("input", { id: "dAuthor", name: "dAuthor", maxlength: 40, value: d.authorName || "Kevin" })),
  h("div", { class: "field check" }, h("input", { id: "dPinned", name: "dPinned", type: "checkbox", checked: Boolean(d.pinned) }), h("label", { for: "dPinned" }, "Pin to the top of the Trail page")),
  status,
  h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, existing ? "Save dispatch" : "Post dispatch"),
    h("button", { class: "btn", type: "button", onClick: () => a.editDispatch(null) }, "Cancel")));
}

// A wildlife sprite as SVG: full colour once photographed, a silhouette until then.
const PART_COLOR = (spec, i) => (i === 3 ? spec.accent || spec.light : i === 2 ? spec.light : spec.colors[i]);
function speciesArt(spec, found) {
  const top = Math.min(0, ...spec.parts.map((p) => p[1]));
  const bottom = Math.max(spec.h, ...spec.parts.map((p) => p[1] + p[3]));
  const size = Math.max(spec.w, bottom - top) + 2;
  const dx = (size - spec.w) / 2;
  const dy = (size - (bottom - top)) / 2 - top;
  return svg("svg", { class: `species-art${found ? "" : " locked"}`, viewBox: `0 0 ${size} ${size}`, width: 56, height: 56,
    "aria-hidden": "true", focusable: "false", "shape-rendering": "crispEdges" },
  ...spec.parts.map((p) => svg("rect", { x: p[0] + dx, y: p[1] + dy, width: p[2], height: p[3], fill: found ? PART_COLOR(spec, p[4]) : "#8a8072" })));
}

const titleCase = speciesTitle;
const RARITY_TAG = { uncommon: "Uncommon", rare: "Rare find", legend: "Legend" };
const SEASON_TEXT = { warm: "Warm months; scarce from November to March", cold: "Winter only" };
// null = follow whoever is spotting (scores and "NEW ×2" are judged against their guide); "" = the whole
// expedition; or a hiker id picked from the guide's own menu. Kept while the app is open.
let guideFilter = null;
const openGroups = new Set(); // field guide sections the hiker has opened
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function guideEntry(s, theme, e, filtered) {
  const sp = e.spec;
  if (!e.found) {
    return h("li", { class: "guide-entry locked" }, speciesArt(sp, false),
      h("strong", {}, "???", h("span", { class: "sr-only" }, " Not yet photographed.")),
      h("span", { class: "hint" }, whereToLook(sp, theme).text));
  }
  const name = (id) => (s.hikers || []).find((x) => x.id === id)?.name;
  const by = filtered ? null : name(e.firstBy);
  const finders = e.finders.map(name).filter(Boolean);
  const places = e.habitats.map((id) => theme.habitats[id].label).join(", ");
  return h("li", { class: `guide-entry found${sp.rarity === "rare" || sp.rarity === "legend" ? ` ${sp.rarity}` : ""}` },
    h("details", {},
      h("summary", {}, speciesArt(sp, true), h("strong", {}, titleCase(sp.name)),
        RARITY_TAG[sp.rarity] ? h("span", { class: `tag${sp.rarity === "uncommon" ? " uncommon" : ""}` }, RARITY_TAG[sp.rarity]) : null),
      h("p", {}, sp.fact),
      h("dl", { class: "guide-facts" },
        h("dt", {}, "First photographed"), h("dd", {}, `${e.firstSeen ? day(e.firstSeen) : "Unknown"}${by ? ` by ${by}` : ""}`),
        e.lastSeen && e.lastSeen !== e.firstSeen ? [h("dt", {}, "Last photographed"), h("dd", {}, day(e.lastSeen))] : null,
        h("dt", {}, "Photos"), h("dd", {}, e.sightings ? `${plural(e.photos, "photo")} on ${plural(e.sightings, "outing")}` : String(e.photos)),
        !filtered && finders.length > 1 ? [h("dt", {}, "Found by"), h("dd", {}, `${finders.length} hikers: ${finders.join(", ")}`)] : null,
        h("dt", {}, "Range"), h("dd", {}, sp.range),
        SEASON_TEXT[sp.season] ? [h("dt", {}, "Season"), h("dd", {}, SEASON_TEXT[sp.season])] : null,
        sp.behavior?.habit ? [h("dt", {}, "How it moves"), h("dd", {}, `${sp.behavior.label}. ${sp.behavior.habit}`)] : null,
        places ? [h("dt", {}, "Spotted in"), h("dd", {}, places)] : null,
        h("dt", {}, "Photo points"), h("dd", {}, `${sp.value} ${theme.unit}, doubled when it's new to the spotter's field guide`))));
}

// Whose finds the guide shows: the spotter's while it follows them, otherwise the guide's own choice.
function guideTarget(s) {
  if (guideFilter !== null) return guideFilter;
  return (s.hikers || []).some((x) => x.id === s.lastHiker) ? s.lastHiker : "";
}

function fieldGuideBody(s, theme, here) {
  const target = guideTarget(s);
  const guide = buildFieldGuide(s.fieldGuide, { hikerId: target || null, theme });
  const regions = regionProgress(s.fieldGuide, { hikerId: target || null, theme });
  const left = guide.total - guide.found;
  const who = (s.hikers || []).find((x) => x.id === target);
  const percent = guide.total ? Math.floor((guide.found / guide.total) * 100) : 0;
  // Each group is a collapsible section so the guide stays short on a phone.
  const section = (g, count, ...content) => h("details", { class: "guide-group", open: openGroups.has(g.id),
    onToggle: (ev) => { if (ev.target.open) openGroups.add(g.id); else openGroups.delete(g.id); } },
  h("summary", {}, h("span", {}, g.label), h("span", { class: "guide-tally" }, count)), ...content);
  const entry = (e) => guideEntry(s, theme, e, Boolean(who));
  return [
    h("p", { class: "guide-count" }, h("strong", {}, `${guide.found} of ${guide.total}`), ` species photographed${who ? ` by ${who.name}` : ""}.`,
      left ? ` ${left} to go.` : " The field guide is complete. Master Naturalist!"),
    bar(percent, "Field guide progress"),
    guide.foundThisExpedition !== guide.found ? h("p", { class: "hint" }, `This expedition: ${guide.foundThisExpedition} species so far. Earlier finds stay in the guide for good.`) : null,
    guide.latest ? h("p", { class: "hint" }, `Latest find: ${titleCase(guide.latest.spec.name)}, ${day(guide.latest.firstSeen)}.`) : null,
    guide.groups.map((g) => {
      const found = g.entries.filter((e) => e.found);
      if (g.id === "legend") {
        if (!found.length) return h("p", { class: "hint guide-rumour" }, "Campfire stories tell of strange creatures on the trail. Keep your camera ready…");
        return section(g, `${found.length} of ${g.entries.length}`, h("ul", { class: "guide-grid" }, found.map(entry)));
      }
      return section(g, `${found.length} of ${g.entries.length}`, h("ul", { class: "guide-grid" }, g.entries.map(entry)));
    }),
    // Regional completion: local species photographed in their own trail section.
    section({ id: "regions", label: "Trail Sections" }, `${regions.filter((r) => r.completedOn).length} of ${regions.length} complete`,
      h("p", { class: "hint" }, "Photograph every local species in a section, right there, to complete it."),
      h("ul", { class: "region-progress" }, regions.map((r) => h("li", { class: r.completedOn ? "done" : "" },
        h("span", {}, r.label, r.id === here ? h("strong", {}, " (you are here)") : null),
        h("span", { class: "guide-tally" }, r.completedOn ? `Complete ✓` : `${r.found} of ${r.total}`),
        bar(Math.floor((r.found / r.total) * 100), `${r.label} progress`)))))
  ];
}

function fieldGuideCard(s, theme, here) {
  if (s.fieldGuideUnavailable) {
    return h("div", { class: "card field-guide" }, h("h3", {}, "Field Guide"),
      h("p", {}, "The field guide fills in once the latest database update is applied. Photos still count on the board."));
  }
  const body = h("div", {}, fieldGuideBody(s, theme, here));
  const hikers = (s.hikers || []).filter((x) => x.active || x.wildlifeRuns);
  if (guideFilter && !hikers.some((x) => x.id === guideFilter)) guideFilter = null;
  const target = guideTarget(s);
  const select = hikers.length > 1 ? h("select", { id: "guide-who", "aria-describedby": "guide-who-hint", onChange: (ev) => { guideFilter = ev.target.value; card.refresh(); } },
    h("option", { value: "", selected: !target }, "The whole expedition"),
    hikers.map((x) => h("option", { value: x.id, selected: x.id === target }, `${x.name}'s finds`))) : null;
  const card = h("div", { class: "card field-guide" }, h("h3", {}, "Field Guide"),
    h("p", { class: "hint" }, "Every species you photograph is added here with a fact and where it lives. Wildlife changes as the expedition heads north, and with the seasons."),
    select ? field("guide-who", "Show", select, "Follows whoever is spotting. Pick another hiker or the whole expedition to compare.") : null, body);
  // fill() flattens the nested group list; spreading it into replaceChildren turned groups into text.
  card.refresh = () => fill(body, fieldGuideBody(s, theme, here));
  // Choosing a spotter opens their field guide, so the guide matches what scores "NEW ×2".
  card.follow = (hikerId) => {
    guideFilter = hikerId ? null : "";
    if (select) select.value = guideTarget(s);
    card.refresh();
  };
  return card;
}

function photoBoard(s, theme) {
  const roster = (s.hikers || []).filter((x) => x.active || x.wildlifeRuns);
  if (!roster.length) return h("p", {}, "Photos pinned to a hiker show up here and on the board at Camp.");
  const total = expeditionTotals(s.hikers).wildlifeScore; // s.hikers is fresh after a save; s.totals isn't
  return [
    h("ul", { class: "week-hikers" }, roster.map((x) => h("li", {}, h("span", {}, x.name),
      h("span", {}, x.wildlifeRuns ? `${x.wildlifeScore} ${theme.unit} · ${x.wildlifeRuns} outing${x.wildlifeRuns === 1 ? "" : "s"}` : "No photos yet")))),
    h("p", {}, total ? `${total} ${theme.unit} on the board together.` : "Nothing pinned up yet. The first outing goes straight onto the board at Camp.")
  ];
}

export { localDateString };
