import XCTest
@testable import FAHYBRIK

// The leg model that unifies continuous runs and interval SERIES: which leg is
// current, who owns its auto-advance, and the global "Tramo N de M" counter.
final class TreadmillLegTests: XCTestCase {

    // MARK: - Continuous run legs

    func testContinuousDistanceLegOwnsAdvance() {
        let leg = TreadmillLegResolver.leg(for: continuousRun(distanceM: 3000), isWork: true)
        XCTAssertEqual(leg.phase, .single)
        XCTAssertEqual(leg.goal, .distance(meters: 3000))
        XCTAssertTrue(leg.ownsAutoAdvance)   // we drive the close by belt distance
    }

    func testContinuousTimeLegOwnsAdvance() {
        let leg = TreadmillLegResolver.leg(for: continuousRun(durationS: 1200), isWork: true)
        XCTAssertEqual(leg.goal, .time(seconds: 1200))
        XCTAssertTrue(leg.ownsAutoAdvance)   // we drive the close by elapsed
    }

    func testContinuousOpenLegIsManualOnly() {
        let leg = TreadmillLegResolver.leg(for: continuousRun(), isWork: true)
        XCTAssertEqual(leg.goal, .open)
        XCTAssertFalse(leg.ownsAutoAdvance)  // nothing measurable → manual override only
    }

    // MARK: - Series legs (folded .intervals)

    func testSeriesDistanceWorkBoutOwnsAdvance() {
        let seg = series(rounds: 6, distanceM: 800, restS: 90)
        XCTAssertTrue(TreadmillLegResolver.isRunSeries(seg))
        let work = TreadmillLegResolver.leg(for: seg, isWork: true)
        XCTAssertEqual(work.phase, .work)
        XCTAssertEqual(work.goal, .distance(meters: 800))
        XCTAssertTrue(work.ownsAutoAdvance)  // distance bout → we close it
    }

    func testSeriesTimeWorkBoutIsSessionOwned() {
        let seg = series(rounds: 5, workS: 240, restS: 60)
        let work = TreadmillLegResolver.leg(for: seg, isWork: true)
        XCTAssertEqual(work.goal, .time(seconds: 240))
        XCTAssertFalse(work.ownsAutoAdvance) // timed bout → the session's clock rolls it
    }

    func testSeriesRecoveryIsSessionOwnedTimeCountdown() {
        let seg = series(rounds: 6, distanceM: 800, restS: 90)
        let rec = TreadmillLegResolver.leg(for: seg, isWork: false)
        XCTAssertEqual(rec.phase, .recovery)
        XCTAssertTrue(rec.isRecovery)
        XCTAssertEqual(rec.goal, .time(seconds: 90))
        XCTAssertEqual(rec.target, .none)     // recovery has no pace/zone judgment
        XCTAssertFalse(rec.ownsAutoAdvance)
    }

    // MARK: - Global "Tramo N de M"

    func testLegCountExpandsSeries() {
        let plan = [continuousRun(durationS: 600),          // warmup-ish single = 1 leg
                    series(rounds: 6, distanceM: 800, restS: 90), // 6×(work+rec) = 12 legs
                    continuousRun(durationS: 600)]           // cooldown single = 1 leg
        XCTAssertEqual(WorkoutLegCount.total(plan), 14)
    }

    func testLegCountSeriesWithoutRest() {
        let plan = [series(rounds: 4, distanceM: 400)]       // no rest → 4 legs
        XCTAssertEqual(WorkoutLegCount.total(plan), 4)
    }

    func testCurrentLegNumberInSeries() {
        let plan = [continuousRun(durationS: 600),
                    series(rounds: 6, distanceM: 800, restS: 90),
                    continuousRun(durationS: 600)]
        // 3rd work bout (rotRoundIndex 2, work): warmup(1) + r0w(2) r0r(3) r1w(4) r1r(5) r2w(6)
        XCTAssertEqual(WorkoutLegCount.current(plan, index: 1, rotRoundIndex: 2, isWork: true), 6)
        // Its recovery is the next leg.
        XCTAssertEqual(WorkoutLegCount.current(plan, index: 1, rotRoundIndex: 2, isWork: false), 7)
        // First warmup leg.
        XCTAssertEqual(WorkoutLegCount.current(plan, index: 0, rotRoundIndex: 0, isWork: true), 1)
    }

