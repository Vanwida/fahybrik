import Foundation

// The op pipeline that actually makes a treadmill OBEY. Pure Foundation — no
// CoreBluetooth — so every rule below is unit-testable with a fake clock.
//
// WHY THIS EXISTS: writing FTMS control commands "as they come" does not drive a real
// machine. Three things break it, and each has a rule here:
//
//  1. SERIALIZATION. The Fitness Machine Control Point runs ONE procedure at a time.
//     A second write before the previous op's 0x80 indication is answered with ATT
//     "Procedure Already In Progress" and is simply lost. So: one write in flight,
//     released by the matching indication or a timeout — never two at once.
//
//  2. CCCD ORDERING. Writing to the Control Point before its indications are actually
//     enabled earns ATT "CCC Improperly Configured". So: nothing leaves the queue until
//     the transport confirms the subscription (`transportReady()`).
//
//  3. FAMILY DIALECTS. Machines disagree on the prelude. Spec-clean machines want one
//     Request-Control per connection; the BH / Exercycle i.Concept 3.0 line auto-grants
//     and reacts BADLY to Start spam; some generic belts ignore a bare target unless
//     Request-Control + Start precede EVERY one (qdomyos-zwift's battle-tested hammer).
//     So: a per-connection `FTMSControlProfile`, plus an automatic escalation to the
//     hammer when a machine ACKS a speed target and then does nothing about it.
//
// Control permission, once granted, persists until the machine says otherwise: a
// Machine Status 0xFF (Control Permission Lost), a Reset, or a reconnect. We re-request
// on exactly those three — not on every command.

/// The control dialect the connected machine speaks. Detected at connect, and possibly
/// escalated during the session when the machine proves it isn't listening.
enum FTMSControlProfile: String, Equatable {
    /// Spec-clean: Request-Control ONCE per grant, then bare targets.
    case standard
    /// BH / Exercycle i.Concept 3.0 (the `T01_*` advertisers, e.g. the Titanium TM2000).
    /// Targets go out BARE — this firmware auto-grants control and mis-handles a
    /// Start before every target — and its Inclination field is console LEVELS, not
    /// grade × 0.1 %.
    case iConcept
    /// The qdomyos-zwift hammer for stubborn generic belts: Request-Control + Start
    /// before EVERY target write.
    case genericHammer

    var label: String {
        switch self {
        case .standard:      return "FTMS estándar"
        case .iConcept:      return "i.Concept (BH/Exercycle)"
        case .genericHammer: return "genérico reforzado"
        }
    }

    /// True when the machine's Inclination field carries console LEVELS rather than
    /// 0.1 % grade — the UI must then say "Nivel N", never a fabricated percentage.
    var inclineIsLevel: Bool { self == .iConcept }

    /// `T01_*` is the i.Concept 3.0 advertising family (his TM2000 shows as `T01_BD37E`);
    /// qdomyos-zwift routes the same prefix to its dedicated i.Concept profile.
    static let iConceptNamePrefix = "t01_"

    /// Peripheral / advertised name → family. Case-insensitive, whitespace-tolerant.
    static func detect(name: String?) -> FTMSControlProfile {
        guard let n = name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              n.hasPrefix(iConceptNamePrefix) else { return .standard }
        return .iConcept
    }
}

/// Timings for the control pipeline. All in seconds.
enum FTMSControlTuning {
    /// How long we wait for an op's 0x80 indication before releasing the pipeline. The
    /// FTMS spec allows a machine up to ~30 s for a procedure, but a treadmill that
    /// hasn't answered in half a second isn't going to — and a stuck pipeline means the
    /// athlete's next stepper tap does nothing at all.
    static let ackTimeoutSeconds: TimeInterval = 0.5
    /// The hammer's 0x00 / 0x07 prelude ops are fire-and-forget (qdomyos-zwift doesn't
    /// wait for their indication either) — they release on the write ack, with this as
    /// the backstop.
    static let preludeTimeoutSeconds: TimeInterval = 0.3
    /// How long an ACKED speed target has to actually MOVE the belt before we conclude
    /// the machine is nodding along without obeying, and escalate to the hammer.
    static let targetVerificationSeconds: TimeInterval = 5
    /// Belt speed this close to the target counts as "arrived".
    static let speedConvergenceToleranceKmh: Double = 0.3
    /// Belt speed moving at least this much TOWARD the target counts as "the machine is
    /// responding" — a long ramp must not be mistaken for a machine ignoring us.
    static let speedResponseEpsilonKmh: Double = 0.3
}

