import SwiftUI

// Expert variant of the Today screen — Garmin-density single-screen dashboard.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/today.jsx
// `TodayExpert`. Élite-only: density before minimalism, ATR vocabulary native,
// HRV/CTL/TSB/ACR default-visible.
struct TodayView: View {
    @State private var showWorkout: Bool = false
    @State private var showCheckin: Bool = false
    let onSignOut: () -> Void

    var body: some View {
        TabView {
            todayTab
                .tabItem { Label("Today", systemImage: "circle.grid.2x2") }
            PlanView()
                .tabItem { Label("Plan", systemImage: "calendar") }
            StatsView()
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
        .sheet(isPresented: $showCheckin) {
            CheckinPlaceholder(onClose: { showCheckin = false })
        }
    }

    // MARK: - Today Expert variant

    private var todayTab: some View {
        let p = TodayPersona.demo
        return ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    headerStrip(p)
                    dashboardGrid(p)
                    workoutCard
                    checkinRow
                    polarizationCard(p)
                    yesterdayCard(p)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.l)
            }
        }
    }

    private func headerStrip(_ p: TodayPersona) -> some View {
        HStack(spacing: 8) {
            Wordmark(size: 18)
            Spacer()
            MonoText(
                text: "\(p.raceName) · \(p.daysToRace)D · \(p.block) W\(p.week)D\(p.day)",
                size: 10,
                weight: .semibold,
                color: Theme.Color.muted
            )
            .tracking(1.2)
            .textCase(.uppercase)
            Image(systemName: "gearshape")
                .font(.system(size: 16))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    private func dashboardGrid(_ p: TodayPersona) -> some View {
        let cols = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            DashTile(label: "Readiness", value: "\(p.readiness)", unit: "/100", color: Theme.Color.ok)
            DashTile(label: "HRV", value: "\(p.hrvDelta)\(p.hrvValue)", unit: p.hrvUnit)
            DashTile(label: "Sleep", value: p.sleepHours, unit: "hrs")
            DashTile(label: "RHR", value: "\(p.rhr)", unit: "bpm")
            DashTile(label: "CTL", value: "\(p.ctl)", unit: p.ctlTrend)
            DashTile(label: "TSB", value: "+\(p.tsb)", unit: p.tsbLabel, color: Theme.Color.ok)
        }
    }

    private var workoutCard: some View {
        CardSurface(padding: 14, topAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    LabelText(text: "PM · NEXT", color: Theme.Color.accent)
                    Spacer()
                    MonoText(text: "~52 min · For Time", size: 11, color: Theme.Color.muted)
                }
                Text(WorkoutPlan.demo.name)
                    .font(.system(size: 18, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.top, 6)

                HStack(spacing: 6) {
                    ForEach(WorkoutPlan.demo.zoneTargets, id: \.zone) { zt in
                        HStack(spacing: 4) {
                            ZBadge(zone: zt.zone)
                            MonoText(text: "\(zt.percent)%", size: 11, color: Theme.Color.muted)
                        }
                    }
                }
                .padding(.top, 8)

                ExpertPrimaryButton(title: "▶ EMPEZAR", height: 46) {
                    showWorkout = true
                }
                .padding(.top, 12)
            }
        }
    }

    private var checkinRow: some View {
        Button(action: { Haptics.light(); showCheckin = true }) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(Theme.Color.warning).frame(width: 6, height: 6)
                    Text("Check-in matinal pendiente")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.foreground)
                }
                Spacer()
                Text("20s →")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.accent)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func polarizationCard(_ p: TodayPersona) -> some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "Polarization 14d")
                    Spacer()
                    MonoText(text: "off-target", size: 11, color: Theme.Color.warning)
                }
                PolBar(z12: p.polZ12, z3: p.polZ3, z45: p.polZ45)
                HStack {
                    MonoText(text: "Z1-2 \(p.polZ12)%", size: 11, color: HRZone.z2.color)
                    Spacer()
                    MonoText(text: "Z3 \(p.polZ3)%", size: 11, color: HRZone.z3.color)
                    Spacer()
                    MonoText(text: "Z4-5 \(p.polZ45)%", size: 11, color: HRZone.z5.color)
                }
                Text("target 80/0/20 · drift +8% Z1")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private func yesterdayCard(_ p: TodayPersona) -> some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "Ayer")
                    Spacer()
                    MonoText(text: "\(p.yesterdayDuration) · RPE \(p.yesterdayRpe)", size: 11, color: Theme.Color.muted)
                }
                Text(p.yesterdayTitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.foreground)
                CoachQuote(text: "\u{201C}\(p.yesterdayCoachNote)\u{201D}")
                    .padding(.top, 4)
            }
        }
    }

    private var profileTab: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                Spacer()
                Wordmark(size: 32)
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
            VStack(spacing: Theme.Spacing.s) {
                Wordmark(size: 24)
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

private struct CheckinPlaceholder: View {
    let onClose: () -> Void
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                LabelText(text: "Buenos días")
                Text("Check-in matinal")
                    .font(Theme.Typography.headlineL)
                    .foregroundStyle(Theme.Color.foreground)
                Text("20 segundos · 5 preguntas")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                Spacer()
                ExpertPrimaryButton(title: "Cerrar", action: onClose)
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xl)
            }
            .padding(.top, Theme.Spacing.xxxl)
        }
        .preferredColorScheme(.dark)
    }
}
