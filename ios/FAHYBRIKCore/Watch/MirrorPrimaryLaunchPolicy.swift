import Foundation
import HealthKit

// FH-96 — one workout intent → one PRIMARY. Pure policy for phone `begin` idempotency
// and watch `startPrimary` / `queueOrBegin` (testable without a watchOS test target).

enum MirrorPrimaryLaunchPolicy {

    /// TRUE when a live PRIMARY already matches the incoming launch — redundant
    /// `startWatchApp` / `handle(_:)` must be ignored, never finish the live session.
    static func shouldIgnoreRedundantStart(
        isRecording: Bool,
        current: HKWorkoutConfiguration?,
        incoming: HKWorkoutConfiguration
    ) -> Bool {
        guard isRecording, let current else { return false }
        return configurationsCompatible(current, incoming)
    }

    /// TRUE only for a true leftover/orphan — different activity than the live PRIMARY.
    static func shouldFinishBeforeRestart(
        isRecording: Bool,
        current: HKWorkoutConfiguration?,
        incoming: HKWorkoutConfiguration
    ) -> Bool {
        guard isRecording else { return false }
        return !shouldIgnoreRedundantStart(
            isRecording: true,
            current: current,
            incoming: incoming
        )
    }

    static func configurationsCompatible(
        _ current: HKWorkoutConfiguration,
        _ incoming: HKWorkoutConfiguration
    ) -> Bool {
        current.activityType == incoming.activityType
            && current.locationType == incoming.locationType
    }
}
