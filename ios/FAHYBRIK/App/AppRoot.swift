import SwiftUI

struct AppRoot: View {
    @State private var auth = AuthState()
    @State private var pendingPartnerToken: String? = nil
    @State private var pendingInviteToken: String? = nil

    // Cold-start launch splash gate. `@State` on the WindowGroup root view, so it
    // is created once per process and survives background→foreground and all
    // in-app navigation — the energy-wipe therefore plays ONLY on a cold launch,
    // never on resume or tab switches. Dismissed when LaunchSplashView finishes.
    @State private var showSplash = true

    // User-selected appearance. `.system` follows the OS (the default + historical
    // behaviour); `.light`/`.dark` force a scheme. Set from Perfil → Apariencia and
    // applied to the whole hierarchy below via `.preferredColorScheme`.
    @AppStorage(ThemeMode.storageKey) private var themeMode: ThemeMode = .system

    private func startHealthKitSync() {
        HealthKitSyncService.shared.configure(
            bearer: auth.bearer,
            athleteId: auth.athleteId
        )
        HealthKitSyncService.shared.start()
    }

    /// Wire push: hand the session bearer to PushManager (so any APNS token can
    /// be uploaded) and ask for notification permission. Called once the
    /// athlete is authenticated — never on the first cold/unauthenticated
    /// launch (avoids an aggressive permission prompt before sign-in).
    private func startPush() {
        PushManager.shared.configure(bearer: auth.bearer)
        PushManager.shared.requestAuthorization()
    }

    var body: some View {
        ZStack {
            mainContent

            // Cold-start only (gated by `showSplash`). Overlays the app while the
            // energy-wipe plays; the app mounts + bootstraps underneath so it is
            // ready by the time the splash fades out. Fails-open: if the video is
            // missing/stalls or Reduce Motion is on, it finishes near-instantly.
            if showSplash {
                LaunchSplashView(onFinish: {
                    withAnimation(.easeOut(duration: 0.4)) { showSplash = false }
                })
                .transition(.opacity)
                .zIndex(100)
            }
        }
    }

    private var mainContent: some View {
        Group {
            if let token = pendingInviteToken, auth.stage == .unauthenticated {
                // Coach → athlete invite flow — invitee landed via deep link
                // (fahybrid://invite?token=… or https://fahybrid.com/invite/<token>).
                // Reuses the exact same onOpenURL plumbing as the Dobles
                // partner-redeem flow below.
                InviteLandingView(
                    inviteToken: token,
                    auth: auth,
                    onCompleted: {
                        pendingInviteToken = nil
                        if auth.stage == .authenticated {
                            startHealthKitSync()
                            startPush()
                        }
                    }
                )
            } else if let token = pendingPartnerToken, auth.stage == .unauthenticated {
                // Dobles invitation flow — invitee landed via custom-scheme
                // deep link (fahybrid://partner/redeem?token=…). Show the
                // dedicated welcome instead of the generic AppleSignInView.
                PartnerRedeemView(
                    token: token,
                    auth: auth,
                    onCompleted: {
                        pendingPartnerToken = nil
                        if auth.stage == .authenticated {
                            startHealthKitSync()
                            startPush()
                        }
                    }
                )
            } else {
                switch auth.stage {
                case .unauthenticated:
                    AppleSignInView(
                        onAuthenticated: { resp in
                            auth.acceptAppleResponse(resp)
                            // Returning athlete who skips onboarding — wire push now.
                            if auth.stage == .authenticated {
                                startPush()
                            }
                        },
                        onDemoSession: { bearer, athleteId in
                            // Demo athlete lands authenticated (seeded onboarded).
                            // Reuses the real session path; access gate + push
                            // wire up exactly as a normal sign-in.
                            auth.acceptDemoSession(bearer: bearer, athleteId: athleteId)
                            startPush()
                        }
                    )
                case .onboarding, .authenticated:
                    authenticatedFlow
                }
            }
        }
        .onAppear {
            auth.bootstrap()
            if auth.stage == .authenticated {
                startHealthKitSync()
                startPush()
            }
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        // Drive the entire app (sign-in, onboarding, shell, sheets) from the
        // single persisted appearance preference.
        .preferredColorScheme(themeMode.colorScheme)
    }

    // MARK: - Authenticated routing + cold-gate
    //
    // Once authenticated (or onboarding) the invite-only gate decides whether
    // the athlete reaches the app. `accessGated == nil` means we haven't
    // checked yet → show a brief loader and kick off `refreshAccess()` (never
    // flash the app). `true` → invite-only gate. `false` → app / onboarding.
    @ViewBuilder
    private var authenticatedFlow: some View {
        switch auth.accessGated {
        case nil:
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ProgressView().tint(Theme.Color.accent)
            }
            .task { await auth.refreshAccess() }
        case .some(true):
            InviteGateView(auth: auth) { resp in
                // Retry succeeded at Apple — accept the new session and let
                // refreshAccess re-evaluate the gate.
                auth.acceptAppleResponse(resp)
            }
        case .some(false):
            switch auth.stage {
            case .onboarding:
                OnboardingFlow(
                    bearer: auth.bearer,
                    onFinished: {
                        auth.finishOnboarding()
                        startHealthKitSync()
                        startPush()
                    }
                )
            case .authenticated:
                AppShell(onSignOut: { auth.signOut() })
            case .unauthenticated:
                // Unreachable — guarded by the outer switch. Render nothing.
                EmptyView()
            }
        }
    }

