import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA CARA POR RONDAS (11-ago-2026) — la lista mientras quepa, el contador cuando no.
//
// La clase del bug del fartlek seguía viva para metcons reales: la lista de
// rondas pintaba una fila por ronda sin recorte, la ranura del vivo no scrollea
// (ancla del sujeto), y el WOD de OCHO rondas de la biblioteca pedía más alto
// que el móvil — otra vez la puerta con el EMPEZAR fuera. `RoundsLiveHUD` porta
// la propuesta aprobada del doble (`vivo-rondas`, DECISIONS «Rondas ≠
// estaciones»): el umbral no es una constante, lo decide `ViewThatFits` contra
// el marco real.
//
// El caso real es el bloque 61 del corpus («WOD 8r … TC17'», el único con
// formato `metcon` de la base): 8 rondas de Assault Bike 10 cal + 7 Burpee Box
// Jump + 10 Chest to Bar, con tope de 17 minutos.
final class RondasContadorTests: XCTestCase {

    /// El canvas del iPhone 17 Pro (puntos lógicos), el móvil de desarrollo.
    private static let lienzo = CGSize(width: 402, height: 874)

    // MARK: - Fixture: el bloque 61, como llega al motor

    private func movimiento(_ nombre: String, medida: Measure) -> PrescriptionSet {
        PrescriptionSet(measure: medida, target: nil, modality: nil,
                        restS: nil, tempo: nil, note: nombre)
    }

    private func sesionDeRondas(_ rondas: Int, capS: Int? = 1020) -> WorkoutSession {
        let p = Prescription(scheme: .rounds, modality: nil,
                             sets: [
                                movimiento("Assault Bike", medida: .calories(10)),
                                movimiento("Burpee Box Jump", medida: .reps(7)),
                                movimiento("Chest to Bar", medida: .reps(10)),
                             ],
                             rounds: rondas, workS: nil, restS: nil,
                             totalS: capS,
                             target: nil, note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "WOD 8 rondas", kind: .reps,
                                   blockTitle: "Principal", blockPosition: 1,
                                   prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "WOD 8 rondas", format: .rounds,
                               estimatedDurationSeconds: capS ?? 900,
                               blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, warmupChecklist: [])
        return WorkoutSession(plan: plan, hrZones: nil)
    }

    // MARK: - Las lecturas puras (espejo de vivo-rondas/data.ts)

    func testLaMediaNoSeDiceConUnaSolaRondaCerrada() {
        XCTAssertNil(RoundsReadings.mediaS([]))
        XCTAssertNil(RoundsReadings.mediaS([104]), "un punto no es un ritmo")
        XCTAssertEqual(RoundsReadings.mediaS([104, 113, 121]), (104 + 113 + 121) / 3.0)
    }

    func testLaProyeccionEsLaMediaPorLasRondasDelBloque() {
        // Los parciales del escenario del doble: 104, 113, 121 en un 8 rondas.
        let proyeccion = RoundsReadings.proyeccionS(rondas: 8, cerradas: [104, 113, 121])
        XCTAssertEqual(proyeccion, ((104.0 + 113 + 121) / 3 * 8).rounded())
        XCTAssertNil(RoundsReadings.proyeccionS(rondas: 8, cerradas: [104]))
    }

    func testMenosDeTresSegundosSobreLaMediaEsRuidoDeCronometro() {
        // Media 60, última 60: nadie se está cayendo.
        XCTAssertNil(RoundsReadings.caidaS([60, 60, 60, 60]))
        // Media ≈150.4, última 155: eso ya es caerse (+4,6 s).
        XCTAssertNotNil(RoundsReadings.caidaS([146, 149, 152, 150, 155]))
    }

    func testElHiloDejaDeSerTramosCuandoNoSeLeen() {
        // 12 rondas en 354 pt: ~29 pt por tramo, se lee de sobra.
        XCTAssertTrue(RoundsReadings.hiloPorTramos(rondas: 12, anchoPt: 354))
        // Un «death by» de 100 rondas: 3,5 pt por tramo, eso ya es ruido.
        XCTAssertFalse(RoundsReadings.hiloPorTramos(rondas: 100, anchoPt: 354))
    }

    // MARK: - El blanco, medido — la clase entera, no solo la carrera

    /// La puerta del bloque con un metcon de OCHO rondas debajo tiene que CABER.
    /// Es la misma medición que fijó el fartlek: lo que se salga por abajo es el
    /// botón de EMPEZAR.
    @MainActor
    func testLaPuertaConOchoRondasCabeEnElMovil() {
        assertCabe(sesionDeRondas(8))
    }

    /// Y con DOCE — el bloque más largo del corpus (bloque 37). El alto del
    /// contador no depende del número de rondas: eso es lo que se fija aquí.
    @MainActor
    func testLaPuertaConDoceRondasCabeEnElMovil() {
        assertCabe(sesionDeRondas(12, capS: nil))
    }

