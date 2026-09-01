import Foundation

// HOW the app and the PM5 share a counter for the current work window.
//
// Pure mechanism (HARD RULE Nº0): derived only from the tramo + segment scheme +
// phase. Coach method never enters. Free workouts and coach plans share this
// table — the builder only has to emit a real Prescription.
//
// See docs/plan-sincronia-contadores-dispositivo.md.

struct ErgCounterPolicy: Equatable {
    /// Whether covered m/cal for the athlete RESET when the work tramo changes.
    enum Scope: Equatable {
        /// Each work bout / station / EMOM erg round starts at 0.
        case perTramo
        /// One continuous window for the whole segment (AMRAP, free-order metcon).
        case cumulativeSegment
    }

    /// What to send the monitor when this work window opens.
    enum Program: Equatable {
        /// Fixed distance / calories / time of THIS bout's measure.
        case fixedPiece
        /// Free row with splits — app owns the clock (EMOM, open work).
        case justRow
        /// Do not program (rest, count-in, non-erg, already cumulative).
        case none
    }

    /// What advances the engine cursor when the window is done.
    enum Close: Equatable {
        /// Crossing the bout's m/cal goal advances (series, stations, steady).
        case machineGoal
        /// A work-phase countdown owns the close (timed intervals).
        case sessionClock
        /// Format clock owns the cursor (EMOM minute) — m/cal are informational.
        case formatClock
        /// Only the athlete (reps, open, no machine goal).
        case athleteTap
    }

    var scope: Scope
    var program: Program
    var close: Close

    var shouldProgramOnEnter: Bool { program != .none }
    var usesTramoWindow: Bool { scope == .perTramo }
    var advancesOnMachineGoal: Bool { close == .machineGoal }

    // MARK: - Resolve

    /// Phase of the live window. Count-in and rest never program a work piece.
    enum Phase: Equatable {
        case countIn
        case work
        case rest
    }

    /// The ONE table. Rest / count-in / non-erg → silent. Work → scope + program + close.
    static func resolve(tramo: LiveTramo,
                        segment: WorkoutSegment?,
                        phase: Phase) -> ErgCounterPolicy {
        // Outside work: never reprogram, never auto-close on machine.
        if phase != .work || !tramo.isErg {
            return ErgCounterPolicy(scope: .perTramo, program: .none, close: .athleteTap)
        }

        let scheme = segment?.formatScheme

        // Fixed-list stations (HYROX sim / chipper route): each station is a tramo.
        // Resolved before scheme switches so the station's own measure wins.
        if tramo.isFixedStation {
            return perBoutPolicy(tramo: tramo, allowMachineClose: true)
        }

        // AMRAP = one cumulative machine window for the whole segment.
        if scheme == .amrap {
            return ErgCounterPolicy(scope: .cumulativeSegment,
                                   program: .fixedPiece,
                                   close: .formatClock)
        }

        // Free-order fixed formats without a station cursor: the app cannot know
        // which movement is live → cumulative strip (no per-bout reset).
        if let scheme, scheme.presentation == .fixed, segment?.fixedListIsStations != true {
            switch scheme {
            case .forTime:
                // Single erg piece ("2000 m for time") is continuous; multi-movement
                // free-order without stations falls back to cumulative just-row.
                if tramo.cursor == .segment, tramo.measure != nil {
                    return continuousPolicy(tramo: tramo)
                }
                return ErgCounterPolicy(scope: .cumulativeSegment,
                                       program: .justRow,
                                       close: .athleteTap)
            case .rounds, .ladder, .chipper, .hyroxSim:
                return ErgCounterPolicy(scope: .cumulativeSegment,
                                       program: .justRow,
                                       close: .athleteTap)
            default:
                break
            }
        }

        // EMOM: each erg minute re-zeros the counter; the MINUTE closes the cursor.
        if scheme == .emom || tramo.cursor.isEmom {
            return ErgCounterPolicy(scope: .perTramo,
                                   program: programForMeasure(tramo.measure),
                                   close: .formatClock)
        }

        // Tabata / Death By: app clock owns rounds.
        if scheme == .tabata || scheme == .deathBy {
            return ErgCounterPolicy(scope: .perTramo,
                                   program: .justRow,
                                   close: .formatClock)
        }

        // Rotating intervals (series): app owns each bout — program THIS bout's
        // measure and auto-close when m/cal cross (athlete can still tap).
        if scheme == .intervals || tramo.cursor.isConditioningRound {
            return perBoutPolicy(tramo: tramo, allowMachineClose: true)
        }

        // Series / superserie: the open set is a tramo. Same per-bout law as
        // intervals so remo after squat reprograms and zeros.
        if scheme == .sets || scheme == .superset || tramo.cursor.isStrengthSet {
            return perBoutPolicy(tramo: tramo, allowMachineClose: true)
        }

        // Warmup / cooldown on a machine: one continuous window, 0 → objetivo.
        if scheme == .warmup || scheme == .cooldown {
            return continuousPolicy(tramo: tramo)
        }

        // Steady / continuous / plain erg segment.
        return continuousPolicy(tramo: tramo)
    }

    /// Convenience when the caller already knows resting / count-in from the session.
    static func resolve(tramo: LiveTramo,
                        segment: WorkoutSegment?,
                        isResting: Bool,
                        isCountIn: Bool) -> ErgCounterPolicy {
        let phase: Phase
        if isCountIn { phase = .countIn }
        else if isResting { phase = .rest }
        else { phase = .work }
        return resolve(tramo: tramo, segment: segment, phase: phase)
    }

    // MARK: - Internals

    private static func continuousPolicy(tramo: LiveTramo) -> ErgCounterPolicy {
        perBoutPolicy(tramo: tramo, allowMachineClose: true)
    }

    private static func perBoutPolicy(tramo: LiveTramo, allowMachineClose: Bool) -> ErgCounterPolicy {
        let program = programForMeasure(tramo.measure)
        let close: Close
        if !allowMachineClose {
            close = .athleteTap
        } else if tramo.targetDistanceMeters != nil || tramo.targetCalories != nil {
            close = .machineGoal
        } else if tramo.boxedSeconds != nil || tramo.targetDurationSeconds != nil {
            close = .sessionClock
        } else {
            close = .athleteTap
        }
        return ErgCounterPolicy(scope: .perTramo, program: program, close: close)
    }

    private static func programForMeasure(_ measure: Measure?) -> Program {
        guard let measure else { return .justRow }
        switch measure {
        case .distance(let m, _) where m > 0: return .fixedPiece
        case .calories(let c, _) where c > 0: return .fixedPiece
        case .duration(let s, _) where s > 0: return .fixedPiece
        default: return .justRow
        }
    }
}

// MARK: - Cursor helpers

private extension LiveTramo.Cursor {
    var isEmom: Bool {
        if case .emomInterval = self { return true }
        return false
    }
    var isConditioningRound: Bool {
        if case .conditioningRound = self { return true }
        return false
    }
    var isStrengthSet: Bool {
        if case .strengthSet = self { return true }
        return false
    }
}
