import SwiftUI

// The authenticated app root. Hosts the 5 redesign destinations in the STANDARD
// native iOS bottom tab bar (SwiftUI `TabView`):
//
//   Inicio · Plan · Analíticas · Carreras · Perfil
//
// "Analíticas" is the deep training-analytics surface (running / ergo / strength /
// HYROX / recovery, period-windowed, every number drillable). "Carreras" stays
// the race hub. CHAT is no longer a tab — it must not be buried, but it isn't a
// primary destination either, so it lives behind a persistent header icon (with an
// unread badge) and is raised here as a full-screen cover via the `\.openChat`
// environment value.
//
// The bottom bar is the platform-standard `TabView` tab bar: anchored flush to the
// bottom safe-area edge, its material background extended through the home-indicator
// area, and each tab's content inset automatically so scroll content ends above the
// bar (nothing peeks below it). The selected tab is tinted brand orange via
// `.tint(Theme.Color.accentText)` — the AA-safe accent role the previous bar used
// for its active glyph (identical #F06A2A on dark, darkened for contrast on light);
// unselected tabs fall back to the system gray. SF Symbols auto-swap to their filled
// variant when selected (house → house.fill, etc.), matching the prior active state.
struct AppShell: View {
    let onSignOut: () -> Void

    @State private var selection: AppTab = .inicio
    // Chat presentation — raised from any main-screen header via `\.openChat`.
    @State private var showChat = false
    /// Sobre qué se abre el chat, cuando se abre desde el menú de una cosa
    /// concreta. Nil desde una cabecera: entonces es la conversación a secas.
    @State private var contextoDelChat: ChatContextChoice?
    // «Del coach» — la bandeja de comunicados, levantada desde la cabecera de
    // Inicio (`\.openCoachInbox`) o por un push. Con id abre ESE comunicado.
    @State private var showCoachInbox = false
    @State private var coachInboxId: String?
    /// El vacío de la bandeja sale al chat: se apunta y se abre al cerrarse ella.
    @State private var chatTrasBandeja = false
    // The LIVE session bearer — single source of truth (AuthState), injected via
    // the environment, NOT a UserDefaults/@State snapshot frozen at init. The old
    // snapshot could win over a rotated token and, worse, keep feeding a bearer
    // that outlived its session across a reinstall. Reading it live means every
    // tab + the data store always use the current token, and a sign-out /
    // 401-recovery instantly re-scopes the whole tree.
    @Environment(AuthState.self) private var auth
    private var bearer: String? { auth.bearer }
    /// FREE tier switch (athlete without coach). False flips the shell to the
    /// free surface: FreeInicioView as home, no chat cover, no chat headers,
    /// and every coach-flavored row downstream hidden via the same flag.
    private var hasCoach: Bool { auth.hasCoach }

    // Drives the offline-queue drain on return to foreground — captured work
    // (check-ins, executions, sync batches) must chase connectivity, not wait
    // for the next cold launch.
    @Environment(\.scenePhase) private var scenePhase

    // The shared, cache-first data layer. Created ONCE here and injected via
    // `.environment` so it survives tab switches — Inicio / Plan / Perfil read
    // their data from it and never re-fetch (or spin) just because their tab was
    // recreated on switch. See AppDataStore.
    @State private var store = AppDataStore()

    // Push deep-link router — a tapped notification routes to a tab (chat opens
    // its tab directly now that Chat is a first-class destination).
    @State private var pushRouter = PushRouter.shared

