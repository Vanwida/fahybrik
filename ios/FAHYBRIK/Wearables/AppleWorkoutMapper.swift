import Foundation
import HealthKit
import WorkoutKit

// MARK: - AppleWorkoutMapper — structured RUN → WorkoutKit CustomWorkout (#48)
//
// Turns a coach-prescribed structured run into the workout the athlete finds at the
// TOP of the native Entrenamiento app on their Apple Watch, so a run can start from
// the wrist without touching the phone.
//
// This is the Swift sibling of `shared/domain/wearables/watch-workout.ts` (the
// neutral model every wrist encoder consumes) and it keeps the SAME two rules:
//
//   1. ZONES ARE RESOLVED TO ABSOLUTE BANDS. We never hand a watch "Z4": the watch
//      would apply ITS OWN Z4, derived from a max HR that is not the one we compute.
//      A pace zone travels as the backend-resolved s/km band (`ResolvedIntensity`,
//      the same band the athlete already reads in the app); an HR zone travels as a
//      bpm band derived from the athlete's OWN measured FCmáx — and NOT AT ALL when
//      all we have is a 220−age-style estimate (see `heartRateAlert`).
//   2. WHAT THE WATCH CANNOT WATCH IS NOT EMITTED AS A GOAL. RPE is perception; no
//      manufacturer target represents it. Those tramos go through as OPEN steps with
//      the prescription preserved in the step NAME — text for the athlete, which
//      does not pretend to be a measurement. An open, well-labelled tramo is
//      correct; an invented band corrupts the analytics and lies to the athlete.
//
// SCOPE — WHY ONLY RUNNING (the deliberate omission)
// --------------------------------------------------
// `WorkoutGoal` has exactly five cases (.open / .distance / .energy / .time /
// .poolSwimDistanceWithTime). There is NO reps, NO load, NO rounds. Encoding a
// strength set, an EMOM or an AMRAP would mean degrading "5×5 @ 80% RM" or "12 min
// AMRAP: 10 thrusters + 15 box jumps" into "N iterations of X seconds" with the real
// work stuffed into a display string — losing the reps, the load and the rounds that
// the whole system (analytics, adaptation, the coach's prescrito-vs-hecho view) is
// built on. So those sessions are NOT scheduled here: they run in our own watchOS
// app, which understands them. `eligibility(of:)` below enforces that explicitly.
//
// EVERYTHING IS CHECKED AT RUNTIME. Apple does not publish which activities accept
// custom workouts, which goals they accept, or which alerts. So every goal and alert
// passes `CustomWorkout.supportsGoal` / `.supportsAlert` before being used, and
// DEGRADES (goal → .open, alert → dropped into the step name) when unsupported,
// instead of assuming.

enum AppleWorkoutMapper {

    // MARK: Constants

    /// The activity every FAHYBRID-scheduled workout uses. Running is the only
    /// modality whose prescription survives the trip (see the scope note above).
    static let activity: HKWorkoutActivityType = .running

    /// We do NOT know at schedule time whether the athlete will run on a treadmill
    /// or outside — that is the one choice they make in the pre-start flow
    /// (`RunEnvironment`), hours later. `.unknown` is WorkoutKit's own default and
    /// the honest answer; committing to `.indoor`/`.outdoor` here would be a guess
    /// that also changes which alerts the watch accepts.
    static let location: HKWorkoutSessionLocationType = .unknown

    /// Cadence band half-width (spm) when the coach prescribes a single cadence.
    /// No watch alerts usefully against an exact value, so a point becomes a band.
    /// Mirrors `CADENCE_POINT_TOLERANCE_SPM` in the shared neutral model.
    static let cadenceToleranceSpm: Int = 3

    /// Max characters of a step name. WorkoutKit does not document a limit; this is
    /// the most restrictive of the wrist formats we target, so one name works
    /// everywhere and the athlete reads the same label on every device.
    static let stepNameMaxLength: Int = 40

    // MARK: - Eligibility — the explicit filter
    //
    // A session reaches the watch ONLY when it reduces to exactly one structured
    // run and nothing else. Anything else stays in our app, on purpose.

    /// Whether a session belongs on the wrist. NOT modelled as a `Result`/`Error`:
    /// a fuerza day that stays in our app is a perfectly normal, correct outcome,
    /// not a failure — the reason is information, not a fault.
    enum Eligibility: Equatable {
        case eligible(structure: RunStructure, name: String)
        case notEligible(Ineligibility)
    }

