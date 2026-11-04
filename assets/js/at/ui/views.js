// Views: pure functions of (state, actions) that return DOM nodes.
import { h, svg, formatMiles } from "./dom.js";
import { renderTrailMap } from "./map.js";
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
import { buildFieldGuide, regionProgress, whereToLook } from "../engine/field-guide.js";
import { expeditionTotals, hikerBadges, hikerMilestones, hikerTimeline, hikerShare, nextMileBadge } from "../engine/hikers.js";

const field = (id, label, control, hint, error) => h("div", { class: "field" },
  h("label", { for: id }, label), control,
  hint ? h("p", { class: "hint", id: `${id}-hint` }, hint) : null,
  h("p", { class: "error", id: `${id}-error`, role: "alert" }, error || ""));

const bar = (percent, label) => h("div", { class: "bar", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent },
  h("span", { style: `width:${percent}%` }));

const stat = (label, value) => h("div", { class: "stat" }, h("dt", {}, label), h("dd", {}, value));

const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
// Calendar dates (YYYY-MM-DD) are shown as that local day, never shifted by the time zone.
const day = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
};

// A one-time message (a celebration) for the page it belongs to.
const flashNote = (s, page) => (s.flash && s.flash.route === page ? h("p", { class: "card celebrate" }, s.flash.text) : null);
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
    h("p", { class: "byline" }, `${d.authorName} · ${when(d.publishedAt)}${d.pinned ? " · pinned" : ""}${d.challengeId ? " · crew only" : ""}`),
    renderMarkdown(d.body),
    actions);
}

export function trailView(s, a) {
  const p = s.progress;
  const featured = (s.dispatches || [])[0];
  const roster = activeHikers(s);
  const group = groupMilestoneStatus(TRAIL, p.creditedMiles, roster.map((x) => ({ weekCreditedMiles: x.weekMiles })));
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, p.completed ? "The expedition finished the Appalachian Trail!" : "The expedition"),
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
    h("div", { class: "card map-card" }, h("h2", {}, "Trail map"),
      renderTrailMap(TRAIL, p),
      h("p", { class: "hint" }, `${TRAIL.directions[p.direction].label}. Mileage, elevations and positions are approximate.`)),
    h("div", { class: "card" }, h("h2", {}, "This week"),
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
  h("h2", { id: "form-title" }, e ? "Edit activity" : "Log an activity"),
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
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Log activity"),
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
    h("p", { class: "hint" }, "Activities logged from this device. Only this device can edit or delete them."),
    list,
    s.hasMore ? h("button", { class: "btn", type: "button", onClick: a.loadMore }, "Load older activities") : null,
    h("details", { class: "card device" }, h("summary", {}, "About this device"),
      h("p", {}, "There is no login. Activities are saved to the trail server and linked to this browser on this device."),
      h("p", { class: "hint" }, "Clearing this browser's site data or using private browsing starts over as a new device. Miles already logged for a hiker keep counting."),
      h("p", {}, "Device ID: ", h("code", { class: "hiker-id" }, s.user.id)),
      h("p", { class: "hint" }, "The trip organizer may ask for this to let this device post Trail Dispatches.")));
}

