import Foundation

// The op pipeline that actually makes a treadmill OBEY. Pure Foundation — no
// CoreBluetooth — so every rule below is unit-testable with a fake clock.
//
// WHY THIS EXISTS: writing FTMS control commands "as they come" does not drive a real
// machine. Four things break it, and each has a rule here:
//
//  1. SERIALIZATION. The Fitness Machine Control Point runs ONE procedure at a time.
//     A second write before the previous op's 0x80 indication is answered with ATT
//     "Procedure Already In Progress" and is simply lost. So: one write in flight,
//     released by the matching indication or a timeout — never two at once.
//
//  2. CCCD ORDERING. Writing to the Control Point before its indications are enabled
//     earns ATT "CCC Improperly Configured". So: nothing leaves the queue until the
//     transport says go. (The transport gives up waiting after a short grace — a machine
//     that never confirms its descriptor must not silently disable every button.)
//
//  3. THE PRELUDE DIALECT. Machines disagree on what must precede a target write, and
//     they LIE about it in their feature word. So we do not guess: we climb a LADDER of
//     strategies (S1…S5, see FTMSControlStrategy) and let the belt pick the winner —
//     did it actually move? The rung that works sticks for the session.
//
//  4. THE INCLINE UNITS. The Inclination field is grade × 0.1 % on most machines and an
//     internal 0…1000 console scale on others. Same empirical treatment: ask, watch what
//     the machine reports back, keep the interpretation that matched.
//
// The two ladders are INDEPENDENT. Speed proves the prelude (axis 3); incline proves the
// units (axis 4). An incline that never confirms can therefore never destabilise a speed
// path that is already working.
//
// Control permission, once granted, persists until the machine says otherwise: a Machine
// Status 0xFF (Control Permission Lost), a Reset, or a reconnect (FTMS §4.16.2.1).

/// Timings for the control pipeline. All in seconds.
enum FTMSControlTuning {
    /// How long a WAITED PRELUDE (Request Control / Reset / Start) may take to answer.
    /// The vendor sequence for his machine is explicit — write 0x00, WAIT for `80 00 01`,
    /// only then the target — so this must be generous enough for a slow firmware to
    /// answer before we move on. It is a backstop, not a skip.
    static let preludeAckTimeoutSeconds: TimeInterval = 1.5
    /// How long a REAL op waits for its 0x80 before we release the pipeline. Short on
    /// purpose: a target's ack is not what tells us it worked (the belt moving is), and a
    /// stuck pipeline means the athlete's next stepper tap does nothing at all.
    static let ackTimeoutSeconds: TimeInterval = 0.6
    /// Fire-and-forget prelude ops (the qdomyos-zwift hammer doesn't wait either) release
    /// on the write ack, with this as the backstop.
    static let preludeTimeoutSeconds: TimeInterval = 0.3
    /// S4's settling pause between the Start and the target.
    static let interOpDelaySeconds: TimeInterval = 0.3
    /// How long an issued target has to actually MOVE the machine before we conclude this
    /// dialect isn't the one and climb a rung.
    static let targetVerificationSeconds: TimeInterval = 5
    /// Belt speed this close to the target counts as "arrived".
    static let speedConvergenceToleranceKmh: Double = 0.3
    /// Belt speed moving at least this much TOWARD the target counts as "the machine is
    /// responding" — a long ramp must not be mistaken for a machine ignoring us.
    static let speedResponseEpsilonKmh: Double = 0.3
    /// Raw Inclination units (0.1 % / internal) within which a reported incline counts as
    /// having reached what we asked for.
    static let inclineConvergenceToleranceRaw: Double = 6
    /// Raw Inclination movement toward the request that counts as "it heard us".
    static let inclineResponseEpsilonRaw: Double = 4
}

/// Serializes Control Point ops, owns the Request-Control lifecycle, and RESOLVES the
/// machine's dialect empirically. One instance per connection (`reset()` on connect).
final class FTMSControlSequencer {

    // MARK: - Outputs (the transport wires these)

