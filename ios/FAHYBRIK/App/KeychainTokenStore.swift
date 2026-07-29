import Foundation
import Security

// AUDIT-B1 — the athlete's session bearer (a JWT) belongs in the KEYCHAIN, not
// UserDefaults: a plist-readable credential-at-rest is an App Store / security finding.
// A generic-password item, accessible AFTER FIRST UNLOCK and THIS-DEVICE-ONLY (a session
// token is device-bound — it must never sync to iCloud Keychain). A transparent one-time
// migration moves any legacy UserDefaults token in on launch, so existing users are never
// logged out. Instance-based (service/account injectable) so the migration + round-trip
// are unit-tested against an isolated item, with no external dependency.
struct KeychainTokenStore {
    let service: String
    let account: String

    static let shared = KeychainTokenStore(
        service: Bundle.main.bundleIdentifier ?? "com.fahybrid.app",
        account: "athlete.bearer"
    )

    /// The legacy UserDefaults key the bearer used to live under.
    static let legacyDefaultsKey = "fahybrik.bearer"

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    /// The stored bearer, or nil when none.
    func read() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let token = String(data: data, encoding: .utf8) else { return nil }
        return token
    }

    /// Store (or replace) the bearer. Updates the existing item in place so we never
    /// duplicate it; adds it with the after-first-unlock / this-device-only class.
    ///
    /// RETURNS WHETHER THE TOKEN IS ACTUALLY IN THE KEYCHAIN. The Keychain can refuse a
    /// write (a locked device, a daemon hiccup, a missing entitlement on the simulator),
    /// and this used to discard the `OSStatus` from both calls — so a refusal looked
    /// exactly like a success and only surfaced later as an athlete who had been silently
    /// logged out. `@discardableResult` because the caller that merely mirrors
    /// `AuthState.bearer` has nothing better to do with it; `migrateFromUserDefaults`
    /// below is the caller that MUST check.
    @discardableResult
    func save(_ token: String) -> Bool {
        let data = Data(token.utf8)
        let status = SecItemUpdate(baseQuery as CFDictionary,
                                   [kSecValueData as String: data] as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var add = baseQuery
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    func delete() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    /// One-time transparent migration: a bearer still in UserDefaults is moved into the
    /// Keychain (WITHOUT clobbering one already there) and removed from UserDefaults. A
    /// no-op once migrated. Injectable key/defaults for testing.
    func migrateFromUserDefaults(
        key: String = KeychainTokenStore.legacyDefaultsKey,
        defaults: UserDefaults = .standard
    ) {
        guard let legacy = defaults.string(forKey: key), !legacy.isEmpty else { return }
        // The legacy copy is dropped ONLY once the Keychain really holds a token — either
        // one that was already there (it is the newer one and wins) or the one we just
        // moved in. Clearing unconditionally, as this did, destroyed the athlete's ONLY
        // session token whenever the Keychain write failed: the migration logged him out
        // and there was nothing left to log him back in with. A failed migration must be
        // a no-op that retries next launch, never a data loss.
        let alreadyInKeychain = read() != nil
        guard alreadyInKeychain || save(legacy) else { return }
        defaults.removeObject(forKey: key)
    }
}
