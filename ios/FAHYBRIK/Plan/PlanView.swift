import SwiftUI
import CoreTransferable

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
    /// FREE tier switch (athlete without coach). False hides the chat action and
    /// swaps the coach-flavored empty copy for the athlete-direct free one — a
    /// free athlete's week fills with the sessions THEY build, nobody publishes it.
    var hasCoach: Bool = true

    // The shared cache-first data layer. The CURRENT week (offset 0) is read from
    // here so a tab switch into Plan renders instantly with no spinner; the
    // next-week PEEK (offset 1) is a forward navigation and still fetches directly.
    @Environment(AppDataStore.self) private var store

    // Raw week (all sessions per day) + the published-week metadata. This is the
    // screen's WORKING COPY — seeded from the store, then edited in place by the
    // optimistic move-a-session flow. `movePending` guards a re-seed from
    // clobbering an in-flight optimistic move.
    @State private var days: [AthleteWeekDay] = []
    @State private var movePending = false
    @State private var todayIso: String = ""
    @State private var weekStart: String = ""
    @State private var weekEnd: String = ""
    // Coach-authored "Foco de la semana" — a short athlete-facing line. Honest-nil.
    @State private var focus: String? = nil
    // True when a NEXT week with published content exists (drives the peek button).
    @State private var hasNextWeek: Bool = false
    // The coach who publishes the week — surfaced as the "por {coach}" attribution.
    @State private var coachName: String? = nil
    // True when the coach has PAUSED this athlete's plan — shows the paused card
    // INSTEAD of the day list, even when the week still carries sessions (a paused
    // athlete never sees stale sessions). `pausedSince` drives the "En pausa desde…".
    @State private var paused: Bool = false
    @State private var pausedSince: String? = nil

    // Weekly-delivery navigation: 0 = this week, 1 = the NEXT-week peek (the one
    // that unlocks Saturday). Bounded to {0, 1} — never arbitrary navigation.
    @State private var weekOffset: Int = 0

    @State private var loading = true
    @State private var loadFailed = false
    @State private var showChat = false
    @State private var partner: PartnerInfo? = nil
    @State private var showPartnerPlan = false
    // #27 — historial (calendario mensual → detalle de sesión).
    @State private var showHistory = false

    // The day whose session the athlete tapped — drives the Detalle cover. One
    // non-optional payload → presented via `.fullScreenCover(item:)` so the id is
    // never nil when WorkoutContainer builds (root fix for "Sesión / Sin detalle").
    @State private var workoutLaunch: WorkoutLaunch? = nil

    // A FINISHED session the athlete tapped — drives the read-only executed detail
    // cover (what they logged), distinct from the active-workout brief above.
    @State private var executedLaunch: WorkoutLaunch? = nil

    // The session whose technique index (exercise list → ExerciseDetailView) is
    // open. Set from the per-session technique affordance in the week.
    @State private var techniqueTarget: AthleteWeekDaySession? = nil

    // A transient error toast shared by the row actions that can fail: a failed
    // move (its optimistic update already reverted) AND a failed state correction
    // (marcar/completar/deshacer). One source — full-sentence messages — so the
    // two flows never grow parallel banners. Plus the day under a drag (the
    // drop-target highlight). Both clear themselves once handled.
    @State private var actionError: String? = nil
    @State private var dropTargetIso: String? = nil

    // "Deshacer hecho" is destructive when the server reports the session holds
    // real recorded work — this holds the session awaiting the confirm dialog.
    @State private var undoConfirmTarget: AthleteWeekDaySession? = nil
    /// Un libre a punto de borrarse DEL TODO (asignación + registro). Solo self-origin.
    @State private var deleteFreeTarget: AthleteWeekDaySession? = nil

    private var effectiveBearer: String? {
        bearer
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
            } else if weekOffset == 0 && paused {
                // The coach paused this athlete: show the paused card, NOT the (now
                // stale) day list — gated ABOVE the day list so published sessions
                // never leak through while paused. The header stays: history and
                // chat must remain reachable without an active plan.
                stateWithHeader { pausedPlanState }
            } else if weekOffset == 0 && !hasAnySession {
                // No plan at all (current week empty) — the honest no-plan state,
                // WITH the header: an athlete with past workouts but no published
                // plan still needs the history (and chat) entry points.
                stateWithHeader { emptyPlanState }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        headerRow
                        titleBlock
                        weekNav
                        if hasAnySession {
                            // Hierarchy: a COMPACT foco rides on top, then THE PLAN
                            // (the day list) as the hero, then the secondary recap
                            // (progreso + resumen) below.
                            if let focus, !focus.isEmpty {
                                focoCard(focus)
                            }
                            dayList
                            legend
                            if weekOffset == 0 {
                                weekProgressCard
                            }
                            weekSummaryCard
                        } else {
                            // Peeking a next week that isn't published yet.
                            peekEmptyState
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
                }
                // Pull-to-refresh: re-pull the week fresh (force bypasses the SWR
                // staleness window). The peek week fetches directly regardless.
                .refreshable { await loadPlan(force: true) }
            }
        }
        // A failed move/correction surfaces its reason here (the move already
        // reverted its optimistic update by the time this shows).
        .overlay(alignment: .top) { actionErrorBanner }
        .animation(.spring(response: 0.42, dampingFraction: 0.9), value: actionError)
        // Destructive "Deshacer hecho": only reached when the server says the
        // session holds real recorded work that the reset will permanently delete.
        .confirmationDialog(
            "¿Deshacer este entreno?",
            isPresented: undoConfirmBinding,
            titleVisibility: .visible,
            presenting: undoConfirmTarget
        ) { session in
            Button("Deshacer y borrar lo registrado", role: .destructive) {
                confirmUndo(session)
            }
            Button("Cancelar", role: .cancel) { undoConfirmTarget = nil }
        } message: { _ in
            Text("Se borrará lo que registraste y el entreno volverá a pendiente. Esto no se puede deshacer.")
        }
        // Borrado TOTAL de un entreno libre — es del atleta, desaparece de verdad
        // (nunca vuelve como pendiente: esa era la raíz del fantasma de IMG_2389).
        .confirmationDialog(
            "¿Borrar este entreno libre?",
            isPresented: Binding(
                get: { deleteFreeTarget != nil },
                set: { if !$0 { deleteFreeTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: deleteFreeTarget
        ) { session in
            Button("Borrar del todo", role: .destructive) {
                confirmDeleteFree(session)
            }
            Button("Cancelar", role: .cancel) { deleteFreeTarget = nil }
        } message: { _ in
            Text("Lo creaste tú: se borra el entreno y lo registrado. No volverá a aparecer.")
        }
        .task {
            store.activate(bearer: effectiveBearer)
            await loadPlan()
        }
        // Detalle — same path as Today's "Empezar" (presents the prescribed
        // workout for the tapped day's assignment).
        .fullScreenCover(item: $workoutLaunch) { launch in
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: effectiveBearer,
                hrZones: store.identity.value?.hrZones,
                onClose: { workoutLaunch = nil },
                onCompleted: { _ in
                    workoutLaunch = nil
                    // Reconcile the store (completion ✓ across all tabs), then
                    // re-seed this screen's working copy from it.
                    Task { await store.planMutated(); await loadPlan() }
                }
            )
        }
        // Detalle de un entreno HECHO — read-only summary of what the athlete
        // logged (tiempo / score / RPE / splits). Reached by tapping a done/partial
        // session; never the active-workout brief.
        .fullScreenCover(item: $executedLaunch) { launch in
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: effectiveBearer,
                onClose: { executedLaunch = nil },
                // Stale id (404) → re-sync to the authoritative plan so the day
                // reflects its current wa.id (and this screen's working copy with it).
                onStale: { Task { await store.planMutated(); await loadPlan() } }
            )
        }
        .sheet(isPresented: $showChat) {
            // Re-inject the shared store: a custom @Observable environment value
            // does NOT cross the sheet presentation boundary, and ChatView now
            // reads its cache-first history/identity from it.
            ChatView(bearer: effectiveBearer)
                .environment(store)
        }
        .fullScreenCover(isPresented: $showPartnerPlan) {
            DoblesPlanView(bearer: effectiveBearer)
        }
        // #27 — historial mensual; tap día/fila → ExecutedWorkoutView (reutilizado).
        .fullScreenCover(isPresented: $showHistory) {
            HistoryView(bearer: effectiveBearer, onClose: { showHistory = false })
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

    // Wraps a full-screen state (empty / paused) with the persistent header so
    // history + chat never disappear just because there is no plan to show.
    //
    // The symmetric Spacer/Spacer that used to live here is now `CenteredScreen`
    // — same result (header pinned, state centred in what's left) plus the part
    // this was missing: it scrolls instead of clipping when the copy grows at
    // large Dynamic Type.
    private func stateWithHeader<Content: View>(@ViewBuilder _ content: @escaping () -> Content) -> some View {
        CenteredScreen {
            headerRow
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
        } content: {
            content()
        }
    }

    // MARK: - Header (cohort chip + chat action)

    private var headerRow: some View {
        // No brand logo here — the logo lives on Inicio only; Plan leads with its
        // own "Tu semana" title. The chat action (and Dobles chip) pin trailing.
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
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
            historyButton
            if hasCoach {
                chatButton
            }
        }
        .frame(minHeight: 36)
    }

    // #27 — opens the monthly history calendar.
    private var historyButton: some View {
        Button {
            Haptics.light()
            showHistory = true
        } label: {
            Image(systemName: "calendar")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 40, height: 36)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Historial de entrenos")
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

    // MARK: - Title block ("Tu semana" / "Próxima semana" + clean attribution)

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(weekOffset == 1 ? "Próxima semana" : "Tu semana")
                .scaledFont(26, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            // Clean, athlete-facing subtitle — date range + the coach who publishes
            // the week. NO internal jargon ("microciclo"), no duplicated plan name.
            if let subtitle = weekSubtitle {
                subtitle
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "21–27 jul · por Pablo" — the week's dates and the coach who publishes it.
    /// Each part optional; nil when neither is available (never an empty line).
    private var weekSubtitle: Text? {
        let range = weekDateRange
        let coach = coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let coachPart = (coach?.isEmpty == false) ? coach : nil
        switch (range, coachPart) {
        case let (range?, coach?): return Text(range) + Text(" · por \(coach)")
        case let (range?, nil):    return Text(range)
        case let (nil, coach?):    return Text("por \(coach)")
        case (nil, nil):           return nil
        }
    }

    // MARK: - Week navigation (this week ↔ the next-week peek ONLY)
    //
    // Matches the weekly-delivery model: the athlete can preview the NEXT week
    // (the one that unlocks Saturday) and come back — never arbitrary navigation.
    @ViewBuilder
    private var weekNav: some View {
        if weekOffset == 1 {
            navButton(title: "Esta semana", systemImage: "chevron.left", leading: true) {
                setWeekOffset(0)
            }
            .accessibilityLabel("Volver a esta semana")
        } else if hasNextWeek {
            HStack {
                Spacer(minLength: 0)
                navButton(title: "Próxima semana", systemImage: "chevron.right", leading: false) {
                    setWeekOffset(1)
                }
                .accessibilityLabel("Ver la próxima semana")
            }
        }
    }

    private func navButton(
        title: String,
        systemImage: String,
        leading: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            HStack(spacing: 4) {
                if leading {
                    Image(systemName: systemImage).font(.system(size: 10, weight: .bold))
                }
                Text(title).font(.system(size: 12, weight: .bold))
                if !leading {
                    Image(systemName: systemImage).font(.system(size: 10, weight: .bold))
                }
            }
            .foregroundStyle(Theme.Color.accentText)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Theme.Color.surface)
            .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
            .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
    }

    private func setWeekOffset(_ offset: Int) {
        guard offset != weekOffset else { return }
        weekOffset = offset
        loading = true
        Task { await loadPlan() }
    }

    // MARK: - Foco de la semana (coach-authored, athlete-facing — no detail)

    // Compact, single-line treatment: the PLAN is the hero, so the foco rides
    // above it as a discreet accented line (mono "FOCO" label inline with the
    // text) rather than a full top-accent card. Content + a11y unchanged.
    private func focoCard(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text("FOCO")
                .font(.system(size: 10, weight: .heavy, design: .monospaced))
                .tracking(0.8)
                .foregroundStyle(Theme.Color.accentText)
            Text(text)
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Foco de la semana: \(text)")
    }

    // MARK: - Resumen de la semana (shape of the week, derived from the sessions)

    private var weekSummaryCard: some View {
        ResumenSemanaCard(sesiones: realSessions)
    }

    // MARK: - Progreso de la semana (real completion, not the date passing)

    private var weekProgressCard: some View {
        let planned = realSessions.count
        let done = completedCount
        let frac = planned > 0 ? Double(done) / Double(planned) : 0
        let complete = planned > 0 && done >= planned
        return CardSurface(padding: 16, topAccent: false) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    LabelText(text: "PROGRESO DE LA SEMANA")
                    Spacer(minLength: Theme.Spacing.s)
                    Text("\(done) / \(planned)")
                        .font(.system(size: 13, weight: .bold).monospacedDigit())
                        .foregroundStyle(complete ? Theme.Color.ok : Theme.Color.muted)
                }
                progressBar(fraction: frac)
                Text(progressCaption(done: done, planned: planned))
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Progreso de la semana: \(done) de \(planned) sesiones completadas")
    }

    private func progressBar(fraction: Double) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.hairlineStrong)
                Capsule().fill(Theme.Color.accent)
                    .frame(width: max(0, min(1, fraction)) * geo.size.width)
            }
        }
        .frame(height: 8)
    }

    private func progressCaption(done: Int, planned: Int) -> String {
        if planned == 0 { return "Sin sesiones esta semana." }
        if done == 0 { return "Aún no has completado ninguna sesión." }
        if done >= planned { return "¡Semana completada! Buen trabajo." }
        let left = planned - done
        return left == 1 ? "Te queda 1 sesión." : "Te quedan \(left) sesiones."
    }

    // MARK: - Peek empty (next week not published yet — honest)

    private var peekEmptyState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 34))
                .foregroundStyle(Theme.Color.muted)
            Text("La próxima semana aún no está publicada")
                .scaledFont(16, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Tu coach la publica al cerrar esta semana.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.xxl)
    }

    // MARK: - Week summary / progress derivation (from the typed week, no mocks)

    /// All real (assigned) sessions across the week — the unit the summary and
    /// progress count (AM and PM each count once). Rest/empty days contribute none.
    private var realSessions: [AthleteWeekDaySession] {
        days.flatMap { $0.sessions.filter { !$0.assignmentId.isEmpty } }
    }

    /// Completed sessions this week — REAL completion (server 'completed' OR the
    /// optimistic local store), never driven by the date passing.
    private var completedCount: Int {
        realSessions.filter { isSessionCompleted($0) }.count
    }

    /// "21–27 jul" (same month) / "28 jul – 3 ago" (cross-month). Nil when unset.
    private var weekDateRange: String? {
        guard let s = parseIsoDay(weekStart), let e = parseIsoDay(weekEnd) else { return nil }
        let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        let sm = months[(s.month - 1) % 12]
        let em = months[(e.month - 1) % 12]
        if s.month == e.month { return "\(s.day)–\(e.day) \(em)" }
        return "\(s.day) \(sm) – \(e.day) \(em)"
    }

    private func parseIsoDay(_ iso: String) -> (day: Int, month: Int)? {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
        return (d, m)
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
        // Smoothly raise/clear the drop-target highlight as a drag passes over days.
        .animation(.easeOut(duration: 0.15), value: dropTargetIso)
    }

    // Dispatch a non-today day: 2+ real sessions expand to one tappable row per
    // session (mirroring today's expanded card, minus the today highlight), so
    // every session of every day is openable. Single-session / rest days stay a
    // single collapsed row, unchanged.
    @ViewBuilder
    private func dayRow(_ day: AthleteWeekDay) -> some View {
        if day.sessions.filter({ !$0.assignmentId.isEmpty }).count > 1 {
            multiSessionDayRow(day)
        } else {
            collapsedDayRow(day)
        }
    }

    // A multi-session (non-today) day: the day label heads a stack of per-session
    // rows — each its own tappable / draggable line carrying its state and the
    // move/technique/correct affordances. Reuses the SAME `sessionLine` today
    // renders, so a past/future day opens every session, not just the first.
    @ViewBuilder
    private func multiSessionDayRow(_ day: AthleteWeekDay) -> some View {
        let sessions = day.sessions.filter { !$0.assignmentId.isEmpty }
        let isTarget = dropTargetIso == day.isoDate

        let card = VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: Theme.Spacing.m) {
                Text(dayLabelES(day.dayOfWeek))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
                    .frame(width: 32, alignment: .leading)
                Text("\(sessions.count) sesiones")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: 0)
            }
            VStack(spacing: 7) {
                ForEach(Array(sessions.enumerated()), id: \.element.id) { _, session in
                    sessionLineWithStake(session, sourceIso: day.isoDate)
                }
            }
            .padding(.leading, 44)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isTarget ? Theme.Color.accentText.opacity(0.08) : Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(isTarget ? Theme.Color.accentText : Theme.Color.hairline,
                        lineWidth: isTarget ? 2 : 1)
        )

        dayDropTarget(card, day: day)
    }

    // A collapsed day row: day label (mono) · modality dot · session name ·
    // status glyph. Rest days read muted with no dot; tapping a day with a real
    // session opens its Detalle.
    @ViewBuilder
    private func collapsedDayRow(_ day: AthleteWeekDay) -> some View {
        let primary = day.sessions.first
        let rest = isRest(day)
        // The collapsed row paints the PRIMARY session's state (its own mark); a
        // second session is signalled by the "+N" hint in the title line.
        let state = primary.map(sessionState) ?? .pending
        let canOpen = !rest && !(primary?.assignmentId.isEmpty ?? true)
        // A collapsed row operates on its PRIMARY session (as tap-to-open does):
        // draggable + a move menu when that session can be rescheduled. The
        // chevron is replaced by the move affordance to keep the trailing count
        // unchanged (move + technique).
        let movable = !rest && (primary.map(canMove) ?? false)
        let isTarget = dropTargetIso == day.isoDate

        let row = HStack(spacing: Theme.Spacing.s) {
            draggableSession(
                Button {
                    guard let primary, !primary.assignmentId.isEmpty, !rest else { return }
                    Haptics.light()
                    tap(primary)
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

                        trailingStatus(rest: rest, state: state,
                                       hasSession: primary != nil, showChevron: !movable)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .disabled(!canOpen),
                session: primary,
                sourceIso: day.isoDate
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(rowAccessibilityLabel(day: day, rest: rest, state: state))
            .accessibilityAddTraits(canOpen ? .isButton : [])

            if movable, let session = primary {
                moveMenu(for: session, sourceIso: day.isoDate)
            }
            if canOpen, let session = primary {
                techniqueButton(for: session)
                correctMenu(for: session)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity)
        .background(isTarget ? Theme.Color.accentText.opacity(0.08) : Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(isTarget ? Theme.Color.accentText : Theme.Color.hairline,
                        lineWidth: isTarget ? 2 : 1)
        )

        dayDropTarget(row, day: day)
    }

    // TODAY's row: highlighted on the elevated surface with an ORANGE border,
    // showing each session (AM/PM) on its own line. Tapping the card opens the
    // first session's Detalle; tapping a specific session opens that one.
    @ViewBuilder
    private func todayRow(_ day: AthleteWeekDay) -> some View {
        let rest = isRest(day)
        let sessions = day.sessions.filter { !$0.assignmentId.isEmpty }
        let multi = sessions.count > 1
        let isTarget = dropTargetIso == day.isoDate

        let card = VStack(alignment: .leading, spacing: 9) {
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
                        sessionLineWithStake(session, sourceIso: todayIso)
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
                .stroke(Theme.Color.accentText, lineWidth: isTarget ? 2.5 : 1.5)
        )
        .brandShadow(Theme.Shadow.cardTight)
        // Tapping anywhere on the (non-rest) card opens the first session, while
        // each session line below independently opens its own Detalle.
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .onTapGesture {
            guard !rest, let first = day.sessions.first(where: { !$0.assignmentId.isEmpty }) else { return }
            Haptics.light()
            tap(first)
        }
        .accessibilityElement(children: .contain)

        // Today is also a valid drop target — you can move a session ONTO today.
        dayDropTarget(card, day: day)
    }

    // One session line inside an expanded day card (today OR any multi-session
    // day): slot badge + name + the move/technique affordances + status glyph.
    // Each line is its own drag source, rooted at `sourceIso` (a two-a-day moves
    // one session at a time), and taps route through `tap(_:)` for THIS session.
    private func sessionLine(_ session: AthleteWeekDaySession, sourceIso: String) -> some View {
        let state = sessionState(session)
        let done = state == .done
        let movable = canMove(session)
        return HStack(spacing: Theme.Spacing.s) {
            draggableSession(
                Button {
                    Haptics.light()
                    tap(session)
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
                        if session.isSelfOrigin {
                            LibreBadge(compact: true)
                        }
                        if session.isTestSession {
                            TestBadge(compact: true)
                        }
                        if let badge = partnerBadge(for: session) {
                            PartnerBadge(text: badge, compact: true)
                        }
                        Spacer(minLength: Theme.Spacing.s)
                        if state == .pending {
                            if !movable {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(Theme.Color.faint)
                            }
                        } else {
                            sessionMarkGlyph(state)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle()),
                session: session,
                sourceIso: sourceIso
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "\(slot(for: session) == .am ? "Mañana" : "Tarde"), \(session.title)"
                + sessionStateA11y(state)
            )
            .accessibilityAddTraits(.isButton)

            if movable {
                moveMenu(for: session, sourceIso: sourceIso)
            }
            if !session.assignmentId.isEmpty {
                techniqueButton(for: session)
                correctMenu(for: session)
            }
        }
    }

    // #34 — a test session in the plan wears the amber "Test" badge AND, while it's
    // still pending, a one-line CALIBRATION stake caption: it fixes the athlete's
    // zones / 1RM / level, so it reads as "do this fresh, it sets your numbers" —
    // not a normal training day. A done test drops the caption (the stake is
    // spent). Wraps `sessionLine` so both expanded contexts share it (DRY).
    @ViewBuilder
    private func sessionLineWithStake(_ session: AthleteWeekDaySession, sourceIso: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            sessionLine(session, sourceIso: sourceIso)
            if session.isTestSession, sessionState(session) == .pending {
                HStack(spacing: 5) {
                    Image(systemName: "target")
                        .font(.system(size: 9, weight: .semibold))
                    Text("Calibración · fija tus zonas y tu nivel")
                        .font(.system(size: 10, weight: .medium))
                        .lineLimit(1)
                }
                .foregroundStyle(Theme.Color.warning)
                .accessibilityLabel("Sesión de calibración: fija tus zonas y tu nivel")
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
                if day.sessions.first?.isSelfOrigin == true {
                    LibreBadge(compact: true)
                }
                if day.sessions.first?.isTestSession == true {
                    TestBadge(compact: true)
                }
                if let session = day.sessions.first, let badge = partnerBadge(for: session) {
                    PartnerBadge(text: badge, compact: true)
                }
            }
        }
    }

    // Trailing glyph for a collapsed row: one of the four state marks (hecha ✓ /
    // parcial ½ / no hecha ✕), or — for a PENDIENTE session — a chevron tap hint
    // (suppressed when a button already signals interactivity). Nothing on rest.
    @ViewBuilder
    private func trailingStatus(
        rest: Bool,
        state: SessionMarkState,
        hasSession: Bool,
        showChevron: Bool = true
    ) -> some View {
        if rest || !hasSession {
            EmptyView()
        } else if state == .pending {
            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            } else {
                EmptyView()
            }
        } else {
            sessionMarkGlyph(state)
        }
    }

    /// The single source for a session's state MARK — used by the collapsed row,
    /// today's session lines, and the (a11y) row labels so the four marks can
    /// never drift across surfaces. `.pending` carries no glyph (handled by the
    /// caller's chevron / empty affordance).
    @ViewBuilder
    private func sessionMarkGlyph(_ state: SessionMarkState) -> some View {
        switch state {
        case .done:
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Color.ok)
        case .partial:
            // Amber half — "terminó antes", unmistakably not a full check.
            Image(systemName: "circle.lefthalf.filled")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Color.warning)
        case .missed:
            // Red cross — "tocaba y no se hizo": what slipped, not just what's left.
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Color.danger)
        case .pending:
            EmptyView()
        }
    }

    // MARK: - Correct a session's state (concept §H)
    //
    // A per-row "···" menu that fixes the state retroactively, contextual to the
    // CURRENT state. It leans on what already exists — the "Ya lo hice" manual log
    // — and adds the two things that were missing: reaching it from the plan, and
    // UNDOING a "hecho". No second save path is introduced.

    /// The "···" correction menu. Offered actions depend on the session's state:
    ///   pendiente / no hecha → Marcar como hecha · Completar ahora
    ///   parcial              → Completar ahora · Deshacer hecho
    ///   hecha                → Deshacer hecho
    @ViewBuilder
    private func correctMenu(for session: AthleteWeekDaySession) -> some View {
        let state = sessionState(session)
        Menu {
            switch state {
            case .pending, .missed:
                Button { markDone(session) } label: {
                    Label("Marcar como hecha", systemImage: "checkmark")
                }
                Button { completeNow(session) } label: {
                    Label("Completar ahora", systemImage: "square.and.pencil")
                }
            case .partial:
                Button { completeNow(session) } label: {
                    Label("Completar ahora", systemImage: "square.and.pencil")
                }
                Button(role: .destructive) { requestUndo(session) } label: {
                    Label("Deshacer hecho", systemImage: "arrow.uturn.backward")
                }
            case .done:
                Button(role: .destructive) { requestUndo(session) } label: {
                    Label("Deshacer hecho", systemImage: "arrow.uturn.backward")
                }
            }
            // Un LIBRE es del atleta: se borra del todo, en cualquier estado. Antes
            // el único deshacer era reset → volvía a PENDIENTE y renacía el fantasma
            // (IMG_2389). Las del coach no ofrecen esto: se deshacen, no se borran.
            if session.isSelfOrigin {
                Button(role: .destructive) { deleteFreeTarget = session } label: {
                    Label("Borrar entreno libre", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 32, height: 30)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Corregir estado de \(session.title)")
    }

    /// Ejecuta el borrado total del libre confirmado y refresca la semana.
    private func confirmDeleteFree(_ session: AthleteWeekDaySession) {
        deleteFreeTarget = nil
        guard let id = Int(session.assignmentId) else { return }
        Task { @MainActor in
            do {
                try await PlanService.deleteFreeSession(assignmentId: id, bearer: effectiveBearer ?? "")
                Haptics.medium()
                await store.planMutated()
            } catch {
                showActionError("No se pudo borrar el entreno. Inténtalo de nuevo.")
            }
        }
    }

    /// Drives the destructive "Deshacer" confirm dialog from the awaiting session.
    private var undoConfirmBinding: Binding<Bool> {
        Binding(
            get: { undoConfirmTarget != nil },
            set: { if !$0 { undoConfirmTarget = nil } }
        )
    }

    // MARK: - Correction actions

    /// "Marcar como hecha" — assert the FACT without inventing metrics. Optimistic
    /// (instant ✓ via the local completed store + a cache-first reseed), then the
    /// manual recorder writes an all-null execution (source='manual') and the plan
    /// reconciles to the authoritative server status. Reverts on save failure.
    private func markDone(_ session: AthleteWeekDaySession) {
        guard let token = effectiveBearer, !session.assignmentId.isEmpty else {
            showActionError("No se pudo marcar la sesión. Inténtalo de nuevo.")
            return
        }
        let id = session.assignmentId
        CompletedAssignmentsStore.markCompleted(id)                 // optimistic ✓
        if let cached = store.planWeek.value { applyWeek(cached) }  // instant re-render
        Haptics.success()
        Task {
            do {
                try await PlanService.markSessionDone(assignmentId: id, bearer: token)
                await store.planMutated()                            // refetch → 'completed'
                await loadPlan()
            } catch {
                CompletedAssignmentsStore.unmark(id)                 // revert the mark
                if let cached = store.planWeek.value { applyWeek(cached) }
                Haptics.error()
                showActionError("No se pudo marcar como hecha. Inténtalo de nuevo.")
            }
        }
    }

    /// "Completar ahora" — route into the EXISTING retroactive manual log. Opens
    /// the session's Detalle (WorkoutContainer), whose brief carries the built-in
    /// "Ya lo hice · registrar sin cronómetro" path. No save logic is duplicated.
    private func completeNow(_ session: AthleteWeekDaySession) {
        open(assignmentId: session.assignmentId, title: session.title)
    }

    /// "Deshacer hecho" — first pass, unconfirmed. The SERVER decides whether the
    /// session holds real recorded work: if so it asks for confirmation (we raise
    /// the destructive dialog); otherwise the reset already happened and we
    /// reconcile the plan back to pendiente.
    private func requestUndo(_ session: AthleteWeekDaySession) {
        guard let token = effectiveBearer, let numericId = Int(session.assignmentId) else {
            showActionError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            return
        }
        Task {
            do {
                let outcome = try await PlanService.resetSession(
                    assignmentId: numericId, confirm: false, bearer: token
                )
                switch outcome {
                case .reset:            await applyUndo(session)
                case .needsConfirmation: undoConfirmTarget = session  // → confirm dialog
                }
            } catch {
                Haptics.error()
                showActionError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            }
        }
    }

    /// Confirmed destructive reset — the athlete accepted losing the recorded work.
    private func confirmUndo(_ session: AthleteWeekDaySession) {
        undoConfirmTarget = nil
        guard let token = effectiveBearer, let numericId = Int(session.assignmentId) else {
            showActionError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            return
        }
        Task {
            do {
                _ = try await PlanService.resetSession(
                    assignmentId: numericId, confirm: true, bearer: token
                )
                await applyUndo(session)
            } catch {
                Haptics.error()
                showActionError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            }
        }
    }

    /// Clear the local optimistic mark and re-fetch authoritative state (the server
    /// returns the session as 'scheduled' → the plan re-renders pendiente).
    private func applyUndo(_ session: AthleteWeekDaySession) async {
        CompletedAssignmentsStore.unmark(session.assignmentId)
        Haptics.success()
        await store.planMutated()
        await loadPlan()
    }

    // MARK: - Legend (modality colors)

    private var legend: some View {
        // Two centered rows cover the full modality palette without overflowing
        // 390pt. Driven by the canonical modality KINDS (Theme.Modality.Kind) so
        // the key can never drift from the dots + breakdown it explains (single
        // source of truth for both the hue and the word).
        let kinds: [Theme.Modality.Kind] = [.run, .ergo, .strength, .functional, .hyrox, .support]
        return VStack(spacing: 6) {
            ForEach(Rejilla.filas(kinds, de: 3), id: \.self) { row in
                HStack(spacing: Theme.Spacing.l) {
                    Spacer(minLength: 0)
                    ForEach(row, id: \.self) { kind in
                        legendItem(color: kind.color, label: kind.label)
                    }
                    Spacer(minLength: 0)
                }
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

    // MARK: - Empty / error state

    private var emptyPlanState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: loadFailed ? "wifi.exclamationmark" : "calendar.badge.clock")
                .font(.system(size: 40))
                .foregroundStyle(Theme.Color.muted)
            Text(loadFailed
                 ? "No pudimos cargar tu plan"
                 : (hasCoach
                    ? "Tu coach aún no ha publicado tu plan"
                    : "Tu semana está en blanco"))
                .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(loadFailed
                 ? "Revisa tu conexión e inténtalo de nuevo."
                 : (hasCoach
                    ? "Cuando tu coach asigne tus sesiones aparecerán aquí, día a día."
                    : "Construye un entreno desde Inicio y aparecerá aquí, día a día."))
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

    // MARK: - Paused state (coach put the plan on pause)
    //
    // Calm, warm card shown INSTEAD of the day list when the coach paused the
    // athlete (lesión / vacaciones / parón). No sessions, no error tone — the
    // progress is safe and the plan resumes when the athlete is ready.
    private var pausedPlanState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: "pause.circle")
                .font(.system(size: 40))
                .foregroundStyle(Theme.Color.accentText)
            Text("Tu plan está en pausa")
                .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(pausedBody)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let since = pausedSinceLabel {
                Text(since)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, Theme.Spacing.xxl)
        .accessibilityElement(children: .combine)
    }

    /// Warm body copy. Uses the real coach NAME when the payload carries it (same
    /// `coachName` the "por {coach}" subtitle uses), never a hardcoded name; falls
    /// back to "Tu coach" so the sentence always reads.
    private var pausedBody: String {
        let coach = coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let who = (coach?.isEmpty == false) ? coach! : "Tu coach"
        return "\(who) lo ha pausado mientras te recuperas. Retomamos en cuanto estés listo — tu progreso está guardado."
    }

    /// "En pausa desde el 3 de julio" from the ISO `paused_since`; nil when unset
    /// or unparseable (never a broken half-sentence).
    private var pausedSinceLabel: String? {
        guard let iso = pausedSince, let formatted = formatLongDate(iso) else { return nil }
        return "En pausa desde el \(formatted)"
    }

    /// "3 de julio" from an ISO "YYYY-MM-DD"; nil when unparseable. Mirrors the
    /// app's es_ES DateFormatter convention (see PartnerTodayPanel.dateLabel), with
    /// a fuller output for the warmer paused copy.
    private func formatLongDate(_ iso: String) -> String? {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: iso) else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "d 'de' MMMM"
        return out.string(from: date)
    }

    // MARK: - Actions

    private func open(assignmentId: String?, title: String?) {
        guard let assignmentId, !assignmentId.isEmpty else { return }
        workoutLaunch = WorkoutLaunch(assignmentId: assignmentId, title: title)
    }

    /// Tapping a session row routes by STATE: a FINISHED session (done / partial)
    /// opens its read-only executed detail (what was logged); a pending / missed
    /// session opens the active-workout brief (the path to do it). One decision
    /// point so done and pending can never be confused at the tap. The per-row
    /// "···" correction menu still offers "Completar ahora" for a partial.
    private func tap(_ session: AthleteWeekDaySession) {
        guard !session.assignmentId.isEmpty else { return }
        switch sessionState(session) {
        case .done, .partial:
            executedLaunch = WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
        case .pending, .missed:
            open(assignmentId: session.assignmentId, title: session.title)
        }
    }

    // MARK: - Move a session to another day (drag & drop + accessible menu)
    //
    // The athlete reschedules a session within THIS week. Drag & drop is the
    // hero ("arrastrar con la mano"); the per-session "Mover" menu is the
    // accessible, always-reliable alternative (drag-and-drop alone fails WCAG).
    // Both paths funnel through `handleMove`, which updates optimistically and
    // reverts on failure. Cross-week is a future phase — only this week's days
    // are valid targets, so the UI only offers moves when `weekOffset == 0`.

    /// A session can be moved only on THIS week, when it's a real assignment and
    /// not yet completed. The next-week peek is read-only; completed sessions are
    /// frozen (the backend returns 409). Drives the drag source and the menu.
    private func canMove(_ session: AthleteWeekDaySession) -> Bool {
        weekOffset == 0 && !session.assignmentId.isEmpty && !isSessionCompleted(session)
    }

    /// The lift preview shown while dragging — a compact branded pill so the
    /// gesture reads as intentional.
    private func dragPreview(_ session: AthleteWeekDaySession) -> some View {
        HStack(spacing: 6) {
            ModalityDot(modality: session.modality, size: 7)
            Text(session.title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.Color.surfaceElevated)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Theme.Color.accentText, lineWidth: 1.5))
    }

    /// Make `content` a drag source for `session` — but only when the session is
    /// movable. Rest days / completed sessions / the peek week stay inert.
    @ViewBuilder
    private func draggableSession<V: View>(
        _ content: V,
        session: AthleteWeekDaySession?,
        sourceIso: String
    ) -> some View {
        if let session, canMove(session) {
            content.draggable(
                MovableSession(assignmentId: session.assignmentId, sourceIso: sourceIso)
            ) {
                dragPreview(session)
            }
        } else {
            content
        }
    }

    /// Make `content` a drop target for the given day, highlighting it while a
    /// drag hovers. Only active on this week (the peek is read-only).
    @ViewBuilder
    private func dayDropTarget<V: View>(_ content: V, day: AthleteWeekDay) -> some View {
        if weekOffset == 0 {
            content.dropDestination(for: MovableSession.self) { items, _ in
                guard let payload = items.first else { return false }
                return handleDrop(payload, onto: day.isoDate)
            } isTargeted: { targeted in
                if targeted {
                    dropTargetIso = day.isoDate
                } else if dropTargetIso == day.isoDate {
                    dropTargetIso = nil
                }
            }
        } else {
            content
        }
    }

    /// The accessible, non-drag path: a tap menu listing the OTHER days with what
    /// each already holds, so the athlete picks a day with full context.
    private func moveMenu(for session: AthleteWeekDaySession, sourceIso: String) -> some View {
        Menu {
            Section("Mover a otro día") {
                ForEach(days.filter { $0.isoDate != sourceIso }) { day in
                    Button {
                        handleMove(assignmentId: session.assignmentId,
                                   from: sourceIso, to: day.isoDate)
                    } label: {
                        Text(menuDayLabel(day))
                    }
                }
            }
        } label: {
            Image(systemName: "calendar")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 34, height: 30)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Mover \(session.title) a otro día")
    }

    /// "Lunes 21 · libre" / "Hoy · 1 sesión" — the day, its date, and its load.
    private func menuDayLabel(_ day: AthleteWeekDay) -> String {
        let name = (day.isoDate == todayIso) ? "Hoy" : fullDayNameES(day.dayOfWeek)
        let real = day.sessions.filter { !$0.assignmentId.isEmpty }.count
        let load = real == 0 ? "libre" : (real == 1 ? "1 sesión" : "\(real) sesiones")
        if let n = parseIsoDay(day.isoDate)?.day, day.isoDate != todayIso {
            return "\(name) \(n) · \(load)"
        }
        return "\(name) · \(load)"
    }

    private func fullDayNameES(_ dow: Int) -> String {
        switch dow {
        case 1: return "Lunes"
        case 2: return "Martes"
        case 3: return "Miércoles"
        case 4: return "Jueves"
        case 5: return "Viernes"
        case 6: return "Sábado"
        default: return "Domingo"
        }
    }

    /// Drop handler: clear the highlight and move (unless dropped on its own day).
    private func handleDrop(_ payload: MovableSession, onto targetIso: String) -> Bool {
        dropTargetIso = nil
        guard payload.sourceIso != targetIso else { return false }
        handleMove(assignmentId: payload.assignmentId, from: payload.sourceIso, to: targetIso)
        return true
    }

    /// Move a session optimistically, then confirm with the backend. On failure
    /// the week is reverted and the reason surfaced. Idempotent against no-ops.
    private func handleMove(assignmentId: String, from sourceIso: String, to targetIso: String) {
        guard weekOffset == 0, sourceIso != targetIso else { return }
        guard let token = effectiveBearer, let numericId = Int(assignmentId) else {
            showActionError("No se pudo mover la sesión. Inténtalo de nuevo.")
            return
        }
        // Defensive: a session completed on the server (or locally) is frozen —
        // the backend would 409. We also keep completed sessions un-draggable.
        if let session = realSessions.first(where: { $0.assignmentId == assignmentId }),
           isSessionCompleted(session) {
            Haptics.error()
            showActionError("Esta sesión ya está completada y no se puede mover.")
            return
        }

        let snapshot = days
        reschedule(assignmentId: assignmentId, to: targetIso)   // optimistic
        actionError = nil
        movePending = true
        Haptics.success()

        Task {
            defer { movePending = false }
            do {
                _ = try await PlanService.moveSession(
                    assignmentId: numericId, toDate: targetIso, bearer: token
                )
                // Success — keep the optimistic week locally, and refresh the
                // store so the OTHER tabs (Inicio's week tile / next session)
                // reflect the move too.
                await store.planMutated()
            } catch {
                days = snapshot                 // revert
                Haptics.error()
                showActionError(moveErrorMessage(for: error))
            }
        }
    }

    /// Optimistically move a session to `targetIso`: pull it from its current day
    /// and append it to the target, re-sorting so AM precedes PM. Rest flags
    /// follow the count (a day emptied becomes rest; a rest day that receives a
    /// session no longer reads as rest).
    private func reschedule(assignmentId: String, to targetIso: String) {
        var moved: AthleteWeekDaySession?
        var next: [AthleteWeekDay] = days.map { day in
            guard let idx = day.sessions.firstIndex(where: { $0.assignmentId == assignmentId })
            else { return day }
            var ss = day.sessions
            moved = ss.remove(at: idx)
            return AthleteWeekDay(dayOfWeek: day.dayOfWeek, isoDate: day.isoDate,
                                  sessions: ss, isRest: ss.isEmpty ? true : day.isRest)
        }
        guard let movedSession = moved else { return }
        next = next.map { day in
            guard day.isoDate == targetIso else { return day }
            var ss = day.sessions
            ss.append(movedSession)
            ss.sort { slotRank($0) < slotRank($1) }
            return AthleteWeekDay(dayOfWeek: day.dayOfWeek, isoDate: day.isoDate,
                                  sessions: ss, isRest: false)
        }
        days = next
    }

    /// AM (or unspecified) sorts before PM so a two-a-day reads morning→evening.
    private func slotRank(_ s: AthleteWeekDaySession) -> Int {
        s.slot.lowercased().hasPrefix("pm") ? 1 : 0
    }

    /// Show a transient failure message that auto-dismisses (unless replaced
    /// sooner). Shared by the move flow and the state-correction row actions.
    private func showActionError(_ message: String) {
        actionError = message
        Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            if actionError == message { actionError = nil }
        }
    }

    /// Map a move failure to athlete-facing copy. 409 = completed (frozen); 422 =
    /// out-of-week (only this week's days are valid) or malformed; 404 = the
    /// session vanished; else generic / offline.
    private func moveErrorMessage(for error: Error) -> String {
        guard case let APIError.http(status, data) = error else {
            return "No se pudo mover la sesión. Revisa tu conexión."
        }
        let code = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error.code
        switch status {
        case 409: return "Esta sesión ya está completada y no se puede mover."
        case 422:
            if code == "out_of_range" {
                return "Solo puedes mover la sesión dentro de esta semana."
            }
            return "No se pudo mover la sesión. Revisa el día e inténtalo de nuevo."
        case 404: return "No encontramos esta sesión. Desliza para recargar tu plan."
        case 401: return "Tu sesión ha caducado. Vuelve a entrar para mover la sesión."
        default:  return "No se pudo mover la sesión. Inténtalo de nuevo."
        }
    }

    // The transient action-failure banner (a failed move is already reverted by
    // the time this shows; a failed correction left the state unchanged).
    @ViewBuilder
    private var actionErrorBanner: some View {
        if let actionError {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.danger)
                Text(actionError)
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Theme.Spacing.s)
                Button {
                    self.actionError = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Cerrar aviso")
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 10)
            .background {
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                            .fill(Theme.Color.dangerTint)
                    )
            }
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.danger.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .brandShadow(Theme.Shadow.cardTight)
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Aviso: \(actionError)")
        }
    }

    // MARK: - Load

    private func loadPlan(force: Bool = false) async {
        guard effectiveBearer != nil else {
            loading = false
            loadFailed = true
            return
        }

        if weekOffset == 0 {
            // CACHE-FIRST: render the store's current week instantly when present
            // (no spinner on a tab switch).
            if let cached = store.planWeek.value {
                applyWeek(cached)
                partner = store.partner.value?.partner
                loading = false
                loadFailed = false
            }
            // SWR: revalidate the current-week + partner slices, then re-seed.
            // `force` (pull-to-refresh) bypasses the staleness window.
            await store.loadPlanScreen(force: force)
            // Don't clobber an in-flight optimistic move, and bail if the athlete
            // navigated to the peek while we were loading.
            guard weekOffset == 0, !movePending else { return }
            if let fresh = store.planWeek.value {
                applyWeek(fresh)
                loadFailed = false
            } else if store.planWeek.hasLoaded {
                // Loaded successfully but the athlete has no published week.
                days = []
                loadFailed = false
            } else {
                // First-ever load failed (offline, nothing cached).
                loadFailed = true
            }
            partner = store.partner.value?.partner
            loading = false
        } else {
            await loadPeekWeek()
        }
    }

    /// Apply a week payload to the screen's working copy. `days` is the mutable
    /// copy the move-a-session flow edits optimistically; the rest is metadata.
    private func applyWeek(_ resp: AthletePlanWeekResponse) {
        days = resp.week.days
        todayIso = resp.week.todayIso
        weekStart = resp.week.weekStart
        weekEnd = resp.week.weekEnd
        // Coach-authored week focus — surfaced verbatim, no per-day detail.
        focus = resp.week.focus
        hasNextWeek = resp.week.hasNextWeek ?? false
        coachName = resp.coachName
        paused = resp.week.paused
        pausedSince = resp.week.pausedSince
    }

    /// The NEXT-week peek is a forward navigation (not a tab switch) and isn't
    /// cached centrally, so it fetches directly. Partner still comes from the store.
    private func loadPeekWeek() async {
        defer { loading = false }
        guard let token = effectiveBearer else { loadFailed = true; return }
        do {
            let resp = try await PlanService.fetchWeek(bearer: token, weekOffset: weekOffset)
            applyWeek(resp)
            partner = store.partner.value?.partner
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

    /// The session's visible state — one of the four marks the plan paints
    /// (pendiente / parcial / hecha / no hecha). Reads the REAL server status,
    /// with the local optimistic-completed store unioned in. Single source for
    /// both the marker glyph and the row's correction menu.
    private func sessionState(_ session: AthleteWeekDaySession) -> SessionMarkState {
        SessionMarkState.of(status: session.status, assignmentId: session.assignmentId)
    }

    /// A session is done when its state is `.done` (server 'completed' OR the
    /// local optimistic mark). Kept as the move-guard / counter predicate; now
    /// derived from `sessionState` so the two can never drift.
    private func isSessionCompleted(_ session: AthleteWeekDaySession) -> Bool {
        sessionState(session) == .done
    }

    /// VoiceOver suffix naming a session's state (matches the four marks). Empty
    /// for pendiente — the row already reads as an actionable, not-yet-done item.
    private func sessionStateA11y(_ state: SessionMarkState) -> String {
        switch state {
        case .done:    return ", completada"
        case .partial: return ", parcial"
        case .missed:  return ", no hecha"
        case .pending: return ""
        }
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

    private func rowAccessibilityLabel(day: AthleteWeekDay, rest: Bool, state: SessionMarkState) -> String {
        let label = dayLabelES(day.dayOfWeek)
        if rest { return "\(label), descanso" }
        let title = day.sessions.first?.title ?? "sesión"
        return "\(label), \(title)" + sessionStateA11y(state)
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

// Aquí vivía un `formatDuration` con una TERCERA grafía de la duración: los minutos
// redondos salían como «5'». El mismo tramo se leía «5'» en el plan y «5:00» en el
// entreno. Ahora los dos dicen «5:00» (`Formato.clock`).

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
                let works = rows.compactMap(\.work)
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
            parts.append("descanso \(Formato.clock(rest, subMinuto: .segundos))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func runningSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        if let dur = p.durationSeconds {
            parts.append(Formato.clock(dur, subMinuto: .segundos))
        }
        if let km = p.distanceKm {
            parts.append(Formato.distancia(km * 1000, decimales: 2) ?? "")
        } else if let m = p.distanceMeters {
            parts.append("\(m) m")
        }
        if let zone = p.hrZone {
            parts.append("Z\(zone)")
        }
        if let pace = p.paceSecPerKm {
            parts.append("\(Formato.ritmoCifras(Double(pace)))/km")
        }
        if let spm = p.cadenceSpm {
            parts.append("\(spm) spm")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func ergoSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        if let dur = p.durationSeconds {
            parts.append(Formato.clock(dur, subMinuto: .segundos))
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
            parts.append("\(Formato.ritmoCifras(Double(pace / 2)))/500m")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func formatKg(_ kg: Double) -> String { Formato.kg(kg) }

    private static func formatRpe(_ rpe: Double) -> String { Formato.esDecimal(rpe) }

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

// MARK: - Drag payload (move a session to another day)
//
// The transferable carried by a session drag: which assignment, and the day it
// started on (so a drop onto its own day is a no-op). Encoded as a tiny
// "assignmentId|sourceIso" string via a proxy representation — no custom
// UTType to declare (keeps it in-process, warning-free) and the `for:` drop
// destination still matches only this type.
struct MovableSession: Transferable {
    let assignmentId: String
    let sourceIso: String

    init(assignmentId: String, sourceIso: String) {
        self.assignmentId = assignmentId
        self.sourceIso = sourceIso
    }

    init(encoded: String) throws {
        let parts = encoded
            .split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
            .map(String.init)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else {
            throw CocoaError(.coderInvalidValue)
        }
        self.assignmentId = parts[0]
        self.sourceIso = parts[1]
    }

    static var transferRepresentation: some TransferRepresentation {
        ProxyRepresentation(
            exporting: { "\($0.assignmentId)|\($0.sourceIso)" },
            importing: { try MovableSession(encoded: $0) }
        )
    }
}

#Preview {
    PlanView()
        .environment(AppDataStore())
}
