import Foundation
import Observation
import CoreLocation

// The live brain of the OUTDOOR run HUD (#64) — the GPS twin of TreadmillHUDModel.
// Owns the phone-GPS source and turns it into everything the outdoor screen needs:
// a live map trace, a smoothed live pace + honest quality badge, per-leg DISTANCE
// auto-close (the SAME shared RunLegProgress the wrist uses — belt swapped for GPS),
// auto-pause, the audio-coach feed and the Live Activity. It reads the WorkoutSession
// for the current LEG's prescription and drives the SAME progression the rest of the
// workout uses (`primaryAdvance`) — it invents no new segment logic.
//
// Leg DISPLAY context (leg number, goal, pace band, recovery) is resolved via the
// shared TreadmillLegResolver / RunTargetResolver, so the card reads identically to
// the belt HUD. GPS auto-CLOSE fires only for a STRUCTURED distance leg (like the
// wrist); a continuous run displays live and advances via the athlete's "Hecho".

@Observable
final class OutdoorRunHUDModel {
    let session: WorkoutSession
    let hrZones: HRZoneProfile?

    // Live values the view renders (observed).
    private(set) var coordinates: [CLLocationCoordinate2D] = []
    private(set) var gpsQuality: GPSSignalQuality = .searching
    // NO UNIFICADO A PROPÓSITO (card 101, ago-2026): esto es una media móvil de 10 s
    // sobre la velocidad instantánea del GPS (`RunPaceSmoother`, abajo). La muñeca
    // (y `WorkoutSession.liveCoveredPaceSecPerKm`) enseñan otra cosa: un ritmo MEDIO
    // del tramo — metros del tramo / segundos del tramo. Son dos ritmos legítimos
    // calculados distinto; reloj y móvil pueden discrepar en el mismo segundo sin
    // que ninguno esté mal. Si algún día se decide unificarlos, el otro sitio a
    // tocar es `WorkoutSession+Accessors.swift`.
    private(set) var livePaceSecPerKm: Int?
    /// The CURRENT leg's covered distance (m), for the "1,4 / 2,0 km" readout.
    private(set) var legCoveredMeters: Double = 0

    private let gps: RunLocationProvider
    private var smoother = RunPaceSmoother()
    private var autoPauseCtl = RunAutoPause()
    private let liveActivity = RunLiveActivityController()

    private var routePoints: [RoutePoint] = []
    private var displayTimer: Timer?
    private var lastLegKey = ""
    private var lastPaused = false

    /// How often the live values + auto-close + auto-pause are re-evaluated. GPS
    /// fixes are coarser than this, so it's a display cadence, not a sampling one.
    private static let tickSeconds: TimeInterval = 0.5
    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

    init(session: WorkoutSession, hrZones: HRZoneProfile?, gps: RunLocationProvider = RunLocationProvider()) {
        self.session = session
        self.hrZones = hrZones
        self.gps = gps
    }

    // MARK: - Lifecycle

    func start() {
        // Continue an EARLIER outdoor stint's trace (the athlete closed the screen
        // mid-run and re-opened it): seed the buffer + map from what's captured so
        // the polyline and the map pick up where they left off, not from zero.
        if let existing = session.capturedRoutePolyline {
            routePoints = PolylineCodec.decode(existing)
            coordinates = routePoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
        }
        gps.onDistanceDelta = { [weak self] meters in
            self?.session.sampleRunDistance(deltaMeters: meters, source: .gps)
        }
        gps.onSpeed = { [weak self] speed, acc in
            guard let self else { return }
            self.smoother.ingest(speedMps: speed, speedAccuracyMps: acc, now: self.now)
            // Al suavizador va lo que se PINTA (una media móvil de 10 s); a la traza,
            // lo que se MIDIÓ. Guardar el ritmo suavizado sería archivar nuestra
            // interpretación, y quien lea la serie ya no podría suavizar a su manera.
            self.session.sampleRunSpeed(metersPerSecond: speed, accuracyMps: acc)
        }
        // El barómetro necesita que alguien le diga dónde está el cero, y el único que
        // lo sabe es el GPS. Mientras esta pantalla mande, lo dice ella.
        gps.onAltitude = { meters, accuracy in
            RunAltimeter.shared.noteGPSAltitude(meters, verticalAccuracy: accuracy)
        }
        gps.onCoordinate = { [weak self] coord in
            self?.coordinates.append(coord)
            self?.routePoints.append(RoutePoint(lat: coord.latitude, lon: coord.longitude))
        }
        gps.start()
        gps.setBackgroundUpdates(true)   // paired with the `location` UIBackgroundMode
        liveActivity.start(title: session.plan.name, initial: contentState())
        displayTimer = Timer.scheduledTimer(withTimeInterval: Self.tickSeconds, repeats: true) { [weak self] _ in
            self?.tick()
        }
        // Mientras esta pantalla mire la velocidad, ELLA es quien puede auto-pausar.
        // La sesión lleva la cuenta y libera sola cuando el último se va.
        session.beginAutoPauseEvaluation()
    }

