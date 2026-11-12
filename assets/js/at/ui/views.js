// Views: pure functions of (state, actions) that return DOM nodes.
import { h, svg, fill, formatMiles, formatDay } from "./dom.js";
import { renderTrailMap, landmarkPicture } from "./map.js";
import { renderMarkdown } from "./markdown-view.js";
import { renderCampScene, markSelectedHiker } from "./camp-scene.js";
import { createExpedition } from "./expedition-view.js";
import { badgeArt } from "./badge-art.js";
import { CAMP_TIME_LABELS, campContext } from "../engine/camp.js";
import { DEFAULT_THEME, themeFor } from "../engine/expedition-themes.js";
import { regionAtMarker } from "../engine/progress.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../trail/appalachian-trail.js";
import { ACTIVITY_TYPES, ACTIVITY_LABELS, MAX_NOTES_LENGTH, validateActivity, ruleFor, localDateString } from "../engine/activities.js";
import { groupMilestoneStatus, pickTip } from "../engine/game.js";
import { buildFieldGuide, regionProgress, speciesBadges, speciesTitle, whereToLook, wildlifeCollection } from "../engine/field-guide.js";
import { expeditionJournal } from "../engine/journal.js";
import { badgeCollection, expeditionTotals, hikerBadges, hikerMilestones, hikerTimeline, hikerShare, nextMileBadge } from "../engine/hikers.js";
import { PATCH_SORTS, groupPatchesByState, landmarkPatches, nearbyWildlife, patchCollection, patchForecast, patchRarity, sortPatches } from "../engine/patches.js";
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
// State Explorer patches are shown with their art, like a patch handed over at the trailhead.
const flashNote = (s, page) => {
  if (!s.flash || s.flash.route !== page) return null;
  const patches = s.flash.patches || [];
  const explorers = s.flash.explorers || [];
  if (!patches.length && !explorers.length) return h("p", { class: "card celebrate" }, s.flash.text);
  return h("div", { class: "card celebrate" },
    s.flash.text ? h("p", {}, s.flash.text) : null,
    h("ul", { class: "patch-earned-list" },
      explorers.map(({ explorer, hikerName }) => h("li", { class: "patch-earned explorer" },
        explorerArt(explorer, { shadow: true }),
        h("div", {},
          h("p", { class: "patch-earned-title" }, `State Patch Earned: ${explorer.name}`),
          h("p", {}, `Every ${explorer.stateName} landmark reached.`),
          h("p", { class: "hint" }, `${hikerName} · ${explorer.landmarks} ${explorer.landmarks === 1 ? "landmark" : "landmarks"}`)))),
      patches.map(({ patch, hikerName }) => h("li", { class: "patch-earned" },
        patchArt(patch, { shadow: true }),
        h("div", {},
          h("p", { class: "patch-earned-title" }, `Patch Earned: ${patch.landmarkName}`),
          h("p", {}, "You've reached this Appalachian Trail landmark."),
          h("p", { class: "hint" }, `${hikerName} · ${patch.state} · mile ${patch.mile}`))))),
    h("p", { class: "more-link" }, h("a", { href: "#/camp" }, "See the patch collection at Camp")));
};
const activeHikers = (s) => (s.hikers || []).filter((x) => x.active);
// The roster is loaded (anyone can log for any hiker; there is nothing to join).
const hasRoster = (s) => !s.expeditionUnavailable && (s.hikers || []).length > 0;
const hikerName = (s, id) => (s.hikers || []).find((x) => x.id === id)?.name || null;


// Kevin's (the organizer's) latest message: pinned first, then newest.
function dispatchCard(d, { featured = false, actions = null } = {}) {
  const head = featured ? "h2" : "h3";
  return h("article", { class: `card dispatch${featured ? " featured" : ""}${d.pinned ? " pinned" : ""}`, "aria-labelledby": `dispatch-${d.id}` },
    featured ? h("p", { class: "eyebrow" }, h("span", { "aria-hidden": "true" }, "🔥 "), "Message from Camp") : null,
    h(head, { id: `dispatch-${d.id}` }, d.title),
    h("p", { class: "byline" }, `${d.authorName} · ${when(d.publishedAt)}${d.pinned ? " · pinned" : ""}`),
    renderMarkdown(d.body),
    actions);
}

