import Foundation
import Observation

@Observable
final class AuthState {
    enum Stage {
        case unauthenticated
        case onboarding
        case authenticated
    }

    var stage: Stage = .unauthenticated
    var bearer: String? = nil
    var athleteId: String? = nil

    /// Day-1 first-run flow (#17). Per-athlete: false → show the guided day-1
    /// (welcome + connect Health + tests preview + weekly-loop) once, before the
    /// shell; true → straight to the app. Funnel athletes arrive already
    /// onboarded (`onboarded_at` set at alta) but day1Completed=false, so day-1 is
    /// their first-open orientation. Questionnaire-completers (the no-funnel
    /// fallback) are marked done in `finishOnboarding()` — they already got a full
    /// onboarding. Defaults true so we never flash day-1 before a session loads.
    var day1Completed: Bool = true
    /// Resume point if the athlete closes the app mid-day-1.
    var day1Step: Int = 0

    /// Invite-only access gate. `nil` = not yet checked (show a loader, never
    /// the app); `true` = no active access → show the invite-only gate;
    /// `false` = active access → let the athlete into the app. We do NOT
    /// persist this — it is re-derived from the subscription endpoint on every
    /// launch / sign-in so a lapsed athlete gets gated again.
    var accessGated: Bool? = nil

    /// Whether the athlete has a coach (tier COACHED) — `false` = the self-serve
    /// FREE tier, which flips the app to the free surface (no chat, no coach
    /// copy, free home). Seeded from the login response (`has_coach`, additive)
    /// and re-derived from the subscription endpoint's `tier` on every
    /// `refreshAccess()`, so getting/losing a coach propagates on next launch.
    /// Persisted; defaults to `true` for sessions saved before the field existed
    /// (all of them coached) so today's athletes see zero change.
    var hasCoach: Bool = true

    /// AUDIT-B1 — the bearer now lives in the Keychain (KeychainTokenStore); callers that
    /// need it read `KeychainTokenStore.shared.read()`, never UserDefaults.
    private static let athleteKey = "fahybrik.athleteId"
    private static let stageKey = "fahybrik.stage"
    private static let hasCoachKey = "fahybrik.hasCoach"
    private static func day1Key(_ athleteId: String) -> String { "fahybrik.day1_completed.\(athleteId)" }
    private static func day1StepKey(_ athleteId: String) -> String { "fahybrik.day1_step.\(athleteId)" }

    /// Persisted athleteId for callers that don't hold the AuthState instance
    /// (e.g. ProfileView, which only receives the bearer). Single source of
    /// truth for the storage key so the value never drifts from `bootstrap()`.
    static func persistedAthleteId() -> String? {
        UserDefaults.standard.string(forKey: athleteKey)
    }

    func bootstrap() {
        let d = UserDefaults.standard
        // AUDIT-B1 — move any legacy UserDefaults bearer into the Keychain (transparent,
        // one-time) and read the session token from the Keychain.
        KeychainTokenStore.shared.migrateFromUserDefaults()
        bearer = KeychainTokenStore.shared.read()
        athleteId = d.string(forKey: Self.athleteKey)
        // Absent key (session saved before the free tier existed) = coached.
        hasCoach = (d.object(forKey: Self.hasCoachKey) as? Bool) ?? true
        if let raw = d.string(forKey: Self.stageKey) {
            switch raw {
            case "authenticated": stage = .authenticated
            case "onboarding": stage = .onboarding
            default: stage = .unauthenticated
            }
        }
        loadDay1()
    }

    func acceptAppleResponse(_ resp: AppleAuthResponse) {
        bearer = resp.bearer
        athleteId = resp.athlete_id
        stage = (resp.onboarding_complete == true) ? .authenticated : .onboarding
        // Additive field: an older server payload omits it → coached (today's app).
        hasCoach = resp.hasCoach ?? true
        // Access must be (re)checked for the freshly-authenticated session.
        accessGated = nil
        loadDay1()
        persist()
    }

    /// Seat a DEMO athlete session. Reuses the exact same session state +
    /// persistence as a real Apple sign-in (`acceptAppleResponse`): the bearer
    /// is a normal athlete JWT, so every downstream screen behaves identically.
    /// The seeded demo athlete is already onboarded → land straight in the app.
    /// `accessGated = nil` re-derives the invite-only gate from the subscription
    /// endpoint just like a real session (the demo athlete carries an active
    /// comp subscription, so it resolves ungated).
    /// DEBUG-ONLY: stripped from Release so no demo session path ships in the
    /// App Store binary. Its only caller (AppRoot's onDemoSession closure) gates
    /// this reference behind `#if DEBUG` too.
    #if DEBUG
    func acceptDemoSession(bearer: String, athleteId: String) {
        self.bearer = bearer
        self.athleteId = athleteId
        stage = .authenticated
        // The seeded demo athlete is coached; refreshAccess re-derives from tier.
        hasCoach = true
        accessGated = nil
        loadDay1()
        persist()
    }
    #endif

