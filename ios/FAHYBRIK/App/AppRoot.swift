import SwiftUI

struct AppRoot: View {
    @State private var auth = AuthState()
    @State private var pendingPartnerToken: String? = nil
    @State private var pendingInviteToken: String? = nil
    // Outcome message for an authenticated partner-accept attempt (C4).
    @State private var partnerAcceptMessage: String? = nil

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
        // Only sync for athletes who actually connected Apple Health in Perfil.
        // Without this guard a disconnect wouldn't survive a relaunch — AppRoot
        // would silently re-register the observers on the next authenticated launch.
        guard HealthKitConnection.isConnected else { return }
        HealthKitSyncService.shared.configure(
            bearer: auth.bearer,
            athleteId: auth.athleteId
        )
        // A dead bearer on an upload surfaces the same session recovery as the rest
        // of the app (clear session → login) instead of re-queuing a doomed request.
        HealthKitSyncService.shared.onUnauthorized = { auth.handleUnauthorized() }
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
                            // DEBUG-ONLY body: `acceptDemoSession` is stripped from
                            // Release, so its only reference is gated here too. In a
                            // Release build this closure is inert — the demo entry UI
                            // that would fire it is itself DEBUG-only.
                            #if DEBUG
                            auth.acceptDemoSession(bearer: bearer, athleteId: athleteId)
                            startPush()
                            #endif
                        }
                    )
                case .onboarding, .authenticated:
                    authenticatedFlow
                }
            }
        }
        .onAppear {
            auth.bootstrap()
            #if DEBUG
            // SIEMBRA DE VERIFICACIÓN — solo DEBUG, y solo si el lanzamiento trae
            // el bearer por entorno. Va DESPUÉS de bootstrap (que restaura la
            // sesión de disco) para que la siembra gane. Reutiliza el MISMO
            // `acceptDemoSession` del atleta demo, así que la app se comporta
            // igual que con un login real; no toca producción ni enciende ningún
            // flag. Es lo que deja fotografiar la pestaña sin depender del asiento
            // demo (apagado en prod). Fuera de DEBUG este bloque no existe.
            if let b = ProcessInfo.processInfo.environment["UITEST_BEARER"],
               let a = ProcessInfo.processInfo.environment["UITEST_ATHLETE"],
               !b.isEmpty {
                auth.acceptDemoSession(bearer: b, athleteId: a)
                // Saltar el day-1 (varias páginas de bienvenida) para aterrizar
                // directo en las pestañas: la verificación es de Analíticas, no
                // del onboarding.
                auth.finishOnboarding()
            }
            #endif
            // Register the mirrored-session handler early (idempotent) so a wrist
            // recording started during a workout is never missed. Cheap, no prompt.
            PhoneMirrorService.shared.prepare()
            if auth.stage == .authenticated {
                startHealthKitSync()
                startPush()
            }
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        // Already-signed-in athlete accepting a Dobles PARTNER invite: confirm,
        // then link their EXISTING account (redeem by bearer — no re-auth). Never
        // a silent dead-end.
        .alert("Emparejar en Dobles", isPresented: authedPartnerTokenBinding) {
            Button("Emparejar") { Task { await acceptPendingPartnerAuthenticated() } }
            Button("Ahora no", role: .cancel) { pendingPartnerToken = nil }
        } message: {
            Text("Tu compañero/a te ha invitado a entrenar Dobles. ¿Emparejar tu cuenta actual de FAHYBRID?")
        }
        // Authenticated user tapping a coach→athlete account-claim link (that flow
        // creates a NEW account) — explain clearly instead of a silent no-op.
        .alert("Ya tienes cuenta en FAHYBRID", isPresented: authedInviteTokenBinding) {
            Button("Entendido", role: .cancel) { pendingInviteToken = nil }
        } message: {
            Text("Este enlace de invitación crea una cuenta nueva y tú ya tienes cuenta en FAHYBRID.")
        }
        // Outcome of the partner-accept attempt.
        .alert("Dobles", isPresented: partnerAcceptResultBinding) {
            Button("OK", role: .cancel) { partnerAcceptMessage = nil }
        } message: {
            Text(partnerAcceptMessage ?? "")
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
                    hasCoach: auth.hasCoach,
                    onFinished: {
                        auth.finishOnboarding()
                        startHealthKitSync()
                        startPush()
                    }
                )
            case .authenticated:
                if auth.day1Completed || !auth.hasCoach {
                    // Day-1 is the COACHED orientation (your coach has your
                    // profile, week-1 tests, the coach loop) — a free athlete
                    // skips it and lands straight on their home.
                    AppShell(onSignOut: { auth.signOut() })
                        .environment(auth)
                } else {
                    // First open after alta/claim — guided day-1 orientation (#17)
                    // before the shell. Shown once; funnel athletes skip the
                    // 19-step questionnaire entirely (their data came from alta).
                    Day1Flow(
                        bearer: auth.bearer,
                        startStep: auth.day1Step,
                        onStepChange: { auth.saveDay1Step($0) },
                        onFinished: {
                            auth.finishDay1()
                            startHealthKitSync()
                            startPush()
                        }
                    )
                }
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
    // Authenticated athlete + a pending PARTNER token → offer to link the
    // existing account (redeem by bearer). Pending INVITE token (account-claim)
    // can't link an existing account → explain. Both bindings clear on dismiss.
    private var authedPartnerTokenBinding: Binding<Bool> {
        Binding(
            get: { auth.stage != .unauthenticated && pendingPartnerToken != nil },
            set: { if !$0 { pendingPartnerToken = nil } }
        )
    }

    private var authedInviteTokenBinding: Binding<Bool> {
        Binding(
            get: { auth.stage != .unauthenticated && pendingInviteToken != nil },
            set: { if !$0 { pendingInviteToken = nil } }
        )
    }

    private var partnerAcceptResultBinding: Binding<Bool> {
        Binding(
            get: { partnerAcceptMessage != nil },
            set: { if !$0 { partnerAcceptMessage = nil } }
        )
    }

    /// Link the authenticated athlete's existing account to the inviter via the
    /// bearer-redeem path, then report the outcome. Partner-dependent surfaces
    /// pick up the new pair on their next fetch.
    private func acceptPendingPartnerAuthenticated() async {
        guard let token = pendingPartnerToken, let bearer = auth.bearer else { return }
        pendingPartnerToken = nil
        do {
            _ = try await PartnerService.redeemAuthenticated(token: token, bearer: bearer)
            Haptics.success()
            partnerAcceptMessage = "¡Listo! Ya estáis emparejados en Dobles."
        } catch let APIError.http(status, body) {
            let text = String(data: body, encoding: .utf8) ?? ""
            if text.contains("already_paired") {
                partnerAcceptMessage = "Ya tienes una pareja de Dobles."
            } else if status == 410 {
                partnerAcceptMessage = "Esta invitación ha caducado."
            } else {
                partnerAcceptMessage = "No pudimos emparejar (error \(status))."
            }
        } catch {
            partnerAcceptMessage = "No pudimos emparejar. Inténtalo de nuevo."
        }
    }

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
