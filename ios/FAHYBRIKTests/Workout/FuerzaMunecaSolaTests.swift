import XCTest
@testable import FAHYBRIK

// LA FUERZA EN LA MUÑECA SOLA (28-sep). La pantalla del reloj guardaba su propia
// serie y confirmaba ella antes de avanzar:
//
//   · Tras la ÚLTIMA serie con descanso, el toque la confirmaba, arrancaba el
//     descanso y el avance lo quitaba. Siguiente toque: lo mismo. El atleta no salía
//     nunca del ejercicio.
//   · Tras reanudar un entreno cortado, la vista volvía a la serie 1 y la corona
//     pisaba el peso de series ya hechas.
//
// Ahora la serie es la del motor (`pendingSetIndex`), el toque es `primaryAdvance`
// (lo mismo que el «Siguiente» del espejo) y la corona escribe con
// `setPendingSetLoad`. Estos tests fijan eso en el motor, que es lo que la vista lee.
final class FuerzaMunecaSolaTests: XCTestCase {

    // MARK: - Fixtures

    /// Peso muerto 3×5 a 100 kg y remo 3×8, en el mismo bloque. El descanso va en el
    /// bloque (como lo escribe el coach) o en cada serie, incluida la última.
    private func ejercicio(_ titulo: String, orden: Int, reps: Int, kg: Double,
                           descansoDelBloque: Int?, descansoDeCadaSerie: Int?) -> WorkoutSegment {
        let serie = PrescriptionSet(measure: .reps(reps), target: .kg(value: kg, min: nil, max: nil),
                                    modality: nil, restS: descansoDeCadaSerie,
                                    tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength,
                              sets: Array(repeating: serie, count: 3),
                              rounds: nil, workS: nil, restS: descansoDelBloque, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil)
        return WorkoutSegment(order: orden, title: titulo, kind: .strength,
                              targetReps: reps, loadKg: kg,
                              blockTitle: "Fuerza", blockPosition: 1, prescription: rx)
    }

    private func sesion(descansoDelBloque: Int? = nil, descansoDeCadaSerie: Int? = nil) -> WorkoutSession {
        let segs = [
            ejercicio("Peso muerto", orden: 1, reps: 5, kg: 100,
                      descansoDelBloque: descansoDelBloque, descansoDeCadaSerie: descansoDeCadaSerie),
            ejercicio("Remo con barra", orden: 2, reps: 8, kg: 60,
                      descansoDelBloque: descansoDelBloque, descansoDeCadaSerie: descansoDeCadaSerie),
        ]
        let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                               estimatedDurationSeconds: 1800, blockContext: "Fuerza",
                               zoneTargets: [], equipment: [], segments: segs,
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()
        s.beginBlock()
        s.stop()
        return s
    }

    /// Toques en la pantalla del reloj hasta salir del ejercicio, con tope: si el
    /// motor se atasca, el test falla en vez de colgarse.
    private func tocarHastaSalirDelEjercicio(_ s: WorkoutSession, tope: Int = 12) -> Int {
        let origen = s.currentSegmentIndex
        var toques = 0
        while s.currentSegmentIndex == origen, !s.isFinished, toques < tope {
            s.primaryAdvance()
            toques += 1
        }
        return toques
    }

    // MARK: - La última serie avanza

    /// El descanso del bloque separa SUS series: tras la última no abre ninguno.
    func testLaUltimaSerieNoHeredaElDescansoDelBloque() {
        let s = sesion(descansoDelBloque: 120)
        s.confirmSet(0)
        XCTAssertEqual(s.restRemainingSeconds, 120, accuracy: 0.01)
        s.dismissRest()
        s.confirmSet(1)
        XCTAssertEqual(s.restRemainingSeconds, 120, accuracy: 0.01)
        s.dismissRest()
        s.confirmSet(2)
        XCTAssertEqual(s.restRemainingSeconds, 0, accuracy: 0.01,
                       "tras la última serie no queda serie que esperar")
        XCTAssertNil(s.pendingSetIndex)
    }

