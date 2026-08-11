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

    var sampleCount: Int { samples.count }

    func reset() {
        samples = []
        decimator = SensorDecimator()
        openWindows = []
        closedWindows = []
        lastRepResult = nil
        lastTiming = nil
        lastVelocity = nil
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
        guard samples.count >= 12 else { return }
        let timing = activity.analyze(samples)
        lastTiming = timing
        lastRepResult = reps.count(samples: samples, workOnly: timing.workIntervals)
        lastVelocity = velocity.estimate(samples: samples, workOnly: timing.workIntervals)
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
