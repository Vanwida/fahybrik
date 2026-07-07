import SwiftUI

// ROTATING family — the clock drives the screen forward: EMOM, Tabata, Intervals,
// Death By. Shared layout: status line, a giant count-down, the current movement
// + what's next, and an HR pill. The engine auto-advances every interval/phase
// (with its own haptic beep on the change); a contextual bottom action covers the
// cases the clock alone can't score (Tabata min-reps, an open interval bout, a
// Death By miss). Mockup 4a.
struct RotatingLiveView: View {
    let session: WorkoutSession

    var body: some View {
        LiveScaffold(status: statusText) {
            hero
        } bottom: {
            bottomAction
        }
    }

    // MARK: - Hero

    @ViewBuilder
    private var hero: some View {
        VStack(spacing: 6) {
            WatchLabel(text: countdownLabel)
            GiantNumber(text: countdownText, size: 84, color: countdownColor)
            movementBlock
            HStack {
                HRPill(bpm: session.liveHRBpm, zoneColor: hrZoneColor)
                Spacer()
            }
            .padding(.top, 2)
        }
    }

    @ViewBuilder
    private var movementBlock: some View {
        VStack(spacing: 1) {
            if let movement = nowMovement {
                Text(movement)
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(WatchTheme.orangeSoft)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            if let work = nowWork {
                Text(work)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                    .lineLimit(1)
            }
            if let next = nextText {
                Text(next)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }

    // MARK: - Bottom action (contextual)

    @ViewBuilder
    private var bottomAction: some View {
        switch session.currentSegment?.formatScheme {
        case .tabata:
            BigTapButton(title: "+ Rep", kind: .green) { session.tabataAddRep(1) }
        case .intervals:
            BigTapButton(title: "Serie hecha", kind: .green) { session.intervalsBoutDone() }
        case .deathBy:
            BigTapButton(title: "Fallé") { session.deathByFail() }
        default:
            EmptyView()   // EMOM & anything else auto-advances — no button
        }
    }

    // MARK: - Status

    private var statusText: String {
        guard let seg = session.currentSegment else { return "" }
        let name = seg.formatScheme?.displayName ?? "EMOM"
        if seg.isEMOM, let plan = seg.emomPlan {
            return "\(name) · \(session.emomIntervalIndex + 1) / \(plan.intervalCount)"
        }
        if session.rotTotalRounds > 0 {
            return "\(name) · \(session.rotRoundIndex + 1) / \(session.rotTotalRounds)"
        }
        return name
    }

    // MARK: - Countdown

    private var isCountIn: Bool {
        session.emomCountInRemaining > 0 || session.isCondCountIn
    }

    private var countInRemaining: Double {
        session.emomCountInRemaining > 0 ? session.emomCountInRemaining : session.condCountInRemaining
    }

    private var countdownLabel: String {
        if isCountIn { return "Prepárate" }
        if let seg = session.currentSegment, seg.isEMOM { return "Trabajo · queda" }
        return session.rotPhase == .rest ? "Descanso · queda" : "Trabajo · queda"
    }

    private var countdownText: String {
        if isCountIn { return WatchFormat.countdown(countInRemaining) }
        if let seg = session.currentSegment, seg.isEMOM {
            return WatchFormat.countdown(session.emomIntervalRemaining)
        }
        // Death By / a distance interval bout has no fixed phase clock — show the
        // running bout time instead of a frozen 0.
        if session.rotPhaseRemaining <= 0 { return WatchFormat.clock(session.lapElapsedSeconds) }
        return WatchFormat.countdown(session.rotPhaseRemaining)
    }

    private var countdownColor: Color {
        if isCountIn { return WatchTheme.orange }
        let remaining = session.currentSegment?.isEMOM == true
            ? session.emomIntervalRemaining
            : session.rotPhaseRemaining
        if remaining > 0 && remaining <= WatchTheme.urgentThreshold { return WatchTheme.orange }
        if session.rotPhase == .rest && session.currentSegment?.isEMOM != true { return WatchTheme.zoneGreen }
        return WatchTheme.ink
    }

    // MARK: - Movement / next

    private var nowMovement: String? {
        guard let seg = session.currentSegment else { return nil }
        if seg.isEMOM, let plan = seg.emomPlan {
            return plan.interval(session.emomIntervalIndex)?.movement
        }
        return seg.primaryMovement
    }

    private var nowWork: String? {
        guard let seg = session.currentSegment else { return nil }
        if seg.isEMOM, let plan = seg.emomPlan {
            let w = plan.interval(session.emomIntervalIndex)?.work
            return (w == "—") ? nil : w
        }
        if seg.formatScheme == .deathBy {
            return "Objetivo \(session.deathByTarget)"
        }
        if seg.formatScheme == .tabata {
            return "Reps \(session.rotRepsThisRound)"
        }
        return nil
    }

    private var nextText: String? {
        guard let seg = session.currentSegment, seg.isEMOM, let plan = seg.emomPlan else { return nil }
        guard let next = plan.interval(session.emomIntervalIndex + 1)?.movement else { return nil }
        return "luego · \(next)"
    }

    // MARK: - HR zone color

    private var hrZoneColor: Color {
        session.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim
    }
}
