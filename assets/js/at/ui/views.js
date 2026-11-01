// Views: pure functions of (state, actions) that return DOM nodes.
import { h, formatMiles } from "./dom.js";
import { renderTrailMap } from "./map.js";
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

export function authView({ mode, onSubmit, onSwitch, onReset, message }) {
  const signup = mode === "signup";
  const form = h("form", { class: "card", novalidate: true, "aria-labelledby": "auth-title",
    onSubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); onSubmit({ email: f.get("email"), password: f.get("password"), displayName: f.get("displayName") }); } },
    h("h1", { id: "auth-title", tabindex: "-1", "data-focus": "" }, signup ? "Join the trail crew" : "Welcome back, hiker"),
    h("p", {}, signup ? "Create an account to log miles and hike the Appalachian Trail with friends." : "Sign in to pick up where you left off."),
    signup ? field("displayName", "Trail name", h("input", { id: "displayName", name: "displayName", maxlength: 40, autocomplete: "nickname", required: true, "aria-describedby": "displayName-hint" }), "Shown to friends in your challenge. It does not need to be your real name.") : null,
    field("email", "Email", h("input", { id: "email", name: "email", type: "email", autocomplete: "email", required: true })),
    field("password", "Password", h("input", { id: "password", name: "password", type: "password", minlength: 8, autocomplete: signup ? "new-password" : "current-password", required: true }), signup ? "At least 8 characters." : null),
    h("p", { class: "status", role: "status", "data-status": "" }, message || ""),
    h("button", { class: "btn primary", type: "submit" }, signup ? "Create account" : "Sign in"));
  return h("section", { class: "auth" }, form,
    h("p", { class: "center" }, h("button", { class: "link", type: "button", onClick: onSwitch }, signup ? "I already have an account" : "New here? Create an account")),
    signup ? null : h("p", { class: "center" }, h("button", { class: "link", type: "button", onClick: onReset }, "Forgot password?")));
}

export function trailView(s) {
  const p = s.progress;
  const rhythm = s.rhythm;
  const goal = weeklyGoalStatus(s.profile?.weeklyGoalMiles, s.summary.weekCreditedMiles);
  const trivia = triviaFor(p);
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, p.completed ? "You finished the Appalachian Trail!" : "Your trail"),
    h("div", { class: "card hero" },
      h("p", { class: "big" }, `${p.percent}%`),
      bar(Math.floor(p.percent), "Trail completed"),
      h("dl", { class: "stats" },
        stat("Trail miles credited", formatMiles(p.creditedMiles)),
        stat("Miles remaining", formatMiles(p.remainingMiles)),
        stat("Landmarks passed", `${p.passedLandmarks.length} of ${p.landmarks.length}`),
        p.nextLandmark ? stat(`Next: ${p.nextLandmark.name}`, formatMiles(p.distanceToNext)) : stat("Next landmark", "You made it!"))),
    h("div", { class: "card" }, h("h2", {}, "Trail map"), renderTrailMap(TRAIL, p),
      h("p", { class: "hint" }, `${TRAIL.directions[p.direction].label}. Mileage is approximate.`)),
    h("div", { class: "card" }, h("h2", {}, "This week"),
      goal.hasGoal
        ? [bar(goal.percent, "Weekly goal"), h("p", {}, goal.met ? `Goal reached: ${formatMiles(goal.miles)} of ${goal.goal} mi. Nice work!` : `${formatMiles(goal.miles)} of ${goal.goal} mi. ${formatMiles(goal.remaining)} to go, at your own pace.`)]
        : h("p", {}, `${formatMiles(goal.miles)} credited this week. You can set an optional weekly goal on the Profile page.`),
      h("p", {}, rhythm.alive ? `Your rhythm: ${rhythm.current} active day${rhythm.current === 1 ? "" : "s"}. Rest days are built in.` : "Ready when you are. Any activity starts a fresh rhythm."),
      h("p", { class: "hint" }, pickTip(Number(s.today.replaceAll("-", ""))))),
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

