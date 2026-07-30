import SwiftUI

// FIXED family — the whole round is shown and repeated; the screen never advances
// on its own. AMRAP counts a window DOWN with a "+ Ronda" target; For Time /
// Chipper / Ladder / Rounds count UP with "Ronda hecha"; a HYROX sim walks its
// station list with a run↔station transition interstitial between marks.
// Mockups 4b, 4c, and the SIM strip.
struct FixedLiveView: View {
    let session: WorkoutSession

    @State private var transitionKey: Int? = nil

    var body: some View {
        content
            .overlay { transitionOverlay }
            .onChange(of: session.fixedRoundsDone) { _, newValue in
                guard isHyroxSim, newValue > 0, newValue < session.fixedListTotal else { return }
                transitionKey = newValue
                WatchHaptics.transition()
            }
    }

    @ViewBuilder
    private var content: some View {
        if session.isCondCountIn {
            LiveScaffold(status: statusText) {
                VStack(spacing: 6) {
                    WatchLabel(text: "Prepárate")
                    GiantNumber(text: WatchFormat.countdown(session.condCountInRemaining), size: 84, color: WatchTheme.orange)
                }
            }
        } else if session.currentSegment?.formatScheme == .amrap {
            amrap
        } else if isHyroxSim {
            hyroxSim
        } else {
            forTime
        }
    }

    // MARK: - AMRAP (window counts down, tap "+ Ronda")

    private var amrap: some View {
        LiveScaffold(status: statusText) {
            VStack(spacing: 4) {
                WatchLabel(text: "Queda")
                GiantNumber(text: WatchFormat.countdown(session.condRemaining), size: 64, color: countdownColor(session.condRemaining))
                HStack(spacing: 6) {
                    WatchLabel(text: "Rondas")
                    Text("\(session.fixedRoundsDone)")
                        .font(.system(size: 22, weight: .heavy).monospacedDigit())
                        .foregroundStyle(WatchTheme.ink)
                }
                .padding(.top, 2)
                HStack {
                    HRPill(bpm: session.liveHRBpm, zoneColor: hrZoneColor)
                    Spacer()
                }
            }
        } bottom: {
            BigTapButton(title: "+ Ronda", systemImage: "plus", kind: .green) {
                session.bumpAmrapRound()
            }
        }
    }

    // MARK: - For Time / Chipper / Ladder / Rounds (count up, "Ronda hecha")

    private var forTime: some View {
        LiveScaffold(status: statusText) {
            VStack(spacing: 4) {
                WatchLabel(text: "Tiempo")
                GiantNumber(text: WatchFormat.clock(session.condElapsed), size: 62)
                HStack(spacing: 5) {
                    Text("Ronda \(min(session.fixedRoundsDone + 1, session.fixedListTotal))")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(WatchTheme.orangeSoft)
                    Text("/ \(session.fixedListTotal)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(WatchTheme.dim)
                }
                .padding(.top, 2)
                HStack {
                    HRPill(bpm: session.liveHRBpm, zoneColor: hrZoneColor)
                    Spacer()
                }
            }
        } bottom: {
            BigTapButton(title: "Ronda hecha", kind: .green) { session.markRoundDone() }
        }
    }

    // MARK: - HYROX sim (station list, run↔station hand-offs)

    private var hyroxSim: some View {
        LiveScaffold(status: hyroxStatus) {
            VStack(spacing: 4) {
                if let comp = currentComponent {
                    WatchLabel(text: "Ahora")
                    Text(comp.name)
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(WatchTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if let work = comp.work {
                        Text(work)
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(WatchTheme.orangeSoft)
                            .lineLimit(1)
                    }
                }
                GiantNumber(text: WatchFormat.clock(session.condElapsed), size: 40)
                    .padding(.top, 2)
                HStack {
                    HRPill(bpm: session.liveHRBpm, zoneColor: hrZoneColor)
                    Spacer()
                    Text("\(session.fixedRoundsDone) / \(session.fixedListTotal)")
                        .font(.system(size: 11, weight: .heavy).monospacedDigit())
                        .foregroundStyle(WatchTheme.dim)
                }
            }
        } bottom: {
            BigTapButton(title: "Hecho ▸", kind: .green) { session.markRoundDone() }
        }
    }

    // MARK: - Transition interstitial

    @ViewBuilder
    private var transitionOverlay: some View {
        if let key = transitionKey, let comp = component(at: key) {
            TransitionScreen(
                eyebrow: "Entras a",
                title: comp.name,
                subtitle: comp.work,
                footer: "RUN ▸ ESTACIÓN",
                onTap: { transitionKey = nil }
            )
            .task(id: key) {
                try? await Task.sleep(nanoseconds: UInt64(WatchTheme.transitionDwell * 1_000_000_000))
                if transitionKey == key { transitionKey = nil }
            }
        }
    }

    // MARK: - Derived

    private var isHyroxSim: Bool { session.currentSegment?.formatScheme == .hyroxSim }

    private var currentComponent: WorkComponent? {
        component(at: session.fixedRoundsDone)
    }

    private func component(at index: Int) -> WorkComponent? {
        let comps = session.currentSegment?.components ?? []
        guard !comps.isEmpty else { return nil }
        return comps[min(max(0, index), comps.count - 1)]
    }

    private var statusText: String {
        guard let seg = session.currentSegment, let scheme = seg.formatScheme else { return "" }
        if scheme == .amrap, let total = seg.formatTotalSeconds {
            return "AMRAP · \(WatchFormat.clock(Double(total)))"
        }
        if let rounds = seg.formatRounds {
            return "\(scheme.displayName) · \(rounds) rondas"
        }
        return scheme.displayName
    }

    private var hyroxStatus: String {
        "HYROX · \(min(session.fixedRoundsDone + 1, session.fixedListTotal)) / \(session.fixedListTotal)"
    }

    private func countdownColor(_ remaining: Double) -> Color {
        remaining > 0 && remaining <= WatchTheme.urgentThreshold ? WatchTheme.orange : WatchTheme.ink
    }

    private var hrZoneColor: Color {
        session.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim
    }
}
