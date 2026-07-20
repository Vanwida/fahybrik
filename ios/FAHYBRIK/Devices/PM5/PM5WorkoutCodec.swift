import Foundation

// Pure CSAFE codec for PROGRAMMING a workout on the Concept2 PM5 — what ErgData
// does when it loads a piece onto the monitor ("row to begin"). No CoreBluetooth
// and no state: every byte layout is unit-testable against the worked examples in
// the official "Concept2 PM CSAFE Communication Definition" (rev 0.27, pp. 80-84)
// and the "PM Bluetooth Smart Communication Interface Definition" (rev 1.30,
// Appendix A). The golden frames in PM5WorkoutCodecTests reproduce those examples
// byte-for-byte.
//
// WIRE SHAPE (standard CSAFE frame):
//   0xF1  body…  checksum  0xF2
// where checksum = XOR of the body bytes, and body+checksum are byte-stuffed
// (0xF0…0xF3 → 0xF3 00…03) so the flag values never appear inside the frame.
// The body is one C2 proprietary wrapper: 0x76 (CSAFE_SETPMCFG_CMD), total byte
// count, then each PM command as [id, dataLen, data…]. Multi-byte values inside
// the wrapped PM commands are BIG-endian (unlike the rowing-service notifications,
// which are little-endian).

// MARK: - Spec — what to program

/// A workout the PM5 can natively run. Mirrors the monitor's own menu: the four
/// fixed shapes (+ calories), fixed intervals, or free "just row" (with splits, so
/// the 0x37/0x38 split notifications keep firing). `targetPaceSecPer500m` rides
/// along as the optional pace goal (PaceBoat) — 0.01 s/500m resolution on the wire.
struct PM5WorkoutSpec: Equatable {
    enum Kind: Equatable {
        case justRow
        case fixedDistance(meters: Int, splitMeters: Int?)
        case fixedTime(seconds: Int, splitSeconds: Int?)
        case fixedCalories(calories: Int, splitCalories: Int?)
        case distanceIntervals(workMeters: Int, restSeconds: Int)
        case timeIntervals(workSeconds: Int, restSeconds: Int)
        case calorieIntervals(workCalories: Int, restSeconds: Int)
    }

    let kind: Kind
    var targetPaceSecPer500m: Double? = nil

    // Factory helpers so call-sites read like the domain ("5×500 r1:30" →
    // .distanceIntervals(workMeters: 500, restSeconds: 90)).
    static func justRow(pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .justRow, targetPaceSecPer500m: pace)
    }
    static func fixedDistance(meters: Int, splitMeters: Int? = nil, pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .fixedDistance(meters: meters, splitMeters: splitMeters), targetPaceSecPer500m: pace)
    }
    static func fixedTime(seconds: Int, splitSeconds: Int? = nil, pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .fixedTime(seconds: seconds, splitSeconds: splitSeconds), targetPaceSecPer500m: pace)
    }
    static func fixedCalories(calories: Int, splitCalories: Int? = nil, pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .fixedCalories(calories: calories, splitCalories: splitCalories), targetPaceSecPer500m: pace)
    }
    static func distanceIntervals(workMeters: Int, restSeconds: Int, pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .distanceIntervals(workMeters: workMeters, restSeconds: restSeconds), targetPaceSecPer500m: pace)
    }
    static func timeIntervals(workSeconds: Int, restSeconds: Int, pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .timeIntervals(workSeconds: workSeconds, restSeconds: restSeconds), targetPaceSecPer500m: pace)
    }
    static func calorieIntervals(workCalories: Int, restSeconds: Int, pace: Double? = nil) -> PM5WorkoutSpec {
        PM5WorkoutSpec(kind: .calorieIntervals(workCalories: workCalories, restSeconds: restSeconds), targetPaceSecPer500m: pace)
    }
}

// MARK: - Codec

enum PM5WorkoutCodec {
    // CSAFE frame flags (spec Table 5) + stuffing flag base.
    private enum Flag {
        static let start: UInt8 = 0xF1
        static let stop: UInt8 = 0xF2
        static let stuffing: UInt8 = 0xF3
        static let stuffedRange: ClosedRange<UInt8> = 0xF0...0xF3
    }

