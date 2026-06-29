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
// — one mechanism, not a parallel one.
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
// Scope: PHASE 1 holds what Inicio / Plan / Perfil share — identity, the current
// weekly plan, macro progress, today's readiness, the coach thread (unread
// count), the Dobles partner envelope, and the subscription snapshot. The
// CARRERAS tab is now folded in too — the unified races hub (upcoming objectives
// + past results), the race-context overview, and the live training analytics —
// so it opens instantly from the same store/SWR/disk machinery (and its imported
// history lives here, not in a separate cache). The CHAT tab is folded in as well
// — its message history is cached here (the thread envelope already was), so the
// conversation renders instantly on open and the SSE stream layers live updates
// on top. APIClient-level request de-dup and richer offline are PHASE 2.
@MainActor
@Observable
final class AppDataStore {

    // Shared, cross-tab slices.
    var identity = Slice<AthleteIdentity>()                 // /auth/me           — Inicio, Perfil
    var planWeek = Slice<AthletePlanWeekResponse>()         // /plan/week (offset 0) — Inicio, Plan, Perfil(coach)
    var macroProgress = Slice<AthleteMacroProgressResponse>() // /macro-progress  — Inicio week tile
    var readiness = Slice<DailyReadinessPayload>()          // /readiness/today   — Inicio
    var strengthMaxes = Slice<[StrengthMaxProfile]>()       // /benchmarks        — Inicio ("Tu progreso") + Perfil
    var runningAnalysis = Slice<RunningAnalysis>()          // /running-analysis  — Inicio ("Tu progreso · carrera") + Carreras
    var chatThread = Slice<ChatThreadDTO>()                 // /chat/threads      — Inicio (unread) + Chat (coach identity)
    var chatMessages = Slice<[ChatMessageDTO]>()            // /chat/threads/me/messages — Chat (message history)
    var partner = Slice<PartnerEnvelope>()                  // /athlete/partner   — Inicio, Plan, Perfil
    var subscription = Slice<SubscriptionInfo>()            // /stripe/subscription — Perfil

