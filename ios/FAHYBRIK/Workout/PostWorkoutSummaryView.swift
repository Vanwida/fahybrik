import SwiftUI

// Expert variant of the Post-Workout Summary.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `PostExpert`: tight header (✓ + 47:23 + PR pill), zones stacked bar,
// 2x3 metric tiles (HR avg/max, decoupling, recovery 60s, avg/peak power),
// per-segment table, RPE 1-10 selector. No motivational copy.
struct PostWorkoutSummaryView: View {
    let session: WorkoutSession
    /// Backend assignment to attribute this execution to. Nil for free
    /// workouts (e.g. demo plan with no plan-week context) — in that case we
    /// skip the sync and just close locally.
    let assignmentId: String?
    /// Solo (default) → /api/sync/workout-execution. Dobles "train together" →
    /// the joint endpoint (links partner + shares result). Same payload.
    var logTarget: WorkoutLogTarget = .solo
    /// Retroactive "Ya lo hice" entry: the athlete trained without the live timer
    /// and logs it after the fact. There are NO measured laps, so the summary
    /// hides the device-derived sections (zones, HR, per-segment splits) and
    /// instead collects the session-level result by hand (total time / score /
    /// RPE / notes). Saved with source='manual'.
    var manualEntry: Bool = false
    let onSave: () -> Void

    @State private var rpe: Int = 7
    @State private var notes: String = ""
    // Total session duration, entered by hand in manual mode (the live timer
    // never ran). For time-scored formats the "Tiempo final" field IS the
    // duration, so this is only collected for non-time-scored sessions.
    @State private var manualTotalSeconds: Int? = nil
    // Metcon/HYROX final score — only surfaced for scored formats (see `showScore`).
    @State private var scoreTimeSeconds: Int? = nil
    @State private var scoreRounds: Int? = nil
    @State private var scoreReps: Int? = nil
    @State private var isSaving: Bool = false

    // MANUAL FALLBACK (no wearable). Optional session HR the athlete enters when
    // no strap fed the workout; injected onto every lap that lacks measured HR so
    // a failed wearable never loses the record. Shown only when `!hasHRData`.
    @State private var manualAvgHR: Int? = nil
    @State private var manualMaxHR: Int? = nil
    // Per-segment manually-entered pace, keyed by segment id. Stored in the
    // segment's display unit (sec/km for run, sec/500m for erg) and written to
    // the matching wire field at build time. Only collected for run/erg segments
    // that captured no auto pace (no GPS / no PM5 split).
    @State private var manualSegmentPaceSeconds: [UUID: Int] = [:]

