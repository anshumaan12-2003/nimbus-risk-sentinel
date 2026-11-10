#!/usr/bin/env sh
# Render start command. DEMO_FAKE_AWS=true runs the real API against a seeded fake AWS account (moto) on a
# throwaway SQLite file: no database or AWS keys needed, and it reseeds on every boot. Otherwise: real mode.
set -e
if [ "$DEMO_FAKE_AWS" = "true" ]; then
  unset DATABASE_URL                       # never touch a real database from the demo
  export HOST=0.0.0.0 FORWARDED_ALLOW_IPS='*' FAKE_LATENCY="${FAKE_LATENCY:-0.3}"
  exec python tests/dev_server_fake_aws.py
fi
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --forwarded-allow-ips '*'
