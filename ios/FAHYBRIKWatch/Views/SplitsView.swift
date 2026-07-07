import SwiftUI

// Post-finish splits — the segment/round times just logged, crown-scrollable, the
// fastest in orange. Reads the closed laps (the round splits themselves are torn
// down with the format engine on close, so per-lap time is the honest post-finish
// source). Structural warmup/cooldown laps are excluded. Mockup 7.
struct SplitsView: View {
    let session: WorkoutSession

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                StatusHeader(text: "Splits", color: WatchTheme.dim)
                    .padding(.bottom, 6)
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    splitRow(index: index + 1, title: row.title, seconds: row.seconds, isBest: row.isBest)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(WatchTheme.bg.ignoresSafeArea())
    }

    private func splitRow(index: Int, title: String, seconds: Double, isBest: Bool) -> some View {
        HStack(spacing: 8) {
            Text("R\(index)")
                .font(.system(size: 12, weight: .heavy).monospacedDigit())
                .foregroundStyle(WatchTheme.dim)
                .frame(width: 26, alignment: .leading)
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 4)
            Text(WatchFormat.clock(seconds))
                .font(.system(size: 13, weight: .heavy).monospacedDigit())
                .foregroundStyle(isBest ? WatchTheme.orangeSoft : WatchTheme.ink)
        }
        .padding(.vertical, 5)
        .overlay(alignment: .bottom) {
            Rectangle().fill(WatchTheme.surfaceRaised).frame(height: 1)
        }
    }

    // MARK: - Rows

    private struct Row { let title: String; let seconds: Double; let isBest: Bool }

    private var rows: [Row] {
        let laps = session.laps
            .filter { !$0.isStructural }
            .sorted { $0.position < $1.position }
        let best = laps.map(\.durationSeconds).min()
        return laps.map { lap in
            let title = session.plan.segments.first { $0.id == lap.segmentId }?.title ?? ""
            return Row(title: title, seconds: lap.durationSeconds, isBest: lap.durationSeconds == best && laps.count > 1)
        }
    }

    /// Whether there's enough to warrant a splits page (≥2 measured laps).
    static func hasSplits(_ session: WorkoutSession) -> Bool {
        session.laps.filter { !$0.isStructural }.count >= 2
    }
}
