import WatchKit

// Watch-side `Haptics` shim. The shared execution engine (WorkoutSession) calls
// `Haptics.light()/.medium()/.heavy()/.success()/.error()`; on iOS those resolve
// to the UIKit feedback generators in Theme/Haptics.swift, which is UIKit-only and
// therefore NOT compiled into the watch target. This provides the SAME API surface
// backed by WatchKit's `WKInterfaceDevice`, so the engine runs unchanged on the
// wrist. Same type name, disjoint target membership — never a duplicate symbol.
enum Haptics {
    private static func play(_ type: WKHapticType) {
        WKInterfaceDevice.current().play(type)
    }

    static func light()   { play(.click) }
    static func medium()  { play(.start) }
    static func heavy()   { play(.stop) }
    static func success() { play(.success) }
    static func error()   { play(.failure) }
}
