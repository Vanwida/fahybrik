import XCTest
import SwiftUI
@testable import FAHYBRIK

// Wire-contract coverage for the readiness DETAIL payload. The app decodes with
// `.convertFromSnakeCase` (APIClient.makeJSONDecoder), so this asserts the NEW
// server shape — the 7-day `trend` and the enriched raw breakdown values the
// detail sheet renders — round-trips, AND that the OLD shape (pre-feature, and
// the still-deployed demo endpoint) decodes untouched with the new fields nil.
final class ReadinessDetailDecodeTests: XCTestCase {
    private func decode(_ json: String) throws -> DailyReadinessResponse {
        try APIClient.makeJSONDecoder().decode(
            DailyReadinessResponse.self,
            from: Data(json.utf8)
        )
    }

    // MARK: - New shape (server with trend + raw values)

    func test_newShape_decodesTrendAndRawBreakdown() throws {
        let json = """
        {
          "readiness": {
            "athlete_id": "70",
            "recorded_for": "2026-07-02",
            "score": 65,
            "delta_7d": -3,
            "breakdown": {
              "sub_score": 60,
              "sub_score_weight": 0.35,
              "hrv_component": 64,
              "sleep_hours": 6.6,
              "sleep_component": 83,
              "rhr_component": 98,
              "recovery_component": null,
              "hrv_ms": 47,
              "hrv_baseline_ms": 42,
              "rhr_bpm": 51,
              "sleep_target_h": 8
            },
            "trend": [
              { "recorded_for": "2026-06-26", "score": 72 },
              { "recorded_for": "2026-06-27", "score": 68 },
              { "recorded_for": "2026-07-02", "score": 65 }
            ]
          }
        }
        """
        let r = try decode(json).readiness
        let p = try XCTUnwrap(r)
        XCTAssertEqual(p.score, 65)
        XCTAssertEqual(p.recordedFor, "2026-07-02")
        // `delta_7d` now decodes (explicit CodingKey pins the convertFromSnakeCase
        // spelling `delta7D`); the Inicio card's "N en 7 días" pill can read it.
        XCTAssertEqual(p.delta7d, -3)

        let b = try XCTUnwrap(p.breakdown)
        XCTAssertEqual(b.hrvMs, 47)
        XCTAssertEqual(b.hrvBaselineMs, 42)
        XCTAssertEqual(b.rhrBpm, 51)
        XCTAssertEqual(b.sleepTargetH, 8)
        XCTAssertEqual(b.sleepHours, 6.6)
        XCTAssertEqual(b.subScore, 60)

        let trend = try XCTUnwrap(p.trend)
        XCTAssertEqual(trend.count, 3)
        XCTAssertEqual(trend.first?.recordedFor, "2026-06-26")
        XCTAssertEqual(trend.last?.recordedFor, "2026-07-02")
        XCTAssertEqual(trend.last?.score, 65)
    }

    // MARK: - Old shape (deployed demo / cached payloads) still decodes

    func test_oldShape_decodesWithNewFieldsNil() throws {
        let json = """
        {
          "readiness": {
            "athlete_id": "70",
            "recorded_for": "2026-07-02",
            "score": 65,
            "delta_7d": null,
            "breakdown": {
              "sub_score": 60,
              "sub_score_weight": 0.35,
              "hrv_component": 64,
              "sleep_hours": 6.6,
              "sleep_component": 83,
              "rhr_component": 98,
              "recovery_component": null
            }
          }
        }
        """
        let r = try decode(json).readiness
        let p = try XCTUnwrap(r)
        XCTAssertEqual(p.score, 65)
        XCTAssertNil(p.delta7d, "explicit delta_7d: null decodes to nil")
        XCTAssertNil(p.trend, "old payload has no trend → section hidden")
        let b = try XCTUnwrap(p.breakdown)
        // Old breakdown values still present…
        XCTAssertEqual(b.sleepHours, 6.6)
        XCTAssertEqual(b.subScore, 60)
        // …and the new raw references are nil → rows show "Sin dato aún".
        XCTAssertNil(b.hrvMs)
        XCTAssertNil(b.rhrBpm)
        XCTAssertNil(b.sleepTargetH)
    }

