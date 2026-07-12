import SwiftUI

// "Camino al objetivo" — the gap board (pure presentation). One row per race
// segment: your level TODAY against what the objective asks, segment by segment.
//
// Visual language (rev. 2 — Alex: "está todo naranja, el objetivo de otro color"):
//   • The bar is your PREDICTED time; the dashed INK tick is the objective's
//     budget — deliberately NOT an accent color so it reads against any fill.
//   • Fill color is SEMANTIC: green (ok) when the segment is at/under budget;
//     over budget = accent up to the tick + a DANGER (red) tail for the excess,
//     so an all-over day reads as "how much red", not a wall of orange.
//   • Fill OPACITY still encodes the evidence tier — solid = `observado`,
//     45% = `estimado`, empty + italic "sin datos" = nothing logged yet.
//   • The signed delta matches the tail: danger when over, green when under.
//
// The board renders ONLY the segments (legend · rows · footer). The hero total
// ("Predicho hoy") lives in `RaceDetailView` above it, so the number the athlete
// reads first isn't duplicated here. `GoalGap` decodes resiliently upstream
// (GoalGapService) — an unknown tier degrades to a neutral, visible fill rather
// than taking the payload down. Brand accent is orange as a STATE, never a row's
// identity (the label carries that).

// MARK: - Board (pure presentation)

struct GoalGapBoard: View {
    let gap: GoalGap

