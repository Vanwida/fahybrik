import XCTest
@testable import FAHYBRIK

final class PhoneMirrorEndPolicyTests: XCTestCase {

    func testRetryBudgetIsFiveSends() {
        XCTAssertTrue(PhoneMirrorEndPolicy.shouldScheduleRetry(sentCount: 1))
        XCTAssertTrue(PhoneMirrorEndPolicy.shouldScheduleRetry(sentCount: 4))
        XCTAssertFalse(PhoneMirrorEndPolicy.shouldScheduleRetry(sentCount: 5))
    }

    func testChannelReleaseAtTenSeconds() {
        XCTAssertFalse(PhoneMirrorEndPolicy.shouldReleaseChannel(elapsedSeconds: 9))
        XCTAssertTrue(PhoneMirrorEndPolicy.shouldReleaseChannel(elapsedSeconds: 10))
    }
}
