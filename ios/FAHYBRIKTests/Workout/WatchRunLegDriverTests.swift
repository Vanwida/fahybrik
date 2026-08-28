import XCTest
@testable import FAHYBRIK

// El cierre de una pierna de distancia vive en el motor. GPS, cinta y muñeca
// escriben `sampleRunDistance` / `sampleTreadmillDistance`. Un RunLegProgress
// decide. No hay driver de muñeca.

final class WatchRunLegDriverTests: XCTestCase {

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }

    private func structuredSession(_ structure: RunStructure) -> WorkoutSession {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                              structure: structure)
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .intervals, estimatedDurationSeconds: 900,
                               blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    func testAutoClosesDistanceLegFromSampleWithoutDriver() {
        let s = structuredSession([main([
            work(.distance(m: 800)), rec(.duration(s: 60), .parado), work(.distance(m: 600)),
        ])])
        s.primaryAdvance()
        s.sampleRunDistance(deltaMeters: 500, source: .healthkit)
        XCTAssertEqual(s.runLegIndex, 0)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 500, accuracy: 0.001)
        XCTAssertEqual(s.runProgress.covered(segmentCoveredMeters: s.segmentRunCoveredForProgress), 500, accuracy: 0.001)

        s.sampleRunDistance(deltaMeters: 350, source: .healthkit)
        XCTAssertEqual(s.runLegIndex, 1)
        XCTAssertFalse(s.isRunLegWork)
        XCTAssertTrue(s.isTramoResting)
        let coveredAtRest = s.segmentRunCoveredForProgress
        s.sampleRunDistance(deltaMeters: 1000, source: .healthkit)
        XCTAssertEqual(s.segmentRunCoveredForProgress, coveredAtRest, accuracy: 0.001,
                       "el descanso parado no suma metros")
        XCTAssertEqual(s.runLegIndex, 1)

        s.primaryAdvance()
        XCTAssertEqual(s.currentRunLeg?.distanceMeters, 600)
        s.sampleRunDistance(deltaMeters: 600, source: .healthkit)
        XCTAssertTrue(s.isAwaitingFinishDecision)
        XCTAssertFalse(s.isFinished)
        s.finish()
        XCTAssertTrue(s.isFinished)
    }

    func testTroteDeRecuperacionSiSuma() {
        let s = structuredSession([main([
            work(.distance(m: 400)), rec(.duration(s: 90), .trote), work(.distance(m: 400)),
        ])])
        s.primaryAdvance()
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        XCTAssertEqual(s.runLegIndex, 1)
        XCTAssertTrue(s.isTramoRecuperandoEnMovimiento)
        XCTAssertTrue(s.tramoMide)
        let before = s.segmentRunCoveredForProgress
        s.sampleRunDistance(deltaMeters: 80, source: .healthkit)
        XCTAssertEqual(s.segmentRunCoveredForProgress, before + 80, accuracy: 0.001,
                       "el trote de vuelta es un tramo que mide")
    }

    func testCoveredLivesOnTheSessionNotOnADriver() {
        let s = structuredSession([main([work(.distance(m: 800))])])
        s.primaryAdvance()
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 400, accuracy: 0.001)
        s.sampleRunDistance(deltaMeters: 50, source: .healthkit)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 450, accuracy: 0.001)
        XCTAssertEqual(s.runLegIndex, 0)
    }
}
