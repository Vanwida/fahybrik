#!/usr/bin/env bash
#
# remove-fabricated-blocks.sh — host-guarded runner for remove-fabricated-blocks.sql
#
# Removes the fabricated (non-Excel) blocks from coaches 4/29/30 on the demo DB.
# HARD GUARD: aborts unless the target host is the ep-flat-wind demo branch.
#
# Usage:
#   ./scripts/remove-fabricated-blocks.sh
# Reads DATABASE_URL from the environment, else from web/.env.local.
set -euo pipefail

cd "$(dirname "$0")/.."   # web/

DBURL="${DATABASE_URL:-}"
if [[ -z "$DBURL" ]]; then
  DBURL=$(grep -oE "postgresql://[^\"' ]*ep-flat-wind[^\"' ]*" .env.local | head -1 || true)
fi

if [[ -z "$DBURL" ]]; then
  echo "ERROR: no DATABASE_URL found (env or .env.local)" >&2
  exit 1
fi

# Host guard — only the ep-flat-wind demo branch is allowed.
if [[ "$DBURL" != *"ep-flat-wind"* ]]; then
  echo "ERROR: refusing to run — target host is not ep-flat-wind" >&2
  exit 1
fi

echo "Host guard OK (ep-flat-wind). Running deletion in a single transaction..."
psql "$DBURL" -v ON_ERROR_STOP=1 -f scripts/remove-fabricated-blocks.sql
