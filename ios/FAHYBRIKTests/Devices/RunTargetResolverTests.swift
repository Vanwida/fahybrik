import XCTest
@testable import FAHYBRIK

// The domain core: speed↔pace conversion, target resolution across every run
// prescription variant, in/out-of-target judgment, goal progress, estimated zone.
final class RunTargetResolverTests: XCTestCase {

    // MARK: - Pace math

    func testSpeedToPace() {
        XCTAssertEqual(TreadmillMath.paceSecPerKm(fromSpeedKmh: 12), 300) // 5:00 /km
        XCTAssertEqual(TreadmillMath.paceSecPerKm(fromSpeedKmh: 10), 360) // 6:00 /km
        XCTAssertEqual(TreadmillMath.paceSecPerKm(fromSpeedKmh: 14.4), 250)
    }

    func testStoppedBeltHasNoPace() {
        XCTAssertNil(TreadmillMath.paceSecPerKm(fromSpeedKmh: 0))
        XCTAssertNil(TreadmillMath.paceSecPerKm(fromSpeedKmh: 0.4))
    }

    func testDistanceIntegration() {
        // 10.8 km/h = 3 m/s over 2 s = 6 m.
        XCTAssertEqual(TreadmillMath.advanceDistance(0, speedKmh: 10.8, dt: 2), 6.0, accuracy: 0.0001)
        XCTAssertEqual(TreadmillMath.advanceDistance(6, speedKmh: 0, dt: 2), 6.0)   // stopped adds nothing
        XCTAssertEqual(TreadmillMath.advanceDistance(6, speedKmh: 10, dt: 0), 6.0)  // no time adds nothing
    }

    func testClockFormat() {
        XCTAssertEqual(Formato.clock(305), "5:05")
        XCTAssertEqual(Formato.clock(0), "0:00")
        XCTAssertEqual(Formato.clock(-5), "0:00")
    }

    // MARK: - Pace target judgment

    func testBandStatus() {
        let band = PaceTarget(fastS: 270, slowS: 285)
        XCTAssertEqual(band.status(currentSecPerKm: 275), .inTarget)
        XCTAssertEqual(band.status(currentSecPerKm: 260), .tooFast)  // faster than fast bound
        XCTAssertEqual(band.status(currentSecPerKm: 290), .tooSlow)  // slower than slow bound
        XCTAssertEqual(band.status(currentSecPerKm: nil), .unknown)
        XCTAssertEqual(band.status(currentSecPerKm: 0), .unknown)
    }

    func testSingleValueStatusUsesTolerance() {
        let single = PaceTarget(single: 270)
        XCTAssertEqual(single.status(currentSecPerKm: 270), .inTarget)
        XCTAssertEqual(single.status(currentSecPerKm: 275), .inTarget)   // within ±8
        XCTAssertEqual(single.status(currentSecPerKm: 261), .tooFast)    // 270-8-1
        XCTAssertEqual(single.status(currentSecPerKm: 279), .tooSlow)    // 270+8+1
    }

    // MARK: - Resolving a run's target from a segment

    func testResolveScalarPace() {
        let seg = segment(paceSecPerKm: 270)
        XCTAssertEqual(RunTarget.resolve(from: seg), .pace(PaceTarget(single: 270)))
    }

    func testResolveStructuredPaceBand() {
        let seg = segment(prescription: pace(.perKm, valueS: nil, minS: 270, maxS: 285))
        XCTAssertEqual(RunTarget.resolve(from: seg), .pace(PaceTarget(single: nil, fastS: 270, slowS: 285)))
    }

    func testResolvePer500mNormalizesToPerKm() {
        let seg = segment(prescription: pace(.per500m, valueS: 150, minS: nil, maxS: nil))
        XCTAssertEqual(RunTarget.resolve(from: seg), .pace(PaceTarget(single: 300))) // 150/500m → 300/km
    }

    func testResolvePerMileNormalizesToPerKm() {
        let seg = segment(prescription: pace(.perMile, valueS: 360, minS: nil, maxS: nil))
        // 360 s/mile ÷ 1.609344 ≈ 224 s/km
        XCTAssertEqual(RunTarget.resolve(from: seg), .pace(PaceTarget(single: 224)))
    }

