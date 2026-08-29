import XCTest
@testable import FAHYBRIK

// Un motor. Las cards 101 / 72 / 110 / 157 / 176 son formatos que caían
// por la rama equivocada. Aquí se fija el contrato, no un if por card.

final class LiveEngineUnificationTests: XCTestCase {

    private func set(_ m: Measure, _ modalidad: PrescriptionModality, _ nota: String) -> PrescriptionSet {
        PrescriptionSet(measure: m, target: nil, modality: modalidad,
                        restS: nil, tempo: nil, note: nota)
    }

    private func chipperSession() -> WorkoutSession {
        let p = Prescription(
            scheme: .chipper, modality: nil,
            sets: [
                set(.distance(meters: 1_000), .run, "Run"),
                set(.distance(meters: 500), .ski, "SkiErg"),
                set(.reps(40), .functional, "Burpee"),
            ],
            rounds: nil, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Chipper", kind: .reps,
                                 blockTitle: "Chipper", blockPosition: 1, prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Chipper", format: .chipper,
                               estimatedDurationSeconds: 1800, blockContext: "Chipper",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()
        return s
    }

    func testLaCifraBebeElMismoGPSQueElProgreso() {
        let s = chipperSession()
        s.runEnvironment = .outdoor
        XCTAssertTrue(s.tramoIsRun)
        s.sampleRunDistance(deltaMeters: 420, source: .healthkit)
        XCTAssertNil(s.livePicture.coveredMeters, "HK no sustituye al stream del mapa")
        s.sampleRunDistance(deltaMeters: 420, source: .gps)
        let covered = s.runProgress.covered(segmentCoveredMeters: s.segmentRunCoveredForProgress)
        XCTAssertEqual(covered, 420, accuracy: 0.001)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 420, accuracy: 0.001)
        if case .meters(let m) = s.livePicture.figure {
            XCTAssertEqual(m, 420, accuracy: 0.001)
        } else {
            XCTFail("la cifra del vivo tiene que ser metros, no el plan")
        }
        XCTAssertNotNil(s.livePicture.planLine, "la dosis vive en planLine; la cifra son los metros")
    }

    func testSampleNoSumaEnDescanso() {
        let s = chipperSession()
        s.sampleRunDistance(deltaMeters: 100, source: .healthkit)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 100, accuracy: 0.001)
        s.restRemainingSeconds = 30
        s.restTotalSeconds = 30
        XCTAssertTrue(s.isTramoResting)
        XCTAssertFalse(s.tramoMide)
        s.sampleRunDistance(deltaMeters: 250, source: .healthkit)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 100, accuracy: 0.001)
    }

    func testPrimaryAdvanceCierraLaEstacionDelChipper() {
        let s = chipperSession()
        XCTAssertEqual(s.fixedRoundsDone, 0)
        XCTAssertTrue(s.currentTramo.isFixedStation)
        s.primaryAdvance()
        XCTAssertEqual(s.fixedRoundsDone, 1)
        XCTAssertEqual(s.currentTramo.label, "SkiErg")
        XCTAssertFalse(s.isFinished)
    }

    func testUnSoloDescanso() {
        let s = chipperSession()
        s.restRemainingSeconds = 45
        s.restTotalSeconds = 45
        s.restEndsTramo = true
        XCTAssertEqual(s.tramoRestRemaining, 45, accuracy: 0.001)
        XCTAssertEqual(s.livePicture.restRemaining, 45, accuracy: 0.001)
        XCTAssertEqual(s.livePicture.label, "Descanso")
        XCTAssertTrue(s.isTramoResting)
    }

    func testUnFinishDePersona() {
        let s = chipperSession()
        XCTAssertFalse(s.isFinished)
        s.finish()
        XCTAssertTrue(s.isFinished)
        s.finish()
        XCTAssertTrue(s.isFinished)
        XCTAssertEqual(s.completeness, .full)
    }

    func testAMRAPSumaRondaPorScoreNoPorPrimary() {
        let p = Prescription(scheme: .amrap, modality: nil, sets: nil, rounds: nil,
                             workS: nil, restS: nil, totalS: 600, target: nil,
                             note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "AMRAP", kind: .reps,
                                 blockTitle: "AMRAP", blockPosition: 1, prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "AMRAP", format: .amrap,
                               estimatedDurationSeconds: 600, blockContext: "AMRAP",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        if s.countInRemaining > 0 { s.primaryAdvance() }
        XCTAssertEqual(s.livePicture.score, .round)
        s.scoreStrike()
        XCTAssertEqual(s.fixedRoundsDone, 1)
        XCTAssertTrue(s.isConditioningActive)
        s.primaryAdvance()
        XCTAssertFalse(s.isConditioningActive)
    }

    /// El walk del debugger: serie 3×5:00 sin rest_s. Cerrar el work no
    /// pega el siguiente. El HUD dice DESCANSO. El GPS de work no suma.
    /// Un gesto arma el siguiente work. Watch bebe la misma lectura.
    func testRunConRestVistoDescansoNoSumaYArmaWork() {
        let rx = Prescription(
            scheme: .rounds, modality: .run, sets: nil, rounds: 3,
            workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
            start: nil, increment: nil,
            structure: [RunPhase(role: .main, elements: [
                .repeatBlock(times: 3, elements: [
                    .segment(RunSegment(kind: .work, measure: .duration(s: 300),
                                        target: nil, resolved: nil, inclinePct: nil,
                                        cadenceSpm: nil, recoveryMode: nil))
                ])
            ])]
        )
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "Series", format: .intervals,
                               estimatedDurationSeconds: 900, blockContext: "Series",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.runEnvironment = .outdoor
        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        s.sampleRunDistance(deltaMeters: 24, source: .gps)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 24, accuracy: 0.001)

        s.primaryAdvance()
        XCTAssertEqual(s.livePicture.label, "Descanso")
        XCTAssertTrue(s.isTramoResting)
        XCTAssertFalse(s.tramoIsRun)
        XCTAssertFalse(s.tramoMide)
        XCTAssertNil(s.livePicture.coveredMeters)
        s.sampleRunDistance(deltaMeters: 400, source: .gps)
        XCTAssertNil(s.livePicture.coveredMeters, "el rest no suma los metros del work")

        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertEqual(s.runLegIndex, 2)
        XCTAssertNotEqual(s.livePicture.label, "Descanso")
    }
}