    /// Write these bytes to the Control Point. Exactly one call is outstanding at a time.
    var onWrite: ((Data) -> Void)?
    /// The ack of a command the CALLER asked for. Prelude ops we injected ourselves, and
    /// best-effort workout programming, are deliberately NOT reported — the athlete must
    /// never see "no soportado" for something we added behind their back.
    var onResult: ((TreadmillControlResult) -> Void)?
    /// One readable trace line per TX / RX / decision, for the shareable diagnostics.
    var onDiagnostic: ((String) -> Void)?
    /// Fired when the prelude strategy changes (escalation, manual override, connect).
    var onStrategyChange: ((FTMSControlStrategy) -> Void)?
    /// Fired when the incline interpretation changes.
    var onInclineDialectChange: ((FTMSInclineDialect) -> Void)?

    // MARK: - State

    private(set) var profile: FTMSControlProfile = .standard
    /// The rung currently on the wire.
    private(set) var strategy: FTMSControlStrategy = .s2
    /// The belt confirmed a target under `strategy` — stop climbing, this is the dialect.
    private(set) var strategyConfirmed = false
    /// The athlete pinned a rung by hand in the field-diagnosis screen; automatic
    /// escalation stands down so what he selects is what goes on the wire.
    private(set) var isStrategyPinned = false
    /// How the Inclination field is being interpreted right now.
    private(set) var inclineDialect: FTMSInclineDialect = .grade
    private(set) var inclineDialectConfirmed = false
    private(set) var isInclineDialectPinned = false
    /// Whether the machine has GRANTED control (S2's once-per-grant bookkeeping).
    private(set) var hasControl = false
    /// The transport says writes may leave.
    private(set) var isTransportReady = false
    /// The Control Point actually indicates/notifies. When it does NOT, waiting for a
    /// 0x80 that can never arrive would stall every op for its whole timeout.
    private(set) var controlPointIndicates = true

    private var ladder: [FTMSControlStrategy] = FTMSControlProfile.standard.strategyLadder
    private var ladderIndex = 0
    private var inclineLadder: [FTMSInclineDialect] = FTMSControlProfile.standard.inclineDialectLadder
    private var inclineLadderIndex = 0

    private let schedule: (TimeInterval, @escaping () -> Void) -> Void

    /// `schedule` is injected so tests drive the timeouts deterministically instead of
    /// sleeping. Production uses the main queue — the same queue CoreBluetooth calls back
    /// on, so all state below is single-threaded by construction.
    init(schedule: @escaping (TimeInterval, @escaping () -> Void) -> Void = { seconds, work in
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
         }) {
        self.schedule = schedule
    }

    /// One wire-level op. A single caller command expands into several of these (the
    /// prelude its strategy requires), each serialized independently.
    private struct Op {
        /// nil for a pure settling pause (S4) — it occupies the pipeline and writes nothing.
        let data: Data?
        let opCode: UInt8?
        /// Seconds this op simply waits, when it is a pause.
        let pauseSeconds: TimeInterval?
        /// We injected it — suppress its result from the UI.
        let isPrelude: Bool
        /// Programming the machine's display: nice-to-have, never an error, never escalates.
        let isBestEffort: Bool
        /// Wait for the 0x80 indication (true) or release on the write ack (false).
        let waitsForIndication: Bool
        /// The op code of the CALLER command this op belongs to — lets a newer tap on the
        /// same stepper supersede a whole queued chain instead of piling up behind it.
        let group: UInt8
        /// The speed this op targets, when it's a speed target — armed for verification.
        let verifySpeedKmh: Double?
        /// (raw field value we asked for, the athlete-facing number) for an incline target.
        let verifyIncline: (raw: Int, value: Double)?
    }

    private var queue: [Op] = []
    private var inFlight: Op?
    /// Bumped on every emit and every release so a stale timeout can't release the op
    /// that came after the one it was scheduled for.
    private var releaseGeneration = 0

    // Verification (the belt is the authority).
    private var speedVerification: (target: Double, speedAtArm: Double)?
    private var speedVerificationGeneration = 0
    private var inclineVerification: (expectedRaw: Double, rawAtArm: Double?, value: Double)?
    private var inclineVerificationGeneration = 0
    private var lastBeltSpeedKmh: Double = 0
    private var lastInclineRaw: Double?
    private var lastSpeedTargetKmh: Double?
    private var lastInclineTargetValue: Double?

