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
//      (their logged "Libre" sessions) that is NAVIGABLE: tapping a day opens
//      what he trained that day, right under the bars, and each session opens
//      the detail the coached app already uses (ExecutedWorkoutView for a
//      finished one, WorkoutContainer for one still pending). Today is the
//      day selected on arrival — which is why there is no separate "Hecho hoy"
//      card: it would repeat the same rows twice.
//
// Every value is real data or an honest empty state — nothing fabricated.
struct FreeInicioView: View {
    /// Live session bearer, provided by AppShell (single source of truth).
    var bearer: String? = nil
    /// Lets the header route the shell to another tab (avatar → Perfil).
    var onOpenTab: ((AppTab) -> Void)? = nil

    @State private var showFreeBuilder = false
    // A finished session tapped in the week — read-only executed detail.
    @State private var executedLaunch: WorkoutLaunch? = nil
    // A still-pending session tapped in the week — the same brief the coached
    // app opens to do it.
    @State private var workoutLaunch: WorkoutLaunch? = nil
    // The day of the strip the athlete is looking at. Nil = today (the default
    // on arrival); a tap pins another day.
    @State private var selectedIso: String? = nil
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
                        weekCard
                            .staggerReveal(revealed, index: 4)
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
                hrZones: identity?.hrZones,
                onClose: { showFreeBuilder = false },
                onCompleted: { Task { await store.planMutated() } }
            )
        }
        .fullScreenCover(item: $executedLaunch) { launch in
            // Read-only detail of a session already DONE (what was logged).
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                onClose: { executedLaunch = nil },
                onStale: { Task { await store.planMutated() } }
            )
        }
        .fullScreenCover(item: $workoutLaunch) { launch in
            // A session of the week still pending — the same brief/execution flow
            // the coached Plan opens. Nothing free-specific is re-implemented.
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                hrZones: identity?.hrZones,
                onClose: { workoutLaunch = nil },
                onCompleted: { _ in
                    workoutLaunch = nil
                    Task { await store.planMutated() }
                }
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
        // Aún no ha medido NADA: la línea tiene que leerse como invitación, no
        // como historial. "Un 1 km, un remo 500…" sonaba a que ya los había hecho.
        return "Aún no te has medido. Prueba un 1 km o un remo 500: la app lo mide sola."
    }

    private var marksCard: some View {
        CardSurface(padding: 0) {
            NavigationLink {
                MarksLibraryView(bearer: bearer, hrZones: identity?.hrZones)
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
                        .scaledFont(12, relativeTo: .caption)
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

    // MARK: - Sessions of a day (shared by the strip's selected-day panel)

    /// The REAL sessions of a day, in slot order (AM before PM).
    private func sessions(of day: AthleteWeekDay) -> [AthleteWeekDaySession] {
        day.sessions
            .filter { !$0.assignmentId.isEmpty }
            .sorted { slotRank($0.slot) < slotRank($1.slot) }
    }

    /// Tapping a session routes by STATE — the same single decision point the
    /// coached Plan uses: finished → what he logged; pending → the brief to do it.
    private func openSession(_ session: AthleteWeekDaySession) {
        let launch = WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
        if SessionMarkState.of(status: session.status, assignmentId: session.assignmentId).isFinished {
            executedLaunch = launch
        } else {
            workoutLaunch = launch
        }
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

    /// «3 sesiones · desde 2 h 40 · 1 sin tiempo previsto» — cuántas cerraste y
    /// cuánto reloj escriben, con el hueco declarado al lado.
    ///
    /// Antes esto era `compactMap { estDurationMinutes }.reduce(0, +)`: la suma de
    /// las que traían número, presentada como el tiempo de la semana. Con la mayoría
    /// de las plantillas llegando sin duración, era subreportar en silencio. La
    /// cuenta la hace `VolumenPrevisto`, la misma que la semana del plan — tener dos
    /// sumas fue lo que permitió que esta se quedara atrás.
    private var weekSummaryLine: String? {
        let done = weekDoneSessions
        guard !done.isEmpty else { return nil }
        var parts = ["\(done.count) \(done.count == 1 ? "sesión" : "sesiones")"]
        if let linea = VolumenPrevisto.lee(done.map(\.estDurationMinutes)).linea {
            parts.append(linea)
        }
        return parts.joined(separator: " · ")
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

    /// The day the panel is showing: the one the athlete pinned, else today.
    private func selectedDay(in week: AthleteWeekPayload) -> AthleteWeekDay? {
        let iso = selectedIso ?? week.todayIso
        return week.days.first { $0.isoDate == iso } ?? week.days.first { $0.isoDate == week.todayIso }
    }

    @ViewBuilder
    private var weekCard: some View {
        if let week = planWeek?.week {
            CardSurface(padding: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        LabelText(text: "Tu semana")
                        Spacer(minLength: 8)
                        Text("toca un día")
                            .scaledFont(10, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                            .accessibilityHidden(true)
                    }
                    HStack(alignment: .bottom, spacing: 6) {
                        ForEach(week.days) { day in
                            dayColumn(
                                day,
                                isToday: day.isoDate == week.todayIso,
                                isSelected: day.isoDate == (selectedIso ?? week.todayIso)
                            )
                        }
                    }
                    if let day = selectedDay(in: week) {
                        Hairline()
                        selectedDayPanel(day, isToday: day.isoDate == week.todayIso)
                    }
                    Text(weekSummaryLine ?? "Aún nada esta semana. Tu primera sesión la construyes tú.")
                        .scaledFont(11, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .animation(.easeOut(duration: 0.18), value: selectedIso)
        } else if store.planWeek.hasLoaded || store.planWeek.loadFailed {
            // Loaded empty (brand-new account) or failed with no cache — the
            // honest quiet state; the strip appears with their first session.
            CardSurface(padding: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Tu semana")
                    Text("Aún nada esta semana. Tu primera sesión la construyes tú.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        // else: cold start mid-load → nothing (no skeleton flash for one card).
    }

    private func dayColumn(_ day: AthleteWeekDay, isToday: Bool, isSelected: Bool) -> some View {
        let load = dayLoad(day)
        return Button {
            Haptics.light()
            selectedIso = day.isoDate
        } label: {
            VStack(spacing: 4) {
                Text(dayLetter(forIso: day.isoDate))
                    .scaledFont(10, weight: isToday ? .heavy : .semibold, relativeTo: .caption2)
                    .foregroundStyle(isToday ? Theme.Color.accentText : Theme.Color.faint)
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(barColor(load))
                    .frame(height: barHeight(load))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 3)
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .stroke(Theme.Color.accentText, lineWidth: 1.5)
                        .padding(.horizontal, -3)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(dayAxLabel(day, isToday: isToday))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    /// "Lunes 21, 1 sesión hecha" — what VoiceOver reads for a day of the strip.
    private func dayAxLabel(_ day: AthleteWeekDay, isToday: Bool) -> String {
        var label = isToday ? "Hoy" : dayLongLabel(forIso: day.isoDate)
        let done = sessions(of: day).filter {
            SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished
        }.count
        let total = sessions(of: day).count
        if total == 0 {
            label += ", sin entreno"
        } else if done == total {
            label += ", \(total) \(total == 1 ? "sesión hecha" : "sesiones hechas")"
        } else {
            label += ", \(total) \(total == 1 ? "sesión" : "sesiones"), \(done) \(done == 1 ? "hecha" : "hechas")"
        }
        return label
    }

    // MARK: - El día seleccionado (lo que entrenó ese día)

    @ViewBuilder
    private func selectedDayPanel(_ day: AthleteWeekDay, isToday: Bool) -> some View {
        let list = sessions(of: day)
        // ISO dates compare lexicographically, so a plain string compare tells
        // past from future without parsing.
        let isFuture = day.isoDate > (planWeek?.week.todayIso ?? day.isoDate)
        VStack(alignment: .leading, spacing: 8) {
            LabelText(
                text: "\(isToday ? "Hoy" : dayLongLabel(forIso: day.isoDate)) · \(isFuture ? "lo que tienes" : "lo que hiciste")",
                color: Theme.Color.faint,
                size: 10
            )
            if list.isEmpty {
                Text(emptyDayCopy(isToday: isToday, isFuture: isFuture))
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            } else {
                VStack(spacing: 7) {
                    ForEach(list) { session in
                        daySessionRow(session)
                        if session.id != list.last?.id { Hairline().opacity(0.5) }
                    }
                }
            }
        }
    }

    private func emptyDayCopy(isToday: Bool, isFuture: Bool) -> String {
        if isToday { return "Aún no has entrenado hoy." }
        return isFuture ? "Nada programado ese día." : "Ese día no entrenaste."
    }

    private func daySessionRow(_ session: AthleteWeekDaySession) -> some View {
        let state = SessionMarkState.of(status: session.status, assignmentId: session.assignmentId)
        return Button {
            Haptics.light()
            openSession(session)
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
                // El reloj que escribió el PLAN, no lo que tardaste (esta carga no
                // trae la ejecución). Por eso va con su «desde»: sin él se leía como
                // el tiempo que hiciste.
                if state.isFinished, let suelo = Formato.duracionPrevista(session.estDurationMinutes) {
                    Text(suelo)
                        .font(.system(size: 11, weight: .medium).monospacedDigit())
                        .foregroundStyle(Theme.Color.faint)
                }
                stateGlyph(state)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("\(session.title), \(stateWord(state)). Ver detalle.")
    }

    @ViewBuilder
    private func stateGlyph(_ state: SessionMarkState) -> some View {
        switch state {
        case .done:
            Image(systemName: "checkmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Color.ok)
        case .partial:
            Image(systemName: "circle.lefthalf.filled")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Color.warning)
        case .missed:
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Color.danger)
        case .pending:
            EmptyView()
        }
    }

    private func stateWord(_ state: SessionMarkState) -> String {
        switch state {
        case .done:    return "completada"
        case .partial: return "parcial"
        case .missed:  return "no hecha"
        case .pending: return "pendiente"
        }
    }

    /// "Miércoles 22" — the long ES label of a day of the strip.
    private func dayLongLabel(forIso iso: String) -> String {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: iso) else { return "Ese día" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEE d"
        let raw = out.string(from: date)
        return raw.prefix(1).uppercased() + raw.dropFirst()
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
}
