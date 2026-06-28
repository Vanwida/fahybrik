import Foundation
import Observation

// MARK: - Slice
//
// One cache-first / stale-while-revalidate slice of shared app data.
//
//   • `value`         — the last known payload. Nil until the first load; for
//                       endpoints whose empty state is itself a value (readiness
//                       has no score yet), nil ALSO means "loaded, nothing
//                       there" — use `hasLoaded` to tell the two apart.
//   • `loadedAt`      — timestamp of the last SUCCESSFUL fetch (drives staleness
//                       + the "have we ever loaded?" check).
//   • `isRevalidating`— a transient in-flight flag. Intentionally NOT persisted
//                       (always false on a fresh launch).
//
// The generic value must be Codable so a slice can be written to disk verbatim
// (offline-first), reusing the same UserDefaults pattern as AssignmentDetailCache
// and CarrerasHistoryStore — one mechanism, not a parallel one.
struct Slice<Value: Codable>: Codable {
    private(set) var value: Value?
    private(set) var loadedAt: Date?
    var isRevalidating: Bool = false

    /// Whether a successful load has ever completed (distinguishes "never
    /// fetched" from "fetched, legitimately empty" — e.g. no readiness yet).
    var hasLoaded: Bool { loadedAt != nil }

    /// Age in seconds since the last successful load; nil when never loaded.
    func age(now: Date = Date()) -> TimeInterval? {
        loadedAt.map { now.timeIntervalSince($0) }
    }

    /// Record a successful load. `newValue` may be nil for an honest-empty result
    /// (the load still counts — `hasLoaded` flips true).
    mutating func setLoaded(_ newValue: Value?, at date: Date = Date()) {
        value = newValue
        loadedAt = date
    }

    // isRevalidating is omitted on purpose so it never persists.
    private enum CodingKeys: String, CodingKey { case value, loadedAt }
}

// MARK: - AppDataStore
//
// The single shared, in-memory data layer for the authenticated app. Created
// once by AppShell and injected via `.environment`, so it SURVIVES tab switches:
// Inicio / Plan / Perfil read their data from these slices and re-render
// instantly from memory instead of each owning local @State that re-fetches (and
// spins) every time its tab is recreated.
//
// Behaviour per slice = cache-first + stale-while-revalidate (SWR):
//   1. A view renders from `slice.value` immediately when present (no spinner).
//   2. The store silently revalidates in the background when the slice is older
//      than `staleAfter` (or on an explicit `force` after a mutation) and swaps
//      in the fresh value if it changed.
//   3. The whole store is persisted to disk so a cold launch — even offline —
//      opens with the last athlete's data.
//
// Scope: PHASE 1 holds exactly what Inicio / Plan / Perfil share — identity,
// the current weekly plan, macro progress, today's readiness, the coach thread
// (unread count), the Dobles partner envelope, and the subscription snapshot.
// Chat history, APIClient-level request de-dup and richer offline are PHASE 2.
@MainActor
@Observable
final class AppDataStore {

    // Shared, cross-tab slices.
    var identity = Slice<AthleteIdentity>()                 // /auth/me           — Inicio, Perfil
    var planWeek = Slice<AthletePlanWeekResponse>()         // /plan/week (offset 0) — Inicio, Plan, Perfil(coach)
    var macroProgress = Slice<AthleteMacroProgressResponse>() // /macro-progress  — Inicio week tile
    var readiness = Slice<DailyReadinessPayload>()          // /readiness/today   — Inicio
    var chatThread = Slice<ChatThreadDTO>()                 // /chat/threads      — Inicio (unread)
    var partner = Slice<PartnerEnvelope>()                  // /athlete/partner   — Inicio, Plan, Perfil
    var subscription = Slice<SubscriptionInfo>()            // /stripe/subscription — Perfil

    /// Unread coach messages (0 when none / not loaded). Single source so every
    /// surface (bell dot, coach-note row) agrees.
    var unreadCount: Int { max(0, chatThread.value?.unreadForAthlete ?? 0) }

    /// The bearer this in-memory data belongs to. Slices are cleared / rescoped
    /// when it changes (sign-out, athlete switch) so one athlete never sees
    /// another's cached data.
    private(set) var bearer: String?

    /// A slice older than this is silently revalidated on the next access; a
    /// fresher one is served straight from memory with NO network — this is what
    /// makes rapid tab switching free. Mutations bypass it via `force: true`.
    private let staleAfter: TimeInterval = 30

    // MARK: Session scoping

