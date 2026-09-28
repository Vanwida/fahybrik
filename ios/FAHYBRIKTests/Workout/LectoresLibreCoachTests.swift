import XCTest
@testable import FAHYBRIK

// LOS LECTORES DE LO HECHO (DECISIONS 2026-09-28): la serie a serie y el tonelaje por
// tramo, los parciales del monitor, la ronda, el detalle por ejecución sin asignación.
// JSON con las claves exactas del cable (docs/pr/lectores-libre-coach.md), decodificado
// con `convertFromSnakeCase` como hace `APIClient`.
final class LectoresLibreCoachTests: XCTestCase {

    private func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    private func detalle(segmentos: String, workout: String = "null") throws -> AssignmentDetail {
        let json = """
        {
          "assignment": {"id": "9", "athlete_id": "64", "scheduled_for": "2026-09-28",
                         "status": "completed", "store_results": []},
          "workout": \(workout),
          "execution": {"execution_id": "138", "completeness": "completed",
                        "contributing_sources": [], "total_duration_seconds": 1800,
                        "segments": [\(segmentos)]}
        }
        """
        return try decoder().decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    /// La ejecución 138 real: 5×100 · 5×110 · 3×115 · 3×120. El servidor servía
    /// «reps null, 120 kg»; ahora trae las cuatro series y su tonelaje.
    private let sentadilla = """
      {"position": 0, "item_uid": null, "modality": "strength", "duration_seconds": 900,
       "reps_completed": null, "weight_used_kg": 120, "volume_kg": 1755,
       "sets": [
         {"set_index": 1, "status": "done", "reps": 5, "kg": 100, "reps_prescribed": 5,
          "kg_prescribed": 100, "rpe": 7, "rir": null, "tempo": "3-1-1-0", "rest_s": 120},
         {"set_index": 2, "status": "done", "reps": 5, "kg": 110, "reps_prescribed": 5,
          "kg_prescribed": 110, "rpe": 8, "rir": 2, "tempo": null, "rest_s": 150},
         {"set_index": 3, "status": "scaled", "reps": 3, "kg": 115, "reps_prescribed": 5,
          "kg_prescribed": 115, "rpe": 9, "rir": 1, "tempo": null, "rest_s": null},
         {"set_index": 4, "status": "done", "reps": 3, "kg": 120, "reps_prescribed": 3,
          "kg_prescribed": 120, "rpe": 9.5, "rir": 0.5, "tempo": null, "rest_s": null},
         {"set_index": 5, "status": "skipped", "reps": null, "kg": null, "reps_prescribed": 3,
          "kg_prescribed": 125, "rpe": null, "rir": null, "tempo": null, "rest_s": null}
       ]}
    """

    // MARK: - Decodificación de los campos nuevos

    func testLasSeriesYElVolumenSeDecodifican() throws {
        let d = try detalle(segmentos: sentadilla)
        let seg = try XCTUnwrap(d.execution?.segments.first)
        XCTAssertEqual(seg.volumeKg, 1755)
        XCTAssertEqual(seg.sets?.count, 5)
        let segunda = try XCTUnwrap(seg.sets?[1])
        XCTAssertEqual(segunda.setIndex, 2)
        XCTAssertEqual(segunda.reps, 5)
        XCTAssertEqual(segunda.kg, 110)
        XCTAssertEqual(segunda.kgPrescribed, 110)
        XCTAssertEqual(segunda.rir, 2)
        XCTAssertEqual(segunda.restS, 150)
        XCTAssertEqual(seg.sets?[3].rpe, 9.5, "el RPE admite medio punto")
    }

    /// Un detalle cacheado antes de esta tanda no trae las claves: sigue abriendo.
    func testUnDetalleSinLasClavesNuevasSigueDecodificando() throws {
        let d = try detalle(segmentos: """
          {"position": 0, "item_uid": null, "modality": "run", "duration_seconds": 300,
           "distance_meters": 1000}
        """)
        let seg = try XCTUnwrap(d.execution?.segments.first)
        XCTAssertNil(seg.sets)
        XCTAssertNil(seg.volumeKg)
        XCTAssertNil(seg.roundIndex)
    }

    // MARK: - El detalle de la sesión: la fuerza serie a serie

    func testLaFuerzaSePintaSerieASerieConElVolumenDelServidor() throws {
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: try detalle(segmentos: sentadilla)))
        let bloque = try XCTUnwrap(sesion.bloques.first)
        XCTAssertEqual(bloque.series.count, 5)
        XCTAssertEqual(bloque.volumenKg, 1755, "el tonelaje es el del servidor, no uno propio")
        XCTAssertEqual(bloque.series[2].estado, .adaptada)
        XCTAssertEqual(bloque.series[4].estado, .saltada)
        guard case .fuerza(let volumen, let masPesada) = sesion.resultado else {
            return XCTFail("con series con carga el resultado es el volumen")
        }
        XCTAssertEqual(volumen, 1755)
        XCTAssertEqual(masPesada?.kg, 120, "la saltada de 125 kg no cuenta como la más pesada")
        XCTAssertEqual(masPesada?.reps, 3)
    }

    /// Antes: total de reps × la carga MÁS ALTA. Sin `volume_kg` servido no hay
    /// volumen que enseñar — nunca uno inventado.
    func testSinVolumenServidoNoHayVolumen() throws {
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: try detalle(segmentos: """
          {"position": 0, "item_uid": null, "modality": "strength", "duration_seconds": 600,
           "reps_completed": 16, "weight_used_kg": 120}
        """)))
        XCTAssertNil(sesion.resultado)
    }

    func testLaSerieSoloDiceLoPedidoCuandoDifiere() {
        let igual = SerieHecha(indice: 1, estado: .hecha, reps: 5, kg: 100, repsPedidas: 5,
                               kgPedidos: 100, rpe: 8, rir: nil, tempo: nil, descansoS: nil)
        XCTAssertEqual(igual.hecho, "5 × 100 kg")
        XCTAssertNil(igual.pedido)
        XCTAssertEqual(igual.esfuerzo, "RPE 8")
        XCTAssertNil(igual.apoyo)

        let menos = SerieHecha(indice: 3, estado: .adaptada, reps: 3, kg: 115, repsPedidas: 5,
                               kgPedidos: 115, rpe: 9, rir: 1, tempo: "3-1-1-0", descansoS: 120)
        XCTAssertEqual(menos.pedido, "5 × 115 kg")
        XCTAssertEqual(menos.esfuerzo, "RPE 9 · RIR 1")
        XCTAssertEqual(menos.apoyo, "pedido 5 × 115 kg · tempo 3-1-1-0 · descanso 2:00")
    }

    /// El volumen del resumen (antes de guardar) sigue la regla de volume.ts: hechas
    /// y adaptadas suman; saltadas, sin carga y de aproximación no.
    func testElVolumenLocalSigueLaReglaDelServidor() {
        let series = [
            SerieHecha(indice: 1, estado: .hecha, reps: 8, kg: 60, repsPedidas: nil, kgPedidos: nil,
                       rpe: nil, rir: nil, tempo: nil, descansoS: nil, aproximacion: true),
            SerieHecha(indice: 2, estado: .hecha, reps: 5, kg: 100, repsPedidas: nil, kgPedidos: nil,
                       rpe: nil, rir: nil, tempo: nil, descansoS: nil),
            SerieHecha(indice: 3, estado: .adaptada, reps: 3, kg: 110, repsPedidas: nil, kgPedidos: nil,
                       rpe: nil, rir: nil, tempo: nil, descansoS: nil),
            SerieHecha(indice: 4, estado: .saltada, reps: 5, kg: 120, repsPedidas: nil, kgPedidos: nil,
                       rpe: nil, rir: nil, tempo: nil, descansoS: nil),
            SerieHecha(indice: 5, estado: .hecha, reps: 10, kg: nil, repsPedidas: nil, kgPedidos: nil,
                       rpe: nil, rir: nil, tempo: nil, descansoS: nil),
        ]
        XCTAssertEqual(VolumenDeFuerza.kg(series), 830)
        XCTAssertEqual(VolumenDeFuerza.masPesada(series)?.indice, 3)
        XCTAssertNil(VolumenDeFuerza.kg(Array(series.suffix(1))), "peso corporal: sin volumen, no 0")
    }

    // MARK: - Los parciales del monitor

    func testLosParcialesDelErgoLleganAlBloque() throws {
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: try detalle(segmentos: """
          {"position": 0, "item_uid": null, "modality": "row", "duration_seconds": 420,
           "distance_meters": 1500, "drag_factor": 120,
           "erg_splits": [
             {"index": 1, "time_seconds": 105.2, "distance_meters": 500,
              "avg_pace_s_per_500m": 105.2, "stroke_rate_spm": 28, "avg_power_w": 300},
             {"index": 2, "time_seconds": 106.0, "distance_meters": 500,
              "avg_pace_s_per_500m": 106.0, "stroke_rate_spm": 27, "avg_power_w": 290,
              "rest_time_seconds": 60}
           ]}
        """)))
        let bloque = try XCTUnwrap(sesion.bloques.first)
        XCTAssertEqual(bloque.parciales.count, 2)
        XCTAssertEqual(bloque.parciales[0].ritmoS500m, 105.2)
        XCTAssertEqual(bloque.parciales[1].descanso, "descanso 1:00")
        XCTAssertEqual(ColumnaDeParcial.medidas(bloque.parciales), [.tiempo, .metros, .ritmo, .paladas])
    }

    /// Un monitor que solo dio el índice no deja columna ninguna: no hay tabla.
    func testUnosParcialesSinMedidaNoTienenColumnas() {
        let vacios = [ParcialDeErgo(ErgSplitActual(
            index: 1, timeSeconds: nil, distanceMeters: nil, avgPaceSPer500m: nil,
            strokeRateSpm: nil, avgPowerW: nil, calories: nil, caloriesPerHour: nil,
            dragFactor: nil, restTimeSeconds: nil, restDistanceMeters: nil, avgHr: nil))]
        XCTAssertTrue(ColumnaDeParcial.medidas(vacios).isEmpty)
    }

    // MARK: - La ronda

    func testConRoundIndexElDesgloseSeAgrupaPorRonda() throws {
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: try detalle(segmentos: """
          {"position": 0, "item_uid": null, "modality": "run", "duration_seconds": 240,
           "distance_meters": 1000, "round_index": 1},
          {"position": 1, "item_uid": null, "modality": "ski", "duration_seconds": 250,
           "distance_meters": 1000, "round_index": 1},
          {"position": 2, "item_uid": null, "modality": "run", "duration_seconds": 245,
           "distance_meters": 1000, "round_index": 2},
          {"position": 3, "item_uid": null, "modality": "other", "duration_seconds": 180,
           "round_index": 2}
        """)))
        let grupos = agruparPorRonda(sesion.bloques)
        XCTAssertEqual(grupos.map(\.ronda), [1, 2], "escala guardada: N = ronda N")
        XCTAssertEqual(grupos.map { $0.bloques.count }, [2, 2])
    }

    /// `round_index: 0` = la unidad no se repite: lista plana, sin cabecera de ronda.
    func testRoundIndexCeroNoEsUnaRonda() throws {
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: try detalle(segmentos: """
          {"position": 0, "item_uid": null, "modality": "run", "duration_seconds": 240,
           "distance_meters": 1000, "round_index": 0},
          {"position": 1, "item_uid": null, "modality": "strength", "duration_seconds": 300,
           "round_index": 0}
        """)))
        XCTAssertEqual(agruparPorRonda(sesion.bloques).map(\.ronda), [nil])
    }

    // MARK: - El detalle por ejecución, sin asignación

    private let importado = """
    {
      "execution_id": "5120", "off_plan_reason": "no_assignment",
      "assignment": null, "workout": null,
      "execution": {"execution_id": "5120", "completeness": "completed",
                    "contributing_sources": ["healthkit"], "recorded_via": "imported",
                    "started_at": "2026-09-27T08:15:00Z", "ended_at": "2026-09-27T08:47:00Z",
                    "total_duration_seconds": 1920,
                    "segments": [
                      {"position": 0, "item_uid": null, "modality": "strength",
                       "duration_seconds": 1920, "sets": [], "volume_kg": null}
                    ]},
      "run_compliance": null
    }
    """

    func testUnaEjecucionSinAsignacionSeLeeIgual() throws {
        let d = try decoder().decode(ExecutionDetail.self, from: Data(importado.utf8))
        XCTAssertNil(d.assignment)
        XCTAssertEqual(d.executionId, "5120")
        XCTAssertEqual(d.offPlanReason, "no_assignment")
        XCTAssertEqual(d.fechaISO, "2026-09-27", "sin plan, el día sale de cuándo empezó")
        let sesion = try XCTUnwrap(LecturaDeSesionDesdeDetalle.sesion(de: d, tituloAlternativo: "Fuerza"))
        XCTAssertEqual(sesion.titulo, "Fuerza")
        XCTAssertEqual(sesion.bloques.first?.etiqueta, "Fuerza", "sin plan no hay ejercicio que nombrar")
        XCTAssertNil(sesion.resultado)
    }

    // MARK: - El historial: la fila enseña lo que puntúa

    private func fila(_ campos: [String: String]) throws -> AthleteHistorySession {
        var base: [String: String] = [
            "execution_id": "\"77\"", "assignment_id": "\"12\"", "title": "\"Sesión\"",
            "total_duration_seconds": "1500", "score_time_s": "null", "rpe": "8",
            "with_partner": "false", "has_route": "false", "origin": "\"coach\"",
            "score_rounds": "null", "score_reps": "null", "distance_m": "null",
            "modality": "null", "recorded_via": "\"live\"", "off_plan_reason": "null",
        ]
        for (k, v) in campos { base[k] = v }
        let json = "{" + base.map { "\"\($0.key)\": \($0.value)" }.joined(separator: ", ") + "}"
        return try decoder().decode(AthleteHistorySession.self, from: Data(json.utf8))
    }

    func testAmrapRondasMasReps() throws {
        let s = try fila(["score_rounds": "5", "score_reps": "8", "modality": "\"other\""])
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "5 + 8", etiqueta: "rondas + reps"))
        let justas = try fila(["score_rounds": "6", "score_reps": "0"])
        XCTAssertEqual(justas.resultado, ResultadoDeFila(valor: "6", etiqueta: "rondas"))
    }

    func testForTimeEsSuTiempoFinal() throws {
        let s = try fila(["score_time_s": "2832"])
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "47:12", etiqueta: "resultado"))
    }

    func testCarreraEsDistanciaYRitmo() throws {
        let s = try fila(["modality": "\"run\"", "distance_m": "10000", "total_duration_seconds": "3000"])
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "10,00 km", etiqueta: "5:00/km"))
    }

    func testRemoEsDistanciaYRitmoPor500() throws {
        let s = try fila(["modality": "\"row\"", "distance_m": "2000", "total_duration_seconds": "420"])
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "2,00 km", etiqueta: "1:45/500m"))
    }

    func testBiciEsDistanciaSinRitmo() throws {
        let s = try fila(["modality": "\"bike\"", "distance_m": "800", "total_duration_seconds": "90"])
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "800 m", etiqueta: "distancia"))
    }

    /// La fuerza no trae volumen en el historial (el servidor no lo manda por fila):
    /// se enseña su duración, nunca un volumen inventado.
    func testFuerzaSinVolumenServidoEsSuDuracion() throws {
        let s = try fila(["modality": "\"strength\""])
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "25:00", etiqueta: "duración"))
    }

    func testLoHechoSinAsignacionSeAbrePorSuEjecucion() throws {
        let s = try fila(["assignment_id": "null", "origin": "null",
                          "recorded_via": "\"imported\"", "off_plan_reason": "\"no_assignment\""])
        XCTAssertNil(s.assignmentId)
        XCTAssertEqual(s.destino, .ejecucion("77"))
        XCTAssertEqual(s.id, "e77")
        XCTAssertEqual(try fila([:]).destino, .asignacion("12"))
    }

    /// La respuesta de antes (sin los campos nuevos) sigue decodificando.
    func testUnaFilaAntiguaSigueDecodificando() throws {
        let json = """
        {"assignment_id": "12", "title": "Sesión", "total_duration_seconds": 600,
         "score_time_s": null, "rpe": null, "with_partner": false, "has_route": false,
         "origin": "coach"}
        """
        let s = try decoder().decode(AthleteHistorySession.self, from: Data(json.utf8))
        XCTAssertNil(s.executionId)
        XCTAssertEqual(s.destino, .asignacion("12"))
        XCTAssertEqual(s.resultado, ResultadoDeFila(valor: "10:00", etiqueta: "duración"))
    }
}
