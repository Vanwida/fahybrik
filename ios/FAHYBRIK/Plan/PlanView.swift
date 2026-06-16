import SwiftUI

// Plan tab — macro strip + week-day selector + the SELECTED day's programming
// inline.
//
// UX model (Alex, 2026-06-05): the horizontal day pills are the week selector;
// directly below we show ONLY the selected day's session — header, EMPEZAR, and
// the full programming (coach note + stations + blocks/items). No duplicated
// hero, no vertical all-days list: the pills already convey per-day status
// (done ✓ / scheduled • / rest), so the week is fully navigable from them.
//
// Weekly summary comes from `GET /api/athlete/plan/week`. The per-session detail
// (blocks, items, params) is fetched lazily for the selected day via
// `GET /api/athlete/assignments/{id}/detail`, primed from cache for instant
// switches. No mocked warmup / zones / coach note: if we don't have it, we don't
// show it.
struct PlanView: View {
    var bearer: String? = nil
    @State private var selectedDay: Int = 0
    @State private var week: PlanWeek? = nil
    @State private var macroLabel: String? = nil
    @State private var macroWeeks: [AthleteMacroProgressWeek] = []
    @State private var aEventDays: Int? = nil
    @State private var loading = true
    @State private var loadFailed = false
    @State private var showChat: Bool = false
    @State private var partner: PartnerInfo? = nil

    // Selected-day session detail (rendered inline under the selector).
    @State private var detail: AssignmentDetail? = nil
    @State private var detailLoading = false
    @State private var detailError: SessionDetailError? = nil
    @State private var showWorkout = false

    private let daysES = ["L", "M", "X", "J", "V", "S", "D"]

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if loading {
                ProgressView()
                    .tint(Theme.Color.accent)
            } else if let week, week.hasAnySession {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        headerRow
                        if !macroWeeks.isEmpty {
                            macroProgressStrip
                        }
                        weekStrip(week)
                        selectedDaySection(week)
                        if let days = aEventDays {
                            aEventCard(days: days)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            } else {
                emptyPlanState
            }
        }
        .task {
            await loadPlan()
            await loadSelectedDetail()
        }
        .onChange(of: selectedDay) { _, _ in
            Task { await loadSelectedDetail() }
        }
        // EMPEZAR — same path as Today's "Empezar" (presents WorkoutContainer for
        // the selected day's assignment).
        .fullScreenCover(isPresented: $showWorkout) {
            if let week {
                let day = week.days[selectedDay]
                WorkoutContainer(
                    assignmentId: day.assignmentId,
                    fallbackTitle: detail?.workout?.name ?? day.title,
                    bearer: bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer"),
                    onClose: { showWorkout = false },
                    onCompleted: { _ in
                        showWorkout = false
                        // Refetch so the week + selected-day detail reflect completion.
                        Task {
                            await loadPlan()
                            await loadSelectedDetail()
                        }
                    }
                )
            }
        }
        .sheet(isPresented: $showChat) {
            ChatView(bearer: bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer"))
        }
    }

