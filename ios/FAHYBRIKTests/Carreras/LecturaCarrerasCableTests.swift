import XCTest
@testable import FAHYBRIK

// DEL CABLE A LA LECTURA — el JSON que el servidor manda de verdad, y lo que la pestaña saca de él.
//
// Aquí se clavan los fallos que el doble encontró en el Swift anterior, uno por uno (un test por cada
// uno, para que no vuelvan):
//   (1) `history` llegaba como `RaceHistoryItem` y se leía como el resumen de la última: cada fila
//       fallaba y la Evolución no se pintaba NUNCA → ahora sale de `past`.
//   (2) un fallo de carga se pintaba como «Sin objetivos todavía» → ahora es un error.
//   (3) la app no decodificaba `field_size`, `distance_meters`, `objective_variant`, `division_label`.
//   (4) la meta y el resultado salían en escalas distintas (1:05:00 / 65:00).
//   (5) las dos notas en prosa del servidor pasan a estructura.
//   (6) «Tune-up» → «Puesta a punto», «Relay» → «Relevos».
// (4) y (6) los fija `FormatoCarrerasTests` y `DecideCarrerasTests`; el resto, aquí.
final class LecturaCarrerasCableTests: XCTestCase {

    private let hoy = "2026-09-29"

    // MARK: JSON del servidor

