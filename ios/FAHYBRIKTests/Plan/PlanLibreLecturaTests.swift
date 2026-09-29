import XCTest
@testable import FAHYBRIK

// «PLAN» SIN COACH, CLAVADO — la traducción a XCTest del bloque «el tier libre» de
// `web/tests/design-twin/plan-rehecho.test.ts`, más lo que el Swift añade: que lo que llega del servidor
// (`MarkView`, `FreePlanPayload`) se traduce a la lectura sin inventar nada.
//
// La regla que gobierna la pantalla (DECISIONS 27-jul): el tier libre MIDE y COMPARA. Todo lo que enseña son datos
// suyos, lo que falta se dice, y en dobles el ritmo es un suelo y la estación no se le atribuye.

final class PlanLibreLecturaTests: XCTestCase {

    private func lectura(_ id: String) -> LecturaLibre { EjemplosPlan.casoLibre(id).lectura }

    private func textos(_ l: LecturaLibre) -> [String] {
        var t: [String] = []
        if case let .fijada(c) = l.carrera {
            t += [c.nombre, c.categoria, c.objetivo].compactMap { $0 } + c.faltan
            if let comp = c.comparacion {
                switch comp {
                case let .mejor(m, d): t += [PlanLibreCopy.veredictoDelObjetivo(mejor: m, deltaS: d)]
                case let .sin(motivo, cat): t += [PlanLibreCopy.textoSinComparacion(motivo: motivo, categoria: cat)]
                }
            }
        }
        if let e = l.evidencia {
            t += [PlanLibreCopy.lineaDeProgreso(e), e.mejor8km.map(PlanLibreCopy.notaOchoKm)].compactMap { $0 }
        }
        t += (l.marcas.medidas + l.marcas.faltan + l.marcas.arranque).flatMap { [$0.etiqueta, $0.como, $0.desbloquea, $0.dura] }
        t += l.semanaBloqueada?.sesiones.flatMap { [$0.titulo, $0.detalle] } ?? []
        t += [l.semanaBloqueada?.base].compactMap { $0 }
        return t
    }

    // MARK: - Los casos

    func testSonCuatroCasosConIdUnicoYSinEvidenciaSoloEnLosQueNoLaTienen() {
        XCTAssertEqual(EjemplosPlan.casosLibre.count, 4)
        XCTAssertEqual(Set(EjemplosPlan.casosLibre.map(\.id)).count, 4)
        XCTAssertFalse(lectura("libre-sin-nada").tieneEvidencia)
        XCTAssertTrue(lectura("libre-con-carreras").tieneEvidencia)
    }

    func testNingunaPiezaDeCoachNiChatNiTuEntrenadorNiTestsNiRevisionNiComunicados() throws {
        let coach = try NSRegularExpression(pattern: "tu entrenador|tu coach|comunicad|revisi[oó]n|chat", options: [.caseInsensitive])
        let guion = try NSRegularExpression(pattern: "[—–]")
        for caso in EjemplosPlan.casosLibre {
            for t in textos(caso.lectura) {
                let r = NSRange(t.startIndex..., in: t)
                XCTAssertNil(coach.firstMatch(in: t, range: r), "\(caso.id): «\(t.prefix(60))»")
                XCTAssertNil(guion.firstMatch(in: t, range: r), "\(caso.id): «\(t.prefix(60))»")
            }
        }
    }

    // MARK: - Las frases