    // Carreras-tab slices. The races hub is the single source of truth for both
    // the PRÓXIMAS (upcoming objectives) and PASADAS (imported history) lists —
    // and the single on-disk cache for that history. The overview powers the
    // PASADAS race-derived analytics; analytics powers the RENDIMIENTO section.
    var racesHub = Slice<RacesHubResponse>()                // /athlete/races        — Carreras (upcoming + past)
    var raceOverview = Slice<CarrerasOverview>()            // /athlete/race-context — Carreras (PASADAS analytics)
    var analytics = Slice<AthleteAnalytics>()               // /athlete/analytics    — Carreras (RENDIMIENTO)

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
            strengthMaxes = snapshot.strengthMaxes
            runningAnalysis = snapshot.runningAnalysis
            chatThread = snapshot.chatThread
            chatMessages = snapshot.chatMessages
            partner = snapshot.partner
            subscription = snapshot.subscription
            racesHub = snapshot.racesHub
            raceOverview = snapshot.raceOverview
            analytics = snapshot.analytics
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
        strengthMaxes = .init()
        runningAnalysis = .init()
        chatThread = .init()
        chatMessages = .init()
        partner = .init()
        subscription = .init()
        racesHub = .init()
        raceOverview = .init()
        analytics = .init()
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
        async let sm: Void = refreshStrengthMaxes(force: force)
        async let ra: Void = refreshRunningAnalysis(force: force)
        async let c: Void = refreshChatThread(force: force)
        async let pa: Void = refreshPartner(force: force)
        async let s: Void = refreshSubscription(force: force)
        _ = await (i, p, m, r, sm, ra, c, pa, s)
    }

    /// Inicio: identity, plan, macro progress, readiness, the running analysis +
    /// strength maxes (the "Tu progreso · carrera" proof), coach thread, partner.
    func loadHome(force: Bool = false) async {
        async let i: Void = refreshIdentity(force: force)
        async let p: Void = refreshPlanWeek(force: force)
        async let m: Void = refreshMacroProgress(force: force)
        async let r: Void = refreshReadiness(force: force)
        async let sm: Void = refreshStrengthMaxes(force: force)
        async let ra: Void = refreshRunningAnalysis(force: force)
        async let c: Void = refreshChatThread(force: force)
        async let pa: Void = refreshPartner(force: force)
        _ = await (i, p, m, r, sm, ra, c, pa)
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

    /// Carreras: the unified races hub (upcoming + past), the race-context
    /// overview (PASADAS analytics) and the live training analytics (RENDIMIENTO).
    func loadCarreras(force: Bool = false) async {
        async let r: Void = refreshRacesHub(force: force)
        async let o: Void = refreshRaceOverview(force: force)
        async let a: Void = refreshAnalytics(force: force)
        _ = await (r, o, a)
    }

    /// Chat: the message history (cache-first render) + the thread envelope (coach
    /// identity + unread count). Both revalidate concurrently through the same SWR
    /// engine, so opening the tab is instant from cache and silently refreshes.
    func loadChat(force: Bool = false) async {
        async let m: Void = refreshChatMessages(force: force)
        async let t: Void = refreshChatThread(force: force)
        _ = await (m, t)
    }

    /// The plan changed (workout completed, day moved, target race fixed) — pull
    /// the plan-derived slices fresh, bypassing the staleness window so every tab
    /// reflects it at once.
    func planMutated() async {
        async let p: Void = refreshPlanWeek(force: true)
        async let m: Void = refreshMacroProgress(force: true)
        _ = await (p, m)
    }

    /// A Carreras mutation happened — an objective was set / promoted to primary /
    /// removed, or the imported history was imported / undone. Re-pull every
    /// race-derived slice fresh: the hub (both lists), the race-context overview
    /// (last race + benchmarks + evolution) AND the weekly plan, since the chosen
    /// target race drives Inicio's main countdown. Force bypasses the staleness
    /// window so the whole app reflects the change at once. Training analytics are
    /// NOT race-derived, so they're left to their own revalidation.
    func racesMutated() async {
        async let r: Void = refreshRacesHub(force: true)
        async let o: Void = refreshRaceOverview(force: true)
        async let p: Void = refreshPlanWeek(force: true)
        _ = await (r, o, p)
    }

    /// Optimistically fold a fresh full-history import into the races hub so the
    /// PASADAS list updates INSTANTLY — the import-all response is the freshest,
    /// most complete history (with partners / team-vs-individual), richer than a
    /// follow-up `/races` round-trip. Keeps the current upcoming list untouched
    /// and persists. Pass `[]` to optimistically clear the history on an undo.
    /// A follow-up `racesMutated()` then reconciles with the server.
    func applyImportedRaces(_ races: [ImportedRace]) {
        let upcoming = racesHub.value?.upcoming ?? []
        racesHub.setLoaded(RacesHubResponse(upcoming: upcoming, past: races))
        persist()
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

    func refreshStrengthMaxes(force: Bool = false) async {
        await revalidate(get: { self.strengthMaxes }, set: { self.strengthMaxes = $0 }, force: force) {
            try await StrengthService.fetch(bearer: $0)
        }
    }

    func refreshRunningAnalysis(force: Bool = false) async {
        // Throwing fetch so a failed revalidation keeps the last-good analysis
        // (SWR / offline-first). The endpoint returns honest nulls/empties when a
        // signal is missing, so a successful load with no 5k still counts.
        await revalidate(get: { self.runningAnalysis }, set: { self.runningAnalysis = $0 }, force: force) {
            try await CarrerasService.fetchRunningAnalysisThrowing(bearer: $0)
        }
    }

    func refreshChatThread(force: Bool = false) async {
        await revalidate(get: { self.chatThread }, set: { self.chatThread = $0 }, force: force) {
            try await ChatService.fetchThread(bearer: $0)
        }
    }

    func refreshChatMessages(force: Bool = false) async {
        // Throwing fetch so a failed revalidation keeps the last good history
        // (SWR / offline-first), instead of nil wiping the cached conversation.
        await revalidate(get: { self.chatMessages }, set: { self.chatMessages = $0 }, force: force) {
            try await ChatService.fetchMessages(bearer: $0)
        }
    }

    /// Fold a single canonical message — an SSE delivery or the athlete's own
    /// CONFIRMED send — into the cached history: id-deduped (update in place if we
    /// already have it, else append) and kept oldest-first, then persist. Keeps the
    /// next open instant and offline showing the latest exchange without a full
    /// refetch. Optimistic / still-sending local rows never reach here — only the
    /// server-canonical DTO does — so the disk cache mirrors server truth.
    func appendChatMessage(_ message: ChatMessageDTO) {
        var list = chatMessages.value ?? []
        if let idx = list.firstIndex(where: { $0.id == message.id }) {
            list[idx] = message
        } else {
            list.append(message)
        }
        list.sort { $0.createdAt < $1.createdAt }
        chatMessages.setLoaded(list)
        persist()
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

    func refreshRacesHub(force: Bool = false) async {
        // Throwing fetch so a failed revalidation keeps the last good hub (SWR /
        // offline-first), instead of the non-throwing wrapper's nil wiping it.
        await revalidate(get: { self.racesHub }, set: { self.racesHub = $0 }, force: force) {
            try await CarrerasService.fetchRacesThrowing(bearer: $0)
        }
    }

    func refreshRaceOverview(force: Bool = false) async {
        await revalidate(get: { self.raceOverview }, set: { self.raceOverview = $0 }, force: force) {
            try await CarrerasService.fetchOverviewThrowing(bearer: $0)
        }
    }

    func refreshAnalytics(force: Bool = false) async {
        // StatsService.fetchAnalytics already throws on failure (and returns an
        // honest-empty AthleteAnalytics when there's simply no data), so it slots
        // straight into the SWR engine.
        await revalidate(get: { self.analytics }, set: { self.analytics = $0 }, force: force) {
            try await StatsService.fetchAnalytics(bearer: $0)
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
            strengthMaxes: strengthMaxes,
            runningAnalysis: runningAnalysis,
            chatThread: chatThread,
            chatMessages: chatMessages,
            partner: partner,
            subscription: subscription,
            racesHub: racesHub,
            raceOverview: raceOverview,
            analytics: analytics
        )
        AppDataPersistence.save(snapshot)
    }
}

// MARK: - Disk persistence
//
// Single-blob, bearer-scoped snapshot of the store on UserDefaults — the same
// lightweight pattern as AssignmentDetailCache, so the app opens with the last
// athlete's data even offline. A self-consistent plain JSON
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
        var strengthMaxes: Slice<[StrengthMaxProfile]>
        var runningAnalysis: Slice<RunningAnalysis>
        var chatThread: Slice<ChatThreadDTO>
        var chatMessages: Slice<[ChatMessageDTO]>
        var partner: Slice<PartnerEnvelope>
        var subscription: Slice<SubscriptionInfo>
        var racesHub: Slice<RacesHubResponse>
        var raceOverview: Slice<CarrerasOverview>
        var analytics: Slice<AthleteAnalytics>
    }

    // v5 adds the Inicio running-analysis slice ("Tu progreso · carrera"). v4
    // added the biometric-trend + strength-maxes slices and the readiness
    // breakdown; v3 the Chat message-history slice (v2 the Carreras slices). An
    // older blob has a different shape, so its decode simply fails (→ start clean,
    // refetch on launch) — no migration code, no stale-shape risk.
    private static let key = "fahybrik.appDataStore.v5"

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
