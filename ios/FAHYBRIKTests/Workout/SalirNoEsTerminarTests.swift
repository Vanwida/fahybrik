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

    // MARK: - EL RECAP ES LA CARRERA, no el formulario del plan

    /// El día del walk del 29-ago: **1×800 libre**, terminado a mano a los 470 m.
    ///
    /// Lo que se vio: 470 m en el suelo con su mapa, y un recap de 2:53 con un mapa de
    /// muestra, el pulso a teclear a mano y otro GUARDAR. Sin km, sin ritmo, sin zonas.
    ///
    /// La causa: en una carrera estructurada cada pierna escribe su fila en el LÍMITE
    /// (`advanceRunLeg`), y terminar a media pierna no es un límite — así que no había
    /// ninguna fila. `closeCurrentSegmentLap` tampoco la rescataba, porque en una
    /// estructura se aparta a propósito. La telemetría estaba; faltaba la fila.
    private func milOchocientosLibre() -> WorkoutSession {
        let set = PrescriptionSet(measure: .distance(meters: 800), target: nil,
                                  modality: .run, restS: nil, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .run, sets: [set],
                              rounds: nil, workS: nil, restS: nil, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Correr", kind: .running,
                                 blockTitle: "Libre", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "Libre 1×800 m Z4", format: .intervals,
                               estimatedDurationSeconds: 600, blockContext: "Libre",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.runEnvironment = .outdoor
        return s
    }

    func testTerminarAMediaPiernaGuardaLosMetrosCorridosConSuRitmo() throws {
        let s = milOchocientosLibre()
        s.primaryAdvance()                                    // salta el 3-2-1
        s.sampleRunDistance(deltaMeters: 470, source: .gps)    // 470 de 800
        XCTAssertTrue(s.laps.isEmpty, "todavía no hay fila: no se ha cruzado la meta")

        s.finish(completeness: .partial)

        let carrera = try XCTUnwrap(s.laps.first { $0.modality == SegmentKind.running.modality },
                                    "la pierna en curso tiene que quedar grabada")
        XCTAssertEqual(carrera.distanceCoveredMeters ?? 0, 470, accuracy: 0.001,
                       "los metros son los MEDIDOS, no los 800 prescritos")
        XCTAssertNotNil(carrera.avgPaceSecPerKm, "con metros y tiempo, el ritmo existe")
    }

    /// Y el payload que se persiste al End lleva esa carrera: es lo que hace que el
    /// recap tenga km, ritmo y zonas en vez de un formulario.
    func testElPayloadDelEndLlevaLaCarreraYNoSoloLaDuracion() throws {
        let s = milOchocientosLibre()
        s.primaryAdvance()
        s.sampleRunDistance(deltaMeters: 470, source: .gps)
        s.finish(completeness: .partial)

        let payload = try XCTUnwrap(MedidoAlTerminar.payload(session: s, assignmentId: "67"))
        let tramos = try XCTUnwrap(payload.segments, "sin tramos el recap es un formulario")
        XCTAssertFalse(tramos.isEmpty, "el recap tiene que recibir la carrera, no sólo la duración")
        XCTAssertEqual(payload.total_duration_seconds, Int(s.elapsedSeconds.rounded()))
    }
}
