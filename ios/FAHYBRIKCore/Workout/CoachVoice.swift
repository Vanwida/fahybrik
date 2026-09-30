import Foundation

/// Named voice parameters, tuned once, referenced everywhere (no magic literals). Los comparten la voz del
/// iPhone (`SystemCoachSpeaker`) y la del reloj (`WatchVoz`): el mismo entrenador suena igual en los dos.
enum CoachVoice {
    static let languageCode = "es-ES"
    /// Slightly above the default: brisk but not clipped, over the noise of running.
    static let rate: Float = 0.52
    static let pitchMultiplier: Float = 1.0
    /// A short tail so back-to-back cues don't run into each other.
    static let postUtteranceDelay: TimeInterval = 0.05
}
