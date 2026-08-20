import XCTest
@testable import FAHYBRIK

// EL JOIN, PROBADO CONTRA LA FORMA REAL DEL CABLE.
//
// Estos tests decodifican JSON con las claves EXACTAS que sirve
// `GET /api/athlete/assignments/{id}/detail`, con el mismo decodificador que usa
// `APIClient` (`convertFromSnakeCase`). Es a propósito: un test escrito contra
// structs a mano no caza nunca el fallo que de verdad pasa aquí, que es una clave
// que no convierte —`avg_pace_s_per_500m` ya costó una vez el ritmo del ergómetro—
// o un campo que el servidor manda y el modelo no nombra.
//
// Y prueban lo que este decodificador NO debe hacer, que es la mitad del diseño:
// no juzgar, no rellenar un nulo y no mezclar los dos vocabularios de veredicto.
final class LecturaDeCarreraDesdeDetalleTests: XCTestCase {

    private func decodifica(_ json: String) throws -> AssignmentDetail {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    // MARK: - La sesión estrella: 6×800 con recuperación en trote

    /// Seis series y cinco trotes, con la forma que sirve el servidor: los números
    /// en `execution.segments`, los juicios en `run_compliance`, y nada de los unos
    /// en los otros.
    private func seisPorOchocientos() -> String {
        // Los tramos alternan trabajo (par) y recuperación (impar) por `position`.
        var segmentos: [String] = []
        var tramos: [String] = []
        var recuperaciones: [String] = []
        // Ritmos: cinco dentro de 200-215 s/km y la quinta serie caída a 224.
        let ritmos: [Double] = [205, 208, 210, 212, 224, 213]
        for i in 0..<6 {
            let pos = i * 2
            segmentos.append("""
            {
              "position": \(pos), "item_uid": "segment-1", "modality": "run",
              "started_at": "2026-08-12 07:00:\(String(format: "%02d", i * 8))+00",
              "duration_seconds": 168, "distance_meters": 800,
              "avg_pace_s_per_km": \(ritmos[i]), "avg_hr": \(160 + i),
              "avg_gradient_pct": 0.4, "incline_pct": null,
              "leg_role": "work", "leg_phase": "main", "source": "gps",
              "zone_seconds": {"z1": 0, "z2": 0, "z3": 20, "z4": 148, "z5": 0}
            }
            """)
            tramos.append("""
            {
              "item_uid": "segment-1", "position": \(pos),
              "verdict": "\(ritmos[i] > 215 ? "fuera_lento" : "dentro")",
              "duration_verdict": null, "rep_ordinal": \(i + 1),
              "band_axis": "pace",
              "band": {"axis": "pace", "fast_s": 200, "slow_s": 215},
              "prescribed_incline_pct": null
            }
            """)
            guard i < 5 else { continue }
            segmentos.append("""
            {
              "position": \(pos + 1), "item_uid": "segment-1", "modality": "run",
              "started_at": "2026-08-12 07:00:\(String(format: "%02d", i * 8 + 4))+00",
              "duration_seconds": 120, "distance_meters": 340,
              "avg_pace_s_per_km": \(i == 2 || i == 3 ? 348 : 372), "avg_hr": \(140 + i),
              "leg_role": "recovery", "leg_phase": "main", "source": "gps"
            }
            """)
            recuperaciones.append("""
            {
              "item_uid": "segment-1", "position": \(pos + 1),
              "verdict": "\(i == 2 || i == 3 ? "demasiado_rapida" : "controlada")",
              "duration_verdict": "duracion_controlada",
              "band": {"axis": "pace", "fast_s": 360, "slow_s": 380}
            }
            """)
        }
        return """
        {
          "assignment": {
            "id": "9001", "athlete_id": "7", "scheduled_for": "2026-08-12",
            "status": "completed", "completed_at": "2026-08-12T08:10:00Z",
            "store_results": []
          },
          "workout": {
            "name": "Series 6×800", "focus": null, "coach_note": null,
            "estimated_duration_minutes": 45, "blocks": []
          },
          "execution": {
            "execution_id": "551", "started_at": "2026-08-12 07:00:00+00",
            "ended_at": "2026-08-12 08:10:00+00", "total_duration_seconds": 2760,
            "completeness": "completed", "source": "gps",
            "contributing_sources": ["gps"], "perceived_exertion": 8,
            "perceived_difficulty": "as_expected",
            "elevation_gain_m": 42, "elevation_loss_m": 40,
            "hr_recovery_60_bpm": 31, "decoupling_pct": 4.2,
            "segments": [\(segmentos.joined(separator: ","))],
            "trace": {
              "available": true,
              "splits": [
                {"index": 1, "partial": false, "distance_m": 1000, "duration_s": 260,
                 "avg_pace_s_per_km": 260, "avg_hr": 148, "elevation_gain_m": 4},
                {"index": 2, "partial": false, "distance_m": 1000, "duration_s": null,
                 "avg_pace_s_per_km": null, "avg_hr": null, "elevation_gain_m": null},
                {"index": 3, "partial": false, "distance_m": 1000, "duration_s": 250,
                 "avg_pace_s_per_km": 250, "avg_hr": 151, "elevation_gain_m": 3}
              ],
              "display_curve": {
                "pace": {"offsets_s": [0, 5, 10], "values": [300, 280, 210]},
                "hr": {"offsets_s": [0, 5, 10], "values": [120, 141, 163]}
              },
              "route": {"available": false, "points": [], "pace_zones": null}
            }
          },
          "run_compliance": {
            "summary": {"total": 6, "evaluable": 6, "dentro": 5, "fuera_rapido": 0,
                        "fuera_lento": 1, "sin_dato": 0, "pct_dentro": 83},
            "tramos": [\(tramos.joined(separator: ","))],
            "recovery_summary": {"total": 5, "evaluable": 5, "controlada": 3,
                                 "demasiado_rapida": 2, "sin_dato": 0, "pct_controlada": 60},
            "recovery_tramos": [\(recuperaciones.joined(separator: ","))],
            "work_duration_summary": {"total": 6, "evaluable": 0, "completa": 0,
                                      "incompleta": 0, "sin_dato": 6, "pct_completa": null},
            "recovery_duration_summary": {"total": 5, "evaluable": 5, "controlada": 5,
                                          "excedida": 0, "sin_dato": 0, "pct_controlada": 100}
          }
        }
        """
    }

    /// EL JOIN POR `position`: cada veredicto cae en SU repetición, y los números
    /// medidos vienen del segmento, que es el único sitio donde existen.
    func testElJoinPonCadaVeredictoEnSuRepeticion() throws {
        let detalle = try decodifica(seisPorOchocientos())
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))

