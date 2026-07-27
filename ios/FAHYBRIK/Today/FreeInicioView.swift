import SwiftUI

// Inicio for the FREE tier (athlete without coach) — pantalla 2 del mockup
// aprobado (docs/design/free-tier-mockup.html). The free home does not pretend
// there is a coach: no chat, no plan-published copy, no readiness clearance.
// Three moves, top to bottom:
//
//   header   → wordmark + avatar (no chat affordance)
//   greeting → date kicker + "Hola, {name}"
//   1. CONSTRUIR ENTRENO — the hero CTA into the existing free builder
//      (FreeWorkoutBuilderView; this view only LINKS to it).
//   2. ¿TE PRUEBAS? — the existing «Probarme» library (MarksLibraryView),
//      with the athlete's real mark count / last-mark recency when loaded.
//   3. TU SEMANA — a 7-day strip of REAL executions from the week payload
//      (their logged "Libre" sessions), plus today's finished sessions as
//      reopenable "Hecho hoy" rows.
//
// Every value is real data or an honest empty state — nothing fabricated.
struct FreeInicioView: View {
    /// Live session bearer, provided by AppShell (single source of truth).
    var bearer: String? = nil
    /// Lets the header route the shell to another tab (avatar → Perfil).
    var onOpenTab: ((AppTab) -> Void)? = nil

    @State private var showFreeBuilder = false
    // A finished session tapped from "Hecho hoy" — read-only executed detail.
    @State private var executedLaunch: WorkoutLaunch? = nil
    // The «Probarme» library, self-loaded for the card's real-data subtitle.
    @State private var marks: [MarkView] = []
    // Drives the one orchestrated staggered reveal of the cards on appear.
    @State private var revealed = false

    @Environment(AppDataStore.self) private var store

    private var identity: AthleteIdentity? { store.identity.value }
    private var planWeek: AthletePlanWeekResponse? { store.planWeek.value }

