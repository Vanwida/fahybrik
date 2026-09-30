import WatchKit

// La PALETA (`WatchTheme`) se fue a `FAHYBRIKCore/Watch/Lienzo/WatchPaleta.swift`, que
// compila en los dos targets. Aquí se queda el vocabulario háptico, que necesita
// WKInterfaceDevice y por tanto sólo existe en la muñeca.

// MARK: - Haptics
//
// Watch-side haptic vocabulary wrapping WKInterfaceDevice. The shared engine
// fires its own haptics via the iOS `Haptics` enum (watch shim in WatchHaptics.swift);
// these cover the UI-layer cues the views own (button taps, transitions).
// Always main-thread — see the 4-ago note on the engine shim.
enum WatchHaptics {
    private static func play(_ type: WKHapticType) {
        // Con la cara nueva de correr en pantalla el director es la única fuente (`Vivo.PoliticaHaptica`).
        guard Vivo.PoliticaHaptica.compartida.permite(.heredado) else { return }
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
    static func start()      { play(.start) }
}
