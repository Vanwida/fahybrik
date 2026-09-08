import SwiftUI

// FH-91 — the pre-live gate must never be an empty shell: show the real plan
// (especially free functional) before EMPEZAR, same honesty as PreWorkoutBriefView.

struct SessionStartGatePlanPreview: View {
    let plan: WorkoutPlan
    let segments: [WorkoutSegment]

    private var ordered: [WorkoutSegment] {
        segments.sorted { $0.order < $1.order }
    }

    var body: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Tu entreno")
                    .font(.system(size: 11, weight: .heavy, design: .default).italic())
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.muted)
                Text(plan.name)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if ordered.isEmpty {
                    Text("Sin movimientos cargados")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.warning)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(ordered.prefix(8).enumerated()), id: \.element.id) { idx, seg in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(idx + 1).")
                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(Theme.Color.faint)
                                    .frame(width: 22, alignment: .trailing)
                                Text(seg.title)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Theme.Color.foreground)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        if ordered.count > 8 {
                            Text("+ \(ordered.count - 8) más")
                                .font(Theme.Typography.caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
