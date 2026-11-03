// Views: pure functions of (state, actions) that return DOM nodes.
import { h, formatMiles } from "./dom.js";
import { renderTrailMap } from "./map.js";
import { renderMarkdown } from "./markdown-view.js";
import { renderCampScene } from "./camp-scene.js";
import { createExpedition } from "./expedition-view.js";
import { CAMP_TIMES, CAMP_TIME_LABELS, campContext } from "../engine/camp.js";
import { DEFAULT_THEME, themeFor } from "../engine/expedition-themes.js";
import { regionAtMarker } from "../engine/progress.js";
import { APPALACHIAN_TRAIL as TRAIL } from "../trail/appalachian-trail.js";
import { ACTIVITY_TYPES, ACTIVITY_LABELS, MAX_NOTES_LENGTH, validateActivity, ruleFor, localDateString } from "../engine/activities.js";
import { computeBadges, groupMilestoneStatus, triviaFor, weeklyGoalStatus, pickTip } from "../engine/game.js";

const field = (id, label, control, hint, error) => h("div", { class: "field" },
  h("label", { for: id }, label), control,
  hint ? h("p", { class: "hint", id: `${id}-hint` }, hint) : null,
  h("p", { class: "error", id: `${id}-error`, role: "alert" }, error || ""));

const bar = (percent, label) => h("div", { class: "bar", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent },
  h("span", { style: `width:${percent}%` }));

const stat = (label, value) => h("div", { class: "stat" }, h("dt", {}, label), h("dd", {}, value));

const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

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

export function trailView(s) {
  const p = s.progress;
  const featured = (s.dispatches || [])[0];
  const rhythm = s.rhythm;
  const goal = weeklyGoalStatus(s.profile?.weeklyGoalMiles, s.summary.weekCreditedMiles);
  const trivia = triviaFor(p);
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, p.completed ? "You finished the Appalachian Trail!" : "Your trail"),
    featured ? [dispatchCard(featured, { featured: true }), (s.dispatches || []).length > 1 ? h("p", { class: "more-link" }, h("a", { href: "#/camp" }, "Read earlier dispatches at Camp")) : null] : null,
    (s.profile?.displayName || "Hiker") === "Hiker" ? h("p", { class: "card" }, "Welcome to the trail! ", h("a", { href: "#/camp" }, "Choose a trail name at Camp"), " so friends can spot you on the leaderboard.") : null,
    h("div", { class: "card hero" },
      h("p", { class: "big" }, `${p.percent}%`),
      bar(Math.floor(p.percent), "Trail completed"),
      h("dl", { class: "stats" },
        stat("Trail miles credited", formatMiles(p.creditedMiles)),
        stat("Miles remaining", formatMiles(p.remainingMiles)),
        stat("Landmarks passed", `${p.passedLandmarks.length} of ${p.landmarks.length}`),
        p.nextLandmark ? stat(`Next: ${p.nextLandmark.name}`, formatMiles(p.distanceToNext)) : stat("Next landmark", "You made it!"))),
    h("div", { class: "card map-card" }, h("h2", {}, "Trail map"),
      renderTrailMap(TRAIL, p, {
        crew: (s.board || []).map((r) => ({ name: r.displayName, me: r.userId === s.user?.id, totalMiles: r.totalCreditedMiles })),
        crewMiles: s.challenge && s.groupSummary ? s.groupSummary.totalCreditedMiles : null
      }),
      h("p", { class: "hint" }, `${TRAIL.directions[p.direction].label}. Mileage, elevations and positions are approximate.`)),
    h("div", { class: "card" }, h("h2", {}, "This week"),
      goal.hasGoal
        ? [bar(goal.percent, "Weekly goal"), h("p", {}, goal.met ? `Goal reached: ${formatMiles(goal.miles)} of ${goal.goal} mi. Nice work!` : `${formatMiles(goal.miles)} of ${goal.goal} mi. ${formatMiles(goal.remaining)} to go, at your own pace.`)]
        : h("p", {}, `${formatMiles(goal.miles)} credited this week. `, h("a", { href: "#/camp" }, "Set an optional weekly goal at Camp"), "."),
      h("p", {}, rhythm.alive ? `Your rhythm: ${rhythm.current} active day${rhythm.current === 1 ? "" : "s"}. Rest days are built in.` : "Ready when you are. Any activity starts a fresh rhythm."),
      h("p", { class: "hint" }, pickTip(Number(s.today.replaceAll("-", "")))),
      h("p", { class: "row" }, h("a", { class: "btn primary", href: "#/log" }, "Log an activity"))),
    s.challenges && !s.challenges.length ? h("p", { class: "card" }, "Hiking is better with friends. ", h("a", { href: "#/crew" }, "Start or join a crew at Camp"), " to share a camp and a leaderboard.") : null,
    trivia ? h("div", { class: "card" }, h("h2", {}, trivia.upcoming ? `Coming up: ${trivia.title}` : `Remember: ${trivia.title}`), h("p", {}, trivia.text)) : null,
    h("div", { class: "card" }, h("h2", {}, "Landmarks"),
      h("ol", { class: "landmarks" }, p.landmarks.map((l) => h("li", { class: l.passed ? "passed" : "" },
        h("span", { class: "mark", "aria-hidden": "true" }, l.passed ? "✓" : "•"),
        h("span", {}, `${l.name}, ${l.state}`), h("span", { class: "hint" }, ` ${formatMiles(l.distance)}${l.passed ? " (passed)" : ""}`))))));
}

