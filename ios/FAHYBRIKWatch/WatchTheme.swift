import WatchKit

// La PALETA (`WatchTheme`) se fue a `FAHYBRIK/Watch/Lienzo/WatchPaleta.swift`, que
// compila en los dos targets. Aquí se queda el vocabulario háptico, que necesita
// WKInterfaceDevice y por tanto sólo existe en la muñeca.

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
