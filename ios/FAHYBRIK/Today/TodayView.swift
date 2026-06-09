import SwiftUI

// Expert variant of the Today screen — Garmin-density single-screen dashboard.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/today.jsx
// `TodayExpert`. Élite-only: density before minimalism, ATR vocabulary native,
// HRV/CTL/TSB/ACR default-visible.
struct TodayView: View {
    // Stable tab identifiers so push deep links can switch tabs programmatically.
    private enum Tab: Hashable { case today, plan, nutrition, stats, profile }
    @State private var selectedTab: Tab = .today

    @State private var showWorkout: Bool = false
    @State private var showCheckin: Bool = false
    @State private var showChat: Bool = false

    // Drives the one orchestrated staggered reveal of the Today cards on appear.
    @State private var revealed: Bool = false

    // Push deep-link router — set when a notification is tapped. `@State` so
    // SwiftUI observes its `pendingDestination` changes (it's @Observable).
    @State private var pushRouter = PushRouter.shared
    @State private var checkinPending: Bool = CheckinStore.isPending()
    @State private var bearer: String? = nil
    @State private var readinessScore: Int? = nil
    @State private var readinessDelta: Int? = nil
    // Derived client-side from /api/athlete/plan/week. When nil there is no
    // next session this week → the card shows an honest empty state and
    // assignmentId stays nil.
    @State private var nextWorkout: NextWorkout? = nil
    // Real macro context (block / week label / days to A-event) from
    // /api/athlete/plan/week. Nil until loaded or when the coach hasn't
    // published a plan yet.
    @State private var macro: AthleteMacroSummary? = nil
    // The GOAL race the plan peaks for → primary countdown card. Nil when none
    // is scheduled (or before the plan loads) → the card is not shown.
    @State private var targetRace: AthleteNextRace? = nil
    // The chronologically next race (may be an intermediate sooner than the
    // target, or the same race). Shown as a small secondary chip only when it
    // differs from the target.
    @State private var nextRace: AthleteNextRace? = nil
    let onSignOut: () -> Void