export function activityForm({ rules, existing, onSubmit, onCancel, today }) {
  const e = existing;
  const rule = (type) => ruleFor(rules, type, today);
  const factorHint = h("p", { class: "hint", id: "factor-hint", "aria-live": "polite" });
  const status = h("p", { class: "status", role: "status", "data-status": "" });
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
      const result = validateActivity({ type: f.get("type"), date: f.get("date"), miles: f.get("miles"), durationMinutes: f.get("durationMinutes"), notes: f.get("notes") }, { rules, today });
      ["type", "date", "miles", "durationMinutes", "notes"].forEach((k) => {
        const node = form.querySelector(`#${k}-error`); if (node) node.textContent = result.errors[k] || "";
        const input = form.querySelector(`#${k}`); if (input) input.setAttribute("aria-invalid", result.errors[k] ? "true" : "false");
      });
      if (!result.ok) { status.textContent = "Please fix the highlighted fields."; form.querySelector("[aria-invalid=true]")?.focus(); return; }
      status.textContent = "Saving…";
      await onSubmit(result.value, status);
    } },
    h("h2", { id: "form-title" }, e ? "Edit activity" : "Log an activity"),
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
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Log activity"),
    h("p", {}, "Every mile counts, whatever the pace. Rest when you need to."),
    activityForm({ rules: s.rules, today: s.today, onSubmit: a.createActivity }));
}

export function historyView(s, a) {
  const list = s.activities.length
    ? h("ul", { class: "history" }, s.activities.map((act) => {
      if (s.editingId === act.id) return h("li", {}, activityForm({ rules: s.rules, existing: act, today: s.today, onSubmit: (v, st) => a.updateActivity(act.id, v, st), onCancel: () => a.edit(null) }));
      return h("li", { class: "card" },
        h("p", {}, h("strong", {}, `${ACTIVITY_LABELS[act.type]} · ${formatMiles(act.actualMiles)}`), ` on ${act.date}`),
        h("p", { class: "hint" }, `Credited ${formatMiles(act.creditedMiles)} of trail${act.durationMinutes ? ` · ${act.durationMinutes} min` : ""}`),
        act.notes ? h("p", {}, act.notes) : null,
        h("div", { class: "row" },
          h("button", { class: "btn", type: "button", "aria-label": `Edit ${ACTIVITY_LABELS[act.type]} on ${act.date}`, onClick: () => a.edit(act.id) }, "Edit"),
          h("button", { class: "btn danger", type: "button", "aria-label": `Delete ${ACTIVITY_LABELS[act.type]} on ${act.date}`, onClick: () => a.deleteActivity(act) }, "Delete")));
    }))
    : h("p", { class: "card" }, "No activities yet. Log your first walk to take the first step from Springer Mountain.");
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "History"), list,
    s.hasMore ? h("button", { class: "btn", type: "button", onClick: a.loadMore }, "Load older activities") : null);
}

