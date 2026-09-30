import XCTest
@testable import FAHYBRIK

// El método del coach para la muñeca al correr (`WristMethod`, espejo de
// `shared/domain/coach/wrist-method.ts`) llega en el cuerpo del detalle de asignación
// (`wrist_method`) y de ahí al reloj por `detailJson`. Aquí se fija que el decode:
//   · lee EXACTAMENTE lo que el servidor manda por defecto (vector de oro: el mismo JSON
//     que `buildWristMethod(DEFAULT_COACH_THRESHOLDS)`, que un test de web compara),
//   · es OPCIONAL (una sesión cacheada antes de esta tanda no lo lleva y decodifica igual),
//   · degrada un valor desconocido de un servidor posterior en vez de romper el detalle,
//   · sobrevive al viaje del teléfono al reloj (codificado con el `WatchWire.detailEncoder`).
final class WristMethodTests: XCTestCase {

    // GOLDEN-BEGIN — no editar a mano: es la salida de `buildWristMethod` con los defectos
    // (web/tests/coach/wrist-method.test.ts falla si deja de coincidir).
    static let goldenDefaults = """
    {
      "alerts": {
        "slack": { "pace_s": 3, "hr_bpm": 2, "split500_s": 2, "watts": 10, "cadence_spm": 3 },
        "gap_s": 20,
        "confirm_s": 4,
        "zone_grace_s": 45,
        "in_warmup": false,
        "in_recovery": false,
        "continuous_zone": "arriba",
        "prewarn_s": 10,
        "prewarn_m": 100,
        "prewarn_min_step_s": 30
      },
      "auto_lap": { "every_m": 1000, "classes": ["rodaje", "tirada"] },
      "run": { "long_run_s": 4500, "long_run_m": 16000, "stride_max_s": 30, "gate": "auto" },
      "finish": { "short_rep_done_fraction": 0.9, "idle_save_s": 600 },
      "rpe_words": ["nada", "muy suave", "muy suave", "suave", "suave", "moderado", "moderado", "fuerte", "fuerte", "muy fuerte", "máximo"]
    }
    """
    // GOLDEN-END

    private func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    private func method(_ json: String = WristMethodTests.goldenDefaults) throws -> WristMethod {
        try decoder().decode(WristMethod.self, from: Data(json.utf8))
    }

    private func detailJSON(wristMethod: String?) -> String {
        """
        {
          "assignment": {
            "id": "asg_001", "athlete_id": "ath_001", "scheduled_for": "2026-09-29", "status": "scheduled",
            "slot": null, "template_id": null, "template_version": null, "completed_at": null,
            "perceived_exertion": null, "station_assignment": null, "my_role": null
          },
          "workout": null\(wristMethod.map { ",\n  \"wrist_method\": \($0)" } ?? "")
        }
        """
    }

    // MARK: - Lo que manda el servidor por defecto

    func test_decode_serverDefaults_areTodaysNumbers() throws {
        let m = try method()
        XCTAssertEqual(m.alerts.slack.paceS, 3)
        XCTAssertEqual(m.alerts.slack.hrBpm, 2)
        XCTAssertEqual(m.alerts.slack.split500S, 2)
        XCTAssertEqual(m.alerts.slack.watts, 10)
        XCTAssertEqual(m.alerts.slack.cadenceSpm, 3)
        XCTAssertEqual(m.alerts.gapS, 20)
        XCTAssertEqual(m.alerts.confirmS, 4)
        XCTAssertEqual(m.alerts.zoneGraceS, 45)
        XCTAssertFalse(m.alerts.inWarmup)
        XCTAssertFalse(m.alerts.inRecovery)
        XCTAssertEqual(m.alerts.continuousZone, .arriba, "el tope de pulso de un rodaje solo avisa por arriba")
        XCTAssertEqual(m.alerts.prewarnS, 10)
        XCTAssertEqual(m.alerts.prewarnM, 100)
        XCTAssertEqual(m.alerts.prewarnMinStepS, 30)
        XCTAssertEqual(m.autoLap.everyM, 1000)
        XCTAssertEqual(m.autoLap.classes, ["rodaje", "tirada"])
        XCTAssertEqual(m.run.longRunS, 75 * 60)
        XCTAssertEqual(m.run.longRunM, 16_000)
        XCTAssertEqual(m.run.strideMaxS, 30)
        XCTAssertEqual(m.run.gate, .auto)
        XCTAssertEqual(m.finish.shortRepDoneFraction, 0.9)
        XCTAssertEqual(m.finish.idleSaveS, 600)
        XCTAssertEqual(m.rpeWords.count, 11)
        XCTAssertEqual(m.rpeWord(0), "nada")
        XCTAssertEqual(m.rpeWord(7), "fuerte")
        XCTAssertEqual(m.rpeWord(10), "máximo")
        XCTAssertNil(m.rpeWord(11))
    }