    /// Per-tier fill opacities + the track geometry — one source of truth so the
    /// legend swatches and the bars can never drift apart.
    private enum Vis {
        static let fillObservado: Double = 1.0   // real efforts → solid
        static let fillEstimado: Double = 0.45   // threshold pace → translucent
        static let fillUnknown: Double = 0.70     // a tier we haven't shipped copy for
        static let trackHeight: CGFloat = 14
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            legend
            VStack(alignment: .leading, spacing: 13) {
                ForEach(gap.segments) { segment in
                    segmentRow(segment)
                }
            }
            footer
        }
    }

    // Green = at/under budget · red tail = the excess · ink dashed = objetivo.
    private var legend: some View {
        HStack(spacing: 14) {
            legendKey(swatch: .fill(Theme.Color.ok), text: "dentro")
            legendKey(swatch: .fill(Theme.Color.danger), text: "te pasas")
            legendKey(swatch: .dashed, text: "objetivo")
        }
        .accessibilityHidden(true)
    }

    private enum LegendSwatch { case fill(Color), dashed }

    private func legendKey(swatch: LegendSwatch, text: String) -> some View {
        HStack(spacing: 5) {
            Group {
                switch swatch {
                case let .fill(color):
                    RoundedRectangle(cornerRadius: 2).fill(color)
                case .dashed:
                    RoundedRectangle(cornerRadius: 2)
                        .stroke(Theme.Color.foreground, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
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

    /// Tier → bar fill opacity. Unknown tiers stay visible (0.70) rather than
    /// echoing a raw token or vanishing — honest degradation.
    private func fillOpacity(_ segment: GoalGapSegment) -> Double {
        switch segment.tier.lowercased() {
        case "observado": return Vis.fillObservado
        case "estimado":  return Vis.fillEstimado
        default:          return Vis.fillUnknown
        }
    }

    // A run leg / work station: name · (delta + predicted time) · the bar with a
    // tier-opacity fill and the objective's dashed budget tick.
    private func standardRow(_ segment: GoalGapSegment) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(segment.labelEs)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    deltaText(segment.deltaS)
                    Text(durationText(segment.predictedS))
                        .font(.system(size: 13, weight: .medium, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
            GapTrack(
                predicted: segment.predictedS,
                budget: segment.budgetS,
                fillOpacity: fillOpacity(segment)
            )
            .frame(height: Vis.trackHeight)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(segment))
    }

    /// Signed segment delta: danger (red) when over budget — matching the bar's
    /// excess tail — green when under, nothing at exactly on-budget (or absent).
    /// Real minus (U+2212) via the shared formatter so it matches every other
    /// signed delta in the app.
    @ViewBuilder
    private func deltaText(_ deltaS: Int?) -> some View {
        if let deltaS, deltaS != 0 {
            Text(GoalGapFormat.signedDuration(deltaS))
                .font(.system(size: 11.5, weight: .semibold, design: .monospaced).monospacedDigit())
                .foregroundStyle(deltaS > 0 ? Theme.Color.danger : Theme.Color.ok)
        }
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

    // No data yet — the row still holds its place: name, an italic "sin datos",
    // and an EMPTY track (the objective's tick still shows if it has a budget).
    private func gatedRow(_ segment: GoalGapSegment) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(segment.labelEs)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
                Text("sin datos")
                    .font(.system(size: 12, weight: .medium).italic())
                    .foregroundStyle(Theme.Color.muted)
            }
            GapTrack(predicted: nil, budget: segment.budgetS, fillOpacity: 0)
                .frame(height: Vis.trackHeight)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(segment.labelEs), sin datos todavía. Registra una práctica de estación y aparece aquí.")
    }

    // MARK: - Footer

    private var footer: some View {
        Text("La barra es tu predicho de hoy; la marca punteada, lo que pide tu objetivo, y el tramo rojo, lo que hoy te sobra. Sólido = observado en esfuerzos reales; translúcido = estimado por tu ritmo umbral.")
            .font(.system(size: 11.5))
            .foregroundStyle(Theme.Color.faint)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Helpers

    /// "—" when the value is absent (never a fabricated time), else the race
    /// clock in running minutes ("63:45") — the sub-X frame speaks in minutes.
    private func durationText(_ seconds: Int?) -> String {
        guard let seconds else { return "—" }
        return GoalGapFormat.raceClock(seconds)
    }

    private func rowAccessibilityLabel(_ segment: GoalGapSegment) -> String {
        var parts = [segment.labelEs]
        if let tier = segment.tierLabel { parts.append(tier) }
        parts.append(durationText(segment.predictedS))
        if let d = segment.deltaS, d != 0 {
            parts.append(d > 0
                ? "faltan \(StatsFormat.duration(Double(d)))"
                : "\(StatsFormat.duration(Double(abs(d)))) por delante")
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Gap track (tier-opacity fill + dashed budget tick)

/// The per-segment bar, SEMANTIC by state (rev. 2): at/under budget → one green
/// fill (you're inside the objective); over budget → accent fill up to the tick
/// plus a DANGER tail for the excess, so "how over am I" is literally the amount
/// of red. Fill OPACITY still encodes the evidence tier. The dashed tick is INK
/// (foreground) — the objective must contrast against every fill. Scaled to the
/// LARGER of predicted/budget so a 31-minute run and a 3-minute station each read
/// within their own row. A `sin_datos` segment (predicted nil, opacity 0) draws
/// no fill — just the empty track and, if it has a budget, the tick.
private struct GapTrack: View {
    /// Over budget must ALWAYS show some red: the accent "earned" stretch is clamped
    /// to leave at least this much danger tail, so a slight overage (predicted only
    /// just past the tick) never vanishes under the accent painted on top.
    private static let minOverageTail: CGFloat = 6

    let predicted: Int?
    let budget: Int?
    let fillOpacity: Double

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let maxVal = max(predicted ?? 0, budget ?? 0)
            let targetFrac: Double? = (budget != nil && maxVal > 0)
                ? Double(budget!) / Double(maxVal)
                : nil

            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(Theme.Color.surfaceSunken)
                if let predicted, maxVal > 0, fillOpacity > 0 {
                    let fillFrac = Double(predicted) / Double(maxVal)
                    let fillWidth = max(6, w * CGFloat(fillFrac))
                    if let budget, predicted > budget {
                        // Over budget: the excess tail first (full predicted width,
                        // danger), then the earned stretch up to the tick (accent)
                        // painted on top — the red that remains IS the overage. The
                        // accent is clamped to leave at least `minOverageTail`, so a
                        // slight overage keeps a visible red tail (never inverted /
                        // never negative — `max(0,…)` guards a degenerate track).
                        let earned = max(6, w * CGFloat(targetFrac ?? 0))
                        let accentWidth = min(earned, max(0, fillWidth - Self.minOverageTail))
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Theme.Color.danger.opacity(fillOpacity))
                            .frame(width: fillWidth)
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Theme.Color.accent.opacity(fillOpacity))
                            .frame(width: accentWidth)
                    } else {
                        // At or under budget: the whole segment is inside the
                        // objective → green, headroom stays sunken.
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Theme.Color.ok.opacity(fillOpacity))
                            .frame(width: fillWidth)
                    }
                }
                if let targetFrac {
                    // 20pt tall over a 14pt track → the ZStack centers it with a
                    // symmetric 3pt overhang top and bottom. Ink, not muted: the
                    // objective mark must survive on top of any fill color.
                    VLine()
                        .stroke(Theme.Color.foreground, style: StrokeStyle(lineWidth: 2, dash: [3, 2]))
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
