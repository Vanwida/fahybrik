# Garmin Health API — Go-Live Checklist

Operational runbook to take the FAHYBRIK Garmin integration from **gated**
(returns HTTP 503, no keys) to **live** the moment approved credentials land.
The code is plug-and-play: no code changes are needed to go live — only env vars
in Vercel (vanwida) + a webhook/callback URL registered in Garmin's portal.

Companion docs:
- `docs/garmin_partner_application.md` — the application brief to submit to Garmin.
- `docs/garmin_data_scopes.md` — which summary types we request and why.
- `docs/garmin_oauth.md` — the OAuth 1.0a flow + token-encryption detail.

---

## 0. Readiness status (current code)

| Surface | State |
|---|---|
| OAuth 1.0a request-token (`GET /api/garmin/connect?athlete_id=`) | **Done.** Signs request_token, stashes the request-token secret in an encrypted HttpOnly `SameSite=Lax` cookie, 302-redirects to Garmin authorize. |
| OAuth 1.0a callback (`GET /api/garmin/callback`) | **Done.** Recovers the request-token secret from the cookie (bound to athlete + oauth_token), exchanges for the access token + secret, AES-256-GCM encrypts, persists to `garmin_oauth_tokens`, burns the cookie. |
| Webhook (`POST /api/garmin/webhook`) | **Done.** HMAC-SHA256 timing-safe verification; resolves `userAccessToken → athlete_id` via the indexed `access_token_sha256` (no per-event decrypt); ingests dailies/sleep/HRV/userMetrics/bodyComps/stress → `biometric_streams`, activities → `workout_executions` + laps → `segment_executions`. |
| Lap → segment mapping (migration 0045) | **Done.** Laps now set `modality` (from Garmin `activityType`), `avg_pace_s_per_km` (run), `avg_pace_s_per_500m` (row/ski/bike), `avg_power_w`, `stroke_rate_spm`, and `source='garmin'` — consistent with the iOS segment contract. Garmin is source-of-truth for laps (existing laps wiped + re-inserted). |
| De-dup | **Done.** Streams dedup on (athlete, source, metric, recorded_at[, source_workout_id]); activities idempotent on (assignment, source='garmin', external_id). |
| Fail-safe without keys | **Done.** All three endpoints return `503 garmin_not_configured` listing missing env vars; the webhook also rejects unverified payloads `401`. Nothing crashes. |
| **iOS connect entry** | **STUB — needs work.** `ConnectionsStep.swift` only flips a local `garminConnected` flag (placeholder). It does NOT open the OAuth flow. See §5. |

---

## 1. Apply to the Garmin Health API

> **Estado del programa (ago-2026):** varios integradores reportan el **Garmin
> Connect Developer Program en pausa** para altas nuevas (cuentas existentes
> siguen). Si vanwida aún no tiene portal, el trámite puede quedar bloqueado
> del lado de Garmin — no es un fallo nuestro. Revisar
> [formulario de acceso](https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/)
> y el portal antes de asumir que se puede solicitar.

1. Go to **developer.garmin.com → Health API** (NOT the Connect IQ / fitness
   SDKs — we need the **Health API** program for server-to-server wellness +
   activity push).
2. Apply under the **vanwida** business entity (legal/business, not a personal
   Garmin account). Approval is gated + historically slow — submit ASAP; it
   blocks the production data path.
3. Submit `docs/garmin_partner_application.md` (company, app description, data
   use) and the scope justifications from `docs/garmin_data_scopes.md`.
4. Garmin issues a **sandbox** Consumer Key/Secret first. The host URLs are the
   same as production; the sandbox key only accepts test users you register in
   the portal. A production key is granted on promotion (no code change — just
   swap the env vars).

---

## 2. Environment variables

Set in **Vercel → vanwida → fahybrik project → Settings → Environment Variables**
(Production + Preview), and mirror into `web/.env.local` for local testing.
**Never commit these.** Use the helper `infra/scripts/vercel-set-prod-env.sh`.

