// Pure game mechanics: forgiving rhythm, weekly goal, badges, cooperative milestones, trivia.
// Everything here is encouraging by design: nothing is ever lost or reset, and rest days are built in.

import { daysBetween, parseDate } from "./activities.js";
import { milestonesReached, round2 } from "./progress.js";

export const GROUP_MILESTONES = Object.freeze([
  { id: "group-100", title: "First hundred together", miles: 100 },
  { id: "group-250", title: "Quarter-thousand", miles: 250 },
  { id: "group-500", title: "Five hundred as a crew", miles: 500 },
  { id: "group-1000", title: "One thousand miles together", miles: 1000 },
  { id: "group-1500", title: "Fifteen hundred", miles: 1500 },
  { id: "group-finish", title: "The crew finished the trail", fractionOfTrail: 1 }
]);

export const RHYTHM_BADGES = Object.freeze([
  { id: "rhythm-3", title: "Finding your rhythm", days: 3 },
  { id: "rhythm-7", title: "A week of movement", days: 7 },
  { id: "rhythm-14", title: "Trail legs", days: 14 }
]);

export const SAFETY_TIPS = Object.freeze([
  "Rest days are part of the plan. Your rhythm keeps going when you take one.",
  "Drink water, wear what suits the weather, and tell someone where you are headed.",
  "Go at a pace that lets you chat. Slow miles count exactly the same.",
  "Pain is a signal. If something hurts, take a rest day and check in with a professional."
]);

// Monday (YYYY-MM-DD) of the week containing `dateString`, using calendar arithmetic only.
export function weekStart(dateString) {
  const date = parseDate(dateString);
  if (!date) throw new RangeError(`Invalid date: ${dateString}`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

// A rhythm is a run of active days where at most ONE rest day separates consecutive active days.
// The current rhythm is still alive if the last active day was within the last two days.
export function computeRhythm(activeDates, today) {
  const dates = [...new Set(activeDates)].filter((d) => parseDate(d) && d <= today).sort().reverse();
  if (!dates.length) return { current: 0, longest: 0, alive: false, lastActive: null };
  let longest = 0;
  let run = 0;
  let firstRun = null;
  dates.forEach((date, index) => {
    if (index > 0 && daysBetween(date, dates[index - 1]) <= 2) {
      run += 1;
    } else {
      if (index > 0 && firstRun === null) firstRun = run;
      run = 1;
    }
    longest = Math.max(longest, run);
  });
  if (firstRun === null) firstRun = run;
  const alive = daysBetween(dates[0], today) <= 2;
  return { current: alive ? firstRun : 0, longest, alive, lastActive: dates[0] };
}

export function weeklyGoalStatus(goalMiles, weekMiles) {
  const miles = Math.max(Number(weekMiles) || 0, 0);
  if (!goalMiles || goalMiles <= 0) return { hasGoal: false, miles: round2(miles), percent: 0, met: false, remaining: 0 };
  return {
    hasGoal: true,
    miles: round2(miles),
    goal: goalMiles,
    percent: Math.min(100, Math.floor((miles / goalMiles) * 100)),
    met: miles >= goalMiles,
    remaining: round2(Math.max(goalMiles - miles, 0))
  };
}

export function computeBadges(trail, progress, rhythm) {
  const badges = [];
  progress.landmarks.forEach((landmark) => {
    if (landmark.distance === 0) return;
    badges.push({ id: `landmark-${landmark.id}`, kind: "landmark", title: landmark.name, description: `Reach ${landmark.name} (${landmark.distance} trail miles from your start).`, earned: landmark.passed });
  });
  milestonesReached(trail, progress.creditedMiles).forEach((milestone) => {
    badges.push({ id: `milestone-${milestone.id}`, kind: "milestone", title: milestone.title, description: milestone.description, earned: milestone.reached });
  });
  RHYTHM_BADGES.forEach((badge) => {
    badges.push({ id: badge.id, kind: "rhythm", title: badge.title, description: `${badge.days} active days with no more than one rest day between them.`, earned: rhythm.longest >= badge.days });
  });
  return badges;
}

export function groupMilestoneStatus(trail, groupMiles, board = []) {
  const miles = Math.max(Number(groupMiles) || 0, 0);
  const steps = GROUP_MILESTONES.map((step) => {
    const target = step.fractionOfTrail ? trail.totalMiles * step.fractionOfTrail : step.miles;
    return { id: step.id, title: step.title, targetMiles: target, reached: miles >= target };
  });
  const next = steps.find((step) => !step.reached) || null;
  const everyoneMoved = board.length > 1 && board.every((entry) => entry.weekCreditedMiles > 0);
  return { steps, next, remainingToNext: next ? round2(next.targetMiles - miles) : 0, everyoneMovedThisWeek: everyoneMoved };
}

export function triviaFor(progress) {
  const source = progress.nextLandmark || progress.lastLandmark;
  return source ? { title: source.name, text: source.trivia, upcoming: Boolean(progress.nextLandmark) } : null;
}

export function pickTip(seed) {
  return SAFETY_TIPS[Math.abs(Math.trunc(seed)) % SAFETY_TIPS.length];
}
