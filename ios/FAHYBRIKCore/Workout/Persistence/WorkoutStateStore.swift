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

    // MARK: - Honesty carriers of the IN-FLIGHT segment
    //
    // The closed `laps` are already honest — they carry their own prescribed /
    // actual / confirmed triplet. The segment still open when the app died carried
    // that state only in memory, so recovery used to resume it blank: the athlete's
    // 12 reps were replaced by the prescribed 10 on re-entry (`primeRepsIfNeeded`
    // re-primes when nothing says the segment was already primed) and the session
    // went on to report as done what nobody had confirmed.
    //
    // All optional with a default so a snapshot from an older build still decodes;
    // a missing carrier means "unknown", and `WorkoutSession.restore` then lets the
    // normal priming run — assumed, never confirmed.

    /// Whether the athlete had already ENTERED the segment the snapshot froze — i.e.
    /// whether it had been primed. This is the model's own "estrenar vs reanudar"
    /// distinction, the same sentinel a back-step uses, and it is what stops
    /// `primeRepsIfNeeded` from writing the prescription over what was recovered.
    /// Persisted rather than inferred: a segment reached but never entered must
    /// still prime on resume, or its lap would record a fabricated 0.
    var currentSegmentPrimed: Bool? = nil
    /// Whether the in-flight segment's reps were explicitly touched by the athlete.
    var repsConfirmed: Bool? = nil
    /// Whether the athlete explicitly SKIPPED the in-flight segment.
    var repsSkipped: Bool? = nil
    /// Per-set strength detail of the in-flight segment (a 5×5 half done).
    var setRecords: [SetRecord]? = nil
    /// The load the athlete DECLARED for the in-flight segment (never a primed
    /// prescription — that one is re-derived from the plan on re-entry).
    var declaredLoadKg: Double? = nil
    /// Athlete-entered covered distance for an in-flight run segment (metres).
    var manualRunDistanceMeters: Double? = nil
    /// The block-scoped Rx / Scaled choice and its note.
    var rxScaled: String? = nil
    var scaledNote: String? = nil

    // MARK: - Card 174 — live that survives a kill
    //
    // The 5 s autosave already wrote this file to Application Support (a real
    // store: jetsam does not wipe it). What it did NOT carry is the identity of
    // THIS outing, who owns the engine, and the surface the athlete chose — so a
    // cold start could not reopen the same outdoor HUD, and a missing assignment
    // (libre) was discarded as "unknown". Optional + default so an older
    // snapshot still decodes; the resume gate then fills identity from `plan.id`.

    /// Identity of THIS outing. Distinct from the assignment (a plan can be run
    /// more than once) and from the plan template. Nil on a pre-174 snapshot.
    var sessionId: UUID? = nil
    /// Who runs the ONE engine. The other device records or mirrors. Nil → phone
    /// (the store that wrote it lives on that device).
    var owner: LiveWorkoutOwner? = nil
    /// Calle / cinta. Without this the restored session has no outdoor HUD —
    /// `superficieViva` waits on a gate the athlete already answered.
    var runEnvironment: RunEnvironment? = nil
    /// Card 142 only. A voluntary "Salir y seguir luego" must NOT kidnap Hoy;
    /// a lock / jetsam / scene never sets this, so cold start reopens the live.
    var leftToResumeLater: Bool? = nil
    var autoPaused: Bool? = nil
    /// Already past the first block gate. Restore without this re-armed the
    /// preview and froze the clock on a run that was already going.
    var hasArmedInitial: Bool? = nil
    var awaitingBlockStart: Bool? = nil
    /// Structured-run cursor + clocks. Segment index alone is not the leg.
    var runLegIndex: Int? = nil
    var runCountInRemaining: Double? = nil
    var runLegRemaining: Double? = nil
    var runLegStartElapsed: Double? = nil
    var runStructureSegmentIndex: Int? = nil
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

// MARK: - Card 174 — who owns the live engine

/// One outing, one engine. Phone and Watch never both drive the same session.
enum LiveWorkoutOwner: String, Codable, Equatable {
    case phone
    case watch
}

// MARK: - Card 174 — cold start vs Hoy vacío

/// Pure resume gate. Hoy is empty ONLY when there is no open live snapshot
/// (and the Watch is not still running — that reattach is the mirror path).
/// A voluntary leave (142) is not a live outing: Plan's banner offers it.
enum LiveWorkoutResume {
    enum Decision: Equatable {
        case reopen(sessionId: UUID, assignmentId: String?, segmentIndex: Int, owner: LiveWorkoutOwner)
        case todayNormal
    }

    static func coldStart(_ saved: PersistedWorkoutState?, now: Date = Date()) -> Decision {
        guard let saved else { return .todayNormal }
        guard !saved.plan.id.uuidString.isEmpty else { return .todayNormal }
        guard saved.savedAt > now.addingTimeInterval(-WorkoutRecoveryGate.maxAge) else {
            return .todayNormal
        }
        if saved.leftToResumeLater == true { return .todayNormal }
        let sessionId = saved.sessionId ?? saved.plan.id
        return .reopen(
            sessionId: sessionId,
            assignmentId: saved.assignmentId,
            segmentIndex: saved.currentSegmentIndex,
            owner: saved.owner ?? .phone
        )
    }

    /// The container reopens THIS snapshot when the cover was raised for it
    /// (same assignment, or the session id of a libre) — or when Hoy presented
    /// the live cover with no assignment of its own.
    static func shouldRestoreInContainer(
        _ saved: PersistedWorkoutState,
        presentingAssignmentId: String?,
        now: Date = Date()
    ) -> Bool {
        let presenting = presentingAssignmentId.flatMap { $0.isEmpty ? nil : $0 }
        switch coldStart(saved, now: now) {
        case .reopen(let sessionId, let assignmentId, _, _):
            guard let presenting else { return true }
            return assignmentId == presenting || sessionId.uuidString == presenting
        case .todayNormal:
            return WorkoutRecoveryGate.shouldOffer(saved: saved, currentAssignmentId: presenting)
        }
    }
}
