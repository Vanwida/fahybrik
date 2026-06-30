import SwiftUI

// ExecutedWorkoutView — the READ-ONLY post-workout detail for a FINISHED session.
//
// Closes the athlete loop: tapping a done session (prescribed OR free) opens what
// they actually logged — tiempo / score / RPE / per-segment splits — instead of
// the active-workout brief. It is server-backed (the extended assignment-detail
// endpoint now ships `execution` + per-segment actuals), NOT rebuilt from the live
// in-memory WorkoutSession, so it works for ANY done day, including device-synced
// ones the athlete never ran through the timer.
//
// Deliberately SEPARATE from the live PostWorkoutSummaryView: that view is an
// input form (RPE picker, manual fields, GUARDAR) tied to the save path. Keeping
// the read-only display apart means the active-workout / timer / gate paths are
// untouched — zero regression risk to the prescribed and free-workout flows.
struct ExecutedWorkoutView: View {
    let assignmentId: String
    let fallbackTitle: String?
    let bearer: String?
    let onClose: () -> Void

    @State private var detail: AssignmentDetail?
    @State private var loadFailed = false
    @State private var showCapture = false

    private var execution: ExecutionSummary? { detail?.execution }
    private var isPartial: Bool { execution?.isPartial ?? false }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            if let detail {
                content(detail)
            } else if loadFailed {
                failed
            } else {
                loading
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task { await load() }
        .fullScreenCover(isPresented: $showCapture) {
            WorkoutCaptureView(
                assignmentId: assignmentId,
                sessionTitle: detail?.workout?.name ?? fallbackTitle,
                bearer: bearer,
                onClose: { showCapture = false },
                onSaved: {
                    showCapture = false
                    // Re-pull the detail so the just-confirmed result replaces what
                    // was shown (new splits / time / source).
                    Task { await reload() }
                }
            )
        }
    }

    // MARK: - Top bar (title + close)
    private var topBar: some View {
        HStack(spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: isPartial ? "Entreno · parcial" : "Entreno · hecho",
                          color: isPartial ? Theme.Color.warning : Theme.Color.ok,
                          size: 10)
                Text(detail?.workout?.name ?? fallbackTitle ?? "Entreno")
                    .font(.system(size: 20, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: Theme.Spacing.s)
            Button {
                Haptics.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 36, height: 36)
                    .background(Theme.Color.surfaceElevated)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.s)
    }

