import SwiftUI

// The session map (variant B's list) — reachable by crown-scrolling beneath the
// live screen. Phase headers (Calentamiento / Principal / Vuelta) over per-block
// rows with a done / current / pending dot. Tapping a non-current block jumps to
// it, confirming first when the current block holds unsaved work so a mis-tap
// never silently discards it.
struct SessionMapView: View {
    let session: WorkoutSession

    @State private var jumpTarget: WorkoutBlockRegion?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(session.plan.blockRegions.enumerated()), id: \.element.id) { index, region in
                    if isPhaseStart(index) {
                        WatchLabel(text: region.phase.displayName)
                            .padding(.top, index == 0 ? 0 : 6)
                            .padding(.bottom, 1)
                    }
                    row(region)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(WatchTheme.bg.ignoresSafeArea())
        .confirmationDialog(
            "¿Saltar a este bloque?",
            isPresented: Binding(get: { jumpTarget != nil }, set: { if !$0 { jumpTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Saltar") {
                if let target = jumpTarget { session.jumpTo(target.firstIndex) }
                jumpTarget = nil
            }
            Button("Cancelar", role: .cancel) { jumpTarget = nil }
        }
    }

    private func row(_ region: WorkoutBlockRegion) -> some View {
        let state = state(of: region)
        return Button {
            guard state != .current else { return }
            if session.currentSegmentHasLiveProgress {
                jumpTarget = region
            } else {
                session.jumpTo(region.firstIndex)
            }
        } label: {
            HStack(spacing: 8) {
                Circle().fill(dotColor(state)).frame(width: 7, height: 7)
                Text(region.title)
                    .font(.system(size: 12, weight: state == .current ? .heavy : .semibold))
                    .foregroundStyle(textColor(state))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .padding(.horizontal, state == .current ? 7 : 0)
            .background(state == .current ? WatchTheme.orange.opacity(0.14) : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(state == .current ? WatchTheme.orange : Color.clear, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - State

    private enum BlockState { case done, current, pending }

    private func state(of region: WorkoutBlockRegion) -> BlockState {
        if session.currentSegmentIndex > region.lastIndex { return .done }
        if session.currentSegmentIndex >= region.firstIndex { return .current }
        return .pending
    }

    private func dotColor(_ state: BlockState) -> Color {
        switch state {
        case .done:    return WatchTheme.zoneGreen
        case .current: return WatchTheme.orange
        case .pending: return WatchTheme.surfaceRaised
        }
    }

    private func textColor(_ state: BlockState) -> Color {
        switch state {
        case .done:    return WatchTheme.dim
        case .current: return WatchTheme.ink
        case .pending: return WatchTheme.dim
        }
    }

    private func isPhaseStart(_ index: Int) -> Bool {
        let regions = session.plan.blockRegions
        guard index < regions.count else { return false }
        if index == 0 { return true }
        return regions[index - 1].phase.displayName != regions[index].phase.displayName
    }
}
