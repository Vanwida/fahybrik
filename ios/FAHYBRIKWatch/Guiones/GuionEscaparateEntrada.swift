#if DEBUG
import SwiftUI

// EL ESCAPARATE DE LA ENTRADA — ver lo que sale al abrir la app SIN esperar a que el
// iPhone empuje el día.
//
// Mismo patrón que `GuionEscaparate` (`-guion <id>`), para las pantallas de reposo:
//
//     xcrun simctl launch <sim> com.fahybrid.app.watchkitapp -guion brief-series
//     xcrun simctl io <sim> screenshot entrada.png
//
// Los planes son el JSON del coach que la muñeca decodifica de verdad
// (`WorkoutPlan.from(detail:)`), con las mismas sesiones que los tests
// (`EntradaBriefTests`) y el doble (`reloj-antes-despues`). Sufijo `-atenuado` =
// la muñeca bajada (`isLuminanceReduced`). Solo en DEBUG.

enum GuionEntrada {

    static func vista(_ id: String) -> AnyView? {
        let atenuado = id.hasSuffix("-atenuado")
        let base = atenuado ? String(id.dropLast("-atenuado".count)) : id
        guard let contenido = caso(base) else { return nil }
        return AnyView(contenido.environment(\.isLuminanceReduced, atenuado))
    }

    // MARK: - El catálogo

    private static func caso(_ id: String) -> AnyView? {
        switch id {
        case "brief-series":
            return brief("Series 6×1000", minutos: 55, plan: Planes.series)
        case "brief-rodaje":
            return brief("Rodaje Z2 50′", minutos: 65, plan: Planes.rodaje)
        case "brief-fuerza":
            return brief("Fuerza tren inferior", minutos: 70, plan: Planes.fuerza)
        case "brief-wod":
            return brief("Cindy", minutos: 20, plan: Planes.amrap)
        case "brief-largo":
            return brief("Progresivo y series", minutos: 75, plan: Planes.progresivo)
        case "brief-dobles":
            return brief("Series 6×1000", minutos: 55, plan: Planes.series, dobles: true)
        case "brief-sin-detalle":
            return brief("Series 6×1000", minutos: 55, sessionPlan: .needsDetail)
        case "brief-test-salto":
            return brief("Perfil de salto", minutos: nil, sessionPlan: .phoneOnly(.jumpTest))
        case "brief-con-llegas":
            return AnyView(EntradaAntesFlow(
                payload: payload("Series 6×1000", minutos: 55, readiness: 78),
                sessionPlan: Planes.series.map(WatchSessionPlan.run) ?? .needsDetail, onStart: {}))
        case "descanso":
            return AnyView(EntradaHoyView(payload: payload(nil, minutos: nil, descanso: true), sessionPlan: .needsDetail, onStart: {}))
        case "sin-plan":
            return AnyView(EntradaSinPlanView())
        case "hecho":
            return AnyView(EntradaHechoView(title: "Series 6×1000", completeness: "full"))
        case "hecho-parcial":
            return AnyView(EntradaHechoView(title: "Series 6×1000", completeness: "partial", doublesBadge: "DOBLES · con Guillem"))
        case "reanudar":
            return AnyView(EntradaReanudarView(title: "Series 6×1000", onResume: {}, onDiscard: {}))
        case "llegas":
            return AnyView(EntradaComoLlegasView(score: 78, delta7d: 4, worstDriver: "Sueño 6 h 10"))
        case "llegas-bajo":
            return AnyView(EntradaComoLlegasView(score: 41, delta7d: -6, worstDriver: "Pulso en reposo alto"))
        case "espejo-esperando":
            return AnyView(MirrorRecordingOnWristOverlay(owner: WatchPrimaryOwner.shared))
        default:
            return nil
        }
    }

    private static func brief(_ titulo: String, minutos: Int?, plan: WorkoutPlan?, dobles: Bool = false) -> AnyView? {
        guard let plan else { return nil }
        return brief(titulo, minutos: minutos, sessionPlan: .run(plan), dobles: dobles)
    }

    private static func brief(_ titulo: String, minutos: Int?, sessionPlan: WatchSessionPlan, dobles: Bool = false) -> AnyView? {
        AnyView(EntradaHoyView(payload: payload(titulo, minutos: minutos, dobles: dobles), sessionPlan: sessionPlan, onStart: {}))
    }