    func testResolveZoneScalarAndStructured() {
        XCTAssertEqual(RunTarget.resolve(from: segment(zone: .z2)), .zone(.z2))
        let seg = segment(prescription: Prescription(scheme: .steady, modality: .run, sets: nil,
                                                     rounds: nil, workS: nil, restS: nil, totalS: nil,
                                                     target: .hrZone(value: 3, min: nil, max: nil),
                                                     note: nil, start: nil, increment: nil))
        XCTAssertEqual(RunTarget.resolve(from: seg), .zone(.z3))
    }

    func testResolveNoTarget() {
        XCTAssertEqual(RunTarget.resolve(from: segment()), .none)
    }

    func testZoneStatus() {
        let target = RunTarget.zone(.z2)
        XCTAssertEqual(target.zoneStatus(currentZone: .z2), .inTarget)
        XCTAssertEqual(target.zoneStatus(currentZone: .z1), .tooSlow)
        XCTAssertEqual(target.zoneStatus(currentZone: .z4), .tooFast)
        XCTAssertEqual(target.zoneStatus(currentZone: nil), .unknown)
    }

    func testObjetivoLabel() {
        XCTAssertEqual(RunTarget.pace(PaceTarget(fastS: 270, slowS: 285)).objetivoLabel, "4:30–4:45/km")
        XCTAssertEqual(RunTarget.pace(PaceTarget(single: 240)).objetivoLabel, "4:00/km")
        XCTAssertEqual(RunTarget.zone(.z2).objetivoLabel, "Z2")
        XCTAssertNil(RunTarget.none.objetivoLabel)
    }

    // MARK: - Goal / progress

    func testGoalResolveAndProgress() {
        XCTAssertEqual(SegmentGoal.resolve(from: segment(distanceM: 1000)), .distance(meters: 1000))
        XCTAssertEqual(SegmentGoal.resolve(from: segment(durationS: 600)), .time(seconds: 600))
        XCTAssertEqual(SegmentGoal.resolve(from: segment()), .open)

        let d = SegmentGoal.distance(meters: 1000)
        XCTAssertEqual(d.fraction(distanceM: 500, elapsedS: 0), 0.5)
        XCTAssertTrue(d.isComplete(distanceM: 1000, elapsedS: 0))
        XCTAssertFalse(d.isComplete(distanceM: 999, elapsedS: 0))

        let t = SegmentGoal.time(seconds: 600)
        XCTAssertEqual(t.fraction(distanceM: 0, elapsedS: 300), 0.5)
        XCTAssertTrue(t.isComplete(distanceM: 0, elapsedS: 600))
        XCTAssertEqual(t.fraction(distanceM: 0, elapsedS: 9999), 1.0) // clamped
    }

    // NOTE: there is no client-side HR-zone estimate left to cover here. The
    // server resolves the bands from the athlete's threshold; the app's side of
    // that contract is covered in AppleWorkoutMapperTests (classification against
    // the server's bands, and the refusal to invent one).

    // MARK: - Fixtures

    private func segment(paceSecPerKm: Int? = nil, zone: HRZone? = nil,
                         distanceM: Double? = nil, durationS: Int? = nil,
                         prescription: Prescription? = nil) -> WorkoutSegment {
        WorkoutSegment(order: 0, title: "Correr", kind: .running,
                       targetDistanceMeters: distanceM, targetDurationSeconds: durationS,
                       targetPaceSecondsPerKm: paceSecPerKm, targetZone: zone,
                       prescription: prescription)
    }

    private func pace(_ unit: PaceUnit, valueS: Int?, minS: Int?, maxS: Int?) -> Prescription {
        Prescription(scheme: .steady, modality: .run, sets: nil, rounds: nil, workS: nil,
                     restS: nil, totalS: nil,
                     target: .pace(unit: unit, valueS: valueS, minS: minS, maxS: maxS),
                     note: nil, start: nil, increment: nil)
    }
}
