import Foundation

// LifecycleService — pausing and leaving, driven by the athlete (#13).
//
// COMPLIANCE NOTE. This does NOT weaken the 3.1.3(b) posture the rest of this
// module keeps: none of these calls touch a purchase surface. They hit OUR API,
// which manages an EXISTING subscription (pause collection, cancel at period
// end). There are no prices, no checkout and no link out — if anything this is
// safer than the Stripe Customer Portal button, because the athlete never leaves
// the app to do the one thing they actually came here to do.
//
// Backend contract (web/app/api/athlete/lifecycle):
//   GET    /api/athlete/lifecycle          → LifecycleState
//   POST   /api/athlete/lifecycle/pause    { reason, return_date, note? }
//   POST   /api/athlete/lifecycle/resume
//   POST   /api/athlete/lifecycle/baja     { reason }
//   DELETE /api/athlete/lifecycle/baja
//
// snake_case JSON ⇄ camelCase Swift handled by APIClient's key strategies.
enum LifecycleService {
    static func fetchState(bearer: String?) async throws -> LifecycleState {
        try await APIClient.shared.get(path: "/api/athlete/lifecycle", bearer: bearer)
    }

    static func pause(
        reason: PauseReason,
        returnDate: String,
        bearer: String?
    ) async throws -> PauseResult {
        try await APIClient.shared.post(
            path: "/api/athlete/lifecycle/pause",
            body: PauseBody(reason: reason.rawValue, returnDate: returnDate),
            bearer: bearer
        )
    }

    static func resume(bearer: String?) async throws {
        let _: StatusOnly = try await APIClient.shared.post(
            path: "/api/athlete/lifecycle/resume",
            body: EmptyBody(),
            bearer: bearer
        )
    }

    static func scheduleBaja(reason: PauseReason, bearer: String?) async throws -> BajaResult {
        try await APIClient.shared.post(
            path: "/api/athlete/lifecycle/baja",
            body: BajaBody(reason: reason.rawValue),
            bearer: bearer
        )
    }

    static func cancelBaja(bearer: String?) async throws {
        let _: StatusOnly = try await APIClient.shared.delete(
            path: "/api/athlete/lifecycle/baja",
            body: EmptyBody?.none,
            bearer: bearer
        )
    }
}

private struct EmptyBody: Encodable {}
private struct PauseBody: Encodable {
    let reason: String
    let returnDate: String
}
private struct BajaBody: Encodable {
    let reason: String
}
private struct StatusOnly: Decodable {
    let status: String?
}

// MARK: - Models

/// Why the athlete is stepping away. Mirrors the closed set in
/// shared/domain/coach/athlete-lifecycle.ts and the DB CHECK (migration 0104).
enum PauseReason: String, CaseIterable, Identifiable {
    case lesion
    case vacaciones
    case paron
    case otro

    var id: String { rawValue }

    var label: String {
        switch self {
        case .lesion:     return "Lesión"
        case .vacaciones: return "Vacaciones"
        case .paron:      return "Parón"
        case .otro:       return "Otro"
        }
    }
}

struct PauseResult: Decodable {
    let status: String
    let days: Int
}

struct BajaResult: Decodable {
    /// ISO day the baja lands (the last day already paid for).
    let scheduledFor: String
    /// true when there was no paid runway and it applied on the spot.
    let appliedNow: Bool
}

/// Everything Perfil › Mi suscripción needs about where the athlete stands.
struct LifecycleState: Decodable, Equatable {
    let status: String // activo | pausado | baja
    let pause: PauseBudget
    let baja: ScheduledBaja
    let billing: BillingSnapshot

    struct PauseBudget: Decodable, Equatable {
        let budgetDays: Int
        let consumedDays: Int
        let availableDays: Int
        /// The day at least one day frees up again. Nil when nothing is spent.
        let renewsOn: String?
        /// While paused: the day they train again.
        let returnsOn: String?
        /// While paused: the day the pause started.
        let since: String?
    }

    struct ScheduledBaja: Decodable, Equatable {
        let scheduledFor: String?
        let daysLeft: Int?
    }

    struct BillingSnapshot: Decodable, Equatable {
        let currentPeriodEnd: String?
        let cancelAtPeriodEnd: Bool
        let collectionPaused: Bool
    }
}

extension LifecycleState {
    var isPaused: Bool { status == "pausado" }
    var hasScheduledBaja: Bool { baja.scheduledFor != nil }
    /// Weeks left, rounded DOWN — never promise a week that isn't fully there.
    var availableWeeks: Int { pause.availableDays / 7 }
}

// MARK: - Dates

/// ISO `YYYY-MM-DD` ⇄ display, in the athlete's own calendar. These days are
/// calendar days, not instants: parsing them as UTC and rendering them locally
/// is what makes a pause "end yesterday" for someone in the wrong timezone.
enum LifecycleDate {
    static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Madrid")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return isoFormatter.date(from: iso)
    }

    static func iso(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    /// "1 de septiembre" — how a person says a date out loud.
    static func long(_ iso: String?) -> String? {
        guard let date = parse(iso) else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.timeZone = TimeZone(identifier: "Europe/Madrid")
        out.dateFormat = "d 'de' MMMM"
        return out.string(from: date)
    }

    /// Whole days between two ISO days, or nil if either fails to parse.
    static func days(from: String, to: String) -> Int? {
        guard let a = parse(from), let b = parse(to) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: a, to: b).day
    }
}
