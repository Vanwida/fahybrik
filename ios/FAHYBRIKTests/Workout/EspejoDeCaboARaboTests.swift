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

    /// LA PÁGINA DEL ESFUERZO, por su nombre. En correr la lista son tres páginas y
    /// la primera es el panel de datos, así que `.first` ya no es la que se mira
    /// corriendo — buscarla por id es además lo que hace el lienzo.
    private func vivo(_ s: WorkoutSession, bpm: Int? = nil) throws -> WatchPagina {
        let paginas = try paginasEnLaMuneca(s, bpm: bpm)
        return try XCTUnwrap(paginas.first { $0.id == GuionCorrer.idVivo },
                             "correr tiene que traer su página del vivo")
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
            equipment: [], segments: [seg], coachNote: nil,
            warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    func testLaSerieEnseñaLosMetrosQueFaltanYNoElCronoDeLaSesion() throws {
        let s = seriesLibres()
        // Con el GPS ya fijado: 500 m prescritos y 180 cubiertos → faltan 320.
        s.sampleRunDistance(deltaMeters: 180, source: .healthkit)
        let vivo = try vivo(s)
        XCTAssertTrue(vivo.contexto.hasPrefix("Serie 1 de 5"), vivo.contexto)
        XCTAssertTrue(vivo.contexto.hasSuffix("te quedan"),
                      "la banda dice CON PALABRAS si es lo cubierto o lo que falta")
        XCTAssertEqual(vivo.sujeto, "320")
        XCTAssertEqual(vivo.unidad, "m")
    }

    /// Y ANTES DE QUE EL GPS FIJE no se pinta un «te faltan 500» que no se ha medido:
    /// el sujeto cae al reloj de la pieza y la muñeca dice por qué. Es el estado que
    /// ve todo el mundo los primeros segundos de cada carrera.
    func testAntesDeQueFijeElGpsSeDiceQueNoHaySenal() throws {
        let vivo = try vivo(seriesLibres())
        XCTAssertEqual(vivo.nota, WatchNota.sinSenal)
        XCTAssertTrue(vivo.contexto.hasSuffix("llevas"), vivo.contexto)
        XCTAssertNil(vivo.unidad, "sin metros medidos el sujeto es un reloj, no una distancia")
    }

    /// Y AVANZAN. Este test faltaba, y su ausencia dejó pasar el peor fallo de la
    /// noche: el cable leía el acumulador de la CINTA para todo, así que al aire
    /// libre —donde eso es nil— la muñeca pintaba «te faltan 500» los cuatro
    /// minutos enteros. Un numeral congelado parece un numeral correcto: sólo lo
    /// caza afirmar que el número CAMBIA cuando el atleta corre.
    func testLosMetrosQueFaltanBajanCuandoElAtletaCorre() throws {
        let s = seriesLibres()
        s.sampleRunDistance(deltaMeters: 60, source: .healthkit)
        let alSalir = try vivo(s).sujeto

        s.sampleRunDistance(deltaMeters: 120, source: .healthkit)
        let aMitad = try vivo(s).sujeto

        XCTAssertNotEqual(aMitad, alSalir, "el numeral se quedaba congelado toda la serie")
        XCTAssertLessThan(Int(aMitad) ?? .max, Int(alSalir) ?? 0)
    }

    /// El botón «Terminar» en la primera de cinco series no puede volver a
    /// existir: lo que cierra este tramo es el hito de distancia, así que la
    /// muñeca NO anuncia ninguna acción mientras corres.
    func testCorriendoNoSeAnunciaNingunaAccion() throws {
        let s = seriesLibres()
        s.sampleRunDistance(deltaMeters: 180, source: .healthkit)
        let vivo = try vivo(s)
        XCTAssertNil(vivo.accion)
        XCTAssertEqual(vivo.modo, .ojeada)
    }

    /// LOS CONTROLES ESTÁN, PERO EN SU PÁGINA. Que corriendo no se anuncie ninguna
    /// acción no significa que no se pueda pausar: significa que el botón no le roba
    /// altura al dato. Está a un deslizamiento.
    func testLosControlesExistenEnSuPaginaYNoEnLaDelEsfuerzo() throws {
        let paginas = try paginasEnLaMuneca(seriesLibres())
        XCTAssertEqual(paginas.map(\.id),
                       [GuionCorrer.idDatos, GuionCorrer.idVivo, GuionCorrer.idControles])
        let controles = try XCTUnwrap(paginas.last?.botones)
        XCTAssertEqual(controles.first?.titulo, "Pausar")
        XCTAssertEqual(controles.last?.titulo, "Terminar")
    }

    /// Y no puede caer en la tabla de hierro por venir escrita de una fuente o de
    /// otra: la pantalla la decide la modalidad, no el nombre del formato.
    func testUnaSerieDeCorrerNoSePintaComoFuerza() throws {
        let s = seriesLibres()
        s.sampleRunDistance(deltaMeters: 180, source: .healthkit)
        let vivo = try vivo(s)
        XCTAssertNotEqual(vivo.id, "serie-fuerza")
        XCTAssertNil(vivo.nota, "«lo dices tú» es de fuerza: corriendo lo mide el reloj")
        XCTAssertNotEqual(vivo.unidad, "kg")
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
            equipment: [], segments: [seg], coachNote: nil,
            warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    func testLasDosFuentesPintanLaMismaPantalla() throws {
        let sLibre = seriesLibres()
        let sCoach = seriesDelCoach()
        sLibre.sampleRunDistance(deltaMeters: 180, source: .healthkit)
        sCoach.sampleRunDistance(deltaMeters: 180, source: .healthkit)
        let libre = try paginasEnLaMuneca(sLibre)
        let coach = try paginasEnLaMuneca(sCoach)
        // LA MISMA INTERFAZ, las mismas tres páginas y en el mismo orden.
        XCTAssertEqual(libre.map(\.id), coach.map(\.id))
        // No se comparan los números (uno es 5×500 y el otro 3×1000), se compara
        // que sea LA MISMA pantalla: mismo sujeto, mismo modo, misma ausencia de
        // acción anunciada. Que una acabara en la tabla de hierro es exactamente
        // lo que este test impide.
        //
        // Esto falló hasta que el motor aprendió a leer una tabla de `sets` como
        // lo que es (`RunSeriesDeSets.swift`): antes, la serie del coach no tenía
        // cursor de tramo y la muñeca la pintaba como un rodaje.
        let vivoLibre = try XCTUnwrap(libre.first { $0.id == GuionCorrer.idVivo })
        let vivoCoach = try XCTUnwrap(coach.first { $0.id == GuionCorrer.idVivo })
        XCTAssertEqual(vivoLibre.unidad, vivoCoach.unidad)
        XCTAssertEqual(vivoLibre.modo, vivoCoach.modo)
        XCTAssertTrue(vivoCoach.contexto.hasPrefix("Serie 1 de 3"),
                      "la serie del coach tiene que contar sus tres repeticiones: \(vivoCoach.contexto)")
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
            coachNote: nil, warmupChecklist: []))
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
