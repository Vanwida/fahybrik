import Foundation

// Marcas (#Marcas) — the athlete's self-service benchmark library.
//
// Three doors, one store (the backend's athlete_benchmarks):
//   · coach test → recalibrates the plan (TestsHub, untouched)
//   · Probarme   → one of the 6 marks the APP measures (GPS / belt / PM5)
//   · Registrar  → the Sunday 10K, picked from a synced activity or typed
//
// This service mirrors web/lib/athlete/marks.ts. snake_case ⇄ camelCase via
// APIClient's key strategies. The catalog itself lives SERVER-side — the app
// renders whatever the backend offers, so a new mark never needs an app update.
enum MarksService {
    /// `GET /api/athlete/marks` — the whole library in one read.
    static func fetchMarks(bearer: String?) async throws -> MarksOverview {
        try await APIClient.shared.get(path: "/api/athlete/marks", bearer: bearer)
    }

    /// `POST /api/athlete/marks/attempt` — "Probarme" finished; the app measured it.
    static func submitAttempt(
        slug: String,
        value: Double,
        runContext: String?,
        bearer: String?
    ) async throws -> MarkWriteResult {
        try await APIClient.shared.post(
            path: "/api/athlete/marks/attempt",
            body: AttemptBody(slug: slug, value: value, runContext: runContext),
            bearer: bearer
        )
    }

    /// `GET /api/athlete/marks/register?slug=` — synced runs matching the distance.
    static func fetchCandidates(slug: String, bearer: String?) async throws -> [RegisterCandidate] {
        let resp: CandidatesResponse = try await APIClient.shared.get(
            path: "/api/athlete/marks/register?slug=\(slug)",
            bearer: bearer
        )
        return resp.candidates
    }

    /// `POST /api/athlete/marks/register` — save the race, dated the day it happened.
    static func register(
        slug: String,
        value: Double,
        date: String,
        eventName: String?,
        bearer: String?
    ) async throws -> MarkWriteResult {
        try await APIClient.shared.post(
            path: "/api/athlete/marks/register",
            body: RegisterBody(slug: slug, value: value, date: date, eventName: eventName),
            bearer: bearer
        )
    }
}

private struct AttemptBody: Encodable {
    let slug: String
    let value: Double
    let runContext: String?
}

// Fire-and-forget attempt post for the post-workout save path. Mirrors
// FreeWorkoutAPI: never blocks closing the summary; a transient failure replays
// through the shared RequestQueue, a deterministic 4xx is dropped (replaying a
// rejected value forever would be worse than losing it).
enum MarkAttemptAPI {
    static let path = "/api/athlete/marks/attempt"

    static func submit(slug: String, value: Double, runContext: String?, bearer: String?) async {
        let body = WireBody(slug: slug, value: value, runContext: runContext)
        do {
            try await APIClient.shared.postRaw(path: path, body: body, bearer: bearer)
        } catch {
            let enc = JSONEncoder()
            enc.keyEncodingStrategy = .convertToSnakeCase
            if RequestQueue.isRetriable(error), let encoded = try? enc.encode(body) {
                await RequestQueue.shared.enqueue(path: path, body: encoded, bearer: bearer)
            }
        }
    }

    private struct WireBody: Encodable {
        let slug: String
        let value: Double
        let runContext: String?
    }
}

private struct RegisterBody: Encodable {
    let slug: String
    let value: Double
    let date: String
    let eventName: String?
}

private struct CandidatesResponse: Decodable {
    let candidates: [RegisterCandidate]
}

// MARK: - Models (mirror web/lib/athlete/marks.ts)

struct MarksOverview: Decodable {
    let marks: [MarkView]
}

struct MarkView: Decodable, Identifiable {
    let slug: String
    let label: String
    let group: String          // "run" | "ergo" | "race"
    let measuredBy: String     // "run" | "erg" | "registered"
    let unit: String           // "seconds" | "meters"
    let lowerIsBetter: Bool
    let approxLabel: String
    let erg: String?           // "row" | "ski"
    let targetDistanceM: Double?
    let fixedDurationS: Int?
    let best: MarkResult?
    let latest: MarkResult?
    let bestOutdoor: MarkResult?
    let bestTreadmill: MarkResult?
    let history: [MarkResult]
    let raceTwin: RaceTwin?

    var id: String { slug }
}

struct MarkResult: Decodable, Equatable {
    let value: Double
    let recordedAt: String
    let source: String         // coach_test | athlete_test | registered | onboarding | unknown
    let runContext: String?
    let eventName: String?
}

struct RaceTwin: Decodable, Equatable {
    let seconds: Double
    let raceName: String
    let raceDate: String
}

struct MarkWriteResult: Decodable {
    let isPr: Bool
    let previousBest: Double?
}

struct RegisterCandidate: Decodable, Identifiable {
    let executionId: String
    let startedAt: String
    let distanceM: Double
    let durationS: Int
    let source: String?

    var id: String { executionId }
}

// MARK: - Formatting

// Lo que aquí queda es lo que sabe de una MARCA (unidad, grupo, si baja o sube).
// Cómo se escriben las cifras vive en `Formato` — este fichero tenía su propio
// reloj y su propia grafía del ritmo, y por eso el «/500» salía sin la `m`.
enum MarkFormat {
    /// "3:52" / "1:02:10" — a mark value in its display form.
    static func value(_ mark: MarkView, _ value: Double) -> String {
        if mark.unit == "meters" { return "\(Int(value.rounded())) m" }
        return Formato.clock(value)
    }

    /// The derived pace line under a hero value: run → /km, erg → /500m.
    static func paceLine(_ mark: MarkView, _ value: Double) -> String? {
        guard mark.unit == "seconds", let dist = mark.targetDistanceM, dist > 0 else { return nil }
        if mark.group == "ergo" {
            return Formato.ritmo(value * 500 / dist, .por500m)
        }
        // Carrera y carreras: el ritmo por km se lee mejor que un total en bruto.
        return Formato.ritmo(value * 1000 / dist, .porKm)
    }

    /// "hace 3 semanas" — relative age of a result. Coarse on purpose.
    static func relative(_ iso: String) -> String? {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fmt.date(from: iso) ?? {
            let plain = ISO8601DateFormatter()
            return plain.date(from: iso)
        }()
        guard let date else { return nil }
        let days = max(0, Int(Date().timeIntervalSince(date) / 86_400))
        if days == 0 { return "hoy" }
        if days == 1 { return "ayer" }
        if days < 14 { return "hace \(days) días" }
        if days < 60 { return "hace \(days / 7) semanas" }
        return "hace \(days / 30) meses"
    }

    /// Signed delta vs a previous value ("−5 s", "+120 m"), oriented so green = better.
    static func delta(_ mark: MarkView, from prev: Double, to new: Double) -> (label: String, improved: Bool)? {
        let diff = new - prev
        if abs(diff) < 0.5 { return nil }
        let improved = mark.lowerIsBetter ? diff < 0 : diff > 0
        if mark.unit == "meters" {
            return ("\(diff > 0 ? "+" : "−")\(Int(abs(diff).rounded())) m", improved)
        }
        return ("\(diff > 0 ? "+" : "−")\(Int(abs(diff).rounded())) s", improved)
    }
}
