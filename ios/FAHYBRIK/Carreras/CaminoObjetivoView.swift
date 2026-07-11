import SwiftUI

// Pantalla B — "Camino al objetivo" (gap board). Your level TODAY, segment by
// segment, against what the objective asks — in the exact visual language of the
// landing chart: an off-white bar = you're at level, ORANGE = where you fall
// short ("falta"), a dashed tick = what the objective demands.
//
// `CaminoObjetivoView` is the LIVE fetch shell (GET /api/athlete/goal-gap,
// fetched on appear like the other Carreras deep-dives — no store slice). It
// routes on `availability` to honest empty states or the board. `GoalGapBoard`
// is the pure presentation (previewable in isolation). Every number carries its
// evidence tier (observado / estimado); a segment with no data yet says so — a
// dotted "puerta" with an invitation, never a vague number. Brand accent is
// orange as a STATE ("falta"), never a row's identity (the label carries that).
struct CaminoObjetivoView: View {
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var gap: GoalGap? = nil
    @State private var loading = true
    @State private var showBuscar = false

    private var effectiveBearer: String? { bearer }

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    headerRow
                    content
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationBarHidden(true)
        .task(id: effectiveBearer) { await load() }
        .sheet(isPresented: $showBuscar) {
            BuscarCarreraSheet(bearer: effectiveBearer) {
                Task { await load() }
            }
        }
    }

    private func load() async {
        loading = true
        gap = await GoalGapService.fetchGoalGap(bearer: effectiveBearer)
        loading = false
    }

    // MARK: - Header

    private var headerRow: some View {
        HStack(spacing: 12) {
            BackCircleButton { dismiss() }
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: "CAMINO AL OBJETIVO", color: Theme.Color.accentText)
                Text(gap?.goal?.label ?? "Tu objetivo")
                    .scaledFont(23, weight: .heavy, relativeTo: .title2, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
        }
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Content router

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .tint(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xl)
        } else if let gap, gap.isOK {
            GoalGapBoard(gap: gap)
        } else if let gap {
            emptyState(for: gap.availability)
        } else {
            errorState
        }
    }

    // MARK: - Empty + error states

    @ViewBuilder
    private func emptyState(for availability: String) -> some View {
        switch availability.lowercased() {
        case "no_target_race":
            VStack(spacing: Theme.Spacing.l) {
                RedesignEmptyState(
                    symbol: "target",
                    title: "Sin carrera objetivo",
                    message: "Fija tu próxima carrera y verás aquí lo que te separa de tu objetivo, estación a estación."
                )
                ExpertPrimaryButton(title: "BUSCAR CARRERA") { showBuscar = true }
            }
            .padding(.top, Theme.Spacing.m)
        case "no_goal":
            VStack(spacing: Theme.Spacing.l) {
                RedesignEmptyState(
                    symbol: "stopwatch",
                    title: "Fija un tiempo objetivo",
                    message: "Elige a qué vas —sub-60, sub-70…— y te mostramos el camino estación a estación."
                )
                ExpertPrimaryButton(title: "FIJAR OBJETIVO") { showBuscar = true }
            }
            .padding(.top, Theme.Spacing.m)
        default: // no_data (or an unknown availability → the honest invitation)
            RedesignEmptyState(
                symbol: "chart.bar",
                title: "Aún no hay datos de tu entreno",
                message: "Registra prácticas de estación y entrenos y tu camino al objetivo aparece aquí — con tu nivel de hoy contra lo que pide tu meta."
            )
            .padding(.top, Theme.Spacing.m)
        }
    }

    private var errorState: some View {
        VStack(spacing: Theme.Spacing.l) {
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar tu camino",
                message: "Revisa tu conexión e inténtalo de nuevo."
            )
            ExpertPrimaryButton(title: "REINTENTAR") { Task { await load() } }
        }
        .padding(.top, Theme.Spacing.m)
    }
}

// MARK: - Board (pure presentation)