    /// Point the store at `bearer`. Same bearer → no-op (the data stays warm).
    /// A new bearer hydrates from disk when the persisted snapshot belongs to it
    /// (offline-first), otherwise starts empty and purges a stranger's blob.
    /// Call from AppShell on appear + whenever the bearer changes.
    func activate(bearer: String?) {
        guard bearer != self.bearer else { return }
        self.bearer = bearer

        guard let bearer else {
            clearSlices()
            AppDataPersistence.clear()
            return
        }

        if let snapshot = AppDataPersistence.load(),
           snapshot.fingerprint == AppDataPersistence.fingerprint(of: bearer) {
            identity = snapshot.identity
            planWeek = snapshot.planWeek
            macroProgress = snapshot.macroProgress
            readiness = snapshot.readiness
            chatThread = snapshot.chatThread
            partner = snapshot.partner
            subscription = snapshot.subscription
        } else {
            // Different (or no) prior session on disk — start clean.
            clearSlices()
            AppDataPersistence.clear()
        }
    }

    private func clearSlices() {
        identity = .init()
        planWeek = .init()
        macroProgress = .init()
        readiness = .init()
        chatThread = .init()
        partner = .init()
        subscription = .init()
    }

    // MARK: Grouped loads (cache-first render is automatic; these revalidate)
    //
    // Each groups the slices a screen needs and revalidates them CONCURRENTLY.
    // They're throttled (staleAfter) + de-duped (isRevalidating), so calling them
    // on every tab appear is cheap and won't refetch fresh data.

    /// Warm everything once so any tab opens instantly. Called by AppShell.
    func warm(force: Bool = false) async {
        async let i: Void = refreshIdentity(force: force)
        async let p: Void = refreshPlanWeek(force: force)
        async let m: Void = refreshMacroProgress(force: force)
        async let r: Void = refreshReadiness(force: force)
        async let c: Void = refreshChatThread(force: force)
        async let pa: Void = refreshPartner(force: force)
        async let s: Void = refreshSubscription(force: force)
        _ = await (i, p, m, r, c, pa, s)
    }

    /// Inicio: identity, plan, macro progress, readiness, coach thread, partner.
    func loadHome(force: Bool = false) async {
        async let i: Void = refreshIdentity(force: force)
        async let p: Void = refreshPlanWeek(force: force)
        async let m: Void = refreshMacroProgress(force: force)
        async let r: Void = refreshReadiness(force: force)
        async let c: Void = refreshChatThread(force: force)
        async let pa: Void = refreshPartner(force: force)
        _ = await (i, p, m, r, c, pa)
    }

    /// Plan: the current week + the partner (for the "Con [X]" badges).
    func loadPlanScreen(force: Bool = false) async {
        async let p: Void = refreshPlanWeek(force: force)
        async let pa: Void = refreshPartner(force: force)
        _ = await (p, pa)
    }

    /// Perfil: identity, partner, subscription, plus the week (for the coach name).
    func loadProfile(force: Bool = false) async {
        async let i: Void = refreshIdentity(force: force)
        async let p: Void = refreshPlanWeek(force: force)
        async let pa: Void = refreshPartner(force: force)
        async let s: Void = refreshSubscription(force: force)
        _ = await (i, p, pa, s)
    }

    /// The plan changed (workout completed, day moved, target race fixed) — pull
    /// the plan-derived slices fresh, bypassing the staleness window so every tab
    /// reflects it at once.
    func planMutated() async {
        async let p: Void = refreshPlanWeek(force: true)
        async let m: Void = refreshMacroProgress(force: true)
        _ = await (p, m)
    }

    // MARK: Per-slice revalidation

    func refreshIdentity(force: Bool = false) async {
        await revalidate(get: { self.identity }, set: { self.identity = $0 }, force: force) {
            try await MeService.fetch(bearer: $0)
        }
    }

    func refreshPlanWeek(force: Bool = false) async {
        await revalidate(get: { self.planWeek }, set: { self.planWeek = $0 }, force: force) {
            try await PlanService.fetchWeek(bearer: $0)
        }
    }

    func refreshMacroProgress(force: Bool = false) async {
        await revalidate(get: { self.macroProgress }, set: { self.macroProgress = $0 }, force: force) {
            try await PlanService.fetchMacroProgress(bearer: $0)
        }
    }

    func refreshReadiness(force: Bool = false) async {
        // ReadinessService returns nil for an honest empty state — recorded as a
        // successful load with no value (hasLoaded stays true).
        await revalidate(get: { self.readiness }, set: { self.readiness = $0 }, force: force) {
            try await ReadinessService.fetchToday(bearer: $0)
        }
    }

