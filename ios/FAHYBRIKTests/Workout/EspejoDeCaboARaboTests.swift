import XCTest
@testable import FAHYBRIK

// DE CABO A RABO: motor → trama → cable → guion → páginas de la muñeca.
//
// Los otros tests del espejo comprueban que la trama LLEVA los datos correctos.
// Este comprueba lo único que le importa al atleta: que con esa trama, la muñeca
// pinta la pantalla que toca. Es el tramo del recorrido donde vivían los fallos
// que se encontraron entrenando —«Terminar» en la ronda 1 de 5, la dosis de la
// primera serie congelada las cuatro, el crono de la sesión donde tocaban los
// metros que faltan— y ninguno de ellos lo veía un test de la trama sola.
//
// El paso por `MirrorWire.encoder`/`decoder` no es decorativo: es el único sitio
// donde se comprueba que lo que el móvil escribe es exactamente lo que la muñeca
// lee. Un campo que no sobreviva al viaje se cae aquí y no en el gimnasio.
@MainActor
final class EspejoDeCaboARaboTests: XCTestCase {

    private var mirror: PhoneMirrorService { PhoneMirrorService.shared }

    /// El viaje entero, como lo hace el cable de verdad.
    private func paginasEnLaMuneca(_ s: WorkoutSession, bpm: Int? = nil) throws -> [WatchPagina] {
        let enviada = mirror.buildFrame(from: s)
        let bytes = try MirrorWire.encoder.encode(enviada)
        let recibida = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: bytes)
        XCTAssertEqual(enviada, recibida, "la trama no sobrevive al viaje")
        return GuionDelEspejo.paginas(recibida, bpm: bpm, elapsed: 0, avanzar: {})
    }

    // MARK: - El caso del gimnasio

    /// 5 × 500 m a 5:00/km creado en la app y arrancado desde el móvil. Lo que se
    /// vio en la muñeca fue: el crono de la sesión de sujeto, «RONDA 1/5» y un
    /// botón que decía «Terminar» en la primera serie.
    private func seriesLibres() -> WorkoutSession {
        let set = PrescriptionSet(measure: .distance(meters: 500),
                                  target: .pace(unit: .perKm, valueS: 300, minS: nil, maxS: nil),
                                  modality: .run, restS: 90, tempo: nil, note: nil)
        let rx = Prescription(scheme: .intervals, modality: .run,
                              sets: Array(repeating: set, count: 5),
                              rounds: 5, workS: nil, restS: 90, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Correr · 5×500m", kind: .running,
                                 blockTitle: "Correr · 5×500m", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Correr · 5×500m", format: .intervals,
            estimatedDurationSeconds: 900, blockContext: "Libre", zoneTargets: [],
            equipment: [], segments: [seg], coachNote: nil, demoVideoUrl: nil,
            warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    func testLaSerieEnseñaLosMetrosQueFaltanYNoElCronoDeLaSesion() throws {
        let paginas = try paginasEnLaMuneca(seriesLibres())
        let primera = try XCTUnwrap(paginas.first)
        XCTAssertTrue(primera.contexto.hasPrefix("Serie 1 / 5"))
        // 500 m prescritos y cero cubiertos todavía: faltan los 500.
        XCTAssertEqual(primera.sujeto, "500")
        XCTAssertEqual(primera.unidad, "m")
    }

    /// El botón «Terminar» en la primera de cinco series no puede volver a
    /// existir: lo que cierra este tramo es el hito de distancia, así que la
    /// muñeca NO anuncia ninguna acción mientras corres.
    func testCorriendoNoSeAnunciaNingunaAccion() throws {
        let paginas = try paginasEnLaMuneca(seriesLibres())
        let primera = try XCTUnwrap(paginas.first)
        XCTAssertNil(primera.accion)
        XCTAssertEqual(primera.modo, .ojeada)
    }

    /// Y no puede caer en la tabla de hierro por venir escrita de una fuente o de
    /// otra: la pantalla la decide la modalidad, no el nombre del formato.
    func testUnaSerieDeCorrerNoSePintaComoFuerza() throws {
        let paginas = try paginasEnLaMuneca(seriesLibres())
        let primera = try XCTUnwrap(paginas.first)
        XCTAssertNotEqual(primera.id, "serie-fuerza")
        XCTAssertNil(primera.nota, "«lo dices tú» es de fuerza: corriendo lo mide el reloj")
        XCTAssertNotEqual(primera.unidad, "kg")
    }

    // MARK: - La misma cosa escrita por el coach

    /// El coach escribe sus series de correr como `sets` con la distancia dentro
    /// de cada set (plantilla 314, «3x1000m»), no como `intervals`. El atleta
    /// tiene que ver LA MISMA pantalla: si no, el mismo entreno se ve distinto
    /// según quién lo escribió.
    private func seriesDelCoach() -> WorkoutSession {
        let set = PrescriptionSet(measure: .distance(meters: 1_000), target: nil,
                                  modality: .run, restS: 90, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .run,
                              sets: Array(repeating: set, count: 3),
                              rounds: nil, workS: nil, restS: 90, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Series (volumen +)", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Series de carrera en pista", format: .intervals,
            estimatedDurationSeconds: 1_800, blockContext: "Pista", zoneTargets: [],
            equipment: [], segments: [seg], coachNote: nil, demoVideoUrl: nil,
            warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    func testLasDosFuentesPintanLaMismaPantalla() throws {
        let libre = try paginasEnLaMuneca(seriesLibres())
        let coach = try paginasEnLaMuneca(seriesDelCoach())
        // No se comparan los números (uno es 5×500 y el otro 3×1000), se compara
        // que sea LA MISMA pantalla: mismo sujeto, mismo modo, misma ausencia de
        // acción anunciada. Que una acabara en la tabla de hierro es exactamente
        // lo que este test impide.
        //
        // HOY FALLA, Y ES UN HALLAZGO DEL MOTOR, no del cable ni del guion: una
        // serie del coach escrita como `sets` (3x1000m, plantilla 314) no genera
        // ventanas de tramo — el motor sólo levanta el driver de series cuando la
        // prescripción trae `structure` (#61). Sin ronda en el cable, la muñeca
        // la pinta como rodaje (que no es falso, pero no es la pantalla de
        // series). El arreglo es resolver sets→legs en el motor, el mismo camino
        // que ya hace TreadmillLegResolver para la cinta. El test queda como
        // fallo ESPERADO para que el hueco no se pierda y para que arreglarlo lo
        // ponga en verde solo.
        XCTExpectFailure("series del coach sin `structure`: el motor no genera tramos aún") {
            XCTAssertEqual(libre.first?.id, coach.first?.id)
            XCTAssertEqual(libre.first?.unidad, coach.first?.unidad)
            XCTAssertEqual(libre.first?.modo, coach.first?.modo)
        }
    }

    // MARK: - Fuerza

    func testLaFuerzaEnseñaLaCargaDeLaSerieEnCursoYNoPideNadaDuranteLaSerie() throws {
        let sets = (0..<4).map { _ in
            PrescriptionSet(measure: .reps(10), target: .kg(value: 60, min: nil, max: nil),
                            modality: .strength, restS: 90, tempo: nil, note: nil)
        }
        let rx = Prescription(scheme: .sets, modality: .strength, sets: sets, rounds: nil,
                              workS: nil, restS: 90, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Press banca", kind: .strength,
                                 blockTitle: "Fuerza", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Fuerza", format: .sets, estimatedDurationSeconds: 900,
            blockContext: "Fuerza", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()

        let primera = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(primera.sujeto, "60")
        XCTAssertEqual(primera.unidad, "kg")
        // Las dos manos en la barra: el reloj enuncia y espera. La oferta existe
        // pero el lienzo la pinta atenuada porque el modo es ciego.
        XCTAssertEqual(primera.modo, .ciego)
        XCTAssertEqual(primera.nota, WatchNota.loDicesTu)
    }
}
