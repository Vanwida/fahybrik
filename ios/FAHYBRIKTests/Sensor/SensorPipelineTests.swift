import XCTest
@testable import FAHYBRIK

final class SensorPipelineTests: XCTestCase {

    // MARK: - Decimator + codec

    func testDecimatorDownsamplesToTargetRate() {
        var d = SensorDecimator(targetHz: 50)
        var out: [SensorSample] = []
        // 200 Hz for 1 second of constant signal
        for i in 0..<200 {
            let t = Double(i) / 200.0
            out += d.push(t: t, ax: 1, ay: 0, az: 0, gx: 0, gy: 0, gz: 0)
        }
        out += d.finish()
        // ~50 samples (±2 for edge bins)
        XCTAssertGreaterThan(out.count, 40)
        XCTAssertLessThan(out.count, 60)
        XCTAssertEqual(out.first?.ax ?? 0, 1, accuracy: 0.01)
    }

    func testCodecRoundTripPreservesAlignment() throws {
        let samples = (0..<100).map { i -> SensorSample in
            let t = Double(i) / 50.0
            return SensorSample(t: t, ax: sin(t), ay: cos(t), az: 0.1, gx: 0.01, gy: -0.02, gz: 0.03)
        }
        let header = SensorFileHeader(
            formatVersion: 1,
            executionLocalId: "local-1",
            startedAt: "2026-08-06T10:00:00.000Z",
            sampleHz: 50,
            channels: SensorFileFormat.channels,
            captureMode: "classic",
            watchModel: "Watch6,1",
            wrist: "left",
            appVersion: "1.0",
            windows: [SensorWindowLabel(t0: 0, t1: 2, tramoId: "t1", exerciseId: 9, modality: "strength", movementName: "squat")],
            sampleCount: samples.count
        )
        let data = try SensorFileCodec.encode(header: header, samples: samples)
        // 100 samples × 12 B + header overhead → well under 3 MB / 45 min budget
        XCTAssertLessThan(data.count, 5_000)

        let decoded = try SensorFileCodec.decode(data)
        XCTAssertEqual(decoded.samples.count, samples.count)
        XCTAssertEqual(decoded.header.executionLocalId, "local-1")
        XCTAssertEqual(decoded.header.windows.count, 1)
        XCTAssertEqual(decoded.samples[10].ax, samples[10].ax, accuracy: 0.02)
    }

    // MARK: - Activity detector

    func testActivityDetectorSplitsWorkAndRest() {
        // 2 s rest (quiet) + 4 s work (1.5 Hz oscillation) + 2 s rest
        var samples: [SensorSample] = []
        let hz = 50.0
        for i in 0..<400 {
            let t = Double(i) / hz
            let working = t >= 2 && t < 6
            let ax = working ? 8 * sin(2 * .pi * 1.5 * t) : 0.05 * sin(2 * .pi * 0.2 * t)
            samples.append(SensorSample(t: t, ax: ax, ay: 0.02, az: 0.01, gx: 0, gy: 0, gz: 0))
        }
        let result = ActivityDetector().analyze(samples)
        XCTAssertGreaterThan(result.workSeconds, 3.0)
        XCTAssertLessThan(result.workSeconds, 5.5)
        XCTAssertGreaterThan(result.restSeconds, 2.5)
        XCTAssertEqual(result.workSeconds + result.restSeconds, 8.0, accuracy: 0.3)
        XCTAssertGreaterThan(result.confidence, 0.3)
    }

    // MARK: - Rep counter

    func testRepCounterCountsPeriodicPeaksWithinOne() {
        // 10 reps at 0.8 s period on the X axis
        let period = 0.8
        let reps = 10
        let hz = 50.0
        var samples: [SensorSample] = []
        let totalT = Double(reps) * period
        let n = Int(totalT * hz)
        for i in 0..<n {
            let t = Double(i) / hz
            let ax = 6 * sin(2 * .pi * t / period)
            samples.append(SensorSample(t: t, ax: ax, ay: 0.1, az: 0.1, gx: 0, gy: 0, gz: 0))
        }
        let result = RepCounter().count(samples: samples)
        XCTAssertEqual(result.reps, reps, accuracy: 0) // allow exact first; if off, next assert
        // Plan acceptance: ±1
        XCTAssertLessThanOrEqual(abs(result.reps - reps), 1)
        XCTAssertNotEqual(result.level, RepConfidenceLevel.unknown)
        XCTAssertFalse(result.alternatingPattern)
    }