    enum Ineligibility: Equatable {
        /// Rest day, or the session carries no structured running grammar at all
        /// (a legacy scalar run included — without `structure` there are no tramos
        /// to encode, only a headline we would have to invent detail around).
        case noRunStructure
        /// Fuerza / EMOM / AMRAP / movilidad alongside (or instead of) the run.
        /// `WorkoutGoal` cannot express reps, load or rounds, so scheduling this
        /// would put an entry on the wrist that CLAIMS to be the session while
        /// silently dropping prescribed work. Our app runs it whole instead.
        case sessionHasNonRunWork
        /// More than one structured run in the same session. A `CustomWorkout` is
        /// one continuous piece; concatenating two would erase the boundary the
        /// coach drew between them.
        case multipleRunStructures
    }

    /// The one structured run this session reduces to, or why it does not.
    /// Categorías que ACOMPAÑAN a una carrera sin ser trabajo prescrito aparte: el
    /// calentamiento y la vuelta a la calma. No son la sesión, son su ritual.
    ///
    /// Medido contra la biblioteca real: las sesiones de carrera que el coach ha
    /// escrito y asignado a un atleta con UN SOLO ejercicio son CERO. Todas llevan
    /// su movilidad, sus drills o su bici suave de vuelta a la calma. Exigir un
    /// único item dejaba la feature en cero sesiones reales.
    private static let companionCategories: Set<String> = ["mobility", "other"]

    static func eligibility(of detail: AssignmentDetail) -> Eligibility {
        guard let workout = detail.workout else { return .notEligible(.noRunStructure) }

        let items = workout.blocks.flatMap(\.items)
        let runStructures = items.compactMap { item -> RunStructure? in
            guard let s = item.prescription?.structure, !s.isEmpty,
                  !s.expandedLegs().isEmpty else { return nil }
            return s
        }

        guard !runStructures.isEmpty else { return .notEligible(.noRunStructure) }
        guard runStructures.count == 1 else { return .notEligible(.multipleRunStructures) }

        // El criterio NO es "un solo ejercicio", es "el trabajo principal es correr".
        //
        // Una línea acompaña si (a) es la propia carrera, (b) es movilidad o
        // estiramiento — el calentamiento y la vuelta a la calma —, o (c) es otra
        // línea de carrera sin estructura (el trote suave del calentamiento, escrito
        // en la forma plana). Cualquier otra cosa es TRABAJO REAL intercalado: una
        // simulación de HYROX con trineo, un metcon con ergo, fuerza de pierna. Ahí
        // correr es un tramo dentro de otra cosa, y mandar la sesión a la muñeca
        // como si fuera una carrera le mentiría al atleta sobre lo que va a hacer.
        let hasOtherWork = items.contains { item in
            let category = item.exerciseCategory
            if category == "running" { return false }
            return !companionCategories.contains(category)
        }
        guard !hasOtherWork else { return .notEligible(.sessionHasNonRunWork) }

        let name = workout.name.isEmpty ? "Carrera" : workout.name
        return .eligible(structure: runStructures[0], name: name)
    }

    // MARK: - Structure → CustomWorkout

