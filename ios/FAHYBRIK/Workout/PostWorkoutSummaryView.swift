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
    let onSave: () -> Void

    @State private var rpe: Int = 7
    @State private var notes: String = ""
    @State private var isSaving: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    tightHeader
                    if hasZoneData {
                        zonesStackedBar
                    }
                    if hasHRData {
                        metricTiles
                    }
                    if session.plan.segments.count > 1 {
                        segmentsTable
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
            Task {
                await WorkoutExecutionAPI.submit(payload, bearer: bearer)
            }
        }
        onSave()
    }

    private func buildPayload() -> WorkoutExecutionPayload? {
        guard let assignmentId, !assignmentId.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let endedAt = Date()
        let startedAt = session.startedAt
        let segments = buildSegments(iso: iso)
        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: rpe,
            total_duration_seconds: Int(session.elapsedSeconds.rounded()),
            notes: notes.isEmpty ? nil : notes,
            started_at: iso.string(from: startedAt),
            ended_at: iso.string(from: endedAt),
            segments: segments.isEmpty ? nil : segments
        )
    }

    // Map each captured segment lap to the wire DTO. Position-ordered so the
    // backend can match on `position` when no integer segment id is available.
    private func buildSegments(iso: ISO8601DateFormatter) -> [SegmentExecutionDTO] {
        session.laps
            .sorted { $0.position < $1.position }
            .map { lap in
                let zones: [String: Int]? = lap.zoneSecondsByZone.isEmpty
                    ? nil
                    : lap.zoneSecondsByZone.reduce(into: [String: Int]()) {
                        $0["z\($1.key)"] = Int($1.value.rounded())
                    }
                return SegmentExecutionDTO(
                    template_segment_id: nil,
                    position: lap.position,
                    modality: lap.modality,
                    started_at: iso.string(from: lap.startedAt),
                    ended_at: iso.string(from: lap.endedAt),
                    duration_seconds: Int(lap.durationSeconds.rounded()),
                    distance_meters: lap.distanceCoveredMeters,
                    avg_pace_s_per_500m: lap.avgPaceSecPer500m,
                    avg_pace_s_per_km: lap.avgPaceSecPerKm,
                    avg_power_w: lap.avgPowerWatts,
                    stroke_rate_spm: lap.strokeRateSpm,
                    avg_hr: lap.avgHRBpm,
                    max_hr: lap.maxHRBpm,
                    calories: lap.calories,
                    reps_completed: lap.repsCompleted,
                    weight_used_kg: lap.weightUsedKg,
                    zone_seconds_json: zones,
                    source: lap.source
                )
            }
    }

    // MARK: - Header
    private var tightHeader: some View {
        HStack(spacing: 10) {
            Text("✓")
                .font(.system(size: 18))
                .foregroundStyle(Theme.Color.ok)
            HeroNumber(text: WorkoutSession.formatElapsed(session.elapsedSeconds), size: 36)
            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
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

    // MARK: - Per-segment table
    private var segmentsTable: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Por segmento", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                Hairline()
                ForEach(Array(session.plan.segments.enumerated()), id: \.element.id) { idx, seg in
                    if idx > 0 { Hairline() }
                    let lap = session.laps.first(where: { $0.segmentId == seg.id })
                    let timeStr = lap.map { WorkoutSession.formatElapsed($0.durationSeconds) } ?? "—"
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
                                .foregroundStyle(rpe == n ? Color.white : Theme.Color.foreground)
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
