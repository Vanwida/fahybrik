import Foundation

// MARK: - Bundle version metadata (iPhone + Watch)
//
// Reads CFBundleShortVersionString and CFBundleVersion from the running target's
// Info.plist via Bundle.main — the same keys Xcode expands from MARKETING_VERSION
// and CURRENT_PROJECT_VERSION at build time. No literals, no custom engine.

enum AppBundleMetadata {
    /// Marketing version (`CFBundleShortVersionString`, e.g. "1.0"). Nil when absent.
    static var marketingVersion: String? {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    }

    /// Build number (`CFBundleVersion` ← CURRENT_PROJECT_VERSION, e.g. "8"). Nil when absent.
    static var buildNumber: String? {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    }

    /// In-app label: "1.0 (8)" when both exist; otherwise whichever is present. Never fabricated.
    static var displayVersion: String? {
        switch (marketingVersion, buildNumber) {
        case let (marketing?, build?): return "\(marketing) (\(build))"
        case let (marketing?, nil): return marketing
        case let (nil, build?): return build
        default: return nil
        }
    }
}