// "Your crew" on Camp: start or join a challenge, or see the standings, invite and leave.
function crewSection(s, a) {
  const c = s.challenge;
  const heading = h("h2", { id: "crew-title", tabindex: "-1" }, c ? `Your crew: ${c.name}` : "Your crew");
  if (!s.challenges.length) {
    return h("section", { class: "crew", "aria-labelledby": "crew-title" }, heading,
      h("p", {}, "Hike together! Start a crew challenge and share its invite code, or join one with a code from a friend. Your camp then follows everyone's combined miles."),
      h("p", { class: "status", role: "status", "data-status": "crew" }),
      h("form", { class: "card", novalidate: true, "aria-labelledby": "join-title", onSubmit: (e) => { e.preventDefault(); a.joinChallenge(new FormData(e.target).get("code")); } },
        h("h3", { id: "join-title" }, "Join with a code"),
        field("code", "Invite code", h("input", { id: "code", name: "code", autocomplete: "off", autocapitalize: "characters", required: true })),
        h("button", { class: "btn primary", type: "submit" }, "Join crew")),
      h("form", { class: "card", novalidate: true, "aria-labelledby": "create-title", onSubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); a.createChallenge({ name: f.get("name"), direction: f.get("direction") }); } },
        h("h3", { id: "create-title" }, "Start a crew"),
        field("name", "Crew name", h("input", { id: "name", name: "name", maxlength: 60, required: true })),
        field("direction", "Direction", h("select", { id: "direction", name: "direction" }, Object.entries(TRAIL.directions).map(([k, v]) => h("option", { value: k }, v.label)))),
        h("button", { class: "btn primary", type: "submit" }, "Start crew")));
  }
  const total = s.groupSummary?.totalCreditedMiles || 0;
  const members = s.groupSummary?.memberCount || s.board.length;
  const group = groupMilestoneStatus(TRAIL, total, s.board);
  return h("section", { class: "crew", "aria-labelledby": "crew-title" }, heading,
    h("div", { class: "card" },
      h("p", {}, `${members} hiker${members === 1 ? "" : "s"} · ${formatMiles(total)} together · since ${c.startDate}`),
      group.next ? [bar(Math.min(100, Math.floor((total / group.next.targetMiles) * 100)), "Next group milestone"), h("p", {}, `Next group milestone: ${group.next.title}, ${formatMiles(group.remainingToNext)} to go.`)] : h("p", {}, "The crew has reached every group milestone!"),
      group.everyoneMovedThisWeek ? h("p", {}, "Everyone in the crew moved this week. Great teamwork!") : null),
    h("div", { class: "card" }, h("h3", {}, "Standings"),
      h("p", { class: "hint" }, "Credited trail miles in this challenge. Everyone's miles move the whole crew forward."),
      h("table", {}, h("caption", { class: "sr-only" }, "Crew standings"),
        h("thead", {}, h("tr", {}, ["Rank", "Hiker", "Total", "This week"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, s.board.map((r, i) => h("tr", { class: r.userId === s.user.id ? "me" : "" },
          h("td", {}, String(i + 1)), h("th", { scope: "row" }, r.displayName + (r.userId === s.user.id ? " (you)" : "")),
          h("td", {}, formatMiles(r.totalCreditedMiles)), h("td", {}, formatMiles(r.weekCreditedMiles)))))),
      c.ownerId === s.user.id ? h("div", { class: "invite" },
        s.inviteCode ? h("p", {}, "Invite code: ", h("code", {}, s.inviteCode)) : h("button", { class: "btn", type: "button", onClick: a.showInvite }, "Show invite code"),
        h("p", { class: "hint" }, "Only people with this code can join. Share it privately.")) : null,
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onClick: a.refresh }, "Refresh"),
        h("button", { class: "btn danger", type: "button", onClick: a.leaveChallenge }, "Leave crew"))));
}

export function badgesView(s) {
  const badges = computeBadges(TRAIL, s.progress, s.rhythm);
  const earned = badges.filter((b) => b.earned).length;
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Trail badges"),
    h("p", {}, `${earned} of ${badges.length} earned. Badges are never taken away.`),
    h("ul", { class: "badges" }, badges.map((b) => h("li", { class: b.earned ? "badge earned" : "badge" },
      h("strong", {}, b.title), h("span", { class: "hint" }, ` ${b.earned ? "Earned" : "Not yet"}`), h("p", {}, b.description)))));
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

function suppliesFor(s, themeId, inCrew) {
  const row = (s.supplies || {})[themeId];
  if (!row) return 0;
  return inCrew ? row.crewScore : row.myScore;
}

