#!/usr/bin/env bash
# Set production env vars for fahybrik-web on Vercel (vanwida team).
# Idempotent: skips vars that already exist (Vercel API returns 409 conflict).
# Run only when authorized; secrets are read from ~/.openclaw/credentials/vanwida-tokens.env.
set -euo pipefail

CRED_FILE="${HOME}/.openclaw/credentials/vanwida-tokens.env"
PROJECT_ID="prj_9Fj582l8dFSGZ2MeC8K1xlGYFVde"
TEAM_ID="team_B5ilRNlseMDltM1w7xPq13aB"

if [ ! -r "$CRED_FILE" ]; then
  echo "missing credentials at $CRED_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CRED_FILE"

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN not loaded from credentials" >&2
  exit 1
fi

API="https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}"

# Generated fresh per run unless overridden.
PROD_AUTH_SECRET="${PROD_AUTH_SECRET:-$(openssl rand -base64 32)}"
PROD_ENCRYPTION_KEY="${PROD_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"

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

# --- Real values ---
set_env DATABASE_URL "${FAHYBRIK_DATABASE_URL}" sensitive
set_env AUTH_SECRET "${PROD_AUTH_SECRET}" sensitive
set_env RESEND_API_KEY "${RESEND_API_KEY}" sensitive
set_env ENCRYPTION_KEY "${PROD_ENCRYPTION_KEY}" sensitive

# --- Plain config (non-secret) ---
set_env NEON_PROJECT_ID "fancy-glitter-28293061" plain
set_env NEON_REGION "aws-eu-central-1" plain
set_env RESEND_FROM_EMAIL "Fahybrik <noreply@fahybrik.com>" plain
set_env APP_URL "https://fahybrik.com" plain
set_env COACH_ALLOWLIST "pablo@fabrik.training" plain
set_env LLM_PROVIDER "" plain
set_env LLM_EMBEDDING_MODEL "" plain

# --- Placeholders pending external setup (empty strings allowed) ---
set_env APPLE_CLIENT_ID "" plain
set_env LLM_API_KEY "" sensitive
set_env GARMIN_CONSUMER_KEY "" sensitive
set_env GARMIN_CONSUMER_SECRET "" sensitive
set_env GARMIN_CALLBACK_URL "" plain
set_env APNS_TEAM_ID "" plain
set_env APNS_KEY_ID "" plain
set_env APNS_PRIVATE_KEY "" sensitive
set_env APNS_BUNDLE_ID "" plain

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
