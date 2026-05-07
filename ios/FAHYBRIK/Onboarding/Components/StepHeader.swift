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
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("Atrás")
            } else {
                Spacer().frame(width: 36, height: 36)
            }
            Spacer()
            Text("\(stepNumber)/\(totalSteps)")
                .font(Theme.Typography.small)
                .italic()
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }
}
