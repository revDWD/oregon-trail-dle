// The ONLY module that talks to Supabase. UI code receives plain app objects and DataError instances.
// The Supabase client is injected so tests can use a fake and the browser can use the vendored library.
//
// Client-side "signed in" checks here are for friendly messages only; Row Level Security in the
// database is the real access boundary.

import {
  DataError, toDataError, activityFromRow, activityToInsert, activityToUpdate,
  profileFromRow, challengeFromRow, leaderboardFromRows, ruleFromRow
} from "./mappers.js";
import { DEFAULT_RULES } from "../engine/activities.js";

export function createClientFromGlobal(config, globalObject = globalThis) {
  const lib = globalObject.supabase;
  if (!lib || typeof lib.createClient !== "function") throw new DataError("The Supabase library did not load.", "config");
  if (!/^https:\/\/[^/]+$/.test(config.url || "") || String(config.anonKey || "").length < 20) {
    throw new DataError("Supabase is not configured. See docs/deployment.md.", "config");
  }
  if (/service_role|sb_secret_/i.test(config.anonKey)) throw new DataError("A secret key must never be used in the browser.", "config");
  return lib.createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

export function createDataLayer(client, { newId = () => globalThis.crypto.randomUUID(), redirectTo } = {}) {
  async function run(promise) {
    let result;
    try {
      result = await promise;
    } catch (error) {
      throw toDataError(error);
    }
    if (result.error) throw toDataError(result.error);
    return result.data;
  }

  async function requireUser() {
    let result;
    try {
      result = await client.auth.getSession();
    } catch (error) {
      throw toDataError(error);
    }
    const user = result && result.data && result.data.session && result.data.session.user;
    if (!user) throw new DataError("Please sign in to continue.", "auth");
    return user;
  }

  const auth = {
    async signUp({ email, password, displayName }) {
      const options = { data: { display_name: String(displayName || "").trim() } };
      if (redirectTo) options.emailRedirectTo = redirectTo;
      const data = await run(client.auth.signUp({ email, password, options }));
      // With email confirmation on, there is a user but no session yet.
      return { needsConfirmation: !data.session, user: data.user };
    },
    async signIn({ email, password }) {
      const data = await run(client.auth.signInWithPassword({ email, password }));
      return data.user;
    },
    async signOut() {
      await run(client.auth.signOut());
    },
    async getUser() {
      const result = await client.auth.getSession();
      const session = result && result.data && result.data.session;
      return session ? session.user : null;
    },
    async sendPasswordReset(email) {
      await run(client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined));
    },
    async updatePassword(password) {
      await run(client.auth.updateUser({ password }));
    },
    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session ? session.user : null));
      return () => data.subscription.unsubscribe();
    }
  };

  const profile = {
    async get() {
      const user = await requireUser();
      let row = await run(client.from("at_profiles").select("id, display_name, weekly_goal_miles").eq("id", user.id).maybeSingle());
      if (!row) {
        await run(client.rpc("at_ensure_profile"));
        row = await run(client.from("at_profiles").select("id, display_name, weekly_goal_miles").eq("id", user.id).maybeSingle());
      }
      return row ? profileFromRow(row) : null;
    },
    async update({ displayName, weeklyGoalMiles }) {
      const user = await requireUser();
      const changes = {};
      if (displayName !== undefined) changes.display_name = String(displayName).trim();
      if (weeklyGoalMiles !== undefined) changes.weekly_goal_miles = weeklyGoalMiles;
      const row = await run(client.from("at_profiles").update(changes).eq("id", user.id).select("id, display_name, weekly_goal_miles").single());
      return profileFromRow(row);
    }
  };

  const rules = {
    // Falls back to the built-in defaults when the table cannot be read (e.g. offline).
    async list() {
      try {
        const rows = await run(client.from("at_conversion_rules").select("activity_type, factor, max_actual_miles, effective_from"));
        return rows.length ? rows.map(ruleFromRow) : DEFAULT_RULES.slice();
      } catch (error) {
        return DEFAULT_RULES.slice();
      }
    }
  };

  const activities = {
    async list({ limit = 50, offset = 0 } = {}) {
      await requireUser();
      const capped = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
      const start = Math.max(Math.trunc(offset) || 0, 0);
      const rows = await run(client.from("at_activities").select("*")
        .order("activity_date", { ascending: false }).order("created_at", { ascending: false })
        .range(start, start + capped - 1));
      return rows.map(activityFromRow);
    },
    // `value` is the output of validateActivity(). `clientId` makes retries idempotent.
    async create(value, clientId = newId()) {
      await requireUser();
      try {
        const row = await run(client.from("at_activities").insert(activityToInsert(value, clientId)).select().single());
        return { activity: activityFromRow(row), duplicate: false };
      } catch (error) {
        if (error.code === "duplicate") return { activity: null, duplicate: true };
        throw error;
      }
    },
    async update(id, value) {
      await requireUser();
      const row = await run(client.from("at_activities").update(activityToUpdate(value)).eq("id", id).select().maybeSingle());
      if (!row) throw new DataError("That activity could not be found.", "forbidden");
      return activityFromRow(row);
    },
    async remove(id) {
      await requireUser();
      const rows = await run(client.from("at_activities").delete().eq("id", id).select("id"));
      if (!rows.length) throw new DataError("That activity could not be found.", "forbidden");
    },
    async summary(weekStart) {
      await requireUser();
      const rows = await run(client.rpc("at_my_summary", weekStart ? { p_week_start: weekStart } : {}));
      const row = rows[0];
      return {
        totalCreditedMiles: Number(row.total_credited_miles),
        activityCount: Number(row.activity_count),
        weekCreditedMiles: Number(row.week_credited_miles),
        firstActivityDate: row.first_activity_date || null,
        activeDates: row.active_dates || []
      };
    }
  };

  const challenges = {
    async listMine() {
      await requireUser();
      const rows = await run(client.from("at_challenges")
        .select("id, name, trail_id, direction, start_date, end_date, owner_id").order("created_at", { ascending: true }));
      return rows.map(challengeFromRow);
    },
    async create({ name, direction = "nobo", startDate }) {
      await requireUser();
      const args = { p_name: name, p_direction: direction };
      if (startDate) args.p_start_date = startDate;
      const row = await run(client.rpc("at_create_challenge", args));
      return { id: row.id, name: row.name, direction: row.direction, startDate: row.start_date, inviteCode: row.invite_code };
    },
    async join(code) {
      await requireUser();
      return run(client.rpc("at_join_challenge", { p_code: code }));
    },
    async leave(challengeId) {
      await requireUser();
      await run(client.rpc("at_leave_challenge", { p_challenge: challengeId }));
    },
    async remove(challengeId) {
      await requireUser();
      const rows = await run(client.from("at_challenges").delete().eq("id", challengeId).select("id"));
      if (!rows.length) throw new DataError("Only the owner can delete a challenge.", "forbidden");
    },
    async inviteCode(challengeId) {
      await requireUser();
      return run(client.rpc("at_get_invite_code", { p_challenge: challengeId }));
    },
    async leaderboard(challengeId, weekStart) {
      await requireUser();
      const args = { p_challenge: challengeId };
      if (weekStart) args.p_week_start = weekStart;
      return leaderboardFromRows(await run(client.rpc("at_leaderboard", args)));
    },
    async summary(challengeId) {
      await requireUser();
      const rows = await run(client.rpc("at_challenge_summary", { p_challenge: challengeId }));
      const row = rows[0];
      return { memberCount: Number(row.member_count), totalCreditedMiles: Number(row.total_credited_miles), activityCount: Number(row.activity_count) };
    }
  };

  return { auth, profile, rules, activities, challenges };
}
