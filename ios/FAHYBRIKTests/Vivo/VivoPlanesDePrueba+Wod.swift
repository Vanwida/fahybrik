import XCTest
@testable import FAHYBRIK

// LOS PLANES DEL CONTRATO DEL WOD (`screens/iphone-vivo-wod/planes.ts` y los
// de la muñeca que reutiliza, `screens/reloj-wod/planes.ts`), escritos como los
// escribe el coach: el mismo JSON que decodifica la app. Un plan, un motor de
// verdad, cero mocks.
extension VivoPlanesDePrueba {

    static func kgImplementos(_ v: Double, _ n: Int) -> String { "{ \"kind\": \"kg\", \"value\": \(v), \"implement_count\": \(n) }" }
    static let corporal = "{ \"kind\": \"bodyweight\" }"
    static func rpe(_ v: Double) -> String { "{ \"kind\": \"rpe\", \"value\": \(v) }" }

    /// 498 · EMOM 12′ alterno: 6 Bench Press 60 kg · Row todo el minuto.
    static func emom498() throws -> WorkoutPlan {
        let bench = "{ \"scheme\": \"emom\", \"modality\": \"strength\", \"rounds\": 12, \"work_s\": 60, \"sets\": [\(set(reps(6), target: kg(60)))] }"
        let row = "{ \"scheme\": \"emom\", \"modality\": \"row\", \"rounds\": 12, \"work_s\": 60, \"sets\": [\(set(segs(60)))] }"
        return try plan("EMOM 12", [bloque("Metcon — EMOM 12", formato: "emom", pos: 1, [
            item("w1", "Bench Press", cat: "strength", rx: bench), item("w2", "Row", cat: "rowing", rx: row)])])
    }

    /// AMRAP 12′ con remo: 250 m Row · 15 Wall Ball 9 kg · 10 Burpee (26 «reps» por ronda: el Row cuenta 1).
    static func amrapRemo() throws -> WorkoutPlan {
        func rx(_ s: String) -> String { "{ \"scheme\": \"amrap\", \"total_s\": 720, \"sets\": [\(s)] }" }
        return try plan("AMRAP 12 con remo", [bloque("Metcon — AMRAP 12", formato: "amrap", pos: 1, [
            item("a1", "Row", cat: "rowing", rx: rx(set(metros(250), mod: "row"))),
            item("a2", "Wall Ball", cat: "functional", rx: rx(set(reps(15), target: kg(9)))),
            item("a3", "Burpee", cat: "functional", rx: rx(set(reps(10), target: corporal)))])])
    }

    /// AMRAP 20′ libre (Cindy): 5 Pull-up · 10 Push-up · 15 Air Squat.
    static func amrapLibre() throws -> WorkoutPlan {
        func rx(_ n: Int) -> String { "{ \"scheme\": \"amrap\", \"total_s\": 1200, \"sets\": [\(set(reps(n), target: corporal))] }" }
        return try plan("Cindy", [bloque("AMRAP 20", formato: "amrap", pos: 1, [
            item("c1", "Pull-up", cat: "functional", rx: rx(5)),
            item("c2", "Push-up", cat: "functional", rx: rx(10)),
            item("c3", "Air Squat", cat: "functional", rx: rx(15))])])
    }

    /// For Time · chipper de 10 estaciones, cap 25′: el Row por calorías lo mide el remo; la carrera, el GPS.
    static func chipper10() throws -> WorkoutPlan {
        let estaciones: [(String, String, String)] = [
            ("Double Under", "functional", set(reps(50), target: corporal)),
            ("Wall Ball", "functional", set(reps(40), target: kg(9))),
            ("Row", "rowing", set(cal(30), mod: "row")),
            ("Burpee", "functional", set(reps(20), target: corporal)),
            ("KB Swing", "functional", set(reps(30), target: kg(24))),
            ("Box Jump", "functional", set(reps(20), target: corporal)),
            ("Toes to Bar", "functional", set(reps(20), target: corporal)),
            ("Sandbag Lunge", "functional", set(metros(50), target: kg(20))),
            ("Farmers Carry", "functional", set(metros(100), target: kgImplementos(24, 2))),
            ("Run", "running", set(metros(800), mod: "run")),
        ]
        let items = estaciones.enumerated().map { i, e in
            item("t\(i)", e.0, cat: e.1, rx: "{ \"scheme\": \"chipper\", \"total_s\": 1500, \"sets\": [\(e.2)] }")
        }
        return try plan("Chipper 25′", [bloque("Chipper — cap 25′", formato: "chipper", pos: 1, items)])
    }

    /// Tabata 8 × 20″/10″ de Burpee a RPE 10.
    static func tabataBurpee() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"tabata\", \"rounds\": 8, \"work_s\": 20, \"rest_s\": 10, \"target\": \(rpe(10)), \"sets\": [\(set(reps(8), target: rpe(10)))] }"
        return try plan("Tabata", [bloque("Tabata — Burpee", formato: "tabata", pos: 1, [item("t1", "Burpee", cat: "functional", rx: rx)])])
    }

    /// Death by Burpee: 1 el minuto 1, +1 cada minuto, sin tope.
    static func deathByBurpee() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"death_by\", \"start\": 1, \"increment\": 1, \"work_s\": 60, \"sets\": [\(set(reps(1), target: corporal))] }"
        return try plan("Death by Burpee", [bloque("Death by Burpee", formato: "death_by", pos: 1, [item("d1", "Burpee", cat: "functional", rx: rx)])])
    }
}
