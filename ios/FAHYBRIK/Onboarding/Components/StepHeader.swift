import SwiftUI

struct StepHeader: View {
    let stepNumber: Int
    let totalSteps: Int
    let onBack: (() -> Void)?

    var body: some View {
        HStack {
            if let onBack {
                Button(action: { Haptics.light(); onBack() }) {
                    Image(systemName: "chevron.left")
                        .scaledFont(18, weight: .semibold, relativeTo: .body)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(minWidth: 36, minHeight: 36)
                }
                .accessibilityLabel("Atrás")
            } else {
                Spacer().frame(width: 36, height: 36)
            }
            Spacer()
            Text("\(stepNumber)/\(totalSteps)")
                .scaledFont(13, weight: .medium, relativeTo: .footnote, italic: true)
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }
}
