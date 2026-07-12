import XCTest
@testable import FAHYBRIK

// #64 — the outdoor live pace from phone GPS. These lock the two honesty rules
// (drop distrusted fixes, show "—" when there's nothing trustworthy or the athlete
// is stopped) and the smoothing, plus the GPS quality badge classifier.
final class RunPaceSmootherTests: XCTestCase {

    // Steady 3.33 m/s (≈5:00 /km) → the smoothed pace lands on 5:00.
    func testSmoothedPaceOfSteadyRun() {
        var s = RunPaceSmoother()
        for i in 0..<10 {
            s.ingest(speedMps: 3.333, speedAccuracyMps: 0.5, now: Double(i))
        }
        XCTAssertEqual(s.paceSecPerKm(now: 9), 300)
    }

    // A distrusted fix (speed-accuracy worse than the gate, or invalid = negative) is
    // dropped: with only distrusted samples the pace is nil ("—").
    func testWeakSignalDropsFixes() {
        var s = RunPaceSmoother()
        s.ingest(speedMps: 3.3, speedAccuracyMps: 5.0, now: 0)   // too coarse
        s.ingest(speedMps: 3.3, speedAccuracyMps: -1, now: 1)    // invalid
        XCTAssertNil(s.paceSecPerKm(now: 1))
        XCTAssertNil(s.speedMps(now: 1))
    }

    // A confident near-zero speed (stopped) yields NO pace ("—") but IS a valid speed
    // reading for auto-pause — the two accessors diverge on purpose.
    func testStoppedSuppressesPaceButNotSpeed() {
        var s = RunPaceSmoother()
        for i in 0..<5 { s.ingest(speedMps: 0.1, speedAccuracyMps: 0.4, now: Double(i)) }
        XCTAssertNil(s.paceSecPerKm(now: 4), "essentially stopped → no pace")
        XCTAssertEqual(s.speedMps(now: 4) ?? -1, 0.1, accuracy: 0.001, "but the stop IS a speed")
    }

    // Samples outside the window are pruned, so the pace reflects the CURRENT gear,
    // not a stale one.
    func testWindowPrunesStaleSamples() {
        var s = RunPaceSmoother()
        s.ingest(speedMps: 5.0, speedAccuracyMps: 0.5, now: 0)   // old, will fall out
        s.ingest(speedMps: 2.5, speedAccuracyMps: 0.5, now: 20)  // ≈6:40 /km
        XCTAssertEqual(s.paceSecPerKm(now: 20), 400)
    }

    func testNoSamplesIsNil() {
        let s = RunPaceSmoother()
        XCTAssertNil(s.paceSecPerKm(now: 0))
        XCTAssertNil(s.speedMps(now: 0))
    }

    func testSignalQualityClassifier() {
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 8), .strong)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 30), .weak)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 80), .searching)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: -1), .searching)
    }
}
