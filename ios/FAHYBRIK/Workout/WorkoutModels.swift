import Foundation

// Format set per UX spec 03-workout-execution.md "Format-specific timer behavior".
enum WorkoutFormat: String, Codable, CaseIterable {
    case forTime = "for_time"
    case amrap = "amrap"
    case circuit = "circuit"
    case hyroxSim = "hyrox_sim"
    case emom = "emom"
    case intervals = "intervals"
    case strength = "strength"

    var displayName: String {
        switch self {
        case .forTime: return "For Time"
        case .amrap: return "AMRAP"
        case .circuit: return "Circuit"
        case .hyroxSim: return "HYROX Sim"
        case .emom: return "EMOM"
        case .intervals: return "Intervals"
        case .strength: return "Strength"
        }
    }
}

// Pedagogical ROLE of a coach block, inferred from its title. A session is an
// ordered list of blocks; the warmup runs FIRST and the cooldown LAST, so the
// session's defining format (score type, live timer) must come from the
// PRINCIPAL block — the main work — not whichever block happens to be first.
//
// Classification mirrors `classifyBlock` in
// web/app/api/athlete/plan/week/route.ts (single concept, two languages): keep
// the two in sync. Untitled blocks are `main` (no skew signal).
enum BlockPhase: String, Codable {
    case warmup
    case principal
    case cooldown
    case main

    static func classify(title: String?) -> BlockPhase {
        let t = (title ?? "")
            .folding(options: .diacriticInsensitive, locale: .current)
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return .main }
        if t.contains("principal") { return .principal }
        if t.contains("calent") || t.contains("warm") || t.contains("activaci") { return .warmup }
        if t.contains("calma") || t.contains("cooldown") || t.contains("cool down")
            || t.contains("cool-down") || t.contains("enfriamiento") {
            return .cooldown
        }
        return .main
    }

    /// Athlete-facing phase name shown in the active workout for context
    /// ("Calentamiento" / "Principal" / "Vuelta a la calma"). `main` work and the
    /// explicit `principal` block both read as the session's "Principal" phase.
    var displayName: String {
        switch self {
        case .warmup:               return "Calentamiento"
        case .cooldown:             return "Vuelta a la calma"
        case .principal, .main:     return "Principal"
        }
    }

    /// True for the session's main work (principal or untitled main blocks) — used
    /// to keep the principal section the visual focus and de-emphasise warmup/cooldown.
    var isMainWork: Bool { self == .principal || self == .main }
}

// Per-segment kind drives which 2x2 data grid is shown during execution.
enum SegmentKind: String, Codable {
    case running
    case rowOrSki = "row_or_ski"
    case sled
    case reps
    case strength

    /// Wire `modality` value for the per-segment execution record. MUST be one
    /// of the backend's canonical modalities (run | row | ski | bike | strength
    /// | other — see normalizeModality in ingest-execution-segments.ts); any
    /// other string is silently bucketed as "other" and breaks the run-vs-row
    /// analytics. The live grid collapses row/ski/bike into a single PM5-fed
    /// `rowOrSki` kind, so we emit "row" (the dominant HYROX erg); ski/bike
    /// distinction is a known follow-up that needs the erg subtype threaded onto
    /// the segment. `sled`/`reps` are HYROX-station work with no dedicated
    /// bucket → "other".
    var modality: String {
        switch self {
        case .running:  return "run"
        case .rowOrSki: return "row"
        case .strength: return "strength"
        case .sled, .reps: return "other"
        }
    }

    /// True when this segment is driven by the Concept2 PM5 erg (row/ski/bike).
    var isErg: Bool { self == .rowOrSki }
}

struct ZoneTarget: Codable {
    let zone: HRZone
    let percent: Int    // 0..100, sums approx to 100 across segments
}

// Either a target distance, target reps, or target duration drives completion.
struct WorkoutSegment: Codable, Identifiable {
    let id: UUID
    let order: Int
    let title: String
    let kind: SegmentKind
    /// Backend template_segments.id this segment was prescribed from. Carried so
    /// the execution upload can attribute measured work to the prescribed item
    /// (coach prescrito-vs-hecho). Nil for the freeform fallback segment.
    let templateSegmentId: Int?
    let targetReps: Int?
    let targetDistanceMeters: Double?
    let targetDurationSeconds: Int?
    let targetPaceSecondsPerKm: Int?
    let targetPowerWatts: Int?
    let targetZone: HRZone?
    let loadKg: Double?
    /// Prescribed effort (RPE). The ONLY intensity cue for target-less work
    /// (a warmup "8 min RPE 3"); without it the live HUD has nothing to show but
    /// dashes. Optional so cached snapshots from older builds still decode.
    let targetRpe: Double?
    /// Coach-authored title of the block this segment belongs to (e.g.
    /// "Calentamiento", "Principal", "Metcon"). Drives post-workout grouping and
    /// the active-workout phase label. Optional for the freeform fallback segment
    /// and older cached snapshots.
    let blockTitle: String?
    /// Position of the owning block within the session — the stable key that
    /// groups consecutive segments back into their block. Optional as above.
    let blockPosition: Int?
    /// YouTube watch URL — embedded in-app during brief / active workout.
    let videoUrl: String?

