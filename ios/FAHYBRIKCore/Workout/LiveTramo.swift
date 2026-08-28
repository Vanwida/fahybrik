import Foundation

// THE TRAMO — the active work window of a live session.
//
// A live workout is a list of segments, but a segment is NOT what the athlete is
// doing at any given instant. Under a format the real unit is smaller: the EMOM
// round, the interval bout, the run leg. Everything that has to react to "what am
// I doing RIGHT NOW" — which device measures it, what the progress bar divides
// by, when the clock starts, when the monitor's counter is re-zeroed — has to key
// off THAT window, not off the segment.
//
// Before this type existed, those decisions read `WorkoutSegment.kind`, so:
//   · a ski round inside an EMOM was invisible to the PM5 layer (the segment's
//     kind collapses to strength/reps when the format mixes movements), which is
//     why the monitor could neither be connected nor read on 28-jul;
//   · the meters bar of serie 2 of a 5×500 kept counting from serie 1 (1000/500),
//     because the window was anchored at segment entry;
//   · the monitor was programmed once per segment, so its counter never went back
//     to zero when the same erg came round again.
//
// `LiveTramo` is the ONE resolved answer, built from whichever engine owns the
// cursor. It is a value type derived on demand — no second source of state.
struct LiveTramo: Equatable {

    /// Which engine's cursor produced this tramo. Also its identity: when the
    /// cursor moves, the tramo changed and its windows re-anchor.
    enum Cursor: Equatable {
        /// No format inside the segment — the segment IS the tramo.
        case segment
        case emomInterval(Int)
        case conditioningRound(Int)
        case runLeg(Int)
        /// A STATION of a fixed checklist the athlete walks once (a For Time / HYROX
        /// sim authored as a route, a chipper). Unlike the rotating cursors this one
        /// is not driven by a clock — it is the strike cursor `fixedRoundsDone`,
        /// which is the only honest thing the app knows about where he is.
        case fixedStation(Int)
        /// The OPEN set of a setTable format (series / superserie). The series
        /// index IS the tramo: remo after squat must re-zero the monitor, and
        /// the watch must say the same series as the phone.
        case strengthSet(Int)
    }

    let segmentIndex: Int
    let cursor: Cursor
    /// What the athlete is doing, in their words ("Remo", "Burpees", "SkiErg").
    let label: String
    /// The discipline of THIS window — the thing that decides which device can
    /// measure it. Resolved from the tramo's own prescription set when the format
    /// declares one, else from the segment.
    let modality: PrescriptionModality
    /// How the work of this window is measured, when it is prescribed at all.
    let measure: Measure?
    /// Seconds this window is boxed to, when the format boxes it (an EMOM minute,
    /// a Tabata work phase). nil = the window ends on work done, not on a clock.
    let boxedSeconds: Int?

    /// Stable identity across ticks. Changing it IS "the athlete entered a new
    /// tramo": the device window re-anchors and the tramo clock restarts.
    var key: String {
        switch cursor {
        case .segment:                 return "s\(segmentIndex)"
        case .emomInterval(let i):     return "s\(segmentIndex)-e\(i)"
        case .conditioningRound(let i): return "s\(segmentIndex)-r\(i)"
        case .runLeg(let i):           return "s\(segmentIndex)-l\(i)"
        case .fixedStation(let i):     return "s\(segmentIndex)-t\(i)"
        case .strengthSet(let i):      return "s\(segmentIndex)-q\(i)"
        }
    }

    /// True when this window is a station of a walk-once checklist. The one test
    /// for "the app knows which movement he is on inside a free-order format", so
    /// the transition can be an EVENT instead of a tap.
    var isFixedStation: Bool {
        if case .fixedStation = cursor { return true }
        return false
    }

    /// Measured by a Concept2 monitor (row / ski / bike).
    var isErg: Bool { modality.isErg }
    /// Measured by a treadmill, or by GPS outdoors — the session's run environment
    /// decides which, this only says the work IS running.
    var isRun: Bool { modality == .run }

    var targetDistanceMeters: Double? {
        if case let .distance(m, _) = measure, m > 0 { return m }
        return nil
    }
    var targetCalories: Int? {
        if case let .calories(c, _) = measure, c > 0 { return c }
        return nil
    }
    var targetDurationSeconds: Int? {
        if case let .duration(s, _) = measure, s > 0 { return s }
        return nil
    }
    var targetReps: Int? {
        if case let .reps(r, _) = measure, r > 0 { return r }
        return nil
    }