    /// Encode a structured run for the wrist.
    ///
    /// `hrMax` is the athlete's resolved max-HR source. It is used ONLY when it is
    /// the athlete's own MEASURED value; a generic estimate resolves no band (see
    /// `heartRateAlert`).
    ///
    /// Returns nil when the activity itself does not accept custom workouts on this
    /// OS — checked, never assumed.
    static func customWorkout(
        structure: RunStructure,
        name: String,
        hrMax: HRMaxSource?
    ) -> CustomWorkout? {
        guard CustomWorkout.supportsActivity(activity) else { return nil }

        let warmupPhase = structure.first { $0.role == .warmup }
        let mainPhase = structure.first { $0.role == .main }
        let cooldownPhase = structure.first { $0.role == .cooldown }

        var blocks: [IntervalBlock] = []

        // Warm-up: `CustomWorkout.warmup` is a SINGLE step, but a coach's warm-up may
        // have several tramos (10' suave + 4 progresiones). The first becomes the
        // warmup; the rest are prepended as an ordinary block so not one tramo is lost.
        let warmupLegs = warmupPhase.map { [$0].expandedLegs() } ?? []
        let warmup = warmupLegs.first.map { step(for: $0, hrMax: hrMax) }
        if warmupLegs.count > 1 {
            blocks.append(IntervalBlock(steps: warmupLegs.dropFirst().map { intervalStep(for: $0, hrMax: hrMax) },
                                        iterations: 1))
        }

        if let mainPhase {
            blocks.append(contentsOf: intervalBlocks(from: mainPhase.elements, role: .main, hrMax: hrMax))
        }

        // Cool-down: same one-step constraint, mirrored — the LAST tramo is the
        // cooldown, the earlier ones are appended as a block before it.
        let cooldownLegs = cooldownPhase.map { [$0].expandedLegs() } ?? []
        if cooldownLegs.count > 1 {
            blocks.append(IntervalBlock(steps: cooldownLegs.dropLast().map { intervalStep(for: $0, hrMax: hrMax) },
                                        iterations: 1))
        }
        let cooldown = cooldownLegs.last.map { step(for: $0, hrMax: hrMax) }

        // Nothing to run → nothing to schedule. An empty shell on the wrist would be
        // worse than no entry at all: it looks like a session and contains none.
        guard warmup != nil || cooldown != nil || blocks.contains(where: { !$0.steps.isEmpty }) else {
            return nil
        }

        return CustomWorkout(
            activity: activity,
            location: location,
            displayName: clampName(name),
            warmup: warmup,
            blocks: blocks,
            cooldown: cooldown
        )
    }

    // MARK: - Elements → interval blocks
    //
    // A `Repeat` becomes an `IntervalBlock` with `iterations`, which is what makes
    // the wrist show "×5" and count the rounds instead of listing five identical
    // steps. WorkoutKit supports ONE level of repetition, so a nested Repeat is
    // expanded inline into its parent's steps (its own iterations preserved by
    // emission) while the OUTER repetition stays as the block's iterations.

    private static func intervalBlocks(
        from elements: [RunElement],
        role: RunPhaseRole,
        hrMax: HRMaxSource?
    ) -> [IntervalBlock] {
        var blocks: [IntervalBlock] = []
        var loose: [IntervalStep] = []

        func flushLoose() {
            guard !loose.isEmpty else { return }
            blocks.append(IntervalBlock(steps: loose, iterations: 1))
            loose = []
        }

        for element in elements {
            switch element {
            case let .segment(segment):
                loose.append(intervalStep(for: RunLeg(segment, phaseRole: role), hrMax: hrMax))

            case let .repeatBlock(times, inner):
                flushLoose()
                guard times > 0 else { continue }
                var steps: [IntervalStep] = []
                func walk(_ children: [RunElement]) {
                    for child in children {
                        switch child {
                        case let .segment(segment):
                            steps.append(intervalStep(for: RunLeg(segment, phaseRole: role), hrMax: hrMax))
                        case let .repeatBlock(innerTimes, innerElements):
                            guard innerTimes > 0 else { continue }
                            for _ in 0..<innerTimes { walk(innerElements) }
                        }
                    }
                }
                walk(inner)
                guard !steps.isEmpty else { continue }
                blocks.append(IntervalBlock(steps: steps, iterations: times))
            }
        }
        flushLoose()
        return blocks
    }

    private static func intervalStep(for leg: RunLeg, hrMax: HRMaxSource?) -> IntervalStep {
        IntervalStep(leg.isRecovery ? .recovery : .work, step: step(for: leg, hrMax: hrMax))
    }

    // MARK: - Leg → step

    static func step(for leg: RunLeg, hrMax: HRMaxSource?) -> WorkoutStep {
        let goal = supportedGoal(for: leg)
        let (alert, droppedAlertNote) = supportedAlert(for: leg, hrMax: hrMax)
        let label = name(for: leg, extraNotes: droppedAlertNote)
        // An empty label is passed as nil, not as "": the watch then falls back to
        // its own step wording instead of rendering a blank line.
        return WorkoutStep(goal: goal, alert: alert, displayName: label.isEmpty ? nil : label)
    }

