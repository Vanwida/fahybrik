import XCTest
@testable import FAHYBRIK

final class SessionStartPolicyTests: XCTestCase {

    func testMeterAuthorityCopyNamesSource() {
        XCTAssertTrue(SessionStartPolicy.meterAuthoritySubtitle(for: .outdoor).contains("Apple Watch"))
        XCTAssertTrue(SessionStartPolicy.meterAuthoritySubtitle(for: .treadmill).contains("cinta"))
    }
}
