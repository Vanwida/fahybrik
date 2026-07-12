import SwiftUI
import StoreKit

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
    /// FREE MODE (entreno libre). When present this execution is saved via
    /// `FreeWorkoutAPI` (title/modality/prescription + the SAME metrics) instead of
    /// the prescribed sync — there is no assignment to attribute it to. Nil = the
    /// unchanged prescribed path.
    var freeContext: FreeWorkoutContext? = nil
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

    // MARK: #58 — structured feedback to the coach (prescribed sessions only)
    @State private var difficulty: PerceivedDifficulty? = nil
    @State private var painExpanded: Bool = false
    @State private var painArea: PainArea? = nil
    @State private var painNote: String = ""

    // MARK: #65 — PR celebration + shareable card
    /// Set (non-empty) when the sync response reports running records → the
    /// celebration overlays the summary until dismissed, THEN we close.
    @State private var celebrationRecords: [PersonalRecord] = []
    /// One-shot guard: true once the summary has closed (normally, or because the
    /// athlete tapped to leave during the save wait). Stops the still-pending sync
    /// response from closing again or celebrating over a dismissed view.
    @State private var didFinish: Bool = false
    /// Rendered share image of THIS summary (no PR badge — records are unknown
    /// until save). Re-rendered on appear and when the RPE changes.
    @State private var summaryShareURL: URL? = nil

    // MARK: #28 — joint side-by-side (dobles)
    /// Set after a .doublesJoint close when the partner has ALSO logged their side →
    /// the joint card overlays the summary (its "Seguir" closes). Nil otherwise.
    @State private var jointData: JointShareData? = nil
    /// PRs from this save, held while the joint card is up so the review gate still
    /// sees a genuine PR when it closes (the joint card supersedes the gold overlay).
    @State private var pendingJointRecords: [PersonalRecord] = []

    /// SwiftUI review-request action (#59). Fired only through `maybeRequestReview`,
    /// which consults the pure `ReviewGate` first.
    @Environment(\.requestReview) private var requestReview

    /// How long to wait for the sync response before closing anyway. A slow/failing
    /// API must never trap the athlete in the summary — the sync still replays via
    /// RequestQueue; we just skip the celebration this time.
    private static let prCelebrationLookupTimeout: TimeInterval = 6

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

    // For Time / RFT / Chipper / Ladder / Rounds / HYROX-sim are scored by final
    // time; AMRAP / Tabata / Death By by rounds (+reps). Intervals / Steady (pace)
    // and EMOM / strength have no single headline score — their result lives in the
    // per-segment splits, so we show no field (honest, no empty prompt).
    private var isTimeScored: Bool {
        switch session.plan.format {
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim: return true
        default: return false
        }
    }
    private var isRoundsScored: Bool {
        switch session.plan.format {
        case .amrap, .tabata, .deathBy: return true
        default: return false
        }
    }
    private var showScore: Bool { isTimeScored || isRoundsScored }

    // Reps-extra (AMRAP partial round / Tabata min-reps) only applies to AMRAP and
    // Tabata; Death By's score is rounds survived alone.
    private var showScoreReps: Bool {
        session.plan.format == .amrap || session.plan.format == .tabata
    }
    private var roundsScoreLabel: String {
        switch session.plan.format {
        case .deathBy: return "Rondas superadas"
        default:       return "Rondas"
        }
    }
    private var repsScoreLabel: String {
        session.plan.format == .tabata ? "Reps (mín.)" : "Reps extra"
    }

    var body: some View {
        ZStack {
            summaryContent
            if !celebrationRecords.isEmpty {
                PRCelebrationView(
                    records: celebrationRecords,
                    shareData: celebrationShareData,
                    onDone: dismissCelebration
                )
            }
            // #28 — the joint side-by-side (only when the partner has logged too). It
            // supersedes the gold PR overlay for a joint close, so the two never stack.
            if let jointData {
                DoblesJointSummaryView(data: jointData, onDone: dismissJoint)
            }
        }
        .onAppear { seedCapturedScore(); renderSummaryCard() }
        .onChange(of: rpe) { _, _ in renderSummaryCard() }
    }

    private var summaryContent: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    tightHeader
                    // #64 — an outdoor run's GPS route, right under the headline time.
                    if hasRoute { routeMapCard }
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
                    // #58 — "Cómo ha ido" feedback to the coach. Only for a
                    // prescribed session: a free workout has no coach prescription
                    // to judge "fácil/duro" against, and the free endpoint doesn't
                    // carry these fields.
                    if freeContext == nil {
                        SessionFeedbackCard(
                            difficulty: $difficulty,
                            painExpanded: $painExpanded,
                            painArea: $painArea,
                            painNote: $painNote
                        )
                    }
                    notesCard
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            // Stays tappable WHILE saving: on a slow response the athlete is never
            // trapped — tapping "GUARDANDO…" closes now. The sync keeps running
            // offline-first (RequestQueue); only this celebration is skipped.
            ExpertPrimaryButton(
                title: isSaving ? "GUARDANDO…" : "GUARDAR",
                height: 46,
                action: { isSaving ? closeNow() : handleSave() }
            )
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.m)
                .padding(.top, Theme.Spacing.s)
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    // Pre-fill the result from what the live timer already counted (the athlete
    // never re-enters their AMRAP rounds or For Time clock). Only seeds an unset
    // field, so a manual edit is never clobbered. Manual ("Ya lo hice") logs have
    // no captured score and stay blank for hand entry.
    private func seedCapturedScore() {
        guard !manualEntry else { return }
        if isTimeScored, scoreTimeSeconds == nil {
            scoreTimeSeconds = session.capturedScoreTimeSeconds
                ?? (isTimeScored ? Int(session.elapsedSeconds.rounded()) : nil)
        }
        if isRoundsScored {
            if scoreRounds == nil { scoreRounds = session.capturedScoreRounds }
            if scoreReps == nil { scoreReps = session.capturedScoreReps }
        }
    }

    // Save the execution. Free / ad-hoc sessions fire-and-forget and close at once.
    // A prescribed session briefly awaits the sync response (bounded by
    // `prCelebrationLookupTimeout`) so a running PR can be celebrated before we
    // close — but a slow/failing API never traps the athlete: on timeout we close
    // and the sync still replays via RequestQueue.
    private func handleSave() {
        guard !isSaving else { return }
        isSaving = true
        let bearer = UserDefaults.standard.string(forKey: "fahybrik.bearer")
        // This workout happened — count it toward the review-prompt tenure gate,
        // even when the network is offline (#59).
        ReviewPromptStore.shared.recordWorkoutSaved()

        // FREE MODE: route to the free-save contract. No coach-prescription feedback
        // and no PR celebration — the free endpoint carries neither.
        if let free = freeContext {
            let payload = buildFreePayload(free)
            Task { await FreeWorkoutAPI.submit(payload, bearer: bearer) }
            finishAfterSave(records: [])
            return
        }

        // Ad-hoc session with no assignment: nothing to sync — close as before.
        guard var payload = buildPayload() else {
            finishAfterSave(records: [])
            return
        }
        // Mirror mode: if the wrist recorded this session it reported the saved
        // HKWorkout's UUID — carry it so the backend recognises the HealthKit-synced
        // copy of the SAME workout and never double-counts. Only when the payload
        // doesn't already carry a ref (manual flows simply get nil).
        if payload.source_workout_ref == nil {
            payload.source_workout_ref = PhoneMirrorService.shared.consumeWorkoutRef()
        }
        let submitted = payload
        let target = logTarget
        Task { @MainActor in
            // The submit runs to completion on its own (enqueues on failure); we
            // only bound how long we WAIT for its response before closing, so a slow
            // API never traps the athlete here.
            let responseTask = Task { () -> WorkoutExecutionResponse? in
                switch target {
                case .solo:
                    return await WorkoutExecutionAPI.submitReturning(submitted, bearer: bearer)
                case .doublesJoint:
                    // sessionId == this athlete's own assignment id == payload.assignment_id.
                    return await DoblesExecutionAPI.submitReturning(
                        sessionId: submitted.assignment_id, submitted, bearer: bearer
                    )
                }
            }
            let response = await Self.firstValue(
                of: responseTask, timeout: Self.prCelebrationLookupTimeout
            )
            // The athlete may have tapped to leave while we waited — if so, don't
            // reopen or celebrate over a view that's already gone.
            guard !didFinish else { return }
            let records = response?.personalRecords ?? []
            // #28 — a joint close: THIS side is now logged, so fetch the side-by-side.
            // When the partner has already logged too, the joint card is the closing
            // moment (it also surfaces PR chips); otherwise fall through to the solo
            // PR/close flow. A no-partner / network miss simply closes as normal.
            if target == .doublesJoint,
               let summary = await JointSummaryService.fetch(assignmentId: submitted.assignment_id, bearer: bearer),
               let jd = JointShareData.from(dto: summary, title: session.plan.name,
                                            date: Date(), partnerFallback: nil) {
                guard !didFinish else { return }
                pendingJointRecords = records
                isSaving = false
                withAnimation(.easeInOut(duration: 0.2)) { jointData = jd }
                return
            }
            if records.isEmpty {
                finishAfterSave(records: [])
            } else {
                // Celebrate first; closing is deferred to the celebration dismiss.
                withAnimation(.easeInOut(duration: 0.2)) { celebrationRecords = records }
                isSaving = false
            }
        }
    }

    // #28 — the joint card's "Seguir": close, still passing any PRs to the review gate.
    private func dismissJoint() {
        let records = pendingJointRecords
        pendingJointRecords = []
        jointData = nil
        finishAfterSave(records: records)
    }

    // Leave during the save wait: don't wait for the response — the sync keeps
    // running offline-first, we just skip the celebration this time.
    private func closeNow() {
        finishAfterSave(records: [])
    }

    // Close the summary ONCE, requesting an App Store review only when the pure gate
    // allows it — a genuine beaten PR (not a first mark) is a standalone good moment.
    private func finishAfterSave(records: [PersonalRecord]) {
        guard !didFinish else { return }
        didFinish = true
        maybeRequestReview(afterGenuinePR: records.contains { !$0.isFirstMark })
        onSave()
    }

    private func dismissCelebration() {
        let records = celebrationRecords
        celebrationRecords = []
        finishAfterSave(records: records)
    }

    private func maybeRequestReview(afterGenuinePR: Bool) {
        let store = ReviewPromptStore.shared
        guard ReviewGate.shouldRequest(
            now: Date(),
            firstUseAt: store.firstUseAt,
            workoutsSaved: store.workoutsSaved,
            lastRequestedAt: store.lastRequestedAt,
            lastBugReportAt: store.lastBugReportAt,
            afterGenuinePR: afterGenuinePR
        ) else { return }
        store.recordReviewRequested()
        requestReview()
    }

    // Await whichever finishes first — the response or a timeout — WITHOUT blocking
    // on the (possibly slow) submit: a timeout resumes with nil while the submit
    // keeps running to completion in the background. Resume is guarded exactly once.
    private static func firstValue(
        of task: Task<WorkoutExecutionResponse?, Never>,
        timeout: TimeInterval
    ) async -> WorkoutExecutionResponse? {
        await withCheckedContinuation { continuation in
            let once = ResumeOnce()
            Task {
                let value = await task.value
                if once.claim() { continuation.resume(returning: value) }
            }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if once.claim() { continuation.resume(returning: nil) }
            }
        }
    }

    // Render the summary's share card (no PR badge — records are unknown pre-save).
    @MainActor
    private func renderSummaryCard() {
        let data = WorkoutShareData.from(
            session: session, totalSeconds: executionCore().totalDuration, rpe: rpe, records: []
        )
        summaryShareURL = WorkoutShareRenderer.pngURL(for: data)
    }

    // Share data for the celebration card (with the PR badge).
    private var celebrationShareData: WorkoutShareData {
        WorkoutShareData.from(
            session: session,
            totalSeconds: executionCore().totalDuration,
            rpe: rpe,
            records: celebrationRecords
        )
    }

    // The execution metrics SHARED by the prescribed and the free save paths —
    // computed once so neither path re-derives durations / scores / segments and
    // the two can't drift. The only per-path differences are the carrier fields
    // (assignment_id vs title/modality/prescription) and the source.
    private struct ExecutionCore {
        let totalDuration: Int?
        let startedAtISO: String
        let endedAtISO: String
        let scoreTime: Int?
        let scoreRounds: Int?
        let scoreReps: Int?
        let completeness: String
        let segments: [SegmentExecutionDTO]?
        let notes: String?
        /// 'manual' for a retroactive log; nil for the live prescribed path.
        let liveSource: String?
    }

    private func executionCore() -> ExecutionCore {
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
        return ExecutionCore(
            totalDuration: totalDuration,
            startedAtISO: iso.string(from: startedAt),
            endedAtISO: iso.string(from: endedAt),
            // Only send the score dimensions relevant to this format.
            scoreTime: isTimeScored ? scoreTimeSeconds : nil,
            scoreRounds: isRoundsScored ? scoreRounds : nil,
            scoreReps: isRoundsScored ? scoreReps : nil,
            // Honest finish: 'full' (→ completed) only when the protocol ran to its
            // end; 'partial' (→ partial) when terminated early.
            completeness: session.completeness.rawValue,
            segments: segments.isEmpty ? nil : segments,
            notes: notes.isEmpty ? nil : notes,
            liveSource: manualEntry ? "manual" : nil
        )
    }

    // #64 — the outdoor run's captured trace (nil / <2 points = not outdoors).
    private var hasRoute: Bool {
        guard let poly = session.capturedRoutePolyline else { return false }
        return PolylineCodec.pointCount(poly) >= 2
    }

    private var routeMapCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Tu recorrido", size: 11)
            RouteMiniMap(polyline: session.capturedRoutePolyline ?? "")
                .frame(height: 180)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func buildPayload() -> WorkoutExecutionPayload? {
        guard let assignmentId, !assignmentId.isEmpty else { return nil }
        let c = executionCore()
        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: rpe,
            total_duration_seconds: c.totalDuration,
            notes: c.notes,
            // 'manual' for a retroactive log; nil for the live path (backend then
            // defaults it to 'healthkit', preserving prior behaviour).
            source: c.liveSource,
            score_time_s: c.scoreTime,
            score_rounds: c.scoreRounds,
            score_reps: c.scoreReps,
            completeness: c.completeness,
            started_at: c.startedAtISO,
            ended_at: c.endedAtISO,
            segments: c.segments,
            // #64 — the outdoor run's GPS trace, persisted to workout_routes.
            route_polyline: session.capturedRoutePolyline,
            // #58 — optional structured feedback, in the SAME POST.
            perceived_difficulty: difficulty?.rawValue,
            pain_area: feedbackPainAreaWire,
            pain_note: feedbackPainNoteWire
        )
    }

    // Pain fields are only sent when the athlete opened the "Molestia física"
    // section (collapsed = not reported). The note is trimmed and clamped to the
    // backend limit; empty → omitted.
    private var feedbackPainAreaWire: String? {
        painExpanded ? painArea?.rawValue : nil
    }
    private var feedbackPainNoteWire: String? {
        guard painExpanded else { return nil }
        let trimmed = painNote.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(PainArea.maxNoteLength))
    }

    // Free workout: the SAME execution metrics + the free-only carriers. The
    // measured path carries a top-level `prescription`; fuerza·funcional carry
    // `items` (built exercises/movements) with `prescription` omitted — exactly one
    // is present, mirroring `FreeWorkoutContext`. PM5 is not live, so the provenance
    // is 'manual' per the free-save contract (the generic/manual live HUD ran it).
    // The per-segment execution DTOs (strength per-set `sets[]`; the folded WOD lap +
    // its score) come from `executionCore()` unchanged — the same laps the prescribed
    // path records, so nothing forks.
    private func buildFreePayload(_ free: FreeWorkoutContext) -> FreeWorkoutPayload {
        let c = executionCore()
        return FreeWorkoutPayload(
            title: free.title,
            modality: free.modalityWire,
            prescription: free.prescription,
            items: free.items,
            perceived_exertion: rpe,
            total_duration_seconds: c.totalDuration,
            notes: c.notes,
            source: "manual",
            score_time_s: c.scoreTime,
            score_rounds: c.scoreRounds,
            score_reps: c.scoreReps,
            completeness: c.completeness,
            started_at: c.startedAtISO,
            ended_at: c.endedAtISO,
            segments: c.segments
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
                    sets: setDTOs,
                    // Segment average incline (from the belt) / cadence (nil — no
                    // on-device source yet); the backend range-gates both (#62).
                    incline_pct: lap.inclinePct,
                    run_cadence_spm: lap.runCadenceSpm
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
            if let summaryShareURL {
                ShareLink(item: summaryShareURL) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
                .accessibilityLabel("Compartir entreno")
            }
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
                    IntRow(label: roundsScoreLabel, unit: "", value: $scoreRounds)
                    if showScoreReps {
                        IntRow(label: repsScoreLabel, unit: "", value: $scoreReps)
                    }
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

// A one-shot claim guard so a continuation raced between two tasks (the response
// and the timeout) resumes exactly once. Internally synchronized → safe to share.
private final class ResumeOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var claimed = false
    /// True for the FIRST caller only; every later caller gets false.
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if claimed { return false }
        claimed = true
        return true
    }
}