    /// Con CUATRO la lista clásica sigue siendo la cara: también tiene que caber
    /// (hoy, antes del porte, ya no cabía — fila de dos líneas).
    @MainActor
    func testLaPuertaConCuatroRondasCabeEnElMovil() {
        assertCabe(sesionDeRondas(4, capS: nil))
    }

    @MainActor
    private func assertCabe(_ s: WorkoutSession) {
        s.start()
        XCTAssertTrue(s.isAwaitingBlockStart, "el caso es la puerta del bloque, antes de EMPEZAR")
        let host = UIHostingController(rootView:
            ActiveWorkoutView(session: s, onFinish: {}, onExit: {})
                .environment(\.colorScheme, .dark)
        )
        host.view.frame = CGRect(origin: .zero, size: Self.lienzo)
        host.view.layoutIfNeeded()
        let alto = host.sizeThatFits(in: Self.lienzo).height
        XCTAssertLessThanOrEqual(
            alto, Self.lienzo.height + 1,
            "la pantalla pide \(Int(alto)) pt en un móvil de \(Int(Self.lienzo.height)): "
            + "lo que se salga por abajo es el botón de EMPEZAR"
        )
        s.stop()
    }

    // MARK: - El botón del host cierra RONDA a ronda (no el WOD entero)

    /// Antes del porte, `conditioningPrimary` en una lista de rondas ejecutaba
    /// `closeConditioningAndAdvance()`: el botón más grande de la pantalla se
    /// saltaba el WOD entero. Ahora cierra UNA ronda, y la última cierra el
    /// bloque sola — el mismo principio que la ruta de estaciones.
    func testElBotonPrincipalCierraRondaARonda() {
        let s = sesionDeRondas(8)
        s.start()
        s.beginBlock()
        if s.condCountInRemaining > 0 { s.primaryAdvance() } // SALTAR el 3-2-1
        XCTAssertEqual(s.fixedListTotal, 8)

        s.primaryAdvance()
        XCTAssertEqual(s.fixedRoundsDone, 1, "una pulsación = una ronda")
        XCTAssertFalse(s.isFinished, "el WOD sigue vivo: quedan siete rondas")
        XCTAssertTrue(s.isConditioningActive, "el bloque no se ha cerrado")

        s.unmarkLastRound()
        XCTAssertEqual(s.fixedRoundsDone, 0, "deshacer no puede perderse con el colapso")
        s.stop()
    }

    /// El parcial de una ronda cerrada es el DELTA del reloj del bloque, no el
    /// acumulado: la ventana de tramo de una lista de rondas no re-ancla al
    /// marcar (`tramo.key` no cambia), así que leerla daría 1:40 y 3:50 donde
    /// el atleta hizo 1:40 y 2:10.
    func testLosParcialesDeRondaSonDeLaRondaNoAcumulados() {
        let s = sesionDeRondas(8)
        s.start()
        s.beginBlock()
        if s.condCountInRemaining > 0 { s.primaryAdvance() }

        s.lapElapsedSeconds = 100
        s.primaryAdvance()
        s.lapElapsedSeconds = 230
        s.primaryAdvance()

        XCTAssertEqual(s.fixedRoundSplits.count, 2)
        XCTAssertEqual(s.fixedRoundSplits[0].seconds, 100, accuracy: 2)
        XCTAssertEqual(s.fixedRoundSplits[1].seconds, 130, accuracy: 2,
                       "la segunda ronda costó 2:10, no 3:50 acumulados")
        XCTAssertNil(s.fixedRoundSplits[0].meters,
                     "sin re-anclaje de ventana, una lectura de máquina sería el acumulado disfrazado")
        s.stop()
    }

    // MARK: - La cara que se PINTA cabe en su cota (N1 de la re-verificación)

    func testLaCaraContadorYaNoEsUnaVistaDeFormato() {
        let s = sesionDeRondas(12, capS: nil)
        s.start()
        s.beginBlock()
        if s.condCountInRemaining > 0 { s.primaryAdvance() }
        s.lapElapsedSeconds = 100
        s.primaryAdvance()
        s.lapElapsedSeconds = 230
        s.primaryAdvance()
        XCTAssertEqual(s.fixedRoundsDone, 2)
        XCTAssertEqual(s.livePicture.primary, .closeTramo)
        s.stop()
    }

    // MARK: - La muñeca dice lo mismo que la pantalla

    func testLaMunecaDiceLaMismaRondaQueLaPantalla() {
        let s = sesionDeRondas(8)
        s.start()
        s.beginBlock()
        if s.condCountInRemaining > 0 { s.primaryAdvance() }
        s.primaryAdvance()
        s.primaryAdvance()
        // Tres cerradas no: DOS cerradas → el atleta va por la TERCERA, y las
        // dos superficies dicen «RONDA 3/8» — no «2/8» una y «3/8» la otra.
        XCTAssertEqual(s.fixedRoundsDone, 2)
        XCTAssertEqual(s.liveProgressText, "RONDA 3/8",
                       "la muñeca dice lo mismo que la pantalla, o son dos apps")
        s.stop()
    }
}