/// Serializes Control Point ops, owns the Request-Control lifecycle, and adapts to the
/// machine's dialect. One instance per connection (`reset()` on connect/disconnect).
final class FTMSControlSequencer {

    // MARK: - Outputs (the transport wires these)

    /// Write these bytes to the Control Point. Exactly one call is outstanding at a time.
    var onWrite: ((Data) -> Void)?
    /// The ack of a command the CALLER asked for. Prelude ops we injected ourselves are
    /// deliberately NOT reported — the athlete must never see "no soportado" for a
    /// Request-Control we added behind their back.
    var onResult: ((TreadmillControlResult) -> Void)?
    /// One readable trace line per TX / RX / decision, for the shareable diagnostics.
    var onDiagnostic: ((String) -> Void)?
    /// Fired when the profile is adopted at connect or escalated mid-session.
    var onProfileChange: ((FTMSControlProfile) -> Void)?

    // MARK: - State

    private(set) var profile: FTMSControlProfile = .standard
    /// Whether the machine has GRANTED control. Under `.iConcept` the firmware grants
    /// implicitly, so we never ask and never track it.
    private(set) var hasControl = false
    /// Control Point indications confirmed enabled — the gate on every write.
    private(set) var isTransportReady = false

    private let schedule: (TimeInterval, @escaping () -> Void) -> Void

    /// `schedule` is injected so tests drive the timeouts deterministically instead of
    /// sleeping. Production uses the main queue — the same queue CoreBluetooth calls back
    /// on, so all state below is single-threaded by construction.
    init(schedule: @escaping (TimeInterval, @escaping () -> Void) -> Void = { seconds, work in
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
         }) {
        self.schedule = schedule
    }

    /// One wire-level op. A single caller command can expand into several of these (the
    /// hammer prelude), each serialized independently.
    private struct Op {
        let command: TreadmillControlCommand
        let data: Data
        let opCode: UInt8
        /// We injected it — suppress its result from the UI.
        let isPrelude: Bool
        /// Wait for the 0x80 indication (true) or release on the write ack (false).
        let waitsForIndication: Bool
        /// The speed this op targets, when it's a speed target — armed for verification.
        let verifySpeedKmh: Double?
    }

    private var queue: [Op] = []
    private var inFlight: Op?
    /// Bumped on every emit and every release so a stale timeout can't release the op
    /// that came after the one it was scheduled for.
    private var releaseGeneration = 0

    // Escalation verification.
    private var verification: (target: Double, speedAtArm: Double)?
    private var verificationGeneration = 0
    private var lastBeltSpeedKmh: Double = 0
    private var lastSpeedTargetKmh: Double?

    // MARK: - Connection lifecycle

    /// New peripheral / disconnect: drop everything. Control permission does NOT survive
    /// a reconnect, so the next command re-requests it.
    func reset(profile newProfile: FTMSControlProfile = .standard) {
        queue.removeAll()
        inFlight = nil
        releaseGeneration += 1
        verification = nil
        verificationGeneration += 1
        hasControl = false
        isTransportReady = false
        lastBeltSpeedKmh = 0
        lastSpeedTargetKmh = nil
        profile = newProfile
    }

    /// Adopt a detected family (idempotent). Never downgrades an escalated profile.
    func adoptProfile(_ newProfile: FTMSControlProfile) {
        guard newProfile != profile, profile != .genericHammer else { return }
        profile = newProfile
        log("Perfil de control: \(newProfile.label)")
        onProfileChange?(newProfile)
    }

