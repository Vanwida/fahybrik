import SwiftUI

// Plan (FREE) — the tab for an athlete WITHOUT a coach, built as the conversion
// surface of the free tier (docs/design/free-plan-conversion-mockup.html).
//
// THE RULE THAT KEEPS THIS FROM BEING AN AD: the free tier MEASURES and COMPARES;
// the paid tier DECIDES. This screen has to be worth opening even if the athlete
// never pays a cent — so everything on it is HIS OWN REAL DATA. Nothing is
// invented: a number that doesn't exist is not painted, and what's missing is
// named out loud.
//
// Two states, one set of cards:
//
//   · SIN EVIDENCIA (no measured mark, no imported race) — nothing is sold here.
//     First what we GIVE him (his watch VO₂max, when it exists), then what we
//     ASK: bring your HYROX history in one tap, or measure the three starter
//     marks. Selling before there is a diagnosis is exactly when the salesman
//     shows through.
//   · CON EVIDENCIA — first what his own races already PROVE about him, then his
//     goal against that reality, then the week those numbers buy, and only then
//     what is still missing and the person who turns it into a plan.
//
// WHAT HIS RACES PROVE, AND WHAT THEY DO NOT: in doubles both athletes run all
// eight kilometres and travel every transition, so running and roxzone are his.
// The stations are shared out between the pair, so they are NEVER attributed to
// him. That rule lives server-side in shared/domain/free-plan, where it is
// tested; this screen only paints what arrives.
//
// The one thing this screen used to get badly wrong: it asked an athlete who had
// just imported six races with full splits for "tus marcas", ignoring everything
// he had handed over. Anything we can already compute is given back FIRST; a
// request comes after it, and only for what is genuinely missing.
struct FreePlanView: View {
    /// Live session bearer, provided by AppShell (single source of truth).
    var bearer: String? = nil

    @Environment(AppDataStore.self) private var store
    @Environment(\.openURL) private var openURL

    /// The «Probarme» catalog + his results (`GET /api/athlete/marks`). Loaded
    /// here — it is not an AppDataStore slice — and it decides the whole state
    /// fork, so the screen waits for it before rendering.
    @State private var marks: [MarkView] = []
    @State private var marksLoaded = false
    @State private var marksFailed = false
    /// His watch VO₂max (`GET /api/athlete/biometrics/trend`). Nil whenever the
    /// backend has no recent real series — then nothing is painted.
    @State private var vo2: BiometricMetricSeries? = nil
    /// The computed portrait (`GET /api/athlete/free-plan`): what his races
    /// prove, his goal against them, and the week those numbers buy. Nil while
    /// loading or when the server had nothing to compute.
    @State private var freePlan: FreePlanPayload? = nil

    @State private var showImport = false
    @State private var showBuscarCarrera = false
    @State private var revealed = false

    private var planWeek: AthletePlanWeekResponse? { store.planWeek.value }
    /// The athlete's resolved max-HR source — every «Probarme» door threads it in
    /// so a live attempt gets his HR zones and not a generic guess.
    private var hrMaxSource: HRMaxSource? { store.identity.value?.hrMaxSource }
    private var targetRace: AthleteNextRace? { planWeek?.targetRace }
    private var pastRaces: [ImportedRace] { store.racesHub.value?.past ?? [] }

    /// The marks the APP can measure end to end (the registered race distances
    /// live in the library, not here).
    private var measurableMarks: [MarkView] { marks.filter { $0.measuredBy != "registered" } }
    private var measuredMarks: [MarkView] { measurableMarks.filter { $0.best != nil } }
    private var missingMarks: [MarkView] { measurableMarks.filter { $0.best == nil } }

    /// Does he have anything real about himself yet? A measured mark or an
    /// imported race. Drives which of the two states renders.
    private var hasEvidence: Bool { !measuredMarks.isEmpty || !pastRaces.isEmpty }

