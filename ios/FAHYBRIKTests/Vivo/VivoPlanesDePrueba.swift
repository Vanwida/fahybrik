import XCTest
@testable import FAHYBRIK

// LOS PLANES REALES DE PRUEBA DEL VIVO — el mismo JSON del coach que decodifica
// la app (`WorkoutPlan.from(detail:)`), montado como en la auditoría del 28-09.
// Sirven al adaptador (`VivoAdaptadorTests`) y a las capturas
// (`VivoIphoneCapturasTests`): un plan, un motor de verdad, cero mocks.
enum VivoPlanesDePrueba {

    static func item(_ uid: String, _ nombre: String, cat: String, rx: String, params: String = "{}") -> String {
        """
        { "uid": "\(uid)", "exercise_id": "e_\(uid)", "exercise_name": "\(nombre)", "exercise_slug": "\(nombre.lowercased().replacingOccurrences(of: " ", with: "-"))", "exercise_category": "\(cat)", "exercise_video_url": null, "cues": null, "params_json": \(params), "prescription_json": \(rx), "notes": null }
        """
    }

    static func bloque(_ titulo: String, formato: String, pos: Int, _ items: [String], config: String = "{}") -> String {
        """
        { "uid": "b\(pos)", "title": "\(titulo)", "format": "\(formato)", "block_position": \(pos), "coach_note": null, "config_json": \(config), "items": [\(items.joined(separator: ","))] }
        """
    }