struct GoalGapBoard: View {
    let gap: GoalGap

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            totalCard
            legend
            VStack(alignment: .leading, spacing: 13) {
                ForEach(gap.segments) { segment in
                    segmentRow(segment)
                }
            }
            footer
        }
    }

    // "Hoy irías a X · Objetivo Y · te faltan Z" — the hero of the board.
    private var totalCard: some View {
        CardSurface(padding: 15, elevated: true) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "HOY IRÍAS A", size: 10)
                    Text(durationText(gap.predictedTotalS))
                        .font(.system(size: 30, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 4) {
                    LabelText(text: "OBJETIVO \(durationText(gap.goal?.totalS))", size: 10)
                    gapLine(gap.gapS)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(totalAccessibilityLabel)
        }
    }

    /// The signed total gap: "te faltan 3:45" (orange, behind), "vas 1:10 por
    /// delante" (green, ahead) or "justo en tu objetivo" (at goal).
    @ViewBuilder
    private func gapLine(_ gapS: Int?) -> some View {
        if let gapS {
            if gapS > 0 {
                Text("te faltan \(StatsFormat.duration(Double(gapS)))")
                    .font(.system(size: 15, weight: .heavy, design: .default).monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
            } else if gapS < 0 {
                Text("vas \(StatsFormat.duration(Double(abs(gapS)))) por delante")
                    .font(.system(size: 13, weight: .bold, design: .default).monospacedDigit())
                    .foregroundStyle(Theme.Color.ok)
            } else {
                Text("justo en tu objetivo")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.ok)
            }
        }
    }

    // Off-white = a nivel · orange = falta · dashed = lo que pide el objetivo.
    private var legend: some View {
        HStack(spacing: 14) {
            legendKey(swatch: .solid(Theme.Color.foreground), text: "a nivel")
            legendKey(swatch: .solid(Theme.Color.accent), text: "falta")
            legendKey(swatch: .dashed, text: "lo que pide")
        }
        .accessibilityHidden(true)
    }

    private enum LegendSwatch { case solid(Color), dashed }

    private func legendKey(swatch: LegendSwatch, text: String) -> some View {
        HStack(spacing: 5) {
            Group {
                switch swatch {
                case let .solid(color):
                    RoundedRectangle(cornerRadius: 2).fill(color)
                case .dashed:
                    RoundedRectangle(cornerRadius: 2)
                        .stroke(Theme.Color.muted, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                }
            }
            .frame(width: 14, height: 8)
            Text(text)
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
        }
    }

    // MARK: - Segment rows

    @ViewBuilder
    private func segmentRow(_ segment: GoalGapSegment) -> some View {
        if segment.isSinDatos {
            gatedRow(segment)
        } else if segment.isRoxzone {
            roxzoneRow(segment)
        } else {
            standardRow(segment)
        }
    }

    // A run leg / work station: name + tier chip, delta + time, bar with fill and
    // the objective's dashed budget tick.
    private func standardRow(_ segment: GoalGapSegment) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 6) {
                    Text(segment.labelEs)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    if let tier = segment.tierLabel {
                        tierChip(tier)
                    }
                }
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    if segment.isOver, let deltaS = segment.deltaS, deltaS > 0 {
                        Text(GoalGapFormat.signedDuration(deltaS))
                            .font(.system(size: 11.5, weight: .semibold, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    Text(durationText(segment.predictedS))
                        .font(.system(size: 13, weight: .medium, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
            GapTrack(predicted: segment.predictedS, budget: segment.budgetS, over: segment.isOver)
                .frame(height: 14)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(segment))
    }

    // RoxZone — the transitions. Muted + compact so the totals close without
    // competing with the stations you actually train to beat.
    private func roxzoneRow(_ segment: GoalGapSegment) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(segment.labelEs)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.faint)
            Spacer(minLength: 8)
            Text(durationText(segment.predictedS))
                .font(.system(size: 12, weight: .medium, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(segment.labelEs), \(durationText(segment.predictedS))")
    }

    // No data yet — a dotted "puerta" with the honest invitation.
    private func gatedRow(_ segment: GoalGapSegment) -> some View {
        HStack(alignment: .top, spacing: 0) {
            Text(segment.labelEs)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
            Text("  — sin datos todavía. Registra una práctica de estación y aparece aquí.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(segment.labelEs), sin datos todavía. Registra una práctica de estación y aparece aquí.")
    }

    private func tierChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 8.5, weight: .heavy))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let sourceNote = budgetSourceNote(gap.budgetSource) {
                Text(sourceNote)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("Predicción desde tu entreno con contexto (fresco vs. con fatiga). «Estimado» = de tu ritmo umbral; «observado» = de esfuerzos reales.")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Theme.Spacing.xs)
    }

    private func budgetSourceNote(_ source: String?) -> String? {
        switch source?.lowercased() {
        case "cohorte":
            return "El objetivo se reparte por estación según cómo la corren los atletas reales de tu división — no un promedio inventado."
        case "tu_carrera":
            return "El objetivo se reparte por estación según cómo repartiste tu propia carrera."
        default:
            return nil
        }
    }

    // MARK: - Helpers

    /// "—" when the value is absent (never a fabricated time), else the race
    /// clock in running minutes ("63:45") — the sub-X frame speaks in minutes.
    private func durationText(_ seconds: Int?) -> String {
        guard let seconds else { return "—" }
        return GoalGapFormat.raceClock(seconds)
    }

    private var totalAccessibilityLabel: String {
        var parts = ["Hoy irías a \(durationText(gap.predictedTotalS))",
                     "objetivo \(durationText(gap.goal?.totalS))"]
        if let g = gap.gapS {
            if g > 0 { parts.append("te faltan \(StatsFormat.duration(Double(g)))") }
            else if g < 0 { parts.append("vas \(StatsFormat.duration(Double(abs(g)))) por delante") }
            else { parts.append("justo en tu objetivo") }
        }
        return parts.joined(separator: ", ")
    }

    private func rowAccessibilityLabel(_ segment: GoalGapSegment) -> String {
        var parts = [segment.labelEs]
        if let tier = segment.tierLabel { parts.append(tier) }
        parts.append(durationText(segment.predictedS))
        if segment.isOver, let d = segment.deltaS, d > 0 {
            parts.append("faltan \(StatsFormat.duration(Double(d)))")
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Gap track (fill + dashed budget tick)

/// The per-segment bar: an off-white (at level) or orange (over budget) fill on a
/// sunken track, with a dashed vertical tick at the objective's budget. Both are
/// scaled to the LARGER of predicted/budget so a 31-minute run and a 3-minute
/// station each read within their own row (never on one impossible shared scale).
private struct GapTrack: View {
    let predicted: Int?
    let budget: Int?
    let over: Bool

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let maxVal = max(predicted ?? 0, budget ?? 0)
            let fillFrac = maxVal > 0 ? Double(predicted ?? 0) / Double(maxVal) : 0
            let targetFrac: Double? = (budget != nil && maxVal > 0)
                ? Double(budget!) / Double(maxVal)
                : nil

            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(Theme.Color.surfaceSunken)
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(over ? Theme.Color.accent : Theme.Color.foreground)
                    .frame(width: max(6, w * CGFloat(fillFrac)))
                if let targetFrac {
                    // 20pt tall over a 14pt track → the ZStack centers it with a
                    // symmetric 3pt overhang top and bottom (the mockup's tick).
                    VLine()
                        .stroke(Theme.Color.muted, style: StrokeStyle(lineWidth: 2, dash: [3, 2]))
                        .frame(width: 2, height: 20)
                        .offset(x: w * CGFloat(targetFrac) - 1)
                }
            }
        }
    }
}