    // MARK: - Deep link handling
    //
    // v1 ships with a custom URL scheme `fahybrid://` declared in project.yml
    // (CFBundleURLTypes). Universal Links (https://app.fahybrid.com/partner/
    // redeem?token=…) will be wired once apple-app-site-association is hosted
    // by the web app — handler logic below is scheme-agnostic so flipping to
    // Universal Links only requires adding the associated-domains entitlement
    // + AASA file.
    private func handleDeepLink(_ url: URL) {
        let path = url.path.isEmpty ? url.host ?? "" : url.path
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let queryToken = comps?.queryItems?.first(where: { $0.name == "token" })?.value

        // --- Coach → athlete invite (invite-only model) ---
        // Accept either:
        //   fahybrid://invite?token=XYZ          (custom scheme, v1)
        //   fahybrid://invite/XYZ                 (custom scheme, path form)
        //   https://fahybrid.com/invite/XYZ       (Universal Link, future)
        // The web link carries the token in the PATH segment; the custom scheme
        // may carry it as a query item. Handle both.
        let isInvite =
            (url.host == "invite") ||
            path.contains("/invite") ||
            path == "invite"
        if isInvite {
            // Prefer the query token; otherwise take the path segment after
            // "invite" (e.g. /invite/<token> → "<token>").
            let pathToken: String? = {
                let segments = url.pathComponents.filter { $0 != "/" }
                guard let idx = segments.firstIndex(of: "invite"),
                      idx + 1 < segments.count else { return nil }
                return segments[idx + 1]
            }()
            // Custom-scheme `fahybrid://invite/XYZ` puts "XYZ" in url.path with
            // host == "invite", so also check the leading path segment.
            let hostPathToken: String? = {
                guard url.host == "invite" else { return nil }
                let segs = url.pathComponents.filter { $0 != "/" }
                return segs.first
            }()
            let token = (queryToken ?? pathToken ?? hostPathToken)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if let token, !token.isEmpty {
                pendingInviteToken = token
                return
            }
        }

        // --- Dobles partner redeem ---
        // Accept either:
        //   fahybrid://partner/redeem?token=XYZ   (custom scheme, v1)
        //   https://app.fahybrid.com/partner/redeem?token=XYZ  (Universal Link, future)
        let isPartnerRedeem =
            (url.host == "partner" && url.path.hasPrefix("/redeem")) ||
            path.contains("partner/redeem")

        if isPartnerRedeem, let queryToken, !queryToken.isEmpty {
            pendingPartnerToken = queryToken
        }
    }
}
