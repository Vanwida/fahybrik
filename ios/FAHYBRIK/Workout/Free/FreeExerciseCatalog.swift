import Foundation

// MARK: - Entreno libre — exercise catalog (fuerza / funcional)
//
// Fuerza and Funcional build from REAL catalog movements the athlete picks, not
// free text. This is the on-device client for GET /api/athlete/exercises (bearer =
// athlete): a typed row + the fetch + the ES category labels the picker groups by.
// The chosen row also carries the wire `exercise_id` that the free-save `items[]`
// contract needs, and (when present) the movement's own modality, passed through
// to its Prescription so a swing logged as fuerza keeps its true modality.

struct FreeExercise: Codable, Identifiable, Equatable {
    let id: Int
    let name: String
    let slug: String
    let category: String
    /// Canonical modality when the catalog row carries one ("strength" | "functional"
    /// | "row" | …). Optional: many rows are only categorised, not modality-tagged.
    let modality: String?
}

struct FreeExerciseListResponse: Codable {
    let exercises: [FreeExercise]
}

extension FreeExercise {
    /// The row's own `PrescriptionModality` — first the catalog's explicit modality
    /// field, then the category / slug when the row is only section-tagged. A SkiErg
    /// row without `modality: "ski"` must still resolve to `.ski` so a free functional
    /// set can offer the right PM5 slot and the live tramo can route meters to it.
    /// nil → the builder falls back to its section default (.strength / .functional).
    var prescriptionModality: PrescriptionModality? {
        if let modality, !modality.isEmpty,
           let m = PrescriptionModality(rawValue: modality) {
            return m
        }
        switch category.lowercased() {
        case "rowing", "row":           return .row
        case "ski_erg", "ski":          return .ski
        case "bike_erg", "bike":        return .bike
        case "running", "run":          return .run
        case "strength":                return .strength
        case "functional":              return .functional
        case "core":                    return .core
        case "mobility":                return .mobility
        // hyrox_station: Ski/Row/Run ARE machines (shared/domain/exercises/classify.ts
        // modalityForCategory). Wall balls etc. stay functional. Do not return
        // .functional here or the slug/name fallback never runs.
        case "hyrox_station":           break
        default: break
        }
        // Slug + name fallback (e.g. "ski-erg", "HYROX SkiErg", "concept2-rower").
        let haystack = (slug + " " + name).lowercased()
        if haystack.contains("ski") { return .ski }
        if haystack.contains("row") || haystack.contains("remo") { return .row }
        if category.lowercased() != "hyrox_station" {
            // classify.ts: hyrox_station never maps to bike (no official bike station).
            if haystack.contains("bike") || haystack.contains("echo") || haystack.contains("assault") {
                return .bike
            }
        }
        if haystack.contains("run") || haystack.contains("tread") || haystack.contains("cinta")
            || haystack.contains("carrera") {
            return .run
        }
        if category.lowercased() == "hyrox_station" { return .functional }
        return nil
    }

    /// The section this row groups under in the picker — the ES category label.
    var categoryLabelES: String { FreeExerciseCategory.labelES(category) }
}

// MARK: - Category → ES section label
//
// The backend `exercise_category` enum → the natural Spanish section header the
// picker groups by. Mirrors the vocabulary used across the app
// (PreWorkoutBriefView.modalityWord); an unrecognised category degrades to a
// title-cased fallback rather than an English raw value.
enum FreeExerciseCategory {
    static func labelES(_ raw: String) -> String {
        switch raw.lowercased() {
        case "strength":            return "Fuerza"
        case "functional":          return "Funcional"
        case "running":             return "Carrera"
        case "rowing":              return "Remo"
        case "ski_erg":             return "Ski-Erg"
        case "bike_erg":            return "BikeErg"
        case "cardio":              return "Cardio"
        case "core":                return "Core"
        case "mobility":            return "Movilidad"
        case "hyrox_station":       return "Estaciones HYROX"
        case "other":               return "Otros"
        default:
            // Unknown category: title-case the raw token so it still reads cleanly.
            return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// Section ordering weight — the biased-to-strength / biased-to-functional
    /// sections float to the top of their respective picker, everything else after,
    /// alphabetical within a tier. NEVER a hard filter: a swing logged as fuerza
    /// must still be findable, it just sorts below the strength section.
    static func sortWeight(_ raw: String, preferred: String) -> Int {
        let c = raw.lowercased()
        if c == preferred.lowercased() { return 0 }
        switch c {
        case "strength", "functional", "hyrox_station": return 1
        case "core", "mobility": return 2
        default: return 3
        }
    }
}

// MARK: - Catalog fetch
//
// One GET, decoded through APIClient's shared decoder (convertFromSnakeCase). The
// caller debounces the `search`; here we only build the query + return the rows in
// the server's relevance order (category then name) untouched.
enum FreeExerciseCatalogAPI {
    static let path = "/api/athlete/exercises"
    /// The contract's default listing size — enough to browse the whole catalog.
    static let defaultLimit = 300

    static func fetch(search: String?, limit: Int = defaultLimit, bearer: String?) async throws -> [FreeExercise] {
        var items = URLComponents()
        var query: [URLQueryItem] = []
        let trimmed = search?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty { query.append(URLQueryItem(name: "search", value: trimmed)) }
        query.append(URLQueryItem(name: "limit", value: String(limit)))
        items.queryItems = query
        let suffix = items.percentEncodedQuery.map { "?\($0)" } ?? ""
        let resp: FreeExerciseListResponse = try await APIClient.shared.get(path: path + suffix, bearer: bearer)
        return resp.exercises
    }
}

// MARK: - FreeWorkoutItemPayload — one built item on the free-save wire
//
// Shared by fuerza and funcional. `exercise_id` (the catalog row id) + the built
// `Prescription` for that movement, in execution order. Property names are already
// snake_case so the `.convertToSnakeCase` encoder is a no-op on `exercise_id`; the
// nested Prescription's camelCase keys convert to the canonical wire shape as usual.
struct FreeWorkoutItemPayload: Codable, Equatable {
    let exercise_id: Int
    let prescription: Prescription
    /// "warmup" | nil (= principal). Opcional → un servidor viejo lo ignora y un
    /// payload viejo decodifica igual. Marca los ejercicios del calentamiento
    /// para que el coach los lea como calentamiento, no como trabajo.
    var part: String? = nil
}
