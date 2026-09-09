import Foundation

// FH-91 — pre-live gate policy (Core). Device inventory + step order live in
// `PreWorkoutDeviceEligibility` (phone). Here: copy + watch honesty only.

/// What this session's recipe requires before live.
struct SessionStartRecipe: Equatable, Sendable {
    let needsRunLocation: Bool
    let ergRoles: [String]
    let needsUnscopedErg: Bool
    let asksWatch: Bool
    let isBenchmark: Bool
}

/// Athlete choices the gate collects (device link state is read live from stores).
struct SessionStartAnswers: Equatable, Sendable {
    var runEnvironment: RunEnvironment?
    var skippedErgRoleWires: Set<String>
    var skippedUnscopedErg: Bool
    var watchProceedWithoutWrist: Bool
    var watchUnavailable: Bool

    static var empty: SessionStartAnswers {
        SessionStartAnswers(
            runEnvironment: nil,
            skippedErgRoleWires: [],
            skippedUnscopedErg: false,
            watchProceedWithoutWrist: false,
            watchUnavailable: false
        )
    }
}

enum SessionStartPolicy {

    /// Subtitle for run cards — names who signs meters (RunDistanceAuthority / HK).
    static func meterAuthoritySubtitle(for environment: RunEnvironment) -> String {
        switch environment {
        case .outdoor:
            return "Apple Watch firma distancia y pulso"
        case .treadmill:
            return "La cinta firma distancia y ritmo"
        case .indoor:
            return "Apple Watch firma distancia (indoor)"
        }
    }

    /// `wristMirrorLive` — recent wrist signal on a bound HK mirror (`PhoneLiveSession`).
    static func watchResolved(answers: SessionStartAnswers, wristMirrorLive: Bool) -> Bool {
        wristMirrorLive || answers.watchUnavailable || answers.watchProceedWithoutWrist
    }

    /// Pre-live footer — informational only; ▶ EMPEZAR is never disabled for watch.
    static func empezarFooterHint(asksWatch: Bool, watchResolved: Bool, canReleaseLive: Bool) -> String {
        if asksWatch && !watchResolved {
            return "El reloj puede unirse en directo — o pulsa «Continuar sin reloj»"
        }
        return "Empieza cuando estés listo — el reloj puede unirse en directo"
    }
}
