import SwiftUI
import WatchKit

// Design tokens for the FAHYBRID watch app. The wrist UI is ALWAYS black — no
// light mode on the watch (design: negro #000 + naranja Fabrik). Literal values
// mirror the iOS sources so the two can't drift; those sources are NOT compiled
// into the watch target (they resolve via UIColor, unavailable on watchOS), so we
// re-declare the exact hexes here.
//
// Source of truth for the brand + zone hexes:
//   ios/FAHYBRIK/Theme/Theme.swift        (accent #F06A2A, pressed #D85A20)
//   ios/FAHYBRIK/Theme/ZoneColors.swift   (HRZone z1–z5 + %HRmax classifier)
//   docs/superpowers/plans/watchos-diseno.html (the mockups' semantic palette)
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
    static let orange     = hex(0xF06A2A)        // fill (buttons, bars, active pill)
    static let orangePress = hex(0xD85A20)       // pressed
    static let orangeSoft = hex(0xFF8A4C)        // orange as small text / status line

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
        switch zone {
        case .z1: return dim        // recovery — muted gray
        case .z2: return zoneBlue   // aerobic base
        case .z3: return zoneGreen  // tempo
        case .z4: return zoneAmber  // threshold
        case .z5: return zoneRed    // VO2 / red line
        }
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

// MARK: - Haptics
//
// Watch-side haptic vocabulary wrapping WKInterfaceDevice. The shared engine
// fires its own haptics via the iOS `Haptics` enum (watch shim in WatchHaptics.swift);
// these cover the UI-layer cues the views own (button taps, transitions, zone exits).
// Always main-thread — see the 4-ago note on the engine shim.
enum WatchHaptics {
    private static func play(_ type: WKHapticType) {
        let fire = { WKInterfaceDevice.current().play(type) }
        if Thread.isMainThread {
            fire()
        } else {
            DispatchQueue.main.async(execute: fire)
        }
    }

    /// UI taps — `notification` so a button is actually felt mid-effort (`.click`
    /// is often lost under sweat / movement).
    static func tap()        { play(.notification) }
    static func success()    { play(.success) }
    static func transition() { play(.directionUp) }
    static func warning()    { play(.notification) }
    static func start()      { play(.start) }
    static func stop()       { play(.stop) }

    /// #56 — "entras tú": the partner's relay just handed the station back. A DOUBLE
    /// notification tap so it's unmistakable on the wrist mid-effort (distinct from the
    /// single-tap cues), the two beats ~220ms apart.
    static func relayHandoff() {
        play(.notification)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            WKInterfaceDevice.current().play(.notification)
        }
    }
}
