import SwiftUI

// Idea 1 — "sube una captura → la IA rellena el resultado".
//
// The athlete trained with ANOTHER app (Concept2 PM5 · Garmin · Coros · Strava ·
// Apple) without the watch connected. They upload a screenshot of that app's
// workout summary; the backend (POST …/vision-result) reads it with a multimodal
// LLM and returns a PROPOSAL — every value wrapped with its confidence
// (detected / review). NOTHING is saved server-side. The athlete reviews and
// corrects here, then "Confirmar y guardar" POSTs the confirmed values to the
// SAME honest-logging path the live timer uses (/api/sync/workout-execution),
// flipping the day to HECHO and reaching the coach.
//
// HONESTY IS THE POINT: we never fabricate. A value the IA couldn't read clearly
// comes back null/'review' (amber) for the athlete to fill; a value it read
// cleanly is 'detected' (green). Editing any field flips it to "Tú".

// MARK: - The app the screenshot came from

// Drives the prompt hint AND the honest provenance stamp. Only REAL devices map
// to their own biometric source; everything else is honestly 'manual' (the
// result arrived via a photo, not a live device sync) — mirrors the backend
// `appToBiometricSource`.
enum CaptureApp: String, CaseIterable, Identifiable {
    case concept2, garmin, coros, strava, apple, other
    var id: String { rawValue }

    var label: String {
        switch self {
        case .concept2: return "Concept2 PM5"
        case .garmin:   return "Garmin"
        case .coros:    return "Coros"
        case .strava:   return "Strava"
        case .apple:    return "Apple"
        case .other:    return "Otra app"
        }
    }

    /// Canonical `biometric_source` for the execution. Real devices keep their
    /// identity; a Strava/Apple/other capture is honestly 'manual'.
    var biometricSource: String {
        switch self {
        case .garmin:   return "garmin"
        case .coros:    return "coros"
        case .concept2: return "concept2"
        default:        return "manual"
        }
    }
}

// MARK: - Proposal decode (the backend response — snake_case → camelCase)

// Each numeric value the IA proposes is wrapped with WHY we believe it. `value`
// is null when 'review' (the IA couldn't read it) — never a fabricated number.
struct VisionField: Decodable {
    let value: Double?
    let confidence: String   // "detected" | "review"
    let source: String
}

struct VisionMetrics: Decodable {
    let totalDurationSeconds: VisionField
    let distanceMeters: VisionField
    let avgPaceS: VisionField
    let paceUnit: String     // "per_km" | "per_500m"
    let avgHr: VisionField
    let maxHr: VisionField
    let calories: VisionField
    let avgPowerW: VisionField
    let strokeRateSpm: VisionField
    let perceivedExertion: VisionField  // always 'review' — never in a screenshot
}

struct VisionSegmentFields: Decodable {
    let durationSeconds: VisionField
    let distanceMeters: VisionField
    let avgPaceS: VisionField
    let avgHr: VisionField
    let avgPowerW: VisionField
    let strokeRateSpm: VisionField
    let calories: VisionField
}

struct VisionSegment: Decodable, Identifiable {
    let position: Int
    let modality: String
    // The prescribed block this split links to (server-resolved). Threaded back
    // on confirm so the execution inherits its exercise + prescription context
    // instead of degrading to 'session'. Null = no honest match (unmatched lap).
    let templateSegmentId: Int?
    let fields: VisionSegmentFields
    var id: Int { position }
}

struct VisionPrescriptionContext: Decodable {
    let primaryModality: String
    let format: String
    let summary: String
    let boutsExpected: Int?
}

struct WorkoutVisionProposal: Decodable {
    let prescription: VisionPrescriptionContext
    let metrics: VisionMetrics
    let segments: [VisionSegment]
    let notes: String?
    // The prescribed link for the AGGREGATE (chart-only) path: when the capture
    // has totals but no per-split table, `segments` is empty, so this carries the
    // single-cardio-item link the collapsed segment attaches to. Null otherwise.
    let aggregateTemplateSegmentId: Int?
    let model: String
    // `proposed_execution` (in the response) is intentionally not decoded: we
    // REBUILD the confirm payload from the athlete's reviewed/edited state below,
    // so RPE + corrections are always included.
}

// MARK: - Confirm payload (the SAME contract the live timer posts)

// One reviewed segment on the wire. All metrics optional except position +
// modality (matching `segmentInputSchema`): a screenshot carries no timestamps,
// so we send none and let the backend derive the interval from the execution
// window — never a fabricated 0. Explicit snake_case keys (the encoder's
// convertToSnakeCase is then a no-op) so they can't desync from the Zod schema.
struct CaptureSegmentDTO: Encodable {
    let position: Int
    let modality: String
    // The prescribed block link (nil → key omitted by encodeIfPresent, so the
    // Zod `template_segment_id` optional sees `undefined`, never a null).
    let template_segment_id: Int?
    let duration_seconds: Int?
    let distance_meters: Double?
    let avg_pace_s_per_500m: Double?
    let avg_pace_s_per_km: Double?
    let avg_power_w: Double?
    let stroke_rate_spm: Double?
    let avg_hr: Int?
    let max_hr: Int?
    let calories: Double?
    let source: String?
}

