---
title: Privacy nutrition label — App Privacy declarations
status: draft
last_updated: 2026-05-08
authoritative_source: https://developer.apple.com/app-store/app-privacy-details/
---

# FAHYBRIK — App Privacy nutrition label

Set in App Store Connect → My Apps → FAHYBRIK → App Privacy → Get Started / Edit.

This document is the source of truth for the answers Alex enters in the App Privacy questionnaire. Re-check it any time we add a new SDK, analytics provider, or third-party integration.

## Top-level disclosure summary

> **FAHYBRIK collects data linked to you.** We collect health, identity, contact, and usage data linked to your account in order to deliver coaching. We collect anonymous diagnostics not linked to you for crash debugging. We do not use any data for tracking across apps owned by other companies.

## Section 1 — Does your app collect data?

**Yes.** (FAHYBRIK is a training app — almost everything it does requires storing data.)

## Section 2 — Data types collected

For each data type, declare:
- **Linked to user** (yes/no) — yes means stored against the athlete account
- **Used for tracking** (yes/no) — always **No** for FAHYBRIK
- **Purposes**

### 2.1 Health & Fitness — *Linked to user*, *Not used for tracking*

| Field | What we collect | Source | Purposes |
|---|---|---|---|
| Health | HRV (RMSSD), resting HR, HR during workouts, sleep stages, weight, body fat %, VO2max if available | HealthKit (read), Garmin Connect (read), manual entry | App functionality, Analytics |
| Fitness | Workouts (type, duration, distance, splits, sets, reps, RPE, load), HR zones | HealthKit (read+write), Garmin Connect (read), Concept2 PM5 (BLE), manual entry | App functionality, Analytics |

Apple checkboxes:
- [x] Health
- [x] Fitness
- Linked to user: **Yes**
- Used to track you: **No**
- Purposes: **App Functionality**, **Analytics**

### 2.2 Identifiers — *Linked to user*, *Not used for tracking*

| Field | What we collect | Source | Purposes |
|---|---|---|---|
| User ID | Internal `athlete_id` (UUID) | Generated server-side at sign-up | App functionality, Analytics |
| Apple Sign In identifier | The Sign in with Apple `sub` (private relay) | Apple | App functionality (auth) |

Apple checkboxes:
- [x] User ID
- Linked to user: **Yes**
- Used to track you: **No**
- Purposes: **App Functionality**, **Analytics**

We do **not** collect: Device ID (IDFA), advertising ID. We do not call `ASIdentifierManager`.

### 2.3 Contact Info — *Linked to user*, *Not used for tracking*

| Field | What we collect | Source | Purposes |
|---|---|---|---|
| Email address | Athlete's email (relay or real) | Sign in with Apple, manual onboarding | App functionality, Customer support |
| Name | First name, last name | Sign in with Apple, onboarding | App functionality |

Apple checkboxes:
- [x] Email Address
- [x] Name
- Linked to user: **Yes**
- Used to track you: **No**
- Purposes: **App Functionality**, **Customer Support**

### 2.4 Usage Data — *Linked to user*, *Not used for tracking*

