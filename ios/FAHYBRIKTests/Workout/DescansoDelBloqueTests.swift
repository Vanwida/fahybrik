import XCTest
@testable import FAHYBRIK

// EL DESCANSO DEL BLOQUE VALE PARA SUS SERIES — card 110.
//
// El 20-ago Alex hizo peso muerto con 120 s de descanso prescritos y no vio
// ninguno: ni un paso de descanso en la pantalla, ni aviso al acabarlo. La cuenta
// atrás y sus avisos (el aviso a 10 s, los tics del 3-2-1 y el doble golpe al
// llegar a cero) ya existían y estaban bien; lo que no llegaba eran los segundos.
//
// La causa: el coach escribe «descanso 2:00» UNA vez para el ejercicio, y así lo
// guarda el plan (`prescription_json.rest_s`), no repetido dentro de cada serie.
// El motor solo miraba el descanso de la SERIE, que en un plan normal viene
// vacío, y sin segundos la cuenta atrás no arranca.
//
// La sesión real: plantilla 686, peso muerto 120 s, peso muerto rumano 90 s,
// remo con barra 75 s, los tres trineos 90 s. Ninguno lo llevaba por serie.
final class DescansoDelBloqueTests: XCTestCase {

    private func sesion(descansoDelBloque: Int?, descansoDeLaSerie: Int? = nil) -> WorkoutSession {
        let sets = (0..<3).map { _ in
            PrescriptionSet(measure: .reps(5),
                            target: .rpe(value: 6.5, min: nil, max: nil),
                            modality: nil,
                            restS: descansoDeLaSerie,
                            tempo: nil, note: nil)
        }
        let p = Prescription(scheme: .sets, modality: nil, sets: sets,
                             rounds: nil, workS: nil, restS: descansoDelBloque, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "Deadlift", kind: .strength,
                                   targetReps: 5, loadKg: nil,
                                   blockTitle: "Fuerza · Cadera", blockPosition: 1,
                                   prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Fuerza B + Trineos", format: .sets,
                               estimatedDurationSeconds: 2822, blockContext: "Fuerza · Cadera",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan, hrZones: nil)
        s.primeSetsIfNeeded()
        return s
    }

    // EL BUG: con el descanso escrito en el ejercicio y no en la serie, cerrar una
    // serie no arrancaba nada. Ahora arranca los 120 s que pedía el plan.
    func testElDescansoDelEjercicioArrancaLaCuentaAtras() {
        let s = sesion(descansoDelBloque: 120)
        s.confirmSet(0)
        XCTAssertEqual(s.restRemainingSeconds, 120, accuracy: 0.01,
                       "el plan pedía 120 s de descanso y el atleta no vio ninguno")
        XCTAssertEqual(s.restTotalSeconds, 120, accuracy: 0.01)
    }

    // Y el de la serie sigue mandando cuando existe: es más específico que el del
    // ejercicio (la última serie de una bajada puede pedir el suyo).
    func testElDescansoDeLaSerieGanaAlDelEjercicio() {
        let s = sesion(descansoDelBloque: 120, descansoDeLaSerie: 45)
        s.confirmSet(0)
        XCTAssertEqual(s.restRemainingSeconds, 45, accuracy: 0.01)
    }

    // Sin descanso en ningún sitio no se inventa uno: no todo ejercicio lo lleva.
    func testSinDescansoPrescritoNoHayCuentaAtras() {
        let s = sesion(descansoDelBloque: nil)
        s.confirmSet(0)
        XCTAssertEqual(s.restRemainingSeconds, 0, accuracy: 0.01)
    }
}
