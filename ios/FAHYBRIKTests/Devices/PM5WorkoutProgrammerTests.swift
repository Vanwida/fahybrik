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

    func testFree5x500r90MapsToSingleBoutFixedDistance() {
        // App-owned series: each bout is programmed as fixed 500 m (not native
        // distanceIntervals). The live path re-sends on every tramo key so the
        // monitor zeros at the start of serie 2/5, 3/5, …
        let pace = Target.pace(unit: .per500m, valueS: 112, minS: nil, maxS: nil)
        let p = prescription(scheme: .intervals,
                             sets: [distanceSet(500, restS: 90, target: pace)],
                             rounds: 5, restS: 90, target: pace)
        let seg = ergSegment(distance: 500, pacePerKm: 224, prescription: p)
        let spec = PM5WorkoutProgrammer.spec(for: seg)
        XCTAssertEqual(spec, .fixedDistance(meters: 500, splitMeters: nil, pace: 112))
        XCTAssertFalse(PM5WorkoutProgrammer.monitorRunsTheSeries(seg))
    }

    func testRestlessSeriesAlsoSingleBoutNotFoldedTotal() {
        // 5×500 with NO rest: still one bout of 500 (app reprograms each round),
        // never a silent 2500 m piece that hides the series on the monitor.
        let p = prescription(scheme: .intervals, sets: [distanceSet(500)], rounds: 5)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(distance: 500, prescription: p))
        XCTAssertEqual(spec, .fixedDistance(meters: 500, splitMeters: nil))
    }

    func testTimeSeriesMapsToFixedTimeBout() {
        let p = prescription(scheme: .intervals, sets: [
            PrescriptionSet(measure: .duration(seconds: 90), target: nil, modality: nil, restS: 60, tempo: nil, note: nil),
        ], rounds: 8, restS: 60)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(duration: 90, prescription: p))
        XCTAssertEqual(spec, .fixedTime(seconds: 90, splitSeconds: nil))
    }

    func testCalorieSeriesMapsToFixedCaloriesBout() {
        let p = prescription(scheme: .intervals, sets: [
            PrescriptionSet(measure: .calories(15), target: nil, modality: nil, restS: 60, tempo: nil, note: nil),
        ], rounds: 5, restS: 60)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(prescription: p))
        XCTAssertEqual(spec, .fixedCalories(calories: 15, splitCalories: nil))
    }

    func testHeterogeneousPyramidSegmentFallbackIsJustRow() {
        // Segment-level (no tramo measure): mixed sets → no uniform bout → justRow.
        // Live path programs each bout via tramo.measure (1200 then 1000 then 800).
        let p = prescription(scheme: .intervals,
                             sets: [distanceSet(1200), distanceSet(1000), distanceSet(800)],
                             restS: 120)
        let spec = PM5WorkoutProgrammer.spec(for: ergSegment(prescription: p))
        XCTAssertEqual(spec, .justRow())
    }

    func testTramoBoutSpecProgramsPyramidStep() {
        let p = prescription(scheme: .intervals,
                             sets: [distanceSet(1200), distanceSet(1000), distanceSet(800)],
                             restS: 120)
        let seg = ergSegment(prescription: p)
        let tramo = LiveTramo(segmentIndex: 0, cursor: .conditioningRound(1),
                              label: "Remo", modality: .row,
                              measure: .distance(meters: 1000), boxedSeconds: nil)
        let policy = ErgCounterPolicy.resolve(tramo: tramo, segment: seg, phase: .work)
        let spec = PM5WorkoutProgrammer.spec(for: tramo, segment: seg, policy: policy)
        XCTAssertEqual(spec, .fixedDistance(meters: 1000, splitMeters: nil))
        XCTAssertEqual(PM5WorkoutProgrammer.programWindowKey(policy: policy, tramo: tramo, segment: seg),
                       tramo.key)
    }

    func testRestPhaseDoesNotProgram() {
        let p = prescription(scheme: .intervals, sets: [distanceSet(500)], rounds: 5, restS: 90)
        let seg = ergSegment(distance: 500, prescription: p)
        let tramo = LiveTramo(segmentIndex: 0, cursor: .conditioningRound(0),
                              label: "Remo", modality: .row,
                              measure: .distance(meters: 500), boxedSeconds: nil)
        let policy = ErgCounterPolicy.resolve(tramo: tramo, segment: seg, phase: .rest)
        XCTAssertNil(PM5WorkoutProgrammer.spec(for: tramo, segment: seg, policy: policy))
        XCTAssertNil(PM5WorkoutProgrammer.programWindowKey(policy: policy, tramo: tramo, segment: seg))
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
                               coachNote: nil, warmupChecklist: [])
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
