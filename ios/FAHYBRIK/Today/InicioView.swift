import SwiftUI

// Inicio tab root — "CAMINO A LA CARRERA" (variante B: name as protagonist). The
// home is a VERDICT toward the race, not a calendar: it shows trajectory + STATE
// + proof + one action, never the future / week / session-selection (that's the
// Plan tab) and never duplicates the Plan's "Foco de la semana".
//
// Layout (top → bottom):
//   header  → greeting ("Lunes 29 · Hola, {name}", the name big)
//   1. CAMINO A LA CARRERA — target race + "N días" + goal time ("sub 59 min") +
//      "{fase} · semana N de M" + a position bar. The phase lives HERE (inside the
//      trajectory), never dangling off the greeting. The peak/objective race.
//   2. ¿CÓMO LLEGAS HOY? — readiness clearance: 0–100 score + plain read + a mini
//      breakdown of the signals feeding it (check-in / HRV / sueño / FC reposo).
//   3. TU PROGRESO · CARRERA — running is half of the hybrid, so progress leads
//      with the run: threshold pace (VDOT), the 5 km trend, best 1 km + 7-day
//      volume, plus the strength 1RM as the other half.
//   4. ENTRENO DE HOY — start TODAY's session (a single action card, not a menu).
//   5. PASOS — today's HealthKit step count (all-day movement).
//   6. PROYECCIÓN (puerta honesta) — where a finish projection would go. The model
//      doesn't exist yet, so we invite a HYROX simulation instead of faking a number.
//
// Every value is REAL data or an honest empty state — nothing fabricated. No
// projected finish time (no model exists yet), no week strip / session picker, no
// standalone focus line.
//
// This view owns its own data load (via AppDataStore, cache-first / SWR) and the
// Empezar / Check-in / target-race sheets.
struct InicioView: View {
    /// Session bearer, provided by AppShell. Falls back to the persisted token.
    var bearer: String? = nil
    /// Lets the header / anchor / cards route the shell to another tab.
    var onOpenTab: ((AppTab) -> Void)? = nil

    @State private var showWorkout: Bool = false
    @State private var showCheckin: Bool = false
    // Presents the target-race picker from the empty race anchor.
    @State private var showBuscarCarrera: Bool = false

    // Which of today's sessions "Empezar" launches (the hero's session).
    @State private var startAssignmentId: String? = nil
    @State private var startFallbackTitle: String? = nil

    // Drives the one orchestrated staggered reveal of the cards on appear.
    @State private var revealed: Bool = false

    @State private var checkinPending: Bool = CheckinStore.isPending()
    @State private var sessionBearer: String? = nil

    // Today's all-day step count, read display-local from HealthKit (not the API
    // store — it's device-local). Nil until the first read resolves.
    @State private var stepsReading: HealthKitStepsReader.Reading? = nil

    // ── Shared data: read live from the injected AppDataStore (cache-first/SWR) ──
    @Environment(AppDataStore.self) private var store

    // Athlete identity (greeting + avatar). Nil until /api/auth/me resolves.
    private var identity: AthleteIdentity? { store.identity.value }

    /// The current week payload — source for today's sessions + the target race.
    private var planWeek: AthletePlanWeekResponse? { store.planWeek.value }

    private var readinessScore: Int? { store.readiness.value?.score }
    private var readinessDelta: Int? { store.readiness.value?.delta7d }
    private var readinessBreakdown: ReadinessBreakdown? { store.readiness.value?.breakdown }

    // Today's still-active sessions, in slot order (AM hero, then PM compact).
    private var todaySessions: [AthleteWeekDaySession] {
        planWeek.map(sessionsForToday) ?? []
    }
    // Fallback when today has no sessions: the next future session in the week.
    private var nextWorkout: NextWorkout? {
        planWeek.flatMap(PlanService.nextWorkout)
    }
    private var hasPlan: Bool { planWeek.map(planExists) ?? false }
    private var todayIsRest: Bool { planWeek.map(isTodayRest) ?? false }
    // The GOAL race the plan peaks for → the Camino anchor. NOT the nearest tune-up
    // (that lives in the Carreras tab); the journey is toward the objective.
    private var targetRace: AthleteNextRace? { planWeek?.targetRace }

