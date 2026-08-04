import WatchKit

// Watch-side `Haptics` shim. The shared execution engine (WorkoutSession) calls
// `Haptics.light()/.medium()/.heavy()/.success()/.error()`; on iOS those resolve
// to the UIKit feedback generators in Theme/Haptics.swift, which is UIKit-only and
// therefore NOT compiled into the watch target. This provides the SAME API surface
// backed by WatchKit's `WKInterfaceDevice`, so the engine runs unchanged on the
// wrist. Same type name, disjoint target membership — never a duplicate symbol.
//
// 4-ago: `play` is ALWAYS main-thread. Timer / HealthKit / mirror callbacks can
// land off-main; WKInterfaceDevice.play is a no-op (or dropped) off the main
// run loop — which is how "no hay haptics en el reloj" survived the iOS floor fix
// of 28-jul (that one only rewrote the phone side).
enum Haptics {
    private static func play(_ type: WKHapticType) {
        if Thread.isMainThread {
            WKInterfaceDevice.current().play(type)
        } else {
            DispatchQueue.main.async {
                WKInterfaceDevice.current().play(type)
            }
        }
    }

    static func light()   { play(.click) }
    static func medium()  { play(.start) }
    static func heavy()   { play(.stop) }
    static func success() { play(.success) }
    static func error()   { play(.failure) }

    // Workout cues — same MEANING as iOS Core Haptics cues, mapped to the
    // strongest WatchKit types that still read as distinct under effort.
    static func cueTick() { play(.directionUp) }

    /// GO — two beats so it can't be missed under fatigue (matches iOS double hit).
    static func cueGo() {
        play(.start)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            WKInterfaceDevice.current().play(.start)
        }
    }

    /// STOP — fall-away pair, distinct from GO.
    static func cueStop() {
        play(.stop)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
            WKInterfaceDevice.current().play(.click)
        }
    }

    static func cueFinish() {
        play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            WKInterfaceDevice.current().play(.success)
        }
    }
}
