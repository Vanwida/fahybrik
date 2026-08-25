import XCTest
@testable import FAHYBRIK

final class TandaStripTests: XCTestCase {

    func testSecondOfFourReadsAllFourAndMarksTheFirstDone() {
        let strip = TandaStrip.strip(total: 4, actual: 1, hechas: [0])
        XCTAssertEqual(strip.seLee, "1 / 2 / 3 / 4")
        XCTAssertEqual(strip.pasos.map(\.estado), [.hecha, .actual, .futura, .futura])
        XCTAssertFalse(strip.esVentana)
    }

    func testFirstOfThreeReadsTheWholeTanda() {
        let strip = TandaStrip.strip(total: 3, actual: 0, hechas: [])
        XCTAssertEqual(strip.seLee, "1 / 2 / 3")
        XCTAssertEqual(strip.pasos.first?.estado, .actual)
    }

    func testFromTheFifthTheTandaIsAWindowOfThree() {
        XCTAssertEqual(TandaStrip.todasHasta, 4)
        XCTAssertEqual(TandaStrip.ventana, 3)
        let strip = TandaStrip.strip(total: 12, actual: 6, hechas: [0, 1, 2, 3, 4, 5])
        XCTAssertEqual(strip.seLee, "6 / 7 / 8")
        XCTAssertEqual(strip.pasos.map(\.estado), [.hecha, .actual, .futura])
        XCTAssertTrue(strip.esVentana)
    }

    func testWindowShiftsAtTheEnds() {
        XCTAssertEqual(TandaStrip.indices(total: 12, actual: 0), [0, 1, 2])
        XCTAssertEqual(TandaStrip.strip(total: 12, actual: 0, hechas: []).seLee, "1 / 2 / 3")
        XCTAssertEqual(TandaStrip.indices(total: 12, actual: 11), [9, 10, 11])
        XCTAssertEqual(
            TandaStrip.strip(total: 12, actual: 11, hechas: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).seLee,
            "10 / 11 / 12")
    }

    func testSkippedSetIsSkippedNotDone() {
        let strip = TandaStrip.strip(total: 4, actual: 1, hechas: [], saltadas: [0])
        XCTAssertEqual(strip.pasos[0].estado, .saltada)
        XCTAssertEqual(strip.pasos[1].estado, .actual)
        XCTAssertEqual(strip.seLee, "1 / 2 / 3 / 4")
    }

    func testEmptyTandaReadsNothing() {
        let strip = TandaStrip.strip(total: 0, actual: 0, hechas: [])
        XCTAssertEqual(strip.seLee, "")
        XCTAssertEqual(strip.pasos, [])
    }

    func testSeLeeFromConfirmedSetRecords() {
        let series = (1...4).map { n in
            SetRecord(
                setIndex: n,
                repsPrescribed: 10,
                repsActual: 10,
                loadPrescribedKg: 82.5,
                loadActualKg: n == 1 ? 82.5 : nil,
                rpe: nil,
                rir: nil,
                status: "done",
                confirmed: n == 1,
                tempo: nil,
                restS: 90)
        }
        XCTAssertEqual(TandaStrip.seLee(from: series, actual: 1), "1 / 2 / 3 / 4")
        XCTAssertEqual(TandaStrip.strip(from: series, actual: 1).pasos.map(\.estado),
                       [.hecha, .actual, .futura, .futura])
    }
}
