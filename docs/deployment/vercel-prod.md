# Vercel Production Deployment — fahybrik-web

Account scope: **vanwida** (team_B5ilRNlseMDltM1w7xPq13aB). Never alexsole / kud0.

## Project

| Field | Value |
| --- | --- |
| Project name | `fahybrik-web` |
| Project ID | `prj_9Fj582l8dFSGZ2MeC8K1xlGYFVde` |
| Team ID | `team_B5ilRNlseMDltM1w7xPq13aB` |
| Framework | `nextjs` |
| Root directory | `web` |
| Production branch | `main` |
| GitHub repo | `Vanwida/fahybrik` (repoId 1232013356) |
| Node version | `24.x` (Vercel default) |
| Functions region | `iad1` (Vercel default; consider switching to `fra1` for EU latency — not changed yet) |

Created via `POST /v11/projects` on 2026-05-08 by the deploy agent under task #38.

## Latest production deployment

| Field | Value |
| --- | --- |
| Deployment ID | `dpl_9PRMaiAoX1nHgBoxMa1Dm3tgw7tb` |
| Source commit | `fbb8467` (`feat(backend): comms endpoints — sync, chat, push, notif center (#31 #32 #33)`) |
| State | `READY` |
| Deploy URL (unique) | `https://fahybrik-gawieetki-vanwidas-projects.vercel.app` (SSO-protected on Hobby plan — 401 to public) |
| Public production alias | `https://fahybrik-web.vercel.app` (HTTP 307 → `/auth/sign-in`, auth gating verified live) |
| Inspector | https://vercel.com/vanwidas-projects/fahybrik-web/9PRMaiAoX1nHgBoxMa1Dm3tgw7tb |

The triggered deploy used `gitSource.ref=main` so subsequent commits to `main` will auto-deploy via the Git integration. Pull-request previews are also auto-enabled.

## Production environment variables (names only)

Set via `POST /v10/projects/{id}/env` (script: `infra/scripts/vercel-set-prod-env.sh`). All values stored encrypted in Vercel's env store. Total set: **20**.