    // MARK: - Connection lifecycle

    /// New peripheral / disconnect: drop everything. Control permission does NOT survive
    /// a reconnect, so the next command re-requests it. The DIALECT we learned about this
    /// machine is carried in by the transport (it belongs to the machine, not the link).
    func reset(profile newProfile: FTMSControlProfile = .standard,
               strategy learnedStrategy: FTMSControlStrategy? = nil,
               inclineDialect learnedDialect: FTMSInclineDialect? = nil) {
        queue.removeAll()
        inFlight = nil
        releaseGeneration += 1
        speedVerification = nil
        inclineVerification = nil
        speedVerificationGeneration += 1
        inclineVerificationGeneration += 1
        hasControl = false
        isTransportReady = false
        controlPointIndicates = true
        lastBeltSpeedKmh = 0
        lastInclineRaw = nil
        lastSpeedTargetKmh = nil
        lastInclineTargetValue = nil
        strategyConfirmed = false
        inclineDialectConfirmed = false
        isStrategyPinned = false
        isInclineDialectPinned = false
        profile = newProfile
        ladder = newProfile.strategyLadder
        inclineLadder = newProfile.inclineDialectLadder
        ladderIndex = learnedStrategy.flatMap { ladder.firstIndex(of: $0) } ?? 0
        inclineLadderIndex = learnedDialect.flatMap { inclineLadder.firstIndex(of: $0) } ?? 0
        strategy = ladder[ladderIndex]
        inclineDialect = inclineLadder[inclineLadderIndex]
    }

    /// Adopt a detected family (idempotent). Only re-seeds the ladders while nothing has
    /// been proven yet — a rung the machine already confirmed is never thrown away.
    func adoptProfile(_ newProfile: FTMSControlProfile) {
        guard newProfile != profile, !strategyConfirmed, !isStrategyPinned else { return }
        profile = newProfile
        ladder = newProfile.strategyLadder
        inclineLadder = newProfile.inclineDialectLadder
        ladderIndex = 0
        inclineLadderIndex = 0
        log("Familia detectada: \(newProfile.label) — escalera \(ladder.map(\.rung).joined(separator: " → "))")
        setStrategy(ladder[0], reason: "familia detectada")
        setInclineDialect(inclineLadder[0], reason: "familia detectada")
    }

    /// The transport will accept writes now. `indications` is false when the Control Point
    /// has no indicate/notify property at all — nothing will ever ack, so no op waits.
    func transportReady(indications: Bool = true) {
        controlPointIndicates = indications
        guard !isTransportReady else { return }
        isTransportReady = true
        log("Punto de control LISTO (acks: \(indications ? "sí" : "no")) — vaciando cola (\(queue.count))")
        pump()
    }

    // MARK: - Input from the caller

    /// State an intent. We own the prelude, the ordering, the retries and the dialect.
    func send(_ command: TreadmillControlCommand) {
        remember(command)
        enqueue(expand(command, isBestEffort: false))
    }

    /// Programming the machine's own display (targeted distance / time). Best effort: a
    /// refusal is logged and swallowed — it must never show the athlete an error and never
    /// move the ladder, because the run works fine without it.
    func sendBestEffort(_ command: TreadmillControlCommand) {
        enqueue(expand(command, isBestEffort: true))
    }

    /// Send an incline target in whatever dialect is currently believed. The caller states
    /// a NUMBER (what the stepper shows); this decides the units.
    func sendIncline(value: Double) {
        send(inclineDialect.command(for: value))
    }

    /// Pin a rung by hand (field diagnosis). `nil` hands control back to the ladder.
    func forceStrategy(_ forced: FTMSControlStrategy?) {
        guard let forced else {
            isStrategyPinned = false
            log("Modo de control: AUTOMÁTICO otra vez (escalera activa desde \(strategy.rung))")
            return
        }
        isStrategyPinned = true
        strategyConfirmed = false
        ladderIndex = ladder.firstIndex(of: forced) ?? ladderIndex
        setStrategy(forced, reason: "forzado a mano")
    }