export function campView(s, a) {
  const inCrew = Boolean(s.challenge && s.groupSummary);
  const prog = s.campProgress || s.progress;
  const lastActive = [...(s.summary.activeDates || [])].sort().pop() || null;
  const board = inCrew && s.board.length ? s.board
    : [{ userId: s.user.id, displayName: s.profile?.displayName || "Hiker", totalCreditedMiles: s.progress.creditedMiles, weekCreditedMiles: s.summary.weekCreditedMiles, lastActivityDate: lastActive }];
  const photos = suppliesFor(s, DEFAULT_THEME, inCrew);
  const ctx = campContext({ trail: TRAIL, progress: prog, board, supplies: { photos }, today: s.today, hour: new Date().getHours(), meId: s.user.id });
  if (s.campTime) ctx.time = s.campTime;
  const latest = (s.dispatches || [])[0];
  Object.assign(ctx, {
    dispatchTitle: latest ? latest.title : null,
    crewLabel: `${inCrew ? "the crew has hiked" : "you have hiked"} ${formatMiles(prog.creditedMiles)}${inCrew ? " together" : ""}${ctx.next ? `; ${formatMiles(ctx.next.miles)} to ${ctx.next.name}` : ""}`,
    bagLabel: `${ctx.scale.bearBags} bag${ctx.scale.bearBags === 1 ? "" : "s"} hung, one per hiker at camp`,
    photoLabel: `${photos} photo points pinned up`
  });
  const caption = h("p", { class: "camp-caption", "aria-live": "polite" },
    `${ctx.weather.label} at camp in ${ctx.region ? ctx.region.name : "Georgia"}. Tap the fire, the shelter, the bear bag line, the photo board or a hiker.`);
  const describe = (id) => {
    if (id === "fire") return `Campfire: ${ctx.crewLabel}.`;
    if (id === "shelter") return latest ? `Shelter register: “${latest.title}” from ${latest.authorName}. Read it below.` : "Shelter register: no dispatches yet.";
    if (id === "bags") return `Bear bag line: ${ctx.bagLabel}. Food is hung away from bears every night.`;
    if (id === "board") return `Photo board: ${ctx.photoLabel}. Go Wildlife Spotting to add more.`;
    const person = ctx.people.find((p) => `person:${p.id}` === id);
    return person ? `${person.name}${person.me ? " (you)" : ""}: ${formatMiles(person.totalMiles)} total, ${formatMiles(person.weekMiles || 0)} this week${person.recent ? ". Just rolled into camp!" : "."}` : "";
  };
  const scene = renderCampScene(ctx, (id) => { caption.textContent = describe(id); });
  const editing = s.dispatchEditing;
  const archive = (s.dispatches || []).map((d) => editing === d.id ? dispatchForm(s, a, d)
    : dispatchCard(d, { actions: s.isOrganizer ? h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", "aria-label": `Edit dispatch: ${d.title}`, onClick: () => a.editDispatch(d.id) }, "Edit"),
      h("button", { class: "btn small danger", type: "button", "aria-label": `Delete dispatch: ${d.title}`, onClick: () => a.deleteDispatch(d) }, "Delete")) : null }));
  const group = groupMilestoneStatus(TRAIL, prog.creditedMiles, []);
  return h("section", { "aria-labelledby": "page-title", class: "camp-page" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Camp"),
    h("p", {}, inCrew ? `${s.challenge.name} is camped ${ctx.region ? `in ${ctx.region.name}` : "on the trail"}, ${formatMiles(prog.creditedMiles)} from the start.` : "Your camp moves with your miles. Join a crew below to share a camp with friends."),
    h("div", { class: "card camp-card" },
      h("div", { class: "camp-frame" }, scene),
      caption,
      h("div", { class: "camp-times", role: "group", "aria-label": "Time of day at camp" },
        h("button", { class: "btn small", type: "button", "aria-pressed": s.campTime ? "false" : "true", onClick: () => a.setCampTime(null) }, "Now"),
        CAMP_TIMES.map((t) => h("button", { class: "btn small", type: "button", "aria-pressed": s.campTime === t ? "true" : "false", onClick: () => a.setCampTime(t) }, CAMP_TIME_LABELS[t])))),
    h("div", { class: "card" }, h("h2", {}, "Around the fire"),
      h("dl", { class: "stats" },
        stat(inCrew ? "Crew miles" : "Your miles", formatMiles(prog.creditedMiles)),
        stat("Section", ctx.region ? ctx.region.name : "—"),
        stat(ctx.next ? `Next: ${ctx.next.name}` : "Next landmark", ctx.next ? formatMiles(ctx.next.miles) : "Katahdin reached!"),
        stat("Photo board", `${photos} pts`), stat("Hikers at camp", String(ctx.people.length))),
      !inCrew && group.next ? h("p", {}, `Next milestone: ${group.next.title}, ${formatMiles(group.remainingToNext)} to go.`) : null,
      ctx.celebration ? h("p", { class: "celebrate" }, `🎉 Camp is celebrating passing ${ctx.celebration.name}!`) : null,
      h("p", {}, h("a", { href: "#/wildlife" }, "Go Wildlife Spotting"), " to pin photos on the board. It's just for fun: only real activity adds trail miles.")),
    crewSection(s, a),
    h("section", { class: "dispatches", "aria-labelledby": "dispatches-title" },
      h("h2", { id: "dispatches-title" }, "Trail Dispatches"),
      h("p", { class: "hint" }, "Updates, stories and encouragement from the trip organizer."),
      s.isOrganizer && editing === "new" ? dispatchForm(s, a, null) : null,
      s.isOrganizer && editing !== "new" ? h("button", { class: "btn primary", type: "button", onClick: () => a.editDispatch("new") }, "Write a dispatch") : null,
      archive.length ? archive : h("p", { class: "card" }, s.dispatchesUnavailable ? "Dispatches will appear here once camp is set up." : "No dispatches yet. Check back soon!")),
    h("form", { class: "card", id: "spot", novalidate: true, "aria-labelledby": "spot-title", onSubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); a.saveProfile({ displayName: f.get("displayName"), weeklyGoalMiles: f.get("goal") }); } },
      h("h2", { id: "spot-title" }, "Your spot at camp"),
      field("displayName", "Trail name", h("input", { id: "displayName", name: "displayName", maxlength: 40, required: true, value: s.profile?.displayName || "" }), "Visible to the friends in your challenges."),
      field("goal", "Weekly goal in trail miles (optional)", h("input", { id: "goal", name: "goal", type: "number", inputmode: "decimal", min: 1, max: 200, step: "0.5", value: s.profile?.weeklyGoalMiles ?? "" }), "Pick something that feels good. Leave empty for no goal."),
      h("p", { class: "status", role: "status", "data-status": "profile" }),
      h("button", { class: "btn primary", type: "submit" }, "Save")),
    h("div", { class: "card" }, h("h2", {}, "About your progress"),
      h("p", {}, "There is no login. Your miles are saved to the trail server and linked to this browser on this device."),
      h("p", { class: "hint" }, "Clearing this browser's site data, using private browsing, or switching devices starts a new hiker. Keep using the same browser to keep your progress."),
      h("details", {}, h("summary", {}, "Your hiker ID"),
        h("p", {}, h("code", { class: "hiker-id" }, s.user.id)),
        h("p", { class: "hint" }, "The trip organizer may ask for this to give you permission to post Trail Dispatches."))));
}

