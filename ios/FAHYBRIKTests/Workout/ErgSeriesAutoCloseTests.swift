import XCTest
@testable import FAHYBRIK

// Engine: a distance/cal series bout auto-closes when the tramo window crosses
// the goal (app-owned series — no native PM5 intervals required).
final class ErgSeriesAutoCloseTests: XCTestCase {

    private func seriesSession(distanceM: Double? = nil,
                               calories: Int? = nil,
                               rounds: Int = 3,
                               restS: Int = 60) -> WorkoutSession {
        let measure: Measure
        if let c = calories {
            measure = .calories(c)
        } else {
            measure = .distance(meters: distanceM ?? 500)
        }
        let set = PrescriptionSet(measure: measure, target: nil, modality: .row,
                                  restS: restS, tempo: nil, note: nil)
        let p = Prescription(scheme: .intervals, modality: .row, sets: [set],
                             rounds: rounds, workS: nil, restS: restS, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .rowOrSki,
                                 targetDistanceMeters: distanceM,
                                 blockTitle: "Erg", blockPosition: 1,
                                 prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .intervals,
                               estimatedDurationSeconds: 900, blockContext: "Test",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()   // skip 3-2-1 count-in → work bout 0
        s.ergConnected = true
        return s
    }

    private func feed(_ s: WorkoutSession, distance: Double? = nil, calories: Int? = nil) {
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: distance, caloriesKcal: calories)
    }

    func testDistanceSeriesAutoClosesIntoRest() {
        let s = seriesSession(distanceM: 500, rounds: 3, restS: 60)
        XCTAssertEqual(s.rotRoundIndex, 0)
        XCTAssertEqual(s.rotPhase, .work)
        XCTAssertTrue(s.currentErgCounterPolicy.advancesOnMachineGoal)

        feed(s, distance: 0)
        feed(s, distance: 400)
        XCTAssertEqual(s.rotPhase, .work)
        XCTAssertEqual(s.tramoErgDistanceMeters ?? 0, 400, accuracy: 0.001)

        feed(s, distance: 500)   // cross 500 → auto rest
        XCTAssertEqual(s.rotPhase, .rest)
        XCTAssertEqual(s.rotRoundIndex, 0)
    }

    func testCalorieSeriesAutoCloses() {
        let s = seriesSession(calories: 20, rounds: 3, restS: 60)
        feed(s, calories: 0)
        feed(s, calories: 15)
        XCTAssertEqual(s.rotPhase, .work)
        feed(s, calories: 20)
        XCTAssertEqual(s.rotPhase, .rest)
    }

    func testNextSeriesReanchorsAtZero() {
        let s = seriesSession(distanceM: 500, rounds: 3, restS: 60)
        feed(s, distance: 0)
        feed(s, distance: 500)                 // bout 0 done → rest
        XCTAssertEqual(s.rotPhase, .rest)
        s.intervalsBoutDone()                  // skip rest → bout 1 work
        XCTAssertEqual(s.rotRoundIndex, 1)
        XCTAssertEqual(s.rotPhase, .work)
        // Sync tramo to the new key; next sample anchors the window.
        s.syncTramoIfNeeded()
        feed(s, distance: 500)                 // still at 500 cumulative
        XCTAssertEqual(s.tramoErgDistanceMeters ?? 0, 0, accuracy: 0.001,
                       "serie 2 window starts at 0, not 500")
        feed(s, distance: 700)
        XCTAssertEqual(s.tramoErgDistanceMeters ?? 0, 200, accuracy: 0.001)
    }

    func testCountInMetresDiscardedAtGo() {
        let s = seriesSession(distanceM: 500, rounds: 2, restS: 60)
        // Rebuild into count-in to prove re-anchor.
        let set = PrescriptionSet(measure: .distance(meters: 500), target: nil,
                                  modality: .row, restS: 60, tempo: nil, note: nil)
        let p = Prescription(scheme: .intervals, modality: .row, sets: [set],
                             rounds: 2, workS: nil, restS: 60, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .rowOrSki,
                                 targetDistanceMeters: 500,
                                 blockTitle: "Erg", blockPosition: 1,
                                 prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .intervals,
                               estimatedDurationSeconds: 600, blockContext: "Test",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let session = WorkoutSession(plan: plan)
        session.start(); session.beginBlock(); session.stop()
        // Still in count-in
        XCTAssertTrue(session.isTramoCountIn)
        session.ergConnected = true
        feed(session, distance: 0)
        feed(session, distance: 40)            // rowed during 3-2-1
        session.primaryAdvance()               // skip count-in → GO reanchors
        XCTAssertFalse(session.isTramoCountIn)
        XCTAssertEqual(session.tramoErgDistanceMeters ?? 0, 0, accuracy: 0.001,
                       "count-in metres discarded at GO")
        feed(session, distance: 40)
        XCTAssertEqual(session.tramoErgDistanceMeters ?? 0, 0, accuracy: 0.001)
        feed(session, distance: 140)
        XCTAssertEqual(session.tramoErgDistanceMeters ?? 0, 100, accuracy: 0.001)
    }
}
