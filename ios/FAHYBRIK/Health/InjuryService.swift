import Foundation

// Athlete injury self-report (#16). The athlete registers a molestia/lesión, sees
// their open injuries + history, and reports evolution (recovering / resolved)
// with a note their coach reads. Powered by:
//   GET   /api/athlete/injuries          → { injuries: [AthleteInjury] }  (open first, each w/ timeline)
//   POST  /api/athlete/injuries          → { injury: AthleteInjury }      (registered_by = 'athlete')
//   PATCH /api/athlete/injuries/[id]      → { injury: AthleteInjury }      (status transition + note)
//
// Wire is snake_case; APIClient's decoder uses `.convertFromSnakeCase`, so the
// snake_case keys map to these camelCase properties automatically (NO pinned
// CodingKeys). Dates (`onset_date`, `resolved_date`, `expected_return`) and
// timestamps (`updated_at`, `recorded_at`) are decoded as raw String and parsed
// defensively (ZoneDateParser): decoding a bare `YYYY-MM-DD` as `Date` under the
// client's ISO-8601 date strategy would take the whole payload down — a String
// never does. The domain enums, labels and state machine mirror the canonical
// shared/domain/coach/injury-taxonomy.ts — the SINGLE source of truth server-side.

// MARK: - Canonical taxonomy (mirrors shared/domain/coach/injury-taxonomy.ts)

/// The 11 canonical injury zones. `rawValue` is the exact wire value; declaration
/// order is the canonical display order (INJURY_ZONES).
enum InjuryZone: String, CaseIterable, Codable, Identifiable, Hashable {
    case rodilla
    case tobilloPie = "tobillo_pie"
    case lumbar
    case cadera
    case hombro
    case muneca
    case codo
    case isquios
    case gemelo
    case cuello
    case otra

    var id: String { rawValue }

    /// ES label (INJURY_ZONE_LABEL).
    var label: String {
        switch self {
        case .rodilla:    return "Rodilla"
        case .tobilloPie: return "Tobillo / pie"
        case .lumbar:     return "Lumbar"
        case .cadera:     return "Cadera"
        case .hombro:     return "Hombro"
        case .muneca:     return "Muñeca"
        case .codo:       return "Codo"
        case .isquios:    return "Isquios"
        case .gemelo:     return "Gemelo"
        case .cuello:     return "Cuello"
        case .otra:       return "Otra"
        }
    }
}

/// Severity — how bad it is right now. An axis SEPARATE from status.
enum InjurySeverity: String, CaseIterable, Codable, Identifiable, Hashable {
    case leve
    case moderada
    case severa

    var id: String { rawValue }

    /// ES label (INJURY_SEVERITY_LABEL).
    var label: String {
        switch self {
        case .leve:     return "Leve"
        case .moderada: return "Moderada"
        case .severa:   return "Severa"
        }
    }
}

/// Lifecycle status — where the episode is in its recovery. An axis SEPARATE from
/// severity. Carries the canonical state machine (mirrors INJURY_STATUSES +
/// TRANSITIONS + isOpen + canTransition).
enum InjuryStatus: String, CaseIterable, Codable, Identifiable, Hashable {
    case activa
    case enRecuperacion = "en_recuperacion"
    case resuelta

    var id: String { rawValue }

    /// ES label (INJURY_STATUS_LABEL).
    var label: String {
        switch self {
        case .activa:         return "Activa"
        case .enRecuperacion: return "En recuperación"
        case .resuelta:       return "Resuelta"
        }
    }

    /// A status that still limits training (drives the "Activas" section).
    var isOpen: Bool { self == .activa || self == .enRecuperacion }

    /// Valid next statuses from here (TRANSITIONS). `resuelta` is terminal for
    /// THIS episode — a relapse is a NEW injury row, never a self-transition.
    var allowedTransitions: [InjuryStatus] {
        switch self {
        case .activa:         return [.enRecuperacion, .resuelta]
        case .enRecuperacion: return [.activa, .resuelta] // can flare back to activa
        case .resuelta:       return []
        }
    }

    /// True when `to` is a valid transition from `self`. Self-transitions are
    /// rejected (matches canTransition in the taxonomy).
    func canTransition(to: InjuryStatus) -> Bool {
        guard self != to else { return false }
        return allowedTransitions.contains(to)
    }
}

// MARK: - Wire DTOs (read)

/// One injury episode + its evolution timeline. `registeredBy` / `recordedBy`
/// stay raw strings ('athlete' | 'coach') — display-only attribution that can
/// never fail to decode.
struct AthleteInjury: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let zone: InjuryZone
    let type: String?
    let severity: InjurySeverity
    let status: InjuryStatus
    let onsetDate: String            // "YYYY-MM-DD"
    let resolvedDate: String?        // set when status → resuelta
    let expectedReturn: String?      // coach estimate (read-only for the athlete)
    let registeredBy: String         // "athlete" | "coach"
    let note: String?                // the original report note
    let pauseId: String?
    let updatedAt: String            // ISO timestamp (kept as String)
    /// Evolution entries, chronological (oldest → newest). Lossy: one malformed
    /// entry is dropped, never the whole injury.
    @LossyArray var updates: [AthleteInjuryUpdate]

    /// True when the athlete may still report evolution on this episode.
    var isOpen: Bool { status.isOpen }

    /// Whoever registered the episode was the coach.
    var registeredByCoach: Bool { registeredBy == "coach" }
}

