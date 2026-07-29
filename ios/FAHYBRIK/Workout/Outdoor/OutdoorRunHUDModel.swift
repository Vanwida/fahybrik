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
    private(set) var livePaceSecPerKm: Int?
    /// The CURRENT leg's covered distance (m), for the "1,4 / 2,0 km" readout.
    private(set) var legCoveredMeters: Double = 0

    private let gps: RunLocationProvider
    private var smoother = RunPaceSmoother()
    private var autoPauseCtl = RunAutoPause()
    private var legProgress = RunLegProgress()
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
        gps.onDistanceDelta = { [weak self] meters in self?.session.sampleRunGPS(deltaMeters: meters) }
        gps.onSpeed = { [weak self] speed, acc in
            guard let self else { return }
            self.smoother.ingest(speedMps: speed, speedAccuracyMps: acc, now: self.now)
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
    }

    func teardown() {
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
        evaluateLegClose()
        feedAudioCoach()
        refreshLiveActivity(now: t)
    }

    /// The CURRENT leg's covered distance: baseline-adjusted per structured leg
    /// (RunLegProgress discards a prior leg's overshoot), else the whole segment.
    private func coveredLegMeters() -> Double {
        isStructured ? legProgress.covered(segmentCoveredMeters: coveredMeters) : coveredMeters
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

    // MARK: GPS distance-leg auto-close (structured only — mirrors WatchRunLegDriver)

    private func evaluateLegClose() {
        guard isStructured else { return }
        let key = "\(session.currentSegmentIndex)#\(session.runLegIndex)#\(session.isRunCountIn ? "in" : "go")"
        let runnable = !session.isPaused && !session.isFinished
            && !session.isAwaitingBlockStart && !session.isRunCountIn
        let advance = legProgress.step(
            legKey: key,
            segmentCoveredMeters: coveredMeters,
            goal: session.currentRunLeg?.goal ?? .open,
            isDistanceLeg: session.currentRunLegIsDistance,
            isRunnableNow: runnable
        )
        if advance { Haptics.success(); session.primaryAdvance() }
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
            paceLabel: livePaceSecPerKm.map { Formato.ritmoCifras(Double($0)) } ?? "—:—",
            legLabel: isStructured ? "Tramo \(legNumber)/\(legTotal)" : "",
            distanceLabel: Formato.distanciaCubierta(coveredMeters) ?? "0 m",
            timeLabel: Formato.clock(session.elapsedSeconds, anchoFijo: true),
            zoneLabel: liveZone.map { "Z\($0.rawValue)" } ?? "",
            paused: session.isPaused
        )
    }
}
