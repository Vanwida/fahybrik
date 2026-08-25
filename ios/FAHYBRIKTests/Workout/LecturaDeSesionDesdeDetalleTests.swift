import XCTest
@testable import FAHYBRIK

// EL DECODIFICADOR, PROBADO CONTRA LA FORMA REAL DEL CABLE — mismo estilo que
// `LecturaDeCarreraDesdeDetalleTests`: JSON con las claves exactas de
// `GET /api/athlete/assignments/{id}/detail`, decodificado con
// `convertFromSnakeCase`.
final class LecturaDeSesionDesdeDetalleTests: XCTestCase {

    private func decodifica(_ json: String) throws -> AssignmentDetail {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    // MARK: - EL ENTRENO DEL 20-AGO: Fuerza B + Trineos, real, tal y como lo dio Alex

    /// Ocho tramos, dos de correr SIN metros (la cinta no llegó a conectarse),
    /// sin carga de hierro logueada esa sesión. Es el caso que prueba la regla
    /// de la card 124 al límite: ni un solo bloque de fuerza trae peso, así que
    /// ni el volumen ni la distancia ni el ritmo pueden aparecer — no porque el
    /// decodificador los calle, sino porque el cable no trajo nada que enseñar.
    private func fuerzaBMasTrineos() -> String {
        """
        {
          "assignment": {"id": "481", "athlete_id": "64", "scheduled_for": "2026-08-20",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Fuerza B + Trineos", "blocks": []},
          "execution": {
            "execution_id": "2438", "started_at": "2026-08-20 11:49:53+00",
            "ended_at": "2026-08-20 12:36:55+00", "total_duration_seconds": 2822,
            "completeness": "completed", "contributing_sources": [],
            "perceived_exertion": 10, "perceived_difficulty": "as_expected",
            "segments": [
              {"position": 0, "item_uid": null, "modality": "run",
               "duration_seconds": 360},
              {"position": 1, "item_uid": null, "modality": "run",
               "duration_seconds": 357, "avg_hr": 139},
              {"position": 2, "item_uid": "s-pm", "modality": "strength",
               "duration_seconds": 669, "avg_hr": 128},
              {"position": 3, "item_uid": "s-pmr", "modality": "strength",
               "duration_seconds": 426, "avg_hr": 113},
              {"position": 4, "item_uid": "s-remo", "modality": "strength",
               "avg_hr": 112},
              {"position": 5, "item_uid": null, "modality": "strength",
               "avg_hr": 115},
              {"position": 6, "item_uid": "s-trineo", "modality": "other",
               "duration_seconds": 260, "avg_hr": 121},
              {"position": 7, "item_uid": "s-trineo", "modality": "other",
               "avg_hr": 107}
            ]
          }
        }
        """
    }

    func testElDesgloseTraeLosOchoTramosEnOrden() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertEqual(sesion.bloques.count, 8)
        XCTAssertEqual(sesion.bloques.map(\.modalidad), [
            .correr, .correr, .fuerza, .fuerza, .fuerza, .fuerza, .funcional, .funcional,
        ])
        XCTAssertEqual(sesion.duracionTotalS, 2822)
        XCTAssertEqual(sesion.completitud, .completa)
    }

