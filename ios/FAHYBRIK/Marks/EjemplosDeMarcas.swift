#if DEBUG
import Foundation

// LOS EJEMPLOS DE «TUS MARCAS»: el catálogo y las marcas que las previews, la galería y las pruebas pintan.
//
// NO son datos de producción. Se construyen por el CABLE (JSON decodificado con el mismo decodificador de la app)
// y no a mano, así una captura prueba también que lo que manda el servidor llega hasta el píxel. El reloj es fijo
// (`ahora`): «hace 3 semanas» no cambia con el día en que se corre la prueba.

enum EjemplosDeMarcas {

    /// El instante que las lecturas de los ejemplos toman por «ahora».
    static let ahora = ISO8601DateFormatter().date(from: "2026-09-30T12:00:00Z")!

    // MARK: Constructores

    /// Un resultado de `athlete_benchmarks`, con su edad en días.
    struct Resultado {
        let valor: Double
        let haceDias: Int
        var origen = DataOrigin.athleteTest
        var contexto: String? = nil
        var carrera: String? = nil
    }

    private static func json(_ r: Resultado, id: String) -> [String: Any] {
        let fecha = ISO8601DateFormatter().string(from: ahora.addingTimeInterval(-Double(r.haceDias) * 86_400))
        var campos: [String: Any] = ["id": id, "value": r.valor, "recorded_at": fecha, "source": r.origen]
        if let contexto = r.contexto { campos["run_context"] = contexto }
        if let carrera = r.carrera { campos["event_name"] = carrera }
        return campos
    }

    /// Una prueba del catálogo. `historial` va del más reciente al más viejo; la mejor y la última salen de él.
    static func marca(
        _ slug: String,
        _ etiqueta: String,
        grupo: String,
        medidoPor: String,
        aprox: String,
        unidad: String = "seconds",
        menorEsMejor: Bool = true,
        distanciaM: Double? = 1000,
        duracionFijaS: Int? = nil,
        historial: [Resultado] = [],
        gemelo: (segundos: Double, carrera: String)? = nil
    ) -> MarkView {
        var campos: [String: Any] = [
            "slug": slug, "label": etiqueta, "group": grupo, "measured_by": medidoPor, "unit": unidad,
            "lower_is_better": menorEsMejor, "approx_label": aprox,
            "history": historial.enumerated().map { json($1, id: "\(slug)-\($0)") },
        ]
        if let distanciaM { campos["target_distance_m"] = distanciaM }
        if let duracionFijaS { campos["fixed_duration_s"] = duracionFijaS }
        if medidoPor == "erg" { campos["erg"] = slug.hasPrefix("ski") ? "ski" : "row" }

        // La mejor: el menor tiempo (o la mayor distancia). La última: la más reciente.
        let indices = historial.indices
        let esMejor: (Int, Int) -> Bool = { menorEsMejor ? historial[$0].valor < historial[$1].valor : historial[$0].valor > historial[$1].valor }
        if let mejor = indices.min(by: esMejor) {
            campos["best"] = json(historial[mejor], id: "\(slug)-\(mejor)")
            campos["latest"] = json(historial[0], id: "\(slug)-0")
        }
        // Los récords por contexto de correr: el mejor de cada uno.
        for (clave, contexto) in [("best_outdoor", "outdoor"), ("best_treadmill", "treadmill")] {
            let delContexto = indices.filter { historial[$0].contexto == contexto }
            if let mejor = delContexto.min(by: esMejor) {
                campos[clave] = json(historial[mejor], id: "\(slug)-\(mejor)")
            }
        }
        if let gemelo {
            campos["race_twin"] = ["seconds": gemelo.segundos, "race_name": gemelo.carrera, "race_date": "2026-05-17"]
        }
        return decodifica(campos)
    }

    private static func decodifica(_ campos: [String: Any]) -> MarkView {
        let decodificador = JSONDecoder()
        decodificador.keyDecodingStrategy = .convertFromSnakeCase
        // swiftlint:disable:next force_try
        let datos = try! JSONSerialization.data(withJSONObject: campos)
        // swiftlint:disable:next force_try
        return try! decodificador.decode(MarkView.self, from: datos)
    }

    // MARK: Las marcas

    /// Remo 500 m con historial: cuatro intentos, y la mejor no es la última.
    static let remo500 = marca(
        "row_500", "Remo 500 m", grupo: "ergo", medidoPor: "erg", aprox: "~1:45",
        historial: [
            Resultado(valor: 112, haceDias: 6),
            Resultado(valor: 109, haceDias: 40),
            Resultado(valor: 114, haceDias: 90, origen: DataOrigin.coachTest),
            Resultado(valor: 121, haceDias: 200, origen: DataOrigin.onboarding),
        ]
    )

