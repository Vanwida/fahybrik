import Foundation

// #34 — the athlete's calibration-test battery: the STATUS reader (GET
// /api/athlete/test-battery/status) and the RESULT bridge (POST
// /api/athlete/assignments/{id}/test-results). The coach defines WHICH tests
// exist and WHEN they're scheduled — so `total` (N) is data-driven, never a
// fixed 4. Mirrors web/lib/coach/battery-status.ts (BatteryStatus) and
// web/lib/coach/test-battery-bridge.ts (RecordBatteryResult) 1:1; snake_case
// wire keys map to these camelCase properties via APIClient's
// `.convertFromSnakeCase` decoder.

// MARK: - Status (X / N + per-test state)

struct BatteryStatus: Codable, Equatable {
    /// N — how many calibration tests the coach scheduled for this athlete.
    let total: Int
    /// How many have a CAPTURED result (the expected benchmark exists) — not
    /// merely "the session ran". So an executed test whose number was never
    /// entered reads as `resultPending`, never as done.
    let completed: Int
    let tests: [CalibrationTestStatus]
    let athleteWeightKg: Double?

    /// A coach HAS programmed tests for this athlete. When false the card shows
    /// the honest "Pablo prepara tu semana" state — never a broken "0/0".
    var isScheduled: Bool { total > 0 }

    /// Every scheduled test has its result in — the battery is closed.
    var isComplete: Bool { total > 0 && completed >= total }

    /// The first test still waiting on its number (executed but not captured) —
    /// the single most actionable nudge, surfaced in the card header.
    var firstPendingResult: CalibrationTestStatus? {
        tests.first { $0.resultPending }
    }

    /// An empty/not-scheduled battery — the safe default when the endpoint is
    /// unavailable or the athlete has no tests, so callers never show 0/0.
    static let empty = BatteryStatus(total: 0, completed: 0, tests: [], athleteWeightKg: nil)
}

struct CalibrationTestStatus: Codable, Equatable, Identifiable {
    var id: String { assignmentId }
    /// The coach test's slug (its identity, e.g. "control_5k").
    let calibrationSlug: String
    /// Athlete-facing name the coach gave the test ("Test de 5K").
    let label: String
    /// The plan assignment this scheduled occurrence maps to — the id the capture
    /// bridge and the session-open route use.
    let assignmentId: String
    /// ISO "YYYY-MM-DD" it's scheduled for.
    let scheduledFor: String
    /// The SESSION status: scheduled | completed | partial | missed | skipped.
    let sessionStatus: String
    /// All expected benchmarks present ⇒ the calibration landed (the green ✓).
    let resultCaptured: Bool
    /// The session ran but the number was never entered — the actionable nudge.
    let resultPending: Bool
    /// Pre-formatted captured value ("22:14", "140 kg"), when the backend ships
    /// it. Optional — absent → the card shows the ✓ state with no number (honest,
    /// the results live in Rendimiento). Never fabricated on the client.
    let resultLabel: String?
    /// "jump_video" → cámara. Ausente o "session" → el vivo de siempre.
    let capture: String?
    /// Qué preparar y en qué orden. Solo llega en un salto programado.
    let brief: JumpBriefDTO?
    let jumpProfile: JumpProfileDTO?
    /// Informe de ESA ocurrencia. Ausente en un test que no es salto, o en un
    /// backend que aún no lo sirve — entonces se usa `jumpProfile`.
    let jumpReport: CmjReportDTO?

    var isJumpVideo: Bool { capture == "jump_video" }

    /// The single visible state of a test row.
    enum DisplayState { case pending, resultPending, done }

    var displayState: DisplayState {
        if resultCaptured { return .done }
        if resultPending { return .resultPending }
        return .pending
    }
}

// MARK: - Bridge result (what recording the numbers produced)