    /// Pin the incline interpretation by hand. `nil` returns it to automatic.
    func forceInclineDialect(_ forced: FTMSInclineDialect?) {
        guard let forced else {
            isInclineDialectPinned = false
            log("Inclinación: interpretación AUTOMÁTICA otra vez (\(inclineDialect.label))")
            return
        }
        isInclineDialectPinned = true
        inclineDialectConfirmed = false
        inclineLadderIndex = inclineLadder.firstIndex(of: forced) ?? inclineLadderIndex
        setInclineDialect(forced, reason: "forzada a mano")
    }

    // MARK: - Input from the transport

    /// A Control Point indication landed (0x80 …).
    func handleIndication(_ data: Data) {
        guard let resp = FTMSControl.decodeResponse(data) else {
            log("RX punto de control NO decodificable [\(Self.hex(data))]")
            return
        }
        log("RX 0x80 ← \(Self.hexByte(resp.request)) \(FTMSControl.opName(resp.request)) = "
            + FTMSControl.resultName(resp.result))

        if resp.request == FTMSControl.requestOpCode(for: .requestControl) {
            switch resp.result {
            case .success:
                hasControl = true
            case .notSupported:
                // Some firmwares reject the ask because control is already ours.
                hasControl = true
                log("La máquina no admite pedir control — se asume concedido")
            default:
                hasControl = false
            }
        }
        if resp.result == .controlNotPermitted { hasControl = false }

        guard let flight = inFlight, flight.opCode == resp.request else {
            // Late / unsolicited ack. Surface only a real failure on a real target op —
            // a stray prelude ack must not raise a false alarm in the HUD.
            if resp.result != .success, resp.request != FTMSControl.requestOpCode(for: .requestControl),
               resp.request != FTMSControl.requestOpCode(for: .start) {
                onResult?(resp.result)
            }
            return
        }
        if !flight.isPrelude, !flight.isBestEffort { onResult?(resp.result) }
        if flight.isBestEffort, resp.result != .success {
            log("La máquina no aceptó programar el tramo en su pantalla — seguimos igual, no bloquea nada")
        }
        // "Control Not Permitted" on a REAL target is the machine telling us, in so many
        // words, that this prelude is wrong. No point waiting out the 5 s verification.
        let deniedTarget = resp.result == .controlNotPermitted && !flight.isPrelude && !flight.isBestEffort
        release()
        if deniedTarget {
            escalateStrategy(reason: "la máquina respondió CONTROL NO PERMITIDO (0x05) al objetivo")
        }
    }

    /// CoreBluetooth finished (or failed) the write of the op in flight.
    func noteWriteCompleted(error: Error?) {
        guard let flight = inFlight else { return }
        if let error {
            log("ERROR de escritura en \(Self.hexByte(flight.opCode ?? 0)) "
                + "\(FTMSControl.opName(flight.opCode ?? 0)): \(error.localizedDescription)")
            if !flight.isPrelude, !flight.isBestEffort { onResult?(.operationFailed) }
            release()
            return
        }
        // Fire-and-forget prelude ops don't wait for an indication that may never come —
        // and on a Control Point without indications, NOTHING waits.
        if !flight.waitsForIndication { release() }
    }

    /// A Machine Status (0x2ADA) event landed.
    func handleMachineEvent(_ event: TreadmillMachineEvent) {
        log("RX 0x2ADA \(Self.describe(event))")
        switch event {
        case .controlPermissionLost:
            hasControl = false
            log("Permiso de control PERDIDO — se volverá a pedir en el próximo comando")
        case .reset:
            hasControl = false
            forgetSpeedIntent(reason: "la máquina se reinició")
        case .stoppedByUser, .pausedByUser, .stoppedBySafetyKey:
            // The belt stopped on its own console (or the safety key came out). Whatever
            // we were about to retry, we are not restarting this belt behind his back.
            forgetSpeedIntent(reason: "la cinta paró desde su consola / llave de seguridad")
        case .targetSpeedChangedKmh:
            // The machine APPLIED our speed target — the strongest possible confirmation.
            confirmSpeed(reason: "Machine Status 0x05 (objetivo de velocidad aplicado)")
        case .targetInclineChangedPct, .targetInclineChangedLevel:
            confirmIncline(reason: "Machine Status 0x06 (objetivo de inclinación aplicado)")
        case .targetedDistanceChangedM(let m):
            log("La cinta programó \(m) m en su pantalla")
        case .targetedTrainingTimeChangedS(let s):
            log("La cinta programó \(s) s en su pantalla")
        default:
            break
        }
    }

