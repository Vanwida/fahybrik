#if DEBUG
import Foundation

// LOS CASOS DE EJEMPLO DE LOS DETALLES de «Carreras» — el detalle de una carrera (individual, de
// dobles, secundaria, que no es HYROX), el de una estación y el reparto de una estación de dobles. Para
// las `#Preview` y la galería de pruebas; no se compilan en release.
//
// NINGUNO sale de producción (CONTRATO-UI §7; «no hay atletas reales»): personas y carreras inventadas.
// Los modelos del servidor son solo `Decodable`, así que se construyen decodificando el MISMO JSON que
// manda el servidor: de paso, el ejemplo prueba que tiene la forma del cable. Las fechas cuelgan de
// `CasosCarreras.hoy`, como las de la pestaña.

enum CasosDetalleCarreras {

    private static func decodifica<T: Decodable>(_ tipo: T.Type, _ json: String) -> T {
        guard let datos = json.data(using: .utf8),
              let valor = try? APIClient.makeJSONDecoder().decode(T.self, from: datos)
        else { fatalError("El ejemplo de \(T.self) no se decodifica: \(json)") }
        return valor
    }

    private static func carrera(
        _ id: Int, _ nombre: String, tipo: String = "hyrox", formato: String = "singles",
        genero: String = "men", dias: Int = 39, meta: Int?, prioridad: String = "target", lugar: String = "Fira de Barcelona"
    ) -> UpcomingRace {
        decodifica(UpcomingRace.self, """
        { "race_id": \(id), "event_id": \(id), "name": "\(nombre)", "event_type": "\(tipo)", "format": "\(formato)",
          "division": "open", "gender_category": "\(genero)", "race_date": "\(CasosCarreras.en(dias))",
          "location": "\(lugar)", "goal_time_seconds": \(meta.map(String.init) ?? "null"), "days_until": \(dias),
          "priority": "\(prioridad)" }
        """)
    }

    // MARK: Carreras

    static func principal(meta: Int?) -> UpcomingRace { carrera(201, "HYROX Barcelona", meta: meta) }
    static let secundaria = carrera(202, "HYROX Madrid", dias: 12, meta: 4080, prioridad: "tune_up", lugar: "IFEMA Madrid")
    static func running(meta: Int?) -> UpcomingRace {
        carrera(341, "Mitja Marató de Barcelona", tipo: "other", dias: 141, meta: meta, lugar: "Barcelona")
    }
    static let dobles = carrera(203, "HYROX Girona", formato: "doubles", genero: "mixed", dias: 71, meta: 3900, lugar: "Fira de Girona")

    // MARK: El predicho individual (goal-gap)