/// A vertical line down the middle of its rect — the dashed budget tick.
private struct VLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        return p
    }
}

// MARK: - Preview (contract-exact sample — mirrors mockup Pantalla B)

#if DEBUG
#Preview("Camino al objetivo") {
    ScrollView {
        GoalGapBoard(gap: GoalGap.previewSample)
            .padding(20)
    }
    .background(Theme.Color.background)
}

extension GoalGap {
    /// The mockup's numbers, decoded through the REAL wire path so the preview
    /// exercises the exact snake_case contract the endpoint ships (incl. the
    /// roxzone row and a sin_datos gated row).
    static let previewSample: GoalGap = {
        let json = """
        {
          "availability": "ok",
          "goal": { "label": "Sub-60", "total_s": 3600, "race_name": "HYROX Barcelona", "race_date": "2026-10-12" },
          "predicted_total_s": 3825,
          "gap_s": 225,
          "budget_source": "cohorte",
          "updated_at": "2026-07-11T09:00:00Z",
          "segments": [
            { "slug": "run", "label_es": "Carrera · 8 km", "kind": "run", "budget_s": 1800, "predicted_s": 1890, "tier": "observado", "delta_s": 90 },
            { "slug": "ski", "label_es": "SkiErg", "kind": "station", "budget_s": 240, "predicted_s": 232, "tier": "estimado", "delta_s": -8 },
            { "slug": "sled_push", "label_es": "Sled Push", "kind": "station", "budget_s": 150, "predicted_s": 174, "tier": "observado", "delta_s": 24 },
            { "slug": "row", "label_es": "Row", "kind": "station", "budget_s": 260, "predicted_s": 250, "tier": "estimado", "delta_s": -10 },
            { "slug": "wall_balls", "label_es": "Wall Balls", "kind": "station", "budget_s": 300, "predicted_s": 327, "tier": "observado", "delta_s": 27 },
            { "slug": "roxzone", "label_es": "RoxZone", "kind": "roxzone", "budget_s": 360, "predicted_s": 372, "tier": "estimado", "delta_s": 12 },
            { "slug": "farmers_carry", "label_es": "Farmers Carry", "kind": "station", "budget_s": null, "predicted_s": null, "tier": "sin_datos", "delta_s": null }
          ]
        }
        """.data(using: .utf8)!
        return try! APIClient.makeJSONDecoder().decode(GoalGap.self, from: json)
    }()
}
#endif