// The trail map, with one hiker's earned landmark patches pinned beside their landmarks. Patches just
// earned by this hiker (the celebration after logging) get a one-time stitch-pop on the map.
function drawTrailMap(s, holder, hiker) {
  const list = hiker && hasRoster(s) ? landmarkPatches(TRAIL, s.progress.direction, hiker, s.marks) : null;
  const fresh = list && s.flash && s.flash.route === "trail" ? (s.flash.patches || []).filter((x) => x.hikerId === hiker.id).map((x) => x.patch.id) : [];
  const next = list ? list.find((pt) => !pt.earned) : null;
  fill(holder,
    list ? h("p", { class: "hint map-patch-next" }, next
      ? `${hiker.name}'s next patch: ${next.landmarkName}, ${formatMiles(next.milesToGo)} away.`
      : `${hiker.name} has collected every landmark patch!`) : null,
    renderTrailMap(TRAIL, s.progress, { patches: list ? { hikerName: hiker.name, list, fresh } : null }));
}

// Whose patches the map shows. Remembers the choice like the rest of the app (the selected hiker).
function patchPicker(s, a, holder) {
  const roster = activeHikers(s);
  if (!hasRoster(s) || !roster.length) return null;
  const current = (roster.find((x) => x.id === s.selectedHiker) || roster[0]).id;
  return h("div", { class: "field map-patch-field" },
    h("label", { for: "map-patch-hiker" }, "Show landmark patches for"),
    h("select", { id: "map-patch-hiker", onChange: (e) => {
      a.selectHiker(e.target.value);
      drawTrailMap(s, holder, roster.find((x) => x.id === e.target.value));
    } }, roster.map((x) => h("option", { value: x.id, selected: x.id === current }, x.name))));
}

export function trailView(s, a) {
  const p = s.progress;
  const featured = (s.dispatches || [])[0];
  const roster = activeHikers(s);
  const group = groupMilestoneStatus(TRAIL, p.creditedMiles, roster.map((x) => ({ weekCreditedMiles: x.weekMiles })));
  const mapHolder = h("div", { class: "map-holder" });
  drawTrailMap(s, mapHolder, roster.find((x) => x.id === s.selectedHiker) || roster[0] || null);
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, p.completed ? "The Expedition Finished the Appalachian Trail!" : "The Expedition"),
    flashNote(s, "trail"),
    featured ? [dispatchCard(featured, { featured: true }), (s.dispatches || []).length > 1 ? h("p", { class: "more-link" }, h("a", { href: "#/camp" }, "Read earlier dispatches at Camp")) : null] : null,
    h("div", { class: "card hero" },
      h("p", { class: "big" }, `${p.percent}%`),
      bar(Math.floor(p.percent), "Trail completed together"),
      h("dl", { class: "stats" },
        stat("Miles hiked together", formatMiles(p.creditedMiles)),
        stat("Miles to go", formatMiles(p.remainingMiles)),
        stat("Landmarks passed", `${p.passedLandmarks.length} of ${p.landmarks.length}`),
        p.nextLandmark ? stat(`Next: ${p.nextLandmark.name}`, formatMiles(p.distanceToNext)) : stat("Next landmark", "We made it!"))),
    h("div", { class: "card map-card" }, h("h2", {}, "Trail Map"),
      patchPicker(s, a, mapHolder),
      mapHolder,
      h("p", { class: "hint" }, `${TRAIL.directions[p.direction].label}. Mileage, elevations and positions are approximate.`)),
    h("div", { class: "card" }, h("h2", {}, "This Week"),
      roster.length ? h("ul", { class: "week-hikers" }, roster.map((x) => h("li", {},
        h("a", { href: "#/hikers", onClick: () => a.selectHiker(x.id) }, x.name), h("span", {}, formatMiles(x.weekMiles))))) : null,
      group.next ? h("p", {}, `Next group milestone: ${group.next.title}, ${formatMiles(group.remainingToNext)} to go.`) : h("p", {}, "Every group milestone reached!"),
      group.everyoneMovedThisWeek ? h("p", {}, "Everyone moved this week. Great teamwork!") : null,
      h("p", { class: "hint" }, pickTip(Number(s.today.replaceAll("-", "")))),
      h("p", { class: "row" }, h("a", { class: "btn primary", href: "#/log" }, "Log an activity"))),
    null);
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
    journalSection(s),
    h("section", { class: "your-activities", "aria-labelledby": "activities-title" },
      h("h2", { id: "activities-title" }, "Your Activities"),
      h("p", { class: "hint" }, "Activities logged from this device. Only this device can edit or delete them."),
      list,
      s.hasMore ? h("button", { class: "btn", type: "button", onClick: a.loadMore }, "Load older activities") : null));
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
  return h("section", { class: "journal-section", "aria-labelledby": "journal-title" },
    h("h2", { id: "journal-title" }, "Expedition Journal"),
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
    h("span", { class: "sr-only" }, "Not yet photographed. Find it in Wildlife Spotting.")));

