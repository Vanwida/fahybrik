import XCTest
@testable import FAHYBRIK

final class FH99LiveOwnershipTests: XCTestCase {

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }

    private func structuredSession(_ legs: [RunElement]) -> WorkoutSession {
        let structure = RunStructure(phases: [RunPhase(role: .main, elements: legs)])
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil, structure: structure)
        let seg = WorkoutSegment(order: 1, title: "5×800", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "5×800", format: .intervals,
                               estimatedDurationSeconds: 3600, blockContext: "", zoneTargets: [],
                               equipment: [], segments: [seg], coachNote: nil,
                               demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()
        s.beginBlock()
        return s
    }

    func testTramoHechoAdvancesDuringAutoPause() {
        let s = structuredSession([
            work(.distance(m: 800)),
            work(.distance(m: 800))
        ])
        s.primaryAdvance(fromAthleteTap: true)
        XCTAssertEqual(s.runLegIndex, 0)
        s.autoPause()
        XCTAssertTrue(s.autoPaused)
        s.primaryAdvance(fromAthleteTap: true)
        XCTAssertEqual(s.runLegIndex, 1, "athlete tap must advance leg even under auto-pause")
    }

    func testRunEnvironmentSwitchPreservesElapsed() {
        let rx = Prescription(scheme: .steady, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: 3600, target: nil, note: nil,
                              start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 blockTitle: "Rodaje", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                               estimatedDurationSeconds: 3600, blockContext: "", zoneTargets: [],
                               equipment: [], segments: [seg], coachNote: nil,
                               demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.runEnvironment = .outdoor
        s.start()
        s.beginBlock()
        s.elapsedSeconds = 120
        s.runEnvironment = .treadmill
        XCTAssertEqual(s.elapsedSeconds, 120, "timer must not reset on source switch")
        XCTAssertEqual(s.runEnvironment, .treadmill)
    }

    func testWatchTruthUIUsesMirrorLiveNotBindAlone() throws {
        let card = try String(contentsOf:
            URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("FAHYBRIK/Workout/PreWorkoutWatchCard.swift"))
        XCTAssertTrue(card.contains("wristMirrorLive"))
        XCTAssertFalse(card.contains("mirror.wristJoined {"))
    }
}
