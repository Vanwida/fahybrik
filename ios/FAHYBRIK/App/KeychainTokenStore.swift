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
    func save(_ token: String) {
        let data = Data(token.utf8)
        let status = SecItemUpdate(baseQuery as CFDictionary,
                                   [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
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
        if read() == nil { save(legacy) }
        defaults.removeObject(forKey: key)
    }
}
