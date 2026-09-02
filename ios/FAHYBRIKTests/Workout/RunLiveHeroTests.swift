import XCTest
@testable import FAHYBRIK

final class RunLiveHeroTests: XCTestCase {

    func testIndoorNoSourceDoesNotPaintPlanPace() {
        let hero = RunLiveHero.resolve(
            isGuidanceOnly: false,
            effortGuidance: nil,
            livePaceSecPerKm: nil,
            hasLiveDistance: false,
            hasPacePrescription: true,
            lapElapsed: 90
        )
        XCTAssertEqual(hero, .sinFuente)
        if case let .sinFuente = hero {
            XCTAssertNotEqual(Vocab.sinFuente, "5:45/km")
            XCTAssertEqual(Vocab.sinFuente, "no hay fuente")
        }
    }

    func testMeasuredHKPaceIsTheHero() {
        let hero = RunLiveHero.resolve(
            isGuidanceOnly: false,
            effortGuidance: nil,
            livePaceSecPerKm: 300,
            hasLiveDistance: true,
            hasPacePrescription: true,
            lapElapsed: 90
        )
        XCTAssertEqual(hero, .ritmoMedido(300))
        XCTAssertNotEqual(Formato.ritmoCifras(300) + Formato.UnidadRitmo.porKm.rawValue, "5:45/km")
    }

    func testGuidanceOnlyStaysEffort() {
        let hero = RunLiveHero.resolve(
            isGuidanceOnly: true,
            effortGuidance: "Suave",
            livePaceSecPerKm: nil,
            hasLiveDistance: false,
            hasPacePrescription: false,
            lapElapsed: 12
        )
        XCTAssertEqual(hero, .esfuerzo("Suave"))
    }

    func testNoPrescriptionFallsToLapClock() {
        let hero = RunLiveHero.resolve(
            isGuidanceOnly: false,
            effortGuidance: nil,
            livePaceSecPerKm: nil,
            hasLiveDistance: false,
            hasPacePrescription: false,
            lapElapsed: 42
        )
        XCTAssertEqual(hero, .relojDeVuelta(42))
    }

    func testIndoorCoverStartsWithoutBelt() {
        XCTAssertEqual(
            RunCoverAutoOpen.decide(environment: .indoor),
            .treadmill(empiezaSinCinta: true)
        )
        XCTAssertEqual(
            RunCoverAutoOpen.decide(environment: .treadmill),
            .treadmill(empiezaSinCinta: false)
        )
        XCTAssertEqual(
            RunCoverAutoOpen.decide(environment: .outdoor),
            .outdoor
        )
    }
}
