import Foundation

struct AthleteWeekDaySession: Codable, Identifiable {
    var id: String { assignmentId }
    let assignmentId: String
    let slot: String
    let title: String
    let modality: String?
    let status: String
    /// "shared" | "self_only" — present for Dobles cohorts once backend ships
    /// the field on the week endpoint (see workout_assignments table). Nil for
    /// individual athletes or when backend doesn't expose the column yet.
    let partnerVisibility: String?
    /// Estimated session duration in minutes, DERIVED from the template's blocks
    /// (work + rest, scaled by sets/rounds). Nil when the template carries no
    /// time-estimable segments — callers keep their honest non-duration copy.
    let estDurationMinutes: Int?
    /// Number of blocks in the session (warmup / metcon / cooldown …). Nil when
    /// the template has no segments.
    let blocksCount: Int?
    /// One-line structure summary, e.g. "Calentamiento · Series · Vuelta a la
    /// calma". Nil when nothing is summarizable.
    let shortPrescription: String?
    /// True when this session is a TEST (its template stores measurable results
    /// that feed the athlete's profile). Drives the amber test badge. Defaults
    /// false when the backend omits it (old payloads).
    let isTest: Bool?
    /// Provenance of the session: "coach" (prescribed) | "self" (an entreno libre
    /// the athlete built and logged). Drives the "Libre" chip. Defaults to "coach"
    /// when the backend omits it (back-compat with older payloads).
    let origin: String?

    enum CodingKeys: String, CodingKey {
        case assignmentId, slot, title, modality, status, partnerVisibility
        case estDurationMinutes, blocksCount, shortPrescription, isTest, origin
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        assignmentId = try c.decode(String.self, forKey: .assignmentId)
        slot = try c.decode(String.self, forKey: .slot)
        title = try c.decode(String.self, forKey: .title)
        modality = try c.decodeIfPresent(String.self, forKey: .modality)
        status = try c.decode(String.self, forKey: .status)
        partnerVisibility = try c.decodeIfPresent(String.self, forKey: .partnerVisibility)
        estDurationMinutes = try c.decodeIfPresent(Int.self, forKey: .estDurationMinutes)
        blocksCount = try c.decodeIfPresent(Int.self, forKey: .blocksCount)
        shortPrescription = try c.decodeIfPresent(String.self, forKey: .shortPrescription)
        isTest = try c.decodeIfPresent(Bool.self, forKey: .isTest)
        origin = try c.decodeIfPresent(String.self, forKey: .origin)
    }

    /// Whether to render the test badge — true only when the backend says so.
    var isTestSession: Bool { isTest ?? false }

    /// True for an athlete-built "entreno libre". Honest default: a session with no
    /// `origin` is a coach-prescribed one, so the "Libre" chip never mislabels a
    /// prescribed session on an older payload.
    var isSelfOrigin: Bool { origin == "self" }
}

struct AthleteWeekDay: Codable, Identifiable {
    var id: String { isoDate }
    let dayOfWeek: Int
    let isoDate: String
    let sessions: [AthleteWeekDaySession]
    let isRest: Bool
}

struct AthleteWeekPayload: Codable {
    let weekStart: String
    let weekEnd: String
    let todayIso: String
    /// The COACH'S microciclo name this published week belongs to (e.g.
    /// "Acumulación", "Base aeróbica" — whatever the coach named it). Agnostic
    /// coach DATA resolved server-side from the assigned month template; no
    /// hardcoded periodization vocabulary. Nil when the week is outside any
    /// microcycle (free planning) — callers keep their generic subtitle.
    let microcicloName: String?
    /// Coach-authored "Foco de la semana" — a short athlete-facing line about what
    /// THIS week is about (no per-day detail). Nil when the coach set none / the
    /// week wasn't materialized from a month template (honest: no focus shown).
    let focus: String?
    /// True when a NEXT week with published content exists — drives the "Próxima
    /// semana" peek affordance. Nil/false → no next week to preview.
    let hasNextWeek: Bool?
    let days: [AthleteWeekDay]
}