    private var headerRow: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            if let macroLabel {
                LabelText(text: macroLabel.uppercased())
            }
            Spacer()
            Button {
                Haptics.light()
                showChat = true
            } label: {
                Image(systemName: "message")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Color.accent)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Chat con Pablo")
        }
        .frame(minHeight: 44)
    }

    private func loadPlan() async {
        defer { loading = false }
        guard let token = bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer") else {
            loadFailed = true
            return
        }
        do {
            async let weekResp = PlanService.fetchWeek(bearer: token)
            async let macroResp = PlanService.fetchMacroProgress(bearer: token)
            async let partnerResp = PartnerService.fetchEnvelope(bearer: token)
            let resp = try await weekResp
            let macro = try? await macroResp
            let envelope = try? await partnerResp
            let built = PlanWeek.from(api: resp)
            week = built
            selectedDay = built.todayIndex
            macroLabel = macro?.macro.weekLabel ?? resp.macroSummary.weekLabel
            macroWeeks = macro?.macroProgress?.weeks ?? []
            aEventDays = macro?.macro.aEventDays ?? resp.macroSummary.aEventDays
            partner = envelope?.partner
            loadFailed = false
        } catch {
            // No plan available — show an honest empty state, never demo data.
            week = nil
            loadFailed = true
        }
    }

    // Empty / error state for a new athlete whose coach hasn't published a
    // plan yet (or a transient load failure).
    private var emptyPlanState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: loadFailed ? "wifi.exclamationmark" : "calendar.badge.clock")
                .font(.system(size: 40))
                .foregroundStyle(Theme.Color.muted)
            Text(loadFailed
                 ? "No pudimos cargar tu plan"
                 : "Tu coach aún no ha publicado tu plan")
                .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(loadFailed
                 ? "Revisa tu conexión e inténtalo de nuevo."
                 : "Cuando Pablo asigne tus sesiones aparecerán aquí, día a día.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            if loadFailed {
                Button {
                    Haptics.light()
                    loading = true
                    Task { await loadPlan() }
                } label: {
                    Text("Reintentar")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    private var macroProgressStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(macroWeeks) { w in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(macroWeekColor(w.status))
                            .frame(width: 24, height: 32)
                        Text(String(w.weekStart.suffix(5)))
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
    }

    private func macroWeekColor(_ status: String) -> Color {
        switch status {
        case "completed": return Theme.Color.ok
        case "current": return Theme.Color.accent
        case "missed": return Theme.Color.danger
        default: return Theme.Color.surface
        }
    }

    /// Returns the badge label ("Con [first name]") for sessions that the
    /// athlete shares with their Dobles partner. Nil → no badge:
    ///   - athlete has no partner
    ///   - assignment has `partner_visibility == 'self_only'`
    ///   - backend hasn't shipped `partner_visibility` yet
    private func partnerBadgeLabel(for day: PlanDay) -> String? {
        guard let partner else { return nil }
        guard let vis = day.partnerVisibility, vis == "shared" else { return nil }
        guard !day.isRest else { return nil }
        return "Con \(partner.firstName)"
    }

    // MARK: - Week strip (selector)
    private func weekStrip(_ week: PlanWeek) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LabelText(text: "SEMANA · \(week.label)")
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { di in
                    dayCell(week, di: di)
                }
            }
        }
    }

    private func dayCell(_ week: PlanWeek, di: Int) -> some View {
        let day = week.days[di]
        let isSelected = di == selectedDay
        let isToday = di == week.todayIndex
        let isPast = di < week.todayIndex
        // ✓ reflects ACTUAL completion (server status 'completed' or local
        // optimistic mark), never the mere passage of the date. A past session
        // left unfinished therefore stays a scheduled dot, not a checkmark.
        let isDone = day.isCompleted

        return Button {
            Haptics.light()
            selectedDay = di
        } label: {
            VStack(spacing: 4) {
                Text(daysES[di])
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isSelected ? Color.white : Theme.Color.muted)
                Text("\(day.dayNumber)")
                    .font(.system(size: 18, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(isSelected ? Color.white : Theme.Color.foreground)
                statusGlyph(isDone: isDone, isRest: day.isRest, isSelected: isSelected)
                    .frame(height: 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 4)
            .background(isSelected ? Theme.Color.accent : Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isToday && !isSelected ? Theme.Color.accent.opacity(0.5) : Color.clear, lineWidth: 1)
            )
            .opacity(isPast && !isSelected && !isDone ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(daysES[di]) \(day.dayNumber)\(day.isRest ? ", descanso" : isDone ? ", completado" : "")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// Per-day status indicator inside the pill: ✓ when done, a dot when a
    /// session is scheduled, nothing on rest days. Replaces the removed vertical
    /// list as the carrier of per-day completion state.
    @ViewBuilder
    private func statusGlyph(isDone: Bool, isRest: Bool, isSelected: Bool) -> some View {
        if isDone {
            Image(systemName: "checkmark")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(isSelected ? Color.white : Theme.Color.ok)
        } else if isRest {
            Color.clear.frame(width: 6, height: 6)
        } else {
            Circle()
                .fill(isSelected ? Color.white : Theme.Color.muted)
                .frame(width: 6, height: 6)
        }
    }

    // MARK: - Selected day (inline programming)
    private func selectedDaySection(_ week: PlanWeek) -> some View {
        let day = week.days[selectedDay]
        return VStack(alignment: .leading, spacing: 16) {
            sessionHeader(week, day: day)
            if canStart(day) {
                ExpertPrimaryButton(title: "▶ EMPEZAR", height: 54) {
                    Haptics.medium()
                    showWorkout = true
                }
            }
            sessionBody(day)
        }
    }

    private func sessionHeader(_ week: PlanWeek, day: PlanDay) -> some View {
        let isToday = selectedDay == week.todayIndex
        return VStack(alignment: .leading, spacing: 6) {
            LabelText(
                text: "\(isToday ? "HOY" : daysES[selectedDay]) · \(day.dayName)",
                color: Theme.Color.accent
            )
            Text(detail?.workout?.name ?? day.title)
                .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 4)
            if let badge = partnerBadgeLabel(for: day) {
                PartnerBadge(text: badge)
                    .padding(.top, 2)
            }
            if let focus = detail?.workout?.focus, !focus.isEmpty {
                MonoText(text: focus.uppercased(), size: 12, color: Theme.Color.muted)
                    .padding(.top, 2)
            }
            if let mins = detail?.workout?.estimatedDurationMinutes {
                MonoText(text: "~\(mins) min", size: 13, color: Theme.Color.muted)
                    .padding(.top, 4)
            } else {
                MonoText(text: day.subtitle, size: 13, color: Theme.Color.muted)
                    .padding(.top, 4)
            }
        }
    }

    /// Whether the selected day can be started: real assignment, not a rest day,
    /// and (once loaded) carries a real workout body. Mirrors the Today gate.
    private func canStart(_ day: PlanDay) -> Bool {
        guard let id = day.assignmentId, !id.isEmpty else { return false }
        if day.isRest { return false }
        if let detail, detail.workout == nil { return false }
        return true
    }

    @ViewBuilder
    private func sessionBody(_ day: PlanDay) -> some View {
        if day.assignmentId == nil || day.isRest {
            restCard
        } else if detailLoading && detail == nil {
            HStack {
                Spacer()
                ProgressView().tint(Theme.Color.accent)
                Spacer()
            }
            .padding(.top, 24)
        } else if let err = detailError, detail == nil {
            errorCard(err)
        } else if let detail, let workout = detail.workout {
            SessionProgrammingView(detail: detail, workout: workout, partner: partner)
        } else if detail != nil {
            // Detail loaded but no workout body → treat as rest.
            restCard
        }
    }

    private var restCard: some View {
        CardSurface(padding: 16, leftAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "DESCANSO")
                Text("Día de descanso")
                    .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Sin sesión programada. Recupera, hidrata y duerme.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.top, 4)
            }
        }
    }

    @ViewBuilder
    private func errorCard(_ err: SessionDetailError) -> some View {
        CardSurface(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: err.title, color: Theme.Color.danger)
                Text(err.body)
                    .scaledFont(14, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                if err != .notFound {
                    Button {
                        Haptics.light()
                        Task { await loadSelectedDetail() }
                    } label: {
                        Text("Reintentar")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.accentOn)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Theme.Color.accent)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - A-event card
    //
    // The macro summary only exposes days-to-A-event (no event name / date /
    // bib yet), so we surface exactly that. Hidden entirely when there is no
    // A-event days value.
    private func aEventCard(days: Int) -> some View {
        CardSurface(padding: 16, topAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                LabelText(text: "A-EVENT")
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text("\(days)")
                        .font(.system(size: 64, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accent)
                    Text("días")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(.top, 10)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Faltan \(days) días para tu A-event")
            }
        }
    }

    // MARK: - Detail loading (selected day)
    //
    // Fetches the selected day's `AssignmentDetail`. Primes from cache so day
    // switches render instantly, clears stale detail when moving to a day with
    // no cache, and degrades to honest rest / error states. No assignment (rest
    // cell) → no fetch.
    private func loadSelectedDetail() async {
        guard let week else { return }
        let day = week.days[selectedDay]
        detailError = nil
        guard let assignmentId = day.assignmentId, !day.isRest else {
            detail = nil
            return
        }
        // Prime from cache (instant), else clear the previous day's detail so we
        // never show stale programming under the new selection.
        detail = AssignmentDetailCache.load(assignmentId)
        guard let token = bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer") else {
            detailError = .unauthorized
            return
        }
        detailLoading = true
        defer { detailLoading = false }
        do {
            let fresh = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: token)
            // Guard against a race where the user switched days mid-fetch.
            guard let current = self.week?.days[safe: selectedDay],
                  current.assignmentId == assignmentId else { return }
            detail = fresh
            detailError = nil
            AssignmentDetailCache.save(fresh)
        } catch let APIError.http(status, _) {
            switch status {
            case 401, 403: detailError = .unauthorized
            case 404:      detailError = .notFound
            default:       detailError = .other
            }
        } catch is URLError {
            detailError = .offline
        } catch {
            detailError = .other
        }
    }
}

