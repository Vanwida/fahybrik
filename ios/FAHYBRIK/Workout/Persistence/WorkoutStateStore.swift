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
}

actor WorkoutStateStore {
    static let shared = WorkoutStateStore()

    private let url: URL

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
}
