import SwiftUI

// Pantalla C — "Predicho vs real". After a simulation or an imported race with a
// PRIOR prediction snapshot, this compares what we predicted against what the
// athlete actually did: the two totals, a precision read ("a 0,7% — afinando"),
// the per-station table (Δ green when faster than predicted, orange when
// slower), and the typed coach insight. That difference recalibrates the
// prediction AND tells the coach where to press — the loop closing on itself.
//
// `PredichoVsRealView` is the LIVE fetch wrapper (GET /api/athlete/
// prediction-review?race_id=…, or a simulation's execution_id). It renders
// NOTHING until it confirms a snapshot exists (availability == ok) — no empty
// state here, by design: without a prior prediction there is nothing to review.
// `PredictionReviewCard` is the pure presentation (previewable in isolation).
struct PredichoVsRealView: View {
    /// The race (or execution) to review — passed straight to the query.
    let raceId: String
    var bearer: String? = nil

    @State private var review: PredictionReview? = nil

    var body: some View {
        Group {
            if let review, review.isOK {
                PredictionReviewCard(review: review)
            } else {
                EmptyView()
            }
        }
        .task(id: raceId) {
            review = await GoalGapService.fetchPredictionReview(raceId: raceId, bearer: bearer)
        }
    }
}

// MARK: - Card (pure presentation)

struct PredictionReviewCard: View {
    let review: PredictionReview

    private let numColumn: CGFloat = 52

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: "PREDICHO VS REAL", color: Theme.Color.accentText)
                if let sub = subtitle {
                    Text(sub)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            totals
            table
            if let insight = review.insightEs, !insight.isEmpty {
                insightCard(insight)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
        .brandShadow(Theme.Shadow.cardTight)
    }

    // Predijimos / Hiciste, side by side, with the precision read below.
    private var totals: some View {
        VStack(spacing: 8) {
            HStack(spacing: Theme.Spacing.xl) {
                totalColumn(label: "PREDIJIMOS", value: durationText(review.predictedTotalS))
                totalColumn(label: "HICISTE", value: durationText(review.actualTotalS))
            }
            if let acc = accuracyText {
                Text(acc)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.Color.ok)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(totalsAccessibilityLabel)
    }

    private func totalColumn(label: String, value: String) -> some View {
        VStack(spacing: 3) {
            LabelText(text: label, size: 10)
            Text(value)
                .font(.system(size: 26, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    // MARK: - Table

    private var table: some View {
        VStack(spacing: 0) {
            headerRow
            ForEach(review.segments) { row in
                Rectangle().fill(Theme.Color.hairline).frame(height: 1)
                dataRow(row)
            }
        }
    }

    private var headerRow: some View {
        HStack(spacing: 8) {
            columnLabel("ESTACIÓN", alignment: .leading, flexible: true)
            columnLabel("PRED.", alignment: .trailing)
            columnLabel("REAL", alignment: .trailing)
            columnLabel("Δ", alignment: .trailing)
        }
        .padding(.vertical, 6)
    }

    private func columnLabel(_ text: String, alignment: Alignment, flexible: Bool = false) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.muted)
            .frame(maxWidth: flexible ? .infinity : numColumn, alignment: alignment)
    }

    private func dataRow(_ row: PredictionReviewRow) -> some View {
        HStack(spacing: 8) {
            Text(row.labelEs)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
            numCell(durationText(row.predictedS), color: Theme.Color.foreground)
            numCell(durationText(row.actualS), color: Theme.Color.foreground)
            deltaCell(row.deltaS)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(row))
    }

    private func numCell(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium, design: .monospaced).monospacedDigit())
            .foregroundStyle(color)
            .frame(width: numColumn, alignment: .trailing)
    }

    /// Δ = actual − predicted: green when faster than predicted, orange when
    /// slower, muted at zero. Never a fabricated value when the delta is absent.
    private func deltaCell(_ deltaS: Int?) -> some View {
        let text = deltaS.map { GoalGapFormat.signedDuration($0) } ?? "—"
        let color: Color = {
            guard let deltaS else { return Theme.Color.muted }
            if deltaS < 0 { return Theme.Color.ok }
            if deltaS > 0 { return Theme.Color.accentText }
            return Theme.Color.muted
        }()
        return Text(text)
            .font(.system(size: 13, weight: .semibold, design: .monospaced).monospacedDigit())
            .foregroundStyle(color)
            .frame(width: numColumn, alignment: .trailing)
    }

    // MARK: - Insight

    private func insightCard(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.Color.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .accessibilityLabel(text)
    }

    // MARK: - Helpers

    // Race-clock minutes ("63:45") — same scale as the sub-X goal frame.
    private func durationText(_ seconds: Int?) -> String {
        guard let seconds else { return "—" }
        return GoalGapFormat.raceClock(seconds)
    }

    private var accuracyText: String? {
        guard let pct = review.accuracyPct else { return nil }
        var text = "Predicción a \(GoalGapFormat.precisionPercent(pct))"
        if let label = review.accuracyLabelEs, !label.isEmpty {
            text += " — \(label)"
        }
        return text
    }

    private var subtitle: String? {
        let date = review.raceDate
            .flatMap { StatsDateParser.parse($0) }
            .map { ImportedRaceDateFormat.medium.string(from: $0) }
        let parts = [review.raceName, date].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var totalsAccessibilityLabel: String {
        var parts = ["Predijimos \(durationText(review.predictedTotalS))",
                     "hiciste \(durationText(review.actualTotalS))"]
        if let acc = accuracyText { parts.append(acc) }
        return parts.joined(separator: ", ")
    }

    private func rowAccessibilityLabel(_ row: PredictionReviewRow) -> String {
        var parts = [row.labelEs,
                     "predicho \(durationText(row.predictedS))",
                     "real \(durationText(row.actualS))"]
        if let d = row.deltaS {
            parts.append(d <= 0 ? "\(StatsFormat.duration(Double(abs(d)))) más rápido" : "\(StatsFormat.duration(Double(d))) más lento")
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Preview (contract-exact sample — mirrors mockup Pantalla C)

#if DEBUG
#Preview("Predicho vs real") {
    ScrollView {
        PredictionReviewCard(review: PredictionReview.previewSample)
            .padding(20)
    }
    .background(Theme.Color.background)
}

extension PredictionReview {
    /// The mockup's numbers, decoded through the REAL wire path so the preview
    /// exercises the exact snake_case contract the endpoint ships.
    static let previewSample: PredictionReview = {
        let json = """
        {
          "availability": "ok",
          "predicted_total_s": 3825,
          "actual_total_s": 3852,
          "accuracy_pct": 0.7,
          "accuracy_label_es": "afinando",
          "race_name": "Simulación HYROX",
          "race_date": "2026-08-24",
          "segments": [
            { "slug": "run", "label_es": "Carrera · 8 km", "predicted_s": 1890, "actual_s": 1872, "delta_s": -18 },
            { "slug": "ski", "label_es": "SkiErg", "predicted_s": 232, "actual_s": 238, "delta_s": 6 },
            { "slug": "sled_push", "label_es": "Sled Push", "predicted_s": 174, "actual_s": 191, "delta_s": 17 },
            { "slug": "wall_balls", "label_es": "Wall Balls", "predicted_s": 327, "actual_s": 319, "delta_s": -8 }
          ],
          "insight_es": "El sled push pierde más de lo esperado bajo fatiga. Eso recalibra tu predicción y le dice al coach dónde apretar las próximas semanas."
        }
        """.data(using: .utf8)!
        return try! APIClient.makeJSONDecoder().decode(PredictionReview.self, from: json)
    }()
}
#endif