    func finishOnboarding() {
        stage = .authenticated
        // A questionnaire-completer (the no-funnel fallback) already got a full
        // onboarding — skip the day-1 orientation for them.
        finishDay1()
        persist()
    }

    /// Load the per-athlete day-1 flags from disk. `bool(forKey:)` returns false
    /// when unset → an athlete who never saw day-1 gets it once.
    private func loadDay1() {
        guard let athleteId else { day1Completed = true; day1Step = 0; return }
        let d = UserDefaults.standard
        day1Completed = d.bool(forKey: Self.day1Key(athleteId))
        day1Step = d.integer(forKey: Self.day1StepKey(athleteId))
    }

    /// Persist the resume point when the athlete advances a day-1 beat.
    func saveDay1Step(_ step: Int) {
        guard let athleteId else { return }
        day1Step = step
        UserDefaults.standard.set(step, forKey: Self.day1StepKey(athleteId))
    }

    /// Mark day-1 done for the current athlete — never shown again.
    func finishDay1() {
        day1Completed = true
        guard let athleteId else { return }
        UserDefaults.standard.set(true, forKey: Self.day1Key(athleteId))
    }

    func signOut() {
        bearer = nil
        athleteId = nil
        stage = .unauthenticated
        accessGated = nil
        hasCoach = true
        persist()
    }

    /// Shortcut for paths that grant access by construction (invite redemption):
    /// skips the round-trip to the subscription endpoint so the gate never
    /// flashes.
    func markAccessActive() {
        accessGated = false
    }

    /// Re-derive the access gate from `GET /api/athlete/subscription`.
    ///
    /// Decision tree (tier × status → where the athlete lands):
    ///   • tier "free"                       → ungated, hasCoach=false (free surface)
    ///   • tier "coached" + active/trialing  → ungated, hasCoach=true (today's app)
    ///   • tier "coached" + anything else    → gated → InviteGateView
    ///   • tier absent (old cached payload)  → status-driven, hasCoach untouched
    ///
    /// On a network error we fail OPEN (ungated) so a transient outage doesn't
    /// lock a legitimately-entitled athlete out of the app — EXCEPT a 401, which
    /// means the bearer itself is dead: we clear the session and route to login
    /// instead of failing open into the app with a token every request will reject.
    @MainActor
    func refreshAccess() async {
        guard let bearer else { accessGated = true; return }
        do {
            let info = try await SubscriptionService.fetchSubscription(bearer: bearer)
            // The tier is server truth for the coach link — keep hasCoach fresh so
            // gaining/losing a coach flips the surface on the next launch.
            if let tier = info.tier {
                hasCoach = (tier != "free")
                persist()
            }
            accessGated = !info.isActiveAccess
        } catch {
            if case APIError.http(401, _) = error {
                handleUnauthorized()
            } else {
                accessGated = false
            }
        }
    }

    /// The server rejected our session bearer with 401 on an authenticated
    /// request — the persisted token is dead. This happens when its server-side
    /// session was revoked/expired, or when a stale token outlives its session
    /// across an app REINSTALL (an Xcode "Run" is an upgrade install: the data
    /// container — and thus the persisted bearer — survives, but the old session
    /// may not). There is no reliable SILENT Sign-in-with-Apple re-auth (minting
    /// a fresh identity token needs a user-initiated authorization), and we do
    /// NOT invent a server refresh endpoint — so we clear the dead session and
    /// drop the athlete on the login screen, where one SiwA tap re-mints a valid
    /// session. Idempotent: a launch fires every slice's revalidation at once, so
    /// a dead token produces a BURST of 401s — they all collapse to a single
    /// sign-out (and clearing the bearer stops the rest mid-flight).
    @MainActor
    func handleUnauthorized() {
        guard stage != .unauthenticated else { return }
        signOut()
    }

    private func persist() {
        let d = UserDefaults.standard
        // AUDIT-B1 — the bearer is stored in the Keychain, not UserDefaults.
        if let bearer { KeychainTokenStore.shared.save(bearer) }
        else { KeychainTokenStore.shared.delete() }
        if let athleteId { d.set(athleteId, forKey: Self.athleteKey) }
        else { d.removeObject(forKey: Self.athleteKey) }
        d.set(hasCoach, forKey: Self.hasCoachKey)
        let raw: String = {
            switch stage {
            case .unauthenticated: return "unauthenticated"
            case .onboarding: return "onboarding"
            case .authenticated: return "authenticated"
            }
        }()
        d.set(raw, forKey: Self.stageKey)
    }
}
