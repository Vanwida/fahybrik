#!/usr/bin/env bash
#
# remove-fabricated-blocks.sh — host-guarded runner for remove-fabricated-blocks.sql
#
# Removes the fabricated (non-Excel) blocks from coaches 4/29/30 on the demo DB.
# HARD GUARD: aborts unless the target host contains DEMO_NEON_HOST_PREFIX.
#
# Usage:
#   DEMO_NEON_HOST_PREFIX='<demo-branch-prefix>' ./scripts/remove-fabricated-blocks.sh
# Reads DATABASE_URL from the environment, else from web/.env.local.
set -euo pipefail

cd "$(dirname "$0")/.."   # web/

DEMO_HOST="${DEMO_NEON_HOST_PREFIX:-}"
if [[ -z "$DEMO_HOST" ]]; then
  echo "ERROR: DEMO_NEON_HOST_PREFIX is required (Neon demo-branch host prefix)" >&2
  exit 1
fi

DBURL="${DATABASE_URL:-}"
if [[ -z "$DBURL" ]]; then
  DBURL=$(grep -oE "postgresql://[^\"' ]*${DEMO_HOST}[^\"' ]*" .env.local | head -1 || true)
fi

if [[ -z "$DBURL" ]]; then
  echo "ERROR: no DATABASE_URL found (env or .env.local)" >&2
  exit 1
fi

# Host guard — only the configured demo-branch prefix is allowed.
if [[ "$DBURL" != *"${DEMO_HOST}"* ]]; then
  echo "ERROR: refusing to run — target host does not contain DEMO_NEON_HOST_PREFIX" >&2
  exit 1
fi

echo "Host guard OK (DEMO_NEON_HOST_PREFIX). Running deletion in a single transaction..."
psql "$DBURL" -v ON_ERROR_STOP=1 -f scripts/remove-fabricated-blocks.sql