    func refreshChatThread(force: Bool = false) async {
        await revalidate(get: { self.chatThread }, set: { self.chatThread = $0 }, force: force) {
            try await ChatService.fetchThread(bearer: $0)
        }
    }

    func refreshPartner(force: Bool = false) async {
        await revalidate(get: { self.partner }, set: { self.partner = $0 }, force: force) {
            try await PartnerService.fetchEnvelope(bearer: $0)
        }
    }

    func refreshSubscription(force: Bool = false) async {
        await revalidate(get: { self.subscription }, set: { self.subscription = $0 }, force: force) {
            try await SubscriptionService.fetchSubscription(bearer: $0)
        }
    }

    /// Optimistically replace the locally-known identity (e.g. right after the
    /// athlete saves their profile) so every screen reflects it immediately, and
    /// persist. No network — the PATCH already returned the canonical row.
    func setIdentity(_ newValue: AthleteIdentity) {
        identity.setLoaded(newValue)
        persist()
    }

    // MARK: - Core SWR engine
    //
    // One implementation of cache-first + stale-while-revalidate, shared by every
    // slice (DRY): respect the staleness window unless forced, de-dupe concurrent
    // loads, keep the last good value on error (silent), and drop a response if
    // the session changed mid-flight.
    private func revalidate<V>(
        get: () -> Slice<V>,
        set: (Slice<V>) -> Void,
        force: Bool,
        fetch: (String) async throws -> V?
    ) async {
        guard let bearer else { return }

        let slice = get()
        // Fresh enough → serve straight from memory, no network.
        if !force, let age = slice.age(), age < staleAfter { return }
        // Already revalidating → let the in-flight load win (unless forced).
        if !force, slice.isRevalidating { return }

        var started = get()
        started.isRevalidating = true
        set(started)

        do {
            let value = try await fetch(bearer)
            guard bearer == self.bearer else { return }   // session changed mid-flight
            var done = get()
            done.setLoaded(value)
            done.isRevalidating = false
            set(done)
            persist()
        } catch {
            guard bearer == self.bearer else { return }
            // SWR: keep the last good value; just clear the in-flight flag.
            var done = get()
            done.isRevalidating = false
            set(done)
        }
    }

    // MARK: - Persistence

    private func persist() {
        guard let bearer else { return }
        let snapshot = AppDataPersistence.Snapshot(
            fingerprint: AppDataPersistence.fingerprint(of: bearer),
            identity: identity,
            planWeek: planWeek,
            macroProgress: macroProgress,
            readiness: readiness,
            chatThread: chatThread,
            partner: partner,
            subscription: subscription
        )
        AppDataPersistence.save(snapshot)
    }
}

// MARK: - Disk persistence
//
// Single-blob, bearer-scoped snapshot of the store on UserDefaults — the same
// lightweight pattern as AssignmentDetailCache / CarrerasHistoryStore, so the app
// opens with the last athlete's data even offline. A self-consistent plain JSON
// coder (no snake_case, no custom date strategy) round-trips the slices: we own
// both ends, so the models' camelCase CodingKeys + default date encoding match on
// the way back. The fingerprint scopes the blob to its owning session so a
// different athlete never sees stale data.
enum AppDataPersistence {
    struct Snapshot: Codable {
        let fingerprint: String
        var identity: Slice<AthleteIdentity>
        var planWeek: Slice<AthletePlanWeekResponse>
        var macroProgress: Slice<AthleteMacroProgressResponse>
        var readiness: Slice<DailyReadinessPayload>
        var chatThread: Slice<ChatThreadDTO>
        var partner: Slice<PartnerEnvelope>
        var subscription: Slice<SubscriptionInfo>
    }

    private static let key = "fahybrik.appDataStore.v1"

    static func load() -> Snapshot? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    static func save(_ snapshot: Snapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    /// Deterministic, non-reversible fingerprint of a bearer (FNV-1a) so the
    /// persisted blob is scoped to its session WITHOUT writing the token to a
    /// second key. Deterministic across launches (unlike `hashValue`, which is
    /// per-run randomized), which is required for the scope check to hold.
    static func fingerprint(of bearer: String) -> String {
        var hash: UInt64 = 1469598103934665603        // FNV-1a offset basis
        for byte in bearer.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1099511628211              // FNV-1a prime
        }
        return String(hash, radix: 16)
    }
}
