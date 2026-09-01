import XCTest
@testable import FAHYBRIK

// LO QUE DECIDE LA SECCIÓN DE FUERZA, probado contra las formas que el servidor
// manda de verdad (por eso los fixtures se DECODIFICAN en vez de construirse a
// mano: una prueba que se salta el decodificador no prueba el contrato).
//
// Las dos decisiones que importan y que aquí se blindan:
//
//   1 · QUÉ ENTRA. La batería de un atleta produce series de todo — un 5k en
//       segundos, un Cooper en metros, un umbral en pulsaciones. Sólo el peso y
//       las repeticiones miden fuerza; lo demás en esta sección no es un dato de
//       más, es un dato en la sección equivocada.
//   2 · QUÉ NO SE CUENTA DOS VECES. Un test de sentadilla escribe LAS DOS cosas
//       —una marca fechada y un 1RM versionado—, así que sin descarte el atleta
//       vería su sentadilla dos veces, con dos curvas del mismo hecho.
final class FuerzaProgresoTests: XCTestCase {

    // MARK: - Fixtures (la forma del cable, tal cual)

    private func maxes(_ json: String) throws -> [StrengthMaxProfile] {
        try APIClient.makeJSONDecoder()
            .decode(AthleteBenchmarksResponse.self, from: Data(json.utf8)).maxes
    }

    private func series(_ json: String) throws -> [BenchmarkSeries] {
        try APIClient.makeJSONDecoder()
            .decode(BenchmarkHistoryResponse.self, from: Data(json.utf8)).series
    }

    /// Sentadilla con tres versiones (la última sólo arriba) y press banca con una.
    private let benchmarksJSON = """
    {"maxes":[
      {"exercise_slug":"back_squat_1rm","exercise_label":"Sentadilla","one_rm_kg":142.5,
       "unit":"kg","source":"athlete_test","version":3,"recorded_at":"2026-07-20T09:00:00Z",
       "test_weight_kg":120,"test_reps":6,
       "history":[
         {"one_rm_kg":125,"version":1,"recorded_at":"2026-03-12T09:00:00Z","source":"onboarding"},
         {"one_rm_kg":135,"version":2,"recorded_at":"2026-05-18T09:00:00Z","source":"athlete_test"}
       ]},
      {"exercise_slug":"bench_press_1rm","exercise_label":"Press banca","one_rm_kg":95,
       "unit":"kg","source":"coach","version":1,"recorded_at":"2026-06-01T09:00:00Z",
       "test_weight_kg":null,"test_reps":null,
       "history":[{"one_rm_kg":95,"version":1,"recorded_at":"2026-06-01T09:00:00Z","source":"coach"}]}
    ]}
    """

    /// Un barrido del catálogo entero por UNIDAD, no por nombre: kilos, repes,
    /// segundos, metros y pulsaciones — una de cada familia que existe.
    private let historyJSON = """
    {"series":[
      {"exercise_slug":"back_squat_1rm","label":"Sentadilla","unit":"kg",
       "results":[{"value":135,"recorded_at":"2026-05-18T09:00:00Z"},
                  {"value":142.5,"recorded_at":"2026-07-20T09:00:00Z"}]},
      {"exercise_slug":"strict_pull_up_max","label":"Dominadas estrictas","unit":"reps",
       "results":[{"value":12,"recorded_at":"2026-04-02T09:00:00Z"},
                  {"value":16,"recorded_at":"2026-07-11T09:00:00Z"}]},
      {"exercise_slug":"run_5k","label":"5 km","unit":"seconds",
       "results":[{"value":1334,"recorded_at":"2026-04-20T09:00:00Z"},
                  {"value":1298,"recorded_at":"2026-07-05T09:00:00Z"}]},
      {"exercise_slug":"cooper_12min","label":"Cooper 12 min","unit":"meters",
       "results":[{"value":2850,"recorded_at":"2026-05-05T09:00:00Z"}]},
      {"exercise_slug":"lthr_bpm","label":"Umbral de pulso","unit":"bpm",
       "results":[{"value":168,"recorded_at":"2026-05-05T09:00:00Z"},
                  {"value":171,"recorded_at":"2026-07-05T09:00:00Z"}]}
    ]}
    """

    // MARK: - Los levantamientos

    /// La serie se ordena POR VERSIÓN y la de arriba entra aunque el historial no
    /// la traiga — que es exactamente el caso de la sentadilla del fixture.
    func testCadaLevantamientoTraeSuSerieCompletaOrdenada() throws {
        let curvas = FuerzaProgreso.levantamientos(try maxes(benchmarksJSON))
        let sentadilla = try XCTUnwrap(curvas.first { $0.id == "back_squat_1rm" })

        XCTAssertEqual(sentadilla.valores, [125, 135, 142.5])
        XCTAssertEqual(sentadilla.titulo, "Sentadilla")
        XCTAssertEqual(sentadilla.unidad, "kg")
        XCTAssertEqual(try XCTUnwrap(sentadilla.delta), 7.5, accuracy: 0.001)
        XCTAssertEqual(sentadilla.mejora, true)
        XCTAssertTrue(sentadilla.tieneCurva)
    }

    /// LA VENTANA DEL DELTA ES LA FECHA DE LA MEDIDA ANTERIOR, no la de hoy: un
    /// «+7,5 kg» sin decir desde cuándo miente por omisión.
    func testLaVentanaSaleDeLaMedidaAnterior() throws {
        let curvas = FuerzaProgreso.levantamientos(try maxes(benchmarksJSON))
        let sentadilla = try XCTUnwrap(curvas.first { $0.id == "back_squat_1rm" })
        let desde = try XCTUnwrap(sentadilla.desde)
        XCTAssertEqual(StatsDateParser.dayMonth(desde), StatsDateParser.dayMonth(
            try XCTUnwrap(StatsDateParser.parse("2026-05-18T09:00:00Z"))
        ))
    }