    // MARK: - Content
    @ViewBuilder
    private func content(_ detail: AssignmentDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                headerCard
                aggregateTiles
                if let segments = perSegmentRows, !segments.isEmpty {
                    segmentsTable(segments)
                }
                if let notes = execution?.notes, !notes.isEmpty {
                    notesCard(notes)
                }
                screenshotEntry
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
        }
    }

    // MARK: - Header (big time + completeness mark + score)
    private var headerCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Image(systemName: isPartial ? "circle.lefthalf.filled" : "checkmark")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(isPartial ? Theme.Color.warning : Theme.Color.ok)
                    if let total = execution?.totalDurationSeconds, total > 0 {
                        HeroNumber(text: WorkoutSession.formatElapsed(Double(total)), size: 34)
                    } else if let score = execution?.scoreLabel {
                        HeroNumber(text: score, size: 30)
                    } else {
                        Text(isPartial ? "Terminado antes" : "Completado")
                            .font(.system(size: 20, weight: .heavy, design: .default).italic())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer()
                }
                if let when = whenLabel {
                    Text(when)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    // MARK: - Aggregate tiles (score · RPE · provenance)
    private var aggregateTiles: some View {
        let cols = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]
        return LazyVGrid(columns: cols, spacing: 6) {
            if let score = execution?.scoreLabel, execution?.totalDurationSeconds != nil {
                ExpertCell(label: "Resultado", value: score, color: Theme.Color.accentText)
            }
            if let rpe = execution?.perceivedExertion {
                ExpertCell(label: "RPE", value: "\(rpe)", unit: "/10")
            }
            if let src = sourceLabel {
                ExpertCell(label: "Registro", value: src)
            }
        }
    }

    // MARK: - Per-segment table (prescrito → hecho)
    private func segmentsTable(_ rows: [SegmentRowVM]) -> some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Por segmento", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Hairline().opacity(0.5) }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(row.name)
                            .scaledFont(12, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        MonoText(
                            text: row.result,
                            size: 11,
                            color: row.hasResult ? Theme.Color.muted : Theme.Color.faint
                        )
                        .multilineTextAlignment(.trailing)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 9)
                }
            }
        }
    }

    // MARK: - Notes
    private func notesCard(_ notes: String) -> some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Notas", size: 9)
                Text(notes)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
    }

    // MARK: - Screenshot entry point (LIVE — Idea 1)
    //
    // The ENTRY POINT lives where it belongs (inside the done-workout detail):
    // tap → pick a screenshot of another app's summary → the IA reads it → the
    // athlete reviews/corrects → confirm re-logs the result through the honest
    // path. Useful here to CORRECT or enrich an already-logged session with the
    // real device numbers.
    private var screenshotEntry: some View {
        Button {
            Haptics.light()
            showCapture = true
        } label: {
            CardSurface(padding: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Subir captura de otra app")
                            .font(.system(size: 14, weight: .heavy, design: .default).italic())
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Garmin, Strava, Concept2… la leemos por ti.")
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityHint("Sube una captura y la IA rellena el resultado")
    }

    // MARK: - Loading / failed
    private var loading: some View {
        VStack { Spacer(); ProgressView().tint(Theme.Color.accent); Spacer() }
            .frame(maxWidth: .infinity)
    }

    private var failed: some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer()
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("No pudimos cargar tu entreno")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            PrimaryButton(title: "Reintentar") {
                loadFailed = false
                Task { await load() }
            }
            .frame(maxWidth: 280)
            Spacer()
        }
        .padding(Theme.Spacing.xl)
    }

    // MARK: - Data load (cache-first, then network)
    private func load() async {
        if detail != nil { return }
        // Accept ANY cached copy for an instant paint, then refresh from the
        // network below. The previous `cached.execution != nil` gate made this
        // view the ONLY surface that rejected a cache the brief/list accept — so
        // when the cache was written pre-completion (execution == nil) a transient
        // network failure dropped straight to "No pudimos cargar tu entreno" while
        // the SAME day still opened elsewhere. The view renders fine without an
        // execution (header shows "Completado"); the refresh fills the numbers.
        if let cached = AssignmentDetailCache.load(assignmentId) {
            detail = cached
        }
        guard let bearer else {
            if detail == nil { loadFailed = true }
            return
        }
        do {
            let fetched = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
            AssignmentDetailCache.save(fetched)
            detail = fetched
            loadFailed = false
        } catch {
            if detail == nil { loadFailed = true }
        }
    }

    // Force a refresh after a capture-confirm (the `load()` short-circuit on a
    // present detail would otherwise keep the stale copy). Best-effort: a network
    // failure leaves the prior detail on screen rather than wiping it.
    private func reload() async {
        guard let bearer else { return }
        if let fetched = try? await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer) {
            AssignmentDetailCache.save(fetched)
            detail = fetched
        }
    }

    // MARK: - Derived display

    private var whenLabel: String? {
        guard let iso = execution?.endedAt else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d MMM · HH:mm"
        return f.string(from: date)
    }

    private var sourceLabel: String? {
        switch execution?.source {
        case "manual":    return "A mano"
        case "healthkit": return "Apple"
        case "garmin":    return "Garmin"
        case "concept2":  return "PM5"
        case "polar":     return "Polar"
        case "coros":     return "Coros"
        case .some(let s) where !s.isEmpty: return s.capitalized
        default:          return nil
        }
    }

    // Join the prescribed items (workout blocks) with the logged actuals by uid,
    // so each row reads "ejercicio · lo que hizo". Falls back to listing unmatched
    // actuals (a free workout / lap with no template item) so nothing is dropped.
    private var perSegmentRows: [SegmentRowVM]? {
        guard let exec = execution else { return nil }
        let actualsByUid: [String: SegmentActualDTO] = Dictionary(
            exec.segments.compactMap { seg in seg.itemUid.map { ($0, seg) } },
            uniquingKeysWith: { a, _ in a }
        )

        var rows: [SegmentRowVM] = []
        var usedUids = Set<String>()
        if let blocks = detail?.workout?.blocks {
            for block in blocks {
                for item in block.items {
                    let actual = actualsByUid[item.uid]
                    if actual != nil { usedUids.insert(item.uid) }
                    let tokens = actual.map(Self.tokens) ?? []
                    rows.append(
                        SegmentRowVM(
                            id: item.uid,
                            name: item.exerciseName,
                            result: tokens.isEmpty ? "—" : tokens.joined(separator: " · "),
                            hasResult: !tokens.isEmpty
                        )
                    )
                }
            }
        }

        // Unmatched actuals (no prescription item — e.g. a free-workout lap) —
        // surface them honestly rather than dropping the athlete's real data.
        for seg in exec.segments {
            if let uid = seg.itemUid, usedUids.contains(uid) { continue }
            let tokens = Self.tokens(seg)
            if tokens.isEmpty { continue }
            rows.append(
                SegmentRowVM(
                    id: "seg-\(seg.position)",
                    name: Theme.Modality.label(seg.modality),
                    result: tokens.joined(separator: " · "),
                    hasResult: true
                )
            )
        }
        return rows.isEmpty ? nil : rows
    }

    // Build the human "hecho" tokens for one logged segment (mirrors the coach
    // SessionDetailDrawer chips). Reps × weight, distance, pace, duration, HR.
    private static func tokens(_ a: SegmentActualDTO) -> [String] {
        var t: [String] = []
        if let reps = a.repsCompleted {
            if let kg = a.weightUsedKg, kg > 0 {
                t.append("\(reps) × \(formatKg(kg)) kg")
            } else {
                t.append("\(reps) reps")
            }
        }
        if let d = a.distanceMeters, d > 0 {
            t.append(d >= 1000 ? String(format: "%.1f km", d / 1000) : "\(Int(d)) m")
        }
        if let p = a.avgPaceSPer500m, p > 0 {
            t.append("\(PrescriptionRenderer.formatPace(Int(p)))/500m")
        } else if let p = a.avgPaceSPerKm, p > 0 {
            t.append("\(PrescriptionRenderer.formatPace(Int(p)))/km")
        }
        if a.repsCompleted == nil, a.distanceMeters == nil, let dur = a.durationSeconds, dur > 0 {
            t.append(WorkoutSession.formatElapsed(Double(dur)))
        }
        if let hr = a.avgHr { t.append("\(hr) ppm") }
        return t
    }

    private static func formatKg(_ kg: Double) -> String {
        kg == kg.rounded() ? String(Int(kg)) : String(format: "%.1f", kg)
    }

    struct SegmentRowVM: Identifiable {
        let id: String
        let name: String
        let result: String
        let hasResult: Bool
    }
}
