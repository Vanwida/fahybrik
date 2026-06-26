import Foundation

// hyresult.com full-history import — the NEW Carreras import flow.
//
// The athlete SEARCHES their name (GET /race-results/search) → picks their
// profile from candidates → confirms → we import their ENTIRE history
// (individual AND doubles/relay) via POST /race-results/import-all. This file
// owns the wire Codable models, the typed CarrerasService methods, the
// Spanish-localized errors, the local rich-history cache, and the display
// helpers the history UI reads. The race-derived overview contract lives in
// CarrerasService.swift; this is the import/search concern, kept separate.
//
// Snake_case property names + explicit CodingKeys mirror the file convention:
// APIClient decodes with `.convertFromSnakeCase`, which rewrites each wire key
// to camelCase BEFORE matching the CodingKey, so every multi-word property maps
// to its post-conversion form. Single-word keys match as-is. The CodingKey raw
// values (camelCase) ALSO make the cache round-trip deterministic under a plain
// JSON coder (no key strategy) — encode/decode both speak the raw values.

// MARK: - Search candidate

/// One athlete candidate from the hyresult name search — the disambiguation row.
/// `races_count` is the number of races on their profile; nation + level
/// (PRO/ELITE) help tell namesakes apart before importing a stranger's history.
struct HyresultCandidate: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
    /// Race count on the profile, e.g. 6 → "6 carreras".
    let races_count: Int
    /// IOC nation code, e.g. "ESP". Nil when the source omits it.
    let nation: String?
    /// "PRO" / "ELITE" or nil. Surfaced as a small chip.
    let level: String?

    // `.convertFromSnakeCase` rewrites `races_count` → `racesCount` before
    // matching; the rest are single-word keys and match as-is.
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case slug
        case races_count = "racesCount"
        case nation
        case level
    }
}

/// `GET /api/athlete/race-results/search` envelope.
struct HyresultSearchResponse: Codable {
    let candidates: [HyresultCandidate]
}

// MARK: - Imported race (full-history contract)

/// A teammate on a doubles/relay race, as stored + returned by import-all.
struct ImportedPartner: Codable, Hashable, Identifiable {
    /// Position within the team (1-based) — stable id for the list.
    let position: Int
    let name: String
    let slug: String?
    let nation: String?

    var id: Int { position }
}

/// One station split (canonical 16-station index). `seconds`/`rank` are nullable
/// in the source. For doubles/relay these are TEAM-level — never the athlete's
/// individual time (see `ImportedRace.is_team_result`).
struct ImportedStationSplit: Codable, Hashable, Identifiable {
    /// Canonical station index (2,4,…,16 for work stations).
    let index: Int
    let seconds: Int?
    let rank: Int?

    var id: Int { index }
}

/// One imported race from the athlete's full hyresult history. Decodes the live
/// `import-all` response (shared/schema `hyresultImportedRaceSchema`). `race_id`
/// arrives as a JSON NUMBER (the numeric `races.id`). `race_date` is the REAL
/// race date "YYYY-MM-DD" OR null when the source couldn't determine one — never
/// a fabricated placeholder. `is_team_result` is DERIVED from `format` — the wire
/// never carries it.
struct ImportedRace: Codable, Hashable, Identifiable {
    let race_id: Int
    /// Event name, e.g. "HYROX Barcelona".
    let name: String
    /// REAL race date "YYYY-MM-DD" (date_start), or nil when the source can't
    /// determine a date — never a fabricated placeholder.
    let race_date: String?
    /// "hyrox" | "deka" | "other".
    let event_type: String
    /// "singles" | "doubles" | "relay" — also encodes team vs individual.
    let format: String
    /// "open" | "pro" | "elite".
    let division: String
    /// "men" | "women" | "mixed".
    let gender_category: String
    /// Team bracket for doubles/relay (NOT the athlete's true age); nullable.
    let age_group: String?
    /// Finish time in seconds.
    let result_time_seconds: Int
    let run_total_seconds: Int?
    let roxzone_seconds: Int?
    let best_run_lap_seconds: Int?
    let overall_rank: Int?
    let age_group_rank: Int?
    /// Up to 8 run laps (seconds), ordered run 1..8.
    let run_splits: [Int]
    /// Up to 8 station splits (canonical index).
    let station_splits: [ImportedStationSplit]
    /// Teammates for doubles/relay; [] for singles.
    let partners: [ImportedPartner]

    var id: Int { race_id }

