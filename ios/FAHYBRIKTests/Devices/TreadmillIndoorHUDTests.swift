import XCTest
@testable import FAHYBRIK

// FH-62: cinta tonta. El héroe lee HK de la sesión, nunca el ritmo del plan.
final class TreadmillIndoorHUDTests: XCTestCase {

    final class FakeTreadmill: TreadmillDataSource {
        var onSample: ((TreadmillSample) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }
    final class FakeHR: HeartRateSource {
        var onBpm: ((Int) -> Void)?
        var onBattery: ((Int) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }

    private func makeIndoorModel() -> (TreadmillHUDModel, WorkoutSession) {
        let seg = WorkoutSegment(
            order: 1, title: "Correr", kind: .running,
            targetDistanceMeters: 1_000, targetPaceSecondsPerKm: 345,
            blockTitle: "Carrera", blockPosition: 1
        )
        let plan = WorkoutPlan(
            id: UUID(), name: "Cinta tonta", format: .steady,
            estimatedDurationSeconds: 0, blockContext: "Carrera",
            zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []
        )
        let s = WorkoutSession(plan: plan)
        s.runEnvironment = .indoor
        s.start(); s.beginBlock(); s.stop()
        let model = TreadmillHUDModel(
            session: s, hrZones: nil,
            treadmill: FakeTreadmill(), hr: FakeHR()
        )
        return (model, s)
    }

    func testIndoorNoBeltNoWatchHeroIsNotPlanPace() {
        let (model, _) = makeIndoorModel()
        XCTAssertEqual(model.runTarget.objetivoLabel, "5:45/km")
        XCTAssertNil(model.heroPaceSecPerKm, "sin reloj y sin cinta no hay ritmo medido")
        XCTAssertEqual(model.coveredMeters, 0, accuracy: 0.001)
        XCTAssertNotEqual(Vocab.sinFuente, model.runTarget.objetivoLabel)
        XCTAssertEqual(model.sinLecturaMotivo, "sin reloj ni cinta")
    }

    func testIndoorHealthKitMetersBecomeHeroAndDistance() {
        let (model, s) = makeIndoorModel()
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        s.lapElapsedSeconds = 120
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 400, accuracy: 0.001)
        XCTAssertEqual(model.coveredMeters, 400, accuracy: 0.001)
        XCTAssertEqual(model.heroPaceSecPerKm, s.liveCoveredPaceSecPerKm)
        XCTAssertEqual(model.heroPaceSecPerKm, 300)
        XCTAssertNotEqual(
            Formato.ritmoCifras(Double(model.heroPaceSecPerKm!)) + Formato.UnidadRitmo.porKm.rawValue,
            model.runTarget.objetivoLabel
        )
    }

    func testHealthKitPulseChipSaysReloj() {
        let (model, s) = makeIndoorModel()
        s.hrSource = .healthkit
        XCTAssertEqual(model.effectiveHRLink.deviceName, "reloj")
    }
}
