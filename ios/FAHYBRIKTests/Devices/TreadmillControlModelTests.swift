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
        /// Kept apart from `sent`: programming the machine's display must never be able to
        /// masquerade as a command the athlete asked for.
        private(set) var bestEffort: [TreadmillControlCommand] = []
        private(set) var forcedStrategies: [FTMSControlStrategy?] = []
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
        func send(_ command: TreadmillControlCommand) { sent.append(command) }
        func sendBestEffort(_ command: TreadmillControlCommand) { bestEffort.append(command) }
        func forceStrategy(_ strategy: FTMSControlStrategy?) { forcedStrategies.append(strategy) }
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

    /// A fully OBEDIENT belt, in a build where the app drives machines: it has somewhere
    /// to write, it DECLARES both targets (0x2ACC bits 0/1) and it has refused nothing.
    ///
    /// Both extra flags are the point. Since 28-jul the app ships with
    /// `TreadmillControlPolicy.appDrivesMachines == false` (no belt we've met obeys a
    /// speed write) and a capability that merely has a Control Point declares NOTHING
    /// ("absence is not a yes"). Under those two gates every stepper below is a no-op, so
    /// the tests would be asserting on a surface that can't move. Stating both here keeps
    /// the control machinery — clamping, the ± steppers, console mirroring, one-shot
    /// programming — genuinely under test for the day the switch goes back to `true`;
    /// `testShippedPolicyDrivesNothing` pins what actually ships today.
    private let cap = TreadmillControlCapability(
        hasControlPoint: true, canControlSpeed: true, canControlIncline: true,
        appDrivesMachines: true,
        declaresSpeedTarget: true, declaresInclineTarget: true,
        speed: FTMSControl.Range(min: 1, max: 20, step: 0.5),
        incline: FTMSControl.Range(min: 0, max: 12, step: 0.5))

    private func makeModel() -> (TreadmillHUDModel, FakeControllableTreadmill) {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 100_000, blockTitle: "Carrera", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .steady, estimatedDurationSeconds: 900,
                               blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let src = FakeControllableTreadmill()
        let model = TreadmillHUDModel(session: WorkoutSession(plan: plan), hrZones: nil,
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

    /// Once the belt has ANSWERED in console levels there is no percent grade to show —
    /// the stepper must say "Nivel", move one whole level per tap, and send a LEVEL
    /// command. Driven by the resolved dialect now, never by the machine's family.
    func testLevelDialectInclineIsLevelsNotPercent() {
        let (m, src) = makeModel()
        var levelCap = cap
        levelCap.inclineDialect = .level
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

    /// A belt reading in real grade keeps exact 0.1 % behaviour — the level path must not
    /// leak into it.
    func testGradeDialectKeepsPercentIncline() {
        let (m, src) = makeModel()
        src.pushCapability(cap)                          // dialect defaults to .grade
        XCTAssertFalse(m.inclineIsLevel)
        XCTAssertEqual(m.inclineControlLabel, "Inclinación")
        XCTAssertEqual(m.inclineControlUnit, "%")
        m.nudgeIncline(1)
        XCTAssertEqual(m.targetIncline, 0.5, accuracy: 0.001)   // seeded at 0 %, step 0.5
        XCTAssertEqual(src.sent.last, .setTargetInclinePct(0.5))
        m.teardown()
    }

    // MARK: - Programming the piece onto the machine's own display

    /// He expects parity with the erg ("la app no crea la serie en la máquina"): a leg with
    /// a distance goal should push it so the belt's own console counts down the same tramo.
    func testDistanceLegIsProgrammedOntoTheMachine() {
        let (m, src) = makeModel()
        var programmable = cap
        programmable.canSetTargetDistance = true
        src.pushCapability(programmable)
        // The segment under test is a 100 km continuous run.
        XCTAssertEqual(src.bestEffort, [.setTargetedDistanceM(100_000)])
        XCTAssertTrue(src.sent.isEmpty, "programming the display is not a command he issued")
        m.teardown()
    }

    /// Unlike speed and incline, these ops are genuinely optional in the FTMS spec
    /// (C.9 / C.10), so here the machine's advertised bits ARE the gate — we don't spray
    /// op codes a machine has told us it doesn't implement.
    func testUnadvertisedProgrammingIsNotAttempted() {
        let (m, src) = makeModel()
        src.pushCapability(cap)                          // bits 8/9 not advertised
        XCTAssertTrue(src.bestEffort.isEmpty)
        m.teardown()
    }

    /// It must never fire twice for the same leg — the model ticks twice a second.
    func testProgrammingHappensOncePerLeg() {
        let (m, src) = makeModel()
        var programmable = cap
        programmable.canSetTargetDistance = true
        src.pushCapability(programmable)
        src.pushCapability(programmable)
        src.emitSpeed(8)
        src.emitSpeed(9)
        XCTAssertEqual(src.bestEffort.count, 1)
        m.teardown()
    }

    // MARK: - Field diagnosis

    func testForcingAControlModeReachesTheSource() {
        let (m, src) = makeModel()
        src.pushCapability(cap)
        m.forceControlStrategy(.s4)
        m.forceControlStrategy(nil)
        XCTAssertEqual(src.forcedStrategies, [.s4, nil])
        // The test speed goes out as a real command, leaving his own stepper untouched.
        let stepperBefore = m.targetSpeedKmh
        m.sendTestSpeed(6)
        XCTAssertEqual(src.sent.last, .setTargetSpeedKmh(6))
        XCTAssertEqual(m.targetSpeedKmh, stepperBefore, accuracy: 0.001)
        m.teardown()
    }

    // MARK: - What actually ships today

    /// The product decision of 28-jul, pinned: the app READS belts and drives NOTHING.
    /// Even a machine that has a Control Point, declares both targets and has refused
    /// nothing gets no steppers and receives not one byte — a control that doesn't
    /// control is worse than no control. This is the test that fails (correctly, and
    /// loudly) the day someone flips the switch back without meaning to.
    func testShippedPolicyDrivesNothing() {
        XCTAssertFalse(TreadmillControlPolicy.appDrivesMachines)
        let (m, src) = makeModel()
        var obedient = cap                 // declares everything…
        obedient.appDrivesMachines = TreadmillControlPolicy.appDrivesMachines   // …but we don't drive
        obedient.canSetTargetDistance = true
        src.pushCapability(obedient)

        XCTAssertFalse(m.canControlSpeed)
        XCTAssertFalse(m.canControlIncline)
        m.nudgeSpeed(1)
        m.nudgeIncline(1)
        XCTAssertTrue(src.sent.isEmpty, "no command may reach a belt the app does not drive")
        XCTAssertTrue(src.bestEffort.isEmpty, "nor may the silent programming of its display")
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
