# Garmin Health API — Partner Application Brief (FAHYBRIK)

> **Status:** ready for Alex to submit. Apply under **vanwida** (legal/business entity), not personal. Approval is gated and historically slow — submit ASAP because it blocks the production data path for elite athletes.

---

## 1. Application target

- **Program:** Garmin Connect Developer Program — **Health API** (and **Activity API**; Training API is push-only and we don't need it for v1, see §10).
- **Submission URL:** <https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/>
- **Support email (post-submission, for follow-ups):** `connect-support@developer.garmin.com`
- **Eligibility:** business/legal entity only. Apply with a `@vanwida.*` (or company-domain) email — personal Gmail typically gets rejected.
- **Cost:** free for approved business developers. No license/maintenance fee for the program itself. Some metrics (notably **Enhanced Beat-to-Beat Interval / R-R**) require a separate commercial license — we don't need that for v1.
- **Stated SLA:** Garmin replies within **2 business days** with application status. Real-world experience for B2B partners: full approval + production credentials usually takes **2–6 weeks** depending on use-case clarity and security review back-and-forth. Plan for the long end.

---

## 2. Company / applicant info (fill on the form)

| Field | Value |
|---|---|
| Legal company name | **Vanwida** (use the formal legal name as registered) |
| Country | Spain |
| Website | (Vanwida website / FAHYBRIK landing — Alex to confirm) |
| Industry / use case category | Health & Fitness / Sports Performance |
| Product name | **FAHYBRIK** (HYROX & hybrid training coaching platform) |
| Product status | Pre-launch, MVP in development; first cohort onboarding planned for late 2026 |
| Privacy policy URL | **TBD — must be live before submission.** See §6. |
| Terms of service URL | TBD — must be live before submission. |

> **Blocker for Alex:** Garmin reviewers click the privacy policy link. It must be reachable, in English, and explicitly mention Garmin data (see §6 for boilerplate language we'll need on the site).

---

## 3. Technical contact (placeholder — Alex to fill before submission)

The form asks for a primary technical contact who Garmin's support team can reach for integration follow-up.

| Field | Value |
|---|---|
| Technical contact name | _\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| Technical contact email | _\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (use a `@vanwida` or `@aistudios.pro` address; avoid Gmail)_ |
| Technical contact phone | _\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (E.164, e.g. +34…)_ |
| Business contact name | _\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (probably Alex)_ |
| Business contact email | _\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |

> Tip: same person can be both contacts at this stage (one-person product team is fine for B2B partner programs as long as the legal entity is real).

---

## 4. Use case description (paste into the form's "Use Case" / "Application Description" field)

Recommend pasting this verbatim, edited to taste:

> **FAHYBRIK** is a premium coaching platform for **HYROX and hybrid-training athletes**, operated by Vanwida (Spain). We partner with **Pablo (Fabrik Training Club, Barcelona)**, a HYROX coach whose roster includes elite competitors training for national and international titles.
>
> The product has two surfaces: a Swift-native iOS application for athletes, and a Next.js dashboard for the coach. We ingest training, recovery, and physiological data from the athlete's existing wearable so the coach can periodise (we use ATR — Acumulación / Transformación / Realización — block periodisation) and adapt training in near-real-time.
>
> Garmin is the primary device family for our target users: HYROX is a running-heavy hybrid sport and elite competitors overwhelmingly train on Forerunner / Fenix / Epix watches. The Garmin Health API is essential because the metrics our coach relies on — **Training Load, Training Status, Body Battery, HRV Status, Race Predictor, VO2 max, daily summaries, and FIT-level lap data from segmented HYROX simulations** — are not exposed (or are exposed in a degraded form) via Apple HealthKit. Apple HealthKit is a complementary but insufficient source for elite-athlete coaching.
>
> Our integration is **server-side, cloud-to-cloud**: the Vanwida backend handles the OAuth 2.0 (PKCE) authorization flow, stores user access tokens in encrypted form, and operates a webhook receiver to consume Health and Activity push notifications. We do not run any Garmin code on-device; the iOS app simply triggers the OAuth flow in a browser context and observes connection state.
>
> We will use only the data the user explicitly grants. The coach sees only data from athletes who have consented to participate in his program. Data is hosted in the EU (Neon Postgres, `aws-eu-central-1`), encrypted at rest, and deleted on user request or program disconnection per GDPR.

---

## 5. Why Garmin specifically (paste under "Why integrate with Garmin")

- Pablo and the bulk of his elite roster train **exclusively on Garmin** (Forerunner 965 / Fenix 8 / Epix Pro). This is structurally true of the HYROX scene: long aerobic blocks + structured intervals → runners' watches.
- HealthKit alone **does not surface** Garmin's proprietary metrics that Pablo's methodology depends on:
  - **Training Load / Training Status** (7-day acute load and rolling balance — central to ATR transitions).
  - **Body Battery** (sleep/stress-driven readiness signal we use to flag overreaching before it becomes injury).
  - **HRV Status** (overnight HRV vs 60-day baseline — feeds the readiness model).
  - **Race Predictor** (calibrates the realización-block taper for HYROX qualifiers).
  - **FIT lap-level data** with full HR/cadence/pace streams — required because HYROX athletes press lap between stations and we map laps → template segments to compute per-station fatigue (sled push, burpee broad jump, wall balls, etc.). HealthKit lap data is shallower and lossy for non-running activities.
- Without Garmin's API, the coach falls back to manually exporting `.fit` files — unworkable at our target volume and incompatible with the live-coaching value proposition.

---

## 6. Data handling & privacy (paste verbatim — this is the section reviewers scrutinise)

**Legal basis & jurisdiction**
- Operator: Vanwida (Spain, EU). Data controller for FAHYBRIK end-users.
- Lawful basis: **Art. 6(1)(a) GDPR — explicit user consent**, granted at OAuth time.
- Special category (health) data is processed under **Art. 9(2)(a) GDPR — explicit consent** for the specific purpose of athletic coaching.

**Data minimisation**
- We request only the Garmin scopes mapped to a concrete coaching feature (full mapping in `docs/garmin_data_scopes.md`). No speculative scope grabbing.
- We do not request the **Enhanced Beat-to-Beat Interval (R-R)** scope in v1; we have no clinical use case and it requires a separate commercial license.
- We do not resell, share with advertising networks, or use Garmin data for ML training of unrelated models.

**Storage & encryption**
- Storage: **Neon Postgres**, region `aws-eu-central-1` (Frankfurt). All Garmin-derived rows live in EU infrastructure.
- Encryption at rest: AES-256 (Neon-managed, plus column-level encryption for OAuth tokens via libsodium / `pgcrypto` — TBD).
- Encryption in transit: TLS 1.2+ for all webhook ingress, all internal RPC, and all client traffic.
- OAuth tokens (access + refresh) stored encrypted with a per-environment key sourced from Vercel encrypted env vars; never logged, never echoed to stdout, never committed.
- File storage (FIT files, raw activity exports): Vercel Blob or Cloudflare R2 (decision pending) — EU region, signed URLs only, no public buckets.

**Retention**
- Active user data: retained for the duration of the user's coaching engagement.
- Inactive user data: archived 12 months after the last sync; permanently deleted 24 months after last sync, unless the user actively re-engages.
- Deregistration (user disconnects from FAHYBRIK in-app, or revokes via Garmin Connect → triggers our **deregistration** webhook): all Garmin-sourced rows for that user are purged within 30 days, and the User Access Token is destroyed immediately. Aggregated, fully anonymised metrics may be retained for product analytics but cannot be re-identified.
- User-initiated GDPR erasure (Art. 17): processed within 30 days, audited.

**Access control**
- Coach (Pablo) sees data only for athletes assigned to his roster who have consented to share with him.
- Vanwida engineering access: SSO, MFA-enforced, audit-logged. Production read access requires a documented operational reason.
- No third-party processors receive Garmin data (other than infrastructure providers — Neon, Vercel, Resend — all EU-region, all DPAs in place).

**Compliance posture**
- GDPR (EU/Spain): full controller obligations honoured. AEPD-aligned Records of Processing Activities maintained.
- Apple App Store: privacy nutrition labels declare Health & Fitness data linked to user identity, used for app functionality only.
- Garmin Developer Program Terms: we will sign and adhere to the Garmin Developer Program Terms of Use, including the data-use restrictions and the requirement to honour deregistration and permission-change webhooks within Garmin's stated SLAs.

---

## 7. Expected user volume

- **Year 1 (2026–2027):** single coach (Pablo), private roster of **~30–50 athletes** at peak. Call this **~50 connected Garmin users** for capacity planning.
  - Conservative ingest estimate: 50 users × ~15 webhook pings/day (dailies + activities + sleeps + stress + bodyComp + HRV + healthSnapshot, mostly batched) ≈ **~750 webhook events/day**, well inside any reasonable rate limit.
- **Year 2:** open to a second cohort under the same coach or a hand-picked second coach → **~150 users**.
- **Year 3+:** if we open to additional vetted coaches, target ceiling **~1,000 active Garmin-connected users**. Still firmly B2B-partner scale, not consumer broadcast.

> Garmin partner programs prefer modest, well-defined volume estimates over hockey-stick projections. Don't oversell.

---

## 8. Technical architecture (paste under "Technical Implementation" / "Integration Plan")

```
┌────────────────┐        OAuth 2.0 PKCE        ┌─────────────────────┐
│  iOS app       │ ─────► browser handoff ────► │  Garmin Connect     │
│  (Swift)       │                              │  authorise screen   │
└──────┬─────────┘                              └─────────┬───────────┘
       │                                                  │
       │ deep-link return                                 │ auth code
       │                                                  ▼
┌──────▼─────────────────────────────────────────────────────────────┐
│  Vanwida Backend  (Vercel Functions, EU region)                    │
│  ─────────────────────────────────────────────────────────────────│
│  • OAuth callback → token exchange (diauth.garmin.com)             │
│  • Encrypted token store (Neon Postgres, EU)                       │
│  • Webhook receiver: /api/garmin/webhook/{summaryType}             │
│  • Deregistration handler: /api/garmin/webhook/deregistration      │
│  • Permission-change handler: /api/garmin/webhook/userPermission   │
│  • Provider-agnostic ingestion layer → normalised event bus        │
│  • FIT-file fetch worker (Activity API → blob storage)             │
│  • Backfill worker (sleeps / dailies / activities / HRV / details) │
└──────┬─────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────┐    ┌──────────────────────────┐
│  Neon Postgres       │    │  Blob storage (R2/Vercel │
│  + pgvector (EU)     │    │  Blob, EU region)        │
│  normalised metrics  │    │  raw FIT / TCX / GPX     │
└──────────────────────┘    └──────────────────────────┘
```

**OAuth**
- Flow: **OAuth 2.0 with PKCE** (Garmin Health API standard since the OAuth1 → OAuth2 migration).
- Authorise URL: `https://connect.garmin.com/oauth2Confirm` (user-facing).
- Authorisation endpoint: `https://apis.garmin.com/tools/oauth2/authorizeUser`.
- Token endpoint: `https://diauth.garmin.com/di-oauth2-service/oauth/token`.
- Access tokens valid ~3 months; refresh tokens rotated on each refresh; we store the **latest** refresh token only.
- Redirect URI: a backend HTTPS endpoint under `vanwida.*` (specific path TBD; will be registered in the Garmin developer portal once we have credentials).

**Webhook receiver**
- Public HTTPS endpoint, TLS 1.2+, accepts JSON push notifications.
- One handler per **summary type** (or one handler with a discriminator — implementation detail). See `docs/garmin_data_scopes.md` for the full type list.
- Idempotency: every incoming summary is keyed by `(userId, summaryType, summaryId)` with `ON CONFLICT DO NOTHING` on insert. Duplicate pings are no-ops.
- Backpressure: enqueued to a worker queue (Vercel Cron / KV-backed queue — TBD) so the webhook returns 200 in <1s regardless of downstream latency, per Garmin's recommendation.
- Deregistration / userPermission webhooks are wired and tested before any data ingestion goes live.

**Normalisation layer**
- Garmin payloads land in `events_raw` (JSONB, immutable, audit-only).
- A normaliser projects them into typed tables: `daily_summaries`, `sleep_sessions`, `hrv_readings`, `activities`, `activity_laps`, `body_battery_samples`, etc.
- The same normaliser shape is used by the HealthKit and Concept2 pipelines → **provider-agnostic** (provider field is a column, not a table prefix).
- Reconciliation rules dedupe activities arriving via both Garmin and HealthKit (same start time ± window, same device-class hint).

**Security**
- All secrets in Vercel encrypted env (per environment).
- No PII in logs. Garmin User IDs are pseudonymous internally.
- Webhook signature verification: TBD based on Garmin's specific recommendation at production-credentials handover (their portal docs cover this).

---

## 9. Submission checklist (Alex's pre-flight)

Run through this **before** clicking submit:

- [ ] Apply from a `@vanwida.*` or other company-domain email. Not Gmail.
- [ ] Privacy policy is **live, public, and explicitly mentions Garmin data**. Reviewers click it.
- [ ] Terms of Service URL is live.
- [ ] Have the legal entity name handy as it appears in the company registry.
- [ ] Use-case description (§4) is pasted into the application narrative field, lightly tailored if needed.
- [ ] Data-handling section (§6) is referenced or summarised.
- [ ] Volume estimate (§7) is stated conservatively.
- [ ] Technical contact (§3) filled with a real, monitored inbox — Garmin will email there.
- [ ] If the form has an "APIs you want access to" multi-select: tick **Health API** and **Activity API**. Leave Training API, Women's Health API, Courses API unticked (we don't need them v1).
- [ ] If the form asks for sample app screenshots / mocks: include the latest FAHYBRIK design pass (once the UX gate from tasks #17/#18 is signed off).

---

## 10. Step-by-step submission guide (for Alex)

1. Open <https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/>.
2. Fill **company info** (§2). Use the legal name of Vanwida.
3. Fill **technical contact** (§3) — both name + email + phone.
4. In the **use case / description** field, paste §4 + §5 (use case + why Garmin).
5. In the **data handling / privacy** field (or appendix box), paste §6.
6. In the **expected volume** field, paste §7.
7. In the **technical / integration** field, paste §8 (or a link to this doc once it's published on the FAHYBRIK developer subdomain).
8. Tick **Health API** and **Activity API** in any API selector.
9. Submit. Save the confirmation email (PDF it).
10. Watch the technical-contact inbox for 2 business days for the initial status reply.
11. If approved: Garmin's onboarding email contains the developer portal credentials and the next steps for setting up app credentials, redirect URIs, and webhook endpoints. Forward to engineering immediately.
12. If a clarification request comes back: respond same-day. The window between rounds is when applications stall for weeks.

---

## 11. Timeline & what to do while waiting

**Realistic timeline:**
- **Day 0:** submission.
- **Day 1–2:** application status confirmation from Garmin (per their stated SLA).
- **Week 1–3:** clarification round(s) — typical for B2B partner programs. Respond fast; this is the gating factor.
- **Week 2–6:** developer portal access granted, app credentials issued, sandbox/evaluation environment opened. Garmin offers integration support calls during this window — book one.
- **Week 4–8:** integration verification with Garmin, then production credentials.

**While waiting (do NOT block on Garmin to start):**
- Build **OAuth scaffolding** against the public OAuth 2.0 PKCE specification (task #13). The endpoints and flow are documented; we can stub the client_id/client_secret and wire the flow end-to-end with a fixture.
- Build the **webhook receiver skeleton** — endpoints, signature verification stub, `events_raw` table, queue handoff. Run it against captured fixtures from open-source community examples.
- Build the **normaliser** for `dailies`, `sleeps`, `activities`, `activityDetails`, and `hrv` (the five backfill types) since their payload shapes are documented.
- Provision the **EU Neon branch** dedicated to Garmin events.
- Stand up the **privacy policy** site (required for submission anyway).
- Wire **HealthKit** in parallel (task #12) — it's the fallback path and the iOS-side plumbing reuses the same provider-agnostic ingestion layer.

When credentials land, swap the stubs for real values and run integration verification against the Garmin evaluation environment. Should be days, not weeks, of additional work if the scaffolding above is in place.

---

## 12. Known risks / things to flag if Garmin pushes back

- **"You're not a registered company in EU."** — Vanwida is. Have the company registry record (or equivalent) ready as an attachment if asked.
- **"Privacy policy missing."** — covered if §9 checklist is honoured.
- **"Use case overlaps with consumer Connect features."** — counter: we operate as a B2B coaching platform, the coach is the customer, athletes consent individually. Volume is private cohort, not consumer broadcast.
- **"Why not Apple HealthKit only?"** — covered in §5. Be ready to repeat verbatim if the reviewer cuts corners.
- **R-R / Beat-to-Beat license fee.** — sidestep by explicitly *not* requesting that scope in v1.
- **Activity API rate limits.** — at 50 users we're nowhere near limits. If reviewer asks, state that we operate well within published throttling and use webhook-driven ingest (not polling).

---

## 13. Cross-references

- Garmin scope-by-scope mapping for FAHYBRIK features: `docs/garmin_data_scopes.md`.
- OAuth scaffolding implementation: task #13 (`Garmin OAuth scaffolding (backend)`).
- HealthKit pipeline (parallel data source): task #12 (`HealthKit integration pipeline`).
- Provider-agnostic ingestion strategy: see project memory `project_fahybrik_data_integrations.md`.

---

**Owner:** Alex (submits + monitors technical contact inbox).
**Engineering owner once approved:** TBD (probably Alex until first hire).
**Action gate:** privacy policy live → submit → respond to clarifications same-day.
