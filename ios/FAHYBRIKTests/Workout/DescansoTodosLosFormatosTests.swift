import XCTest
@testable import FAHYBRIK

/// El descanso que escribe el coach vale para TODOS los formatos, no sólo para la
/// tabla de hierro. Card 146: un bloque de 10 rondas de SkiErg con 45 s escritos
/// se encadenó sin ninguno.
final class DescansoTodosLosFormatosTests: XCTestCase {

    /// Un bloque de N rondas del mismo ejercicio, con el descanso escrito donde lo
    /// escribe el coach: una vez, en el ejercicio.
    private func rondas(_ n: Int, descansoDelEjercicio: Int?, descansoDeLaRonda: Int? = nil) -> WorkoutSession {
        let sets = (0..<n).map { _ in
            PrescriptionSet(measure: .distance(meters: 250), target: nil, modality: .ski,
                            restS: descansoDeLaRonda, tempo: nil, note: nil)
        }
        let p = Prescription(scheme: .rounds, modality: .ski, sets: sets,
                             rounds: n, workS: nil, restS: descansoDelEjercicio, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "SkiErg", kind: .rowOrSki,
                                 blockTitle: "SkiErg", blockPosition: 1, prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Ski-Erg", format: .rounds,
                               estimatedDurationSeconds: 900, blockContext: "SkiErg",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()
        s.beginBlock()
        s.primaryAdvance()   // salta el 3-2-1 de entrada, como hace el atleta
        return s
    }

    func testElDescansoDelEjercicioVale_enUnBloqueDeRondas() {
        let s = rondas(10, descansoDelEjercicio: 45)
        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 45, accuracy: 0.01,
                       "10 rondas con 45 s escritos no pueden encadenarse sin descanso")
    }

    func testElDescansoDeLaRondaGanaAlDelEjercicio() {
        let s = rondas(10, descansoDelEjercicio: 45, descansoDeLaRonda: 20)
        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 20, accuracy: 0.01)
    }

    func testSinDescansoEscritoNoSeInventaNinguno() {
        // Un simulacro va seguido a propósito: si el coach no lo pide, no aparece.
        let s = rondas(8, descansoDelEjercicio: nil)
        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 0, accuracy: 0.01)
    }

    // MARK: FH-107 — dual rests (series vs round)

    private func rondasMulti(
        movements: Int,
        outerRounds: Int,
        seriesRest: Int?,
        roundRest: Int?
    ) -> WorkoutSession {
        let sets = (0..<movements).map { i in
            PrescriptionSet(
                measure: .reps(10), target: nil, modality: .functional,
                restS: seriesRest, tempo: nil, note: "M\(i + 1)"
            )
        }
        let p = Prescription(
            scheme: .rounds, modality: .functional,
            sets: sets, rounds: outerRounds, workS: nil,
            restS: roundRest, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil
        )
        let seg = WorkoutSegment(order: 1, title: "WOD", kind: .reps,
                                 blockTitle: "WOD", blockPosition: 1, prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "WOD", format: .rounds,
                               estimatedDurationSeconds: 900, blockContext: "WOD",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.primaryAdvance()
        return s
    }

    func testFH107SeriesRestEntreEstacionesRoundRestAlCerrarRonda() {
        let s = rondasMulti(movements: 2, outerRounds: 3, seriesRest: 30, roundRest: 60)
        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 30, accuracy: 0.01)
        XCTAssertEqual(s.fixedRestKind, .betweenSeries)
        s.skipFixedRest()
        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 60, accuracy: 0.01)
        XCTAssertEqual(s.fixedRestKind, .betweenRounds)
    }

    func testFH107PrimaryDuranteDescansoSaltaNoMarca() {
        let s = rondas(5, descansoDelEjercicio: 45)
        s.markRoundDone()
        XCTAssertEqual(s.fixedRoundsDone, 1)
        s.conditioningPrimary(s.currentSegment!)
        XCTAssertEqual(s.fixedRestRemaining, 0)
        XCTAssertEqual(s.fixedRoundsDone, 1)
    }
}
