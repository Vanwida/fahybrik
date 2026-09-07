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
}