    static func plan(_ nombre: String, _ bloques: [String]) throws -> WorkoutPlan {
        let json = """
        { "assignment": { "id": "asg_vivo", "athlete_id": "ath_vivo", "scheduled_for": "2026-09-28", "status": "scheduled" },
          "workout": { "name": "\(nombre)", "coach_note": null, "blocks": [\(bloques.joined(separator: ","))] } }
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let detail = try d.decode(AssignmentDetail.self, from: Data(json.utf8))
        return try XCTUnwrap(WorkoutPlan.from(detail: detail), "plan nil para \(nombre)")
    }

    static func set(_ measure: String, target: String? = nil, rest: Int? = nil, mod: String? = nil, note: String? = nil) -> String {
        var parts = ["\"measure\": \(measure)"]
        if let target { parts.append("\"target\": \(target)") }
        if let rest { parts.append("\"rest_s\": \(rest)") }
        if let mod { parts.append("\"modality\": \"\(mod)\"") }
        if let note { parts.append("\"note\": \"\(note)\"") }
        return "{ " + parts.joined(separator: ", ") + " }"
    }

    static func reps(_ n: Int) -> String { "{ \"kind\": \"reps\", \"value\": \(n) }" }
    static func metros(_ m: Int) -> String { "{ \"kind\": \"distance\", \"meters\": \(m) }" }
    static func segs(_ s: Int) -> String { "{ \"kind\": \"duration\", \"seconds\": \(s) }" }
    static func cal(_ n: Int) -> String { "{ \"kind\": \"calories\", \"value\": \(n) }" }
    static func kg(_ v: Double) -> String { "{ \"kind\": \"kg\", \"value\": \(v) }" }
    static func rir(_ v: Double) -> String { "{ \"kind\": \"rir\", \"value\": \(v) }" }
    static func ritmoKm(_ s: Int, _ max: Int? = nil) -> String {
        max.map { "{ \"kind\": \"pace\", \"unit\": \"per_km\", \"min_s\": \(s), \"max_s\": \($0) }" } ?? "{ \"kind\": \"pace\", \"unit\": \"per_km\", \"value_s\": \(s) }"
    }
    static func ritmo500(_ s: Int) -> String { "{ \"kind\": \"pace\", \"unit\": \"per_500m\", \"value_s\": \(s) }" }
    static func zona(_ z: Int) -> String { "{ \"kind\": \"hr_zone\", \"value\": \(z) }" }

    static func zonas() -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170, estimated: false, source: "test",
            sourceLabel: "Zonas de tu test de umbral", confidence: "measured",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ])
    }

    // MARK: - Los planes

    /// Fuerza: superserie A1 Back Squat 4×8 @ 65–70 % RM · RIR 2 / A2 Box Jump 4×6 corporal, r 2′.
    static func superserie() throws -> WorkoutPlan {
        let a1 = "{ \"scheme\": \"superset\", \"modality\": \"strength\", \"target\": \(rir(2)), \"sets\": [\(Array(repeating: set(reps(8), target: "{ \"kind\": \"percent_rm\", \"min\": 65, \"max\": 70 }", rest: 0), count: 4).joined(separator: ","))] }"
        let a2 = "{ \"scheme\": \"superset\", \"modality\": \"functional\", \"sets\": [\(Array(repeating: set(reps(6), target: "{ \"kind\": \"bodyweight\" }", rest: 120), count: 4).joined(separator: ","))] }"
        return try plan("Fuerza · Pierna", [bloque("A — Superserie", formato: "superset", pos: 1, [
            item("f1", "Back Squat", cat: "strength", rx: a1, params: "{ \"load_pct\": 65 }"),
            item("f2", "Box Jump", cat: "functional", rx: a2)])])
    }

    /// Fuerza por series rectas: Back Squat 4×5 @ 100 kg · RIR 2 · r 2′.
    static func seriesRectas() throws -> WorkoutPlan {
        let serie = set(reps(5), target: kg(100), rest: 120)
        let rx = "{ \"scheme\": \"sets\", \"modality\": \"strength\", \"target\": \(rir(2)), \"sets\": [\(Array(repeating: serie, count: 4).joined(separator: ","))] }"
        return try plan("Fuerza · Sentadilla", [bloque("A — Sentadilla trasera", formato: "straight_sets", pos: 1, [item("f1", "Back Squat", cat: "strength", rx: rx)])])
    }

    /// Correr: 6 × 1000 m a 3:45–3:55 con recuperación de 90″ (la carrera estructurada).
    static func seisPorMil() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"intervals\", \"modality\": \"run\", \"rounds\": 6, \"rest_s\": 90, \"sets\": [\(set(metros(1000), target: ritmoKm(225, 235), rest: 90))] }"
        return try plan("6×1000", [bloque("Series 6×1000", formato: "intervals", pos: 1, [item("s1", "Carrera", cat: "running", rx: rx)])])
    }

    /// Correr: rodaje 40′ a Z2.
    static func rodajeZ2() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(set(segs(2400), target: zona(2)))] }"
        return try plan("Rodaje Z2 40′", [bloque("Carrera continua", formato: "steady", pos: 1, [item("r1", "Carrera", cat: "running", rx: rx)])])
    }

    /// Ergo: SkiErg 8 × 250 m a 2:05 /500, r 60″.
    static func skiSeries() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"intervals\", \"modality\": \"ski\", \"rounds\": 8, \"rest_s\": 60, \"sets\": [\(set(metros(250), target: ritmo500(125), rest: 60))] }"
        return try plan("SkiErg 8×250", [bloque("SkiErg 8×250", formato: "intervals", pos: 1, [item("k1", "SkiErg", cat: "ski_erg", rx: rx)])])
    }

    /// Test: 2000 m de remo.
    static func testRemo() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"for_time\", \"modality\": \"row\", \"sets\": [\(set(metros(2000)))] }"
        return try plan("Test 2000 m remo", [bloque("Test — 2000 m remo", formato: "test", pos: 1, [item("x1", "Row Erg", cat: "rowing", rx: rx)])])
    }

    /// EMOM 16 alterno: 15 wall balls · 12 cal de ski.
    static func emom() throws -> WorkoutPlan {
        let wb = "{ \"scheme\": \"emom\", \"modality\": \"functional\", \"rounds\": 16, \"work_s\": 60, \"sets\": [\(set(reps(15), target: kg(9)))] }"
        let sk = "{ \"scheme\": \"emom\", \"modality\": \"ski\", \"rounds\": 16, \"work_s\": 60, \"sets\": [\(set(cal(12)))] }"
        return try plan("EMOM 16", [bloque("Metcon — EMOM 16", formato: "emom", pos: 1, [
            item("m1", "Wall Balls", cat: "functional", rx: wb), item("m2", "SkiErg", cat: "ski_erg", rx: sk)])])
    }

    /// AMRAP 20 (Cindy).
    static func amrap() throws -> WorkoutPlan {
        func rx(_ n: Int) -> String { "{ \"scheme\": \"amrap\", \"total_s\": 1200, \"sets\": [\(set(reps(n)))] }" }
        return try plan("Cindy", [bloque("Metcon — AMRAP 20", formato: "amrap", pos: 1, [
            item("a1", "Pull-ups", cat: "functional", rx: rx(5)),
            item("a2", "Push-ups", cat: "functional", rx: rx(10)),
            item("a3", "Air Squats", cat: "functional", rx: rx(15))])])
    }

    /// For Time con cap: chipper de 4 estaciones.
    static func chipper() throws -> WorkoutPlan {
        let movs: [(String, String, String)] = [("Double Unders", "functional", reps(50)), ("Wall Balls", "functional", reps(40)),
                                                ("Row Erg", "rowing", cal(30)), ("Burpees", "functional", reps(20))]
        let items = movs.enumerated().map { i, m in item("ch\(i)", m.0, cat: m.1, rx: "{ \"scheme\": \"chipper\", \"total_s\": 1200, \"sets\": [\(set(m.2))] }") }
        return try plan("Chipper 20′", [bloque("Chipper — cap 20′", formato: "chipper", pos: 1, items)])
    }

    /// Circuito de 4 rondas: 400 m · 15 KB swings · 10 box jumps, r 90″ entre rondas.
    static func circuito() throws -> WorkoutPlan {
        func rx(_ m: String, _ mod: String? = nil) -> String { "{ \"scheme\": \"rounds\", \"rounds\": 4, \"rest_s\": 90, \"sets\": [\(set(m, mod: mod))] }" }
        return try plan("Circuito 4 rondas", [bloque("Circuito — 4 rondas", formato: "circuit", pos: 1, [
            item("c1", "Carrera", cat: "running", rx: rx(metros(400), "run")),
            item("c2", "Kettlebell Swings", cat: "functional", rx: rx(reps(15))),
            item("c3", "Box Jumps", cat: "functional", rx: rx(reps(10)))], config: "{ \"rest_between_rounds_seconds\": 90 }")])
    }

    /// Tabata 8 × 20″/10″ de burpees.
    static func tabata() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"tabata\", \"rounds\": 8, \"work_s\": 20, \"rest_s\": 10, \"sets\": [\(set(reps(8)))] }"
        return try plan("Tabata", [bloque("Tabata — burpees", formato: "tabata", pos: 1, [item("t1", "Burpees", cat: "functional", rx: rx)])])
    }

    /// Death by burpee, +1 cada minuto.
    static func deathBy() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"death_by\", \"start\": 1, \"increment\": 1, \"work_s\": 60, \"sets\": [\(set(reps(1)))] }"
        return try plan("Death by", [bloque("Death by burpee", formato: "death_by", pos: 1, [item("d1", "Burpees", cat: "functional", rx: rx)])])
    }

    // MARK: - Un motor en marcha

    @MainActor
    static func arranca(_ p: WorkoutPlan, entorno: RunEnvironment? = nil, zonas: HRZoneProfile? = zonas()) -> WorkoutSession {
        let s = WorkoutSession(plan: p, hrZones: zonas)
        s.runEnvironment = entorno
        s.start()
        s.beginBlock()
        return s
    }
}
