import Foundation

// MARK: - Bundle version metadata (iPhone + Watch)
//
// Apple Bundle Resources: CFBundleShortVersionString is the release number of
// the bundle; CFBundleVersion is the build that identifies an iteration.
// Both are read with Bundle.object(forInfoDictionaryKey:), which returns the
// value from the running target's Info.plist (localized if present).
//
// Xcode expands those keys from MARKETING_VERSION and CURRENT_PROJECT_VERSION
// at build time (ios/project.yml settings.base). No literals, no custom engine.
// Lives in FAHYBRIKCore so both targets compile the same reader — same reason
// Marca reads CFBundleDisplayName here and not in each app.

enum AppBundleMetadata {
    /// Release number (`CFBundleShortVersionString`, e.g. "1.0"). Nil when absent.
    static var marketingVersion: String? {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    }

    /// Build (`CFBundleVersion` ← CURRENT_PROJECT_VERSION). Nil when absent.
    static var buildNumber: String? {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    }

    /// In-app label: marketing + build, e.g. "1.0 (N)", when both exist.
    /// Never fabricated.
    static var displayVersion: String? {
        switch (marketingVersion, buildNumber) {
        case let (marketing?, build?): return "\(marketing) (\(build))"
        case let (marketing?, nil): return marketing
        case let (nil, build?): return build
        default: return nil
        }
    }
}