// Collector stats for one hiker's lifetime wildlife collection.
function collectionStats(c) {
  if (!c.found && !c.legendsFound) return h("p", { class: "hint" }, "No species photographed yet. Choose this hiker in Wildlife Spotting to start their collection.");
  return h("dl", { class: "stats collection-stats" },
    stat("Species found", `${c.found} of ${c.total} · ${c.percent}%`),
    stat("Rare species", `${c.rareFound} of ${c.rareTotal}`),
    stat("Photos taken", String(c.photos)),
    c.mostPhotographed ? stat("Most photographed", `${c.mostPhotographed.title} (${photoCount(c.mostPhotographed.photos)})`) : null,
    c.recent.length ? stat("Recent finds", c.recent.map((r) => r.title).join(", ")) : null);
}

// ---- Landmark Patch Collection --------------------------------------------------------------------
// One collectible patch per landmark, earned when the hiker's own miles reach it. Lives at Camp with
// the hiker's other collections (there is no Profile tab); the Trail map pins the earned ones.
const patchUi = { sort: "trail", selected: null };

const patchStatus = (pt) => (pt.earned ? (pt.earnedOn ? `Earned ${day(pt.earnedOn)}` : "Earned") : `${formatMiles(pt.milesToGo)} to go`);

// An inked passport stamp with the earned date.
const dateStamp = (on) => h("span", { class: "date-stamp" }, h("span", { class: "stamp-word" }, "Earned"), on ? h("span", {}, day(on)) : null);

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// Collector's edition details: the landmark photo, the patch, facts, why it matters, wildlife nearby,
// trivia and real-world resources (patch shops and official pages, best first).
function patchDetail(pt, hk, rarity) {
  if (!pt) return h("p", { class: "hint" }, "Choose a patch to read about its landmark and find related resources.");
  const landmark = (TRAIL.landmarks || []).find((l) => l.id === pt.landmarkId);
  const story = landmarkStory(pt.landmarkId) || {};
  const wildlife = nearbyWildlife(pt);
  const trivia = [pt.trivia, story.didYouKnow].filter(Boolean);
  const held = rarity && rarity.roster > 1 ? rarity.holders.get(pt.id) : null;
  return h("div", { class: `patch-detail-card${pt.earned ? " earned" : ""}` },
    h("div", { class: "patch-detail-art" }, patchArt(pt, { shadow: true }), pt.earned ? dateStamp(pt.earnedOn) : null),
    h("div", { class: "patch-detail-body" },
      h("h5", {}, pt.name),
      h("p", { class: "hint" }, pt.earned ? `${patchStatus(pt)} by ${hk.name}` : `Not yet earned · ${patchStatus(pt)} for ${hk.name}`),
      landmark ? h("div", { class: "patch-detail-photo" }, landmarkPicture(landmark)) : null,
      h("p", {}, pt.description),
      h("dl", { class: "facts" },
        h("dt", {}, "Landmark"), h("dd", {}, pt.landmarkName),
        h("dt", {}, "State"), h("dd", {}, pt.stateNames.join(" / ")),
        pt.elevationFt ? [h("dt", {}, "Elevation"), h("dd", {}, `about ${pt.elevationFt.toLocaleString("en-US")} ft`)] : null,
        h("dt", {}, "Mile"), h("dd", {}, `${Number(pt.mile).toLocaleString("en-US")} of ${TRAIL.totalMiles.toLocaleString("en-US")}`),
        pt.region ? [h("dt", {}, "Section"), h("dd", {}, pt.region.name)] : null,
        pt.since ? [h("dt", {}, "On the trail since"), h("dd", {}, `${pt.since.year}${pt.since.note ? `, ${pt.since.note}` : ""}`)] : null,
        typeof held === "number" ? [h("dt", {}, "Held by"), h("dd", {}, `${held} of ${rarity.roster} hikers`)] : null),
      story.history ? [h("h5", {}, "Why This Landmark Matters"), h("p", {}, story.history)] : null,
      wildlife.length ? [h("h5", {}, "Nearby Wildlife"),
        h("p", {}, `Often met around here: ${wildlife.map((w) => lowerFirst(w.name)).join(", ")}. Look for them in Wildlife Spotting.`)] : null,
      trivia.length ? [h("h5", {}, "Trail Trivia"), h("ul", { class: "patch-trivia" }, trivia.map((t) => h("li", {}, t)))] : null,
      pt.resources.length ? [h("h5", {}, "Related Resources"),
        h("ul", { class: "patch-links" }, pt.resources.map((r) => h("li", {},
          h("span", { class: `tag kind-${r.kind}` }, r.kindLabel), " ",
          h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.label, h("span", { class: "sr-only" }, " (opens in a new tab)")),
          r.offerLabels.length ? h("span", { class: "offers" }, r.offerLabels.map((o) => h("span", { class: `offer${o === "Patch available" ? " has-patch" : ""}` }, o))) : null))),
        h("p", { class: "hint" }, "Shops and stock change: check a page before you travel.")] : null));
}