    /// Live belt speed from Treadmill Data — the verification signal for the PRELUDE axis.
    func noteBeltSpeed(kmh: Double) {
        lastBeltSpeedKmh = kmh
        guard let v = speedVerification else { return }
        let converged = abs(kmh - v.target) <= FTMSControlTuning.speedConvergenceToleranceKmh
        let movedToward = v.target > v.speedAtArm
            ? (kmh - v.speedAtArm) >= FTMSControlTuning.speedResponseEpsilonKmh
            : (v.speedAtArm - kmh) >= FTMSControlTuning.speedResponseEpsilonKmh
        if converged || movedToward {
            confirmSpeed(reason: String(format: "la cinta se movió hacia el objetivo (%.1f km/h)", kmh))
        }
    }

    /// Raw Inclination field reading — the verification signal for the UNITS axis, and the
    /// field-calibration capture. Logged only when it CHANGES, so the trace stays readable.
    func noteInclineRaw(_ raw: Double) {
        if lastLoggedInclineRaw == nil || abs(raw - (lastLoggedInclineRaw ?? 0)) >= 1 {
            lastLoggedInclineRaw = raw
            let asPct = String(format: "%.1f %%", raw / 10)
            let asLevel = String(format: "nivel %.2f", FTMSInclineLevels.level(forRaw: raw))
            log("RX inclinación cruda = \(Int(raw.rounded()))  (como % → \(asPct) · como nivel → \(asLevel))")
        }
        lastInclineRaw = raw
        guard let v = inclineVerification else { return }
        let converged = abs(raw - v.expectedRaw) <= FTMSControlTuning.inclineConvergenceToleranceRaw
        let movedToward: Bool = {
            guard let at = v.rawAtArm else { return false }
            return v.expectedRaw > at
                ? (raw - at) >= FTMSControlTuning.inclineResponseEpsilonRaw
                : (at - raw) >= FTMSControlTuning.inclineResponseEpsilonRaw
        }()
        if converged || movedToward {
            confirmIncline(reason: "la inclinación de la cinta fue hacia el valor pedido "
                           + "(cruda \(Int(raw.rounded())), pedida \(Int(v.expectedRaw.rounded())))")
        }
    }
    private var lastLoggedInclineRaw: Double?

    // MARK: - Pipeline

    private func remember(_ command: TreadmillControlCommand) {
        switch command {
        case .setTargetSpeedKmh(let kmh): lastSpeedTargetKmh = kmh
        case .setTargetInclinePct(let v), .setTargetInclineLevel(let v): lastInclineTargetValue = v
        case .stop, .pause, .reset: forgetSpeedIntent(reason: "el atleta paró la cinta")
        default: break
        }
    }

    /// SAFETY. Escalation re-sends the athlete's last speed target through the new rung —
    /// which must NEVER resurrect a belt he has just stopped. A stop (his, the machine's,
    /// or the safety key's) cancels the pending verification AND forgets the speed intent,
    /// so a timer that fires afterwards has nothing to restart.
    private func forgetSpeedIntent(reason: String) {
        guard speedVerification != nil || lastSpeedTargetKmh != nil else { return }
        speedVerification = nil
        speedVerificationGeneration += 1
        lastSpeedTargetKmh = nil
        log("Objetivo de velocidad OLVIDADO — \(reason). Nada va a reenviarlo.")
    }

    /// Append a chain, superseding any QUEUED chain from the same caller op code. Rapid
    /// stepper taps must land the LAST value, not ramp the belt through every intermediate
    /// one — and must not build a queue that takes seconds to drain.
    private func enqueue(_ ops: [Op]) {
        if let group = ops.last?.group, ops.last?.isPrelude == false {
            let before = queue.count
            queue.removeAll { $0.group == group }
            if queue.count < before {
                log("Toque más reciente — descarto \(before - queue.count) op(s) en cola de "
                    + "\(FTMSControl.opName(group))")
            }
        }
        queue.append(contentsOf: ops)
        pump()
    }

