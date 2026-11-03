import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_RULES, MAX_BACKDATE_DAYS } from "../../assets/js/at/engine/activities.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const migration = await readFile(`${root}supabase/migrations/20261101000000_at_fitness_schema.sql`, "utf8");

test("SQL conversion-rule seed rows match the JavaScript defaults", () => {
  const seed = migration.match(/insert into public\.at_conversion_rules[\s\S]*?on conflict/)[0];
  const rows = [...seed.matchAll(/\('(\w+)', ([\d.]+), (\d+)\)/g)].map((m) => ({
    type: m[1], factor: Number(m[2]), maxActualMiles: Number(m[3])
  }));
  assert.equal(rows.length, DEFAULT_RULES.length);
  for (const row of rows) {
    const rule = DEFAULT_RULES.find((r) => r.type === row.type);
    assert.ok(rule, row.type);
    assert.equal(row.factor, rule.factor, `${row.type} factor`);
    assert.equal(row.maxActualMiles, rule.maxActualMiles, `${row.type} cap`);
  }
});

test("SQL date window matches the JavaScript back-dating limit", () => {
  assert.equal(MAX_BACKDATE_DAYS, 60);
  assert.match(migration, /current_date - 61/); // 60 days + 1 day of time-zone slack
});

test("every at_ table enables RLS and the migration never grants to anon", () => {
  const tables = [...migration.matchAll(/create table if not exists public\.(at_\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 5);
  for (const table of tables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), table);
  }
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /grant[^;]*\bto\b[^;]*\banon\b/i);
});

test("no service-role key or other credential-looking value in the migration", () => {
  assert.doesNotMatch(migration, /service_role|eyJ[A-Za-z0-9_-]{20,}|sb_secret_/);
});

test("RLS and privilege tests pass against a real PostgreSQL (skipped when PostgreSQL is not installed)", (t) => {
  const result = spawnSync("bash", [`${root}supabase/tests/run-rls-tests.sh`], { encoding: "utf8" });
  if (result.status === 3) {
    t.skip("PostgreSQL server binaries not installed; install postgresql to run the RLS tests");
    return;
  }
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /RLS TESTS PASSED/);
});
