import XCTest
@testable import FAHYBRIK

// The model's machine-control brain: capability gating, the ± steppers (send + clamp),
// and — the point of the whole feature — the app mirroring what the athlete does on the
// machine's OWN console. Driven through an injected controllable fake, no Bluetooth.
final class TreadmillControlModelTests: XCTestCase {

    final class FakeControllableTreadmill: TreadmillDataSource, TreadmillControllable {
        var onSample: ((TreadmillSample) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        var onControlCapability: ((TreadmillControlCapability) -> Void)?
        var onMachineEvent: ((TreadmillMachineEvent) -> Void)?
        var onControlResult: ((TreadmillControlResult) -> Void)?
        private(set) var sent: [TreadmillControlCommand] = []
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
        func send(_ command: TreadmillControlCommand) { sent.append(command) }
        // Drivers the test uses to simulate the machine.
        func pushCapability(_ c: TreadmillControlCapability) { onControlCapability?(c) }
        func pushEvent(_ e: TreadmillMachineEvent) { onMachineEvent?(e) }
        func emitSpeed(_ v: Double) {
            onSample?(TreadmillSample(speedKmh: v, inclinePct: 1, totalDistanceM: 0,
                                      elapsedS: 0, hrBpm: nil, lastUpdate: Date()))
        }
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

    private let cap = TreadmillControlCapability(
        hasControlPoint: true, canControlSpeed: true, canControlIncline: true,
        speed: FTMSControl.Range(min: 1, max: 20, step: 0.5),
        incline: FTMSControl.Range(min: 0, max: 12, step: 0.5))

    private func makeModel() -> (TreadmillHUDModel, FakeControllableTreadmill) {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 100_000, blockTitle: "Carrera", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .steady, estimatedDurationSeconds: 900,
                               blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let src = FakeControllableTreadmill()
        let model = TreadmillHUDModel(session: WorkoutSession(plan: plan), hrMaxSource: nil,
                                      treadmill: src, hr: FakeHR())
        model.start()
        return (model, src)
    }

    func testCapabilityUnlocksControl() {
        let (m, src) = makeModel()
        XCTAssertFalse(m.controlCapability.canControl)   // nothing reported yet
        src.pushCapability(cap)
        XCTAssertTrue(m.controlCapability.canControl)
        m.teardown()
    }

    func testNudgeSpeedSendsAndClamps() {
        let (m, src) = makeModel()
        src.pushCapability(cap)                          // seeds target to the range min (1)
        XCTAssertEqual(m.targetSpeedKmh, 1, accuracy: 0.001)
        m.nudgeSpeed(1)                                  // +1 step (0.5)
        XCTAssertEqual(m.targetSpeedKmh, 1.5, accuracy: 0.001)
        XCTAssertEqual(src.sent.last, .setTargetSpeedKmh(1.5))
        for _ in 0..<100 { m.nudgeSpeed(1) }             // hammer past the max
        XCTAssertEqual(m.targetSpeedKmh, 20, accuracy: 0.001)   // clamped, never overshoots
        m.teardown()
    }

    func testConsoleChangeSyncsIntoApp() {
        let (m, src) = makeModel()
        src.pushCapability(cap)
        // The athlete bumps the speed on the machine's OWN console → the app mirrors it.
        src.pushEvent(.targetSpeedChangedKmh(14))
        XCTAssertEqual(m.targetSpeedKmh, 14, accuracy: 0.001)
        // A nonsense reading from the belt is clamped to the real range, never shown raw.
        src.pushEvent(.targetSpeedChangedKmh(999))
        XCTAssertEqual(m.targetSpeedKmh, 20, accuracy: 0.001)
        m.teardown()
    }

    func testBeltMovingTracksRealSpeed() {
        let (m, src) = makeModel()
        src.pushCapability(cap)
        XCTAssertFalse(m.beltMoving)                     // stopped
        src.emitSpeed(8)
        XCTAssertTrue(m.beltMoving)                      // real reported speed > threshold
        src.emitSpeed(0)
        XCTAssertFalse(m.beltMoving)
        m.teardown()
    }

    /// The i.Concept family (his TM2000) has no percent grade to show — the stepper must
    /// say "Nivel", move one whole level per tap, and send a LEVEL command.
    func testIConceptInclineIsLevelsNotPercent() {
        let (m, src) = makeModel()
        var levelCap = cap
        levelCap.profile = .iConcept
        levelCap.incline = FTMSControl.Range(min: 1, max: 15, step: FTMSInclineLevels.levelStep)
        src.pushCapability(levelCap)
        XCTAssertTrue(m.inclineIsLevel)
        XCTAssertEqual(m.inclineControlLabel, "Nivel")
        XCTAssertEqual(m.inclineControlUnit, "", "never a fabricated % on a machine without grade")

        m.nudgeIncline(1)
        XCTAssertEqual(m.targetIncline, 2, accuracy: 0.001, "one tap = one whole level")
        XCTAssertEqual(src.sent.last, .setTargetInclineLevel(2))
        XCTAssertEqual(m.inclineControlValue, "2")

        for _ in 0..<50 { m.nudgeIncline(1) }
        XCTAssertEqual(m.targetIncline, 15, accuracy: 0.001, "clamped to the console's top level")

        // The machine reporting its own console change lands in the same target.
        src.pushEvent(.targetInclineChangedLevel(4))
        XCTAssertEqual(m.targetIncline, 4, accuracy: 0.001)
        m.teardown()
    }

    /// A spec-clean belt keeps exact 0.1 % behaviour — the level path must not leak.
    func testStandardBeltKeepsPercentIncline() {
        let (m, src) = makeModel()
        src.pushCapability(cap)                          // profile defaults to .standard
        XCTAssertFalse(m.inclineIsLevel)
        XCTAssertEqual(m.inclineControlLabel, "Inclinación")
        XCTAssertEqual(m.inclineControlUnit, "%")
        m.nudgeIncline(1)
        XCTAssertEqual(m.targetIncline, 0.5, accuracy: 0.001)   // seeded at 0 %, step 0.5
        XCTAssertEqual(src.sent.last, .setTargetInclinePct(0.5))
        m.teardown()
    }

    func testReadOnlyBeltOffersNoControl() {
        let (m, src) = makeModel()
        src.pushCapability(.none)                        // a data-only belt
        XCTAssertFalse(m.controlCapability.canControl)
        m.nudgeSpeed(1)                                  // must be a no-op
        XCTAssertTrue(src.sent.isEmpty)
        m.teardown()
    }
}
