# Vercel production deployment

Project IDs, team IDs, deployment IDs, and Neon branch hosts are **not stored in this repo**. Read them from the Vercel dashboard or the operator's local credentials file.

Account scope: the org that owns the Vercel project (see `AGENTS.md`). Never a personal Gmail.

## Project shape

| Field | Value |
| --- | --- |
| Framework | `nextjs` |
| Root directory | `web` |
| Production branch | configured in Vercel (typically `main`) |
| Node version | Vercel default |
| Functions region | operator choice (EU if the DB is in EU) |

## Production environment variables (names only)

Set via `POST /v10/projects/{id}/env` using `infra/scripts/vercel-set-prod-env.sh`. Values live encrypted in Vercel. The script requires `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID` in the environment — none of those IDs belong in git.

| Key | Type | Notes |
| --- | --- | --- |
| `DATABASE_URL` | sensitive | Neon connection for the production branch |
| `AUTH_SECRET` | sensitive | Distinct from local `.env.local` |
| `RESEND_API_KEY` | sensitive | From the operator credentials file |
| `ENCRYPTION_KEY` | sensitive | Distinct from local |
| `NEON_PROJECT_ID` | plain | Infra tooling only |
| `NEON_REGION` | plain | Infra tooling only |
| `RESEND_FROM_EMAIL` | plain | Verified Resend sender |
| `APP_URL` | plain | Public production URL |
| `COACH_ALLOWLIST` | plain | Comma-separated coach emails (data, not a baked default) |
| `LLM_PROVIDER` | plain | Operator picks the model |
| `LLM_EMBEDDING_MODEL` | plain | |
| `LLM_API_KEY` | sensitive | |
| `APPLE_CLIENT_ID` | plain | When the iOS Service ID exists |
| `GARMIN_CONSUMER_KEY` | sensitive | After partner approval |
| `GARMIN_CONSUMER_SECRET` | sensitive | |
| `GARMIN_CALLBACK_URL` | plain | |
| `APNS_TEAM_ID` | plain | |
| `APNS_KEY_ID` | plain | |
| `APNS_PRIVATE_KEY` | sensitive | |
| `APNS_BUNDLE_ID` | plain | |

## Domain

Attach and register the production domain in the Vercel dashboard. Point DNS at Vercel's recommended records for that project. Verify the Resend sender domain (DKIM + DMARC) before relying on magic-link mail.

## Auto-deploys

Typical Vercel Git integration:

- Commit to the production branch → production deploy
- Other branches / pull requests → preview deploy

Scope env vars deliberately. Production-only vars mean previews will miss `DATABASE_URL` unless you add a preview-target Neon branch.

## How to re-run env updates

```bash
VERCEL_PROJECT_ID='…' VERCEL_TEAM_ID='…' bash infra/scripts/vercel-set-prod-env.sh
```

Existing keys return HTTP 409 and are skipped. To rotate a value, delete the env var in the Vercel dashboard and re-run.

## Operator checklist

- [ ] Register the production domain and point DNS.
- [ ] Verify the Resend sender domain.
- [ ] Point `DATABASE_URL` at a dedicated production Neon branch, not a disposable one.
- [ ] Set `COACH_ALLOWLIST` to the live coach emails (never commit them).
- [ ] Set Apple / APNs / Garmin keys when those integrations exist.
- [ ] Decide whether preview deploys get their own Neon branch.