    // For Time / RFT / HYROX-sim are scored by final time; AMRAP by rounds (+reps).
    // Every other format (EMOM, intervals, strength, circuit) has no single score,
    // so we don't show the field — honest, no empty prompt.
    private var isTimeScored: Bool {
        session.plan.format == .forTime || session.plan.format == .hyroxSim
    }
    private var isRoundsScored: Bool { session.plan.format == .amrap }
    private var showScore: Bool { isTimeScored || isRoundsScored }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    tightHeader
                    // Manual ("Ya lo hice") entry: no measured laps exist, so the
                    // device-derived sections (zones, HR, per-segment splits) are
                    // hidden — they'd collect data with nowhere to persist. The
                    // athlete enters the session-level result by hand instead.
                    if manualEntry {
                        if !isTimeScored {
                            manualDurationCard
                        }
                    } else {
                        if hasZoneData {
                            zonesStackedBar
                        }
                        if hasHRData {
                            metricTiles
                        } else {
                            manualHRCard
                        }
                        if session.plan.segments.count > 1 {
                            segmentsTable
                        }
                    }
                    if showScore {
                        scoreCard
                    }
                    rpeCard
                    notesCard
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            ExpertPrimaryButton(
                title: isSaving ? "GUARDANDO…" : "GUARDAR",
                height: 46,
                action: handleSave
            )
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.m)
                .padding(.top, Theme.Spacing.s)
                .disabled(isSaving)
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    // Fire-and-forget the sync (RequestQueue handles retry on failure), then
    // close. Closing is never blocked on a successful network round-trip per
    // élite-UX brief: a slow API must not trap the athlete in the summary.
    private func handleSave() {
        guard !isSaving else { return }
        isSaving = true
        let bearer = UserDefaults.standard.string(forKey: "fahybrik.bearer")
        let payload = buildPayload()
        if let payload {
            let target = logTarget
            Task {
                switch target {
                case .solo:
                    await WorkoutExecutionAPI.submit(payload, bearer: bearer)
                case .doublesJoint:
                    // sessionId == this athlete's own assignment id == payload.assignment_id.
                    await DoblesExecutionAPI.submit(
                        sessionId: payload.assignment_id,
                        payload,
                        bearer: bearer
                    )
                }
            }
        }
        onSave()
    }

    private func buildPayload() -> WorkoutExecutionPayload? {
        guard let assignmentId, !assignmentId.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let endedAt = Date()
        // Manual log: total time is entered by hand (or, for a time-scored format,
        // taken from the "Tiempo final" field). Live: measured by the timer.
        let totalDuration: Int? = manualEntry
            ? (manualTotalSeconds ?? (isTimeScored ? scoreTimeSeconds : nil))
            : Int(session.elapsedSeconds.rounded())
        // Manual: there's no real start instant, so derive it from the entered
        // duration to keep started_at/ended_at consistent. Live: the real start.
        let startedAt: Date = manualEntry
            ? endedAt.addingTimeInterval(-Double(totalDuration ?? 0))
            : session.startedAt
        let segments = buildSegments(iso: iso)   // empty in manual mode (no laps)
        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: rpe,
            total_duration_seconds: totalDuration,
            notes: notes.isEmpty ? nil : notes,
            // 'manual' for a retroactive log; nil for the live path (backend then
            // defaults it to 'healthkit', preserving prior behaviour).
            source: manualEntry ? "manual" : nil,
            // Only send the score dimensions relevant to this format.
            score_time_s: isTimeScored ? scoreTimeSeconds : nil,
            score_rounds: isRoundsScored ? scoreRounds : nil,
            score_reps: isRoundsScored ? scoreReps : nil,
            started_at: iso.string(from: startedAt),
            ended_at: iso.string(from: endedAt),
            segments: segments.isEmpty ? nil : segments
        )
    }

    // Map each captured segment lap to the wire DTO. Position-ordered so the
    // backend can match on `position` when no integer segment id is available.
    private func buildSegments(iso: ISO8601DateFormatter) -> [SegmentExecutionDTO] {
        // Session-level manual HR overlay (only set when no strap measured HR),
        // clamped to the analytics-accepted range so a stray entry can't 400 the
        // whole sync. Applied per-lap below to any lap missing measured HR.
        let manualHRAvg = validHR(manualAvgHR)
        let manualHRMax = validHR(manualMaxHR)

        return session.laps
            .sorted { $0.position < $1.position }
            .map { lap in
                let zones: [String: Int]? = lap.zoneSecondsByZone.isEmpty
                    ? nil
                    : lap.zoneSecondsByZone.reduce(into: [String: Int]()) {
                        $0["z\($1.key)"] = Int($1.value.rounded())
                    }

                // Manual pace overlay — only when this lap captured no auto pace.
                // Run pace is /km, erg pace /500m (lap.modality == "run" → km).
                var avgPaceKm = lap.avgPaceSecPerKm
                var avgPace500 = lap.avgPaceSecPer500m
                var source = lap.source
                if let mp = manualSegmentPaceSeconds[lap.segmentId], mp > 0,
                   avgPaceKm == nil, avgPace500 == nil {
                    if lap.modality == "run" {
                        avgPaceKm = Double(mp)
                    } else {
                        avgPace500 = Double(mp)
                    }
                    source = "manual"
                }

                // Per-set strength detail → wire (1:1 with SetRecord).
                let setDTOs: [SetExecutionDTO]? = lap.sets?.map { s in
                    SetExecutionDTO(
                        set_index: s.setIndex,
                        reps_prescribed: s.repsPrescribed,
                        reps_actual: s.repsActual,
                        load_prescribed_kg: s.loadPrescribedKg,
                        load_actual_kg: s.loadActualKg,
                        rpe: s.rpe,
                        rir: s.rir,
                        status: s.status,
                        confirmed: s.confirmed,
                        tempo: s.tempo,
                        rest_s: s.restS
                    )
                }

                return SegmentExecutionDTO(
                    template_segment_id: lap.templateSegmentId,
                    position: lap.position,
                    modality: lap.modality,
                    started_at: iso.string(from: lap.startedAt),
                    ended_at: iso.string(from: lap.endedAt),
                    duration_seconds: Int(lap.durationSeconds.rounded()),
                    distance_meters: lap.distanceCoveredMeters,
                    avg_pace_s_per_500m: avgPace500,
                    avg_pace_s_per_km: avgPaceKm,
                    avg_power_w: lap.avgPowerWatts,
                    stroke_rate_spm: lap.strokeRateSpm,
                    // Fall back to the manual session HR for any lap with none
                    // measured, so a failed wearable still records a heart rate.
                    avg_hr: lap.avgHRBpm ?? manualHRAvg,
                    max_hr: lap.maxHRBpm ?? manualHRMax,
                    calories: lap.calories,
                    // `reps_completed` == the ACTUAL reps (nil on a skip — never a
                    // fabricated 0). We send `reps_actual` too (canonical); the
                    // backend accepts both and prefers reps_actual.
                    reps_completed: lap.repsCompleted,
                    weight_used_kg: lap.weightUsedKg,
                    zone_seconds_json: zones,
                    source: source,
                    reps_prescribed: lap.repsPrescribed,
                    reps_actual: lap.repsCompleted,
                    reps_status: lap.repsStatus,
                    reps_confirmed: lap.repsConfirmed,
                    is_structural: lap.isStructural,
                    rx_scaled: lap.rxScaled,
                    scaled_note: lap.scaledNote,
                    sets: setDTOs
                )
            }
    }

    // MARK: - Header
    private var tightHeader: some View {
        HStack(spacing: 10) {
            Text("✓")
                .font(.system(size: 18))
                .foregroundStyle(Theme.Color.ok)
            if manualEntry {
                // No live clock ran — show the intent, not a fake 00:00.
                Text("Registrar entreno")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
            } else {
                HeroNumber(text: WorkoutSession.formatElapsed(session.elapsedSeconds), size: 36)
            }
            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

    // MARK: - Manual total duration (manual entry only)
    //
    // The single session-level field the live timer would otherwise provide.
    // For time-scored formats the "Tiempo final" score IS the duration, so this
    // card is only shown for non-time-scored sessions (Z2 run, strength, EMOM…).
    private var manualDurationCard: some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                LabelText(text: "Duración", size: 9)
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .padding(.bottom, 6)
                TimeMinSecRow(label: "Tiempo total", seconds: $manualTotalSeconds)
            }
        }
    }

    // MARK: - Real-data gates
    //
    // We only render a section when we have genuine data for it. HR/zone
    // metrics depend on a connected strap feeding `injectLiveHR`; with no
    // wearable they stay hidden rather than show invented numbers.
    private var hasHRData: Bool {
        !session.laps.compactMap(\.avgHRBpm).isEmpty
            || !session.laps.compactMap(\.maxHRBpm).isEmpty
    }
    private var hasZoneData: Bool {
        session.laps.contains { !$0.zoneSecondsByZone.isEmpty }
    }

    // MARK: - Zones stacked bar
    private var zonesStackedBar: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "Zonas", size: 9)
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        ForEach(zoneDistribution, id: \.zone) { z in
                            Rectangle().fill(z.zone.color)
                                .frame(width: max(0, geo.size.width * CGFloat(z.pct) / 100))
                        }
                    }
                }
                .frame(height: 16)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                HStack {
                    ForEach(zoneDistribution, id: \.zone) { z in
                        MonoText(
                            text: "\(z.zone.label) \(z.pct)%",
                            size: 9,
                            color: z.zone.color
                        )
                        if z.zone != .z5 { Spacer() }
                    }
                }
            }
        }
    }

    // Real zone distribution from accumulated lap data. Only rendered when
    // `hasZoneData` is true, so there is no demo fallback here.
    private var zoneDistribution: [(zone: HRZone, pct: Int, time: Double)] {
        let totals = HRZone.allCases.map { z -> (HRZone, Double) in
            let secs = session.laps.reduce(into: 0.0) { $0 += $1.zoneSecondsByZone[z.rawValue] ?? 0 }
            return (z, secs)
        }
        let total = totals.reduce(0) { $0 + $1.1 }
        guard total > 0 else { return [] }
        return totals.map { (z, secs) in
            let pct = Int((secs / total * 100).rounded())
            return (z, pct, secs)
        }
    }

    // MARK: - HR metric tiles
    //
    // Only the metrics we actually measure: avg + max HR from the strap.
    // Decoupling / recovery / power require sensor streams we don't capture
    // yet, so we don't fabricate them.
    private var metricTiles: some View {
        let cols = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]
        return LazyVGrid(columns: cols, spacing: 6) {
            ExpertCell(label: "Avg HR", value: avgHRBpm.map { "\($0)" } ?? "—", unit: "bpm")
            ExpertCell(label: "Max HR", value: maxHRBpm.map { "\($0)" } ?? "—", unit: "bpm")
        }
    }

    private var avgHRBpm: Int? {
        let avgs = session.laps.compactMap(\.avgHRBpm)
        guard !avgs.isEmpty else { return nil }
        return avgs.reduce(0, +) / avgs.count
    }
    private var maxHRBpm: Int? { session.laps.compactMap(\.maxHRBpm).max() }

    // MARK: - Manual HR fallback (no wearable)
    //
    // Rendered in place of the HR tiles when no strap fed the session. Both
    // fields are optional — the athlete fills in whatever they know off a watch
    // that didn't sync. The value is wired into the execution payload at save.
    private var manualHRCard: some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Frecuencia cardiaca", size: 9)
                    Text("Sin pulsómetro. Anótala a mano si la conoces.")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
                .padding(.horizontal, 10)
                .padding(.top, 10)
                .padding(.bottom, 6)
                IntRow(label: "FC media", unit: "ppm", value: $manualAvgHR)
                IntRow(label: "FC máx", unit: "ppm", value: $manualMaxHR)
            }
        }
    }

    // Heart-rate within the analytics-accepted range (Zod 30–260) — values
    // outside it are dropped rather than sent, so a stray entry never rejects the
    // whole sync. Used to clamp the manual avg/max before they reach the payload.
    private func validHR(_ value: Int?) -> Int? {
        guard let v = value, v >= 30, v <= 260 else { return nil }
        return v
    }

    // MARK: - Per-segment table
    //
    // Grouped by coach block (Calentamiento / Principal / Vuelta a la calma …)
    // rather than a flat mix, so the principal work reads as the focus and the
    // warmup/cooldown drills (foam roll, breathing) sit under their own muted
    // header instead of inflating one 11-row list.
    private var segmentsTable: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Por segmento", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                ForEach(session.plan.segmentGroups) { group in
                    Hairline()
                    blockHeader(group)
                    ForEach(Array(group.segments.enumerated()), id: \.element.id) { idx, seg in
                        if idx > 0 { Hairline().opacity(0.4) }
                        segmentRow(seg)
                    }
                }
            }
        }
    }

    // Block section header. The principal work is accented and the warmup/cooldown
    // muted so the eye lands on the main effort.
    private func blockHeader(_ group: WorkoutSegmentGroup) -> some View {
        HStack(spacing: 6) {
            Text(group.title.uppercased())
                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(group.phase.isMainWork ? Theme.Color.accentText : Theme.Color.muted)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.top, 9)
        .padding(.bottom, 5)
    }

    private func segmentRow(_ seg: WorkoutSegment) -> some View {
        let lap = session.laps.first(where: { $0.segmentId == seg.id })
        let timeStr = lap.map { WorkoutSession.formatElapsed($0.durationSeconds) } ?? "—"
        return VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 6) {
                Text(seg.title)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                MonoText(text: timeStr, size: 11, color: Theme.Color.muted)
                    .frame(width: 60, alignment: .trailing)
                if let z = seg.targetZone {
                    ZBadge(zone: z).frame(width: 38, alignment: .trailing)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            // Manual pace — only for a run/erg leg with no auto pace
            // (no GPS / no PM5 split). The athlete enters the pace they
            // read off the treadmill/erg so the segment still records a
            // real intensity instead of an empty cell.
            if needsManualPace(seg, lap: lap) {
                TimeMinSecRow(label: paceLabel(seg), seconds: paceBinding(seg))
            }
        }
    }

    // True when this run/erg segment captured no automatic pace, so the athlete
    // can enter it by hand. Strength/reps/sled segments have no pace and are
    // never prompted; a leg with GPS/PM5 pace already shows its measured value.
    private func needsManualPace(_ seg: WorkoutSegment, lap: LapRecord?) -> Bool {
        guard seg.kind == .running || seg.kind == .rowOrSki else { return false }
        return lap?.avgPaceSecPerKm == nil && lap?.avgPaceSecPer500m == nil
    }

    // Run pace is read /km; erg pace /500m (the erg-monitor convention).
    private func paceLabel(_ seg: WorkoutSegment) -> String {
        seg.kind == .rowOrSki ? "Ritmo /500m" : "Ritmo /km"
    }

    private func paceBinding(_ seg: WorkoutSegment) -> Binding<Int?> {
        Binding(
            get: { manualSegmentPaceSeconds[seg.id] },
            set: { manualSegmentPaceSeconds[seg.id] = $0 }
        )
    }

    // MARK: - Metcon/HYROX score
    //
    // Time formats capture the final clock (mm:ss, minutes can exceed 60 for a
    // long HYROX sim); AMRAP captures completed rounds + the partial reps of the
    // unfinished round. The `padding: 0` card mirrors the per-segment table style.
    private var scoreCard: some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                LabelText(text: "Resultado", size: 9)
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .padding(.bottom, 6)
                if isTimeScored {
                    TimeMinSecRow(label: "Tiempo final", seconds: $scoreTimeSeconds)
                } else if isRoundsScored {
                    IntRow(label: "Rondas", unit: "", value: $scoreRounds)
                    IntRow(label: "Reps extra", unit: "", value: $scoreReps)
                }
            }
        }
    }

    // MARK: - RPE
    private var rpeCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "RPE", size: 9)
                HStack(spacing: 4) {
                    ForEach(1...10, id: \.self) { n in
                        Button(action: { rpe = n; Haptics.light() }) {
                            Text("\(n)")
                                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                                .foregroundStyle(rpe == n ? Theme.Color.accentOn : Theme.Color.foreground)
                                .frame(width: 26, height: 26)
                                .background(rpe == n ? Theme.Color.accent : Theme.Color.surfaceElevated)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Esfuerzo percibido \(n) de 10")
                        .accessibilityAddTraits(rpe == n ? .isSelected : [])
                    }
                }
            }
        }
    }

    // MARK: - Notes
    private var notesCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Notas", size: 9)
                TextField("Opcional", text: $notes, axis: .vertical)
                    .lineLimit(2...4)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.vertical, 4)
                    .accessibilityLabel("Notas del entreno")
            }
        }
    }
}
