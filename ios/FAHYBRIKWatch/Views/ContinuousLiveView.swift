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
            // El ritmo medido ES la condición de esta presentación, no un texto con
            // hueco: si no lo hay, la pantalla que se pinta es la de zona. Antes la
            // condición y el texto eran dos decisiones separadas y el texto llevaba un
            // `?? "—:—"` inalcanzable — un guion que nadie podía ver y que el
            // siguiente que tocara la condición sí habría enseñado.
            if let pace = measuredPace {
                paceHero(pace)
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

    private func paceHero(_ pace: Int) -> some View {
        LiveScaffold(status: statusText) {
            VStack(spacing: 4) {
                WatchLabel(text: Vocab.ritmo)
                GiantNumber(text: WatchFormat.pace(pace), size: 54, unit: Formato.UnidadRitmo.porKm.rawValue)
                HStack(spacing: 6) {
                    if let dist = session.liveRunDistanceMeters {
                        MetricTile(label: "Dist", value: distanceValue(dist), unit: dist >= 1000 ? "km" : "m")
                    }
                    MetricTile(label: Vocab.fc,
                               value: session.liveHRBpm.map(String.init),
                               ausente: WatchSinDato.pulso)
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
                    WatchLabel(text: Vocab.tiempo)
                    GiantNumber(text: WatchFormat.clock(session.condElapsed), size: 54)
                }
                zoneBar
                if let veredicto = zoneStateText {
                    Text(veredicto)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(inZone ? WatchTheme.zoneGreen : WatchTheme.zoneAmber)
                }
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
            zoneBarHeader
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

    /// El encabezado de la barra: el % en zona y el pulso.
    ///
    /// Sin pulso no existe ninguno de los dos, y decirlo DOS veces («buscando pulso»
    /// a izquierda y a derecha) es ruido: la fila colapsa en una sola frase con el
    /// porqué. La barra de debajo se queda sin tramo encendido, que ya lo cuenta sola.
    @ViewBuilder
    private var zoneBarHeader: some View {
        if let bpm = session.liveHRBpm {
            HStack {
                if let pct = session.liveZonePctInTarget {
                    WatchLabel(text: "En zona \(pct)%")
                }
                Spacer()
                WatchLabel(text: "\(Vocab.fc) \(bpm)")
            }
        } else {
            WatchLabel(text: WatchSinDato.pulso)
        }
    }

    // MARK: - Derived

    /// El ritmo CUBIERTO de un tramo de carrera, o nil: es lo que decide qué
    /// presentación se pinta.
    private var measuredPace: Int? {
        guard session.currentSegment?.kind == .running else { return nil }
        return session.liveCoveredPaceSecPerKm
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

    /// El veredicto de zona necesita SUS DOS MITADES: la zona que te pidieron y la que
    /// llevas. Sin objetivo prescrito o sin pulso no hay veredicto que emitir, y antes
    /// decía «FUERA DE ZONA» en los dos casos: una sentencia sobre un dato que no
    /// existe, que es justo lo que el §7 prohíbe.
    private var zoneStateText: String? {
        guard session.currentSegment?.targetZone != nil, session.liveZone != nil else { return nil }
        return inZone ? "EN ZONA ✓" : "FUERA DE ZONA"
    }

    private func markerX(for zone: HRZone, width: CGFloat) -> CGFloat {
        // Center the marker in the target zone's 1/5 slot.
        let slot = width / CGFloat(HRZone.allCases.count)
        return slot * (CGFloat(zone.rawValue) - 0.5) - 1.5
    }
}
