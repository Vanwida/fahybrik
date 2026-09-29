#if DEBUG
import Foundation

// LOS DATOS DE EJEMPLO DE LAS HOJAS de «Carreras»: lo que devuelven el calendario y la búsqueda por
// nombre, y las carreras ya fijadas sobre las que se abre «Tu tiempo objetivo». Espejo de `datos.ts`
// (`CALENDARIO`, `CANDIDATOS`). NINGUNO sale de producción (CONTRATO-UI §7): personas y carreras
// inventadas. Los modelos del servidor son solo `Decodable`, así que se construyen decodificando el
// mismo JSON que manda el servidor — que de paso prueba que el ejemplo tiene la forma del cable.

extension CasosCarreras {

    private static func decodifica<T: Decodable>(_ tipo: T.Type, _ json: [String: Any]) -> T {
        guard let datos = try? JSONSerialization.data(withJSONObject: json),
              let valor = try? APIClient.makeJSONDecoder().decode(T.self, from: datos)
        else { fatalError("El ejemplo de \(T.self) no se decodifica: \(json)") }
        return valor
    }

    // MARK: El calendario (lo que devuelve «Buscar carrera»)

    private static func evento(
        _ id: String, _ nombre: String, familia: String, serie: String?, ciudad: String, pais: String,
        dias: Int?, tipo: String
    ) -> RaceCalendarEvent {
        var json: [String: Any] = [
            "event_id": id, "slug": id, "name": nombre, "family": familia, "type": tipo,
            "location": ciudad, "country": pais, "is_tentative": dias == nil, "is_custom": false,
            "division_options": [],
        ]
        if let serie { json["series"] = serie }
        if let dias { json["start_date"] = en(dias) }
        return decodifica(RaceCalendarEvent.self, json)
    }

    static let eventos: [RaceCalendarEvent] = [
        evento("5", "HYROX Barcelona", familia: "hybrid", serie: "hyrox", ciudad: "Barcelona", pais: "ES", dias: 39, tipo: "hyrox"),
        evento("6", "HYROX Madrid", familia: "hybrid", serie: "hyrox", ciudad: "Madrid", pais: "ES", dias: 12, tipo: "hyrox"),
        evento("7", "HYROX Girona", familia: "hybrid", serie: "hyrox", ciudad: "Girona", pais: "ES", dias: 71, tipo: "hyrox"),
        evento("8", "DEKA Mile Sevilla", familia: "hybrid", serie: "deka", ciudad: "Sevilla", pais: "ES", dias: 96, tipo: "other"),
        evento("9", "HYROX Lisboa", familia: "hybrid", serie: "hyrox", ciudad: "Lisboa", pais: "PT", dias: 124, tipo: "hyrox"),
        evento("10", "HYROX Valencia", familia: "hybrid", serie: "hyrox", ciudad: "Valencia", pais: "ES", dias: nil, tipo: "hyrox"),
        evento("11", "Mitja Marató de Barcelona", familia: "running", serie: "rfea", ciudad: "Barcelona", pais: "ES", dias: 141, tipo: "running"),
        evento("12", "CrossFit Open Iberia", familia: "crossfit", serie: "cf_open", ciudad: "Madrid", pais: "ES", dias: 168, tipo: "crossfit"),
    ]

    static func evento(_ nombre: String) -> RaceCalendarEvent {
        guard let e = eventos.first(where: { $0.name == nombre }) else { fatalError("Evento de ejemplo desconocido: \(nombre)") }
        return e
    }

    // MARK: La búsqueda por nombre (lo que devuelve «Importar carrera»)

    private static let perfiles: [(id: String, nombre: String, slug: String, carreras: Int, pais: String, nivel: String?)] = [
        ("c1", "Marc Vila Soler", "marc-vila-soler", 5, "ESP", nil),
        ("c2", "Marc Vila", "marc-vila", 2, "ESP", "PRO"),
        ("c3", "Marco Vilá", "marco-vila", 9, "ITA", "ELITE"),
    ]

    static let candidatos: [HyresultCandidate] = perfiles.map { p in
        decodifica(HyresultCandidate.self, [
            "id": p.id, "name": p.nombre, "slug": p.slug, "races_count": p.carreras, "nation": p.pais,
            "level": p.nivel.map { $0 as Any } ?? NSNull(),
        ])
    }

    // MARK: Las carreras ya fijadas (sobre las que se abre «Tu tiempo objetivo»)

    static func carreraFijada(
        _ raceId: Int, _ nombre: String, dias: Int, tipo: String = "hyrox", meta: Int? = nil
    ) -> UpcomingRace {
        decodifica(UpcomingRace.self, [
            "race_id": raceId, "event_id": raceId, "name": nombre, "event_type": tipo, "format": "singles",
            "division": "open", "gender_category": "men", "race_date": en(dias), "location": "Fira de Barcelona",
            "goal_time_seconds": meta.map { $0 as Any } ?? NSNull(), "days_until": dias, "priority": "target",
        ])
    }
}
#endif
