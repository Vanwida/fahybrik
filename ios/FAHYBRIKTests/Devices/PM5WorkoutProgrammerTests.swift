import XCTest
@testable import FAHYBRIK

// Mapping tests: our prescription domain → the PM5's native workout menu.
// The flagship case is the free "5×500m r1:30" (exactly what FreeWorkoutDraft
// builds), which must land on the monitor as fixed-distance intervals 500m/1:30.
final class PM5WorkoutProgrammerTests: XCTestCase {

    // MARK: - Builders (mirror FreeWorkoutDraft / the assignment fold shapes)

    private func ergSegment(
        distance: Double? = nil,
        duration: Int? = nil,
        pacePerKm: Int? = nil,
        prescription: Prescription? = nil,
        kind: SegmentKind = .rowOrSki
    ) -> WorkoutSegment {
        WorkoutSegment(
            order: 1,
            title: "Remo",
            kind: kind,
            targetDistanceMeters: distance,
            targetDurationSeconds: duration,
            targetPaceSecondsPerKm: pacePerKm,
            prescription: prescription
        )
    }

    private func prescription(
        scheme: PrescriptionScheme,
        sets: [PrescriptionSet]? = nil,
        rounds: Int? = nil,
        workS: Int? = nil,
        restS: Int? = nil,
        totalS: Int? = nil,
        target: Target? = nil
    ) -> Prescription {
        Prescription(scheme: scheme, modality: .row, sets: sets, rounds: rounds,
                     workS: workS, restS: restS, totalS: totalS, target: target,
                     note: nil, start: nil, increment: nil)
    }

    private func distanceSet(_ meters: Double, restS: Int? = nil, target: Target? = nil) -> PrescriptionSet {
        PrescriptionSet(measure: .distance(meters: meters), target: target,
                        modality: nil, restS: restS, tempo: nil, note: nil)
    }

    // MARK: - The flagship free piece

