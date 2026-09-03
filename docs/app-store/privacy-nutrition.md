---
title: Privacy inventory of the shipped iOS / watchOS binary
status: current-binary
last_updated: 2026-09-03
authoritative_source: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
---

# Current binary — what ships today

This file describes the **shipped iPhone, Watch, and widget binaries** as they exist in `ios/`. It is **not** the App Store Connect Nutrition Label questionnaire. That ASC form stays **out of scope / hidden**. Do not treat the sections below as App Privacy checkboxes to paste into App Store Connect.

Privacy manifests (`PrivacyInfo.xcprivacy`) declare tracking + required-reason API use only. They do **not** contain `NSPrivacyCollectedDataTypes`.

## Bundles

| Bundle | Path | PrivacyInfo.xcprivacy |
|---|---|---|
| iPhone app `com.fahybrid.app` | `ios/FAHYBRIK/` | Yes — tracking false, domains empty; UserDefaults `CA92.1`, SystemBootTime `35F9.1`, FileTimestamp `C617.1` |
| Watch app `com.fahybrid.app.watchkitapp` | `ios/FAHYBRIKWatch/` | Yes — tracking false, domains empty; UserDefaults `CA92.1` only |
| Widgets / Live Activity `com.fahybrid.app.widgets` | `ios/FAHYBRIKWidgets/` | **None** |

The Watch app is embedded in the iPhone app (`Embed Watch Content`). The widget extension is embedded (`Embed PlugIns`). There are no third-party SDK binaries in any of the three targets: `ios/project.yml` links only Apple frameworks (HealthKit, CoreLocation, CoreMotion, CoreBluetooth, WorkoutKit, ActivityKit, WidgetKit, AuthenticationServices, ARKit, RealityKit, AVFoundation, CryptoKit, WatchConnectivity). No SPM packages, no CocoaPods.

## Tracking

`NSPrivacyTracking` is `false` on both manifests. `NSPrivacyTrackingDomains` is empty. The app does not call `ATTrackingManager.requestTrackingAuthorization()` and does not read IDFA / `ASIdentifierManager`. `MetaAppID` in the iPhone Info.plist is empty (Instagram Stories button stays off).

## GPS / location

The binary **does** use location.

- iPhone: `CLLocationManager` in `RunLocationProvider` (`WorkoutLiveDataSources.swift`) for outdoor runs — distance, pace, route. `allowsBackgroundLocationUpdates` is on only while an outdoor run is active. Info.plist: `NSLocationWhenInUseUsageDescription`, `UIBackgroundModes` includes `location`.
- Watch: `CLLocationManager` in `WatchRunLocationGate.swift` so outdoor `distanceWalkingRunning` can arrive. Info.plist: `NSLocationWhenInUseUsageDescription`. Indoor plans do not turn location on (`WatchHKActivityPlan.wantsGPS`).

## Motion

The binary **does** use motion sensors.

- iPhone: `CoreMotion` — `CMAltimeter` (`RunAltimeter.swift`) and pedometer (`RunPedometer.swift`) on outdoor runs. Info.plist: `NSMotionUsageDescription`.
- Watch: `CoreMotion` in `SensorCapture.swift` for on-wrist sensor capture.

## Shipped attachments

Chat attachments **ship**: camera / gallery photos and videos (`ChatMediaPickers.swift`, `ChatCameraPicker`), voice notes (`VoiceRecorderEngine`), plus profile photo (`PhotosPicker` / camera) and workout-summary photo (`WorkoutCaptureView`). Info.plist strings: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`.

## Other Apple APIs on the binary (not third-party)

- HealthKit read/write (workouts, HR, and the usage strings on iPhone + Watch).
- CoreBluetooth (Concept2 PM5, belts / treadmills) + `bluetooth-central` background mode.
- Sign in with Apple, APNs (`remote-notification`), WorkoutKit, ActivityKit Live Activity / Dynamic Island, ARKit jump height.

## Required-reason APIs — declared vs used

Apple type `App Privacy Configuration` → `NSPrivacyAccessedAPITypes` / `NSPrivacyAccessedAPIType` / `NSPrivacyAccessedAPITypeReasons`. Categories and reason codes from [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

| Bundle | Category | Reason | Used in this bundle? |
|---|---|---|---|
| iPhone | `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | Yes — `UserDefaults.standard` / suite defaults in app + `FAHYBRIKCore` (session, plan cache, HealthKit anchors, PM5 pairing, onboarding, settings) |
| iPhone | `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | Yes — `ProcessInfo.processInfo.systemUptime` in `OutdoorRunHUDModel.swift`, `AudioCoach.swift` (elapsed time / timers). Not sent as boot time. |
| iPhone | `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | Yes — `FileManager.attributesOfItem` `[.size]` on files in the app container (`ChatService`, `ChatMediaPickers`, `VoiceRecorderView`) |
| Watch | `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | Yes — `WatchPlanModel`, `WatchConnectivityService`, plus `FAHYBRIKCore/Sensor/SensorTypes.swift` compiled into the watch |
| Watch | SystemBootTime / FileTimestamp / DiskSpace / ActiveKeyboards | — | Not used; not declared |
| Widgets | (no manifest) | — | No `UserDefaults`, no `systemUptime`, no `FileManager` in `FAHYBRIKWidgets/` or the shared `RunActivityAttributes.swift` |

Not declared because not used in any shipped bundle: `NSPrivacyAccessedAPICategoryDiskSpace`, `NSPrivacyAccessedAPICategoryActiveKeyboards`.

## What this file is not

- Not the App Store Connect Nutrition Label (hidden / out of scope).
- Not a collected-data-types list for `PrivacyInfo.xcprivacy`.
- Not an entitlement or `Devices/*` change.
