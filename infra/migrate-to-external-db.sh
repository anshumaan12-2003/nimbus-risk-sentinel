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

DUMP=$(mktemp -t nimbus-db-dump).pgcustom
echo "Dumping from source..."
pg_dump --format=custom --no-owner --no-acl "$SOURCE_DATABASE_URL" > "$DUMP"
echo "Dump size: $(du -h "$DUMP" | cut -f1)"

echo "Restoring into target (existing objects there are dropped and recreated)..."
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" "$DUMP" \
  || echo "(pg_restore may report harmless warnings about roles/extensions it can't manage on a shared host — check row counts below to confirm the data itself came across)"

echo
echo "Row counts, source vs target:"
for t in users refresh_sessions scans findings resources remediation_requests audit_logs \
         inventory_snapshots assistant_conversations assistant_messages; do
  s=$(psql "$SOURCE_DATABASE_URL" -tAc "select count(*) from $t" 2>/dev/null || echo "-")
  t2=$(psql "$TARGET_DATABASE_URL" -tAc "select count(*) from $t" 2>/dev/null || echo "-")
  printf "  %-24s source=%-6s target=%-6s\n" "$t" "$s" "$t2"
done

rm -f "$DUMP"
echo
echo "Done. Next: put TARGET_DATABASE_URL into Render's DATABASE_URL env var, redeploy, verify the"
echo "site, THEN delete the old nimbus-db Postgres instance in Render (Settings -> Delete Database)."