// One hiker's page at Camp: contribution, badges, milestones and their story so far.
function hikerPanel(s, hk) {
  const badges = hikerBadges(hk, { marks: s.marks, register: s.register, today: s.today, sightings: s.fieldGuide });
  const guide = buildFieldGuide(s.fieldGuide, { hikerId: hk.id });
  const ms = hikerMilestones(hk, s.register);
  const timeline = hikerTimeline(badges, ms);
  const earned = badges.filter((b) => b.earned).length;
  const next = nextMileBadge(hk);
  return h("article", { class: "card hiker-card", "aria-labelledby": "hiker-name" },
    h("h3", { id: "hiker-name", tabindex: "-1" }, hk.name),
    h("dl", { class: "stats" },
      stat("Miles contributed", formatMiles(hk.totalMiles)),
      stat("Share of the expedition", `${hikerShare(hk, s.totals)}%`),
      stat("This week", formatMiles(hk.weekMiles)),
      stat("Badges earned", `${earned} of ${badges.length}`),
      stat("Species photographed", `${guide.found} of ${guide.total}`)),
    next ? [bar(next.percent, "Progress to the next mileage badge"), h("p", { class: "hint" }, `${formatMiles(next.remaining)} to the next mileage badge.`)]
      : h("p", {}, "Every mileage badge earned. Legendary!"),
    h("h4", {}, "Badges"),
    // Locked badges stay a mystery (silhouette only); earning one reveals its art, name and story.
    h("ul", { class: "badge-grid" }, badges.map((b) => b.earned
      ? h("li", { class: `badge earned${b.prestige ? " prestige" : ""}` }, badgeArt(b.art, { earned: true, prestige: b.prestige }), h("strong", {}, b.title),
        h("span", { class: "badge-desc" }, b.description),
        h("span", { class: "hint" }, b.earnedOn ? `Earned ${day(b.earnedOn)}` : "Earned"))
      : h("li", { class: "badge locked" }, badgeArt(b.art, { earned: false }), h("strong", {}, "Locked"),
        h("span", { class: "sr-only" }, "Not yet earned. Keep hiking to discover it.")))),
    h("h4", {}, "Milestones reached"),
    ms.landmarks.length || ms.groupMilestones.length
      ? h("ul", { class: "milestones" },
        ms.landmarks.map((l) => h("li", {}, `Carried the expedition to ${l.title}`, h("span", { class: "hint" }, ` · mile ${l.miles}${l.reachedOn ? ` · ${day(l.reachedOn)}` : ""}`))),
        ms.groupMilestones.map((m) => h("li", {}, `${m.carried ? "Carried the expedition to" : "On the trail for"} “${m.title}”`, h("span", { class: "hint" }, m.reachedOn ? ` · ${day(m.reachedOn)}` : ""))))
      : h("p", { class: "hint" }, "Milestones appear here as the expedition passes landmarks and group goals."),
    timeline.length ? h("details", { class: "timeline-wrap" }, h("summary", {}, `${hk.name}'s journey so far (${timeline.length})`),
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
    h("h2", { id: "hikers-title", tabindex: "-1" }, "The hikers"),
    hikers.length ? [picker, panel] : h("p", { class: "card" }, "No hikers on the roster yet."));
}

function registerSection(s) {
  const p = s.progress;
  return h("section", { class: "register", "aria-labelledby": "register-title" },
    h("h2", { id: "register-title" }, "Trail register"),
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
        pinned: f.get("dPinned") === "on", challengeId: f.get("dAudience") === "crew" && s.challenge ? s.challenge.id : null };
      if (!value.title || !value.body) { status.textContent = "A title and a message are both needed."; return; }
      if (value.title.length > 120 || value.body.length > 5000) { status.textContent = "Keep the title under 120 characters and the message under 5,000."; return; }
      status.textContent = "Posting…";
      a.saveDispatch(existing ? existing.id : null, value);
    } },
  h("h3", { id: "dispatch-form-title" }, existing ? "Edit dispatch" : "Post a new dispatch"),
  field("dTitle", "Title", h("input", { id: "dTitle", name: "dTitle", maxlength: 120, required: true, value: d.title || "" })),
  field("dBody", "Message", h("textarea", { id: "dBody", name: "dBody", rows: 7, maxlength: 5000, required: true, "aria-describedby": "dBody-hint" }, d.body || ""),
    "Formatting: **bold**, *italics*, [link text](https://example.com) (https links only), lines starting with - for lists, # for a heading, > for a quote. Leave a blank line between paragraphs."),
  field("dAuthor", "Signed as", h("input", { id: "dAuthor", name: "dAuthor", maxlength: 40, value: d.authorName || "Kevin" })),
  field("dAudience", "Who can read it", h("select", { id: "dAudience", name: "dAudience" },
    h("option", { value: "everyone", selected: !d.challengeId }, "Everyone using the app"),
    s.challenge ? h("option", { value: "crew", selected: Boolean(d.challengeId) }, `Only ${s.challenge.name}`) : null)),
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

