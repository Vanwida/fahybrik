#!/usr/bin/env bash
# Template: set production env vars on a Vercel project.
# Idempotent: skips vars that already exist (Vercel API returns 409 conflict).
#
# Required env (no project/team IDs live in this repo):
#   VERCEL_TOKEN
#   VERCEL_PROJECT_ID
#   VERCEL_TEAM_ID
# Optional:
#   VERCEL_CRED_FILE   — sourced if VERCEL_TOKEN is unset
#   PROD_AUTH_SECRET / PROD_ENCRYPTION_KEY
#   DATABASE_URL / FAHYBRIK_DATABASE_URL
#   RESEND_API_KEY / RESEND_FROM_EMAIL / APP_URL
#   NEON_PROJECT_ID / NEON_REGION / COACH_ALLOWLIST
#
# Run only when authorized. Do not commit values.
set -euo pipefail

CRED_FILE="${VERCEL_CRED_FILE:-${HOME}/.openclaw/credentials/vanwida-tokens.env}"

if [ -z "${VERCEL_TOKEN:-}" ] && [ -r "$CRED_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CRED_FILE"
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is required (env or VERCEL_CRED_FILE)" >&2
  exit 1
fi

PROJECT_ID="${VERCEL_PROJECT_ID:-}"
TEAM_ID="${VERCEL_TEAM_ID:-}"
if [ -z "$PROJECT_ID" ] || [ -z "$TEAM_ID" ]; then
  echo "VERCEL_PROJECT_ID and VERCEL_TEAM_ID are required" >&2
  exit 1
fi

API="https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}"

PROD_AUTH_SECRET="${PROD_AUTH_SECRET:-$(openssl rand -base64 32)}"
PROD_ENCRYPTION_KEY="${PROD_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
PROD_DATABASE_URL="${DATABASE_URL:-${FAHYBRIK_DATABASE_URL:-}}"
RESEND_FROM_EMAIL="${RESEND_FROM_EMAIL:-Coach <noreply@example.com>}"
APP_URL="${APP_URL:-https://example.com}"
COACH_ALLOWLIST="${COACH_ALLOWLIST:-coach@example.com}"
NEON_REGION="${NEON_REGION:-}"

set_env() {
  local key="$1"
  local value="$2"
  local type="${3:-encrypted}"
  local payload
  payload=$(python3 -c "
import json, sys
print(json.dumps({
  'key': sys.argv[1],
  'value': sys.argv[2],
  'type': sys.argv[3],
  'target': ['production'],
}))
" "$key" "$value" "$type")

  local code
  code=$(curl -s -o /tmp/vercel_env_resp.json -w '%{http_code}' \
    -X POST "$API" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  case "$code" in
    200|201)
      echo "set ${key}"
      ;;
    409)
      echo "exists ${key} (skipped)"
      ;;
    *)
      echo "FAILED ${key} http=${code}"
      cat /tmp/vercel_env_resp.json >&2
      echo >&2
      ;;
  esac
}

if [ -n "$PROD_DATABASE_URL" ]; then
  set_env DATABASE_URL "${PROD_DATABASE_URL}" sensitive
fi
set_env AUTH_SECRET "${PROD_AUTH_SECRET}" sensitive
if [ -n "${RESEND_API_KEY:-}" ]; then
  set_env RESEND_API_KEY "${RESEND_API_KEY}" sensitive
fi
set_env ENCRYPTION_KEY "${PROD_ENCRYPTION_KEY}" sensitive

if [ -n "${NEON_PROJECT_ID:-}" ]; then
  set_env NEON_PROJECT_ID "${NEON_PROJECT_ID}" plain
fi
if [ -n "$NEON_REGION" ]; then
  set_env NEON_REGION "${NEON_REGION}" plain
fi
set_env RESEND_FROM_EMAIL "${RESEND_FROM_EMAIL}" plain
set_env APP_URL "${APP_URL}" plain
set_env COACH_ALLOWLIST "${COACH_ALLOWLIST}" plain
set_env LLM_PROVIDER "${LLM_PROVIDER:-}" plain
set_env LLM_EMBEDDING_MODEL "${LLM_EMBEDDING_MODEL:-}" plain

set_env APPLE_CLIENT_ID "${APPLE_CLIENT_ID:-}" plain
set_env LLM_API_KEY "${LLM_API_KEY:-}" sensitive
set_env GARMIN_CONSUMER_KEY "${GARMIN_CONSUMER_KEY:-}" sensitive
set_env GARMIN_CONSUMER_SECRET "${GARMIN_CONSUMER_SECRET:-}" sensitive
set_env GARMIN_CALLBACK_URL "${GARMIN_CALLBACK_URL:-}" plain
set_env APNS_TEAM_ID "${APNS_TEAM_ID:-}" plain
set_env APNS_KEY_ID "${APNS_KEY_ID:-}" plain
set_env APNS_PRIVATE_KEY "${APNS_PRIVATE_KEY:-}" sensitive
set_env APNS_BUNDLE_ID "${APNS_BUNDLE_ID:-}" plain

echo
echo "Done. Listing keys actually present in production:"
curl -s "https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
envs = d.get('envs', d)
for e in envs:
    if 'production' in e.get('target', []):
        print(' -', e.get('key'), '['+e.get('type','?')+']')
"
