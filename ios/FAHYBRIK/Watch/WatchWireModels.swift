import Foundation
import HealthKit

// MARK: - Watch ⇄ iPhone wire models (THE single shared transport shape)
//
// Compiled into BOTH the iPhone (FAHYBRIK) and watch (FAHYBRIKWatch) targets, so
// the day's session + readiness (iPhone → Watch) and the finished execution
// (Watch → iPhone) are described in exactly ONE place. Before this, the iOS
// service and the watch plan model each hand-maintained a mirror struct that
// silently drifted; there is now no second definition to keep in sync.
//
// TRANSPORT
//   iPhone → Watch : the encoded `WatchTodayPayload` is placed as a single `Data`
//                    value under `WatchWireKeys.today` in the WCSession
//                    applicationContext (overwrite semantics — always "today").
//   Watch → iPhone : the encoded `WatchExecutionEnvelope` is placed under
//                    `WatchWireKeys.executionResult` in a WCSession
//                    transferUserInfo (queued across launches / reachability).

/// iPhone → Watch: today's session (or a genuine rest day) + readiness. Encoded as
/// JSON `Data` inside the WCSession applicationContext under `WatchWireKeys.today`.
///
/// `dayKind` splits the two shapes the wrist must render: on a `.session` day the
/// assignment fields (id / title / activityKind) are present and the watch can run
/// the workout; on a `.rest` day they are all nil — the athlete still glances the
/// readiness fields, so a rest day is a REAL push, never an empty/cleared context
/// (that is reserved for logout / no-data). See WatchConnectivityiOSService.
struct WatchTodayPayload: Codable, Equatable {
    let dayKind: String               // WatchDayKind.session | .rest
    let assignmentId: String?         // nil on rest days
    let title: String?                // nil on rest days
    let focus: String?
    let estDurationMinutes: Int?
    let intensityLabel: String?
    let activityKind: String?         // "running" | "strength" | "hyrox" | "mixed"; nil on rest days
    // The athlete's HR zones exactly as the SERVER resolved them. The wrist
    // classifies against these absolute bands — it never derives its own from a
    // max, which is how the watch used to tint a pulse one zone away from what
    // the phone recorded for the same beat. Nil = the athlete has no zones yet;
    // the wrist then shows the pulse with no zone rather than inventing one.
    // Optional so an older watch binary still decodes the payload.
    let athleteHrZones: HRZoneProfile?
    let readinessScore: Int?
    let readinessDelta7d: Int?
    let readinessWorstDriver: String? // e.g. "Sueño 6h 10m" — worst component, human label
    let isDone: Bool                  // true once execution landed; watch shows completed state
    let doneCompleteness: String?     // "full" | "partial" when isDone; nil otherwise
    let isDoubles: Bool               // true when this is a dobles-pair session (wrist logs it jointly)
    // #23 — dobles partner + sharing context for the wrist:
    //   partnerFirstName → the "DOBLES · con {nombre}" badge (brief + done) and the
    //                      "Compartir con {nombre}" copy. Nil → "tu compañero".
    //   partnerVisibility → the assignment's coach/athlete visibility ("shared" |
    //                      "self_only"). A self_only dobles session is PRIVATE: the
    //                      wrist never offers to share it (mirrors #22 hiding "Hacerla
    //                      juntos"). Optional so older phone/watch binaries decode.
    let partnerFirstName: String?     // nil on non-dobles / rest days
    let partnerVisibility: String?    // "shared" | "self_only"; nil on non-dobles
    let detailJson: Data?             // full AssignmentDetail JSON (verbatim API body) — watch builds WorkoutPlan from it
}

/// The two day shapes a `WatchTodayPayload` carries. String-backed (not an enum
/// case) so it rides the wire verbatim through the plain coder both ends share.
enum WatchDayKind {
    static let session = "session"
    static let rest = "rest"
}

/// Watch → iPhone: finished execution. Encoded as JSON `Data` inside the WCSession
/// transferUserInfo under `WatchWireKeys.executionResult`.
struct WatchExecutionEnvelope: Codable {
    let assignmentId: String
    let payloadJson: Data             // JSON-encoded WorkoutExecutionPayload (same DTO the phone posts)
    // #23 — the wrist's SHARE decision for a dobles session: true → log jointly
    // (link + share with the partner), false → log solo. Defaulted at finish from
    // the coach's partner_visibility (shared→true, self_only→false) and only the
    // athlete's summary toggle mutates it. Optional so an older watch binary (no
    // field) decodes and the phone falls back to its prior always-joint behavior.
    let shareWithPartner: Bool?
}

// MARK: - Transport keys + limits

/// WCSession dictionary keys. Versioned so a future shape change can coexist with
/// an old watch/phone binary mid-rollout rather than silently mis-decoding.
enum WatchWireKeys {
    static let today = "today_v2"
    static let executionResult = "execution_result_v1"
}

// MARK: - Coders (the single encode/decode contract, shared by both ends)

enum WatchWire {
    /// applicationContext has a ~65 KB practical ceiling; keep the encoded
    /// `WatchTodayPayload` comfortably under it. When the embedded detail pushes
    /// past this, the push drops `detailJson` and the watch falls back to the
    /// summary-only brief (it can still run a minimal session from the title).
    static let maxContextBytes = 60_000

