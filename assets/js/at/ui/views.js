// Views: pure functions of (state, actions) that return DOM nodes.
import { h, formatMiles } from "./dom.js";
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
import { groupMilestoneStatus, triviaFor, pickTip } from "../engine/game.js";
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

// A one-time message (a celebration, or the result of an invite link) for the page it belongs to.
const flashNote = (s, page) => (s.flash && s.flash.route === page ? h("p", { class: "card celebrate" }, s.flash.text) : null);
const activeHikers = (s) => (s.hikers || []).filter((x) => x.active);
const hikerName = (s, id) => (s.hikers || []).find((x) => x.id === id)?.name || null;

// Shown to devices that haven't opened the invite link yet. Hidden entirely until the roster
// migration exists, so the app keeps working before setup.
function joinCard(s, a) {
  if (s.expeditionUnavailable) return null;
  return h("form", { class: "card join", novalidate: true, "aria-labelledby": "join-title",
    onSubmit: (e) => { e.preventDefault(); a.joinExpedition(new FormData(e.target).get("code")); } },
  h("h2", { id: "join-title" }, "Join the expedition"),
  h("p", {}, "This device isn't on the expedition yet. Open the invite link from Kevin, or type its code here. Each phone or computer only needs to do this once."),
  field("code", "Invite code", h("input", { id: "code", name: "code", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", required: true })),
  h("p", { class: "status", role: "status", "data-status": "join" }),
  h("button", { class: "btn primary", type: "submit" }, "Join the expedition"));
}

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
  const trivia = triviaFor(p);
  const roster = activeHikers(s);
  const group = groupMilestoneStatus(TRAIL, p.creditedMiles, roster.map((x) => ({ weekCreditedMiles: x.weekMiles })));
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, p.completed ? "The expedition finished the Appalachian Trail!" : "The expedition"),
    flashNote(s, "trail"),
    featured ? [dispatchCard(featured, { featured: true }), (s.dispatches || []).length > 1 ? h("p", { class: "more-link" }, h("a", { href: "#/camp" }, "Read earlier dispatches at Camp")) : null] : null,
    s.member ? null : joinCard(s, a),
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
      s.member || s.expeditionUnavailable ? h("p", { class: "row" }, h("a", { class: "btn primary", href: "#/log" }, "Log an activity")) : null),
    trivia ? h("div", { class: "card" }, h("h2", {}, trivia.upcoming ? `Coming up: ${trivia.title}` : `Remember: ${trivia.title}`), h("p", {}, trivia.text)) : null,
    h("div", { class: "card" }, h("h2", {}, "Landmarks"),
      h("ol", { class: "landmarks" }, p.landmarks.map((l) => h("li", { class: l.passed ? "passed" : "" },
        h("span", { class: "mark", "aria-hidden": "true" }, l.passed ? "✓" : "•"),
        h("span", {}, `${l.name}, ${l.state}`), h("span", { class: "hint" }, ` ${formatMiles(l.distance)}${l.passed ? " (passed)" : ""}`))))));
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
  const blocked = !s.member && !s.expeditionUnavailable;
  // If we couldn't check membership, don't ask a device that may already have joined to join again.
  const unknown = blocked && s.expeditionError;
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Log activity"),
    h("p", {}, "Every mile counts, whatever the pace. Rest when you need to."),
    unknown ? h("div", { class: "card", role: "status" }, h("p", {}, "We couldn't reach the expedition just now, so the hiker list isn't available. We'll keep trying."),
      h("button", { class: "btn primary", type: "button", onClick: () => a.retryExpedition() }, "Try again"))
      : blocked ? joinCard(s, a) : activityForm({ rules: s.rules, today: s.today, hikers: s.member ? activeHikers(s) : null, lastHikerId: s.lastHiker, onSubmit: a.createActivity }));
}

export function historyView(s, a) {
  // Editing an old activity of a retired hiker keeps that hiker selectable.
  const rosterFor = (act) => {
    if (!s.member) return null;
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
        !act.hikerId && s.member ? h("p", { class: "unassigned" }, "No hiker yet, so these miles don't count for the expedition. Edit to choose who hiked them.") : null,
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
      h("p", { class: "hint" }, "Clearing this browser's site data or using private browsing starts over as a new device (open the invite link again). Miles already logged for a hiker keep counting."),
      h("p", {}, "Device ID: ", h("code", { class: "hiker-id" }, s.user.id)),
      h("p", { class: "hint" }, "The trip organizer may ask for this to let this device post Trail Dispatches.")));
}