    /// Both inputs of that fork have answered (from cache or network). Without
    /// this the screen could paint "sin datos" for an instant to an athlete whose
    /// race history simply hadn't arrived yet — and then flip. One honest wait.
    private var stateSettled: Bool {
        marksLoaded && (store.racesHub.hasLoaded || store.racesHub.loadFailed)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        if !stateSettled {
                            ProgressView()
                                .tint(Theme.Color.accentText)
                                .frame(maxWidth: .infinity)
                                .padding(.top, Theme.Spacing.xxl)
                        } else if hasEvidence {
                            withEvidenceContent
                        } else {
                            noEvidenceContent
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
                }
                .refreshable { await load(force: true) }
            }
            .navigationBarHidden(true)
        }
        .sheet(isPresented: $showImport) {
            // The SAME search-by-name importer the Carreras hub uses: one tap
            // brings his whole HYROX history with per-station splits.
            ImportRaceSheet(bearer: bearer) { result in
                if let result { store.applyImportedRaces(result.races) }
                Task { await store.racesMutated() }
            }
        }
        .sheet(isPresented: $showBuscarCarrera) {
            // Free: the picker hides its "pídesela a tu coach" fallback on its own.
            BuscarCarreraSheet(bearer: bearer, hasCoach: false) {
                Task { await store.racesMutated() }
            }
        }
        .onAppear {
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        .task(id: bearer) {
            store.activate(bearer: bearer)
            await load()
        }
    }

    // MARK: - Composition
    //
    // Same cards, two orders. Without evidence the ask leads; with evidence the
    // athlete's own picture leads and the coach closes.

    @ViewBuilder
    private var noEvidenceContent: some View {
        emptyHeader
            .staggerReveal(revealed, index: 0)
        raceOrObjectiveCard
            .staggerReveal(revealed, index: 1)
        whatWeKnowCard
            .staggerReveal(revealed, index: 2)
        importCard
            .staggerReveal(revealed, index: 3)
        startersCard
            .staggerReveal(revealed, index: 4)
        starterCTA
            .staggerReveal(revealed, index: 5)
        freeNote
            .staggerReveal(revealed, index: 6)
    }

    // With evidence the order is the mockup's and it is not casual: his goal
    // (desire), what his own numbers say (the free, true diagnosis), the week
    // those numbers buy (competence, half of it locked), what is still missing,
    // and the person.
    @ViewBuilder
    private var withEvidenceContent: some View {
        raceOrObjectiveCard
            .staggerReveal(revealed, index: 0)
        raceEvidenceCard
            .staggerReveal(revealed, index: 1)
        whatWeKnowCard
            .staggerReveal(revealed, index: 2)
        weekCard
            .staggerReveal(revealed, index: 3)
        marksCard
            .staggerReveal(revealed, index: 4)
        importCard
            .staggerReveal(revealed, index: 5)
        coachCard
            .staggerReveal(revealed, index: 6)
    }

    /// Lo que sus carreras ya demuestran. Sin carreras no hay tarjeta.
    @ViewBuilder
    private var raceEvidenceCard: some View {
        if let evidence = freePlan?.raceEvidence {
            FreeRaceEvidenceCard(evidence: evidence)
        }
    }

    /// La semana bloqueada. El servidor solo la manda cuando puede personalizar
    /// al menos dos sesiones con datos suyos; si no, aquí no hay nada.
    @ViewBuilder
    private var weekCard: some View {
        if let week = freePlan?.week, !week.sessions.isEmpty {
            FreePlanWeekCard(week: week)
        }
    }

    // MARK: - Header (only when there is nothing measured yet)

    private var emptyHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Plan", color: Theme.Color.accentText, size: 12)
            Text("Primero, saber\ndónde estás.")
                .scaledFont(27, weight: .heavy, relativeTo: .largeTitle, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text("Sin números no hay plan que valga. Traemos lo que ya has corrido y medimos el resto.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Tu carrera / pon tu carrera

    @ViewBuilder
    private var raceOrObjectiveCard: some View {
        if let race = targetRace {
            raceCard(race)
        } else {
            objectiveCard
        }
    }

    private func raceCard(_ race: AthleteNextRace) -> some View {
        CardSurface(padding: 16, topAccent: true, elevated: true) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "Tu carrera")
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    Text(race.name)
                        .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                    Spacer(minLength: 4)
                    if let countdown = countdownLabel(race) {
                        Text(countdown)
                            .font(.system(size: 12, weight: .semibold).monospacedDigit())
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize()
                    }
                }
                if let category = race.categoryLine {
                    Text(category)
                        .scaledFont(11.5, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
                if let goal = race.goalTimeFormatted {
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Text("Tu objetivo")
                            .scaledFont(11.5, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                        Text(goal)
                            .font(.system(size: 22, weight: .heavy).italic().monospacedDigit())
                            .foregroundStyle(Theme.Color.accentText)
                    }
                }
                // Su objetivo contra su realidad: la conversación interesante, y
                // la que faltaba. Solo compara con carreras de la MISMA categoría
                // (el servidor lo decide); si no hay ninguna comparable, lo dice.
                if let check = freePlan?.goalCheck {
                    Hairline().opacity(0.6)
                    FreeGoalComparison(check: check)
                } else if let missing = missingMarksLine {
                    // Sin objetivo y sin nada que comparar, lo honesto es nombrar
                    // lo que falta. Con carreras importadas esto ya no aparece:
                    // la tarjeta de arriba le devuelve lo que sí sabemos.
                    Hairline().opacity(0.6)
                    Text(missing)
                        .scaledFont(12.5, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var objectiveCard: some View {
        Button {
            Haptics.light()
            showBuscarCarrera = true
        } label: {
            CardSurface(padding: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    LabelText(text: "¿Ya tienes una carrera?")
                    HStack(spacing: Theme.Spacing.s) {
                        Text("Ponla y te llevamos la cuenta atrás.")
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 4)
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .heavy))
                            .foregroundStyle(Theme.Color.accentText)
                    }
                }
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("¿Ya tienes una carrera? Ponla y te llevamos la cuenta atrás.")
        .accessibilityAddTraits(.isButton)
    }

    /// "Para decirte cuánto tardarías aún nos faltan…" — the marks he has NOT
    /// measured, straight from the server catalog. Nil when nothing is missing:
    /// we never promise a number we can't compute yet.
    ///
    /// ALSO NIL AS SOON AS HIS RACES SAY SOMETHING. Asking for homework from an
    /// athlete who just handed over six races with splits is how this screen lost
    /// its credibility the first time. When there is evidence, the evidence card
    /// leads and the ask moves down to «Tus marcas», where it is justified by
    /// what it unlocks.
    private var missingMarksLine: String? {
        guard freePlan?.raceEvidence == nil else { return nil }
        // The three starter marks lead the list: they're the same three doors the
        // screen offers, so the athlete reads ONE story and not two.
        // Deterministic: starter rank first, catalog position as the tie-break
        // (Swift's sort is not stable, so the index is compared explicitly).
        let pending = missingMarks.enumerated().sorted { a, b in
            let ra = FreePlanCopy.starterRank(a.element.slug)
            let rb = FreePlanCopy.starterRank(b.element.slug)
            return ra == rb ? a.offset < b.offset : ra < rb
        }.map(\.element)
        guard !pending.isEmpty else { return nil }
        let shown = pending.prefix(FreePlanCopy.maxMissingListed).map(\.label)
        let rest = pending.count - shown.count
        let list = rest > 0
            ? shown.joined(separator: ", ") + " y \(rest) más"
            : naturalList(shown)
        return "Para decirte cuánto tardarías aún nos faltan tus marcas: \(list)."
    }

    // MARK: - Lo que ya sabemos de ti (his watch VO₂max — real, and nowhere else in the app)

    @ViewBuilder
    private var whatWeKnowCard: some View {
        if let vo2 {
            CardSurface(padding: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    LabelText(text: "Lo que ya sabemos de ti")
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Text(vo2.label)
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer(minLength: 8)
                        Text(FreePlanCopy.number(vo2.latest))
                            .font(.system(size: 26, weight: .heavy).italic().monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                        if !vo2.unit.isEmpty {
                            Text(vo2.unit)
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    Text("Lo mide tu reloj. Es el tamaño de tu motor: manda en los 8 km de carrera.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Traer su historial de HYROX (lo más valioso del día uno)

    @ViewBuilder
    private var importCard: some View {
        if pastRaces.isEmpty {
            Button {
                Haptics.medium()
                showImport = true
            } label: {
                CardSurface(padding: 16, leftAccent: true) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .center, spacing: Theme.Spacing.s) {
                            Text("¿Ya has corrido un HYROX?")
                                .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 4)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundStyle(Theme.Color.accentText)
                        }
                        Text("Búscate por tu nombre y te traemos tus tiempos, estación por estación, en un toque.")
                            .scaledFont(12.5, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("¿Ya has corrido un HYROX? Búscate por tu nombre y traemos tus tiempos.")
            .accessibilityAddTraits(.isButton)
        }
    }

    // MARK: - Las tres de arranque (para quien no ha corrido nunca)

    private var starterMarks: [MarkView] {
        FreePlanCopy.starterSlugs.compactMap { slug in
            measurableMarks.first { $0.slug == slug }
        }
    }

    @ViewBuilder
    private var startersCard: some View {
        let steps = starterMarks
        if !steps.isEmpty {
            FreePlanStartersCard(steps: steps, bearer: bearer, hrMaxSource: hrMaxSource)
        } else if marksFailed {
            marksFailedCard
        }
    }

    /// The catalog lives server-side, so when it can't be read there is nothing
    /// honest to list — we say so and offer the retry instead of an empty card.
    private var marksFailedCard: some View {
        CardSurface(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("No pudimos cargar tus marcas.")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Revisa tu conexión e inténtalo de nuevo.")
                    .scaledFont(12.5, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                Button("Reintentar") {
                    Haptics.light()
                    Task { await loadMarks() }
                }
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.Color.accentText)
                .padding(.top, 2)
            }
        }
    }

    /// "Empezar por el 1 km" — the first door, only when the server catalog
    /// actually offers that mark.
    @ViewBuilder
    private var starterCTA: some View {
        if let first = starterMarks.first {
            NavigationLink {
                MarkDetailView(slug: first.slug, bearer: bearer, hrMaxSource: hrMaxSource)
            } label: {
                Text("Empezar por \(FreePlanCopy.ctaName(first))")
                    .font(.system(size: 16, weight: .heavy).italic())
                    .tracking(1)
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(Theme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
        }
    }

    private var freeNote: some View {
        Text("Tus marcas son tuyas. Sin cuenta de pago, sin tarjeta.")
            .scaledFont(11.5, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.faint)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Tus marcas (lo medido + lo que falta)

    @ViewBuilder
    private var marksCard: some View {
        if measurableMarks.isEmpty {
            // Evidence exists (an imported race) but the catalog didn't load.
            if marksFailed { marksFailedCard }
        } else {
            FreePlanMarksCard(
                measured: measuredMarks,
                missing: missingMarks,
                bearer: bearer,
                hrMaxSource: hrMaxSource
            )
        }
    }

    // MARK: - El cierre (la persona, no el paywall)

    /// The coach display name from the payload — NEVER hardcoded. Free athletes
    /// have no coach, so this is nil and the card stays generic.
    private var coachName: String? {
        let raw = planWeek?.coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (raw?.isEmpty == false) ? raw : nil
    }

    private var coachCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            CardSurface(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        CoachAvatar(initials: FreePlanCopy.initials(coachName), size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(coachName ?? "Entrena con un coach")
                                .scaledFont(15, weight: .heavy, relativeTo: .headline, italic: true)
                                .foregroundStyle(Theme.Color.foreground)
                                .lineLimit(1)
                            Text("Una llamada de 15 minutos")
                                .scaledFont(11.5, relativeTo: .caption2)
                                .foregroundStyle(Theme.Color.faint)
                        }
                        Spacer(minLength: 0)
                    }
                    Text("Estos números son tuyos y son gratis. Lo que cuesta es decidir qué hacer con ellos cada semana: eso lo hace un coach.")
                        .scaledFont(12.5, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            ExpertPrimaryButton(title: coachName.map { "Hablar con \(FreePlanCopy.firstName($0))" } ?? "Hablar con un coach") {
                // The membership funnel (lead → cita) already exists on the web;
                // iOS opens it in Safari, price-free, as the pre-auth welcome does.
                openURL(AppLinks.funnel)
            }
            Text("Sin compromiso · eliges tú el hueco")
                .scaledFont(11.5, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Countdown

    /// "en 9 semanas" / "en 5 días" / "mañana" / "es hoy" — derived from the
    /// server's `days_until`. Nil when the wire carries no countdown.
    private func countdownLabel(_ race: AthleteNextRace) -> String? {
        // Never negative: on or after race day the countdown reads "es hoy".
        guard let raw = race.daysUntil else { return nil }
        let days = max(0, raw)
        switch days {
        case 0: return "es hoy"
        case 1: return "mañana"
        case 2 ..< FreePlanCopy.weeksFromDays:
            return "en \(days) días"
        default:
            let weeks = Int((Double(days) / 7).rounded())
            return "en \(weeks) \(weeks == 1 ? "semana" : "semanas")"
        }
    }

    /// "a, b y c" — ES enumeration for the missing-marks line.
    private func naturalList(_ items: [String]) -> String {
        guard let last = items.last else { return "" }
        if items.count == 1 { return last }
        return items.dropLast().joined(separator: ", ") + " y " + last
    }

    // MARK: - Loading

    private func load(force: Bool = false) async {
        async let slices: Void = store.loadFreePlan(force: force)
        async let marks: Void = loadMarks()
        async let bio: Void = loadVO2()
        async let portrait: Void = loadPortrait()
        _ = await (slices, marks, bio, portrait)
    }

    /// The computed portrait. Silent on failure: every card it feeds is
    /// conditional, so a failed fetch degrades to the screen without them rather
    /// than to an error state over data the athlete never asked for.
    private func loadPortrait() async {
        freePlan = try? await FreePlanService.fetch(bearer: bearer)
    }

    private func loadMarks() async {
        do {
            marks = try await MarksService.fetchMarks(bearer: bearer).marks
            marksFailed = false
        } catch {
            marksFailed = true
        }
        marksLoaded = true
    }

    /// His watch VO₂max, when the backend actually has a recent series for it.
    /// Silent on failure — the card simply doesn't render.
    private func loadVO2() async {
        guard let bearer else { return }
        let trend = try? await BiometricTrendService.fetch(bearer: bearer)
        vo2 = trend?.metrics.first { $0.key == FreePlanCopy.vo2Key }
    }
}
