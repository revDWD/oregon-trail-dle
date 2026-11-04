#!/usr/bin/env node
// Read-only check of the live roster, exactly as a visiting device sees it: anonymous sign-in with the
// public publishable key, then the at_expedition_hikers() RPC. Needs internet (run it in GitHub Actions).
import { SUPABASE_CONFIG } from "../assets/js/at/config.js";

const EXPECTED = ["Alden", "Amanda", "Andrew", "David", "Elizabeth", "Kayla", "Kevin", "Kelsey", "Matthew", "Shuva", "Will"]; // keep in sync with the latest roster migration
const headers = { apikey: SUPABASE_CONFIG.anonKey, "Content-Type": "application/json" };
const auth = await (await fetch(`${SUPABASE_CONFIG.url}/auth/v1/signup`, { method: "POST", headers, body: "{}" })).json();
if (!auth.access_token) { console.log("Anonymous sign-in failed:", JSON.stringify(auth)); process.exit(1); }
const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/rpc/at_expedition_hikers`, { method: "POST", headers: { ...headers, Authorization: `Bearer ${auth.access_token}` }, body: "{}" });
const rows = await res.json();
if (!res.ok) { console.log("RPC failed:", res.status, JSON.stringify(rows)); process.exit(1); }
const active = rows.filter((r) => r.active).map((r) => r.name);
console.log("Roster (sort order):", rows.map((r) => `${r.name}${r.active ? "" : " (retired)"} #${r.sort_order} ${r.total_credited_miles ?? 0} mi`).join(", "));
const missing = EXPECTED.filter((n) => !active.includes(n));
console.log(missing.length ? `MISSING from the live roster: ${missing.join(", ")} (run supabase/migrations/20261107000000_at_roster_expansion.sql)` : "All 11 hikers are on the live roster.");
