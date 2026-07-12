import XCTest
@testable import FAHYBRIK

// AUDIT-B1 — the bearer Keychain store + its transparent UserDefaults→Keychain
// migration. Each test uses an isolated account so runs never collide, and cleans up.
final class KeychainTokenStoreTests: XCTestCase {

    private func isolatedStore() -> KeychainTokenStore {
        KeychainTokenStore(service: "fahybrid.test", account: "test-\(UUID().uuidString)")
    }
    private func isolatedDefaults() throws -> UserDefaults {
        try XCTUnwrap(UserDefaults(suiteName: "test-\(UUID().uuidString)"))
    }

    func testRoundTripSaveReadUpdateDelete() {
        let store = isolatedStore()
        defer { store.delete() }
        XCTAssertNil(store.read())
        store.save("jwt-abc")
        XCTAssertEqual(store.read(), "jwt-abc")
        store.save("jwt-def")                       // UPDATE in place, not a duplicate
        XCTAssertEqual(store.read(), "jwt-def")
        store.delete()
        XCTAssertNil(store.read())
    }

    func testMigrationMovesTokenAndClearsDefaults() throws {
        let store = isolatedStore(); defer { store.delete() }
        let d = try isolatedDefaults()
        d.set("legacy-jwt", forKey: "k")
        store.migrateFromUserDefaults(key: "k", defaults: d)
        XCTAssertEqual(store.read(), "legacy-jwt")  // moved into the Keychain
        XCTAssertNil(d.string(forKey: "k"))         // removed from UserDefaults
    }

    func testMigrationDoesNotClobberExistingKeychainToken() throws {
        let store = isolatedStore(); defer { store.delete() }
        store.save("keychain-jwt")
        let d = try isolatedDefaults()
        d.set("legacy-jwt", forKey: "k")
        store.migrateFromUserDefaults(key: "k", defaults: d)
        XCTAssertEqual(store.read(), "keychain-jwt")  // the newer Keychain token wins
        XCTAssertNil(d.string(forKey: "k"))           // legacy still cleared
    }

    func testMigrationNoOpWithoutLegacyToken() throws {
        let store = isolatedStore(); defer { store.delete() }
        let d = try isolatedDefaults()
        store.migrateFromUserDefaults(key: "k", defaults: d)
        XCTAssertNil(store.read())
    }
}
