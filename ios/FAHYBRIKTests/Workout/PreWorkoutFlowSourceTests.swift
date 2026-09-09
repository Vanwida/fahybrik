import XCTest

// FH-95 — the pre-live athlete path must expose exactly ONE ▶ EMPEZAR (Brief readyToStart).
final class PreWorkoutFlowSourceTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func testBriefReadyToStartIsSoleEmpezarOnPreLivePath() throws {
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertEqual(brief.components(separatedBy: "▶ EMPEZAR").count - 1, 1)
        let hub = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutDevicesHubView.swift"))
        XCTAssertFalse(hub.contains("▶ EMPEZAR"))
        XCTAssertFalse(hub.contains("▶ Empezar"))
        let blockGate = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/BlockPreviewGate.swift"))
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
        XCTAssertTrue(release.contains("PhoneMirrorService.shared.begin"))
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertTrue(brief.contains("PreWorkoutReleaseLive.release"))
    }

    func testPrepIsUIONlyNoBegin() throws {
        let release = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutReleaseLive.swift"))
        XCTAssertTrue(release.contains("noteWatchPrepIntent"))
        let prepBody = release
            .components(separatedBy: "static func prepWatchRecording").last?
            .components(separatedBy: "static func release").first ?? ""
        XCTAssertFalse(prepBody.contains("PhoneMirrorService.shared.begin"),
                       "prep must not call begin — sole HK owner is release")
    }

    func testWatchQueueOrBeginIgnoresCompatibleRedundantStart() throws {
        let primary = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKWatch/MirrorSessionController+Primary.swift"))
        XCTAssertTrue(primary.contains("shouldIgnoreRedundantStart"))
        XCTAssertTrue(primary.contains("shouldFinishBeforeRestart"))
    }
}