    /// Expand a caller command into the wire ops the CURRENT strategy requires.
    private func expand(_ command: TreadmillControlCommand, isBestEffort: Bool) -> [Op] {
        let group = FTMSControl.requestOpCode(for: command)
        var ops: [Op] = []
        if command.isTarget {
            switch strategy {
            case .s1:
                break                                  // bare, no prelude at all
            case .s2:
                // Spec-clean: ONE Request Control per grant, and we WAIT for its ack
                // before the target goes out (FTMS §4.16.2.1 + the vendor sequence).
                let alreadyAsking = inFlight?.opCode == FTMSControl.requestOpCode(for: .requestControl)
                    || queue.contains { $0.opCode == FTMSControl.requestOpCode(for: .requestControl) }
                if !hasControl, !alreadyAsking {
                    ops.append(makeOp(.requestControl, isPrelude: true,
                                      waitsForIndication: true, group: group))
                }
            case .s3:
                ops.append(makeOp(.requestControl, isPrelude: true, waitsForIndication: false, group: group))
                ops.append(makeOp(.start, isPrelude: true, waitsForIndication: false, group: group))
            case .s4:
                ops.append(makeOp(.requestControl, isPrelude: true, waitsForIndication: false, group: group))
                ops.append(makeOp(.start, isPrelude: true, waitsForIndication: false, group: group))
                ops.append(pauseOp(FTMSControlTuning.interOpDelaySeconds, group: group))
            case .s5:
                ops.append(makeOp(.reset, isPrelude: true, waitsForIndication: true, group: group))
                ops.append(makeOp(.requestControl, isPrelude: true, waitsForIndication: true, group: group))
                ops.append(makeOp(.start, isPrelude: true, waitsForIndication: true, group: group))
            }
        }
        ops.append(makeOp(command, isPrelude: false, waitsForIndication: true,
                          group: group, isBestEffort: isBestEffort))
        return ops
    }

    private func makeOp(_ command: TreadmillControlCommand, isPrelude: Bool,
                        waitsForIndication: Bool, group: UInt8,
                        isBestEffort: Bool = false) -> Op {
        var verifySpeed: Double?
        var verifyIncline: (raw: Int, value: Double)?
        if !isPrelude, !isBestEffort {
            switch command {
            case .setTargetSpeedKmh(let kmh):
                verifySpeed = kmh
            case .setTargetInclinePct(let v):
                verifyIncline = (raw: FTMSInclineDialect.grade.rawValue(for: v), value: v)
            case .setTargetInclineLevel(let v):
                verifyIncline = (raw: FTMSInclineDialect.level.rawValue(for: v), value: v)
            default:
                break
            }
        }
        return Op(data: FTMSControl.encode(command),
                  opCode: FTMSControl.requestOpCode(for: command),
                  pauseSeconds: nil,
                  isPrelude: isPrelude,
                  isBestEffort: isBestEffort,
                  // Nothing can wait for an ack on a Control Point that never indicates.
                  waitsForIndication: waitsForIndication && controlPointIndicates,
                  group: group,
                  verifySpeedKmh: verifySpeed,
                  verifyIncline: verifyIncline)
    }

    private func pauseOp(_ seconds: TimeInterval, group: UInt8) -> Op {
        Op(data: nil, opCode: nil, pauseSeconds: seconds, isPrelude: true, isBestEffort: false,
           waitsForIndication: false, group: group, verifySpeedKmh: nil, verifyIncline: nil)
    }