    /// SIN METROS EN NINGÚN TRAMO DE CORRER — no hay distancia total, y por
    /// tanto tampoco ritmo: ni en el desglose ni en los totales.
    func testSinMetrosDeCorrerNoHayDistanciaNiRitmo() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))

        let correr = sesion.bloques.filter { $0.modalidad == .correr }
        XCTAssertEqual(correr.count, 2)
        XCTAssertTrue(correr.allSatisfy { $0.distanciaM == nil }, "sin cinta conectada no hay metros")
        XCTAssertTrue(correr.allSatisfy { $0.ritmoDeCorrerSkm == nil })

        XCTAssertNil(distanciaTotalDeSesion(sesion.bloques))
        XCTAssertNil(ritmoMedioDeCorrer(sesion.bloques))
    }

    /// SIN CARGA DE HIERRO LOGUEADA, el volumen no existe — no se inventa un
    /// tonelaje sobre reps sin peso.
    func testSinCargaLogueadaNoHayResultadoDeVolumen() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertNil(sesion.resultado, "sin kg en ningún bloque no hay volumen que enseñar")
    }

    /// EL TIPO: fuerza + trineos + un rodaje de calentamiento, SIN estructura de
    /// reloj/tanda — es la mezcla libre que abrió la card 118, nunca HYROX.
    func testElTipoEsMixtoNoHyrox() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertEqual(sesion.tipo, .mixto)
    }

    /// LA VENTANA HORARIA sale de `started_at`/`ended_at` reales — los dos
    /// presentes, o ninguno: nunca se completa un extremo sumando la duración.
    func testLaVentanaHorariaSaleDeLosDosInstantesReales() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertNotNil(sesion.horaInicio)
        XCTAssertNotNil(sesion.horaFin)
    }

    /// SIN `started_at` — un registro más viejo — no hay ventana horaria: nunca
    /// se inventa un extremo.
    func testSinInstantesNoHayVentanaHoraria() throws {
        let sinInstantes = fuerzaBMasTrineos()
            .replacingOccurrences(of: "\"started_at\": \"2026-08-20 11:49:53+00\",", with: "")
            .replacingOccurrences(of: "\"ended_at\": \"2026-08-20 12:36:55+00\",", with: "")
        let detalle = try decodifica(sinInstantes)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertNil(sesion.horaInicio)
        XCTAssertNil(sesion.horaFin)
    }

    /// FC MEDIA / MÁXIMA / CALORÍAS DE LA SESIÓN — nil hoy (el servidor todavía
    /// no las calcula para lo grabado con la app), y por tanto ni gráfica de
    /// pulso ni recuadros de FC: nunca derivados aquí de los segmentos.
    func testSinTotalesDeServidorNoHayRecuadrosDeFcNiGrafica() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertNil(sesion.fcMediaPpm)
        XCTAssertNil(sesion.fcMaxPpm)
        XCTAssertNil(sesion.kcal)
        XCTAssertTrue(sesion.pulso.isEmpty, "sin traza archivada no hay curva que dibujar")
    }

    /// CUANDO EL SERVIDOR SÍ LOS MANDA, se leen tal cual — nunca recalculados.
    func testConTotalesDeServidorSeLeenTalCual() throws {
        let conTotales = fuerzaBMasTrineos().replacingOccurrences(
            of: "\"perceived_exertion\": 10,",
            with: "\"perceived_exertion\": 10, \"avg_hr\": 115, \"max_hr\": 149, \"total_calories\": 420,"
        )
        let detalle = try decodifica(conTotales)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertEqual(sesion.fcMediaPpm, 115)
        XCTAssertEqual(sesion.fcMaxPpm, 149)
        XCTAssertEqual(sesion.kcal, 420)
    }

    /// LO QUE DIJO EL ATLETA — el esfuerzo y la dificultad llegan tal cual.
    func testLoQueDijoElAtleta() throws {
        let detalle = try decodifica(fuerzaBMasTrineos())
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertEqual(sesion.rpe, 10)
        XCTAssertEqual(sesion.dificultadLabel, "Como debía")
        XCTAssertNil(sesion.molestiaLabel, "sin molestia declarada no hay nada que enseñar")
    }

    // MARK: - La etiqueta: el nombre del ítem del plan, o una voz genérica

    func testLaEtiquetaSaleDelItemDelPlanCuandoCasa() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "1", "scheduled_for": "2026-08-20",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Fuerza", "blocks": [
            {"uid": "b1", "title": "Principal", "format": "straight_sets",
             "block_position": 1, "config_json": {}, "items": [
               {"uid": "s-pm", "exercise_id": "e1", "exercise_name": "Peso muerto",
                "exercise_slug": "peso-muerto", "exercise_category": "strength",
                "params_json": {}}
             ]}
          ]},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": "s-pm", "modality": "strength",
               "duration_seconds": 669, "reps_completed": 15, "weight_used_kg": 100}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertEqual(sesion.bloques.first?.etiqueta, "Peso muerto")
        XCTAssertEqual(sesion.bloques.first?.repsTotal, 15)
        XCTAssertEqual(sesion.bloques.first?.kg, 100)

        // Y CON CARGA, el volumen SÍ existe — mismo cable, otra sesión.
        guard case .fuerza(let volumenKg, let masPesada) = sesion.resultado else {
            return XCTFail("con carga logueada el resultado tenía que ser el volumen")
        }
        XCTAssertEqual(volumenKg, 1500)
        XCTAssertEqual(masPesada?.etiqueta, "Peso muerto")
    }

    func testUnErgometroSinItemCasadoUsaSuMaquina() {
        let sinItem = SegmentActualDTO(
            position: 0, itemUid: nil, modality: "ski", durationSeconds: 115,
            repsCompleted: nil, weightUsedKg: nil, distanceMeters: 500,
            avgPaceSPer500m: nil, avgPaceSPerKm: nil, avgPowerW: nil, strokeRateSpm: nil,
            avgHr: 158, maxHr: nil, calories: nil, inclinePct: nil, runCadenceSpm: nil,
            avgGradientPct: nil, startedAt: nil, legIndex: nil, legRole: nil,
            legPhase: nil, source: nil, emomRoundsCompleted: nil,
            emomRoundsPrescribed: nil, zoneSeconds: nil, dragFactor: nil,
            avgCaloriesPerHour: nil, peakDriveForceLbs: nil, avgDriveForceLbs: nil,
            ergSplits: nil
        )
        let bloque = LecturaDeSesionDesdeDetalle.bloqueDe(sinItem, itemsPorUid: [:])
        XCTAssertEqual(bloque?.etiqueta, "SkiErg")
        XCTAssertEqual(bloque?.modalidad, .ergometro(.ski))
        XCTAssertEqual(bloque?.distanciaM, 500)
    }

    // MARK: - EMOM: las dos cifras estructuradas, o ninguna

    func testEmomConLasDosCifrasDaElResultado() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "1", "scheduled_for": "2026-08-20",
                         "status": "completed", "store_results": []},
          "workout": {"name": "EMOM", "blocks": []},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": null, "modality": "other",
               "duration_seconds": 600, "emom_rounds_completed": 10,
               "emom_rounds_prescribed": 12}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        guard case .emom(let completadas, let prescritas) = sesion.resultado else {
            return XCTFail("con las dos cifras del EMOM, el resultado tenía que ser EMOM")
        }
        XCTAssertEqual(completadas, 10)
        XCTAssertEqual(prescritas, 12)
    }

    /// SOLO CON LAS COMPLETADAS —sin la prescrita— no hay resultado: «7 de ?»
    /// no es una lectura.
    func testEmomSinLaCifraPrescritaNoDaResultado() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "1", "scheduled_for": "2026-08-20",
                         "status": "completed", "store_results": []},
          "workout": {"name": "EMOM", "blocks": []},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": null, "modality": "other",
               "duration_seconds": 600, "emom_rounds_completed": 10}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertNil(sesion.resultado)
    }

    // MARK: - Card 144: el recap se llena con la ejecución, no con la receta

    /// 3:39 corridos y 5:45 pedidos: el desglose enseña 3:39 y 3:39/km.
    func testElRecapEnseñaLoCorridoNoLoPedido() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "64", "scheduled_for": "2026-08-25",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Cinta", "blocks": []},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 345, "distance_meters": 1000, "avg_pace_s_per_km": 219}
            ],
            "recap": {
              "blocks": [
                {"position": 0, "label": "Correr", "kind": "run", "modality": "run",
                 "duration_s": 219, "distance_m": 1000, "pace_s_per_km": 219,
                 "pace_s_per_500m": null, "reps": null, "load_kg": null,
                 "sets": [], "round": null}
              ]
            }
          }
        }
        """
        let detalle = try decodifica(json)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        XCTAssertEqual(sesion.bloques.count, 1)
        let bloque = try XCTUnwrap(sesion.bloques.first)
        XCTAssertEqual(bloque.etiqueta, "Correr")
        XCTAssertEqual(bloque.duracionS, 219)
        XCTAssertEqual(bloque.distanciaM, 1000)
        XCTAssertEqual(bloque.ritmoDeCorrerSkm, 219)
        XCTAssertNotEqual(bloque.duracionS, 345)
        XCTAssertNotEqual(bloque.ritmoDeCorrerSkm, 345)
        XCTAssertEqual(sesion.recap?.blocks.count, 1)
        XCTAssertNil(RecapLayout.projectSeriesSticker(try XCTUnwrap(sesion.recap)))
    }

    func testElRecapLlenoSeRecortaEnLaPegatinaDeSeries() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "64", "scheduled_for": "2026-08-25",
                         "status": "completed", "store_results": []},
          "workout": {"name": "VO2max + estaciones", "blocks": []},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [],
            "recap": {
              "blocks": [
                {"position": 0, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 88, "distance_m": 400, "pace_s_per_km": 220, "sets": []},
                {"position": 1, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 87, "distance_m": 400, "pace_s_per_km": 217, "sets": []},
                {"position": 2, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 87, "distance_m": 400, "pace_s_per_km": 217, "sets": []},
                {"position": 3, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 86, "distance_m": 400, "pace_s_per_km": 215, "sets": []},
                {"position": 4, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 86, "distance_m": 400, "pace_s_per_km": 215, "sets": []},
                {"position": 5, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 85, "distance_m": 400, "pace_s_per_km": 212, "sets": []},
                {"position": 6, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 85, "distance_m": 400, "pace_s_per_km": 212, "sets": []},
                {"position": 7, "label": "VO2max", "kind": "run", "modality": "run",
                 "duration_s": 82, "distance_m": 400, "pace_s_per_km": 205, "sets": []},
                {"position": 8, "label": "Sled push", "kind": "station", "modality": "other",
                 "duration_s": 42, "distance_m": 50, "sets": []},
                {"position": 9, "label": "Lunges", "kind": "station", "modality": "other",
                 "duration_s": 95, "distance_m": 100, "sets": []}
              ]
            }
          }
        }
        """
        let detalle = try decodifica(json)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        let recap = try XCTUnwrap(sesion.recap)
        let sticker = try XCTUnwrap(RecapLayout.projectSeriesSticker(recap))
        XCTAssertEqual(sticker.label, "VO2max")
        XCTAssertEqual(sticker.pauta, "400 m")
        XCTAssertEqual(sticker.splits.map(\.durationS), [88, 87, 87, 86, 86, 85, 85, 82].map(Optional.some))
        XCTAssertEqual(sticker.splits.map(\.paceSPerKm), [220, 217, 217, 215, 215, 212, 212, 205].map(Optional.some))
        XCTAssertEqual(sticker.splits.last?.isBest, true)
        XCTAssertEqual(sesion.bloques.map(\.etiqueta), [
            "VO2max", "VO2max", "VO2max", "VO2max",
            "VO2max", "VO2max", "VO2max", "VO2max",
            "Sled push", "Lunges",
        ])
    }

    func testElRecapTraeSeriesYRonda() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "64", "scheduled_for": "2026-08-25",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Fuerza", "blocks": []},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [],
            "recap": {
              "blocks": [
                {"position": 0, "label": "Peso muerto", "kind": "strength",
                 "modality": "strength", "reps": 15, "load_kg": 100,
                 "sets": [
                   {"set_index": 1, "reps": 5, "load_kg": 80, "is_approach": true},
                   {"set_index": 2, "reps": 5, "load_kg": 100, "is_approach": false},
                   {"set_index": 3, "reps": 5, "load_kg": 100, "is_approach": false}
                 ],
                 "round": 1}
              ]
            }
          }
        }
        """
        let detalle = try decodifica(json)
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: detalle))
        let bloque = try XCTUnwrap(sesion.bloques.first)
        XCTAssertEqual(bloque.etiqueta, "Peso muerto")
        XCTAssertEqual(bloque.ronda, 1)
        XCTAssertEqual(bloque.series.count, 3)
        XCTAssertEqual(bloque.series.first?.isApproach, true)
        XCTAssertEqual(bloque.series.last?.kg, 100)
        guard case .fuerza(let volumen, _) = sesion.resultado else {
            return XCTFail("con series de trabajo el resultado es el volumen")
        }
        XCTAssertEqual(volumen, 5 * 100 + 5 * 100)
    }

    func testSinRecapElRitmoMedidoSaleDelSegmento() {
        let segmento = SegmentActualDTO(
            position: 0, itemUid: nil, modality: "run", durationSeconds: 345,
            repsCompleted: nil, weightUsedKg: nil, distanceMeters: 1000,
            avgPaceSPer500m: nil, avgPaceSPerKm: 219, avgPowerW: nil, strokeRateSpm: nil,
            avgHr: nil, maxHr: nil, calories: nil, inclinePct: nil, runCadenceSpm: nil,
            avgGradientPct: nil, startedAt: nil, legIndex: nil, legRole: nil,
            legPhase: nil, source: nil, emomRoundsCompleted: nil,
            emomRoundsPrescribed: nil, zoneSeconds: nil, dragFactor: nil,
            avgCaloriesPerHour: nil, peakDriveForceLbs: nil, avgDriveForceLbs: nil,
            ergSplits: nil
        )
        let bloque = LecturaDeSesionDesdeDetalle.bloqueDe(segmento, itemsPorUid: [:])
        XCTAssertEqual(bloque?.ritmoDeCorrerSkm, 219)
        XCTAssertNotEqual(bloque?.ritmoDeCorrerSkm, 345)
    }
}
