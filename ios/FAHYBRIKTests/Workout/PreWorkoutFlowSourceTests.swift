import XCTest

// FH-95 — the pre-live athlete path must expose exactly ONE ▶ EMPEZAR (on prepare).
final class PreWorkoutFlowSourceTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func testPrepareViewIsSoleEmpezarOnPreLivePath() throws {
        let prepare = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/SessionStartGate.swift"))
        XCTAssertEqual(prepare.components(separatedBy: "▶ EMPEZAR").count - 1, 1)
        let hub = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutDevicesHubView.swift"))
        XCTAssertFalse(hub.contains("▶ EMPEZAR"))
        XCTAssertFalse(hub.contains("▶ Empezar"))
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertFalse(brief.contains("▶ EMPEZAR"))
        XCTAssertFalse(brief.contains("▶ Empezar"))
    }

    func testSequentialStartStepMachineRemoved() throws {
        let eligibility = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Devices/PreWorkoutDevices.swift"))
        XCTAssertFalse(eligibility.contains("nextStartStep"))
        XCTAssertFalse(eligibility.contains("StartStep"))
        let ergFlow = iosRoot.appendingPathComponent("FAHYBRIK/Workout/ErgPreStartFlow.swift")
        XCTAssertFalse(FileManager.default.fileExists(atPath: ergFlow.path))
    }
}
