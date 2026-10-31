import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const source = await readFile(fileURLToPath(new URL("../assets/js/community.js", import.meta.url)), "utf8");

function load({ settings, fetch, WebSocket }) {
  const window = { OTDLE_SUPABASE: settings, crypto: globalThis.crypto };
  const context = {
    window, fetch, WebSocket, console: { info() {}, error() {} },
    localStorage: { getItem: () => "device-1", setItem() {} },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, Uint8Array, Math, JSON, Number, Error
  };
  vm.runInNewContext(source, context);
  return window.OTDLE_COMMUNITY;
}

const settings = { url: "https://example.supabase.co", anonKey: "x".repeat(40) };
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const row = (miles, count) => ({ total_miles: miles, total_contributions: count, updated_at: "2026-01-01T00:00:00Z" });

test("community client is disabled without configuration", async () => {
  const community = load({ settings: { url: "", anonKey: "" } });
  assert.equal(community.enabled, false);
  await assert.rejects(community.submit(5), /not configured/);
});

test("invalid miles are rejected before any request", async () => {
  const calls = [];
  const community = load({ settings, fetch: async (...args) => { calls.push(args); return ok([]); } });
  for (const bad of [-1, 0, 0.05, 1001, "abc", NaN, Infinity]) {
    await assert.rejects(community.submit(bad), /Enter a distance/);
  }
  assert.equal(calls.length, 0);
});

test("submit calls the RPC, publishes the new total, and retries reuse the submission id", async () => {
  const bodies = [];
  let attempt = 0;
  const fetch = async (url, options) => {
    if (url.includes("/rpc/add_community_miles")) {
      bodies.push(JSON.parse(options.body));
      if (++attempt === 1) return { ok: false, status: 503, json: async () => ({ message: "down" }) };
      return ok(row(150, 2));
    }
    return ok([]);
  };
  const community = load({ settings, fetch });
  const seen = [];
  community.onChange((snapshot) => seen.push(snapshot.totalMiles));
  await assert.rejects(community.submit(50), /down/);
  assert.equal(await community.submit(50), 50);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].p_submission_id, bodies[1].p_submission_id);
  assert.equal(bodies[1].p_miles, 50);
  assert.equal(bodies[1].p_source, "device-1");
  assert.equal(seen[0], 150);
});

test("realtime updates are published and the join is rejected gracefully", async () => {
  const sockets = [];
  class FakeSocket {
    constructor() { this.readyState = 1; this.handlers = {}; this.sent = []; sockets.push(this); }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    send(data) { this.sent.push(JSON.parse(data)); }
  }
  const community = load({ settings, fetch: async () => ok([row(100, 1)]), WebSocket: FakeSocket });
  const totals = [];
  community.onChange((snapshot) => totals.push(snapshot.totalMiles));
  community.start();
  const socket = sockets[0];
  socket.handlers.open();
  assert.equal(socket.sent[0].event, "phx_join");
  socket.handlers.message({ data: JSON.stringify({ topic: "realtime:community-progress", event: "phx_reply", payload: { status: "ok" } }) });
  await new Promise((resolve) => setImmediate(resolve));
  socket.handlers.message({ data: JSON.stringify({ event: "postgres_changes", payload: { data: { record: row(175, 3) } } }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(totals.at(-1), 175);
});
