import XCTest
@testable import FAHYBRIK

final class JumpPhysicsTests: XCTestCase {
    func testFlight149FramesAt240IsAbout47cm() {
        let t = JumpPhysics.flightTimeSeconds(takeoffFrame: 100, landingFrame: 249, fps: 240)
        XCTAssertNotNil(t)
        let h = JumpPhysics.heightCm(flightTimeS: t!)
        XCTAssertNotNil(h)
        let expected = (JumpPhysics.g * t! * t! / 8) * 100
        XCTAssertEqual(h!, expected, accuracy: 0.0001)
    }

    func testUncertaintyAt240IsAboutPointSix() {
        let u = JumpPhysics.uncertaintyCm(fps: 240)
        XCTAssertNotNil(u)
        XCTAssertGreaterThan(u!, 0.5)
        XCTAssertLessThan(u!, 0.8)
    }

    func testDisplayRounds() {
        XCTAssertEqual(JumpPhysics.displayCm(47.33), "47 cm")
    }

    // 0278 · el 13-08 se conservó un CMJ con el aterrizaje en el fotograma 1161
    // (despegue 580, 239,70 fps): 2,42 s de vuelo, 720 cm. No es un salto.
    func testUnVueloImposibleNoTieneAlturaNiSeConserva() {
        XCTAssertEqual(JumpPhysics.maxFlightS, 1.0)
        XCTAssertNil(JumpPhysics.heightCm(takeoffFrame: 580, landingFrame: 1161, fps: 239.70))
        XCTAssertFalse(JumpPhysics.isPlausible(takeoffFrame: 580, landingFrame: 1161, fps: 239.70))
        // El segundo salto de esa misma serie sí lo era: 51,9 cm.
        let real = JumpPhysics.heightCm(takeoffFrame: 155, landingFrame: 311, fps: 239.69)
        XCTAssertEqual(real ?? 0, 51.94, accuracy: 0.05)
        XCTAssertTrue(JumpPhysics.isPlausible(takeoffFrame: 155, landingFrame: 311, fps: 239.69))
    }
}