// MARK: - Session detail load error

enum SessionDetailError: Equatable {
    case notFound
    case unauthorized
    case offline
    case other

    var title: String {
        switch self {
        case .notFound:     return "NO DISPONIBLE"
        case .unauthorized: return "SESIÓN CADUCADA"
        case .offline:      return "SIN CONEXIÓN"
        case .other:        return "ERROR"
        }
    }

    var body: String {
        switch self {
        case .notFound:     return "Esta sesión ya no está disponible."
        case .unauthorized: return "Tu sesión ha caducado. Vuelve a iniciar sesión para ver el detalle."
        case .offline:      return "Sin conexión, intenta más tarde."
        case .other:        return "No pudimos cargar el detalle. Intenta de nuevo."
        }
    }
}

// MARK: - Session programming (coach note + stations + blocks)
//
// Reusable render of a workout body. Lives here (not inside a modal) so the Plan
// tab can show the selected day's full programming inline. Tapping an item still
// opens its `ExerciseDetailView` (in-app video + cues) via `WorkoutItemRow`.

struct SessionProgrammingView: View {
    let detail: AssignmentDetail
    let workout: WorkoutDetail
    /// Paired partner (Dobles). When nil the stations section never renders.
    var partner: PartnerInfo? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let note = workout.coachNote, !note.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    LabelText(text: "PABLO DICE")
                    CoachQuote(text: note)
                }
            }

            stationsSection

            ForEach(workout.blocks) { block in
                blockSection(block)
            }
        }
    }

    /// Dobles stations — only renders when (1) the assignment carries a
    /// `station_assignment`, (2) the athlete has a paired partner, and (3) we
    /// can resolve "a"/"b" for this device. Otherwise stays invisible so the
    /// individual flow remains unchanged.
    @ViewBuilder
    private var stationsSection: some View {
        let assignment = detail.assignment
        if let stations = assignment.stationAssignment?.stations,
           !stations.isEmpty,
           let partner,
           let myRole = DoblesRole.resolveMyRole(
                explicit: assignment.myRole,
                currentAthleteId: assignment.athleteId,
                partnerAthleteId: partner.athleteId
           )
        {
            PlanStationsSection(stations: stations, partner: partner, myRole: myRole)
        }
    }

    // A block rendered as a tight, scannable section: an accent rail on the
    // left binds the whole block visually, a slim tracked header carries the
    // block identity, and the movements are single-line rows separated by
    // hairlines — the target prescription is the right-aligned mono anchor. This
    // keeps the WHOLE block legible at a glance (no big floating cards with gaps
    // that fragment the perception of the session).
    private func blockSection(_ block: WorkoutBlock) -> some View {
        // The session header already shows the workout name, so a single block
        // titled the same suppresses its own title to avoid the echo.
        let showTitle = !block.title.isEmpty && block.title != workout.name
        return HStack(alignment: .top, spacing: 0) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Theme.Color.accent)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 8) {
                    Text(showTitle ? block.title.uppercased() : blockCountLabel(block))
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(showTitle ? Theme.Color.foreground : Theme.Color.muted)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    PillChip(title: formatLabel(block.format))
                }
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)

                if let note = block.coachNote, !note.isEmpty {
                    Text(note)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 8)
                }

                ForEach(Array(block.items.enumerated()), id: \.element.id) { idx, item in
                    if idx > 0 {
                        Rectangle()
                            .fill(Theme.Color.hairline)
                            .frame(height: 1)
                            .padding(.leading, 14)
                    }
                    WorkoutItemRow(item: item)
                }
                .padding(.bottom, 6)
            }
        }
        .background(Theme.Color.surface.opacity(0.45))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
    }

    /// Left-hand count label for a block whose title is suppressed: HYROX sims
    /// read as rounds (run+station pairs), everything else as movement count.
    private func blockCountLabel(_ block: WorkoutBlock) -> String {
        let n = block.items.count
        if block.format.lowercased() == "hyrox_sim", n % 2 == 0 {
            return "\(n / 2) RONDAS"
        }
        return "\(n) MOVIMIENTOS"
    }
}