    /// The work of this window as the athlete reads it ("500 m", "15 cal", "0:40"),
    /// or nil when nothing measurable is prescribed — never a placeholder dash, so
    /// a caller can decide to show nothing rather than a fake value.
    var workLine: String? { PrescriptionSet.emomWorkString(measure) }

    // MARK: - When a station ends by itself
    //
    // THE RULE, and why it is pure. In an EMOM the clock takes the athlete off a
    // round: the minute ends, the round ends, nothing to detect. In a For Time there
    // is no minute to take him off anything — the transitions are events, and the
    // event is known by whatever MEASURES the station:
    //
    //   · metres / calories  → the machine knows. It says so, and the app moves on.
    //   · seconds            → the app's own clock knows. Same thing, no pairing.
    //   · reps               → nobody knows. He taps. The app never pretends.
    //
    // It keys off the MEASURE, not the movement, so one rule covers every station a
    // coach can write instead of a list of special cases. These two are pure
    // functions of the window and the readings so the rule can be verified on its
    // own, without a live session — the engine below only supplies the numbers.

    /// True when a machine reading just CROSSED this window's m/cal goal.
    ///
    /// The test is the CROSSING, not "the reading sits past the goal", and that is
    /// what makes a reconnection safe: a monitor that comes back mid-piece reports
    /// less than the goal and nothing fires. A monitor that goes QUIET can never fire
    /// it either — silence is an athlete catching his breath, and only the goal being
    /// reached takes him off a window.
    ///
    /// Pure on the MEASURE. Whether the engine should ACT on the cross is
    /// `ErgCounterPolicy.advancesOnMachineGoal` (series, stations, steady — not EMOM
    /// minutes, not AMRAP). Callers combine both.
    func crossesMachineGoal(metersBefore: Double?, metersNow: Double?,
                            caloriesBefore: Int?, caloriesNow: Int?) -> Bool {
        guard isErg else { return false }
        if let target = targetDistanceMeters, let now = metersNow {
            return now >= target && (metersBefore ?? 0) < target
        }
        if let target = targetCalories, target > 0, let now = caloriesNow {
            return now >= target && (caloriesBefore ?? 0) < target
        }
        return false
    }

    /// Back-compat name: historically only fixed stations auto-closed. Prefer
    /// `crossesMachineGoal` + `ErgCounterPolicy` for new code.
    func closesOnMachineGoal(metersBefore: Double?, metersNow: Double?,
                             caloriesBefore: Int?, caloriesNow: Int?) -> Bool {
        // Legacy callers assumed stations only; keep that gate here so old tests
        // and any un-updated path stay safe. New engine path uses crossesMachineGoal.
        guard isFixedStation else { return false }
        return crossesMachineGoal(metersBefore: metersBefore, metersNow: metersNow,
                                  caloriesBefore: caloriesBefore, caloriesNow: caloriesNow)
    }

    /// True when a CLOCK-measured station has spent its box ("2 min de bici").
    /// Needs no device at all — the thing that measures it is the session clock.
    func closesOnClock(elapsedInTramo: Double) -> Bool {
        guard isFixedStation, let boxed = boxedSeconds, boxed > 0 else { return false }
        return elapsedInTramo >= Double(boxed)
    }
}

/// One struck line of a FIXED format's checklist — the station (or round) the
/// athlete just closed, and what it actually measured.
///
/// `elapsed` is the BLOCK clock at the strike: the classic For Time split, the
/// number the score is read off, unchanged. `seconds` is how long that one line
/// took, which is what the athlete wants back ("el remo me costó 3:48"). The erg
/// values are kept EXACTLY as measured and never clamped to the goal — a 1.000 m
/// piece that closes at 1.014 m reads 1.014, because that is what he rowed and a
/// record that rounds work down to the prescription is not a record.
struct FixedStationSplit: Equatable {
    let elapsed: Double
    let seconds: Double
    let meters: Double?
    let calories: Int?

