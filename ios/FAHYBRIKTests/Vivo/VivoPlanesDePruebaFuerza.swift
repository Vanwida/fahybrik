import XCTest
@testable import FAHYBRIK

// LOS PLANES DE LA FAMILIA FUERZA — los escenarios del contrato
// (`iphone-vivo-fuerza/casos.ts` y `reloj-fuerza/planes.ts`) escritos como el
// JSON que el coach manda y la app decodifica (`WorkoutPlan.from(detail:)`).
// Lo que la sesión real no trae y hace falta para dibujar se dice como allí:
//   · la RM de sentadilla 186,5 kg llega como `resolved_load` del servidor
//     (la que resuelve 65–70 % en los 121–131 kg de la 529);
//   · el descanso de 2′30″ de la 392 es ilustrativo (el bloque no lo escribe);
//   · la plancha de la 538 va con categoría de fuerza: con la de core el motor
//     no la lleva serie a serie (`usesMultiSetStrength` pide `.strength`).
extension VivoPlanesDePrueba {

    /// Un ejercicio con lo que el servidor añade: la RM resuelta y la nota del coach.
    static func itemFuerza(_ uid: String, _ nombre: String, cat: String = "strength", rx: String,
                           rmKg: Double? = nil, pct: (Double, Double)? = nil, nota: String? = nil) -> String {
        var cargaResuelta = "null"
        if let rmKg, let pct {
            let lo = rmKg * pct.0 / 100, hi = rmKg * pct.1 / 100
            cargaResuelta = """
            { "pct_label": "\(Int(pct.0))–\(Int(pct.1))%", "kg_label": "\(Int(lo.rounded()))–\(Int(hi.rounded())) kg", "min_kg": \(lo), "max_kg": \(hi), "one_rm_kg": \(rmKg), "needs_review": false }
            """
        }
        return """
        { "uid": "\(uid)", "exercise_id": "e_\(uid)", "exercise_name": "\(nombre)", "exercise_slug": "\(nombre.lowercased().replacingOccurrences(of: " ", with: "-"))", "exercise_category": "\(cat)", "exercise_video_url": null, "cues": null, "params_json": {}, "prescription_json": \(rx), "resolved_load": \(cargaResuelta), "notes": \(nota.map { "\"\($0)\"" } ?? "null") }
        """
    }

    static func pctRM(_ lo: Int, _ hi: Int) -> String { "{ \"kind\": \"percent_rm\", \"min\": \(lo), \"max\": \(hi) }" }
    static let corporal = "{ \"kind\": \"bodyweight\" }"

    /// Una prescripción por series: `sets` ya escritas, objetivo y descanso de bloque opcionales.
    static func porSeries(_ scheme: String, _ sets: [String], target: String? = nil, rest: Int? = nil) -> String {
        var partes = ["\"scheme\": \"\(scheme)\"", "\"modality\": \"strength\"", "\"sets\": [\(sets.joined(separator: ","))]"]
        if let target { partes.append("\"target\": \(target)") }
        if let rest { partes.append("\"rest_s\": \(rest)") }
        return "{ " + partes.joined(separator: ", ") + " }"
    }

    static let rmSentadilla = 186.5

    /// P11, contado por ti: Back Squat 5 × 5 · 100 kg · RIR 2 · tempo 3-1-1 · r 2′ (de bloque).
    static func p11() throws -> WorkoutPlan {
        let serie = "{ \"measure\": \(reps(5)), \"target\": \(kg(100)), \"tempo\": \"3-1-1\" }"
        let rx = porSeries("sets", Array(repeating: serie, count: 5), target: rir(2), rest: 120)
        return try plan("Fuerza · P11", [bloque("A — Sentadilla", formato: "straight_sets", pos: 1, [itemFuerza("p11", "Back Squat", rx: rx)])])
    }

    /// 392 · «Fuerza inferior PESADA»: Back Squat 6-6-4-4-3 @75–85 % RM, r 2′30″.
    static func piramide392() throws -> WorkoutPlan {
        let sets = [6, 6, 4, 4, 3].map { set(reps($0), target: pctRM(75, 85)) }
        let rx = porSeries("sets", sets, rest: 150)
        return try plan("Fuerza inferior pesada", [bloque("Fuerza inferior pesada", formato: "straight_sets", pos: 1, [
            itemFuerza("392", "Back Squat", rx: rx, rmKg: rmSentadilla, pct: (75, 85))])])
    }