    static let gapSinMeta = decodifica(GoalGap.self, #"{ "availability": "no_goal", "segments": [] }"#)
    static let gapSinDatos = decodifica(GoalGap.self, #"{ "availability": "no_data", "segments": [] }"#)
    static let gapParcial = decodifica(GoalGap.self, """
    { "availability": "ok", "predicted_total_s": null, "gap_s": null, "budget_source": "cohorte",
      "segments": [
        { "slug": "run", "label_es": "Carrera · 8 km", "kind": "run", "budget_s": 1860, "predicted_s": 1905, "tier": "observado", "delta_s": 45 },
        { "slug": "ski", "label_es": "SkiErg", "kind": "station", "budget_s": 250, "predicted_s": 244, "tier": "estimado", "delta_s": -6 },
        { "slug": "sled_push", "label_es": "Sled Push", "kind": "station", "budget_s": 160, "predicted_s": null, "tier": "sin_datos", "delta_s": null },
        { "slug": "wall_balls", "label_es": "Wall Balls", "kind": "station", "budget_s": 310, "predicted_s": null, "tier": "sin_datos", "delta_s": null }
      ] }
    """)

    // MARK: El predicho de la pareja (race-gap de dobles)

    private static let tramosDeDobles = """
    [
      { "key": "run", "label_es": "Carrera · 8 km", "kind": "run", "station_index": null, "carrier": "together", "self_share": null,
        "budget_s": 1920, "pair_predicted_s": 1968, "delta_s": 48, "self_solo_s": null, "partner_solo_s": null, "tier": "observado" },
      { "key": "ski", "label_es": "SkiErg", "kind": "station", "station_index": 1, "carrier": "split", "self_share": 0.6,
        "budget_s": 230, "pair_predicted_s": 224, "delta_s": -6, "self_solo_s": 236, "partner_solo_s": 206, "tier": "observado" },
      { "key": "sled_push", "label_es": "Sled Push", "kind": "station", "station_index": 2, "carrier": "self", "self_share": 1,
        "budget_s": 150, "pair_predicted_s": 171, "delta_s": 21, "self_solo_s": 171, "partner_solo_s": 198, "tier": "observado" },
      { "key": "sled_pull", "label_es": "Sled Pull", "kind": "station", "station_index": 3, "carrier": "partner", "self_share": 0,
        "budget_s": 190, "pair_predicted_s": 186, "delta_s": -4, "self_solo_s": 214, "partner_solo_s": 186, "tier": "estimado" },
      { "key": "roxzone", "label_es": "RoxZone", "kind": "roxzone", "station_index": null, "carrier": "together", "self_share": null,
        "budget_s": 360, "pair_predicted_s": 372, "delta_s": 12, "self_solo_s": null, "partner_solo_s": null, "tier": "estimado" }
    ]
    """

    static let doblesOk = decodifica(DoblesRaceGap.self, """
    { "availability": "ok", "race_name": "HYROX Girona", "race_date": "\(CasosCarreras.en(71))", "partner_name": "Aina",
      "goal_s": 3900, "goal_label": "Sub-65", "predicted_total_s": 3871, "gap_s": -29, "segments": \(tramosDeDobles),
      "coach_tips": ["Salid juntos en el primer km: nada de sprint.", "En el sled push, cambiad cada 12 m."],
      "strategy_last_edited_by": "Aina" }
    """)

    static let doblesParcial = decodifica(DoblesRaceGap.self, """
    { "availability": "partial", "race_name": "HYROX Girona", "partner_name": "Aina", "goal_s": null, "goal_label": null,
      "predicted_total_s": null, "gap_s": null,
      "segments": [
        { "key": "run", "label_es": "Carrera · 8 km", "kind": "run", "station_index": null, "carrier": "together", "self_share": null,
          "budget_s": 1920, "pair_predicted_s": 1968, "delta_s": 48, "self_solo_s": null, "partner_solo_s": null, "tier": "observado" },
        { "key": "wall_balls", "label_es": "Wall Balls", "kind": "station", "station_index": 8, "carrier": "split", "self_share": null,
          "budget_s": 300, "pair_predicted_s": 320, "delta_s": 20, "self_solo_s": null, "partner_solo_s": 320, "tier": "sin_datos" }
      ],
      "coach_tips": [], "strategy_last_edited_by": null }
    """)

    static let doblesSinDatos = decodifica(DoblesRaceGap.self, """
    { "availability": "no_data", "race_name": "HYROX Girona", "partner_name": "Aina", "segments": [], "coach_tips": [] }
    """)

    // MARK: Una estación

    static let estacion = decodifica(StationDetail.self, """
    { "id": "sled_push", "station": "Sled Push", "technique_video_url": null, "last_time": "2:48", "benchmark_time": "2:36",
      "delta": "+0:12", "severity": "slightly_worse", "fraction": 0.58, "percentile_label": "top 42 %",
      "trend": [
        { "id": "t1", "label": "nov 24", "height": 0.9, "time": "3:12", "severity": "worse" },
        { "id": "t2", "label": "mar 25", "height": 0.74, "time": "2:59", "severity": "slightly_worse" },
        { "id": "t3", "label": "may 26", "height": 0.62, "time": "2:48", "severity": "slightly_worse" }
      ],
      "sub_metrics": [
        { "id": "best", "label": "Mejor tramo", "value": "0:38", "unit": null, "emphasis": "ok" },
        { "id": "stops", "label": "Paradas", "value": "3", "unit": null, "emphasis": "warning" },
        { "id": "weight", "label": "Carga del trineo", "value": "152", "unit": "kg", "emphasis": null },
        { "id": "avg", "label": "Media por tramo", "value": null, "unit": null, "emphasis": null }
      ],
      "training": [
        { "id": "n", "title": "Empuje de trineo · 6×25 m", "group": null, "count": null, "next_label": "viernes", "modality": "strength" },
        { "id": "a", "title": "Fuerza base · piernas", "group": "G01 · sentadilla, empuje", "count": "×8", "next_label": null, "modality": "strength" },
        { "id": "b", "title": "Series de 400", "group": "G03 · umbral", "count": "×5", "next_label": null, "modality": "run" }
      ],
      "ia_recommendation": "Pierdes el ritmo en el tercer tramo: trabaja arrancadas cortas con el trineo cargado y descansos de 20 s.",
      "ia_objective": "sub 2:35" }
    """)

    static let estacionSinTiempo = decodifica(StationDetail.self, """
    { "id": "sled_push", "station": "Sled Push", "technique_video_url": null, "last_time": null, "benchmark_time": "2:36",
      "delta": null, "severity": "better", "fraction": 0, "percentile_label": null, "trend": [], "sub_metrics": [],
      "training": [], "ia_recommendation": null, "ia_objective": null }
    """)
}
#endif
