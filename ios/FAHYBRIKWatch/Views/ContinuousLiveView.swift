import SwiftUI

// CONTINUOUS family — one unbroken bout (Steady). Two honest presentations off the
// same segment: when a real covered pace is measured (a GPS run) the hero is the
// pace /km; otherwise the hero is elapsed time over a zone bar that TINTS the
// target vs the live zone (design: "la pantalla tiñe la zona — sin leer números").
// A throttled haptic fires when the athlete drifts out of the target zone.
// Mockup 4e + the "ritmo por modalidad" pace heroes.
struct ContinuousLiveView: View {
    let session: WorkoutSession

    @State private var lastZoneHapticAt: Date = .distantPast

    var body: some View {
        Group {
            if showPaceHero {
                paceHero
            } else {
                zonePresentation
            }
        }
        .onChange(of: session.liveZone) { _, zone in
            guard let target = session.currentSegment?.targetZone, let zone, zone != target else { return }
            if Date().timeIntervalSince(lastZoneHapticAt) >= WatchTheme.zoneExitHapticThrottle {
                lastZoneHapticAt = Date()
                WatchHaptics.warning()
            }
        }
    }

    // MARK: - Pace hero (measured run pace)

    private var paceHero: some View {
        LiveScaffold(status: statusText) {
            VStack(spacing: 4) {
                WatchLabel(text: "Ritmo")
                GiantNumber(text: paceText, size: 54, unit: Formato.UnidadRitmo.porKm.rawValue)
                HStack(spacing: 6) {
                    if let dist = session.liveRunDistanceMeters {
                        MetricTile(label: "Dist", value: distanceValue(dist), unit: dist >= 1000 ? "km" : "m")
                    }
                    MetricTile(label: Vocab.fc, value: session.liveHRBpm.map(String.init) ?? "—")
                }
            }
        } bottom: {
            structuralDone
        }
    }

    // MARK: - Zone presentation

    private var zonePresentation: some View {
        LiveScaffold(status: statusText) {
            VStack(spacing: 10) {
                VStack(spacing: 2) {
                    WatchLabel(text: "Tiempo")
                    GiantNumber(text: WatchFormat.clock(session.condElapsed), size: 54)
                }
                zoneBar
                Text(inZoneStateText)
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(inZone ? WatchTheme.zoneGreen : WatchTheme.zoneAmber)
            }
        } bottom: {
            structuralDone
        }
    }

    // A structural warmup/cooldown bout is "done" when the athlete SAYS so — the
    // prescribed time is a suggestion, so the live screen offers the same one-tap
    // close as the checklist. Main-work continuous bouts keep a clean screen: they
    // end by time, or deliberately via "Siguiente bloque" on the pause page.
    @ViewBuilder
    private var structuralDone: some View {
        if session.currentBlockIsStructural {
            BigTapButton(title: "Hecho ▸") { session.completeStructuralBlock() }
        }
    }

    private var zoneBar: some View {
        VStack(spacing: 5) {
            HStack {
                WatchLabel(text: pctInZoneText)
                Spacer()
                WatchLabel(text: "FC \(session.liveHRBpm.map(String.init) ?? "—")")
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    HStack(spacing: 0) {
                        ForEach(HRZone.allCases, id: \.rawValue) { zone in
                            Rectangle()
                                .fill(WatchTheme.zoneColor(zone).opacity(session.liveZone == zone ? 1 : 0.34))
                        }
                    }
                    if let target = session.currentSegment?.targetZone {
                        Rectangle()
                            .fill(WatchTheme.ink)
                            .frame(width: 3)
                            .offset(x: markerX(for: target, width: geo.size.width))
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .frame(height: 12)
        }
    }

    // MARK: - Derived

    private var showPaceHero: Bool {
        session.currentSegment?.kind == .running && session.liveCoveredPaceSecPerKm != nil
    }

    private var paceText: String {
        session.liveCoveredPaceSecPerKm.map(WatchFormat.pace) ?? "—:—"
    }

    private func distanceValue(_ meters: Double) -> String {
        meters >= 1000 ? Formato.esDecimal(meters / 1000, decimals: 2, siempreDecimales: true) : String(Int(meters))
    }

    private var statusText: String {
        var parts = ["Continuo"]
        if let z = session.currentSegment?.targetZone { parts = [session.currentSegment?.kind == .running ? "Correr" : "Continuo", z.label] }
        return parts.joined(separator: " · ")
    }

    private var inZone: Bool {
        guard let target = session.currentSegment?.targetZone, let live = session.liveZone else { return false }
        return live == target
    }

    private var inZoneStateText: String { inZone ? "EN ZONA ✓" : "FUERA DE ZONA" }

    private var pctInZoneText: String {
        session.liveZonePctInTarget.map { "EN ZONA \($0)%" } ?? "EN ZONA —"
    }

    private func markerX(for zone: HRZone, width: CGFloat) -> CGFloat {
        // Center the marker in the target zone's 1/5 slot.
        let slot = width / CGFloat(HRZone.allCases.count)
        return slot * (CGFloat(zone.rawValue) - 0.5) - 1.5
    }
}