    /// The coach's current periodization label — "{fase} · semana N de M" — already
    /// composed server-side (AGNOSTIC: whatever the coach named the phase). This is
    /// the ONLY place the phase name surfaces on Inicio (inside the race anchor).
    private var macroWeekLabel: String? {
        let t = store.macroProgress.value?.macro.weekLabel?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (t?.isEmpty == false) ? t : nil
    }

    // ── "Tu progreso · carrera" inputs ──────────────────────────────────────────
    // The running deep-dive bundle (live /running-analysis) + the strength 1RM.
    private var running: RunningAnalysis? { store.runningAnalysis.value }
    private var thresholdPace: String? { nonEmpty(running?.threshold_pace) }   // "4:16"
    private var vdot: String? { nonEmpty(running?.vo2_estimate) }              // "49.9"
    private var best1k: String? { nonEmpty(running?.best_1k) }                 // "3:50"
    private var volume7d: String? { nonEmpty(running?.volume_7d_km) }          // "21.3 km"
    private var fiveKTrend: [FiveKTrendPoint] { running?.five_k_trend ?? [] }

    /// The lift to glance on the home: the first in canonical order the athlete has
    /// (back squat → deadlift → …). The full list lives in Perfil → Mi fuerza.
    private var topLift: StrengthMaxProfile? {
        let maxes = store.strengthMaxes.value ?? []
        for slug in StrengthService.STRENGTH_LIFTS.map({ $0.slug }) {
            if let m = maxes.first(where: { $0.exerciseSlug == slug }) { return m }
        }
        return maxes.first
    }

