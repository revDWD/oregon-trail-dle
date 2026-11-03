// Mapping between database rows (snake_case) and app objects (camelCase), plus error translation.
// Pure functions, no network.

export class DataError extends Error {
  constructor(message, code = "unknown", cause = null) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.cause = cause;
  }
}

// Translate Supabase/PostgREST/Postgres errors into short, friendly, non-leaky messages.
export function toDataError(error) {
  if (!error) return null;
  if (error instanceof DataError) return error;
  const state = String(error.code || "");
  const message = String(error.message || "");
  // Messages we raise ourselves in SQL are user-safe; pass them through.
  const SAFE = ["22003", "22008", "22023", "54000", "P0002"];
  if (SAFE.includes(state) && message) return new DataError(message, "validation", error);
  if (state === "28000" || /jwt|not authenticated/i.test(message)) return new DataError("Your trail session expired. Please reload the page.", "auth", error);
  if (state === "42501") return new DataError("You do not have permission to do that.", "forbidden", error);
  if (state === "23505") return new DataError("That already exists.", "duplicate", error);
  if (state === "23503") return new DataError(/hiker/i.test(message) ? "That hiker is not on the expedition roster. Please choose another." : "That item no longer exists. Please reload and try again.", "validation", error);
  if (state === "23514") return new DataError("Some of those values are not allowed. Please check them and try again.", "validation", error);
  if (/failed to fetch|network|load failed/i.test(message)) return new DataError("Could not reach the server. Check your connection and try again.", "network", error);
  return new DataError("Something went wrong. Please try again.", "unknown", error);
}

export function activityFromRow(row) {
  return {
    id: row.id,
    date: row.activity_date,
    type: row.activity_type,
    actualMiles: Number(row.actual_miles),
    durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    conversionFactor: Number(row.conversion_factor),
    creditedMiles: Number(row.credited_miles),
    notes: row.notes || "",
    hikerId: row.hiker_id || null,
    createdAt: row.created_at
  };
}

// Only fields the database lets a client set. user_id, conversion_factor and credited_miles are
// deliberately never sent: the database derives them.
export function activityToInsert(value, clientId) {
  const row = {
    activity_date: value.date,
    activity_type: value.type,
    actual_miles: value.actualMiles,
    duration_minutes: value.durationMinutes,
    notes: value.notes
  };
  if (value.hikerId) row.hiker_id = value.hikerId;
  if (clientId) row.client_id = clientId;
  return row;
}

// A hiker can be chosen or changed, never cleared (activities without a hiker don't count).
export function activityToUpdate(value) {
  const row = {
    activity_date: value.date,
    activity_type: value.type,
    actual_miles: value.actualMiles,
    duration_minutes: value.durationMinutes,
    notes: value.notes
  };
  if (value.hikerId) row.hiker_id = value.hikerId;
  return row;
}

// at_expedition_hikers row -> hiker (aggregates only; no device ids or notes ever arrive here).
export function hikerFromRow(row) {
  return {
    id: row.hiker_id,
    name: row.name,
    sortOrder: Number(row.sort_order) || 0,
    active: row.active !== false,
    totalMiles: Number(row.total_credited_miles) || 0,
    weekMiles: Number(row.week_credited_miles) || 0,
    activityCount: Number(row.activity_count) || 0,
    firstActivityDate: row.first_activity_date || null,
    lastActivityDate: row.last_activity_date || null,
    activeDates: row.active_dates || [],
    wildlifeRuns: Number(row.wildlife_runs) || 0,
    wildlifeScore: Number(row.wildlife_score) || 0,
    firstSpottedOn: row.first_spotted_on || null
  };
}

export function markFromRow(row) {
  return { kind: row.kind, mark: Number(row.mark), hikerId: row.hiker_id || null, reachedOn: row.reached_on || null };
}

export function profileFromRow(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    weeklyGoalMiles: row.weekly_goal_miles === null || row.weekly_goal_miles === undefined ? null : Number(row.weekly_goal_miles)
  };
}

export function challengeFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    trailId: row.trail_id,
    direction: row.direction,
    startDate: row.start_date,
    endDate: row.end_date || null,
    ownerId: row.owner_id
  };
}

export function leaderboardFromRows(rows) {
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    totalCreditedMiles: Number(row.total_credited_miles),
    weekCreditedMiles: Number(row.week_credited_miles),
    activityCount: Number(row.activity_count),
    lastActivityDate: row.last_activity_date || null
  }));
}

export function ruleFromRow(row) {
  return {
    type: row.activity_type,
    factor: Number(row.factor),
    maxActualMiles: Number(row.max_actual_miles),
    effectiveFrom: row.effective_from
  };
}

export function dispatchFromRow(row) {
  return {
    id: row.id,
    challengeId: row.challenge_id || null,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at,
    updatedAt: row.updated_at || row.published_at
  };
}

// Only organizer-settable columns. created_by is set by the database, never by the client.
export function dispatchToRow(value) {
  const row = {
    title: String(value.title || "").trim(),
    body: String(value.body || "").trim(),
    author_name: String(value.authorName || "Camp").trim() || "Camp",
    pinned: Boolean(value.pinned),
    challenge_id: value.challengeId || null
  };
  if (value.publishedAt) row.published_at = value.publishedAt;
  return row;
}

// at_camp_supplies rows (one per theme) -> { [theme]: { myScore, myRuns, crewScore, crewRuns } }.
export function suppliesFromRows(rows) {
  const out = {};
  (rows || []).forEach((row) => {
    out[row.theme] = {
      myScore: Number(row.my_score) || 0, myRuns: Number(row.my_runs) || 0,
      crewScore: Number(row.crew_score) || 0, crewRuns: Number(row.crew_runs) || 0
    };
  });
  return out;
}
