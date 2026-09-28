import XCTest
@testable import FAHYBRIK

// UN TEST DEL COACH HECHO EN EL RELOJ TAMBIÉN PIDE SU RESULTADO (28-sep).
//
// La ejecución de la muñeca llegaba al móvil y se guardaba, pero la captura del
// número (1RM, tiempo) solo se abría tras el guardado del móvil. Aquí se fija qué
// sesiones la piden y con qué número se precarga desde lo que midió el reloj.
final class WatchTestResultPromptTests: XCTestCase {

    private func detail(_ storeResults: String, blocks: String = "[]") throws -> AssignmentDetail {
        let json = """
        {
          "assignment": { "id": "700", "athlete_id": "64", "scheduled_for": "2026-09-28", "status": "scheduled",
                          "store_results": \(storeResults) },
          "workout": { "name": "Test", "blocks": \(blocks) }
        }
        """
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    /// La ejecución que manda el reloj (DTO del cable, snake_case tal cual).
    private func ejecucion(scoreTime: Int?, total: Int, segments: String) throws -> WorkoutExecutionPayload {
        let json = """
        {
          "assignment_id": "700", "perceived_exertion": null, "total_duration_seconds": \(total),
          "notes": null, "source": null, "score_time_s": \(scoreTime.map(String.init) ?? "null"),
          "score_rounds": null, "score_reps": null, "completeness": "full",
          "started_at": "2026-09-28T08:00:00Z", "ended_at": "2026-09-28T08:40:00Z",
          "segments": \(segments)
        }
        """
        return try JSONDecoder().decode(WorkoutExecutionPayload.self, from: Data(json.utf8))
    }

    private func segmento(position: Int, weight: Double?, sets: String) -> String {
        """
        { "template_segment_id": null, "position": \(position), "modality": "strength",
          "started_at": "2026-09-28T08:00:00Z", "ended_at": "2026-09-28T08:10:00Z",
          "duration_seconds": 600, "distance_meters": null, "avg_pace_s_per_500m": null,
          "avg_pace_s_per_km": null, "avg_power_w": null, "stroke_rate_spm": null,
          "avg_hr": null, "max_hr": null, "calories": null, "reps_completed": null,
          "weight_used_kg": \(weight.map { "\($0)" } ?? "null"), "zone_seconds_json": null, "source": "watch",
          "reps_prescribed": null, "reps_actual": null, "reps_status": null, "reps_confirmed": null,
          "is_structural": null, "rx_scaled": null, "scaled_note": null, "sets": \(sets) }
        """
    }

    private func serie(_ i: Int, kg: Double?, status: String = "done") -> String {
        """
        { "set_index": \(i), "reps_prescribed": 1, "reps_actual": 1, "load_prescribed_kg": null,
          "load_actual_kg": \(kg.map { "\($0)" } ?? "null"), "rpe": null, "rir": null,
          "status": "\(status)", "confirmed": true, "tempo": null, "rest_s": null }
        """
    }

    private let unRM = """
    [{"slug":"back_squat_1rm","label":"Sentadilla","measure":"load","unit":"kg","derives":"strength_max","modality":null,"optional":false}]
    """

    // MARK: - Qué sesiones piden el número

    func testUnTestDeFuerzaPideSuResultado() throws {
        let specs = WatchTestResultPrompt.specsToCapture(detail: try detail(unRM))
        XCTAssertEqual(specs.map(\.slug), ["back_squat_1rm"])
    }

    func testUnaSesionNormalNoPideNada() throws {
        XCTAssertTrue(WatchTestResultPrompt.specsToCapture(detail: try detail("[]")).isEmpty)
        XCTAssertTrue(WatchTestResultPrompt.specsToCapture(detail: nil).isEmpty,
                      "sin detalle no se sabe si es un test: no se pide")
    }

    func testUnTestDeSaltoNoAbreLaHoja() throws {
        let salto = """
        [{"slug":"cmj","label":"CMJ","measure":"height","unit":"cm","derives":"none","modality":null,"optional":false}]
        """
        XCTAssertTrue(WatchTestResultPrompt.specsToCapture(detail: try detail(salto)).isEmpty,
                      "el salto se mide con el vídeo, no con la hoja")
    }

    // MARK: - El número que midió el reloj

    /// El 1RM es la serie más pesada que se DECLARÓ; una saltada no cuenta.
    func testLaCargaEsLaSerieMasPesadaDeclarada() throws {
        let sets = "[\(serie(1, kg: 100)), \(serie(2, kg: 110)), \(serie(3, kg: 120, status: "skipped"))]"
        let payload = try ejecucion(scoreTime: nil, total: 1800,
                                    segments: "[\(segmento(position: 0, weight: 100, sets: sets))]")
        let specs = WatchTestResultPrompt.specsToCapture(detail: try detail(unRM))
        XCTAssertEqual(TestBatteryPrefill.map(payload: payload, specs: specs)["back_squat_1rm"], 110)
    }

    /// El tiempo: el del bloque si lo hay; si no, lo que duró.
    func testElTiempoEsElDelBloqueOElTotal() throws {
        let cincoK = """
        [{"slug":"run_5k","label":"5K","measure":"time","unit":"seconds","derives":"run_zones","modality":"run","optional":false}]
        """
        let specs = WatchTestResultPrompt.specsToCapture(detail: try detail(cincoK))
        let conBloque = try ejecucion(scoreTime: 1290, total: 1500, segments: "[]")
        XCTAssertEqual(TestBatteryPrefill.map(payload: conBloque, specs: specs)["run_5k"], 1290)
        let sinBloque = try ejecucion(scoreTime: nil, total: 1320, segments: "[]")
        XCTAssertEqual(TestBatteryPrefill.map(payload: sinBloque, specs: specs)["run_5k"], 1320)
    }
}
