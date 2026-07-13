import Foundation
import Observation

// The live brain of the treadmill HUD. Owns the two device sources (real BLE on
// device, deterministic mocks in the simulator), merges their telemetry, and
// exposes typed live values the view renders. It reads the WorkoutSession for the
// current LEG's prescription and drives the SAME progression the rest of the
// workout uses (`primaryAdvance`) — it invents no new segment logic.
//
// A "leg" unifies the two shapes (see TreadmillLeg): a whole continuous-run
// segment, OR one work/recovery bout of an interval SERIES (folded into one
// `.intervals` segment the session advances internally). Advancement is AUTOMATIC
// by default:
//   • legs we OWN (continuous runs, distance work bouts) auto-close when the
//     belt distance / elapsed reaches the goal → we call `primaryAdvance()`.
//   • legs the SESSION owns (interval TIME bouts, recovery countdowns) roll on the
//     session's own clock; we only display them and detect the change.
// The manual button is an OVERRIDE ("Terminar tramo ahora").
//
// Per-leg MEASURED values are kept in memory (`measured`) as the seam for a later
// persistence phase; this phase persists nothing.

/// What the treadmill measured for one leg — held in memory only.
struct TreadmillLegMeasurement: Equatable {
    var distanceM: Double
    var elapsedS: Double
    var avgSpeedKmh: Double?
    var avgInclinePct: Double?
    var avgBpm: Int?
}

@Observable
final class TreadmillHUDModel {
    // Live device links come from the SHARED DeviceHub — connected in the pre-workout
    // brief or here — so the chips reflect the SAME connection the whole session uses
    // and dismissing/re-opening this HUD never drops the belt.
    var treadmillLink: DeviceLink { hub.treadmillLink }
    var hrLink: DeviceLink { hub.hrLink }
    /// The connection channels — so the HUD chips can open the picker (to switch or
    /// DISCONNECT a device mid-session) and the connect screen can offer "Elegir cinta".
    var treadmillChannel: DeviceChannel { hub.treadmill }
    var hrChannel: DeviceChannel { hub.heartRate }
    // Live merged telemetry (observed by the view). `latest` is merged here from the
    // hub's raw samples; `bleBpm` is forwarded from the hub's strap.
    private(set) var latest = TreadmillSample()
    private(set) var bleBpm: Int?

    // Per-leg live accumulation (observed).
    private(set) var legDistanceM: Double = 0
    private(set) var legElapsedS: Double = 0
    private(set) var isComplete = false
    private(set) var paused = false

    /// Measured work per leg key — the in-memory seam for the persistence phase.
    private(set) var measured: [String: TreadmillLegMeasurement] = [:]

    let session: WorkoutSession
    let athleteAge: Int?

    /// The shared device layer (FTMS treadmill + BLE HR strap). The model does NOT
    /// own or start/stop the sources — it subscribes for telemetry and drives the
    /// leg logic; the hub owns the connection lifecycle across the whole session.
    private let hub: DeviceHub

    // Leg identity + timing (wall-clock, pause-aware).
    private var activeLegKey = ""
    private var autoAdvancedLegKey: String?
    private var legStartedAt = Date()
    private var pausedAccum: TimeInterval = 0
    private var pauseStartedAt: Date?

    // Distance derivation + running averages for the measurement snapshot.
    private var distanceBaselineM: Double?
    // Set on a cover REOPEN (see rehydrateContinuousLegFromSession): the meters this
    // leg already covered, used to re-anchor the odometer baseline on the first sample
    // (baseline = reading − alreadyCovered) so the ring resumes there, not at zero.
    private var pendingRehydratedLegDistanceM: Double?
    private var lastSampleAt: Date?
    private var speedSum = 0.0
    private var speedCount = 0
    private var inclineSum = 0.0
    private var inclineCount = 0
    private var bpmSum = 0
    private var bpmCount = 0

    private var displayTimer: Timer?

    init(session: WorkoutSession, athleteAge: Int?, hub: DeviceHub) {
        self.session = session
        self.athleteAge = athleteAge
        self.hub = hub
    }

    /// Test seam — the auto-advance tests inject fake sources they drive directly;
    /// wrap them in a throwaway hub so they exercise the SAME ingest path as prod.
    convenience init(session: WorkoutSession, athleteAge: Int?,
                     treadmill: TreadmillDataSource, hr: HeartRateSource) {
        self.init(session: session, athleteAge: athleteAge,
                  hub: DeviceHub(treadmill: treadmill, hr: hr))
    }

    // MARK: - Lifecycle

