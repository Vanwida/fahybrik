import SwiftUI

// Inicio tab root — "qué toca hoy" without noise. Faithful rebuild of the
// handoff Inicio (design_handoff_fhp/App Atleta - Flujo.dc.html → `inicio`)
// using our Theme tokens + Fabrik orange (the handoff's brand red maps to our
// orange; partner/ergo blue stays Theme.Color.info). Every value is REAL data
// or an honest empty state — nothing fabricated.
//
// Layout (top → bottom): header (wordmark + bell w/ unread dot + athlete
// avatar) → greeting (orange date kicker + "Hola, {name}") → AM hero session →
// PM compact session (only when today has a second session) → readiness +
// week/race tiles → coach-note row. This view owns its own data load (me +
// readiness + plan week + macro progress + chat thread) and the Empezar /
// Check-in sheets that used to live on the Today tab.
struct InicioView: View {
    /// Session bearer, provided by AppShell. Falls back to the persisted token.
    var bearer: String? = nil
    /// Lets the header / tiles / coach note route the shell to another tab.
    var onOpenTab: ((AppTab) -> Void)? = nil

    @State private var showWorkout: Bool = false
    @State private var showCheckin: Bool = false
    // Presents the target-race picker from the empty race tile.
    @State private var showBuscarCarrera: Bool = false

    // Which of today's sessions "Empezar" launches (the hero's session).
    @State private var startAssignmentId: String? = nil
    @State private var startFallbackTitle: String? = nil

    // Drives the one orchestrated staggered reveal of the cards on appear.
    @State private var revealed: Bool = false

    @State private var checkinPending: Bool = CheckinStore.isPending()
    @State private var sessionBearer: String? = nil

    // ── Shared data: read live from the injected AppDataStore (cache-first/SWR) ──
    // These derive from the store's slices, so switching tabs renders instantly
    // from memory — no per-view re-fetch, no spinner; the store revalidates in the
    // background. The derivation helpers (sessionsForToday, weekSessionCounts, …)
    // are unchanged; only their input now comes from the store.
    @Environment(AppDataStore.self) private var store

    // Athlete identity (greeting + avatar). Nil until /api/auth/me resolves.
    private var identity: AthleteIdentity? { store.identity.value }

    /// The current week payload — the single source for today's sessions, macro
    /// context, the race countdown and the week counts below.
    private var planWeek: AthletePlanWeekResponse? { store.planWeek.value }

    private var readinessScore: Int? { store.readiness.value?.score }
    private var readinessDelta: Int? { store.readiness.value?.delta7d }

    // Today's still-active sessions, in slot order (AM hero, then PM compact).
    private var todaySessions: [AthleteWeekDaySession] {
        planWeek.map(sessionsForToday) ?? []
    }
    // Fallback when today has no sessions: the next future session in the week.
    private var nextWorkout: NextWorkout? {
        planWeek.flatMap(PlanService.nextWorkout)
    }
    // Whether the athlete has ANY published session this week (across all days) —
    // distinguishes "no plan at all" from "has a plan but nothing left today".
    private var hasPlan: Bool { planWeek.map(planExists) ?? false }
    // Whether TODAY is genuinely a rest day vs a training day already completed.
    private var todayIsRest: Bool { planWeek.map(isTodayRest) ?? false }
    // Real macro context (block / week label / days to A-event).
    private var macro: AthleteMacroSummary? { planWeek?.macroSummary }
    // Per-week macro progress → real "week N/M" + segmented bar on the week tile.
    private var macroWeeks: [AthleteMacroProgressWeek] {
        store.macroProgress.value?.macroProgress?.weeks ?? []
    }
    // Real sessions-done / sessions-total for THIS week (one computation, two reads).
    private var weekCounts: (done: Int, total: Int) {
        planWeek.map(weekSessionCounts) ?? (done: 0, total: 0)
    }
    private var weekDone: Int { weekCounts.done }
    private var weekTotal: Int { weekCounts.total }
    // The GOAL race the plan peaks for → primary countdown tile.
    private var targetRace: AthleteNextRace? { planWeek?.targetRace }
    // The chronologically next race (intermediate or same as target).
    private var nextRace: AthleteNextRace? { planWeek?.nextRace }
    // Unread coach messages → bell dot + coach-note row dot. 0 when none.
    private var unreadCount: Int { store.unreadCount }
    // The athlete's coach thread — latest coach message preview + voice note.
    private var coachThread: ChatThreadDTO? { store.chatThread.value }
    // Dobles partner training snapshot — only for a coach-created doubles_pair.
    private var partner: PartnerInfo? {
        let env = store.partner.value
        return (env?.isDoublesPair == true) ? env?.partner : nil
    }

