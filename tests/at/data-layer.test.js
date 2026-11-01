import test from "node:test";
import assert from "node:assert/strict";
import { createDataLayer, createClientFromGlobal } from "../../assets/js/at/data/layer.js";
import { toDataError, DataError, activityFromRow, activityToInsert } from "../../assets/js/at/data/mappers.js";
import { validateActivity } from "../../assets/js/at/engine/activities.js";
import { createFakeClient } from "./helpers/fake-supabase.js";

const signedIn = { user: { id: "user-1" } };
const row = {
  id: "a1", activity_date: "2026-06-15", activity_type: "cycling", actual_miles: "20.00", duration_minutes: null,
  conversion_factor: "0.250", credited_miles: "5.00", notes: null, created_at: "2026-06-15T10:00:00Z"
};

test("every data call is refused before touching the database when signed out", async () => {
  const client = createFakeClient({ session: null });
  const data = createDataLayer(client);
  const attempts = [
    () => data.profile.get(), () => data.profile.update({ displayName: "x" }),
    () => data.activities.list(), () => data.activities.create({}), () => data.activities.update("a", {}),
    () => data.activities.remove("a"), () => data.activities.summary(),
    () => data.challenges.listMine(), () => data.challenges.create({ name: "x" }), () => data.challenges.join("ABC"),
    () => data.challenges.leave("c"), () => data.challenges.remove("c"), () => data.challenges.inviteCode("c"),
    () => data.challenges.leaderboard("c"), () => data.challenges.summary("c")
  ];
  for (const attempt of attempts) {
    await assert.rejects(attempt, (error) => error instanceof DataError && error.code === "auth");
  }
  assert.equal(client.calls.length, 0);
});

test("creating an activity sends only client-settable columns and returns the server's credited miles", async () => {
  const client = createFakeClient({ session: signedIn, respond: () => ({ data: [row], error: null }) });
  const data = createDataLayer(client, { newId: () => "client-1" });
  const value = validateActivity({ type: "cycling", date: "2026-06-15", miles: 20 }, { today: "2026-06-15" }).value;
  const result = await data.activities.create(value);
  const call = client.calls.find((c) => c.op === "insert");
  assert.deepEqual(Object.keys(call.payload).sort(), ["activity_date", "activity_type", "actual_miles", "client_id", "duration_minutes", "notes"]);
  assert.equal(call.payload.client_id, "client-1");
  assert.ok(!("user_id" in call.payload) && !("credited_miles" in call.payload) && !("conversion_factor" in call.payload));
  assert.equal(result.activity.creditedMiles, 5);
  assert.equal(result.activity.actualMiles, 20);
  assert.equal(result.activity.notes, "");
});

test("a retried create (duplicate client id) is reported as a duplicate, not an error", async () => {
  const client = createFakeClient({ session: signedIn, respond: () => ({ data: null, error: { code: "23505", message: "dup" } }) });
  const result = await createDataLayer(client).activities.create({ date: "2026-06-15", type: "walking", actualMiles: 1, durationMinutes: null, notes: "" });
  assert.deepEqual(result, { activity: null, duplicate: true });
});

test("list pages newest first and caps the page size", async () => {
  const client = createFakeClient({ session: signedIn, respond: () => ({ data: [row], error: null }) });
  const items = await createDataLayer(client).activities.list({ limit: 9999, offset: -5 });
  const call = client.calls[0];
  assert.deepEqual(call.range, [0, 199]);
  assert.equal(call.order[0][0], "activity_date");
  assert.equal(items[0].id, "a1");
});

test("update and remove report rows that RLS hid as not found", async () => {
  const client = createFakeClient({ session: signedIn, respond: () => ({ data: [], error: null }) });
  const data = createDataLayer(client);
  const value = { date: "2026-06-15", type: "walking", actualMiles: 1, durationMinutes: null, notes: "" };
  await assert.rejects(data.activities.update("other-users", value), /could not be found/);
  await assert.rejects(data.activities.remove("other-users"), /could not be found/);
  const update = client.calls.find((c) => c.op === "update");
  assert.deepEqual(update.filters, [["id", "other-users"]]);
  assert.ok(!("user_id" in update.payload) && !("credited_miles" in update.payload));
});

test("successful edit and delete", async () => {
  const client = createFakeClient({ session: signedIn, respond: (call) => ({ data: call.op === "delete" ? [{ id: "a1" }] : [row], error: null }) });
  const data = createDataLayer(client);
  const updated = await data.activities.update("a1", { date: "2026-06-15", type: "cycling", actualMiles: 20, durationMinutes: null, notes: "" });
  assert.equal(updated.id, "a1");
  await data.activities.remove("a1");
});

test("database errors become friendly DataErrors without leaking internals", async () => {
  assert.equal(toDataError({ code: "42501", message: "new row violates row-level security policy for table at_activities" }).message, "You do not have permission to do that.");
  assert.equal(toDataError({ code: "22003", message: "Please log no more than 50 miles for one running session" }).code, "validation");
  assert.match(toDataError({ code: "22003", message: "Please log no more than 50 miles for one running session" }).message, /50 miles/);
  assert.equal(toDataError({ code: "XX000", message: "relation \"secret\" exploded" }).message, "Something went wrong. Please try again.");
  assert.equal(toDataError(new TypeError("Failed to fetch")).code, "network");
  assert.equal(toDataError({ message: "JWT expired" }).code, "auth");
  assert.equal(toDataError(null), null);
  const client = createFakeClient({ session: signedIn, respond: () => ({ data: null, error: { code: "42501", message: "denied" } }) });
  await assert.rejects(createDataLayer(client).challenges.leaderboard("c"), (e) => e.code === "forbidden");
});

