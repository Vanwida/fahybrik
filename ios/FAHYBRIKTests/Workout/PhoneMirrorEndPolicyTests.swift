import XCTest
@testable import FAHYBRIK

final class PhoneMirrorEndPolicyTests: XCTestCase {

    func testChannelReleaseAtTenSeconds() {
        XCTAssertFalse(PhoneMirrorEndPolicy.shouldReleaseChannel(elapsedSeconds: 9))
        XCTAssertTrue(PhoneMirrorEndPolicy.shouldReleaseChannel(elapsedSeconds: 10))
    }
}