// Gentle motivation: what's next, the state underway, the crew's rarest and most collected patches,
// and a forecast at the hiker's own pace (never a deadline).
function patchMotivation(c, rarity, forecast) {
  const month = (ymd) => { const d = new Date(`${ymd}T12:00:00`); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
  const state = c.nextState;
  return h("dl", { class: "stats collection-stats patch-stats" },
    stat("Patches collected", `${c.earned} of ${c.total} · ${c.percent}%`),
    stat("Next patch", c.nearest ? `${c.nearest.landmarkName} · ${formatMiles(c.nearest.milesAway)} to go` : "Every patch collected!"),
    stat("Current state", state ? `${state.name} · ${state.earned} of ${state.total} (${state.percent}%)` : "Every state complete!"),
    stat("State patches", `${c.explorers.filter((x) => x.earned).length} of ${c.explorers.length}`),
    rarity && rarity.roster > 1 && rarity.rarest ? stat("Rarest patch held", `${rarity.rarest.patch.landmarkName} · ${rarity.rarest.holders} of ${rarity.roster} hikers`) : null,
    rarity && rarity.roster > 1 && rarity.mostEarned ? stat("Crew favourite", `${rarity.mostEarned.patch.landmarkName} · ${rarity.mostEarned.holders} of ${rarity.roster} hikers`) : null,
    forecast && forecast.next ? stat("Trail forecast", `At about ${formatMiles(forecast.weeklyMiles)} a week: next patch around ${month(forecast.next.date)}${forecast.complete && forecast.complete.patch !== forecast.next.patch ? `, the full set around ${month(forecast.complete.date)}` : ""}`) : null);
}

// State Collections: each state's landmarks and its State Explorer patch, larger and edged in gold.
function stateCollectionList(states) {
  return h("ul", { class: "state-collections", "aria-label": "State collections" }, states.map((st) => h("li", { class: `state-collection ${st.complete ? "earned" : "locked"}` },
    h("div", { class: "state-collection-art" }, explorerArt(st.explorer, { shadow: st.complete }), st.complete ? dateStamp(st.explorer.earnedOn) : null),
    h("div", {},
      h("strong", {}, `${st.name} Collection`),
      h("p", { class: "hint" }, `${st.earned} of ${st.total} ${st.total === 1 ? "landmark" : "landmarks"} · ${st.percent}%`),
      bar(st.percent, `${st.name}: ${st.earned} of ${st.total} landmarks`),
      h("p", { class: "hint" }, st.complete ? `${st.explorer.name} patch earned.` : `Reach every ${st.name} landmark to earn the ${st.explorer.name} patch.`)))));
}

function patchSection(s, hk) {
  const patches = landmarkPatches(TRAIL, s.progress.direction, hk, s.marks);
  const c = patchCollection(patches, hk);
  const rarity = patchRarity(patches, s.hikers);
  const forecast = patchForecast(patches, hk, s.today);
  const detailId = "patch-detail";
  const detail = h("div", { id: detailId, class: "patch-detail" });
  const grid = h("div", { class: "patch-grid-wrap" });
  const tiles = new Map();
  const choose = (id, { scroll = false } = {}) => {
    const pt = patches.find((x) => x.id === id) || null;
    patchUi.selected = pt ? pt.id : null;
    tiles.forEach((btn, key) => btn.setAttribute("aria-pressed", key === patchUi.selected ? "true" : "false"));
    fill(detail, patchDetail(pt, hk, rarity));
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
      ? groupPatchesByState(patches).map((g) => [h("h5", { class: "patch-state" }, `${g.state} (${g.patches.filter((x) => x.earned).length} of ${g.patches.length})`),
        h("ul", { class: "patch-grid", "aria-label": `${g.state} patches` }, g.patches.map(tile))])
      : h("ul", { class: "patch-grid", "aria-label": "Landmark patches" }, sortPatches(patches, patchUi.sort).map(tile)));
    choose(patchUi.selected);
  };
  drawGrid();
  return h("details", { class: "timeline-wrap patch-collection" },
    h("summary", {}, `Landmark Patch Collection (${c.earned} of ${c.total})`),
    h("div", { class: "patch-passport" },
      patchMotivation(c, rarity, forecast),
      bar(c.percent, `Landmark patches: ${c.earned} of ${c.total} collected`),
      h("ul", { class: "patch-milestones", "aria-label": "Collection milestones" }, c.milestones.map((m) => h("li", { class: m.earned ? "earned" : "locked" },
        h("span", { "aria-hidden": "true" }, m.earned ? "★ " : "☆ "), m.title,
        h("span", { class: "hint" }, m.earned ? (m.earnedOn ? ` · ${day(m.earnedOn)}` : "") : ` · ${m.count - c.earned} to go`)))),
      h("p", { class: "hint" }, `Each landmark has a patch. ${hk.name} earns it when their own miles reach that landmark, and earned patches appear on the Trail map. Reach every landmark in a state for its State Explorer patch.`),
      h("div", { class: "field patch-sort" },
        h("label", { for: "patch-sort" }, "Sort patches by"),
        h("select", { id: "patch-sort", onChange: (e) => { patchUi.sort = e.target.value; drawGrid(); } },
          Object.entries(PATCH_SORTS).map(([value, label]) => h("option", { value, selected: value === patchUi.sort }, label)))),
      grid,
      detail,
      h("h5", { class: "patch-state-title" }, "State Collections"),
      stateCollectionList(c.stateProgress)));
}

