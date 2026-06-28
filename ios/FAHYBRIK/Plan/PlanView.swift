import SwiftUI

// Plan tab — the week published by the coach, rendered as the handoff hi-fi
// (design_handoff_fhp/App Atleta - Flujo.dc.html · `plan` screen).
//
// UX model (handoff): the athlete ALWAYS sees a week of days; the coach assigns
// microciclos and the weeks "se publican solas". The screen is:
//   · header — wordmark + "Dobles · {partner}" chip (cohort only) + avatar
//   · title "Tu semana" + counter "N / M ›" + a subtitle naming the coach and
//     the microciclo and that it publishes itself
//   · a VERTICAL list of the 7 days (Lun–Dom) as sunken rows: day label (mono),
//     a modality color dot, the session name, and a per-day status glyph
//     (✓ done / future dot / rest muted). TODAY's row is EXPANDED + highlighted
//     with an ORANGE border, listing its sessions (AM + PM when two).
//   · a bottom legend of the modality colors (fuerza / ergómetro / carrera).
//
// Tapping any day with a session opens its Detalle — the existing
// PreWorkoutBrief → Workout flow via `WorkoutContainer`, exactly as Today's
// "Empezar" does. There is no inline programming on Plan: the full blocks/items
// live in Detalle, reachable from any day.
//
// Data comes from `GET /api/athlete/plan/week`. We keep the RAW per-day
// sessions (`AthleteWeekDay`) so the today row can show both AM and PM — the
// `PlanWeek` projection collapses a day to a single primary session, which is
// enough for the collapsed rows but loses the second session. No mocked data:
// if the coach hasn't published, we show an honest empty state.
struct PlanView: View {
    var bearer: String? = nil

    // Raw week (all sessions per day) + the published-week metadata.
    @State private var days: [AthleteWeekDay] = []
    @State private var todayIso: String = ""
    @State private var weekStart: String = ""
    @State private var weekEnd: String = ""
    // Coach-authored "Foco de la semana" — a short athlete-facing line. Honest-nil.
    @State private var focus: String? = nil
    // True when a NEXT week with published content exists (drives the peek button).
    @State private var hasNextWeek: Bool = false
    // The coach who publishes the week — surfaced as the "por {coach}" attribution.
    @State private var coachName: String? = nil

    // Weekly-delivery navigation: 0 = this week, 1 = the NEXT-week peek (the one
    // that unlocks Saturday). Bounded to {0, 1} — never arbitrary navigation.
    @State private var weekOffset: Int = 0

    @State private var loading = true
    @State private var loadFailed = false
    @State private var showChat = false
    @State private var partner: PartnerInfo? = nil
    @State private var showPartnerPlan = false

    // The day whose session the athlete tapped — drives the Detalle cover.
    @State private var openAssignmentId: String? = nil
    @State private var openFallbackTitle: String? = nil
    @State private var showWorkout = false

    // The session whose technique index (exercise list → ExerciseDetailView) is
    // open. Set from the per-session technique affordance in the week.
    @State private var techniqueTarget: AthleteWeekDaySession? = nil

