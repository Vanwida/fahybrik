import SwiftUI

// Placeholder Today screen. The full UX spec 02-athlete-today.md is implemented
// in a follow-up task; the auth → onboarding → today handoff needs *something*
// to land on, hence this minimal version.
struct TodayView: View {
    let onSignOut: () -> Void

    var body: some View {
        TabView {
            todayTab
                .tabItem { Label("Today", systemImage: "circle.grid.2x2") }
            ComingSoonTab(label: "Plan")
                .tabItem { Label("Plan", systemImage: "calendar") }
            ComingSoonTab(label: "Stats")
                .tabItem { Label("Stats", systemImage: "chart.bar") }
            ComingSoonTab(label: "Chat")
                .tabItem { Label("Chat", systemImage: "message") }
            profileTab
                .tabItem { Label("Perfil", systemImage: "person") }
        }
        .tint(Theme.Color.accent)
    }

    private var todayTab: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                HStack {
                    HStack(spacing: 0) {
                        Text("[F]").foregroundStyle(Theme.Color.accent)
                        Text("AHYBRIK").foregroundStyle(Theme.Color.foreground)
                    }
                    .font(Theme.Typography.headlineM)
                    Spacer()
                    Image(systemName: "gearshape").foregroundStyle(Theme.Color.muted)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)

                Spacer()
                Text("Today (placeholder)")
                    .font(Theme.Typography.headlineM)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Pablo está armando tu plan.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                Spacer()
            }
        }
    }

    private var profileTab: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack {
                Spacer()
                Text("Perfil")
                    .font(Theme.Typography.headlineM)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                SecondaryButton(title: "Cerrar sesión", action: onSignOut)
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xl)
            }
        }
    }
}

private struct ComingSoonTab: View {
    let label: String
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack {
                Text(label)
                    .font(Theme.Typography.headlineL)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Próximamente")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}
