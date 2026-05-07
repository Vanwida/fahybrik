import SwiftUI

// Expert variant of the Pre-Workout Brief.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `PreBriefExpert`. Compact data grid + segments table + connection grid +
// coach quote. No emoji, no fluff — élite shorthand.
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
                topBar
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        kvGrid
                        segmentsTable
                        connectionsGrid
                        if let note = plan.coachNote {
                            CardSurface(padding: 14, leftAccent: true) {
                                CoachQuote(text: "\u{201C}\(note)\u{201D}")
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
                ExpertPrimaryButton(title: "▶ EMPEZAR", action: onStart)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.l)
                    .padding(.top, Theme.Spacing.s)
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: { Haptics.light(); onClose() }) {
                Text("← Atrás")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
            .buttonStyle(.plain)
            Spacer()
            LabelText(text: "Workout Brief")
            Spacer()
            Color.clear.frame(width: 50)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.l)
    }

    private var kvGrid: some View {
        CardSurface(padding: 12) {
            let cols = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
            LazyVGrid(columns: cols, spacing: 10) {
                kv(label: "Name", value: plan.name)
                kv(label: "Format", value: plan.format.displayName)
                kv(label: "Dur", value: "~\(plan.estimatedDurationSeconds / 60) min")
                kv(label: "Segments", value: "\(plan.segments.count)")
                kv(label: "Block", value: plan.blockContext)
                kv(label: "Equip", value: "\(plan.equipment.count) items")
            }
        }
    }

    private func kv(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: label, size: 10)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var segmentsTable: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Segments · Targets")
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                Hairline()
                ForEach(Array(plan.segments.enumerated()), id: \.element.id) { idx, seg in
                    if idx > 0 { Hairline() }
                    HStack(alignment: .center, spacing: 8) {
                        MonoText(text: "\(idx + 1)", size: 11, color: Theme.Color.muted)
                            .frame(width: 20, alignment: .leading)
                        Text(seg.title)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                        MonoText(text: targetString(seg), size: 11, color: Theme.Color.muted)
                            .frame(width: 60, alignment: .trailing)
                        if let z = seg.targetZone {
                            ZBadge(zone: z)
                                .frame(width: 50, alignment: .trailing)
                        } else {
                            Color.clear.frame(width: 50)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
            }
        }
    }

    private func targetString(_ s: WorkoutSegment) -> String {
        if let p = s.targetPaceSecondsPerKm {
            return "\(TimeMinSecRow.format(p))/km"
        }
        if let w = s.targetPowerWatts { return "\(w)W" }
        if let r = s.targetReps { return "\(r)r" }
        if let d = s.targetDistanceMeters { return d >= 1000 ? String(format: "%.1fk", d/1000) : "\(Int(d))m" }
        return "—"
    }

    private var connectionsGrid: some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Connections")
                let cols = [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                ]
                LazyVGrid(columns: cols, spacing: 8) {
                    connTile(label: "Garmin", connected: connections.garmin)
                    connTile(label: "HR Strap", connected: connections.healthkit)
                    connTile(label: "PM5", connected: connections.pm5)
                }
            }
        }
    }

    private func connTile(label: String, connected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.muted)
            Text(connected ? "✓ ready" : "✗ off")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(connected ? Theme.Color.ok : Theme.Color.danger)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
