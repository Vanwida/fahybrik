import XCTest
@testable import FAHYBRIK

final class GPSSignalQualityTests: XCTestCase {

    func testDisplayLabelsOnly() {
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 8), .strong)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 20), .weak)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 80), .searching)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: -1), .searching)
    }
}