    /// Coder for the WRAPPER payloads (`WatchTodayPayload` / `WatchExecutionEnvelope`)
    /// AND the embedded `WorkoutExecutionPayload`. PLAIN — no key strategy — used
    /// symmetrically on both ends. Deliberately NOT `.convertTo/FromSnakeCase`: that
    /// pair is not a clean inverse for a name like `readinessDelta7d`
    /// (`readiness_delta7d` decodes back to `readinessDelta7D`, silently dropping the
    /// field — the same asymmetry ReadinessService.swift documents). A plain coder
    /// keeps the wrappers' camelCase keys verbatim, and the execution DTO's ALREADY
    /// snake_case property names verbatim (they mirror the backend Zod schema, so the
    /// phone re-submits them through the exact DTO the live finish posts).
    static let encoder = JSONEncoder()
    static let decoder = JSONDecoder()

    /// Coder for the embedded `AssignmentDetail` ONLY. Its camelCase properties are
    /// decoded from a snake_case body via the app-wide `.convertFrom/ToSnakeCase`
    /// strategy (and its two digit-boundary trap keys are pinned with explicit
    /// CodingKeys, so it round-trips cleanly). This is the identical config
    /// `AssignmentDetailCache` uses, so the embedded body is byte-compatible with the
    /// phone's own on-disk cache.
    static let detailEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()
    static let detailDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    /// Remove every `exercise_video_url` from an encoded AssignmentDetail body — the
    /// watch never plays technique video, so the URLs are dead weight against the
    /// applicationContext ceiling. Shape-agnostic (walks the JSON tree, not the Swift
    /// model), and degrades to the original bytes on any serialization hiccup so a
    /// strip failure never blocks the push.
    static func strippingVideoURLs(from detailData: Data) -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: detailData) else { return detailData }
        let pruned = removingKey("exercise_video_url", from: object)
        guard let out = try? JSONSerialization.data(withJSONObject: pruned) else { return detailData }
        return out
    }

    private static func removingKey(_ key: String, from value: Any) -> Any {
        if let dict = value as? [String: Any] {
            var copy: [String: Any] = [:]
            for (k, v) in dict where k != key {
                copy[k] = removingKey(key, from: v)
            }
            return copy
        }
        if let array = value as? [Any] {
            return array.map { removingKey(key, from: $0) }
        }
        return value
    }
}

// MARK: - Display helpers (kept next to the model so both watch views read one source)

extension WatchTodayPayload {
    /// "1h 10m" / "45 min" — the estimated duration, or an em-dash when unknown.
    var durationLabel: String {
        guard let mins = estDurationMinutes, mins > 0 else { return "—" }
        let h = mins / 60
        let m = mins % 60
        if h > 0 { return "\(h)h \(m)m" }
        return "\(m) min"
    }

    /// The intensity label, or an em-dash when none was sent.
    var intensityDisplay: String { intensityLabel ?? "—" }

    /// The activity kind mapped to a HealthKit workout type for the wrist's live
    /// session. Lives HERE (next to the payload) so both the current brief and the
    /// teammate's new views read the same mapping. Mirrors the vocabulary the phone
    /// sends in `activityKind` ("running" | "strength" | "hyrox" | "mixed").
    var healthKitActivityType: HKWorkoutActivityType {
        switch activityKind {
        case "running"?:  return .running
        case "strength"?: return .functionalStrengthTraining
        case "hyrox"?:    return .functionalStrengthTraining
        case "mixed"?:    return .mixedCardio
        default:          return .other
        }
    }

    /// A copy flagged as completed — the watch shows the finished state and the
    /// phone re-pushes this after a watch-originated execution lands. Carries the
    /// completeness ("full" | "partial") so the wrist tells "Sesión completada"
    /// apart from a partial. Everything else (including `detailJson`) is preserved
    /// so the session stays inspectable.
    func markingDone(completeness: String) -> WatchTodayPayload {
        with(isDone: true, doneCompleteness: completeness, detailJson: detailJson)
    }

    /// A copy WITHOUT the embedded detail — the size-cap fallback. The watch still
    /// gets the brief (title / focus / duration / readiness) and runs a minimal
    /// title-only session, re-fetching the full body on next open.
    func droppingDetail() -> WatchTodayPayload {
        with(isDone: isDone, doneCompleteness: doneCompleteness, detailJson: nil)
    }

    private func with(isDone: Bool, doneCompleteness: String?, detailJson: Data?) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: dayKind,
            assignmentId: assignmentId,
            title: title,
            focus: focus,
            estDurationMinutes: estDurationMinutes,
            intensityLabel: intensityLabel,
            activityKind: activityKind,
            athleteHrZones: athleteHrZones,
            readinessScore: readinessScore,
            readinessDelta7d: readinessDelta7d,
            readinessWorstDriver: readinessWorstDriver,
            isDone: isDone,
            doneCompleteness: doneCompleteness,
            isDoubles: isDoubles,
            partnerFirstName: partnerFirstName,
            partnerVisibility: partnerVisibility,
            detailJson: detailJson
        )
    }

    // MARK: - Dobles display helpers (one source, read by brief / done / summary)

    /// Partner's display name, or a neutral fallback. Used in the badge and the
    /// "Compartir con {nombre}" copy.
    var partnerDisplayName: String {
        let trimmed = partnerFirstName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty == false) ? trimmed! : "tu compañero"
    }

    /// The "DOBLES · con {nombre}" badge text, or nil when this isn't a dobles
    /// session (so the badge simply doesn't render).
    var doublesBadgeText: String? {
        guard isDoubles else { return nil }
        return "DOBLES · con \(partnerDisplayName)"
    }

    /// Whether the wrist may offer to SHARE this dobles result with the partner. A
    /// self_only session is private (never shared silently — #22), so the summary
    /// shows no share toggle and logs it solo. Non-dobles → never shareable.
    var isDoublesShareable: Bool {
        isDoubles && partnerVisibility?.lowercased() != "self_only"
    }
}
