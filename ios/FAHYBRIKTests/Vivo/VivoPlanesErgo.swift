import XCTest
@testable import FAHYBRIK

// LOS PLANES DE ERGO DEL CONTRATO — los de `screens/iphone-vivo-ergo/planes.ts`,
// escritos como el JSON del coach que decodifica la app (el mismo camino que
// `VivoPlanesDePrueba`). Ilustrativos, como en el doble: ninguna sesión
// asignada trae series de remo a /500, ergo por calorías, BikeErg continuo ni
// remo continuo a zona. El libre sale del constructor del libre
// (`FreePlanDetail`), no de este JSON: un objeto, un camino.
extension VivoPlanesDePrueba {

    static func split500(_ min: Int, _ max: Int) -> String { "{ \"kind\": \"pace\", \"unit\": \"per_500m\", \"min_s\": \(min), \"max_s\": \(max) }" }

    /// La prescripción del remo 5 × 500 m a 1:52–1:56 /500 · r 2′ parado.
    static var rxRemoSeries: String {
        "{ \"scheme\": \"intervals\", \"modality\": \"row\", \"rounds\": 5, \"rest_s\": 120, \"sets\": [\(set(metros(500), target: split500(112, 116), rest: 120))] }"
    }

    /// Remo 5 × 500 m a 1:52–1:56 /500 · r 2′ parado.
    static func remoSeries() throws -> WorkoutPlan {
        try plan("Remo 5×500", [bloque("Remo 5×500", formato: "intervals", pos: 1, [item("e1", "Row Erg", cat: "rowing", rx: rxRemoSeries)])])
    }

    /// SkiErg 5 × 25 cal · r 1′ parado: las calorías las cuenta el ski; sin objetivo.
    static func skiCalorias() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"intervals\", \"modality\": \"ski\", \"rounds\": 5, \"rest_s\": 60, \"sets\": [\(set(cal(25), rest: 60))] }"
        return try plan("SkiErg 5×25 cal", [bloque("SkiErg 5×25 cal", formato: "intervals", pos: 1, [item("e2", "SkiErg", cat: "ski_erg", rx: rx)])])
    }

    /// BikeErg 20′ a 2:05–2:10 /1000: el coach la escribe por km, como su monitor.
    static func biciContinuo() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"steady\", \"modality\": \"bike\", \"sets\": [\(set(segs(1200), target: ritmoKm(125, 130)))] }"
        return try plan("BikeErg 20′", [bloque("BikeErg continuo", formato: "steady", pos: 1, [item("e3", "BikeErg", cat: "bike_erg", rx: rx)])])
    }

    /// Remo 30′ a Z2: continuo a zona; el pulso manda y tiñe.
    static func remoZona() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"steady\", \"modality\": \"row\", \"sets\": [\(set(segs(1800), target: zona(2)))] }"
        return try plan("Remo Z2 30′", [bloque("Remo continuo", formato: "steady", pos: 1, [item("e4", "Row Erg", cat: "rowing", rx: rx)])])
    }

    /// El MISMO remo 5 × 500 montado por el atleta como entreno libre: el detalle
    /// del constructor del libre (`FreePlanDetail`), el ejercicio canónico del remo.
    static func remoSeriesLibre() throws -> WorkoutPlan {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let rx = try d.decode(Prescription.self, from: Data(rxRemoSeries.utf8))
        let detalle = FreePlanDetail.detail(title: "Remo 5×500", modality: FreeModality.row.wire, scheme: .intervals,
                                            items: [FreePlanItem(exercise: FreePlanDetail.ejercicioMedido(.row), prescription: rx)],
                                            focus: "row")
        return try XCTUnwrap(FreePlanDetail.plan(from: detalle, estimatedSeconds: 1500), "plan libre nil")
    }
}
