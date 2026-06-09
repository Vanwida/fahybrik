---
title: App Store age rating questionnaire answers
status: locked
last_updated: 2026-05-08
---

# FAHYBRIK — Age rating

Final rating: **4+** (no objectionable content, suitable for all ages).

## App Store Connect age-rating questionnaire — answers

Set in App Store Connect → My Apps → FAHYBRIK → App Information → Age Rating → Edit.

Answer **None** to every category below unless noted otherwise.

| Apple category | Answer | Why |
|---|---|---|
| Cartoon or fantasy violence | None | n/a |
| Realistic violence | None | n/a |
| Sexual content or nudity | None | n/a |
| Profanity or crude humor | None | UI copy is professional Castilian Spanish + English. |
| Mature/suggestive themes | None | n/a |
| Horror/fear themes | None | n/a |
| Medical/treatment info | None | We do not give medical advice. We log workouts and recovery indicators. |
| Alcohol, tobacco, or drug use or references | None | n/a |
| Simulated gambling | None | n/a |
| Contests | None | We surface external HYROX/CrossFit competitions but do not run contests. |
| Unrestricted web access | No | The app does not embed an open web browser. Only first-party screens + first-party `https://fahybrik.com/...` links. |
| Gambling and contests | No | n/a |

## Additional flags

- **Made for Kids:** No
- **Tracks user across apps and websites owned by other companies (App Tracking Transparency):** No — we do not call `requestTrackingAuthorization()`. No IDFA is read. (See `privacy-nutrition.md`.)
- **Encryption export compliance:** Standard HTTPS only — answer "No" to "Does your app use non-exempt encryption?" in the Export Compliance section. No custom crypto.

## Notes

- Once the rating is locked the questionnaire only re-opens if Apple flags inconsistency with new content. Re-check this file before any release that adds: in-app web views, social/UGC, content recommendations, contests, or location-aware features.
