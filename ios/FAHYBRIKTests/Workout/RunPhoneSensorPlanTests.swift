import XCTest
@testable import FAHYBRIK

// UN STREAM: cifra y mapa beben el mismo CoreLocation. El podómetro como
// fuente oficial era el sustituto. El plan solo decide qué CL está vivo.

final class RunPhoneSensorPlanTests: XCTestCase {

    func testStreetRunWithStreetScreenOwningTheSurfaceDoesNotStartASecondGPS() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .outdoor,
            streetScreenOwnsSurface: true
        )
        XCTAssertFalse(plan.ownGPS, "la pantalla de calle ya tiene el stream")
        XCTAssertTrue(plan.altimeter)
    }

    func testStreetRunWithoutTheStreetScreenOwnsItsOwnGPS() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .outdoor,
            streetScreenOwnsSurface: false
        )
        XCTAssertTrue(plan.ownGPS, "sin la pantalla de calle, este CL es el stream")
        XCTAssertTrue(plan.altimeter)
    }

    func testConnectedTreadmillKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .treadmill,
            streetScreenOwnsSurface: false
        )
        XCTAssertEqual(plan, .allOff)
    }

    func testDumbTreadmillKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .indoor,
            streetScreenOwnsSurface: false
        )
        XCTAssertEqual(plan, .allOff)
    }

    func testNonRunSegmentKeepsEveryPhoneSensorOffRegardlessOfEnvironment() {
        for env: RunEnvironment? in [nil, .outdoor, .treadmill, .indoor] {
            let plan = RunPhoneSensorPlan.decide(
                isRunSegment: false,
                environment: env,
                streetScreenOwnsSurface: false
            )
            XCTAssertEqual(plan, .allOff, "sin tramo de correr, \(String(describing: env)) no enciende nada")
        }
    }

    func testRunSegmentWithNoEnvironmentAnswerYetKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: nil,
            streetScreenOwnsSurface: false
        )
        XCTAssertEqual(plan, .allOff)
    }
}