    var body: some View {
        TabView(selection: $selectedTab) {
            todayRoot
                .tabItem { Label("Hoy", systemImage: "circle.grid.2x2") }
                .tag(Tab.today)
            PlanView(bearer: bearer)
                .tabItem { Label("Plan", systemImage: "calendar") }
                .tag(Tab.plan)
            NutritionView(bearer: bearer)
                .tabItem { Label("Nutrición", systemImage: "fork.knife") }
                .tag(Tab.nutrition)
            StatsView(bearer: bearer)
                .tabItem { Label("Analíticas", systemImage: "chart.bar") }
                .tag(Tab.stats)
            ProfileView(bearer: bearer, onSignOut: onSignOut)
                .tabItem { Label("Perfil", systemImage: "person") }
                .tag(Tab.profile)
        }
        .tint(Theme.Color.accent)
        .onChange(of: pushRouter.pendingDestination) { _, dest in
            handlePushDestination(dest)
        }
        .fullScreenCover(isPresented: $showWorkout) {
            // EMPEZAR runs the real prescribed workout: WorkoutContainer fetches
            // the assignment detail (blocks + items + params) via the bearer and
            // assignmentId, matching what the athlete sees in Plan. When no next
            // assignment exists (rest day or week empty) assignmentId is nil and
            // the container degrades to a title-only plan stored locally.
            WorkoutContainer(
                assignmentId: nextWorkout?.assignmentId,
                fallbackTitle: nextWorkout?.title,
                bearer: bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer"),
                onClose: { showWorkout = false },
                onCompleted: { completedId in
                    // Optimistically drop the just-finished session so the card
                    // stops offering "Empezar" instantly, then refetch the plan
                    // to advance to the next session / reflect server status.
                    if let completedId, nextWorkout?.assignmentId == completedId {
                        nextWorkout = nil
                    }
                    Task { await loadNextWorkout() }
                }
            )
        }
        .sheet(isPresented: $showCheckin) {
            CheckinView(
                bearer: bearer,
                onSubmitted: { _, _ in
                    checkinPending = false
                    showCheckin = false
                },
                onSkipped: {
                    checkinPending = false
                    showCheckin = false
                }
            )
        }
        .sheet(isPresented: $showChat) {
            // Fall back to the persisted bearer so the chat never opens
            // unauthenticated when the sheet is raised (e.g. from a push
            // deep link) before the `onAppear` bearer load has run. Same
            // guard PlanView uses for its chat entry point.
            ChatView(bearer: bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer"))
        }
        .onAppear {
            // Load the session bearer FIRST so any pending push destination
            // (e.g. a tapped chat notification at cold launch) opens its sheet
            // with a valid session rather than racing an empty bearer.
            bearer = UserDefaults.standard.string(forKey: "fahybrik.bearer")
            handlePushDestination(pushRouter.pendingDestination)
            // Gate the Today screen on first open of the day. Re-check on
            // every appear so a session that crosses midnight re-prompts.
            checkinPending = CheckinStore.isPending()
            if checkinPending {
                showCheckin = true
            }
        }
        .task(id: bearer) {
            await loadReadiness()
            await loadNextWorkout()
        }
    }

    // MARK: - Push deep-link routing
    //
    // A tapped notification sets PushRouter.pendingDestination. We map it to a
    // tab (and raise the chat sheet for chat_message), then clear the router so
    // it doesn't re-fire on the next view update.
    private func handlePushDestination(_ dest: PushRouter.Destination?) {
        guard let dest else { return }
        switch dest {
        case .today:
            selectedTab = .today
        case .plan:
            selectedTab = .plan
        case .profile:
            selectedTab = .profile
        case .chat:
            // Chat is a sheet over the Today tab.
            selectedTab = .today
            showChat = true
        }
        pushRouter.pendingDestination = nil
    }

    private func loadReadiness() async {
        guard let token = bearer else { return }
        // `fetchToday` returns nil when there's no real readiness signal yet
        // (no check-in, no wearable). Reset to nil so the card shows the honest
        // "Sin datos de readiness" empty state instead of a stale/invented score.
        // `try?` flattens the throwing + optional result, so `payload` is the
        // unwrapped DailyReadinessPayload (nil on error OR when there's no data).
        if let payload = try? await ReadinessService.fetchToday(bearer: token) {
            readinessScore = payload.score
            readinessDelta = payload.delta7d
        } else {
            readinessScore = nil
            readinessDelta = nil
        }
    }

    private func loadNextWorkout() async {
        guard let token = bearer else { return }
        do {
            let resp = try await PlanService.fetchWeek(bearer: token)
            nextWorkout = PlanService.nextWorkout(from: resp)
            macro = resp.macroSummary
            targetRace = resp.targetRace
            nextRace = resp.nextRace
        } catch {
            // No plan yet (or transient failure): show honest empty states.
            // assignmentId stays nil so the summary won't push to the backend.
            nextWorkout = nil
            macro = nil
            targetRace = nil
            nextRace = nil
        }
        pushNextWorkoutToWatch()
    }

    private func pushNextWorkoutToWatch() {
        WatchConnectivityiOSService.shared.activate()
        guard let w = nextWorkout else {
            WatchConnectivityiOSService.shared.pushWorkoutForToday(nil)
            return
        }
        let payload = WatchWorkoutPayload(
            id: w.assignmentId,
            title: w.title,
            focus: w.slot.isEmpty ? nil : w.slot.uppercased(),
            duration_minutes: 60, // refined per-assignment once detail endpoint lands
            intensity_label: nil,
            activity_kind: "mixed"
        )
        WatchConnectivityiOSService.shared.pushWorkoutForToday(payload)
    }

    @ViewBuilder
    private var todayRoot: some View {
        // Race-day takeover + post-race debrief are pending their backend
        // (#31 — /api/athlete/race-context). Until then Today always renders the
        // normal tab; no mock race data is shown.
        todayTab
    }

    // MARK: - Today Expert variant

    private var todayTab: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    headerStrip
                        .staggerReveal(revealed, index: 0)
                    raceCountdownCard
                        .staggerReveal(revealed, index: 1)
                    readinessCard
                        .staggerReveal(revealed, index: 2)
                    workoutCard
                        .staggerReveal(revealed, index: 3)
                    if checkinPending {
                        checkinRow
                            .staggerReveal(revealed, index: 4)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .onAppear {
            // Fire the reveal once per appearance; the cards fade + slide up in
            // an orchestrated cascade keyed off `revealed`.
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
    }

    /// Real macro context label, e.g. "REAL W2" or the coach-authored week
    /// label. Nil when no plan is published — header just shows the wordmark.
    private var macroContextLabel: String? {
        guard let macro else { return nil }
        if let label = macro.weekLabel, !label.isEmpty { return label }
        if let block = macro.block, !block.isEmpty { return atrPhaseLabel(block) }
        return nil
    }

    private var headerStrip: some View {
        HStack(alignment: .center, spacing: 12) {
            Wordmark(size: 32)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let days = macro?.aEventDays {
                    MonoText(
                        text: "A-EVENT · \(days)D",
                        size: 11,
                        weight: .semibold,
                        color: Theme.Color.muted
                    )
                    .tracking(1.4)
                    .textCase(.uppercase)
                }
                if let label = macroContextLabel {
                    MonoText(
                        text: label,
                        size: 11,
                        weight: .semibold,
                        color: Theme.Color.muted
                    )
                    .tracking(1.4)
                    .textCase(.uppercase)
                }
            }
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
        .padding(.vertical, 4)
    }

    // MARK: - Race countdown
    //
    // Primary: the TARGET race the plan peaks for — a big day counter, event
    // name, category, location and goal time. Secondary: when `next_race` is a
    // DIFFERENT race sooner than the target (an intermediate / tune-up), a small
    // chip below the countdown. Hidden entirely when there's no target race (or
    // before the plan loads) — never an invented placeholder.
    @ViewBuilder
    private var raceCountdownCard: some View {
        if let race = targetRace {
            // Only surface the secondary race when it's genuinely a different
            // event from the target (a sooner intermediate), to avoid duplicating
            // the same countdown.
            let secondary: AthleteNextRace? = {
                guard let n = nextRace, n.identity != race.identity else { return nil }
                return n
            }()
            CardSurface(padding: 20, leftAccent: true, elevated: true) {
                VStack(alignment: .leading, spacing: 14) {
                    LabelText(text: "Objetivo", color: Theme.Color.accent)

                    // Race-clock readout — huge mono orange day number with a
                    // tiny tracked-uppercase label, like a PM5 / countdown clock.
                    if let days = race.daysUntil {
                        raceDayReadout(days)
                    }

                    // Event name.
                    Text(race.name)
                        .scaledFont(20, weight: .heavy, relativeTo: .headline, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)

                    // Category line: "Individual · Open · Hombres".
                    if let category = race.categoryLine {
                        Text(category)
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                    }

                    // Location + goal time meta row.
                    if race.location != nil || race.goalTimeFormatted != nil {
                        HStack(spacing: 14) {
                            if let location = race.location, !location.isEmpty {
                                HStack(spacing: 4) {
                                    Image(systemName: "mappin.and.ellipse")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text(location)
                                        .scaledFont(12, relativeTo: .caption)
                                }
                                .foregroundStyle(Theme.Color.muted)
                            }
                            if let goal = race.goalTimeFormatted {
                                HStack(spacing: 4) {
                                    Image(systemName: "target")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text("Objetivo \(goal)")
                                        .scaledFont(12, relativeTo: .caption)
                                }
                                .foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }

                    // Secondary race chip — an intermediate/tune-up race sooner
                    // than the target. Quieter than the primary countdown.
                    if let s = secondary {
                        Hairline()
                            .padding(.vertical, 2)
                        secondaryRaceLine(s)
                    }
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(raceAccessibilityLabel(target: race, secondary: secondary))
        }
    }

    /// The hero readout of the countdown card: a huge mono orange day number
    /// with a tracked-uppercase label — the race-clock / erg-monitor voice.
    private func raceDayReadout(_ days: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(max(0, days))")
                .font(.system(size: 88, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.accent)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: days == 1 ? "día" : "días", color: Theme.Color.foreground, size: 13)
                LabelText(text: "para el A-event", color: Theme.Color.muted, size: 10)
            }
            .padding(.bottom, 10)
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func secondaryRaceLine(_ race: AthleteNextRace) -> some View {
        HStack(spacing: 6) {
            Text("Próxima")
                .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .textCase(.uppercase)
                .tracking(1.2)
            Text("·")
                .foregroundStyle(Theme.Color.muted)
            Text(race.name)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            if let days = race.daysUntil {
                Text("· faltan \(max(0, days)) \(days == 1 ? "día" : "días")")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
            if let tag = race.priorityLabel {
                Text(tag)
                    .scaledFont(10, weight: .bold, relativeTo: .caption2)
                    .textCase(.uppercase)
                    .tracking(1)
                    .foregroundStyle(Theme.Color.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.Color.accent.opacity(0.15))
                    .clipShape(Capsule())
            }
            Spacer(minLength: 0)
        }
    }

    /// Combine the target (and optional secondary) race into one VoiceOver phrase.
    private func raceAccessibilityLabel(target: AthleteNextRace, secondary: AthleteNextRace?) -> String {
        var parts: [String] = []
        if let days = target.daysUntil {
            let d = max(0, days)
            parts.append("Carrera objetivo, faltan \(d) \(d == 1 ? "día" : "días")")
        } else {
            parts.append("Carrera objetivo")
        }
        parts.append(target.name)
        if let category = target.categoryLine { parts.append(category) }
        if let location = target.location, !location.isEmpty { parts.append("en \(location)") }
        if let goal = target.goalTimeFormatted { parts.append("objetivo \(goal)") }
        if let s = secondary {
            var sub = "Próxima carrera, \(s.name)"
            if let days = s.daysUntil {
                let d = max(0, days)
                sub += ", faltan \(d) \(d == 1 ? "día" : "días")"
            }
            if let tag = s.priorityLabel { sub += ", \(tag)" }
            parts.append(sub)
        }
        return parts.joined(separator: ", ")
    }

    // Readiness is the only daily metric backed by a live endpoint today.
    // HRV / sleep / RHR / CTL / TSB / polarization require wearable ingestion
    // that hasn't shipped — we show readiness honestly or an explicit empty
    // state, never invented numbers.
    @ViewBuilder
    private var readinessCard: some View {
        if let score = readinessScore {
            CardSurface(padding: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        LabelText(text: "Readiness")
                        Spacer()
                        if let delta = readinessDelta {
                            MonoText(
                                text: "\(delta >= 0 ? "▲" : "▼")\(abs(delta)) vs 7d",
                                size: 11,
                                weight: .semibold,
                                color: delta >= 0 ? Theme.Color.ok : Theme.Color.warning
                            )
                        }
                    }
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Text("\(score)")
                            .font(.system(size: 56, weight: .heavy, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                        MonoText(text: "/100", size: 15, weight: .semibold, color: Theme.Color.muted)
                        Spacer()
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Readiness \(score) de 100")
        } else {
            CardSurface(padding: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    LabelText(text: "Readiness")
                    Text("Sin datos de readiness todavía")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Conecta tu reloj o completa el check-in matinal para ver tu readiness.")
                        .scaledFont(11, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    @ViewBuilder
    private var workoutCard: some View {
        if let next = nextWorkout {
            let slotLabel: String = {
                if !next.slot.isEmpty {
                    let upper = next.slot.uppercased()
                    return next.isToday ? "\(upper) · HOY" : "\(upper) · PRÓXIMO"
                }
                return next.isToday ? "HOY" : "PRÓXIMO"
            }()
            CardSurface(padding: 18, topAccent: true) {
                VStack(alignment: .leading, spacing: 0) {
                    LabelText(text: slotLabel, color: Theme.Color.accent)
                    Text(next.title)
                        .scaledFont(20, weight: .heavy, relativeTo: .headline, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .padding(.top, 8)
                    ExpertPrimaryButton(title: "▶ EMPEZAR", height: 50) {
                        showWorkout = true
                    }
                    .padding(.top, 16)
                }
            }
        } else {
            CardSurface(padding: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    LabelText(text: "Hoy")
                    Text("Tu coach aún no ha publicado tu plan")
                        .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Cuando Pablo asigne tus sesiones aparecerán aquí.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

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
                    .foregroundStyle(Theme.Color.accent)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Check-in matinal pendiente, 20 segundos")
        .accessibilityAddTraits(.isButton)
    }

}