    func teardown() {
        // Antes que nada: dejar de vigilar. Si el atleta cerró esto parado en un
        // semáforo, la sesión no puede quedarse pausada sin nadie que la despierte.
        session.endAutoPauseEvaluation()
        displayTimer?.invalidate(); displayTimer = nil
        gps.setBackgroundUpdates(false)   // stop background GPS the moment the run closes (battery)
        gps.stop()
        liveActivity.end()
        // Hand the captured trace to the session so the post-workout summary can ship
        // it in the execution payload + draw the mini-map. Only overwrite when we have
        // a real trace, so closing a no-signal stint never wipes an earlier one.
        if let poly = encodedPolyline() { session.capturedRoutePolyline = poly }
    }

    /// The captured route as a compact encoded polyline for persistence, or nil when
    /// the run recorded no usable trace (no GPS / denied). Read by the post-workout
    /// summary to ship it in the execution payload.
    func encodedPolyline() -> String? {
        guard routePoints.count >= 2 else { return nil }
        return PolylineCodec.encode(routePoints)
    }

    // MARK: - Manual controls (from the view)

    func togglePause() { session.togglePause() }
    /// Manual OVERRIDE — close this leg now ("Tramo hecho" / "Hecho"). Same advance
    /// the automatic GPS close and the rest of the workout use.
    ///
    /// El háptico lo dispara `FranjaAccion`, que es la pieza compartida de la
    /// acción (contrato §10.5): así el toque se siente igual en las diez vistas en
    /// vivo en vez de depender de que cada modelo se acuerde. Aquí sonaba dos
    /// veces desde que la vista pasó a hablar el lenguaje del §10.
    func endLegNow() { session.primaryAdvance() }

    // MARK: - Leg display context (shared resolvers → reads like the belt HUD)

    var currentSegment: WorkoutSegment? { session.currentSegment }
    var isStructured: Bool { session.currentSegment?.hasRunStructure ?? false }
    var isCountIn: Bool { isStructured ? session.isRunCountIn : session.isCondCountIn }
    var countInRemaining: Int {
        Int((isStructured ? session.runCountInRemaining : session.condCountInRemaining).rounded(.up))
    }
    private var isWorkPhase: Bool { isStructured ? session.isRunLegWork : (session.rotPhase == .work) }

    var currentLeg: TreadmillLeg {
        guard let seg = session.currentSegment else {
            return TreadmillLeg(phase: .single, goal: .open, target: .none, ownsAutoAdvance: false)
        }
        if isStructured { return TreadmillLegResolver.leg(for: seg, structureLegIndex: session.runLegIndex) }
        return TreadmillLegResolver.leg(for: seg, isWork: isWorkPhase)
    }

    var isRecovery: Bool { currentLeg.isRecovery }
    var runTarget: RunTarget { currentLeg.target }
    var legNumber: Int {
        WorkoutLegCount.current(session.plan.segments, index: session.currentSegmentIndex,
                                structureLegIndex: session.runLegIndex)
    }
    var legTotal: Int { WorkoutLegCount.total(session.plan.segments) }

    /// PRESCRIBED inclinación / cadencia for a structured leg — a sober reference.
    var prescribedInclinePct: Double? { isStructured ? session.currentRunLeg?.inclinePct : nil }
    var prescribedCadenceSpm: Int? { isStructured ? session.currentRunLeg?.cadenceSpm : nil }

    /// Effective per-leg elapsed for the goal + the "Tiempo" readout.
    var legElapsedEffective: Double { isStructured ? session.runLegElapsed : session.lapElapsedSeconds }

    /// Remaining seconds for a TIME leg (session-owned countdown), else nil.
    var legTimeRemaining: Double? {
        guard case let .time(target) = currentLeg.goal else { return nil }
        if isStructured { return max(0, session.runLegRemaining) }
        return max(0, Double(target) - legElapsedEffective)
    }

    var progressFraction: Double { currentLeg.goal.fraction(distanceM: legCoveredMeters, elapsedS: legElapsedEffective) }

    // MARK: - Live derived

    /// Pace status judged against the leg's pace band (green/red), else neutral.
    var heroStatus: TargetStatus {
        if isRecovery { return .unknown }
        return runTarget.paceStatus(currentSecPerKm: livePaceSecPerKm)
    }
    /// Total covered distance of the current run segment (the "km" readout).
    var coveredMeters: Double { session.liveRunDistanceMeters ?? 0 }
    var currentBpm: Int? { session.liveHRBpm }
    // The outdoor HUD only tints the pulse by zone (no zone label), so it needs the
    // classification but not the estimated flag.
    var liveZone: HRZone? { currentBpm.flatMap { hrZones?.zone(forBpm: $0) } }
    var isAutoPaused: Bool { session.isPaused && session.autoPaused }

