#!/usr/bin/env bash
# Back up the Breachpath database to a file on this machine (custom format, restorable with pg_restore).
# Run it yourself; nothing is uploaded anywhere.
#
#   DATABASE_URL='postgresql://user:pass@host/db?sslmode=require' infra/backup-db.sh [out-dir]
#
# Restore into an empty database:
#   pg_restore --no-owner --no-acl -d "$TARGET_DATABASE_URL" backups/breachpath-<stamp>.dump
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database to back up}"
out_dir="${1:-backups}"
mkdir -p "$out_dir"
chmod 700 "$out_dir"                     # dumps hold password hashes: keep them private
stamp="$(date -u +%Y%m%d-%H%M)"
file="$out_dir/breachpath-$stamp.dump"

command -v pg_dump >/dev/null || { echo "pg_dump not found: install the PostgreSQL client (brew install libpq)" >&2; exit 1; }
# SQLAlchemy-style URLs (postgresql+psycopg://, +psycopg2://) aren't understood by pg_dump
url="${DATABASE_URL/postgresql+psycopg2:\/\//postgresql://}"
url="${url/postgresql+psycopg:\/\//postgresql://}"

# Write to a temp name first so a failed dump never looks like a good backup
pg_dump --format=custom --no-owner --no-acl --file="$file.part" "$url"
mv "$file.part" "$file"
echo "Backed up to $file ($(du -h "$file" | cut -f1))"
