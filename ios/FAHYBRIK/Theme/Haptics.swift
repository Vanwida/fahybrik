import UIKit
import CoreHaptics

// Haptics, in two vocabularies, because the app has two completely different
// reasons to buzz.
//
// UI FEEDBACK (`light` / `medium` / `heavy` / `success` / `error`) is what a hand
// holding the phone feels when it taps something. Unchanged in meaning.
//
// WORKOUT CUES (`cue*`) are read by a phone LYING ON THE FLOOR while the athlete
// works two metres away. On 28-jul Alex reported "no hay haptics en móvil": there
// is no suppression anywhere — nothing mutes the phone when the watch is mirroring
// — but the cues were physically too weak to survive that trip. Two real causes:
//
//   1. every call built a `UIImpactFeedbackGenerator`, called `prepare()` and fired
//      it in the same breath, then let it deallocate. `prepare()` is an ASYNCHRONOUS
//      warm-up of the Taptic Engine; firing immediately and releasing the generator
//      is the documented way to get a weak buzz or no buzz at all. The generators
//      are now created once and kept alive, and re-prepared after each fire.
//   2. a workout tick was a `.light` impact — the lightest thing iOS can produce.
//      A countdown you must feel from the floor is not the same event as a button
//      tap and can't share its intensity.
//
// The cues use Core Haptics for full-intensity, sharp transients (and patterns for
// the ones that must be unmissable), falling back to the notification generator
// where Core Haptics isn't available. Everything is main-thread and best-effort:
// a device with haptics disabled simply feels nothing, and the workout is unharmed.
enum Haptics {

    // MARK: - UI feedback

    static func light()   { engine.impact(.light) }
    static func medium()  { engine.impact(.medium) }
    static func heavy()   { engine.impact(.heavy) }
    static func success() { engine.notify(.success) }
    static func error()   { engine.notify(.error) }

    // MARK: - Workout cues (felt from the floor, mid-effort)

    /// Optional fan-out: when the wrist is mirroring, the phone's engine cues must
    /// also reach the watch (the engine only runs here). `PhoneMirrorService`
    /// installs this in `prepare()`. Cue names = `MirrorWire.HapticCue`.
    static var relayWorkoutCue: ((String) -> Void)?

    /// One second of a count-in. Short and sharp, but at full intensity — the
    /// athlete has to count it without looking.
    static func cueTick() {
        engine.transient(intensity: 1.0, sharpness: 0.9)
        relayWorkoutCue?(MirrorWire.HapticCue.tick)
    }

    /// GO — the work starts now. A single firm hit.
    static func cueGo() {
        engine.pattern([(0.00, 1.0, 0.7), (0.06, 1.0, 0.9)])
        relayWorkoutCue?(MirrorWire.HapticCue.go)
    }

    /// STOP — the work window just ended (a change window, a rest). Deliberately
    /// unlike `cueGo`: two beats falling away, so the two are never confused under
    /// effort.
    static func cueStop() {
        engine.pattern([(0.00, 1.0, 0.4), (0.13, 0.8, 0.3)])
        relayWorkoutCue?(MirrorWire.HapticCue.stop)
    }

    /// The whole thing is done. Three rising beats — the only cue that is allowed
    /// to feel celebratory.
    static func cueFinish() {
        engine.pattern([(0.00, 0.8, 0.5), (0.12, 0.9, 0.7), (0.24, 1.0, 0.9)])
        relayWorkoutCue?(MirrorWire.HapticCue.finish)
    }

    private static let engine = HapticEngine()
}

/// Owns the retained generators and the Core Haptics engine. One instance, alive
/// for the app's lifetime — which is the entire point.
private final class HapticEngine {
    private let lightGen = UIImpactFeedbackGenerator(style: .light)
    private let mediumGen = UIImpactFeedbackGenerator(style: .medium)
    private let heavyGen = UIImpactFeedbackGenerator(style: .heavy)
    private let notifyGen = UINotificationFeedbackGenerator()

    private var chEngine: CHHapticEngine?
    private let supportsCoreHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    init() {
        lightGen.prepare()
        mediumGen.prepare()
        heavyGen.prepare()
        notifyGen.prepare()
    }

    func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let gen: UIImpactFeedbackGenerator
        switch style {
        case .light: gen = lightGen
        case .heavy: gen = heavyGen
        default:     gen = mediumGen
        }
        gen.impactOccurred()
        gen.prepare()   // stay warm for the next one
    }

    func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        notifyGen.notificationOccurred(type)
        notifyGen.prepare()
    }

    /// One full-intensity hit.
    func transient(intensity: Float, sharpness: Float) {
        pattern([(0, intensity, sharpness)])
    }

    /// A sequence of `(delay, intensity, sharpness)` transients. Falls back to the
    /// strongest UIKit equivalent when Core Haptics isn't available on the device.
    func pattern(_ beats: [(TimeInterval, Float, Float)]) {
        guard supportsCoreHaptics, let engine = liveEngine() else {
            heavyGen.impactOccurred()
            heavyGen.prepare()
            return
        }
        let events = beats.map { beat in
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: beat.1),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: beat.2)
                ],
                relativeTime: beat.0
            )
        }
        do {
            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            heavyGen.impactOccurred()
            heavyGen.prepare()
        }
    }

    /// The Core Haptics engine, started lazily and restarted after the system stops
    /// it (which it does whenever the app leaves the foreground). Without this the
    /// cues die silently the first time the athlete answers a message mid-workout.
    private func liveEngine() -> CHHapticEngine? {
        if let chEngine { return chEngine }
        do {
            let engine = try CHHapticEngine()
            engine.isAutoShutdownEnabled = false
            engine.resetHandler = { [weak self] in
                try? self?.chEngine?.start()
            }
            engine.stoppedHandler = { _ in }
            try engine.start()
            chEngine = engine
            return engine
        } catch {
            return nil
        }
    }
}