struct AthleteMacroSummary: Codable {
    let block: String?
    let weekLabel: String?
    let aEventDays: Int?
}

// MARK: - Next race (race countdown)
//
// The athlete's upcoming target race, returned by /api/athlete/plan/week as
// `next_race` (null when none scheduled). Snake_case → camelCase mapping is
// handled by APIClient's `.convertFromSnakeCase` decoder, so we keep camelCase
// property names here. Enum fields (eventType/format/division/genderCategory)
// arrive as raw lowercase tokens; we map them to ES labels at render time via
// the helpers below rather than failing to decode an unknown value.
struct AthleteNextRace: Codable, Equatable {
    let name: String
    let eventType: String?
    let format: String?
    let division: String?
    let genderCategory: String?
    let ageGroup: String?
    let raceDate: String?       // ISO YYYY-MM-DD
    let location: String?
    let goalTimeSeconds: Int?
    let daysUntil: Int?
    /// 'target' | 'secondary' | 'tune_up'. The target race is the goal the plan
    /// peaks for; secondary/tune_up are intermediate races sooner on the way.
    let priority: String?

    /// Natural identity of a race — used to tell whether `next_race` is the same
    /// object as `target_race` (so we don't duplicate the countdown). Two races
    /// match when name and date coincide.
    var identity: String { "\(name)|\(raceDate ?? "")" }

    /// ES label for the secondary-race chip, derived from `priority`.
    var priorityLabel: String? {
        switch priority?.lowercased() {
        case "tune_up":   return "tune-up"
        case "secondary": return "secundaria"
        default:          return nil
        }
    }

