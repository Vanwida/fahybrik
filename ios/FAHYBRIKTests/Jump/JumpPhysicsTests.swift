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
}
