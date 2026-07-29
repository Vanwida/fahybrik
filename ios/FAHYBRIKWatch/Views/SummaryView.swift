import SwiftUI

// Finish summary — the honest close: a check, total time, two headline tiles
// (rondas / bloques + FC media) and the "saved on the phone" note. A partial
// finish reads as such (never a fake 'completed'). The detail (graphs, zones) is
// the phone's job. "Listo" returns to the day's done state. Mockup 8 / 9.
struct SummaryView: View {
    let session: WorkoutSession
    /// #23 — owns the dobles share state (badge + "Compartir con {nombre}" toggle).
    let coordinator: WatchWorkoutCoordinator
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                header
                HStack(spacing: 7) {
                    MetricTile(label: leftTileLabel, value: leftTileValue)
                    MetricTile(label: Vocab.fcMedia, value: avgHR.map(String.init) ?? "—")
                }
                // #23 — dobles: badge + the share decision. The toggle appears ONLY
                // for a shareable (shared) dobles session; a self_only/individual
                // session shows neither and logs solo (never shared silently — #22).
                if coordinator.isDoublesResult {
                    DoublesBadge(text: "DOBLES · con \(partnerName)")
                }
                if coordinator.isDoublesShareable {
                    shareToggle
                }
                Text(saveNote)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                    .multilineTextAlignment(.center)
                Button("Listo") { onDone() }
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(WatchTheme.orangeSoft)
                    .buttonStyle(.plain)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(WatchTheme.bg.ignoresSafeArea())
    }

    private var partnerName: String { coordinator.partnerFirstNameResult ?? "tu compañero" }

    // The share decision, respecting self_only (this toggle only renders when the
    // session is shareable). ON → the result links + shares with the partner; OFF →
    // logs solo. Bound through the coordinator so it swaps the staged envelope.
    private var shareToggle: some View {
        Toggle(isOn: Binding(
            get: { coordinator.shareWithPartner },
            set: { coordinator.setShareWithPartner($0) }
        )) {
            Text("Compartir con \(partnerName)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .tint(WatchTheme.orange)
        .padding(.horizontal, 2)
    }

    // "Guardado en el iPhone", plus the share outcome so the athlete sees what will
    // reach the partner (only for a shareable dobles session).
    private var saveNote: String {
        guard coordinator.isDoublesShareable else { return "Guardado en el iPhone" }
        return coordinator.shareWithPartner
            ? "Se guarda y se comparte con \(partnerName)"
            : "Se guarda solo para ti"
    }

    private var header: some View {
        VStack(spacing: 5) {
            ZStack {
                Circle().fill(accentColor).frame(width: 34, height: 34)
                Image(systemName: isPartial ? "flag.checkered" : "checkmark")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(WatchTheme.greenOn)
            }
            WatchLabel(text: isPartial ? "Parcial" : "Completado", accent: true)
            GiantNumber(text: WatchFormat.clock(session.elapsedSeconds), size: 44)
        }
    }

    // MARK: - Derived

    private var isPartial: Bool { session.completeness == .partial }
    private var accentColor: Color { isPartial ? WatchTheme.zoneAmber : WatchTheme.zoneGreen }

    // Rondas when the format is round-scored; otherwise the honest count of blocks
    // the athlete moved through.
    private var leftTileLabel: String { session.capturedScoreRounds != nil ? "Rondas" : "Bloques" }
    private var leftTileValue: String {
        if let rounds = session.capturedScoreRounds { return "\(rounds)" }
        return "\(session.completedBlockCount)"
    }

    private var avgHR: Int? {
        let avgs = session.laps.compactMap(\.avgHRBpm)
        guard !avgs.isEmpty else { return nil }
        return avgs.reduce(0, +) / avgs.count
    }
}
