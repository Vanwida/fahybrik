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
    /// The STRUCTURED per-set prescription this segment was built from (the rich
    /// `prescription_json`). Threaded onto the segment so the live engine can read
    /// the scheme (EMOM/AMRAP/…) and its per-interval `sets[]` directly, rather
    /// than only the flattened scalar targets. Optional: legacy/freeform segments
    /// carry only scalars (then the engine falls back to the generic lap).
    let prescription: Prescription?

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
        videoUrl: String? = nil,
        prescription: Prescription? = nil
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
        self.prescription = prescription
    }
}

// MARK: - EMOM (every-minute-on-the-minute) live model
//
// Resolved, render-ready description of ONE EMOM interval. For an ALTERNATING
// EMOM the movement rotates minute by minute, so each interval carries its own
// movement label + work + intensity. `movement` falls back to the exercise title
// when a set has no explicit label; `work` / `detail` are formatted by the shared
// PrescriptionRenderer so the live HUD reads exactly like the rest of the app.
struct EmomInterval: Equatable {
    let movement: String   // "Remo", "Burpees", or the exercise title
    let work: String       // "15 cal", "12 reps", "200 m", "0:40"
    let detail: String?    // "@ 1:50/500m", "RPE 8" — nil when none prescribed
}

// The full EMOM dosage for one segment, expanded across its N intervals. Built
// ONCE from the segment's Prescription (the single source of truth) and read by
// both the session timer and the HUD so there is no second interpretation.
struct EmomPlan: Equatable {
    let intervalCount: Int      // N intervals (rounds, or the set count)
    let intervalSeconds: Int    // cadence — seconds per interval ("on the minute" = 60)
    let intervals: [EmomInterval]   // length == intervalCount (rotation expanded)
    let isAlternating: Bool     // the movement changes between intervals

    func interval(_ i: Int) -> EmomInterval? {
        guard i >= 0, i < intervals.count else { return nil }
        return intervals[i]
    }
}

// MARK: - EMOM expansion (THE single source — read by timer AND brief)
//
// The EMOM rotation→intervals expansion lives on `Prescription` (and the per-set
// `EmomInterval` build on `PrescriptionSet`) so it has exactly ONE implementation.
// The live timer reaches it via `WorkoutSegment.emomPlan`; the pre-workout brief
// reaches it via `WorkoutBlock.alternatingEmom` → the SAME merged prescription.
// Neither side re-derives how an alternating EMOM is presented.

extension Prescription {
    /// This EMOM prescription expanded to a render-ready `EmomPlan`: one
    /// `EmomInterval` per minute, the rotation cycling across `rounds` minutes (an
    /// ALTERNATING EMOM) or one interval per explicit set. nil when the scheme
    /// isn't EMOM, or it can't run (no `rounds` and no `sets`). Default cadence is
    /// 60s ("on the minute"). `fallbackMovement` / `fallbackIsErg` fill a set's
    /// missing movement label / erg pace convention; `uniformInterval` supplies
    /// the single interval for a sets-less EMOM from scalar context the bare
    /// prescription lacks (callers with no scalars — the brief — pass `nil`).
    func emomPlan(
        fallbackMovement: String,
        fallbackIsErg: Bool,
        uniformInterval: () -> EmomInterval?
    ) -> EmomPlan? {
        guard scheme == .emom else { return nil }
        let cadence = max(1, workS ?? 60)   // default to the minute
        let rotationSets = sets ?? []
        // A set's erg convention falls back to the prescription's modality, then
        // the caller's context — matching the original per-segment precedence.
        let ergFallback = modality?.isErg ?? fallbackIsErg

        // The rotation: one EmomInterval per prescribed set, else a single uniform
        // interval derived from the caller's scalar targets.
        let rotation: [EmomInterval]
        if rotationSets.isEmpty {
            guard let u = uniformInterval() else { return nil }
            rotation = [u]
        } else {
            rotation = rotationSets.map {
                $0.emomInterval(fallbackMovement: fallbackMovement, fallbackIsErg: ergFallback)
            }
        }

        // N intervals: explicit `rounds`, else one per set. Must be > 0 to run.
        let count = rounds ?? rotationSets.count
        guard count > 0, !rotation.isEmpty else { return nil }

        let expanded = (0..<count).map { rotation[$0 % rotation.count] }
        return EmomPlan(
            intervalCount: count,
            intervalSeconds: cadence,
            intervals: expanded,
            isAlternating: rotation.count > 1
        )
    }
}