    var body: some View {
        // Own NavigationStack so «¿Te pruebas?» pushes MarksLibraryView within
        // the tab (AppShell hosts each tab root flat, no shared stack).
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        header
                            .staggerReveal(revealed, index: 0)
                        greeting
                            .staggerReveal(revealed, index: 1)
                        builderCard
                            .staggerReveal(revealed, index: 2)
                        marksCard
                            .staggerReveal(revealed, index: 3)
                        hechoHoySection
                            .staggerReveal(revealed, index: 4)
                        weekCard
                            .staggerReveal(revealed, index: 5)
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.xl)
                }
                .refreshable {
                    await store.loadFreeHome(force: true)
                    await loadMarks()
                }
            }
            .navigationBarHidden(true)
        }
        .fullScreenCover(isPresented: $showFreeBuilder) {
            // The hero CTA → the existing free builder → existing live engine →
            // free save. On finish the plan refreshes so the new self-origin
            // session appears in "Hecho hoy" and the week strip.
            FreeWorkoutBuilderView(
                bearer: bearer,
                hrMaxSource: identity?.hrMaxSource,
                onClose: { showFreeBuilder = false },
                onCompleted: { Task { await store.planMutated() } }
            )
        }
        .fullScreenCover(item: $executedLaunch) { launch in
            // Read-only detail of a session already DONE today (what was logged).
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                onClose: { executedLaunch = nil },
                onStale: { Task { await store.planMutated() } }
            )
        }
        .onAppear {
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        .task(id: bearer) {
            store.activate(bearer: bearer)
            await store.loadFreeHome()
            await loadMarks()
        }
    }

    // MARK: - Header (wordmark + avatar; NO chat — there is no coach thread)

    private var header: some View {
        ZStack {
            Wordmark(size: 26)
            HStack(spacing: 12) {
                Spacer(minLength: 8)
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

    // MARK: - Greeting (same voice as the coached home)

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

    // MARK: - 1 · Construir entreno (the hero CTA → existing free builder)

    private var builderCard: some View {
        Button {
            Haptics.medium()
            showFreeBuilder = true
        } label: {
            CardSurface(padding: 18, topAccent: true, elevated: true) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .center) {
                        Text("Construir entreno")
                            .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer(minLength: 8)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 15, weight: .heavy))
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    Text("Calle, cinta, ergos y fuerza. Mézclalos como entrenes hoy.")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Construir entreno. Calle, cinta, ergos y fuerza.")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - 2 · ¿Te pruebas? (→ the existing «Probarme» library)

    /// Marks the APP measures (run + erg) — the registered-race door stays in
    /// the library itself.
    private var measurableMarks: [MarkView] { marks.filter { $0.measuredBy != "registered" } }

    /// The most recent result across the measurable marks — the honest hook
    /// ("tu última marca tiene 6 semanas"). Nil until loaded / never tested.
    private var latestMark: (mark: MarkView, result: MarkResult)? {
        measurableMarks
            .compactMap { m in m.latest.map { (m, $0) } }
            .max { $0.1.recordedAt < $1.1.recordedAt }
    }

    private var marksSubtitle: String {
        if let (mark, result) = latestMark, let rel = MarkFormat.relative(result.recordedAt) {
            return "\(mark.label): tu última marca es de \(rel)."
        }
        return "Un 1 km, un remo 500… la app lo mide sola y te dice si mejoras."
    }

    private var marksCard: some View {
        CardSurface(padding: 0) {
            NavigationLink {
                MarksLibraryView(bearer: bearer, hrMaxSource: identity?.hrMaxSource)
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("¿Te pruebas?")
                            .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer(minLength: 8)
                        if !measurableMarks.isEmpty {
                            Text("\(measurableMarks.count) marcas")
                                .scaledFont(11, relativeTo: .caption2)
                                .foregroundStyle(Theme.Color.muted)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                    }
                    Text(marksSubtitle)
                        .scaledFont(12.5, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .accessibilityElement(children: .combine)
    }

    private func loadMarks() async {
        // Silent on failure — the card keeps its generic invitation line.
        if let overview = try? await MarksService.fetchMarks(bearer: bearer) {
            marks = overview.marks
        }
    }

    // MARK: - Hecho hoy (today's finished sessions, reopenable)

    /// Today's FINISHED sessions in slot order — their logged "Libre" workouts.
    private var completedTodaySessions: [AthleteWeekDaySession] {
        guard let resp = planWeek,
              let today = resp.week.days.first(where: { $0.isoDate == resp.week.todayIso })
        else { return [] }
        return today.sessions
            .filter { SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished }
            .sorted { slotRank($0.slot) < slotRank($1.slot) }
    }

    @ViewBuilder
    private var hechoHoySection: some View {
        let done = completedTodaySessions
        if !done.isEmpty {
            CardSurface(padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Theme.Color.ok)
                        LabelText(text: "Hecho hoy", color: Theme.Color.ok, size: 12)
                    }
                    VStack(spacing: 8) {
                        ForEach(done) { session in
                            hechoHoyRow(session)
                            if session.id != done.last?.id { Hairline().opacity(0.5) }
                        }
                    }
                }
            }
        }
    }

    private func hechoHoyRow(_ session: AthleteWeekDaySession) -> some View {
        let partial = SessionMarkState.of(status: session.status, assignmentId: session.assignmentId) == .partial
        return Button {
            Haptics.light()
            executedLaunch = WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                Circle()
                    .fill(Theme.Modality.color(session.modality))
                    .frame(width: 7, height: 7)
                Text(session.title)
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                Image(systemName: partial ? "circle.lefthalf.filled" : "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(partial ? Theme.Color.warning : Theme.Color.ok)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("\(session.title), \(partial ? "parcial" : "completada"). Ver detalle.")
    }

    private func slotRank(_ slot: String) -> Int {
        switch slot.lowercased() {
        case "am": return 0
        case "pm": return 1
        default:   return 2
        }
    }

    // MARK: - 3 · Tu semana (real executions from the week payload)

    /// One day of the strip, derived from the athlete's real week.
    private enum DayLoad {
        case done       // at least one finished session that day
        case pending    // sessions exist, none finished yet
        case none
    }

    private func dayLoad(_ day: AthleteWeekDay) -> DayLoad {
        let real = day.sessions.filter { !$0.assignmentId.isEmpty }
        guard !real.isEmpty else { return .none }
        let anyDone = real.contains {
            SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished
        }
        return anyDone ? .done : .pending
    }

    /// All FINISHED sessions of the week (the real executions the strip sums).
    private var weekDoneSessions: [AthleteWeekDaySession] {
        (planWeek?.week.days ?? [])
            .flatMap { $0.sessions }
            .filter { !$0.assignmentId.isEmpty }
            .filter { SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished }
    }

    /// "3 sesiones · ≈2 h 40" — count of finished sessions plus the summed
    /// estimated time when the templates carry one. Never fabricated: with no
    /// estimable duration only the count shows.
    private var weekSummaryLine: String? {
        let done = weekDoneSessions
        guard !done.isEmpty else { return nil }
        var parts = ["\(done.count) \(done.count == 1 ? "sesión" : "sesiones")"]
        let minutes = done.compactMap { $0.estDurationMinutes }.reduce(0, +)
        if minutes > 0 {
            parts.append("≈\(clockHours(minutes))")
        }
        return parts.joined(separator: " · ")
    }

    private func clockHours(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m) min" }
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    /// Narrow ES weekday letter for the strip ("L M X J V S D").
    private func dayLetter(forIso iso: String) -> String {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: iso) else { return "·" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEEE"
        return out.string(from: date).uppercased()
    }

    @ViewBuilder
    private var weekCard: some View {
        if let week = planWeek?.week {
            CardSurface(padding: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: 12) {
                    LabelText(text: "Tu semana")
                    HStack(alignment: .bottom, spacing: 6) {
                        ForEach(week.days) { day in
                            dayColumn(day, isToday: day.isoDate == week.todayIso)
                        }
                    }
                    Text(weekSummaryLine ?? "Aún nada esta semana. Tu primera sesión la construyes tú.")
                        .scaledFont(11.5, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(weekAxLabel)
        } else if store.planWeek.hasLoaded || store.planWeek.loadFailed {
            // Loaded empty (brand-new account) or failed with no cache — the
            // honest quiet state; the strip appears with their first session.
            CardSurface(padding: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Tu semana")
                    Text("Aún nada esta semana. Tu primera sesión la construyes tú.")
                        .scaledFont(12.5, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        // else: cold start mid-load → nothing (no skeleton flash for one card).
    }

    private func dayColumn(_ day: AthleteWeekDay, isToday: Bool) -> some View {
        let load = dayLoad(day)
        return VStack(spacing: 4) {
            Text(dayLetter(forIso: day.isoDate))
                .scaledFont(10, weight: isToday ? .heavy : .semibold, relativeTo: .caption2)
                .foregroundStyle(isToday ? Theme.Color.accentText : Theme.Color.faint)
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .fill(barColor(load))
                .frame(height: barHeight(load))
        }
        .frame(maxWidth: .infinity)
    }

    private func barColor(_ load: DayLoad) -> Color {
        switch load {
        case .done:    return Theme.Color.accent
        case .pending: return Theme.Color.accent.opacity(0.35)
        case .none:    return Theme.Color.surfaceSunken
        }
    }

    private func barHeight(_ load: DayLoad) -> CGFloat {
        switch load {
        case .done:    return 34
        case .pending: return 22
        case .none:    return 8
        }
    }

    private var weekAxLabel: String {
        var label = "Tu semana."
        if let summary = weekSummaryLine {
            label += " \(summary)."
        } else {
            label += " Aún sin sesiones."
        }
        return label
    }
}
