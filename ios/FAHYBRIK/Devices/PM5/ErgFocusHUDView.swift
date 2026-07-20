import SwiftUI
import UIKit

// Full-screen "focus" HUD for the erg (row / ski), mirroring ErgData's landscape
// information architecture in our brand: meters top-left (goal-aware), the current
// split /500m as the huge center hero with media/500 + tiempo beneath, a left rail
// (s/min · vatios · vatios medios) and a right rail (cal · cal/h · proyección ·
// pulso · drag). During an interval REST the top-left slot becomes the rest
// countdown and the hero becomes "Intervalo N" with the just-rowed interval's
// numbers — exactly how ErgData flips its face between work and rest. Read-only:
// the PM5's resistance is the physical damper, so there are no controls, only a
// glanceable readout kept in lock-step with the monitor. Opts into LANDSCAPE (#6).
struct ErgFocusHUDView: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.verticalSizeClass) private var vSizeClass
    private var isLandscape: Bool { vSizeClass == .compact }

    private var live: PM5LiveSample { pm5.live }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.m) {
                header
                // Programming banner first (it explains a silent monitor better);
                // the no-data hint only when there's nothing programmed in flight.
                PM5ProgramBanner(pm5: pm5)
                if pm5.isConnected, noLiveData, pm5.programAnnouncement == nil { noDataHint }
                if isLandscape { landscapeBody } else { portraitBody }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 12)
        }
        .allowsLandscape()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(legLine)
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .tracking(0.4)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                if let obj = objectiveLine {
                    Text(obj)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            Spacer()
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Cerrar pantalla completa")
        }
    }

    // MARK: - Landscape (ErgData face: meters+rail left, hero center, rail right)

    private var landscapeBody: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 8) {
                topLeftSlot
                leftRail
                Spacer(minLength: 0)
            }
            .frame(width: 172)

            VStack(spacing: 0) {
                Spacer(minLength: 0)
                heroCard(splitSize: 112, restNameSize: 46)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 8) {
                rightRail
                Spacer(minLength: 0)
            }
            .frame(width: 150)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Portrait (meters/rest strip above, hero center, rails as two rows)

    private var portraitBody: some View {
        VStack(spacing: Theme.Spacing.m) {
            topLeftSlot
            Spacer(minLength: 0)
            heroCard(splitSize: 92, restNameSize: 40)
            Spacer(minLength: 0)
            HStack(spacing: 8) { leftRail }
            HStack(spacing: 6) { rightRail }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Top-left slot (meters while working, rest countdown while resting)

    @ViewBuilder
    private var topLeftSlot: some View {
        if isResting { restBox } else { metersBox }
    }

    // Meters toward the SERIE's goal — covered-in-this-window (the session's erg
    // anchor; the PM5's raw counter is cumulative across the piece, so it would lie
    // on serie 2+) against the segment's prescribed distance, with a thin progress
    // bar. No target → plain covered meters. Shared by portrait AND landscape.
    @ViewBuilder
    private var metersBox: some View {
        if let target = targetMeters, target > 0 {
            let covered = coveredMeters ?? 0
            let done = covered >= target
            VStack(spacing: 6) {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(coveredMeters.map { "\(Int($0))" } ?? "—")
                        .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(done ? Theme.Color.ok : Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Text("/ \(Int(target)) m")
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.Color.surfaceSunken)
                        Capsule()
                            .fill(done ? Theme.Color.ok : Theme.Color.accent)
                            .frame(width: max(0, geo.size.width * min(1, covered / target)))
                    }
                }
                .frame(height: 4)
                Text("METROS")
                    .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Metros: \(Int(covered)) de \(Int(target))" + (done ? ", completado" : ""))
        } else {
            railTile(value: coveredMeters.map { "\(Int($0))" } ?? "—", label: "metros", valueSize: 26)
        }
    }

    // Rest countdown in the meters slot — the ErgData move: while resting, the
    // number that matters top-left is when you row again, not how far you got.
    private var restBox: some View {
        VStack(spacing: 4) {
            Text(WorkoutSession.formatElapsed(max(0, session.rotPhaseRemaining)))
                .font(.system(size: 30, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text("DESCANSO")
                .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.Color.surface)
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Theme.Color.accent.opacity(0.5), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Descanso, quedan \(WorkoutSession.formatElapsed(max(0, session.rotPhaseRemaining)))")
    }

    // MARK: - Hero card (split /500m while working, "Intervalo N" while resting)

    private func heroCard(splitSize: CGFloat, restNameSize: CGFloat) -> some View {
        CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
            VStack(spacing: 4) {
                if isResting {
                    Text("Intervalo \(session.rotRoundIndex + 1)")
                        .font(.system(size: restNameSize, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    if session.rotTotalRounds > 0 {
                        Text("de \(session.rotTotalRounds)")
                            .font(Theme.Typography.readoutLabel)
                            .foregroundStyle(Theme.Color.muted)
                    }
                } else {
                    LabelText(text: "Split · real", size: 10)
                    Text(splitString)
                        .font(.system(size: splitSize, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.4)
                    Text("/500m")
                        .font(Theme.Typography.readoutLabel)
                        .foregroundStyle(Theme.Color.muted)
                }
                Hairline()
                HStack(spacing: 8) {
                    subReadout(value: isResting ? restAvgSplitString : avgSplitString,
                               label: "media /500m")
                    subReadout(value: isResting ? restTimeString
                                                : WorkoutSession.formatElapsed(session.lapElapsedSeconds),
                               label: "tiempo")
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func subReadout(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 30, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(0.6)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }

    // MARK: - Rails (same tiles work AND rest, like ErgData)

    @ViewBuilder
    private var leftRail: some View {
        railTile(value: spm.map { "\($0)" } ?? "—", label: "s/min")
        railTile(value: watts.map { "\($0)" } ?? "—", label: "vatios", color: Theme.Color.accentText)
        railTile(value: avgWatts.map { "\($0)" } ?? "—", label: "vatios medios")
    }

    @ViewBuilder
    private var rightRail: some View {
        railTile(value: calories.map { "\($0)" } ?? "—", label: "cal")
        railTile(value: calPerHour.map { "\($0)" } ?? "—", label: "cal/h")
        // Only a REAL projection earns a tile: distance target + live pace. No
        // target (or piece already done) → the tile simply isn't there.
        if let proj = projectedFinishSeconds {
            railTile(value: WorkoutSession.formatElapsed(proj), label: "proyección")
        }
        railTile(value: session.liveHRBpm.map { "\($0)" } ?? "—", label: "pulso",
                 color: session.liveZone?.color ?? Theme.Color.foreground)
        railTile(value: drag.map { "\($0)" } ?? "—", label: "drag")
    }

    private func railTile(value: String, label: String,
                          color: Color = Theme.Color.foreground,
                          valueSize: CGFloat = 21) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: valueSize, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(label.uppercased())
                .font(.system(size: 8, weight: .heavy)).tracking(0.7)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .padding(.horizontal, 4)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }

    private var noDataHint: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
            Text("Conectado, pero el PM5 aún no envía datos. Dale unas paladas.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    // MARK: - Derived (same rules as the inline ErgLiveHUD)

    /// The session's rotating format clock says we're between series — the same
    /// signal the inline Intervals HUD renders as "Descanso". EMOM and continuous
    /// pieces never enter it (their `rotPhase` stays `.work`).
    private var isResting: Bool {
        session.rotPhase == .rest && session.rotPhaseRemaining > 0
    }

    private var noLiveData: Bool {
        live.paceSecondsPer500m == nil && live.powerWatts == nil && (live.distanceMeters ?? 0) <= 0
    }
    private var splitString: String {
        guard pm5.isConnected, let p = live.paceSecondsPer500m, p > 0 else { return "—:—" }
        return Self.splitClock(p)
    }
    private var avgSplitString: String {
        guard pm5.isConnected, let p = live.avgPaceSecondsPer500m, p > 0 else { return "—:—" }
        return Self.splitClock(p)
    }
    private static func splitClock(_ pace: Double) -> String {
        let s = Int(pace.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    private var watts: Int? { pm5.isConnected ? live.powerWatts : nil }
    private var spm: Int? { pm5.isConnected ? live.strokeRate : nil }
    private var calories: Int? { pm5.isConnected ? live.caloriesKcal : nil }
    private var calPerHour: Int? { pm5.isConnected ? live.caloriesPerHour : nil }
    private var drag: Int? { pm5.isConnected ? live.dragFactor : nil }

    /// Average watts DERIVED from the monitor's own average pace via Concept2's
    /// published pace↔power relation: watts = 2.80 / (pace per meter)³, where
    /// pace-per-meter = (avg split s/500m) / 500. A real transformation of a real
    /// average — never an invented number; nil until the monitor reports avg pace.
    private var avgWatts: Int? {
        guard pm5.isConnected, let p = live.avgPaceSecondsPer500m, p > 0 else { return nil }
        let pacePerMeter = p / 500.0
        return Int((2.80 / pow(pacePerMeter, 3)).rounded())
    }

    /// Projected FINAL time of the serie: elapsed so far + remaining meters at the
    /// pace being held (current split, else the monitor's average). Only when the
    /// segment prescribes a distance, meters are flowing and a pace is live —
    /// otherwise there is nothing honest to project and the tile is omitted.
    private var projectedFinishSeconds: Double? {
        guard pm5.isConnected, let target = targetMeters, target > 0,
              let covered = coveredMeters, covered < target else { return nil }
        let pace = [live.paceSecondsPer500m, live.avgPaceSecondsPer500m]
            .compactMap { $0 }.first { $0 > 0 }
        guard let p = pace else { return nil }
        return session.lapElapsedSeconds + (target - covered) * (p / 500.0)
    }

    /// The just-rowed interval as the MONITOR recorded it (0x37/0x38 split table),
    /// falling back to the running averages when the PM5 isn't cutting intervals.
    private var lastSplit: PM5Split? { pm5.isConnected ? pm5.splits.last : nil }
    private var restAvgSplitString: String {
        if let p = lastSplit?.avgPaceSecPer500m, p > 0 { return Self.splitClock(p) }
        return avgSplitString
    }
    private var restTimeString: String {
        if let t = lastSplit?.timeSeconds, t > 0 { return WorkoutSession.formatElapsed(t) }
        return WorkoutSession.formatElapsed(session.lapElapsedSeconds)
    }

    /// Meters covered IN THIS WINDOW (the engine's per-segment erg delta). 0 while
    /// connected but before the first sample lands; nil when not connected.
    private var coveredMeters: Double? {
        guard pm5.isConnected else { return nil }
        return session.lapErgDistanceMeters ?? 0
    }
    private var targetMeters: Double? { session.currentSegment?.targetDistanceMeters }
    private var legLine: String {
        session.currentSegment?.title ?? "Remo"
    }
    private var objectiveLine: String? {
        let seg = session.currentSegment
        if let d = seg?.targetDistanceMeters { return "\(Int(d)) m" }
        if let w = seg?.targetPowerWatts { return "\(w) W" }
        return nil
    }
}