extension PrescriptionSet {
    /// This set rendered as ONE EMOM minute — movement label + work + intensity
    /// detail. Pure (no live-segment context): the movement falls back to
    /// `fallbackMovement` when the set carries no note, the erg pace convention to
    /// `fallbackIsErg` when the set carries no modality.
    func emomInterval(fallbackMovement: String, fallbackIsErg: Bool) -> EmomInterval {
        let label = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let movement = (label?.isEmpty == false) ? label! : fallbackMovement
        let isErg = modality?.isErg ?? fallbackIsErg
        let detail = PrescriptionRenderer.targetLoad(target)
            ?? PrescriptionRenderer.paceString(target, isErg: isErg)
        return EmomInterval(movement: movement, work: Self.emomWorkString(measure), detail: detail)
    }

    /// The EMOM minute's WORK string ("15 reps", "0:40", "200 m", "15 cal"), an
    /// em-dash when the measure is absent/zero. EMOM-specific: shows the reps unit
    /// and a non-nil placeholder, unlike `PrescriptionRenderer.measureWork`.
    static func emomWorkString(_ m: Measure?) -> String {
        guard let m else { return "—" }
        switch m {
        case .reps(let v):           return v > 0 ? "\(v) reps" : "—"
        case .distance(let meters):  return PrescriptionRenderer.formatDistance(meters) ?? "—"
        case .duration(let seconds): return seconds > 0 ? PrescriptionRenderer.formatClock(seconds) : "—"
        case .calories(let v):       return v > 0 ? "\(v) cal" : "—"
        case .unknown:               return "—"
        }
    }
}

extension WorkoutSegment {
    /// True when this segment is a runnable EMOM (a valid `emomPlan` exists). A
    /// `scheme==emom` prescription with neither `rounds` nor `sets` can't be run
    /// and degrades to the generic lap rather than crashing.
    var isEMOM: Bool { emomPlan != nil }

    /// The EMOM dosage expanded across its intervals, or nil when this segment is
    /// not a runnable EMOM. Delegates to the shared `Prescription.emomPlan` (the
    /// single EMOM-expansion) — feeding this segment's title / erg kind as the
    /// movement / pace fallbacks, and its scalar targets as the uniform interval
    /// for a sets-less EMOM (context the bare prescription doesn't carry).
    var emomPlan: EmomPlan? {
        guard let p = prescription else { return nil }
        return p.emomPlan(
            fallbackMovement: title,
            fallbackIsErg: kind.isErg,
            uniformInterval: { uniformEmomInterval(p) }
        )
    }

    // Uniform EMOM (same work every minute) — work comes from the flattened scalar
    // targets; intensity from the prescribed RPE / pace / the block target.
    private func uniformEmomInterval(_ p: Prescription) -> EmomInterval {
        let work: String = targetReps.map { "\($0) reps" }
            ?? targetDistanceMeters.flatMap { PrescriptionRenderer.formatDistance($0) }
            ?? targetDurationSeconds.map { PrescriptionRenderer.formatClock($0) }
            ?? "—"
        let detail = effortGuidance
            ?? PrescriptionRenderer.targetLoad(p.target)
            ?? PrescriptionRenderer.paceString(p.target, isErg: kind.isErg)
        return EmomInterval(movement: title, work: work, detail: detail)
    }
}

extension WorkoutSegment {
    /// Pedagogical phase of this segment's block (warmup / principal / cooldown).
    var blockPhase: BlockPhase { BlockPhase.classify(title: blockTitle) }

    /// Stable key that groups CONSECUTIVE segments into their coach block — the
    /// authored block position, else its title, else a single freeform bucket.
    /// The ONE definition both `WorkoutPlan.segmentGroups` and `.blockRegions`
    /// partition on, so the two groupings can never drift.
    var blockGroupingKey: String {
        blockPosition.map(String.init) ?? blockTitle ?? "_freeform"
    }

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