    private var effectiveBearer: String? {
        bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    /// True when the cohort is Dobles (athlete has a paired partner).
    private var isDobles: Bool { partner != nil }

    /// True once at least one day carries a real assignment. A week of pure
    /// rest / empty days for a brand-new athlete reads as "no plan yet".
    private var hasAnySession: Bool {
        days.contains { day in day.sessions.contains { !$0.assignmentId.isEmpty } }
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if loading {
                ProgressView().tint(Theme.Color.accentText)
            } else if weekOffset == 0 && !hasAnySession {
                // No plan at all (current week empty) — the honest no-plan state.
                emptyPlanState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        headerRow
                        titleBlock
                        weekNav
                        if hasAnySession {
                            if let focus, !focus.isEmpty {
                                focoCard(focus)
                            }
                            weekSummaryCard
                            if weekOffset == 0 {
                                weekProgressCard
                            }
                            dayList
                            legend
                        } else {
                            // Peeking a next week that isn't published yet.
                            peekEmptyState
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
        }
        .task { await loadPlan() }
        // Detalle — same path as Today's "Empezar" (presents the prescribed
        // workout for the tapped day's assignment).
        .fullScreenCover(isPresented: $showWorkout) {
            WorkoutContainer(
                assignmentId: openAssignmentId,
                fallbackTitle: openFallbackTitle,
                bearer: effectiveBearer,
                onClose: { showWorkout = false },
                onCompleted: { _ in
                    showWorkout = false
                    // Refetch so the week reflects completion (✓) immediately.
                    Task { await loadPlan() }
                }
            )
        }
        .sheet(isPresented: $showChat) {
            ChatView(bearer: effectiveBearer)
        }
        .fullScreenCover(isPresented: $showPartnerPlan) {
            DoblesPlanView(bearer: effectiveBearer)
        }
        // Technique index for the tapped session — its exercises, each opening
        // the technique detail. Distinct from Detalle (the execution flow).
        .sheet(item: $techniqueTarget) { session in
            SessionExercisesSheet(
                assignmentId: session.assignmentId,
                sessionTitle: session.title,
                bearer: effectiveBearer
            )
        }
    }

    // MARK: - Header (wordmark + cohort chip + avatar)

    private var headerRow: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            Wordmark(size: 18)
            Spacer(minLength: Theme.Spacing.s)
            if isDobles, let partner {
                // Cohort chip → opens the partner's connected plan (read-only).
                Button {
                    Haptics.light()
                    showPartnerPlan = true
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(Theme.Color.partner)
                            .frame(width: 6, height: 6)
                        Text("Dobles · \(partner.firstName)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Theme.Color.surfaceElevated)
                    .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                    .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Modalidad Dobles con \(partner.firstName). Ver su plan")
            }
            chatButton
        }
        .frame(minHeight: 36)
    }

    private var chatButton: some View {
        Button {
            Haptics.light()
            showChat = true
        } label: {
            Image(systemName: "message")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 40, height: 36)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Chat con tu coach")
    }

    // MARK: - Title block ("Tu semana" + counter + provenance subtitle)

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text("Tu semana")
                    .scaledFont(26, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: Theme.Spacing.s)
                if let counter = weekCounter {
                    MonoText(text: counter, size: 12, weight: .bold, color: Theme.Color.muted)
                }
            }
            // Provenance — the published week derives from the coach's microciclo
            // and "se publica sola". The week endpoint now exposes the coach name
            // and the microciclo (periodization phase); we name both when present
            // and degrade to the generic line when either is missing.
            provenanceSubtitle
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// The "Tu semana" subtitle: names the microciclo (periodization phase) and
    /// the coach who publishes the week. Each part is optional and the copy
    /// adapts so it never reads awkwardly when a field is absent.
    private var provenanceSubtitle: Text {
        let phase = microcicloName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let coach = coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        switch (phase?.isEmpty == false ? phase : nil, coach?.isEmpty == false ? coach : nil) {
        case let (phase?, coach?):
            // "Microciclo de Acumulación · publicada por Pablo"
            return Text("Microciclo de ")
                + Text(phase).foregroundStyle(Theme.Color.accentText)
                + Text(" · publicada por \(coach)")
        case let (phase?, nil):
            return Text("Microciclo de ")
                + Text(phase).foregroundStyle(Theme.Color.accentText)
        case let (nil, coach?):
            return Text("Publicada por \(coach)")
        case (nil, nil):
            return Text("Tu coach publica esta semana automáticamente")
        }
    }

    /// The week counter chip ("Semana 2/4", "REAL w2", …). We surface the
    /// coach-authored freeform label verbatim — never a fabricated denominator.
    /// Nil when the published week carries no label.
    private var weekCounter: String? {
        guard let label = macroLabel, !label.isEmpty else { return nil }
        return label
    }

    // MARK: - Day list (Lun–Dom, today expanded)

    private var dayList: some View {
        VStack(spacing: Theme.Spacing.s) {
            ForEach(days) { day in
                if day.isoDate == todayIso {
                    todayRow(day)
                } else {
                    dayRow(day)
                }
            }
        }
    }

    // A collapsed day row: day label (mono) · modality dot · session name ·
    // status glyph. Rest days read muted with no dot; tapping a day with a real
    // session opens its Detalle.
    @ViewBuilder
    private func dayRow(_ day: AthleteWeekDay) -> some View {
        let primary = day.sessions.first
        let rest = isRest(day)
        let done = isDayCompleted(day)
        let canOpen = !rest && !(primary?.assignmentId.isEmpty ?? true)

        HStack(spacing: Theme.Spacing.s) {
            Button {
                guard let id = primary?.assignmentId, !id.isEmpty, !rest else { return }
                Haptics.light()
                open(assignmentId: id, title: primary?.title)
            } label: {
                HStack(spacing: Theme.Spacing.m) {
                    Text(dayLabelES(day.dayOfWeek))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.faint)
                        .frame(width: 32, alignment: .leading)

                    if rest {
                        // Rest day: no modality dot — a muted hollow placeholder.
                        Circle()
                            .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                            .frame(width: 7, height: 7)
                    } else {
                        ModalityDot(modality: primary?.modality, size: 7)
                    }

                    sessionTitleLine(day: day, rest: rest)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    trailingStatus(rest: rest, done: done, hasSession: primary != nil)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .disabled(!canOpen)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(rowAccessibilityLabel(day: day, rest: rest, done: done))
            .accessibilityAddTraits(canOpen ? .isButton : [])

            if canOpen, let session = primary {
                techniqueButton(for: session)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
    }

    // TODAY's row: highlighted on the elevated surface with an ORANGE border,
    // showing each session (AM/PM) on its own line. Tapping the card opens the
    // first session's Detalle; tapping a specific session opens that one.
    @ViewBuilder
    private func todayRow(_ day: AthleteWeekDay) -> some View {
        let rest = isRest(day)
        let sessions = day.sessions.filter { !$0.assignmentId.isEmpty }
        let multi = sessions.count > 1

        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: Theme.Spacing.m) {
                Text(dayLabelES(day.dayOfWeek))
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 32, alignment: .leading)
                Text(rest
                     ? "Hoy · descanso"
                     : multi ? "Hoy · \(sessions.count) sesiones" : "Hoy")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: Theme.Spacing.s)
                if !rest, !sessions.isEmpty {
                    // The whole card opens the first session (see onTapGesture);
                    // this is the affordance, not a separate hit target.
                    HStack(spacing: 3) {
                        Text("Abrir")
                            .font(.system(size: 11, weight: .bold))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(Theme.Color.accentText)
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)
                }
            }

            if rest {
                Text("Sin sesión programada. Recupera, hidrata y duerme.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.leading, 44)
            } else {
                VStack(spacing: 7) {
                    ForEach(Array(sessions.enumerated()), id: \.element.id) { _, session in
                        todaySessionLine(session)
                    }
                }
                .padding(.leading, 44)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .overlay(
            // Today's brand "ring": a thin 1.5pt orange line. Raw accent on white
            // (~2.4:1) disappears, so use the role-split accentText (darker orange
            // on light, identical #F06A2A on dark) to keep the highlight visible.
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.accentText, lineWidth: 1.5)
        )
        .brandShadow(Theme.Shadow.cardTight)
        // Tapping anywhere on the (non-rest) card opens the first session, while
        // each session line below independently opens its own Detalle.
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .onTapGesture {
            guard !rest, let first = day.sessions.first(where: { !$0.assignmentId.isEmpty }) else { return }
            Haptics.light()
            open(assignmentId: first.assignmentId, title: first.title)
        }
        .accessibilityElement(children: .contain)
    }

    // One session line inside today's expanded card: slot badge + name + a
    // technique affordance + status glyph.
    private func todaySessionLine(_ session: AthleteWeekDaySession) -> some View {
        let done = isSessionCompleted(session)
        return HStack(spacing: Theme.Spacing.s) {
            Button {
                Haptics.light()
                open(assignmentId: session.assignmentId, title: session.title)
            } label: {
                HStack(spacing: Theme.Spacing.s) {
                    SlotBadge(
                        slot: slot(for: session),
                        color: Theme.Modality.color(session.modality)
                    )
                    Text(session.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if session.isTestSession {
                        TestBadge(compact: true)
                    }
                    if let badge = partnerBadge(for: session) {
                        PartnerBadge(text: badge, compact: true)
                    }
                    Spacer(minLength: Theme.Spacing.s)
                    if done {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Theme.Color.ok)
                    } else {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "\(slot(for: session) == .am ? "Mañana" : "Tarde"), \(session.title)"
                + (done ? ", completada" : "")
            )
            .accessibilityAddTraits(.isButton)

            if !session.assignmentId.isEmpty {
                techniqueButton(for: session)
            }
        }
    }

    // Trailing affordance opening the session's technique index (exercise list →
    // per-exercise technique detail). A separate hit target from the row's main
    // tap (which opens Detalle / the execution flow), so the athlete can study
    // technique from the plan without starting the workout.
    private func techniqueButton(for session: AthleteWeekDaySession) -> some View {
        Button {
            Haptics.light()
            techniqueTarget = session
        } label: {
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 34, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ver ejercicios y técnica de \(session.title)")
    }

    // Session name line shared by collapsed rows: name + optional partner chip,
    // muted on rest days.
    @ViewBuilder
    private func sessionTitleLine(day: AthleteWeekDay, rest: Bool) -> some View {
        if rest {
            Text("Descanso")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.faint)
        } else {
            HStack(spacing: 6) {
                Text(day.sessions.first?.title ?? "Sesión")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Color.foreground.opacity(0.92))
                    .lineLimit(1)
                if day.sessions.first?.isTestSession == true {
                    TestBadge(compact: true)
                }
                if let session = day.sessions.first, let badge = partnerBadge(for: session) {
                    PartnerBadge(text: badge, compact: true)
                }
                // A second session on a non-today day → small "+1" mono hint.
                let extra = day.sessions.filter { !$0.assignmentId.isEmpty }.count - 1
                if extra > 0 {
                    Text("+\(extra)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
    }

    // Trailing glyph for a collapsed row: ✓ when done, a chevron (tap-to-open)
    // for a pending session, nothing on rest days.
    @ViewBuilder
    private func trailingStatus(rest: Bool, done: Bool, hasSession: Bool) -> some View {
        if rest || !hasSession {
            EmptyView()
        } else if done {
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Color.ok)
        } else {
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
    }

    // MARK: - Legend (modality colors)

    private var legend: some View {
        // Two centered rows cover the full modality palette without overflowing
        // 390pt. Colors come from Theme.Modality.color so the key can never drift
        // from the dots it explains (single source of truth).
        VStack(spacing: 6) {
            HStack(spacing: Theme.Spacing.l) {
                Spacer(minLength: 0)
                legendItem(color: Theme.Modality.color("run"), label: "carrera")
                legendItem(color: Theme.Modality.color("row"), label: "ergómetro")
                legendItem(color: Theme.Modality.color("strength"), label: "fuerza")
                Spacer(minLength: 0)
            }
            HStack(spacing: Theme.Spacing.l) {
                Spacer(minLength: 0)
                legendItem(color: Theme.Modality.color("functional"), label: "funcional")
                legendItem(color: Theme.Modality.color("hyrox"), label: "HYROX")
                legendItem(color: Theme.Modality.color("mobility"), label: "movilidad")
                Spacer(minLength: 0)
            }
        }
        .padding(.top, Theme.Spacing.xs)
        .accessibilityHidden(true)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.muted)
        }
    }

    // MARK: - A-event card
    //
    // The macro summary only exposes days-to-A-event (no event name / date / bib
    // yet), so we surface exactly that. Hidden entirely when there is no value.
    private func aEventCard(days: Int) -> some View {
        CardSurface(padding: 16, topAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                LabelText(text: "A-EVENT")
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text("\(days)")
                        .font(.system(size: 56, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accentText)
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

    // MARK: - Empty / error state

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
                 : "Cuando tu coach asigne tus sesiones aparecerán aquí, día a día.")
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

    // MARK: - Actions

    private func open(assignmentId: String?, title: String?) {
        guard let assignmentId, !assignmentId.isEmpty else { return }
        openAssignmentId = assignmentId
        openFallbackTitle = title
        showWorkout = true
    }

    // MARK: - Load

    private func loadPlan() async {
        defer { loading = false }
        guard let token = effectiveBearer else {
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

            days = resp.week.days
            todayIso = resp.week.todayIso
            // The week label is coach-authored freeform; we surface it verbatim.
            // No periodization sigla/code is ever sent here as a label — only the
            // human, coach-authored `weekLabel` reaches the athlete.
            macroLabel = macro?.macro.weekLabel ?? resp.macroSummary.weekLabel
            aEventDays = macro?.macro.aEventDays ?? resp.macroSummary.aEventDays
            coachName = resp.coachName
            microcicloName = resp.week.microcicloName
            partner = envelope?.partner
            loadFailed = false
        } catch {
            // No plan available — honest empty state, never demo data.
            days = []
            loadFailed = true
        }
    }

    // MARK: - Per-day / per-session helpers

    /// A day is rest when the backend flags it or it carries no real session.
    private func isRest(_ day: AthleteWeekDay) -> Bool {
        day.isRest || day.sessions.allSatisfy { $0.assignmentId.isEmpty }
    }

    /// A session is done when the server marks it completed OR we recorded it
    /// locally (optimistic completion before the next /week refetch lands).
    private func isSessionCompleted(_ session: AthleteWeekDaySession) -> Bool {
        if session.status.lowercased() == "completed" { return true }
        return CompletedAssignmentsStore.isCompleted(session.assignmentId)
    }

    /// The collapsed-row ✓ reflects the PRIMARY session's completion. A day with
    /// multiple sessions only reads "done" when every real session is finished —
    /// otherwise it stays a pending row. Never driven by the date passing.
    private func isDayCompleted(_ day: AthleteWeekDay) -> Bool {
        let real = day.sessions.filter { !$0.assignmentId.isEmpty }
        guard !real.isEmpty else { return false }
        return real.allSatisfy { isSessionCompleted($0) }
    }

    /// The session's slot, defaulting to AM when the backend leaves it blank
    /// (single-session days are conventionally AM in the handoff).
    private func slot(for session: AthleteWeekDaySession) -> SessionSlot {
        session.slot.lowercased().hasPrefix("pm") ? .pm : .am
    }

    /// "Con [partner]" badge for sessions shared with the Dobles partner. Nil
    /// when the athlete has no partner, the session is self-only, or the backend
    /// hasn't shipped `partner_visibility` yet (see PlanService).
    private func partnerBadge(for session: AthleteWeekDaySession) -> String? {
        guard let partner else { return nil }
        guard session.partnerVisibility?.lowercased() == "shared" else { return nil }
        return "Con \(partner.firstName)"
    }

    private func dayLabelES(_ dow: Int) -> String {
        switch dow {
        case 1: return "LUN"
        case 2: return "MAR"
        case 3: return "MIÉ"
        case 4: return "JUE"
        case 5: return "VIE"
        case 6: return "SÁB"
        default: return "DOM"
        }
    }

    private func rowAccessibilityLabel(day: AthleteWeekDay, rest: Bool, done: Bool) -> String {
        let label = dayLabelES(day.dayOfWeek)
        if rest { return "\(label), descanso" }
        let title = day.sessions.first?.title ?? "sesión"
        return "\(label), \(title)" + (done ? ", completada" : "")
    }
}

// MARK: - Week model (summary from /api/athlete/plan/week)
//
// The collapsed `PlanWeek`/`PlanDay` projection is built in
// `PlanService.swift` (`PlanWeek.from(api:)`) and consumed by Today's
// next-workout derivation. The Plan screen renders the RAW `AthleteWeekDay`
// sessions directly (so today can show AM+PM), but these types stay here as the
// shared one-primary-per-day projection other surfaces rely on.

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

// MARK: - Test badge
//
// Amber pill marking a session whose purpose is to MEASURE (a test/benchmark
// that stores results into the athlete's profile), not to train. Mirrors
// PartnerBadge's compact shape but uses the amber `warning` role so a test
// reads as "do this fresh, it sets your numbers".
struct TestBadge: View {
    var compact: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "stopwatch")
                .font(.system(size: compact ? 9 : 10, weight: .semibold))
            Text("Test")
                .font(.system(size: compact ? 10 : 11, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(Theme.Color.warning)
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 2 : 3)
        .background(Theme.Color.warningTint)
        .clipShape(Capsule())
        .accessibilityLabel("Sesión de test")
    }
}

// MARK: - Duration formatting (shared by the params formatter)

private func formatDuration(_ seconds: Int) -> String {
    let m = seconds / 60
    let s = seconds % 60
    if m == 0 { return "\(s)s" }
    if s == 0 { return "\(m)'" }
    return String(format: "%d:%02d", m, s)
}

// MARK: - Workout params formatter
//
// Context-aware param summary used by `ExerciseDetailView` (and any future
// session-detail rendering) so there is a single source of truth for how
// series/reps/load/zone/pace are rendered.

enum WorkoutItemParamsFormatter {
    // Item-level summary — the preferred entry point. PREFERS the structured
    // `prescription_json` (per-set pyramids, ranges, ergo/run pace+zone) and only
    // falls back to the flat scalar params for legacy items that lack it. Returns
    // a single line; per-set tables are rendered by views, not this formatter.
    static func summary(_ item: WorkoutItem) -> String? {
        if let p = item.prescription {
            let isStrength = p.modality == .strength
                || (p.modality == nil && item.exerciseCategory.lowercased() == "strength")
            if isStrength, let rows = PrescriptionRenderer.setRows(p), !rows.isEmpty {
                if PrescriptionRenderer.setsAreUniform(p),
                   let collapsed = PrescriptionRenderer.collapsedSetsLabel(p) {
                    return collapsed
                }
                // Pyramid → "5 series · 10→6 · 60→75% 1RM" (count + work/load spread).
                let works = rows.map(\.work)
                let loads = rows.compactMap(\.load)
                var parts = ["\(rows.count) series"]
                if let first = works.first, let last = works.last, first != last {
                    parts.append("\(first)→\(last)")
                } else if let first = works.first {
                    parts.append("× \(first)")
                }
                if let lo = loads.first, let hi = loads.last, lo != hi {
                    parts.append("\(lo) → \(hi)")
                } else if let lo = loads.first {
                    parts.append(lo)
                }
                return parts.joined(separator: " · ")
            }
            // Non-strength → a modality summary line (run/ergo/functional/WOD…).
            let line = PrescriptionRenderer.summaryLine(p)
            var parts: [String] = []
            if let header = PrescriptionRenderer.wodHeader(p) { parts.append(header) }
            if let h = line.headline { parts.append(h) }
            if let pace = line.pace { parts.append(pace) }
            if let z = line.zone { parts.append(z.label) }
            if let det = line.detail { parts.append(det) }
            if !parts.isEmpty { return parts.joined(separator: " · ") }
        }
        return summary(item.paramsJson, category: item.exerciseCategory)
    }

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
        // Rendered as TEXT over its own 0.12 tint → raw accent fails AA on white;
        // accentText (darker orange on light, #F06A2A on dark) reads in both modes.
        case "functional": return Theme.Color.accentText
        case "mobility":   return Theme.Color.muted
        default:           return Theme.Color.muted
        }
    }
}

#Preview {
    PlanView()
}
