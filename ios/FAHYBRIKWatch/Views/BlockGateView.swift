import SwiftUI

// The between-blocks gate — the session parks here (engine `isAwaitingBlockStart`)
// before every block so the athlete starts it on their terms: load the bar, read
// the WOD. Shows the block position, what's next, and the block's key objective
// chips (only what the prescription actually carries — never invented). One tap
// runs it. Mockups 3 / 4 (variant C's gate).
struct BlockGateView: View {
    let session: WorkoutSession

    var body: some View {
        LiveScaffold(status: "Bloque \(session.blockNumber) / \(session.blockCount)", statusColor: WatchTheme.dim) {
            VStack(spacing: 7) {
                WatchLabel(text: session.isLastBlock ? "Último · ahora" : "Ahora", accent: true)
                Text(headingName)
                    .font(.system(size: 21, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                if !chips.isEmpty {
                    chipRow
                }
            }
        } bottom: {
            BigTapButton(title: "Empezar bloque", systemImage: "play.fill") {
                session.beginBlock()
            }
        }
        .onAppear { WatchHaptics.transition() }
    }

    private var chipRow: some View {
        HStack(spacing: 6) {
            ForEach(Array(chips.prefix(3).enumerated()), id: \.offset) { _, chip in
                Text(chip)
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(WatchTheme.surface)
                    .clipShape(Capsule())
            }
        }
    }

    // MARK: - Derived

    private var headingName: String {
        if session.currentBlockIsStructural {
            return session.currentBlockRegion?.title ?? session.currentSegment?.blockPhase.displayName ?? "Bloque"
        }
        return session.currentSegment?.title ?? session.currentBlockRegion?.title ?? "Bloque"
    }

    private var chips: [String] {
        if session.currentBlockIsStructural {
            let count = session.currentBlockRegion.map { session.plan.segments(in: $0).count } ?? 0
            return count > 0 ? ["\(count) ejercicios"] : []
        }
        guard let line = session.currentSegment?.previewWorkLine else { return [] }
        return line.components(separatedBy: " · ").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }
}