    /// C2 proprietary "set PM configuration" wrapper (CSAFE_SETPMCFG_CMD).
    static let setPMCfgWrapper: UInt8 = 0x76

    // Wrapped PM command ids (CSAFE spec "C2 Proprietary Long Set Configuration
    // Commands", pp. 69-71). NOTE: SET_TARGETPACETIME is 0x06 — 0x07 is the
    // unimplemented SET_INTERVALIDENTIFIER.
    enum PMCommand {
        static let setWorkoutType: UInt8 = 0x01
        static let setWorkoutDuration: UInt8 = 0x03
        static let setRestDuration: UInt8 = 0x04
        static let setSplitDuration: UInt8 = 0x05
        static let setTargetPaceTime: UInt8 = 0x06
        static let setScreenState: UInt8 = 0x13
        static let configureWorkout: UInt8 = 0x14
    }

    // Workout types (BLE spec Appendix A, OBJ_WORKOUTTYPE_T). The *_SPLITS
    // variants keep the 0x37/0x38 split notifications firing, which our parser
    // already consumes — so splits, always.
    enum WorkoutType {
        static let justRowSplits: UInt8 = 1
        static let fixedDistSplits: UInt8 = 3
        static let fixedTimeSplits: UInt8 = 5
        static let fixedTimeInterval: UInt8 = 6
        static let fixedDistInterval: UInt8 = 7
        static let fixedCalorie: UInt8 = 10
        static let fixedCalsInterval: UInt8 = 12
    }

    // Duration type identifiers (BLE spec Appendix A "Workout Duration Type" +
    // the CSAFE worked examples). The spec's command table says calories = 0x40,
    // but BOTH worked examples on pp. 82-84 put 0xC0 on the wire — we follow the
    // examples (captured traffic beats the table; flagged for erg verification).
    enum DurationType {
        static let time: UInt8 = 0x00
        static let calories: UInt8 = 0xC0
        static let distance: UInt8 = 0x80
    }

    // Screen state (spec example): SCREENTYPE_WORKOUT + PREPARETOROWWORKOUT flips
    // the monitor to the programmed piece ("row to begin"); TERMINATEWORKOUT
    // aborts whatever is running so a new piece can be programmed.
    enum Screen {
        static let typeWorkout: UInt8 = 0x01
        static let valuePrepareToRow: UInt8 = 0x01
        static let valueTerminate: UInt8 = 0x02
    }

    /// PM5 workout parameter limits (CSAFE spec Table 19). Programming outside
    /// these aborts the whole configuration with a "PrevReject" status, so the
    /// codec clamps rather than trusting every prescription upstream.
    enum Limits {
        static let distanceMeters = 100...999_999
        static let fixedTimeSeconds = 20...35_999          // :20 … 9:59:59
        static let intervalTimeSeconds = 20...3_599        // :20 … 59:59
        static let fixedCalories = 5...65_535
        static let intervalCalories = 5...999
        static let restSeconds = 0...595                   // :00 … 9:55
        static let minSplitMeters = 100
        static let minSplitSeconds = 20
        static let minSplitCalories = 5
        static let maxSplitMeters = 60_000
        static let maxSplitSeconds = 5_400                 // 1:30:00
        static let maxSplitCalories = 65_535
        static let maxSplitsPerWorkout = 50
        /// PM5 default when the athlete doesn't choose one: 5 splits per piece
        /// (the monitor's own convention — 2000m → 400m splits).
        static let defaultSplitCount = 5
    }

    /// Attribute table: the CSAFE receive characteristic takes up to 20 bytes per
    /// write; longer frames span multiple writes (the F1/F2 flags delimit).
    static let maxWriteChunkBytes = 20

    // MARK: Frame building (pure)

    /// One standard CSAFE frame: start flag + stuffed(body + XOR checksum) + stop.
    static func csafeFrame(body: [UInt8]) -> Data {
        var checksum: UInt8 = 0
        for b in body { checksum ^= b }
        var out: [UInt8] = [Flag.start]
        for b in body + [checksum] {
            if Flag.stuffedRange.contains(b) {
                out.append(Flag.stuffing)
                out.append(b - Flag.stuffedRange.lowerBound)
            } else {
                out.append(b)
            }
        }
        out.append(Flag.stop)
        return Data(out)
    }

