import SwiftUI

// Read-only full race plan view. Reachable from race-day mode (sheet) and
// from the Plan tab during the 21-day window pre-race. Spec sub-flow A.
struct RacePlanDetailView: View {
    let plan: RacePlan
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        timeGoalCard
                        pacingCard
                        nutritionCard
                        kitCard
                        cuesCard
                        contingencyCard
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
            .navigationTitle("Race plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
    }

    private var timeGoalCard: some View {
        CardSurface(padding: 14, topAccent: true) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Time goal")
                if let s = plan.time_goal_seconds {
                    HStack(alignment: .lastTextBaseline, spacing: 12) {
                        Text(RaceFormat.time(s))
                            .font(.system(size: 38, weight: .heavy, design: .default).italic().monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                        MonoText(
                            text: "pace \(RaceFormat.pacePerKm(timeGoalSeconds: s)) avg",
                            size: 12,
                            color: Theme.Color.muted
                        )
                    }
                } else {
                    Text("Pendiente")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.muted)
                }
                if plan.status == .approved {
                    HStack(spacing: 6) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.Color.ok)
                        MonoText(text: "approved by Pablo", size: 11, color: Theme.Color.ok)
                            .tracking(1.2)
                            .textCase(.uppercase)
                    }
                }
            }
        }
    }

    private var pacingCard: some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Pacing por estación")
                VStack(spacing: 0) {
                    ForEach(plan.station_pacing) { row in
                        let isRun = HyroxStation.runIndices.contains(row.station_index)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            MonoText(
                                text: String(format: "%02d", row.station_index),
                                size: 11,
                                color: Theme.Color.muted
                            )
                            .frame(width: 24, alignment: .trailing)
                            Text(HyroxStation.labels[row.station_index] ?? row.label)
                                .font(.system(size: 13, weight: isRun ? .regular : .semibold))
                                .foregroundStyle(isRun ? Theme.Color.muted : Theme.Color.foreground)
                                .frame(width: 140, alignment: .leading)
                            MonoText(
                                text: row.target_pace ?? "—",
                                size: 12,
                                color: Theme.Color.foreground
                            )
                            .frame(width: 80, alignment: .leading)
                            if let n = row.note {
                                Text("· \(n)")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.Color.muted)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 6)
                        if row.station_index < HyroxStation.count {
                            Hairline()
                        }
                    }
                }
            }
        }
    }

    private var nutritionCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Nutrición")
                let n = plan.nutrition
                MetricRowsList(items: [
                    .init(label: "Pre-race -3h", value: n.pre_3h ?? "—"),
                    .init(label: "Pre-race -45m", value: n.pre_45m ?? "—"),
                    .init(label: "Intra", value: n.intra ?? "—"),
                    .init(label: "Post", value: n.post ?? "—")
                ], dense: true)
            }
        }
    }

    private var kitCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Kit")
                if plan.kit.isEmpty {
                    Text("Sin items")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(plan.kit) { item in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Image(systemName: item.checked ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 14))
                                    .foregroundStyle(item.checked ? Theme.Color.accent : Theme.Color.muted)
                                Text(item.item)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.Color.foreground)
                                if let n = item.notes {
                                    Text("· \(n)")
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.Color.muted)
                                        .lineLimit(1)
                                }
                                Spacer()
                            }
                        }
                    }
                }
            }
        }
    }

    private var cuesCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Mental cues")
                if plan.mental_cues.isEmpty {
                    Text("Sin cues")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(plan.mental_cues) { cue in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                if let i = cue.station_index {
                                    MonoText(
                                        text: String(format: "%02d", i),
                                        size: 11,
                                        color: Theme.Color.accentText
                                    )
                                    .frame(width: 24, alignment: .trailing)
                                } else {
                                    Text("·")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(Theme.Color.accentText)
                                        .frame(width: 24, alignment: .trailing)
                                }
                                Text("\u{201C}\(cue.cue)\u{201D}")
                                    .font(.system(size: 13).italic())
                                    .foregroundStyle(Theme.Color.foreground)
                                Spacer()
                            }
                        }
                    }
                }
            }
        }
    }

    private var contingencyCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Contingencia")
                if plan.contingency.isEmpty {
                    Text("Sin reglas")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(plan.contingency) { rule in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(rule.trigger)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Theme.Color.warning)
                                Text("→ \(rule.action)")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.Color.foreground)
                            }
                            if rule != plan.contingency.last { Hairline() }
                        }
                    }
                }
            }
        }
    }
}

// Preview removed with RaceDemoData (no mock). Renders from a real RacePlan
// once /api/athlete/race-context lands (#31).
