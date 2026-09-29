import Foundation

// FH-91 — pre-live gate policy (Core). Device inventory + step order live in
// `PreWorkoutDeviceEligibility` (phone). Here: the recipe, the athlete's answers
// and the copy of the run cards. The watch is NOT asked about (it launches by
// itself when the workout starts): no answer, no gate, no footer hint for it.

/// What this session's recipe requires before live.
struct SessionStartRecipe: Equatable, Sendable {
    let needsRunLocation: Bool
    let ergRoles: [String]
    let needsUnscopedErg: Bool
    let isBenchmark: Bool
}

/// Athlete choices the gate collects (device link state is read live from stores).
struct SessionStartAnswers: Equatable, Sendable {
    var runEnvironment: RunEnvironment?
    var skippedErgRoleWires: Set<String>
    var skippedUnscopedErg: Bool

    static var empty: SessionStartAnswers {
        SessionStartAnswers(
            runEnvironment: nil,
            skippedErgRoleWires: [],
            skippedUnscopedErg: false
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
}
