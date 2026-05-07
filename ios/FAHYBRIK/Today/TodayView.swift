import SwiftUI

// Minimal placeholder consistent with UX spec 02-athlete-today.md so the
// onboarding/auth flow has a destination. A separate task implements full
// Today; this version reproduces the workout-hero card so `▶ EMPEZAR` works.
struct TodayView: View {
    @State private var showWorkout: Bool = false
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
        .fullScreenCover(isPresented: $showWorkout) {
            WorkoutContainer(plan: .demo, onClose: { showWorkout = false })
        }
    }

    private var todayTab: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    HStack {
                        HStack(spacing: 0) {
                            Text("[F]").foregroundStyle(Theme.Color.accent)
                            Text("AHYBRIK").foregroundStyle(Theme.Color.foreground)
                        }
                        .font(Theme.Typography.headlineM)
                        Spacer()
                        Image(systemName: "gearshape")
                            .foregroundStyle(Theme.Color.muted)
                    }

                    countdown
                    workoutHeroCard

                    sectionTitle("Tu cuerpo")
                    bodyMetrics

                    sectionTitle("Esta semana")
                    weekStats

                    sectionTitle("Carga")
                    loadStats
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    private var countdown: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("HYROX BCN · 42 días")
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Rectangle().fill(Theme.Color.muted.opacity(0.2)).frame(height: 1)
            Text("REAL · semana 2 · día 4")
                .font(Theme.Typography.small)
                .italic()
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private var workoutHeroCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text(WorkoutPlan.demo.name)
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            Text("\(WorkoutPlan.demo.format.displayName) · ~\(WorkoutPlan.demo.estimatedDurationSeconds / 60) min")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
            PrimaryButton(title: "▶ Empezar") {
                showWorkout = true
            }
            HStack(spacing: 6) {
                Circle().fill(Theme.Color.ok).frame(width: 6, height: 6)
                Text("Recovery 72% · OK")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandSurface()
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s)
            .font(Theme.Typography.dataLabel)
            .uppercaseTracked()
            .foregroundStyle(Theme.Color.muted)
    }

    private var bodyMetrics: some View {
        VStack(spacing: 0) {
            metricRow(label: "HRV", value: "▲ 58 ms")
            metricRow(label: "Sueño", value: "7h 12m")
            metricRow(label: "RHR", value: "48 bpm")
        }
        .brandSurface()
    }

    private var weekStats: some View {
        VStack(spacing: 0) {
            metricRow(label: "Compliance", value: "5/6")
            metricRow(label: "Volumen", value: "+12% vs LW")
            metricRow(label: "RPE medio", value: "7.2")
        }
        .brandSurface()
    }

    private var loadStats: some View {
        VStack(spacing: 0) {
            metricRow(label: "Fitness (CTL)", value: "75 ▲")
            metricRow(label: "Fatiga (ATL)", value: "63 ▲")
            metricRow(label: "Frescura (TSB)", value: "+12 fresco", color: Theme.Color.ok)
            metricRow(label: "ACR", value: "1.1 normal")
            metricRow(label: "Z3-4 últ 7d", value: "68%")
        }
        .brandSurface()
    }

    private func metricRow(label: String, value: String, color: Color? = nil) -> some View {
        HStack {
            Text(label)
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            Text(value)
                .font(Theme.Typography.bodyEmph.monospacedDigit())
                .foregroundStyle(color ?? Theme.Color.foreground)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, Theme.Spacing.l)
        .overlay(
            Rectangle().fill(Theme.Color.muted.opacity(0.18)).frame(height: 1),
            alignment: .bottom
        )
    }

    private var profileTab: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
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