    init(
        id: UUID = UUID(),
        order: Int,
        title: String,
        kind: SegmentKind,
        templateSegmentId: Int? = nil,
        targetReps: Int? = nil,
        targetDistanceMeters: Double? = nil,
        targetDurationSeconds: Int? = nil,
        targetPaceSecondsPerKm: Int? = nil,
        targetPowerWatts: Int? = nil,
        targetZone: HRZone? = nil,
        loadKg: Double? = nil,
        targetRpe: Double? = nil,
        blockTitle: String? = nil,
        blockPosition: Int? = nil,
        videoUrl: String? = nil
    ) {
        self.id = id
        self.order = order
        self.title = title
        self.kind = kind
        self.templateSegmentId = templateSegmentId
        self.targetReps = targetReps
        self.targetDistanceMeters = targetDistanceMeters
        self.targetDurationSeconds = targetDurationSeconds
        self.targetPaceSecondsPerKm = targetPaceSecondsPerKm
        self.targetPowerWatts = targetPowerWatts
        self.targetZone = targetZone
        self.loadKg = loadKg
        self.targetRpe = targetRpe
        self.blockTitle = blockTitle
        self.blockPosition = blockPosition
        self.videoUrl = videoUrl
    }
}

extension WorkoutSegment {
    /// Pedagogical phase of this segment's block (warmup / principal / cooldown).
    var blockPhase: BlockPhase { BlockPhase.classify(title: blockTitle) }

    /// True when the segment carries at least one MEASURABLE intensity target
    /// (pace, distance, zone, power, reps or load). False for effort-only work
    /// (a warmup run with just RPE/duration) — the live HUD then shows guidance
    /// instead of a row of dashes.
    var hasMeasurableTarget: Bool {
        targetPaceSecondsPerKm != nil
            || targetDistanceMeters != nil
            || targetZone != nil
            || targetPowerWatts != nil
            || (targetReps ?? 0) > 0
            || (loadKg ?? 0) > 0
    }

    /// Effort cue ("RPE 3"), or nil when no RPE was prescribed.
    var effortGuidance: String? {
        guard let r = targetRpe, r > 0 else { return nil }
        let s = r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
        return "RPE \(s)"
    }

    /// Prescribed duration as mm:ss ("08:00"), or nil when none was prescribed.
    var durationGuidance: String? {
        guard let d = targetDurationSeconds, d > 0 else { return nil }
        return WorkoutSession.formatElapsed(Double(d))
    }
}

// A session's segments regrouped into their coach blocks, in session order, so
// the post-workout summary reads as Calentamiento / Principal / Vuelta a la calma
// instead of one flat mix. `title` is the coach block title (phase name as
// fallback); `phase` drives ordering emphasis (principal = focus).
struct WorkoutSegmentGroup: Identifiable {
    let id: Int
    let title: String
    let phase: BlockPhase
    let segments: [WorkoutSegment]
}

struct WorkoutPlan: Codable, Identifiable {
    let id: UUID
    let name: String
    let format: WorkoutFormat
    let estimatedDurationSeconds: Int
    let blockContext: String        // pedagogical phase, e.g. "Tapering · sem 2 · día 4"
    let zoneTargets: [ZoneTarget]
    let equipment: [String]
    let segments: [WorkoutSegment]
    let coachNote: String?
    let demoVideoUrl: String?
    let warmupChecklist: [String]
}

