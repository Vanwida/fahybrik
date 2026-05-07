import SwiftUI

struct HRZoneBadge: View {
    let zone: HRZone

    var body: some View {
        Text(zone.label)
            .font(Theme.Typography.dataLabel)
            .foregroundStyle(zone.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(zone.color.opacity(0.15))
            .clipShape(Capsule())
    }
}
