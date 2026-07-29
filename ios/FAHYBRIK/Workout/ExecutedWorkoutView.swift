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
    /// Fired when the detail fetch reports the assignment no longer resolves
    /// (HTTP 404): the id the app held is STALE — the plan changed server-side —
    /// so the presenter re-syncs to the authoritative plan (re-pulls /plan/week)
    /// and the day resolves to its current `wa.id` on the next open. Optional so
    /// existing call sites that don't yet re-sync compile unchanged.
    var onStale: (() -> Void)? = nil

    @State private var detail: AssignmentDetail?
    @State private var loadFailed = false
    /// The CONCRETE cause behind `loadFailed` (HTTP status / decode error / network),
    /// shown under the headline and logged — so a real failure is never anonymous.
    @State private var failureReason: String?
    @State private var showCapture = false

    private var execution: ExecutionSummary? { detail?.execution }
    private var isPartial: Bool { execution?.isPartial ?? false }

    // Retry budget for the detail fetch. A serverless cold start (the demo's known
    // cause) or a brief network blip produces a one-off failure on this screen, so
    // we retry a couple of times with a short, growing backoff BEFORE ever showing
    // the error state. Deterministic failures (4xx, decode) are NOT retried — a
    // re-fetch can't fix them and would only delay surfacing the real reason.
    private static let maxFetchAttempts = 3
    private static let retryBackoff: [Duration] = [.milliseconds(400), .milliseconds(900)]

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
    //
    // The order is the order of the questions the athlete arrives with, not the
    // order of the columns in the table:
    //
    //   1. ¿qué he hecho?      → the headline work + when
    //   2. ¿qué tal?           → the numbers that judge it (pace, HR, power…)
    //   3. ¿cómo lo repartí?   → zones, per-leg breakdown, splits
    //   4. ¿cómo me sentí?     → RPE / difficulty / niggle — the athlete's own read
    //   5. ¿qué anoté?         → notes
    //   6. ¿de dónde sale?     → provenance, last: it's a trust stamp, not a stat
    //
    // Every section is gated on data that genuinely exists for THIS execution.
    // Nothing is padded to fill the screen and nothing is invented — a session
    // with no strap simply has no heart-rate block, and says so nowhere.
    @ViewBuilder
    private func content(_ detail: AssignmentDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                headerCard
                if !effortMetrics.isEmpty { effortTiles }
                if !zoneDistribution.isEmpty { zonesCard }
                // #64 — the outdoor run's route, when this session was run outside.
                if let route = execution?.routePolyline, PolylineCodec.pointCount(route) >= 2 {
                    routeMapCard(route)
                }
                if let segments = perSegmentRows, !segments.isEmpty {
                    segmentsTable(segments)
                }
                // #33 — the PM5 interval table (ErgData-style) for each erg segment
                // whose monitor reported splits.
                ForEach(ergIntervalSegments) { seg in
                    ergIntervalsCard(seg)
                }
                feedbackCard
                if let notes = execution?.notes, !notes.isEmpty {
                    notesCard(notes)
                }
                provenanceCard
                // Only offered when there's something it could actually add. On a
                // session a PM5 already fed, inviting a screenshot of another app
                // is noise next to better data we already hold.
                if canEnrichWithScreenshot { screenshotEntry }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
        }
    }

    // #64 — the executed outdoor run's route, decoded from the stored polyline.
    private func routeMapCard(_ polyline: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Tu recorrido", size: 11)
            RouteMiniMap(polyline: polyline)
                .frame(height: 180)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Header — WHAT was done, then how long, then when
    //
    // The headline is the number that ANSWERS the session, which is not always
    // the clock: an AMRAP is its rounds, a For Time its final time, an EMOM the
    // rounds it survived, a row/ski/run the distance covered. Leading with the
    // elapsed clock on a 5×500 hides the only figure the athlete cares about.
    // Duration never disappears — it moves to the supporting line when something
    // more meaningful takes the headline.
    private var headerCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Image(systemName: isPartial ? "circle.lefthalf.filled" : "checkmark")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(isPartial ? Theme.Color.warning : Theme.Color.ok)
                    VStack(alignment: .leading, spacing: 2) {
                        HeroNumber(text: headline.value, size: headline.value.count > 8 ? 28 : 34)
                        LabelText(text: headline.caption, size: 9)
                    }
                    Spacer(minLength: 0)
                }
                if let support = headlineSupport {
                    MonoText(text: support, size: 12, color: Theme.Color.muted)
                }
                if let when = whenLabel {
                    Text(when)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    /// The headline number + what it is. Falls all the way back to the honest
    /// "Completado" when the session recorded no figure at all.
    private var headline: (value: String, caption: String) {
        if let score = execution?.scoreLabel, !score.isEmpty {
            return (score, "resultado")
        }
        if let rounds = emomRounds {
            return (rounds.prescribed.map { "\(rounds.completed)/\($0)" } ?? "\(rounds.completed)", "rondas")
        }
        if let d = totalDistanceMeters, d > 0 {
            return (Self.formatDistance(d), "distancia")
        }
        if let total = execution?.totalDurationSeconds, total > 0 {
            return (Formato.clock(Double(total)), "duración")
        }
        return (isPartial ? "Terminado antes" : "Completado", "estado")
    }

    /// The second line: whatever the headline did NOT already say. Duration is
    /// kept whenever it isn't the headline, so it is never lost.
    private var headlineSupport: String? {
        var parts: [String] = []
        if headline.caption != "duración", let total = execution?.totalDurationSeconds, total > 0 {
            parts.append(Formato.clock(Double(total)))
        }
        if headline.caption != "distancia", let d = totalDistanceMeters, d > 0 {
            parts.append(Self.formatDistance(d))
        }
        if let pace = headlinePace { parts.append(pace) }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
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
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.name)
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.foreground)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            // Which kit measured THIS leg. Only when the session
                            // used more than one, otherwise it repeats the footer
                            // on every row for nothing.
                            if let device = row.device, deviceLabels.count > 1 {
                                LabelText(text: device, size: 8)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
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

    // MARK: - Erg interval table (#33 — ErgData-style)

    // Erg segments (row / ski / bike) whose monitor reported a split table.
    private var ergIntervalSegments: [SegmentActualDTO] {
        (execution?.segments ?? []).filter { seg in
            ["row", "ski", "bike"].contains(seg.modality) && (seg.ergSplits?.isEmpty == false)
        }
    }

    private func ergIntervalsCard(_ seg: SegmentActualDTO) -> some View {
        let splits = seg.ergSplits ?? []
        return CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    LabelText(text: "Intervalos · \(ergTitle(seg))", size: 9)
                    Spacer(minLength: 6)
                    if let df = seg.dragFactor {
                        MonoText(text: "drag \(df)", size: 10, color: Theme.Color.muted)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                Hairline()
                ergHeaderRow
                ForEach(splits) { s in
                    Hairline().opacity(0.4)
                    ergDataRow(s)
                }
                if let footer = ergFooterText(seg) {
                    Hairline()
                    HStack {
                        Spacer(minLength: 0)
                        MonoText(text: footer, size: 10, color: Theme.Color.muted)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                }
            }
        }
    }

    // Column header: #, time, distance, /500m, spm, calories — the ErgData columns.
    private var ergHeaderRow: some View {
        HStack(spacing: 6) {
            ergCol("#", fixed: true, .leading)
            ergCol("Tiempo", .trailing)
            ergCol("Dist", .trailing)
            ergCol(Formato.UnidadRitmo.por500m.rawValue, .trailing)
            ergCol("s/m", .trailing)
            ergCol("Cal", .trailing)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    private func ergDataRow(_ s: ErgSplitActual) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                ergVal("\(s.index)", fixed: true, .leading, accent: true)
                ergVal(s.timeSeconds.map { Formato.clock($0) } ?? "—", .trailing)
                ergVal(s.distanceMeters.map { "\(Int($0))" } ?? "—", .trailing)
                ergVal(s.avgPaceSPer500m.map { Formato.ritmoCifras(Double(Int($0.rounded()))) } ?? "—", .trailing)
                ergVal(s.strokeRateSpm.map { "\($0)" } ?? "—", .trailing)
                ergVal(s.calories.map { "\($0)" } ?? "—", .trailing)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            // Rest interval (only on interval workouts) as a quiet sub-line.
            if let rt = s.restTimeSeconds, rt > 0 {
                HStack(spacing: 4) {
                    Spacer(minLength: 0)
                    MonoText(
                        text: "descanso \(Formato.clock(rt))" + (restDistanceLabel(s)),
                        size: 9,
                        color: Theme.Color.faint
                    )
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 7)
            }
        }
    }

    private func restDistanceLabel(_ s: ErgSplitActual) -> String {
        guard let rd = s.restDistanceMeters, rd > 0 else { return "" }
        return " · \(Int(rd)) m"
    }

    // A narrow fixed "#" column keeps the numbers from crowding; the rest share the
    // remaining width equally.
    private static let ergIndexColWidth: CGFloat = 22

    @ViewBuilder
    private func ergCol(_ text: String, fixed: Bool = false, _ align: Alignment) -> some View {
        let label = Text(text)
            .font(.system(size: 9, weight: .heavy, design: .default))
            .tracking(0.4)
            .foregroundStyle(Theme.Color.faint)
        if fixed {
            label.frame(width: Self.ergIndexColWidth, alignment: align)
        } else {
            label.frame(maxWidth: .infinity, alignment: align)
        }
    }

    @ViewBuilder
    private func ergVal(_ text: String, fixed: Bool = false, _ align: Alignment, accent: Bool = false) -> some View {
        let val = MonoText(text: text, size: 11, color: accent ? Theme.Color.accentText : Theme.Color.foreground)
        if fixed {
            val.frame(width: Self.ergIndexColWidth, alignment: align)
        } else {
            val.frame(maxWidth: .infinity, alignment: align)
        }
    }

    // "Remo · 2000 m" / "Ski" — modality label plus the covered distance when known.
    private func ergTitle(_ seg: SegmentActualDTO) -> String {
        let label = Theme.Modality.label(seg.modality)
        if let d = seg.distanceMeters, d > 0 { return "\(label) · \(Int(d)) m" }
        return label
    }

    // Footer summary: average burn rate + handle force when the monitor reported them.
    private func ergFooterText(_ seg: SegmentActualDTO) -> String? {
        var parts: [String] = []
        if let ch = seg.avgCaloriesPerHour, ch > 0 { parts.append("\(Int(ch)) cal/h") }
        if let f = seg.avgDriveForceLbs, f > 0 { parts.append("fuerza \(Int(f)) lbs") }
        if let p = seg.peakDriveForceLbs, p > 0 { parts.append("pico \(Int(p))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
            if let failureReason {
                Text(failureReason)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Theme.Spacing.m)
            }
            PrimaryButton(title: "Reintentar") {
                loadFailed = false
                failureReason = nil
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
            if detail == nil { fail(reason: "Sin sesión.") }
            return
        }

        // Retry the fetch a couple of times on a TRANSIENT failure (network blip /
        // serverless cold start) before giving up — these blips are the known cause
        // of the spurious "No pudimos cargar" on a workout that loads fine on a
        // second tap. A deterministic failure (4xx, decode) breaks out immediately
        // so its real reason surfaces without delay.
        var lastError: Error?
        for attempt in 0..<Self.maxFetchAttempts {
            do {
                let fetched = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
                AssignmentDetailCache.save(fetched)
                detail = fetched
                loadFailed = false
                failureReason = nil
                return
            } catch {
                lastError = error
                guard Self.isTransient(error), attempt < Self.maxFetchAttempts - 1 else { break }
                try? await Task.sleep(for: Self.retryBackoff[min(attempt, Self.retryBackoff.count - 1)])
            }
        }

        // Exhausted the budget (or hit a deterministic failure). Keep any cached
        // detail painted — only drop to the error state when there's nothing to
        // show — and surface + log the concrete reason instead of a blank message.
        if let lastError {
            // AUDIT-B6 — the concrete reason surfaces in the UI (failureReason below);
            // no console print (was DEBUG-only, removed per the no-print rule).
            // STALE ID (404): the assignment no longer resolves — the plan moved
            // server-side, so the id carried from the week payload is dead. Drop
            // its cached body and ask the presenter to re-sync to the authoritative
            // plan (/plan/week) so the day resolves to its CURRENT wa.id on re-open.
            // This is the honest recovery for a shifted id — never a dead-end on a
            // raw "HTTP 404".
            if case APIError.http(404, _) = lastError {
                AssignmentDetailCache.remove(assignmentId)
                onStale?()
            }
            if detail == nil { fail(reason: Self.describe(lastError)) }
        }
    }

    /// Set the error state with its concrete reason in one place (DRY).
    private func fail(reason: String) {
        failureReason = reason
        loadFailed = true
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

    // MARK: - Failure classification

    /// Is this a TRANSIENT blip worth retrying (network drop / serverless cold
    /// start → 5xx / unexpected non-HTTP response), versus a DETERMINISTIC failure
    /// (4xx, undecodable body) a re-fetch can't fix? Only the former is retried.
    private static func isTransient(_ error: Error) -> Bool {
        switch error {
        case let APIError.http(status, _): return status >= 500
        case APIError.invalidResponse:     return true
        case APIError.offline:             return true
        case is URLError:                  return true
        default:                           return false
        }
    }

    /// Compact, readable reason for the failure — shown under the headline and
    /// logged. Mirrors the APIError→copy mapping used at the auth surfaces so the
    /// concrete cause is never swallowed into an anonymous "No pudimos cargar".
    private static func describe(_ error: Error) -> String {
        switch error {
        // 404 = the assignment no longer resolves (the plan moved server-side and
        // the id is stale). Athlete-facing + actionable: we've re-synced the plan
        // (onStale), so closing and re-opening the day finds its current session.
        case APIError.http(404, _):         return "Esta sesión ya no está en tu plan. Lo hemos actualizado — cierra y vuelve a abrirla."
        case let APIError.http(status, _):  return "Error del servidor (\(status)). Inténtalo de nuevo."
        case let APIError.decoding(inner):  return "decode: \(decodeReason(inner))"
        case APIError.invalidResponse:      return "respuesta no válida del servidor"
        case APIError.offline:              return "sin conexión"
        case let urlError as URLError:      return "red: \(urlError.localizedDescription)"
        default:                            return error.localizedDescription
        }
    }

    /// Pull the diagnostic essence out of a `DecodingError` (the field + path that
    /// failed) instead of its near-useless `localizedDescription`, so a real schema
    /// mismatch is identifiable from the error state / log.
    private static func decodeReason(_ error: Error) -> String {
        guard let dec = error as? DecodingError else { return error.localizedDescription }
        let path: (DecodingError.Context) -> String = { ctx in
            ctx.codingPath.map(\.stringValue).joined(separator: ".")
        }
        switch dec {
        case let .keyNotFound(key, ctx):  return "falta '\(key.stringValue)' (\(path(ctx)))"
        case let .typeMismatch(_, ctx):   return "tipo en \(path(ctx)): \(ctx.debugDescription)"
        case let .valueNotFound(_, ctx):  return "nulo en \(path(ctx))"
        case let .dataCorrupted(ctx):     return ctx.debugDescription
        @unknown default:                 return dec.localizedDescription
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

    // MARK: - Provenance
    //
    // Two different questions, and conflating them is what made this screen lie.
    // A session run live in the app with a PM5 attached was stored as
    // source='manual' and shown as "Registro: A mano" — the opposite of what
    // happened. `recordedVia` answers HOW the record was made; the device names
    // answer WHERE the numbers came from. Both, or neither, but never one
    // pretending to be the other.

    /// "Hecho en la app" | "Añadido a mano" | "Importado". Nil on rows written
    /// before the split, where the honest answer is to say nothing.
    private var recordedViaLabel: String? {
        switch execution?.recordedVia {
        case "live":     return "Hecho en la app"
        case "manual":   return "Añadido a mano"
        case "imported": return "Importado"
        default:         return nil
        }
    }

    /// Human names for every device that fed this session, de-duplicated and in
    /// a stable order. Empty when nothing was connected — which the card states
    /// outright rather than leaving a blank row.
    private var deviceLabels: [String] {
        var seen = Set<String>()
        var out: [String] = []
        // Prefer the execution-level roll-up; fall back to the per-leg sources so
        // an older payload (rolled up server-side only from mig 0144) still names
        // the hardware it actually used.
        let raw = execution?.contributingSources.isEmpty == false
            ? (execution?.contributingSources ?? [])
            : (execution?.segments ?? []).compactMap(\.source)
        for value in raw {
            guard let name = Self.deviceName(value), seen.insert(name).inserted else { continue }
            out.append(name)
        }
        return out
    }

    /// One device token → the name the athlete calls it. Returns nil for tokens
    /// that are NOT devices ("manual", "demo"): those must not appear as kit.
    private static func deviceName(_ raw: String) -> String? {
        switch raw {
        case "concept2", "pm5": return "PM5"
        case "treadmill":       return "Cinta"
        case "gps":             return "GPS"
        case "healthkit":       return "Apple Watch"
        case "garmin":          return "Garmin"
        case "polar":           return "Polar"
        case "coros":           return "Coros"
        case "wahoo":           return "Wahoo"
        case "suunto":          return "Suunto"
        case "whoop":           return "Whoop"
        case "oura":            return "Oura"
        case "amazfit":         return "Amazfit"
        case "manual", "demo":  return nil
        default:                return raw.capitalized
        }
    }

    /// The trust stamp, at the FOOT of the screen: how this got recorded and what
    /// measured it. Deliberately not a headline tile — provenance is what you
    /// check when a number surprises you, not what you came to read.
    @ViewBuilder
    private var provenanceCard: some View {
        if recordedViaLabel != nil || !deviceLabels.isEmpty {
            CardSurface(padding: 10) {
                VStack(alignment: .leading, spacing: 7) {
                    LabelText(text: "Registro", size: 9)
                    if let via = recordedViaLabel {
                        Text(via)
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    if deviceLabels.isEmpty {
                        Text("Sin aparatos conectados: los números son los que anotaste tú.")
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        HStack(spacing: 6) {
                            ForEach(deviceLabels, id: \.self) { name in
                                Text(name)
                                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                                    .foregroundStyle(Theme.Color.accentText)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(
                                        Capsule().fill(Theme.Color.surfaceElevated)
                                    )
                            }
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Aparatos: \(deviceLabels.joined(separator: ", "))")
                    }
                }
            }
        }
    }

    /// A screenshot can only ADD something when no device measured the session.
    /// With a PM5 or a belt already feeding it, the offer is clutter.
    private var canEnrichWithScreenshot: Bool { deviceLabels.isEmpty }

    // MARK: - Derived metrics (aggregated across the logged legs)

    /// Total metres covered across every leg that measured distance.
    private var totalDistanceMeters: Double? {
        let sum = (execution?.segments ?? []).compactMap(\.distanceMeters).reduce(0, +)
        return sum > 0 ? sum : nil
    }

    /// The pace of the leg that dominates the session (the longest one), in that
    /// leg's own convention — /500m for an erg, /km for a run.
    private var headlinePace: String? {
        let legs = (execution?.segments ?? [])
            .sorted { ($0.durationSeconds ?? 0) > ($1.durationSeconds ?? 0) }
        guard let leg = legs.first else { return nil }
        if let p = leg.avgPaceSPer500m, p > 0 {
            return "\(Formato.ritmoCifras(Double(Int(p.rounded()))))/500m"
        }
        if let p = leg.avgPaceSPerKm, p > 0 {
            return "\(Formato.ritmoCifras(Double(Int(p.rounded()))))/km"
        }
        return nil
    }

    /// EMOM rounds actually completed vs prescribed, when this session ran one.
    /// The single figure that says how an EMOM went, and it was invisible here.
    private var emomRounds: (completed: Int, prescribed: Int?)? {
        guard let leg = (execution?.segments ?? []).first(where: { $0.emomRoundsCompleted != nil }),
              let done = leg.emomRoundsCompleted
        else { return nil }
        return (done, leg.emomRoundsPrescribed)
    }

    /// Session average of a per-leg metric, WEIGHTED BY EACH LEG'S DURATION.
    ///
    /// A mean of means says a 3′ calentamiento a 105 counts as much as 40′ de
    /// principal a 168: 3+40+5 min gave 128 ppm where the session really averaged
    /// ~157. Σ(valor × segundos) / Σ(segundos) is the only average that matches
    /// what the athlete's heart did. A leg with no duration carries no weight we can
    /// trust, so it is left out; if NO leg carries one, the plain mean is all the
    /// data allows and we say so rather than dropping the metric.
    private func weightedLegAverage(_ metric: (SegmentActualDTO) -> Double?) -> Double? {
        let legs = (execution?.segments ?? []).compactMap { seg -> (value: Double, seconds: Double)? in
            guard let v = metric(seg) else { return nil }
            return (v, Double(max(0, seg.durationSeconds ?? 0)))
        }
        guard !legs.isEmpty else { return nil }
        let totalSeconds = legs.reduce(0) { $0 + $1.seconds }
        guard totalSeconds > 0 else {
            return legs.reduce(0) { $0 + $1.value } / Double(legs.count)
        }
        return legs.reduce(0) { $0 + $1.value * $1.seconds } / totalSeconds
    }

    private var avgHrBpm: Int? {
        weightedLegAverage { $0.avgHr.map(Double.init) }.map { Int($0.rounded()) }
    }
    private var maxHrBpm: Int? { (execution?.segments ?? []).compactMap(\.maxHr).max() }

    private var totalCalories: Double? {
        let sum = (execution?.segments ?? []).compactMap(\.calories).reduce(0, +)
        return sum > 0 ? sum : nil
    }

    private var avgPowerW: Double? {
        weightedLegAverage { ($0.avgPowerW ?? 0) > 0 ? $0.avgPowerW : nil }
    }

    private var avgStrokeRate: Double? {
        weightedLegAverage { ($0.strokeRateSpm ?? 0) > 0 ? $0.strokeRateSpm : nil }
    }

    /// The "how did it go" numbers, built ONLY from what was measured. An empty
    /// array means the block isn't drawn at all — no grid of dashes.
    private var effortMetrics: [(label: String, value: String, unit: String)] {
        var out: [(String, String, String)] = []
        if let hr = avgHrBpm { out.append((Vocab.fcMedia, "\(hr)", Vocab.ppm)) }
        if let hr = maxHrBpm { out.append((Vocab.fcMax, "\(hr)", Vocab.ppm)) }
        if let p = avgPowerW { out.append(("Potencia", "\(Int(p.rounded()))", "W")) }
        if let s = avgStrokeRate { out.append(("Ritmo de palada", "\(Int(s.rounded()))", "s/m")) }
        if let c = totalCalories { out.append(("Calorías", "\(Int(c.rounded()))", "kcal")) }
        return out
    }

    private var effortTiles: some View {
        let cols = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]
        return LazyVGrid(columns: cols, spacing: 6) {
            ForEach(effortMetrics, id: \.label) { m in
                ExpertCell(label: m.label, value: m.value, unit: m.unit)
            }
        }
    }

    // MARK: - Heart-rate zones
    //
    // The live summary has shown this bar since day one; the log — the surface
    // you actually revisit — threw it away. Same reading, same colours.

    private var zoneDistribution: [(zone: HRZone, pct: Int)] {
        var totals: [Int: Int] = [:]
        for seg in execution?.segments ?? [] {
            for (key, seconds) in seg.zoneSeconds ?? [:] {
                guard let n = Int(key.dropFirst()), key.hasPrefix("z"), HRZone(rawValue: n) != nil else { continue }
                totals[n, default: 0] += seconds
            }
        }
        let total = totals.values.reduce(0, +)
        guard total > 0 else { return [] }
        return HRZone.allCases.map { z in (z, Int((Double(totals[z.rawValue] ?? 0) / Double(total) * 100).rounded())) }
    }

    private var zonesCard: some View {
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
                        MonoText(text: "\(z.zone.label) \(z.pct)%", size: 9, color: z.zone.color)
                        if z.zone != .z5 { Spacer() }
                    }
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "Zonas: " + zoneDistribution.map { "\($0.zone.label) \($0.pct) por ciento" }.joined(separator: ", ")
            )
        }
    }

    // MARK: - "Cómo fue" — the athlete's own read
    //
    // RPE, how hard it felt against the prescription, and any niggle. The last
    // two are collected at save time (#58) and were stored and never shown back.
    // RPE that was never answered reads "—", never a number nobody chose.

    @ViewBuilder
    private var feedbackCard: some View {
        let difficulty = difficultyLabel
        let pain = painLabel
        if execution?.perceivedExertion != nil || difficulty != nil || pain != nil {
            CardSurface(padding: 10) {
                VStack(alignment: .leading, spacing: 8) {
                    LabelText(text: "Cómo fue", size: 9)
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                MonoText(
                                    text: execution?.perceivedExertion.map { "\($0)" } ?? "—",
                                    size: 22,
                                    weight: .heavy,
                                    color: execution?.perceivedExertion == nil
                                        ? Theme.Color.faint : Theme.Color.foreground
                                )
                                if execution?.perceivedExertion != nil {
                                    MonoText(text: "/10", size: 11, color: Theme.Color.muted)
                                }
                            }
                            LabelText(
                                text: execution?.perceivedExertion == nil ? "RPE · sin registrar" : "RPE",
                                size: 9
                            )
                        }
                        if let difficulty {
                            Spacer(minLength: 0)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(difficulty)
                                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                                    .foregroundStyle(Theme.Color.foreground)
                                LabelText(text: "Dificultad", size: 9)
                            }
                        }
                    }
                    if let pain {
                        Hairline()
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "bandage")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Theme.Color.warning)
                            Text(pain)
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    /// #58 difficulty against what was prescribed — read through the SAME enum
    /// the save form writes, so the wording can never drift between the two.
    private var difficultyLabel: String? {
        execution?.perceivedDifficulty.flatMap(PerceivedDifficulty.init(rawValue:))?.label
    }

    /// The niggle the athlete flagged: area, plus their note when they wrote one.
    private var painLabel: String? {
        let area = execution?.painArea?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let note = execution?.painNote?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !area.isEmpty || !note.isEmpty else { return nil }
        let name = area.isEmpty ? "Molestia" : (PainArea(rawValue: area)?.label ?? area)
        return note.isEmpty ? name : "\(name) · \(note)"
    }

    /// "1,01 km" past a kilometre, plain metres below it. Decía ser «el ÚNICO
    /// formateador de distancia» — de esta PANTALLA, que es justo el alcance que
    /// dejó que cada pantalla tuviera el suyo. Ahora es el de la app.
    static func formatDistance(_ meters: Double) -> String {
        Formato.distanciaCubierta(meters) ?? "0 m"
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
                            hasResult: !tokens.isEmpty,
                            device: actual?.source.flatMap(Self.deviceName)
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
                    hasResult: true,
                    device: seg.source.flatMap(Self.deviceName)
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
            t.append(formatDistance(d))
        }
        if let p = a.avgPaceSPer500m, p > 0 {
            t.append("\(Formato.ritmoCifras(Double(Int(p))))/500m")
        } else if let p = a.avgPaceSPerKm, p > 0 {
            t.append("\(Formato.ritmoCifras(Double(Int(p))))/km")
        }
        // Average incline / cadence over the segment (#62). Shown only when the
        // source (treadmill / wearable) actually reported them — never a fake 0.
        if let inc = a.inclinePct, inc > 0 {
            t.append("\(Formato.esDecimal(inc))% incl.")
        }
        if let cad = a.runCadenceSpm, cad > 0 {
            t.append("cad. \(cad)")
        }
        if a.repsCompleted == nil, a.distanceMeters == nil, let dur = a.durationSeconds, dur > 0 {
            t.append(Formato.clock(Double(dur)))
        }
        if let hr = a.avgHr { t.append("\(hr) ppm") }
        return t
    }

    private static func formatKg(_ kg: Double) -> String { Formato.esDecimal(kg) }

    struct SegmentRowVM: Identifiable {
        let id: String
        let name: String
        let result: String
        let hasResult: Bool
        /// Human name of the kit that measured this leg; nil when none did.
        var device: String? = nil
    }
}