// One completed segment's measured execution. This is the on-device source of
// truth that PostWorkoutSummaryView maps into the `segments[]` upload — so every
// dimension the analytics contract needs lives here (no recomputation
// downstream). Erg fields (pace/500m, power, SPM, calories) are aggregated from
// the PM5 stream over the segment window; they stay nil for non-erg modalities.
struct LapRecord: Codable, Identifiable {
    let id: UUID
    let segmentId: UUID
    /// Backend template_segments.id of the prescribed segment this lap measured —
    /// threaded onto the wire so the coach can map actuals → prescription. Nil
    /// for the freeform fallback segment (backend then matches on `position`).
    let templateSegmentId: Int?
    /// 1-based coach order — drives `position` on the wire.
    let position: Int
    /// Wire modality from `SegmentKind.modality` (run | erg | strength | reps | sled).
    let modality: String
    let startedAt: Date
    let endedAt: Date
    let durationSeconds: Double
    let avgHRBpm: Int?
    let maxHRBpm: Int?
    let zoneSecondsByZone: [Int: Double]   // zone(rawValue) -> seconds
    let repsCompleted: Int?
    let distanceCoveredMeters: Double?
    // Intensity targets / measured outputs.
    let avgPaceSecPer500m: Double?         // erg only — mean of PM5 split samples
    let avgPaceSecPerKm: Double?           // run only — prescribed pace
    let avgPowerWatts: Double?             // erg only — mean of PM5 power samples
    let strokeRateSpm: Double?             // erg only — mean of PM5 SPM samples
    let calories: Double?                  // erg only — final PM5 kcal in window
    let weightUsedKg: Double?              // strength/sled — prescribed load
    /// Provenance of the metrics: "pm5" for erg segments fed by the Concept2,
    /// "healthkit" when HR came from a wearable, else "manual".
    let source: String
}

// Per-segment execution record on the wire. Property names are already
// snake_case (like WorkoutExecutionPayload) so the encoder's
// `.convertToSnakeCase` is a no-op and the keys can't desync from the backend
// Zod schema. The backend consumes this to attribute measured work to each
// prescribed segment (erg splits, run pace, strength load) for analytics + IA
// adaptation.
struct SegmentExecutionDTO: Codable {
    /// Backend template_segments.id of the prescribed segment, threaded from the
    /// assignment detail (`template_segment_id`) through the WorkoutSegment/LapRecord
    /// so the coach can map actuals → prescription. Null only for the freeform
    /// fallback segment — the backend then falls back to matching on `position`.
    let template_segment_id: Int?
    let position: Int
    let modality: String
    let started_at: String           // ISO8601
    let ended_at: String             // ISO8601
    let duration_seconds: Int
    let distance_meters: Double?
    let avg_pace_s_per_500m: Double?
    let avg_pace_s_per_km: Double?
    let avg_power_w: Double?
    let stroke_rate_spm: Double?
    let avg_hr: Int?
    let max_hr: Int?
    let calories: Double?
    let reps_completed: Int?
    let weight_used_kg: Double?
    let zone_seconds_json: [String: Int]?
    let source: String
}

// POST /api/sync/workout-execution body. Explicit snake_case keys to match the
// Zod schema in web/app/api/sync/workout-execution/route.ts so the encoder's
// key strategy can't accidentally desync field names.
struct WorkoutExecutionPayload: Codable {
    let assignment_id: String
    let perceived_exertion: Int?
    let total_duration_seconds: Int?
    let notes: String?
    /// Metcon/HYROX final score. `score_time_s` for For Time / RFT / HYROX-sim;
    /// `score_rounds` (+ `score_reps`) for AMRAP. All nil for non-scored formats.
    let score_time_s: Int?
    let score_rounds: Int?
    let score_reps: Int?
    let started_at: String?
    let ended_at: String?
    /// Per-segment measured execution. Omitted (nil) for sessions with a single
    /// freeform segment and no captured laps; populated for structured workouts.
    let segments: [SegmentExecutionDTO]?
}

// Offline-first sync helper for post-workout summary. Mirrors the CheckinAPI
// pattern: try the POST, on any failure enqueue for replay through the shared
// RequestQueue so closing the workout view is never blocked by network.
enum WorkoutExecutionAPI {
    static let path = "/api/sync/workout-execution"

    static func submit(_ payload: WorkoutExecutionPayload, bearer: String?) async {
        do {
            try await APIClient.shared.postRaw(path: path, body: payload, bearer: bearer)
        } catch {
            if let body = try? JSONEncoder().encode(payload) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
        }
    }
}

// Where a finished execution is submitted. `.solo` → the standard
// /api/sync/workout-execution path. `.doublesJoint` → the joint Dobles endpoint,
// which records the SAME execution and additionally links the partner + shares
// the result. Same payload shape either way — one logging model, no fork.
enum WorkoutLogTarget: Equatable {
    case solo
    case doublesJoint
}

// Joint Dobles execution sync. Mirrors WorkoutExecutionAPI (offline-first via
// RequestQueue) but POSTs to the per-assignment joint endpoint so the backend
// links the partner and shares the result. Reuses WorkoutExecutionPayload —
// `sessionId` is the athlete's own assignment id (== payload.assignment_id).
enum DoblesExecutionAPI {
    static func path(sessionId: String) -> String {
        let encoded = sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId
        return "/api/athlete/dobles/session/\(encoded)/log"
    }

