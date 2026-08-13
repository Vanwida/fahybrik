import Foundation

// ANALYTICS wire. Talks to the section + drill-down endpoints (shipped backend
// commit 76f4875):
//   GET /api/athlete/analytics/sections/{section}?period=&from=&to=  → AnalyticsSection
//   GET /api/athlete/analytics/drilldown?kind=&period=&<params>      → DrillDownResult
//
// Both bearer-auth, snake_case (decoded camelCase via APIClient's
// keyDecodingStrategy). Each section carries honest availability tags + DrillRefs
// whose `count` is the real source-row count; the drill-down re-runs the SAME
// window and returns the exact rows that produced the number.
enum AnalyticsService {

    /// One section for a PERIOD. Throwing so AppDataStore's SWR engine keeps the
    /// last-good cached section on a failed revalidation (offline-first).
    static func fetchSection(
        _ section: AnalyticsSectionKey,
        period: AnalyticsPeriod,
        erg: ErgScope? = nil,
        bearer: String
    ) async throws -> AnalyticsSection {
        // `erg` scopes the ergo section (Remo · SkiErg · BikeErg); ignored by the
        // server for every other section, so it's harmless to omit elsewhere.
        var path = "api/athlete/analytics/sections/\(section.rawValue)?\(period.query)"
        if let erg { path += "&erg=\(erg.rawValue)" }
        return try await APIClient.shared.get(path: path, bearer: bearer)
    }

    /// ¿ESTOY MEJORANDO? — la pantalla entera de carrera en UNA llamada.
    ///
    /// No es una sección más: aquélla enumera métricas en tarjetas y ésta da UN
    /// veredicto con la evidencia que lo sostiene. Y viene junta a propósito —
    /// veredicto, cobertura y los umbrales con los que se decidió salen del mismo
    /// instante; pedirlos por separado dejaría que dos respuestas se contradijeran
    /// en pantalla.
    static func fetchRunningProgress(
        weeks: Int? = nil,
        bearer: String
    ) async throws -> RunningProgressPayload {
        var path = "api/athlete/analytics/running/progress"
        if let weeks { path += "?weeks=\(weeks)" }
        return try await APIClient.shared.get(path: path, bearer: bearer)
    }

    /// LAS ANALÍTICAS DEL ATLETA, COMPLETAS — carga, capacidad y recuperación en
    /// UNA llamada, como una LISTA de lecturas con su cobertura y su procedencia.
    ///
    /// Viene junta a propósito: la coherencia entre las tres familias la decide el
    /// servidor, y pedirlas por separado permitiría que dos respuestas de
    /// instantes distintos se contradijeran en la misma pantalla.
    ///
    /// No sustituye a `fetchRunningProgress`: aquélla contesta «¿estoy mejorando?»
    /// sobre correr y ésta contesta cuánto llevas encima y cómo lo estás
    /// asimilando. Son dos preguntas, y cada una tiene su motor.
    static func fetchLecturas(
        weeks: Int? = nil,
        bearer: String
    ) async throws -> AnaliticasAtleta {
        var path = "api/athlete/analytics/lecturas"
        if let weeks { path += "?weeks=\(weeks)" }
        return try await APIClient.shared.get(path: path, bearer: bearer)
    }

    /// The source rows behind a tapped aggregate. Re-sends the card's DrillRef
    /// (kind + params) with the SAME period. Param KEYS are snake-cased back (the
    /// snake-case-converting decoder may have camelCased `race_id` → `raceId`); the
    /// endpoint whitelists snake_case, so this keeps the round-trip exact. Returns
    /// nil on no-bearer / request failure / 404 so the sheet shows an honest empty.
    static func fetchDrillDown(
        _ drill: DrillRef,
        period: AnalyticsPeriod,
        bearer: String?
    ) async -> DrillDownResult? {
        guard let bearer else { return nil }
        var query = "kind=\(encode(drill.kind))&\(period.query)"
        for (key, value) in drill.params {
            query += "&\(snakeCase(key))=\(encode(value))"
        }
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/analytics/drilldown?\(query)",
                bearer: bearer
            )
        } catch {
            return nil
        }
    }

    // MARK: - Helpers

    /// camelCase → snake_case, idempotent on already-snake input: "raceId" →
    /// "race_id", "race_id" → "race_id", "type" → "type". Reverses the decoder's
    /// possible key conversion regardless of whether it happened.
    private static func snakeCase(_ s: String) -> String {
        var out = ""
        for ch in s {
            if ch.isUppercase {
                out += "_"
                out += ch.lowercased()
            } else {
                out.append(ch)
            }
        }
        return out
    }

    /// Percent-encode a query value (param values are short, safe strings server-
    /// side, but a stray reserved character must not break the URL).
    private static func encode(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
    }
}
