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
  if (state === "28000" || /jwt|not authenticated/i.test(message)) return new DataError("Please sign in to continue.", "auth", error);
  if (state === "42501") return new DataError("You do not have permission to do that.", "forbidden", error);
  if (state === "23505") return new DataError("That already exists.", "duplicate", error);
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
  if (clientId) row.client_id = clientId;
  return row;
}

export function activityToUpdate(value) {
  return {
    activity_date: value.date,
    activity_type: value.type,
    actual_miles: value.actualMiles,
    duration_minutes: value.durationMinutes,
    notes: value.notes
  };
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