// MARK: - Week model (summary from /api/athlete/plan/week)

struct PlanDay: Identifiable, Hashable {
    let id = UUID()
    let assignmentId: String?    // nil on rest days
    let dayName: String          // "JUE"
    let dayNumber: Int           // 15
    let title: String            // primary session title
    let subtitle: String         // joined modality summary
    let isRest: Bool
    /// Server-side assignment status of the primary session: 'scheduled' |
    /// 'completed' | 'missed' | 'in_progress' (see deep-dive-plan PLAN_STATUS).
    /// Nil on rest / empty days. The ✓ glyph is driven by this — NOT by whether
    /// the date has passed — so a skipped past session never shows as done.
    let status: String?
    /// "shared" → display "Con [partner]" badge when the athlete has a
    /// Dobles partner. "self_only" → individual session inside a Dobles plan.
    /// Nil → individual modality / backend hasn't shipped the field.
    let partnerVisibility: String?

    /// True when the session is actually finished: the server marked it
    /// 'completed' OR we recorded it locally (optimistic completion before the
    /// next /week refetch lands). Mirrors the `nextWorkout` active-predicate so
    /// Today and Plan agree on what "done" means. Rest days are never done.
    var isCompleted: Bool {
        guard !isRest else { return false }
        if status?.lowercased() == "completed" { return true }
        if let id = assignmentId, CompletedAssignmentsStore.isCompleted(id) { return true }
        return false
    }
}

