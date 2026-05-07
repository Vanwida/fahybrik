import SwiftUI

// Expert variant of the Active Workout screen — Garmin watch-face density.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `ActiveExpert`: compact top strip (pause / segment title / index), big LAP
// timer hero, 2x3 metric grid, next-segment chip + LAP button. Tab bar hidden
// by parent (WorkoutContainer) per "lock-in mode".
struct ActiveWorkoutView: View {
    @State var session: WorkoutSession
    let onFinish: () -> Void

    @State private var showPauseConfirm: Bool = false
    @State private var pauseAutoResume: Int = 10

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 8) {
                topStrip
                lapTimerHero
                metricGrid
                Spacer(minLength: 0)
                nextSegmentChip
                lapButton
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)

            if showPauseConfirm {
                pauseModal
            }
        }
        .onAppear { session.start() }
        .onDisappear { session.stop() }
        .onChange(of: session.isFinished) { _, finished in
            if finished { onFinish() }
        }
    }

    private var topStrip: some View {
        HStack {
            Button(action: {
                session.togglePause()
                if session.isPaused { showPauseConfirm = true; pauseAutoResume = 10 }
            }) {
                Text("‖")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            Spacer()
            MonoText(
                text: (session.currentSegment?.title ?? "—").uppercased(),
                size: 11,
                color: Theme.Color.muted
            )
            .lineLimit(1)
            Spacer()
            MonoText(
                text: "\(session.currentSegmentIndex + 1)/\(session.plan.segments.count)",
                size: 11,
                color: Theme.Color.muted
            )
        }
        .padding(.horizontal, 4)
    }

    private var lapTimerHero: some View {
        VStack(spacing: 2) {
            LabelText(text: "Lap", size: 9)
            HeroNumber(text: WorkoutSession.formatElapsed(session.lapElapsedSeconds), size: 88)
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
    }

    private var metricGrid: some View {
        let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        return LazyVGrid(columns: cols, spacing: 4) {
            ExpertCell(
                label: "HR",
                value: session.liveHRBpm.map { "\($0)" } ?? "—",
                unit: "bpm",
                color: liveZoneColor
            )
            ExpertCell(
                label: "Zone",
                value: session.liveZone?.label ?? "—",
                unit: "",
                color: liveZoneColor
            )
            ExpertCell(label: "Reps", value: repsString, unit: "")
            ExpertCell(label: "Total", value: WorkoutSession.formatElapsed(session.elapsedSeconds), unit: "")
            ExpertCell(label: "Tgt HR", value: targetZoneLabel, unit: "")
            ExpertCell(label: secondaryLabel, value: secondaryValue, unit: secondaryUnit)
        }
    }

    private var liveZoneColor: Color {
        session.liveZone?.color ?? Theme.Color.foreground
    }

    private var repsString: String {
        let seg = session.currentSegment
        if seg?.kind == .reps {
            let target = seg?.targetReps ?? 0
            return "\(session.repsCurrentSegment)/\(target)"
        }
        if seg?.kind == .strength {
            return "\(session.repsCurrentSegment)"
        }
        return "—"
    }

    private var targetZoneLabel: String {
        session.currentSegment?.targetZone?.label ?? "—"
    }

    private var secondaryLabel: String {
        guard let seg = session.currentSegment else { return "Pace" }
        switch seg.kind {
        case .running: return "Pace Tgt"
        case .rowOrSki: return "Pwr Tgt"
        case .sled: return "Load"
        case .reps: return "Cad"
        case .strength: return "Load"
        }
    }

    private var secondaryValue: String {
        guard let seg = session.currentSegment else { return "—" }
        switch seg.kind {
        case .running:
            if let p = seg.targetPaceSecondsPerKm { return TimeMinSecRow.format(p) }
            return "—"
        case .rowOrSki:
            if let w = seg.targetPowerWatts { return "\(w)" }
            return "—"
        case .sled:
            if let kg = seg.loadKg { return "\(Int(kg))" }
            return "—"
        case .reps:
            return "1.2"
        case .strength:
            if let kg = seg.loadKg { return "\(Int(kg))" }
            return "—"
        }
    }

    private var secondaryUnit: String {
        guard let seg = session.currentSegment else { return "" }
        switch seg.kind {
        case .running: return "/km"
        case .rowOrSki: return "W"
        case .sled, .strength: return "kg"
        case .reps: return "r/s"
        }
    }

    @ViewBuilder
    private var nextSegmentChip: some View {
        if let next = session.nextSegment {
            HStack {
                Text("NEXT · \(next.title)")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                Spacer()
                if let z = next.targetZone {
                    ZBadge(zone: z)
                }
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 6)
        }
    }

    private var lapButton: some View {
        ExpertLapButton(action: { session.lap() })
            .frame(height: 88)
    }

    private var pauseModal: some View {
        ZStack {
            Theme.Color.scrim.ignoresSafeArea()
            CardSurface(padding: Theme.Spacing.l, radius: Theme.Radius.xl) {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    Text("Pausa")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Auto-resume en \(pauseAutoResume)s si no confirmas.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                    ExpertPrimaryButton(title: "Reanudar") {
                        session.togglePause()
                        showPauseConfirm = false
                    }
                    SecondaryButton(title: "Abandonar") {
                        session.finish()
                        showPauseConfirm = false
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
        .transition(.opacity)
        .onAppear {
            countdownAutoResume()
        }
    }

    private func countdownAutoResume() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            guard showPauseConfirm else { return }
            if pauseAutoResume <= 1 {
                session.togglePause()
                showPauseConfirm = false
            } else {
                pauseAutoResume -= 1
                countdownAutoResume()
            }
        }
    }
}

// Smaller LAP button matching Expert spec (88pt, radius 14).
private struct ExpertLapButton: View {
    let action: () -> Void
    @State private var flashing: Bool = false
    @State private var lastTap: Date = .distantPast

    var body: some View {
        Button {
            let now = Date()
            guard now.timeIntervalSince(lastTap) > 0.5 else { return }
            lastTap = now
            Haptics.medium()
            withAnimation(.easeOut(duration: 0.18)) { flashing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.easeIn(duration: 0.16)) { flashing = false }
            }
            action()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .fill(flashing ? Theme.Color.ok : Theme.Color.accent)
                Text("LAP")
                    .font(.system(size: 40, weight: .heavy, design: .default).italic())
                    .tracking(4)
                    .foregroundStyle(Color.white)
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Lap")
    }
}
