import Foundation

// Payload returned by GET /api/athlete/assignments/{id}/detail.
//
// Snake_case JSON → camelCase Swift via APIClient's `convertFromSnakeCase`
// strategy, so model property names use camelCase even though TypeScript /
// Postgres mirrors snake_case (e.g. `params_json` → `paramsJson`).
//
// `workout` is optional: rest days return `null` and the UI must render a
// dedicated rest state instead of an empty workout shell.

struct AssignmentDetail: Codable, Equatable {
    let assignment: AssignmentInfo
    let workout: WorkoutDetail?
}

struct AssignmentInfo: Codable, Equatable {
    let id: String
    let athleteId: String
    let scheduledFor: String   // ISO date (YYYY-MM-DD)
    let status: String         // scheduled | completed | missed | skipped
    let slot: String?
    let templateId: String?
    let templateVersion: Int?
    let completedAt: String?
    let perceivedExertion: Int?
    // Dobles HYROX — `station_assignment` is NULL for the overwhelming majority
    // of (individual) assignments. When present it carries the per-station
    // split between the two partners (a / b / alternate).
    //
    // `myRole` ("a" | "b") is required to know which side of the split this
    // device's user is. Backend (W5) has not yet shipped it on this endpoint;
    // when nil, callers fall back to deducing the role from a lexicographic
    // comparison of (userId, partner.userId) — a temporary, deterministic
    // shim that holds until backend exposes the field explicitly.
    let stationAssignment: StationAssignment?
    let myRole: String?
}

struct StationAssignment: Codable, Equatable {
    let stations: [StationAssignmentEntry]
}

struct StationAssignmentEntry: Codable, Equatable, Identifiable {
    var id: String { name }
    let name: String
    /// "a" | "b" | "alternate"
    let assignedTo: String
}

struct WorkoutDetail: Codable, Equatable {
    let name: String
    let focus: String?
    let coachNote: String?
    let estimatedDurationMinutes: Int?
    let blocks: [WorkoutBlock]
}

struct WorkoutBlock: Codable, Equatable, Identifiable {
    var id: String { uid }
    let uid: String
    let title: String
    let format: String        // e.g. straight_sets, amrap, for_time, emom, intervals, free
    let blockPosition: Int
    let coachNote: String?
    // Schemaless per format; keys arrive snake_case (rounds, time_cap_seconds,
    // emom_interval_seconds, work_seconds, rest_seconds — see JSONValue note).
    let configJson: JSONValue?
    let items: [WorkoutItem]
}

struct WorkoutItem: Codable, Equatable, Identifiable {
    var id: String { uid }
    let uid: String
    let exerciseId: String
    let exerciseName: String
    let exerciseSlug: String
    let exerciseCategory: String   // strength | running | rowing | ski_erg | bike_erg | functional | mobility | other
    let exerciseVideoUrl: String?
    let cues: String?
    // Long-form exercise description. Backend does not ship this column on the
    // assignment-detail endpoint yet (only `cues`); decodes nil until it does,
    // and ExerciseDetailView degrades honestly when absent.
    let exerciseDescription: String?
    // Flat, iOS-ready scalar targets (the legacy path). Kept for back-compat and
    // for the live-execution engine.
    let paramsJson: WorkoutItemParams
    // Structured per-set prescription — the RICH form (pyramids, ranges, per-set
    // rest/RPE/tempo, ergo/run pace+zone). Decoded from `prescription_json`,
    // which `convertFromSnakeCase` rewrites to `prescriptionJson` (the CodingKey
    // below). Null/absent for legacy segments that only carry scalar params, so
    // renderers PREFER this when present and fall back to `paramsJson` otherwise.
    let prescription: Prescription?
    let notes: String?

    // Explicit keys are required because the wire field `prescription_json`
    // converts (via convertFromSnakeCase) to `prescriptionJson`, not
    // `prescription`. Every other key matches its converted camelCase form.
    enum CodingKeys: String, CodingKey {
        case uid
        case exerciseId
        case exerciseName
        case exerciseSlug
        case exerciseCategory
        case exerciseVideoUrl
        case cues
        case exerciseDescription
        case paramsJson
        case prescription = "prescriptionJson"
        case notes
    }
}

struct WorkoutItemParams: Codable, Equatable {
    let sets: Int?
    let reps: Int?
    let loadKg: Double?
    let loadPct: Double?           // %1RM
    let rpe: Double?
    let restSeconds: Int?
    let durationSeconds: Int?
    let distanceKm: Double?
    let distanceMeters: Int?
    let paceSecPerKm: Int?
    let cadenceSpm: Int?
    let calories: Int?
    let caloriesPerMin: Int?
    let hrZone: Int?
}

// MARK: - JSONValue (lightweight any-shape decoder for block configJson)
//
// Block `config_json` is intentionally schemaless on the backend: AMRAP has
// `time_cap_seconds`, "for time" has `rounds`, intervals have `work_seconds` /
// `rest_seconds` pairs, etc. We decode into a JSON tree and expose typed
// accessors so callers stay declarative.

indirect enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(
            in: c,
            debugDescription: "Unsupported JSON value"
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    // Typed accessors — convenient for reading well-known block config keys.
    // IMPORTANT: `convertFromSnakeCase` does NOT reach these dynamic dictionary
    // keys (it only rewrites keys backed by a CodingKey type). `config_json` is
    // decoded as a raw `[String: JSONValue]`, so its keys arrive verbatim from
    // the wire — i.e. snake_case. Look up snake_case keys here
    // (`time_cap_seconds`, `work_seconds`, …), matching `weekDayPartConfigSchema`.
    func int(_ key: String) -> Int? {
        guard case .object(let dict) = self else { return nil }
        if case .number(let n) = dict[key] { return Int(n) }
        return nil
    }

    func double(_ key: String) -> Double? {
        guard case .object(let dict) = self else { return nil }
        if case .number(let n) = dict[key] { return n }
        return nil
    }

    func string(_ key: String) -> String? {
        guard case .object(let dict) = self else { return nil }
        if case .string(let s) = dict[key] { return s }
        return nil
    }
}
