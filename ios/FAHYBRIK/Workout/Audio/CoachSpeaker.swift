import AVFoundation

// MARK: - CoachSpeaker — the voice, behind a protocol (#63)
//
// The synthesizer is isolated behind `CoachSpeaker` so `AudioCoach`'s queue /
// priority / ducking logic is testable with a mock and never touches AVFoundation
// in tests. The real implementation wraps a single `AVSpeechSynthesizer` and
// reports completion so the coach can drain the next queued cue.

/// Named voice parameters — tuned once, referenced everywhere (no magic literals).
enum CoachVoice {
    static let languageCode = "es-ES"
    /// Slightly above the default: brisk but not clipped, over the noise of running.
    static let rate: Float = 0.52
    static let pitchMultiplier: Float = 1.0
    /// A short tail so back-to-back cues don't run into each other.
    static let postUtteranceDelay: TimeInterval = 0.05
}

protocol CoachSpeaker: AnyObject {
    /// Invoked (main thread) when the current utterance finishes OR is cancelled —
    /// the coach's signal to speak the next queued cue or release the session.
    var onFinish: (() -> Void)? { get set }
    func speak(_ text: String)
    /// Cancel anything in progress (e.g. a new workout, or "Avisos de voz" off).
    func stop()
}

/// Owns the app's audio SESSION for voice: activating it (so speech plays through
/// the silent switch, mixed over music) and ducking other audio while we talk.
/// `WorkoutAudio` conforms — it already owns the shared `AVAudioSession` for tones,
/// so ducking stays in ONE place. Behind a protocol for test injection.
protocol VoiceAudioSession: AnyObject {
    /// true  → ensure the session is active and DUCK other audio (we're speaking).
    /// false → un-duck; release the session if nothing else (tones) is using it.
    func setVoiceActive(_ active: Bool)
}

final class SystemCoachSpeaker: NSObject, CoachSpeaker, AVSpeechSynthesizerDelegate {
    var onFinish: (() -> Void)?

    private let synth = AVSpeechSynthesizer()
    private let voice = AVSpeechSynthesisVoice(language: CoachVoice.languageCode)
        ?? AVSpeechSynthesisVoice(language: "es")

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = CoachVoice.rate
        utterance.pitchMultiplier = CoachVoice.pitchMultiplier
        utterance.postUtteranceDelay = CoachVoice.postUtteranceDelay
        synth.speak(utterance)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    // Both completion and cancellation must advance the queue, else a cancelled cue
    // would strand the coach waiting forever.
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish?()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onFinish?()
    }
}