    private func pump() {
        guard isTransportReady else { return }       // rule 2: transport first
        guard inFlight == nil, !queue.isEmpty else { return }   // rule 1: one at a time
        let op = queue.removeFirst()
        inFlight = op
        releaseGeneration += 1
        let generation = releaseGeneration

        if let pause = op.pauseSeconds {
            log(String(format: "PAUSA %.0f ms antes del objetivo (%@)", pause * 1000, strategy.rung))
            schedule(pause) { [weak self] in
                guard let self, self.releaseGeneration == generation, self.inFlight != nil else { return }
                self.release()
            }
            return
        }
        guard let data = op.data, let opCode = op.opCode else { release(); return }

        log("TX \(Self.hexByte(opCode)) \(FTMSControl.opName(opCode))"
            + (op.isPrelude ? " (preludio \(strategy.rung))" : "")
            + (op.isBestEffort ? " (opcional)" : "")
            + " [\(Self.hex(data))]")
        onWrite?(data)
        let timeout: TimeInterval = op.waitsForIndication
            ? (op.isPrelude ? FTMSControlTuning.preludeAckTimeoutSeconds
                            : FTMSControlTuning.ackTimeoutSeconds)
            : FTMSControlTuning.preludeTimeoutSeconds
        schedule(timeout) { [weak self] in
            guard let self, self.releaseGeneration == generation, self.inFlight != nil else { return }
            self.log(String(format: "TIMEOUT %.1f s sin ack de ", timeout)
                     + "\(Self.hexByte(opCode)) \(FTMSControl.opName(opCode)) — sigo con la cola")
            self.release()
        }
    }

    private func release() {
        let done = inFlight
        inFlight = nil
        releaseGeneration += 1     // invalidate the timeout scheduled for the op just done
        // Arm verification when the op LEAVES the pipeline, whatever released it. A machine
        // that never acks at all must still be caught out for not obeying.
        if let done, !done.isPrelude, !done.isBestEffort {
            if let target = done.verifySpeedKmh { armSpeedVerification(target: target) }
            if let inc = done.verifyIncline { armInclineVerification(expectedRaw: inc.raw, value: inc.value) }
        }
        pump()
    }

    // MARK: - Verification (the belt is the authority, not the feature bits)

    private func armSpeedVerification(target: Double) {
        guard !isStrategyPinned else { return }     // he is testing a rung by hand
        // The belt is ALREADY at the target: it can neither prove nor disprove the rung,
        // so we arm nothing and claim nothing. Confirming here would let a no-op tap
        // "prove" a dialect that has never actually moved anything.
        guard abs(lastBeltSpeedKmh - target) > FTMSControlTuning.speedConvergenceToleranceKmh else {
            return
        }
        speedVerificationGeneration += 1
        let generation = speedVerificationGeneration
        speedVerification = (target: target, speedAtArm: lastBeltSpeedKmh)
        schedule(FTMSControlTuning.targetVerificationSeconds) { [weak self] in
            guard let self, self.speedVerificationGeneration == generation,
                  self.speedVerification != nil else { return }
            self.speedVerification = nil
            self.escalateStrategy(reason: String(format: "pedí %.1f km/h y la cinta no se movió en %.0f s",
                                                 target, FTMSControlTuning.targetVerificationSeconds))
        }
    }

    private func armInclineVerification(expectedRaw: Int, value: Double) {
        guard !isInclineDialectPinned, !inclineDialectConfirmed else { return }
        inclineVerificationGeneration += 1
        let generation = inclineVerificationGeneration
        inclineVerification = (expectedRaw: Double(expectedRaw), rawAtArm: lastInclineRaw, value: value)
        schedule(FTMSControlTuning.targetVerificationSeconds) { [weak self] in
            guard let self, self.inclineVerificationGeneration == generation,
                  self.inclineVerification != nil else { return }
            self.inclineVerification = nil
            self.escalateInclineDialect(
                reason: "pedí inclinación cruda \(expectedRaw) y la cinta no la movió en "
                    + "\(Int(FTMSControlTuning.targetVerificationSeconds)) s")
        }
    }

    private func confirmSpeed(reason: String) {
        speedVerification = nil
        speedVerificationGeneration += 1
        guard !strategyConfirmed else { return }
        strategyConfirmed = true
        log("OBEDECE con \(strategy.label) — \(reason). Me quedo en \(strategy.rung) el resto de la sesión.")
    }

    private func confirmIncline(reason: String) {
        inclineVerification = nil
        inclineVerificationGeneration += 1
        guard !inclineDialectConfirmed else { return }
        inclineDialectConfirmed = true
        log("Inclinación INTERPRETADA como \(inclineDialect.label) — \(reason)")
    }

