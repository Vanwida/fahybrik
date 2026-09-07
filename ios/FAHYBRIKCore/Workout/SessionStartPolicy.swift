import Foundation

// FH-91 — ONE pre-live gate. Pure policy: given what the recipe needs and what the
// athlete already answered, can we release the live engine + wrist mirror?
//
// UI lives in `SessionStartGate` (phone). Device inventory is built upstream via
// `PreWorkoutDeviceEligibility`; this type only decides completeness.

/// What this session's recipe requires before live — built once from segments.
struct SessionStartRecipe: Equatable, Sendable {
    /// Run location (calle / cinta / cinta tonta) must be chosen.
    let needsRunLocation: Bool
    /// Distinct erg roles that each need their own PM5 slot (row → ski → bike).
    let ergRoles: [String]
    /// Legacy untagged erg — one unscoped `any` slot.
    let needsUnscopedErg: Bool
    /// Wrist join step (cardio / devices sessions; pure strength skips).
    let asksWatch: Bool
    /// Benchmark: no manual escape on erg monitors.
    let isBenchmark: Bool

    static func from(segments: [WorkoutSegment], calentamientoRun: Bool) -> SessionStartRecipe {
        let needsRun = segments.contains { $0.kind == .running } || calentamientoRun
        var roles = Set<String>()
        var needsUnscoped = false
        for seg in segments {
            if let k = seg.ergKind { roles.insert(k) }
            for wire in seg.ergMachines { roles.insert(wire) }
            if let sets = seg.prescription?.sets {
                for set in sets {
                    if let m = set.modality {
                        switch m {
                        case .row: roles.insert("row")
                        case .ski: roles.insert("ski")
                        case .bike: roles.insert("bike")
                        default: break
                        }
                    }
                }
            }
            if let m = seg.prescription?.modality {
                switch m {
                case .row: roles.insert("row")
                case .ski: roles.insert("ski")
                case .bike: roles.insert("bike")
                default: break
                }
            }
            if seg.involvesErg && roles.isEmpty && seg.ergKind == nil && seg.ergMachines.isEmpty {
                needsUnscoped = true
            }
        }
        let ordered = ["row", "ski", "bike"].filter { roles.contains($0) }
        if !ordered.isEmpty { needsUnscoped = false }
        return SessionStartRecipe(
            needsRunLocation: needsRun,
            ergRoles: ordered,
            needsUnscopedErg: needsUnscoped,
            asksWatch: needsRun || !ordered.isEmpty || needsUnscoped,
            isBenchmark: false
        )
    }
}

/// Athlete answers collected in the start gate (devices + watch honesty).
struct SessionStartAnswers: Equatable, Sendable {
    var runEnvironment: RunEnvironment?
    var connectedErgRoles: Set<String>
    var unscopedErgConnected: Bool
    var skippedErgRoles: Set<String>
    var skippedUnscopedErg: Bool
    /// Wrist mirror is live (`PhoneMirrorService.wristJoined`).
    var wristJoined: Bool
    /// Athlete saw watch status and accepts starting without a joined wrist.
    var watchProceedWithoutWrist: Bool
    /// No paired watch app — nothing to wait for.
    var watchUnavailable: Bool

    static var empty: SessionStartAnswers {
        SessionStartAnswers(
            runEnvironment: nil,
            connectedErgRoles: [],
            unscopedErgConnected: false,
            skippedErgRoles: [],
            skippedUnscopedErg: false,
            wristJoined: false,
            watchProceedWithoutWrist: false,
            watchUnavailable: false
        )
    }
}

enum SessionStartStep: Equatable, Sendable {
    case runLocation
    case erg(roleWire: String?)
    case watch
}

enum SessionStartPolicy {

    /// Subtitle for run location cards — names who signs meters (not vague "el reloj cuenta afuera").
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

    static func missingErgRoles(
        recipe: SessionStartRecipe,
        answers: SessionStartAnswers
    ) -> [String] {
        recipe.ergRoles.filter { wire in
            if answers.skippedErgRoles.contains(wire) { return false }
            if answers.connectedErgRoles.contains(wire) { return false }
            if recipe.ergRoles.count <= 1 && answers.unscopedErgConnected { return false }
            return true
        }
    }

    static func needsUnscopedErgConnect(
        recipe: SessionStartRecipe,
        answers: SessionStartAnswers
    ) -> Bool {
        guard recipe.ergRoles.isEmpty, recipe.needsUnscopedErg else { return false }
        if answers.unscopedErgConnected || answers.skippedUnscopedErg { return false }
        return true
    }

    /// The next incomplete step, or nil when only watch acknowledgement may remain.
    static func nextIncompleteStep(
        recipe: SessionStartRecipe,
        answers: SessionStartAnswers
    ) -> SessionStartStep? {
        if recipe.needsRunLocation, answers.runEnvironment == nil {
            return .runLocation
        }
        if let role = missingErgRoles(recipe: recipe, answers: answers).first {
            return .erg(roleWire: role)
        }
        if needsUnscopedErgConnect(recipe: recipe, answers: answers) {
            return .erg(roleWire: nil)
        }
        if recipe.asksWatch, !watchResolved(recipe: recipe, answers: answers) {
            return .watch
        }
        return nil
    }

    /// True when run + devices are satisfied AND watch is joined or honestly accepted.
    static func canReleaseLive(
        recipe: SessionStartRecipe,
        answers: SessionStartAnswers
    ) -> Bool {
        nextIncompleteStep(recipe: recipe, answers: answers) == nil
    }

    static func watchResolved(recipe: SessionStartRecipe, answers: SessionStartAnswers) -> Bool {
        if answers.wristJoined { return true }
        if answers.watchUnavailable { return true }
        return answers.watchProceedWithoutWrist
    }

    /// Erg escape allowed for this recipe (benchmark never).
    static func allowsErgSkip(recipe: SessionStartRecipe) -> Bool {
        !recipe.isBenchmark
    }
}
