import SwiftUI

// The rest banner — a green-tinted takeover between strength sets. Giant green
// count-down + what comes next. The engine owns the 3·2·1 count ticks (fired on
// its clock); the watch adds a single "go" cue as rest ends. Auto-dismisses when
// the engine zeroes the rest clock. Mockup 5.
struct RestBannerView: View {
    let session: WorkoutSession

    var body: some View {
        ZStack {
            WatchTheme.restBg.ignoresSafeArea()
            VStack(spacing: 6) {
                StatusHeader(text: "Descanso", color: WatchTheme.zoneGreen)
                Spacer(minLength: 0)
                WatchLabel(text: "Vuelve en", color: WatchTheme.zoneGreen.opacity(0.85))
                GiantNumber(text: WatchFormat.countdown(session.restRemainingSeconds), size: 80, color: WatchTheme.zoneGreen)
                Spacer(minLength: 0)
                if let next = nextLabel {
                    VStack(spacing: 1) {
                        WatchLabel(text: "Luego")
                        Text(next)
                            .font(.system(size: 15, weight: .heavy))
                            .foregroundStyle(WatchTheme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .padding(.bottom, 8)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .onChange(of: session.restRemainingSeconds) { old, new in
            if old > 0 && new <= 0 { WatchHaptics.start() }
        }
    }

    private var nextLabel: String? {
        session.currentSegment?.title
    }
}