    func test_autoLap_appliesOnlyWhereOnAndNotWhenOff() throws {
        var m = try method()
        XCTAssertTrue(m.autoLap.applies(toClass: "rodaje"))
        XCTAssertTrue(m.autoLap.applies(toClass: "tirada"))
        XCTAssertFalse(m.autoLap.applies(toClass: "tempo"))
        m.autoLap.everyM = 0   // apagada
        XCTAssertFalse(m.autoLap.applies(toClass: "rodaje"))
    }

    // MARK: - Lo que edita el coach

    func test_decode_coachValues_gateManual_and_ambos() throws {
        let json = WristMethodTests.goldenDefaults
            .replacingOccurrences(of: "\"continuous_zone\": \"arriba\"", with: "\"continuous_zone\": \"ambos\"")
            .replacingOccurrences(of: "\"gate\": \"auto\"", with: "\"gate\": \"manual\"")
            .replacingOccurrences(of: "\"every_m\": 1000", with: "\"every_m\": 0")
        let m = try method(json)
        XCTAssertEqual(m.alerts.continuousZone, .ambos)
        XCTAssertEqual(m.run.gate, .manual)
        XCTAssertEqual(m.autoLap.everyM, 0)
    }

    // MARK: - Tolerancia

    func test_unknownEnumValues_degradeInsteadOfBreakingTheDetail() throws {
        let json = WristMethodTests.goldenDefaults
            .replacingOccurrences(of: "\"continuous_zone\": \"arriba\"", with: "\"continuous_zone\": \"solo-arriba\"")
            .replacingOccurrences(of: "\"gate\": \"auto\"", with: "\"gate\": \"por-voz\"")
        let m = try method(json)
        XCTAssertEqual(m.alerts.continuousZone, .arriba)
        XCTAssertEqual(m.run.gate, .auto)
    }

    func test_unknownAutoLapClass_isKeptAsAString() throws {
        let json = WristMethodTests.goldenDefaults.replacingOccurrences(of: "[\"rodaje\", \"tirada\"]", with: "[\"rodaje\", \"fartlek\"]")
        XCTAssertEqual(try method(json).autoLap.classes, ["rodaje", "fartlek"])
    }

    // MARK: - En el detalle de asignación (el cuerpo que lee el reloj)

    func test_assignmentDetail_carriesWristMethod() throws {
        let detail = try decoder().decode(AssignmentDetail.self, from: Data(detailJSON(wristMethod: WristMethodTests.goldenDefaults).utf8))
        XCTAssertEqual(detail.wristMethod, try method())
    }

    func test_assignmentDetail_withoutWristMethod_decodesAsNil() throws {
        // Una sesión cacheada antes de esta tanda, un servidor anterior o la lectura del coach.
        let detail = try decoder().decode(AssignmentDetail.self, from: Data(detailJSON(wristMethod: nil).utf8))
        XCTAssertNil(detail.wristMethod)
        XCTAssertEqual(detail.assignment.id, "asg_001")
    }

    func test_wristMethod_survivesThePhoneToWatchTrip() throws {
        // El teléfono re-codifica el detalle con el codificador del cable y el reloj lo lee con el suyo.
        let detail = try decoder().decode(AssignmentDetail.self, from: Data(detailJSON(wristMethod: WristMethodTests.goldenDefaults).utf8))
        let raw = try WatchWire.detailEncoder.encode(detail)
        let onWrist = try WatchWire.detailDecoder.decode(AssignmentDetail.self, from: raw)
        XCTAssertEqual(onWrist.wristMethod, detail.wristMethod)
        XCTAssertNotNil(onWrist.wristMethod)
    }
}
