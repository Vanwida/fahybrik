import XCTest
@testable import FAHYBRIK

// LA ENTRADA DEL RELOJ CUENTA LA SESIÓN REAL, NO «N BLOQUES» (29-sep).
//
// El brief de la muñeca escribía «4 bloques · desde 55 min» y «1º · 15:00». Ahora cada
// fila es lo que escribió el coach, con su dosis y su objetivo en UNA notación
// (`EntradaNotacion`): «6 × 1000 m a 3:45–3:55 · r 90″ suave». Estos tests pasan por el
// mismo `WorkoutPlan.from(detail:)` que la muñeca, con los planes reales del vivo
// (`VivoPlanesDePrueba`): cero fixtures inventados para la ocasión.
final class EntradaBriefTests: XCTestCase {
    private typealias P = VivoPlanesDePrueba

    /// Una fila como se lee en la muñeca: titular y detalle, con espacios normales
    /// (los duros son para que la línea no se parta a mitad de un dato).
    private func texto(_ f: EntradaFila) -> String {
        ([f.linea] + f.partes).joined(separator: " · ")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .replacingOccurrences(of: EntradaNotacion.unido, with: "")
    }

    private func filas(_ plan: WorkoutPlan) -> [String] {
        EntradaBrief.filas(plan).map(texto)
    }

    // MARK: - Correr

    /// El caso del modelo: calentamiento · 6 × (1000 m a 3:45–3:55 / 90″ suave) · vuelta a la calma.
    func testLasSeriesSeCuentanConSuObjetivoYSuRecuperacion() throws {
        let f = EntradaBrief.filas(try P.seisPorMilCompleto())
        XCTAssertEqual(f.map(texto), [
            "Calentamiento 15′",
            "6 × 1000 m a 3:45–3:55 · r 90″ suave",
            "Vuelta a la calma 10′",
        ])
        XCTAssertEqual(f.map(\.esTrabajo), [false, true, false],
                       "solo la parte principal lleva la marca; calentar y enfriar, en gris")
    }

    func testUnRodajeSeNombraConSuObjetivo() throws {
        XCTAssertEqual(filas(try P.sesion494()), ["Carrera 80′ a Z2"])
        XCTAssertEqual(filas(try P.sesion491()), ["Carrera 50′ a Z2", "Movilidad 15′"])
    }

    /// La cinta al 1 %: la inclinación es un dato del tramo y se dice.
    func testLaInclinacionDeLaCintaSeDice() throws {
        XCTAssertEqual(filas(try P.tempoCinta()), [
            "Calentamiento 10′",
            "Carrera 20′ a 4:15–4:25 · al 1 %",
            "Vuelta a la calma 5′",
        ])
    }

    /// 551: un rodaje de 6 km y, detrás, 6 strides con la recuperación andando.
    func testStridesConLaRecuperacionAndando() throws {
        XCTAssertEqual(filas(try P.sesion551()), [
            "Carrera 6 km a Z2",
            "6 × 20″ RPE 7 · r 1′ caminando",
        ])
    }

    /// 538: dos repeticiones seguidas con recuperación distinta, cada una la suya.
    func testDosRepeticionesConRecuperacionDistintaNoSeMezclan() throws {
        let f = filas(try P.sesion538Carrera())
        XCTAssertTrue(f.contains("4 × 600 m a 3:38–3:49 · r 2′ suave a 6:40–7:16"), "\(f)")
        XCTAssertTrue(f.contains("3 × 800 m a 3:49–3:55 · r 3′ caminando"), "\(f)")
    }

    /// M4: las tandas no se aplanan. 2 × (4 × 2′ a Z4 / 2′ suave) con 5′ entre tandas.
    func testLasTandasNoSeAplanan() throws {
        typealias T = VivoPlanesDePrueba.Tramo
        let interior = T.repetir(4, [T.trabajo(segundos: 120, T.zona(4)), T.recupera(segundos: 120, modo: "trote")])
        let fases = [P.fase("main", [T.repetir(2, [interior, T.recupera(segundos: 300, modo: "parado")])])]
        let plan = try P.plan("Tandas", [P.bloque("Tandas", formato: "intervals", pos: 1, [
            P.carrera("t1", scheme: "intervals", fases: fases, planos: "\"sets\": [\(P.set(P.segs(120), target: P.zona(4)))]")])])
        XCTAssertEqual(filas(plan), ["2 × (4 × 2′ a Z4) · r 2′ suave · 5′ entre tandas"])
    }

