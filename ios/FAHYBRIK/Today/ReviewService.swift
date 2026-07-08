import Foundation

// Recurring 1:1 coach↔athlete reviews (#21), athlete side. A "revisión" is a 30-min
// video call the coach PROPOSES from the athlete's ficha; the athlete then reserves
// a slot in the app (auto-accepted + Google Meet). This service is the athlete's
// window onto that flow: read the review state, list the offered slots, book one.
//
// DECODING CONVENTION: the app's APIClient decodes with
// `keyDecodingStrategy = .convertFromSnakeCase` (see APIClient.makeJSONDecoder),
// so the wire stays snake_case (`requested_start`, `duration_minutes`, `meet_link`,
// `proposal_pending`, `next_review`, …) and the camelCase properties below bridge
// 1:1 — NO explicit CodingKeys, mirroring PlanService / DoblesService. ISO instant
// fields (`requested_start`, slot `start`) are decoded as Strings and formatted at
// render time in the box timezone, never as `Date` (so the custom date strategy is
// irrelevant here).

// MARK: - Models

/// A reserved review appointment (the athlete's "próxima sesión con el coach").
/// Wire `GET /api/athlete/review .next_review` and `POST …/book .appointment`.
struct AthleteReviewAppointment: Decodable, Hashable {
    let id: String
    /// ISO instant (UTC) of the call start. Formatted in the box timezone for display.
    let requestedStart: String
    /// Call length in minutes (fixed 30 in v1, but read from the wire — never assumed).
    let durationMinutes: Int
    /// 'pendiente' | 'aceptada'. An athlete-booked review is auto-accepted.
    let status: String
    /// Google Meet URL, or nil when the meeting couldn't be created yet (best-effort
    /// server-side — the coach pastes it manually, so the athlete sees a pending note).
    let meetLink: String?
}

/// The athlete's review state. Only `nextReview` and `proposalPending` drive the
/// Today surface; `cadence` / `lastReviewAt` / `due` are decoded for completeness
/// (the coach owns the cadence + the "due" nudge — the athlete acts on a PROPOSAL).
struct AthleteReviewState: Decodable {
    let cadence: String
    let lastReviewAt: String?
    let nextReview: AthleteReviewAppointment?
    let proposalPending: Bool
    let due: Bool
}

/// One bookable slot. `start` is the ISO instant sent back verbatim on booking;
/// `time` is the box wall-clock label ("HH:MM") the server already formatted; `ms`
/// is the epoch-ms stable key. Mirrors shared/domain/citas/slots.ts `Slot`.
struct ReviewSlot: Decodable, Identifiable, Hashable {
    let start: String
    let ms: Int
    let time: String
    var id: Int { ms }
}

/// A day's worth of slots. Mirrors shared/domain/citas/slots.ts `DaySlots`.
struct ReviewDaySlots: Decodable, Identifiable, Hashable {
    /// ISO 'YYYY-MM-DD' (box calendar date).
    let date: String
    /// 0=Sun … 6=Sat.
    let weekday: Int
    let slots: [ReviewSlot]
    var id: String { date }
}

/// Wire envelope of `GET /api/athlete/review/slots`.
private struct ReviewSlotsResponse: Decodable {
    let slots: [ReviewDaySlots]
}

/// Result of `POST /api/athlete/review/book` — the confirmed appointment + its Meet.
struct BookReviewResult: Decodable {
    let appointment: AthleteReviewAppointment
    let meetLink: String?
}

// MARK: - Service

enum ReviewService {
    /// The athlete's review state (cadence, last, next reserved, proposal pending,
    /// due). Returns nil (→ the Today card renders nothing) when there is no bearer
    /// or on any transient error — an honest quiet empty, never fabricated state.
    /// Decoding uses APIClient's `convertFromSnakeCase`, so the wire stays snake_case.
    static func fetchState(bearer: String?) async -> AthleteReviewState? {
        guard let bearer, !bearer.isEmpty else { return nil }
        do {
            return try await APIClient.shared.get(path: "api/athlete/review", bearer: bearer)
        } catch {
            return nil
        }
    }

    /// The slots offered for the athlete to reserve their review. THROWS so the
    /// picker can tell a transient failure (→ retry state) apart from a genuinely
    /// empty offer (`[]` → "Pablo te escribirá para cuadrar la llamada"). An empty
    /// result means "no availability", per the slot engine's contract.
    static func fetchSlots(bearer: String?) async throws -> [ReviewDaySlots] {
        let resp: ReviewSlotsResponse = try await APIClient.shared.get(
            path: "api/athlete/review/slots",
            bearer: bearer
        )
        return resp.slots
    }

    /// Reserve the review in a slot. `requestedStart` is the slot's ISO instant sent
    /// back verbatim (the server re-verifies it against a freshly-generated slot set —
    /// never trusts the client). Encoded with APIClient's `convertToSnakeCase`, so the
    /// body is `{ "requested_start": "…" }` (matches the strict `bookReviewInput` Zod).
    /// Throws `APIError.http(409, …)` when the slot was taken meanwhile / the athlete
    /// already has a review — the caller maps these to athlete-facing copy.
    static func book(requestedStart: String, bearer: String?) async throws -> BookReviewResult {
        struct Body: Encodable {
            let requestedStart: String   // → requested_start (snake_case encoder)
        }
        return try await APIClient.shared.post(
            path: "api/athlete/review/book",
            body: Body(requestedStart: requestedStart),
            bearer: bearer
        )
    }
}

// MARK: - Date formatting (box timezone, single source of truth)
//
// Reviews live on the box's clock (Europe/Madrid — the same BOX_TIMEZONE the slot
// engine uses), so the CONFIRMED time reads the exact wall-clock the athlete
// picked, even if their phone is in another timezone. ISO instants are parsed with
// the app's shared `ISO8601DateFormatters` (handles fractional + plain seconds).
enum ReviewDateFormat {
    /// The box's canonical timezone — matches shared/domain/dates.ts BOX_TIMEZONE.
    static let boxTimeZone = TimeZone(identifier: "Europe/Madrid")

    /// "Lunes 14 jul · 18:00" from an ISO instant, in the box timezone. Nil when the
    /// instant is unparseable (caller keeps a raw fallback).
    static func longDateTime(fromISO iso: String) -> String? {
        guard let date = ISO8601DateFormatters.parse(iso) else { return nil }
        return capitalizedString(from: date, format: "EEEE d MMM · HH:mm")
    }

    /// "Lun 14 · 18:00" — the compact selected-slot label for the confirm button.
    static func shortDateTime(fromISO iso: String) -> String? {
        guard let date = ISO8601DateFormatters.parse(iso) else { return nil }
        return capitalizedString(from: date, format: "EEE d · HH:mm")
    }

    /// "Lunes 14 jul" day header from a bare "YYYY-MM-DD" box calendar date. Falls
    /// back to the raw string when unparseable.
    static func dayHeader(fromISODate iso: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEE d MMM"
        return capitalize(out.string(from: date))
    }

    private static func capitalizedString(from date: Date, format: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = boxTimeZone
        f.dateFormat = format
        return capitalize(f.string(from: date))
    }

    private static func capitalize(_ raw: String) -> String {
        raw.isEmpty ? raw : raw.prefix(1).uppercased() + raw.dropFirst()
    }
}
