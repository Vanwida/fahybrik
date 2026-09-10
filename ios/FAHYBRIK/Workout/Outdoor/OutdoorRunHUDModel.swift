import Foundation
import Observation
import CoreLocation

// The live brain of the OUTDOOR run HUD (#64) — map trace + honest pace from Apple
// distance (`WorkoutSession.liveCoveredPaceSecPerKm`), not a homemade GPS smoother.
// Per-leg DISTANCE auto-close uses the same RunLegProgress as the wrist (belt → HK).

@Observable
final class OutdoorRunHUDModel {
    let session: WorkoutSession
    let hrZones: HRZoneProfile?

    private(set) var coordinates: [CLLocationCoordinate2D] = []
    private(set) var gpsQuality: GPSSignalQuality = .searching
    private(set) var legCoveredMeters: Double = 0

    private let gps: RunLocationProvider
    private var autoPauseCtl = RunAutoPause()
    private var legProgress = RunLegProgress()
    private let liveActivity = RunLiveActivityController()

    private var routePoints: [RoutePoint] = []
    private var displayTimer: Timer?
    private var lastLegKey = ""
    private var lastPaused = false
    /// Velocidad instantánea de CoreLocation (m/s) — entrada Apple para autopausa (#64).
    private var latestSpeedMps: Double?
    private var latestSpeedTrustworthy = false

    private static let tickSeconds: TimeInterval = 0.5

    init(session: WorkoutSession, hrZones: HRZoneProfile?, gps: RunLocationProvider = RunLocationProvider()) {
        self.session = session
        self.hrZones = hrZones
        self.gps = gps
    }

    // MARK: - Lifecycle

    func start() {
        if let existing = session.capturedRoutePolyline {
            routePoints = PolylineCodec.decode(existing)
            coordinates = routePoints.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
        }
        gps.onSpeed = { [weak self] speed, acc in
            guard let self else { return }
            self.session.sampleRunSpeed(metersPerSecond: speed, accuracyMps: acc)
            if speed >= 0, acc >= 0 {
                self.latestSpeedMps = speed
                self.latestSpeedTrustworthy = true
            } else {
                self.latestSpeedTrustworthy = false
            }
        }
        gps.onAltitude = { meters, accuracy in
            RunAltimeter.shared.noteGPSAltitude(meters, verticalAccuracy: accuracy)
        }
        gps.onCoordinate = { [weak self] coord in
            self?.coordinates.append(coord)
            self?.routePoints.append(RoutePoint(lat: coord.latitude, lon: coord.longitude))
        }
        gps.start()
        gps.setBackgroundUpdates(true)
        liveActivity.start(title: session.plan.name, initial: contentState())
        displayTimer = Timer.scheduledTimer(withTimeInterval: Self.tickSeconds, repeats: true) { [weak self] _ in
            self?.tick()
        }
        session.beginAutoPauseEvaluation()
    }

    func teardown() {
        session.endAutoPauseEvaluation()
        displayTimer?.invalidate(); displayTimer = nil
        gps.setBackgroundUpdates(false)
        gps.stop()
        liveActivity.end()
        if let poly = encodedPolyline() { session.capturedRoutePolyline = poly }
    }

    func encodedPolyline() -> String? {
        guard routePoints.count >= 2 else { return nil }
        return PolylineCodec.encode(routePoints)
    }

    // MARK: - Manual controls

    func togglePause() { session.togglePause() }
    func endLegNow() { session.primaryAdvance(fromAthleteTap: true) }

    // MARK: - Leg display context

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

    var prescribedInclinePct: Double? { isStructured ? session.currentRunLeg?.inclinePct : nil }
    var prescribedCadenceSpm: Int? { isStructured ? session.currentRunLeg?.cadenceSpm : nil }

    var legElapsedEffective: Double { isStructured ? session.runLegElapsed : session.lapElapsedSeconds }

