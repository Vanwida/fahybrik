import SwiftUI

// LIST family — warm-up / cool-down. The drills are a checklist for the
// athlete's own tracking. "Hecho ▸" cierra ESTE tramo (`primaryAdvance`),
// no el bloque. El lap estructural lo sella el backstop al entrar al
// trabajo. Design: "Lista · checklist, un gesto = un tramo".
struct ChecklistLiveView: View {
    let session: WorkoutSession

    @State private var ticked: Set<UUID> = []

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 6) {
                StatusHeader(text: blockTitle)
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(items) { item in
                            row(item)
                        }
                    }
                    .padding(.bottom, 4)
                }
                BigTapButton(title: "Hecho ▸") { complete() }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in ticked = [] }
    }

    private func row(_ item: WorkoutSegment) -> some View {
        let isDone = ticked.contains(item.id)
        let isCurrent = item.id == currentItemId
        return Button {
            WatchHaptics.tap()
            if isDone { ticked.remove(item.id) } else { ticked.insert(item.id) }
        } label: {
            HStack(spacing: 9) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(isDone ? WatchTheme.zoneGreen : (isCurrent ? WatchTheme.orange : WatchTheme.surfaceRaised), lineWidth: 2)
                        .background(isDone ? WatchTheme.zoneGreen.clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous)) : Color.clear.clipShape(RoundedRectangle(cornerRadius: 6)))
                        .frame(width: 18, height: 18)
                    if isDone {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundStyle(WatchTheme.greenOn)
                    }
                }
                Text(item.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(isDone ? WatchTheme.dim : WatchTheme.ink)
                    .strikethrough(isDone, color: WatchTheme.dim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private func complete() {
        session.primaryAdvance(fromAthleteTap: true)
    }

    // MARK: - Derived

    private var items: [WorkoutSegment] {
        guard let region = session.currentBlockRegion else {
            return session.currentSegment.map { [$0] } ?? []
        }
        return session.plan.segments(in: region)
    }

    private var currentItemId: UUID? {
        items.first(where: { !ticked.contains($0.id) })?.id
    }

    private var blockTitle: String {
        (session.currentBlockRegion?.title ?? session.currentSegment?.blockPhase.displayName ?? "Lista").uppercased()
    }
}
