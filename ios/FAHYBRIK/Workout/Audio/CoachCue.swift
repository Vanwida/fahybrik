import Foundation

// MARK: - Coach voice cue models (#63)
//
// The PURE data the audio-coaching layer speaks. No AVFoundation, no session /
// treadmill types — so the cue engine and the priority queue are fully unit
// testable. The app-layer glue (`AudioCoach`) builds a `CueLeg` from the live
// `WorkoutSession` / treadmill state and drives a `CoachSpeaker` with the
// utterances these produce.

/// Relative importance of a spoken cue. A running athlete can't re-listen, so
/// when several cues pile up the most decision-relevant one speaks first:
/// a change of tramo (what am I doing NOW) outranks a pace nudge, which outranks
/// a km split (a passive stat). Raw value = sort key (lower speaks first).
enum CuePriority: Int, Equatable {
    case transition = 0   // tramo / recovery entry, end-of-leg countdown, workout finish
    case pace = 1         // out-of-band pace correction
    case split = 2        // per-km split time
}

/// One thing to say, at a given priority.
struct CoachUtterance: Equatable {
    let text: String
    let priority: CuePriority
}

/// A priority queue for pending voice cues. Two rules keep it from ever talking
/// over itself or reading stale information:
///   • HIGHER priority speaks first; equal priority stays FIFO (order preserved).
///   • enqueuing a `.transition` PURGES any pending pace/split cue — once the
///     athlete has moved to a new tramo, a pace nudge or km split computed for
///     the previous one is worthless and must not be read late.
/// The queue never interrupts the utterance already being spoken (that is the
/// speaker's job) — it only orders what is still waiting.
struct CueQueue: Equatable {
    private(set) var items: [CoachUtterance] = []

    var isEmpty: Bool { items.isEmpty }
    var count: Int { items.count }

    mutating func enqueue(_ utterance: CoachUtterance) {
        if utterance.priority == .transition {
            items.removeAll { $0.priority != .transition }
        }
        // Insert before the first item of strictly LOWER priority (higher rawValue),
        // so a new cue jumps ahead of everything less important but stays behind
        // equal-or-more-important ones already waiting (stable / FIFO within a rank).
        let index = items.firstIndex { $0.priority.rawValue > utterance.priority.rawValue } ?? items.count
        items.insert(utterance, at: index)
    }

    mutating func next() -> CoachUtterance? {
        items.isEmpty ? nil : items.removeFirst()
    }

    mutating func removeAll() {
        items.removeAll()
    }
}

// MARK: - CueLeg — a run leg described for SPEECH
//
// Reuses the pure structured-run grammar (`RunSegmentMeasure`, `RunSegmentTarget`,
// `RunRecoveryMode`, `RunPhaseRole` from RunStructure.swift) so the engine speaks
// EXACTLY what the coach prescribed with zero free text. The app layer projects a
// structured `RunLeg` (or a scalar continuous/series leg) into this shape.

struct CueLeg: Equatable {
    /// 1-based global "Tramo N de M" — the SAME number the HUD shows, so the voice
    /// and the screen never disagree.
    let number: Int
    let total: Int
    /// false → this is a recovery (spoken as "Recuperación…", never numbered).
    let isWork: Bool
    /// warmup / main / cooldown — only prefixes a WORK leg ("Calentamiento." …).
    let phase: RunPhaseRole
    /// How the bout is measured (distance m | duration s | unknown).
    let measure: RunSegmentMeasure
    /// The coach objective (pace band | pace/hr zone | RPE | unknown | none).
    let target: RunSegmentTarget?
    /// How a recovery is taken (trote | caminar | parado) — nil for a work leg.
    let recoveryMode: RunRecoveryMode?
}
