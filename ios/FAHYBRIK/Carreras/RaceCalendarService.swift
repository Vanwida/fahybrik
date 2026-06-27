import Foundation

// Networking for the "Buscar carrera" target-race flow. Mirrors the typed
// service style of HyresultImport.swift: builds the calendar query string,
// posts the chosen target, and removes it. Errors map to one honest Spanish
// message (RaceTargetError) — never a raw status code.
//
// Endpoints (athlete Bearer):
//   GET    /api/races/calendar            → RaceCalendarResponse
//   POST   /api/athlete/races/target      → SetTargetRaceResponse
//   DELETE /api/athlete/races/target/:id  → 204/{deleted:true} | 404
enum RaceCalendarService {

    /// Fetch the race calendar, optionally narrowed by series / country / search
    /// text / date window. Returns nil on any failure (caller shows an honest
    /// error/retry state) — the search field treats nil distinctly from an empty
    /// `events` array (which is a real "no matches" result).
    static func fetchCalendar(
        bearer: String?,
        series: String? = nil,
        country: String? = nil,
        q: String? = nil,
        from: String? = nil,
        to: String? = nil
    ) async -> RaceCalendarResponse? {
        guard let bearer else { return nil }

        var items: [String] = []
        func add(_ key: String, _ value: String?) {
            guard let value, !value.isEmpty else { return }
            let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
            items.append("\(key)=\(encoded)")
        }
        add("series", series)
        add("country", country)
        add("q", q)
        add("from", from)
        add("to", to)

        let path = items.isEmpty
            ? "api/races/calendar"
            : "api/races/calendar?\(items.joined(separator: "&"))"

        return try? await APIClient.shared.get(path: path, bearer: bearer)
    }

    /// Fix the athlete's target race. Throws `RaceTargetError` with a readable
    /// Spanish message on failure.
    static func setTarget(bearer: String?, body: SetTargetRaceBody) async throws -> SetTargetRaceResponse {
        guard let bearer else { throw RaceTargetError.unauthorized }
        do {
            return try await APIClient.shared.post(
                path: "api/athlete/races/target",
                body: body,
                bearer: bearer
            )
        } catch let error as APIError {
            throw RaceTargetError(apiError: error)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw RaceTargetError.generic
        }
    }

    /// Remove a target race by its `races.id` (the `raceId` returned from
    /// `setTarget`, NOT the event id). Throws `RaceTargetError` on failure
    /// (incl. `.notFound` for a 404).
    static func removeTarget(bearer: String?, raceId: String) async throws {
        guard let bearer else { throw RaceTargetError.unauthorized }
        do {
            let _: Empty = try await APIClient.shared.delete(
                path: "api/athlete/races/target/\(raceId)",
                body: Empty(),
                bearer: bearer
            )
        } catch let error as APIError {
            throw RaceTargetError(apiError: error)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw RaceTargetError.generic
        }
    }
}

// MARK: - Error (Spanish, athlete-readable)

/// Failure for set/remove target. Maps transport + HTTP status to one honest
/// Spanish message — never a raw status code.
enum RaceTargetError: Error {
    case unauthorized
    case notFound
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
            case 401:           self = .unauthorized
            case 404:           self = .notFound
            case 502, 503, 504: self = .unavailable
            default:            self = .generic
            }
        }
    }

    var message: String {
        switch self {
        case .unauthorized:
            return "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo."
        case .notFound:
            return "Esta carrera ya no está disponible. Actualiza y prueba con otra."
        case .unavailable:
            return "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo en un momento."
        case .generic:
            return "No se pudo guardar tu carrera. Inténtalo de nuevo."
        }
    }
}