    static func submit(sessionId: String, _ payload: WorkoutExecutionPayload, bearer: String?) async {
        let p = path(sessionId: sessionId)
        do {
            try await APIClient.shared.postRaw(path: p, body: payload, bearer: bearer)
        } catch {
            if let body = try? JSONEncoder().encode(payload) {
                await RequestQueue.shared.enqueue(path: p, body: body, bearer: bearer)
            }
        }
    }
}

// Minimal real plan used to run the timer/lap engine when we only know the
// assignment title. The per-assignment workout BODY (segments, zone targets,
// equipment) is not yet exposed in a shape the live execution engine consumes
// (the detail endpoint returns blocks/items, not WorkoutSegments) — so we
// surface only what we truly have: the session title and a single freeform
// segment. No invented segments, zones, equipment or coach notes.
extension WorkoutPlan {
    static func minimal(title: String?) -> WorkoutPlan {
        let name = (title?.isEmpty == false) ? title! : "Sesión"
        return WorkoutPlan(
            id: UUID(),
            name: name,
            format: .forTime,
            estimatedDurationSeconds: 0,
            blockContext: "",
            zoneTargets: [],
            equipment: [],
            segments: [
                WorkoutSegment(order: 1, title: name, kind: .reps)
            ],
            coachNote: nil,
            demoVideoUrl: nil,
            warmupChecklist: []
        )
    }

    /// Build a runnable plan from the real assignment detail (blocks + items +
    /// params) returned by GET /api/athlete/assignments/{id}/detail. This is what
    /// "EMPEZAR" must run — the same body the athlete sees in Plan — not an empty
    /// title-only shell. Every value comes from the coach's prescription; nothing
    /// is invented. Returns nil for rest days (no workout body).
    static func from(detail: AssignmentDetail) -> WorkoutPlan? {
        guard let workout = detail.workout else { return nil }

        // One segment per exercise item, ordered by block position then item
        // order, so the live timer/lap engine walks the session in coach order.
        // Each segment carries its block's title + position so the post-workout
        // summary can regroup by block and the active HUD can show the phase.
        var order = 0
        let segments: [WorkoutSegment] = workout.blocks
            .sorted { $0.blockPosition < $1.blockPosition }
            .flatMap { block -> [WorkoutSegment] in
                block.items.map { item in
                    order += 1
                    return segment(from: item, order: order, block: block)
                }
            }

        // No items at all → fall back to a single freeform segment titled with
        // the workout name (rather than presenting zero segments to the engine).
        let resolvedSegments = segments.isEmpty
            ? [WorkoutSegment(order: 1, title: workout.name, kind: .reps)]
            : segments

        // Format/score-type comes from the PRINCIPAL block (the main work), NOT
        // `blocks.first` — which is the warmup, so a For-Time/HYROX session would
        // otherwise be misclassified as a circuit and never show its score field.
        let format = workoutFormat(from: principalBlock(workout.blocks)?.format)

        return WorkoutPlan(
            id: UUID(),
            name: workout.name,
            format: format,
            estimatedDurationSeconds: (workout.estimatedDurationMinutes ?? 0) * 60,
            blockContext: workout.focus ?? "",
            zoneTargets: [],
            equipment: [],
            segments: resolvedSegments,
            coachNote: workout.coachNote,
            demoVideoUrl: nil,
            warmupChecklist: []
        )
    }

    private static func segment(from item: WorkoutItem, order: Int, block: WorkoutBlock) -> WorkoutSegment {
        let p = item.paramsJson
        let distanceMeters: Double? = p.distanceMeters.map(Double.init)
            ?? p.distanceKm.map { $0 * 1000 }
        return WorkoutSegment(
            order: order,
            title: item.exerciseName,
            kind: segmentKind(category: item.exerciseCategory, slug: item.exerciseSlug),
            templateSegmentId: item.templateSegmentId,
            targetReps: p.reps,
            targetDistanceMeters: distanceMeters,
            targetDurationSeconds: p.durationSeconds,
            targetPaceSecondsPerKm: p.paceSecPerKm,
            targetPowerWatts: nil,
            targetZone: p.hrZone.flatMap { HRZone(rawValue: $0) },
            loadKg: p.loadKg,
            targetRpe: p.rpe,
            blockTitle: block.title,
            blockPosition: block.blockPosition,
            videoUrl: item.exerciseVideoUrl
        )
    }

