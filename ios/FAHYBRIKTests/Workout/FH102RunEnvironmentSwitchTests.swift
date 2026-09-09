import XCTest
@testable import FAHYBRIK

final class FH102RunEnvironmentSwitchTests: XCTestCase {

    private func rodajeSession() -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 10_000, blockTitle: "Carrera", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                               estimatedDurationSeconds: 3600, blockContext: "", zoneTargets: [],
                               equipment: [], segments: [seg], coachNote: nil,
                               demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.runEnvironment = .outdoor
        s.start()
        s.beginBlock()
        return s
    }

    func testSwitchPreservesElapsed() {
        let s = rodajeSession()
        s.elapsedSeconds = 180
        s.switchRunEnvironment(to: .treadmill)
        XCTAssertEqual(s.elapsedSeconds, 180, accuracy: 0.001)
        XCTAssertEqual(s.runEnvironment, .treadmill)
    }

    func testMetersAccumulateAcrossOutdoorToTreadmillToOutdoor() {
        let s = rodajeSession()
        s.sampleRunDistance(deltaMeters: 500, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 500, accuracy: 0.001)

        s.switchRunEnvironment(to: .treadmill)
        s.claimTreadmillDistanceSource()
        s.sampleTreadmillDistance(deltaMeters: 300)
        XCTAssertEqual(s.officialRunDistanceMeters ?? 0, 800, accuracy: 0.001)

        s.switchRunEnvironment(to: .outdoor)
        s.sampleRunDistance(deltaMeters: 200, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 1000, accuracy: 0.001)
    }

    func testIndoorWithoutMachineDoesNotFailSession() {
        let s = rodajeSession()
        s.switchRunEnvironment(to: .indoor)
        XCTAssertEqual(s.runEnvironment, .indoor)
        XCTAssertNil(s.liveRunDistanceMeters, "sin reloj ni cinta: no se inventa")
        XCTAssertEqual(s.elapsedSeconds, 0, accuracy: 0.001)
    }
}
