import XCTest
@testable import FAHYBRIK

final class SessionStartPolicyTests: XCTestCase {

    func testMeterAuthorityCopyNamesSource() {
        XCTAssertTrue(SessionStartPolicy.meterAuthoritySubtitle(for: .outdoor).contains("Apple Watch"))
        XCTAssertTrue(SessionStartPolicy.meterAuthoritySubtitle(for: .treadmill).contains("cinta"))
    }

    func testWatchResolvedWhenWristJoined() {
        XCTAssertTrue(SessionStartPolicy.watchResolved(answers: .empty, wristJoined: true))
    }

    func testWatchResolvedWhenUnavailableOrSkipped() {
        var unavailable = SessionStartAnswers.empty
        unavailable.watchUnavailable = true
        XCTAssertTrue(SessionStartPolicy.watchResolved(answers: unavailable, wristJoined: false))

        var skipped = SessionStartAnswers.empty
        skipped.watchProceedWithoutWrist = true
        XCTAssertTrue(SessionStartPolicy.watchResolved(answers: skipped, wristJoined: false))
    }

    func testEmpezarFooterHintNeverBlocks() {
        let pendingWatch = SessionStartPolicy.empezarFooterHint(
            asksWatch: true, watchResolved: false, canReleaseLive: false)
        XCTAssertTrue(pendingWatch.contains("Continuar sin reloj"))
        let joined = SessionStartPolicy.empezarFooterHint(
            asksWatch: true, watchResolved: true, canReleaseLive: true)
        XCTAssertTrue(joined.contains("listo"))
    }
}
