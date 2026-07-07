import SwiftUI

// "¿Cómo llegas?" — the readiness glance. One giant score colored by its recovery
// bucket (green ≥67 · amber ≥45 · red), the 7-day trend, and the single worst
// driver. No graphs (those live on the phone). Only shown when a real score
// exists; the pre-workout flow skips it otherwise (honest — no fake data). Mockup 1.
struct ReadinessGlanceView: View {
    let score: Int
    var delta7d: Int? = nil
    var worstDriver: String? = nil

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 4) {
                WatchLabel(text: "¿Cómo llegas?", accent: true)
                GiantNumber(text: "\(score)", size: 74, color: WatchTheme.readinessColor(score))
                Text(trendText)
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(WatchTheme.dim)
                if let driver = worstDriver, !driver.isEmpty {
                    driverCard(driver)
                        .padding(.top, 10)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    private func driverCard(_ driver: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            WatchLabel(text: "Peor driver")
                .font(.system(size: 9, weight: .heavy))
            Text(driver)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(WatchTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .background(WatchTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var trendText: String {
        guard let d = delta7d, d != 0 else { return "READINESS" }
        let arrow = d > 0 ? "▲" : "▼"
        let sign = d > 0 ? "+" : ""
        return "READINESS · \(arrow) \(sign)\(d)"
    }
}