    func test_nullReadiness_decodesAsEmptyState() throws {
        let r = try decode(#"{ "readiness": null }"#).readiness
        XCTAssertNil(r)
    }

    /// Pins the `delta_7d` fix: the wire key `delta_7d` must bind `delta7d` under
    /// the app's global `.convertFromSnakeCase` (which mangles it to `delta7D`).
    /// A regression here means the Inicio card's "N en 7 días" pill goes silent.
    func test_delta7d_decodesFromSnakeCaseWireKey() throws {
        let json = """
        {
          "readiness": {
            "athlete_id": "70", "recorded_for": "2026-07-02", "score": 65,
            "delta_7d": 4,
            "breakdown": { "sub_score": 60, "sub_score_weight": 0.35, "hrv_component": null,
              "sleep_hours": null, "sleep_component": null, "rhr_component": null,
              "recovery_component": null }
          }
        }
        """
        let p = try XCTUnwrap(try decode(json).readiness)
        XCTAssertEqual(p.delta7d, 4)
    }

    // MARK: - ReadinessZone (shared thresholds + guidance)

    func test_zone_thresholdsMirrorCoachConstants() {
        XCTAssertEqual(ReadinessZone.of(score: 67), .high)
        XCTAssertEqual(ReadinessZone.of(score: 66), .medium)
        XCTAssertEqual(ReadinessZone.of(score: 45), .medium)
        XCTAssertEqual(ReadinessZone.of(score: 44), .low)
        XCTAssertEqual(ReadinessZone.of(score: 65).interpretation, "Recuperación parcial")
    }

    // MARK: - Snapshot (render smoke test of the full sheet, light + dark)
    //
    // Smoke-tests that the detail sheet COMPOSES for a full new-shape payload (all
    // four rows + a 7-day trend) AND for the old degraded payload without crashing.
    // Purely in-memory in the normal suite: it only writes PNGs to the sandbox tmp
    // dir when the env var `RD_SNAPSHOT_DUMP` is set, so there are NO file
    // side-effects on a regular run.
    @MainActor
    func test_snapshot_rendersFullPayload_lightAndDark() {
        let breakdown = ReadinessBreakdown(
            subScore: 60, subScoreWeight: 0.35, hrvComponent: 64,
            sleepHours: 6.6, sleepComponent: 83, rhrComponent: 98, recoveryComponent: nil,
            hrvMs: 47, hrvBaselineMs: 42, rhrBpm: 51, sleepTargetH: 8
        )
        let trend = [
            ("2026-06-26", 72), ("2026-06-27", 68), ("2026-06-28", 80),
            ("2026-06-29", 55), ("2026-06-30", 71), ("2026-07-01", 58),
            ("2026-07-02", 65),
        ].map { ReadinessTrendPoint(recordedFor: $0.0, score: $0.1) }
        let payload = DailyReadinessPayload(
            score: 65, recordedFor: "2026-07-02", delta7d: -3,
            breakdown: breakdown, trend: trend
        )
        let sheet = ReadinessDetailSheet(
            payload: payload, hasSessionToday: true, checkinDone: true,
            bearer: "test", animateRing: false, onCheckinSubmitted: {}
        )

        let size = CGSize(width: 440, height: 1180)
        for style: UIUserInterfaceStyle in [.light, .dark] {
            let image = Self.render(sheet, size: size, style: style)
            XCTAssertGreaterThan(image.size.width, 0)
            XCTAssertGreaterThan(image.size.height, 0)
            let name = style == .light ? "sheet_light.png" : "sheet_dark.png"
            Self.dump(image, name: name)
        }

        // OLD-payload state (the still-deployed demo shape): no raw HRV/RHR values,
        // no trend, and a pending check-in → HRV/RHR read "Sin dato aún", the trend
        // section is hidden, and the CTA is "Hacer". Proves no crash / layout break.
        let oldBreakdown = ReadinessBreakdown(
            subScore: 60, subScoreWeight: 0.35, hrvComponent: 64,
            sleepHours: 6.6, sleepComponent: 83, rhrComponent: 98, recoveryComponent: nil,
            hrvMs: nil, hrvBaselineMs: nil, rhrBpm: nil, sleepTargetH: nil
        )
        let oldPayload = DailyReadinessPayload(
            score: 65, recordedFor: "2026-07-02", delta7d: nil,
            breakdown: oldBreakdown, trend: nil
        )
        let oldSheet = ReadinessDetailSheet(
            payload: oldPayload, hasSessionToday: false, checkinDone: false,
            bearer: "test", animateRing: false, onCheckinSubmitted: {}
        )
        Self.dump(Self.render(oldSheet, size: size, style: .light), name: "sheet_old_light.png")
    }

    @MainActor
    private static func dump(_ image: UIImage, name: String) {
        // Opt-in only: no file writes on a normal test run.
        guard ProcessInfo.processInfo.environment["RD_SNAPSHOT_DUMP"] != nil else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        if let data = image.pngData() {
            try? data.write(to: url)
            print("SNAPSHOT \(name) -> \(url.path)")
        }
    }

    @MainActor
    private static func render(_ view: some View, size: CGSize, style: UIUserInterfaceStyle) -> UIImage {
        let host = UIHostingController(rootView: view)
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.overrideUserInterfaceStyle = style
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = CGRect(origin: .zero, size: size)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        // Let SwiftUI commit its render AND finish the ring's ~0.7s fill animation
        // before we capture, so the ring shows full.
        RunLoop.current.run(until: Date().addingTimeInterval(1.1))
        let renderer = UIGraphicsImageRenderer(bounds: CGRect(origin: .zero, size: size))
        return renderer.image { ctx in window.layer.render(in: ctx.cgContext) }
    }

    func test_zone_guidance_allSixVariants() {
        XCTAssertEqual(
            ReadinessZone.high.guidance(hasSessionToday: true),
            "Buen día para apretar — llega fuerte a la sesión de hoy."
        )
        XCTAssertEqual(
            ReadinessZone.high.guidance(hasSessionToday: false),
            "Estás fresco. Si te apetece moverte, hoy es buen día."
        )
        XCTAssertEqual(
            ReadinessZone.medium.guidance(hasSessionToday: true),
            "Puedes con la sesión de hoy — hazla a ritmo controlado y deja el extra para mañana."
        )
        XCTAssertEqual(
            ReadinessZone.medium.guidance(hasSessionToday: false),
            "Día de mantener: muévete suave y prioriza dormir esta noche."
        )
        XCTAssertEqual(
            ReadinessZone.low.guidance(hasSessionToday: true),
            "Hoy toca aflojar: recorta volumen o baja el ritmo. Tu cuerpo pide recuperar."
        )
        XCTAssertEqual(
            ReadinessZone.low.guidance(hasSessionToday: false),
            "Día de recuperar: descansa, hidrátate y duerme."
        )
    }
}
