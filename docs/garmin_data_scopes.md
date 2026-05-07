# Garmin Health & Activity API — Scopes & Summary Types Requested by FAHYBRIK

> Companion to `docs/garmin_partner_application.md`. This is the definitive list of Garmin data we request and **why each one maps to a concrete FAHYBRIK feature**. Reviewers (Garmin and internal privacy) should be able to read this and confirm every scope has a justified use.
>
> **Principle:** request only what we use. Don't speculate. If a feature is parked, the supporting scope is parked too.

---

## 1. APIs we are requesting

| API | Requesting? | Reason |
|---|---|---|
| **Health API** | ✅ yes | Daily summaries, sleep, HRV, body battery, stress — the core readiness/load picture for the coach. |
| **Activity API** | ✅ yes | FIT-level activity data with laps and HR/cadence streams — required to map HYROX simulation laps to template segments. |
| Training API | ❌ no (Phase 2) | Training API is **push-only** (we'd send workouts to Garmin devices). v1 doesn't push back to the watch; the coach edits in-app. Re-evaluate when we add "send tomorrow's session to your watch". |
| Women's Health API | ❌ no | Out of v1 scope. Will revisit if the coach's roster includes athletes who explicitly want cycle-aware training. |
| Courses API | ❌ no | We don't push courses to devices in v1. |
| Health SDKs (mobile SDK) | ❌ no | Cloud-to-cloud Health API covers our needs and avoids on-device coupling. |

---

## 2. OAuth & user-permission scopes (Health API + Activity API)

Garmin's OAuth 2.0 (PKCE) flow returns an access token; the granular **summary types** the user actually grants are checked at runtime via `https://apis.garmin.com/wellness-api/rest/user/permissions`. The permissions a user toggles in Garmin Connect are what gates each summary type below. We surface this state in our app so the coach can see if an athlete revoked, e.g., HRV.

The exact scope-string list is finalised in the developer portal once credentials are issued; the table below is the **functional** list we will request.

---

## 3. Health API — summary types we'll consume

Two delivery modes coexist:

- **Backfill** (we actively pull historical windows on user signup): `dailies`, `sleeps`, `hrv`, plus activity types from the Activity API.
- **Push webhooks** (real-time as the user syncs): all summary types below land via push.

| Summary type | Delivery | FAHYBRIK feature | Justification |
|---|---|---|---|
| **`dailies`** | backfill + push | Today screen (athlete), Cohort view (coach), readiness model | Daily steps, calories, resting HR, average stress, intensity minutes. Baseline activity context the coach reads at a glance. |
| **`sleeps`** | backfill + push | Readiness model, recovery flag in coach dashboard | Sleep duration + stages (deep / light / REM / awake). Pablo uses sleep deficit as a hard signal to reduce intensity in `Realización` blocks. |
| **`epochs`** | push | (deferred — only ingested if we add intra-day fatigue tracking) | Per-15-minute activity buckets. Keep ingest path open but no UI in v1. |
| **`stressDetails`** | push | Recovery flag, overreaching detection | Time-series stress score. Combines with HRV + Body Battery to flag overreaching before injury. |
| **`bodyBattery` samples** *(delivered inside `dailies` and `stressDetails` payloads, not a standalone type)* | push | Today screen "energy ring", coach dashboard readiness column | Pablo's #1 readiness proxy: integrates HRV, sleep, stress over 24h. Drives auto-suggestions for session intensity. |
| **`pulseOx`** | push | Altitude-camp coaching (when the roster trains at altitude) | Athletes occasionally train at altitude (Sierra Nevada, etc.). Pulse Ox de-saturation flags acclimatisation. Optional ingest; no UI gate if revoked. |
| **`respiration`** / `allDayRespiration` | push | Recovery model input | Resting respiratory rate trend — sensitive early signal for systemic fatigue / illness. |
| **`bodyComps`** | push | Body composition trend chart in athlete profile | Weight + body fat % from Garmin Index scales. Many of Pablo's athletes use Index. |
| **`userMetrics`** | push | Athlete profile (VO2 max, fitness age, lactate threshold HR, max HR) | Provides Garmin-derived **VO2 max**, **lactate threshold HR**, **max HR**, **fitness age**. VO2 max is the central anchor for the race predictor and load model. |
| **`hrv`** *(HRV summaries — overnight window)* | backfill + push | Readiness model, HRV-Status trend chart | Overnight HRV (RMSSD) vs 60-day baseline = HRV Status. Direct ATR transition input: a sustained "low" HRV Status delays the transition into `Transformación`. |
| **`healthSnapshot`** | push | Athlete deep-dive — 2-min snapshot card | 2-minute multi-metric snapshot (HR, HRV, SpO₂, respiration, stress). Used as a quick "morning check-in" card if the athlete records one. |
| **`skinTemp`** | push | Recovery model input | Overnight skin temperature deviation from baseline — illness / cycle / overtraining indicator. |
| **`bloodPressures`** | ❌ not requested v1 | n/a | Sub-population only; no coaching feature relies on it. |
| **`moveiq`** | ❌ not requested v1 | n/a | Auto-detected casual activity; we infer this from `dailies` + Activity API. |
| **Enhanced Beat-to-Beat (R-R)** | ❌ not requested v1 | n/a | Requires separate commercial license. No clinical use case in v1. Re-evaluate if we add a research-grade HRV feature. |

**What about Training Load, Training Status, Training Readiness, Race Predictor?**

These are **derived/computed metrics** in the Garmin ecosystem. Their availability through the Health/Activity APIs is partial and device-dependent. The pragmatic plan:

- **VO2 max + lactate threshold HR + max HR** → arrive via `userMetrics` (confirmed). These let us **recompute Race Predictor server-side** using the same Firstbeat-derived formula Garmin publishes, with our own race-day calibration. Safer than depending on whether the metric ships in the JSON.
- **Training Load / Training Status / Training Readiness** → we do not assume Garmin will deliver these as first-class fields in the Health API JSON for every device. We **recompute** acute load (TSS-equivalent from HR + duration on each activity) and rolling 7-day load from the `activities` payload. If Garmin's payload happens to include the native fields, we store them alongside ours for cross-check.
- **HRV Status (good / balanced / low / unbalanced)** → derived from the `hrv` summary stream + a 60-day baseline we compute ourselves.

This means **we are not blocked** on Garmin shipping a particular derived field; we own the computation and use Garmin's raw signals as inputs.

---

## 4. Activity API — types we'll consume

| Type | Delivery | FAHYBRIK feature | Justification |
|---|---|---|---|
| **`activities`** | backfill + push | Workout list, history, ATR weekly load | Activity summary (duration, distance, average HR, calories, sport type). Roll-up driver. |
| **`activityDetails`** | backfill + push | Workout deep-dive, **HYROX lap-to-segment mapping** | Full payload including **laps** and per-sample **HR / cadence / pace / power** streams. Critical for HYROX: athlete presses lap between stations → laps map to template segments → per-station fatigue + HR-decay analytics. |
| **`activityFiles`** *(FIT)* | on-demand fetch (linked from `activityDetails`) | Source-of-truth raw data archive, downstream re-processing | Raw FIT file. Stored encrypted in EU blob storage. Lets us re-derive metrics later if we improve the analyser. |
| **`manualActivities`** | push | Coach can see manually-logged sessions | Athlete-entered activities (e.g. a HYROX simulation logged by hand). Prevents gaps in load accounting. |
| **`moveiq` activities** | ❌ not requested | n/a | Auto-detected; not a coaching signal. |

---

## 5. System webhooks (always required, not optional)

Garmin requires partners to honour two control-plane webhooks regardless of which data scopes they use. We implement both before any data ingestion goes live.

| Webhook | What it means | Our handler |
|---|---|---|
| **Deregistration** (`deregistration`) | The user disconnected our app from their Garmin account, or our backend invalidated their token, or they deleted their Garmin account. | Immediately destroy stored access + refresh tokens for that User Access Token. Schedule purge of Garmin-derived data within 30 days per §6 of the application brief. Notify the coach in-app that the athlete's Garmin link is gone. |
| **User Permission Change** (`userPermission`) | The user toggled which scopes they share with us in Garmin Connect (e.g. revoked `sleeps` while keeping `dailies`). | Update our local permissions cache. Hide affected metrics in the UI within one render cycle. Don't accept future pings for revoked types. |

---

## 6. Scope-to-feature traceability matrix (the "why" check)

If a row below has no feature, the scope shouldn't be requested. Every requested scope has at least one feature.

| Garmin signal | Feature(s) it powers | Without it, we can… |
|---|---|---|
| `dailies` (steps, RHR, calories, intensity minutes) | Today screen, weekly load, RHR-trend recovery flag | …show a degraded "no daily summary" state. Acceptable fallback. |
| `sleeps` | Readiness model, recovery card, ATR transition gate | …fall back to subjective readiness self-report. Loses fidelity. |
| `stressDetails` + Body Battery | Readiness model, energy ring, overreaching alert | …lose Pablo's #1 readiness proxy. Significant downgrade. |
| `hrv` (overnight) | HRV Status chart, ATR transition gate | …rely on RHR trend only — coarser. |
| `userMetrics` (VO2 max, LTHR, max HR) | Race predictor, HR-zone derivation, ATR `realización` taper | …require manual VO2 max + LTHR entry by the athlete. Friction. |
| `activities` | Workout history, weekly load, dedup with HealthKit | Hard requirement for the coaching loop. Cannot ship without. |
| `activityDetails` (laps + streams) | **HYROX segment analytics** — per-station fatigue, HR-decay | Hard requirement. The "elite-athlete value" of FAHYBRIK lives here. |
| `activityFiles` (FIT) | Raw archive, future re-analysis, export-to-coach | Strongly preferred. Without FIT, we lose forensic re-processing. |
| `bodyComps` | Body comp trend, mass-normalised power/load | Optional; falls back to manual weigh-in entry. |
| `respiration` / `allDayRespiration` | Recovery model input | Optional; degrades recovery model precision. |
| `pulseOx` | Altitude-camp acclimatisation flag | Optional; only used during altitude blocks. |
| `skinTemp` | Recovery model, illness early-warning | Optional; degrades recovery precision. |
| `healthSnapshot` | 2-minute morning check-in card | Optional; if athlete doesn't record one, card hidden. |
| `manualActivities` | Coach sees manually-logged HYROX simulations | Important — without it, simulations done on a non-Garmin watch are missed. |
| **Deregistration / userPermission webhooks** | GDPR + Garmin program compliance | Mandatory — non-negotiable. |

---

## 7. Non-goals (explicit "we are NOT requesting")

- Enhanced Beat-to-Beat (R-R) interval — requires commercial license, no v1 use case.
- Women's Health API — out of v1 scope.
- Training API — push-to-watch is Phase 2.
- Courses API — not part of FAHYBRIK.
- Connect IQ device-side SDK — we're cloud-to-cloud only.
- `bloodPressures`, `moveiq` — no feature depends on them.
- Real-time live HR streaming during workouts — out of API scope; if/when we add live coach view, we'll evaluate Connect IQ or Companion SDK separately.

---

## 8. References

- Garmin Connect Developer Program — Health API: <https://developer.garmin.com/gc-developer-program/health-api/>
- Garmin Connect Developer Program — Activity API: <https://developer.garmin.com/gc-developer-program/activity-api/>
- OAuth 2.0 PKCE specification (Garmin): <https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf>
- Program FAQ: <https://developer.garmin.com/gc-developer-program/program-faq/>
- HRV Summary type announcement (Garmin Developer Portal blog).
- Health Snapshot summary type announcement (Garmin Developer Portal blog).

---

**Owner:** Alex (sign-off pre-submission).
**Engineering owner:** TBD (folds into task #13 — Garmin OAuth scaffolding).
**Cross-link:** the partner-application brief at `docs/garmin_partner_application.md` references this file in its §13.
