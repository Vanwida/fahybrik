import SwiftUI

// STRUCTURED RUN family (#68) — the athlete runs the series from the wrist, no
// phone. A folded run block carrying a `structure` is driven by the shared engine's
// leg cursor; this screen paints one tramo at a time (mockup "tramos con objetivo"):
// "TRAMO 3 DE 13 · 800 m" up top, the measured pace big, the objetivo band colored
// in/out, a distance (or time) progress bar, a live-HR zone strip, and the "luego:"
// next-leg preview. A DISTANCE tramo auto-closes on the covered distance (the
// WatchRunLegDriver); a TIME tramo counts down on the engine clock; "Tramo hecho"
// is the manual override. Legacy runs without a structure never route here.
struct StructuredRunLiveView: View {
    let session: WorkoutSession
    // The per-leg distance driver is OWNED by the coordinator (WORKOUT lifetime), not
    // this screen: paging away must NOT stop the DISTANCE auto-close, and the per-leg
    // baseline must survive this view being recreated by watchOS paging. The view is
    // purely presentational — it reads the driver's covered distance / progress.
    let driver: WatchRunLegDriver

    @State private var lastPaceHapticAt: Date = .distantPast

    var body: some View {
        content
            // Out-of-band pace haptic — mirrors ContinuousLiveView's zone-exit buzz:
            // throttled so a bout hovering near the edge never vibrates continuously.
            .onChange(of: legPaceSecPerKm) { _, _ in
                guard isWork, let status = objetivo?.status,
                      status == .tooFast || status == .tooSlow else { return }
                if Date().timeIntervalSince(lastPaceHapticAt) >= WatchTheme.zoneExitHapticThrottle {
                    lastPaceHapticAt = Date()
                    WatchHaptics.warning()
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        if session.isRunCountIn {
            countIn
        } else if isRecovery {
            recovery
        } else {
            work
        }
    }

    // MARK: - Count-in (3-2-1 before the first tramo)

    private var countIn: some View {
        LiveScaffold(status: statusText) {
            VStack(spacing: 6) {
                WatchLabel(text: "Prepárate")
                GiantNumber(text: WatchFormat.countdown(session.runCountInRemaining), size: 84, color: WatchTheme.orange)
                if let next = RunLegDisplay.nextLegPreview(session.currentRunLeg) {
                    Text(next)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(WatchTheme.dim)
                        .padding(.top, 1)
                }
            }
        }
    }

    // MARK: - Work tramo (pace hero + objetivo band + progress + zone)

    private var work: some View {
        let lectura = lecturaDelTramo
        return LiveScaffold(status: statusText) {
            VStack(spacing: 7) {
                VStack(spacing: 2) {
                    WatchLabel(text: lectura.etiqueta)
                    GiantNumber(text: lectura.texto, size: 50, unit: lectura.unidad)
                }
                objetivoLine
                progressBar
                zoneStrip
                nextLine
            }
        } bottom: {
            BigTapButton(title: "Tramo hecho ▸") { session.primaryAdvance() }
        }
    }

    // MARK: - Recovery tramo (recover, countdown / distance, HR)

    private var recovery: some View {
        LiveScaffold(status: "RECUPERA", statusColor: WatchTheme.zoneGreen) {
            VStack(spacing: 6) {
                WatchLabel(text: recoveryTitle)
                if let target = session.currentRunLeg?.durationSeconds, target > 0 {
                    GiantNumber(text: WatchFormat.countdown(session.runLegRemaining), size: 60,
                                color: WatchTheme.zoneGreen)
                } else {
                    GiantNumber(text: distanceCoveredText, size: 44, unit: "m")
                }
                progressBar
                HStack {
                    HRPill(bpm: session.liveHRBpm, zoneColor: hrZoneColor)
                    Spacer()
                }
                nextLine
            }
        } bottom: {
            BigTapButton(title: "Saltar descanso ▸") { session.primaryAdvance() }
        }
    }

    // MARK: - Objetivo band (colored in / out)

    @ViewBuilder
    private var objetivoLine: some View {
        if let obj = objetivo {
            let word = RunLegDisplay.statusWord(obj.status)
            HStack(spacing: 5) {
                Text("obj")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(WatchTheme.dim)
                Text(obj.label)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(objetivoColor(obj.status))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if !word.isEmpty {
                    Text(word)
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(objetivoColor(obj.status))
                }
            }
        }
    }

    // MARK: - Progress bar (distance covered / target, or time)

    @ViewBuilder
    private var progressBar: some View {
        if let bar = progress {
            VStack(spacing: 3) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(WatchTheme.surfaceRaised)
                        Capsule().fill(WatchTheme.orange)
                            .frame(width: max(2, geo.size.width * bar.fraction))
                    }
                }
                .frame(height: 8)
                Text(bar.caption)
                    .font(.system(size: 11, weight: .heavy).monospacedDigit())
                    .foregroundStyle(WatchTheme.dim)
            }
        }
    }

    // MARK: - Mini zone strip (live HR zone tint)

    private var zoneStrip: some View {
        HStack(spacing: 0) {
            ForEach(HRZone.allCases, id: \.rawValue) { zone in
                Rectangle()
                    .fill(WatchTheme.zoneColor(zone).opacity(session.liveZone == zone ? 1 : 0.28))
            }
        }
        .frame(height: 6)
        .clipShape(Capsule())
    }

    // MARK: - Next-leg preview

    /// The next tramo in this folded run block (public engine state only), or nil on
    /// the last leg — read here rather than added to the shared engine.
    private var nextRunLeg: RunLeg? {
        guard let legs = session.currentRunLegs else { return nil }
        let i = session.runLegIndex + 1
        return i < legs.count ? legs[i] : nil
    }

    @ViewBuilder
    private var nextLine: some View {
        if let next = RunLegDisplay.nextLegPreview(nextRunLeg) {
            Text("Luego · \(next)")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    // MARK: - Derived

    private var isWork: Bool { session.isRunLegWork }
    private var isRecovery: Bool { !(session.currentRunLeg?.isWork ?? true) }

    private var statusText: String {
        let n = session.runLegNumber
        let m = session.runLegTotal
        let measure = session.currentRunLeg.map(RunLegDisplay.measureLabel) ?? ""
        return measure.isEmpty ? "TRAMO \(n) DE \(m)" : "TRAMO \(n) DE \(m) · \(measure)"
    }

    private var recoveryTitle: String {
        let mode = RunLegDisplay.recoveryModeWord(session.currentRunLeg?.recoveryMode)
        return mode.isEmpty ? "Recupera" : "Recupera \(mode)"
    }

    /// The current tramo's average pace (sec/km), from its covered distance over its
    /// elapsed — the honest per-tramo pace (never the segment average).
    private var legPaceSecPerKm: Int? {
        RunLegDisplay.legPaceSecPerKm(coveredMeters: driver.legCoveredMeters, elapsedS: session.runLegElapsed)
    }

    /// LA SIGUIENTE VERDAD DISPONIBLE del tramo: el ritmo medido, y mientras no lo hay
    /// (los primeros metros, o un tramo sin GPS ni cinta) el reloj del tramo, que es lo
    /// único que la app sabe con certeza. Etiqueta, cifra y unidad viajan JUNTAS: un
    /// cronómetro bajo la palabra «Ritmo» miente igual que un guion, y encima es el
    /// error más difícil de ver porque cada mitad, por su cuenta, es correcta (§7).
    /// Mismo criterio que `OutdoorRunHUDView.lecturaViva` en el teléfono.
    private var lecturaDelTramo: (etiqueta: String, texto: String, unidad: String?) {
        guard let ritmo = legPaceSecPerKm else {
            return (Vocab.tiempo, WatchFormat.clock(session.runLegElapsed), nil)
        }
        return (Vocab.ritmo, WatchFormat.pace(ritmo), Formato.UnidadRitmo.porKm.rawValue)
    }

    private var objetivo: (label: String, status: TargetStatus)? {
        session.currentRunLeg.flatMap { RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: legPaceSecPerKm) }
    }

    private var distanceCoveredText: String { String(Int(driver.legCoveredMeters)) }

    private func objetivoColor(_ status: TargetStatus) -> Color {
        switch status {
        case .inTarget: return WatchTheme.zoneGreen
        case .tooFast, .tooSlow: return WatchTheme.zoneAmber
        case .unknown: return WatchTheme.ink
        }
    }

    private var hrZoneColor: Color {
        session.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim
    }

    /// The progress bar model: a DISTANCE leg fills on covered/target ("510 / 800 m");
    /// a TIME leg fills on elapsed/total ("1:23 / 3:00"). Nil for an open/unknown leg.
    private var progress: (fraction: Double, caption: String)? {
        guard let leg = session.currentRunLeg else { return nil }
        if let target = leg.distanceMeters {
            let covered = driver.legCoveredMeters
            return (leg.goal.fraction(distanceM: covered, elapsedS: 0),
                    "\(Int(covered)) / \(target) m")
        }
        if let total = leg.durationSeconds {
            let elapsed = session.runLegElapsed
            return (leg.goal.fraction(distanceM: 0, elapsedS: elapsed),
                    "\(Formato.clock(Int(elapsed))) / \(Formato.clock(total))")
        }
        return nil
    }
}