    /// 529 · movilidad · A: Back Squat 4 × 8 @65–70 % RM («concéntrica explosiva») +
    /// Box Jump 4 × 6, r 2′ · B: Deadlift 4 × 8 @RIR 3 + Bulgarian Split Squat 4 × 6
    /// @RIR 3, r 2′ · Sled Push 6 × 15 m r 90″ · Sandbag Lunges 4 × 25 m r 1′.
    static func sesion529() throws -> WorkoutPlan {
        let mov = "{ \"scheme\": \"warmup\", \"sets\": [\(set(segs(480)))] }"
        let a1 = porSeries("superset", Array(repeating: set(reps(8), target: pctRM(65, 70), rest: 0), count: 4))
        let a2 = porSeries("superset", Array(repeating: set(reps(6), target: corporal, rest: 120), count: 4))
        let b1 = porSeries("superset", Array(repeating: set(reps(8), rest: 0), count: 4), target: rir(3))
        let b2 = porSeries("superset", Array(repeating: set(reps(6), rest: 120), count: 4), target: rir(3))
        let sled = "{ \"scheme\": \"sets\", \"modality\": \"functional\", \"rest_s\": 90, \"sets\": [\(Array(repeating: set(metros(15)), count: 6).joined(separator: ","))] }"
        let lunges = "{ \"scheme\": \"sets\", \"modality\": \"functional\", \"rest_s\": 60, \"sets\": [\(Array(repeating: set(metros(25)), count: 4).joined(separator: ","))] }"
        return try plan("Fuerza tren inferior + sled técnico", [
            bloque("Calentamiento", formato: "warmup", pos: 0, [item("mov", "Hip mobility flow", cat: "mobility", rx: mov)]),
            bloque("A — Superserie", formato: "superset", pos: 1, [
                itemFuerza("A1", "Back Squat", rx: a1, rmKg: rmSentadilla, pct: (65, 70), nota: "concéntrica explosiva"),
                itemFuerza("A2", "Box Jump", cat: "functional", rx: a2)]),
            bloque("B — Superserie", formato: "superset", pos: 2, [
                itemFuerza("B1", "Deadlift", rx: b1),
                itemFuerza("B2", "Bulgarian Split Squat", rx: b2)]),
            bloque("Trineo", formato: "straight_sets", pos: 3, [
                item("sp", "Sled Push", cat: "functional", rx: sled),
                item("sl", "Sandbag Lunges", cat: "functional", rx: lunges)]),
        ])
    }

    /// 538 · glúteo medio: Side Plank 3 × 20″ (sin descanso: «Colócate» entre series)
    /// · Single Leg Glute Bridge 3 × 8.
    static func sesion538() throws -> WorkoutPlan {
        let sp = porSeries("sets", Array(repeating: set(segs(20), target: corporal), count: 3))
        let gb = porSeries("sets", Array(repeating: set(reps(8), target: corporal), count: 3))
        return try plan("Glúteo + carrera", [bloque("Glúteo medio", formato: "straight_sets", pos: 1, [
            itemFuerza("sp", "Side Plank", rx: sp),
            itemFuerza("gb", "Single Leg Glute Bridge", rx: gb)])])
    }

    /// Un LIBRE: Back Squat 4 × 10 r 90″ · Press militar 3 × 8 r 90″, carga suya (sin objetivo).
    static func libre() throws -> WorkoutPlan {
        let bs = porSeries("sets", Array(repeating: set(reps(10)), count: 4), rest: 90)
        let pm = porSeries("sets", Array(repeating: set(reps(8)), count: 3), rest: 90)
        return try plan("Libre · pierna", [bloque("Libre", formato: "straight_sets", pos: 1, [
            itemFuerza("bs", "Back Squat", rx: bs), itemFuerza("pm", "Press militar", rx: pm)])])
    }

    // MARK: - Llevar el motor al punto de partida

    /// Salta al segmento `s` (entrando en él aunque sea otro bloque) y prepara sus series.
    @MainActor
    static func irA(_ s: WorkoutSession, segmento: Int) {
        if s.currentSegmentIndex != segmento { s.jumpTo(segmento) }
        if s.isAwaitingBlockStart { s.beginBlock() }
        s.primeSetsIfNeeded()
    }

    /// Cierra la serie `k` como si el atleta la hubiera declarado (reps, kg, esfuerzo)
    /// y quita el descanso que abre: lo ya hecho antes del escenario.
    @MainActor
    static func declarada(_ s: WorkoutSession, _ k: Int, reps r: Int? = nil, kg: Double? = nil, rir: Double? = nil) {
        if let r { s.setSetReps(k, r) }
        if let kg { s.setSetLoad(k, kg) }
        if let rir { s.setSetRIR(k, rir) }
        s.setRecords[k].confirmed = false
        s.confirmSet(k)
        s.dismissRest()
    }
}
