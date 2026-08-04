import WatchKit

// Watch-side `Haptics` shim. The shared execution engine (WorkoutSession) calls
// `Haptics.light()/.medium()/.heavy()/.success()/.error()`; on iOS those resolve
// to the UIKit feedback generators in Theme/Haptics.swift, which is UIKit-only and
// therefore NOT compiled into the watch target. This provides the SAME API surface
// backed by WatchKit's `WKInterfaceDevice`, so the engine runs unchanged on the
// wrist. Same type name, disjoint target membership — never a duplicate symbol.
//
// WHY things were silent (4-ago, gym):
// 1. Mirror mode: engine cues fired only on the phone — no wire → wrist never
//    played 3-2-1 / GO / rest. Fixed by MirrorWire.MessageType.haptic.
// 2. `play` off-main is dropped by WatchKit → always hop to main.
// 3. `.click` is too light under effort → cues use start/stop/notification.
enum Haptics {
    private static func play(_ type: WKHapticType) {
        let fire = { WKInterfaceDevice.current().play(type) }
        if Thread.isMainThread {
            fire()
        } else {
            DispatchQueue.main.async(execute: fire)
        }
    }

    private static func playSequence(_ types: [WKHapticType], gap: TimeInterval) {
        guard !types.isEmpty else { return }
        play(types[0])
        for (i, type) in types.dropFirst().enumerated() {
            let delay = gap * Double(i + 1)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                WKInterfaceDevice.current().play(type)
            }
        }
    }

    static func light()   { play(.click) }
    static func medium()  { play(.start) }
    static func heavy()   { play(.stop) }
    static func success() { play(.success) }
    static func error()   { play(.failure) }

    // Workout cues — unmissable under fatigue. Prefer notification/start over click.
    static func cueTick() { play(.notification) }

    /// GO — two strong beats (matches the phone's double Core Haptics hit).
    static func cueGo() { playSequence([.start, .start], gap: 0.10) }

    /// STOP — fall-away pair, distinct from GO.
    static func cueStop() { playSequence([.stop, .notification], gap: 0.14) }

    static func cueFinish() { playSequence([.success, .success], gap: 0.14) }
}
