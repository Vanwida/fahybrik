import Foundation

// Wire contract for MIRROR MODE — the 90% session: the athlete drives the workout
// from the iPhone (full UI: sets, loads, captura) while the watch RECORDS it
// (HKWorkoutSession → live HR, kcal, one HKWorkout) and shows a glanceable HUD in
// step. One engine only — the phone's; the wrist renders frames, it never runs a
// second engine that could drift.
//
// Transport: the HealthKit mirrored-session app-data channel
// (sendToRemoteWorkoutSession / didReceiveDataFromRemoteWorkoutSession), NOT
// WatchConnectivity — the system launches the watch app, keeps the session alive
// and carries these bytes both ways while the workout runs.
//
// Every message travels as a MirrorEnvelope so one decode dispatches by type.
// Coders are PLAIN JSON (same rationale as WatchWire: snake_case conversion is
// not a clean inverse for digit-boundary keys — do not change without a
// roundtrip re-verification).
//
// This file compiles into BOTH targets (see ios/project.yml) — it is the single
// source of truth for the protocol. Version the envelope type strings (v1 has
// none) rather than mutating field semantics.

enum MirrorWire {
    static let encoder = JSONEncoder()
    static let decoder = JSONDecoder()

    /// Envelope type strings — the protocol's full vocabulary.
    enum MessageType {
        /// Phone → watch: one frame of live engine state (see MirrorStateFrame).
        static let frame = "frame"
        /// Phone → watch: the session is over — finish (save) or discard.
        static let end = "end"
        /// Watch → phone: a live heart-rate sample from the wrist sensor.
        static let hr = "hr"
        /// Watch → phone: a control tap relayed to the phone's engine.
        static let command = "command"
        /// Watch → phone: recording closed; carries the HKWorkout UUID (nil on
        /// discard) so the phone stamps source_workout_ref on the execution.
        static let ended = "ended"
    }

    /// Wrist control vocabulary (MirrorCommand.kind).
    enum CommandKind {
        /// The big button: Empezar on a block gate, otherwise one primary advance.
        static let advance = "advance"
        static let pause = "pause"
        static let resume = "resume"
    }

    /// Frame phases (MirrorStateFrame.phase). ADDITIVE: a new phase is a new VALUE in
    /// the existing `phase` string, never a new field — an older decoder that doesn't
    /// know it just renders its default (active) branch, so no wire re-version needed.
    enum Phase {
        static let gate = "gate"          // parked on a block preview (Empezar)
        static let countIn = "countIn"    // structured-run 3-2-1 pre-roll (Prepárate)
        static let active = "active"
        static let paused = "paused"
        static let finished = "finished"
    }
}

/// One decode point for every mirror message; `type` is a MirrorWire.MessageType
/// and `body` the encoded payload struct for that type (empty Data when the type
/// carries nothing).
struct MirrorEnvelope: Codable {
    let type: String
    let body: Data
}

/// Phone → watch: a compact snapshot of what the engine is doing, built from the
/// SAME accessors the live HUDs read. All content fields are optional — the wrist
/// renders what's present and never fabricates. The watch ticks elapsed locally
/// between frames while `phase == active`; a frame re-bases it.
struct MirrorStateFrame: Codable, Equatable {
    /// MirrorWire.Phase — drives the wrist layout AND the HK session pause state
    /// (paused frames pause the recording, active frames resume it).
    let phase: String
    /// Block header, e.g. "CALENTAMIENTO", "BLOQUE 2 · EMOM 12'".
    let blockTitle: String?
    /// Current work line, e.g. "Run 800m", "Back squat".
    let lineTitle: String?
    /// Human target line, e.g. "Z2 · 4:45 /km", "4×8 @ 60 kg".
    let detailLine: String?
    /// Progress within the format, e.g. "RONDA 3/5", "SERIE 2/4".
    let progressText: String?
    /// Whole-session clock, seconds.
    let sessionElapsed: Double
    /// Current lap/segment clock, seconds.
    let lapElapsed: Double
    /// Format countdown when the phone shows one (AMRAP/steady remaining, a structured
    /// TIME tramo's remaining, or the 3-2-1 pre-roll while phase == countIn), seconds.
    let countdownRemaining: Double?
    /// Target HR zone 1...5 → wrist zone bar + out-of-zone haptic (local HR).
    let targetZone: Int?
    /// Rest overlay countdown, seconds. Present ⇒ the wrist shows the rest banner.
    let restRemaining: Double?
    /// #56 — the current HYROX dobles station's TURN (whose station + the rep reparto),
    /// or nil for individual work. Present ⇒ the wrist shows the turn hero and fires the
    /// double "entras tú" haptic when it flips from the partner's relay back to the
    /// athlete. OPTIONAL and ADDITIVE: an older watch simply ignores it (the existing
    /// lineTitle/detailLine still carry the relay for it); an older phone omits it → nil.
    /// `var` with a default so the existing `MirrorStateFrame(...)` construction (which
    /// doesn't pass it) and older encoded frames keep decoding.
    var dobles: MirrorDoblesTurn? = nil
}

/// Phone → watch: the current dobles station's turn, resolved for the reading athlete
/// (a wire projection of `DoblesTurn`). `role` is "mine" | "partner" | "split";
/// `selfReps`/`partnerReps` are nil for a time/distance station (never fabricated).
struct MirrorDoblesTurn: Codable, Equatable {
    let role: String
    let station: String
    let selfReps: Int?
    let partnerReps: Int?
    let partnerName: String?
    /// 0…100 self-share for the wrist's split legend.
    let selfSharePct: Int
}

/// Phone → watch: close the recording. `save` false = the athlete exited without
/// recording (phone discarded the run) → discard the builder, no HKWorkout.
struct MirrorEnd: Codable {
    let save: Bool
}

/// Watch → phone: live HR off the wrist sensor. The phone injects it into the
/// engine (and stops its own sparse HealthKit HR reader while the wrist streams).
struct MirrorHRSample: Codable {
    let bpm: Int
}

/// Watch → phone: a wrist control tap (MirrorWire.CommandKind). The phone's
/// engine is the only mutator — the wrist never advances state locally.
struct MirrorCommand: Codable {
    let kind: String
}

/// Watch → phone: the recording is closed. `workoutUuid` is the finished
/// HKWorkout's UUID (nil when discarded or the save failed) — the phone carries
/// it as the execution's source_workout_ref so the later HealthKit ingest of the
/// same workout never double-counts.
struct MirrorEnded: Codable {
    let workoutUuid: String?
}

// MARK: - Envelope helpers

extension MirrorEnvelope {
    /// Encode `payload` under `type`. Returns nil only on an encoding failure —
    /// callers treat that as "nothing to send", never a crash.
    static func encoding<P: Encodable>(type: String, _ payload: P) -> Data? {
        guard let body = try? MirrorWire.encoder.encode(payload),
              let data = try? MirrorWire.encoder.encode(MirrorEnvelope(type: type, body: body))
        else { return nil }
        return data
    }

    /// Decode an incoming envelope; nil for foreign/undecodable bytes (tolerant —
    /// a newer peer may speak types this build doesn't know).
    static func decoding(_ data: Data) -> MirrorEnvelope? {
        try? MirrorWire.decoder.decode(MirrorEnvelope.self, from: data)
    }

    /// Decode this envelope's body as `P`; nil when the body doesn't match.
    func body<P: Decodable>(as type: P.Type) -> P? {
        try? MirrorWire.decoder.decode(P.self, from: body)
    }
}