    func testLegCountFallsBackToSetsForLegacyPyramid() {
        // 1200/1000/800: no `rounds`, one `sets` entry per bout — bout count must
        // come from `sets`, not collapse to 1.
        let pyramid = pyramidSeries([1200, 1000, 800], restS: 90)
        // Single-source fix: `formatRounds` itself falls back to sets.count for intervals.
        XCTAssertEqual(pyramid.formatRounds, 3)
        XCTAssertEqual(WorkoutLegCount.legs(in: pyramid), 6)   // 3 bouts × (work + recovery)
        // Round 2's work bout = 5th global leg: r0w r0r r1w r1r r2w.
        XCTAssertEqual(WorkoutLegCount.current([pyramid], index: 0, rotRoundIndex: 2, isWork: true), 5)
    }

    func testStrengthSegmentRoundsUnaffectedBySetsFallback() {
        // Non-regression: a STRENGTH segment carries `sets` (its work sets) but no
        // `rounds`. The sets→bouts fallback is intervals-ONLY, so formatRounds must
        // stay nil here — sets are movements/work sets, never a round count.
        let sets = [PrescriptionSet(measure: .reps(5), target: .kg(value: 100, min: nil, max: nil),
                                    modality: .strength, restS: 120, tempo: nil, note: nil)]
        let strength = WorkoutSegment(order: 1, title: "Sentadilla", kind: .strength,
                                      prescription: Prescription(scheme: .sets, modality: .strength,
                                                                 sets: sets, rounds: nil, workS: nil,
                                                                 restS: nil, totalS: nil, target: nil,
                                                                 note: nil, start: nil, increment: nil))
        XCTAssertNil(strength.formatRounds)
    }

    func testHeterogeneousPyramidBoutDegradesToManual() {
        // (#61 seam) A heterogeneous pyramid bout has no per-bout measure yet — the
        // scalar distance is dropped and sets[i] isn't read — so the work leg resolves
        // to `.open`: we don't own its auto-advance (manual "Terminar tramo ahora"),
        // and the HUD shows no distance bar rather than a broken one or invented data.
        let pyramid = pyramidSeries([1200, 1000, 800], restS: 90)
        let work = TreadmillLegResolver.leg(for: pyramid, isWork: true)
        XCTAssertEqual(work.goal, .open)
        XCTAssertFalse(work.ownsAutoAdvance)
    }

    // MARK: - Fixtures

    private func continuousRun(distanceM: Double? = nil, durationS: Int? = nil) -> WorkoutSegment {
        WorkoutSegment(order: 0, title: "Correr", kind: .running,
                       targetDistanceMeters: distanceM, targetDurationSeconds: durationS)
    }

    private func series(rounds: Int, distanceM: Double? = nil, workS: Int? = nil,
                        restS: Int? = nil, pace: Int = 210) -> WorkoutSegment {
        WorkoutSegment(order: 0, title: "Series", kind: .running,
                       targetDistanceMeters: distanceM,
                       targetPaceSecondsPerKm: pace,
                       prescription: Prescription(scheme: .intervals, modality: .run, sets: nil,
                                                  rounds: rounds, workS: workS, restS: restS, totalS: nil,
                                                  target: .pace(unit: .perKm, valueS: pace, minS: nil, maxS: nil),
                                                  note: nil, start: nil, increment: nil))
    }

    private func pyramidSeries(_ distancesM: [Double], restS: Int?) -> WorkoutSegment {
        // Legacy sets-only pyramid: no rounds, one PrescriptionSet per bout, and no
        // scalar targetDistanceMeters (heterogeneous distances are dropped by the web).
        let sets = distancesM.map { d in
            PrescriptionSet(measure: .distance(meters: d), target: nil, modality: .run,
                            restS: nil, tempo: nil, note: nil)
        }
        return WorkoutSegment(order: 1, title: "Pirámide", kind: .running,
                              blockTitle: "Series", blockPosition: 1,
                              prescription: Prescription(scheme: .intervals, modality: .run, sets: sets,
                                                         rounds: nil, workS: nil, restS: restS, totalS: nil,
                                                         target: nil, note: nil, start: nil, increment: nil))
    }
}
