import XCTest
@testable import FAHYBRIK

final class WristMirrorTruthTests: XCTestCase {

    func testNotLiveWithoutChannel() {
        XCTAssertFalse(WristMirrorTruth.mirrorIsLive(
            channelBound: false, boundAt: Date(), lastSignalAt: Date()
        ))
    }

    func testNotLiveWhenBoundButNoSignalPastGrace() {
        let bound = Date().addingTimeInterval(-20)
        XCTAssertFalse(WristMirrorTruth.mirrorIsLive(
            channelBound: true, boundAt: bound, lastSignalAt: nil, now: Date()
        ))
    }

    func testLiveWithinGraceAfterBind() {
        let now = Date()
        XCTAssertTrue(WristMirrorTruth.mirrorIsLive(
            channelBound: true, boundAt: now, lastSignalAt: nil, now: now
        ))
    }

    func testLiveWithRecentSignal() {
        let now = Date()
        let signal = now.addingTimeInterval(-5)
        XCTAssertTrue(WristMirrorTruth.mirrorIsLive(
            channelBound: true, boundAt: now.addingTimeInterval(-60),
            lastSignalAt: signal, now: now
        ))
    }

    func testStaleAfterSignalTimeout() {
        let now = Date()
        XCTAssertTrue(WristMirrorTruth.mirrorIsStale(
            channelBound: true,
            lastSignalAt: now.addingTimeInterval(-20),
            now: now
        ))
    }

    @MainActor
    func testPhoneMirrorLiveRequiresSignalNotBindAlone() {
        let mirror = PhoneLiveSession.shared
        mirror.resetPrimaryBindingForTests()
        mirror.resetAthleteEndFlagsForTests()
        XCTAssertFalse(mirror.wristMirrorLive)
    }

    /// FH-107 — stale wrist signal is UI-only; never tear down the HK mirror mid-coaching.
    func testFh107StaleDoesNotReleaseChannelInTickFrame() throws {
        let path = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("FAHYBRIK/Workout/PhoneLiveSession.swift")
        let src = try String(contentsOf: path)
        XCTAssertFalse(src.contains("mirrorIsStale"),
                       "tickFrame must not release HK channel on stale — Apple session stays until end")
        XCTAssertTrue(src.contains("handleMirrorSessionEnded"),
                      "HK delegate end must distinguish mid-workout vs post-workout")
    }
}
