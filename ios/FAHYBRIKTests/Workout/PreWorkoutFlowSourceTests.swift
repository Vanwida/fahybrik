import XCTest

// FH-95 — the pre-live athlete path must expose exactly ONE ▶ EMPEZAR (Brief readyToStart).
final class PreWorkoutFlowSourceTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Workout/
            .deletingLastPathComponent()  // FAHYBRIKTests/
            .deletingLastPathComponent()  // ios/
    }

    /// The compiled text of a source file: whole-line comments (`//`, `///`,
    /// `// MARK:`) removed. FH-95's own comments NAME the button («the sole
    /// ▶ EMPEZAR», «not pre-live ▶ EMPEZAR») — they are not buttons. The rule
    /// counts what the athlete can tap, so it reads code, not prose.
    private func code(_ relativePath: String) throws -> String {
        let text = try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return text.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func testBriefReadyToStartIsSoleEmpezarOnPreLivePath() throws {
        let brief = try code("FAHYBRIK/Workout/PreWorkoutBriefView.swift")
        XCTAssertEqual(brief.components(separatedBy: "▶ EMPEZAR").count - 1, 1)
        let hub = try code("FAHYBRIK/Workout/PreWorkoutDevicesHubView.swift")
        XCTAssertFalse(hub.contains("▶ EMPEZAR"))
        XCTAssertFalse(hub.contains("▶ Empezar"))
        let blockGate = try code("FAHYBRIK/Workout/BlockPreviewGate.swift")
        XCTAssertFalse(blockGate.contains("▶ EMPEZAR"))
        XCTAssertTrue(blockGate.contains("ARRANCAR BLOQUE"))
    }

    func testSequentialStartStepMachineRemoved() throws {
        let eligibility = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Devices/PreWorkoutDevices.swift"))
        XCTAssertFalse(eligibility.contains("nextStartStep"))
        XCTAssertFalse(eligibility.contains("StartStep"))
        let ergFlow = iosRoot.appendingPathComponent("FAHYBRIK/Workout/ErgPreStartFlow.swift")
        XCTAssertFalse(FileManager.default.fileExists(atPath: ergFlow.path))
        let gate = iosRoot.appendingPathComponent("FAHYBRIK/Workout/SessionStartGate.swift")
        XCTAssertFalse(FileManager.default.fileExists(atPath: gate.path))
    }

    func testReleaseLiveLivesInOnePlace() throws {
        let release = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutReleaseLive.swift"))
        XCTAssertTrue(release.contains("PhoneLiveSession.shared.begin"))
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertTrue(brief.contains("PreWorkoutReleaseLive.release"))
    }

    /// El reloj no se pregunta: ni «Preparar grabación en el reloj», ni «Continuar sin
    /// reloj», ni puerta por el estado del reloj. Se lanza solo al empezar.
    func testWatchIsNeverAskedInThePreLiveFlow() throws {
        let release = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutReleaseLive.swift"))
        XCTAssertFalse(release.contains("prepWatchRecording"))
        XCTAssertFalse(release.contains("noteWatchPrepIntent"))
        let card = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutWatchCard.swift"))
        XCTAssertFalse(card.contains("Button"), "la tarjeta del reloj es solo informativa")
        XCTAssertFalse(card.contains("SecondaryButton"))
        XCTAssertFalse(card.contains("Continuar sin reloj"))
        XCTAssertFalse(card.contains("Preparar grabación"))
        XCTAssertFalse(card.contains("Esperando al reloj"))
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertFalse(brief.contains("prepWatchRecording"))
        XCTAssertFalse(brief.contains("watchUnavailable"))
        let policy = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKCore/Workout/SessionStartPolicy.swift"))
        XCTAssertFalse(policy.contains("watchProceedWithoutWrist"))
        XCTAssertFalse(policy.contains("watchResolved"))
        let phone = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PhoneLiveSession.swift"))
        XCTAssertFalse(phone.contains("noteWatchPrepIntent"))
        XCTAssertFalse(phone.contains("watchJoinStartedAt"))
        XCTAssertFalse(phone.contains("watchJoinHintSeconds"))
    }

    // FH-56 — a redundant/compatible `handle(_:)` is decided by ONE pure policy
    // (`WatchPrimaryLifecycle.startAction` → re-mirror, never ignore, never end);
    // the homemade «mirror channel alive» watchdog behind the old
    // `shouldIgnoreRedundantStart` / `shouldFinishBeforeRestart` is gone.
    func testWatchStartIsDecidedByStartActionNotByHomemadeWatchdog() throws {
        let owner = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKWatch/WatchPrimaryOwner.swift"))
        let lifecycle = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKCore/Workout/WatchPrimaryLifecycle.swift"))
        let policy = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKCore/Watch/MirrorPrimaryLaunchPolicy.swift"))
        XCTAssertTrue(owner.contains("WatchPrimaryLifecycle.startAction("))
        XCTAssertTrue(owner.contains("MirrorPrimaryLaunchPolicy.configurationsCompatible("))
        XCTAssertTrue(owner.contains("WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding("))
        XCTAssertTrue(owner.contains("case .remirror:"), "compatible redundant start re-mirrors")
        XCTAssertTrue(lifecycle.contains("static func startAction("))
        XCTAssertTrue(lifecycle.contains("enum Link"), "the link is Apple's, not a watchdog")
        XCTAssertFalse(policy.contains("static func shouldIgnoreRedundantStart"))
        XCTAssertFalse(policy.contains("static func shouldFinishBeforeRestart"))
        XCTAssertFalse(policy.contains("mirrorChannelAlive"))
        XCTAssertFalse(owner.contains("mirrorChannelAlive"))
        XCTAssertFalse(owner.contains("reconcileIdleBeforeLaunch"))
    }
}