    /// "Individual · Open · Hombres" — derived from format/division/gender,
    /// skipping any segment that's absent or unmapped. Nil when nothing maps.
    var categoryLine: String? {
        let parts = [
            AthleteNextRace.formatLabel(format),
            AthleteNextRace.divisionLabel(division),
            AthleteNextRace.genderLabel(genderCategory),
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Goal time as H:MM:SS (e.g. 1:12:30). Nil when no goal is set.
    var goalTimeFormatted: String? { AthleteNextRace.goalTimeFormatted(goalTimeSeconds) }

    /// H:MM:SS for a goal time in seconds (4350 → "1:12:30"); nil when absent or
    /// non-positive. Static so EVERY race surface — the home countdown, the
    /// Carreras objective card, the Perfil "Carrera objetivo" row — formats goal
    /// times through ONE implementation and they can never drift.
    static func goalTimeFormatted(_ seconds: Int?) -> String? {
        guard let total = seconds, total > 0 else { return nil }
        return String(format: "%d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
    }

    // MARK: enum → ES label maps (unknown tokens map to nil, never crash)
    static func formatLabel(_ raw: String?) -> String? {
        switch raw?.lowercased() {
        case "singles": return "Individual"
        case "doubles": return "Dobles"
        case "relay":   return "Relevos"
        default:        return nil
        }
    }

    static func divisionLabel(_ raw: String?) -> String? {
        switch raw?.lowercased() {
        case "open":  return "Open"
        case "pro":   return "Pro"
        case "elite": return "Elite"
        default:      return nil
        }
    }

    static func genderLabel(_ raw: String?) -> String? {
        switch raw?.lowercased() {
        case "men":   return "Hombres"
        case "women": return "Mujeres"
        case "mixed": return "Mixto"
        default:      return nil
        }
    }
}

struct AthleteMacroProgressWeek: Codable, Identifiable {
    var id: String { weekStart }
    let weekStart: String
    let status: String
    let compliancePct: Double?
}

struct AthleteMacroProgressPayload: Codable {
    let block: String?
    let totalAssignedWeeks: Int
    let weeks: [AthleteMacroProgressWeek]
}

struct AthleteMacroProgressResponse: Codable {
    let macro: AthleteMacroSummary
    let macroProgress: AthleteMacroProgressPayload?
}

struct AthletePlanWeekResponse: Codable {
    let week: AthleteWeekPayload
    let macroSummary: AthleteMacroSummary
    /// The GOAL race the plan peaks for — drives the primary countdown card.
    /// Null when the athlete has no target race scheduled (→ no card).
    let targetRace: AthleteNextRace?
    /// The chronologically next race, which may be an intermediate/tune-up
    /// sooner than the target (or the same object as `targetRace`). Surfaced as
    /// a small secondary chip only when it differs from the target.
    let nextRace: AthleteNextRace?
    /// The athlete's coach display name (athletes.coach_id -> coaches.full_name).
    /// Surfaced on the "Tu semana" subtitle. Nil when the athlete has no coach —
    /// callers fall back to generic copy.
    let coachName: String?

    enum CodingKeys: String, CodingKey {
        case week
        case macroSummary
        case targetRace
        case nextRace
        case coachName
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        week = try c.decode(AthleteWeekPayload.self, forKey: .week)
        macroSummary = try c.decode(AthleteMacroSummary.self, forKey: .macroSummary)
        targetRace = try c.decodeIfPresent(AthleteNextRace.self, forKey: .targetRace)
        nextRace = try c.decodeIfPresent(AthleteNextRace.self, forKey: .nextRace)
        coachName = try c.decodeIfPresent(String.self, forKey: .coachName)
    }
}

// MARK: - Move a session to another day (within the week)
//
// The athlete reschedules ONE of their own sessions to another day of the SAME
// week. The endpoint changes `scheduled_for` only — never the planned order
// (`planned_sequence` is frozen server-side). See
// app/api/athlete/plan/session/move/route.ts for the full contract.
struct MoveSessionResult: Decodable {
    struct MovedSession: Decodable {
        let id: String
        let scheduledFor: String    // YYYY-MM-DD (server-reconciled day)
        let plannedSequence: Int?   // frozen order — unchanged by a move
        let status: String
    }
    let session: MovedSession
}

// Decoded shape of an API error body ({ error: { code, message } }, mirrors
// web/lib/api/responses.ts). Lets callers turn a 409/422 into precise,
// athlete-facing copy (completed vs out-of-week) instead of a generic failure.
struct APIErrorBody: Decodable {
    struct Detail: Decodable { let code: String; let message: String }
    let error: Detail
}

enum PlanService {
    /// Fetch a week of the plan. `weekOffset` is bounded to the weekly-delivery
    /// model: 0 = this week (default), 1 = the NEXT-week peek (the one that
    /// unlocks Saturday). The backend clamps anything beyond [0, 1].
    static func fetchWeek(bearer: String, weekOffset: Int = 0) async throws -> AthletePlanWeekResponse {
        let path = weekOffset > 0
            ? "api/athlete/plan/week?week_offset=\(weekOffset)"
            : "api/athlete/plan/week"
        return try await APIClient.shared.get(path: path, bearer: bearer)
    }

    static func fetchMacroProgress(bearer: String) async throws -> AthleteMacroProgressResponse {
        try await APIClient.shared.get(path: "api/athlete/macro-progress", bearer: bearer)
    }

    /// Fetch the full detail of an assignment (workout blocks + items + params)
    /// for a given assignment id. The endpoint returns `workout: null` on rest
    /// days; callers must handle that branch.
    static func fetchAssignmentDetail(_ assignmentId: String, bearer: String) async throws -> AssignmentDetail {
        try await APIClient.shared.get(
            path: "api/athlete/assignments/\(assignmentId)/detail",
            bearer: bearer
        )
    }

    /// Move ONE session to another day WITHIN the same week. The week payload
    /// ships `assignment_id` as a stringified bigint; the move endpoint wants a
    /// numeric id, so callers pass the parsed Int. Throws `APIError.http(409)`
    /// for a completed (frozen) session and `APIError.http(422)` for an
    /// out-of-week target — the caller maps these to athlete-facing copy.
    static func moveSession(
        assignmentId: Int,
        toDate: String,
        bearer: String
    ) async throws -> MoveSessionResult {
        struct Body: Encodable {
            let assignmentId: Int   // → assignment_id (snake_case encoder)
            let toDate: String      // → to_date
        }
        return try await APIClient.shared.post(
            path: "api/athlete/plan/session/move",
            body: Body(assignmentId: assignmentId, toDate: toDate),
            bearer: bearer
        )
    }

    // MARK: - Correct a session's state from the plan row (concept §H)

    /// "Marcar como hecha" — assert the FACT that a session was done, WITHOUT
    /// fabricating any metric. Honest by construction: this reuses the exact same
    /// execution recorder as the live finish, but sends NO numbers (no reps, time,
    /// score or RPE) and `source='manual'`. The recorder writes an all-null
    /// execution and flips the assignment to 'completed'. Zero new save path.
    static func markSessionDone(assignmentId: String, bearer: String) async throws {
        struct Body: Encodable {
            let assignmentId: String   // → assignment_id (accepts string|number)
            let source: String         // → 'manual' (biometric_source)
        }
        let _: Empty = try await APIClient.shared.post(
            path: "api/sync/workout-execution",
            body: Body(assignmentId: assignmentId, source: "manual"),
            bearer: bearer
        )
    }

    /// Outcome of a "Deshacer hecho" attempt. The destructive gate is decided by
    /// the SERVER (only it knows what the execution holds): a clean mark resets
    /// immediately; an execution with real recorded work comes back as
    /// `.needsConfirmation`, and the caller re-issues with `confirm: true`.
    enum ResetOutcome { case reset, needsConfirmation }

    /// "Deshacer hecho" — reset a completed/partial session back to pendiente and
    /// void its manual execution. `confirm: false` first; if the server reports
    /// real recorded work (409 `needs_confirmation`) the caller asks the athlete
    /// and retries with `confirm: true`.
    static func resetSession(assignmentId: Int, confirm: Bool, bearer: String) async throws -> ResetOutcome {
        struct Body: Encodable {
            let assignmentId: Int   // → assignment_id
            let confirm: Bool
        }
        struct Result: Decodable { let reset: Bool; let status: String; let deletedExecution: Bool }
        do {
            let _: Result = try await APIClient.shared.post(
                path: "api/athlete/plan/session/reset",
                body: Body(assignmentId: assignmentId, confirm: confirm),
                bearer: bearer
            )
            return .reset
        } catch let APIError.http(status, data) where status == 409 {
            let code = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error.code
            if code == "needs_confirmation" { return .needsConfirmation }
            throw APIError.http(status, data)   // a different 409 (not undoable) — surface it
        }
    }
}

// MARK: - Local cache for assignment detail (offline-first)
//
// Tiny per-assignment cache on UserDefaults so re-opening a session you've
// already viewed renders instantly and survives flaky connectivity. Keyed by
// assignmentId, stored as the raw JSON (re-encoded via JSONEncoder) — this
// keeps the cache stable across model migrations as long as field names hold.
enum AssignmentDetailCache {
    private static let prefix = "fahybrik.assignmentDetail."

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    static func load(_ assignmentId: String) -> AssignmentDetail? {
        guard let data = UserDefaults.standard.data(forKey: prefix + assignmentId) else { return nil }
        return try? decoder.decode(AssignmentDetail.self, from: data)
    }

    static func save(_ detail: AssignmentDetail) {
        guard let data = try? encoder.encode(detail) else { return }
        UserDefaults.standard.set(data, forKey: prefix + detail.assignment.id)
    }
}

// MARK: - Locally-completed assignments (optimistic completion)
//
// The backend flips workout_assignments.status → 'completed' when the
// post-workout execution syncs, but that round-trip is async (and may be
// queued offline). To reflect completion immediately on Today/Plan — even
// before the next /api/athlete/plan/week refetch returns the updated status —
// we record finished assignment ids locally and union them with the server
// status when deciding what counts as "done". Mirrors the CheckinStore
// UserDefaults pattern.
enum CompletedAssignmentsStore {
    private static let key = "fahybrik.completedAssignmentIds.v1"
    /// Sibling set for sessions the athlete just TERMINATED early (honest partial).
    /// Kept apart from the completed set so the plan paints amber ½, not a green ✓,
    /// in the window before the server status refetch lands — never a fake "done".
    private static let partialKey = "fahybrik.partialAssignmentIds.v1"

    static func ids() -> Set<String> {
        let arr = UserDefaults.standard.array(forKey: key) as? [String] ?? []
        return Set(arr)
    }

    private static func partialStored() -> Set<String> {
        let arr = UserDefaults.standard.array(forKey: partialKey) as? [String] ?? []
        return Set(arr)
    }

    static func isCompleted(_ assignmentId: String) -> Bool {
        ids().contains(assignmentId)
    }

    static func isPartial(_ assignmentId: String) -> Bool {
        partialStored().contains(assignmentId)
    }

    static func markCompleted(_ assignmentId: String) {
        guard !assignmentId.isEmpty else { return }
        var current = ids()
        current.insert(assignmentId)
        UserDefaults.standard.set(Array(current), forKey: key)
        // A session can't be both done AND partial — completing supersedes a prior
        // optimistic partial (e.g. "Completar ahora" on a parcial → hecha).
        var partials = partialStored()
        if partials.remove(assignmentId) != nil {
            UserDefaults.standard.set(Array(partials), forKey: partialKey)
        }
    }

    /// Optimistic partial — the local half of "Terminar y guardar". The server
    /// refetch confirms 'partial'; this just bridges the gap so the row reads amber
    /// ½ immediately instead of flashing pending. Mutually exclusive with completed.
    static func markPartial(_ assignmentId: String) {
        guard !assignmentId.isEmpty else { return }
        var partials = partialStored()
        partials.insert(assignmentId)
        UserDefaults.standard.set(Array(partials), forKey: partialKey)
        var current = ids()
        if current.remove(assignmentId) != nil {
            UserDefaults.standard.set(Array(current), forKey: key)
        }
    }

    /// Drop BOTH optimistic flags for an assignment — the local half of "Deshacer
    /// hecho". After a reset the authoritative server status is re-fetched (it comes
    /// back 'scheduled'); clearing the local flags keeps the union from re-asserting
    /// 'done'/'partial' from a stale optimistic mark.
    static func unmark(_ assignmentId: String) {
        guard !assignmentId.isEmpty else { return }
        var current = ids()
        current.remove(assignmentId)
        UserDefaults.standard.set(Array(current), forKey: key)
        var partials = partialStored()
        partials.remove(assignmentId)
        UserDefaults.standard.set(Array(partials), forKey: partialKey)
    }
}

// MARK: - Session state (the four marks the plan paints)
//
// One session is in exactly ONE of four visible states. The plan paints a
// distinct, unambiguous mark for each (concept §G) — never the binary done/not-
// done it used to. The state is read from the REAL data: the server
// `assignment_status` string, with the local optimistic-completed store unioned
// in so a just-marked session reads 'done' before the next /week refetch lands.
enum SessionMarkState {
    case pending   // scheduled (or not-yet-started) — empty mark
    case partial   // terminated before the end (status 'partial') — amber ½
    case done      // completed — green ✓
    case missed    // was due and not done (status 'missed'/'skipped') — red ✕

    /// Map the server status + the local optimistic-completed flag to a mark.
    /// Optimistic completion wins (covers "Marcar como hecha" / "Completar ahora"
    /// before the refetch); otherwise the server `assignment_status` decides.
    static func of(status: String, assignmentId: String) -> SessionMarkState {
        if CompletedAssignmentsStore.isCompleted(assignmentId) { return .done }
        if CompletedAssignmentsStore.isPartial(assignmentId) { return .partial }
        switch status.lowercased() {
        case "completed":          return .done
        case "partial":            return .partial
        case "missed", "skipped":  return .missed
        default:                   return .pending // scheduled / in_progress / unknown
        }
    }
}

// Lightweight projection for the Today "next workout" card. We avoid creating
// a new backend endpoint and instead derive the next session client-side from
// the existing weekly plan payload. Snake_case-style field names in JSON are
// already handled by APIClient's decoder; here we just keep a tiny model.
struct NextWorkout: Equatable {
    let assignmentId: String
    let title: String
    let slot: String
    let isoDate: String       // YYYY-MM-DD
    let status: String
    let isToday: Bool
}

extension PlanService {
    /// Pick the next workout to surface on Today.
    /// Priority: first non-completed session on `todayIso`. Fallback: the
    /// earliest future, non-completed session in the week.
    static func nextWorkout(from resp: AthletePlanWeekResponse) -> NextWorkout? {
        let todayIso = resp.week.todayIso
        // A session is "done" when the server marks it completed OR we recorded
        // it locally (optimistic completion before the status refetch lands).
        let active: (AthleteWeekDaySession) -> Bool = {
            $0.status.lowercased() != "completed"
                && !CompletedAssignmentsStore.isCompleted($0.assignmentId)
        }

        // 1. Today, first active session.
        if let today = resp.week.days.first(where: { $0.isoDate == todayIso }),
           let s = today.sessions.first(where: active) {
            return NextWorkout(
                assignmentId: s.assignmentId,
                title: s.title,
                slot: s.slot,
                isoDate: today.isoDate,
                status: s.status,
                isToday: true
            )
        }

        // 2. Earliest future day (strictly after todayIso) with an active session.
        let future = resp.week.days
            .filter { $0.isoDate > todayIso }
            .sorted { $0.isoDate < $1.isoDate }
        for d in future {
            if let s = d.sessions.first(where: active) {
                return NextWorkout(
                    assignmentId: s.assignmentId,
                    title: s.title,
                    slot: s.slot,
                    isoDate: d.isoDate,
                    status: s.status,
                    isToday: false
                )
            }
        }
        return nil
    }
}

extension PlanWeek {
    static func from(api: AthletePlanWeekResponse) -> PlanWeek {
        let todayIdx = api.week.days.firstIndex { $0.isoDate == api.week.todayIso } ?? 0
        let days: [PlanDay] = api.week.days.map { d in
            let primary = d.sessions.first
            let title = primary?.title ?? (d.isRest ? "Descanso" : "Sin sesión")
            let subtitle = d.sessions
                .map { "\($0.slot.uppercased()) · \($0.title)" }
                .joined(separator: " · ")
            return PlanDay(
                assignmentId: primary?.assignmentId,
                dayName: dayNameES(d.dayOfWeek),
                dayNumber: dayNumberFromIso(d.isoDate),
                title: title,
                subtitle: subtitle.isEmpty ? "—" : subtitle,
                isRest: d.isRest || d.sessions.isEmpty,
                status: primary?.status,
                partnerVisibility: primary?.partnerVisibility
            )
        }
        // weekLabel is the coach-authored freeform week label; `block` is the
        // coach's current microciclo NAME (agnostic coach data — see
        // shared/domain/coach/macro-progress.ts, never an ATR sigla). Shown as-is.
        let label = api.macroSummary.weekLabel
            ?? api.macroSummary.block
            ?? "Semana actual"
        return PlanWeek(label: label, todayIndex: todayIdx, days: days)
    }

    private static func dayNameES(_ dow: Int) -> String {
        switch dow {
        case 1: return "LUN"
        case 2: return "MAR"
        case 3: return "MIE"
        case 4: return "JUE"
        case 5: return "VIE"
        case 6: return "SAB"
        default: return "DOM"
        }
    }

    private static func dayNumberFromIso(_ iso: String) -> Int {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let d = Int(parts[2]) else { return 0 }
        return d
    }
}