| Var | Where it comes from | Notes |
|---|---|---|
| `GARMIN_CONSUMER_KEY` | Garmin developer portal | Sandbox key first, then production. |
| `GARMIN_CONSUMER_SECRET` | Garmin developer portal | OAuth1 HMAC-SHA1 signing key. |
| `GARMIN_OAUTH_CALLBACK_URL` | You set this | e.g. `https://app.fahybrik.com/api/garmin/callback`. Must EXACTLY match the callback registered in the Garmin portal. |
| `GARMIN_WEBHOOK_SECRET` | *Optional* | Only if Garmin provisions a separate per-program HMAC key for push verification. If unset, the webhook verifies against `GARMIN_CONSUMER_SECRET` (Garmin's default). |
| `ENCRYPTION_KEY` | You generate | 32 bytes for AES-256-GCM. `openssl rand -hex 32`. Required to begin the OAuth flow (the request-token secret cookie is encrypted with it) and to persist access tokens. |

The three `GARMIN_*` (key/secret/callback) gate the endpoints: if any is missing,
all `/api/garmin/*` routes return `503`. `ENCRYPTION_KEY` is separately required
before `/connect` and `/callback` will proceed.

### Register URLs in the Garmin portal

- **OAuth callback URL:** the exact value of `GARMIN_OAUTH_CALLBACK_URL`
  (`…/api/garmin/callback`).
- **Push notification (webhook) URL:** `https://app.fahybrik.com/api/garmin/webhook`
  — register this as the Activity/Wellness **Push** endpoint. Garmin POSTs JSON
  summaries here, signed with HMAC-SHA256.

---

## 3. How an athlete connects (production flow)

1. Athlete taps **Connect Garmin** (iOS — see §5 — or web).
2. App opens `GET /api/garmin/connect?athlete_id=<id>` in a browser/web view.
3. Server signs an OAuth1 request_token call, stores the request-token secret in
   an encrypted cookie, and 302-redirects to `connect.garmin.com/oauthConfirm`.
4. Athlete authorizes inside Garmin and grants the requested scopes.
5. Garmin redirects back to `/api/garmin/callback?oauth_token=…&oauth_verifier=…&athlete_id=…`.
6. Server exchanges for the long-lived access token + secret, AES-256-GCM
   encrypts both, and stores them in `garmin_oauth_tokens` (one row per athlete,
   keyed + indexed by `access_token_sha256` for O(1) webhook resolution).
7. From then on, Garmin pushes the athlete's data to the webhook automatically.
8. **Backfill al conectar** (`lib/garmin/backfill.ts`): el callback dispara en
   background un GET OAuth1 por tipo (`dailies`, `sleeps`, `hrv`, `activities`,
   `activityDetails`, `stressDetails`, `bodyComps`, `userMetrics`) sobre los
   últimos **90 días**. Garmin responde 202 y empuja el pasado por el mismo
   webhook. Fallar el backfill **no** desconecta; el push en vivo sigue. Un 409
   (ya pedido) se trata como OK. Límite práctico de Garmin: ~1 mes real y
   **una vez** por tipo/usuario — no reintentar en bucle.

Tokens are long-lived (Garmin OAuth1 access tokens don't expire; revoked by the
user or Garmin). No refresh loop is required.

---

## 4. What data flows (post-connect)

Garmin → `POST /api/garmin/webhook` → ingest:

| Garmin summary | Destination |
|---|---|
| `dailies` | `biometric_streams`: hr_resting, steps, calories_active, body_battery, stress |
| `sleeps` | `biometric_streams`: sleep_duration, sleep_score |
| `heartRateVariabilities` | `biometric_streams`: hrv |
| `userMetrics` | `biometric_streams`: vo2max |
| `bodyComps` | `biometric_streams`: weight, body_fat |
| `stressDetails` | `biometric_streams`: stress |
| `activities` / `activityDetails` | `workout_executions` (Garmin wins over HealthKit on the same assignment) + avg-HR stream; **laps → `segment_executions`** with modality + pace/power/stroke-rate (migration 0045) |

All rows are tagged `source = 'garmin'`. Existing HealthKit-sourced executions
for the same assignment are overridden by Garmin (higher lap fidelity).

---

## 5. iOS connect surface — what's needed (FLAGGED, not built here)

`ios/FAHYBRIK/Onboarding/Steps/ConnectionsStep.swift` currently only sets a
local `state.garminConnected = true` flag — it is a **placeholder**, it does NOT
start OAuth. To make iOS connect for real, a follow-up needs to:

1. On **Connect Garmin** tap, open `…/api/garmin/connect?athlete_id=<id>` using
   `ASWebAuthenticationSession` (preferred — handles the Garmin redirect + a
   custom return scheme cleanly) or `SFSafariViewController`.
2. Register a return URL the app intercepts after `/callback` succeeds, then set
   `garminConnected` from the real result (not optimistically).
3. Surface failure states (user cancelled, 503 not-configured) in the UI.

Until then, the web `/api/garmin/connect` entry works for testing (open the URL
in a browser). No backend change is needed for iOS to land later.

---

## 6. Smoke test before declaring live

1. With keys set, `GET /api/garmin/connect?athlete_id=<real test athlete>` →
   should 302 to `connect.garmin.com` and Set-Cookie the encrypted request token.
2. Authorize as the sandbox test user → callback returns `{ "ok": true }` and a
   `garmin_oauth_tokens` row appears (encrypted blobs + non-null
   `access_token_sha256`).
3. Trigger / wait for a Garmin push → confirm rows in `biometric_streams` and,
   for an activity that maps to a scheduled assignment, a `workout_executions`
   row + `segment_executions` laps with non-null `modality` / pace columns.
4. Promote sandbox → production: swap `GARMIN_CONSUMER_KEY/SECRET`. No redeploy
   of code logic required (env change only).