export function crewView(s, a) {
  const c = s.challenge;
  const body = [];
  if (!s.challenges.length) {
    body.push(
      h("div", { class: "card" }, h("p", {}, "Hike together! Start a crew challenge and share its invite code, or join one with a code from a friend.")),
      h("form", { class: "card", novalidate: true, "aria-labelledby": "create-title", onSubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); a.createChallenge({ name: f.get("name"), direction: f.get("direction") }); } },
        h("h2", { id: "create-title" }, "Start a challenge"),
        field("name", "Challenge name", h("input", { id: "name", name: "name", maxlength: 60, required: true })),
        field("direction", "Direction", h("select", { id: "direction", name: "direction" }, Object.entries(TRAIL.directions).map(([k, v]) => h("option", { value: k }, v.label)))),
        h("button", { class: "btn primary", type: "submit" }, "Create challenge")),
      h("form", { class: "card", novalidate: true, "aria-labelledby": "join-title", onSubmit: (e) => { e.preventDefault(); a.joinChallenge(new FormData(e.target).get("code")); } },
        h("h2", { id: "join-title" }, "Join with a code"),
        field("code", "Invite code", h("input", { id: "code", name: "code", autocomplete: "off", autocapitalize: "characters", required: true })),
        h("button", { class: "btn primary", type: "submit" }, "Join challenge")));
  } else {
    const group = groupMilestoneStatus(TRAIL, s.groupSummary?.totalCreditedMiles || 0, s.board);
    body.push(
      h("div", { class: "card" }, h("h2", {}, c.name),
        h("p", {}, `${s.groupSummary?.memberCount || s.board.length} hiker${(s.groupSummary?.memberCount || s.board.length) === 1 ? "" : "s"} · ${formatMiles(s.groupSummary?.totalCreditedMiles || 0)} together · since ${c.startDate}`),
        group.next ? [bar(Math.min(100, Math.floor(((s.groupSummary?.totalCreditedMiles || 0) / group.next.targetMiles) * 100)), "Next group milestone"), h("p", {}, `Next group milestone: ${group.next.title}, ${formatMiles(group.remainingToNext)} to go.`)] : h("p", {}, "The crew has reached every group milestone!"),
        group.everyoneMovedThisWeek ? h("p", {}, "Everyone in the crew moved this week. Great teamwork!") : null),
      h("div", { class: "card" }, h("h2", {}, "Leaderboard"),
        h("p", { class: "hint" }, "Totals are credited trail miles in this challenge. Everyone's miles move the whole crew forward."),
        h("table", {}, h("caption", { class: "sr-only" }, "Challenge leaderboard"),
          h("thead", {}, h("tr", {}, ["Rank", "Hiker", "Total", "This week"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, s.board.map((r, i) => h("tr", { class: r.userId === s.user.id ? "me" : "" },
            h("td", {}, String(i + 1)), h("th", { scope: "row" }, r.displayName + (r.userId === s.user.id ? " (you)" : "")),
            h("td", {}, formatMiles(r.totalCreditedMiles)), h("td", {}, formatMiles(r.weekCreditedMiles))))))),
      c.ownerId === s.user.id ? h("div", { class: "card" }, h("h2", {}, "Invite friends"),
        s.inviteCode ? h("p", {}, "Invite code: ", h("code", {}, s.inviteCode)) : h("button", { class: "btn", type: "button", onClick: a.showInvite }, "Show invite code"),
        h("p", { class: "hint" }, "Only people with this code can join. Share it privately.")) : null,
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onClick: a.refresh }, "Refresh"),
        h("button", { class: "btn danger", type: "button", onClick: a.leaveChallenge }, "Leave challenge")));
  }
  return h("section", { "aria-labelledby": "page-title" }, h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Crew"), body);
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

export function profileView(s, a) {
  return h("section", { "aria-labelledby": "page-title" },
    h("h1", { id: "page-title", tabindex: "-1", "data-focus": "" }, "Profile"),
    h("form", { class: "card", novalidate: true, onSubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); a.saveProfile({ displayName: f.get("displayName"), weeklyGoalMiles: f.get("goal") }); } },
      field("displayName", "Trail name", h("input", { id: "displayName", name: "displayName", maxlength: 40, required: true, value: s.profile?.displayName || "" }), "Visible to the friends in your challenges."),
      field("goal", "Weekly goal in trail miles (optional)", h("input", { id: "goal", name: "goal", type: "number", inputmode: "decimal", min: 1, max: 200, step: "0.5", value: s.profile?.weeklyGoalMiles ?? "" }), "Pick something that feels good. Leave empty for no goal."),
      h("p", { class: "status", role: "status", "data-status": "" }),
      h("button", { class: "btn primary", type: "submit" }, "Save profile")),
    h("div", { class: "card" }, h("p", {}, `Signed in as ${s.user.email}.`), h("button", { class: "btn", type: "button", onClick: a.signOut }, "Sign out")));
}

export { localDateString };
