import SwiftUI

// The authenticated app root. Owns a premium custom bottom tab bar over our
// near-black canvas and hosts the 5 redesign destinations:
//
//   Inicio · Plan · Carreras · Chat · Perfil
//
// "Carreras" is the performance/race hub and absorbs the old Analíticas/Stats
// content. The handoff's bottom bar is intentionally crude — this is the
// production-quality version: a floating blurred material bar, SF Symbols, a
// crisp orange active pill, tracked-uppercase micro labels, haptics, and an
// eased cross-fade between tabs.
struct AppShell: View {
    let onSignOut: () -> Void

    @State private var selection: AppTab = .inicio
    @State private var bearer: String? = nil

    // Push deep-link router — a tapped notification routes to a tab (chat opens
    // its tab directly now that Chat is a first-class destination).
    @State private var pushRouter = PushRouter.shared

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()

            // Active tab content. We keep it simple (a switch) so each root owns
            // its own scroll + safe area; the bar floats over it.
            Group {
                switch selection {
                case .inicio:
                    InicioView(bearer: bearer, onOpenTab: { selection = $0 })
                case .plan:
                    PlanView(bearer: bearer)
                case .carreras:
                    CarrerasView(bearer: bearer)
                case .chat:
                    ChatView(bearer: bearer)
                case .perfil:
                    ProfileView(bearer: bearer, onSignOut: onSignOut)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
            // Reserve room so root content can scroll clear of the floating bar.
            .safeAreaInset(edge: .bottom) {
                Color.clear.frame(height: AppTabBar.barHeight)
            }

            AppTabBar(selection: $selection)
        }
        .onAppear {
            bearer = UserDefaults.standard.string(forKey: "fahybrik.bearer")
            handlePushDestination(pushRouter.pendingDestination)
        }
        .onChange(of: pushRouter.pendingDestination) { _, dest in
            handlePushDestination(dest)
        }
    }

    // MARK: - Push routing
    //
    // Maps a tapped-notification destination to a tab. Chat is now a tab root,
    // so chat pushes select the Chat tab directly instead of raising a sheet.
    private func handlePushDestination(_ dest: PushRouter.Destination?) {
        guard let dest else { return }
        switch dest {
        case .today: selection = .inicio
        case .plan: selection = .plan
        case .profile: selection = .perfil
        case .chat: selection = .chat
        }
        pushRouter.pendingDestination = nil
    }
}

// MARK: - Tabs

enum AppTab: Int, CaseIterable, Hashable {
    case inicio, plan, carreras, chat, perfil

    var title: String {
        switch self {
        case .inicio: return "Inicio"
        case .plan: return "Plan"
        case .carreras: return "Carreras"
        case .chat: return "Chat"
        case .perfil: return "Perfil"
        }
    }

    /// SF Symbol shown when the tab is INACTIVE.
    var symbol: String {
        switch self {
        case .inicio: return "house"
        case .plan: return "list.bullet.rectangle"
        case .carreras: return "flag.checkered"
        case .chat: return "message"
        case .perfil: return "person"
        }
    }

    /// SF Symbol shown when the tab is ACTIVE (filled variant for weight).
    var symbolActive: String {
        switch self {
        case .inicio: return "house.fill"
        case .plan: return "list.bullet.rectangle.fill"
        case .carreras: return "flag.checkered" // no filled variant; same glyph
        case .chat: return "message.fill"
        case .perfil: return "person.fill"
        }
    }
}

// MARK: - Custom bottom tab bar

/// Premium floating tab bar: a translucent material slab sealed by a top
/// hairline seam, five SF-symbol buttons, and a crisp orange active pill behind
/// the selected tab. Respects the bottom safe area; min 44pt touch targets.
struct AppTabBar: View {
    @Binding var selection: AppTab

    /// Height of the bar content (excluding the bottom safe-area inset). Used by
    /// AppShell to reserve space so content scrolls clear.
    static let barHeight: CGFloat = 64

    // One namespace drives the matched-geometry slide of the active pill.
    @Namespace private var pillNamespace

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, Theme.Spacing.s)
        .frame(height: Self.barHeight)
        .background(alignment: .top) {
            // Top hairline seam — the instrument-panel lip — over the material.
            Rectangle()
                .fill(Theme.Color.hairlineStrong)
                .frame(height: 1)
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .background(.ultraThinMaterial)
        // Tint the material toward our own surface so it never reads as a plain
        // iOS-default frosted bar. Adaptive: warm near-black on dark, cool
        // light-gray on light.
        .background(Theme.Color.surface.opacity(0.55))
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: Theme.Radius.xl,
                topTrailingRadius: Theme.Radius.xl,
                style: .continuous
            )
        )
        .ignoresSafeArea(.keyboard) // don't ride up over the keyboard in Chat
        .accessibilityElement(children: .contain)
    }

    private func tabButton(_ tab: AppTab) -> some View {
        let active = selection == tab
        return Button {
            guard !active else { return }
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.18)) { selection = tab }
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    if active {
                        // The crisp orange active pill, slid via matchedGeometry.
                        Capsule()
                            .fill(Theme.Color.accent.opacity(0.16))
                            .matchedGeometryEffect(id: "activePill", in: pillNamespace)
                            .frame(width: 40, height: 30)
                    }
                    Image(systemName: active ? tab.symbolActive : tab.symbol)
                        .font(.system(size: 19, weight: active ? .semibold : .regular))
                        // Active glyph/label are small content over a light-ish
                        // material → text-safe accent (brand orange only reaches
                        // ~2.4–2.8:1 there; accentText == orange on dark).
                        .foregroundStyle(active ? Theme.Color.accentText : Theme.Color.muted)
                        .frame(height: 30)
                }
                Text(tab.title)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(Theme.Tracking.dataLabel * 0.7)
                    .textCase(.uppercase)
                    .foregroundStyle(active ? Theme.Color.accentText : Theme.Color.muted)
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
    }
}
