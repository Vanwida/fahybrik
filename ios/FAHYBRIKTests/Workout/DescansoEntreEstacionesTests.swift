import XCTest
@testable import FAHYBRIK

// EL DESCANSO ENTRE ESTACIONES de una lista fija — el 2:00 del HYROX Conditioning
// Test entre el remo y los burpees.
//
// Hasta el 8-ago el motor FIXED no tenía NINGUNA fase de descanso: el `rest_s` que
// el coach prescribía se guardaba y no lo leía nadie, así que las estaciones
// encadenaban sin pausa y el atleta no sabía si parar (Alex, probando el sim).
// Sólo los motores de fuerza (confirmar serie) y rotativo (Tabata/intervalos)
// descansaban.
//
// La otra mitad del contrato: una SIMULACIÓN HYROX no prescribe descansos y tiene
// que seguir yendo seguida — en carrera el reloj no para. Si esto inventara una
// pausa ahí, rompería la simulación.
final class DescansoEntreEstacionesTests: XCTestCase {

    /// Una lista fija de estaciones (sin `rounds`, varios movimientos) — la forma
    /// que hace `fixedListIsStations` verdadero y que produce el fold de un
    /// circuito/HCT real.
    private func sesionDeEstaciones(restS: Int?) -> WorkoutSession {
        func set(_ m: Measure, _ nota: String) -> PrescriptionSet {
            PrescriptionSet(measure: m, target: nil, modality: .functional,
                            restS: restS, tempo: nil, note: nota)
        }
        let p = Prescription(
            scheme: .forTime, modality: nil,
            sets: [set(.duration(seconds: 480), "Remo"),
                   set(.duration(seconds: 240), "Burpees"),
                   set(.duration(seconds: 240), "Wall balls")],
            rounds: nil, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "HCT", kind: .reps,
                                 blockTitle: "HCT", blockPosition: 1, prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "HCT", format: .forTime,
                               estimatedDurationSeconds: 2040, blockContext: "HCT",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()   // salta el 3-2-1 → estación 0
        return s
    }

    func testCerrarUnaEstacionAbreSuDescanso() {
        let s = sesionDeEstaciones(restS: 120)
        XCTAssertEqual(s.fixedRestRemaining, 0, "no se descansa antes de empezar")

        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 120, accuracy: 0.001)
        XCTAssertTrue(s.isTramoResting, "la ÚNICA superficie de descanso tiene que verlo")
        XCTAssertEqual(s.tramoRestRemaining, 120, accuracy: 0.001,
                       "y la cuenta atrás que pinta la pantalla de descanso, también")
    }

    /// Sin `rest_s` prescrito no aparece ninguna pausa: es lo que hace que una
    /// simulación HYROX siga siendo continua.
    func testSinDescansoPrescritoLasEstacionesVanSeguidas() {
        let s = sesionDeEstaciones(restS: nil)
        s.markRoundDone()
        XCTAssertEqual(s.fixedRestRemaining, 0)
        XCTAssertFalse(s.isTramoResting, "una simulación no para: el reloj de carrera no para")
    }

    /// Tras la ÚLTIMA estación se cierra el bloque — el descanso de después lo pone
    /// el gate del bloque siguiente, no esto.
    func testTrasLaUltimaEstacionNoQuedaDescansoColgando() {
        let s = sesionDeEstaciones(restS: 120)
        s.markRoundDone()
        s.skipFixedRest()
        s.markRoundDone()
        s.skipFixedRest()
        s.markRoundDone()   // la tercera y última
        XCTAssertEqual(s.fixedRestRemaining, 0)
    }

    func testCortarElDescansoEntraYaEnLaSiguienteEstacion() {
        let s = sesionDeEstaciones(restS: 120)
        s.markRoundDone()
        XCTAssertTrue(s.isTramoResting)
        s.skipFixedRest()
        XCTAssertEqual(s.fixedRestRemaining, 0)
        XCTAssertFalse(s.isTramoResting)
    }
}
