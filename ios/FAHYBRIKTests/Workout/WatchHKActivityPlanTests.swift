import XCTest
import HealthKit
@testable import FAHYBRIK

// FH-33 — the HK activity is the RUN PIECE, not the day.
final class WatchHKActivityPlanTests: XCTestCase {

    // 8. mixed / hyrox + run piece + street/nil → running outdoor.
    func testPiezaDeCorrerEnDiaMixtoEsRunningOutdoor() {
        for day in ["mixed", "hyrox"] {
            let plan = WatchHKActivityPlan.make(
                pieceIsRun: true,
                dayActivityKind: day,
                environment: nil
            )
            XCTAssertEqual(plan.activityType, .running, day)
            XCTAssertEqual(plan.locationType, .outdoor, day)
            XCTAssertTrue(plan.wantsGPS, day)
            XCTAssertTrue(plan.collectDistance, day)
            XCTAssertTrue(plan.isRunPiece, day)
        }
    }

    func testPiezaDeCorrerEnHyroxConCintaEsIndoorSinGPS() {
        let plan = WatchHKActivityPlan.make(
            pieceIsRun: true,
            dayActivityKind: "hyrox",
            environment: .treadmill
        )
        XCTAssertEqual(plan.activityType, .running)
        XCTAssertEqual(plan.locationType, .indoor)
        XCTAssertFalse(plan.wantsGPS, "indoor never lights CLLocationManager")
        XCTAssertTrue(plan.collectDistance, "HK indoor estimate still counts")
    }

    // 9. Distance collection is on for every run piece, outdoor and indoor.
    func testCollectDistanceEnRunningOutdoorYEnLaPiezaDeUnMixto() {
        let street = WatchHKActivityPlan.make(
            pieceIsRun: true, dayActivityKind: "running", environment: .outdoor
        )
        let mixed = WatchHKActivityPlan.make(
            pieceIsRun: true, dayActivityKind: "mixed", environment: nil
        )
        XCTAssertTrue(street.collectDistance)
        XCTAssertTrue(mixed.collectDistance)
        XCTAssertEqual(WatchHKActivityPlan.distanceType, HKQuantityType(.distanceWalkingRunning))
    }

    func testPiezaQueNoEsCorrerNoPideGPSNiMetros() {
        let plan = WatchHKActivityPlan.make(
            pieceIsRun: false,
            dayActivityKind: "mixed",
            environment: .outdoor
        )
        XCTAssertEqual(plan.activityType, .mixedCardio)
        XCTAssertEqual(plan.locationType, .indoor)
        XCTAssertFalse(plan.wantsGPS)
        XCTAssertFalse(plan.collectDistance)
    }

    func testElDiaRunningSigueSiendoLaSesionDeCalle() {
        XCTAssertEqual(
            WorkoutLocationType.resolve(activityKind: "running", environment: nil),
            .outdoor
        )
        let plan = WatchHKActivityPlan.make(
            pieceIsRun: true, dayActivityKind: "running", environment: nil
        )
        XCTAssertEqual(plan.activityType, .running)
        XCTAssertEqual(plan.locationType, .outdoor)
    }
}