    /// Climb one rung and RE-SEND the athlete's target through the new dialect. Escalating
    /// without re-sending would leave the tap they made silently unhonored.
    private func escalateStrategy(reason: String) {
        guard !isStrategyPinned else { return }
        // A rung that has ALREADY moved this belt is the answer for the session. A later
        // miss is the machine being busy (ramping, safety key, someone on the console),
        // not the dialect being wrong — climbing away from a proven rung would undo the
        // one thing we know for sure.
        guard !strategyConfirmed else {
            log("Sigo en \(strategy.rung) (ya movió la cinta antes) — \(reason)")
            return
        }
        speedVerification = nil
        speedVerificationGeneration += 1   // a rung we've left must not confirm later
        guard ladderIndex + 1 < ladder.count else {
            log("ESCALERA AGOTADA en \(strategy.rung) — \(reason). "
                + "Ninguno de los \(ladder.count) modos movió la cinta; usa «Modo de control» para probar a mano.")
            return
        }
        ladderIndex += 1
        setStrategy(ladder[ladderIndex], reason: reason)
        if let target = lastSpeedTargetKmh { send(.setTargetSpeedKmh(target)) }
    }

    /// Try the OTHER meaning of the Inclination field and re-send the same number. This
    /// axis never touches the strategy rung: an incline the machine simply doesn't report
    /// must not knock a working speed path off its rung.
    private func escalateInclineDialect(reason: String) {
        guard !isInclineDialectPinned else { return }
        guard inclineLadderIndex + 1 < inclineLadder.count else {
            log("Sin más interpretaciones de inclinación que probar (\(inclineDialect.label)) — \(reason)")
            return
        }
        inclineLadderIndex += 1
        setInclineDialect(inclineLadder[inclineLadderIndex], reason: reason)
        if let value = lastInclineTargetValue { send(inclineDialect.command(for: value)) }
    }

    private func setStrategy(_ new: FTMSControlStrategy, reason: String) {
        guard new != strategy else { return }
        let old = strategy
        strategy = new
        log("MODO DE CONTROL \(old.rung) → \(new.rung): \(new.label)  ·  en nRF Connect sería: "
            + "\(new.wireHint)  ·  motivo: \(reason)")
        onStrategyChange?(new)
    }

    private func setInclineDialect(_ new: FTMSInclineDialect, reason: String) {
        guard new != inclineDialect else { return }
        inclineDialect = new
        log("INCLINACIÓN reinterpretada como \(new.label) — motivo: \(reason)")
        onInclineDialectChange?(new)
    }

    // MARK: - Trace helpers

    private func log(_ line: String) { onDiagnostic?(line) }

    private static func hex(_ data: Data) -> String {
        data.map { String(format: "%02X", $0) }.joined(separator: " ")
    }
    private static func hexByte(_ b: UInt8) -> String { String(format: "0x%02X", b) }

    private static func describe(_ event: TreadmillMachineEvent) -> String {
        switch event {
        case .reset:                          return "0x01 reset"
        case .stoppedByUser:                  return "0x02 parada del usuario"
        case .pausedByUser:                   return "0x02 pausa del usuario"
        case .stoppedBySafetyKey:             return "0x03 llave de seguridad"
        case .startedByUser:                  return "0x04 arranque del usuario"
        case .targetSpeedChangedKmh(let v):   return String(format: "0x05 objetivo velocidad %.2f km/h", v)
        case .targetInclineChangedPct(let v): return String(format: "0x06 objetivo inclinación %.1f %%", v)
        case .targetInclineChangedLevel(let v): return String(format: "0x06 objetivo inclinación nivel %.2f", v)
        case .targetedDistanceChangedM(let m):     return "0x0D distancia programada \(m) m"
        case .targetedTrainingTimeChangedS(let s): return "0x0E tiempo programado \(s) s"
        case .controlPermissionLost:          return "0xFF permiso de control perdido"
        case .other(let op):                  return String(format: "0x%02X (sin interpretar)", op)
        }
    }
}