    enum CodingKeys: String, CodingKey {
        case race_id = "raceId"
        case name
        case race_date = "raceDate"
        case event_type = "eventType"
        case format
        case division
        case gender_category = "genderCategory"
        case age_group = "ageGroup"
        case result_time_seconds = "resultTimeSeconds"
        case run_total_seconds = "runTotalSeconds"
        case roxzone_seconds = "roxzoneSeconds"
        case best_run_lap_seconds = "bestRunLapSeconds"
        case overall_rank = "overallRank"
        case age_group_rank = "ageGroupRank"
        case run_splits = "runSplits"
        case station_splits = "stationSplits"
        case partners
    }
}

/// `POST /api/athlete/race-results/import-all` response. `races` is the COMPLETE
/// history (every race, newly inserted OR refreshed), most-recent order not
/// guaranteed — the UI sorts by date.
struct HyresultImportAllResult: Codable, Hashable {
    /// Newly inserted rows.
    let imported: Int
    /// Refreshed-in-place rows.
    let updated: Int
    let races: [ImportedRace]
}

// MARK: - Display helpers
//
// One source of truth for how an imported race reads in the UI: format/division
// labels, the team-vs-individual flag, the partner line, and pre-formatted
// times. Times reuse StatsFormat so the whole app formats durations identically.

extension ImportedRace {
    /// True for doubles/relay — splits + age_group are TEAM-level, not the
    /// athlete's individual performance. THE flag the history UI keys off so a
    /// shared time is never shown as the athlete's own.
    var is_team_result: Bool { format.lowercased() != "singles" }

    /// "Dobles" / "Relay" tag for team races; nil for singles (which render plain).
    var formatTag: String? {
        switch format.lowercased() {
        case "doubles": return "Dobles"
        case "relay":   return "Relay"
        default:        return nil
        }
    }

    /// Division label, e.g. "Pro" / "Open" / "Elite".
    var divisionLabel: String {
        switch division.lowercased() {
        case "open":  return "Open"
        case "pro":   return "Pro"
        case "elite": return "Elite"
        default:      return division.capitalized
        }
    }

    /// Non-HYROX event tag ("DEKA") for the rare imported non-HYROX result; nil
    /// for HYROX so the common case stays clean.
    var eventTypeTag: String? {
        switch event_type.lowercased() {
        case "hyrox": return nil
        case "deka":  return "DEKA"
        default:      return event_type.uppercased()
        }
    }

    /// "con Eric Vaqué" / "con Eric Vaqué y Ana Pérez" — the teammate line for
    /// doubles/relay. Nil for singles or when no teammate is known.
    var partnersLabel: String? {
        let names = partners
            .sorted { $0.position < $1.position }
            .map { $0.name.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !names.isEmpty else { return nil }
        if names.count == 1 { return "con \(names[0])" }
        let head = names.dropLast().joined(separator: ", ")
        return "con \(head) y \(names.last!)"
    }

    /// Total finish time, pre-formatted "H:MM:SS" / "MM:SS".
    var totalTimeText: String { StatsFormat.duration(Double(result_time_seconds)) }

    var runTotalText: String? { run_total_seconds.map { StatsFormat.duration(Double($0)) } }
    var roxzoneText: String? { roxzone_seconds.map { StatsFormat.duration(Double($0)) } }

    /// Whole-second integer → "MM:SS" lap/station caption.
    static func splitText(_ seconds: Int?) -> String {
        guard let seconds else { return "—" }
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    /// "2 nov 2024" — day + month + year, Spanish. When the source carries no
    /// date (null) reads "Fecha por confirmar"; falls back to the raw string if a
    /// present value doesn't parse (never invents a date).
    var dateText: String {
        guard let raw = race_date else { return "Fecha por confirmar" }
        guard let d = StatsDateParser.parse(raw) else { return raw }
        return ImportedRaceDateFormat.medium.string(from: d)
    }

    /// Sort key for "most recent first" — the parsed date, or distantPast so a
    /// null/unparseable date sinks to the bottom rather than jumping the list.
    var sortDate: Date {
        guard let raw = race_date else { return .distantPast }
        return StatsDateParser.parse(raw) ?? .distantPast
    }
}

/// Shared medium date formatter ("2 nov 2024"), Spanish. Instantiating a
/// DateFormatter is comparatively expensive, so reuse one.
enum ImportedRaceDateFormat {
    static let medium: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d MMM yyyy"
        return f
    }()
}

// MARK: - Service (CarrerasService import/search methods)

extension CarrerasService {
    /// Search hyresult athletes by name → candidate list to disambiguate before
    /// importing. `GET /api/athlete/race-results/search?q=<name>`. The query is
    /// trimmed + percent-encoded; the server requires ≥2 chars (we guard too, so
    /// a 1-char query never round-trips). Throws `HyresultSearchError` with a
    /// readable Spanish message on auth / upstream / transport failure.
    static func searchAthletes(query: String, bearer: String?) async throws -> [HyresultCandidate] {
        guard let bearer else { throw HyresultSearchError.unauthorized }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { return [] }
        let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        do {
            let resp: HyresultSearchResponse = try await APIClient.shared.get(
                path: "api/athlete/race-results/search?q=\(encoded)",
                bearer: bearer
            )
            return resp.candidates
        } catch let error as APIError {
            throw HyresultSearchError(apiError: error)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw HyresultSearchError.unavailable
        }
    }