    // The session's PRINCIPAL block — the main work whose format defines the
    // session. Mirrors `principalModality`/`classifyBlock` in
    // web/app/api/athlete/plan/week/route.ts: an explicitly "principal"-titled
    // block wins outright; else the largest non-warmup/cooldown block (most
    // items); else any block. Ties keep the earliest position so the result is
    // stable. Returns nil only for an empty block list.
    private static func principalBlock(_ blocks: [WorkoutBlock]) -> WorkoutBlock? {
        guard !blocks.isEmpty else { return nil }
        let ordered = blocks.sorted { $0.blockPosition < $1.blockPosition }
        let roles = ordered.map { BlockPhase.classify(title: $0.title) }

        let principal = zip(ordered, roles).filter { $0.1 == .principal }.map(\.0)
        let mains = zip(ordered, roles).filter { $0.1 == .principal || $0.1 == .main }.map(\.0)
        let candidates = !principal.isEmpty ? principal : (!mains.isEmpty ? mains : ordered)

        // Largest by item count; `ordered` is position-ascending so `max(by:)`
        // keeping the first on a tie means the earliest block wins deterministically.
        return candidates.max { $0.items.count < $1.items.count }
    }

    // Map the DB `exercise_category` enum (cardio | strength | skill |
    // hyrox_station | mobility | plyometric | core) to the live-execution
    // SegmentKind that drives which data grid + timer behaviour is shown.
    //
    // `cardio` is the catch-all bucket for run/row/ski/bike, so — exactly like
    // the backend's modality resolver — we disambiguate by slug: erg work
    // (row/ski/bike) gets the PM5-fed `rowOrSki` grid; everything else cardio
    // is treated as running (distance/pace grid). `hyrox_station` sleds get the
    // sled grid; the rest of the stations are rep-driven. strength → strength.
    private static func segmentKind(category: String, slug: String) -> SegmentKind {
        let s = slug.lowercased()
        switch category {
        // Modern prescription modalities (web displayCategoryForModality)
        case "running":
            return .running
        case "rowing", "ski_erg", "bike_erg":
            return .rowOrSki
        case "functional":
            return s.contains("sled") ? .sled : .reps
        // Legacy raw exercise_category fallback
        case "cardio":
            if s.contains("row") || s.contains("ski") || s.contains("bike") || s.contains("cycl") {
                return .rowOrSki
            }
            return .running   // run / treadmill / generic cardio
        case "strength":
            return .strength
        case "hyrox_station":
            return s.contains("sled") ? .sled : .reps
        default:
            return .reps   // mobility | skill | plyometric | core | other
        }
    }

    // Map the DB `template_format` enum (block_format override) to the live
    // WorkoutFormat that drives the execution timer. Covers every enum value:
    // amrap | for_time | emom | intervals | strength_block | hyrox_sim | tempo
    // | circuit. strength_block → strength; hyrox_sim → hyroxSim; tempo →
    // intervals (paced work intervals); circuit / unknown → circuit.
    private static func workoutFormat(from blockFormat: String?) -> WorkoutFormat {
        switch blockFormat {
        case "for_time":       return .forTime
        case "amrap":          return .amrap
        case "emom":           return .emom
        case "intervals":      return .intervals
        case "tempo":          return .intervals
        case "strength_block": return .strength
        case "hyrox_sim":      return .hyroxSim
        default:               return .circuit   // circuit | nil | unknown
        }
    }
}

extension WorkoutPlan {
    // The plan's segments regrouped into their coach blocks, preserving session
    // order: consecutive segments sharing a `blockPosition` (or, lacking one, a
    // `blockTitle`) form one group. Lets the post-workout summary present
    // Calentamiento / Principal / Vuelta a la calma sections instead of a flat
    // 11-row mix, keeping the principal work the focus. Segments without any block
    // context (the freeform fallback / older snapshots) fall into a single group.
    var segmentGroups: [WorkoutSegmentGroup] {
        var groups: [WorkoutSegmentGroup] = []
        var current: [WorkoutSegment] = []
        var currentKey: String? = nil

        func flush() {
            guard let first = current.first else { return }
            let trimmed = first.blockTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (trimmed?.isEmpty == false) ? trimmed! : first.blockPhase.displayName
            groups.append(
                WorkoutSegmentGroup(
                    id: groups.count,
                    title: title,
                    phase: first.blockPhase,
                    segments: current
                )
            )
            current = []
        }

        for seg in segments {
            let key = seg.blockPosition.map(String.init) ?? seg.blockTitle ?? "_freeform"
            if let ck = currentKey, ck != key { flush() }
            currentKey = key
            current.append(seg)
        }
        flush()
        return groups
    }
}
