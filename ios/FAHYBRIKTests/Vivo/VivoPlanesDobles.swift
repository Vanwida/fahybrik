import XCTest
@testable import FAHYBRIK

// EL PLAN DE DOBLES DEL VIVO — la forma real de un simulacro HYROX por bloques
// (plantilla 342, `MotorPorFormatoTests.hyroxPorBloques`) con el reparto de la
// pareja tal como lo manda el servidor (`station_assignment` + `my_role`):
//   Run 1 (tuya, sin reparto) · SkiErg 1 km (de tu pareja: esperas y das el
//   relevo) · Run 2 · Wall Balls 100 repartidas 60/40 «alterna 25».
// Con reparto, cada estación es su propio segmento (no se une en una ruta).
enum VivoPlanesDobles {

    private typealias P = VivoPlanesDePrueba

    static let pareja = "Marta"

    private static func item(_ tsid: Int, _ nombre: String, cat: String, rx: String, params: String = "{}") -> String {
        P.item("d\(tsid)", nombre, cat: cat, rx: rx, params: params)
            .replacingOccurrences(of: "\"uid\": \"d\(tsid)\",", with: "\"uid\": \"d\(tsid)\", \"template_segment_id\": \(tsid),")
    }

    private static func steady(_ mod: String, _ set: String) -> String {
        "{ \"scheme\": \"steady\", \"modality\": \"\(mod)\", \"sets\": [\(set)] }"
    }

    /// El simulacro con el reparto. `conPareja: false` = sin nombre de pila (cae a «tu pareja»).
    static func simulacro(conPareja: Bool = true) throws -> WorkoutPlan {
        let ritmo = P.ritmoKm(220, 230)
        let bloques = [
            P.bloque("Run 1", formato: "hyrox_sim", pos: 0, [item(2168, "Run", cat: "running", rx: steady("run", P.set(P.metros(1000), target: ritmo, mod: "run")))]),
            P.bloque("Estación 1 · SkiErg", formato: "hyrox_sim", pos: 1, [item(2169, "SkiErg", cat: "ski_erg", rx: steady("ski", P.set(P.metros(1000), mod: "ski")))]),
            P.bloque("Run 2", formato: "hyrox_sim", pos: 2, [item(2170, "Run", cat: "running", rx: steady("run", P.set(P.metros(1000), target: ritmo, mod: "run")))]),
            P.bloque("Estación 8 · Wall Balls", formato: "hyrox_sim", pos: 3, [item(2183, "Wall Balls", cat: "functional",
                rx: steady("functional", P.set(P.reps(100), target: P.kg(9))), params: "{ \"reps\": 100 }")]),
        ]
        let nombre = conPareja ? "\"\(pareja)\"" : "null"
        let json = """
        { "assignment": { "id": "asg_dobles", "athlete_id": "ath_vivo", "scheduled_for": "2026-09-29", "status": "scheduled", "my_role": "a",
            "station_assignment": { "partner_first_name": \(nombre), "stations": [
              { "assigned_to": "b", "template_segment_id": 2169, "label": "SkiErg 1km", "self_share": 0 },
              { "assigned_to": "split", "template_segment_id": 2183, "label": "Wall Balls", "self_share": 0.6, "note": "alterna 25" } ] } },
          "workout": { "name": "Simulacro dobles", "coach_note": null, "blocks": [\(bloques.joined(separator: ","))] } }
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let detail = try d.decode(AssignmentDetail.self, from: Data(json.utf8))
        return try XCTUnwrap(WorkoutPlan.from(detail: detail), "plan nil para el simulacro de dobles")
    }

    /// El motor de verdad, entrado en el segmento `k` y corriendo (sin la cuenta de entrada).
    @MainActor
    static func sesion(en k: Int, conPareja: Bool = true) throws -> WorkoutSession {
        let s = WorkoutSession(plan: try simulacro(conPareja: conPareja))
        s.start(); s.beginBlock(); s.stop()
        if s.currentSegmentIndex != k { s.jumpTo(k) }
        if s.isAwaitingBlockStart { s.beginBlock() }
        s.condCountInRemaining = 0
        return s
    }
}
