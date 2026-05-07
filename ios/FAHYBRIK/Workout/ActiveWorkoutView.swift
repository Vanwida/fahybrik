import SwiftUI

struct ActiveWorkoutView: View {
    @State var session: WorkoutSession
    let onFinish: () -> Void

    @State private var showPauseConfirm: Bool = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                topBar
                heroHRBlock
                segmentTitle
                dataGridForSegment
                Spacer(minLength: 0)
                lapZone
                if let next = session.nextSegment {
                    Text("Próx: \(next.title)\(next.targetZone.map { "  ·  TGT \($0.label)" } ?? "")")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)

            if showPauseConfirm {
                pauseModal
            }
        }
        .onAppear {
            session.start()
        }
        .onDisappear {
            session.stop()
        }
        .onChange(of: session.isFinished) { _, finished in
            if finished { onFinish() }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: {
                session.togglePause()
                if session.isPaused { showPauseConfirm = true }
            }) {
                Image(systemName: session.isPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 36, height: 36)
            }
            Spacer()
            Text("\(session.currentSegmentIndex + 1)/\(session.plan.segments.count)")
                .font(Theme.Typography.small.monospacedDigit())
                .italic()
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private var heroHRBlock: some View {
        let hr = session.liveHRBpm
        let zone = session.liveZone
        return HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Text(hr.map { "\($0)" } ?? "—")
                .font(Theme.Typography.dataDigitHero)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            VStack(alignment: .leading, spacing: 4) {
                if let zone {
                    HRZoneBadge(zone: zone)
                }
                Text("HR")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private var segmentTitle: some View {
        HStack {
            Text(session.currentSegment?.title ?? "—")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            if let z = session.currentSegment?.targetZone {
                HRZoneBadge(zone: z)
            }
        }
    }

    @ViewBuilder
    private var dataGridForSegment: some View {
        let seg = session.currentSegment
        let kind = seg?.kind ?? .reps
        let lapStr = WorkoutSession.formatElapsed(session.lapElapsedSeconds)
        let totalStr = WorkoutSession.formatElapsed(session.elapsedSeconds)

        switch kind {
        case .running:
            DataGrid2x2(
                topLeft: ("DIST", distanceTarget(seg), nil),
                topRight: ("PACE TGT", paceTarget(seg), nil),
                bottomLeft: ("LAP", lapStr, nil),
                bottomRight: ("TOTAL", totalStr, nil)
            )
        case .rowOrSki:
            DataGrid2x2(
                topLeft: ("POWER TGT", powerTarget(seg), nil),
                topRight: ("DIST", distanceTarget(seg), nil),
                bottomLeft: ("LAP", lapStr, nil),
                bottomRight: ("TOTAL", totalStr, nil)
            )
        case .sled:
            DataGrid2x2(
                topLeft: ("DIST", distanceTarget(seg), nil),
                topRight: ("LOAD", loadStr(seg), nil),
                bottomLeft: ("LAP", lapStr, nil),
                bottomRight: ("TOTAL", totalStr, nil)
            )
        case .reps:
            HStack(spacing: 1) {
                Button(action: { session.tap(reps: 1) }) {
                    DataCell(
                        label: "REPS",
                        value: "\(session.repsCurrentSegment)/\(seg?.targetReps ?? 0)",
                        emphasis: nil
                    )
                }
                .buttonStyle(.plain)
                DataCell(label: "TGT HR", value: seg?.targetZone?.label ?? "—",
                         emphasis: seg?.targetZone?.color)
            }
            .background(Theme.Color.muted.opacity(0.18))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))

            HStack(spacing: 1) {
                DataCell(label: "LAP", value: lapStr, emphasis: nil)
                DataCell(label: "TOTAL", value: totalStr, emphasis: nil)
            }
            .background(Theme.Color.muted.opacity(0.18))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        case .strength:
            // Strength has its own sub-screen per spec — fallback grid for now.
            DataGrid2x2(
                topLeft: ("REPS", "\(session.repsCurrentSegment)", nil),
                topRight: ("LOAD", loadStr(seg), nil),
                bottomLeft: ("LAP", lapStr, nil),
                bottomRight: ("TOTAL", totalStr, nil)
            )
        }
    }

    private var lapZone: some View {
        LapButton(action: { session.lap() })
            .frame(height: 168) // ~22% of typical iPhone screen height
    }

    private var pauseModal: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                Text("Pausa")
                    .font(Theme.Typography.headlineM)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Auto-resume en 10s si no confirmas.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                HStack(spacing: Theme.Spacing.m) {
                    SecondaryButton(title: "Abandonar") {
                        session.finish()
                        showPauseConfirm = false
                    }
                    PrimaryButton(title: "Reanudar") {
                        session.togglePause()
                        showPauseConfirm = false
                    }
                }
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: 320)
            .brandSurface()
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }

    // MARK: - Formatting helpers

    private func distanceTarget(_ s: WorkoutSegment?) -> String {
        guard let s, let m = s.targetDistanceMeters else { return "—" }
        if m >= 1000 {
            return String(format: "%.2f km", m / 1000)
        }
        return "\(Int(m)) m"
    }
    private func paceTarget(_ s: WorkoutSegment?) -> String {
        guard let p = s?.targetPaceSecondsPerKm else { return "—" }
        return "\(TimeMinSecRow.format(p))/km"
    }
    private func powerTarget(_ s: WorkoutSegment?) -> String {
        guard let w = s?.targetPowerWatts else { return "—" }
        return "\(w)W"
    }
    private func loadStr(_ s: WorkoutSegment?) -> String {
        guard let kg = s?.loadKg else { return "—" }
        return "\(Int(kg)) kg"
    }
}
