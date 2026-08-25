import XCTest
@testable import FAHYBRIK

final class LandscapeTramoTests: XCTestCase {

    func testLandscapeScaleIsTheLargeReplica() {
        XCTAssertEqual(LandscapeTramo.subjectPt, 112)
        XCTAssertEqual(LandscapeTramo.identityPt, 22)
        XCTAssertEqual(LandscapeTramo.titlePt, 28)
        XCTAssertGreaterThan(LandscapeTramo.subjectPt(landscape: true),
                             LandscapeTramo.subjectPt(landscape: false))
        XCTAssertGreaterThan(LandscapeTramo.identityPt(landscape: true),
                             LandscapeTramo.identityPt(landscape: false))
        XCTAssertGreaterThan(LandscapeTramo.titlePt(landscape: true),
                             LandscapeTramo.titlePt(landscape: false))
    }
}