    private static func payload(_ titulo: String?, minutos: Int?, readiness: Int? = nil,
                                dobles: Bool = false, descanso: Bool = false) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: descanso ? WatchDayKind.rest : WatchDayKind.session, assignmentId: "escaparate",
            title: titulo, focus: nil, estDurationMinutes: minutos, intensityLabel: nil, activityKind: nil,
            athleteHrZones: nil, readinessScore: readiness, readinessDelta7d: readiness == nil ? nil : 4,
            readinessWorstDriver: readiness == nil ? nil : "Sueño 6 h 10", isDone: false, doneCompleteness: nil,
            isDoubles: dobles, partnerFirstName: dobles ? "Guillem" : nil,
            partnerVisibility: dobles ? "shared" : nil, detailJson: nil, clubAccent: nil)
    }
}

// MARK: - Los planes (JSON del coach, como llega del servidor)

private enum Planes {
    static var series: WorkoutPlan? {
        let fases = [
            fase("warmup", [trabajoS(900)]),
            fase("main", [repetir(6, [trabajoM(1000, ritmo(225, 235)), recupera(90, "trote")])]),
            fase("cooldown", [trabajoS(600)]),
        ]
        return plan("Series 6×1000", [bloque("Series 6×1000", "intervals", 1, [
            carrera("c1", fases: fases, planos: "\"rounds\": 6, \"rest_s\": 90, \"sets\": [\(set(metros(1000), ritmoKm(225, 235), 90))]")])])
    }

    static var rodaje: WorkoutPlan? {
        let rodaje = "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(set(segs(3000), zona(2)))] }"
        let movilidad = "{ \"scheme\": \"steady\", \"modality\": \"mobility\", \"sets\": [\(set(segs(900)))] }"
        return plan("Rodaje Z2 50′", [
            bloque("Carrera continua", "steady", 1, [item("r1", "Carrera", "running", rodaje)]),
            bloque("Movilidad", "steady", 2, [item("m1", "Movilidad", "mobility", movilidad)]),
        ])
    }

    static var fuerza: WorkoutPlan? {
        let a1 = porSeries("superset", Array(repeating: set(reps(8), pctRM(65, 70), 0), count: 4))
        let a2 = porSeries("superset", Array(repeating: set(reps(6), "{ \"kind\": \"bodyweight\" }", 120), count: 4))
        let sled = "{ \"scheme\": \"sets\", \"modality\": \"functional\", \"rest_s\": 90, \"sets\": [\(Array(repeating: set(metros(15)), count: 6).joined(separator: ","))] }"
        let mov = "{ \"scheme\": \"warmup\", \"sets\": [\(set(segs(480)))] }"
        return plan("Fuerza tren inferior", [
            bloque("Calentamiento", "warmup", 0, [item("mov", "Movilidad de cadera", "mobility", mov)]),
            bloque("A — Superserie", "superset", 1, [
                item("A1", "Back Squat", "strength", a1, nota: "concéntrica explosiva"),
                item("A2", "Box Jump", "functional", a2)]),
            bloque("Trineo", "straight_sets", 2, [item("sp", "Sled Push", "functional", sled)]),
        ])
    }

    static var amrap: WorkoutPlan? {
        func rx(_ n: Int) -> String { "{ \"scheme\": \"amrap\", \"total_s\": 1200, \"sets\": [\(set(reps(n)))] }" }
        return plan("Cindy", [bloque("Metcon — AMRAP 20", "amrap", 1, [
            item("a1", "Pull-ups", "functional", rx(5)),
            item("a2", "Push-ups", "functional", rx(10)),
            item("a3", "Air Squats", "functional", rx(15))])])
    }

    static var progresivo: WorkoutPlan? {
        let tramos: [(Int, Int)] = [(272, 291), (267, 286), (261, 278), (255, 270)]
        let progresivo = [trabajoS(600, ritmo(320))] + tramos.map { trabajoS(60, ritmo($0.0, $0.1)) }
        let fases = [
            fase("warmup", [trabajoS(600)]),
            fase("main", progresivo + [
                repetir(4, [trabajoM(600, ritmo(218, 229)), recupera(120, "trote", ritmo(400, 436))]),
                repetir(3, [trabajoM(800, ritmo(229, 235)), recupera(180, "caminar")]),
            ]),
            fase("cooldown", [trabajoS(600)]),
        ]
        return plan("Progresivo y series", [bloque("Progresivo y series", "intervals", 1, [
            carrera("p1", fases: fases, planos: "\"sets\": [\(set(segs(600), ritmoKm(320)))]")])])
    }

    // MARK: JSON