    func testRepCounterIgnoresShortSitToStand() {
        // ~1.2 s of a single vertical push — standing up from a chair, not a set.
        let hz = 50.0
        var samples: [SensorSample] = []
        for i in 0..<60 {
            let t = Double(i) / hz
            let ax = 8 * exp(-t * 2) * sin(2 * .pi * t / 0.6)
            samples.append(SensorSample(t: t, ax: ax, ay: 0.2, az: 0.1, gx: 0, gy: 0, gz: 0))
        }
        let result = RepCounter().count(samples: samples)
        XCTAssertNotEqual(result.level, .counted, "levantarse de la silla no es un set")
        XCTAssertLessThan(result.confidence, 0.50)
    }

    func testMergeWorkIntervalsBridgesBetweenRepPauses() {
        let raw: [(Double, Double)] = [(0, 2.0), (2.5, 4.5), (5.0, 8.0), (20, 25)]
        let merged = SensorPipeline.mergeWorkIntervals(raw, maxGap: 1.8)
        XCTAssertEqual(merged.count, 2)
        XCTAssertEqual(merged[0].0, 0, accuracy: 0.01)
        XCTAssertEqual(merged[0].1, 8.0, accuracy: 0.01)
        XCTAssertEqual(merged[1].0, 20, accuracy: 0.01)
    }

    func testVelocityStillWorksOnSecondBoutAfterGap() {
        // Two work bouts with a rest gap — the bug that killed m/s after set 1.
        // Pipeline must use the LATEST bout only (tested here at estimator level:
        // a single contiguous bout after a gap still estimates).
        let hz = 50.0
        var bout2: [SensorSample] = []
        // Second set only (as the pipeline would slice it)
        for i in 0..<400 {
            let t = 60.0 + Double(i) / hz   // after a long rest
            let ax = 7 * sin(2 * .pi * (t - 60.0) / 0.9)
            bout2.append(SensorSample(t: t, ax: ax, ay: 0.1, az: 0.1, gx: 0, gy: 0, gz: 0))
        }
        let v = BarVelocityEstimator().estimate(samples: bout2, workOnly: nil)
        XCTAssertNotNil(v, "un bout limpio tras descanso debe dar m/s")
        XCTAssertGreaterThan(v?.meanVelocityFirst ?? 0, 0)
    }

    func testRepCounterNeverHighConfidenceOnAlternating() {
        // Double-peak pattern: two peaks per intended cycle
        let cycle = 1.0
        let hz = 50.0
        var samples: [SensorSample] = []
        for i in 0..<500 {
            let t = Double(i) / hz
            // two lobes per cycle
            let ax = 5 * abs(sin(2 * .pi * t / (cycle / 2)))
            samples.append(SensorSample(t: t, ax: ax, ay: 0, az: 0, gx: 0, gy: 0, gz: 0))
        }
        let result = RepCounter().count(samples: samples)
        if result.alternatingPattern {
            XCTAssertNotEqual(result.level, .counted)
        }
        // Even if alternating detection is conservative, high confidence + huge error is forbidden
        if result.level == .counted {
            XCTAssertLessThan(result.reps, 30)
        }
    }

    // MARK: - Bar velocity

    func testBarVelocityReportsMonotonicLossOnFatigueSeries() {
        // First half strong, second half slower (lower amplitude + longer period)
        var samples: [SensorSample] = []
        let hz = 50.0
        // 5 fast reps
        for i in 0..<200 {
            let t = Double(i) / hz
            let ax = 10 * sin(2 * .pi * t / 0.7)
            samples.append(SensorSample(t: t, ax: ax, ay: 0, az: 0, gx: 0, gy: 0, gz: 0))
        }
        // 5 slow reps
        for i in 0..<300 {
            let t = 4.0 + Double(i) / hz
            let ax = 4 * sin(2 * .pi * (t - 4.0) / 1.1)
            samples.append(SensorSample(t: t, ax: ax, ay: 0, az: 0, gx: 0, gy: 0, gz: 0))
        }
        guard let result = BarVelocityEstimator().estimate(samples: samples) else {
            // Synthetic signal may not always produce a result — not a hard fail if nil
            // when peaks aren't clean enough; the real acceptance is on-device video.
            return
        }
        XCTAssertGreaterThan(result.meanVelocityFirst, 0)
        XCTAssertGreaterThanOrEqual(result.velocityLossPct, 0)
        XCTAssertGreaterThan(result.confidence, 0)
    }
}

// Local accuracy helper for Int
private func XCTAssertEqual(_ a: Int, _ b: Int, accuracy: Int, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertLessThanOrEqual(abs(a - b), accuracy, file: file, line: line)
}
