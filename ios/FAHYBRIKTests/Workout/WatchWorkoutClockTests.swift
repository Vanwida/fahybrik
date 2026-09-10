import XCTest
@testable import FAHYBRIK

/// FH-30 / FH-33 — datos de rodaje: ritmo medio de sesión y reloj Apple en muñeca.
final class WatchWorkoutClockTests: XCTestCase {

    override func tearDown() {
        WatchWorkoutClock.appleElapsed = nil
        super.tearDown()
    }

    func testRodajeDatosRitmoMedioEsPromedioDeSesion() {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 10_000, blockTitle: "Carrera", blockPosition: 1)
        let s = WorkoutSession(
            plan: WorkoutPlan(id: UUID(), name: "Test", format: .steady, estimatedDurationSeconds: 3600,
                              blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                              coachNote: nil, demoVideoUrl: nil, warmupChecklist: []),
            hrZones: nil
        )
        s.start()
        s.beginBlock()
        s.elapsedSeconds = 1_635
        s.sampleRunDistance(deltaMeters: 5_240, source: .healthkit)
        let pace = WorkoutSession.paceSecPerKm(meters: s.liveRunDistanceMeters, seconds: s.elapsedSeconds)
        XCTAssertEqual(pace ?? 0, 312, accuracy: 1)
        s.stop()
    }

    func testWatchWorkoutClockHookClearsBetweenSessions() {
        WatchWorkoutClock.appleElapsed = { 42 }
        XCTAssertEqual(WatchWorkoutClock.appleElapsed?(), 42)
        WatchWorkoutClock.appleElapsed = nil
        XCTAssertNil(WatchWorkoutClock.appleElapsed?())
    }
}
