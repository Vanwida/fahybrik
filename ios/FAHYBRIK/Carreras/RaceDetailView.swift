import SwiftUI

// Race detail — the screen behind tapping a race card in PRÓXIMAS. It answers
// "where am I against THIS race?" with three honest variants:
//
//   • TARGET race (the soonest priority=='target', the one goal-gap describes):
//     the full picture — header, "Predicho hoy" hero, the "Camino al objetivo"
//     board (GoalGapBoard), and the freeze note. Live from GET /api/athlete/
//     goal-gap; routes on `availability` so a no-goal / no-data target degrades
//     to an honest empty state instead of a fake number.
//   • SECONDARY / tune-up: header + an honest card ("el predicho se calcula para
//     tu objetivo principal") and the make-primary action, reusing the hub's
//     existing promote flow. Promoting pops back so the list re-renders it as the
//     primary, and a second tap opens the full picture.
//   • NO GOAL (target but availability != ok): header + the availability message.
//
// Header, meta and countdown reuse the card's helpers (AthleteNextRace labels,
// the shared date formatter, `UpcomingRace.dayUnit`) so this screen and the card
// can never drift. All color/spacing via Theme tokens; the hero/readouts use the
// app's monospaced instrument voice. Brand accent is orange; signed deltas use
// the semantic ok/warning axis.
struct RaceDetailView: View {
    let race: UpcomingRace
    /// True when this race is the athlete's soonest target — the ONE the goal-gap
    /// endpoint is scoped to. Computed once by CarrerasView so the flag is the
    /// single source of truth for which variant renders.
    let isTargetRace: Bool
    var bearer: String? = nil
    /// Promote a secondary/tune-up race to primary (the hub owns the POST +
    /// refresh); we call it then pop so the list reflects the new primary.
    var onMakePrimary: () -> Void = {}

    @Environment(\.dismiss) private var dismiss

    @State private var gap: GoalGap? = nil
    @State private var loadingGap = true
    /// "Fija un tiempo objetivo" → the goal selector for THIS race.
    @State private var showGoalSheet = false

    private var effectiveBearer: String? { bearer }

