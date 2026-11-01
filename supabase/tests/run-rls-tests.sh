#!/usr/bin/env bash
# Runs the RLS tests against a throwaway local PostgreSQL cluster (no Supabase project needed).
# Requires the PostgreSQL server binaries (e.g. `apt install postgresql`). Exit code 3 = binaries missing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$BIN" ] || [ ! -x "$BIN/initdb" ]; then echo "PostgreSQL server binaries not found" >&2; exit 3; fi

WORK="$(mktemp -d)"
PORT="${RLS_TEST_PORT:-54329}"
cleanup() { run_pg "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

# Postgres refuses to run as root; fall back to the `postgres` OS user when needed.
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"
  run_pg() { su postgres -s /bin/bash -c "$(printf '%q ' "$@")"; }
else
  run_pg() { "$@"; }
fi

run_pg "$BIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null
run_pg "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

# Copy the SQL next to the cluster so the postgres OS user can read it wherever the repo lives.
cp "$HERE/supabase-shim.sql" "$HERE/rls.test.sql" "$HERE/../migrations/20261101000000_at_fitness_schema.sql" "$WORK/"
chmod a+r "$WORK"/*.sql
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$BIN/psql" -h "$WORK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres)
run_pg "${PSQL[@]}" -f "$WORK/supabase-shim.sql"
run_pg "${PSQL[@]}" -f "$WORK/20261101000000_at_fitness_schema.sql"
# Re-running the migration must be harmless (idempotency check).
run_pg "${PSQL[@]}" -f "$WORK/20261101000000_at_fitness_schema.sql" >/dev/null 2>"$WORK/rerun.err" \
  || { cat "$WORK/rerun.err" >&2; echo "migration is not re-runnable" >&2; exit 1; }
run_pg "${PSQL[@]}" -f "$WORK/rls.test.sql"