// One hiker's page at Camp: contribution, badges, milestones and their story so far.
function hikerPanel(s, hk) {
  const badges = hikerBadges(hk, { marks: s.marks, register: s.register, today: s.today });
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
      stat("Badges earned", `${earned} of ${badges.length}`)),
    next ? [bar(next.percent, `Progress to the ${next.title} badge`), h("p", { class: "hint" }, `${formatMiles(next.remaining)} to the ${next.title} badge.`)]
      : h("p", {}, "Every mileage badge earned. Legendary!"),
    h("h4", {}, "Badges"),
    h("ul", { class: "badge-grid" }, badges.map((b) => h("li", { class: `badge${b.earned ? " earned" : ""}` },
      badgeArt(b.art, { earned: b.earned }),
      h("strong", {}, b.title),
      h("span", { class: "hint" }, h("span", { class: "sr-only" }, b.earned ? "Earned. " : "Not yet earned. "),
        b.earned ? (b.earnedOn ? `Earned ${day(b.earnedOn)}` : "Earned") : b.description)))),
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
  if (!s.member) return null;
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
    if (id === "shelter") return latest ? `Shelter register: “${latest.title}” from ${latest.authorName}. Read it below.` : "Shelter register: no dispatches yet.";
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
    s.member ? null : joinCard(s, a),
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
    s.member ? registerSection(s) : null,
    h("section", { class: "dispatches", "aria-labelledby": "dispatches-title" },
      h("h2", { id: "dispatches-title" }, "Trail Dispatches"),
      h("p", { class: "hint" }, "Updates, stories and encouragement from the trip organizer."),
      s.isOrganizer && editing === "new" ? dispatchForm(s, a, null) : null,
      s.isOrganizer && editing !== "new" ? h("button", { class: "btn primary", type: "button", onClick: () => a.editDispatch("new") }, "Write a dispatch") : null,
      archive.length ? archive : h("p", { class: "card" }, s.dispatchesUnavailable ? "Dispatches will appear here once camp is set up." : "No dispatches yet. Check back soon!")),
    s.isOrganizer && !s.expeditionUnavailable ? h("details", { class: "card invite", open: Boolean(s.inviteLink) }, h("summary", {}, "Invite another device"),
      s.inviteLink ? [h("p", {}, h("code", { class: "hiker-id" }, s.inviteLink)), h("p", { class: "hint" }, "Open this link once on each phone or computer that logs miles. Share it privately.")]
        : h("button", { class: "btn", type: "button", onClick: a.showInvite }, "Show invite link")) : null);
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

function photoBoard(s, theme) {
  const roster = (s.hikers || []).filter((x) => x.active || x.wildlifeRuns);
  if (!s.member || !roster.length) return h("p", {}, "Join the expedition to pin photos to the board at Camp.");
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
  const roster = s.member ? activeHikers(s) : [];
  const who = roster.length ? h("select", { id: "spotter", name: "spotter", "aria-describedby": "spotter-hint", onChange: (e) => a.rememberHiker(e.target.value) },
    h("option", { value: "", selected: !roster.some((x) => x.id === s.lastHiker) }, "Choose a hiker"),
    roster.map((x) => h("option", { value: x.id, selected: x.id === s.lastHiker }, x.name))) : null;
  const game = createExpedition(theme, { localHabitat: region ? region.scene : undefined, reducedMotion,
    onFinish: async (summary) => {
      // Empty outings aren't saved, so they never use up the 10-a-day allowance.
      if (!summary.score) { saved.textContent = summary.shots ? "Nothing to pin up this time. Spot again?" : "No photos taken, so nothing to pin up this time."; return; }
      const hikerId = who && who.value ? who.value : null;
      saved.textContent = "Pinning your photos to the board at Camp…";
      saved.textContent = await a.recordExpedition({ ...summary, hikerId });
      board.replaceChildren(...[].concat(photoBoard(s, theme)));
    } });
  a.registerGame(game);
  return h("section", { "aria-labelledby": "page-title", class: "wildlife-page" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, theme.title),
    h("p", {}, theme.intro),
    who ? h("div", { class: "card spotter" }, field("spotter", "Who's spotting?", who, "Photos are pinned to this hiker's board at Camp.")) : null,
    h("div", { class: "card" }, game.element, saved),
    h("div", { class: "card" }, h("h2", {}, "The photo board"), board,
      h("p", { class: "hint" }, "Up to 10 outings a day count toward the board. Wildlife Spotting is just for fun: only real activity adds trail miles. ", h("a", { href: "#/camp" }, "See the board at Camp"), ".")));
}

export { localDateString };