    /// Una escalera se escribe como secuencia, no se colapsa a su primer tramo ni son tres filas.
    func testUnaEscaleraSeEscribeComoSecuencia() throws {
        typealias T = VivoPlanesDePrueba.Tramo
        let fases = [P.fase("main", [
            T.trabajo(metros: 1200, T.zona(4)), T.recupera(segundos: 120, modo: "parado"),
            T.trabajo(metros: 1000, T.zona(4)), T.recupera(segundos: 120, modo: "parado"),
            T.trabajo(metros: 800, T.zona(4)),
        ])]
        let plan = try P.plan("Escalera", [P.bloque("Escalera", formato: "intervals", pos: 1, [
            P.carrera("e1", scheme: "intervals", fases: fases, planos: "\"sets\": [\(P.set(P.metros(1200), target: P.zona(4)))]")])])
        XCTAssertEqual(filas(plan), ["1200/1000/800 m a Z4 · r 2′"])
    }

    // MARK: - Fuerza, ejercicios sueltos, formatos

    /// 529: superserie A (cada ejercicio con SU dosis y el cue del coach donde el plan lo trae),
    /// el trineo repetido con su descanso, y el calentamiento como una sola línea.
    func testLaFuerzaCuentaCadaEjercicioConSuDosis() throws {
        let f = EntradaBrief.filas(try P.sesion529())
        let t = f.map(texto)
        XCTAssertEqual(t.first, "Hip mobility flow 8′")
        XCTAssertTrue(t.contains { $0.hasPrefix("Back Squat · 4 × 8 · 65–70% 1RM") }, "\(t)")
        XCTAssertTrue(t.contains { $0.hasPrefix("Box Jump · 4 × 6") && $0.contains("r 2′") }, "\(t)")
        XCTAssertTrue(t.contains("Sled Push · 6 × 15 m · r 90″"), "\(t)")
        let squat = try XCTUnwrap(f.first { $0.linea.contains("Back Squat") })
        XCTAssertEqual(squat.cue, "concéntrica explosiva", "el cue del coach llega donde el plan lo guarda")
        let salto = try XCTUnwrap(f.first { $0.linea.contains("Box Jump") })
        XCTAssertNil(salto.cue, "sin nota del coach no hay cue: nunca se inventa")
    }

    /// Una sentadilla por series rectas: dosis, carga, tempo y descanso, cada uno una vez.
    func testUnaSentadillaPorSeries() throws {
        XCTAssertEqual(filas(try P.p11()), ["Back Squat · 5 × 5 · 100 kg · 3-1-1"])
        XCTAssertEqual(filas(try P.seriesRectas()), ["Back Squat · 4 × 5 · 100 kg · r 2′"])
    }

    /// Una pirámide dice la secuencia y la progresión de carga, no una serie inventada.
    func testUnaPiramideNoSeColapsa() throws {
        let t = filas(try P.piramide392())
        XCTAssertEqual(t.count, 1)
        XCTAssertTrue(t[0].hasPrefix("Back Squat · 6/6/4/4/3"), t[0])
    }

    /// Un ergómetro por series: el nombre y «8 × 250 m a 2:05/500m · r 1′».
    func testUnErgoPorSeries() throws {
        XCTAssertEqual(filas(try P.skiSeries()), ["SkiErg · 8 × 250 m a 2:05/500m · r 1′"])
    }

    /// Un AMRAP: su cabecera y sus movimientos con su dosis.
    func testUnAmrapDiceElFormatoYSusMovimientos() throws {
        XCTAssertEqual(filas(try P.amrap()), ["AMRAP · 20:00 · 5 Pull-ups · 10 Push-ups · 15 Air Squats"])
    }

    func testUnEmomDiceSuCadenciaYSusMovimientos() throws {
        let f = filas(try P.emom())
        XCTAssertEqual(f.count, 1)
        XCTAssertTrue(f[0].hasPrefix("EMOM · cada 1:00 · 16 rondas · 15 Wall Balls 9 kg"), f[0])
    }

    /// Un calentamiento de varios ejercicios sueltos es UNA fila: no se juega ahí la sesión.
    func testUnCalentamientoDeVariosEjerciciosEsUnaFila() throws {
        func mov(_ uid: String) -> String {
            P.item(uid, "Movilidad \(uid)", cat: "mobility",
                   rx: "{ \"scheme\": \"warmup\", \"sets\": [\(P.set(P.segs(60)))] }")
        }
        let plan = try P.plan("Con calentamiento", [
            P.bloque("Calentamiento", formato: "warmup", pos: 0, [mov("a"), mov("b"), mov("c")]),
            P.bloque("Fuerza", formato: "straight_sets", pos: 1, [
                P.itemFuerza("f", "Back Squat", rx: P.porSeries("sets", Array(repeating: P.set(P.reps(5)), count: 3)))]),
        ])
        let f = EntradaBrief.filas(plan)
        XCTAssertEqual(f.map(texto), ["Calentamiento · 3 ejercicios", "Back Squat · 3 × 5"])
        XCTAssertEqual(f.map(\.esTrabajo), [false, true])
    }