    /// A compact, athlete-readable line of THIS segment's prescribed work for the
    /// block-preview gate — the dominant measure + pace / zone / load / effort.
    /// Reuses the shared `PrescriptionRenderer` (structured prescription first),
    /// falling back to the scalar targets so a legacy/freeform segment still reads.
    /// Nil only when the segment carries no readable target at all.
    var previewWorkLine: String? {
        if let p = prescription {
            let line = PrescriptionRenderer.summaryLine(p)
            var parts: [String] = []
            if let h = line.headline { parts.append(h) }
            if let pace = line.pace { parts.append(pace) }
            if let z = line.zone { parts.append(z.label) }
            if let d = line.detail { parts.append(d) }
            if !parts.isEmpty { return parts.joined(separator: " · ") }
        }
        // Scalar fallback (no structured prescription): one dominant measure +
        // load / pace / zone / effort. Pace unit follows the segment kind (erg
        // reads /500m, run reads /km), mirroring the brief's lineFromParams.
        var parts: [String] = []
        if let r = targetReps, r > 0 { parts.append("\(r) reps") }
        else if let m = targetDistanceMeters, let s = PrescriptionRenderer.formatDistance(m) { parts.append(s) }
        else if let d = durationGuidance { parts.append(d) }
        if let kg = loadKg, kg > 0 {
            parts.append(kg.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(kg)) kg" : String(format: "%.1f kg", kg))
        }
        if let p = targetPaceSecondsPerKm, p > 0 {
            parts.append(kind.isErg
                ? "@ \(PrescriptionRenderer.formatPace(p / 2)) /500m"
                : "@ \(PrescriptionRenderer.formatPace(p)) /km")
        }
        if let z = targetZone { parts.append(z.label) }
        if let e = effortGuidance { parts.append(e) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
    /// Provenance of the execution (the backend `biometric_source` enum). Sent
    /// "manual" for a retroactive "Ya lo hice" log the athlete typed by hand;
    /// nil for the live-timer path, where the backend defaults it to 'healthkit'.
    let source: String?
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
                // An ALTERNATING EMOM is ONE block with several movements that the
                // athlete cycles minute by minute (min1 wallballs / min2 run / min3
                // wallballs …) — a SINGLE 15-min EMOM, not back-to-back ones. The
                // backend ships it as one emom block with N items; `block.alternatingEmom`
                // (the shared fold) merges those items into ONE rotation prescription
                // so `emomPlan` cycles them across the EMOM's minutes. One-segment-
                // per-item would run them as N separate 15-min EMOMs — the 30-min bug.
                if let merged = block.alternatingEmom {
                    order += 1
                    return [mergedEmomSegment(block: block, merged: merged, order: order)]
                }
                return block.items.map { item in
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
            kind: item.segmentKind,
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
            videoUrl: item.exerciseVideoUrl,
            // The rich structured prescription drives the live EMOM/interval timer
            // (scheme + per-interval sets); scalar params above still feed the
            // generic HUDs. Preferred when present, ignored when nil.
            prescription: item.prescription
        )
    }

    // Package the shared alternating-EMOM fold (`block.alternatingEmom` — the ONE
    // rotation prescription read by both the live timer and the brief) into the
    // single live-execution segment that runs it. Only the segment-specific
    // concerns live here (lap modality, title, attributed template id); the
    // rotation itself is built once on `WorkoutBlock`, never re-derived.
    private static func mergedEmomSegment(block: WorkoutBlock, merged: Prescription, order: Int) -> WorkoutSegment {
        // `kind` drives the ONE recorded lap's modality + capture. A mixed-modality
        // EMOM (run + reps) has no single modality → `.reps` (a neutral timed record,
        // no false GPS/PM5/load); a homogeneous EMOM (e.g. all-erg) keeps that kind.
        let kinds = Set(block.items.map(\.segmentKind))
        let kind: SegmentKind = kinds.count == 1 ? (kinds.first ?? .reps) : .reps

        // Title = the movements in order, e.g. "Wallballs / Run" — the PostWorkout
        // row label and the EMOM HUD's movement fallback.
        let title = dedupPreservingOrder(block.items.map(\.exerciseName)).joined(separator: " / ")

        return WorkoutSegment(
            order: order,
            title: title.isEmpty ? block.title : title,
            kind: kind,
            // One template_segments.id per segment. An alternating EMOM is ONE
            // continuous effort recorded as a single lap, so we attribute it to the
            // first movement's prescription (the rest share the block).
            templateSegmentId: block.items.first?.templateSegmentId,
            // Scalar targets stay nil: the structured `sets` rotation is the single
            // source of truth for a merged EMOM, and `emomPlan` reads it directly.
            blockTitle: block.title,
            blockPosition: block.blockPosition,
            // No single technique video for a multi-movement EMOM (the model carries
            // one per segment, not per minute) — omit rather than show a misleading one.
            videoUrl: nil,
            prescription: merged
        )
    }

    // Distinct strings keeping first-seen order — for the merged EMOM title so a
    // movement repeated across items isn't listed twice.
    private static func dedupPreservingOrder(_ xs: [String]) -> [String] {
        var seen = Set<String>()
        return xs.filter { seen.insert($0).inserted }
    }

    // The session's PRINCIPAL block — the main work whose format defines the
    // session. Mirrors `principalModality`/`classifyBlock` in
    // web/app/api/athlete/plan/week/route.ts: an explicitly "principal"-titled
    // block wins outright; else the largest non-warmup/cooldown block (most
    // items); else any block. Ties keep the earliest position so the result is
    // stable. Returns nil only for an empty block list.
    //
    // Internal (not private) so the pre-workout brief reuses the SAME selection to
    // derive its subtitle modality from the main work — never the warmup's first
    // exercise. One definition, no second heuristic to drift from this one.
    static func principalBlock(_ blocks: [WorkoutBlock]) -> WorkoutBlock? {
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

// MARK: - WorkoutItem → live-execution kind / measure
//
// An item's live-execution `SegmentKind` and its scalar-derived `Measure` are
// intrinsic to the item, so they live on `WorkoutItem` — reachable by both the
// live-plan builder (`WorkoutPlan.from`) and the alternating-EMOM fold
// (`WorkoutBlock.alternatingEmom`) without duplicating the mapping.

extension WorkoutItem {
    /// Map the DB `exercise_category` enum (running | rowing | ski_erg | bike_erg
    /// | functional | strength | hyrox_station | cardio | …) to the live-execution
    /// `SegmentKind` that drives which data grid + timer behaviour is shown.
    ///
    /// `cardio` is the catch-all bucket for run/row/ski/bike, so — exactly like the
    /// backend's modality resolver — we disambiguate by slug: erg work (row/ski/
    /// bike) gets the PM5-fed `rowOrSki` grid; everything else cardio is treated as
    /// running (distance/pace grid). `hyrox_station`/`functional` sleds get the
    /// sled grid; the rest of the stations are rep-driven. strength → strength.
    var segmentKind: SegmentKind {
        let s = exerciseSlug.lowercased()
        switch exerciseCategory {
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

    /// This item's per-minute WORK as a structured `Measure`, derived from its
    /// scalar params — so a legacy (prescription-less) item still rotates in a
    /// merged EMOM. Mirrors `PrescriptionSet.emomWorkString`'s precedence.
    var scalarMeasure: Measure? {
        let p = paramsJson
        if let r = p.reps, r > 0 { return .reps(r) }
        if let c = p.calories, c > 0 { return .calories(c) }
        if let m = p.distanceMeters, m > 0 { return .distance(meters: Double(m)) }
        if let km = p.distanceKm, km > 0 { return .distance(meters: km * 1000) }
        if let d = p.durationSeconds, d > 0 { return .duration(seconds: d) }
        return nil
    }
}

// MARK: - WorkoutBlock → alternating-EMOM fold (THE single source)
//
// An ALTERNATING EMOM is ONE block with several movements the athlete cycles
// minute by minute (min1 wallballs / min2 run / min3 wallballs …) — a SINGLE
// 15-min EMOM, not back-to-back ones. The backend ships it as one `emom` block
// with N items. Folding those items into ONE rotation prescription lives HERE,
// on `WorkoutBlock`, so BOTH consumers read it: the live timer (via
// `WorkoutPlan.from` → `WorkoutSegment.emomPlan`) and the pre-workout brief.
// Before, only the live builder folded and the brief stacked the items as
// separate cards ("15 wallballs then run") — two consumers, one presentation.

extension WorkoutBlock {
    /// True when this block is an ALTERNATING EMOM: an EMOM (the block's declared
    /// `emom` format, else every item carries an EMOM prescription) with MORE THAN
    /// ONE movement. A single-movement EMOM (one item every minute) and every
    /// non-EMOM multi-item block (AMRAP, circuit, a strength block's exercises) are
    /// not — they keep one unit per item.
    var isAlternatingEmom: Bool {
        guard items.count > 1 else { return false }
        // "emom" is the backend's `template_format` enum value (see workoutFormat).
        if format == "emom" { return true }
        return items.allSatisfy { $0.prescription?.scheme == .emom }
    }

    /// The merged EMOM prescription for an alternating-EMOM block: its movements
    /// folded into ONE EMOM whose minutes ROTATE through them (min1 item0 / min2
    /// item1 / min3 item0 …) across the EMOM's total minutes (`rounds`). nil when
    /// the block is not an alternating EMOM. THE single fold the live timer and the
    /// brief both read, so the EMOM is presented identically in both.
    var alternatingEmom: Prescription? {
        guard isAlternatingEmom else { return nil }

        // Each item becomes one rotation slot — its per-minute work (the item's
        // set, else its scalar params), intensity target, modality and movement
        // label — so `Prescription.emomPlan` expands the rotation across the minutes.
        let rotation: [PrescriptionSet] = items.map { item in
            let baseSet = item.prescription?.sets?.first
            let coachLabel = baseSet?.note?.trimmingCharacters(in: .whitespacesAndNewlines)
            return PrescriptionSet(
                // The minute's WORK — the item's prescribed set, else derived from its
                // scalar params so a legacy (prescription-less) item still rotates.
                measure: baseSet?.measure ?? item.scalarMeasure,
                // Its INTENSITY — the per-set target, else the item's block-level one.
                target: baseSet?.target ?? item.prescription?.target,
                // Its MODALITY — drives the erg /500m vs run /km pace unit in the HUD.
                // Per-set, else item-level, else inferred from the exercise category.
                modality: baseSet?.modality
                    ?? item.prescription?.modality
                    ?? PrescriptionModality(rawValue: item.segmentKind.modality),
                restS: baseSet?.restS,
                tempo: baseSet?.tempo,
                // The MOVEMENT label shown for this minute — the coach's set note, else
                // the exercise name. Never nil, so each minute names its own movement.
                note: (coachLabel?.isEmpty == false) ? coachLabel : item.exerciseName
            )
        }

        // EMOM TOTAL minutes (e.g. 15). Every item carries the SAME total in `rounds`;
        // take the max (guards a nil/stray). NOT summed across items — an alternating
        // "EMOM 15" is 15 minutes total cycling the rotation, NOT 15×items = 30 (the
        // bug). Per-movement counts would DIFFER (8 vs 7 across 15 alternating
        // minutes), so an equal `rounds` on every item can only be the EMOM total.
        let totalMinutes = items.compactMap { $0.prescription?.rounds }.max()
        // Cadence ("on the minute" = 60s); `emomPlan` defaults to 60 when absent.
        let cadence = items.compactMap { $0.prescription?.workS }.first

        return Prescription(
            scheme: .emom,
            modality: nil,
            sets: rotation,
            rounds: totalMinutes,
            workS: cadence,
            restS: nil,
            totalS: nil,
            target: nil,
            note: nil
        )
    }
}

// MARK: - Block regions (coach-authored block boundaries)
//
// The session's segments partitioned into the coach's AUTHORED blocks (a
// "Calentamiento", a "Fuerza" block, a "Metcon"), in session order, each with the
// segment-index span it covers. Unlike `phaseRegions` — which FOLDS every main
// block into one "Principal" phase for the top rail — this keeps every block
// DISTINCT, because the block-transition gate must fire at EACH block boundary the
// athlete sets up for: a Fuerza→Metcon hand-off needs a gate (load the bar, read
// the WOD) just as much as Calentamiento→Principal does, even though both are the
// "Principal" phase. Phase granularity would miss those intra-phase gates.
struct WorkoutBlockRegion: Identifiable, Equatable {
    let id: Int            // 0-based block index in session order
    let title: String      // coach block title, else the phase display name
    let phase: BlockPhase
    let firstIndex: Int    // first segment index of this block
    let lastIndex: Int     // last segment index of this block
}

extension WorkoutPlan {
    /// The coach's blocks as index-spanned regions, in session order. Consecutive
    /// segments sharing a `blockGroupingKey` form one block. Empty only for an
    /// empty plan. THE single partition both the block-preview gate and
    /// `segmentGroups` read, so block boundaries are defined in exactly one place.
    var blockRegions: [WorkoutBlockRegion] {
        var regions: [WorkoutBlockRegion] = []
        var start = 0
        var key: String? = nil
        func flush(_ end: Int) {
            let first = segments[start]
            let trimmed = first.blockTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (trimmed?.isEmpty == false) ? trimmed! : first.blockPhase.displayName
            regions.append(
                WorkoutBlockRegion(
                    id: regions.count,
                    title: title,
                    phase: first.blockPhase,
                    firstIndex: start,
                    lastIndex: end
                )
            )
        }
        for (i, seg) in segments.enumerated() {
            let k = seg.blockGroupingKey
            if let prev = key, prev != k { flush(i - 1); start = i }
            key = k
        }
        if !segments.isEmpty { flush(segments.count - 1) }
        return regions
    }

    /// The block region that contains `index`, or nil when out of range.
    func blockRegion(containing index: Int) -> WorkoutBlockRegion? {
        blockRegions.first { index >= $0.firstIndex && index <= $0.lastIndex }
    }

    /// The segments belonging to a block region, in session order.
    func segments(in region: WorkoutBlockRegion) -> [WorkoutSegment] {
        guard region.firstIndex <= region.lastIndex,
              region.firstIndex >= 0, region.lastIndex < segments.count else { return [] }
        return Array(segments[region.firstIndex...region.lastIndex])
    }
}

extension WorkoutPlan {
    // The plan's segments regrouped into their coach blocks, preserving session
    // order. Derived from `blockRegions` (the single block partition) so the
    // post-workout summary's Calentamiento / Principal / Vuelta a la calma sections
    // and the live block-preview gate can never disagree on where a block begins.
    var segmentGroups: [WorkoutSegmentGroup] {
        blockRegions.map { region in
            WorkoutSegmentGroup(
                id: region.id,
                title: region.title,
                phase: region.phase,
                segments: segments(in: region)
            )
        }
    }
}

// MARK: - Phase regions (the persistent top phase rail)
//
// The session's segments collapsed into their PEDAGOGICAL phases (Calentamiento /
// Principal / Vuelta a la calma) with the segment-index span each phase covers,
// in session order. Drives the active-workout phase rail: each region is one
// rail segment whose state (done / current / upcoming) is read off the current
// segment index, and tapping it jumps to `firstIndex`.

struct WorkoutPhaseRegion: Identifiable, Equatable {
    let id: Int
    let phase: BlockPhase
    let title: String      // phase display name ("Principal")
    let firstIndex: Int    // first segment index of this phase
    let lastIndex: Int     // last segment index of this phase
}

extension WorkoutPlan {
    /// Distinct phases present in the session, ordered by first appearance, each
    /// spanning the segment range it covers. Empty when NO segment carries block
    /// context (the freeform / `minimal` fallback) — the rail then collapses to a
    /// single "Entreno" chip rather than hiding (kills the dead-spot). `.main` and
    /// `.principal` both fold into the one "Principal" phase.
    var phaseRegions: [WorkoutPhaseRegion] {
        guard segments.contains(where: { $0.blockTitle != nil }) else { return [] }

        // Fold .main into .principal so warmup/principal/cooldown is the axis.
        func key(_ p: BlockPhase) -> BlockPhase { p.isMainWork ? .principal : p }

        var minIdx: [BlockPhase: Int] = [:]
        var maxIdx: [BlockPhase: Int] = [:]
        for (i, seg) in segments.enumerated() {
            let k = key(seg.blockPhase)
            minIdx[k] = Swift.min(minIdx[k] ?? i, i)
            maxIdx[k] = Swift.max(maxIdx[k] ?? i, i)
        }
        return minIdx.keys
            .sorted { (minIdx[$0] ?? 0) < (minIdx[$1] ?? 0) }
            .enumerated()
            .map { idx, phase in
                WorkoutPhaseRegion(
                    id: idx,
                    phase: phase,
                    title: phase.displayName,
                    firstIndex: minIdx[phase]!,
                    lastIndex: maxIdx[phase]!
                )
            }
    }
}