    /// UN LEVANTAMIENTO CON UNA SOLA MEDIDA SIGUE SALIENDO. Esconderlo le
    /// enseñaría a un atleta cuatro de sus seis levantamientos sin decirle por qué
    /// faltan dos; la fila declara el hueco con el acto que lo llena.
    func testUnaSolaMedidaSaleSinCurvaYSinJuicio() throws {
        let curvas = FuerzaProgreso.levantamientos(try maxes(benchmarksJSON))
        let banca = try XCTUnwrap(curvas.first { $0.id == "bench_press_1rm" })

        XCTAssertEqual(banca.valores, [95])
        XCTAssertEqual(banca.ultimo, 95)
        XCTAssertNil(banca.delta)
        XCTAssertNil(banca.mejora)
        XCTAssertNil(banca.desde)
        XCTAssertFalse(banca.tieneCurva)
    }

    /// Un 1RM que BAJA (descarga, lesión) no puede leerse verde. La dirección la
    /// decide la unidad, nunca la vista.
    func testUnaCargaQueBajaNoSeLeeComoMejora() throws {
        let bajando = """
        {"maxes":[{"exercise_slug":"deadlift_1rm","exercise_label":"Peso muerto","one_rm_kg":180,
          "unit":"kg","source":"athlete_test","version":2,"recorded_at":"2026-07-01T09:00:00Z",
          "test_weight_kg":null,"test_reps":null,
          "history":[{"one_rm_kg":195,"version":1,"recorded_at":"2026-04-01T09:00:00Z","source":"athlete_test"}]}]}
        """
        let curva = try XCTUnwrap(FuerzaProgreso.levantamientos(try maxes(bajando)).first)
        XCTAssertEqual(try XCTUnwrap(curva.delta), -15, accuracy: 0.001)
        XCTAssertEqual(curva.mejora, false)
    }

    /// Sin movimiento no se juzga: cero no es ni mejor ni peor, y una flecha ahí
    /// sería un veredicto inventado.
    func testSinMovimientoNoHayJuicio() {
        let plana = CurvaDeFuerza(id: "ohp_1rm", titulo: "Press militar", unidad: "kg",
                                  valores: [60, 60], desde: nil)
        XCTAssertEqual(plana.delta, 0)
        XCTAssertNil(plana.mejora)
    }

    // MARK: - Los tests de la batería

    /// EL BARRIDO POR UNIDAD, sobre el catálogo entero: entran kilos y
    /// repeticiones; segundos, metros y pulsaciones son de otra sección.
    func testSoloEntranLasSeriesQueMidenFuerza() throws {
        let curvas = FuerzaProgreso.tests(try series(historyJSON), yaEnLevantamientos: [])
        XCTAssertEqual(curvas.map(\.id).sorted(), ["back_squat_1rm", "strict_pull_up_max"])
    }

    /// El descarte que evita ver la sentadilla dos veces: la del 1RM manda,
    /// porque es la que gobierna los porcentajes del plan.
    func testUnLevantamientoQueYaTieneCurvaDe1RMNoSeRepite() throws {
        let curvas = FuerzaProgreso.tests(try series(historyJSON),
                                          yaEnLevantamientos: ["back_squat_1rm"])
        XCTAssertEqual(curvas.map(\.id), ["strict_pull_up_max"])
    }

    /// Las repeticiones se leen y se juzgan como lo que son: más es mejor.
    func testLasRepeticionesSubenParaMejorar() throws {
        let curvas = FuerzaProgreso.tests(try series(historyJSON), yaEnLevantamientos: [])
        let dominadas = try XCTUnwrap(curvas.first { $0.id == "strict_pull_up_max" })

        XCTAssertEqual(dominadas.unidad, "reps")
        XCTAssertEqual(dominadas.valores, [12, 16])
        XCTAssertEqual(dominadas.mejora, true)
        XCTAssertFalse(BenchmarkDelta.lowerIsBetter(unit: dominadas.unidad))
    }

    /// Una serie sin resultados no es una fila vacía: no es una fila.
    func testUnaSerieSinResultadosNoSePinta() throws {
        let vacia = """
        {"series":[{"exercise_slug":"clean_1rm","label":"Cargada","unit":"kg","results":[]}]}
        """
        XCTAssertTrue(FuerzaProgreso.tests(try series(vacia), yaEnLevantamientos: []).isEmpty)
    }

    // MARK: - La lectura partida

    /// `split` es lo que permite componer «142,5» en mono grande y «kg» en
    /// versalita pequeña. Tiene que decir EXACTAMENTE lo mismo que la etiqueta
    /// entera, o la sección de fuerza y el hub de tests dirían dos cosas.
    func testLaCifraPartidaDiceLoMismoQueLaEntera() {
        let casos: [(String, Double)] = [
            ("kg", 142.5), ("kg", 140), ("reps", 16), ("bpm", 168),
            ("meters", 2850), ("calories", 18), ("seconds", 1334)
        ]
        for (unidad, valor) in casos {
            let p = BenchmarkDelta.split(unit: unidad, value: valor)
            let entera = BenchmarkDelta.valueLabel(unit: unidad, value: valor)
            let recompuesta = p.unidad.isEmpty ? p.cifra : "\(p.cifra) \(p.unidad)"
            XCTAssertEqual(recompuesta, entera, "«\(unidad)» se parte distinto de como se escribe")
        }
        // Un tiempo ya lleva su unidad dentro: «22:14» no admite un sufijo.
        XCTAssertEqual(BenchmarkDelta.split(unit: "seconds", value: 1334).unidad, "")
    }
}