/// One evolution entry. `status` is non-null ONLY when this entry changed the
/// status; a note-only update carries `status == nil`.
struct AthleteInjuryUpdate: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let status: InjuryStatus?
    let note: String?
    let recordedBy: String           // "athlete" | "coach"
    let recordedAt: String           // ISO timestamp (kept as String)

    var recordedByCoach: Bool { recordedBy == "coach" }
}

// MARK: - Wire bodies (write)

/// POST body — the athlete self-reports a new episode. `zone`/`severity` encode
/// to their rawValue; `onset_date` is ALWAYS sent (defaults to today in the UI)
/// so the server's NOT-NULL `onset_date` never receives a bare null. `type` is
/// intentionally omitted — the athlete describes it in the free `note` instead.
/// Nil `note` is omitted by the synthesized encoder (encodeIfPresent).
struct InjuryCreateBody: Encodable {
    let zone: InjuryZone
    let severity: InjurySeverity
    let onsetDate: String            // → "onset_date"
    let note: String?                // → "note" (omitted when nil)
}

/// PATCH body — the athlete reports evolution: an optional status transition and/
/// or a note. At least one must be present (server refine); the UI enforces it.
/// Both encode via encodeIfPresent, so a nil field is omitted from the JSON.
struct InjuryUpdateBody: Encodable {
    let status: InjuryStatus?        // omitted when nil
    let note: String?                // omitted when nil
}

// MARK: - Response envelopes

// Internal (not private) so the wire-contract unit tests can decode the real
// envelopes, including the @LossyArray tolerance.
struct InjuriesResponse: Decodable {
    /// Lossy: one malformed injury (e.g. an unknown enum) is dropped, the rest
    /// still render — a single bad row never blanks the whole screen.
    @LossyArray var injuries: [AthleteInjury]
}

struct InjuryResponse: Decodable {
    let injury: AthleteInjury
}

// MARK: - Service

enum InjuryService {
    /// The athlete's own injuries (open first), each with its timeline.
    static func fetch(bearer: String) async throws -> [AthleteInjury] {
        let resp: InjuriesResponse = try await APIClient.shared.get(
            path: "api/athlete/injuries",
            bearer: bearer
        )
        return resp.injuries
    }

    /// Self-report a new injury episode → returns the created row (registered_by
    /// = 'athlete', stamped server-side).
    @discardableResult
    static func report(bearer: String, body: InjuryCreateBody) async throws -> AthleteInjury {
        let resp: InjuryResponse = try await APIClient.shared.post(
            path: "api/athlete/injuries",
            body: body,
            bearer: bearer
        )
        return resp.injury
    }

    /// Report evolution on an existing episode (status transition + note). The
    /// state machine is validated server-side (an invalid transition → 409). The
    /// `id` is the numeric injury id as returned by the DTO.
    @discardableResult
    static func update(bearer: String, id: String, body: InjuryUpdateBody) async throws -> AthleteInjury {
        let resp: InjuryResponse = try await APIClient.shared.patch(
            path: "api/athlete/injuries/\(id)",
            body: body,
            bearer: bearer
        )
        return resp.injury
    }
}

// MARK: - Date helpers

/// Human date/duration copy for injury surfaces. Reuses the module's
/// `ZoneDateParser` (accepts ISO-8601 OR a bare `YYYY-MM-DD`, formats es-ES) so
/// there is one date-parsing path, and degrades to "" on an unparseable value
/// rather than guessing.
enum InjuryDateText {
    /// A lowercase "since" phrase for a row subtitle, e.g. "desde hace 3 días".
    /// Composed with the status label as "Activa · desde hace 3 días".
    static func since(_ onsetDate: String, now: Date = Date()) -> String {
        guard let d = ZoneDateParser.parse(onsetDate) else { return "" }
        let cal = Calendar.current
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: now)).day ?? 0
        switch days {
        case ..<0:      return "programada para el \(ZoneDateParser.display(d))"
        case 0:         return "desde hoy"
        case 1:         return "desde ayer"
        case 2...45:    return "desde hace \(days) días"
        default:        return "desde el \(ZoneDateParser.display(d))"
        }
    }

    /// Short es-ES date ("21 jul 2026") from a wire date/timestamp, or nil when
    /// absent/unparseable — never guessed.
    static func shortDate(_ raw: String?) -> String? {
        guard let raw, let d = ZoneDateParser.parse(raw) else { return nil }
        return ZoneDateParser.display(d)
    }

    /// Encodes a `Date` to the wire `YYYY-MM-DD` (en_US_POSIX, local calendar).
    static func wireDate(_ date: Date) -> String { wireFormatter.string(from: date) }

    private static let wireFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
