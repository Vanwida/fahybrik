import Foundation

// Athlete pace zones from GET /api/athlete/zones (athlete Bearer auth).
//
// Returns the athlete's CURRENT (highest-version) zone profile per modality —
// the absolute pace bands resolved once on test entry and stored server-side
// (read, never recomputed). AGNOSTIC: every label / color / code comes from the
// coach's stored snapshot, so the iOS surface renders the coach's vocabulary,
// never a hardcoded zone scheme.
//
// APIClient's decoder uses `convertFromSnakeCase`, so snake_case wire fields
// (`modality_label`, `pace_unit_label`, `threshold_s`, `range_label`, …) map to
// these camelCase properties automatically. `recordedAt` is decoded as a raw
// String and parsed defensively (mirrors StatsDateParser): the value is an ISO
// timestamp, but decoding it as `Date` would, on any unexpected shape, take the
// whole payload down — a String never does.

struct AthleteZonesResponse: Decodable {
    let modalities: [ZoneModalityProfile]
    /// The five HEART-RATE bands, resolved server-side (see `HRZoneProfile`).
    /// Nil = the athlete has no HR zones yet; the screen says so and offers the
    /// test that creates them. The app never derives them from a max HR.
    let hr: HRZoneProfile?
}

/// Both axes of an athlete's zones, as one answer. Kept together because the
/// screen shows them together and because a caller that got one and not the
/// other would be describing half the athlete.
struct AthleteZones {
    let modalities: [ZoneModalityProfile]
    let hr: HRZoneProfile?
}

/// One modality's zone profile (run → /km, row/ski/bike → /500m).
struct ZoneModalityProfile: Decodable, Identifiable {
    var id: String { modality }
    let modality: String
    let modalityLabel: String
    let paceUnit: String          // "per_km" | "per_500m"
    let paceUnitLabel: String     // "/km" | "/500m"
    /// The test result that produced these zones (threshold = Z4 lower bound),
    /// seconds per `paceUnit`. Nil only if the profile predates threshold storage.
    let thresholdS: Double?
    let sourceTestSlug: String?
    let version: Int?
    let recordedAt: String?       // ISO timestamp; parsed defensively below.
    /// The resolved bands, easiest → hardest (already sorted by the backend).
    let zones: [ZoneBand]

    /// Human "20 jun 2026" from `recordedAt`. Nil when absent/unparseable —
    /// never guessed.
    var recordedDateLabel: String? {
        guard let recordedAt, let date = ZoneDateParser.parse(recordedAt) else { return nil }
        return ZoneDateParser.display(date)
    }

    /// The threshold pace formatted with its unit, e.g. "3:55/km". Nil when no
    /// threshold is stored.
    var thresholdLabel: String? {
        guard let thresholdS, thresholdS > 0 else { return nil }
        return "\(Formato.ritmoCifras(Double(Int(thresholdS.rounded()))))\(paceUnitLabel)"
    }
}

/// One absolute pace band — a single coach zone with its ready-to-render range.
struct ZoneBand: Decodable, Identifiable {
    var id: String { code }
    let code: String              // "Z1" … "Z6" (coach data)
    let label: String             // human zone name (coach data)
    let color: String?            // hex (coach data) — agnostic, may be absent
    let role: String?             // semantic role (coach data), e.g. "threshold"
    let sortOrder: Int
    let fastS: Double
    let slowS: Double?
    let rangeLabel: String        // "4:00–4:14/km", "> 2:17/500m"
}

enum ZonesService {
    /// Both axes in one call: the pace bands per modality and the HR bands.
    static func fetch(bearer: String) async throws -> AthleteZones {
        let resp: AthleteZonesResponse = try await APIClient.shared.get(
            path: "api/athlete/zones",
            bearer: bearer
        )
        return AthleteZones(modalities: resp.modalities, hr: resp.hr)
    }

    /// Self-enter a test result → POST /api/athlete/test-result. The backend
    /// resolves the 6 zone bands through the SAME path the coach test uses
    /// (resolveZonesForAthlete + insertZoneProfileVersion, source='athlete_test')
    /// and stores a new versioned profile, so a re-fetch reflects it immediately.
    /// `thresholdS` = the umbral pace in seconds per the modality's unit
    /// (run → /km, row/ski/bike → /500m).
    static func submitTest(
        modality: String,
        thresholdS: Int,
        bearer: String
    ) async throws {
        // Explicit snake_case keys to match the backend zod schema (the encoder's
        // convertToSnakeCase is then a no-op and field names can't desync).
        struct Body: Encodable {
            let modality: String
            let threshold_s: Int
        }
        struct Resp: Decodable {
            struct Profile: Decodable { let version: Int }
            let profile: Profile
        }
        let _: Resp = try await APIClient.shared.post(
            path: "api/athlete/test-result",
            body: Body(modality: modality, threshold_s: thresholdS),
            bearer: bearer
        )
    }
}

// Local, defensive date parsing for the zone profile `recorded_at`. Accepts an
// ISO-8601 timestamp (with or without fractional seconds) or a bare YYYY-MM-DD,
// and formats to a short Spanish date. Kept self-contained so a malformed value
// degrades to "no date" rather than failing the decode.
enum ZoneDateParser {
    static func parse(_ raw: String) -> Date? {
        if let d = ISO8601DateFormatters.parse(raw) { return d }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd"
        return fmt.date(from: String(raw.prefix(10)))
    }

    static func display(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES")
        fmt.dateFormat = "d MMM yyyy"
        return fmt.string(from: date)
    }
}
