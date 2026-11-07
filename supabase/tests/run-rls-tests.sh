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
run_pg "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses='' -c wal_level=logical" -l "$WORK/log" -w start >/dev/null

# Copy the SQL next to the cluster so the postgres OS user can read it wherever the repo lives.
cp "$HERE/supabase-shim.sql" "$HERE"/*.test.sql "$HERE"/../migrations/*.sql "$HERE/../legacy-oregon-schema.sql" "$HERE/../expedition-reset.sql" "$WORK/"
chmod a+r "$WORK"/*.sql
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$BIN/psql" -h "$WORK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres)
run_pg "${PSQL[@]}" -f "$WORK/supabase-shim.sql"
# The live project still had the Oregon Trail DLE tables; the cleanup migration archives them.
run_pg "${PSQL[@]}" -f "$WORK/legacy-oregon-schema.sql" >/dev/null
# Migrations run in filename (timestamp) order. Each one runs twice in a row: pasting the same file
# again must be harmless. (Older files are not re-run after newer ones: the cleanup migration drops
# objects they create, so replaying them would resurrect removed tables.)
for f in "$HERE"/../migrations/*.sql; do
  m="$(basename "$f")"
  run_pg "${PSQL[@]}" -f "$WORK/$m"
  run_pg "${PSQL[@]}" -f "$WORK/$m" >/dev/null 2>"$WORK/rerun.err" \
    || { cat "$WORK/rerun.err" >&2; echo "$m is not re-runnable" >&2; exit 1; }
done
run_pg "${PSQL[@]}" -f "$WORK/rls.test.sql"
# The expedition reset (supabase/expedition-reset.sql) runs against the populated test database.
run_pg "${PSQL[@]}" -f "$WORK/reset.test.sql"

# Upgrade path: a second database stops before the cleanup migration, gets live-like data, and
# upgrade.test.sql applies the cleanup to it.
CLEANUP="20261108000000_at_cleanup.sql"
run_pg "${PSQL[@]}" -c "create database upgrade"
UPSQL=("$BIN/psql" -h "$WORK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d upgrade)
run_pg "${UPSQL[@]}" -f "$WORK/supabase-shim.sql"
run_pg "${UPSQL[@]}" -f "$WORK/legacy-oregon-schema.sql" >/dev/null
for f in "$HERE"/../migrations/*.sql; do
  m="$(basename "$f")"
  [[ "$m" < "$CLEANUP" ]] && run_pg "${UPSQL[@]}" -f "$WORK/$m"
done
run_pg "${UPSQL[@]}" -f "$WORK/upgrade.test.sql"

# Live path: the project never received 20261106 (field guide), so 20261109 must stand on its own.
WILDLIFE="20261109000000_at_wildlife_discoveries.sql"
run_pg "${PSQL[@]}" -c "create database wildlife"
WSQL=("$BIN/psql" -h "$WORK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d wildlife)
run_pg "${WSQL[@]}" -f "$WORK/supabase-shim.sql"
run_pg "${WSQL[@]}" -f "$WORK/legacy-oregon-schema.sql" >/dev/null
for f in "$HERE"/../migrations/*.sql; do
  m="$(basename "$f")"
  [[ "$m" < "$WILDLIFE" && "$m" != 20261106* ]] && run_pg "${WSQL[@]}" -f "$WORK/$m"
done
run_pg "${WSQL[@]}" -f "$WORK/wildlife-upgrade.test.sql"