    /// Con el descanso en el bloque: tres series y un toque más, al remo.
    func testLaUltimaSerieConDescansoDelBloquePasaAlSiguienteEjercicio() {
        let s = sesion(descansoDelBloque: 120)
        let toques = tocarHastaSalirDelEjercicio(s)
        XCTAssertEqual(s.currentSegment?.title, "Remo con barra",
                       "tras la última serie el reloj pasa al siguiente ejercicio")
        // serie · descanso · serie · descanso · serie · siguiente
        XCTAssertEqual(toques, 6)
        XCTAssertEqual(s.laps.last?.sets?.filter(\.confirmed).count, 3)
    }

    /// Con descanso escrito en CADA serie, también en la última: la que se atascaba.
    /// El descanso de la última suena, se salta y el siguiente toque sale.
    func testLaUltimaSerieConSuPropioDescansoPasaAlSiguienteEjercicio() {
        let s = sesion(descansoDeCadaSerie: 90)
        let toques = tocarHastaSalirDelEjercicio(s)
        XCTAssertEqual(s.currentSegment?.title, "Remo con barra",
                       "el descanso de la última serie no puede dejarte en el ejercicio")
        XCTAssertEqual(toques, 7)
        XCTAssertEqual(s.laps.last?.sets?.filter(\.confirmed).count, 3)
    }

    // MARK: - Reanudar conserva la serie, y la corona no pisa las hechas

    func testReanudarConservaLaSerieYLaCoronaNoPisaLasHechas() throws {
        let antes = sesion(descansoDelBloque: 120)
        antes.confirmSet(0); antes.dismissRest()
        antes.setSetLoad(1, 105)             // la segunda, a 105
        antes.confirmSet(1); antes.dismissRest()
        XCTAssertEqual(antes.pendingSetIndex, 2)

        // El entreno se corta y se retoma desde la foto del disco.
        let foto = antes.persistedSnapshot()
        let despues = WorkoutSession(plan: foto.plan, startedAt: foto.startedAt)
        despues.restore(from: foto)

        XCTAssertEqual(despues.pendingSetIndex, 2,
                       "la muñeca retoma en la serie 3, no en la 1")

        // La corona sobre la serie en curso: 110 kg.
        despues.setPendingSetLoad(110)
        XCTAssertEqual(despues.setRecords[0].loadActualKg, 100, "la serie 1 conserva su peso")
        XCTAssertEqual(despues.setRecords[1].loadActualKg, 105, "la serie 2 conserva su peso")
        XCTAssertEqual(despues.setRecords[2].loadActualKg, 110)
        XCTAssertFalse(despues.setRecords[2].confirmed, "girar la corona no cierra la serie")
        XCTAssertEqual(despues.pendingSetIndex, 2)

        // El toque la cierra con el peso que marcó la corona.
        despues.primaryAdvance()
        XCTAssertTrue(despues.setRecords[2].confirmed)
        XCTAssertEqual(despues.setRecords[2].loadActualKg, 110)
        XCTAssertNil(despues.pendingSetIndex)
    }

    /// Con todas las series cerradas la corona no tiene serie que tocar.
    func testSinSeriePendienteLaCoronaNoTocaNada() {
        let s = sesion()
        for i in 0..<3 { s.confirmSet(i) }
        let antes = s.setRecords.map(\.loadActualKg)
        s.setPendingSetLoad(140)
        XCTAssertEqual(s.setRecords.map(\.loadActualKg), antes)
    }

    /// La corona sube el peso de la serie en curso y lo heredan las que faltan.
    func testLaCoronaLaHeredanLasPendientes() {
        let s = sesion()
        s.confirmSet(0)
        s.setPendingSetLoad(102.5)
        XCTAssertEqual(s.setRecords[0].loadActualKg, 100)
        XCTAssertEqual(s.setRecords[1].loadActualKg, 102.5)
        XCTAssertEqual(s.setRecords[2].loadActualKg, 102.5)
    }
}
