import SwiftUI

struct PreWorkoutBriefView: View {
    let plan: WorkoutPlan
    let connections: ConnectionStatus
    let onStart: () -> Void
    let onClose: () -> Void

    struct ConnectionStatus {
        let garmin: Bool
        let healthkit: Bool
        let pm5: Bool
        static let mock = ConnectionStatus(garmin: true, healthkit: true, pm5: false)
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        nameBlock
                        connectionsBadges
                        zoneTargetsBlock
                        equipmentBlock
                        segmentList
                        warmupBlock
                        if let note = plan.coachNote {
                            coachNoteBlock(note)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
                PrimaryButton(title: "Empezar", action: onStart)
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.s)
            }
        }
    }

    private var header: some View {
        HStack {
            Button(action: { Haptics.light(); onClose() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 36, height: 36)
            }
            Spacer()
            Text(plan.blockContext)
                .font(Theme.Typography.small)
                .italic()
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }

    private var nameBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(plan.name)
                .font(Theme.Typography.headlineL)
                .foregroundStyle(Theme.Color.foreground)
            Text("\(plan.format.displayName) · ~\(plan.estimatedDurationSeconds / 60) min")
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.top, Theme.Spacing.l)
    }

    private var connectionsBadges: some View {
        HStack(spacing: 8) {
            ConnectionBadge(label: "Garmin", connected: connections.garmin)
            ConnectionBadge(label: "HR Strap", connected: connections.healthkit)
            ConnectionBadge(label: "PM5", connected: connections.pm5)
        }
    }

    private var zoneTargetsBlock: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Trabajo en zonas")
            HStack(spacing: 6) {
                ForEach(plan.zoneTargets, id: \.zone) { zt in
                    HStack(spacing: 4) {
                        Circle().fill(zt.zone.color).frame(width: 8, height: 8)
                        Text("\(zt.percent)% \(zt.zone.label)")
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.Color.surface)
                    .clipShape(Capsule())
                }
            }
        }
    }

    private var equipmentBlock: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Equipamiento")
            Text(plan.equipment.joined(separator: " · "))
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private var segmentList: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Plan")
            VStack(spacing: 1) {
                ForEach(plan.segments) { seg in
                    HStack(alignment: .top, spacing: Theme.Spacing.m) {
                        Text(String(format: "%02d", seg.order))
                            .font(Theme.Typography.dataLabel.monospacedDigit())
                            .foregroundStyle(Theme.Color.muted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(seg.title)
                                .font(Theme.Typography.body)
                                .foregroundStyle(Theme.Color.foreground)
                            if let z = seg.targetZone {
                                HRZoneBadge(zone: z)
                            }
                        }
                        Spacer()
                        if let p = seg.targetPaceSecondsPerKm {
                            Text("\(TimeMinSecRow.format(p))/km")
                                .font(Theme.Typography.dataLabel.monospacedDigit())
                                .foregroundStyle(Theme.Color.muted)
                        } else if let w = seg.targetPowerWatts {
                            Text("\(w)W")
                                .font(Theme.Typography.dataLabel.monospacedDigit())
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    .padding(Theme.Spacing.m)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Color.surface)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
    }

    private var warmupBlock: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Calentamiento")
            VStack(alignment: .leading, spacing: 6) {
                ForEach(plan.warmupChecklist, id: \.self) { line in
                    HStack(alignment: .top, spacing: 8) {
                        Text("·").foregroundStyle(Theme.Color.muted)
                        Text(line).font(Theme.Typography.small).foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
        }
    }

    private func coachNoteBlock(_ note: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Pablo")
            Text("\u{201C}\(note)\u{201D}")
                .font(Theme.Typography.body)
                .italic()
                .foregroundStyle(Theme.Color.muted)
                .padding(.leading, Theme.Spacing.m)
                .overlay(
                    Rectangle().fill(Theme.Color.accent).frame(width: 2),
                    alignment: .leading
                )
        }
    }

    private func sectionHeader(_ s: String) -> some View {
        Text(s)
            .font(Theme.Typography.dataLabel)
            .uppercaseTracked()
            .foregroundStyle(Theme.Color.muted)
    }
}

private struct ConnectionBadge: View {
    let label: String
    let connected: Bool

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.foreground)
            Text(connected ? "✓" : "✗")
                .font(Theme.Typography.small)
                .foregroundStyle(connected ? Theme.Color.ok : Theme.Color.danger)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Theme.Color.surface)
        .clipShape(Capsule())
    }
}