    private func decode<T: Decodable>(_ tipo: T.Type, _ json: String) throws -> T {
        try APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func upcoming(
        id: Int = 201, name: String = "HYROX Barcelona", date: String? = "2026-11-07",
        eventType: String = "hyrox", format: String = "singles", priority: String? = "target", goal: Int? = 3900,
        extra: String = ""
    ) -> String {
        """
        {"race_id": \(id), "event_id": 5, "name": "\(name)", "event_type": "\(eventType)", "format": "\(format)",
         "division": "open", "gender_category": "men", "age_group": null,
         "race_date": \(date.map { "\"\($0)\"" } ?? "null"), "location": "Fira de Barcelona",
         "goal_time_seconds": \(goal.map(String.init) ?? "null"), "days_until": 39,
         "priority": \(priority.map { "\"\($0)\"" } ?? "null")\(extra)}
        """
    }

    private func past(id: Int, date: String, resultado: Int?, format: String = "singles", partners: String = "[]", puesto: Int? = 412, campo: Int? = 1180) -> String {
        """
        {"race_id": \(id), "name": "HYROX Valencia", "race_date": "\(date)", "event_type": "hyrox", "format": "\(format)",
         "division": "open", "gender_category": "men", "age_group": null,
         "result_time_seconds": \(resultado.map(String.init) ?? "null"), "run_total_seconds": \(resultado == nil ? "null" : "2170"),
         "roxzone_seconds": \(resultado == nil ? "null" : "280"), "best_run_lap_seconds": 252,
         "overall_rank": \(puesto.map(String.init) ?? "null"), "age_group_rank": 50, "field_size": \(campo.map(String.init) ?? "null"),
         "run_splits": [252, 258, 262, 268, 271, 279, 286, 0],
         "station_splits": [{"index": 1, "seconds": 300, "rank": null}, {"index": 2, "seconds": 232, "rank": 10}, {"index": 4, "seconds": 0, "rank": null}],
         "partners": \(partners)}
        """
    }

    private func hub(upcoming: [String], past: [String]) throws -> RacesHubResponse {
        try decode(RacesHubResponse.self, "{\"upcoming\": [\(upcoming.joined(separator: ","))], \"past\": [\(past.joined(separator: ","))]}")
    }

    /// El overview tal como lo manda `buildCarrerasOverview`: con `history` en forma de `RaceHistoryItem`,
    /// que la app anterior leía como otra cosa y por eso nunca pintaba la evolución.
    private let overviewJSON = """
    {
      "last_race": {"id": "105", "event_name": "HYROX Valencia", "date": "2026-05-16", "division": "Open",
                    "total_time": "1:06:52", "run_time": "36:10", "stations_time": "26:02", "roxzone_time": "4:40",
                    "standing_label": "Top 35 %", "delta_vs_previous": "−2:34", "total_seconds": 4012},
      "ia_report": {"summary": "Trabaja el tirón.", "recommended_groups": ["G03 · Ergómetros"]},
      "station_benchmarks": [
        {"id": "station_2", "station": "SkiErg 1km", "time": "3:52", "delta": "+0:05", "fraction": 0.38, "severity": "slightly_worse"},
        {"id": "station_4", "station": "Sled push", "time": "2:48", "delta": "−0:06", "fraction": 0.22, "severity": "better"},
        {"id": "station_6", "station": "Sled pull", "time": "3:51", "delta": null, "fraction": null, "severity": null}
      ],
      "station_comparison_note": null,
      "running_splits": [
        {"id": "k1", "label": "k1", "pace": "4:12", "height": 0.857, "severity": "better"},
        {"id": "k2", "label": "k2", "pace": "4:54", "height": 1, "severity": "worse"}
      ],
      "pace_drop_note": "Caída de ritmo en la segunda mitad (+23s/km)",
      "history": [
        {"race_id": 103, "name": "HYROX Barcelona", "race_date": "2025-11-02", "location": null, "event_type": "hyrox",
         "format": "singles", "division": "open", "gender_category": "men", "age_group": null,
         "result_time_seconds": 4166, "run_total_seconds": 2216, "roxzone_seconds": 288, "best_run_lap_seconds": 256,
         "overall_rank": 502, "age_group_rank": null, "field_size": 1204, "percentile": 0.42,
         "run_splits": [], "station_splits": [], "is_team_result": false, "partners": [], "source": "hyresult_import", "source_season": null}
      ]
    }
    """

    private func lectura(
        hub: RacesHubResponse?, overview: CarrerasOverview? = nil,
        cargaHub: CargaCarreras = .lista, cargaAnalisis: CargaCarreras = .lista,
        predicho: LecturaDePredicho? = nil, revision: PredictionReview? = nil,
        conCoach: Bool = true, noLeidos: Int = 0
    ) -> LecturaCarreras {
        LecturaCarreras.desde(
            hub: hub, cargaHub: cargaHub, overview: overview, cargaAnalisis: cargaAnalisis,
            predicho: predicho, revision: revision, conCoach: conCoach, noLeidosChat: noLeidos, hoy: hoy
        )
    }

    // MARK: (1) history del análisis: ya no rompe nada, y la evolución sale de `past`

    func testElOverviewConHistoryEnFormaDeRaceHistoryItemDecodifica() throws {
        let overview = try decode(CarrerasOverview.self, overviewJSON)
        XCTAssertEqual(overview.last_race?.id, "105")
        XCTAssertEqual(overview.station_benchmarks.count, 3)
        XCTAssertEqual(overview.running_splits.count, 2)
        XCTAssertNotNil(overview.ia_report)
    }

    func testLaEvolucionSaleDeLasPasadasDelHub() throws {
        let h = try hub(upcoming: [], past: [
            past(id: 101, date: "2024-11-09", resultado: 4390),
            past(id: 102, date: "2025-03-08", resultado: 4268),
            past(id: 103, date: "2025-11-02", resultado: 4166),
        ])
        let l = lectura(hub: h, overview: try decode(CarrerasOverview.self, overviewJSON))
        XCTAssertEqual(DecideCarreras.evolucion(l.pasadas)?.map(\.totalS), [4390, 4268, 4166])
    }

    // MARK: (2) un fallo de carga es un error, no un vacío

    func testUnaRebanadaSinNadaGuardadoYConFalloEsUnError() throws {
        var hubSlice = Slice<RacesHubResponse>()
        XCTAssertEqual(CargaCarreras(hubSlice), .fria)
        hubSlice.loadFailed = true
        XCTAssertEqual(CargaCarreras(hubSlice), .error)
        hubSlice.setLoaded(try hub(upcoming: [], past: []))
        XCTAssertEqual(CargaCarreras(hubSlice), .lista)
        // Ya cargada, un fallo posterior NO tumba lo que se ve: hay caché.
        hubSlice.loadFailed = true
        XCTAssertEqual(CargaCarreras(hubSlice), .lista)
    }

    func testConErrorDeCargaElSujetoEsElErrorNoLaInvitacion() {
        let l = lectura(hub: nil, cargaHub: .error, cargaAnalisis: .error)
        XCTAssertEqual(DecideCarreras.sujeto(l).tipo, .error)
        XCTAssertEqual(DecideCarreras.sujeto(lectura(hub: nil, cargaHub: .fria, cargaAnalisis: .fria)).tipo, .cargando)
    }

    // MARK: (3) lo que la app no decodificaba

    func testSeDecodificaElCampoYLoQueSeEligioAlFijar() throws {
        let h = try hub(
            upcoming: [upcoming(extra: #", "objective_variant": "legend", "division_label": "RX", "distance_meters": 21100, "homologada": true"#)],
            past: [past(id: 105, date: "2026-05-16", resultado: 4012)]
        )
        let u = h.upcoming[0]
        XCTAssertEqual(u.objectiveVariant, "legend")
        XCTAssertEqual(u.divisionLabel, "RX")
        XCTAssertEqual(u.distanceMeters, 21100)
        XCTAssertEqual(u.homologada, true)
        XCTAssertEqual(h.past[0].field_size, 1180)
        // …y el puesto llega con su «de cuántos».
        XCTAssertEqual(lectura(hub: h).pasadas[0].campo, 1180)
        XCTAssertEqual(lectura(hub: h).pasadas[0].puesto, 412)
    }

    func testUnaCopiaAntiguaSinLosCamposNuevosSigueLeyendose() throws {
        let h = try hub(upcoming: [upcoming()], past: [])
        XCTAssertNil(h.upcoming[0].objectiveVariant)
        XCTAssertNil(h.upcoming[0].homologada)
        // El almacén guarda con el codificador simple (sin conversión de claves): la vuelta es la misma.
        let ida = try JSONEncoder().encode(h.upcoming[0])
        XCTAssertEqual(try JSONDecoder().decode(UpcomingRace.self, from: ida), h.upcoming[0])
    }

    // MARK: (5) las notas en prosa pasan a estructura

    func testElAnalisisTraeLaCaidaDeRitmoYLasEstacionesEnSegundos() throws {
        let overview = try decode(CarrerasOverview.self, overviewJSON)
        let a = AnalisisCarrera(overview, revision: nil, conCoach: true)!
        XCTAssertEqual(a.raceId, 105)
        XCTAssertEqual(a.caidaRitmoS, 23)
        XCTAssertEqual(a.estaciones.map(\.tiempoS), [232, 168, 231])
        XCTAssertEqual(a.estaciones.map(\.deltaS), [5, -6, nil])
        XCTAssertEqual(a.estaciones.map(\.severidad), [.slightlyWorse, .better, nil])
        XCTAssertEqual(a.estaciones[2].fraccion, nil)
        XCTAssertEqual(a.ritmoPorKm.map(\.ritmoS), [252, 294])
        XCTAssertEqual(a.ritmoPorKm.map(\.km), [1, 2])
        XCTAssertEqual(a.fecha, "2026-05-16")
        XCTAssertEqual(a.informe?.grupos, ["G03 · Ergómetros"])
    }

    func testSinCoachNoHayInformeDeLaIA() throws {
        let overview = try decode(CarrerasOverview.self, overviewJSON)
        XCTAssertNil(AnalisisCarrera(overview, revision: nil, conCoach: false)!.informe)
    }

    func testSinFechaConocidaElAnalisisNoInventaUna() throws {
        var json = overviewJSON
        json = json.replacingOccurrences(of: #""date": "2026-05-16""#, with: #""date": "Fecha por confirmar""#)
        let a = AnalisisCarrera(try decode(CarrerasOverview.self, json), revision: nil, conCoach: true)!
        XCTAssertNil(a.fecha)
    }

    func testSinUltimaCarreraNoHayAnalisis() throws {
        let json = #"{"last_race": null, "ia_report": null, "station_benchmarks": [], "running_splits": [], "pace_drop_note": null}"#
        XCTAssertNil(AnalisisCarrera(try decode(CarrerasOverview.self, json), revision: nil, conCoach: true))
    }

    func testLaPuertaDePredichoVsRealSoloExisteConUnaRevisionOk() throws {
        let overview = try decode(CarrerasOverview.self, overviewJSON)
        let ok = try decode(PredictionReview.self, #"{"availability": "ok", "predicted_total_s": 4050, "actual_total_s": 4012, "accuracy_pct": 99, "accuracy_label_es": "clavado", "segments": []}"#)
        let sin = try decode(PredictionReview.self, #"{"availability": "no_snapshot", "segments": []}"#)
        XCTAssertEqual(AnalisisCarrera(overview, revision: ok, conCoach: true)?.predichoVsReal, PredichoVsReal(predijimosS: 4050, hicisteS: 4012, precisionPct: 99, precisionPalabra: "clavado"))
        XCTAssertNil(AnalisisCarrera(overview, revision: sin, conCoach: true)?.predichoVsReal)
        XCTAssertNil(AnalisisCarrera(overview, revision: nil, conCoach: true)?.predichoVsReal)
    }

    // MARK: Las carreras del hub

    func testLaCuentaAtrasSeMideContraElHoyDelAtletaNoContraLoGuardado() throws {
        // El `days_until` guardado dice 39; hoy (29-sep) a la carrera del 7-nov le quedan 39. Con otra fecha la cuenta cambia.
        let h = try hub(upcoming: [upcoming(date: "2026-10-09")], past: [])
        XCTAssertEqual(lectura(hub: h).proximas[0].diasHasta, 10)
    }

    func testUnObjetivoVencidoBajaAPasadasSinResultadoYNuncaCaeEntreLasDos() throws {
        let h = try hub(upcoming: [upcoming(id: 300, name: "HYROX Ayer", date: "2026-09-28", priority: "secondary"), upcoming(id: 201)], past: [])
        let l = lectura(hub: h)
        XCTAssertEqual(l.proximas.map(\.raceId), [201])
        XCTAssertEqual(l.pasadas.map(\.raceId), [300])
        XCTAssertNil(l.pasadas[0].resultadoS)
        // …y con ella la carrera de ayer sin resultado pasa a ser lo primero que se le pide.
        guard case .postcarrera(let carrera, let dias) = DecideCarreras.sujeto(l) else { return XCTFail() }
        XCTAssertEqual(carrera.raceId, 300)
        XCTAssertEqual(dias, 1)
    }

    func testUnaCarreraSinFechaSeQuedaEnProximasSinCuentaAtras() throws {
        let h = try hub(upcoming: [upcoming(date: nil)], past: [])
        let c = lectura(hub: h).proximas[0]
        XCTAssertNil(c.fecha)
        XCTAssertNil(c.diasHasta)
    }

    func testLosParcialesEnCeroNoSonParciales() throws {
        let h = try hub(upcoming: [], past: [past(id: 105, date: "2026-05-16", resultado: 4012)])
        let c = lectura(hub: h).pasadas[0]
        // La octava vuelta llegó en 0 (la importación no la trajo): es nil y no ocupa celda.
        XCTAssertEqual(c.vueltas.last, .some(nil))
        XCTAssertEqual(c.vueltas.compactMap { $0 }.count, 7)
        // Solo las estaciones de trabajo (índices pares), y el 0 es «sin dato».
        XCTAssertEqual(c.estaciones.map(\.indice), [2, 4])
        XCTAssertEqual(c.estaciones.map(\.segundos), [232, nil])
    }

    func testUnaCarreraPendienteNoLlevaResultadoNiParciales() throws {
        let h = try hub(upcoming: [], past: [past(id: 106, date: "2026-09-20", resultado: nil, puesto: nil, campo: nil)])
        let c = lectura(hub: h).pasadas[0]
        XCTAssertNil(c.resultadoS)
        XCTAssertNil(c.correrS)
        XCTAssertNil(c.puesto)
    }

    func testElEquipoDeUnaCarreraDeDoblesSeOrdenaPorPosicion() throws {
        let socios = #"[{"position": 2, "name": "Joan", "slug": null, "nation": null}, {"position": 1, "name": "Aina", "slug": null, "nation": null}]"#
        let h = try hub(upcoming: [], past: [past(id: 104, date: "2026-02-14", resultado: 3745, format: "doubles", partners: socios)])
        let c = lectura(hub: h).pasadas[0]
        XCTAssertEqual(c.formato, .dobles)
        XCTAssertEqual(DecideCarreras.textoEquipo(c.companeros), "con Aina y Joan")
    }

    func testSinCoachNoHayGloboDeChatAunqueElStoreGuardeUnNumero() throws {
        let h = try hub(upcoming: [upcoming()], past: [])
        XCTAssertEqual(lectura(hub: h, conCoach: false, noLeidos: 3).noLeidosChat, 0)
        XCTAssertEqual(lectura(hub: h, conCoach: true, noLeidos: 3).noLeidosChat, 3)
        XCTAssertEqual(lectura(hub: h, conCoach: true, noLeidos: -2).noLeidosChat, 0)
    }

    func testMientrasElAnalisisNoEstaListoNoSePintaNadaDeEl() throws {
        let h = try hub(upcoming: [], past: [past(id: 105, date: "2026-05-16", resultado: 4012)])
        let overview = try decode(CarrerasOverview.self, overviewJSON)
        XCTAssertNil(lectura(hub: h, overview: overview, cargaAnalisis: .fria).analisis)
        XCTAssertNil(lectura(hub: h, overview: overview, cargaAnalisis: .error).analisis)
        XCTAssertNotNil(lectura(hub: h, overview: overview, cargaAnalisis: .lista).analisis)
    }

    // MARK: El predicho del principal

    private func principal(tipo: TipoEventoCarrera = .hyrox, formato: FormatoCarrera = .individual, meta: Int? = 3900) -> ProximaCarrera {
        CasosCarreras.proxima(201, "HYROX Barcelona", 39, tipoEvento: tipo, formato: formato, metaS: meta)
    }

    private func goalGap(_ json: String) throws -> GoalGap { try decode(GoalGap.self, json) }

    func testSinPrincipalNoHayPredicho() {
        XCTAssertEqual(PrediccionCarrera.desde(principal: nil, lectura: nil), .noAplica)
    }

    func testUnaCarreraQueNoEsHyroxNoTienePredichoNiSePide() {
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(tipo: .otro), lectura: nil), .noAplica)
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(tipo: .otro, meta: nil), lectura: nil), .sinMeta)
    }

    func testSinTiempoObjetivoEsSinMetaSinPedirNada() {
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(meta: nil), lectura: .pidiendo), .sinMeta)
    }

