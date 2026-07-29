import XCTest
@testable import FAHYBRIK

// AUDIT-B1 — the bearer Keychain store + its transparent UserDefaults→Keychain
// migration. Each test uses an isolated account so runs never collide, and cleans up.
final class KeychainTokenStoreTests: XCTestCase {

    /// A Keychain item nobody else uses, removed however the test exits (a `defer` only
    /// covers the path the author thought of; a leaked item is read by the next run and
    /// makes the suite order-dependent).
    private func isolatedStore() -> KeychainTokenStore {
        let store = KeychainTokenStore(service: "fahybrid.test", account: "test-\(UUID().uuidString)")
        addTeardownBlock { store.delete() }
        return store
    }

    /// Likewise for the legacy defaults — and the SUITE is removed, not just its key.
    /// Every run used to strand a fresh plist in the simulator container for ever.
    private func isolatedDefaults() throws -> UserDefaults {
        let suite = "test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { UserDefaults.standard.removePersistentDomain(forName: suite) }
        return defaults
    }

    /// `save` now reports whether the item really landed, so a Keychain that refuses the
    /// write says so HERE — instead of surfacing three assertions later as an unexplained
    /// "nil is not equal to jwt-abc", which is what made this suite look flaky.
    private func save(_ token: String, into store: KeychainTokenStore,
                      line: UInt = #line) {
        XCTAssertTrue(store.save(token), "the Keychain refused to store the bearer",
                      line: line)
    }

    func testRoundTripSaveReadUpdateDelete() {
        let store = isolatedStore()
        XCTAssertNil(store.read())
        save("jwt-abc", into: store)
        XCTAssertEqual(store.read(), "jwt-abc")
        save("jwt-def", into: store)                // UPDATE in place, not a duplicate
        XCTAssertEqual(store.read(), "jwt-def")
        store.delete()
        XCTAssertNil(store.read())
    }

    func testMigrationMovesTokenAndClearsDefaults() throws {
        let store = isolatedStore()
        let d = try isolatedDefaults()
        d.set("legacy-jwt", forKey: "k")
        store.migrateFromUserDefaults(key: "k", defaults: d)
        XCTAssertEqual(store.read(), "legacy-jwt")  // moved into the Keychain
        XCTAssertNil(d.string(forKey: "k"))         // removed from UserDefaults
    }

    func testMigrationDoesNotClobberExistingKeychainToken() throws {
        let store = isolatedStore()
        save("keychain-jwt", into: store)
        let d = try isolatedDefaults()
        d.set("legacy-jwt", forKey: "k")
        store.migrateFromUserDefaults(key: "k", defaults: d)
        XCTAssertEqual(store.read(), "keychain-jwt")  // the newer Keychain token wins
        XCTAssertNil(d.string(forKey: "k"))           // legacy still cleared
    }

    func testMigrationNoOpWithoutLegacyToken() throws {
        let store = isolatedStore()
        let d = try isolatedDefaults()
        store.migrateFromUserDefaults(key: "k", defaults: d)
        XCTAssertNil(store.read())
    }

    /// The migration must never leave the athlete with NO copy of his bearer. Whichever
    /// side holds it, one of them still does once the migration has run — the invariant
    /// that was violated while a failed Keychain write still cleared UserDefaults.
    func testMigrationLeavesTokenRetrievableFromOneSideOrTheOther() throws {
        let store = isolatedStore()
        let d = try isolatedDefaults()
        d.set("legacy-jwt", forKey: "k")
        store.migrateFromUserDefaults(key: "k", defaults: d)
        let survives = store.read() ?? d.string(forKey: "k")
        XCTAssertEqual(survives, "legacy-jwt", "the migration lost the athlete's session")
    }
}