    /// How the step ENDS. Reuses `RunLeg.goal` (the very same `SegmentGoal` our own
    /// engine auto-advances on) so the wrist and the app close a tramo on the same
    /// condition. An unsupported goal degrades to `.open` — the measure is already
    /// spelled out in the step name, so the athlete still knows what to do.
    private static func supportedGoal(for leg: RunLeg) -> WorkoutGoal {
        let goal: WorkoutGoal
        switch leg.goal {
        case let .distance(meters): goal = .distance(meters, .meters)
        case let .time(seconds):    goal = .time(Double(seconds), .seconds)
        case .open:                 return .open
        }
        return CustomWorkout.supportsGoal(goal, activity: activity, location: location) ? goal : .open
    }

    /// The step's SINGLE alert (WorkoutKit allows exactly one) plus any prescription
    /// that therefore has to travel in the name instead.
    ///
    /// Priority is the coach's primary objetivo — pace, else HR — and only a step
    /// that spends no alert on either can spend it on cadence. Cadence is a
    /// secondary guide; it must never displace the objetivo.
    private static func supportedAlert(
        for leg: RunLeg,
        hrMax: HRMaxSource?
    ) -> (alert: (any WorkoutAlert)?, notes: [String]) {
        var notes: [String] = []

        // 1 — pace band → speed. Also covers a zone the BACKEND already resolved to
        //     an absolute s/km band (`RunLeg.runTarget` reads `resolved` for us).
        if case let .pace(paceTarget) = leg.runTarget, let alert = speedAlert(for: paceTarget) {
            if let spm = leg.cadenceSpm { notes.append("\(spm) spm") }
            return (alert, notes)
        }

        // 2 — HR zone → absolute bpm, only from a MEASURED max (see heartRateAlert).
        if case let .zone(zone) = leg.runTarget {
            if let alert = heartRateAlert(for: zone, hrMax: hrMax) {
                if let spm = leg.cadenceSpm { notes.append("\(spm) spm") }
                return (alert, notes)
            }
            // No personal FCmáx → no band. The zone stays in the name (already there
            // via `objetivoLabel`) and the tramo goes through OPEN. Honest: we do not
            // let the watch substitute its own zones for ours.
        }

        // 3 — nothing else claimed the alert, so cadence may have it.
        if let alert = cadenceAlert(for: leg) { return (alert, notes) }

        return (nil, notes)
    }

    // MARK: Alerts

    /// A pace band as a SPEED band. The inversion is the trap: a faster pace is
    /// FEWER seconds per km but MORE metres per second, so the fast bound becomes
    /// the range's UPPER bound.
    ///
    /// Only a CLOSED band is emitted. A one-sided prescription ("no más lento de
    /// 5:00") has no second bound and we do not invent one — the step goes open with
    /// the prescription in its name. (Same rule as the shared neutral model.)
    static func speedAlert(for target: PaceTarget) -> (any WorkoutAlert)? {
        guard let band = closedPaceBand(target) else { return nil }
        let slowest = Measurement(value: metersPerSecond(fromPaceSecPerKm: band.slow), unit: UnitSpeed.metersPerSecond)
        let fastest = Measurement(value: metersPerSecond(fromPaceSecPerKm: band.fast), unit: UnitSpeed.metersPerSecond)
        guard slowest.value > 0, fastest.value > 0, slowest <= fastest else { return nil }
        let alert = SpeedRangeAlert(target: slowest...fastest, metric: .current)
        guard CustomWorkout.supportsAlert(alert, activity: activity, location: location) else { return nil }
        return alert
    }

    /// The coach's pace as a closed (fast, slow) second-per-km band, or nil when it
    /// cannot be closed honestly.
    ///
    /// A single prescribed pace is widened by `PaceTarget.singleToleranceSecPerKm` —
    /// the SAME window our own HUD uses to call a pace "en objetivo", so the wrist
    /// alert fires exactly when the app would judge the athlete out of target.
    static func closedPaceBand(_ target: PaceTarget) -> (fast: Int, slow: Int)? {
        if let fast = target.fastS, let slow = target.slowS, fast > 0, slow > 0, fast <= slow {
            return (fast, slow)
        }
        if let single = target.single, single > 0 {
            let tolerance = PaceTarget.singleToleranceSecPerKm
            return (max(1, single - tolerance), single + tolerance)
        }
        return nil
    }

    static func metersPerSecond(fromPaceSecPerKm pace: Int) -> Double {
        guard pace > 0 else { return 0 }
        return 1000.0 / Double(pace)
    }

