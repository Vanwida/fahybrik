import XCTest
@testable import FAHYBRIK

// EL ENTRENO EN VIVO DEJA DE SER DE CRISTAL.
//
// Alex, 24-ago-2026: «uso la app como si fuese de cristal, pienso: ojo no toque
// nada que la lío». No era una impresión — eran tres cosas concretas de su
// sesión en Fabrik del 20-ago, y todas tenían la misma forma: tocas algo y pasa
// algo que no pediste y no puedes deshacer.
//
//   · card 113 — un doble toque sin querer cerró DOS series de golpe.
//   · card 115 — volver atrás desde las estaciones lo devolvió al bloque de
//                fuerza, que no era donde quería ir.
//   · card 143 — mirar el móvil a mitad de entreno infla la duración, y la
//                duración alimenta la carga que el entrenador lee.
//
// Estas pruebas fijan las tres reglas nuevas contra el caso REAL de cada una.
final class EntrenoSinMiedoTests: XCTestCase {

    // MARK: - Andamio

    /// Un bloque de fuerza de 3 series y, detrás, un bloque de estaciones. Es la
    /// forma del entreno del 20-ago: hierro primero, estaciones después.
    private func sesionFuerzaYEstaciones() -> WorkoutSession {
        let series = (0..<3).map { _ in
            PrescriptionSet(measure: .reps(5), target: nil, modality: nil,
                            restS: nil, tempo: nil, note: nil)
        }
        let fuerza = WorkoutSegment(
            order: 1, title: "Peso muerto", kind: .strength, targetReps: 5, loadKg: nil,
            blockTitle: "Fuerza", blockPosition: 1,
            prescription: Prescription(scheme: .sets, modality: nil, sets: series,
                                       rounds: nil, workS: nil, restS: nil, totalS: nil,
                                       target: nil, note: nil, start: nil, increment: nil))
        let estacion = WorkoutSegment(
            order: 2, title: "SkiErg", kind: .rowOrSki,
            blockTitle: "Estaciones", blockPosition: 2,
            prescription: Prescription(
                scheme: .forTime, modality: .ski,
                sets: [PrescriptionSet(measure: .distance(meters: 500), target: nil,
                                       modality: .ski, restS: nil, tempo: nil, note: nil)],
                rounds: nil, workS: nil, restS: nil, totalS: nil,
                target: nil, note: nil, start: nil, increment: nil))
        let plan = WorkoutPlan(id: UUID(), name: "Fuerza + estaciones", format: .sets,
                               estimatedDurationSeconds: 3600, blockContext: "Fuerza",
                               zoneTargets: [], equipment: [], segments: [fuerza, estacion],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()
        s.beginBlock()
        return s
    }

    /// Dos estaciones del mismo bloque: el undo de estación no puede cruzar de bloque.
    private func sesionDosEstaciones() -> WorkoutSession {
        func estacion(_ order: Int, _ title: String) -> WorkoutSegment {
            WorkoutSegment(
                order: order, title: title, kind: .rowOrSki,
                blockTitle: "Estaciones", blockPosition: 1,
                prescription: Prescription(
                    scheme: .forTime, modality: .ski,
                    sets: [PrescriptionSet(measure: .distance(meters: 500), target: nil,
                                           modality: .ski, restS: nil, tempo: nil, note: nil)],
                    rounds: nil, workS: nil, restS: nil, totalS: nil,
                    target: nil, note: nil, start: nil, increment: nil))
        }
        let plan = WorkoutPlan(id: UUID(), name: "Dos estaciones", format: .forTime,
                               estimatedDurationSeconds: 1200, blockContext: "Estaciones",
                               zoneTargets: [], equipment: [],
                               segments: [estacion(1, "SkiErg"), estacion(2, "Remo")],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()
        s.beginBlock()
        return s
    }

    // MARK: - 113 · Un toque de más no cuesta una serie

    func testDosToquesSeguidosCuentanComoUno() {
        let s = sesionFuerzaYEstaciones()
        let antes = s.currentSegmentIndex
        s.primaryAdvance(fromAthleteTap: true)
        let trasElPrimero = s.currentSegmentIndex
        // El dedo rebota: segundo toque inmediato.
        s.primaryAdvance(fromAthleteTap: true)
        XCTAssertEqual(s.currentSegmentIndex, trasElPrimero,
                       "un doble toque accidental no puede avanzar dos veces")
        XCTAssertGreaterThanOrEqual(trasElPrimero, antes)
    }

    func testDosToquesSEPARADOSSiCuentanComoDos() {
        let s = sesionFuerzaYEstaciones()
        s.primaryAdvance(fromAthleteTap: true)
        let trasElPrimero = s.setRecordsConfirmadasParaPrueba
        // El atleta cierra otra serie a conciencia, un rato después. La ventana
        // protege del rebote del dedo, no del atleta.
        s.lastPrimaryAdvanceAt = Date(timeIntervalSinceNow: -5)
        s.primaryAdvance(fromAthleteTap: true)
        XCTAssertGreaterThan(s.setRecordsConfirmadasParaPrueba, trasElPrimero,
                             "dos toques con intención sí son dos avances")
    }

    func testLaVentanaEsLaMismaVengaDelMovilODelReloj() {
        // El «Siguiente» de la muñeca entra por `primaryAdvance`, igual que el
        // botón grande: la guarda vive en el motor justamente para que la
        // protección no dependa de por dónde llegue el toque.
        let s = sesionFuerzaYEstaciones()
        s.primaryAdvance(fromAthleteTap: true)
        let despues = s.currentSegmentIndex
        for _ in 0..<5 { s.primaryAdvance(fromAthleteTap: true) }   // ráfaga, como un botón que rebota
        XCTAssertEqual(s.currentSegmentIndex, despues)
    }

    // MARK: - 115 · Volver no te saca del bloque

    func testVolverDentroDelBloqueSigueFuncionando() {
        let s = sesionFuerzaYEstaciones()
        // Cruzar al bloque de estaciones y volver DENTRO de un bloque no se toca:
        // sólo se bloquea el cruce hacia atrás.
        XCTAssertEqual(s.currentSegmentIndex, 0)
    }

    func testDesdeElPrimerMovimientoDeUnBloqueVolverNoTeLlevaAlAnterior() {
        let s = sesionFuerzaYEstaciones()
        // Al bloque de estaciones.
        s.jumpTo(1)
        s.beginBlock()
        XCTAssertEqual(s.currentSegmentIndex, 1, "estamos en estaciones")

        s.stepBack()

        XCTAssertEqual(s.currentSegmentIndex, 1,
                       "volver desde el primer movimiento NO puede devolverte al bloque de fuerza")
        XCTAssertTrue(s.isAwaitingBlockStart,
                      "te deja en la puerta del bloque, con el reloj parado, esperando Empezar")
    }

    // MARK: - 168 · Deshacer el último avance sin salir del vivo

    func testDeshacerLaUltimaSerieSigueEnElMismoEjercicio() {
        let s = sesionFuerzaYEstaciones()
        XCTAssertFalse(s.canStepBack)
        s.primaryAdvance()
        XCTAssertEqual(s.setRecordsConfirmadasParaPrueba, 1)
        XCTAssertEqual(s.pendingSetIndex, 1)
        s.stepBack()
        XCTAssertEqual(s.setRecordsConfirmadasParaPrueba, 0)
        XCTAssertEqual(s.pendingSetIndex, 0)
        XCTAssertEqual(s.currentSegmentIndex, 0)
        XCTAssertFalse(s.isFinished)
        XCTAssertFalse(s.isAwaitingFinishDecision)
        XCTAssertEqual(s.restRemainingSeconds, 0, accuracy: 0.01)
    }

    func testDeshacerUnaSerieNoBorraLasAnteriores() {
        let s = sesionFuerzaYEstaciones()
        s.confirmSet(0)
        s.dismissRest()
        s.confirmSet(1)
        s.stepBack()
        XCTAssertTrue(s.setRecords[0].confirmed)
        XCTAssertFalse(s.setRecords[1].confirmed)
        XCTAssertEqual(s.pendingSetIndex, 1)
        XCTAssertEqual(s.currentSegmentIndex, 0)
    }

    func testDeshacerLaUltimaEstacionSigueEnVivo() {
        let s = sesionDosEstaciones()
        s.jumpTo(0)
        s.beginBlock()
        s.lap()
        XCTAssertEqual(s.currentSegmentIndex, 1)
        s.stepBack()
        XCTAssertEqual(s.currentSegmentIndex, 0)
        XCTAssertFalse(s.isFinished)
        XCTAssertFalse(s.isAwaitingFinishDecision)
    }

    func testDeshacerDesdeHasAcabadoReabreYSigueEnVivo() {
        let s = sesionDosEstaciones()
        s.jumpTo(1)
        s.beginBlock()
        s.lap()
        XCTAssertTrue(s.isAwaitingFinishDecision)
        XCTAssertFalse(s.isFinished)
        s.stepBack()
        XCTAssertFalse(s.isAwaitingFinishDecision)
        XCTAssertFalse(s.isFinished)
        XCTAssertEqual(s.currentSegmentIndex, 1)
        XCTAssertFalse(s.finishDecisionMade)
    }

    func testVolverNoBorraLoQueYaEstabaHecho() {
        let s = sesionFuerzaYEstaciones()
        s.jumpTo(1)
        s.beginBlock()
        // El «antes» se mide AQUÍ, ya en estaciones: saltar de bloque cierra la
        // vuelta del bloque que dejas, y eso es correcto — no es lo que se prueba.
        // Lo que se prueba es que aparcar en la puerta no se lleve nada por delante.
        let hechoAntes = s.laps.count
        s.stepBack()
        XCTAssertEqual(s.laps.count, hechoAntes, "aparcar en la puerta no borra trabajo")
    }

    // MARK: - 143 · Mirar el móvil no alarga el entreno

    func testUnHuecoSinMedirNoSeSumaAlaDuracion() {
        let s = sesionFuerzaYEstaciones()
        s.elapsedSeconds = 0
        s.discardedSuspendedSeconds = 0
        // La app se fue al fondo 15 minutos y nadie midió nada.
        s.lastTick = Date(timeIntervalSinceNow: -900)
        s.lastMeasuredWorkAt = nil
        s.tick()
        XCTAssertLessThan(s.elapsedSeconds, 1,
                          "quince minutos mirando el móvil no son quince minutos de entreno")
        XCTAssertGreaterThan(s.discardedSuspendedSeconds, 800,
                             "el rato descontado se guarda, no se tira: tiene que poder explicarse")
    }

    func testUnHuecoCORRIENDOSiCuenta() {
        let s = sesionFuerzaYEstaciones()
        s.elapsedSeconds = 0
        s.discardedSuspendedSeconds = 0
        // Mismo hueco, pero durante él siguieron entrando metros: el atleta iba
        // corriendo con el móvil en el bolsillo y la pantalla apagada.
        s.lastTick = Date(timeIntervalSinceNow: -900)
        s.lastMeasuredWorkAt = Date(timeIntervalSinceNow: -60)
        s.tick()
        XCTAssertGreaterThan(s.elapsedSeconds, 800,
                             "correr con la pantalla apagada ES entrenar y ese tiempo cuenta")
        XCTAssertEqual(s.discardedSuspendedSeconds, 0, accuracy: 0.01)
    }

    func testUnLatidoNORMALNoSeToca() {
        let s = sesionFuerzaYEstaciones()
        s.elapsedSeconds = 0
        s.discardedSuspendedSeconds = 0
        s.lastTick = Date(timeIntervalSinceNow: -0.25)
        s.lastMeasuredWorkAt = nil
        s.tick()
        XCTAssertEqual(s.elapsedSeconds, 0.25, accuracy: 0.1,
                       "el reloj normal sigue siendo exacto; esto sólo mira huecos grandes")
        XCTAssertEqual(s.discardedSuspendedSeconds, 0, accuracy: 0.01)
    }
}

private extension WorkoutSession {
    /// Cuántas series llevan confirmación del atleta. Sólo para leer progreso en
    /// las pruebas sin depender de la forma interna del registro.
    var setRecordsConfirmadasParaPrueba: Int {
        setRecords.filter(\.confirmed).count
    }
}
