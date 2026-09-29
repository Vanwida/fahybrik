import XCTest
@testable import FAHYBRIK

// LOS PLANES DE LA FAMILIA CIRCUITO — el mismo JSON del coach que decodifica la
// app, con la forma de las sesiones reales del contrato (`iphone-vivo-circuito`):
//   493 · Compromised: calentamiento Run 6′ Z2 + un bloque «rounds» de 10 piezas
//         (Run 1000 m @RPE 8 · estación que rota · r90″), tal como está en la base.
//   492 · Trineos y carries: Sled Push 5×25 m @180 · Sled Pull 5×25 m @135 ·
//         Farmers 4×100 m @2×32, r90″ (el motor lo pliega en 5 rondas: M4).
//   HYROX · 8 × [Run 1 km + estación] en orden oficial, cargas de la 441, con la
//         Roxzone escrita como pieza (dato del coach; sin ella, 16 piezas).
//   Continuo · remo 15′ → ski 15′ → bici 15′ a Z2 (plantilla 86).
//   Libre · 4 rondas de Run 400 m · 15 Wall Balls 9 kg · Row 500 m (clock).
enum VivoPlanesCircuito {

    private typealias P = VivoPlanesDePrueba

    static func rpe(_ v: Double) -> String { "{ \"kind\": \"rpe\", \"value\": \(v) }" }
    static func kg(_ v: Double, implementos: Int) -> String { "{ \"kind\": \"kg\", \"value\": \(v), \"implement_count\": \(implementos) }" }

    /// Una pieza de una lista de circuito: su esquema, su serie y (si la hay) su dosis de rondas.
    static func pieza(_ uid: String, _ nombre: String, cat: String, esquema: String, _ serie: String,
                      rondas: Int? = nil, rest: Int? = nil, slug: String? = nil) -> String {
        var extra = ""
        if let rondas { extra += ", \"rounds\": \(rondas)" }
        if let rest { extra += ", \"rest_s\": \(rest)" }
        let it = P.item(uid, nombre, cat: cat, rx: "{ \"scheme\": \"\(esquema)\"\(extra), \"sets\": [\(serie)] }")
        guard let slug else { return it }
        return it.replacingOccurrences(of: "\"exercise_slug\": \"\(nombre.lowercased().replacingOccurrences(of: " ", with: "-"))\"",
                                       with: "\"exercise_slug\": \"\(slug)\"")
    }

    static func run(_ uid: String, _ m: Int, esquema: String, target: String? = nil) -> String {
        pieza(uid, "Run", cat: "running", esquema: esquema, P.set(P.metros(m), target: target, mod: "run"))
    }

    static func calentamiento() -> String {
        P.bloque("Calentamiento Pre-HYROX", formato: "warmup", pos: 0, [
            P.item("w1", "Run", cat: "running", rx: "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(P.set(P.segs(360), target: P.zona(2), mod: "run"))] }")])
    }

    /// 493 · Compromised.
    static func sesion493() throws -> WorkoutPlan {
        let r = "rounds"
        let piezas: [String] = [
            run("c1", 1000, esquema: r, target: rpe(8)),
            pieza("c2", "SkiErg", cat: "ski_erg", esquema: r, P.set(P.metros(500), target: rpe(8.5), rest: 90, mod: "ski")),
            run("c3", 1000, esquema: r, target: rpe(8)),
            pieza("c4", "Burpee Broad Jump", cat: "functional", esquema: r, P.set(P.metros(40), rest: 90)),
            run("c5", 1000, esquema: r, target: rpe(8)),
            pieza("c6", "Rowing", cat: "rowing", esquema: r, P.set(P.metros(500), target: rpe(8.5), rest: 90, mod: "row")),
            run("c7", 1000, esquema: r, target: rpe(8)),
            pieza("c8", "Wall Balls", cat: "functional", esquema: r, P.set(P.reps(25), target: P.kg(9), rest: 90)),
            run("c9", 1000, esquema: r, target: rpe(8)),
            pieza("c10", "Sandbag Lunges", cat: "functional", esquema: r, P.set(P.metros(50), target: P.kg(30), rest: 90)),
        ]
        return try P.plan("Compromised", [calentamiento(), P.bloque("5 rondas · Race pace + station rotando", formato: "rounds", pos: 1, piezas)])
    }

    /// 493 con un bloque DETRÁS del circuito (la vuelta a la calma): la Estructura
    /// del circuito enseña la sesión entera, lo de antes y lo de después.
    static func sesion493ConVueltaALaCalma() throws -> WorkoutPlan {
        let calma = P.bloque("Vuelta a la calma", formato: "steady", pos: 2, [
            P.item("v1", "Run", cat: "running", rx: "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(P.set(P.segs(300), target: P.zona(1), mod: "run"))] }")])
        let r = "rounds"
        let piezas: [String] = [
            run("c1", 1000, esquema: r, target: rpe(8)),
            pieza("c2", "SkiErg", cat: "ski_erg", esquema: r, P.set(P.metros(500), target: rpe(8.5), rest: 90, mod: "ski")),
            run("c3", 1000, esquema: r, target: rpe(8)),
            pieza("c4", "Burpee Broad Jump", cat: "functional", esquema: r, P.set(P.metros(40), rest: 90)),
        ]
        return try P.plan("Compromised corto", [calentamiento(), P.bloque("2 rondas · Race pace", formato: "rounds", pos: 1, piezas), calma])
    }