    static func plan(_ nombre: String, _ bloques: [String]) -> WorkoutPlan? {
        let json = """
        { "assignment": { "id": "escaparate", "athlete_id": "1", "scheduled_for": "2026-09-29", "status": "scheduled" },
          "workout": { "name": "\(nombre)", "coach_note": null, "blocks": [\(bloques.joined(separator: ","))] } }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let detail = try? decoder.decode(AssignmentDetail.self, from: Data(json.utf8)) else { return nil }
        return WorkoutPlan.from(detail: detail)
    }

    static func item(_ uid: String, _ nombre: String, _ cat: String, _ rx: String, nota: String? = nil) -> String {
        """
        { "uid": "\(uid)", "exercise_id": "e_\(uid)", "exercise_name": "\(nombre)", "exercise_slug": "\(nombre.lowercased().replacingOccurrences(of: " ", with: "-"))", "exercise_category": "\(cat)", "exercise_video_url": null, "cues": null, "params_json": {}, "prescription_json": \(rx), "notes": \(nota.map { "\"\($0)\"" } ?? "null") }
        """
    }

    static func bloque(_ titulo: String, _ formato: String, _ pos: Int, _ items: [String]) -> String {
        """
        { "uid": "b\(pos)", "title": "\(titulo)", "format": "\(formato)", "block_position": \(pos), "coach_note": null, "config_json": {}, "items": [\(items.joined(separator: ","))] }
        """
    }

    static func carrera(_ uid: String, fases: [String], planos: String) -> String {
        item(uid, "Carrera", "running",
             "{ \"scheme\": \"intervals\", \"modality\": \"run\", \(planos), \"structure\": [\(fases.joined(separator: ","))] }")
    }

    static func porSeries(_ scheme: String, _ sets: [String]) -> String {
        "{ \"scheme\": \"\(scheme)\", \"modality\": \"strength\", \"sets\": [\(sets.joined(separator: ","))] }"
    }

    static func set(_ measure: String, _ target: String? = nil, _ rest: Int? = nil) -> String {
        var partes = ["\"measure\": \(measure)"]
        if let target { partes.append("\"target\": \(target)") }
        if let rest { partes.append("\"rest_s\": \(rest)") }
        return "{ " + partes.joined(separator: ", ") + " }"
    }

    static func reps(_ n: Int) -> String { "{ \"kind\": \"reps\", \"value\": \(n) }" }
    static func metros(_ m: Int) -> String { "{ \"kind\": \"distance\", \"meters\": \(m) }" }
    static func segs(_ s: Int) -> String { "{ \"kind\": \"duration\", \"seconds\": \(s) }" }
    static func zona(_ z: Int) -> String { "{ \"kind\": \"hr_zone\", \"value\": \(z) }" }
    static func pctRM(_ lo: Int, _ hi: Int) -> String { "{ \"kind\": \"percent_rm\", \"min\": \(lo), \"max\": \(hi) }" }
    static func ritmoKm(_ lo: Int, _ hi: Int) -> String { "{ \"kind\": \"pace\", \"unit\": \"per_km\", \"min_s\": \(lo), \"max_s\": \(hi) }" }
    static func ritmoKm(_ s: Int) -> String { "{ \"kind\": \"pace\", \"unit\": \"per_km\", \"value_s\": \(s) }" }

    // La gramática de correr.
    static func fase(_ rol: String, _ elementos: [String]) -> String { "{ \"role\": \"\(rol)\", \"elements\": [\(elementos.joined(separator: ","))] }" }
    static func repetir(_ veces: Int, _ elementos: [String]) -> String { "{ \"times\": \(veces), \"elements\": [\(elementos.joined(separator: ","))] }" }
    static func ritmo(_ min: Int, _ max: Int? = nil) -> String {
        max.map { "{ \"type\": \"pace\", \"min_s\": \(min), \"max_s\": \($0) }" } ?? "{ \"type\": \"pace\", \"value_s\": \(min) }"
    }
    static func trabajoM(_ m: Int, _ objetivo: String? = nil) -> String { tramo("work", "{ \"type\": \"distance\", \"m\": \(m) }", objetivo) }
    static func trabajoS(_ s: Int, _ objetivo: String? = nil) -> String { tramo("work", "{ \"type\": \"duration\", \"s\": \(s) }", objetivo) }
    static func recupera(_ s: Int, _ modo: String, _ objetivo: String? = nil) -> String {
        tramo("recovery", "{ \"type\": \"duration\", \"s\": \(s) }", objetivo, modo: modo)
    }

    private static func tramo(_ kind: String, _ medida: String, _ objetivo: String?, modo: String? = nil) -> String {
        var partes = ["\"kind\": \"\(kind)\"", "\"measure\": \(medida)"]
        if let objetivo { partes.append("\"target\": \(objetivo)") }
        if let modo { partes.append("\"recovery_mode\": \"\(modo)\"") }
        return "{ " + partes.joined(separator: ", ") + " }"
    }
}
#endif
