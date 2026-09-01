import SwiftUI

// Design tokens for the FAHYBRID watch app. The wrist UI is ALWAYS black — no
// light mode on the watch (design: negro #000 + naranja Fabrik). Literal values
// mirror the iOS sources so the two can't drift; those sources are NOT compiled
// into the watch target (they resolve via UIColor, unavailable on watchOS), so we
// re-declare the exact hexes here.
//
// Source of truth for the brand + zone hexes:
//   ios/FAHYBRIK/Theme/Theme.swift        (accent #F06A2A, pressed #D85A20)
//   ios/FAHYBRIKCore/Theme/ZoneColors.swift   (HRZone z1–z5 + %HRmax classifier)
//   docs/superpowers/plans/watchos-diseno.html (the mockups' semantic palette)
//
// COMPILA EN LOS DOS TARGETS (vive en FAHYBRIK/, se lista una a una en el target
// del reloj): las páginas del lienzo llevan color, así que sin la paleta no hay
// modelo de página que compilar en iOS — y sin eso los guiones no se pueden
// testear desde FAHYBRIKTests, que es iOS. Es sólo paleta: SwiftUI puro, sin
// UIKit ni WatchKit. El shim de hápticos que la acompañaba se queda en el reloj
// (FAHYBRIKWatch/WatchTheme.swift), porque ese sí necesita WKInterfaceDevice.
/// El acento del club activo en el reloj, leído del último `WatchTodayPayload`
/// recibido. Vive AQUÍ (FAHYBRIKCore, sin UIKit/WatchKit) porque `WatchTheme`
/// se compila en LOS DOS targets; quien lo RELLENA — `WatchPlanModel`, al
/// decodificar cada push y al recuperar el último persistido en el arranque
/// en frío — vive solo en FAHYBRIKWatch. `nil` = sin coach o sin acento propio.
enum WatchClubAccentState {
    static var current: WatchClubAccentPayload?
}

enum WatchTheme {

    // MARK: - Color

    /// sRGB color from a 0xRRGGBB literal (keeps per-channel exactness without the
    /// /255 boilerplate). watchOS-safe: no UIColor.
    static func hex(_ rgb: UInt32, _ opacity: Double = 1) -> Color {
        Color(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: opacity
        )
    }

    // Surfaces — always-black canvas with layered near-black cards.
    static let bg              = hex(0x000000)   // the watch face
    static let surface         = hex(0x141414)   // metric tile / card
    static let surfaceRaised    = hex(0x1F1F1F)  // pill background
    static let transitionBg    = hex(0x140D07)   // dark-orange interstitial (phase / SIM)
    static let restBg          = hex(0x0D1B0F)   // green-tinted rest banner

    // Text.
    static let ink   = hex(0xFFFFFF)             // primary
    static let dim   = hex(0x8A8A8E)             // secondary / labels

    // Brand orange (the single sharp accent).
    //
    // DYNAMIC: when the athlete's coach has a club accent, the phone pushes it
    // inside the current `WatchTodayPayload` (see `WatchClubAccentPayload` in
    // WatchWireModels.swift) and `WatchPlanModel` lands it in
    // `WatchClubAccentState.current` on every push AND on cold-start disk
    // load — the same mechanism that already persists `today`. `nil` (no
    // coach, no accent, or an unparseable hex) falls back to the literals
    // below, unchanged. The source changed, not the two dozen call sites.
    static var orange: Color      { resolvedAccent(\.fill)  ?? staticOrange }
    static var orangePress: Color { resolvedAccent(\.press) ?? staticOrangePress }
    static var orangeSoft: Color  { resolvedAccent(\.text)  ?? staticOrangeSoft }

    private static let staticOrange      = hex(0xF06A2A) // fill (buttons, bars, active pill)
    private static let staticOrangePress = hex(0xD85A20) // pressed
    private static let staticOrangeSoft  = hex(0xFF8A4C) // orange as small text / status line

