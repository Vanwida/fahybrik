import XCTest
@testable import FAHYBRIK

// Policy table for PM5 counter sync (docs/plan-sincronia-contadores-dispositivo.md).
// Pure: no BLE, no session clock — only tramo + segment shape → scope/program/close.
final class ErgCounterPolicyTests: XCTestCase {

    // MARK: - Builders

    private func ergSeg(scheme: PrescriptionScheme,
                        distance: Double? = nil,
                        calories: Int? = nil,
                        duration: Int? = nil,
                        rounds: Int? = nil,
                        restS: Int? = nil,
                        totalS: Int? = nil,
                        sets: [PrescriptionSet]? = nil,
                        workS: Int? = nil) -> WorkoutSegment {
        var builtSets = sets
        if builtSets == nil {
            if let c = calories {
                builtSets = [PrescriptionSet(measure: .calories(c), target: nil,
                                             modality: .row, restS: restS, tempo: nil, note: nil)]
            } else if let d = distance {
                builtSets = [PrescriptionSet(measure: .distance(meters: d), target: nil,
                                             modality: .row, restS: restS, tempo: nil, note: nil)]
            } else if let s = duration {
                builtSets = [PrescriptionSet(measure: .duration(seconds: s), target: nil,
                                             modality: .row, restS: restS, tempo: nil, note: nil)]
            }
        }
        let p = Prescription(scheme: scheme, modality: .row, sets: builtSets,
                             rounds: rounds, workS: workS, restS: restS, totalS: totalS,
                             target: nil, note: nil, start: nil, increment: nil)
        return WorkoutSegment(order: 1, title: "Remo", kind: .rowOrSki,
                              targetDistanceMeters: distance,
                              targetDurationSeconds: duration ?? totalS,
                              blockTitle: "Erg", blockPosition: 1,
                              prescription: p)
    }

    private func tramo(seg: WorkoutSegment, cursor: LiveTramo.Cursor,
                       measure: Measure?, boxed: Int? = nil) -> LiveTramo {
        LiveTramo(segmentIndex: 0, cursor: cursor, label: "Remo",
                  modality: .row, measure: measure, boxedSeconds: boxed)
    }

    private func policy(_ t: LiveTramo, _ seg: WorkoutSegment?,
                        phase: ErgCounterPolicy.Phase = .work) -> ErgCounterPolicy {
        ErgCounterPolicy.resolve(tramo: t, segment: seg, phase: phase)
    }

    // MARK: - 1 · Series 5×500 r1:30