    /// The Control Point's CCCD is confirmed configured — writes may now leave. Anything
    /// the caller queued while we waited flushes here, in order.
    func transportReady() {
        guard !isTransportReady else { return }
        isTransportReady = true
        log("Indicaciones del punto de control ACTIVAS — vaciando cola (\(queue.count))")
        pump()
    }

    // MARK: - Input from the caller

    /// State an intent. We own the prelude, the ordering and the retries.
    func send(_ command: TreadmillControlCommand) {
        if case .setTargetSpeedKmh(let kmh) = command { lastSpeedTargetKmh = kmh }
        queue.append(contentsOf: expand(command))
        pump()
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
        if !flight.isPrelude { onResult?(resp.result) }
        if resp.result == .success, let target = flight.verifySpeedKmh { armVerification(target: target) }
        release()
    }

    /// CoreBluetooth finished (or failed) the write of the op in flight.
    func noteWriteCompleted(error: Error?) {
        guard let flight = inFlight else { return }
        if let error {
            log("ERROR de escritura en \(Self.hexByte(flight.opCode)) \(FTMSControl.opName(flight.opCode)): "
                + error.localizedDescription)
            if !flight.isPrelude { onResult?(.operationFailed) }
            release()
            return
        }
        // Fire-and-forget prelude ops don't wait for an indication that may never come.
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
        case .targetSpeedChangedKmh:
            // The machine APPLIED our speed target — the strongest possible confirmation.
            clearVerification(reason: "Machine Status 0x05 (objetivo de velocidad aplicado)")
        default:
            break
        }
    }

    /// Live belt speed from Treadmill Data — the second half of the escalation check.
    func noteBeltSpeed(kmh: Double) {
        lastBeltSpeedKmh = kmh
        guard let v = verification else { return }
        let converged = abs(kmh - v.target) <= FTMSControlTuning.speedConvergenceToleranceKmh
        let movedToward = v.target > v.speedAtArm
            ? (kmh - v.speedAtArm) >= FTMSControlTuning.speedResponseEpsilonKmh
            : (v.speedAtArm - kmh) >= FTMSControlTuning.speedResponseEpsilonKmh
        if converged || movedToward {
            clearVerification(reason: String(format: "la cinta se movió hacia el objetivo (%.1f km/h)", kmh))
        }
    }

    /// Raw Inclination field reading, for the field-calibration trace. Only logged when it
    /// CHANGES, so the trace stays readable across a whole session.
    func noteInclineRaw(_ raw: Double) {
        guard lastLoggedInclineRaw == nil || abs(raw - (lastLoggedInclineRaw ?? 0)) >= 1 else { return }
        lastLoggedInclineRaw = raw
        let asPct = String(format: "%.1f %%", raw / 10)
        let asLevel = String(format: "nivel %.2f", FTMSInclineLevels.level(forRaw: raw))
        log("RX inclinación cruda = \(Int(raw.rounded()))  (si fuera 0.1 % → \(asPct) · i.Concept → \(asLevel))")
    }
    private var lastLoggedInclineRaw: Double?

    // MARK: - Pipeline

    /// Expand a caller command into the wire ops its profile requires.
    private func expand(_ command: TreadmillControlCommand) -> [Op] {
        var ops: [Op] = []
        switch profile {
        case .iConcept:
            // BARE, always. This firmware auto-grants control and mis-handles a Start
            // before every target — the prelude is exactly what breaks it.
            break
        case .genericHammer:
            if command.isTarget {
                ops.append(makeOp(.requestControl, isPrelude: true, waitsForIndication: false))
                ops.append(makeOp(.start, isPrelude: true, waitsForIndication: false))
            }
        case .standard:
            // One Request-Control per grant, and never a second one already in flight.
            let alreadyAsking = inFlight?.opCode == FTMSControl.requestOpCode(for: .requestControl)
                || queue.contains { $0.opCode == FTMSControl.requestOpCode(for: .requestControl) }
            if command != .requestControl, !hasControl, !alreadyAsking {
                ops.append(makeOp(.requestControl, isPrelude: true, waitsForIndication: true))
            }
        }
        ops.append(makeOp(command, isPrelude: false, waitsForIndication: true))
        return ops
    }

    private func makeOp(_ command: TreadmillControlCommand,
                        isPrelude: Bool, waitsForIndication: Bool) -> Op {
        var verify: Double?
        if case .setTargetSpeedKmh(let kmh) = command, !isPrelude { verify = kmh }
        return Op(command: command,
                  data: FTMSControl.encode(command),
                  opCode: FTMSControl.requestOpCode(for: command),
                  isPrelude: isPrelude,
                  waitsForIndication: waitsForIndication,
                  verifySpeedKmh: verify)
    }

    private func pump() {
        guard isTransportReady else { return }       // rule 2: CCCD first
        guard inFlight == nil, !queue.isEmpty else { return }   // rule 1: one at a time
        let op = queue.removeFirst()
        inFlight = op
        releaseGeneration += 1
        let generation = releaseGeneration
        log("TX \(Self.hexByte(op.opCode)) \(FTMSControl.opName(op.opCode))"
            + (op.isPrelude ? " (preludio)" : "") + " [\(Self.hex(op.data))]")
        onWrite?(op.data)
        let timeout = op.waitsForIndication
            ? FTMSControlTuning.ackTimeoutSeconds
            : FTMSControlTuning.preludeTimeoutSeconds
        schedule(timeout) { [weak self] in
            guard let self, self.releaseGeneration == generation, self.inFlight != nil else { return }
            self.log(String(format: "TIMEOUT %.1f s sin ack de ", timeout)
                     + "\(Self.hexByte(op.opCode)) \(FTMSControl.opName(op.opCode)) — sigo con la cola")
            self.release()
        }
    }

    private func release() {
        inFlight = nil
        releaseGeneration += 1     // invalidate the timeout scheduled for the op just done
        pump()
    }

    // MARK: - Escalation (the machine acks but doesn't obey)

    private func armVerification(target: Double) {
        // i.Concept is a KNOWN-good dialect and the hammer is terminal — neither escalates.
        guard profile == .standard else { return }
        // Nothing to verify when the belt is already at the target.
        guard abs(lastBeltSpeedKmh - target) > FTMSControlTuning.speedConvergenceToleranceKmh else { return }
        verificationGeneration += 1
        let generation = verificationGeneration
        verification = (target: target, speedAtArm: lastBeltSpeedKmh)
        schedule(FTMSControlTuning.targetVerificationSeconds) { [weak self] in
            guard let self, self.verificationGeneration == generation, self.verification != nil else { return }
            self.verification = nil
            self.escalate(reason: String(format: "aceptó %.1f km/h pero la cinta no se movió en %.0f s",
                                         target, FTMSControlTuning.targetVerificationSeconds))
        }
    }

    private func clearVerification(reason: String) {
        guard verification != nil else { return }
        verification = nil
        verificationGeneration += 1
        log("Objetivo CONFIRMADO por la máquina — \(reason)")
    }

    private func escalate(reason: String) {
        guard profile == .standard else { return }
        profile = .genericHammer
        log("ESCALADO a \(FTMSControlProfile.genericHammer.label): 0x00 + 0x07 antes de cada objetivo — \(reason)")
        onProfileChange?(profile)
        // Land the athlete's intent through the new dialect — escalating without
        // re-sending would leave the tap they made silently unhonored.
        if let target = lastSpeedTargetKmh { send(.setTargetSpeedKmh(target)) }
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
        case .controlPermissionLost:          return "0xFF permiso de control perdido"
        case .other(let op):                  return String(format: "0x%02X (sin interpretar)", op)
        }
    }
}
