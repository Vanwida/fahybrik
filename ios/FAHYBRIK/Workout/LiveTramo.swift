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
        }
    }

    /// Measured by a Concept2 monitor (row / ski / bike).
    var isErg: Bool { modality.isErg }
    /// Measured by a treadmill, or by GPS outdoors — the session's run environment
    /// decides which, this only says the work IS running.
    var isRun: Bool { modality == .run }

    var targetDistanceMeters: Double? {
        if case let .distance(m) = measure, m > 0 { return m }
        return nil
    }
    var targetCalories: Int? {
        if case let .calories(c) = measure, c > 0 { return c }
        return nil
    }
    var targetDurationSeconds: Int? {
        if case let .duration(s) = measure, s > 0 { return s }
        return nil
    }
    var targetReps: Int? {
        if case let .reps(r) = measure, r > 0 { return r }
        return nil
    }

    /// The work of this window as the athlete reads it ("500 m", "15 cal", "0:40"),
    /// or nil when nothing measurable is prescribed — never a placeholder dash, so
    /// a caller can decide to show nothing rather than a fake value.
    var workLine: String? {
        guard let measure else { return nil }
        let s = PrescriptionSet.emomWorkString(measure)
        return s == "—" ? nil : s
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
            return prescription?.modality ?? .strength
        case .sled, .reps:
            return prescription?.modality ?? .functional
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

    /// The same question for running: does any part of this segment happen on the
    /// belt or in the street? Gates the treadmill / outdoor entry the same way.
    var involvesRun: Bool {
        if kind == .running { return true }
        if prescription?.modality == .run { return true }
        return prescription?.sets?.contains { $0.modality == .run } ?? false
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
           case let .calories(c) = first, c > 0 { return .calories(c) }
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