    func testSeriesDistancePerTramoMachineGoal() {
        let seg = ergSeg(scheme: .intervals, distance: 500, rounds: 5, restS: 90)
        let t = tramo(seg: seg, cursor: .conditioningRound(0),
                      measure: .distance(meters: 500))
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.fixedPiece)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.machineGoal)
        XCTAssertTrue(p.advancesOnMachineGoal)
        XCTAssertTrue(p.shouldProgramOnEnter)
    }

    // MARK: - 2 · Series 8×20 cal

    func testSeriesCaloriesPerTramoMachineGoal() {
        let seg = ergSeg(scheme: .intervals, calories: 20, rounds: 8, restS: 60)
        let t = tramo(seg: seg, cursor: .conditioningRound(2),
                      measure: .calories(20))
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.fixedPiece)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.machineGoal)
    }

    // MARK: - 3 · Restless series still per-bout

    func testRestlessSeriesStillPerTramo() {
        let seg = ergSeg(scheme: .intervals, distance: 500, rounds: 5, restS: nil)
        let t = tramo(seg: seg, cursor: .conditioningRound(1),
                      measure: .distance(meters: 500))
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.machineGoal)
    }

    // MARK: - 4 · Pyramid bout measure

    func testPyramidBoutIsPerTramoFixedPiece() {
        let sets = [
            PrescriptionSet(measure: .distance(meters: 1200), target: nil, modality: .row, restS: 90, tempo: nil, note: nil),
            PrescriptionSet(measure: .distance(meters: 1000), target: nil, modality: .row, restS: 90, tempo: nil, note: nil),
            PrescriptionSet(measure: .distance(meters: 800), target: nil, modality: .row, restS: 90, tempo: nil, note: nil),
        ]
        let seg = ergSeg(scheme: .intervals, restS: 90, sets: sets)
        let t = tramo(seg: seg, cursor: .conditioningRound(1),
                      measure: .distance(meters: 1000))
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.fixedPiece)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.machineGoal)
    }

    // MARK: - 5 · EMOM erg round

    func testEmomErgRoundPerTramoFormatClock() {
        let sets = [PrescriptionSet(measure: .calories(15), target: nil, modality: .row, restS: nil, tempo: nil, note: nil)]
        let seg = ergSeg(scheme: .emom, calories: 15, rounds: 12, sets: sets, workS: 60)
        let t = tramo(seg: seg, cursor: .emomInterval(3),
                      measure: .calories(15), boxed: 60)
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.fixedPiece)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.formatClock)
        XCTAssertFalse(p.advancesOnMachineGoal, "EMOM minute owns the cursor, not cal cross")
    }

    // MARK: - 6 · AMRAP cumulative

    func testAmrapIsCumulative() {
        let seg = ergSeg(scheme: .amrap, totalS: 720)
        let t = tramo(seg: seg, cursor: .segment, measure: nil)
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.cumulativeSegment)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.formatClock)
        XCTAssertFalse(p.usesTramoWindow)
    }

    // MARK: - 7 · Fixed station For Time

    func testFixedStationMachineGoal() {
        // Station cursor alone is enough — policy keys off isFixedStation, not the
        // segment's list shape (that shape decides which cursor the engine opens).
        let seg = ergSeg(scheme: .forTime, distance: 1000)
        let t = tramo(seg: seg, cursor: .fixedStation(0),
                      measure: .distance(meters: 1000))
        XCTAssertTrue(t.isFixedStation)
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.machineGoal)
    }

    // MARK: - 8 · Steady 2K

    func testSteady2kContinuous() {
        let seg = ergSeg(scheme: .steady, distance: 2000)
        let t = tramo(seg: seg, cursor: .segment, measure: .distance(meters: 2000))
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.fixedPiece)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.machineGoal)
    }

    // MARK: - 9 · Rest / count-in never program

    func testRestAndCountInNeverProgram() {
        let seg = ergSeg(scheme: .intervals, distance: 500, rounds: 5, restS: 90)
        let t = tramo(seg: seg, cursor: .conditioningRound(0),
                      measure: .distance(meters: 500))
        XCTAssertEqual(policy(t, seg, phase: .rest).program, ErgCounterPolicy.Program.none)
        XCTAssertEqual(policy(t, seg, phase: .countIn).program, ErgCounterPolicy.Program.none)
        XCTAssertFalse(policy(t, seg, phase: .rest).advancesOnMachineGoal)
    }

    // MARK: - 10 · Non-erg tramo silent

    func testNonErgTramoSilent() {
        let t = LiveTramo(segmentIndex: 0, cursor: .emomInterval(1),
                          label: "Burpees", modality: .functional,
                          measure: .reps(15), boxedSeconds: 60)
        let p = policy(t, nil)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.none)
        XCTAssertFalse(p.advancesOnMachineGoal)
    }

    // MARK: - 11 · Timed interval series → session clock

    func testTimedIntervalSeriesSessionClock() {
        let seg = ergSeg(scheme: .intervals, duration: 120, rounds: 5, restS: 60)
        let t = tramo(seg: seg, cursor: .conditioningRound(0),
                      measure: .duration(seconds: 120), boxed: 120)
        let p = policy(t, seg)
        XCTAssertEqual(p.scope, ErgCounterPolicy.Scope.perTramo)
        XCTAssertEqual(p.program, ErgCounterPolicy.Program.fixedPiece)
        XCTAssertEqual(p.close, ErgCounterPolicy.Close.sessionClock)
        XCTAssertFalse(p.advancesOnMachineGoal)
    }

    // MARK: - Crossing helper (measure pure)

    func testCrossesMachineGoalOnCalories() {
        let t = LiveTramo(segmentIndex: 0, cursor: .conditioningRound(0),
                          label: "Ski", modality: .ski,
                          measure: .calories(20), boxedSeconds: nil)
        XCTAssertFalse(t.crossesMachineGoal(metersBefore: nil, metersNow: nil,
                                            caloriesBefore: 18, caloriesNow: 19))
        XCTAssertTrue(t.crossesMachineGoal(metersBefore: nil, metersNow: nil,
                                           caloriesBefore: 19, caloriesNow: 20))
        XCTAssertFalse(t.crossesMachineGoal(metersBefore: nil, metersNow: nil,
                                            caloriesBefore: 20, caloriesNow: 25),
                       "already past — reconnection must not re-fire")
    }
}
