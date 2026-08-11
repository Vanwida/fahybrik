import Foundation

/// Live pipeline: decimate → archive buffer → activity → reps → velocity.
/// Pure over samples; the watch capture wrapper feeds it.
@MainActor
final class SensorPipeline {
    private(set) var samples: [SensorSample] = []
    private var decimator = SensorDecimator()
    private var openWindows: [SensorWindowLabel] = []
    private var closedWindows: [SensorWindowLabel] = []
    private let activity = ActivityDetector()
    private let reps = RepCounter()
    private let velocity = BarVelocityEstimator()

    private(set) var captureMode: SensorCaptureMode = .classic
    private(set) var startedAt: Date?
    var watchModel: String?
    var wrist: SensorWrist?
    var executionLocalId: String?

    // MARK: Live conclusions (what the phone paints)

    private(set) var lastRepResult: RepCountResult?
    private(set) var lastTiming: ActivityTimingResult?
    private(set) var lastVelocity: BarVelocityResult?

    /// Reps completed one-by-one this bout (never jumps 0→5 in one frame).
    private(set) var liveCompletedReps: Int = 0
    /// m/s of the LAST finished rep only — blank until the first rep completes.
    private(set) var lastCompletedRepVelocityMs: Double?
    private(set) var lastCompletedRepVelocityConfidence: Double?

    // Bout / peak tracking
    private var peakHighWater: Int = 0
    private var lastRepEmitAt: Double = -1
    private var currentBoutStart: Double?

    private static let liveHorizonSeconds: Double = 35
    private static let minBoutSeconds: Double = 2.5
    private static let mergeGapSeconds: Double = 1.8
    /// Min time between accepted live rep ticks (matches squat cycle floor).
    private static let minSecondsBetweenReps: Double = 0.55

    var sampleCount: Int { samples.count }

    func reset() {
        samples = []
        decimator = SensorDecimator()
        openWindows = []
        closedWindows = []
        lastRepResult = nil
        lastTiming = nil
        lastVelocity = nil
        liveCompletedReps = 0
        lastCompletedRepVelocityMs = nil
        lastCompletedRepVelocityConfidence = nil
        peakHighWater = 0
        lastRepEmitAt = -1
        currentBoutStart = nil
        startedAt = nil
        captureMode = .classic
    }

    func beginSession(mode: SensorCaptureMode, at date: Date = Date()) {
        reset()
        captureMode = mode
        startedAt = date
    }

    func pushRaw(t: Double, ax: Double, ay: Double, az: Double,
                 gx: Double, gy: Double, gz: Double) {
        let out = decimator.push(t: t, ax: ax, ay: ay, az: az, gx: gx, gy: gy, gz: gz)
        if !out.isEmpty {
            samples.append(contentsOf: out)
            recomputeLive()
        }
    }

    func finishSampling() {
        let tail = decimator.finish()
        if !tail.isEmpty {
            samples.append(contentsOf: tail)
            recomputeLive()
        }
    }

    // MARK: - windows

    func openWindow(tramoId: String?, exerciseId: Int?, modality: String?, name: String?, at t: Double) {
        openWindows.append(SensorWindowLabel(
            t0: t, t1: nil, tramoId: tramoId, exerciseId: exerciseId,
            modality: modality, movementName: name
        ))
    }

    func closeWindow(at t: Double) {
        guard var w = openWindows.popLast() else { return }
        w = SensorWindowLabel(
            t0: w.t0, t1: t, tramoId: w.tramoId, exerciseId: w.exerciseId,
            modality: w.modality, movementName: w.movementName
        )
        closedWindows.append(w)
        recomputeLive()
    }

    var allWindows: [SensorWindowLabel] {
        closedWindows + openWindows
    }

    // MARK: - conclusions

    private func recomputeLive() {
        guard samples.count >= 50, let tEnd = samples.last?.t else { return }

        let sliceStart = tEnd - Self.liveHorizonSeconds
        let recent = samples.filter { $0.t >= sliceStart }
        guard recent.count >= 40 else { return }

        let timing = activity.analyze(recent)
        lastTiming = timing

        let merged = Self.mergeWorkIntervals(timing.workIntervals, maxGap: Self.mergeGapSeconds)
        let bouts = merged.filter { $0.1 - $0.0 >= Self.minBoutSeconds }
        let active = bouts.last(where: { tEnd - $0.1 <= 0.75 }) ?? bouts.last
        guard let bout = active else { return }

        // New bout → reset progressive counters (keep last completed m/s sticky
        // on the phone until a new rep lands).
        if currentBoutStart == nil || abs(bout.0 - (currentBoutStart ?? bout.0)) > 0.5 {
            currentBoutStart = bout.0
            peakHighWater = 0
            liveCompletedReps = 0
            lastRepEmitAt = -1
        }

        let boutSamples = recent.filter { $0.t >= bout.0 && $0.t <= max(bout.1, tEnd) }
        guard boutSamples.count >= 40 else { return }

        let result = reps.count(samples: boutSamples, workOnly: nil)
        let vel = velocity.estimate(samples: boutSamples, workOnly: nil)
        lastRepResult = result
        lastVelocity = vel

        // ── Rep completed → +1 and lock that rep's m/s ─────────────────────
        // Absolute peak count can jump (noise → "5"). Live display only ticks
        // +1 when the high-water mark rises AND enough time passed since last tick.
        if result.reps > peakHighWater {
            peakHighWater = result.reps
            let elapsedOk = lastRepEmitAt < 0 || (tEnd - lastRepEmitAt) >= Self.minSecondsBetweenReps
            let qualityOk = result.level != .unknown && result.confidence >= 0.45
            if elapsedOk, qualityOk {
                liveCompletedReps += 1
                lastRepEmitAt = tEnd
                // Velocity of the rep that just finished (Alex: show m/s after the rep).
                if let vels = vel?.repVelocities, !vels.isEmpty {
                    lastCompletedRepVelocityMs = vels.last
                    lastCompletedRepVelocityConfidence = vel?.confidence
                } else if let m = vel?.meanVelocityLast {
                    lastCompletedRepVelocityMs = m
                    lastCompletedRepVelocityConfidence = vel?.confidence
                }
            }
        }
    }

    /// Collapse work intervals separated by less than `maxGap` into one bout.
    static func mergeWorkIntervals(
        _ intervals: [(Double, Double)],
        maxGap: Double
    ) -> [(Double, Double)] {
        let sorted = intervals.sorted { $0.0 < $1.0 }
        guard var current = sorted.first else { return [] }
        var out: [(Double, Double)] = []
        for next in sorted.dropFirst() {
            if next.0 - current.1 <= maxGap {
                current = (current.0, max(current.1, next.1))
            } else {
                out.append(current)
                current = next
            }
        }
        out.append(current)
        return out
    }

    /// Build the archive file bytes for transfer (fase 0). Nil if nothing useful.
    func encodeArchive(appVersion: String?) throws -> Data? {
        finishSampling()
        guard !samples.isEmpty, let startedAt else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let header = SensorFileHeader(
            formatVersion: Int(SensorFileFormat.version),
            executionLocalId: executionLocalId,
            startedAt: iso.string(from: startedAt),
            sampleHz: SensorFileFormat.targetHz,
            channels: SensorFileFormat.channels,
            captureMode: captureMode.rawValue,
            watchModel: watchModel,
            wrist: wrist?.rawValue,
            appVersion: appVersion,
            windows: allWindows,
            sampleCount: samples.count
        )
        return try SensorFileCodec.encode(header: header, samples: samples)
    }
}