    var legTimeRemaining: Double? {
        guard case let .time(target) = currentLeg.goal else { return nil }
        if isStructured { return max(0, session.runLegRemaining) }
        return max(0, Double(target) - legElapsedEffective)
    }

    var progressFraction: Double { currentLeg.goal.fraction(distanceM: legCoveredMeters, elapsedS: legElapsedEffective) }

    // MARK: - Live derived

    var heroStatus: TargetStatus {
        if isRecovery { return .unknown }
        return runTarget.paceStatus(currentSecPerKm: livePaceSecPerKm)
    }
    var coveredMeters: Double { session.liveRunDistanceMeters ?? 0 }
    var currentBpm: Int? { session.liveHRBpm }
    var liveZone: HRZone? { currentBpm.flatMap { hrZones?.zone(forBpm: $0) } }
    /// One pace owner — HK / pedometer distance over elapsed (same as treadmill + mirror).
    var livePaceSecPerKm: Int? { session.liveCoveredPaceSecPerKm }

    // MARK: - Tick

    private func tick() {
        let t = ProcessInfo.processInfo.systemUptime
        gpsQuality = GPSSignalQuality.from(horizontalAccuracyM: gps.latestHorizontalAccuracyM)
        legCoveredMeters = coveredLegMeters()
        evaluateAutoPause(now: t)
        evaluateLegClose()
        feedAudioCoach()
        refreshLiveActivity(now: t)
    }

    private var autoPauseEligible: Bool {
        guard session.currentSegment?.kind == .running else { return false }
        if isStructured { return session.currentRunLegIsDistance }
        return true
    }

    private func evaluateAutoPause(now t: TimeInterval) {
        guard !session.isFinished, !session.isAwaitingBlockStart, !isCountIn else { return }
        let isManual = session.isPaused && !session.autoPaused
        let speed = latestSpeedTrustworthy ? latestSpeedMps : nil
        switch autoPauseCtl.step(speedMps: speed, eligible: autoPauseEligible,
                                 isManualPause: isManual, now: t) {
        case .engage: session.autoPause(); Haptics.medium()
        case .release: session.autoResume(); Haptics.light()
        case .none: break
        }
    }

    private func coveredLegMeters() -> Double {
        isStructured
            ? legProgress.covered(segmentCoveredMeters: coveredMeters)
            : (session.tramoRunCoveredMeters ?? 0)
    }

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

    private func feedAudioCoach() {
        guard !session.isPaused, !isCountIn, !session.isAwaitingBlockStart else { return }
        if !isRecovery, case .pace = runTarget, let pace = livePaceSecPerKm {
            AudioCoach.shared.paceUpdate(status: runTarget.paceStatus(currentSecPerKm: pace),
                                         deltaSec: runTarget.paceDeviationSecPerKm(currentSecPerKm: pace))
        }
        if !isStructured, !isRecovery {
            AudioCoach.shared.distanceUpdate(distanceM: coveredMeters, elapsedS: legElapsedEffective)
        }
    }

    private func refreshLiveActivity(now t: TimeInterval) {
        let legKey = "\(session.currentSegmentIndex)#\(session.runLegIndex)"
        let paused = session.isPaused
        let force = paused != lastPaused || legKey != lastLegKey
        lastPaused = paused
        lastLegKey = legKey
        liveActivity.update(contentState(), force: force, now: t)
    }

    private func contentState() -> RunActivityAttributes.ContentState {
        RunActivityAttributes.ContentState(
            paceLabel: livePaceSecPerKm.map { Formato.ritmoCifras(Double($0)) } ?? "",
            legLabel: isStructured ? "Tramo \(legNumber)/\(legTotal)" : "",
            distanceLabel: Formato.distanciaCubierta(coveredMeters) ?? "0 m",
            timeLabel: Formato.clock(session.elapsedSeconds, anchoFijo: true),
            zoneLabel: liveZone.map { "Z\($0.rawValue)" } ?? "",
            paused: session.isPaused
        )
    }
}