| Field | What we collect | Source | Purposes |
|---|---|---|---|
| Product interaction | Screens viewed, sessions started/completed/skipped, check-ins submitted, RPE values, chat messages sent (count, not content beyond what's needed for delivery) | App telemetry | App functionality, Analytics |

Apple checkboxes:
- [x] Product Interaction
- Linked to user: **Yes**
- Used to track you: **No**
- Purposes: **App Functionality**, **Analytics**

### 2.5 Diagnostics — *Not linked to user*, *Not used for tracking*

| Field | What we collect | Source | Purposes |
|---|---|---|---|
| Crash data | Crash logs, stack traces | iOS crash reporter | App functionality |
| Performance data | Cold-start time, render hangs, network failures (anonymous, no athlete_id) | App telemetry | App functionality |

Apple checkboxes:
- [x] Crash Data
- [x] Performance Data
- Linked to user: **No**
- Used to track you: **No**
- Purposes: **App Functionality**

## Section 3 — Data NOT collected

Explicitly **not** collected (for clarity if Apple ever asks):

- Financial info (payments handled by Stripe — see follow-up #40 — Stripe receives card data directly; FAHYBRIK never sees PAN/CVV)
- Location — neither precise nor coarse. We do **not** request `CLLocationManager`.
- Sensitive Info (race, religion, politics, sexual orientation, etc.)
- Contacts (no address book access)
- User content beyond chat and the workout log: no audio recordings, photos, or videos *unless* the athlete attaches them in chat (treated as User Content, see 3.1)
- Browsing history
- Search history
- Purchases (only Stripe sees this, scope per Apple's "data collected by third party" rule)

### 3.1 Conditional: User Content (chat attachments)

When `#32 chat` ships with photo/video attachments, we will need to add:

| Field | When | Linked | Tracking | Purposes |
|---|---|---|---|---|
| Photos or Videos | Only if athlete attaches them to a chat message | Yes | No | App functionality (delivery to coach) |
| Other User Content (chat text) | Always (when chat is used) | Yes | No | App functionality |

Update this file and the App Privacy declaration when chat attachments ship in production (currently scaffolded by #32 — confirm with backend-comms agent).

## Section 4 — Tracking declaration

**No.** FAHYBRIK does not track users across apps and websites owned by other companies.

- We do not call `ATTrackingManager.requestTrackingAuthorization()`.
- We do not embed any SDK that tracks (no Facebook SDK, no advertising network SDK, no Adjust/AppsFlyer, no Mixpanel/Amplitude in identified mode — analytics is server-side and first-party).

## Section 5 — Third-party SDK declarations

Re-audit every release. As of 2026-05-08:

| SDK / service | Data sent | Linked to user there | Privacy URL |
|---|---|---|---|
| Apple (Sign in with Apple, HealthKit, APNs, StoreKit) | Apple's standard SDK behavior | Per Apple ToS | https://www.apple.com/legal/privacy/ |
| Garmin Connect (server-to-server OAuth) | HR, sleep, workouts (read-only) | Yes — via athlete OAuth grant | https://www.garmin.com/en-US/privacy/ |
| Concept2 PM5 (BLE direct on device) | None — peer-to-peer Bluetooth, no server contact | n/a | n/a |
| Stripe (when #40 ships) | Card data — direct from athlete to Stripe, FAHYBRIK only receives `customer_id` + subscription status | Yes (in Stripe) | https://stripe.com/privacy |
| Resend (magic link, transactional emails) | Email address, message content | Yes (in Resend) | https://resend.com/legal/privacy-policy |
| Vercel (hosting, no analytics SDK in app) | n/a from app perspective | n/a | https://vercel.com/legal/privacy-policy |
| Neon Postgres (database, no client SDK) | n/a from app perspective | n/a | https://neon.tech/privacy-policy |

If a new SDK is added, this table and Section 2 of the App Privacy questionnaire **must** be updated **before** the build is submitted.

## Section 6 — Data retention & deletion (for the privacy policy URL itself)

- Retention: as long as the athlete account is active. Workouts and biometric streams retained for the life of the account so longitudinal analysis works (multi-year training cycles).
- Deletion: athletes can request account deletion via the in-app Settings → Delete Account (must ship before App Store submission — Apple Guideline 5.1.1(v)). Deletion removes PII, workouts, chat. Anonymous aggregates may persist for product analytics.
- This is documented in detail at https://fahybrid.com/privacy (owned by #37 privacy-tos).

## Verification checklist before App Store submission

- [ ] Account deletion flow exists in the iOS app (Apple Guideline 5.1.1(v))
- [ ] Privacy policy URL is live at https://fahybrid.com/privacy
- [ ] Each SDK in section 5 is still in the app (no stale entries, no missing entries)
- [ ] Info.plist usage strings match what's declared here (HealthKit, Bluetooth, Camera, Microphone, Photo Library)
- [ ] App Tracking Transparency: confirm `ATTrackingManager` is NOT linked / NOT called (run `nm` on the .ipa — should not see `ASIdentifierManager`)