// POST /api/sync/workout-execution body for the capture-confirm path — the SAME
// endpoint + shape the live `WorkoutExecutionPayload` uses, so the result lands
// in the one execution model (adherence, analytics, coach) with zero fork.
struct CaptureExecutionPayload: Encodable {
    let assignment_id: String
    let perceived_exertion: Int?
    let total_duration_seconds: Int?
    let notes: String?
    let source: String?
    let completeness: String?   // "full" — a brought-in result is a completed session
    let started_at: String?
    let ended_at: String?
    let segments: [CaptureSegmentDTO]?
}

// MARK: - Networking

enum WorkoutVisionAPI {
    // The vision model isn't configured (501) — surfaced honestly, never faked.
    struct VisionUnavailable: Error {}

    static func visionPath(assignmentId: String) -> String {
        let enc = assignmentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? assignmentId
        return "/api/athlete/assignments/\(enc)/vision-result"
    }

    /// Upload the screenshot → decoded proposal. 501 → `VisionUnavailable`.
    static func read(
        assignmentId: String,
        imageData: Data,
        app: CaptureApp?,
        bearer: String?
    ) async throws -> WorkoutVisionProposal {
        var fields: [String: String] = [:]
        if let app { fields["app"] = app.rawValue }
        do {
            return try await APIClient.shared.postImage(
                path: visionPath(assignmentId: assignmentId),
                imageData: imageData,
                filename: "capture.jpg",
                mimeType: "image/jpeg",
                fields: fields,
                bearer: bearer
            )
        } catch APIError.http(let status, _) where status == 501 {
            throw VisionUnavailable()
        }
    }

    /// Confirm the reviewed result through the shared honest-logging path.
    /// Offline-first: on failure enqueue for replay (mirrors WorkoutExecutionAPI).
    static func confirm(_ payload: CaptureExecutionPayload, bearer: String?) async {
        let path = WorkoutExecutionAPI.path
        do {
            try await APIClient.shared.postRaw(path: path, body: payload, bearer: bearer)
        } catch {
            // AUDIT — a deterministic 4xx is never queued (it would replay forever).
            if RequestQueue.isRetriable(error), let body = try? JSONEncoder().encode(payload) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
        }
    }
}

// MARK: - Editable review state

// Per-field honesty, carried into the UI: green = the IA read it, amber = the IA
// flagged it for review (value empty), accent = the athlete edited it.
enum FieldStatus {
    case detected, review, edited

    var label: String {
        switch self {
        case .detected: return "Detectado"
        case .review:   return "Revisar"
        case .edited:   return "Tú"
        }
    }
    var color: Color {
        switch self {
        case .detected: return Theme.Color.ok
        case .review:   return Theme.Color.warning
        case .edited:   return Theme.Color.accentText
        }
    }
    var tint: Color { color.opacity(0.16) }
}

// One editable numeric field: the live value + the IA's original confidence +
// the value it started at (so an edit is detectable → status flips to "Tú").
struct EditableField {
    var value: Double?
    let detected: FieldStatus     // .detected or .review (never .edited)
    let initialValue: Double?

    var status: FieldStatus { value != initialValue ? .edited : detected }

    static func from(_ f: VisionField) -> EditableField {
        let conf: FieldStatus = (f.confidence == "detected" && f.value != nil) ? .detected : .review
        return EditableField(value: f.value, detected: conf, initialValue: f.value)
    }
}

struct EditableSegment: Identifiable {
    let id: Int
    let position: Int
    let modality: String
    // Prescribed link carried through the review UI unchanged (not athlete-edited).
    let templateSegmentId: Int?
    var time: EditableField
    var pace: EditableField
    // Detected-only passthrough — preserved on confirm, not edited in the splits UI.
    let distanceMeters: Double?
    let avgHr: Int?
    let avgPowerW: Double?
    let strokeRateSpm: Double?
    let calories: Double?
}

@MainActor
final class CaptureReviewModel: ObservableObject {
    // Aggregate metrics
    @Published var totalTime: EditableField
    @Published var distance: EditableField
    @Published var avgPace: EditableField
    @Published var avgHr: EditableField
    @Published var maxHr: EditableField
    @Published var calories: EditableField
    @Published var avgPower: EditableField
    @Published var spm: EditableField
    @Published var rpe: EditableField       // review — the athlete adds it
    @Published var notes: String
    @Published var segments: [EditableSegment]

    let paceUnit: String                    // "per_km" | "per_500m"
    let modality: String                    // primary modality wire (run/row/…)
    let summary: String
    // Prescribed link for the aggregate-only path (no per-split segments).
    let aggregateTemplateSegmentId: Int?

    var paceUnitLabel: String { paceUnit == "per_km" ? Formato.UnidadRitmo.porKm.rawValue : Formato.UnidadRitmo.por500m.rawValue }
    var isErgPace: Bool { paceUnit == "per_500m" }

