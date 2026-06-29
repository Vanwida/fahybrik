import SwiftUI

// Persistent CHAT affordance in the header of the main screens. Chat is NOT a
// tab (it must not be buried, but it isn't a primary destination either): the
// thread is reached from a header icon that carries an unread badge. AppShell
// owns the presentation (a fullScreenCover) and exposes the opener through the
// `\.openChat` environment value, so any header can drop in this one button —
// single source for the look, the badge and the action (DRY).

// MARK: - openChat environment value

private struct OpenChatKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

extension EnvironmentValues {
    /// Raise the coach chat. Injected by AppShell; a no-op elsewhere (so a header
    /// using the button in isolation, e.g. a preview, never crashes).
    var openChat: () -> Void {
        get { self[OpenChatKey.self] }
        set { self[OpenChatKey.self] = newValue }
    }
}

// MARK: - Header button

/// Circular message icon with an unread count badge, reading the live unread
/// count from the shared store (single source — agrees with every surface). Tap
/// opens the coach thread via `\.openChat`. 44pt touch target.
struct ChatHeaderButton: View {
    @Environment(AppDataStore.self) private var store
    @Environment(\.openChat) private var openChat

    private var unread: Int { store.unreadCount }

    var body: some View {
        Button {
            Haptics.light()
            openChat()
        } label: {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Circle().fill(Theme.Color.surfaceElevated)
                    Image(systemName: "message")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                }
                .frame(width: 34, height: 34)
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))

                if unread > 0 {
                    Text(unread > 9 ? "9+" : "\(unread)")
                        .font(.system(size: 10, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.Color.background, lineWidth: 1.5))
                        .offset(x: 5, y: -5)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(unread > 0
            ? "Chat con tu coach, \(unread) sin leer"
            : "Chat con tu coach")
        .accessibilityAddTraits(.isButton)
    }
}