// One hiker's page at Camp: contribution, badges, milestones and their story so far.
function hikerPanel(s, hk) {
  const badges = hikerBadges(hk, { marks: s.marks, register: s.register, today: s.today, sightings: s.fieldGuide });
  const species = speciesBadges(s.fieldGuide, { hikerId: hk.id });
  const ms = hikerMilestones(hk, s.register);
  const timeline = hikerTimeline(badges, ms, species);
  const all = badgeCollection(badges, species);
  const next = nextMileBadge(hk);
  const patchSet = patchCollection(landmarkPatches(TRAIL, s.progress.direction, hk, s.marks), hk);
  return h("article", { class: "card hiker-card", "aria-labelledby": "hiker-name" },
    h("h3", { id: "hiker-name", tabindex: "-1" }, hk.name),
    h("dl", { class: "stats" },
      stat("Miles contributed", formatMiles(hk.totalMiles)),
      stat("Share of the expedition", `${hikerShare(hk, s.totals)}%`),
      stat("This week", formatMiles(hk.weekMiles)),
      stat("Achievement badges", `${all.badges.earned} of ${all.badges.total}`),
      stat("Species badges", `${all.species.earned} of ${all.species.total}`),
      stat("Landmark patches", `${patchSet.earned} of ${patchSet.total}`),
      stat("State patches", `${patchSet.explorers.filter((x) => x.earned).length} of ${patchSet.explorers.length}`)),
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
      h("p", { class: "hint" }, "Photograph a species for the first time in Wildlife Spotting to earn its badge. Finds are saved for good, across expeditions."),
      h("ul", { class: "badge-grid species-grid" }, species.map(speciesBadge))),
    patchSection(s, hk),
    h("h4", {}, "Milestones Reached"),
    ms.landmarks.length || ms.groupMilestones.length
      ? h("ul", { class: "milestones" },
        ms.landmarks.map((l) => h("li", {}, `Carried the expedition to ${l.title}`, h("span", { class: "hint" }, ` · mile ${l.miles}${l.reachedOn ? ` · ${day(l.reachedOn)}` : ""}`))),
        ms.groupMilestones.map((m) => h("li", {}, `${m.carried ? "Carried the expedition to" : "On the trail for"} “${m.title}”`, h("span", { class: "hint" }, m.reachedOn ? ` · ${day(m.reachedOn)}` : ""))))
      : h("p", { class: "hint" }, "Milestones appear here as the expedition passes landmarks and group goals."),
    timeline.length ? h("details", { class: "timeline-wrap" }, h("summary", {}, `${hk.name}'s Journey So Far (${timeline.length})`),
      h("ol", { class: "timeline" }, timeline.map((t) => h("li", {}, h("span", { class: "when" }, day(t.date)), h("span", {}, t.text))))) : null);
}

