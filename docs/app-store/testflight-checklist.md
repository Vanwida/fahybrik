---
title: TestFlight + App Store submission checklist
status: open
last_updated: 2026-05-08
owner: Alex
---

# FAHYBRIK — TestFlight checklist

This is the end-to-end runbook from "no Apple Developer account" to "first build live in TestFlight". Each block calls out who's blocked: 🔒 Alex (needs Apple Developer credentials, can't be agent-completed) vs 🤖 agent-doable.

## 0. Prerequisites — 🔒 Alex only

- [ ] Apple ID registered at https://appleid.apple.com (use `vanwida@aistudios.pro`, NOT `alexsole@gmail.com`).
- [ ] Two-factor authentication enabled on the Apple ID. Required for App Store Connect since 2019.
- [ ] Enrolled in the Apple Developer Program ($99/year). Use **Vanwida** as the legal entity if it's an LLC; otherwise individual.
   - URL: https://developer.apple.com/programs/enroll/
   - Approval window: 24-48 h, occasionally up to 1 week.
   - Verify under https://developer.apple.com → Membership the Team ID is visible.
- [ ] App-specific password generated for Fastlane: https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. Label it "Fastlane FAHYBRIK".
- [ ] App-specific password stored at `~/.openclaw/credentials/vanwida-tokens.env` under key `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD=`.

## 1. App ID + capabilities — 🔒 Alex (developer.apple.com)