    /// 492 · Trineos y carries (cuentas distintas por ítem; el motor las pliega en 5).
    static func sesion492() throws -> WorkoutPlan {
        let r = "rounds"
        let piezas = [
            pieza("t1", "Sled Push", cat: "functional", esquema: r, P.set(P.metros(25), target: P.kg(180), rest: 90), rondas: 5, rest: 90),
            pieza("t2", "Sled Pull", cat: "functional", esquema: r, P.set(P.metros(25), target: P.kg(135), rest: 90), rondas: 5, rest: 90),
            pieza("t3", "Farmers Carry", cat: "functional", esquema: r, P.set(P.metros(100), target: kg(32, implementos: 2), rest: 90), rondas: 4, rest: 90),
        ]
        return try P.plan("Fuerza B + Trineos", [P.bloque("Trineos y carries", formato: "rounds", pos: 2, piezas)])
    }

    /// Las 8 estaciones de HYROX en orden oficial, con las cargas de la plantilla 441.
    static let estacionesHyrox: [(nombre: String, cat: String, serie: String)] = [
        ("SkiErg", "ski_erg", P.set(P.metros(1000), mod: "ski")),
        ("Sled Push", "functional", P.set(P.metros(50), target: P.kg(152))),
        ("Sled Pull", "functional", P.set(P.metros(50), target: P.kg(103))),
        ("Burpee Broad Jump", "functional", P.set(P.metros(80))),
        ("Row", "rowing", P.set(P.metros(1000), mod: "row")),
        ("Farmers Carry", "functional", P.set(P.metros(200), target: kg(24, implementos: 2))),
        ("Sandbag Lunges", "functional", P.set(P.metros(100), target: P.kg(20))),
        ("Wall Balls", "functional", P.set(P.reps(100), target: P.kg(6))),
    ]

    /// HYROX completa: 8 × [Run 1 km (+ Roxzone) + estación (+ Roxzone)], cap 90′ (de ejemplo).
    static func hyrox(roxzone: Bool = true, ritmoRun: String? = nil) throws -> WorkoutPlan {
        let h = "hyrox_sim"
        var piezas: [String] = []
        for (k, e) in estacionesHyrox.enumerated() {
            piezas.append(run("h\(k)r", 1000, esquema: h, target: ritmoRun))
            if roxzone { piezas.append(pieza("h\(k)i", "Roxzone", cat: "functional", esquema: h, "{ }", slug: "roxzone-transition")) }
            piezas.append(pieza("h\(k)e", e.nombre, cat: e.cat, esquema: h, e.serie))
            if roxzone, k < estacionesHyrox.count - 1 { piezas.append(pieza("h\(k)o", "Roxzone", cat: "functional", esquema: h, "{ }", slug: "roxzone-transition")) }
        }
        return try P.plan("HYROX Sim", [P.bloque("HYROX Sim", formato: "simulation", pos: 1, piezas, config: "{ \"time_cap_seconds\": 5400 }")])
    }

    /// Continuo remo 15′ → ski 15′ → bici 15′ a Z2 (plantilla 86).
    static func continuo() throws -> WorkoutPlan {
        func tramo(_ uid: String, _ nombre: String, _ cat: String, _ mod: String) -> String {
            pieza(uid, nombre, cat: cat, esquema: "steady", P.set(P.segs(900), target: P.zona(2), mod: mod))
        }
        return try P.plan("Continuo Z2", [P.bloque("Continuo Z2 · remo + ski + bici", formato: "steady", pos: 1, [
            tramo("k1", "Row Erg", "rowing", "row"), tramo("k2", "SkiErg", "ski_erg", "ski"), tramo("k3", "BikeErg", "bike_erg", "bike")])])
    }

    /// Libre: 4 rondas de Run 400 m · 15 Wall Balls 9 kg · Row 500 m, sin coach (el reloj libre).
    static func libre() throws -> WorkoutPlan {
        let sets = [
            "{ \"measure\": \(P.metros(400)), \"modality\": \"run\", \"note\": \"Run\" }",
            "{ \"measure\": \(P.reps(15)), \"target\": \(P.kg(9)), \"note\": \"Wall Balls\" }",
            "{ \"measure\": \(P.metros(500)), \"modality\": \"row\", \"note\": \"Row\" }",
        ]
        let json = """
        { "assignment": { "id": "asg_libre", "athlete_id": "ath_vivo", "scheduled_for": "2026-09-28", "status": "scheduled" },
          "workout": null,
          "clock_format": "rounds",
          "clock_prescription": { "scheme": "rounds", "rounds": 4, "sets": [\(sets.joined(separator: ","))] } }
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let detail = try d.decode(AssignmentDetail.self, from: Data(json.utf8))
        return try XCTUnwrap(WorkoutPlan.from(detail: detail), "plan nil para el libre")
    }
}
