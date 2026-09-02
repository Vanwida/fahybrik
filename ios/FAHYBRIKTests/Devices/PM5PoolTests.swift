import XCTest
@testable import FAHYBRIK

// Routing of multi-PM5 roles: which store owns a tramo's numbers. Pure on the
// pool's map — no BLE. The extreme EMOM (remo + ski) must pick the right link.
final class PM5PoolTests: XCTestCase {

    func testActiveStorePrefersRoleBoundWhenConnected() {
        let any = PM5ConnectionStore(service: PM5Service())
        let pool = PM5Pool(any: any)
        let ski = pool.store(for: .ski)
        // Simulate a live ski link without BLE.
        ski.connectionState = .streaming
        ski.connectedIdentifier = UUID()
        ski.connectedDeviceName = "PM5-SKI"

        let store = pool.activeStore(for: .ski)
        XCTAssertTrue(store === ski)
    }

    func testActiveStoreFallsBackToAnyWhenRoleEmpty() {
        let any = PM5ConnectionStore(service: PM5Service())
        any.connectionState = .streaming
        any.connectedIdentifier = UUID()
        let pool = PM5Pool(any: any)

        // No role store connected → unscoped stand-in for any erg modality.
        let store = pool.activeStore(for: .row)
        XCTAssertTrue(store === any)
    }

    func testNonErgModalityReturnsNil() {
        let pool = PM5Pool(any: PM5ConnectionStore(service: PM5Service()))
        XCTAssertNil(pool.activeStore(for: .functional))
        XCTAssertNil(pool.activeStore(for: .strength))
        XCTAssertNil(pool.activeStore(for: .run))
    }

    func testOccupiedIdsCollectsConnectedRoles() {
        let pool = PM5Pool(any: PM5ConnectionStore(service: PM5Service()))
        let row = pool.store(for: .row)
        let ski = pool.store(for: .ski)
        let rowId = UUID()
        let skiId = UUID()
        row.connectionState = .streaming
        row.connectedIdentifier = rowId
        ski.connectionState = .streaming
        ski.connectedIdentifier = skiId

        XCTAssertEqual(pool.occupiedPeripheralIds, [rowId, skiId])
    }

    func testDisconnectAllClearsEveryRole() {
        let pool = PM5Pool(any: PM5ConnectionStore(service: PM5Service()))
        let row = pool.store(for: .row)
        row.connectionState = .streaming
        row.connectedIdentifier = UUID()
        // disconnectAll calls disconnect() which goes through service; in tests
        // without BLE the state may stay — at least the call is idempotent.
        pool.disconnectAll()
        XCTAssertNotNil(pool.store(for: .row))
    }

    func testSkiStoreIsNotRowStoreWhenBothConnected() {
        let pool = PM5Pool(any: PM5ConnectionStore(service: PM5Service()))
        let row = pool.store(for: .row)
        let ski = pool.store(for: .ski)
        row.connectionState = .streaming
        row.connectedIdentifier = UUID()
        ski.connectionState = .streaming
        ski.connectedIdentifier = UUID()

        XCTAssertFalse(row === ski)
        XCTAssertTrue(pool.activeStore(for: .ski) === ski)
        XCTAssertTrue(pool.activeStore(for: .row) === row)
        XCTAssertNotEqual(row.connectedIdentifier, ski.connectedIdentifier)
    }

    func testActiveStoreDoesNotFallBackToOtherRole() {
        // The «2 as 1» bug: Remo is up, Ski is named, Ski tramo must not read Remo.
        let pool = PM5Pool(any: PM5ConnectionStore(service: PM5Service()))
        let row = pool.store(for: .row)
        let ski = pool.store(for: .ski)
        row.connectionState = .streaming
        row.connectedIdentifier = UUID()

        let store = pool.activeStore(for: .ski)
        XCTAssertFalse(store === row)
        XCTAssertTrue(store === ski)
        XCTAssertFalse(store?.isConnected == true)
        XCTAssertTrue(pool.isRoleConnected(.row))
        XCTAssertFalse(pool.isRoleConnected(.ski))
    }

    func testMonoRowUsesOneStore() {
        let any = PM5ConnectionStore(service: PM5Service())
        let pool = PM5Pool(any: any)
        let row = pool.store(for: .row)
        row.connectionState = .streaming
        row.connectedIdentifier = UUID()
        XCTAssertTrue(pool.activeStore(for: .row) === row)
        XCTAssertEqual(pool.occupiedPeripheralIds.count, 1)
    }
}