/// Mirrors the bridge's `RecordBatteryResult`. Powers the HONEST post-capture
/// feedback: we only claim what actually happened — "Zonas actualizadas" when
/// `zonesDerived` is non-empty, "Nivel recalculado" ONLY when `levelRecomputed`.
struct RecordBatteryResult: Codable, Equatable {
    let ok: Bool
    let benchmarksWritten: Int
    let zonesDerived: [ZoneDerived]
    let strengthMaxesWritten: Int
    let levelRecomputed: Bool
    /// Tests guiados — per-entry delta vs the athlete's previous mark, computed
    /// SERVER-side (seconds: lower is better; kg/bpm: higher is better). Drives
    /// the «Récord del test» celebration. OPTIONAL so a backend that hasn't
    /// shipped it yet (or an older cached response) still decodes — the flow
    /// then simply skips the celebration, never breaks.
    let entries: [EntryDelta]?

    struct ZoneDerived: Codable, Equatable {
        let modality: String   // run | row | ski
        let thresholdS: Double
    }

    /// One recorded result vs its previous mark. `prevValue` nil = first mark
    /// (nothing to beat yet); `improved` nil mirrors that.
    struct EntryDelta: Codable, Equatable {
        let slug: String
        let value: Double
        let prevValue: Double?
        let improved: Bool?
    }

    /// The entries that BEAT the previous mark — the celebration trigger.
    var improvedEntries: [EntryDelta] {
        (entries ?? []).filter { $0.improved == true }
    }

    /// The non-zone confirmations (1RM / nivel), exactly as the bridge reported
    /// them. Zones are NOT a line here: the result screen renders them as their
    /// own rich card (new umbral + delta) — see TestResultDoneView.
    var secondaryEffects: [String] {
        var out: [String] = []
        if strengthMaxesWritten > 0 {
            out.append(strengthMaxesWritten == 1 ? "1RM actualizado" : "Fuerzas actualizadas")
        }
        if levelRecomputed { out.append("Nivel recalculado") }
        return out
    }

    static func modalityLabel(_ raw: String) -> String {
        switch raw {
        case "run":  return "carrera"
        case "row":  return "remo"
        case "ski":  return "ski"
        case "bike": return "bike"
        default:     return raw
        }
    }
}

// MARK: - One entered value (POST body element)

/// One entered value for a store_results slug (matches the TS
/// `testResultEntrySchema`): seconds for a time result, kg for a load result,
/// meters/reps/calories for a baseline. `.convertToSnakeCase` leaves both keys
/// unchanged, so the wire body is exactly `{ slug, value }`.
struct TestResultEntry: Codable, Equatable {
    let slug: String
    let value: Double
}

// MARK: - Start a test («Probarme»)

/// Response of POST /api/athlete/test-battery/start (201 creates / 200 reuses) —
/// the assignment the athlete runs TODAY plus its result contract. The wire
/// ships `assignment_id` as a NUMBER (verified E2E by the web side) while the
/// status endpoint ships strings, so the id is normalized to String here — the
/// one shape WorkoutLaunch and the rest of the app use.
struct StartTestResponse: Decodable, Equatable {
    let assignmentId: String
    let scheduledFor: String   // YYYY-MM-DD
    let storeResults: [StoreResultSpec]
    /// True when the server reused an already-scheduled assignment for today.
    let reused: Bool?

    private enum CodingKeys: String, CodingKey {
        case assignmentId, scheduledFor, storeResults, reused
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Number today; tolerate a string if the backend ever harmonizes.
        if let numeric = try? c.decode(Int.self, forKey: .assignmentId) {
            assignmentId = String(numeric)
        } else {
            assignmentId = try c.decode(String.self, forKey: .assignmentId)
        }
        scheduledFor = try c.decode(String.self, forKey: .scheduledFor)
        storeResults = try c.decode([StoreResultSpec].self, forKey: .storeResults)
        reused = try c.decodeIfPresent(Bool.self, forKey: .reused)
    }
}

// MARK: - Benchmark history (the athlete's curve per benchmark)