    var body: some View {
        // Native `TabView` owns the safe-area anchoring, the opaque bar material
        // (extended into the home-indicator area), and the per-tab content inset.
        // We keep `.environment(store)` on the TabView so every tab root receives
        // the shared AppDataStore, and drive selection via the same `AppTab` state
        // (so `onOpenTab` and push deep-links still switch tabs).
        TabView(selection: $selection) {
            // Inicio is the only root without its own canvas — it relied on the old
            // shell background — so paint the brand canvas behind it here.
            // COACHED → the verdict home; FREE → the free home (pantalla 2 del
            // mockup): construir entreno · probarme · tu semana, no coach copy.
            Group {
                if hasCoach {
                    InicioView(bearer: bearer, onOpenTab: { selection = $0 })
                } else {
                    FreeInicioView(bearer: bearer, onOpenTab: { selection = $0 })
                }
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .tag(AppTab.inicio)
            .tabItem { Label(AppTab.inicio.title, systemImage: AppTab.inicio.symbol) }

            // COACHED → the published week. FREE → there is no published week to
            // show: Plan becomes the athlete's own performance picture (what he
            // has measured, what's missing, and who turns it into a plan). See
            // FreePlanView / docs/design/free-plan-conversion-mockup.html.
            Group {
                if hasCoach {
                    PlanView(bearer: bearer, hasCoach: hasCoach)
                } else {
                    FreePlanView(bearer: bearer)
                }
            }
            .tag(AppTab.plan)
            .tabItem { Label(AppTab.plan.title, systemImage: AppTab.plan.symbol) }

            AnalyticsView(bearer: bearer, hasCoach: hasCoach)
                .tag(AppTab.analiticas)
                .tabItem { Label(AppTab.analiticas.title, systemImage: AppTab.analiticas.symbol) }

            CarrerasView(bearer: bearer, hasCoach: hasCoach)
                .tag(AppTab.carreras)
                .tabItem { Label(AppTab.carreras.title, systemImage: AppTab.carreras.symbol) }

            ProfileView(bearer: bearer, hasCoach: hasCoach, onSignOut: onSignOut)
                .tag(AppTab.perfil)
                .tabItem { Label(AppTab.perfil.title, systemImage: AppTab.perfil.symbol) }
        }
        .tint(Theme.Color.accentText)
        .environment(store)
        // Persistent chat: any main-screen header opens it through this value;
        // it's raised as a full-screen cover that re-injects the store (a custom
        // @Observable environment value does NOT cross the presentation boundary).
        // FREE: there is no coach thread — the opener is a no-op and the cover
        // can never raise (no header shows the button either).
        .environment(\.openChat) { sobre in
            guard hasCoach else { return }
            contextoDelChat = sobre
            showChat = true
        }
        .fullScreenCover(isPresented: $showChat, onDismiss: { contextoDelChat = nil }) {
            // El contexto viaja como valor inicial, no como estado vivo: el chat
            // es dueño de lo que espera en su compositor (el atleta puede quitarlo
            // con la ✕ o cambiarlo desde el «+»), y quien abrió la puerta no manda
            // sobre eso después.
            ChatView(bearer: bearer, contextoInicial: contextoDelChat)
                .environment(store)
        }
        // La bandeja «Del coach», por el mismo camino que el chat: un cover que
        // re-inyecta la porción compartida (un valor de entorno @Observable NO
        // cruza la frontera de una presentación). FREE no tiene coach, así que
        // ni el abridor ni el cover pueden levantarse.
        .environment(\.openCoachInbox) { id in
            guard hasCoach else { return }
            coachInboxId = id
            showCoachInbox = true
        }
        .fullScreenCover(isPresented: $showCoachInbox, onDismiss: {
            // Dos covers no pueden levantarse a la vez sobre el mismo
            // presentador: la salida al chat del vacío se apunta aquí y se abre
            // cuando la bandeja ya se ha ido.
            guard chatTrasBandeja else { return }
            chatTrasBandeja = false
            showChat = true
        }) {
            ComunicadosBandejaView(bearer: bearer, abrirId: coachInboxId)
                .environment(store)
                .environment(\.openChat) { _ in chatTrasBandeja = true }
        }
        // Scope the store to the session and warm every slice once, so whichever
        // tab the athlete opens first already has its data (or loads it centrally,
        // not per-view). Re-runs if the bearer changes (sign-out / athlete switch).
        .task(id: bearer) {
            // A dead bearer (401 on any slice) clears the session and routes to
            // login — instead of the SWR engine silently keeping stale cache.
            store.onUnauthorized = { auth.handleUnauthorized() }
            // FREE: sin coach no hay hilo ni comunicados — ni las porciones del
            // chat ni la de la bandeja se piden nunca.
            store.hasCoach = hasCoach
            store.activate(bearer: bearer)
            await store.warm()
            // Deliver whatever the offline queue captured in earlier sessions,
            // with the live token (see RequestQueue.drain).
            if bearer != nil {
                // La cola tiene que saber contar sus entregas ANTES de drenar: la traza
                // de una carrera guardada sin cobertura cuelga del `execution_id` que
                // sólo viene en la respuesta de la ejecución que está a punto de subir.
                await RequestQueue.shared.onDelivery { requestId, response in
                    await WorkoutTraceUploader.executionDelivered(
                        requestId: requestId,
                        responseBody: response,
                        bearer: KeychainTokenStore.shared.read()
                    )
                }
                await WorkoutTraceUploader.sweep(bearer: bearer)
                await RequestQueue.shared.drain(bearer: bearer)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, let bearer else { return }
            Task {
                await WorkoutTraceUploader.sweep(bearer: bearer)
                await RequestQueue.shared.drain(bearer: bearer)
            }
        }
        .onAppear {
            handlePushDestination(pushRouter.pendingDestination)
        }
        .onChange(of: pushRouter.pendingDestination) { _, dest in
            handlePushDestination(dest)
        }
    }

    // MARK: - Push routing
    //
    // Maps a tapped-notification destination to a tab. Chat is no longer a tab —
    // a chat push raises the chat cover instead of switching tabs.
    private func handlePushDestination(_ dest: PushRouter.Destination?) {
        guard let dest else { return }
        switch dest {
        case .today: selection = .inicio
        case .plan: selection = .plan
        case .profile: selection = .perfil
        // FREE never receives chat pushes (no thread); guard anyway so a stray
        // payload can't raise a dead chat cover.
        case .chat: if hasCoach { showChat = true }
        // Un comunicado: se abre la bandeja, y con el id que trae el aviso, ESE
        // comunicado — no una lista donde haya que volver a buscarlo.
        case .coachInbox(let id):
            if hasCoach {
                coachInboxId = id
                showCoachInbox = true
            }
        }
        pushRouter.pendingDestination = nil
    }
}

// MARK: - Tabs

enum AppTab: Int, CaseIterable, Hashable {
    // Order IS the tab-bar order: Inicio · Plan · Analíticas · Carreras · Perfil.
    case inicio, plan, analiticas, carreras, perfil

    var title: String {
        switch self {
        case .inicio: return "Inicio"
        case .plan: return "Plan"
        case .analiticas: return "Analíticas"
        case .carreras: return "Carreras"
        case .perfil: return "Perfil"
        }
    }

    /// SF Symbol for the tab. The native tab bar auto-swaps to the filled variant
    /// (e.g. house → house.fill) when the tab is selected; symbols without a filled
    /// counterpart (chart / flag) stay the same glyph, as before.
    var symbol: String {
        switch self {
        case .inicio: return "house"
        case .plan: return "list.bullet.rectangle"
        case .analiticas: return "chart.line.uptrend.xyaxis"
        case .carreras: return "flag.checkered"
        case .perfil: return "person"
        }
    }
}
