import Foundation

// MARK: - RunCueEngine — WHAT to say and WHEN (#63)
//
// The decision brain of live audio coaching, kept PURE: it receives semantic
// events + live state and returns the utterances to speak, holding only the small
// amount of state the timing rules need (pace hysteresis, the split cursor, the
// once-per-leg countdown, whether a run was even announced). No AVFoundation, no
// session / treadmill types → every rule below is unit-tested deterministically.
//
// The app-layer `AudioCoach` feeds this engine from `WorkoutSession` (leg entries,
// leg-time countdown, finish) and `TreadmillHUDModel` (live pace, covered
// distance), and speaks whatever it returns.

final class RunCueEngine {

    // Tuning — named so the "anti-pesadez" behaviour is explicit and testable.
    /// Minimum gap between two pace corrections (seconds).
    private let minCorrectionInterval: TimeInterval
    /// How long the athlete must stay out of band before the FIRST correction fires.
    private let correctionDwell: TimeInterval
    /// Seconds-remaining at which the end-of-leg voice heads-up fires.
    private let countdownAtSeconds: Double

    // Pace hysteresis state.
    private var episodeDirection: TargetStatus?   // direction of the current out-of-band spell
    private var episodeSince: TimeInterval?       // when that spell began
    private var lastCorrectionAt: TimeInterval?   // when we last spoke a correction
    private var lastSpokenDirection: TargetStatus?// last direction spoken (nil once back in band)

    // Countdown — fired at most once per leg key.
    private var countdownDoneKey: String?

    /// True once a run leg has been announced this workout — gates the finish cue so
    /// a pure strength / metcon session never gets a running "tiempo total".
    private(set) var didAnnounceRun = false

    init(minCorrectionInterval: TimeInterval = 30,
         correctionDwell: TimeInterval = 10,
         countdownAtSeconds: Double = 10) {
        self.minCorrectionInterval = minCorrectionInterval
        self.correctionDwell = correctionDwell
        self.countdownAtSeconds = countdownAtSeconds
    }

    // MARK: Lifecycle

    /// Full reset for a new workout.
    func reset() {
        resetPace()
        countdownDoneKey = nil
        didAnnounceRun = false
    }

    private func resetPace() {
        episodeDirection = nil
        episodeSince = nil
        lastCorrectionAt = nil
        lastSpokenDirection = nil
    }

    // MARK: Events → cues

    /// Entering a leg (work or recovery) — always a transition cue. A new leg also
    /// clears the pace episode so corrections start fresh against the new target.
    func announceLeg(_ leg: CueLeg) -> CoachUtterance {
        didAnnounceRun = true
        resetPace()
        return CoachUtterance(text: CoachSpeech.legText(leg), priority: .transition)
    }

    /// A live pace evaluation (only meaningful when the leg is judged on pace and a
    /// live pace source exists). `deltaSec` is the magnitude to the nearest bound.
    /// Fires a correction only when ALL hold:
    ///   1. out of band (too fast / too slow),
    ///   2. continuously out of band for at least `correctionDwell`,
    ///   3. at least `minCorrectionInterval` since the last correction,
    ///   4. NOT the same direction we just corrected (no nagging the same way twice
    ///      without a change — a return to band or a flip clears the lock).
    func onPaceSample(status: TargetStatus, deltaSec: Int?, now: TimeInterval) -> CoachUtterance? {
        switch status {
        case .inTarget, .unknown:
            episodeDirection = nil
            episodeSince = nil
            lastSpokenDirection = nil   // back in band → same direction allowed again later
            return nil
        case .tooFast, .tooSlow:
            if episodeDirection != status {   // new spell, or a flip fast↔slow
                episodeDirection = status
                episodeSince = now
            }
            guard let since = episodeSince, now - since >= correctionDwell else { return nil }
            if let last = lastCorrectionAt, now - last < minCorrectionInterval { return nil }
            if lastSpokenDirection == status { return nil }
            lastCorrectionAt = now
            lastSpokenDirection = status
            return CoachUtterance(text: CoachSpeech.paceCorrection(status: status, deltaSec: deltaSec),
                                  priority: .pace)
        }
    }

    /// EL KILÓMETRO YA VIENE DETECTADO. Aquí sólo se pone en palabras.
    ///
    /// Antes este método TAMBIÉN lo detectaba: llevaba su propio cursor
    /// (`lastSplitKm` / `lastSplitElapsed`) alimentado por los dos modelos de HUD.
    /// El cursor vive ahora en el motor (`RunKmSplits`), que es donde entran los
    /// metros — así el suceso también puede llegar a la grabación de Apple como una
    /// vuelta, y no sólo a la voz.
    func announce(split: RunKmSplit) -> CoachUtterance {
        CoachUtterance(text: CoachSpeech.split(km: split.km, splitSec: split.paceSecPerKm),
                       priority: .split)
    }

    /// Remaining seconds on a TIMED leg → a single "10 segundos" heads-up per leg.
    /// (The 3-2-1 stays on tones; only the 10s gets a voice.)
    func onTimeRemaining(_ remaining: Double, legKey: String) -> CoachUtterance? {
        guard remaining > 0, remaining <= countdownAtSeconds, countdownDoneKey != legKey else { return nil }
        countdownDoneKey = legKey
        return CoachUtterance(text: CoachSpeech.countdown, priority: .transition)
    }

    /// End of workout — total time, only if a run was actually coached.
    func announceFinish(totalSeconds: Int) -> CoachUtterance? {
        guard didAnnounceRun else { return nil }
        return CoachUtterance(text: CoachSpeech.finish(totalSeconds: totalSeconds), priority: .transition)
    }
}
