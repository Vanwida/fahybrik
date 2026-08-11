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

    /// Latest live conclusions for the current open work window.
    private(set) var lastRepResult: RepCountResult?
    private(set) var lastTiming: ActivityTimingResult?
    private(set) var lastVelocity: BarVelocityResult?
    /// Sticky last good velocity so rest between sets (and micro-pauses
    /// between reps of the SAME set) doesn't blank the chip.
    private var lastGoodVelocity: BarVelocityResult?
    /// Session time (sample t) when lastGoodVelocity was produced.
    private var lastGoodVelocityAt: Double?

    /// Live inference only looks at this much recent signal. Using the WHOLE
    /// session concatenated set1+rest+set2 with time gaps, which broke period
    /// detection after the first set (m/s worked once, then never again).
    private static let liveHorizonSeconds: Double = 35
    /// A work bout shorter than this is still "getting up from a chair".
    private static let minBoutSeconds: Double = 2.5
    /// Keep showing the last bout's m/s this long into rest / between-rep dips.
    private static let stickyVelocitySeconds: Double = 25
    /// Gaps shorter than this between work intervals are still ONE set
    /// (rack breath, bottom pause) — not a real rest between series.
    private static let mergeGapSeconds: Double = 1.8

    var sampleCount: Int { samples.count }

    func reset() {
        samples = []
        decimator = SensorDecimator()
        openWindows = []
        closedWindows = []
        lastRepResult = nil
        lastTiming = nil
        lastVelocity = nil
        lastGoodVelocity = nil
        lastGoodVelocityAt = nil
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
        // Need enough recent samples (~1 s at 50 Hz floor).
        guard samples.count >= 50, let tEnd = samples.last?.t else { return }

        // LIVE slice only — not the full session. Concatenating set1 + rest + set2
        // left a hole in time; medianDt and period estimation died after set 1.
        let sliceStart = tEnd - Self.liveHorizonSeconds
        let recent = samples.filter { $0.t >= sliceStart }
        guard recent.count >= 40 else { return }

        let timing = activity.analyze(recent)
        lastTiming = timing

        // Merge micro-gaps (between-rep pauses look like "rest" to the energy
        // detector — that was blanking m/s mid-set on the first series).
        let merged = Self.mergeWorkIntervals(timing.workIntervals, maxGap: Self.mergeGapSeconds)
        let bouts = merged.filter { $0.1 - $0.0 >= Self.minBoutSeconds }

        // Prefer the bout that is still open (ends near now), else the latest solid one.
        let active = bouts.last(where: { tEnd - $0.1 <= 0.75 }) ?? bouts.last
        guard let bout = active else {
            holdSticky(now: tEnd)
            return
        }

        // Samples of THAT bout only (contiguous → clean period).
        let boutSamples = recent.filter { $0.t >= bout.0 && $0.t <= max(bout.1, tEnd) }
        let boutSpan = max(bout.1, tEnd) - bout.0
        guard boutSamples.count >= 40, boutSpan >= Self.minBoutSeconds else {
            holdSticky(now: tEnd)
            return
        }

        lastRepResult = reps.count(samples: boutSamples, workOnly: nil)
        if let v = velocity.estimate(samples: boutSamples, workOnly: nil) {
            lastVelocity = v
            lastGoodVelocity = v
            lastGoodVelocityAt = tEnd
        } else {
            // Mid-rep / half cycle — keep the previous good reading.
            holdSticky(now: tEnd)
        }
    }

    /// Keep last good m/s through between-rep dips and short rests; then clear.
    private func holdSticky(now: Double) {
        lastRepResult = RepCountResult(
            reps: 0, confidence: 0, level: .unknown,
            periodSeconds: nil, alternatingPattern: false
        )
        if let good = lastGoodVelocity, let at = lastGoodVelocityAt,
           now - at <= Self.stickyVelocitySeconds {
            lastVelocity = good
            return
        }
        lastVelocity = nil
        lastGoodVelocity = nil
        lastGoodVelocityAt = nil
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