const titleCase = (name) => name[0].toUpperCase() + name.slice(1);
const RARITY_TAG = { rare: "Rare find", legend: "Legend" };
let guideFilter = ""; // "" = whole expedition, or a hiker id; kept while the app is open
const openGroups = new Set(); // field guide sections the hiker has opened

function guideEntry(s, theme, e) {
  const sp = e.spec;
  if (!e.found) {
    return h("li", { class: "guide-entry locked" }, speciesArt(sp, false),
      h("strong", {}, "???", h("span", { class: "sr-only" }, " Not yet photographed.")),
      h("span", { class: "hint" }, whereToLook(sp, theme).text));
  }
  const by = (s.hikers || []).find((x) => x.id === e.firstBy);
  const places = e.habitats.map((id) => theme.habitats[id].label).join(", ");
  return h("li", { class: `guide-entry found${sp.rarity === "rare" || sp.rarity === "legend" ? ` ${sp.rarity}` : ""}` },
    h("details", {},
      h("summary", {}, speciesArt(sp, true), h("strong", {}, titleCase(sp.name)),
        RARITY_TAG[sp.rarity] ? h("span", { class: "tag" }, RARITY_TAG[sp.rarity]) : null),
      h("p", {}, sp.fact),
      h("dl", { class: "guide-facts" },
        h("dt", {}, "First photographed"), h("dd", {}, `${e.firstSeen ? day(e.firstSeen) : "Unknown"}${by ? ` by ${by.name}` : ""}`),
        h("dt", {}, "Range"), h("dd", {}, sp.range),
        places ? [h("dt", {}, "Spotted in"), h("dd", {}, places)] : null,
        h("dt", {}, "Photos"), h("dd", {}, String(e.sightings)))));
}

function fieldGuideBody(s, theme, here) {
  const guide = buildFieldGuide(s.fieldGuide, { hikerId: guideFilter || null, theme });
  const regions = regionProgress(s.fieldGuide, { hikerId: guideFilter || null, theme });
  const left = guide.total - guide.found;
  const who = (s.hikers || []).find((x) => x.id === guideFilter);
  const percent = guide.total ? Math.floor((guide.found / guide.total) * 100) : 0;
  // Each group is a collapsible section so the guide stays short on a phone.
  const section = (g, count, ...content) => h("details", { class: "guide-group", open: openGroups.has(g.id),
    onToggle: (ev) => { if (ev.target.open) openGroups.add(g.id); else openGroups.delete(g.id); } },
  h("summary", {}, h("span", {}, g.label), h("span", { class: "guide-tally" }, count)), ...content);
  return [
    h("p", { class: "guide-count" }, h("strong", {}, `${guide.found} of ${guide.total}`), ` species photographed${who ? ` by ${who.name}` : ""}.`,
      left ? ` ${left} to go.` : " The field guide is complete. Master Naturalist!"),
    bar(percent, "Field guide progress"),
    guide.latest ? h("p", { class: "hint" }, `Latest find: ${titleCase(guide.latest.spec.name)}, ${day(guide.latest.firstSeen)}.`) : null,
    guide.groups.map((g) => {
      const found = g.entries.filter((e) => e.found);
      if (g.id === "legend") {
        if (!found.length) return h("p", { class: "hint guide-rumour" }, "Campfire stories tell of strange creatures on the trail. Keep your camera ready…");
        return section(g, `${found.length} of ${g.entries.length}`, h("ul", { class: "guide-grid" }, found.map((e) => guideEntry(s, theme, e))));
      }
      return section(g, `${found.length} of ${g.entries.length}`, h("ul", { class: "guide-grid" }, g.entries.map((e) => guideEntry(s, theme, e))));
    }),
    // Regional completion: local species photographed in their own trail section.
    section({ id: "regions", label: "Trail sections" }, `${regions.filter((r) => r.completedOn).length} of ${regions.length} complete`,
      h("p", { class: "hint" }, "Photograph every local species in a section, right there, to complete it."),
      h("ul", { class: "region-progress" }, regions.map((r) => h("li", { class: r.completedOn ? "done" : "" },
        h("span", {}, r.label, r.id === here ? h("strong", {}, " (you are here)") : null),
        h("span", { class: "guide-tally" }, r.completedOn ? `Complete ✓` : `${r.found} of ${r.total}`),
        bar(Math.floor((r.found / r.total) * 100), `${r.label} progress`)))))
  ];
}

