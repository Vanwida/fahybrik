import SwiftUI

// MARK: - Screen scaffolding
//
// The three mechanics every screen in the app needs and that, until now, each
// screen re-invented by hand. They implement rules 2 and 3 of
// `docs/design/pantallas-que-ganan-su-altura.html`:
//
//   · Rule 2 — "el hueco se gana o no existe". Three legitimate ways to spend
//     the height the content does not use: the content FILLS it, the hole turns
//     into a PREVIEW of what you're deciding, or the content CENTRES. Aligning
//     to the top and leaving the rest dead is not one of them. `CenteredScreen`
//     is the third way, made reusable.
//   · Rule 3 — "la acción vive abajo, siempre visible". `.anchoredAction` is the
//     ONE anchored footer, extracted from the three screens that already had it
//     right (RegisterStrengthTestView, MarkDetailView, BlockPreviewGate).
//
// Everything here is built on Theme tokens and the existing atoms — no new
// colors, no new spacing values.

// MARK: - Anchored action (rule 3)

extension View {
    /// Pins an action bar to the bottom of the screen, where the thumb lives,
    /// and keeps the scrolling content clear of it.
    ///
    /// Built on `.safeAreaInset(edge: .bottom)` — the SwiftUI mechanism that
    /// both places the bar outside the scroll AND grows the scroll's content
    /// inset, so nothing ends up hidden underneath. That is why this replaces
    /// the two hand-rolled variants it supersedes: the `ZStack` + `Spacer()`
    /// overlay (which needs a guessed `.padding(.bottom, 120)` on the content to
    /// avoid covering it) and, above all, the `Spacer(minLength:)` placed INSIDE
    /// a `ScrollView` — which pushes nothing at all and merely adds blank space
    /// before a button that still scrolls away.
    ///
    /// - Parameters:
    ///   - separator: hairline sealing the bar off the content it floats over.
    ///     Drop it only when the footer already carries its own edge.
    ///   - content: the bar itself — normally one `ExpertPrimaryButton`, at most
    ///     a primary plus one quiet secondary underneath.
    func anchoredAction<Content: View>(
        separator: Bool = true,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        self.safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if separator { Hairline() }
                content()
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.s)
            }
            // The fill runs under the home indicator so content scrolling past
            // the bar is covered all the way to the physical bottom edge, while
            // the button itself stays inside the safe area.
            .background { Theme.Color.background.ignoresSafeArea(edges: .bottom) }
        }
    }
}

// MARK: - Compact sheet

extension View {
    /// Marks a sheet whose content is one to three fields, so it opens at half
    /// height instead of taking over the whole phone.
    ///
    /// A sheet is a QUESTION on top of what you were doing; a full-screen cover
    /// is a place you go. An email field, a rep count or a split slider is a
    /// question — and covering the entire screen for one of them both loses the
    /// context behind it and makes the ask look bigger than it is.
    ///
    /// `.large` stays in the set on purpose: the athlete can always pull it up,
    /// and iOS grows the sheet by itself when a keyboard needs the room. The drag
    /// indicator is what says "this moves".
    ///
    /// Apply to the sheet's CONTENT root (inside the presented view), which is
    /// where `presentationDetents` is read from.
    func compactSheet() -> some View {
        self
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
    }
}

// MARK: - Height distribution (rule 2 · *centrar*)

/// A screen body that CENTRES in the height its content does not fill — and
/// still scrolls the moment the content outgrows the screen (large Dynamic
/// Type, small devices).
///
/// Replaces two broken habits at once:
///   · `ScrollView { VStack(alignment: .leading) { … } }` with four short rows —
///     top-aligned, so the bottom half of the phone says nothing.
///   · a bare `ZStack { background; content }`, which centres only by accident
///     and CLIPS instead of scrolling once the text grows.
///
/// `head` is pinned above and never participates in the centring — it is the
/// screen's own header (a title row, a progress rail), the part that must stay
/// where the athlete last saw it.
struct CenteredScreen<Head: View, Content: View>: View {
    @ViewBuilder var head: () -> Head
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            head()
            GeometryReader { proxy in
                ScrollView {
                    content()
                        .frame(maxWidth: .infinity)
                        // minHeight centres by default: short content sits in
                        // the middle, taller content grows and scrolls.
                        .frame(minHeight: proxy.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
    }
}

extension CenteredScreen where Head == EmptyView {
    /// The headless form — the content owns the whole screen.
    init(@ViewBuilder content: @escaping () -> Content) {
        self.init(head: { EmptyView() }, content: content)
    }
}

// MARK: - Empty state (rule 2 + rule 3, together)

/// Where the athlete goes from an empty screen. There is no third case on
/// purpose: either something can be done about it right here, or the screen
/// says in words what has to happen and where. A state with neither is not a
/// state — it is a dead end, and the app had fifteen of them.
enum EmptyStateExit {
    /// An action the athlete can take from this very screen.
    case action(title: String, perform: () -> Void)
    /// Nothing to do here. `note` says what is missing and who supplies it
    /// ("Tu coach publica la semana el domingo"). Rendered as quiet copy, never
    /// as a button — a fake affordance is worse than none.
    case explained(note: String)
}

/// Honest empty-state scaffold for the surfaces that are not populated yet. A
/// muted SF symbol, a title, a sentence, and — always — the way out.
///
/// Never mock data. Never a dead end: `exit` has no default value precisely so
/// that every call site has to decide.
///
/// Lives here, next to the other shared atoms, because it is used across
/// Carreras, Dobles and the station/analytics detail screens — it used to be
/// declared at the bottom of `CarrerasView.swift`, which is how a shared
/// component ends up looking like one tab's private business.
struct RedesignEmptyState: View {
    let symbol: String
    let title: String
    let message: String
    /// The way out. Required.
    let exit: EmptyStateExit
    /// Muted by default. Override only when the emptiness itself carries meaning
    /// — "sin molestias registradas" is good news, and its shield reads green.
    var symbolColor: Color = Theme.Color.faint

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(symbolColor)
            Text(title)
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(message)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            exitView
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.l)
    }

    @ViewBuilder
    private var exitView: some View {
        switch exit {
        case let .action(title, perform):
            ExpertPrimaryButton(title: title.uppercased(), height: 50, action: perform)
                .padding(.top, Theme.Spacing.xs)
                .padding(.horizontal, Theme.Spacing.m)
        case let .explained(note):
            HStack(alignment: .top, spacing: 7) {
                Image(systemName: "clock")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.top, 1)
                Text(note)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .padding(.top, Theme.Spacing.xs)
            .accessibilityElement(children: .combine)
        }
    }
}

#if DEBUG
#Preview("Estado vacío · con acción") {
    CenteredScreen {
        RedesignEmptyState(
            symbol: "target",
            title: "Sin objetivos todavía",
            message: "Fija tu próxima carrera y verás aquí la cuenta atrás.",
            exit: .action(title: "Buscar carrera") {}
        )
    }
    .background(Theme.Color.background)
}

#Preview("Estado vacío · sin acción posible") {
    CenteredScreen {
        RedesignEmptyState(
            symbol: "calendar",
            title: "Semana sin publicar",
            message: "Tu coach aún no ha publicado esta semana.",
            exit: .explained(note: "En cuanto la publique te llega un aviso y aparece aquí.")
        )
    }
    .background(Theme.Color.background)
}
#endif