    /// What the monitor measured, as the athlete reads it. nil when nothing was.
    var workLine: String? {
        if let m = meters, m >= 1 { return "\(Int(m.rounded())) m" }
        if let c = calories, c >= 1 { return "\(c) cal" }
        return nil
    }
}

// MARK: - Resolution from a segment + a cursor

extension WorkoutSegment {

    /// This segment's own discipline, for a tramo that carries no set of its own.
    ///
    /// The segment KIND is the floor, deliberately. It is the live engine's own
    /// classification and it is what every device path keyed off before the tramo
    /// existed, so a mis-tagged or absent `prescription.modality` can never take a
    /// rower's monitor away from them. Inside an erg or run kind the prescription
    /// only gets to REFINE (row vs ski vs bike), never to contradict.
    var resolvedModality: PrescriptionModality {
        switch kind {
        case .running:
            return .run
        case .rowOrSki:
            let declared = prescription?.modality
            return declared?.isErg == true ? declared! : .row
        case .strength:
            return prescription?.modality ?? agreedMachineModality ?? .strength
        case .sled, .reps:
            return prescription?.modality ?? agreedMachineModality ?? .functional
        }
    }

    /// True when a Concept2 monitor has anything to do with this segment — the
    /// segment itself, its prescription, or ANY movement inside its format. This is
    /// the test for the CONNECT affordance (you must be able to pair the machine
    /// before its round comes up, not only during it), while `tramoIsErg` decides
    /// whose numbers own the screen right now.
    var involvesErg: Bool {
        if kind.isErg { return true }
        if prescription?.modality?.isErg == true { return true }
        return prescription?.sets?.contains { $0.modality?.isErg == true } ?? false
    }

    /// When every machine set of this segment agrees on ONE modality (all remo,
    /// all cinta), that modality. Nil if none or mixed (remo+ski, remo+cinta).
    /// A folded For Time / warmup / rondas whose `kind` collapsed to `.reps`
    /// still has to expose the machine so the tramo is not `.functional`.
    var agreedMachineModality: PrescriptionModality? {
        let machines = (prescription?.sets ?? []).compactMap(\.modality)
            .filter { $0.isErg || $0 == .run }
        guard let first = machines.first, machines.allSatisfy({ $0 == first }) else {
            return nil
        }
        return first
    }

    /// The same question for running: does any part of this segment happen on the
    /// belt or in the street? Gates the treadmill / outdoor entry the same way.
    var involvesRun: Bool {
        if kind == .running { return true }
        if prescription?.modality == .run { return true }
        return prescription?.sets?.contains { $0.modality == .run } ?? false
    }

    /// True when a FIXED format's checklist enumerates the MOVEMENTS of a single
    /// pass — a chipper, a For Time / HYROX sim authored as a route — rather than
    /// repeated ROUNDS of the same list.
    ///
    /// THE discriminator for whether the app honestly knows which movement the
    /// athlete is on. Authored `rounds` means the list repeats: the app knows the
    /// round and never the movement inside it, so the segment stays the tramo and
    /// nothing changes. No `rounds` + a movement list means the list IS the route,
    /// and the strike cursor is a real per-station cursor — which is what lets the
    /// device own the transition instead of the athlete's thumb.
    ///
    /// AMRAP is excluded on purpose: its list repeats for a whole window and its
    /// strike counts rounds, not stations. A ONE-movement list is excluded too —
    /// a single station is a cursor that says nothing the segment didn't already.
    ///
    /// Ground truth (28-jul, `template_segments`): a real HYROX simulation ships as
    /// N sibling segments of one block, each with its own modality and measure and
    /// no `rounds`; the fold turns them into this exact shape.
    var fixedListIsStations: Bool {
        guard let scheme = formatScheme, scheme.presentation == .fixed else { return false }
        switch scheme {
        case .chipper:
            return declaredComponents.count > 1
        case .forTime, .ladder, .rounds, .hyroxSim:
            return formatRounds == nil && declaredComponents.count > 1
        default:
            return false
        }
    }

    /// A strike on this list closes a tramo (station or round). AMRAP strikes
    /// are score inside the same window; they are not a cursor.
    var strikesAreTramos: Bool {
        if fixedListIsStations { return true }
        guard formatScheme?.presentation == .fixed, formatScheme != .amrap else { return false }
        let lines = formatRounds ?? declaredComponents.count
        return lines > 1
    }

