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
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()
        s.beginBlock()
        s.primaryAdvance()   // salta el 3-2-1 de entrada, como hace el atleta
        return s
    }

    func testElDescansoDelEjercicioVale_enUnBloqueDeRondas() {
        let s = rondas(10, descansoDelEjercicio: 45)
        s.markRoundDone()
        XCTAssertEqual(s.restRemainingSeconds, 45, accuracy: 0.01,
                       "10 rondas con 45 s escritos no pueden encadenarse sin descanso")
        XCTAssertEqual(s.livePicture.label, "Descanso")
    }

    func testElDescansoDeLaRondaGanaAlDelEjercicio() {
        let s = rondas(10, descansoDelEjercicio: 45, descansoDeLaRonda: 20)
        s.markRoundDone()
        XCTAssertEqual(s.restRemainingSeconds, 20, accuracy: 0.01)
    }

    func testSinDescansoEscritoNoSeInventaNinguno() {
        // Un simulacro va seguido a propósito: si el coach no lo pide, no aparece.
        let s = rondas(8, descansoDelEjercicio: nil)
        s.markRoundDone()
        XCTAssertEqual(s.restRemainingSeconds, 0, accuracy: 0.01)
    }
}
