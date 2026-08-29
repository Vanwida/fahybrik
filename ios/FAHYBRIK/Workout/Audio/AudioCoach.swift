import Foundation

// MARK: - AudioCoach — live audio-coaching glue (#63)
//
// The one object the workout wires talk to. It OBSERVES (never couples): the
// `WorkoutSession` structured-run engine reports leg entries / leg-time countdown /
// finish; `TreadmillHUDModel` reports live pace and covered distance. AudioCoach
// hands each to the pure `RunCueEngine`, then drives a `CoachSpeaker` through a
// priority `CueQueue`, ducking other audio only while a cue is actually speaking.
//
// A process-wide singleton (like `WorkoutAudio`) because live coaching, the audio
// session and the synthesizer are all process-level; a workout resets it via
// `beginWorkout()`. Main-thread affined — every caller runs on the main run loop.

/// Persistence for the "Avisos de voz" setting (ProfileView toggle + HUD speaker
/// button both bind this key; the coach reads it live so the switch is instant).
enum AudioCoachSettings {
    static let enabledKey = "fahybrik.audioCoach.voiceEnabled"
    /// ON by default — the audio experience is the point of the feature.
    static var isEnabled: Bool {
        (UserDefaults.standard.object(forKey: enabledKey) as? Bool) ?? true
    }
}

final class AudioCoach {
    static let shared = AudioCoach()

    private let engine: RunCueEngine
    private var queue = CueQueue()
    private let speaker: CoachSpeaker
    private let audioSession: VoiceAudioSession
    private let now: () -> TimeInterval

    /// Our own speaking flag — authoritative for draining (more reliable than polling
    /// the synth's `isSpeaking` immediately after `speak`).
    private var isSpeaking = false

    init(engine: RunCueEngine = RunCueEngine(),
         speaker: CoachSpeaker = SystemCoachSpeaker(),
         audioSession: VoiceAudioSession = WorkoutAudio.shared,
         now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.engine = engine
        self.speaker = speaker
        self.audioSession = audioSession
        self.now = now
        self.speaker.onFinish = { [weak self] in self?.drainOrRelease() }
    }

    // MARK: - Workout lifecycle

    /// Fresh slate for a new workout: clear engine state + any queued/spoken cue.
    func beginWorkout() {
        engine.reset()
        queue.removeAll()
        isSpeaking = false
        speaker.stop()
        audioSession.setVoiceActive(false)
    }

    /// Silence immediately — used when the athlete flips "Avisos de voz" OFF mid-run
    /// (so a cue in progress stops at once, not after it finishes).
    func stopSpeaking() {
        queue.removeAll()
        isSpeaking = false
        speaker.stop()
        audioSession.setVoiceActive(false)
    }

    /// End of workout — total time (only if a run was coached this session).
    func finishWorkout(totalSeconds: Int) {
        if let utterance = engine.announceFinish(totalSeconds: totalSeconds) { enqueue(utterance) }
    }

    // MARK: - Run events (from WorkoutSession's structured-run engine)

    /// A leg (work or recovery) just began — announce it.
    func announceRunLeg(in session: WorkoutSession) {
        guard let leg = CueLeg(session: session) else { return }
        enqueue(engine.announceLeg(leg))
    }

    /// The current TIME leg's remaining seconds — drives the once-per-leg "10 segundos".
    func runLegTimeRemaining(_ remaining: Double, in session: WorkoutSession) {
        let key = "\(session.currentSegmentIndex)#\(session.runLegIndex)"
        if let utterance = engine.onTimeRemaining(remaining, legKey: key) { enqueue(utterance) }
    }

    // MARK: - Run events (from the HUD models)

    /// Live pace vs the leg's pace target.
    func paceUpdate(status: TargetStatus, deltaSec: Int?) {
        if let utterance = engine.onPaceSample(status: status, deltaSec: deltaSec, now: now()) {
            enqueue(utterance)
        }
    }

    // EL KILÓMETRO NO LO DICE ESTA VOZ, Y ES DELIBERADO.
    //
    // El aviso de parcial es de Apple: lo da la app Entrenamiento cuando el kilómetro
    // es un PASO del entreno que le mandamos (`AppleWorkoutMapper.kmSteps`). Una
    // segunda voz nuestra sobre lo mismo son dos voces en el oído del atleta y, peor,
    // dos reglas de dónde cae el kilómetro — la nuestra y la de Apple.
    //
    // Lo que esta voz SÍ dice sigue siendo suyo porque Apple no lo tiene: el tramo que
    // empieza (`announceRunLeg`), la corrección de ritmo contra la banda del coach
    // (`paceUpdate`) y los 10 segundos que quedan de un tramo por tiempo
    // (`runLegTimeRemaining`).

    // MARK: - Queue drain

    private func enqueue(_ utterance: CoachUtterance) {
        guard AudioCoachSettings.isEnabled else { return }
        queue.enqueue(utterance)
        pumpIfIdle()
    }

    private func pumpIfIdle() {
        guard !isSpeaking, let utterance = queue.next() else { return }
        isSpeaking = true
        audioSession.setVoiceActive(true)
        speaker.speak(utterance.text)
    }

    private func drainOrRelease() {
        if let utterance = queue.next() {
            speaker.speak(utterance.text)
        } else {
            isSpeaking = false
            audioSession.setVoiceActive(false)
        }
    }
}

// MARK: - CueLeg from live session state (app-only projection)

extension CueLeg {
    /// Build the spoken descriptor for the session's CURRENT structured-run leg.
    /// Nil when the current segment isn't running a structured leg (the only path
    /// that emits verbal leg cues). Uses the SAME `WorkoutLegCount` the HUD shows so
    /// the spoken "Tramo N de M" matches the screen exactly.
    init?(session: WorkoutSession) {
        guard let leg = session.currentRunLeg else { return nil }
        let number = WorkoutLegCount.current(session.plan.segments,
                                             index: session.currentSegmentIndex,
                                             structureLegIndex: session.runLegIndex)
        self.init(number: number,
                  total: WorkoutLegCount.total(session.plan.segments),
                  isWork: leg.isWork,
                  phase: leg.phaseRole,
                  measure: leg.measure,
                  target: leg.target,
                  recoveryMode: leg.recoveryMode)
    }
}