    /// The 0x76 wrapper body from a list of [id, data…] PM commands.
    private static func wrapped(_ commands: [(id: UInt8, data: [UInt8])]) -> [UInt8] {
        var inner: [UInt8] = []
        for c in commands {
            inner.append(c.id)
            inner.append(UInt8(c.data.count))
            inner.append(contentsOf: c.data)
        }
        return [setPMCfgWrapper, UInt8(inner.count)] + inner
    }

    private static func be32(_ v: Int) -> [UInt8] {
        let u = UInt32(clamping: v)
        return [UInt8(u >> 24 & 0xFF), UInt8(u >> 16 & 0xFF), UInt8(u >> 8 & 0xFF), UInt8(u & 0xFF)]
    }

    private static func be16(_ v: Int) -> [UInt8] {
        let u = UInt16(clamping: v)
        return [UInt8(u >> 8), UInt8(u & 0xFF)]
    }

    /// Split resolution: the caller's split, else the PM5's own 5-per-piece
    /// default — clamped to the legal minimum/maximum, to the piece itself, and
    /// so the split count never exceeds 50 (Table 19 hard limits).
    private static func resolvedSplit(total: Int, requested: Int?, minimum: Int, maximum: Int) -> Int {
        let base = requested ?? Int((Double(total) / Double(Limits.defaultSplitCount)).rounded())
        let floorFor50 = Int((Double(total) / Double(Limits.maxSplitsPerWorkout)).rounded(.up))
        return min(max(base, minimum, floorFor50), max(total, minimum), maximum)
    }