    // MARK: - Tick

    private func tick() {
        let t = now
        gpsQuality = GPSSignalQuality.from(horizontalAccuracyM: gps.latestHorizontalAccuracyM)
        livePaceSecPerKm = smoother.paceSecPerKm(now: t)
        legCoveredMeters = coveredLegMeters()
        evaluateAutoPause(now: t)
        feedAudioCoach()
        refreshLiveActivity(now: t)
    }

    /// The CURRENT leg's covered distance: baseline-adjusted per structured leg
    /// (RunLegProgress discards a prior leg's overshoot). UN-structured is NOT
    /// always "the whole segment" any more: a mixed block (Run 1.000 · SkiErg 500 ·
    /// Run 1.000 · …) folds to one segment, so `coveredMeters` (the raw GPS total)
    /// would show the third run station arriving at 2.000-y-pico instead of 0.
    /// `session.tramoRunCoveredMeters` is the tramo-anchored twin — same anchor
    /// `tramoErgStartDistance`/`tramoBeltStartDistance` already use — so it starts
    /// each running station at zero on its own. On a plain single-tramo run
    /// segment the anchor is zero and the number is identical to `coveredMeters`.
    private func coveredLegMeters() -> Double {
        session.tramoRunCoveredMeters ?? 0
    }

    // MARK: Auto-pause

    /// Auto-pause is meaningful on a CONTINUOUS run (time OR distance — a stop at a
    /// light must freeze) and on a structured DISTANCE leg; it's OFF inside a
    /// structured TIME/recovery leg, where the session clock owns the timing and
    /// freezing it would gift un-prescribed rest.
    private var autoPauseEligible: Bool {
        guard session.currentSegment?.kind == .running else { return false }
        if isStructured { return session.currentRunLegIsDistance }
        return true
    }

    private func evaluateAutoPause(now t: TimeInterval) {
        guard !session.isFinished, !session.isAwaitingBlockStart, !isCountIn else { return }
        let isManual = session.isPaused && !session.autoPaused
        switch autoPauseCtl.step(speedMps: smoother.speedMps(now: t),
                                 eligible: autoPauseEligible, isManualPause: isManual, now: t) {
        case .engage: session.autoPause(); Haptics.medium()
        case .release: session.autoResume(); Haptics.light()
        case .none: break
        }
    }

    // MARK: Audio coach (GPS pace + continuous km splits)

    private func feedAudioCoach() {
        guard !session.isPaused, !isCountIn, !session.isAwaitingBlockStart else { return }
        if !isRecovery, case .pace = runTarget, let pace = livePaceSecPerKm {
            AudioCoach.shared.paceUpdate(status: runTarget.paceStatus(currentSecPerKm: pace),
                                         deltaSec: runTarget.paceDeviationSecPerKm(currentSecPerKm: pace))
        }
        // Km splits are a CONTINUOUS-run concept; a structured run announces per tramo.
        if !isStructured, !isRecovery {
            AudioCoach.shared.distanceUpdate(distanceM: coveredMeters, elapsedS: legElapsedEffective)
        }
    }

    // MARK: Live Activity

    private func refreshLiveActivity(now t: TimeInterval) {
        let legKey = "\(session.currentSegmentIndex)#\(session.runLegIndex)"
        let paused = session.isPaused
        // A pause/resume or leg change must show at once; pace/distance ride the throttle.
        let force = paused != lastPaused || legKey != lastLegKey
        lastPaused = paused
        lastLegKey = legKey
        liveActivity.update(contentState(), force: force, now: t)
    }

    private func contentState() -> RunActivityAttributes.ContentState {
        RunActivityAttributes.ContentState(
            // Sin ritmo medido este campo va VACÍO y el widget cambia de sujeto al
            // tiempo. Antes se colaba aquí `gpsQuality.label` y salía «RITMO · GPS
            // fuerte /km». Y además de estar en el sitio equivocado, no le sirve de
            // nada al atleta: que el GPS vaya bien es el estado normal, y un estado
            // normal no se anuncia — sólo se avisa cuando FALTA algo.
            paceLabel: livePaceSecPerKm.map { Formato.ritmoCifras(Double($0)) } ?? "",
            legLabel: isStructured ? "Tramo \(legNumber)/\(legTotal)" : "",
            distanceLabel: Formato.distanciaCubierta(coveredMeters) ?? "0 m",
            timeLabel: Formato.clock(session.elapsedSeconds, anchoFijo: true),
            zoneLabel: liveZone.map { "Z\($0.rawValue)" } ?? "",
            paused: session.isPaused
        )
    }
}