function fieldGuideCard(s, theme, here) {
  if (s.fieldGuideUnavailable) {
    return h("div", { class: "card field-guide" }, h("h2", {}, "Field guide"),
      h("p", {}, "The field guide fills in once the latest database update is applied. Photos still count on the board."));
  }
  const body = h("div", {}, fieldGuideBody(s, theme, here));
  const hikers = (s.hikers || []).filter((x) => x.active || x.wildlifeRuns);
  if (guideFilter && !hikers.some((x) => x.id === guideFilter)) guideFilter = "";
  const filter = hikers.length > 1 ? field("guide-who", "Show", h("select", { id: "guide-who", onChange: (ev) => { guideFilter = ev.target.value; body.replaceChildren(...fieldGuideBody(s, theme, here)); } },
    h("option", { value: "", selected: !guideFilter }, "The whole expedition"),
    hikers.map((x) => h("option", { value: x.id, selected: x.id === guideFilter }, `${x.name}'s finds`)))) : null;
  const card = h("div", { class: "card field-guide" }, h("h2", {}, "Field guide"),
    h("p", { class: "hint" }, "Every species you photograph is added here with a fact and where it lives. Wildlife changes as the expedition heads north, and with the seasons."),
    filter, body);
  card.refresh = () => body.replaceChildren(...fieldGuideBody(s, theme, here));
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
  const who = roster.length ? h("select", { id: "spotter", name: "spotter", "aria-describedby": "spotter-hint", onChange: (e) => a.rememberHiker(e.target.value) },
    h("option", { value: "", selected: !roster.some((x) => x.id === s.lastHiker) }, "Choose a hiker"),
    roster.map((x) => h("option", { value: x.id, selected: x.id === s.lastHiker }, x.name))) : null;
  const guideCard = fieldGuideCard(s, theme, region ? region.scene : null);
  // Species already in the guide (the chosen spotter's, or everyone's): anything else scores double.
  const known = () => (s.fieldGuideUnavailable ? null
    : (s.fieldGuide || []).filter((r) => !(who && who.value) || r.hikerId === who.value).map((r) => r.species));
  const game = createExpedition(theme, { localHabitat: region ? region.scene : undefined, reducedMotion, known,
    onFinish: async (summary) => {
      // Empty outings aren't saved, so they never use up the 10-a-day allowance.
      if (!summary.score) { saved.textContent = summary.shots ? "Nothing to pin up this time. Spot again?" : "No photos taken, so nothing to pin up this time."; return; }
      const hikerId = who && who.value ? who.value : null;
      saved.textContent = "Pinning your photos to the board at Camp…";
      saved.textContent = await a.recordExpedition({ ...summary, hikerId });
      board.replaceChildren(...[].concat(photoBoard(s, theme)));
      if (guideCard.refresh) guideCard.refresh();
    } });
  a.registerGame(game);
  return h("section", { "aria-labelledby": "page-title", class: "wildlife-page" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, theme.title),
    h("p", {}, theme.intro),
    who ? h("div", { class: "card spotter" }, field("spotter", "Who's spotting?", who, "Photos are pinned to this hiker's board at Camp.")) : null,
    h("div", { class: "card" }, game.element, saved),
    guideCard,
    h("div", { class: "card" }, h("h2", {}, "The photo board"), board,
      h("p", { class: "hint" }, "Up to 10 outings a day count toward the board. Wildlife Spotting is just for fun: only real activity adds trail miles. ", h("a", { href: "#/camp" }, "See the board at Camp"), ".")));
}

export { localDateString };
