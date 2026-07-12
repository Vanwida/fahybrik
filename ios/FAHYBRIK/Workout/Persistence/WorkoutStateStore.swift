import Foundation

// JSON-on-disk persistence (Application Support / workout-state.json).
// Justification (per UX spec): a 5-second autosave is well within fsync budget
// for a single Codable file (~few KB). SQLite/Core Data add migrations and a
// schema layer the spec doesn't need yet — single-record snapshot is plenty
// for crash recovery, and the format is trivially evolvable via Codable.
struct PersistedWorkoutState: Codable {
    let plan: WorkoutPlan
    let startedAt: Date
    let currentSegmentIndex: Int
    let elapsedSeconds: Double
    let lapElapsedSeconds: Double
    let laps: [LapRecord]
    let repsByCurrentSegment: Int
    let isPaused: Bool
    let savedAt: Date
    /// AUDIT-1 — the backend assignment this snapshot belongs to. Crash recovery is
    /// offered ONLY for the SAME assignment, so a recovered session can never be
    /// cross-attributed to whatever workout happens to be open now. Optional (`var …
    /// = nil`): a snapshot written by an older build decodes nil → recovery discards
    /// it rather than guessing.
    var assignmentId: String? = nil
}

// AUDIT-1 — the honest crash-recovery gate. Pure so the "same assignment + fresh"
// rule is unit-tested, not eyeballed. A snapshot with no assignment (older build /
// ad-hoc), a DIFFERENT assignment, an empty plan, or one older than `maxAge` is never
// offered — we discard rather than resurrect the wrong session.
enum WorkoutRecoveryGate {
    /// The recovery window — the same 6 h the watch uses.
    static let maxAge: TimeInterval = 6 * 3600

    static func shouldOffer(
        saved: PersistedWorkoutState,
        currentAssignmentId: String?,
        now: Date = Date(),
        maxAge: TimeInterval = WorkoutRecoveryGate.maxAge
    ) -> Bool {
        guard let savedAssignment = saved.assignmentId, savedAssignment == currentAssignmentId else { return false }
        guard !saved.plan.id.uuidString.isEmpty else { return false }
        return saved.savedAt > now.addingTimeInterval(-maxAge)
    }
}

actor WorkoutStateStore {
    static let shared = WorkoutStateStore()

    private let url: URL
    /// AUDIT-3 — once a session finishes / is discarded the store is CLOSED: saves
    /// no-op until a new workout reopens it. This latch makes clearing win over a
    /// late autosave Task regardless of which reaches the actor first (either the
    /// save already ran and `close` removes it, or `close` ran and the save no-ops),
    /// so a torn-down session can never resurrect its snapshot.
    private var closed = false

    init(filename: String = "workout-state.json") {
        // Application Support is the canonical home; if the FS denies it
        // (sandbox edge cases, full disk), degrade to the temp dir so a
        // persistence hiccup can never crash an active workout.
        let dir: URL
        if let support = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) {
            dir = support
        } else {
            dir = FileManager.default.temporaryDirectory
        }
        self.url = dir.appendingPathComponent(filename)
    }

    func save(_ state: PersistedWorkoutState) {
        // AUDIT-3 — a save arriving after teardown (a late autosave Task) is dropped.
        guard !closed else { return }
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: url, options: [.atomic])
        } catch {
            // Persistence failure must not crash the workout.
        }
    }

    func load() -> PersistedWorkoutState? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(PersistedWorkoutState.self, from: data)
    }

    func clear() {
        try? FileManager.default.removeItem(at: url)
    }

    /// A new workout starts persisting — re-enable saves.
    func open() {
        closed = false
    }

    /// AUDIT-2/3 — the session finished or was discarded: clear the snapshot AND latch
    /// closed so no later autosave can re-create it. A finished session is therefore
    /// never re-offered as "recuperar entreno en curso".
    func close() {
        closed = true
        try? FileManager.default.removeItem(at: url)
    }
}