    func testCuentaAtrasHoyMananaDiasYSemanas() {
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(0), "es hoy")
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(-3), "es hoy")
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(1), "mañana")
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(5), "en 5 días")
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(13), "en 13 días")
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(14), "en 2 semanas")
        XCTAssertEqual(PlanLibreCopy.cuentaAtras(68), "en 10 semanas")
        XCTAssertNil(PlanLibreCopy.cuentaAtras(nil))
    }

    func testElVeredictoDelObjetivoDiceLaVerdadEnLosTresSentidos() {
        let mejor = FinalDeCarrera(tiempoS: 3862, lugar: "Berlín", cuando: "may 2025", categoria: "dobles pro", equipo: true)
        XCTAssertEqual(PlanLibreCopy.veredictoDelObjetivo(mejor: mejor, deltaS: 218),
                       "Ya fuiste 3:38 más rápido que eso en Berlín · may 2025. Tu objetivo se te ha quedado corto.")
        XCTAssertEqual(PlanLibreCopy.veredictoDelObjetivo(mejor: mejor, deltaS: -95), "Te faltan 1:35 desde tu mejor marca en Berlín · may 2025.")
        XCTAssertTrue(PlanLibreCopy.veredictoDelObjetivo(mejor: mejor, deltaS: 0).contains("exactamente a tu objetivo"))
    }

    func testSinComparacionLoDiceEnVezDeCallarse() {
        XCTAssertTrue(PlanLibreCopy.textoSinComparacion(motivo: .sinCarreras, categoria: nil).contains("Cuando corras una"))
        XCTAssertTrue(PlanLibreCopy.textoSinComparacion(motivo: .formatoDistinto, categoria: "dobles pro").contains("ninguna fue en dobles pro"))
    }

    func testLasMarcasPendientesSeNombranHastaTresYLuegoYNMas() {
        XCTAssertNil(PlanLibreCopy.marcasQueFaltan([]))
        XCTAssertEqual(PlanLibreCopy.marcasQueFaltan(["1 km", "Remo 500 m", "Ski 1.000 m"]),
                       "Para decirte cuánto tardarías aún nos faltan tus marcas: 1 km, Remo 500 m y Ski 1.000 m.")
        XCTAssertTrue(PlanLibreCopy.marcasQueFaltan(["a", "b", "c", "d", "e"])!.hasSuffix("a, b, c y 2 más."))
    }

    func testEnDoblesElRitmoEsUnSueloYNoSeRestaElUltimoAlMejor() throws {
        let e = try XCTUnwrap(lectura("libre-con-carreras").evidencia)
        XCTAssertNil(e.tendencia)
        XCTAssertTrue(try XCTUnwrap(PlanLibreCopy.lineaDeProgreso(e)).contains("restarle tu mejor no te diría cómo estás"))
    }

    func testEnIndividualElUltimoSeCompararaAlMejorSinTendencia() {
        let mejor = OchoKm(ritmoSKm: 250, totalS: 2000, lugar: "Berlín", suelo: false)
        XCTAssertEqual(PlanLibreCopy.ultimoFrenteAlMejor(ultimo: OchoKm(ritmoSKm: 258, totalS: 2064, lugar: "Málaga", suelo: false), mejor: mejor),
                       "Tu último fue 4:18/km en Málaga: 8 s por kilómetro más lento que tu mejor.")
        XCTAssertEqual(PlanLibreCopy.ultimoFrenteAlMejor(ultimo: OchoKm(ritmoSKm: 250, totalS: 2000, lugar: "Málaga", suelo: false), mejor: mejor),
                       "Tu último fue 4:10/km en Málaga, clavado a tu mejor.")
    }

    func testLaSemanaBloqueadaEsRealLasVisiblesYLasDifuminadasSonSesionesCompletas() throws {
        let w = try XCTUnwrap(lectura("libre-con-carreras").semanaBloqueada)
        XCTAssertGreaterThan(w.sesiones.count, w.visibles)
        for s in w.sesiones { XCTAssertFalse(s.detalle.isEmpty) }
    }

    // MARK: - La acción anclada

    func testSinNadaMedidoLaPuertaEsLaPrimeraMarcaYConEvidenciaProgramarUnEntreno() {
        guard case let .medir(marca)? = lectura("libre-sin-nada").accion else { return XCTFail("debería medir") }
        XCTAssertEqual(marca.slug, "run_1k")
        XCTAssertEqual(PlanLibreCopy.nombreEnBoton(marca.etiqueta), "el 1 km")
        XCTAssertEqual(lectura("libre-con-carreras").accion, .programar)
        XCTAssertNil(lectura("libre-cargando").accion, "mientras carga aún no sabemos cuál de las dos toca")
        // Sin evidencia y con el catálogo caído no hay marca que medir: queda programar, que no depende de nada.
        XCTAssertEqual(lectura("libre-sin-nada-y-sin-red").accion, .programar)
    }

    func testElRotuloDelPanelYLoQueSeDiceDeUnDiaVacio() {
        let hoy = EjemplosPlan.hoy
        XCTAssertEqual(PlanLibreCopy.rotuloDelPanel(iso: hoy, hoy: hoy), "")
        XCTAssertEqual(PlanLibreCopy.rotuloDelPanel(iso: "2026-10-02", hoy: hoy), "lo que tienes")
        XCTAssertEqual(PlanLibreCopy.rotuloDelPanel(iso: "2026-09-30", hoy: hoy), "lo que hiciste")
        XCTAssertEqual(PlanLibreCopy.textoDiaVacio(iso: hoy, hoy: hoy), "Aún no has entrenado hoy.")
        XCTAssertEqual(PlanLibreCopy.textoDiaVacio(iso: "2026-10-02", hoy: hoy), "Nada programado ese día.")
        XCTAssertEqual(PlanLibreCopy.textoDiaVacio(iso: "2026-09-30", hoy: hoy), "Ese día no entrenaste.")
    }

    func testElResumenDeLaSemanaEsUnSueloYDeclaraElHueco() throws {
        let s = EjemplosPlan.semana(
            lunes: EjemplosPlan.lunes, hoy: EjemplosPlan.hoy,
            dias: [[EjemplosPlan.d(.rodaje8k, .hecha)], [EjemplosPlan.d(.fuerzaInferior, .hecha)], [EjemplosPlan.d(.series800)], [], [], [], []])
        XCTAssertEqual(PlanLibreCopy.resumenDeSemana(s), "2 sesiones hechas · desde 45 min · 1 sin tiempo previsto")
        let ninguna = EjemplosPlan.semana(lunes: EjemplosPlan.lunes, hoy: EjemplosPlan.hoy, dias: [[EjemplosPlan.d(.rodaje8k)], [], [], [], [], [], []])
        XCTAssertNil(PlanLibreCopy.resumenDeSemana(ninguna), "sin nada hecho no hay resumen que contar")
    }

    // MARK: - El menú de una sesión propia

    func testUnLibreSeEditaYSeMueveMientrasNoEsteHechoYSeBorraSiempre() throws {
        let semana = try XCTUnwrap(lectura("libre-con-carreras").semana)
        let hecha = semana.dias[0].sesiones[0]
        let pendiente = semana.dias[2].sesiones[0]
        XCTAssertEqual(pendiente.accionesLibres().map(\.clave), [.editarLibre, .mover, .borrarLibre])
        XCTAssertEqual(hecha.accionesLibres().map(\.clave), [.borrarLibre], "una hecha no se edita ni se mueve (el servidor la congela)")
        XCTAssertEqual(pendiente.accionesLibres().filter(\.destructiva).map(\.clave), [.borrarLibre])
    }

    // MARK: - Del cable a la lectura

    private func decodifica<T: Decodable>(_ tipo: T.Type, _ json: String) throws -> T {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(T.self, from: Data(json.utf8))
    }

    private func marca(_ slug: String, _ label: String, erg: String? = nil, medidoPor: String = "run", mejor: Double? = nil, aprox: String = "~4-5 min") throws -> MarkView {
        let best = mejor.map { #"{"id":"1","value":\#($0),"recorded_at":"2026-09-10T08:00:00Z","source":"athlete_test"}"# } ?? "null"
        return try decodifica(MarkView.self, """
        {"slug":"\(slug)","label":"\(label)","group":"run","measured_by":"\(medidoPor)","unit":"seconds","lower_is_better":true,
        "approx_label":"\(aprox)","erg":\(erg.map { "\"\($0)\"" } ?? "null"),"target_distance_m":1000,"fixed_duration_s":null,
        "best":\(best),"latest":null,"best_outdoor":null,"best_treadmill":null,"history":[],"race_twin":null}
        """)
    }

    func testLasMarcasSeTraducenMedidasPendientesYDeArranqueEnOrden() throws {
        // El catálogo en el orden del servidor: el 5 km ANTES de las tres de arranque, y una distancia que solo se registra.
        let catalogo = [
            try marca("run_5k", "5 km"),
            try marca("ski_1k", "Ski 1.000 m", erg: "ski", medidoPor: "erg", aprox: "~5 min"),
            try marca("run_1k", "1 km", mejor: 218),
            try marca("half", "Media maratón", medidoPor: "registered", aprox: "Apúntala cuando la corras"),
            try marca("row_500m", "Remo 500 m", erg: "row", medidoPor: "erg", aprox: "~3 min"),
        ]
        let l = LecturaLibre.desde(
            marcas: catalogo, marcasCargadas: true, marcasFallaron: false, carrerasCargadas: true, carrerasImportadas: 0,
            vo2: nil, retrato: nil, carreraObjetivo: nil, semana: nil, hoyIso: EjemplosPlan.hoy)
        XCTAssertFalse(l.cargando)
        XCTAssertEqual(l.marcas.medidas.map(\.slug), ["run_1k"], "solo lo que la app puede medir de punta a punta")
        XCTAssertEqual(l.marcas.medidas.first?.valor, "3:38")
        XCTAssertEqual(l.marcas.faltan.map(\.slug), ["run_5k", "ski_1k", "row_500m"], "la distancia que solo se registra no es una marca pendiente")
        XCTAssertEqual(l.marcas.arranque.map(\.slug), ["run_1k", "row_500m", "ski_1k"], "las tres de arranque, en SU orden y no en el del catálogo")
        XCTAssertTrue(l.tieneEvidencia, "una marca medida ya es evidencia")
        XCTAssertEqual(l.accion, .programar)
        let ski = try XCTUnwrap(l.marcas.arranque.last)
        XCTAssertEqual(ski.desbloquea, "Mídelo y tu semana gana la sesión de ski")
        XCTAssertEqual(ski.como, "Con el ski conectado, la app lo mide sola · te lleva ~5 min")
    }

    func testMientrasNoHanContestadoLasDosFuentesEsUnEsqueletoNoUnVacio() {
        var l = LecturaLibre.desde(
            marcas: [], marcasCargadas: true, marcasFallaron: false, carrerasCargadas: false, carrerasImportadas: 0,
            vo2: nil, retrato: nil, carreraObjetivo: nil, semana: nil, hoyIso: EjemplosPlan.hoy)
        XCTAssertTrue(l.cargando, "las carreras aún no han contestado")
        l = LecturaLibre.desde(
            marcas: [], marcasCargadas: true, marcasFallaron: false, carrerasCargadas: true, carrerasImportadas: 0,
            vo2: nil, retrato: nil, carreraObjetivo: nil, semana: nil, hoyIso: EjemplosPlan.hoy)
        XCTAssertFalse(l.cargando)
    }

    func testElRetratoSeTraduceLaEvidenciaElObjetivoYLaSemana() throws {
        let retrato = try decodifica(FreePlanPayload.self, """
        {"race_evidence":{"races_counted":3,
          "best_finish":{"race":{"race_id":1,"name":"HYROX Berlín","location":"Berlín","race_date":"2025-05-16","format":"doubles","division":"pro","gender_category":"men"},"total_seconds":3862,"team_result":true},
          "best_run":{"race":{"race_id":1,"name":"HYROX Berlín","location":"Berlín","race_date":"2025-05-16","format":"doubles","division":"pro","gender_category":"men"},"total_seconds":2016,"pace_s_per_km":252,"partner_bounded":true},
          "latest_run":{"race":{"race_id":2,"name":"HYROX Málaga","location":"Málaga","race_date":"2026-03-01","format":"doubles","division":"pro","gender_category":"men"},"total_seconds":2064,"pace_s_per_km":258,"partner_bounded":true},
          "best_roxzone":{"race":{"race_id":1,"name":"HYROX Berlín","location":"Berlín","race_date":"2025-05-16","format":"doubles","division":"pro","gender_category":"men"},"seconds":331},
          "run_trend":null},
         "goal_check":{"target":{"race_id":9,"name":"HYROX Valencia","location":"Valencia","race_date":"2026-11-04","format":"doubles","division":"pro","gender_category":"men"},
          "goal_seconds":4080,
          "comparable_best":{"race":{"race_id":1,"name":"HYROX Berlín","location":"Berlín","race_date":"2025-05-16","format":"doubles","division":"pro","gender_category":"men"},"total_seconds":3862,"team_result":true},
          "not_comparable_reason":null,"delta_seconds":218},
         "week":{"visible_count":1,"sessions":[
           {"kind":"run_quality","weekday":0,"run":{"shape":"intervals","reps":5,"distance_m":1000,"duration_s":null,"target_pace_s_per_km":245,"rest_s":120,"stations":[]},"basis":{"source":"carrera","race":{"race_id":1,"name":"HYROX Berlín","location":"Berlín","race_date":"2025-05-16","format":"doubles","division":"pro","gender_category":"men"}}},
           {"kind":"erg","weekday":4,"erg":{"erg":"row","reps":6,"distance_m":500,"target_pace_s_per_500":112,"rest_s":90},"basis":{"source":"carrera","race":null}}]}}
        """)
        let objetivo = try decodifica(AthleteNextRace.self, #"{"name":"HYROX Valencia","format":"doubles","division":"pro","gender_category":"men","days_until":34,"goal_time_seconds":4080}"#)
        let l = LecturaLibre.desde(
            marcas: [], marcasCargadas: true, marcasFallaron: false, carrerasCargadas: true, carrerasImportadas: 3,
            vo2: nil, retrato: retrato, carreraObjetivo: objetivo, semana: nil, hoyIso: EjemplosPlan.hoy)

        let e = try XCTUnwrap(l.evidencia)
        XCTAssertEqual(e.mejorTiempo, FinalDeCarrera(tiempoS: 3862, lugar: "Berlín", cuando: "may 2025", categoria: "dobles pro", equipo: true))
        XCTAssertEqual(e.mejor8km, OchoKm(ritmoSKm: 252, totalS: 2016, lugar: "Berlín", suelo: true))
        XCTAssertEqual(e.ultimo8km?.lugar, "Málaga", "el último es otra carrera: se enseña")
        XCTAssertEqual(e.transiciones, .init(segundos: 331, lugar: "Berlín"))
        XCTAssertNil(e.tendencia)

        guard case let .fijada(carrera) = l.carrera else { return XCTFail("debería haber carrera fijada") }
        XCTAssertEqual(carrera.nombre, "HYROX Valencia")
        XCTAssertEqual(carrera.dias, 34)
        XCTAssertEqual(carrera.objetivo, "1:08:00")
        XCTAssertEqual(carrera.comparacion, .mejor(try XCTUnwrap(e.mejorTiempo), deltaS: 218))
        XCTAssertEqual(carrera.faltan, [], "con carreras la tarjeta ya no pide deberes")

        let w = try XCTUnwrap(l.semanaBloqueada)
        XCTAssertEqual(w.visibles, 1)
        XCTAssertEqual(w.sesiones.map(\.dia), ["LUN", "VIE"])
        XCTAssertEqual(w.sesiones[0].detalle, "5 x 1 km a 4:05/km, 2:00 de recuperación")
        XCTAssertEqual(w.sesiones[1].detalle, "6 x 500 m a 1:52/500m, 1:30 de recuperación", "el ritmo del remo lleva su unidad canónica (contrato §2)")
        XCTAssertEqual(w.base, "Calculado con tus 8 km de Berlín")
    }

    func testElMismoUltimoQueElMejorNoSeEnseñaDosVeces() throws {
        let carrera = #"{"race_id":1,"name":"HYROX Berlín","location":"Berlín","race_date":"2025-05-16","format":"singles","division":"open","gender_category":"men"}"#
        let retrato = try decodifica(FreePlanPayload.self, """
        {"race_evidence":{"races_counted":1,"best_finish":null,
         "best_run":{"race":\(carrera),"total_seconds":2000,"pace_s_per_km":250,"partner_bounded":false},
         "latest_run":{"race":\(carrera),"total_seconds":2000,"pace_s_per_km":250,"partner_bounded":false},
         "best_roxzone":null,"run_trend":null},"goal_check":null,"week":null}
        """)
        let e = try XCTUnwrap(PlanLibreCopy.evidencia(try XCTUnwrap(retrato.raceEvidence)) as EvidenciaDeCarreras?)
        XCTAssertNil(e.ultimo8km)
        XCTAssertNil(PlanLibreCopy.lineaDeProgreso(e))
    }

    func testSinObjetivoYSinCarrerasLaTarjetaNombraLoQueFaltaEnOrdenDeArranque() throws {
        let objetivo = try decodifica(AthleteNextRace.self, #"{"name":"HYROX Barcelona","days_until":68,"goal_time_seconds":4500}"#)
        let catalogo = [try marca("run_5k", "5 km"), try marca("run_1k", "1 km"), try marca("row_500m", "Remo 500 m", erg: "row", medidoPor: "erg")]
        let l = LecturaLibre.desde(
            marcas: catalogo, marcasCargadas: true, marcasFallaron: false, carrerasCargadas: true, carrerasImportadas: 0,
            vo2: nil, retrato: nil, carreraObjetivo: objetivo, semana: nil, hoyIso: EjemplosPlan.hoy)
        guard case let .fijada(c) = l.carrera else { return XCTFail() }
        XCTAssertEqual(c.faltan, ["1 km", "Remo 500 m", "5 km"])
    }
}