function hikersSection(s, a, select) {
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
    if (select.scene) markSelectedHiker(select.scene, hk.id);
  };
  select.current = show;
  const picker = h("div", { class: "hiker-picker", role: "group", "aria-label": "Choose a hiker" }, hikers.map((x) => {
    const btn = h("button", { class: "hiker-chip", type: "button", "aria-pressed": "false", "aria-controls": "hiker-panel", onClick: () => show(x.id) },
      h("span", { class: "chip-name" }, x.name), h("span", { class: "chip-miles" }, formatMiles(x.totalMiles)));
    buttons.set(x.id, btn);
    return btn;
  }));
  show(s.selectedHiker);
  return h("section", { class: "hikers", "aria-labelledby": "hikers-title" },
    h("h2", { id: "hikers-title", tabindex: "-1" }, "The Hikers"),
    hikers.length ? [picker, panel] : h("p", { class: "card" }, "No hikers on the roster yet."));
}

function registerSection(s) {
  const p = s.progress;
  return h("section", { class: "register", "aria-labelledby": "register-title" },
    h("h2", { id: "register-title" }, "Trail Register"),
    h("p", { class: "hint" }, "Every landmark and group milestone the expedition has reached, and whose miles carried it there."),
    s.register.length
      ? h("ol", { class: "card register-list", reversed: true }, [...s.register].reverse().map((r) => h("li", {},
        h("strong", {}, r.title),
        h("span", { class: "hint" }, ` · mile ${r.miles}${r.reachedOn ? ` · ${day(r.reachedOn)}` : ""}${r.hikerName ? ` · carried by ${r.hikerName}` : ""}`))))
      : h("p", { class: "card" }, `The register is blank for now.${p.nextLandmark ? ` ${p.nextLandmark.name} is ${formatMiles(p.distanceToNext)} away.` : ""}`));
}

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
  const caption = h("p", { class: "camp-caption", "aria-live": "polite" },
    `${timeLabel} at camp in ${where}. ${ctx.weather.label}. Tap the fire, the shelter, the bear bag line, the photo board or a hiker.`);
  const select = { current: null };
  const describe = (id) => {
    if (id === "fire") return `Campfire: ${ctx.crewLabel}.`;
    if (id === "shelter") return latest ? `Shelter register: “${latest.title}” from ${latest.authorName}. Read it at the top of Camp.` : "Shelter register: no dispatches yet.";
    if (id === "bags") return `Bear bag line: ${ctx.bagLabel}. Food is hung away from bears every night.`;
    if (id === "board") return `Photo board: ${ctx.photoLabel}. Go Wildlife Spotting to add more.`;
    const person = ctx.people.find((p) => `person:${p.id}` === id);
    if (!person) return "";
    if (select.current) select.current(person.id);
    return `${person.name}: ${formatMiles(person.totalMiles)} contributed, ${formatMiles(person.weekMiles || 0)} this week${person.recent ? ". Just rolled into camp!" : "."} Their badges are below.`;
  };
  const scene = renderCampScene(ctx, (id) => { caption.textContent = describe(id); });
  select.scene = scene;
  const editing = s.dispatchEditing;
  const archive = (s.dispatches || []).map((d) => editing === d.id ? dispatchForm(s, a, d)
    : dispatchCard(d, { actions: s.isOrganizer ? h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", "aria-label": `Edit dispatch: ${d.title}`, onClick: () => a.editDispatch(d.id) }, "Edit"),
      h("button", { class: "btn small danger", type: "button", "aria-label": `Delete dispatch: ${d.title}`, onClick: () => a.deleteDispatch(d) }, "Delete")) : null }));
  const group = groupMilestoneStatus(TRAIL, prog.creditedMiles, []);
  return h("section", { "aria-labelledby": "page-title", class: "camp-page" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Camp"),
    h("p", {}, `${timeLabel} in ${where}. The expedition is camped ${formatMiles(prog.creditedMiles)} from Springer Mountain.`),
    flashNote(s, "camp"),
    h("section", { class: "dispatches", "aria-labelledby": "dispatches-title" },
      h("h2", { id: "dispatches-title" }, "Trail Dispatches"),
      h("p", { class: "hint" }, "Updates, stories and encouragement from the trip organizer."),
      s.isOrganizer && editing === "new" ? dispatchForm(s, a, null) : null,
      s.isOrganizer && editing !== "new" ? h("button", { class: "btn primary", type: "button", onClick: () => a.editDispatch("new") }, "Write a dispatch") : null,
      archive.length ? archive : h("p", { class: "card" }, s.dispatchesUnavailable ? "Dispatches will appear here once camp is set up." : "No dispatches yet. Check back soon!")),
    h("div", { class: "card camp-card" },
      h("div", { class: "camp-frame" }, scene),
      caption,
      h("dl", { class: "stats" },
        stat("Section", ctx.region ? ctx.region.name : "—"),
        stat(ctx.next ? `Next: ${ctx.next.name}` : "Next landmark", ctx.next ? formatMiles(ctx.next.miles) : "Katahdin reached!"),
        stat("Photo board", `${photos} pts`),
        group.next ? stat(`Group goal: ${group.next.title}`, `${formatMiles(group.remainingToNext)} to go`) : stat("Group goals", "All reached!")),
      ctx.celebration ? h("p", { class: "celebrate" }, `🎉 Camp is celebrating passing ${ctx.celebration.name}!`) : null),
    hikersSection(s, a, select),
    hasRoster(s) ? registerSection(s) : null,
    null);
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
    return h("div", { class: "card field-guide" }, h("h2", {}, "Field Guide"),
      h("p", {}, "The field guide fills in once the latest database update is applied. Photos still count on the board."));
  }
  const body = h("div", {}, fieldGuideBody(s, theme, here));
  const hikers = (s.hikers || []).filter((x) => x.active || x.wildlifeRuns);
  if (guideFilter && !hikers.some((x) => x.id === guideFilter)) guideFilter = null;
  const target = guideTarget(s);
  const select = hikers.length > 1 ? h("select", { id: "guide-who", "aria-describedby": "guide-who-hint", onChange: (ev) => { guideFilter = ev.target.value; card.refresh(); } },
    h("option", { value: "", selected: !target }, "The whole expedition"),
    hikers.map((x) => h("option", { value: x.id, selected: x.id === target }, `${x.name}'s finds`))) : null;
  const card = h("div", { class: "card field-guide" }, h("h2", {}, "Field Guide"),
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

export function wildlifeView(s, a) {
  const theme = themeFor(DEFAULT_THEME);
  const region = regionAtMarker(TRAIL, s.progress.position.marker);
  const reducedMotion = Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const saved = h("p", { class: "status", role: "status" });
  const board = h("div", {}, photoBoard(s, theme));
  const roster = activeHikers(s);
  const guideCard = fieldGuideCard(s, theme, region ? region.scene : null);
  const who = roster.length ? h("select", { id: "spotter", name: "spotter", "aria-describedby": "spotter-hint",
    onChange: (e) => { a.rememberHiker(e.target.value); if (guideCard.follow) guideCard.follow(e.target.value); } },
    h("option", { value: "", selected: !roster.some((x) => x.id === s.lastHiker) }, "Choose a hiker"),
    roster.map((x) => h("option", { value: x.id, selected: x.id === s.lastHiker }, x.name))) : null;
  // Every outing belongs to one hiker, chosen before it starts (no anonymous discoveries).
  let spotter = null;
  const beforeStart = () => {
    if (!roster.length) return "Wildlife Spotting needs the hiker roster, which hasn't loaded. Please reload the page and try again.";
    if (!who.value) { who.focus(); return "Choose who's spotting first, so every photo goes into the right hiker's field guide."; }
    spotter = who.value;
    return null;
  };
  // Species already in the spotter's field guide: anything else is a discovery and scores double.
  const known = () => (s.fieldGuideUnavailable ? null
    : (s.fieldGuide || []).filter((r) => r.hikerId === who.value).map((r) => r.species));
  const game = createExpedition(theme, { localHabitat: region ? region.scene : undefined, reducedMotion, known, beforeStart,
    onFinish: async (summary) => {
      // Empty outings aren't saved, so they never use up the 10-a-day allowance.
      if (!summary.score) { saved.textContent = summary.shots ? "Nothing to pin up this time. Spot again?" : "No photos taken, so nothing to pin up this time."; return; }
      if (!spotter) return;
      saved.textContent = "Saving your photos to the field guide…";
      saved.textContent = await a.recordExpedition({ ...summary, hikerId: spotter });
      fill(board, photoBoard(s, theme));
      if (guideCard.refresh) guideCard.refresh();
    } });
  a.registerGame(game);
  return h("section", { "aria-labelledby": "page-title", class: "wildlife-page" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, theme.title),
    h("p", {}, theme.intro),
    who ? h("div", { class: "card spotter" }, field("spotter", "Who's spotting?", who, "Choose a hiker before you start. Every photo is saved to their field guide and species badges at Camp, for good.")) : null,
    h("div", { class: "card" }, game.element, saved),
    guideCard,
    h("div", { class: "card" }, h("h2", {}, "The Photo Board"), board,
      h("p", { class: "hint" }, "Up to 10 outings a day count toward the board. Wildlife Spotting is just for fun: only real activity adds trail miles. ", h("a", { href: "#/camp" }, "See the board at Camp"), ".")));
}

export { localDateString };
