import XCTest
@testable import FAHYBRIK

// SALIR NO ES TERMINAR — y la puerta que lo decide tiene que preguntar lo que se
// MIDIÓ, no lo que CUENTA como trabajo.
//
// El caso es el del debugger del 29-ago, con su forma exacta: un híbrido cuyo tramo
// 1 es un CALENTAMIENTO de 8:00 etiquetado «Rodaje Z2». El atleta llevaba 1:52 y
// 307 m de GPS, con el mapa en pantalla, y al pulsar el aspa volvió a Plan con
// EMPEZAR: sin recap, sin ejecución, y con los metros y el recorrido tirados.
//
// La causa era una pregunta de completitud usada como pregunta de persistencia. El
// accesor que la contestaba (`hasRecordedWork`) excluía el calentamiento a propósito
// —un «calentamiento hecho» no puede marcar la sesión como cumplida— y con eso
// también excluía sus metros de la decisión de guardar. Aquí se clava que la pregunta
// nueva NO mira la fase del bloque.
@MainActor
final class SalirNoEsTerminarTests: XCTestCase {

    /// El día caminado: primer bloque CALENTAMIENTO, tramo de correr.
    private func diaDelDebugger() -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Run", kind: .running,
                                 blockTitle: "Calentamiento", blockPosition: 1,
                                 prescription: nil)
        let plan = WorkoutPlan(id: UUID(), name: "Rodaje Z2", format: .steady,
                               estimatedDurationSeconds: 1_800, blockContext: "Híbrido",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.runEnvironment = .outdoor
        return s
    }

    /// LA CLASE 2, CLAVADA. 307 m medidos en un calentamiento son 307 m: el aspa no
    /// puede irse callando.
    func testUnCalentamientoConMetrosMedidosNoSePuedeTirarEnSilencio() {
        let s = diaDelDebugger()
        s.sampleRunDistance(deltaMeters: 307, source: .gps)

        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 307, accuracy: 0.001,
                       "el GPS midió y el HUD lo pintó: eso ya existe")
        XCTAssertTrue(s.hayMedidoQueSePerderia,
                      "salir de aquí sin preguntar tira una carrera de 307 m")
    }

    /// Y POR QUÉ FALLABA, escrito para que no vuelva: las dos mitades de la pregunta
    /// vieja siguen siendo ciertas por separado. El bloque ES estructural y el tramo
    /// SÍ tiene progreso vivo — combinarlas con un `&&` es lo que borraba el entreno.
    func testElBloqueEsEstructuralYAunAsiHayAlgoQueGuardar() {
        let s = diaDelDebugger()
        s.sampleRunDistance(deltaMeters: 307, source: .gps)

        XCTAssertTrue(s.currentBlockIsStructural,
                      "es un calentamiento, y eso es correcto para la completitud")
        XCTAssertTrue(s.currentSegmentHasLiveProgress,
                      "y a la vez hay metros medidos")
        XCTAssertTrue(s.hayMedidoQueSePerderia,
                      "la fase del bloque no puede borrar el GPS")
    }

    /// LA OTRA DIRECCIÓN, que es la que justifica que la puerta exista: sin nada
    /// medido, salir sigue siendo salir. Ni ejecución, ni «hecho» falso, ni una hoja
    /// que preguntar por un entreno que no empezó.
    func testSinNadaMedidoSalirSigueSiendoSalirSinPreguntar() {
        let s = diaDelDebugger()
        XCTAssertFalse(s.hayMedidoQueSePerderia,
                       "recién entrado no hay nada que guardar")
    }

    /// Un tramo ya CERRADO también cuenta, aunque fuera del calentamiento: lo que ya
    /// está en `laps` es trabajo medido y archivado.
    func testUnTramoCerradoDelCalentamientoTambienCuenta() {
        let s = diaDelDebugger()
        s.sampleRunDistance(deltaMeters: 307, source: .gps)
        s.closeCurrentSegmentLap()
        XCTAssertFalse(s.laps.isEmpty, "el tramo se cerró y quedó su parcial")
        XCTAssertTrue(s.hayMedidoQueSePerderia)
    }
}
