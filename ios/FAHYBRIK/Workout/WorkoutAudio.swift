import AVFoundation

// MARK: - WorkoutAudio
//
// Tone cues for the live workout — the EMOM "on-the-minute" beep, the last-3s
// ticks, the alternating-movement change, the count-in and the finish chord.
//
// WHY AVAudioEngine (not AudioServicesPlaySystemSound):
//   • System sounds are SILENCED by the ring/silent switch and can't be heard
//     over the athlete's music. A `.playback` AVAudioSession plays THROUGH the
//     silent switch — correct for a workout app — and `.mixWithOthers` overlays
//     the beep on top of music without stopping it.
//   • Keeping the engine running for the duration of the EMOM holds the audio
//     session in the "playing" state, which — paired with the `audio`
//     UIBackgroundMode — keeps the app (and its interval Timer) alive while the
//     screen is LOCKED, so the every-minute beep still fires from a pocketed
//     phone. The engine renders silence between beeps; nothing audible leaks.
//
// Tones are synthesised sine bursts (with a short attack/decay envelope to avoid
// clicks), so there are no bundled audio assets to ship or keep in sync.
final class WorkoutAudio {
    static let shared = WorkoutAudio()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let sampleRate: Double = 44_100
    private var isActive = false

    // Pre-rendered cue buffers (built lazily on first activation).
    private var beepBuffer: AVAudioPCMBuffer?       // top-of-interval "on the minute"
    private var tickBuffer: AVAudioPCMBuffer?       // last-3s countdown ticks
    private var changeBuffer: AVAudioPCMBuffer?     // alternating-movement change
    private var goBuffer: AVAudioPCMBuffer?         // count-in → start
    private var finishBuffer: AVAudioPCMBuffer?     // EMOM complete

    private var format: AVAudioFormat {
        AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
    }

    private init() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    // MARK: Lifecycle

    /// Configure + start the audio path. Idempotent. Called when an EMOM segment
    /// begins; the engine then stays up (rendering silence) until `deactivate()`.
    func activate() {
        guard !isActive else { return }
        buildBuffersIfNeeded()
        do {
            let session = AVAudioSession.sharedInstance()
            // `.playback` → plays through the silent switch; `.mixWithOthers` →
            // overlays the cue on the athlete's music instead of pausing it.
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)

            if engine.attachedNodes.contains(player) == false {
                engine.attach(player)
                engine.connect(player, to: engine.mainMixerNode, format: format)
            }
            engine.prepare()
            try engine.start()
            player.play()
            isActive = true
        } catch {
            isActive = false
        }
    }

    /// Stop the audio path and release the session. Idempotent.
    func deactivate() {
        guard isActive else { return }
        isActive = false
        if player.isPlaying { player.stop() }
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    // MARK: Cues

    /// Top-of-interval beep — the defining "on the minute" cue.
    func playIntervalStart() { play(beepBuffer) }
    /// Last-3s countdown tick before each interval boundary.
    func playTick() { play(tickBuffer) }
    /// Distinct two-note cue when the movement changes (alternating EMOM).
    func playMovementChange() { play(changeBuffer) }
    /// Count-in resolved → first interval starts.
    func playGo() { play(goBuffer) }
    /// EMOM complete.
    func playFinish() { play(finishBuffer) }

    private func play(_ buffer: AVAudioPCMBuffer?) {
        guard isActive, let buffer else { return }
        if !engine.isRunning { try? engine.start() }
        if !player.isPlaying { player.play() }
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
    }

    // MARK: Tone synthesis

    private func buildBuffersIfNeeded() {
        guard beepBuffer == nil else { return }
        // A sharp, bright beep for the boundary; a shorter, lower tick for the
        // count; a rising two-note for a movement change; a clean "go"; a short
        // descending two-note finish.
        beepBuffer   = tone(segments: [(1_000, 0.18)])
        tickBuffer   = tone(segments: [(720, 0.07)])
        changeBuffer = tone(segments: [(700, 0.10), (1_180, 0.16)])
        goBuffer     = tone(segments: [(1_320, 0.22)])
        finishBuffer = tone(segments: [(1_180, 0.14), (760, 0.14), (520, 0.22)])
    }

    /// Render one or more sequential sine segments (frequency Hz, duration s) into
    /// a single mono PCM buffer, each with a 6ms attack + decay envelope to kill
    /// the click that a raw start/stop of a sine would produce.
    private func tone(segments: [(Double, Double)]) -> AVAudioPCMBuffer? {
        let total = segments.reduce(0.0) { $0 + $1.1 }
        let frameCount = AVAudioFrameCount(total * sampleRate)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
              let channel = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frameCount

        let amplitude: Float = 0.6
        let edge = Int(0.006 * sampleRate)   // 6ms ramp
        var frame = 0
        for (freq, dur) in segments {
            let segFrames = Int(dur * sampleRate)
            for i in 0..<segFrames where frame < Int(frameCount) {
                let t = Double(i) / sampleRate
                var env: Float = 1
                if i < edge { env = Float(i) / Float(edge) }
                else if i > segFrames - edge { env = Float(segFrames - i) / Float(edge) }
                channel[frame] = amplitude * env * Float(sin(2 * .pi * freq * t))
                frame += 1
            }
        }
        return buffer
    }

    // MARK: Interruptions

    @objc private func handleInterruption(_ note: Notification) {
        guard isActive,
              let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            // The system paused us (e.g. a call). Leave `isActive` so we restart.
            engine.stop()
        case .ended:
            try? AVAudioSession.sharedInstance().setActive(true)
            try? engine.start()
            player.play()
        @unknown default:
            break
        }
    }
}