    /// The PM command list for a spec — shared by the frame builder and the
    /// expected-ack set (so the two can never drift).
    private static func commands(for spec: PM5WorkoutSpec) -> [(id: UInt8, data: [UInt8])] {
        var cmds: [(id: UInt8, data: [UInt8])] = []

        switch spec.kind {
        case .justRow:
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.justRowSplits]))

        case .fixedDistance(let meters, let split):
            let m = meters.clamped(to: Limits.distanceMeters)
            let s = resolvedSplit(total: m, requested: split,
                                  minimum: Limits.minSplitMeters, maximum: Limits.maxSplitMeters)
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.fixedDistSplits]))
            cmds.append((PMCommand.setWorkoutDuration, [DurationType.distance] + be32(m)))
            cmds.append((PMCommand.setSplitDuration, [DurationType.distance] + be32(s)))

        case .fixedTime(let seconds, let split):
            let t = seconds.clamped(to: Limits.fixedTimeSeconds)
            let s = resolvedSplit(total: t, requested: split,
                                  minimum: Limits.minSplitSeconds, maximum: Limits.maxSplitSeconds)
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.fixedTimeSplits]))
            // Time rides the wire in 0.01 s ticks.
            cmds.append((PMCommand.setWorkoutDuration, [DurationType.time] + be32(t * 100)))
            cmds.append((PMCommand.setSplitDuration, [DurationType.time] + be32(s * 100)))

        case .fixedCalories(let calories, let split):
            let c = calories.clamped(to: Limits.fixedCalories)
            let s = resolvedSplit(total: c, requested: split,
                                  minimum: Limits.minSplitCalories, maximum: Limits.maxSplitCalories)
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.fixedCalorie]))
            cmds.append((PMCommand.setWorkoutDuration, [DurationType.calories] + be32(c)))
            cmds.append((PMCommand.setSplitDuration, [DurationType.calories] + be32(s)))

        case .distanceIntervals(let work, let rest):
            let m = work.clamped(to: Limits.distanceMeters)
            let r = rest.clamped(to: Limits.restSeconds)
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.fixedDistInterval]))
            cmds.append((PMCommand.setWorkoutDuration, [DurationType.distance] + be32(m)))
            cmds.append((PMCommand.setRestDuration, be16(r)))   // whole seconds

        case .timeIntervals(let work, let rest):
            let t = work.clamped(to: Limits.intervalTimeSeconds)
            let r = rest.clamped(to: Limits.restSeconds)
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.fixedTimeInterval]))
            cmds.append((PMCommand.setWorkoutDuration, [DurationType.time] + be32(t * 100)))
            cmds.append((PMCommand.setRestDuration, be16(r)))

        case .calorieIntervals(let work, let rest):
            let c = work.clamped(to: Limits.intervalCalories)
            let r = rest.clamped(to: Limits.restSeconds)
            cmds.append((PMCommand.setWorkoutType, [WorkoutType.fixedCalsInterval]))
            cmds.append((PMCommand.setWorkoutDuration, [DurationType.calories] + be32(c)))
            cmds.append((PMCommand.setRestDuration, be16(r)))
        }

        // Optional pace goal (0.01 s/500m, uint32 BE) — before CONFIGURE, like
        // production implementations (LiveRowing) place it. Just-row has no piece
        // to attach a goal to, so it is skipped there.
        if let pace = spec.targetPaceSecPer500m, pace > 0, spec.kind != .justRow {
            cmds.append((PMCommand.setTargetPaceTime, be32(Int((pace * 100).rounded()))))
        }

        // Program it (skip for just-row: the spec's own example programs just-row
        // with type + screen only) and flip the monitor to "row to begin".
        if spec.kind != .justRow {
            cmds.append((PMCommand.configureWorkout, [0x01]))
        }
        cmds.append((PMCommand.setScreenState, [Screen.typeWorkout, Screen.valuePrepareToRow]))
        return cmds
    }

    /// The full, ready-to-write CSAFE frame programming `spec`.
    static func programFrame(for spec: PM5WorkoutSpec) -> Data {
        csafeFrame(body: wrapped(commands(for: spec)))
    }

    /// The wrapped command ids `programFrame` sends — the ack echo we must see
    /// back (a SETPMCFG response lists the processed command ids) before calling
    /// the programming DONE. Derived from the same command list, so it can't drift.
    static func expectedAck(for spec: PM5WorkoutSpec) -> Set<UInt8> {
        Set(commands(for: spec).map(\.id))
    }

    /// Abort whatever the monitor is running (screen → terminate). Sent before
    /// re-programming when the PM isn't sitting at "wait to begin".
    static func terminateFrame() -> Data {
        csafeFrame(body: wrapped([(PMCommand.setScreenState, [Screen.typeWorkout, Screen.valueTerminate])]))
    }

    /// A frame sliced into ≤`maxBytes` writes (BLE payload limit); the F1/F2
    /// flags let the PM reassemble across writes.
    static func chunks(_ frame: Data, maxBytes: Int = maxWriteChunkBytes) -> [Data] {
        guard maxBytes > 0 else { return [frame] }
        var out: [Data] = []
        var i = frame.startIndex
        while i < frame.endIndex {
            let j = frame.index(i, offsetBy: maxBytes, limitedBy: frame.endIndex) ?? frame.endIndex
            out.append(frame.subdata(in: i..<j))
            i = j
        }
        return out
    }

    // MARK: Response side

    /// Previous-frame status from the CSAFE response status byte (bits 0x30).
    enum PrevFrameStatus: UInt8, Equatable {
        case ok = 0, reject = 1, bad = 2, notReady = 3
    }

    /// One decoded CSAFE response frame: the bit-mapped status byte plus the
    /// wrapped command ids the PM echoed under 0x76 (its per-command ack list).
    struct Response: Equatable {
        let status: UInt8
        let echoedWrappedIds: [UInt8]

        var prevFrameStatus: PrevFrameStatus {
            PrevFrameStatus(rawValue: (status >> 4) & 0x03) ?? .ok
        }
    }

    /// Decode one complete, UNSTUFFED frame body (status byte + response data,
    /// checksum already verified/removed). Returns nil for an empty body.
    static func decodeResponse(body: [UInt8]) -> Response? {
        guard let status = body.first else { return nil }
        var echoed: [UInt8] = []
        var i = 1
        // Scan the command-response list for the 0x76 wrapper and lift its data
        // (the echoed wrapped ids). Other command responses are skipped by length.
        while i + 1 < body.count {
            let cmd = body[i]
            let len = Int(body[i + 1])
            let dataStart = i + 2
            let dataEnd = dataStart + len
            guard dataEnd <= body.count else { break }
            if cmd == setPMCfgWrapper {
                echoed.append(contentsOf: body[dataStart..<dataEnd])
            }
            i = dataEnd
        }
        return Response(status: status, echoedWrappedIds: echoed)
    }

    /// The programming verdict a response carries, against the ack set we expect.
    /// nil = this response is not the program ack (e.g. the terminate frame's echo)
    /// — keep waiting. A reject/bad status is a verdict regardless of the echo:
    /// the PM refused the frame.
    static func programVerdict(of response: Response, expecting: Set<UInt8>) -> Result<Void, PM5ProgramFailure>? {
        switch response.prevFrameStatus {
        case .reject: return .failure(.rejected)
        case .bad: return .failure(.badFrame)
        case .notReady: return .failure(.notReady)
        case .ok:
            let echoed = Set(response.echoedWrappedIds)
            return expecting.isSubset(of: echoed) ? .success(()) : nil
        }
    }
}