function photoBoardText(s, theme) {
  const mine = (s.supplies || {})[theme.id];
  if (!mine || !mine.myRuns) return "Nothing pinned up yet. Your first outing goes straight onto the photo board at Camp.";
  return `You've pinned ${mine.myScore} ${theme.unit} from ${mine.myRuns} outing${mine.myRuns === 1 ? "" : "s"}${s.challenge ? `; the crew's board holds ${mine.crewScore}` : ""}.`;
}

export function wildlifeView(s, a) {
  const theme = themeFor(DEFAULT_THEME);
  const region = regionAtMarker(TRAIL, (s.campProgress || s.progress).position.marker);
  const reducedMotion = Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const saved = h("p", { class: "status", role: "status" });
  const board = h("p", {}, photoBoardText(s, theme));
  const game = createExpedition(theme, { localHabitat: region ? region.scene : undefined, reducedMotion,
    onFinish: async (summary) => {
      // Empty outings aren't saved, so they never use up the 10-a-day allowance.
      if (!summary.score) { saved.textContent = summary.shots ? "Nothing to pin up this time. Spot again?" : "No photos taken, so nothing to pin up this time."; return; }
      saved.textContent = "Pinning your photos to the board at Camp…";
      saved.textContent = await a.recordExpedition(summary);
      board.textContent = photoBoardText(s, theme);
    } });
  a.registerGame(game);
  return h("section", { "aria-labelledby": "page-title", class: "wildlife-page" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, theme.title),
    h("p", {}, theme.intro),
    h("div", { class: "card" }, game.element, saved),
    h("div", { class: "card" }, h("h2", {}, "Your photo board"), board,
      h("p", { class: "hint" }, "Up to 10 outings a day count toward the board. Wildlife Spotting is just for fun: only real activity adds trail miles. ", h("a", { href: "#/camp" }, "See the board at Camp"), ".")));
}

export { localDateString };