| Key | Type | Value provenance |
| --- | --- | --- |
| `DATABASE_URL` | sensitive | `FAHYBRIK_DATABASE_URL` from `~/.openclaw/credentials/vanwida-tokens.env` (Neon `fancy-glitter-28293061`, region `aws-eu-central-1`, branch — currently `main` until a dedicated `prod` branch is cut) |
| `AUTH_SECRET` | sensitive | Freshly generated 32-byte base64 (`openssl rand -base64 32`) — distinct from dev `.env.local` |
| `RESEND_API_KEY` | sensitive | From `vanwida-tokens.env` |
| `ENCRYPTION_KEY` | sensitive | Freshly generated 32-byte hex (`openssl rand -hex 32`) |
| `NEON_PROJECT_ID` | plain | `fancy-glitter-28293061` |
| `NEON_REGION` | plain | `aws-eu-central-1` |
| `RESEND_FROM_EMAIL` | plain | `Fahybrik <noreply@fahybrik.com>` (domain not yet verified in Resend) |
| `APP_URL` | plain | `https://fahybrik.com` (placeholder pending domain registration) |
| `COACH_ALLOWLIST` | plain | `pablo@fabrik.training` (placeholder — Alex must confirm Pablo's real email) |
| `LLM_PROVIDER` | plain | empty placeholder (Alex picks LLM — never auto-propose) |
| `LLM_EMBEDDING_MODEL` | plain | empty placeholder |
| `LLM_API_KEY` | sensitive | empty placeholder |
| `APPLE_CLIENT_ID` | plain | empty placeholder (set when iOS app is registered with Apple Developer) |
| `GARMIN_CONSUMER_KEY` | sensitive | empty placeholder (pending Garmin partner approval) |
| `GARMIN_CONSUMER_SECRET` | sensitive | empty placeholder |
| `GARMIN_CALLBACK_URL` | plain | empty placeholder |
| `APNS_TEAM_ID` | plain | empty placeholder (pending Apple Developer enrollment) |
| `APNS_KEY_ID` | plain | empty placeholder |
| `APNS_PRIVATE_KEY` | sensitive | empty placeholder |
| `APNS_BUNDLE_ID` | plain | empty placeholder |

The `vanwida-tokens.env` credentials file also contains a separate `RESEND_API_KEY` distinct from any dev key.

## Domain status — `fahybrik.com`

**Domain attached to project: yes. Domain registered: NO.**

- `POST /v10/projects/{id}/domains` succeeded (Vercel API does not validate registration).
- `whois -h whois.verisign-grs.com fahybrik.com` returns **`No match for domain "FAHYBRIK.COM"`** as of 2026-05-08 — the domain is **not registered to anyone**.
- `dig fahybrik.com NS` returns no nameservers (only the .com gTLD root servers).

The domain is reserved as an alias on the project so once Alex registers it, DNS pointing is the only remaining step. The deploy already lists `fahybrik.com` in its alias set.

### Action required for Alex (domain)

1. **Decide and register the domain.** Recommended: `fahybrik.com` (matches Privacy Policy + ToS pages already shipped under #37, matches `RESEND_FROM_EMAIL`, matches `APP_URL`). Alternatives (e.g., `fahybrik.app`, `fahybrik.training`) require updating env vars + re-issuing legal links + re-verifying Resend sender domain.
2. **Register under vanwida billing**, ideally via Vercel itself (`POST /v4/domains/buy`, transfers `serviceType=zeit.world` and skips DNS) or any registrar pointing to Vercel nameservers.
3. **Point DNS** to Vercel:
   - Apex `fahybrik.com` → A records `216.150.1.1` and `216.150.16.1` (per Vercel `recommendedIPv4`)
   - `www.fahybrik.com` → CNAME `cname.vercel-dns.com.` (recommended)
4. After registration, re-run `vercel-set-prod-env.sh` to bump `RESEND_FROM_EMAIL` only if the chosen domain differs.
5. **Verify Resend sender domain** at `https://resend.com/domains` once registered (DKIM + Return-Path records).

If Alex picks a domain other than `fahybrik.com`, additional artifacts also need updating: `web/app/(legal)/privacy/page.tsx`, `web/app/(legal)/terms/page.tsx`, the iOS legal links, and Garmin partner application material — all currently assume `fahybrik.com`.

## Analytics

| Feature | Status |
| --- | --- |
| Web Analytics | Provisioned at the project level (analytics ID `7mqy4v3ZFIZvg6ncff5KA14sh`). Requires installing `@vercel/analytics/next` in `web/` to start sending events — not done as part of #38 (out of scope). |
| Speed Insights | Provisioned at the project level (id `P2rgA4CSKKjXbPBrUDGinoUZMzN`, `hasData: false`). Requires installing `@vercel/speed-insights/next` in `web/` to collect Core Web Vitals. |

Both can be enabled with a small follow-up edit (one component each in `web/app/layout.tsx`).

## Auto-deploys

The project is Git-linked to `Vanwida/fahybrik`:
- Every commit to `main` → automatic production deploy.
- Every other branch / pull request → automatic preview deploy (with the same env vars unless explicitly scoped to `production`).
- Currently all env vars are `target: ['production']`. Preview/development deployments will fail to read `DATABASE_URL` etc. until you decide whether previews should hit the prod DB or a Neon preview branch (`vercel-set-prod-env.sh` can be extended to multi-target if needed).

## Verificado

- Project created, ID confirmed via `GET /v9/projects/prj_9Fj582l8dFSGZ2MeC8K1xlGYFVde`.
- Git linkage confirmed (`link.org=Vanwida`, `link.repo=fahybrik`, `productionBranch=main`).
- 20 env vars set on `target=production`, list re-fetched and matches expected set.
- Domain `fahybrik.com` attached to project (returned in domain list); registration confirmed unregistered via `whois.verisign-grs.com`.
- Production deployment from commit `fbb8467` reached `READY`; public alias `fahybrik-web.vercel.app` returns HTTP 307 → `/auth/sign-in` (auth gating live).

## Follow-up checklist for Alex

- [ ] Decide and **register `fahybrik.com`** (or alternative). All legal pages, env vars, Resend sender domain, and Garmin application docs assume `fahybrik.com` — picking another domain creates rework.
- [ ] Once registered, point DNS to Vercel (A `216.150.1.1` / `216.150.16.1` apex + `cname.vercel-dns.com.` for `www`).
- [ ] **Verify Resend sender domain** for `noreply@fahybrik.com` after registration (DKIM + DMARC). Magic-link emails will silently fail until verified.
- [ ] **Cut a Neon `prod` branch** off `fancy-glitter-28293061` and update `DATABASE_URL` in Vercel prod env to point at it (currently re-uses the dev branch). Rerun the env-set script with `prod` connection string only.
- [ ] **Confirm Pablo's real email** to replace `pablo@fabrik.training` in `COACH_ALLOWLIST` (Vercel env + `.env.local`).
- [ ] Replace `APPLE_CLIENT_ID` once the iOS Service ID is registered with Apple Developer (also blocks `APNS_*` values).
- [ ] Pick LLM provider and set `LLM_PROVIDER` / `LLM_EMBEDDING_MODEL` / `LLM_API_KEY`. (Don't ask the deploy agent to propose one — Alex picks.)
- [ ] After Garmin partner approval, populate `GARMIN_CONSUMER_KEY` / `_SECRET` / `_CALLBACK_URL` (callback should be `https://fahybrik.com/api/garmin/callback` once domain is live).
- [ ] Decide whether **preview deploys** should hit a separate Neon branch — currently they have no `DATABASE_URL` (env vars are production-only), so PR previews will 500 on any DB-touching route until extended.
- [ ] (Out of #38 scope) Install `@vercel/analytics/next` and `@vercel/speed-insights/next` in `web/` and mount them in `web/app/layout.tsx` to start collecting Web Analytics + Core Web Vitals.
- [ ] (Optional perf) Switch functions default region from `iad1` to `fra1` for EU-located Neon DB to cut hot-path latency.

## How to re-run env updates

```bash
bash infra/scripts/vercel-set-prod-env.sh
```

Existing keys return HTTP 409 and are skipped. To rotate a value, delete the env var via Vercel dashboard or `DELETE /v9/projects/{id}/env/{envId}` and re-run.