    private static func resolvedAccent(_ keyPath: KeyPath<WatchClubAccentPayload, String>) -> Color? {
        guard let payload = WatchClubAccentState.current else { return nil }
        return parseHex(payload[keyPath: keyPath])
    }

    /// "#rrggbb" wire hex → Color. Lenient about the leading `#`; nil on
    /// anything that doesn't parse (the caller falls back to the static token).
    private static func parseHex(_ wire: String) -> Color? {
        var s = wire
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
        return hex(value)
    }

    // Semantic zone hues (per the mockups). Green/amber/red double as the
    // readiness score buckets and the high HR zones; blue is the low aerobic zone.
    static let zoneGreen = hex(0x2FD14F)         // --z-run  (Z3 / "en zona" / readiness ok)
    static let zoneAmber = hex(0xFFB340)         // --z-thr  (Z4 / readiness caution)
    static let zoneRed   = hex(0xFF4D4D)         // --z-vo2  (Z5 / readiness low)
    static let zoneBlue  = hex(0x2A6CFF)         // low aerobic band (Z2)
    static let greenOn   = hex(0x06280F)         // text/glyph on a green fill

    // MARK: - HR zone color
    //
    // Maps an engine `HRZone` (z1–z5) to its on-black watch hue. Mirrors the
    // gray→blue→green→amber→red progression of ZoneColors.swift but with the
    // vivid mockup values so each dot/bar reads on #000. Kept here (not on HRZone)
    // because HRZone.color needs UIColor, unavailable on the watch.
    static func zoneColor(_ zone: HRZone) -> Color {
        hex(zoneHex(zone))
    }

    /// El hue de cada zona como literal, para poder MEZCLARLOS. `zoneColor` sale
    /// de aquí, así que no hay dos tablas que puedan divergir.
    static func zoneHex(_ zone: HRZone) -> UInt32 {
        switch zone {
        case .z1: return 0x8A8A8E   // recovery — muted gray (== dim)
        case .z2: return 0x2A6CFF   // aerobic base
        case .z3: return 0x2FD14F   // tempo
        case .z4: return 0xFFB340   // threshold
        case .z5: return 0xFF4D4D   // VO2 / red line
        }
    }

    /// Mezcla dos hues en sRGB. `k` = cuánto del segundo (0…1). Lo usa el lienzo
    /// de zona para derivar del color de TU zona al de la siguiente conforme te
    /// acercas — el degradado que hace que el estado se lea sin enfocar.
    static func mezcla(_ a: UInt32, _ b: UInt32, _ k: Double) -> Color {
        let t = min(1, max(0, k))
        func canal(_ shift: UInt32) -> Double {
            let ca = Double((a >> shift) & 0xFF)
            let cb = Double((b >> shift) & 0xFF)
            return (ca + (cb - ca) * t) / 255
        }
        return Color(.sRGB, red: canal(16), green: canal(8), blue: canal(0), opacity: 1)
    }

    // MARK: - Readiness zone
    //
    // 0–100 readiness → score color. Thresholds mirror ReadinessZone in
    // ios/FAHYBRIK/Today/ReadinessService.swift (ok ≥ 67 · caution ≥ 45 · else low).
    static let readinessOkMin = 67
    static let readinessCautionMin = 45

    static func readinessColor(_ score: Int) -> Color {
        if score >= readinessOkMin { return zoneGreen }
        if score >= readinessCautionMin { return zoneAmber }
        return zoneRed
    }

    // MARK: - Tuning constants (no magic numbers in logic)

    /// Crown load step for the strength set editor (matches mockup 4d "Crown ▸ ±carga").
    static let loadStepKg: Double = 2.5
    /// Minimum seconds between "out of zone" haptics so a steady bout near the
    /// zone edge never buzzes continuously.
    static let zoneExitHapticThrottle: TimeInterval = 15
    /// How long the run↔station / phase-change interstitial lingers before it
    /// auto-advances the local UI (the engine already advanced underneath).
    static let transitionDwell: TimeInterval = 2.0
    /// Countdown value (seconds) at/under which a timer reads as urgent (accent).
    static let urgentThreshold: Double = 3
}
