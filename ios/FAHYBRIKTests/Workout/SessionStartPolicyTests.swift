import XCTest
@testable import FAHYBRIK

// UN START, LA RECETA ENTERA. El GO no pregunta `kind == .running` del bloque
// de ahora: pregunta si HAY carrera (set plegado incluido) y qué roles PM5
// faltan. Un calentamiento delante no esconde el mixto.

final class SessionStartPolicyTests: XCTestCase {

    private func seg(_ kind: SegmentKind, title: String = "x",
                     blockTitle: String = "B", blockPosition: Int = 1,
                     prescription: Prescription? = nil,
                     ergKind: String? = nil) -> WorkoutSegment {
        WorkoutSegment(order: blockPosition, title: title, kind: kind,
                       blockTitle: blockTitle, blockPosition: blockPosition,
                       prescription: prescription, ergKind: ergKind)
    }

    private func chipperRunSkiRow() -> Prescription {
        let sets = [
            PrescriptionSet(measure: .distance(meters: 500), target: nil, modality: .row,
                            restS: nil, tempo: nil, note: "Remo"),
            PrescriptionSet(measure: .distance(meters: 500), target: nil, modality: .ski,
                            restS: nil, tempo: nil, note: "Ski"),
            PrescriptionSet(measure: .distance(meters: 500), target: nil, modality: .run,
                            restS: nil, tempo: nil, note: "Run"),
        ]
        return Prescription(scheme: .rounds, modality: .functional, sets: sets,
                            rounds: 4, workS: nil, restS: nil, totalS: nil,
                            target: nil, note: nil, start: nil, increment: nil)
    }

    private func foldedRounds() -> WorkoutSegment {
        seg(.reps, title: "Rondas", blockTitle: "Principal", blockPosition: 2,
            prescription: chipperRunSkiRow())
    }

    private func warmup() -> WorkoutSegment {
        seg(.strength, title: "Movilidad", blockTitle: "Calentamiento", blockPosition: 1)
    }

    private func next(
        _ segments: [WorkoutSegment],
        env: RunEnvironment? = nil,
        roles: Set<ErgMachineRole> = [],
        any: Bool = false,
        skipped: Set<ErgMachineRole> = [],
        skippedUnscoped: Bool = false
    ) -> SessionStartGate {
        SessionStartGate.next(
            segments: segments,
            runEnvironment: env,
            roleConnected: roles,
            anyConnected: any,
            skippedErgRoles: skipped,
            skippedUnscoped: skippedUnscoped
        )
    }

    func testFoldedRoundsIsNotARunningKindButNeedsRunEnvironment() {
        let s = foldedRounds()
        XCTAssertEqual(s.kind, .reps)
        XCTAssertTrue(s.involvesRun)
        XCTAssertTrue(s.involvesErg)
        XCTAssertTrue(SessionStartPolicy.needsRunEnvironment(in: [s]))
    }

    func testFoldedRoundsFirstGateIsRunEnvironmentNotErg() {
        XCTAssertEqual(next([foldedRounds()]), .runEnvironment)
    }

    func testAfterRunAnswerAsksRowThenSki() {
        let segs = [foldedRounds()]
        XCTAssertEqual(next(segs, env: .outdoor), .erg(.row))
        XCTAssertEqual(next(segs, env: .outdoor, roles: [.row]), .erg(.ski))
        XCTAssertEqual(next(segs, env: .outdoor, roles: [.row, .ski]), .ready)
    }

    func testOnePM5DoesNotCloseRowAndSki() {
        let segs = [foldedRounds()]
        XCTAssertEqual(next(segs, env: .indoor, any: true), .erg(.row))
    }

    func testWarmupInFrontDoesNotHideTheMixedBlock() {
        let segs = [warmup(), foldedRounds()]
        XCTAssertTrue(SessionStartPolicy.needsRunEnvironment(in: segs))
        XCTAssertEqual(next(segs), .runEnvironment)
        XCTAssertEqual(next(segs, env: .outdoor), .erg(.row))
        XCTAssertEqual(next(segs, env: .outdoor, roles: [.row]), .erg(.ski))
    }

    func testPureStrengthAsksNothing() {
        XCTAssertFalse(SessionStartPolicy.needsRunEnvironment(in: [warmup()]))
        XCTAssertEqual(next([warmup()]), .ready)
    }

    func testPureRunAsksEnvironmentOnly() {
        let run = seg(.running)
        XCTAssertTrue(SessionStartPolicy.needsRunEnvironment(in: [run]))
        XCTAssertEqual(next([run]), .runEnvironment)
        XCTAssertEqual(next([run], env: .outdoor), .ready)
    }

    func testKindRunningIsNotRequiredWhenSetsCarryRun() {
        let emom = Prescription(
            scheme: .emom, modality: .functional,
            sets: [
                PrescriptionSet(measure: .calories(10), target: nil, modality: .row,
                                restS: nil, tempo: nil, note: "Remo"),
                PrescriptionSet(measure: .distance(meters: 200), target: nil, modality: .run,
                                restS: nil, tempo: nil, note: "Run"),
            ],
            rounds: 10, workS: 60, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)
        let s = seg(.reps, prescription: emom)
        XCTAssertNotEqual(s.kind, .running)
        XCTAssertTrue(SessionStartPolicy.needsRunEnvironment(in: [s]))
        XCTAssertEqual(next([s]), .runEnvironment)
    }

    func testSkippedSkiDoesNotGetAskedAgainThisPass() {
        let segs = [foldedRounds()]
        XCTAssertEqual(
            next(segs, env: .outdoor, roles: [.row], skipped: [.ski]),
            .ready)
    }
}