    /// Import an athlete's FULL hyresult history (singles + doubles/relay) by the
    /// slug of the candidate they picked. `POST /api/athlete/race-results/import-all`
    /// with `{ slug }`. Idempotent per (athlete, source_idp): re-running refreshes.
    /// Returns the complete imported history (+ inserted/updated counts) so the hub
    /// can render it immediately. Throws `HyresultImportError` on failure.
    static func importAllRaces(slug: String, bearer: String?) async throws -> HyresultImportAllResult {
        guard let bearer else { throw HyresultImportError.unauthorized }
        do {
            return try await APIClient.shared.post(
                path: "api/athlete/race-results/import-all",
                body: HyresultImportAllBody(slug: slug),
                bearer: bearer
            )
        } catch let error as APIError {
            throw HyresultImportError(apiError: error)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw HyresultImportError.unreachable
        }
    }
}

/// Request body for import-all. `slug` is all-lowercase with hyphens, so
/// `.convertToSnakeCase` emits it verbatim (no case boundary), matching the
/// server's `hyresultImportAllInput` Zod schema.
private struct HyresultImportAllBody: Encodable {
    let slug: String
}

// MARK: - Errors (Spanish, athlete-readable)

/// Failure for the name search. Maps the server `error.code` + transport
/// failures to one honest Spanish message — never a raw status code.
enum HyresultSearchError: Error {
    case unauthorized
    case unavailable
    case generic

    init(apiError: APIError) {
        switch apiError {
        case .offline:
            self = .unavailable
        case .invalidResponse, .decoding:
            self = .generic
        case let .http(status, _):
            switch status {
            case 401: self = .unauthorized
            case 502, 503, 504: self = .unavailable
            default:  self = .generic
            }
        }
    }

    var message: String {
        switch self {
        case .unauthorized:
            return "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo."
        case .unavailable:
            return "No pudimos conectar con la búsqueda. Revisa tu conexión e inténtalo de nuevo en un momento."
        case .generic:
            return "No se pudo buscar. Inténtalo de nuevo."
        }
    }
}

/// Failure for the full-history import. Keys off the server `error.code`
/// (parse_failed → unreadable, upstream → unreachable) and transport failures.
enum HyresultImportError: Error {
    case unauthorized
    case unreachable
    case unreadable
    case generic

    init(apiError: APIError) {
        switch apiError {
        case .offline:
            self = .unreachable
        case .invalidResponse, .decoding:
            self = .generic
        case let .http(status, data):
            let code = Self.errorCode(from: data)
            switch (status, code) {
            case (401, _):
                self = .unauthorized
            case (422, _), (_, "parse_failed"):
                self = .unreadable
            case (502, _), (503, _), (504, _), (_, "search_failed"), (_, "fetch_failed"):
                self = .unreachable
            default:
                self = .generic
            }
        }
    }

    var message: String {
        switch self {
        case .unauthorized:
            return "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo."
        case .unreachable:
            return "No pudimos conectar para importar tu historial. Revisa tu conexión e inténtalo de nuevo en un momento."
        case .unreadable:
            return "No pudimos leer tu historial. Vuelve a intentarlo; si sigue fallando, prueba con otro perfil."
        case .generic:
            return "No se pudo importar tu historial. Inténtalo de nuevo."
        }
    }

    private static func errorCode(from data: Data) -> String? {
        struct Envelope: Decodable { struct Inner: Decodable { let code: String? }; let error: Inner? }
        return (try? JSONDecoder().decode(Envelope.self, from: data))?.error?.code
    }
}

// MARK: - Local rich-history cache
//
// import-all returns the athlete's COMPLETE rich history (with partners +
// team-vs-individual), but the race-context overview the hub loads on launch is
// the leaner projection (no partners/format). To keep the doubles-aware history
// across launches without a new backend read, we persist the last import-all
// races locally (single slot — Sign in with Apple is one athlete per device) and
// seed the history section from it on load. A plain JSON coder round-trips via
// the models' CodingKey raw values; never throws into the UI (failure → empty).
enum CarrerasHistoryStore {
    private static let key = "fahybrik.carreras.importedRaces"

    static func load() -> [ImportedRace] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([ImportedRace].self, from: data)) ?? []
    }

    static func save(_ races: [ImportedRace]) {
        guard let data = try? JSONEncoder().encode(races) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
