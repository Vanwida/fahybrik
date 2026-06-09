---
title: App Store screenshots — capture plan + commands
status: draft
last_updated: 2026-05-08
---

# FAHYBRIK — App Store screenshots plan

App Store Connect requires screenshots at **at least one** of the iPhone display sizes Apple currently accepts. To future-proof and reach the widest device matrix, FAHYBRIK ships at three sizes:

| Display size | Reference device | Resolution (px, portrait) | Required by Apple? |
|---|---|---|---|
| 6.7" | iPhone 15 Pro Max / 16 Pro Max / 17 Pro Max | 1290 × 2796 | Yes — primary slot |
| 6.1" | iPhone 16 / 17 / 17 Pro | 1179 × 2556 | Optional — recommended for tighter framing |
| 5.5" | iPhone 8 Plus | 1242 × 2208 | Optional — keeps legacy device users supported |

We ship **portrait** on all three. iPad screenshots are not required for v1 (we will not promote on iPad in the first release; if `TARGETED_DEVICE_FAMILY: "1,2"` stays, Apple requires iPad screenshots — flagged as a Project.yml decision below).

## The 5 screens to capture

Order matters: this is the order they will appear in the App Store listing.

| Order | Screen | Source view | Why it leads | Required app state |
|---|---|---|---|---|
| 1 | **Today** | `TodayView` | First impression. ATR block, daily session, briefing. The entire product thesis on one screen. | Logged-in athlete. Mid-Transformation block. Briefing populated. Workout slot showing. |
| 2 | **Active workout** | `WorkoutActiveView` | Proves execution-quality. Set-by-set guidance, target RPE, rest, tempo. | Mid-set state, set 3 of 5, timer ticking, RPE prompt visible. |
| 3 | **Pre-workout brief** | `WorkoutBriefView` (race-plan agent's screen) | Explains *why* this workout, not just what. Pablo's IP layer. | About-to-start state, block context + KPIs visible. |
| 4 | **Onboarding — 1RMs** | `OnboardingView` step 5 | Communicates "élite athletes" without text. Real numbers (squat 180 kg, bench 130 kg). | Onboarding mid-flow, step 5/N, three lifts entered. |
| 5 | **Performance / Stats** | `StatsView` (deep-dive agent's screen) | Closes with depth: HRV, sleep, weekly load, splits. | Athlete with ≥ 4 weeks of data. HRV trendline, polarization donut, last 4 HYROX splits. |

### Race-day variant (post-launch promotion)

Once event-day mode ships (#27 race-plan), capture an additional set with `--race-day-demo` showing the race-day view. Submit as updated screenshots before the next HYROX season.

## Demo seed state

The simulator must boot into a deterministic demo state for screenshots. Two launch arguments are wired (or to be wired) in the iOS app:

- `--reviewer-demo` — pre-seeds a demo athlete account, skips Sign in with Apple, lands on Today (used by App Review reviewer + screenshots 1, 2, 3, 5).
- `--race-day-demo` — same as above, but flips the date to race day -1 to surface the race-day variant of Today (used for the race-day screenshot set, not v1 launch).

Owner: **mobile-impl** must wire `--reviewer-demo` end-to-end (auth bypass + seed) before screenshots can be captured. Confirm before running the commands below.

## Capture commands — `xcrun simctl`

Run from the project root. Adjust simulator UUIDs to match what `xcrun simctl list devices` returns on the machine doing the capture.

### 0. One-time prep

```bash
# Create or reuse the three simulators we need
xcrun simctl list devices | grep -E "iPhone 17 Pro Max|iPhone 17 Pro|iPhone 8 Plus"

# If missing, create:
# xcrun simctl create "FAHYBRIK 6.7" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max com.apple.CoreSimulator.SimRuntime.iOS-26-0
# xcrun simctl create "FAHYBRIK 6.1" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-0
# xcrun simctl create "FAHYBRIK 5.5" com.apple.CoreSimulator.SimDeviceType.iPhone-8-Plus com.apple.CoreSimulator.SimRuntime.iOS-16-4
```

### 1. Build for simulator (Release config — App Store screenshots must reflect prod look)

```bash
xcodegen generate --project /Users/alexsolecarretero/Public/projects/FAHYBRIK/ios

xcodebuild \
  -project /Users/alexsolecarretero/Public/projects/FAHYBRIK/ios/FAHYBRIK.xcodeproj \
  -scheme FAHYBRIK \
  -configuration Release \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro Max" \
  build
```

### 2. Boot the simulator and install the build

```bash
SIM_UUID=$(xcrun simctl list devices | grep "iPhone 17 Pro Max" | head -1 | grep -oE '[A-F0-9-]{36}')
xcrun simctl boot "$SIM_UUID"
open -a Simulator
xcrun simctl install "$SIM_UUID" \
  ~/Library/Developer/Xcode/DerivedData/FAHYBRIK-*/Build/Products/Release-iphonesimulator/FAHYBRIK.app
```

### 3. Launch with demo flag

```bash
xcrun simctl launch "$SIM_UUID" pro.aistudios.vanwida.fahybrik --reviewer-demo
```

### 4. Capture each screen

Drive the app to each of the 5 states, then run:

```bash
mkdir -p /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7
xcrun simctl io "$SIM_UUID" screenshot /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7/01-today.png
# …navigate to Workout Active…
xcrun simctl io "$SIM_UUID" screenshot /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7/02-workout-active.png
# …pre-workout brief…
xcrun simctl io "$SIM_UUID" screenshot /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7/03-pre-workout-brief.png
# …onboarding step 5 (use --reviewer-demo with another flag, or restart fresh)…
xcrun simctl io "$SIM_UUID" screenshot /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7/04-onboarding-1rms.png
# …Stats / Performance…
xcrun simctl io "$SIM_UUID" screenshot /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7/05-stats.png
```

### 5. Repeat for the other two sizes

```bash
SIM_UUID_61=$(xcrun simctl list devices | grep -E "iPhone 17 Pro\s" | head -1 | grep -oE '[A-F0-9-]{36}')
SIM_UUID_55=$(xcrun simctl list devices | grep "iPhone 8 Plus" | head -1 | grep -oE '[A-F0-9-]{36}')

# Repeat steps 2-4 for each, writing into screenshots/6.1/ and screenshots/5.5/
```

### 6. Sanity-check the output dimensions

```bash
sips -g pixelWidth -g pixelHeight \
  /Users/alexsolecarretero/Public/projects/FAHYBRIK/docs/app-store/screenshots/6.7/01-today.png
# Expected: 1290 x 2796
```

If the dimensions are wrong (e.g. you accidentally captured at @2x instead of @3x), Apple will reject the upload. Re-shoot from a true 6.7" simulator.

## Asset upload checklist

When uploading via App Store Connect or Fastlane (`bundle exec fastlane screenshots`):

- [ ] Filenames are deterministic (`01-today.png`, `02-workout-active.png`, …) so Fastlane uploads in the right order.
- [ ] No status bar mockup overlay — Apple shows status bars natively.
- [ ] No frames / device chrome — Apple frames automatically, double framing looks amateur.
- [ ] No App Store policy-violating overlays (price, ratings, "best in class" claims). Captions inside the screenshot are fine if factual.
- [ ] Real-looking athlete data (Pablo's example athletes, not placeholder "John Doe"). Keep PII out — no real names from the production DB.

## Non-blocking follow-ups

- **iPad screenshots:** required by Apple while `TARGETED_DEVICE_FAMILY: "1,2"` is set. Decision: either drop iPad from the Family setting (release iPhone-only first), or capture iPad 13" + 12.9" sets. Recommend dropping iPad until UX is purposely tested at that size — flagged in `project.yml` notes.
- **Localized screenshots:** Spanish copy is the primary locale. We ship the same screenshots for `es-ES` and `en-US` because the in-screen UI is dynamic. Re-shoot if any visible label is hardcoded English.
- **Marketing strip:** App Store Connect supports an optional preview video (up to 30 s). Out of scope for first TestFlight build; consider after Pablo's first cohort uses it for real.