    /// 5K con récord por contexto (calle y cinta) y su gemelo de carrera: el caso más completo.
    static let cincoK = marca(
        "run_5k", "5K", grupo: "run", medidoPor: "run", aprox: "~22:00", distanciaM: 5000,
        historial: [
            Resultado(valor: 1_296, haceDias: 9, contexto: "treadmill"),
            Resultado(valor: 1_264, haceDias: 25, contexto: "outdoor"),
            Resultado(valor: 1_301, haceDias: 71, contexto: "outdoor"),
        ],
        gemelo: (1_338, "Cursa de la Mercè")
    )

    /// Cooper: se puntúa en METROS (más es mejor) y no tiene ritmo derivado: la línea de apoyo es solo la fecha.
    static let cooper = marca(
        "run_cooper", "Cooper 12 min", grupo: "run", medidoPor: "run", aprox: "~2.600 m",
        unidad: "meters", menorEsMejor: false, distanciaM: nil, duracionFijaS: 720,
        historial: [Resultado(valor: 2_840, haceDias: 3, contexto: "outdoor"), Resultado(valor: 2_710, haceDias: 60, contexto: "outdoor")]
    )

    /// Una marca que el atleta nunca ha probado.
    static let diezKSinMarca = marca("run_10k", "10K", grupo: "run", medidoPor: "run", aprox: "~46:00", distanciaM: 10_000)

    /// Una carrera que se registra, sin ningún tiempo todavía.
    static let mediaSinTiempo = marca(
        "race_media", "Media maratón", grupo: "race", medidoPor: "registered", aprox: "~1:45:00", distanciaM: 21_097
    )

    /// Una carrera registrada, con su nombre como sello y una declarada al entrar.
    static let diezKPopular = marca(
        "race_10k", "10K popular", grupo: "race", medidoPor: "registered", aprox: "~46:00", distanciaM: 10_000,
        historial: [
            Resultado(valor: 2_735, haceDias: 20, origen: DataOrigin.registered, carrera: "Cursa del Poblenou"),
            Resultado(valor: 2_820, haceDias: 400, origen: DataOrigin.onboarding),
        ]
    )

    // MARK: Los catálogos

    /// El catálogo de 12 pruebas de un coach; las `conRecord` primeras traen su mejor marca, el resto llegan sin
    /// ninguna, que es literalmente el alta.
    static func catalogo(conRecord: Int) -> [MarkView] {
        let pruebas: [(String, String, String, String, String, Double)] = [
            ("run_1k", "1 km", "run", "run", "~4:00", 1_000),
            ("run_cooper", "Cooper 12 min", "run", "run", "~2.600 m", 1_000),
            ("run_5k", "5K", "run", "run", "~22:00", 5_000),
            ("run_10k", "10K", "run", "run", "~46:00", 10_000),
            ("row_500", "Remo 500 m", "ergo", "erg", "~1:45", 500),
            ("row_2k", "Remo 2K", "ergo", "erg", "~7:30", 2_000),
            ("row_5k", "Remo 5K", "ergo", "erg", "~20:00", 5_000),
            ("ski_500", "Ski 500 m", "ergo", "erg", "~1:55", 500),
            ("ski_1k", "Ski 1 km", "ergo", "erg", "~4:05", 1_000),
            ("race_hyrox", "HYROX", "race", "registered", "~1:30:00", 1_000),
            ("race_10k", "10K popular", "race", "registered", "~46:00", 10_000),
            ("race_media", "Media maratón", "race", "registered", "~1:45:00", 21_097),
        ]
        return pruebas.enumerated().map { i, p in
            marca(
                p.0, p.1, grupo: p.2, medidoPor: p.3, aprox: p.4, distanciaM: p.5,
                historial: i < conRecord ? [Resultado(valor: 232 + Double(i) * 40, haceDias: 6 + i * 9)] : []
            )
        }
    }

    /// Un atleta que lleva tiempo: marcas propias, de su coach, una carrera con nombre y una declarada.
    static let veterano: [MarkView] = [
        cincoK, cooper, diezKSinMarca,
        remo500,
        marca("row_2k", "Remo 2K", grupo: "ergo", medidoPor: "erg", aprox: "~7:30", distanciaM: 2_000,
              historial: [Resultado(valor: 452, haceDias: 33, origen: DataOrigin.coachTest)]),
        marca("ski_500", "Ski 500 m", grupo: "ergo", medidoPor: "erg", aprox: "~1:55", distanciaM: 500),
        diezKPopular, mediaSinTiempo,
    ]
}
#endif
