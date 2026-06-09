import SwiftUI

// Race-day mode replaces the normal Today layout when the A-event is today.
// Spec /docs/ux/12-race-plan-and-prep.md sub-flow B.
//
// Sections:
//   - Hero countdown to race start.
//   - Warmup protocol (auto-starts 60min before; user can tap to begin
//     manually).
//   - Plan summary + link to RacePlanDetailView.
//   - Kit re-confirm.
//   - Pre-race check-in (Soreness / Energía / Confianza 1-5).
//   - Pablo's pinned race-day note.
struct RaceDayView: View {
    let context: RaceContext
    @State private var showFullPlan: Bool = false
    @State private var soreness: Int? = nil
    @State private var energy: Int? = nil
    @State private var confidence: Int? = nil
    @State private var checkinSubmitted: Bool = false
    @State private var kitReconfirmed: Bool = false
    @State private var warmupStarted: Bool = false

    private let warmupSteps: [String] = [
        "Foam roll · 8 min",
        "Activación banded · 5 min",
        "Run 10 min Z1 → Z2",
        "Drills: skip A/B, butt kicks, strides 4×100m",
        "Sled walk light 30m",
        "Listo 12 min antes"
    ]

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    headerStrip
                    heroCountdown
                    warmupCard
                    planSummaryCard
                    kitCheckCard
                    checkinCard
                    coachNoteCard
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .sheet(isPresented: $showFullPlan) {
            if let plan = context.race_plan {
                RacePlanDetailView(plan: plan)
            }
        }
    }

    private var headerStrip: some View {
        HStack(spacing: 8) {
            Wordmark(size: 18)
            Spacer()
            MonoText(
                text: "RACE DAY · \(context.event_name)",
                size: 10,
                weight: .semibold,
                color: Theme.Color.accent
            )
            .tracking(1.2)
            .textCase(.uppercase)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    private var heroCountdown: some View {
        CardSurface(padding: 18, topAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Hoy es la carrera")
                Text(context.event_name)
                    .font(.system(size: 32, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                if let start = context.start_local_time {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            LabelText(text: "Empieza", size: 9)
                            MonoText(text: start, size: 26, weight: .heavy, color: Theme.Color.foreground)
                        }
                        Rectangle().fill(Theme.Color.hairline).frame(width: 1, height: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            LabelText(text: "Time goal", size: 9)
                            MonoText(
                                text: timeGoalLabel,
                                size: 26,
                                weight: .heavy,
                                color: Theme.Color.foreground
                            )
                        }
                        Rectangle().fill(Theme.Color.hairline).frame(width: 1, height: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            LabelText(text: "Pace", size: 9)
                            MonoText(text: paceLabel, size: 26, weight: .heavy, color: Theme.Color.foreground)
                        }
                        Spacer()
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private var timeGoalLabel: String {
        guard let s = context.race_plan?.time_goal_seconds else { return "—" }
        return RaceFormat.time(s)
    }

    private var paceLabel: String {
        guard let s = context.race_plan?.time_goal_seconds else { return "—" }
        return RaceFormat.pacePerKm(timeGoalSeconds: s)
    }

    private var warmupCard: some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    LabelText(text: "Warmup protocol")
                    Spacer()
                    MonoText(
                        text: warmupStarted ? "EN MARCHA" : "auto · 60 min antes",
                        size: 10,
                        color: warmupStarted ? Theme.Color.ok : Theme.Color.muted
                    )
                    .tracking(1.2)
                    .textCase(.uppercase)
                }
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(warmupSteps.enumerated()), id: \.offset) { idx, step in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundStyle(Theme.Color.muted)
                                .frame(width: 18, alignment: .leading)
                            Text(step)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.Color.foreground)
                        }
                    }
                }
                ExpertPrimaryButton(
                    title: warmupStarted ? "▶ WARMUP EN MARCHA" : "▶ EMPEZAR WARMUP",
                    height: 44,
                    enabled: !warmupStarted
                ) {
                    warmupStarted = true
                }
            }
        }
    }

    private var planSummaryCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    LabelText(text: "Plan")
                    Spacer()
                    Button(action: {
                        Haptics.light()
                        showFullPlan = true
                    }) {
                        HStack(spacing: 4) {
                            MonoText(text: "ver completo", size: 11, color: Theme.Color.accent)
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(Theme.Color.accent)
                        }
                    }
                    .buttonStyle(.plain)
                }
                if let plan = context.race_plan {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Time goal · \(timeGoalLabel)")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Pace medio · \(paceLabel)")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.muted)
                        if let firstCue = plan.mental_cues.first {
                            CoachQuote(text: "\u{201C}\(firstCue.cue)\u{201D}")
                                .padding(.top, 4)
                        }
                    }
                } else {
                    Text("Plan no disponible")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    private var kitCheckCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    LabelText(text: "Kit check")
                    Spacer()
                    if kitReconfirmed {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Color.ok)
                            MonoText(text: "confirmado", size: 11, color: Theme.Color.ok)
                        }
                    }
                }
                if let plan = context.race_plan, !plan.kit.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(plan.kit) { item in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Image(systemName: item.checked || kitReconfirmed
                                      ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 14))
                                    .foregroundStyle(item.checked || kitReconfirmed
                                                     ? Theme.Color.accent : Theme.Color.muted)
                                Text(item.item)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.Color.foreground)
                                if let n = item.notes {
                                    Text("· \(n)")
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.Color.muted)
                                }
                            }
                        }
                    }
                }
                Button(action: {
                    Haptics.light()
                    kitReconfirmed.toggle()
                }) {
                    Text(kitReconfirmed ? "✓ Confirmado anoche" : "Re-confirmar kit")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(kitReconfirmed ? Theme.Color.muted : Theme.Color.accent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().stroke(
                                kitReconfirmed ? Theme.Color.muted.opacity(0.4) : Theme.Color.accent,
                                lineWidth: 1
                            )
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var checkinCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    LabelText(text: "Check-in pre-race")
                    Spacer()
                    if checkinSubmitted {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Color.ok)
                            MonoText(text: "guardado", size: 11, color: Theme.Color.ok)
                        }
                    }
                }
                preRaceQuestion(title: "Soreness", binding: $soreness, leftHint: "1 ninguno", rightHint: "5 mucho")
                preRaceQuestion(title: "Energía", binding: $energy, leftHint: "1 cero", rightHint: "5 a tope")
                preRaceQuestion(title: "Confianza", binding: $confidence, leftHint: "1 dudo", rightHint: "5 total")
                ExpertPrimaryButton(
                    title: checkinSubmitted ? "✓ GUARDADO" : "▶ GUARDAR CHECK-IN",
                    height: 44,
                    enabled: !checkinSubmitted && allChecked
                ) {
                    checkinSubmitted = true
                }
            }
        }
    }

    private var allChecked: Bool {
        soreness != nil && energy != nil && confidence != nil
    }

    private func preRaceQuestion(
        title: String,
        binding: Binding<Int?>,
        leftHint: String,
        rightHint: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
            Scale1to5Picker(value: binding, leftHint: leftHint, rightHint: rightHint)
        }
    }

    private var coachNoteCard: some View {
        if let plan = context.race_plan, let note = plan.coach_note, !note.isEmpty {
            return AnyView(
                CardSurface(padding: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        LabelText(text: "Pablo dice", color: Theme.Color.accent)
                        CoachQuote(text: "\u{201C}\(note)\u{201D}")
                    }
                }
            )
        } else {
            return AnyView(EmptyView())
        }
    }
}

// Preview removed with RaceDemoData (no mock). This view renders from a real
// RaceContext once /api/athlete/race-context lands (#31).