    // Unread coach messages → bell dot. 0 when none.
    private var unreadCount: Int { store.unreadCount }
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
                raceAnchorCard
                    .staggerReveal(revealed, index: 2)
                readinessCard
                    .staggerReveal(revealed, index: 3)
                progressCard
                    .staggerReveal(revealed, index: 4)
                heroSection
                    .staggerReveal(revealed, index: 5)
                if let pm = pmSession {
                    SessionCompactRow(
                        slot: slotFor(pm),
                        title: pm.title,
                        meta: compactMeta(for: pm),
                        modality: pm.modality,
                        onTap: { onOpenTab?(.plan) }
                    )
                    .staggerReveal(revealed, index: 6)
                }
                if let partner {
                    PartnerTodayPanel(partner: partner)
                        .staggerReveal(revealed, index: 7)
                }
                stepsRow
                    .staggerReveal(revealed, index: 8)
                projectionGate
                    .staggerReveal(revealed, index: 9)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .fullScreenCover(isPresented: $showWorkout) {
            // EMPEZAR runs the real prescribed workout via WorkoutContainer.
            WorkoutContainer(
                assignmentId: startAssignmentId,
                fallbackTitle: startFallbackTitle,
                bearer: effectiveBearer,
                onClose: { showWorkout = false },
                onCompleted: { _ in
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
                    // A check-in changes today's readiness — pull it fresh.
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
                // A target was fixed → refresh the plan so the anchor appears.
                Task { await store.planMutated() }
            }
        }
        .onAppear {
            sessionBearer = bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
            checkinPending = CheckinStore.isPending()
            // SUAVE: auto-open the check-in only the FIRST time per local day.
            if checkinPending && !CheckinStore.hasAutoPresentedToday() {
                CheckinStore.markAutoPresented()
                showCheckin = true
            }
            // Fire the entrance cascade once per appearance.
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        .task(id: effectiveBearer) {
            store.activate(bearer: effectiveBearer)
            await store.loadHome()
            pushNextWorkoutToWatch()
        }
        .task {
            // All-day step count is device-local (HealthKit), not bearer-scoped.
            stepsReading = await HealthKitStepsReader.todaySteps()
        }
    }

    // MARK: - Header

    private var header: some View {
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
    // Variante B: the NAME is the protagonist. Orange date kicker ("Lunes 29") +
    // "Hola, {name}" big. Name comes from /api/auth/me; first word only. When the
    // name is missing we fall back to a complete, time-aware greeting.

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

    private var greetingName: String {
        guard let name = identity?.fullName.split(separator: " ").first.map(String.init),
              !name.isEmpty else {
            return timeOfDayGreeting
        }
        return "Hola, \(name)"
    }

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

    // MARK: - 1 · Camino a la carrera (trajectory anchor)
    //
    // The emotional lead: where the athlete is going (the OBJECTIVE race), how far
    // out, the goal time, where they are in the plan ("{fase} · semana N de M") and
    // a subtle position bar through the current microciclo's weeks — POSITION in the
    // block, not a calendar of upcoming sessions. The phase lives HERE, with
    // structure — never dangling off the greeting.

    @ViewBuilder
    private var raceAnchorCard: some View {
        if let race = targetRace, let days = race.daysUntil {
            let d = max(0, days)
            Button {
                Haptics.light()
                onOpenTab?(.carreras)
            } label: {
                CardSurface(padding: 18, topAccent: true, elevated: true) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            LabelText(text: "Camino a la carrera")
                            Spacer(minLength: 8)
                            Image(systemName: "flag.checkered")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.Color.accentText)
                        }
                        Text(race.name)
                            .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        // Countdown — the journey distance — with the goal time pinned right.
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(d)")
                                .font(.system(size: 44, weight: .heavy, design: .monospaced).monospacedDigit())
                                .foregroundStyle(Theme.Color.accentText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                            Text(d == 1 ? "día" : "días")
                                .scaledFont(14, relativeTo: .subheadline)
                                .foregroundStyle(Theme.Color.muted)
                            Spacer(minLength: 8)
                            if let goal = goalLabel(race) {
                                goalPill(goal)
                            }
                        }
                        // Phase + position within the plan (agnostic coach data).
                        if let label = macroWeekLabel {
                            Text(label)
                                .scaledFont(12.5, weight: .semibold, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            if let pos = weekPosition {
                                weekPositionBar(n: pos.n, m: pos.m)
                            }
                        }
                        // Proximity tone (objective, agnostic — keyed off days-to-race).
                        Text(raceProximityCopy(daysUntil: d))
                            .scaledFont(11, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.faint)
                            .lineLimit(1)
                    }
                }
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(raceAnchorAxLabel(race: race, days: d))
            .accessibilityAddTraits(.isButton)
        } else {
            // No objective fixed → invite the athlete to pick one. Tapping opens the
            // race picker; on success the plan refreshes and the anchor appears.
            Button {
                Haptics.light()
                showBuscarCarrera = true
            } label: {
                CardSurface(padding: 18, topAccent: true) {
                    VStack(alignment: .leading, spacing: 6) {
                        LabelText(text: "Camino a la carrera")
                        Text("Elige tu carrera objetivo")
                            .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Fíjala y tu plan tendrá un destino: cuenta atrás, fase y objetivo de tiempo.")
                            .scaledFont(12, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 4) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 11, weight: .semibold))
                            Text("Busca tu carrera")
                                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                        }
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.top, 2)
                    }
                }
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Elige tu carrera objetivo, busca tu carrera")
            .accessibilityAddTraits(.isButton)
        }
    }

    /// "Objetivo · sub 59 min" capsule.
    private func goalPill(_ goal: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "target")
                .font(.system(size: 9, weight: .bold))
            Text("Objetivo · \(goal)")
                .scaledFont(11, weight: .semibold, relativeTo: .caption2)
        }
        .foregroundStyle(Theme.Color.accentText)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }

    /// A row of M segments with the first N lit — position within the microciclo.
    private func weekPositionBar(n: Int, m: Int) -> some View {
        HStack(spacing: 4) {
            ForEach(0..<m, id: \.self) { i in
                Capsule()
                    .fill(i < n ? Theme.Color.accent : Theme.Color.hairlineStrong)
                    .frame(height: 4)
            }
        }
        .accessibilityHidden(true)
    }

    /// Goal time as a goal ceiling: "sub 59 min" for whole minutes, else exact
    /// MM:SS / H:MM:SS. Nil when no goal is set. Never fabricated.
    private func goalLabel(_ race: AthleteNextRace) -> String? {
        guard let plain = goalPlain(race) else { return nil }
        // Whole-minute goals read as a ceiling ("sub 59 min"); exact times stay exact.
        return plain.hasSuffix(" min") ? "sub \(plain)" : plain
    }

    /// The bare goal time — "59 min" for whole minutes, else "MM:SS" / "H:MM:SS".
    /// Used in the projection-gate sentence ("…baja de 59 min"). Nil when unset.
    private func goalPlain(_ race: AthleteNextRace) -> String? {
        guard let s = race.goalTimeSeconds, s > 0 else { return nil }
        if s % 60 == 0 { return "\(s / 60) min" }
        let h = s / 3600, mins = (s % 3600) / 60, secs = s % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, mins, secs)
            : String(format: "%d:%02d", mins, secs)
    }

    /// Extract (N, M) from the server "… semana N de M" label — the first two
    /// integer runs after "semana". Robust to the phase name; nil when unparseable
    /// (then the text line still communicates the position, just no bar).
    private var weekPosition: (n: Int, m: Int)? {
        guard let wl = macroWeekLabel?.lowercased(),
              let r = wl.range(of: "semana") else { return nil }
        let nums = wl[r.upperBound...]
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
        guard nums.count >= 2, nums[1] > 0 else { return nil }
        let m = nums[1]
        return (min(max(nums[0], 1), m), m)
    }

    private func raceAnchorAxLabel(race: AthleteNextRace, days: Int) -> String {
        var label = "Camino a \(race.name), faltan \(days) \(days == 1 ? "día" : "días")"
        if let phase = macroWeekLabel { label += ". \(phase)" }
        if let goal = goalLabel(race) { label += ". Objetivo \(goal)" }
        return label
    }

    // Supporting line under the countdown, shifting tone as the race nears. Driven
    // by days-to-race — the objective, agnostic signal — over standard windows.
    private static let raceWeekDays = 7
    private static let taperDays = 21

    private func raceProximityCopy(daysUntil: Int) -> String {
        if daysUntil <= Self.raceWeekDays { return "Confía en el trabajo hecho" }
        if daysUntil <= Self.taperDays { return "Afina y descansa" }
        return "Construyendo motor"
    }

    // MARK: - 2 · ¿Cómo llegas hoy? (readiness clearance)
    //
    // The athlete's single most actionable daily signal: the 0–100 readiness score
    // (colored by recovery bucket), a one-line plain read of the body STATE (never a
    // training prescription — that's coach methodology), the 7-day delta, and a mini
    // breakdown of the signals feeding it. Honest empty / compute states.

    @ViewBuilder
    private var readinessCard: some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 14) {
                LabelText(text: "¿Cómo llegas hoy?")
                if let score = readinessScore {
                    HStack(alignment: .center, spacing: 16) {
                        RecoveryRing(value: score, size: 66, stroke: 7, color: readinessColor(score))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(readinessInterpretation(score))
                                .scaledFont(16, weight: .semibold, relativeTo: .headline)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                            if let delta = readinessDelta {
                                HStack(spacing: 4) {
                                    Image(systemName: delta >= 0 ? "arrow.up.right" : "arrow.down.right")
                                        .font(.system(size: 10, weight: .bold))
                                    Text("\(abs(delta)) en 7 días")
                                        .scaledFont(11, weight: .medium, relativeTo: .caption)
                                }
                                .foregroundStyle(delta >= 0 ? Theme.Color.ok : Theme.Color.warning)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    if readinessBreakdown != nil {
                        breakdownChips
                    }
                } else if store.readiness.hasLoaded {
                    // Loaded but no real signal yet (no check-in, no wearable).
                    Button {
                        guard checkinPending else { return }
                        Haptics.light()
                        showCheckin = true
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Sin datos aún")
                                .scaledFont(16, weight: .semibold, relativeTo: .headline)
                                .foregroundStyle(Theme.Color.foreground)
                            Text(checkinPending
                                 ? "Haz tu check-in matinal para verlo"
                                 : "Conecta Apple Salud o haz tu check-in")
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(checkinPending ? Theme.Color.accentText : Theme.Color.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(!checkinPending)
                } else {
                    // Not yet loaded (rare with cache-first) — stable placeholder.
                    Text("—")
                        .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(readinessAxLabel)
    }

    /// The signals that fed the score, each lit when present and dim when not — an
    /// honest "what's behind your number" without inventing raw values we don't have.
    private var breakdownChips: some View {
        let b = readinessBreakdown
        return HStack(spacing: 8) {
            SignalChip(icon: "checkmark.circle.fill", text: "Check-in", active: b?.hasCheckin == true)
            SignalChip(icon: "waveform.path.ecg", text: "HRV", active: b?.hasHRV == true)
            SignalChip(
                icon: "moon.zzz.fill",
                text: sleepChipText(b),
                active: b?.hasSleep == true
            )
            SignalChip(icon: "heart.fill", text: "FC reposo", active: b?.hasRestingHR == true)
        }
    }

    /// "7.5 h" when we have the real sleep hours, else just the label.
    private func sleepChipText(_ b: ReadinessBreakdown?) -> String {
        if let h = b?.sleepHours, h > 0 {
            let v = h == h.rounded() ? String(Int(h)) : String(format: "%.1f", h)
            return "\(v) h"
        }
        return "Sueño"
    }

    private var readinessAxLabel: String {
        guard let score = readinessScore else {
            return store.readiness.hasLoaded
                ? "Readiness sin datos aún. Haz tu check-in"
                : "Readiness cargando"
        }
        var label = "Cómo llegas hoy: readiness \(score) de 100, \(readinessInterpretation(score))"
        if let delta = readinessDelta {
            label += ", \(delta >= 0 ? "sube" : "baja") \(abs(delta)) en 7 días"
        }
        return label
    }

    // Buckets MIRROR web/lib/dashboard/constants/readiness.ts (ok ≥67 · caution
    // 45–66 · low <45) so the athlete's read can't drift from the coach's.
    private static let readinessOkMin = 67
    private static let readinessCautionMin = 45

    private func readinessInterpretation(_ score: Int) -> String {
        if score >= Self.readinessOkMin { return "Recuperado y listo" }
        if score >= Self.readinessCautionMin { return "Recuperación parcial" }
        return "Cuerpo cargado"
    }

    private func readinessColor(_ score: Int) -> Color {
        if score >= Self.readinessOkMin { return Theme.Color.ok }
        if score >= Self.readinessCautionMin { return Theme.Color.warning }
        return Theme.Color.danger
    }

    // MARK: - 3 · Tu progreso · carrera (running leads the proof)
    //
    // Running is half of the hybrid, so the proof leads with the run: threshold
    // pace (Daniels/VDOT off the 5 km), the 5 km test trend, best 1 km + 7-day
    // volume, plus the strength 1RM as the other half. Every row is REAL data from
    // /running-analysis + /benchmarks; each renders only when its signal exists, so
    // a partial athlete reads honestly and nothing is fabricated.

    /// Which rows have data — drives both presence and the hairlines between them.
    private var showUmbral: Bool { thresholdPace != nil }
    private var showFiveK: Bool { !fiveKTrend.isEmpty }
    private var showBestVol: Bool { best1k != nil || volume7d != nil }
    private var showStrength: Bool { topLift != nil }
    private var hasProgress: Bool { showUmbral || showFiveK || showBestVol || showStrength }

    @ViewBuilder
    private var progressCard: some View {
        if hasProgress {
            CardSurface(padding: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        LabelText(text: "Tu progreso · carrera")
                        Spacer(minLength: 8)
                        Image(systemName: "figure.run")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    if showUmbral { umbralRow }
                    if showFiveK {
                        if showUmbral { Hairline() }
                        fiveKRow
                    }
                    if showBestVol {
                        if showUmbral || showFiveK { Hairline() }
                        bestVolRow
                    }
                    if showStrength, let lift = topLift {
                        if showUmbral || showFiveK || showBestVol { Hairline() }
                        strengthRow(lift)
                    }
                }
            }
            .accessibilityElement(children: .contain)
        } else if store.runningAnalysis.hasLoaded && store.strengthMaxes.hasLoaded {
            // Truly nothing yet — honest, quiet empty state.
            CardSurface(padding: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Tu progreso · carrera")
                    Text("Corre y registra tus tests para ver tu progreso")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        // else: not loaded → render nothing (no empty flash); appears once loaded.
    }

    /// Threshold pace — the hero running metric (Daniels Z4 off the 5 km VDOT).
    @ViewBuilder
    private var umbralRow: some View {
        if let pace = thresholdPace {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Ritmo umbral · Z4", size: 10)
                    if let vdot {
                        Text("VDOT \(esDecimal(vdot)) desde tu 5k")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
                Spacer(minLength: 8)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    progressValue(pace, accent: true)
                    Text("/km")
                        .scaledFont(10.5, weight: .semibold, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Ritmo umbral \(pace) por kilómetro" + (vdot.map { ", VDOT \($0)" } ?? ""))
        }
    }

    /// The 5 km test trend — "21:00 → 20:25 → 19:58", a sparkline, the latest time
    /// and the total improvement delta. With a single test, just the latest time.
    @ViewBuilder
    private var fiveKRow: some View {
        if let latest = fiveKTrend.last {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "5 km · prueba", size: 10)
                    if fiveKTrend.count >= 2 {
                        Text(fiveKTrendString)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                Spacer(minLength: 6)
                if fiveKTrend.count >= 2 {
                    // Lower seconds = faster: the sparkline descends as the time drops.
                    TrendSparkline(
                        values: fiveKTrend.map { Double($0.seconds) },
                        color: Theme.Color.accentText
                    )
                    .frame(width: 52, height: 22)
                    .accessibilityHidden(true)
                }
                VStack(alignment: .trailing, spacing: 2) {
                    progressValue(latest.time, accent: false)
                    if let delta = fiveKDeltaSeconds {
                        fiveKDeltaBadge(delta)
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(fiveKAxLabel)
        }
    }

    /// The shown trend string, capped to the last 3 tests ("21:00 → 20:25 → 19:58").
    private var fiveKTrendString: String {
        fiveKTrend.suffix(3).map { $0.time }.joined(separator: " → ")
    }

    /// Latest minus first (whole journey): negative = faster = improvement. Nil with
    /// fewer than two tests (no trend to claim).
    private var fiveKDeltaSeconds: Int? {
        guard let first = fiveKTrend.first, let last = fiveKTrend.last, fiveKTrend.count >= 2
        else { return nil }
        return last.seconds - first.seconds
    }

    private func fiveKDeltaBadge(_ delta: Int) -> some View {
        let improved = delta < 0
        return HStack(spacing: 3) {
            Image(systemName: improved ? "arrow.down.right" : "arrow.up.right")
                .font(.system(size: 9, weight: .bold))
            Text("\(improved ? "−" : "+")\(clock(abs(delta)))")
                .font(.system(size: 10.5, weight: .bold, design: .monospaced).monospacedDigit())
        }
        .foregroundStyle(improved ? Theme.Color.ok : Theme.Color.danger)
    }

    private var fiveKAxLabel: String {
        guard let latest = fiveKTrend.last else { return "5 kilómetros" }
        var label = "5 kilómetros, \(latest.time)"
        if let delta = fiveKDeltaSeconds {
            label += delta < 0
                ? ", mejoras \(clock(abs(delta)))"
                : ", subes \(clock(abs(delta)))"
        }
        return label
    }

    /// Best 1 km + rolling 7-day volume, side by side.
    @ViewBuilder
    private var bestVolRow: some View {
        HStack(alignment: .top, spacing: 12) {
            if let best1k {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Mejor 1 km", size: 10)
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(best1k)
                            .font(.system(size: 15, weight: .heavy).italic().monospacedDigit())
                            .foregroundStyle(Theme.Color.accentText)
                        Text("/km")
                            .scaledFont(10.5, weight: .semibold, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Mejor 1 kilómetro, \(best1k) por kilómetro")
            }
            if let volume7d {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Volumen · 7 días", size: 10)
                    Text(esDecimal(volume7d))
                        .font(.system(size: 15, weight: .heavy).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Volumen de 7 días, \(esDecimal(volume7d))")
            }
        }
    }

    /// Strength 1RM — the other half of the hybrid.
    private func strengthRow(_ lift: StrengthMaxProfile) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: "Fuerza · 1RM", size: 10)
                Text(lift.exerciseLabel)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 8)
            progressValue(lift.oneRmLabel, accent: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fuerza, \(lift.exerciseLabel), \(lift.oneRmLabel)")
    }

    /// The shared big italic-mono value style for the progress rows. `accent`
    /// paints the brand-orange text role (the key metric); else foreground.
    private func progressValue(_ text: String, accent: Bool) -> some View {
        Text(text)
            .font(.system(size: 19, weight: .heavy).italic().monospacedDigit())
            .foregroundStyle(accent ? Theme.Color.accentText : Theme.Color.foreground)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }

    // MARK: - 4 · Entreno de hoy (one action)

    @ViewBuilder
    private var heroSection: some View {
        if let hero = heroSession {
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
            restCard
        } else {
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

    // MARK: - 5 · Pasos (all-day movement)
    //
    // Display-local from HealthKit, with honest connect / no-data states — never a
    // fabricated number.
    private enum StepsDisplay {
        case count(String)
        case connect
        case empty
        var isConnect: Bool { if case .connect = self { return true } else { return false } }
    }

    private var stepsDisplay: StepsDisplay {
        switch stepsReading {
        case .steps(let n):
            return .count(Self.stepsFormatter.string(from: NSNumber(value: n)) ?? "\(n)")
        case .noData:
            return HealthKitConnection.isConnected ? .empty : .connect
        case .unavailable:
            return .connect
        case nil:
            return .empty
        }
    }

    private var stepsRow: some View {
        let display = stepsDisplay
        let tappable = display.isConnect
        return Button {
            guard tappable else { return }
            Haptics.light()
            onOpenTab?(.perfil)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "shoeprints.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                LabelText(text: "Pasos hoy", size: 10)
                Spacer(minLength: 8)
                stepsValue(display)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!tappable)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stepsAxLabel(display))
        .accessibilityAddTraits(tappable ? .isButton : [])
    }

    @ViewBuilder
    private func stepsValue(_ display: StepsDisplay) -> some View {
        switch display {
        case .count(let text):
            Text(text)
                .font(.system(size: 20, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
        case .connect:
            HStack(spacing: 4) {
                Text("Conecta Salud")
                    .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(Theme.Color.accentText)
        case .empty:
            Text("—")
                .font(.system(size: 20, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.faint)
        }
    }

    private func stepsAxLabel(_ display: StepsDisplay) -> String {
        switch display {
        case .count(let text): return "Pasos hoy, \(text)"
        case .connect:         return "Pasos hoy. Conecta Apple Salud para ver tus pasos"
        case .empty:           return "Pasos hoy, sin datos todavía"
        }
    }

    private static let stepsFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_ES")
        return f
    }()

    // MARK: - 6 · Proyección (puerta honesta)
    //
    // Where a finish-time projection would live. The model doesn't exist yet
    // (deep-dive-performance.ts returns null), so instead of fabricating a number we
    // show an honest, dashed "locked" placeholder inviting a HYROX simulation — the
    // path that WILL unlock it. No fake projection, and no dead button (there's no
    // simulation flow to route to yet), just the honest invitation.

    private var projectionGate: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .fill(Theme.Color.accent.opacity(0.14))
                    Image(systemName: "lock.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .frame(width: 24, height: 24)
                Text("¿Llegas a tu objetivo?")
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 0)
            }
            Text(projectionGateCopy)
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .strokeBorder(
                    Theme.Color.hairlineStrong,
                    style: StrokeStyle(lineWidth: 1, dash: [5, 4])
                )
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("¿Llegas a tu objetivo? \(projectionGateCopy)")
    }

    /// Honest gate copy — names the goal time when one is set, generic otherwise.
    private var projectionGateCopy: String {
        if let race = targetRace, let goal = goalPlain(race) {
            return "Haz una simulación de HYROX y veremos si tu ritmo proyectado baja de \(goal)."
        }
        return "Haz una simulación de HYROX para ver si llegas a tu objetivo."
    }

    // MARK: - Small formatters
    //
    // Spanish decimal comma for the two figures that carry a fraction (volume +
    // VDOT); the server pre-formats them with a dot. Everything else is integer or
    // already m:ss.

    private func esDecimal(_ s: String) -> String {
        s.replacingOccurrences(of: ".", with: ",")
    }

    /// Seconds → "m:ss" (62 → "1:02"). Used for the 5 km improvement delta.
    private func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    /// Trim a wire string, returning nil for empty/whitespace (honest-empty guard).
    private func nonEmpty(_ s: String?) -> String? {
        let t = s?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (t?.isEmpty == false) ? t : nil
    }

    // MARK: - Derivations (pure projections over the store's slices)

    private func planExists(_ resp: AthletePlanWeekResponse) -> Bool {
        resp.week.days.contains { day in
            day.sessions.contains { !$0.assignmentId.isEmpty }
        }
    }

    private func isTodayRest(_ resp: AthletePlanWeekResponse) -> Bool {
        guard let today = resp.week.days.first(where: { $0.isoDate == resp.week.todayIso }) else {
            return true
        }
        return today.sessions.allSatisfy { $0.assignmentId.isEmpty }
    }

    private func sessionsForToday(_ resp: AthletePlanWeekResponse) -> [AthleteWeekDaySession] {
        let todayIso = resp.week.todayIso
        guard let today = resp.week.days.first(where: { $0.isoDate == todayIso }) else { return [] }
        let active = today.sessions.filter {
            $0.status.lowercased() != "completed"
                && !CompletedAssignmentsStore.isCompleted($0.assignmentId)
        }
        return active.sorted { slotRank($0.slot) < slotRank($1.slot) }
    }

    private func slotRank(_ slot: String) -> Int {
        switch slot.lowercased() {
        case "am": return 0
        case "pm": return 1
        default:   return 2
        }
    }

    private func pushNextWorkoutToWatch() {
        WatchConnectivityiOSService.shared.activate()
        guard let id = heroAssignmentId, let title = heroTitle else {
            WatchConnectivityiOSService.shared.pushWorkoutForToday(nil)
            return
        }
        let slot = heroSlotRaw
        let payload = WatchWorkoutPayload(
            id: id,
            title: title,
            focus: slot.isEmpty ? nil : slot.uppercased(),
            duration_minutes: 60,
            intensity_label: nil,
            activity_kind: "mixed"
        )
        WatchConnectivityiOSService.shared.pushWorkoutForToday(payload)
    }

    // MARK: - Hero / PM resolution

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

    private func slotFor(_ session: AthleteWeekDaySession) -> SessionSlot {
        slotFor(session.slot)
    }

    private func slotFor(_ raw: String) -> SessionSlot {
        raw.lowercased() == "pm" ? .pm : .am
    }

    private func heroKicker(for session: AthleteWeekDaySession) -> String {
        let mod = modalityLabel(session.modality)
        if pmSession != nil {
            return mod.isEmpty ? "Sesión principal" : "\(mod) · sesión principal"
        }
        return mod.isEmpty ? "Sesión de hoy" : "\(mod) · sesión de hoy"
    }

    private func heroMeta(for session: AthleteWeekDaySession) -> String {
        let slot = slotFor(session) == .pm ? "Tarde" : "Mañana"
        let detail = sessionDetailMeta(for: session)
        if detail.isEmpty {
            let mod = modalityLabel(session.modality)
            return mod.isEmpty ? slot : "\(slot) · \(mod)"
        }
        return "\(slot) · \(detail)"
    }

    private func compactMeta(for session: AthleteWeekDaySession) -> String {
        let detail = sessionDetailMeta(for: session)
        if detail.isEmpty {
            let mod = modalityLabel(session.modality)
            return mod.isEmpty ? "Más tarde hoy" : "\(mod) · más tarde hoy"
        }
        return "\(detail) · más tarde hoy"
    }

    private func sessionDetailMeta(for session: AthleteWeekDaySession) -> String {
        var parts: [String] = []
        if let min = session.estDurationMinutes, min > 0 {
            parts.append("≈ \(min) min")
        }
        if let blocks = session.blocksCount, blocks > 0 {
            parts.append("\(blocks) \(blocks == 1 ? "bloque" : "bloques")")
        }
        if parts.isEmpty, let summary = session.shortPrescription, !summary.isEmpty {
            parts.append(summary)
        }
        return parts.joined(separator: " · ")
    }

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
}

// MARK: - Signal chip
//
// A compact readiness-input indicator: a small icon + label, lit in the accent
// text role when the signal contributed to the score, dim (faint) when absent.
// Honest — it shows what's behind the number without inventing raw values.
private struct SignalChip: View {
    let icon: String
    let text: String
    let active: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text(text)
                .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(active ? Theme.Color.accentText : Theme.Color.faint)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
        .background(active ? Theme.Color.surfaceSunken : Color.clear)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .stroke(active ? Color.clear : Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(active ? "\(text), activo" : "\(text), sin datos")
    }
}

// MARK: - Trend sparkline
//
// A minimal line over a value series (oldest→newest) with a trailing dot on the
// latest point. Decorative — the host row carries the accessible label. A vertical
// inset keeps the stroke + dot from clipping at the frame edges.
private struct TrendSparkline: View {
    let values: [Double]
    var color: Color = Theme.Color.accentText

    var body: some View {
        GeometryReader { geo in
            let pts = points(in: geo.size)
            ZStack {
                Path { path in
                    guard let first = pts.first else { return }
                    path.move(to: first)
                    for pt in pts.dropFirst() { path.addLine(to: pt) }
                }
                .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                if let last = pts.last {
                    Circle()
                        .fill(color)
                        .frame(width: 4, height: 4)
                        .position(last)
                }
            }
        }
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let inset: CGFloat = 3
        let minV = values.min() ?? 0
        let maxV = values.max() ?? 1
        let range = max(maxV - minV, 0.0001)
        let usableH = max(size.height - inset * 2, 1)
        let stepX = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            let x = CGFloat(index) * stepX
            let y = inset + (usableH - CGFloat((value - minV) / range) * usableH)
            return CGPoint(x: x, y: y)
        }
    }
}