    /// Effective bearer: the one AppShell passed, else the persisted token.
    private var effectiveBearer: String? {
        sessionBearer ?? bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                    .staggerReveal(revealed, index: 0)
                greeting
                    .staggerReveal(revealed, index: 1)
                if checkinPending {
                    checkinRow
                        .staggerReveal(revealed, index: 2)
                }
                heroSection
                    .staggerReveal(revealed, index: 3)
                if let pm = pmSession {
                    SessionCompactRow(
                        slot: slotFor(pm),
                        title: pm.title,
                        meta: compactMeta(for: pm),
                        modality: pm.modality,
                        onTap: { onOpenTab?(.plan) }
                    )
                    .staggerReveal(revealed, index: 4)
                }
                if let partner {
                    PartnerTodayPanel(partner: partner)
                        .staggerReveal(revealed, index: 5)
                }
                tilesRow
                    .staggerReveal(revealed, index: 6)
                coachNoteRow
                    .staggerReveal(revealed, index: 7)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .fullScreenCover(isPresented: $showWorkout) {
            // EMPEZAR runs the real prescribed workout via WorkoutContainer,
            // matching what the athlete sees in Plan. When no assignment exists
            // the id is nil and the container degrades to a title-only plan.
            WorkoutContainer(
                assignmentId: startAssignmentId,
                fallbackTitle: startFallbackTitle,
                bearer: effectiveBearer,
                onClose: { showWorkout = false },
                onCompleted: { _ in
                    // WorkoutContainer already records the optimistic completion in
                    // CompletedAssignmentsStore, so the store-derived lists drop the
                    // finished session immediately; force-refresh the plan slices to
                    // reconcile with the server (and update every other tab too).
                    Task { await store.planMutated() }
                }
            )
        }
        .sheet(isPresented: $showCheckin) {
            CheckinView(
                bearer: effectiveBearer,
                onSubmitted: { _, _ in
                    checkinPending = false
                    showCheckin = false
                    // A check-in can change today's readiness — pull it fresh.
                    Task { await store.refreshReadiness(force: true) }
                },
                onSkipped: {
                    checkinPending = false
                    showCheckin = false
                }
            )
        }
        .sheet(isPresented: $showBuscarCarrera) {
            BuscarCarreraSheet(bearer: effectiveBearer) {
                // A target was fixed → refresh the plan so the countdown appears.
                Task { await store.planMutated() }
            }
        }
        .onAppear {
            sessionBearer = bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
            checkinPending = CheckinStore.isPending()
            // SUAVE: auto-open the check-in only the FIRST time per local day.
            // After a manual dismiss (no complete/skip) the banner stays visible
            // but we never re-present automatically — the athlete reopens it by
            // tapping the banner. Completing/skipping suppresses it until tomorrow.
            if checkinPending && !CheckinStore.hasAutoPresentedToday() {
                CheckinStore.markAutoPresented()
                showCheckin = true
            }
            // Fire the entrance cascade once per appearance.
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        .task(id: effectiveBearer) {
            // Cache-first: the body already renders from the store's slices; this
            // just scopes the session and revalidates Inicio's slices in the
            // background (throttled + de-duped, so a tab switch won't refetch).
            store.activate(bearer: effectiveBearer)
            await store.loadHome()
            pushNextWorkoutToWatch()
        }
    }

    // MARK: - Derivations
    //
    // Pure projections over the store's slices (used by the computed properties
    // above). The loading itself lives in AppDataStore now.

    /// Completed vs scheduled sessions across THIS week (all days). "Done" unions
    /// the server status with locally-recorded optimistic completions, matching
    /// the next-workout rule, so the count reflects what the athlete just did.
    private func weekSessionCounts(_ resp: AthletePlanWeekResponse) -> (done: Int, total: Int) {
        let all = resp.week.days.flatMap { $0.sessions }
        let total = all.count
        let done = all.filter {
            $0.status.lowercased() == "completed"
                || CompletedAssignmentsStore.isCompleted($0.assignmentId)
        }.count
        return (done, total)
    }

    /// Whether a plan is published: at least one day this week carries a real
    /// assignment. A week of pure rest/empty days for a brand-new athlete reads
    /// as "no plan yet" — matching the Plan tab's `hasAnySession`.
    private func planExists(_ resp: AthletePlanWeekResponse) -> Bool {
        resp.week.days.contains { day in
            day.sessions.contains { !$0.assignmentId.isEmpty }
        }
    }

    /// Whether TODAY has no assigned session at all (a genuine rest day), as
    /// opposed to a training day whose session(s) are merely done. Used only to
    /// pick the rest-card copy; if today isn't found it reads as a rest day.
    private func isTodayRest(_ resp: AthletePlanWeekResponse) -> Bool {
        guard let today = resp.week.days.first(where: { $0.isoDate == resp.week.todayIso }) else {
            return true
        }
        return today.sessions.allSatisfy { $0.assignmentId.isEmpty }
    }

    /// Today's still-active sessions, in slot order (AM before PM). A session
    /// already marked completed (server or local optimistic) is dropped so the
    /// hero only ever shows what's left to do today.
    private func sessionsForToday(_ resp: AthletePlanWeekResponse) -> [AthleteWeekDaySession] {
        let todayIso = resp.week.todayIso
        guard let today = resp.week.days.first(where: { $0.isoDate == todayIso }) else { return [] }
        let active = today.sessions.filter {
            $0.status.lowercased() != "completed"
                && !CompletedAssignmentsStore.isCompleted($0.assignmentId)
        }
        return active.sorted { slotRank($0.slot) < slotRank($1.slot) }
    }

    /// AM sorts before PM; unknown slots sort last but keep input order via index.
    private func slotRank(_ slot: String) -> Int {
        switch slot.lowercased() {
        case "am": return 0
        case "pm": return 1
        default:   return 2
        }
    }

    private func pushNextWorkoutToWatch() {
        WatchConnectivityiOSService.shared.activate()
        // Prefer today's first active session; else the derived next workout.
        guard let id = heroAssignmentId, let title = heroTitle else {
            WatchConnectivityiOSService.shared.pushWorkoutForToday(nil)
            return
        }
        let slot = heroSlotRaw
        let payload = WatchWorkoutPayload(
            id: id,
            title: title,
            focus: slot.isEmpty ? nil : slot.uppercased(),
            duration_minutes: 60, // refined per-assignment once detail endpoint lands
            intensity_label: nil,
            activity_kind: "mixed"
        )
        WatchConnectivityiOSService.shared.pushWorkoutForToday(payload)
    }

    // MARK: - Hero / PM resolution
    //
    // The hero is today's FIRST active session (usually AM, but honestly shows
    // PM if that's all that's left). When today has no sessions we fall back to
    // the next future session. The PM compact row only appears when there's a
    // genuine SECOND session today — never invented.

    private var heroSession: AthleteWeekDaySession? { todaySessions.first }
    private var pmSession: AthleteWeekDaySession? {
        todaySessions.count > 1 ? todaySessions[1] : nil
    }

    private var heroAssignmentId: String? {
        heroSession?.assignmentId ?? nextWorkout?.assignmentId
    }
    private var heroTitle: String? {
        heroSession?.title ?? nextWorkout?.title
    }
    private var heroSlotRaw: String {
        heroSession?.slot ?? nextWorkout?.slot ?? ""
    }

    // MARK: - Header

    private var header: some View {
        // Brand logo CENTERED — the home is the only surface that carries it;
        // other tabs lead with their own title. The bell + avatar actions pin to
        // the trailing edge, overlaid on the centered logo.
        ZStack {
            Wordmark(size: 26)
            HStack(spacing: 12) {
                Spacer(minLength: 8)
                // Bell → Chat tab. Unread dot only when there's a real unread count.
                Button {
                    Haptics.light()
                    onOpenTab?(.chat)
                } label: {
                    ZStack(alignment: .topTrailing) {
                        ZStack {
                            Circle().fill(Theme.Color.surfaceElevated)
                            Image(systemName: "bell")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        .frame(width: 34, height: 34)
                        .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
                        if unreadCount > 0 {
                            Circle()
                                .fill(Theme.Color.accent)
                                .frame(width: 8, height: 8)
                                .overlay(Circle().stroke(Theme.Color.background, lineWidth: 1.5))
                                .offset(x: 1, y: -1)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel(unreadCount > 0
                    ? "Notificaciones, \(unreadCount) sin leer"
                    : "Notificaciones")
                // Athlete avatar → Perfil tab.
                Button {
                    Haptics.light()
                    onOpenTab?(.perfil)
                } label: {
                    CoachAvatar(initials: identity?.initials ?? "", size: 34, tint: Theme.Color.muted)
                        .contentShape(Circle())
                }
                .accessibilityLabel("Tu perfil")
            }
        }
        .padding(.top, 2)
    }

    // MARK: - Greeting
    //
    // Orange date kicker (handoff uses red — we use orange) + "Hola, {name}".
    // Name comes from /api/auth/me; first word only. No streak chip — there is
    // no backend streak signal (BACKEND GAP), so we omit it rather than invent.

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: todayDateLabel, color: Theme.Color.accentText, size: 12)
            Text(greetingName)
                .scaledFont(28, weight: .heavy, relativeTo: .largeTitle, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
    }

    /// "Hola, Ana" — first word of fullName. When the name is missing (still
    /// loading, or an athlete with no name on file, e.g. the demo account) we
    /// fall back to a complete, time-aware greeting instead of a bare "Hola".
    private var greetingName: String {
        guard let name = identity?.fullName.split(separator: " ").first.map(String.init),
              !name.isEmpty else {
            return timeOfDayGreeting
        }
        return "Hola, \(name)"
    }

    /// "Buenos días" / "Buenas tardes" / "Buenas noches" by local hour — the
    /// nameless fallback so the hero greeting never renders incomplete.
    private var timeOfDayGreeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 6..<13:  return "Buenos días"
        case 13..<21: return "Buenas tardes"
        default:      return "Buenas noches"
        }
    }

    /// Capitalized ES date, e.g. "Miércoles 14 ene".
    private var todayDateLabel: String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES")
        fmt.dateFormat = "EEEE d MMM"
        let raw = fmt.string(from: Date())
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    // MARK: - Hero session

    @ViewBuilder
    private var heroSection: some View {
        if let hero = heroSession {
            // Today's session. The kicker reads modality + role; the meta line
            // now uses the DERIVED duration / blocks / prescription when the
            // backend supplies them, and falls back to slot + modality otherwise
            // — we never invent a duration we don't have.
            SessionHeroCard(
                slot: slotFor(hero),
                kicker: heroKicker(for: hero),
                title: hero.title,
                meta: heroMeta(for: hero),
                modality: hero.modality,
                ctaTitle: "▶ Empezar",
                onStart: {
                    startAssignmentId = hero.assignmentId
                    startFallbackTitle = hero.title
                    showWorkout = true
                }
            )
        } else if hasPlan {
            // A plan IS published but there's nothing left to do today — either a
            // genuine rest day or a training day already completed. NEVER the
            // no-plan empty state. Shows the honest rest/done copy plus a glance
            // at the next session in the week.
            restCard
        } else {
            // No plan published yet — honest empty state, never demo data.
            CardSurface(padding: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    LabelText(text: "Hoy")
                    Text("Tu coach aún no ha publicado tu plan")
                        .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Cuando tu coach asigne tus sesiones aparecerán aquí, día a día.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    // MARK: - Rest / done card
    //
    // Shown when a plan exists but today has no active session. Reads as a calm,
    // intentional state (not an error): "Hoy descansas" on a true rest day,
    // "Listo por hoy" when today's sessions are all completed. When the week has
    // a later session, a tappable glance routes to the Plan tab.
    private var restCard: some View {
        CardSurface(padding: 18) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: todayIsRest ? "moon.stars.fill" : "checkmark.seal.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(todayIsRest ? Theme.Color.accentText : Theme.Color.ok)
                    VStack(alignment: .leading, spacing: 3) {
                        LabelText(text: "Hoy")
                        Text(todayIsRest ? "Hoy descansas" : "Listo por hoy")
                            .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer(minLength: 0)
                }
                Text(todayIsRest
                     ? "Sin sesión programada. Recupera, hidrata y duerme."
                     : "Has completado tu sesión de hoy. Bien hecho.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let next = nextWorkout {
                    Hairline()
                    nextGlance(next)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// A tappable "Próximo · {weekday}" glance at the next session in the week.
    /// Routes to the Plan tab rather than launching — on a rest day we surface
    /// what's next without pushing the athlete to train early.
    private func nextGlance(_ next: NextWorkout) -> some View {
        Button {
            Haptics.light()
            onOpenTab?(.plan)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Próximo · \(dayLabel(forIso: next.isoDate))",
                              color: Theme.Color.accentText, size: 10)
                    Text(next.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Próxima sesión, \(dayLabel(forIso: next.isoDate)), \(next.title). Ver el plan")
    }

    private func slotFor(_ session: AthleteWeekDaySession) -> SessionSlot {
        slotFor(session.slot)
    }

    private func slotFor(_ raw: String) -> SessionSlot {
        raw.lowercased() == "pm" ? .pm : .am
    }

    /// Hero eyebrow, e.g. "Carrera · sesión principal". When today has two
    /// sessions the hero is the "principal"; with one it's just the modality.
    private func heroKicker(for session: AthleteWeekDaySession) -> String {
        let mod = modalityLabel(session.modality)
        if pmSession != nil {
            return mod.isEmpty ? "Sesión principal" : "\(mod) · sesión principal"
        }
        return mod.isEmpty ? "Sesión de hoy" : "\(mod) · sesión de hoy"
    }

    /// Hero meta line. The week payload now carries DERIVED session metadata
    /// (duration / blocks / short prescription). We build the richest honest
    /// line available, prepending the time-of-day, and fall back to the plain
    /// slot + modality when the backend has nothing derived (old payloads /
    /// templates with no estimable segments) — never an invented duration.
    private func heroMeta(for session: AthleteWeekDaySession) -> String {
        let slot = slotFor(session) == .pm ? "Tarde" : "Mañana"
        let detail = sessionDetailMeta(for: session)
        if detail.isEmpty {
            let mod = modalityLabel(session.modality)
            return mod.isEmpty ? slot : "\(slot) · \(mod)"
        }
        return "\(slot) · \(detail)"
    }

    /// PM compact meta — prefers the derived duration/prescription, falling back
    /// to the honest modality + "más tarde hoy" line when none is available.
    private func compactMeta(for session: AthleteWeekDaySession) -> String {
        let detail = sessionDetailMeta(for: session)
        if detail.isEmpty {
            let mod = modalityLabel(session.modality)
            return mod.isEmpty ? "Más tarde hoy" : "\(mod) · más tarde hoy"
        }
        return "\(detail) · más tarde hoy"
    }

    /// Shared, honest detail line built from the DERIVED fields:
    /// "≈ 62 min · 5 bloques" / "Calentamiento · Series · …". Each segment is
    /// included only when present; empty string when nothing is derivable so
    /// callers keep their own fallback. Caps the prescription so the line stays
    /// short on the hero/compact cards.
    private func sessionDetailMeta(for session: AthleteWeekDaySession) -> String {
        var parts: [String] = []
        if let min = session.estDurationMinutes, min > 0 {
            parts.append("≈ \(min) min")
        }
        if let blocks = session.blocksCount, blocks > 0 {
            parts.append("\(blocks) \(blocks == 1 ? "bloque" : "bloques")")
        }
        // If we have neither duration nor blocks, the short prescription is the
        // most useful single signal; otherwise keep the line to duration+blocks.
        if parts.isEmpty, let summary = session.shortPrescription, !summary.isEmpty {
            parts.append(summary)
        }
        return parts.joined(separator: " · ")
    }

    /// Human modality label from the API token (run / strength / ergo families).
    /// Empty when modality is absent — callers omit the segment.
    private func modalityLabel(_ raw: String?) -> String {
        let s = (raw ?? "").lowercased()
        if s.isEmpty { return "" }
        if s.contains("run") || s.contains("corr") || s.contains("carrera") { return "Carrera" }
        if s.contains("erg") || s.contains("row") || s.contains("remo")
            || s.contains("ski") || s.contains("bike") || s.contains("bici")
            || s.contains("assault") { return "Ergómetro" }
        if s.contains("str") || s.contains("fuer") || s.contains("lift") || s.contains("squat") {
            return "Fuerza"
        }
        if s.contains("wod") || s.contains("circ") || s.contains("metcon") { return "Circuito" }
        return ""
    }

    private func dayLabel(forIso iso: String) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd"
        guard let date = fmt.date(from: iso) else { return "próxima sesión" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEE"
        let raw = out.string(from: date)
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    // MARK: - Tiles row (readiness / race / week)
    //
    // Two tiles side by side, mirroring the handoff's race + week pair. We add
    // readiness (real, daily-valuable data the handoff omits) only when it
    // exists, so the row never shows fabricated numbers.

    private var tilesRow: some View {
        HStack(spacing: 12) {
            raceTile
            weekTile
        }
    }

    @ViewBuilder
    private var raceTile: some View {
        if let race = displayRace, let days = race.daysUntil {
            TileButton(onTap: { onOpenTab?(.carreras) }) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Próxima carrera", size: 10)
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text("\(max(0, days))")
                            .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.accentText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text(days == 1 ? "día" : "días")
                            .scaledFont(12, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Text(race.name)
                        .scaledFont(11, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            .accessibilityLabel("Próxima carrera, \(race.name), faltan \(max(0, days)) \(days == 1 ? "día" : "días")")
        } else if let score = readinessScore {
            // No race scheduled → readiness fills the slot (still real data).
            TileButton(onTap: nil) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        LabelText(text: "Readiness", size: 10)
                        Spacer(minLength: 0)
                        if let delta = readinessDelta {
                            MonoText(
                                text: "\(delta >= 0 ? "▲" : "▼")\(abs(delta))",
                                size: 10,
                                weight: .semibold,
                                color: delta >= 0 ? Theme.Color.ok : Theme.Color.warning
                            )
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(score)")
                            .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                        Text("/100")
                            .scaledFont(12, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Text("Tu estado de hoy")
                        .scaledFont(11, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            .accessibilityLabel("Readiness \(score) de 100")
        } else {
            // No race fixed → invite the athlete to pick their target. Tapping
            // opens the race picker; on success loadPlan() refreshes the
            // countdown into this slot.
            TileButton(onTap: { showBuscarCarrera = true }) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Próxima carrera", size: 10)
                    Text("Elige tu objetivo")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    HStack(spacing: 4) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 10, weight: .semibold))
                        Text("Busca tu carrera")
                            .scaledFont(11, relativeTo: .caption)
                            .lineLimit(1)
                    }
                    .foregroundStyle(Theme.Color.accentText)
                }
            }
            .accessibilityLabel("Elige tu carrera objetivo, busca tu carrera")
        }
    }

    @ViewBuilder
    private var weekTile: some View {
        if let progress = weekProgress {
            TileButton(onTap: { onOpenTab?(.plan) }) {
                VStack(alignment: .leading, spacing: 5) {
                    LabelText(text: progress.label, size: 10)
                    if let counts = progress.counts {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(counts.done)")
                                .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                                .foregroundStyle(Theme.Color.foreground)
                            Text("/\(counts.total) hechas")
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    } else {
                        Text("Ver el plan")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    if !progress.segments.isEmpty {
                        weekSegments(progress)
                    }
                }
            }
            .accessibilityLabel(weekTileAxLabel(progress))
        } else {
            TileButton(onTap: { onOpenTab?(.plan) }) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Tu semana", size: 10)
                    Text("Ver el plan")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Día a día")
                        .scaledFont(11, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
        }
    }

    /// Segmented week bar: one segment per macro week, colored by status
    /// (completed = ok, current = orange, missed = danger, future = surface).
    private func weekSegments(_ progress: WeekProgress) -> some View {
        HStack(spacing: 3) {
            ForEach(progress.segments) { seg in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(seg.color)
                    .frame(height: 4)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 3)
        .accessibilityHidden(true)
    }

    private func weekTileAxLabel(_ progress: WeekProgress) -> String {
        if let counts = progress.counts {
            return "\(progress.label), \(counts.done) de \(counts.total) sesiones hechas"
        }
        return "\(progress.label), ver el plan"
    }

    // MARK: - Coach note row
    //
    // The handoff coach-note row carries a specific message. We have no cheap,
    // reliably-attributed "last coach message" here (sender attribution needs
    // the persisted chat user-id mapping that lives in ChatView). So we surface
    // the REAL unread signal honestly: unread → "Mensaje de tu coach" + dot;
    // otherwise a neutral "Habla con tu coach". Both route to the Chat tab.

    /// Trimmed last-coach-message text, when present and non-empty.
    private var coachMessagePreview: String? {
        guard let raw = coachThread?.lastCoachMessage?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else { return nil }
        return raw
    }

    /// The voice-note chip label ("Nota de voz · 0:42") when the coach's latest
    /// message is a voice note with a stored duration.
    private var coachVoiceLabel: String? {
        guard let dur = coachThread?.coachVoiceDurationLabel else { return nil }
        return "Nota de voz · \(dur)"
    }

    /// The line shown in the coach-note row. Prefers the actual latest coach
    /// message (text or voice-note chip); falls back to the unread-count prompt,
    /// then to the generic invite. Honest at every level.
    private var coachNoteLine: String {
        if let voice = coachVoiceLabel { return voice }
        if let preview = coachMessagePreview { return preview }
        if unreadCount > 0 {
            return unreadCount == 1
                ? "Tienes un mensaje de tu coach"
                : "Tienes \(unreadCount) mensajes de tu coach"
        }
        return "Habla con tu coach"
    }

    private var coachNoteRow: some View {
        // The row reads "live" (foreground) when there's an unread message or an
        // actual coach note to show; muted when it's just the generic invite.
        let hasContent = unreadCount > 0 || coachMessagePreview != nil || coachVoiceLabel != nil
        return Button {
            Haptics.light()
            onOpenTab?(.chat)
        } label: {
            HStack(spacing: 12) {
                CoachAvatar(initials: "P", size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    if coachMessagePreview != nil || coachVoiceLabel != nil {
                        Text("Tu coach")
                            .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    HStack(spacing: 6) {
                        if coachVoiceLabel != nil {
                            Image(systemName: "waveform")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Color.accentText)
                        }
                        Text(coachNoteLine)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(hasContent ? Theme.Color.foreground : Theme.Color.muted)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if unreadCount > 0 {
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 8, height: 8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(coachNoteAccessibilityLabel)
        .accessibilityAddTraits(.isButton)
    }

    private var coachNoteAccessibilityLabel: String {
        if let voice = coachVoiceLabel { return "Tu coach te envió una \(voice.lowercased())" }
        if let preview = coachMessagePreview { return "Mensaje de tu coach: \(preview)" }
        if unreadCount > 0 {
            return "Tienes \(unreadCount) \(unreadCount == 1 ? "mensaje" : "mensajes") de tu coach"
        }
        return "Habla con tu coach"
    }

    // MARK: - Check-in affordance

    private var checkinRow: some View {
        Button(action: { Haptics.light(); showCheckin = true }) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(Theme.Color.warning).frame(width: 6, height: 6)
                    Text("Check-in matinal pendiente")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.foreground)
                }
                Spacer()
                Text("20s →")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentText)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Theme.Color.warningTint)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.warning.opacity(0.3), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Check-in matinal pendiente, 20 segundos")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Derived: race + week progress

    /// The race to show on the "Próxima carrera" tile: the chronologically
    /// NEAREST upcoming race (`nextRace`) — whatever's soonest, regardless of
    /// priority — so the countdown matches its label. A sooner secondary/tune-up
    /// is the next race the athlete actually faces. Falls back to the target only
    /// when there's no next race. The athlete's chosen primary objective still
    /// lives in the Carreras tab, badged as "Objetivo principal".
    private var displayRace: AthleteNextRace? { nextRace ?? targetRace }

    private struct WeekSegment: Identifiable {
        let id = UUID()
        let color: Color
    }

    private struct WeekProgress {
        let label: String                 // "Semana 2/4" or coach week label
        let counts: (done: Int, total: Int)?  // real session count, nil if unknown
        let segments: [WeekSegment]
    }

    /// Real week progress: label + position from macro weeks, session count from
    /// the week payload. Nil when there's no macro context AND no week sessions
    /// (→ neutral "Ver el plan" tile).
    private var weekProgress: WeekProgress? {
        // Position within the block, when macro weeks are known.
        let segments: [WeekSegment]
        let label: String
        if !macroWeeks.isEmpty {
            let total = macroWeeks.count
            let currentIdx = macroWeeks.firstIndex { $0.status == "current" }
                ?? macroWeeks.firstIndex { $0.status != "completed" }
                ?? max(0, total - 1)
            let weekNumber = currentIdx + 1
            label = macro?.weekLabel.flatMap { $0.isEmpty ? nil : $0 }
                ?? "Semana \(weekNumber)/\(total)"
            segments = macroWeeks.map { WeekSegment(color: macroWeekColor($0.status)) }
        } else if weekTotal > 0 {
            // No block context but we do have this week's sessions.
            label = macro?.weekLabel.flatMap { $0.isEmpty ? nil : $0 } ?? "Tu semana"
            segments = []
        } else {
            return nil
        }

        // Honest session count — only when we actually know the week's sessions.
        let counts: (done: Int, total: Int)? = weekTotal > 0 ? (done: weekDone, total: weekTotal) : nil
        return WeekProgress(label: label, counts: counts, segments: segments)
    }

    private func macroWeekColor(_ status: String) -> Color {
        switch status {
        case "completed": return Theme.Color.ok
        case "current":   return Theme.Color.accent
        case "missed":    return Theme.Color.danger
        // Future / not-yet weeks read as an empty SUNKEN track. In light,
        // surfaceElevated is pure white → invisible on the near-white tile; the
        // "well" token recedes correctly in both modes.
        default:          return Theme.Color.surfaceSunken
        }
    }
}

// MARK: - Tile button
//
// A square-ish tappable tile matching the handoff's race/week pair: a sunken
// card surface, left-aligned content, optional tap (chevron-free — the whole
// tile is the target). When `onTap` is nil it renders as a static tile.
private struct TileButton<Content: View>: View {
    let onTap: (() -> Void)?
    @ViewBuilder let content: () -> Content

    var body: some View {
        Button {
            guard let onTap else { return }
            Haptics.light()
            onTap()
        } label: {
            content()
                .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
                .padding(.horizontal, 13)
                .padding(.vertical, 13)
                .background(Theme.Color.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(onTap == nil)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(onTap == nil ? [] : .isButton)
    }
}