    init(proposal: WorkoutVisionProposal) {
        let m = proposal.metrics
        totalTime = .from(m.totalDurationSeconds)
        distance  = .from(m.distanceMeters)
        avgPace   = .from(m.avgPaceS)
        avgHr     = .from(m.avgHr)
        maxHr     = .from(m.maxHr)
        calories  = .from(m.calories)
        avgPower  = .from(m.avgPowerW)
        spm       = .from(m.strokeRateSpm)
        // RPE is never in a screenshot → always review, the athlete adds it.
        rpe = EditableField(value: nil, detected: .review, initialValue: nil)
        notes = proposal.notes ?? ""
        paceUnit = m.paceUnit
        modality = proposal.prescription.primaryModality
        summary = proposal.prescription.summary
        aggregateTemplateSegmentId = proposal.aggregateTemplateSegmentId
        segments = proposal.segments.map { s in
            EditableSegment(
                id: s.position,
                position: s.position,
                modality: s.modality,
                templateSegmentId: s.templateSegmentId,
                time: .from(s.fields.durationSeconds),
                pace: .from(s.fields.avgPaceS),
                distanceMeters: s.fields.distanceMeters.value,
                avgHr: CaptureReviewModel.validHr(s.fields.avgHr.value),
                avgPowerW: s.fields.avgPowerW.value,
                strokeRateSpm: s.fields.strokeRateSpm.value,
                calories: s.fields.calories.value
            )
        }
    }

    // Count of fields still flagged for review (drives the review-screen hint).
    var reviewCount: Int {
        [totalTime, distance, avgPace, avgHr, calories, avgPower, spm, rpe]
            .filter { $0.status == .review }.count
    }

    /// Heart-rate within the analytics-accepted range (30–260) or nil — a stray
    /// value is dropped rather than sent, so it can never 400 the whole confirm.
    static func validHr(_ v: Double?) -> Int? {
        guard let v, v >= 30, v <= 260 else { return nil }
        return Int(v.rounded())
    }

    // Build the confirm payload from the REVIEWED state (detected + edits + RPE).
    func buildPayload(assignmentId: String, app: CaptureApp?) -> CaptureExecutionPayload {
        let source = app?.biometricSource ?? "manual"
        let total = totalTime.value.map { Int($0.rounded()) }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let ended = Date()
        // No real start instant for a brought-in result → derive from the total
        // so started_at/ended_at stay consistent (mirrors the manual-log path).
        let started = ended.addingTimeInterval(-Double(total ?? 0))

        let segs = buildSegments(source: source)
        return CaptureExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: rpe.value.map { Int($0.rounded()) },
            total_duration_seconds: total,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes,
            source: source,
            completeness: "full",
            started_at: iso.string(from: started),
            ended_at: iso.string(from: ended),
            segments: segs.isEmpty ? nil : segs
        )
    }

    // Pace goes into the modality-native column (run → /km, erg → /500m).
    private func paceColumns(_ secs: Int?) -> (km: Double?, p500: Double?) {
        guard let secs else { return (nil, nil) }
        return paceUnit == "per_km" ? (Double(secs), nil) : (nil, Double(secs))
    }

    // Per-split detail when present; else ONE aggregate segment so the measured
    // work still reaches the coach (mirrors the backend's aggregate collapse).
    private func buildSegments(source: String) -> [CaptureSegmentDTO] {
        if !segments.isEmpty {
            return segments.map { s in
                let pc = paceColumns(s.pace.value.map { Int($0.rounded()) })
                return CaptureSegmentDTO(
                    position: s.position,
                    modality: s.modality,
                    template_segment_id: s.templateSegmentId,
                    duration_seconds: s.time.value.map { Int($0.rounded()) },
                    distance_meters: s.distanceMeters,
                    avg_pace_s_per_500m: pc.p500,
                    avg_pace_s_per_km: pc.km,
                    avg_power_w: s.avgPowerW,
                    stroke_rate_spm: s.strokeRateSpm,
                    avg_hr: s.avgHr,
                    max_hr: nil,
                    calories: s.calories,
                    source: source
                )
            }
        }
        // Aggregate-only read — represent it as one segment if there's any metric.
        let pc = paceColumns(avgPace.value.map { Int($0.rounded()) })
        let agg = CaptureSegmentDTO(
            position: 0,
            modality: modality,
            template_segment_id: aggregateTemplateSegmentId,
            duration_seconds: nil,
            distance_meters: distance.value,
            avg_pace_s_per_500m: pc.p500,
            avg_pace_s_per_km: pc.km,
            avg_power_w: avgPower.value,
            stroke_rate_spm: spm.value,
            avg_hr: CaptureReviewModel.validHr(avgHr.value),
            max_hr: CaptureReviewModel.validHr(maxHr.value),
            calories: calories.value,
            source: source
        )
        let hasAny = agg.distance_meters != nil || agg.avg_pace_s_per_km != nil
            || agg.avg_pace_s_per_500m != nil || agg.avg_hr != nil || agg.max_hr != nil
            || agg.calories != nil || agg.avg_power_w != nil || agg.stroke_rate_spm != nil
        return hasAny ? [agg] : []
    }
}