/// GET /api/athlete/benchmarks/history?slug=<BENCHMARK slug> (run_5k,
/// back_squat_1rm, …) — NOT the calibration-test slug (tt_5k): the store is
/// indexed by exercise_slug. Without ?slug it returns EVERY series the athlete
/// has. One test can produce several benchmark series (a 1RM battery → squat +
/// deadlift + …), so the payload is series-shaped even when there's just one.
struct BenchmarkHistoryResponse: Codable, Equatable {
    let series: [BenchmarkSeries]
}

struct BenchmarkSeries: Codable, Equatable, Identifiable {
    var id: String { exerciseSlug }
    let exerciseSlug: String
    let label: String
    /// seconds | kg | bpm | meters | reps | calories — drives formatting AND the
    /// better-direction (see BenchmarkDelta).
    let unit: String
    /// Chronological, oldest → newest (the curve reads left to right).
    let results: [BenchmarkPoint]

    var lastValue: Double? { results.last?.value }
    /// Newest vs previous mark, in the unit's own sign. Nil with fewer than two.
    var lastDelta: Double? {
        guard results.count >= 2 else { return nil }
        return results[results.count - 1].value - results[results.count - 2].value
    }
}

struct BenchmarkPoint: Codable, Equatable {
    let value: Double
    /// ISO timestamp; kept as a raw String and parsed defensively where shown
    /// (mirrors ZonesService.recordedAt — a malformed date must never take the
    /// whole history down).
    let recordedAt: String
}

// MARK: - Service

enum TestBatteryService {
    /// The athlete's calibration battery status (X/N + per-test state). Returns
    /// `.empty` shape from the server when nothing is scheduled — callers render
    /// the "preparando" state, never 0/0.
    static func fetchStatus(bearer: String) async throws -> BatteryStatus {
        try await APIClient.shared.get(
            path: "api/athlete/test-battery/status",
            bearer: bearer
        )
    }

    /// Record a finished calibration test's measured result(s) — the
    /// ejecución→benchmark bridge on the athlete side. The entered numbers become
    /// ground-truth benchmarks (source 'athlete_test'), derive zones/1RM, and
    /// re-run the level suggestion. Returns what actually changed.
    @discardableResult
    static func recordResults(
        assignmentId: String,
        entries: [TestResultEntry],
        bearer: String
    ) async throws -> RecordBatteryResult {
        struct Body: Encodable { let results: [TestResultEntry] }
        return try await APIClient.shared.post(
            path: "api/athlete/assignments/\(assignmentId)/test-results",
            body: Body(results: entries),
            bearer: bearer
        )
    }

    @discardableResult
    static func recordJumpResults(
        assignmentId: String,
        body: JumpResultsBody,
        bearer: String
    ) async throws -> RecordBatteryResult {
        try await APIClient.shared.post(
            path: "api/athlete/assignments/\(assignmentId)/test-results",
            body: body,
            bearer: bearer
        )
    }

    /// «Probarme» — create/reuse TODAY's assignment for a battery test and get
    /// back the id the normal session flow launches with.
    static func startTest(slug: String, bearer: String) async throws -> StartTestResponse {
        struct Body: Encodable { let slug: String }
        return try await APIClient.shared.post(
            path: "api/athlete/test-battery/start",
            body: Body(slug: slug),
            bearer: bearer
        )
    }

    /// The athlete's benchmark curve(s). `slug` = a BENCHMARK slug (the ones a
    /// test's `store_results[].slug` carries); nil = every series the athlete
    /// has — the hub fetches all once and groups them per test.
    static func fetchBenchmarkHistory(slug: String? = nil, bearer: String) async throws -> [BenchmarkSeries] {
        var path = "api/athlete/benchmarks/history"
        if let slug,
           let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path += "?slug=\(encoded)"
        }
        let resp: BenchmarkHistoryResponse = try await APIClient.shared.get(path: path, bearer: bearer)
        return resp.series
    }
}