/// Why a programming attempt failed — surfaced only through diagnostics (the
/// athlete can always just row; the app never blocks on the monitor).
enum PM5ProgramFailure: Error, Equatable {
    case rejected       // PrevReject — a parameter violated the PM's limits
    case badFrame       // PrevBad — framing/checksum error on our side
    case notReady       // PM busy — e.g. mid-state transition
    case timeout        // no ack within the window
    case disconnected   // link dropped mid-send
    case writeFailed(String)

    var diagnosticLine: String {
        switch self {
        case .rejected: return "PM5 rechazó la configuración (límites)"
        case .badFrame: return "PM5 reportó trama inválida"
        case .notReady: return "PM5 no estaba listo"
        case .timeout: return "sin respuesta del PM5"
        case .disconnected: return "desconectado durante el envío"
        case .writeFailed(let m): return "fallo de escritura: \(m)"
        }
    }
}

// MARK: - Response assembler (notification chunks → frames)

/// Accumulates CSAFE respond-characteristic notifications (which may slice a
/// frame at arbitrary 20-byte boundaries), locates F1…F2 frames, unstuffs,
/// verifies the XOR checksum and yields decoded responses. Pure — unit-tested
/// with sliced fixtures.
struct PM5CSAFEResponseAssembler {
    private var buffer: [UInt8] = []
    /// Guard against unbounded growth if garbage streams in (max CSAFE frame is
    /// 120 bytes; anything beyond a few frames of backlog is noise).
    private static let maxBuffer = 512

    mutating func feed(_ data: Data) -> [PM5WorkoutCodec.Response] {
        buffer.append(contentsOf: data)
        if buffer.count > Self.maxBuffer { buffer.removeFirst(buffer.count - Self.maxBuffer) }

        var responses: [PM5WorkoutCodec.Response] = []
        // Drop noise before the first start flag, then carve complete frames.
        while true {
            guard let start = buffer.firstIndex(of: 0xF1) else {
                buffer.removeAll()
                break
            }
            if start > 0 { buffer.removeFirst(start) }
            guard let stop = buffer.firstIndex(of: 0xF2) else { break }   // incomplete — wait for more
            let stuffed = Array(buffer[1..<stop])
            buffer.removeFirst(stop + 1)

            // Unstuff (0xF3 0x0N → 0xF0+N).
            var body: [UInt8] = []
            var i = 0
            var malformed = false
            while i < stuffed.count {
                let b = stuffed[i]
                if b == 0xF3 {
                    guard i + 1 < stuffed.count, stuffed[i + 1] <= 0x03 else { malformed = true; break }
                    body.append(0xF0 + stuffed[i + 1])
                    i += 2
                } else {
                    body.append(b)
                    i += 1
                }
            }
            guard !malformed, body.count >= 2 else { continue }

            // Last byte is the XOR checksum of everything before it.
            let checksum = body.removeLast()
            var computed: UInt8 = 0
            for b in body { computed ^= b }
            guard computed == checksum else { continue }

            if let r = PM5WorkoutCodec.decodeResponse(body: body) {
                responses.append(r)
            }
        }
        return responses
    }

    mutating func reset() { buffer.removeAll() }
}

private extension Int {
    func clamped(to range: ClosedRange<Int>) -> Int {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}
