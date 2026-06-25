import SwiftUI

struct HRZoneBadge: View {
    let zone: HRZone

    var body: some View {
        Text(zone.label)
            .font(Theme.Typography.dataLabel)
            // Zone hues are fixed (not appearance-aware) and fail AA as text on the
            // white canvas; render the label in adaptive `foreground` and keep the
            // zone color only as the tint band that carries the zone identity.
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.vertical, Theme.Spacing.xs)
            .background(zone.color.opacity(0.15))
            .clipShape(Capsule())
    }
}
