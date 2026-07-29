import SwiftUI

// The app's full-width action pair. `Theme.Size.control` is a MINIMUM, not a
// fixed height: the label scales with Dynamic Type (§4), so the button has to
// grow with it — pinned at 54 pt the text simply clipped at accessibility sizes.
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
                .scaledFont(16, weight: .heavy, relativeTo: .body, italic: true)
                .tracking(1.2)
                .foregroundStyle(Theme.Color.accentOn)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, Theme.Spacing.s)
                .frame(maxWidth: .infinity)
                .frame(minHeight: Theme.Size.control)
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
                .scaledFont(16, weight: .semibold, relativeTo: .body)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, Theme.Spacing.s)
                .frame(maxWidth: .infinity)
                .frame(minHeight: Theme.Size.control)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.outline, lineWidth: 1)
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
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .underline()
                .multilineTextAlignment(.center)
        }
        .buttonStyle(.plain)
    }
}
