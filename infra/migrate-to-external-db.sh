#!/usr/bin/env bash
# One-time: move Nimbus's data off Render's free Postgres (deleted after 30 days) onto a free,
# non-expiring Postgres (Neon / Supabase / etc). Run locally with both connection strings:
#
#   SOURCE_DATABASE_URL='postgresql://...render-internal-or-external-url.../nimbus' \
#   TARGET_DATABASE_URL='postgresql://...neon-or-supabase-url.../neondb?sslmode=require' \
#   ./infra/migrate-to-external-db.sh
#
# SOURCE: Render dashboard -> nimbus-db -> Info -> "External Database URL" (Internal URL only
#         works from inside Render's network, not from your Mac).
# TARGET: the connection string your new provider gives you when you create the database.
#
# Safe to re-run: pg_restore --clean drops and recreates each object before restoring it.
set -euo pipefail
: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL (Render's External Database URL)}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (the new provider's connection string)}"

# pg_dump refuses to dump a server newer than itself; catch that before starting, not halfway through.
server_version=$(psql "$SOURCE_DATABASE_URL" -tAc "show server_version_num")   # exits here if unreachable
server_major=$(( server_version / 10000 ))
dump_major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if (( dump_major < server_major )); then
  echo "pg_dump is version $dump_major but the source server is Postgres $server_major." >&2
  echo "Install matching tools first:  brew install postgresql@$server_major  (then put its bin/ first on PATH)" >&2
  exit 1
fi

# The dump holds every user's data (including password hashes): owner-only, and removed however we exit.
umask 077
DUMP=$(mktemp "${TMPDIR:-/tmp}/nimbus-db-dump.XXXXXX")
trap 'rm -f "$DUMP"' EXIT
echo "Dumping from source..."
pg_dump --format=custom --no-owner --no-acl "$SOURCE_DATABASE_URL" > "$DUMP"
echo "Dump size: $(du -h "$DUMP" | cut -f1)"

echo "Restoring into target (existing objects there are dropped and recreated)..."
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" "$DUMP" \
  || echo "(pg_restore may report harmless warnings about roles/extensions it can't manage on a shared host — check row counts below to confirm the data itself came across)"

echo
echo "Row counts, source vs target:"
mismatch=0
for t in users refresh_sessions scans findings resources remediation_requests audit_logs \
         inventory_snapshots assistant_conversations assistant_messages alembic_version; do
  s=$(psql "$SOURCE_DATABASE_URL" -tAc "select count(*) from $t" 2>/dev/null || echo "-")
  t2=$(psql "$TARGET_DATABASE_URL" -tAc "select count(*) from $t" 2>/dev/null || echo "-")
  flag=""; [[ "$s" != "$t2" ]] && { flag="  <-- MISMATCH"; mismatch=1; }
  printf "  %-24s source=%-6s target=%-6s%s\n" "$t" "$s" "$t2" "$flag"
done

if (( mismatch )); then
  echo >&2
  echo "Some tables differ. Do NOT switch DATABASE_URL yet: fix the error above and re-run (it's safe to re-run)." >&2
  exit 1
fi

echo
echo "Done. Next: put TARGET_DATABASE_URL into Render's DATABASE_URL env var, redeploy, verify the"
echo "site, THEN delete the old nimbus-db Postgres instance in Render (Settings -> Delete Database)."