    // MARK: - El contexto de arriba

    func testElContextoDiceElSueloQueEscribeElPlan() {
        XCTAssertEqual(EntradaBrief.contexto(minutos: 55), ["Hoy", "desde 55 min"])
        XCTAssertEqual(EntradaBrief.contexto(minutos: 70), ["Hoy", "desde 1 h 10"])
        XCTAssertEqual(EntradaBrief.contexto(minutos: nil), ["Hoy"], "sin duración escrita no se inventa un número")
        XCTAssertEqual(EntradaBrief.contexto(minutos: 0), ["Hoy"])
    }

    // MARK: - Por qué no hay «Empezar» y cómo llegas

    func testSinEmpezarSeDiceElPorQue() throws {
        XCTAssertNil(EntradaBrief.motivo(.run(try P.sesion494())), "con plan del coach sí hay Empezar")
        XCTAssertTrue(try XCTUnwrap(EntradaBrief.motivo(.needsDetail)).hasPrefix("Falta la sesión en el reloj"))
        XCTAssertEqual(EntradaBrief.motivo(.phoneOnly(.jumpTest)), "El test de salto se hace con la cámara del iPhone.")
        XCTAssertEqual(EntradaBrief.motivo(.phoneOnly(.noBody)), "Esta sesión se hace desde el iPhone.")
    }

    func testLaTendenciaTieneSentidoEnPalabras() {
        XCTAssertEqual(EntradaBrief.tendencia(delta7d: 4), "▲ +4 en 7 días")
        XCTAssertEqual(EntradaBrief.tendencia(delta7d: -6), "▼ -6 en 7 días")
        XCTAssertEqual(EntradaBrief.tendencia(delta7d: 0), "de 100")
        XCTAssertEqual(EntradaBrief.tendencia(delta7d: nil), "de 100")
    }

    // MARK: - La notación

    func testLasDuracionesSeEscribenComoEnLaPista() {
        XCTAssertEqual(EntradaNotacion.duracion(20), "20″")
        XCTAssertEqual(EntradaNotacion.duracion(90), "90″")
        XCTAssertEqual(EntradaNotacion.duracion(60), "1′")
        XCTAssertEqual(EntradaNotacion.duracion(150), "2′30″")
        XCTAssertEqual(EntradaNotacion.duracion(3000), "50′")
    }

    func testLasDistanciasSonMetrosHastaLosCincoKilometros() {
        XCTAssertEqual(EntradaNotacion.distancia(800), "800\u{00A0}m")
        XCTAssertEqual(EntradaNotacion.distancia(1000), "1000\u{00A0}m")
        XCTAssertEqual(EntradaNotacion.distancia(6000), "6\u{00A0}km")
        XCTAssertEqual(EntradaNotacion.distancia(10_500), "10,5\u{00A0}km")
    }

    /// El rango no se parte por el guion: el «word joiner» lo ata. La línea parte ENTRE datos.
    func testUnRangoNoSePartePorElGuion() {
        let o = EntradaNotacion.objetivo(RunSegmentTarget.pace(valueS: nil, minS: 225, maxS: 235)) ?? ""
        XCTAssertTrue(o.contains("\(EntradaNotacion.unido)–\(EntradaNotacion.unido)"))
        XCTAssertFalse(o.contains(" "), "los espacios de un dato son duros")
    }

    func testElObjetivoNoLlevaArrobaNiUnidadDeRitmoEnLaCalle() {
        let d = EntradaNotacion.duro
        func limpio(_ s: String?) -> String? { s?.replacingOccurrences(of: EntradaNotacion.unido, with: "") }
        XCTAssertEqual(limpio(EntradaNotacion.objetivo(RunSegmentTarget.pace(valueS: nil, minS: 225, maxS: 235))), "a\(d)3:45–3:55")
        XCTAssertEqual(EntradaNotacion.objetivo(RunSegmentTarget.paceZone(5)), "a\(d)Z5")
        XCTAssertEqual(EntradaNotacion.objetivo(RunSegmentTarget.rpe(value: 8, min: nil, max: nil)), "RPE\(d)8")
        XCTAssertNil(EntradaNotacion.objetivo(RunSegmentTarget?.none))
    }
}