test("sign up passes the display name and redirect, and reports email confirmation", async () => {
  const client = createFakeClient();
  const data = createDataLayer(client, { redirectTo: "https://atfitnesstracker.abbydavid.com/" });
  const result = await data.auth.signUp({ email: "a@example.test", password: "correct horse battery", displayName: "  Abby " });
  assert.equal(result.needsConfirmation, true);
  const call = client.calls.find((c) => c.name === "signUp");
  assert.equal(call.args.options.data.display_name, "Abby");
  assert.equal(call.args.options.emailRedirectTo, "https://atfitnesstracker.abbydavid.com/");
});

test("sign in errors surface as DataErrors; sign out and auth subscription work", async () => {
  const client = createFakeClient({ auth: { signIn: async () => ({ data: {}, error: { message: "Invalid login credentials", status: 400 } }) } });
  const data = createDataLayer(client);
  await assert.rejects(data.auth.signIn({ email: "a@b.c", password: "x" }), DataError);
  await data.auth.signOut();
  const seen = [];
  const stop = data.auth.onChange((event, user) => seen.push([event, user && user.id]));
  client.authCallback("SIGNED_IN", { user: { id: "u9" } });
  client.authCallback("SIGNED_OUT", null);
  stop();
  assert.deepEqual(seen, [["SIGNED_IN", "u9"], ["SIGNED_OUT", null]]);
  assert.equal(client.unsubscribed, true);
});

test("challenge calls map to the documented RPCs", async () => {
  const client = createFakeClient({
    session: signedIn,
    respond: (call) => {
      if (call.name === "at_create_challenge") return { data: { id: "c1", name: "Crew", direction: "nobo", start_date: "2026-06-01", invite_code: "ABCDEF123456" }, error: null };
      if (call.name === "at_leaderboard") return { data: [{ user_id: "u1", display_name: "Abby", role: "owner", total_credited_miles: "12.5", week_credited_miles: "3", activity_count: 4, last_activity_date: "2026-06-14" }], error: null };
      if (call.name === "at_challenge_summary") return { data: [{ member_count: 3, total_credited_miles: "40", activity_count: 9 }], error: null };
      if (call.name === "at_join_challenge") return { data: "c1", error: null };
      return { data: null, error: null };
    }
  });
  const data = createDataLayer(client);
  assert.equal((await data.challenges.create({ name: "Crew", direction: "nobo", startDate: "2026-06-01" })).inviteCode, "ABCDEF123456");
  assert.equal(await data.challenges.join("abcd-efgh"), "c1");
  const board = await data.challenges.leaderboard("c1", "2026-06-15");
  assert.deepEqual(board[0], { userId: "u1", displayName: "Abby", role: "owner", totalCreditedMiles: 12.5, weekCreditedMiles: 3, activityCount: 4, lastActivityDate: "2026-06-14" });
  assert.deepEqual(await data.challenges.summary("c1"), { memberCount: 3, totalCreditedMiles: 40, activityCount: 9 });
  const names = client.calls.filter((c) => c.kind === "rpc").map((c) => c.name);
  assert.deepEqual(names, ["at_create_challenge", "at_join_challenge", "at_leaderboard", "at_challenge_summary"]);
  assert.equal(client.calls.find((c) => c.name === "at_leaderboard").args.p_week_start, "2026-06-15");
});

test("profile get falls back to at_ensure_profile for pre-existing users", async () => {
  let reads = 0;
  const client = createFakeClient({
    session: signedIn,
    respond: (call) => (call.kind === "rpc" ? { data: null, error: null } : { data: ++reads === 1 ? [] : [{ id: "user-1", display_name: "Hiker", weekly_goal_miles: null }], error: null })
  });
  const profile = await createDataLayer(client).profile.get();
  assert.equal(profile.displayName, "Hiker");
  assert.ok(client.calls.some((c) => c.name === "at_ensure_profile"));
});

test("conversion rules fall back to defaults when unreadable", async () => {
  const client = createFakeClient({ session: signedIn, respond: () => ({ data: null, error: { message: "Failed to fetch" } }) });
  const rules = await createDataLayer(client).rules.list();
  assert.equal(rules.find((r) => r.type === "walking").factor, 1);
});

test("the client factory refuses missing configuration and secret keys", () => {
  const lib = { createClient: (url, key) => ({ url, key }) };
  assert.throws(() => createClientFromGlobal({ url: "", anonKey: "" }, { supabase: lib }), /not configured/);
  assert.throws(() => createClientFromGlobal({ url: "https://x.supabase.co", anonKey: "sb_secret_aaaaaaaaaaaaaaaaaaaa" }, { supabase: lib }), /secret key/);
  assert.throws(() => createClientFromGlobal({ url: "https://x.supabase.co", anonKey: "k".repeat(30) }, {}), /did not load/);
  assert.deepEqual(createClientFromGlobal({ url: "https://x.supabase.co", anonKey: "k".repeat(30) }, { supabase: lib }).url, "https://x.supabase.co");
});

test("mappers: row to activity and activity to insert", () => {
  assert.equal(activityFromRow(row).conversionFactor, 0.25);
  assert.equal(activityToInsert({ date: "d", type: "walking", actualMiles: 1, durationMinutes: 5, notes: "n" }).client_id, undefined);
});
