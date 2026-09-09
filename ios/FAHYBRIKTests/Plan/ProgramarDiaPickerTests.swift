import XCTest
@testable import FAHYBRIK

final class ProgramarDiaPickerTests: XCTestCase {

    func testMonSunWindowContainsAnchor() {
        let anchor = "2026-09-09" // Tuesday
        let options = ProgramarDiaPicker.monSunOptions(anchoredOn: anchor)
        XCTAssertEqual(options.count, 7)
        XCTAssertTrue(options.contains { $0.iso == anchor })
        XCTAssertEqual(options.first?.iso, "2026-09-07", "week starts Monday")
        XCTAssertEqual(options.last?.iso, "2026-09-13", "week ends Sunday")
    }

    func testSevenDistinctDays() {
        let options = ProgramarDiaPicker.monSunOptions(anchoredOn: RaceDate.todayISO())
        let isos = Set(options.map(\.iso))
        XCTAssertEqual(isos.count, 7)
    }
}