    func testPidiendoEsCargandoYFallandoEsError() {
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(), lectura: nil), .cargando)
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(), lectura: .pidiendo), .cargando)
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(), lectura: .fallo), .error)
    }

    func testElPredichoCompletoEsUnaCifraConSuHueco() throws {
        let gap = try goalGap(#"{"availability": "ok", "predicted_total_s": 3790, "gap_s": -110, "segments": []}"#)
        XCTAssertEqual(PrediccionCarrera.desde(principal: principal(), lectura: .individual(gap)), .cifra(totalS: 3790, huecoS: -110, pareja: nil))
    }

    /// «Ningún hueco se cobra al objetivo»: con tramos sin dato el total es nulo y NO hay cifra: hay
    /// los tramos que faltan, por su nombre.
    func testConTramosSinDatoNoHayCifraHayLosQueFaltan() throws {
        let gap = try goalGap("""
        {"availability": "ok", "predicted_total_s": null, "gap_s": null, "segments": [
          {"slug": "run", "label_es": "Carrera · 8 km", "kind": "run", "budget_s": 2200, "predicted_s": null, "tier": "sin_datos", "delta_s": null},
          {"slug": "sled", "label_es": "Sled push", "kind": "station", "budget_s": 170, "predicted_s": 175, "tier": "observado", "delta_s": 5},
          {"slug": "rox", "label_es": "RoxZone", "kind": "roxzone", "budget_s": 300, "predicted_s": null, "tier": "sin_datos", "delta_s": null}
        ]}
        """)
        XCTAssertEqual(
            PrediccionCarrera.desde(principal: principal(), lectura: .individual(gap)),
            .parcial(medidos: 1, de: 3, faltan: ["Carrera · 8 km", "RoxZone"], pareja: nil)
        )
    }

    func testLosMotivosDelServidorSeDeclaran() throws {
        func desde(_ availability: String) throws -> PrediccionCarrera {
            PrediccionCarrera.desde(principal: principal(), lectura: .individual(try goalGap(#"{"availability": "\#(availability)", "segments": []}"#)))
        }
        XCTAssertEqual(try desde("no_goal"), .sinMeta)
        XCTAssertEqual(try desde("no_data"), .sinDatos(pareja: nil))
        XCTAssertEqual(try desde("no_target_race"), .noAplica)
        // Un valor que la app no conoce y sin total: sin datos, nunca un número inventado.
        XCTAssertEqual(try desde("algo_nuevo"), .sinDatos(pareja: nil))
    }

    func testEnDoblesElPredichoEsConjuntoYSinParejaLaSalida() throws {
        func dobles(_ json: String) throws -> PrediccionCarrera {
            PrediccionCarrera.desde(principal: principal(formato: .dobles), lectura: .pareja(try decode(DoblesRaceGap.self, json)))
        }
        XCTAssertEqual(try dobles(#"{"availability": "no_pair", "race_name": "X"}"#), .sinPareja)
        XCTAssertEqual(try dobles(#"{"availability": "no_data", "race_name": "X", "partner_name": "Aina"}"#), .sinDatos(pareja: "Aina"))
        XCTAssertEqual(
            try dobles(#"{"availability": "ok", "race_name": "X", "partner_name": "Aina", "goal_s": 3660, "predicted_total_s": 3702, "gap_s": 42}"#),
            .cifra(totalS: 3702, huecoS: 42, pareja: "Aina")
        )
    }

    // MARK: El predicho de HYROX pide en el orden que dice la lectura

    func testLaLecturaEntera() throws {
        let h = try hub(upcoming: [upcoming()], past: [past(id: 105, date: "2026-05-16", resultado: 4012)])
        let gap = try goalGap(#"{"availability": "ok", "predicted_total_s": 3790, "gap_s": -110, "segments": []}"#)
        let l = lectura(hub: h, overview: try decode(CarrerasOverview.self, overviewJSON), predicho: .individual(gap), noLeidos: 1)
        XCTAssertEqual(l.prediccion, .cifra(totalS: 3790, huecoS: -110, pareja: nil))
        XCTAssertEqual(l.proximas[0].metaS, 3900)
        XCTAssertEqual(l.proximas[0].tipoEvento, .hyrox)
        XCTAssertEqual(l.noLeidosChat, 1)
        XCTAssertEqual(DecideCarreras.sujeto(l).tipo, .objetivo)
        XCTAssertEqual(CasosCarreras.problemasDeLectura(l), [])
    }

    // MARK: El historial local al importar y al deshacer

    private func importada(_ id: Int, _ resultado: Int?) throws -> ImportedRace {
        try decode(ImportedRace.self, past(id: id, date: "2026-01-01", resultado: resultado))
    }

    func testImportarEsUnUpsertPorCarreraNoDuplicaNiBorraLoQueNoMenciona() throws {
        let vencida = try importada(900, nil)
        let vieja = try importada(105, 4100)
        let nueva = try importada(105, 4012)
        let otra = try importada(103, 4166)
        let r = AccionesCarreras.unirPorId([vencida, vieja], [nueva, otra])
        XCTAssertEqual(r.map(\.race_id).sorted(), [103, 105, 900])
        XCTAssertEqual(r.first { $0.race_id == 105 }?.result_time_seconds, 4012)
    }

    func testNoSoyYoBorraLoImportadoYDejaLosObjetivosVencidosSinResultado() throws {
        let r = AccionesCarreras.sinImportadas([try importada(900, nil), try importada(105, 4012), try importada(103, 4166)])
        XCTAssertEqual(r.map(\.race_id), [900])
    }

    @MainActor
    func testElStoreAplicaLasDosReglas() throws {
        let store = AppDataStore()
        store.applyImportedRaces([try importada(105, 4012)])
        store.applyImportedRaces([try importada(105, 4012), try importada(103, 4166)])
        XCTAssertEqual(store.racesHub.value?.past.count, 2)
        store.removeImportedRaces()
        XCTAssertEqual(store.racesHub.value?.past.count, 0)
    }
}
