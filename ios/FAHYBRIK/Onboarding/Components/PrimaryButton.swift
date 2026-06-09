import SwiftUI

struct PrimaryButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: {
            guard enabled else { return }
            Haptics.light()
            action()
        }) {
            Text(title)
                .font(.system(size: 16, weight: .heavy, design: .default))
                .italic()
                .tracking(1.2)
                .foregroundStyle(Theme.Color.accentOn)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(Theme.Color.accent.opacity(enabled ? 1 : 0.4))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

struct SecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); action() }) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.muted.opacity(0.4), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

struct SkipLink: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); action() }) {
            Text(title)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .underline()
        }
        .buttonStyle(.plain)
    }
}