    func testFree5x500r90MapsToDistanceIntervals() {
        // Exactly what FreeWorkoutDraft builds for "5×500 r1:30 @1:52/500m":
        // scheme intervals, rounds 5, restS 90, one set (distance 500, pace 112),
        // scalar mirrors distance=500 / pace 224 s/km.
        let pace = Target.pace(unit: .per500m, valueS: 112, minS: nil, maxS: nil)
        let p = prescription(scheme: .intervals,
                             sets: [distanceSet(500, restS: 90, target: pace)],
                             rounds: 5, restS: 90, target: pace)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(distance: 500, pacePerKm: 224, prescription: p))
        XCTAssertEqual(spec, .distanceIntervals(workMeters: 500, restSeconds: 90, pace: 112))
    }

    func testRestlessSeriesFoldsIntoOneFixedPieceSplitByBout() {
        // 5×500 with NO rest ≡ 2500 m continuous with 500 m splits — the honest
        // monitor equivalent (fixed intervals need a rest).
        let p = prescription(scheme: .intervals, sets: [distanceSet(500)], rounds: 5)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(distance: 500, prescription: p))
        XCTAssertEqual(spec, .fixedDistance(meters: 2500, splitMeters: 500))
    }

    func testTimeSeriesMapsToTimeIntervals() {
        // 8×0:90 r0:60 by time — the per-bout duration lives in the scalar mirror
        // (FreeWorkoutDraft leaves workS nil for series).
        let p = prescription(scheme: .intervals, sets: [
            PrescriptionSet(measure: .duration(seconds: 90), target: nil, modality: nil, restS: 60, tempo: nil, note: nil),
        ], rounds: 8, restS: 60)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(duration: 90, prescription: p))
        XCTAssertEqual(spec, .timeIntervals(workSeconds: 90, restSeconds: 60))
    }

    func testCalorieSeriesMapsToCalorieIntervals() {
        // 5×15 cal r1:00 — calories never flatten into scalars, the typed set
        // measure carries them.
        let p = prescription(scheme: .intervals, sets: [
            PrescriptionSet(measure: .calories(15), target: nil, modality: nil, restS: 60, tempo: nil, note: nil),
        ], rounds: 5, restS: 60)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(prescription: p))
        XCTAssertEqual(spec, .calorieIntervals(workCalories: 15, restSeconds: 60))
    }

    func testHeterogeneousPyramidDegradesToJustRow() {
        // 1200/1000/800: no single honest bout → the app drives, the monitor
        // free-runs (variable-interval programming is a future wire).
        let p = prescription(scheme: .intervals,
                             sets: [distanceSet(1200), distanceSet(1000), distanceSet(800)],
                             restS: 120)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(prescription: p))
        XCTAssertEqual(spec, .justRow())
    }

    // MARK: - Continuous / windowed shapes

    func testSteadyDurationMapsToFixedTime() {
        let p = prescription(scheme: .steady, totalS: 2400)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(duration: 2400, prescription: p))
        XCTAssertEqual(spec, .fixedTime(seconds: 2400, splitSeconds: nil))
    }

    func testForTimeDistanceMapsToFixedDistance() {
        // The classic 2000 m test: fixed distance, monitor default splits.
        let p = prescription(scheme: .forTime, sets: [distanceSet(2000)])
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(distance: 2000, prescription: p))
        XCTAssertEqual(spec, .fixedDistance(meters: 2000, splitMeters: nil))
    }

    func testAmrapWindowMapsToFixedTime() {
        let p = prescription(scheme: .amrap, totalS: 600)
        XCTAssertEqual(PM5WorkoutProgrammer.spec(for: ergSegment(prescription: p)),
                       .fixedTime(seconds: 600, splitSeconds: nil))
    }

    func testAppDrivenFormatsMapToJustRow() {
        // EMOM (and friends) keep their clock in the app; the monitor free-runs
        // zeroed with splits.
        let p = prescription(scheme: .emom, rounds: 10, workS: 60)
        XCTAssertEqual(PM5WorkoutProgrammer.spec(for: ergSegment(prescription: p)), .justRow())
    }

    func testScalarOnlySegmentUsesScalarsAndHalvesPerKmPace() {
        // Legacy/freeform segment with no structured prescription: scalar
        // distance + the sec/km pace mirror halved to /500m (erg convention).
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(distance: 2000, pacePerKm: 224))
        XCTAssertEqual(spec, .fixedDistance(meters: 2000, splitMeters: nil, pace: 112))
    }

    func testPaceRangeTakesMidpoint() {
        // @1:50–1:54 → 112 s (the single number a PaceBoat can hold).
        let pace = Target.pace(unit: .per500m, valueS: nil, minS: 110, maxS: 114)
        let p = prescription(scheme: .steady, target: pace)
        XCTAssertEqual(PM5WorkoutProgrammer.spec(for: ergSegment(distance: 5000, prescription: p)),
                       .fixedDistance(meters: 5000, splitMeters: nil, pace: 112))
    }

    // MARK: - Never on non-erg segments

    func testNonErgSegmentsAreNeverProgrammed() {
        XCTAssertNil(PM5WorkoutProgrammer.spec(for: ergSegment(distance: 1000, kind: .running)))
        XCTAssertNil(PM5WorkoutProgrammer.spec(for: ergSegment(kind: .strength)))
    }
}

// The seam programming OPENS in the session: when the programmed piece lands
// ("row to begin") the monitor ZEROES its cumulative counters mid-segment — the
// same happens when the athlete presses Menu. The per-segment distance anchor
// must re-anchor across that backward jump instead of freezing the delta.
final class PM5MonitorResetReanchorTests: XCTestCase {

    private func ergSession() -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Remo", kind: .rowOrSki,
                                 targetDistanceMeters: 500, blockTitle: "Erg", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .steady, estimatedDurationSeconds: 600,
                               blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()   // running, not paused, not awaiting
        return s
    }

    private func feed(_ s: WorkoutSession, distance: Double, calories: Int? = nil) {
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: distance, caloriesKcal: calories)
    }

    func testMonitorResetPreservesCoveredMeters() {
        let s = ergSession()
        feed(s, distance: 0)
        feed(s, distance: 300)
        XCTAssertEqual(s.lapErgDistanceMeters, 300)
        // The programmed piece lands mid-segment → monitor zeroes → the covered
        // meters must survive and keep growing, never freeze at max(0, 0−300).
        feed(s, distance: 0)
        XCTAssertEqual(s.lapErgDistanceMeters, 300)
        feed(s, distance: 120)
        XCTAssertEqual(s.lapErgDistanceMeters, 420)
    }

    func testStaleCumulativeAnchorSurvivesReset() {
        // A stale sample from the PREVIOUS piece (cumulative 2500) arrives before
        // the reset — the classic re-program race. After the zero, deltas must
        // count from the new piece, not wait until 2500 m are re-covered.
        let s = ergSession()
        feed(s, distance: 2500)
        XCTAssertEqual(s.lapErgDistanceMeters, 0)
        feed(s, distance: 0)      // monitor reset
        feed(s, distance: 50)
        XCTAssertEqual(s.lapErgDistanceMeters, 50)
    }
}
