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
    // hub's raw samples; `bleBpm` reads the hub's published strap value directly (the
    // strap→engine wiring lives in ActiveWorkoutView now, so this HUD only DISPLAYS
    // it — no per-screen callback that could drop the recording on dismiss).
    private(set) var latest = TreadmillSample()
    var bleBpm: Int? { hub.bleBpm }

    // Per-leg live accumulation (observed).
    private(set) var legDistanceM: Double = 0
    private(set) var legElapsedS: Double = 0
    private(set) var isComplete = false
    private(set) var paused = false

    /// Measured work per leg key — the in-memory seam for the persistence phase.
    private(set) var measured: [String: TreadmillLegMeasurement] = [:]

    // --- Machine control (drive the belt from the app + stay synced) ---
    /// What the connected belt lets us drive. `.none` (no controls) on a read-only
    /// machine or in a plain simulator. Seeded from the hub, refreshed on connect.
    private(set) var controlCapability = TreadmillControlCapability.none
    /// The speed the app has COMMANDED. It belongs to the speed stepper and to NOTHING
    /// else on the screen: it is what we asked the belt for, which is not what the belt is
    /// doing (`displaySpeedKmh` is). Showing both under the word "velocidad" is how the HUD
    /// once read "6.0" and "9.6" at the same time and contradicted itself.
    private(set) var targetSpeedKmh: Double = 0
    /// The incline target we've SET, in the unit THIS machine speaks: percent grade on a
    /// spec-clean belt, console LEVEL on the i.Concept family (`inclineIsLevel`). One
    /// stored value, one meaning per machine — the labels below carry the unit.
    private(set) var targetIncline: Double = 0
    /// Seconds left in the 3·2·1 pre-start countdown; nil when not counting.
    private(set) var startCountdown: Int?
    /// A transient message when the machine rejects a command / pulls control.
    private(set) var controlNotice: String?
    private var countdownTimer: Timer?
    /// The belt speed we DISPLAY, km/h — the honest reading even when the machine streams
    /// Instantaneous Speed as 0 while the belt runs (derived from the odometer then). nil
    /// only before any telemetry lands.
    var displaySpeedKmh: Double? { speedResolver.displaySpeedKmh ?? latest.speedKmh }
    /// The belt is MOVING per its real (resolver-derived) speed — the single source of truth
    /// for the START/STOP button, so it can never claim "running" while the belt is still,
    /// nor "stopped" while a T01_ runs with a frozen instantaneous-speed field.
    var beltMoving: Bool { (displaySpeedKmh ?? 0) > TreadmillConstants.minMovingSpeedKmh }
    /// Connected but SILENT: no telemetry has EVER landed (`lastUpdate` still at its
    /// `.distantPast` sentinel — many FTMS belts emit nothing until the band moves)
    /// or nothing for `sampleStaleSeconds`. Drives the honest "sin datos" hint in
    /// the HUD, the treadmill mirror of the erg's banner. Time-dependent: callers
    /// must re-evaluate on a clock tick (the HUD wraps it in a 1 s TimelineView).
    var telemetrySilent: Bool {
        guard treadmillLink.isLive else { return false }
        if latest.lastUpdate == .distantPast { return true }
        return Date().timeIntervalSince(latest.lastUpdate) > TreadmillConstants.sampleStaleSeconds
    }

    let session: WorkoutSession
    let hrMaxSource: HRMaxSource?

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
    // Odometer-health tracking: the last RAW machine odometer reading and how many
    // consecutive samples it has sat flat while the belt was moving. Lets us fall back
    // to speed integration when the machine's Total Distance is frozen/broken (see
    // `odometerIsLive`).
    private var lastOdometerRawM: Double?
    private var odometerStalledSamples = 0
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

    /// Turns the belt's messy telemetry into the honest speed we SHOW and a stable pace —
    /// deriving speed from the advancing odometer when the machine reports Instantaneous
    /// Speed as 0 (the BH i.Concept T01_ does exactly that while running). See
    /// `TreadmillSpeedResolver`.
    private var speedResolver = TreadmillSpeedResolver()

    init(session: WorkoutSession, hrMaxSource: HRMaxSource?, hub: DeviceHub) {
        self.session = session
        self.hrMaxSource = hrMaxSource
        self.hub = hub
    }

    /// Test seam — the auto-advance tests inject fake sources they drive directly;
    /// wrap them in a throwaway hub so they exercise the SAME ingest path as prod.
    convenience init(session: WorkoutSession, hrMaxSource: HRMaxSource?,
                     treadmill: TreadmillDataSource, hr: HeartRateSource) {
        self.init(session: session, hrMaxSource: hrMaxSource,
                  hub: DeviceHub(treadmill: treadmill, hr: hr))
    }

    // MARK: - Lifecycle

    func start() {
        activeLegKey = legKey()
        resetLegState()
        rehydrateContinuousLegFromSession()   // resume a reopened continuous run's covered distance
        // Consume the shared hub's belt telemetry (the belt may already be connected
        // from the brief). Subscribing — not owning the source — is what lets the
        // connection survive this HUD being dismissed and re-opened. The strap's bpm
        // is NOT taken here: it flows to the engine via ActiveWorkoutView and is read
        // back for display through `bleBpm` (hub.bleBpm), so a single owner feeds it.
        hub.onSample = { [weak self] in self?.ingest($0) }
        // Settle the chips into an honest state — these do NOT connect. Opening this
        // HUD used to silently reach for the remembered belt; a screen appearing is
        // never a reason to grab a machine. If nothing is linked, the guide's "Buscar
        // mi cinta" is the way in, and it goes through the list.
        hub.prepareTreadmill()
        hub.prepareHR()
        // Machine control (drive the belt + stay synced). Seed with whatever the hub
        // already knows — the belt may have connected (and reported capability) back in
        // the brief — then subscribe for updates.
        applyCapability(hub.treadmillControl)
        hub.onControlCapability = { [weak self] in self?.applyCapability($0) }
        hub.onMachineEvent = { [weak self] in self?.applyMachineEvent($0) }
        hub.onControlResult = { [weak self] in self?.applyControlResult($0) }
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
        // Only the belt sample slot is ours to release; the strap's onBpm belongs to
        // ActiveWorkoutView (engine wiring) and must stay live under this cover.
        hub.onSample = nil
        hub.onControlCapability = nil
        hub.onMachineEvent = nil
        hub.onControlResult = nil
        countdownTimer?.invalidate(); countdownTimer = nil
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

    // MARK: - Machine control (drive the belt + keep app ↔ belt in lock-step)

    private func applyCapability(_ cap: TreadmillControlCapability) {
        let dialectChanged = cap.inclineDialect != controlCapability.inclineDialect
        controlCapability = cap
        // Seed the steppers from the belt's ACTUAL reading the first time we learn we
        // can drive it, so they start where the machine already is (sync from the off).
        if cap.appMayDrive, targetSpeedKmh == 0 {
            let live = latest.speedKmh ?? 0
            targetSpeedKmh = live > TreadmillConstants.minMovingSpeedKmh ? live : (cap.speed?.min ?? 6.0)
            targetIncline = clampIncline(latest.inclineLevel ?? latest.inclinePct ?? 0)
        }
        // The incline units were re-resolved under us → the stored target is now a number
        // in a different unit, and its bounds moved with it. Re-clamp so the stepper can
        // never sit outside the range it is now being read against.
        if dialectChanged { targetIncline = clampIncline(targetIncline) }
        // A belt that just became controllable can be told what piece we're running, and can
        // be driven to the leg's prescribed incline (the one axis the T01_ actually obeys).
        programCurrentLegOnMachine()
        applyPrescribedInclineToMachine()
    }

    // MARK: - Programming the PIECE onto the machine's own display

    /// Push the current leg's goal to the belt's own console (FTMS Set Targeted Distance
    /// 0x0C / Set Targeted Training Time 0x0D), so the machine counts down the same tramo
    /// the app is running — the treadmill twin of what we already do on the erg.
    ///
    /// BEST EFFORT, ALWAYS. It is gated on the machine ADVERTISING the capability (unlike
    /// speed/incline, these ops really are optional in the spec — C.9 / C.10), it never
    /// blocks the run, and a refusal is swallowed into the trace instead of the HUD.
    private func programCurrentLegOnMachine() {
        guard controlCapability.appMayDrive else { return }
        let key = activeLegKey
        guard !key.isEmpty, programmedLegKey != key else { return }
        switch currentLeg.goal {
        case let .distance(meters) where controlCapability.canSetTargetDistance:
            programmedLegKey = key
            hub.sendTreadmillBestEffort(.setTargetedDistanceM(Int(meters.rounded())))
        case let .time(seconds) where controlCapability.canSetTargetTime:
            programmedLegKey = key
            hub.sendTreadmillBestEffort(.setTargetedTrainingTimeS(seconds))
        default:
            break
        }
    }
    /// The leg whose goal we already pushed — so a 0.5 s tick can't spam the Control Point.
    private var programmedLegKey: String?

    /// Drive the belt's INCLINE to the leg's PRESCRIBED grade, once per leg. This is the
    /// honest capability model at work: on the T01_ the app cannot set speed, but it CAN set
    /// incline, so when the coach prescribes one we apply it automatically (the treadmill twin
    /// of matching the target pace). Only when a leg actually prescribes an incline (> 0) —
    /// otherwise we LEAVE the belt where it is, never forcing it to flat. The athlete can
    /// still nudge afterwards; a new leg with its own prescription re-applies.
    private func applyPrescribedInclineToMachine() {
        guard canControlIncline else { return }
        let key = activeLegKey
        guard !key.isEmpty, prescribedInclineLegKey != key else { return }
        guard let pct = prescribedInclinePct, pct > 0 else { return }
        prescribedInclineLegKey = key
        // The prescription is a PERCENT. Both dialects speak percent (grade natively, the
        // i.Concept via its internal table where level == %), so the same number drives both.
        targetIncline = clampIncline(pct)
        hub.sendTreadmill(inclineCommand)
    }
    /// The leg whose prescribed incline we already drove — one physical incline move per leg.
    private var prescribedInclineLegKey: String?

    private func applyMachineEvent(_ event: TreadmillMachineEvent) {
        switch event {
        case .startedByUser, .stoppedByUser, .stoppedBySafetyKey, .pausedByUser:
            cancelStart()                                       // machine settled → drop any countdown
        case .targetSpeedChangedKmh(let v):   targetSpeedKmh = clampSpeed(v)     // console → app mirrors it
        // Both incline reports land in the SAME stored target — the machine only ever
        // sends the one that matches its own family.
        case .targetInclineChangedPct(let v):   targetIncline = clampIncline(v)
        case .targetInclineChangedLevel(let v): targetIncline = clampIncline(v)
        case .controlPermissionLost:          controlNotice = "La cinta retiró el control"
        // The machine confirming a programmed piece is good news with nothing to say —
        // the trace records it; the athlete doesn't need a banner for it.
        case .targetedDistanceChangedM, .targetedTrainingTimeChangedS: break
        case .reset, .other:                  break
        }
    }

    private func applyControlResult(_ result: TreadmillControlResult) {
        switch result {
        case .success:             controlNotice = nil
        case .controlNotPermitted: controlNotice = "La cinta no cedió el control"
        // A lying "op no soportado" must NOT alarm the athlete: this firmware answers 0x02
        // "not supported" to commands it actually obeys, so we (like qdomyos-zwift) ignore
        // the ack instead of flashing the old red "no admite ese ajuste" on every retry. For
        // the i.Concept family this never even reaches here (the sequencer drops the ack).
        case .notSupported:        controlNotice = nil
        default:                   controlNotice = "La cinta rechazó el comando"
        }
    }

    private func clampSpeed(_ v: Double) -> Double {
        guard let r = controlCapability.speed else { return max(0, v) }
        return min(r.max, max(r.min, v))
    }
    private func clampIncline(_ v: Double) -> Double {
        guard let r = controlCapability.incline else {
            // No range reported: a level-based machine still has a known console range.
            return inclineIsLevel ? FTMSInclineLevels.clampLevel(v) : v
        }
        return min(r.max, max(r.min, v))
    }
    private func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }

    // MARK: - Honest capability model (the two INDEPENDENT axes the HUD reads)

    /// The HUD paints a speed control — the stepper and belt START/STOP — only when this
    /// machine DECLARED it takes a speed target and hasn't refused one (and the app drives
    /// machines at all). False today on every belt we've met, so the athlete sets the speed
    /// on the console and we read what he ran.
    var canControlSpeed: Bool { controlCapability.offersSpeedControl }
    /// The same judgment for INCLINE, judged separately: a belt that takes an incline and
    /// refuses a speed gets exactly one control, not zero and not two.
    var canControlIncline: Bool { controlCapability.offersInclineControl }
    /// The app drives the incline but NOT the speed — the one case where the athlete needs
    /// telling, because half the machine answers to the app and half doesn't.
    var speedIsManual: Bool { canControlIncline && !canControlSpeed }

    /// Nudge the target belt speed by ±1 of the machine's own step (fallback 0.5 km/h).
    func nudgeSpeed(_ direction: Int) {
        guard canControlSpeed else { return }
        let step = controlCapability.speed?.step ?? 0.5
        targetSpeedKmh = round1(clampSpeed(targetSpeedKmh + Double(direction) * step))
        Haptics.light()
        hub.sendTreadmill(.setTargetSpeedKmh(targetSpeedKmh))
    }

    func nudgeIncline(_ direction: Int) {
        guard canControlIncline else { return }
        if inclineIsLevel {
            // The i.Concept moves in whole detents — one tap is one level, i.e. one percent.
            targetIncline = clampIncline((targetIncline + Double(direction) * FTMSInclineLevels.levelStep).rounded())
        } else {
            let step = controlCapability.incline?.step ?? 0.5
            targetIncline = round1(clampIncline(targetIncline + Double(direction) * step))
        }
        Haptics.light()
        // ONE place decides the units (the dialect the machine has answered to), so a
        // stepper tap and the countdown start can never disagree about what "3" means.
        hub.sendTreadmill(inclineCommand)
    }

    // MARK: - Incline units (honest per machine family)

    /// This belt encodes incline in the i.Concept internal 0–1000 units rather than 0.1 %
    /// grade — still a PERCENT to the athlete (level == %), just in WHOLE-percent detents, so
    /// the stepper moves 1 % per tap and shows no decimals.
    var inclineIsLevel: Bool { controlCapability.inclineIsLevel }
    /// Stepper caption + unit — always "Inclinación" / "%": both encodings drive a percent
    /// grade (the i.Concept level IS the percent), so we never hide it behind a bare "Nivel".
    var inclineControlLabel: String { controlCapability.inclineDialect.controlLabel }
    var inclineControlUnit: String { controlCapability.inclineDialect.controlUnit }
    /// The incline the app has COMMANDED — belongs to the stepper and nowhere else. It is
    /// what we asked for, not what the belt is doing; the screen must never show it beside
    /// `liveInclineText` under the same word.
    var inclineControlValue: String {
        inclineIsLevel ? String(Int(targetIncline.rounded())) : String(format: "%.1f", targetIncline)
    }
    /// The incline the belt REPORTS, labelled with its own unit ("Nivel 3" / "Inclinación
    /// 1.5 %"). nil when the machine sends none — the line then simply isn't drawn, rather
    /// than a "—" holding space for nothing.
    var liveInclineText: String? {
        let value: String? = inclineIsLevel
            ? latest.inclineLevel.map { String(Int($0.rounded())) }
            : latest.inclinePct.map { String(format: "%.1f", $0) }
        guard let value else { return nil }
        let unit = inclineControlUnit
        return unit.isEmpty ? "\(inclineControlLabel) \(value)" : "\(inclineControlLabel) \(value) \(unit)"
    }

    /// The command that sets the CURRENT incline target on THIS machine — one place
    /// decides the unit, so the countdown start and the stepper can't disagree.
    private var inclineCommand: TreadmillControlCommand {
        controlCapability.inclineDialect.command(for: targetIncline)
    }

    // MARK: - Field diagnosis (the "Modo de control" override)

    /// The rung currently on the wire, and the incline interpretation in force. Read by
    /// the diagnostics sheet so he can see what the app is doing without a new build.
    var controlStrategy: FTMSControlStrategy { controlCapability.strategy }
    var controlInclineDialect: FTMSInclineDialect { controlCapability.inclineDialect }

    /// Pin a prelude rung by hand (`nil` → back to the automatic ladder).
    func forceControlStrategy(_ strategy: FTMSControlStrategy?) {
        Haptics.light()
        hub.forceTreadmillStrategy(strategy)
    }

    /// Pin the incline interpretation by hand (`nil` → automatic).
    func forceInclineDialect(_ dialect: FTMSInclineDialect?) {
        Haptics.light()
        hub.forceTreadmillInclineDialect(dialect)
    }

    /// Send ONE speed target at the current rung — the 30-second test in the gym. Does not
    /// touch the athlete's own stepper value, so the HUD keeps saying what it was saying.
    func sendTestSpeed(_ kmh: Double) {
        Haptics.medium()
        hub.sendTreadmill(.setTargetSpeedKmh(kmh))
    }

    /// Send ONE incline target in a SPECIFIC interpretation, to settle the units question
    /// by watching the belt's own reading move (or not).
    func sendTestIncline(_ value: Double, dialect: FTMSInclineDialect) {
        Haptics.medium()
        hub.sendTreadmill(dialect.command(for: value))
    }

    /// The belt's RAW Inclination field, straight off Treadmill Data — what he compares
    /// against what he asked for, in the same units nRF Connect would show.
    var liveInclineRaw: Double? {
        if let level = latest.inclineLevel { return Double(FTMSInclineLevels.raw(forLevel: level)) }
        return latest.inclinePct.map { $0 * 10 }
    }

    /// Begin the belt with a 3·2·1 so the athlete can position — the belt NEVER lurches
    /// into motion without warning. On zero it starts and ramps to the set target.
    func startBelt() {
        // Only when the belt actually obeys start/speed. On a manual-speed machine START is
        // hidden (the athlete starts it on the console) — this guard is the belt-and-suspenders.
        guard canControlSpeed, startCountdown == nil, !beltMoving else { return }
        startCountdown = 3
        Haptics.medium()
        countdownTimer?.invalidate()
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self, let n = self.startCountdown else { return }
            if n <= 1 {
                self.startCountdown = nil
                self.countdownTimer?.invalidate(); self.countdownTimer = nil
                self.hub.sendTreadmill(.start)
                self.hub.sendTreadmill(.setTargetSpeedKmh(self.targetSpeedKmh))
                if self.controlCapability.canControlIncline {
                    self.hub.sendTreadmill(self.inclineCommand)
                }
                Haptics.success()
            } else {
                self.startCountdown = n - 1
                Haptics.light()
            }
        }
    }

    /// Escape hatch for the countdown (before the belt moves).
    func cancelStart() {
        startCountdown = nil
        countdownTimer?.invalidate(); countdownTimer = nil
    }

    /// Stop the belt now (also cancels a pending countdown).
    func stopBelt() {
        cancelStart()
        guard controlCapability.hasControlPoint else { return }
        Haptics.medium()
        hub.sendTreadmill(.stop)
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

    /// Live pace (sec/km) from the SMOOTHED, odometer-aware belt speed — stable, and "—:—"
    /// only after the belt is genuinely still, so it no longer flickers on a T01_ whose
    /// instantaneous-speed field reads 0 mid-run.
    var livePaceSecPerKm: Int? { speedResolver.paceSecPerKm }

    /// Preferred HR: the BLE strap when live, else the watch/HealthKit stream the
    /// workout already receives (Apple Watch works with no extra plumbing).
    var currentBpm: Int? {
        if hrLink.isLive, let b = bleBpm { return b }
        return session.liveHRBpm ?? bleBpm
    }

    /// The HR chip's link, labelled by WHO is actually recording (the engine's
    /// provenance), not merely by which channel is connected — so it never says
    /// "reloj" while the strap records, or vice-versa.
    ///   • strap    → the strap's real advertised name if its channel is live, else "banda"
    ///   • healthkit → "reloj" (Apple Watch / iPhone)
    ///   • pm5       → "remo" (a strap paired through the Concept2)
    ///   • none      → the channel's own state (so "buscando…" still shows while connecting)
    var effectiveHRLink: DeviceLink {
        switch session.hrSource {
        case .strap:     return hrLink.isLive ? hrLink : .connected(name: "banda")
        case .healthkit: return .connected(name: "reloj")
        case .pm5:       return .connected(name: "remo")
        case .none:      return hrLink
        }
    }

    /// HR zone from the athlete's resolved max (measured or 220−age). Nil without a
    /// max or HR — the HUD then hides the zone rather than inventing one.
    var liveZone: HRZone? {
        guard let bpm = currentBpm else { return nil }
        return PersonalHRMax.zone(forBpm: bpm, source: hrMaxSource)
    }
    /// True only when the zone comes from the 220−age estimate (label "estimada");
    /// false when it's the athlete's own measured max.
    var zoneIsEstimated: Bool { hrMaxSource?.isEstimated ?? false }

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
        if let v = sample.avgSpeedKmh { merged.avgSpeedKmh = v }
        if let v = sample.inclinePct { merged.inclinePct = v }
        if let v = sample.inclineLevel { merged.inclineLevel = v }
        if let v = sample.totalDistanceM { merged.totalDistanceM = v }
        if let v = sample.elapsedS { merged.elapsedS = v }
        if let v = sample.hrBpm { merged.hrBpm = v }
        merged.lastUpdate = sample.lastUpdate
        latest = merged

        // Feed the resolver the RAW instantaneous reading (a 0 must register as 0, not the
        // sticky merged value) alongside the cumulative odometer, so it can recover the real
        // belt speed when the machine freezes instantaneous speed at 0 mid-run.
        speedResolver.ingest(instantaneousKmh: sample.speedKmh,
                             avgKmh: sample.avgSpeedKmh,
                             odometerM: merged.totalDistanceM,
                             at: sample.lastUpdate)

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

    /// Whether the machine odometer can be trusted for THIS sample. It's trusted while
    /// it advances; the instant the belt is clearly moving but the odometer sits flat
    /// for `odometerStallGraceSamples`, we stop trusting it and let the caller integrate
    /// speed instead — a broken/frozen/coarse FTMS Total Distance (common on OEM belts
    /// like the Titanium/Exercycle) would otherwise freeze covered meters at zero even
    /// though speed reads fine. The stall count resets the moment the odometer moves
    /// again, so a healthy machine always wins.
    private func odometerIsLive(total: Double, speedKmh: Double?) -> Bool {
        defer { lastOdometerRawM = total }
        guard let last = lastOdometerRawM else { odometerStalledSamples = 0; return true }
        if total > last + TreadmillConstants.odometerAdvanceEpsilonM {
            odometerStalledSamples = 0
            return true
        }
        // Flat odometer. If the belt isn't really moving that's CORRECT (integration
        // would add nothing anyway), so keep trusting it. Only a flat odometer while the
        // belt runs is the failure we route around.
        guard (speedKmh ?? 0) > TreadmillConstants.minMovingSpeedKmh else { return true }
        odometerStalledSamples += 1
        return odometerStalledSamples < TreadmillConstants.odometerStallGraceSamples
    }

    private func updateLegDistance(from sample: TreadmillSample) {
        guard !paused else { lastSampleAt = sample.lastUpdate; return }
        let before = legDistanceM
        if let total = sample.totalDistanceM, odometerIsLive(total: total, speedKmh: sample.speedKmh) {
            // Prefer the machine's odometer WHILE IT IS ACTUALLY ADVANCING, zeroed at
            // this leg's first sample so any overshoot from a prior leg is discarded
            // (each leg counts from the reading at which it opens). On a cover REOPEN the
            // leg already covered `pendingRehydratedLegDistanceM`; anchor the baseline
            // below that reading so the ring resumes there, not at zero.
            if distanceBaselineM == nil {
                distanceBaselineM = total - (pendingRehydratedLegDistanceM ?? 0)
                pendingRehydratedLegDistanceM = nil
            }
            legDistanceM = max(legDistanceM, total - (distanceBaselineM ?? total))
        } else if let kmh = sample.speedKmh {
            // No odometer, OR the odometer is frozen while the belt runs → integrate
            // speed×time so the covered-meters readout keeps climbing. `max()` above
            // keeps the whole run monotonic if the odometer later resumes.
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
        // New tramo → tell the machine's own display what it is (best effort), and drive the
        // belt to this leg's prescribed incline if it has one (the axis the belt obeys).
        programCurrentLegOnMachine()
        applyPrescribedInclineToMachine()
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
        lastOdometerRawM = nil
        odometerStalledSamples = 0
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
