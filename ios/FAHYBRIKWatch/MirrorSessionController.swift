import Foundation
import Observation
import HealthKit

// MIRROR MODE — the wrist side of the 90% session. The iPhone drives the workout
// (the only engine); the watch RECORDS it (HKWorkoutSession + HKLiveWorkoutBuilder
// → HR / kcal / one saved HKWorkout) and renders frames the phone pushes. It never
// runs the engine here — the standalone WatchWorkoutCoordinator owns phone-less
// sessions and always wins a conflict.
//
// Transport is the HealthKit mirrored-session app-data channel: the phone launches
// this app with a HKWorkoutConfiguration (→ MirrorAppDelegate.handle), we build the
// session, beginCollection, then startMirroringToCompanionDevice(). Frames + end
// arrive on `didReceiveDataFromRemoteWorkoutSession`; HR + commands + the closing
// workout id go back via `sendToRemoteWorkoutSession`. Wire = MirrorWireModels.
@MainActor
@Observable
final class MirrorSessionController: NSObject {

    static let shared = MirrorSessionController()

    // MARK: - Published state

    enum State { case idle, recording, ending }
    private(set) var state: State = .idle
    /// Anything but idle → the wrist shows the mirror HUD (RootView gives it
    /// precedence over all standalone/idle content).
    var isActive: Bool { state != .idle }

    /// The last engine snapshot the phone pushed — the HUD renders only what's here,
    /// never a fabricated value.
    private(set) var frame: MirrorStateFrame?
    /// When `frame` landed — the HUD re-bases its local clock from this instant while
    /// the phase is active (it ticks between frames; a new frame re-bases it).
    private(set) var frameReceivedAt: Date?
    /// Wrist HR for the local zone bar (nil until the sensor streams).
    private(set) var liveHR: Int?
    /// No frame within the watchdog window — recording CONTINUES; the controls page
    /// then offers a local save/discard so a lost phone never traps a live HKWorkout.
    private(set) var isConnectionLost = false

    /// Live HR mapped to its zone for the wrist tint.
    ///
    /// Reads the SAME server-resolved bands the phone's engine records against
    /// (pushed with the day and persisted by `WatchPlanModel`). It used to classify
    /// against a hardcoded 190 bpm "for colour only", which meant the wrist could
    /// paint a beat Z3 while the phone filed the same beat as Z2. Nil when the
    /// athlete has no zones: the wrist shows the pulse with no tint, which is the
    /// truth, rather than a colour derived from a made-up ceiling.
    var liveZone: HRZone? {
        guard let zones = WatchPlanModel.shared.today?.athleteHrZones else { return nil }
        return liveHR.flatMap { zones.zone(forBpm: $0) }
    }

    // MARK: - Tuning

    /// Recording keeps going when the phone goes quiet; past this gap the wrist
    /// surfaces a local exit.
    private static let connectionLostAfter: TimeInterval = 15
    /// Minimum spacing between wrist-HR relays to the phone (the sensor collects
    /// faster than the engine needs).
    private static let hrRelayMinInterval: TimeInterval = 1
    /// Confirmation beat on the "Guardando…" screen before returning to idle.
    private static let savedBeat: Duration = .milliseconds(900)

    // MARK: - HealthKit

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// Local intent flag so a run of paused frames never double-pauses the session.
    private var hkPaused = false
    /// Set while we drive the teardown, so the session's own `.ended` callback can't
    /// re-enter the close path.
    private var isClosing = false
    private var lastHRRelayAt: Date = .distantPast
    /// Later of "recording started" and "last frame" — the watchdog reference.
    private var lastSignalAt: Date = .distantPast
    private var watchdog: Timer?
    /// Last haptic seq played — de-dupes dedicated packets vs frame-embedded cues.
    private var lastHapticSeq: Int = 0

    private override init() { super.init() }

    // MARK: - Start

    /// Phone launched us with a workout config. Stand up the recording UNLESS a
    /// standalone (phone-less) session is already running — that one wins.
    func start(config: HKWorkoutConfiguration) {
        guard state == .idle, WatchWorkoutCoordinator.shared.phase == .idle else { return }
        state = .recording
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        isConnectionLost = false
        hkPaused = false
        isClosing = false

        Task {
            await LiveWorkoutSession.requestWorkoutAuthorization(store: store)
            beginRecording(config: config)
        }
    }