    func start() {
        activeLegKey = legKey()
        resetLegState()
        rehydrateContinuousLegFromSession()   // resume a reopened continuous run's covered distance
        // Consume the shared hub's telemetry (the belt/strap may already be
        // connected from the brief). Subscribing — not owning the sources — is what
        // lets the connection survive this HUD being dismissed and re-opened.
        hub.onSample = { [weak self] in self?.ingest($0) }
        hub.onBpm = { [weak self] in self?.bleBpm = $0 }
        hub.connectTreadmill()   // idempotent: a no-op if the brief already connected
        hub.connectHR()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func teardown() {
        snapshotLeg(activeLegKey)   // keep the leg in progress in memory for phase 3
        displayTimer?.invalidate(); displayTimer = nil
        // UNSUBSCRIBE only — leave the devices connected. The link is session-scoped
        // (owned by DeviceHub) and must outlive this HUD; the whole workout's teardown
        // disconnects via DeviceHub.shared.stopAll() (WorkoutContainer.onDisappear).
        hub.onSample = nil
        hub.onBpm = nil
    }

    func togglePause() {
        paused.toggle()
        if paused {
            pauseStartedAt = Date()
        } else if let started = pauseStartedAt {
            pausedAccum += Date().timeIntervalSince(started)
            pauseStartedAt = nil
        }
        session.togglePause()
    }

    /// Manual OVERRIDE — end this leg now (cut a leg short, or close an "open" leg
    /// like "hasta recuperar"). Same advance the automatic path and the rest of the
    /// workout use.
    func endLegNow() {
        Haptics.medium()
        session.primaryAdvance()
    }

    // MARK: - Leg context (read by the view)

    var currentSegment: WorkoutSegment? { session.currentSegment }
    var isSeries: Bool { currentSegment.map(TreadmillLegResolver.isRunSeries) ?? false }
    /// True when the current segment runs the STRUCTURED leg cursor (#61) — the leg
    /// identity, count-in and clocks then come from the session's run-leg engine
    /// (not the rotating machine), so each bout reads its OWN measure/target/incline.
    var isStructured: Bool { currentSegment?.hasRunStructure ?? false }
    var isWorkPhase: Bool { isStructured ? session.isRunLegWork : (session.rotPhase == .work) }
    var isCountIn: Bool { isStructured ? session.isRunCountIn : session.isCondCountIn }
    var countInRemaining: Int {
        Int((isStructured ? session.runCountInRemaining : session.condCountInRemaining).rounded(.up))
    }

    var currentLeg: TreadmillLeg {
        guard let seg = currentSegment else {
            return TreadmillLeg(phase: .single, goal: .open, target: .none, ownsAutoAdvance: false)
        }
        if isStructured {
            return TreadmillLegResolver.leg(for: seg, structureLegIndex: session.runLegIndex)
        }
        return TreadmillLegResolver.leg(for: seg, isWork: isWorkPhase)
    }

    var isRecovery: Bool { currentLeg.isRecovery }
    var runTarget: RunTarget { currentLeg.target }

    /// PRESCRIBED inclinación / cadencia for the CURRENT structured leg (#61), shown
    /// as a sober reference so the athlete can match the belt. Nil for a legacy leg
    /// or when the coach set none.
    var prescribedInclinePct: Double? { isStructured ? session.currentRunLeg?.inclinePct : nil }
    var prescribedCadenceSpm: Int? { isStructured ? session.currentRunLeg?.cadenceSpm : nil }

    var legNumber: Int {
        if isStructured {
            return WorkoutLegCount.current(session.plan.segments, index: session.currentSegmentIndex,
                                           structureLegIndex: session.runLegIndex)
        }
        return WorkoutLegCount.current(session.plan.segments, index: session.currentSegmentIndex,
                                       rotRoundIndex: session.rotRoundIndex, isWork: isWorkPhase)
    }
    var legTotal: Int { WorkoutLegCount.total(session.plan.segments) }

    // MARK: - Live derived values

    var livePaceSecPerKm: Int? {
        guard let kmh = latest.speedKmh else { return nil }
        return TreadmillMath.paceSecPerKm(fromSpeedKmh: kmh)
    }

    /// Preferred HR: the BLE strap when live, else the watch/HealthKit stream the
    /// workout already receives (Apple Watch works with no extra plumbing).
    var currentBpm: Int? {
        if hrLink.isLive, let b = bleBpm { return b }
        return session.liveHRBpm ?? bleBpm
    }

    var effectiveHRLink: DeviceLink {
        if hrLink.isLive { return hrLink }
        if session.liveHRBpm != nil { return .connected(name: "reloj") }
        return hrLink
    }

    /// Estimated zone (220−age). Nil without an age or HR — the HUD then hides the
    /// zone rather than inventing one. Always shown as "estimada".
    var liveZone: HRZone? {
        guard let bpm = currentBpm else { return nil }
        return EstimatedHRZone.zone(forBpm: bpm, age: athleteAge)
    }
    var zoneIsEstimated: Bool { true }

    /// Hero judgment: pace targets judge on pace, zone targets on HR zone,
    /// recovery / no-target has nothing to judge.
    var heroStatus: TargetStatus {
        if isRecovery { return .unknown }
        switch runTarget {
        case .pace: return runTarget.paceStatus(currentSecPerKm: livePaceSecPerKm)
        case .zone: return runTarget.zoneStatus(currentZone: liveZone)
        case .none: return .unknown
        }
    }

    /// Effective elapsed for the current leg's goal + the "Tiempo" readout. For a
    /// continuous run we trust the session's own segment clock (it counts from the
    /// segment start even if the HUD opened mid-run, and it's pause-correct); for a
    /// series bout there is no per-bout session clock, so we use our own wall clock
    /// measured from the bout opening.
    var legElapsedEffective: Double {
        if isStructured { return session.runLegElapsed }   // the session's per-leg clock
        return isSeries ? legElapsedS : session.lapElapsedSeconds
    }

    /// Remaining seconds for a TIME leg. The session owns interval time/recovery
    /// countdowns (read its clock); we own a continuous-run time cap (target −
    /// elapsed). Nil for non-time goals.
    var legTimeRemaining: Double? {
        guard case let .time(target) = currentLeg.goal else { return nil }
        if isStructured { return max(0, session.runLegRemaining) }
        if isSeries { return max(0, session.rotPhaseRemaining) }
        return max(0, Double(target) - legElapsedEffective)
    }

    var progressFraction: Double {
        switch currentLeg.goal {
        case let .distance(target):
            return target > 0 ? min(1, max(0, legDistanceM / target)) : 0
        case let .time(target):
            guard target > 0 else { return 0 }
            let remaining = legTimeRemaining ?? Double(target)
            return min(1, max(0, 1 - remaining / Double(target)))
        case .open:
            return 0
        }
    }

    var diagnosticsText: String? { hub.treadmillDiagnostics() }

    // MARK: - Ingestion & ticking

    private func ingest(_ sample: TreadmillSample) {
        syncLeg()
        var merged = latest
        if let v = sample.speedKmh { merged.speedKmh = v }
        if let v = sample.inclinePct { merged.inclinePct = v }
        if let v = sample.totalDistanceM { merged.totalDistanceM = v }
        if let v = sample.elapsedS { merged.elapsedS = v }
        if let v = sample.hrBpm { merged.hrBpm = v }
        merged.lastUpdate = sample.lastUpdate
        latest = merged

        updateLegDistance(from: merged)
        accumulateAverages(from: merged)
        maybeAutoAdvance()
    }

    private func tick() {
        syncLeg()
        if !paused {
            legElapsedS = max(0, Date().timeIntervalSince(legStartedAt) - pausedAccum)
        }
        maybeAutoAdvance()
        feedAudioCoach()
    }

    /// Feed the live audio coach (#63) the two treadmill-only signals it can't get
    /// from the session: the live pace vs the leg's pace objective, and covered
    /// distance for km splits on a continuous run. Observe-only — the coach decides
    /// whether (and what) to speak; the hysteresis / split rules live in its engine.
    private func feedAudioCoach() {
        guard !paused, !isCountIn, !session.isAwaitingBlockStart else { return }
        if !isRecovery, case .pace = runTarget, let pace = livePaceSecPerKm {
            AudioCoach.shared.paceUpdate(status: runTarget.paceStatus(currentSecPerKm: pace),
                                         deltaSec: runTarget.paceDeviationSecPerKm(currentSecPerKm: pace))
        }
        // Km splits are a CONTINUOUS-run concept; a series / structured run announces
        // per tramo instead, so it never gets a competing split.
        if !isStructured, !isSeries, !isRecovery {
            AudioCoach.shared.distanceUpdate(distanceM: legDistanceM, elapsedS: legElapsedEffective)
        }
    }

    private func updateLegDistance(from sample: TreadmillSample) {
        guard !paused else { lastSampleAt = sample.lastUpdate; return }
        let before = legDistanceM
        if let total = sample.totalDistanceM {
            // Prefer the machine's odometer, zeroed at this leg's first sample so
            // any overshoot from a prior leg is discarded (each leg counts from the
            // reading at which it opens). On a cover REOPEN the leg already covered
            // `pendingRehydratedLegDistanceM`; anchor the baseline below that reading
            // so the ring resumes there, not at zero.
            if distanceBaselineM == nil {
                distanceBaselineM = total - (pendingRehydratedLegDistanceM ?? 0)
                pendingRehydratedLegDistanceM = nil
            }
            legDistanceM = max(legDistanceM, total - (distanceBaselineM ?? total))
        } else if let kmh = sample.speedKmh {
            let dt = lastSampleAt.map { sample.lastUpdate.timeIntervalSince($0) } ?? 0
            legDistanceM = TreadmillMath.advanceDistance(legDistanceM, speedKmh: kmh, dt: min(dt, 5))
        }
        lastSampleAt = sample.lastUpdate
        // Feed the SESSION the covered-meters INCREMENT — the segment total lives there
        // (summed across all legs), which is what PERSISTS the distance and drives the
        // wrist mirror's belt ring. A rehydrated first sample yields inc 0 (the leg was
        // seeded to `before`), so a reopen never double-counts.
        let inc = legDistanceM - before
        if inc > 0 { session.sampleTreadmillDistance(deltaMeters: inc) }
    }

    /// On a REOPEN of the treadmill cover mid-run this model is fresh (legDistanceM 0)
    /// while the SESSION already holds the belt distance covered this segment. For a
    /// CONTINUOUS run (the segment IS the leg) restore the ring / auto-advance progress
    /// so re-opening never drops the tramo to zero; the odometer baseline is re-anchored
    /// on the first sample (baseline = reading − alreadyCovered). A structured / series
    /// leg can't be restored from the segment total (it mixes prior bouts), so it
    /// resumes at zero — the SEGMENT total is still persisted correctly.
    private func rehydrateContinuousLegFromSession() {
        guard !isStructured, !isSeries else { return }
        let already = session.lapBeltDistanceMeters
        guard already > 0 else { return }
        legDistanceM = already
        pendingRehydratedLegDistanceM = already
    }

    private func accumulateAverages(from sample: TreadmillSample) {
        guard !paused else { return }
        if let v = sample.speedKmh { speedSum += v; speedCount += 1 }
        if let v = sample.inclinePct {
            inclineSum += v; inclineCount += 1
            // Feed the belt grade into the SESSION so it averages incline over the
            // whole segment (across structured legs) into the ONE segment lap (#62).
            session.sampleTreadmillIncline(v)
        }
        if let v = currentBpm { bpmSum += v; bpmCount += 1 }
    }

    /// Drive the advance ONLY for legs we own; the session rolls the rest on its
    /// own clock. Fires once per leg.
    private func maybeAutoAdvance() {
        guard !paused, !isCountIn, !session.isAwaitingBlockStart else { return }
        let leg = currentLeg
        guard leg.ownsAutoAdvance, autoAdvancedLegKey != activeLegKey else { return }
        guard leg.goal.isComplete(distanceM: legDistanceM, elapsedS: legElapsedEffective) else { return }
        isComplete = true
        Haptics.success()
        autoAdvancedLegKey = activeLegKey
        session.primaryAdvance()   // segment for a continuous run, bout for a series
    }

    // MARK: - Leg state

    private func legKey() -> String {
        let seg = session.currentSegmentIndex
        if isStructured { return "\(seg)#struct#\(session.runLegIndex)" }
        guard isSeries else { return "\(seg)#single" }
        return "\(seg)#\(session.rotRoundIndex)#\(isWorkPhase ? "w" : "r")"
    }

    private func syncLeg() {
        let key = legKey()
        guard key != activeLegKey else { return }
        snapshotLeg(activeLegKey)
        activeLegKey = key
        resetLegState()
        // A new continuous-run leg → restart the coach's km-split cursor so splits
        // count from THIS leg's distance, not cumulatively across the workout (#63).
        if !isStructured, !isSeries, !currentLeg.isRecovery {
            AudioCoach.shared.enterContinuousRun()
        }
    }

    private func resetLegState() {
        legDistanceM = 0
        legElapsedS = 0
        isComplete = false
        legStartedAt = Date()
        pausedAccum = 0
        pauseStartedAt = paused ? Date() : nil
        distanceBaselineM = nil
        lastSampleAt = nil
        speedSum = 0; speedCount = 0
        inclineSum = 0; inclineCount = 0
        bpmSum = 0; bpmCount = 0
    }

    private func snapshotLeg(_ key: String) {
        guard !key.isEmpty else { return }
        measured[key] = TreadmillLegMeasurement(
            distanceM: legDistanceM,
            elapsedS: legElapsedS,
            avgSpeedKmh: speedCount > 0 ? speedSum / Double(speedCount) : nil,
            avgInclinePct: inclineCount > 0 ? inclineSum / Double(inclineCount) : nil,
            avgBpm: bpmCount > 0 ? bpmSum / bpmCount : nil
        )
    }
}