struct PlanWeek {
    let label: String            // "REAL w2"
    let todayIndex: Int          // 3 (Thursday)
    let days: [PlanDay]

    /// True when at least one day carries a real assignment. A week of pure
    /// rest / empty days for a brand-new athlete reads as "no plan yet".
    var hasAnySession: Bool {
        days.contains { $0.assignmentId != nil }
    }
}

// Safe indexing so a day-switch race during an async fetch can never trap.
private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Block helpers

private func formatLabel(_ raw: String) -> String {
    switch raw.lowercased() {
    case "straight_sets":   return "STRAIGHT SETS"
    case "amrap":           return "AMRAP"
    case "for_time":        return "FOR TIME"
    case "emom":            return "EMOM"
    case "intervals":       return "INTERVALS"
    case "tempo":           return "TEMPO"
    case "circuit":         return "CIRCUIT"
    case "free":            return "FREE"
    case "warmup":          return "WARMUP"
    case "cooldown":        return "COOLDOWN"
    default:                return raw.uppercased().replacingOccurrences(of: "_", with: " ")
    }
}

// Block timing summary. `config_json` keys are snake_case on the wire and are
// NOT rewritten by `convertFromSnakeCase` (see JSONValue note in
// AssignmentDetail.swift), so we read the canonical keys from
// `weekDayPartConfigSchema`: time_cap_seconds, emom_interval_seconds, rounds,
// work_seconds, rest_seconds.
private func blockConfigSummary(_ block: WorkoutBlock) -> String? {
    guard let cfg = block.configJson else { return nil }

    let rounds = cfg.int("rounds")
    let cap = cfg.int("time_cap_seconds")
    let emom = cfg.int("emom_interval_seconds")
    let work = cfg.int("work_seconds")
    let rest = cfg.int("rest_seconds")

    switch block.format.lowercased() {
    case "amrap":
        // AMRAP X min — the time cap is the defining parameter.
        if let cap { return "AMRAP \(minutes(cap))" }
    case "emom":
        // EMOM X' · cada Y — total minutes + the interval window.
        if let cap, let emom {
            return "EMOM \(minutes(cap)) · cada \(formatDuration(emom))"
        }
        if let emom { return "EMOM · cada \(formatDuration(emom))" }
        if let cap { return "EMOM \(minutes(cap))" }
    case "intervals":
        // N × work/rest — rounds of a work/rest couplet.
        if let rounds, let work, let rest {
            return "\(rounds) × \(formatDuration(work))/\(formatDuration(rest))"
        }
        if let work, let rest {
            return "\(formatDuration(work))/\(formatDuration(rest))"
        }
    default:
        break
    }

    // Generic fallback for other formats (for_time, circuit, straight_sets…).
    var parts: [String] = []
    if let rounds { parts.append("\(rounds) rounds") }
    if let cap { parts.append("cap \(formatDuration(cap))") }
    if let work, let rest {
        parts.append("\(formatDuration(work))/\(formatDuration(rest))")
    } else if let work {
        parts.append("work \(formatDuration(work))")
    }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

private func minutes(_ seconds: Int) -> String {
    let m = max(1, Int((Double(seconds) / 60.0).rounded()))
    return "\(m) min"
}

private func formatDuration(_ seconds: Int) -> String {
    let m = seconds / 60
    let s = seconds % 60
    if m == 0 { return "\(s)s" }
    if s == 0 { return "\(m)'" }
    return String(format: "%d:%02d", m, s)
}

// MARK: - Workout item row
//
// Context-aware: strength → sets×reps@load, running → duration · zone · pace,
// ergo → duration · cal/min, functional → reps or duration.
//
// Tapping the row opens `ExerciseDetailView` (in-app YouTube embed + cues +
// description + params). The row never links out to Safari/YouTube — the
// embed lives inside the app.

struct WorkoutItemRow: View {
    let item: WorkoutItem
    @State private var showingDetail = false

    private var hasVideo: Bool {
        guard let url = item.exerciseVideoUrl else { return false }
        return YouTubeLinkParser.videoId(from: url) != nil
    }

    var body: some View {
        // Compact single-line row: the movement name reads left, the target
        // prescription is the right-aligned MONO anchor (the thing that matters),
        // cues drop to one muted line only when present. No sub-card, no tag —
        // the block section already groups; importance leads.
        let summary = WorkoutItemParamsFormatter.summary(
            item.paramsJson,
            category: item.exerciseCategory
        )
        return Button {
            Haptics.light()
            showingDetail = true
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.exerciseName)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    if hasVideo {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.accent)
                    }
                    Spacer(minLength: 8)
                    if let summary {
                        Text(summary)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                            .layoutPriority(1)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
                if let cues = item.cues, !cues.isEmpty {
                    Text(cues)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.exerciseName)\(summary.map { ", \($0)" } ?? ""). Ver detalle\(hasVideo ? " y vídeo" : "")")
        .accessibilityAddTraits(.isButton)
        .sheet(isPresented: $showingDetail) {
            ExerciseDetailView(item: item)
        }
    }
}

// MARK: - Workout params formatter
//
// Context-aware param summary shared by `WorkoutItemRow` and
// `ExerciseDetailView` so there is a single source of truth for how
// series/reps/load/zone/pace are rendered.

enum WorkoutItemParamsFormatter {
    static func summary(_ p: WorkoutItemParams, category: String) -> String? {
        switch category.lowercased() {
        case "running":
            return runningSummary(p)
        case "rowing", "ski_erg", "bike_erg":
            return ergoSummary(p)
        case "strength":
            return strengthSummary(p)
        default:
            // functional / mobility / other — show whatever shape we have.
            return strengthSummary(p) ?? ergoSummary(p) ?? runningSummary(p)
        }
    }

    private static func strengthSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        switch (p.sets, p.reps) {
        case let (s?, r?): parts.append("\(s) × \(r)")
        case (nil, let r?): parts.append("\(r) reps")
        case (let s?, nil): parts.append("\(s) sets")
        default: break
        }
        if let kg = p.loadKg {
            parts.append("@ \(formatKg(kg))")
        } else if let pct = p.loadPct {
            parts.append("@ \(Int(pct.rounded()))% 1RM")
        }
        if let rpe = p.rpe {
            parts.append("RPE \(formatRpe(rpe))")
        }
        if let rest = p.restSeconds {
            parts.append("rest \(formatDuration(rest))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func runningSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        if let dur = p.durationSeconds {
            parts.append(formatDuration(dur))
        }
        if let km = p.distanceKm {
            parts.append(String(format: "%.2f km", km))
        } else if let m = p.distanceMeters {
            parts.append("\(m) m")
        }
        if let zone = p.hrZone {
            parts.append("Z\(zone)")
        }
        if let pace = p.paceSecPerKm {
            parts.append("\(formatPace(pace))/km")
        }
        if let spm = p.cadenceSpm {
            parts.append("\(spm) spm")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func ergoSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        if let dur = p.durationSeconds {
            parts.append(formatDuration(dur))
        }
        if let m = p.distanceMeters {
            parts.append("\(m) m")
        }
        if let cal = p.caloriesPerMin {
            parts.append("\(cal) cal/min")
        } else if let cal = p.calories {
            parts.append("\(cal) cal")
        }
        if let zone = p.hrZone {
            parts.append("Z\(zone)")
        }
        if let pace = p.paceSecPerKm {
            // Ergo pace is conventionally /500m. The unified prescription model
            // normalizes pace to seconds-per-KM (`paceSecPerKm`), so halve it to
            // recover the /500m value the athlete reads on the erg monitor.
            parts.append("\(formatPace(pace / 2))/500m")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func formatKg(_ kg: Double) -> String {
        if kg.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(kg)) kg"
        }
        return String(format: "%.1f kg", kg)
    }

    private static func formatRpe(_ rpe: Double) -> String {
        if rpe.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(rpe))"
        }
        return String(format: "%.1f", rpe)
    }

    private static func formatPace(_ secondsPerUnit: Int) -> String {
        let m = secondsPerUnit / 60
        let s = secondsPerUnit % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Category tag

struct CategoryTag: View {
    let category: String

    var body: some View {
        Text(label.uppercased())
            .font(.system(size: 9, weight: .heavy, design: .monospaced))
            .tracking(0.8)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }

    private var label: String {
        switch category.lowercased() {
        case "strength":     return "STR"
        case "running":      return "RUN"
        case "rowing":       return "ROW"
        case "ski_erg":      return "SKI"
        case "bike_erg":     return "BIKE"
        case "functional":   return "FUNC"
        case "mobility":     return "MOB"
        default:             return category
        }
    }

    private var color: Color {
        switch category.lowercased() {
        case "strength":   return Theme.Color.foreground
        case "running":    return HRZone.z3.color
        case "rowing":     return HRZone.z2.color
        case "ski_erg":    return HRZone.z2.color
        case "bike_erg":    return HRZone.z2.color
        case "functional": return Theme.Color.accent
        case "mobility":   return Theme.Color.muted
        default:           return Theme.Color.muted
        }
    }
}

#Preview {
    PlanView()
        .preferredColorScheme(.dark)
}