    /// A doubles race gets the pair-scoped predicho (DoblesRaceGapSection) instead
    /// of the individual goal-gap: predicho conjunto + reparto editable + consejos.
    /// The endpoint is race-scoped (not target-scoped), so this holds for a target
    /// OR a secondary doubles race — the section itself gates on `availability`.
    private var isDoubles: Bool { race.format?.lowercased() == "doubles" }

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    navBar
                    headerBlock
                    content
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showGoalSheet) {
            FijarTiempoObjetivoSheet(race: race, bearer: effectiveBearer) {
                Task { await loadGap() }
            }
        }
        .task(id: effectiveBearer) {
            // A doubles race self-fetches inside DoblesRaceGapSection; only the
            // individual target race has a goal-gap to fetch here. Everything else
            // renders immediately from the race object.
            if isDoubles || !isTargetRace {
                loadingGap = false
            } else {
                await loadGap()
            }
        }
    }

    private func loadGap() async {
        loadingGap = true
        gap = await GoalGapService.fetchGoalGap(bearer: effectiveBearer)
        loadingGap = false
    }

    // MARK: - Nav + header

    private var navBar: some View {
        HStack(spacing: 12) {
            BackCircleButton { dismiss() }
            Spacer(minLength: 8)
        }
        .padding(.top, Theme.Spacing.s)
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            LabelText(text: eyebrowText, color: isTargetRace ? Theme.Color.accentText : Theme.Color.muted)
            Text(race.name)
                .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let meta = metaLine {
                Text(meta)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if hasChips { chipsRow }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(headerAccessibilityLabel)
    }

    private var chipsRow: some View {
        HStack(spacing: 8) {
            if let goal = goalChipText {
                chip(icon: "stopwatch", text: "Objetivo \(goal)", fg: Theme.Color.accentText, bg: Theme.Color.accent.opacity(0.12))
            }
            // For a doubles race the section draws the richer "DOBLES · CON X"
            // accent chip, so we drop the neutral format chip here (no duplicate).
            if !isDoubles, let fmt = AthleteNextRace.formatLabel(race.format) {
                chip(icon: nil, text: fmt, fg: Theme.Color.neutral, bg: Theme.Color.neutralTint)
            }
        }
    }

    /// The goal in RACE-CLOCK minutes ("60:00", "90:00") — the scale the whole
    /// goal-gap surface speaks in, so the chip sits on the same scale as the
    /// "Predicho hoy" hero ("61:42") beside it. Nil when no goal is set.
    private var goalChipText: String? {
        guard let g = race.goalTimeSeconds, g > 0 else { return nil }
        return GoalGapFormat.raceClock(g)
    }

    private func chip(icon: String?, text: String, fg: Color, bg: Color) -> some View {
        HStack(spacing: 5) {
            if let icon {
                Image(systemName: icon).font(.system(size: 10, weight: .bold))
            }
            Text(text).font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(bg)
        .clipShape(Capsule())
    }

    // MARK: - Content router

    @ViewBuilder
    private var content: some View {
        if isDoubles {
            // Pair-scoped predicho + reparto editable + consejos del coach. Fetches
            // GET /api/athlete/dobles/race-gap and routes on its own availability.
            DoblesRaceGapSection(raceId: String(race.raceId), bearer: effectiveBearer)
        } else if isTargetRace {
            targetContent
        } else {
            secondaryContent
        }
    }

    // Target: the full picture, gated on the live goal-gap availability.
    @ViewBuilder
    private var targetContent: some View {
        if loadingGap {
            ProgressView()
                .tint(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xl)
        } else if let gap, gap.isOK {
            predichoHoyCard(gap)
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SectionLabel(text: "CAMINO AL OBJETIVO")
                GoalGapBoard(gap: gap)
            }
            freezeCard
        } else if let gap {
            availabilityState(gap.availability)
        } else {
            errorState
        }
    }

    // Secondary / tune-up: honest — the predicho is computed for the PRIMARY
    // objective — plus the promote action (reuses the hub's existing flow).
    private var secondaryContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            CardSurface(padding: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    LabelText(text: "PREDICHO HOY")
                    Text("El predicho se calcula para tu objetivo principal.")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Haz de esta carrera tu objetivo principal y verás aquí tu predicho de hoy y el camino estación a estación.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
            ExpertPrimaryButton(title: "HACER OBJETIVO PRINCIPAL") {
                onMakePrimary()
                dismiss()
            }
        }
    }

    // MARK: - Predicho hoy (target hero)

    private func predichoHoyCard(_ gap: GoalGap) -> some View {
        CardSurface(padding: 16, elevated: true) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "PREDICHO HOY")
                // El sujeto de la tarjeta es el predicho. Cuando aún no lo hay se
                // dice QUÉ falta y CÓMO se llena — el atleta puede hacerlo, y por
                // eso se declara en vez de callarse (§6.2 bis). Lo que jamás se
                // pinta es un número de 40 pt que no existe.
                if let predicho = gap.predictedTotalS.map({ GoalGapFormat.raceClock($0) }) {
                    Text(predicho)
                        .font(.system(size: 40, weight: .heavy, design: .monospaced).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    gapPill(gap.gapS)
                } else {
                    Text("Todavía no podemos predecir tu tiempo.")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Entrena las estaciones o importa una carrera y el predicho aparece aquí, estación a estación.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let source = sourceLine(gap) {
                    Text(source)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(predichoAccessibilityLabel(gap))
        }
    }

    /// The signed total gap as a tinted pill: "+1:42 sobre el objetivo" (warning)
    /// when over, "−1:10 bajo el objetivo" (ok) when under, "justo en tu objetivo"
    /// at goal. Nothing when there's no gap to show.
    @ViewBuilder
    private func gapPill(_ gapS: Int?) -> some View {
        if let gapS {
            if gapS > 0 {
                pill("\(GoalGapFormat.signedDuration(gapS)) sobre el objetivo",
                     fg: Theme.Color.warning, bg: Theme.Color.warningTint)
            } else if gapS < 0 {
                pill("\(GoalGapFormat.signedDuration(gapS)) bajo el objetivo",
                     fg: Theme.Color.ok, bg: Theme.Color.okTint)
            } else {
                pill("Justo en tu objetivo", fg: Theme.Color.ok, bg: Theme.Color.okTint)
            }
        }
    }

    private func pill(_ text: String, fg: Color, bg: Color) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
            .foregroundStyle(fg)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(bg)
            .clipShape(Capsule())
    }

    /// "Presupuesto: cohorte de tu división · actualizado hoy 7:40" — how the
    /// per-segment budget was derived, and when the prediction last refreshed.
    private func sourceLine(_ gap: GoalGap) -> String? {
        var parts: [String] = []
        switch gap.budgetSource?.lowercased() {
        case "cohorte":    parts.append("Presupuesto: cohorte de tu división")
        case "tu_carrera": parts.append("Presupuesto: tu última carrera")
        default:           break
        }
        if let updated = updatedText(gap.updatedAt) {
            parts.append("actualizado \(updated)")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "hoy 7:40" / "ayer 7:40" / "el 8 mar" from an ISO timestamp. Nil when the
    /// wire carries no `updated_at` or it doesn't parse (never invents a time).
    private func updatedText(_ raw: String?) -> String? {
        guard let raw, let d = StatsDateParser.parse(raw) else { return nil }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "hoy \(Self.timeFmt.string(from: d))" }
        if cal.isDateInYesterday(d) { return "ayer \(Self.timeFmt.string(from: d))" }
        return "el \(StatsDateParser.dayMonth(d))"
    }

    private static let timeFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "H:mm"
        return f
    }()

    // MARK: - Freeze note (después de la carrera)

    private var freezeCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "DESPUÉS DE LA CARRERA")
                Text("Tu predicho se congela justo antes de la prueba. Cuando importes tu resultado, lo compararás con lo que hiciste de verdad —predicho vs real— para afinar la siguiente.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Empty + error states (target)

    @ViewBuilder
    private func availabilityState(_ availability: String) -> some View {
        switch availability.lowercased() {
        case "no_goal":
            // The happy path's dead end: this told the athlete to fix a goal time
            // and gave them nowhere to do it. The button opens the same goal
            // selector over this race's already-chosen format/division/category.
            RedesignEmptyState(
                symbol: "stopwatch",
                title: "Fija un tiempo objetivo",
                message: "Aún no has fijado a qué tiempo vas en esta carrera. Cuando elijas tu objetivo —sub-60, sub-70…— verás aquí tu predicho de hoy y el camino estación a estación.",
                exit: .action(title: "Elegir mi objetivo") { showGoalSheet = true }
            )
            .padding(.top, Theme.Spacing.m)
        default: // no_data / no_target_race / unknown → the honest invitation
            RedesignEmptyState(
                symbol: "chart.bar",
                title: "Aún no hay datos de tu entreno",
                message: "Registra prácticas de estación y entrenos y tu camino al objetivo aparece aquí —con tu nivel de hoy contra lo que pide tu meta.",
                // Nothing to press here: the data comes from training, not from a
                // button on this screen. Say so instead of leaving a dead end.
                exit: .explained(note: "Se llena solo: en cuanto entrenes estaciones o corras, el camino aparece aquí.")
            )
            .padding(.top, Theme.Spacing.m)
        }
    }

    private var errorState: some View {
        RedesignEmptyState(
            symbol: "arrow.clockwise",
            title: "No pudimos cargar tu predicho",
            message: "Revisa tu conexión e inténtalo de nuevo.",
            exit: .action(title: "Reintentar") { Task { await loadGap() } }
        )
        .padding(.top, Theme.Spacing.m)
    }

    // MARK: - Derived copy

    /// "OBJETIVO PRINCIPAL · FALTAN 239 DÍAS" — role + countdown. Role follows the
    /// single `isTargetRace` flag (never priority alone), so a non-soonest legacy
    /// target reads as "SECUNDARIA" and gets the secondary body, staying coherent.
    private var eyebrowText: String {
        let role: String
        if isTargetRace {
            role = "Objetivo principal"
        } else if race.priority?.lowercased() == "tune_up" {
            role = "Tune-up"
        } else {
            role = "Secundaria"
        }
        guard let days = countdownText else { return role }
        return "\(role) · \(days)"
    }

    /// "Faltan 239 días" / "Falta 1 día" / "Es hoy" — reuses the card's countdown
    /// (`UpcomingRace.countdownDays` + `dayUnit`), the single source for the count.
    private var countdownText: String? {
        guard let days = race.countdownDays else { return nil }
        if days == 0 { return "Es hoy" }
        return "Faltan \(days) \(UpcomingRace.dayUnit(days))"
    }

    /// "8 mar 2027 · Fira de Barcelona · Open · M30-34" — date · location ·
    /// division · age-group, each segment dropped when absent or unmapped.
    private var metaLine: String? {
        var parts: [String] = []
        if let date = formattedDate { parts.append(date) }
        if let loc = race.location, !loc.isEmpty { parts.append(loc) }
        if let div = AthleteNextRace.divisionLabel(race.division) { parts.append(div) }
        if let age = race.ageGroup, !age.isEmpty { parts.append(age) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var formattedDate: String? {
        race.raceDate
            .flatMap { StatsDateParser.parse($0) }
            .map { ImportedRaceDateFormat.medium.string(from: $0) }
    }

    private var hasChips: Bool {
        goalChipText != nil || (!isDoubles && AthleteNextRace.formatLabel(race.format) != nil)
    }

    private var headerAccessibilityLabel: String {
        var parts: [String] = [eyebrowText, race.name]
        if let meta = metaLine { parts.append(meta) }
        if let goal = goalChipText { parts.append("objetivo \(goal)") }
        return parts.joined(separator: ", ")
    }

    // VoiceOver lee lo mismo que se ve: sin predicho, la declaración entera.
    private func predichoAccessibilityLabel(_ gap: GoalGap) -> String {
        guard let predicho = gap.predictedTotalS.map({ GoalGapFormat.raceClock($0) }) else {
            return "Predicho hoy. Todavía no podemos predecir tu tiempo. Entrena las estaciones o importa una carrera y aparece aquí."
        }
        var parts = ["Predicho hoy \(predicho)"]
        if let g = gap.gapS {
            if g > 0 { parts.append("\(Formato.clock(Double(g))) sobre el objetivo") }
            else if g < 0 { parts.append("\(Formato.clock(Double(abs(g)))) bajo el objetivo") }
            else { parts.append("justo en tu objetivo") }
        }
        return parts.joined(separator: ", ")
    }
}
