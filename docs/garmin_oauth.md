# Garmin OAuth — Backend Scaffolding

Status: **gated on Garmin Health partner approval**. Endpoints return HTTP 503 with
`{"error":"garmin_not_configured"}` until the env vars below are populated.

Companion docs:
- `/docs/garmin_partner_application.md` — application brief
- `/docs/garmin_data_scopes.md` — payload mapping to `biometric_streams`

## Endpoints

| Method | Path                       | Purpose                                                            |
|--------|----------------------------|--------------------------------------------------------------------|
| GET    | `/api/garmin/connect`      | Initiates OAuth 1.0a request-token flow, redirects to Garmin auth  |
| GET    | `/api/garmin/callback`     | Handles `oauth_token` + `oauth_verifier`, exchanges for access     |
| POST   | `/api/garmin/webhook`      | Receives push notifications (activities, dailies, sleep, etc.)     |

`/api/garmin/connect` requires a `?athlete_id=<id>` query param.

## OAuth 1.0a Flow (HMAC-SHA1)

```
Athlete                 FAHYBRIK                 Garmin
   |                       |                       |
   |  GET /connect?id=42   |                       |
   |---------------------->|                       |
   |                       |  POST /request_token  |
   |                       |---------------------->|
   |                       |     oauth_token       |
   |                       |<----------------------|
   |  302 → connect.garmin.com/oauthConfirm        |
   |<----------------------|                       |
   |       (athlete authorizes inside Garmin)      |
   |                       |                       |
   |   GET /callback?oauth_token=…&oauth_verifier= |
   |<----------------------|<----------------------|
   |                       |  POST /access_token   |
   |                       |---------------------->|
   |                       |  oauth_token (final), |
   |                       |  oauth_token_secret   |
   |                       |<----------------------|
   |                       |  encrypt + persist    |
   |                       |  to garmin_oauth_     |
   |                       |  tokens (AES-256-GCM) |
   |     200 OK            |                       |
   |<----------------------|                       |
```

## Required Env Vars

| Var                          | Purpose                                                          |
|------------------------------|------------------------------------------------------------------|
| `GARMIN_CONSUMER_KEY`        | Garmin-issued OAuth 1.0 consumer key                             |
| `GARMIN_CONSUMER_SECRET`     | Garmin-issued OAuth 1.0 consumer secret (HMAC signing)           |
| `GARMIN_OAUTH_CALLBACK_URL`  | e.g. `https://app.fahybrik.com/api/garmin/callback`              |
| `ENCRYPTION_KEY`             | 32 bytes for AES-256-GCM. See "Generating ENCRYPTION_KEY" below. |

## Sandbox vs Production

Garmin's Health API does not have a separate sandbox host — endpoints are the same:

- `https://connectapi.garmin.com/oauth-service/oauth/request_token`
- `https://connect.garmin.com/oauthConfirm`
- `https://connectapi.garmin.com/oauth-service/oauth/access_token`

Differentiation is **per-app**: Garmin issues a "sandbox" consumer key that only
accepts test users registered in the developer portal. Production keys accept
any Garmin Connect user that grants consent.

While in sandbox:

1. Set `GARMIN_CONSUMER_KEY` / `GARMIN_CONSUMER_SECRET` to the sandbox pair.
2. Register Pablo's personal Garmin account as a test user in the developer portal.
3. Verify webhook payloads land in `biometric_streams` with `source = 'garmin'`.

When promoted to production, swap the env vars; no code changes.

## Token Encryption at Rest

Tokens persist to `garmin_oauth_tokens` as `bytea` blobs encrypted with
AES-256-GCM. Blob layout:

```
[12-byte IV][16-byte auth tag][ciphertext]
```

### Generating `ENCRYPTION_KEY`

Either form is accepted (hex preferred):

```bash
# 32 bytes hex (recommended)
openssl rand -hex 32

# 32 bytes base64 (also accepted)
openssl rand -base64 32
```

Store in the deployment secret manager (Vercel env vars). **Do not commit.**

### Rotation

1. Add a new env var `ENCRYPTION_KEY_NEXT` alongside the current key.
2. Implement lazy re-encryption on next access: decrypt with whichever key
   succeeds, re-encrypt with `_NEXT`, mark migrated.
3. Once all rows are migrated, promote `_NEXT` → `ENCRYPTION_KEY` and remove old.

(Rotation tooling is not yet implemented — track as a separate task.)

## Webhook Signature Verification

Garmin signs every push with HMAC-SHA256 over the raw body using the
consumer secret as the key. Header name: `x-garmin-signature` (with fallback
to `x-hub-signature-256`). Signature accepts hex or base64 encoding.

Failed verification → 401, no DB write.

## Local Smoke Test (without Garmin creds)

Without env vars set, all three endpoints return:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": "garmin_not_configured",
  "message": "Garmin Health API integration is gated on partner approval. Required env vars are missing.",
  "missing_env": ["GARMIN_CONSUMER_KEY", "GARMIN_CONSUMER_SECRET", "GARMIN_OAUTH_CALLBACK_URL"],
  "docs": "/docs/garmin_oauth.md"
}
```

This is the expected pre-approval behavior.