    private func beginRecording(config: HKWorkoutConfiguration) {
        guard state == .recording, session == nil else { return }
        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { [weak self] _, _ in
                Task { @MainActor in self?.beginMirroring() }
            }
        } catch {
            resetToIdle()
        }
    }

    private func beginMirroring() {
        guard let session, state == .recording else { return }
        lastSignalAt = Date()
        startWatchdog()
        requestSyncUntilFirstFrame()
        WatchHaptics.start()
        Task { try? await session.startMirroringToCompanionDevice() }
    }

    // MARK: - Incoming (phone → watch)

    private func handleRemote(_ data: Data) {
        guard let envelope = MirrorEnvelope.decoding(data) else { return }
        switch envelope.type {
        case MirrorWire.MessageType.frame:
            if let f = envelope.body(as: MirrorStateFrame.self) { applyFrame(f) }
        case MirrorWire.MessageType.end:
            if let e = envelope.body(as: MirrorEnd.self) { finish(save: e.save) }
        case MirrorWire.MessageType.haptic:
            // Engine cue from the phone — play on the wrist immediately.
            if let h = envelope.body(as: MirrorHaptic.self) {
                playEngineCue(h.cue, seq: h.seq)
            }
        default:
            break                       // tolerant: a newer phone may speak more types
        }
    }

    /// Map a wire cue name to the watch-side `Haptics.cue*` vocabulary.
    /// `seq` de-dupes when the same cue also rides on a frame.
    private func playEngineCue(_ cue: String, seq: Int?) {
        if let seq {
            guard seq > lastHapticSeq else { return }
            lastHapticSeq = seq
        }
        switch cue {
        case MirrorWire.HapticCue.tick:   Haptics.cueTick()
        case MirrorWire.HapticCue.go:     Haptics.cueGo()
        case MirrorWire.HapticCue.change: Haptics.cueChange()
        case MirrorWire.HapticCue.stop:   Haptics.cueStop()
        case MirrorWire.HapticCue.finish: Haptics.cueFinish()
        default:
            // Unknown future cue — a firm start is better than silence.
            Haptics.cueGo()
        }
    }

    private func applyFrame(_ f: MirrorStateFrame) {
        // Path B: cue embedded on the frame (redundancy for a dropped haptic packet).
        if let cue = f.hapticCue {
            playEngineCue(cue, seq: f.hapticSeq)
        }
        // Path C: edge-detect phase / rest / countdown seconds from consecutive frames.
        fireHaptics(from: frame, to: f)
        frame = f
        frameReceivedAt = Date()
        lastSignalAt = frameReceivedAt ?? Date()
        isConnectionLost = false
        applyPhase(f.phase)
    }

    /// Local edge-detect as a third path: even if dedicated + embedded packets
    /// are lost, a 1 Hz frame stream of countdown/rest seconds still fires cues.
    private func fireHaptics(from old: MirrorStateFrame?, to new: MirrorStateFrame) {
        let oldPhase = old?.phase
        let newPhase = new.phase

        // Countdown second drop (3→2→1 of count-in OR last 3s of EMOM/AMRAP).
        if let newCD = new.countdownRemaining {
            let newCeil = max(0, Int(ceil(newCD)))
            if let oldCD = old?.countdownRemaining {
                let oldCeil = max(0, Int(ceil(oldCD)))
                if newCeil < oldCeil {
                    if newCeil > 0, newCeil <= 3 {
                        Haptics.cueTick()
                    } else if newCeil == 0, oldCeil > 0 {
                        Haptics.cueGo()
                    }
                }
            }
        }

        // GO — count-in ends, or a block gate starts work.
        if oldPhase == MirrorWire.Phase.countIn && newPhase == MirrorWire.Phase.active {
            Haptics.cueGo()
        } else if oldPhase == MirrorWire.Phase.gate && newPhase == MirrorWire.Phase.active {
            Haptics.cueGo()
        }

        // Rest appears → STOP; rest clears → GO.
        let oldRest = old?.restRemaining ?? 0
        let newRest = new.restRemaining ?? 0
        if oldRest <= 0, newRest > 0 {
            Haptics.cueStop()
        } else if oldRest > 0, newRest <= 0 {
            Haptics.cueGo()
        } else if oldRest > 0, newRest > 0 {
            // Rest last 3 seconds.
            let oldCeil = Int(ceil(oldRest))
            let newCeil = Int(ceil(newRest))
            if newCeil < oldCeil, newCeil > 0, newCeil <= 3 {
                Haptics.cueTick()
            }
        }

        if newPhase == MirrorWire.Phase.finished, oldPhase != MirrorWire.Phase.finished {
            Haptics.cueFinish()
        }
    }

    /// Mirror the engine's pause state onto the HK session so paused/rest minutes
    /// don't accrue kcal and no rest-HR reaches the recording.
    private func applyPhase(_ phase: String) {
        switch phase {
        case MirrorWire.Phase.paused:
            if !hkPaused { session?.pause(); hkPaused = true }
        case MirrorWire.Phase.active, MirrorWire.Phase.gate, MirrorWire.Phase.countIn:
            // The count-in is live recording (the athlete is about to move) — resume
            // the HK session like active/gate, never leave it paused into a tramo.
            if hkPaused { session?.resume(); hkPaused = false }
        default:
            break                       // finished → handled by the end handshake
        }
    }

    /// Pide el frame actual al teléfono hasta que llegue el PRIMERO (0,5 s · 2 s ·
    /// 5 s). Sin esto, una app de watch que arranca en frío con el iPhone ya en
    /// background se quedaba en 0:00 (IMG_2387): el heartbeat del teléfono es un
    /// timer y los timers no corren en background; este comando sí lo despierta.
    private func requestSyncUntilFirstFrame() {
        for delay in [0.5, 2.0, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.state == .recording, self.frame == nil else { return }
                self.sendCommand(MirrorWire.CommandKind.sync)
            }
        }
    }

    // MARK: - Outgoing (watch → phone)

    /// A wrist control tap relayed to the phone's engine (it is the only mutator).
    func sendCommand(_ kind: String) {
        send(type: MirrorWire.MessageType.command, MirrorCommand(kind: kind))
    }

    private func relayHR(_ bpm: Int) {
        let now = Date()
        guard now.timeIntervalSince(lastHRRelayAt) >= Self.hrRelayMinInterval else { return }
        lastHRRelayAt = now
        send(type: MirrorWire.MessageType.hr, MirrorHRSample(bpm: bpm))
    }

    private func send<P: Encodable>(type: String, _ payload: P) {
        guard let session, let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    // MARK: - End

    /// Phone-driven end: save (finish the HKWorkout) or discard (the athlete exited
    /// without recording — no workout lands).
    private func finish(save: Bool) {
        guard state == .recording else { return }
        state = .ending
        Task { await closeRecording(save: save) }
    }

    /// Lost-phone exit from the controls page: keep the workout (it lands in Apple
    /// Health; the phone/backend HealthKit sync ingests it later) or drop it. Relay
    /// MirrorEnded too in case the channel revives before teardown.
    func finishLocally() {
        guard state == .recording else { return }
        state = .ending
        Task { await closeRecording(save: true) }
    }

    func discardLocally() {
        guard state == .recording else { return }
        state = .ending
        Task { await closeRecording(save: false) }
    }

    private func closeRecording(save: Bool) async {
        isClosing = true
        stopWatchdog()

        var workoutUuid: String?
        if save {
            workoutUuid = await endAndSave()
        } else {
            builder?.discardWorkout()
        }
        // Relay the finished id BEFORE ending the session (awaited, not fire-and-
        // forget, so it clears the channel first) — best-effort; the fallback is the
        // phone's HealthKit ingest of the same workout, deduped on source_workout_ref.
        if let session, let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended, MirrorEnded(workoutUuid: workoutUuid)
        ) {
            try? await session.sendToRemoteWorkoutSession(data: data)
        }
        session?.end()

        WatchHaptics.success()
        try? await Task.sleep(for: Self.savedBeat)
        resetToIdle()
    }

    /// End collection and save the HKWorkout, returning its UUID string (nil on a
    /// save failure). The workout is the source of truth the phone tags its
    /// execution with.
    private func endAndSave() async -> String? {
        guard let builder else { return nil }
        do {
            try await builder.endCollection(at: Date())
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            return nil
        }
    }

    private func resetToIdle() {
        stopWatchdog()
        session = nil
        builder = nil
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        isConnectionLost = false
        hkPaused = false
        isClosing = false
        state = .idle
    }

    // MARK: - Connection watchdog

    private func startWatchdog() {
        stopWatchdog()
        let t = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkConnection() }
        }
        RunLoop.main.add(t, forMode: .common)
        watchdog = t
    }

    private func checkConnection() {
        guard state == .recording else { return }
        isConnectionLost = Date().timeIntervalSince(lastSignalAt) > Self.connectionLostAfter
    }

    private func stopWatchdog() {
        watchdog?.invalidate()
        watchdog = nil
    }
}

// MARK: - HKWorkoutSessionDelegate

extension MirrorSessionController: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in
            for packet in data { self?.handleRemote(packet) }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            guard let self, toState == .ended, !self.isClosing, self.state == .recording else { return }
            // An external end we didn't drive (rare) → return the wrist to idle
            // without a second teardown.
            self.resetToIdle()
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self, !self.isClosing else { return }
            self.resetToIdle()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension MirrorSessionController: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        guard collectedTypes.contains(HKQuantityType(.heartRate)) else { return }
        let stats = workoutBuilder.statistics(for: HKQuantityType(.heartRate))
        Task { @MainActor [weak self] in self?.applyHR(stats) }
    }

    @MainActor
    private func applyHR(_ stats: HKStatistics?) {
        guard let q = stats?.mostRecentQuantity() else { return }
        let bpm = Int(q.doubleValue(for: .count().unitDivided(by: .minute())).rounded())
        guard bpm > 0 else { return }
        liveHR = bpm
        relayHR(bpm)
    }
}
