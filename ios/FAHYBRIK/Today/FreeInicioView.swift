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
    @State private var resumeBannerRefresh = 0
    @State private var showLaunchConflict = false
    @State private var conflictSnapshotTitle: String?
    @State private var pendingOpenFreeBuilder = false
    @State private var pendingWeekLaunch: WorkoutLaunch? = nil
    // The day of the strip the athlete is looking at. Nil = today (the default
    // on arrival); a tap pins another day.
    @State private var selectedIso: String? = nil
    // The «Probarme» library, self-loaded for the card's real-data subtitle.
    @State private var marks: [MarkView] = []
    // Drives the one orchestrated staggered reveal of the cards on appear.
    @State private var revealed = false
    @State private var freeEditAssignmentId: String? = nil

    @Environment(AppDataStore.self) private var store

    private var identity: AthleteIdentity? { store.identity.value }

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
                        WorkoutResumeBanner(refreshToken: resumeBannerRefresh) { _ in
                            Task {
                                await LiveWorkoutResume.shared.recoverOnLaunch(
                                    hrZones: identity?.hrZones
                                )
                            }
                        }
                        .staggerReveal(revealed, index: 1)
                        builderCard
                            .staggerReveal(revealed, index: 2)
                        marksCard
                            .staggerReveal(revealed, index: 3)
                        SemanaAtletaOperativa(
                            bearer: bearer,
                            selectedIso: $selectedIso,
                            onOpenSession: openSession,
                            onEditFree: { freeEditAssignmentId = $0 },
                            onMutated: { Task { await store.planMutated() } }
                        )
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
        .fullScreenCover(isPresented: $showFreeBuilder, onDismiss: {
            resumeBannerRefresh += 1
        }) {
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
        .fullScreenCover(item: $workoutLaunch, onDismiss: {
            resumeBannerRefresh += 1
        }) { launch in
            // A session of the week still pending — the same brief/execution flow
            // the coached Plan opens. Nothing free-specific is re-implemented.
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                planSessionIsSelfOrigin: launch.isSelfOrigin,
                hrZones: identity?.hrZones,
                onClose: { workoutLaunch = nil },
                onCompleted: { _ in
                    workoutLaunch = nil
                    Task { await store.planMutated() }
                }
            )
        }
        .liveWorkoutLaunchConflict(
            isPresented: $showLaunchConflict,
            snapshotTitle: conflictSnapshotTitle,
            onResume: {
                Task { await LiveWorkoutResume.shared.recoverOnLaunch(hrZones: identity?.hrZones) }
            },
            onEndAndStart: {
                Task {
                    await LiveWorkoutLaunchConflict.terminateCurrentForNewStart()
                    if pendingOpenFreeBuilder {
                        pendingOpenFreeBuilder = false
                        showFreeBuilder = true
                    } else if let pending = pendingWeekLaunch {
                        pendingWeekLaunch = nil
                        workoutLaunch = pending
                    }
                }
            }
        )
        .onAppear {
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        .fullScreenCover(isPresented: Binding(
            get: { freeEditAssignmentId != nil },
            set: { if !$0 { freeEditAssignmentId = nil } }
        )) {
            if let editId = freeEditAssignmentId, let id = Int(editId) {
                FreeWorkoutBuilderView(
                    bearer: bearer,
                    editingAssignmentId: id,
                    hrZones: identity?.hrZones,
                    onClose: { freeEditAssignmentId = nil },
                    onCompleted: {
                        freeEditAssignmentId = nil
                        Task { await store.planMutated() }
                    }
                )
            }
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
                    CoachAvatar(
                        initials: identity?.initials ?? "",
                        size: 34,
                        tint: Theme.Color.muted,
                        photoURL: identity?.avatarURLResuelta
                    )
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
            Task { await attemptOpenFreeBuilder() }
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

    /// Tapping a session routes by STATE — the same single decision point the
    /// coached Plan uses: finished → what he logged; pending → the brief to do it.
    private func openSession(_ session: AthleteWeekDaySession) {
        let launch = WorkoutLaunch(
            assignmentId: session.assignmentId,
            title: session.title,
            isSelfOrigin: session.isSelfOrigin
        )
        if SessionMarkState.of(status: session.status, assignmentId: session.assignmentId).isFinished {
            executedLaunch = launch
        } else {
            Task { await attemptWorkoutLaunch(launch) }
        }
    }

    @MainActor
    private func attemptOpenFreeBuilder() async {
        if LiveWorkoutLaunchConflict.shouldPromptStartingLive(
            hasLiveCoverOrTracked: LiveWorkoutResume.shared.hasLiveSession
        ) {
            let saved = await WorkoutStateStore.shared.load()
            conflictSnapshotTitle = saved?.freeTitle ?? saved?.plan.name
            pendingOpenFreeBuilder = true
            showLaunchConflict = true
        } else {
            showFreeBuilder = true
        }
    }

    @MainActor
    private func attemptWorkoutLaunch(_ launch: WorkoutLaunch) async {
        let saved = await WorkoutStateStore.shared.load()
        if LiveWorkoutLaunchConflict.shouldPromptStartingLive(
            hasLiveCoverOrTracked: LiveWorkoutResume.shared.hasLiveSession
        ) {
            conflictSnapshotTitle = saved?.plan.name ?? launch.title
            pendingWeekLaunch = launch
            showLaunchConflict = true
        } else {
            workoutLaunch = launch
        }
    }

}