        let trabajo = carrera.repeticiones.filter { $0.papel == .trabajo }
        XCTAssertEqual(trabajo.count, 6)
        XCTAssertEqual(trabajo.map(\.n), [1, 2, 3, 4, 5, 6], "el ordinal lo manda el servidor")
        XCTAssertEqual(trabajo.map(\.veredicto),
                       [.dentro, .dentro, .dentro, .dentro, .fueraLento, .dentro])
        XCTAssertEqual(trabajo[4].ritmoSkm, 224, "el ritmo sale del segmento, no del tramo")
        XCTAssertEqual(trabajo[0].distanciaM, 800)
        XCTAssertEqual(trabajo[0].fcMediaPpm, 160)
    }

    /// LA RECUPERACIÓN NO ESTÁ EN `tramos`, Y SU VOCABULARIO ES OTRO. Mezclarlos
    /// borraría la asimetría: irse lento en un trote es correcto y en una serie es
    /// un aviso.
    func testLaRecuperacionLlegaConSuPropioVocabulario() throws {
        let detalle = try decodifica(seisPorOchocientos())
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))

        let trotes = carrera.repeticiones.filter { $0.papel == .recuperacion }
        XCTAssertEqual(trotes.count, 5)
        XCTAssertEqual(trotes.map(\.veredictoRecuperacion),
                       [.controlada, .controlada, .demasiadoRapida, .demasiadoRapida, .controlada])
        XCTAssertTrue(trotes.allSatisfy { $0.veredicto == nil },
                      "un trote no lleva veredicto de trabajo")
        XCTAssertEqual(trotes.map(\.modo), Array(repeating: .trote, count: 5))
        XCTAssertEqual(trotes.first?.n, 1, "la recuperación hereda el número de la que cierra")
        XCTAssertEqual(carrera.objetivoRecuperacion, .ritmo(rapidoSkm: 360, lentoSkm: 380))
    }

    /// EL SUJETO SALE DE LO SERVIDO, sin que el móvil juzgue nada.
    func testElVeredictoLlegaServidoYManda() throws {
        let detalle = try decodifica(seisPorOchocientos())
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        let lectura = Lectura.deCorrer(carrera)

        guard case .veredicto(let dentro, let evaluables, let sesgo, _, _) = lectura.sujeto else {
            return XCTFail("el sujeto tenía que ser el veredicto, fue \(lectura.sujeto)")
        }
        XCTAssertEqual(dentro, 5)
        XCTAssertEqual(evaluables, 6)
        XCTAssertEqual(sesgo, .lento)
        XCTAssertEqual(lectura.troceado, .repeticiones,
                       "por repetición O por kilómetro, nunca los dos")
        XCTAssertEqual(carrera.objetivo, .ritmo(rapidoSkm: 200, lentoSkm: 215))
    }

    /// LOS INSTANTES: el servidor escribe `timestamptz::text`, que NO es ISO 8601.
    /// Si no se lee, los tramos se apilan en el cero y la curva miente.
    func testElInicioDeCadaTramoSaleDeSuMarcaDeTiempo() throws {
        let detalle = try decodifica(seisPorOchocientos())
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        let trabajo = carrera.repeticiones.filter { $0.papel == .trabajo }
        XCTAssertEqual(trabajo[0].inicioS, 0)
        XCTAssertEqual(trabajo[1].inicioS, 8, "07:00:08 son 8 s tras el inicio")
        XCTAssertEqual(trabajo[5].inicioS, 40)
    }

    /// LOS KILÓMETROS: el cruce se acumula, y en cuanto uno se queda sin duración
    /// los de detrás dejan de tener sitio conocido. La fila sigue, y dice qué falta.
    func testUnKilometroSinSenalDejaSinSitioALosDeDetras() throws {
        let detalle = try decodifica(seisPorOchocientos())
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))

        XCTAssertEqual(carrera.kilometros.count, 3)
        XCTAssertEqual(carrera.kilometros[0].cruceS, 0)
        XCTAssertEqual(carrera.kilometros[1].cruceS, 260)
        XCTAssertNil(carrera.kilometros[2].cruceS, "tras el hueco no se sabe dónde cae")
        XCTAssertNil(carrera.kilometros[1].ritmoSkm)
        XCTAssertNotNil(carrera.kilometros[1].sinCobertura, "se dice por qué, no se pone un guion")
        XCTAssertFalse(carrera.kilometros[1].sinCobertura!.contains("—"),
                       "ni un guion de relleno en el copy")
    }

    /// LO DERIVADO llega MEDIDO y en la unidad que lo mide el servidor. Convertir un
    /// porcentaje a s/km multiplicándolo por la media sería fabricar una cifra.
    func testLoDerivadoLlegaEnLaUnidadQueSeMidio() throws {
        let detalle = try decodifica(seisPorOchocientos())
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        XCTAssertEqual(carrera.derivado.derivaPct, 4.2)
        XCTAssertEqual(carrera.derivado.bajadaPulsoPpm, 31)
        XCTAssertEqual(carrera.desnivelM, 42, "subida acumulada, nunca el neto")
        XCTAssertEqual(carrera.zonasS[4], 5 * 148 + 148, "los segundos por zona se suman")
        XCTAssertEqual(carrera.dicho?.rpe, 8)
    }

    // MARK: - Lo que el decodificador NO debe hacer

    /// UN TRAMO PRESCRITO Y NO CORRIDO llega con `position: null`: no es una
    /// repetición, es una ausencia, y el servidor ya la cuenta en su resumen.
    func testUnTramoSinPositionNoInventaUnaRepeticion() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "7", "scheduled_for": "2026-08-12",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Series", "blocks": []},
          "execution": {
            "execution_id": "1", "started_at": "2026-08-12 07:00:00+00",
            "completeness": "partial", "contributing_sources": [],
            "total_duration_seconds": 600,
            "segments": [
              {"position": 0, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 170, "distance_meters": 800,
               "avg_pace_s_per_km": 205, "leg_role": "work", "leg_phase": "main"},
              {"position": 1, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 172, "distance_meters": 800,
               "avg_pace_s_per_km": 208, "leg_role": "work", "leg_phase": "main"}
            ]
          },
          "run_compliance": {
            "summary": {"total": 3, "evaluable": 2, "dentro": 2, "fuera_rapido": 0,
                        "fuera_lento": 0, "sin_dato": 1, "pct_dentro": 100},
            "tramos": [
              {"item_uid": "segment-1", "position": 0, "verdict": "dentro",
               "duration_verdict": null, "rep_ordinal": 1, "band_axis": "pace",
               "band": {"axis": "pace", "fast_s": 200, "slow_s": 215},
               "prescribed_incline_pct": null},
              {"item_uid": "segment-1", "position": 1, "verdict": "dentro",
               "duration_verdict": null, "rep_ordinal": 2, "band_axis": "pace",
               "band": {"axis": "pace", "fast_s": 200, "slow_s": 215},
               "prescribed_incline_pct": null},
              {"item_uid": "segment-1", "position": null, "verdict": "sin_dato",
               "duration_verdict": null, "rep_ordinal": null, "band_axis": null,
               "band": null, "prescribed_incline_pct": null}
            ],
            "recovery_summary": {"total": 0, "evaluable": 0, "controlada": 0,
                                 "demasiado_rapida": 0, "sin_dato": 0, "pct_controlada": null},
            "recovery_tramos": [],
            "work_duration_summary": {"total": 2, "evaluable": 0, "completa": 0,
                                      "incompleta": 0, "sin_dato": 2, "pct_completa": null},
            "recovery_duration_summary": {"total": 0, "evaluable": 0, "controlada": 0,
                                          "excedida": 0, "sin_dato": 0, "pct_controlada": null}
          }
        }
        """
        let detalle = try decodifica(json)
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        XCTAssertEqual(carrera.repeticiones.count, 2, "la tercera no se corrió")

        // Y UN PORCENTAJE NULO NO ES UN CERO.
        let cumplimiento = try XCTUnwrap(detalle.runCompliance)
        XCTAssertNil(cumplimiento.workDurationSummary.pctCompleta)
        XCTAssertNil(cumplimiento.recoverySummary.pctControlada)
        XCTAssertEqual(cumplimiento.summary.pctDentro, 100)
    }

    /// TRES PENDIENTES QUE SE PARECEN. La PRESCRITA manda el corrector y llega del
    /// tramo; la MEDIDA llega del segmento; la DECLARADA por la cinta no alimenta el
    /// corrector. Confundirlas no da error, así que se fija con un test.
    func testLasTresPendientesNoSeMezclan() throws {
        let json = cuestaAlOchoPorCiento()
        let detalle = try decodifica(json)
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))

        XCTAssertEqual(carrera.repeticiones[0].pendientePrescritaPct, 8, "lo que pidió el coach")
        XCTAssertEqual(carrera.repeticiones[0].pendientePct, 7.6, "lo medido, nunca lo declarado")
        XCTAssertEqual(carrera.superficie, .cinta, "la distancia la sella la correa")

        // Y el corrector hace su trabajo: en cuesta el ritmo se retira y se lee el
        // tiempo. El veredicto de ritmo NO se emite mal, se retira.
        let lectura = Lectura.deCorrer(carrera)
        XCTAssertEqual(lectura.eje, .tiempo)
        XCTAssertNil(lectura.banda)
        guard case .tiempoPorRepeticion(_, _, let primera, let ultima, _) = lectura.sujeto else {
            return XCTFail("en cuesta manda el tiempo, fue \(lectura.sujeto)")
        }
        XCTAssertEqual(primera, 48)
        XCTAssertEqual(ultima, 52)
    }

    /// EL UMBRAL DE PENDIENTE ES DEL COACH, Y MANDA EL SERVIDO.
    ///
    /// La misma sesión al 8 % se lee de dos maneras según lo que el entrenador
    /// considere cuesta, y ese es justo el punto: el número no puede vivir en una
    /// constante de este binario. Hoy el local y el del servidor coinciden POR
    /// CASUALIDAD, así que un test que solo mire el resultado no distinguiría cuál
    /// de los dos está mandando — por eso este pide un umbral que NO coincide.
    func testElUmbralDePendienteLoManaElCoachYNoLaConstanteLocal() throws {
        // Con un umbral del 10 %, un 8 % ya no es cuesta: el ritmo vuelve a
        // compararse y la lectura deja de leerse en tiempo.
        let suave = try XCTUnwrap(
            LecturaDeCarreraDesdeDetalle.carrera(de: decodifica(cuestaAlOchoPorCiento(umbral: 10)))
        )
        XCTAssertEqual(suave.metodo.pendienteQueRetiraElRitmoPct, 10)
        let lecturaSuave = Lectura.deCorrer(suave)
        XCTAssertEqual(lecturaSuave.eje, .ritmo, "al 10 % de umbral, un 8 % no retira nada")
        if case .tiempoPorRepeticion = lecturaSuave.sujeto {
            XCTFail("el umbral servido no está mandando: sigue leyéndose como cuesta")
        }

        // Y con uno del 5 %, sigue siendo cuesta — el mismo dato, otra lectura.
        let dura = try XCTUnwrap(
            LecturaDeCarreraDesdeDetalle.carrera(de: decodifica(cuestaAlOchoPorCiento(umbral: 5)))
        )
        XCTAssertEqual(Lectura.deCorrer(dura).eje, .tiempo)
    }

    /// SIN NÚMERO SERVIDO SE LEE COMO HASTA HOY. Es la única razón por la que el
    /// suelo local sigue existiendo: una respuesta anterior a que el servidor lo
    /// mande —o un detalle cacheado de entonces— no puede cambiar de lectura.
    func testSinUmbralServidoMandaElSueloDeSiempre() throws {
        let carrera = try XCTUnwrap(
            LecturaDeCarreraDesdeDetalle.carrera(de: decodifica(cuestaAlOchoPorCiento()))
        )
        XCTAssertEqual(carrera.metodo, .porDefecto)
        XCTAssertEqual(carrera.metodo.pendienteQueRetiraElRitmoPct,
                       ReglasDeLectura.pendienteQueRetiraElRitmoPct)

        // Un número imposible tampoco se cuela: cero o negativo no es un umbral,
        // es un campo mal rellenado, y se lee como si no hubiera llegado.
        let cero = try XCTUnwrap(
            LecturaDeCarreraDesdeDetalle.carrera(de: decodifica(cuestaAlOchoPorCiento(umbral: 0)))
        )
        XCTAssertEqual(cero.metodo, .porDefecto)
    }

    /// La sesión de cuestas, con el umbral del coach servido o sin él.
    private func cuestaAlOchoPorCiento(umbral: Double? = nil) -> String {
        let linea = umbral.map { "\"gradient_threshold_pct\": \($0)," } ?? ""
        return """
        {
          "assignment": {"id": "1", "athlete_id": "7", "scheduled_for": "2026-08-12",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Cuestas", "blocks": []},
          "execution": {
            "execution_id": "1", "started_at": "2026-08-12 07:00:00+00",
            "completeness": "completed", "contributing_sources": ["treadmill"],
            "source": "treadmill", "total_duration_seconds": 900,
            "segments": [
              {"position": 0, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 48, "distance_meters": 200, "avg_pace_s_per_km": 240,
               "avg_gradient_pct": 7.6, "incline_pct": 8.0,
               "leg_role": "work", "leg_phase": "main", "source": "treadmill"},
              {"position": 1, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 52, "distance_meters": 200, "avg_pace_s_per_km": 260,
               "avg_gradient_pct": 7.4, "incline_pct": 8.0,
               "leg_role": "work", "leg_phase": "main", "source": "treadmill"}
            ]
          },
          "run_compliance": {
            \(linea)
            "summary": {"total": 2, "evaluable": 0, "dentro": 0, "fuera_rapido": 0,
                        "fuera_lento": 0, "sin_dato": 2, "pct_dentro": null},
            "tramos": [
              {"item_uid": "segment-1", "position": 0, "verdict": "sin_dato",
               "duration_verdict": null, "rep_ordinal": 1, "band_axis": null,
               "band": null, "prescribed_incline_pct": 8},
              {"item_uid": "segment-1", "position": 1, "verdict": "sin_dato",
               "duration_verdict": null, "rep_ordinal": 2, "band_axis": null,
               "band": null, "prescribed_incline_pct": 8}
            ],
            "recovery_summary": {"total": 0, "evaluable": 0, "controlada": 0,
                                 "demasiado_rapida": 0, "sin_dato": 0, "pct_controlada": null},
            "recovery_tramos": [],
            "work_duration_summary": {"total": 0, "evaluable": 0, "completa": 0,
                                      "incompleta": 0, "sin_dato": 0, "pct_completa": null},
            "recovery_duration_summary": {"total": 0, "evaluable": 0, "controlada": 0,
                                          "excedida": 0, "sin_dato": 0, "pct_controlada": null}
          }
        }
        """
    }

    /// SIN EJECUCIÓN, O SIN NADA DE CORRER, esto no es una carrera. Nil significa
    /// «no es lo mío», nunca «no pude leerlo»: quien llama pinta su vista de siempre.
    func testUnaSesionQueNoEsCarreraNoSeLee() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "7", "scheduled_for": "2026-08-12",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Fuerza", "blocks": []},
          "execution": {
            "execution_id": "1", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": "segment-1", "modality": "strength",
               "duration_seconds": 300, "reps_completed": 15, "weight_used_kg": 90}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        XCTAssertNil(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
    }

    // MARK: - Correr DENTRO de una sesión no la convierte en una carrera (card 118)

    /// EL ENTRENO DEL 20-AGO: fuerza y trineos, 47 minutos, con seis de
    /// calentamiento corriendo. Se leía como carrera y ocupaba la pantalla entera
    /// con «RITMO MEDIO 0:00 /km · corriste a una sola intensidad», sin decir una
    /// palabra del peso muerto, el remo ni los trineos.
    func testUnCalentamientoCorriendoNoConvierteUnaSesionDeHierroEnCarrera() throws {
        let json = """
        {
          "assignment": {"id": "481", "athlete_id": "64", "scheduled_for": "2026-08-20",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Fuerza B + Trineos", "blocks": []},
          "execution": {
            "execution_id": "2438", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": "s-1", "modality": "run",
               "duration_seconds": 360, "distance_meters": 1200},
              {"position": 1, "item_uid": "s-2", "modality": "strength",
               "duration_seconds": 669, "reps_completed": 15, "weight_used_kg": 100},
              {"position": 2, "item_uid": "s-3", "modality": "strength",
               "duration_seconds": 426, "reps_completed": 24, "weight_used_kg": 60},
              {"position": 3, "item_uid": "s-4", "modality": "row",
               "duration_seconds": 636, "distance_meters": 2000},
              {"position": 4, "item_uid": "s-5", "modality": "other",
               "duration_seconds": 260, "reps_completed": 8}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        XCTAssertNil(LecturaDeCarreraDesdeDetalle.carrera(de: detalle),
                     "seis minutos de correr en 47 no hacen una carrera")
    }

    /// La regla, en frío: correr manda cuando se lleva más de la mitad del tiempo.
    func testCorrerMandaSoloCuandoSeLlevaMasDeLaMitadDelTiempo() {
        typealias T = LecturaDeCarreraDesdeDetalle.TramoParaClasificar
        // El caso de Alex: 6 minutos de 47.
        XCTAssertFalse(LecturaDeCarreraDesdeDetalle.correrManda(en: [
            T(modalidad: "run", segundos: 360),
            T(modalidad: "strength", segundos: 669),
            T(modalidad: "row", segundos: 636),
            T(modalidad: "other", segundos: 260),
        ]))
        // Un rodaje con dos minutos de movilidad al final sigue siendo un rodaje.
        XCTAssertTrue(LecturaDeCarreraDesdeDetalle.correrManda(en: [
            T(modalidad: "run", segundos: 2_400),
            T(modalidad: "other", segundos: 120),
        ]))
        // Justo la mitad NO basta: empatar no es mandar.
        XCTAssertFalse(LecturaDeCarreraDesdeDetalle.correrManda(en: [
            T(modalidad: "run", segundos: 600),
            T(modalidad: "strength", segundos: 600),
        ]))
        // Sin ningún tiempo medido (un registro a mano) se cuenta por tramos.
        XCTAssertTrue(LecturaDeCarreraDesdeDetalle.correrManda(en: [
            T(modalidad: "run", segundos: nil),
            T(modalidad: "run", segundos: nil),
            T(modalidad: "strength", segundos: nil),
        ]))
        // Y sin tramos no hay sesión que leer.
        XCTAssertFalse(LecturaDeCarreraDesdeDetalle.correrManda(en: []))
    }

    /// SIN METROS NO HAY CARRERA QUE LEER. Toda la lectura habla de ritmo, y el
    /// ritmo son metros entre segundos: con la distancia sin medir salía un 0:00 a
    /// pantalla completa, que afirma algo falso. Manda la lectura genérica.
    func testUnaCarreraSinDistanciaMedidaNoSeLeeComoCarrera() throws {
        let json = """
        {
          "assignment": {"id": "9", "athlete_id": "64", "scheduled_for": "2026-08-20",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Rodaje en cinta", "blocks": []},
          "execution": {
            "execution_id": "9", "completeness": "completed", "contributing_sources": [],
            "segments": [
              {"position": 0, "item_uid": "s-1", "modality": "run",
               "duration_seconds": 1800, "avg_hr": 139}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        XCTAssertNil(LecturaDeCarreraDesdeDetalle.carrera(de: detalle),
                     "sin metros medidos no hay ritmo que contar: 0:00 sería mentira")
    }

    /// UNA BANDA DE PULSO SE NOMBRA CON LAS ZONAS DEL ATLETA — y sin ellas no se
    /// dibuja: el color es dato, y una franja de un color que no significa nada es
    /// peor que ninguna franja.
    func testUnaBandaDePulsoNecesitaLasZonasDelAtleta() {
        let banda = ComplianceBand(axis: "hr", fastS: nil, slowS: nil,
                                   minBpm: 128, maxBpm: 137)
        XCTAssertNil(banda.objetivo(zonas: nil))

        let perfil = HRZoneProfile(
            lthrBpm: 165, estimated: false, source: "lthr_measured",
            sourceLabel: "Medido", confidence: "measured",
            zones: (1...5).map {
                HRZoneBand(zone: $0, code: "Z\($0)", label: "Z\($0)",
                           minBpm: 100 + ($0 - 1) * 20, maxBpm: 119 + ($0 - 1) * 20,
                           rangeLabel: "")
            }
        )
        XCTAssertEqual(banda.objetivo(zonas: perfil), .zona(2, minPpm: 128, maxPpm: 137))
    }

    /// UN BORDE AUSENTE SE ESCRIBE COMO EL INFINITO QUE SIGNIFICA — «no más rápido
    /// de 3:20» no tiene suelo, y un cero de relleno diría lo contrario. Ese borde
    /// NO entra en el eje de la curva ni en el copy.
    func testUnaBandaConUnSoloBordeNoSeInventaElOtro() {
        let soloRapido = ComplianceBand(axis: "pace", fastS: 200, slowS: nil,
                                        minBpm: nil, maxBpm: nil)
        XCTAssertEqual(soloRapido.objetivo(zonas: nil), .ritmo(rapidoSkm: 200, lentoSkm: .infinity))

        let eje = EjeDelRitmo.dominio(
            ritmo: [Muestra(t: 0, v: 210), Muestra(t: 10, v: 230)],
            repeticiones: [],
            banda: .ritmo(rapidoSkm: 200, lentoSkm: .infinity)
        )
        XCTAssertTrue(eje.max.isFinite, "un borde infinito no puede estirar el eje")
        XCTAssertLessThan(eje.max, 300)

        XCTAssertEqual(SujetoDeLaCarrera.loQueTePedian(.ritmo(rapidoSkm: 200, lentoSkm: .infinity)),
                       "Te pedían 3:20/km o más suave")
        XCTAssertEqual(SujetoDeLaCarrera.loQueTePedian(.ritmo(rapidoSkm: 0, lentoSkm: 215)),
                       "Te pedían 3:35/km o más rápido")
    }

    /// UN EJE QUE ESTA VERSIÓN NO CONOCE no puede tumbar el detalle entero: se lee
    /// como «no hay banda que dibujar», que es lo que significa.
    func testUnEjeDesconocidoNoRompeNada() {
        let banda = ComplianceBand(axis: "vatios", fastS: nil, slowS: nil,
                                   minBpm: nil, maxBpm: nil)
        XCTAssertNil(banda.objetivo(zonas: nil))
    }

    /// EL CALENTAMIENTO NO ES UNA REPETICIÓN. Se corrió, sale en la curva, y no
    /// entra en «5 de 6»: contarlo hundiría el veredicto de la sesión.
    func testElCalentamientoNoCuentaComoSerie() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "7", "scheduled_for": "2026-08-12",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Series", "blocks": []},
          "execution": {
            "execution_id": "1", "started_at": "2026-08-12 07:00:00+00",
            "completeness": "completed", "contributing_sources": [],
            "total_duration_seconds": 1800,
            "segments": [
              {"position": 0, "item_uid": "segment-0", "modality": "run",
               "duration_seconds": 600, "distance_meters": 1800, "avg_pace_s_per_km": 333,
               "leg_role": "work", "leg_phase": "warmup"},
              {"position": 1, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 170, "distance_meters": 800, "avg_pace_s_per_km": 212,
               "leg_role": "work", "leg_phase": "main"},
              {"position": 2, "item_uid": "segment-1", "modality": "run",
               "duration_seconds": 172, "distance_meters": 800, "avg_pace_s_per_km": 214,
               "leg_role": "work", "leg_phase": "main"},
              {"position": 3, "item_uid": "segment-2", "modality": "run",
               "duration_seconds": 480, "distance_meters": 1400, "avg_pace_s_per_km": 343,
               "leg_role": "work", "leg_phase": "cooldown"}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        XCTAssertEqual(carrera.repeticiones.count, 2,
                       "solo el trabajo de verdad; el calentamiento y la calma no son series")
        XCTAssertEqual(carrera.repeticiones.map(\.ritmoSkm), [212, 214])
    }

    /// SIN `run_compliance` —una salida libre— siguen existiendo los tramos que el
    /// motor cerró, y NADIE los juzga aquí. El contraste es lo que queda.
    func testSinCumplimientoHayTramosPeroNoVeredictos() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "7", "scheduled_for": "2026-08-12",
                         "status": "completed", "store_results": []},
          "workout": null,
          "execution": {
            "execution_id": "1", "started_at": "2026-08-12 07:00:00+00",
            "completeness": "completed", "contributing_sources": [],
            "total_duration_seconds": 1500,
            "segments": [
              {"position": 0, "item_uid": null, "modality": "run",
               "duration_seconds": 120, "distance_meters": 500, "avg_pace_s_per_km": 240,
               "leg_role": "work", "leg_phase": "main"},
              {"position": 1, "item_uid": null, "modality": "run",
               "duration_seconds": 180, "distance_meters": 500, "avg_pace_s_per_km": 360,
               "leg_role": "recovery", "leg_phase": "main"},
              {"position": 2, "item_uid": null, "modality": "run",
               "duration_seconds": 120, "distance_meters": 500, "avg_pace_s_per_km": 245,
               "leg_role": "work", "leg_phase": "main"}
            ],
            "trace": {"available": true, "splits": [],
                      "display_curve": {"pace": {"offsets_s": [0, 60], "values": [300, 245]},
                                        "hr": null},
                      "route": {"available": false, "points": [], "pace_zones": null}}
          }
        }
        """
        let detalle = try decodifica(json)
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        XCTAssertEqual(carrera.objetivo, .ninguno, "sin prescripción no hay intención que contrastar")
        XCTAssertTrue(carrera.repeticiones.allSatisfy { $0.veredicto == nil })

        guard case .contraste(let n, let fuerte, let suave, _, _) = Lectura.deCorrer(carrera).sujeto
        else { return XCTFail("sin objetivo manda el contraste") }
        XCTAssertEqual(n, 2)
        XCTAssertEqual(fuerte, 242.5, accuracy: 0.01)
        XCTAssertEqual(suave, 360)
    }

    /// ANDAR NO ES CORRER, Y LO DICE LA PRESCRIPCIÓN — no un umbral inventado aquí.
    ///
    /// El arquetipo de cuestas pide `caminar` entre repeticiones, y ese paseo a
    /// 11:32/km no puede ensanchar el eje de la curva: metido junto a subidas a
    /// 4:00 aplasta las ocho repeticiones contra el borde y la curva deja de leerse
    /// justo donde el sujeto es cuánto se cayó de la primera a la última.
    func testElPaseoDeUnaCuestaSaleDeLaPrescripcionYNoEnsanchaElEje() throws {
        let json = """
        {
          "assignment": {"id": "1", "athlete_id": "7", "scheduled_for": "2026-08-12",
                         "status": "completed", "store_results": []},
          "workout": {"name": "Cuestas", "blocks": [
            {"uid": "b1", "title": "8×200 al 8%", "format": "intervals",
             "block_position": 1, "config_json": {}, "items": [
               {"uid": "segment-1", "template_segment_id": 1, "exercise_id": "e1",
                "exercise_name": "Carrera", "exercise_slug": "carrera",
                "exercise_category": "run", "params_json": {},
                "prescription_json": {
                  "scheme": "intervals",
                  "modality": "run",
                  "structure": [
                    {"role": "main", "elements": [
                      {"times": 2, "elements": [
                        {"kind": "work", "measure": {"type": "distance", "m": 200},
                         "incline_pct": 8},
                        {"kind": "recovery", "measure": {"type": "duration", "s": 90},
                         "recovery_mode": "caminar"}
                      ]}
                    ]}
                  ]
                }}
             ]}
          ]},
          "execution": {
            "execution_id": "1", "started_at": "2026-08-12 07:00:00+00",
            "completeness": "completed", "contributing_sources": [],
            "total_duration_seconds": 300,
            "segments": [
              {"position": 0, "item_uid": "segment-1", "modality": "run", "leg_index": 0,
               "duration_seconds": 48, "distance_meters": 200, "avg_pace_s_per_km": 240,
               "leg_role": "work", "leg_phase": "main"},
              {"position": 1, "item_uid": "segment-1", "modality": "run", "leg_index": 1,
               "duration_seconds": 90, "distance_meters": 130, "avg_pace_s_per_km": 692,
               "leg_role": "recovery", "leg_phase": "main"},
              {"position": 2, "item_uid": "segment-1", "modality": "run", "leg_index": 2,
               "duration_seconds": 52, "distance_meters": 200, "avg_pace_s_per_km": 260,
               "leg_role": "work", "leg_phase": "main"},
              {"position": 3, "item_uid": "segment-1", "modality": "run", "leg_index": 3,
               "duration_seconds": 90, "distance_meters": 128, "avg_pace_s_per_km": 703,
               "leg_role": "recovery", "leg_phase": "main"}
            ]
          }
        }
        """
        let detalle = try decodifica(json)
        let carrera = try XCTUnwrap(LecturaDeCarreraDesdeDetalle.carrera(de: detalle))
        let trotes = carrera.repeticiones.filter { $0.papel == .recuperacion }
        XCTAssertEqual(trotes.map(\.modo), [.andando, .andando],
                       "lo dijo el coach: se recupera andando")

        // Y la consecuencia, que es el motivo de todo esto: el paseo se queda FUERA
        // del eje aunque esté dibujado.
        let eje = EjeDelRitmo.dominio(
            ritmo: [Muestra(t: 0, v: 240), Muestra(t: 48, v: 692), Muestra(t: 138, v: 260)],
            repeticiones: carrera.repeticiones,
            banda: nil
        )
        XCTAssertLessThan(eje.max, 300, "un paseo a 11:32 no puede fijar el eje")

        XCTAssertEqual(EjeDelRitmo.ventanasQueNoSonCorrer(carrera.repeticiones).count, 2)
    }

    /// SIN MODO PRESCRITO SE MIDE, no se supone: si hubo ritmo hubo movimiento, y
    /// si no lo hubo, el atleta estuvo parado.
    func testSinModoPrescritoElModoSeMide() {
        let conRitmo = SegmentActualDTO(
            position: 1, itemUid: nil, modality: "run", durationSeconds: 90,
            repsCompleted: nil, weightUsedKg: nil, distanceMeters: 300,
            avgPaceSPer500m: nil, avgPaceSPerKm: 300, avgPowerW: nil, strokeRateSpm: nil,
            avgHr: nil, maxHr: nil, calories: nil, inclinePct: nil, runCadenceSpm: nil,
            avgGradientPct: nil, startedAt: nil, legIndex: nil, legRole: "recovery",
            legPhase: "main", source: nil, emomRoundsCompleted: nil,
            emomRoundsPrescribed: nil, zoneSeconds: nil, dragFactor: nil,
            avgCaloriesPerHour: nil, peakDriveForceLbs: nil, avgDriveForceLbs: nil,
            ergSplits: nil
        )
        XCTAssertEqual(LecturaDeCarreraDesdeDetalle.modoDe(conRitmo, prescrito: nil), .trote)
        XCTAssertEqual(LecturaDeCarreraDesdeDetalle.modoDe(conRitmo, prescrito: .caminar), .andando)
        XCTAssertEqual(LecturaDeCarreraDesdeDetalle.modoDe(conRitmo, prescrito: .parado), .parado)
    }

    /// LA TRAZA NO MANDA SOBRE LOS TRAMOS (DECISIONS, 12-ago). Casi todas las
    /// sesiones guardadas son anteriores al archivo, y las seis series están medidas
    /// y juzgadas igual: enseñar «sin archivo» ahí escondería la mitad buena de la
    /// lectura, y el coach vería un veredicto que el atleta no.
    func testSinArchivoElVeredictoSigueMandando() throws {
        let sinTraza = seisPorOchocientos()
            .replacingOccurrences(of: "\"available\": true", with: "\"available\": false")
        let carrera = try XCTUnwrap(
            LecturaDeCarreraDesdeDetalle.carrera(de: decodifica(sinTraza))
        )
        XCTAssertNil(carrera.traza, "sin archivo no hay curva")
        XCTAssertTrue(carrera.kilometros.isEmpty, "ni kilómetros")

        let lectura = Lectura.deCorrer(carrera)
        guard case .veredicto(let dentro, let evaluables, _, _, _) = lectura.sujeto else {
            return XCTFail("los tramos existen desde antes del archivo, fue \(lectura.sujeto)")
        }
        XCTAssertEqual(dentro, 5)
        XCTAssertEqual(evaluables, 6)
        XCTAssertEqual(lectura.troceado, .repeticiones)
        XCTAssertEqual(lectura.veredictosRecuperacion.count, 5,
                       "la recuperación también la juzgó el servidor, con o sin traza")
    }
}