    /// Seconds a station is boxed to, when its own work is measured BY THE CLOCK
    /// ("2 min de bici" inside a For Time). The app owns that measurement with no
    /// machine involved, so the window ends when the seconds are done exactly as an
    /// EMOM minute does — and, being boxed, its clock runs from entry instead of
    /// waiting armed for a monitor that may never be paired. nil for every other
    /// measure: metres, calories and reps do not end on a clock.
    func stationBoxSeconds(at index: Int) -> Int? {
        if case let .duration(s, _)? = rotationSet(at: index)?.measure, s > 0 { return s }
        return nil
    }

    /// The prescription set driving round `index` of a format, cycling the
    /// rotation exactly the way the EMOM expansion does — so an alternating format
    /// resolves the same movement on both sides. nil when the format declares no
    /// per-round sets (a uniform format: every round is the segment).
    func rotationSet(at index: Int) -> PrescriptionSet? {
        guard let sets = prescription?.sets, !sets.isEmpty, index >= 0 else { return nil }
        return sets[index % sets.count]
    }

    /// The segment as a tramo — used when no format cursor owns the window.
    func tramo(segmentIndex: Int) -> LiveTramo {
        LiveTramo(
            segmentIndex: segmentIndex,
            cursor: .segment,
            label: primaryMovement,
            modality: resolvedModality,
            measure: scalarMeasure,
            boxedSeconds: nil
        )
    }

    /// The typed measure of the segment as a whole, rebuilt from the scalar
    /// mirrors every segment carries (distance / duration / reps) and the typed
    /// calorie measure, which never flattens into a scalar.
    var scalarMeasure: Measure? {
        if let d = targetDistanceMeters, d > 0 { return .distance(meters: d) }
        if let r = targetReps, r > 0 { return .reps(r) }
        if let s = targetDurationSeconds, s > 0 { return .duration(seconds: s) }
        if let sets = prescription?.sets, let first = sets.first?.measure,
           case let .calories(c, _) = first, c > 0 { return .calories(c) }
        return nil
    }

    /// The tramo for round `index` of a format that rotates (EMOM, intervals,
    /// Tabata). `boxedSeconds` is the format's work window when it has one.
    func rotationTramo(segmentIndex: Int, cursor: LiveTramo.Cursor,
                       index: Int, boxedSeconds: Int?) -> LiveTramo {
        let set = rotationSet(at: index)
        let label = set?.note?.trimmingCharacters(in: .whitespacesAndNewlines)
        return LiveTramo(
            segmentIndex: segmentIndex,
            cursor: cursor,
            label: (label?.isEmpty == false) ? label! : primaryMovement,
            modality: set?.modality ?? resolvedModality,
            measure: set?.measure ?? scalarMeasure,
            boxedSeconds: boxedSeconds
        )
    }
}

// MARK: - Live reading

/// What the athlete reads RIGHT NOW. HUD and Watch render this. They do not
/// own a clock, a rest, or a distance close.
struct LivePicture: Equatable {
    enum Figure: Equatable {
        case meters(Double)
        case calories(Int)
        case countdown(Double)
        case elapsed(Double)
        case reps(Int)
        case none
    }

    enum Primary: Equatable {
        case startBlock
        case skipCountIn
        case dismissRest
        case closeTramo
        case finish

        var label: String {
            switch self {
            case .startBlock: return "EMPEZAR"
            case .skipCountIn: return "SALTAR"
            case .dismissRest: return "SEGUIR"
            case .closeTramo: return "HECHO"
            case .finish: return "TERMINAR"
            }
        }
    }

    /// Intra-window log. Not a second clock. AMRAP rounds and Tabata reps live here.
    enum Score: Equatable {
        case none
        case round
        case reps

        var label: String? {
            switch self {
            case .none: return nil
            case .round: return "+ RONDA"
            case .reps: return "+ REPS"
            }
        }
    }

    var label: String
    var figure: Figure
    /// Prescription of this window ("800 m"). Never the hero figure.
    var planLine: String?
    var nextLine: String?
    var primary: Primary
    var score: Score
    /// Same metres the map / GPS stream just wrote. Nil when this window is not a run.
    var coveredMeters: Double?
    var restRemaining: Double
    var countInRemaining: Double
}