    /// An HR zone as an ABSOLUTE bpm band — and ONLY from the athlete's own measured
    /// FCmáx.
    ///
    /// When all we have is a generic age-based estimate we emit NO alert. The reason
    /// is the honesty rule: an estimated band is a number we made up, and pushing it
    /// to the watch as a hard target strips the "genérica" caveat the app shows
    /// beside it everywhere else. An estimate is fine for colouring a live reading;
    /// it is not fine as a prescription the wrist buzzes about.
    static func heartRateAlert(for zone: HRZone, hrMax: HRMaxSource?) -> (any WorkoutAlert)? {
        guard let hrMax, !hrMax.isEstimated else { return nil }
        guard let band = HRZoneClassifier.bpmBand(for: zone, hrMax: hrMax.bpm) else { return nil }
        // `WorkoutAlertMetric.countPerMinute` is WorkoutKit's own bpm/spm unit —
        // Foundation's UnitFrequency has no beats-per-minute of its own.
        let bpm = WorkoutAlertMetric.countPerMinute
        let alert = HeartRateRangeAlert(
            target: Measurement(value: Double(band.lowerBound), unit: bpm)
                ... Measurement(value: Double(band.upperBound), unit: bpm)
        )
        guard CustomWorkout.supportsAlert(alert, activity: activity, location: location) else { return nil }
        return alert
    }

    /// The prescribed cadence as a band (a point is widened; no watch alerts against
    /// an exact spm). Only reached when the step spent no alert on pace or HR.
    static func cadenceAlert(for leg: RunLeg) -> (any WorkoutAlert)? {
        guard let spm = leg.cadenceSpm, spm > 0 else { return nil }
        let low = Double(max(1, spm - cadenceToleranceSpm))
        let high = Double(spm + cadenceToleranceSpm)
        let stepsPerMinute = WorkoutAlertMetric.countPerMinute
        let alert = CadenceRangeAlert(
            target: Measurement(value: low, unit: stepsPerMinute)
                ... Measurement(value: high, unit: stepsPerMinute)
        )
        guard CustomWorkout.supportsAlert(alert, activity: activity, location: location) else { return nil }
        return alert
    }

    // MARK: Step name
    //
    // The name carries EVERYTHING the goal and the alert could not: the measure, the
    // recovery mode, the objetivo as the coach wrote it (band, zone or RPE), the
    // incline and the cadence. It is the athlete-facing line, so it reuses the very
    // same formatters the in-app HUD uses — the wrist and the phone say the same
    // words about the same tramo.

    static func name(for leg: RunLeg, extraNotes: [String] = []) -> String {
        var parts: [String] = []

        let measure = RunLegDisplay.measureLabel(leg)
        if !measure.isEmpty { parts.append(measure) }

        if leg.isRecovery {
            let mode = RunLegDisplay.recoveryModeWord(leg.recoveryMode)
            parts.append(mode.isEmpty ? "rec." : "rec. \(mode)")
        }

        // The objetivo AS PRESCRIBED — a pace band, a zone code, or the RPE. Never
        // the widened band we may have sent to the alert: the athlete reads what the
        // coach wrote, not our tolerance window.
        if let objetivo = leg.objetivoLabel { parts.append(objetivo) }

        // Only governable on a treadmill; outdoors it is an indication. Either way
        // WorkoutKit has no incline target, so it travels as text.
        if let incline = leg.inclinePct, incline > 0 {
            parts.append(incline == incline.rounded()
                ? "\(Int(incline))%"
                : String(format: "%.1f%%", incline))
        }

        parts.append(contentsOf: extraNotes)

        return clampName(parts.joined(separator: " · "))
    }

    /// Trim to the length limit without cutting a word in half.
    static func clampName(_ raw: String) -> String {
        let name = raw.trimmingCharacters(in: .whitespaces)
        guard name.count > stepNameMaxLength else { return name }
        let cut = String(name.prefix(stepNameMaxLength))
        if let lastSpace = cut.lastIndex(of: " "), cut.distance(from: cut.startIndex, to: lastSpace) > stepNameMaxLength / 2 {
            return String(cut[cut.startIndex..<lastSpace]).trimmingCharacters(in: .whitespaces)
        }
        return cut.trimmingCharacters(in: .whitespaces)
    }
}