- [ ] **Identifiers → App IDs → New** with explicit Bundle ID `com.fahybrid.app`.
- [ ] Description: `FAHYBRIK Production`.
- [ ] Capabilities to enable on the App ID:
   - [ ] **HealthKit** (read + write — strict allowed; see Health usage strings)
   - [ ] **Sign in with Apple**
   - [ ] **Push Notifications** (for #33 once APNs is wired)
   - [ ] **Associated Domains** (for #37 universal-link privacy/legal pages)
   - [ ] (Optional) **In-App Purchase** — only if Stripe is replaced by StoreKit. Currently NOT planned: subscriptions go through Stripe (#40), Apple's IAP rules require IAP for digital subscriptions, so this is a **decision flag** for Alex before submission.
   - **Bluetooth Always**: not a separate capability — Info.plist string is enough (already set in `project.yml`).

⚠ Apple Guideline 3.1.1 forces digital subscriptions to use Apple IAP unless they qualify as "physical goods" or "person-to-person services". Pablo's coaching may qualify under 3.1.3(d) "person-to-person experiences" — Alex must confirm with App Review before assuming Stripe is allowed in-app. Worst case: Stripe stays on the marketing site only, in-app purchases route through StoreKit.

## 2. Distribution certificates — 🔒 Alex (developer.apple.com or Xcode Automatic)

Two paths:

**Path A — Automatic signing (recommended for solo dev):**
- [ ] In Xcode → Project → Signing & Capabilities, set Team to the Vanwida team. Xcode generates Distribution + Development certs and provisioning profiles automatically.
- [ ] Update `ios/project.yml` `DEVELOPMENT_TEAM: TBD` → real 10-char ID, regenerate xcodeproj (`xcodegen generate`), commit.

**Path B — Manual signing with Fastlane Match (only if a CI pipeline lands later):**
- [ ] Create a private Vanwida org repo `vanwida/fahybrik-certificates` (gitignored from this repo).
- [ ] `bundle exec fastlane match init`, then `bundle exec fastlane match appstore`.
- [ ] Set `CODE_SIGN_STYLE: Manual` and `PROVISIONING_PROFILE_SPECIFIER: match AppStore com.fahybrid.app` in `project.yml`.

We default to Path A — Path B only if multiple machines / CI later need to sign.

## 3. App Store Connect record — 🔒 Alex

- [ ] https://appstoreconnect.apple.com → My Apps → + → New App.
   - Platforms: iOS
   - Name: FAHYBRIK
   - Primary Language: Spanish (Spain)
   - Bundle ID: com.fahybrid.app
   - SKU: `fahybrik-ios-001`
   - User Access: Full Access
- [ ] Add `en-US` as additional language.
- [ ] Paste metadata from `/docs/app-store/metadata-es.md` + `/docs/app-store/metadata-en.md`.
- [ ] Set Category (Health & Fitness → Sports) per `/docs/app-store/categories.md`.
- [ ] Complete the Age Rating questionnaire per `/docs/app-store/age-rating.md` → expect **4+**.
- [ ] Complete the App Privacy form per `/docs/app-store/privacy-nutrition.md`. Apple won't accept a build until App Privacy is filled.

## 4. First build upload — 🤖 agent-doable once signing is set

- [ ] Bump build number (Fastlane lane handles this automatically).
- [ ] Run `cd ios && bundle install` (one-time).
- [ ] Run `cd ios && bundle exec fastlane beta` to archive + upload.
   - Alternative: open `FAHYBRIK.xcodeproj` in Xcode → Product → Archive → Distribute App → App Store Connect → Upload.
- [ ] Wait for Apple's processing (usually 5–20 min, occasionally hours). Watch under TestFlight → Builds.
- [ ] If "Missing Compliance" badge: answer the Export Compliance question (No non-exempt encryption — answer NO; standard HTTPS only).

## 5. Internal testing — 🤖 agent-doable

- [ ] In App Store Connect → TestFlight → Internal Testing, create a group `Fabrik internals`.
- [ ] Add internal testers (max 100). At minimum:
   - vanwida@aistudios.pro (Alex)
   - pablo@fabrik.training (Pablo — once confirmed)
- [ ] Attach the new build to the group. Internal testers receive a TestFlight invite within minutes — no Apple review required for internal.

## 6. External testing — 🔒 Alex (review submission)

For testing with Pablo's actual athletes (not internal team):

- [ ] In TestFlight → External Testing, create a group `Fabrik élite cohort`.
- [ ] Provide:
   - **Beta App Description** (≤ 4000 chars): copy from metadata-es.md description.
   - **Feedback Email**: `pablo@fabrik.training` or `vanwida@aistudios.pro`.
   - **Test Information**: link to `https://fahybrik.com/testflight-info` or paste the reviewer notes from metadata-es.md.
   - **Demo Account** (REQUIRED for external testing review): `appstore-demo@fahybrik.com` + magic link. Whitelist this email in Resend so the reviewer can receive it.
- [ ] Submit the build for **Beta App Review** (Apple does an abbreviated review for external TestFlight, faster than full App Store review — typically 24 h).
- [ ] On approval, send public TestFlight link to the cohort.

## 7. App Store full submission (post-TestFlight) — 🔒 Alex

Out of scope for v1. When ready:

- [ ] In App Store Connect → App Store → iOS App → 1.0 Prepare for Submission.
- [ ] Fill all required fields (most already covered above) including Pricing.
- [ ] Upload screenshots from `/docs/app-store/screenshots/` (or run `bundle exec fastlane screenshots` then upload manually).
- [ ] Submit for review. Apple's full-review SLA: typically 24-48 h.

## 8. Hard rules & risk flags

- 🚨 **Never commit Apple cert content to this repo.** `.p12`, `.cer`, `.mobileprovision`, App Store Connect API keys are all in `.gitignore` — verify before any push. The Fastfile/Appfile here only references env vars; the actual credentials live at `~/.openclaw/credentials/vanwida-tokens.env`.
- 🚨 **Never test-upload to Apple from CI without an explicit dry-run flag.** A bad metadata push counts as a submission attempt.
- 🚨 **Account-deletion screen is mandatory** before App Review (Guideline 5.1.1(v)). Currently NOT shipped — needs a follow-up task before submission. (Not a TestFlight blocker, but a full submission blocker.)
- 🚨 **Bluetooth + Camera + Photos + Microphone usage strings** must match the actual functionality the user can trigger. Apple rejects apps where the string promises a feature the build doesn't include. Current strings reference chat attachments + Concept2 — verify those features exist in the submitted build (chat #32 is shipped; PM5 BLE #36 is in_progress).
- 🚨 **Stripe vs StoreKit decision** (see section 1) — must be settled before App Store submission. TestFlight tolerates Stripe; full review may not.

## 9. Open follow-ups for Alex

- [ ] Pick the legal entity for App Store Connect (Vanwida LLC vs individual).
- [ ] Confirm Pablo's real email (`pablo@fabrik.training` placeholder).
- [ ] Decide IAP route (Stripe-only marketing site vs StoreKit in-app).
- [ ] Verify `fahybrik.com` Resend domain (privacy/support/marketing URLs all live there).
- [ ] Schedule the first internal TestFlight build and the first external review submission against Pablo's first cohort start date.
