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
///
/// `lead` is the third position, and it exists for the question-then-answer
/// shape: a title block that must sit at the TOP (so it lands in the same place
/// on every step of a flow instead of sliding up and down with the length of the
/// form) while the body still centres in the height the title leaves over. It
/// scrolls with the content — unlike `head` — so at accessibility text sizes a
/// three-line headline can be scrolled past instead of eating the screen.
/// With no `lead`, the geometry is exactly the two-slot one above.
struct CenteredScreen<Head: View, Lead: View, Content: View>: View {
    let head: () -> Head
    let lead: () -> Lead
    let content: () -> Content

    /// Measured, not guessed: the leftover the body centres in is the screen
    /// minus whatever the title block actually took at this text size.
    @State private var leadHeight: CGFloat = 0

    init(
        @ViewBuilder head: @escaping () -> Head,
        @ViewBuilder lead: @escaping () -> Lead,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.head = head
        self.lead = lead
        self.content = content
    }

    var body: some View {
        VStack(spacing: 0) {
            head()
            GeometryReader { proxy in
                ScrollView {
                    VStack(spacing: 0) {
                        lead()
                            .background(
                                GeometryReader { geo in
                                    SwiftUI.Color.clear.preference(
                                        key: LeadHeightKey.self,
                                        value: geo.size.height
                                    )
                                }
                            )
                        content()
                            .frame(maxWidth: .infinity)
                            // minHeight centres by default: short content sits in
                            // the middle, taller content grows and scrolls.
                            //
                            // The bottom safe area comes off the top of that: it
                            // is what an `.anchoredAction` footer (and the home
                            // indicator) occupies, and centring in the height
                            // INCLUDING it puts the block half a footer too low —
                            // which is how "centred" ends up glued to the button.
                            .frame(minHeight: max(
                                0,
                                proxy.size.height - leadHeight - proxy.safeAreaInsets.bottom
                            ))
                    }
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .onPreferenceChange(LeadHeightKey.self) { leadHeight = $0 }
    }
}

private struct LeadHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Height distribution (rule 2 · *llenar*)

/// The `llena` strategy of the contract's §6.1, made reusable — the sibling
/// `CenteredScreen` never had.
///
/// `llena` means "esto se adapta a lo que haya": when the content does not reach
/// the bottom, the leftover goes INTO the content (whichever child declares
/// `.frame(maxHeight: .infinity)` absorbs it); when it outgrows the screen, it
/// scrolls from the top. Both halves matter — a plain `ScrollView` only does the
/// second, which is how a screen ends up piled at the top with dead height
/// underneath, and a plain `VStack` only does the first, which clips at large
/// Dynamic Type.
///
/// The mechanic: propose the visible height as a `minHeight` to the content. A
/// stack holding a flexible child ACCEPTS that proposal and hands the slack to
/// that child; a stack that outgrows it reports its natural height and the
/// `ScrollView` takes over. The bottom safe area is subtracted for the same
/// reason `CenteredScreen` subtracts it: an `.anchoredAction` footer lives there,
/// and filling the height INCLUDING it pushes the last row under the button.
///
/// Callers own the padding — this only decides the height.
struct FillingScreen<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content()
                    .frame(
                        maxWidth: .infinity,
                        minHeight: max(0, proxy.size.height - proxy.safeAreaInsets.bottom)
                    )
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

extension CenteredScreen where Lead == EmptyView {
    /// Pinned header + centred body. No title block to hold at the top.
    init(
        @ViewBuilder head: @escaping () -> Head,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(head: head, lead: { EmptyView() }, content: content)
    }
}

extension CenteredScreen where Head == EmptyView, Lead == EmptyView {
    /// The headless form — the content owns the whole screen.
    init(@ViewBuilder content: @escaping () -> Content) {
        self.init(head: { EmptyView() }, lead: { EmptyView() }, content: content)
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
/// muted SF symbol (or a richer `figure`), a title, a sentence, and — always —
/// the way out.
///
/// Never mock data. Never a dead end: `exit` has no default value precisely so
/// that every call site has to decide.
///
/// Lives here, next to the other shared atoms, because it is used across
/// Carreras, Dobles and the station/analytics detail screens — it used to be
/// declared at the bottom of `CarrerasView.swift`, which is how a shared
/// component ends up looking like one tab's private business.
///
/// EXTENDED 30-jul, adopting it in the tests hub / chat / analytics. Three gaps
/// showed up the moment three more screens tried to use it as-is, and all three
/// are resolved HERE rather than in a local variant (contrato §0/§1):
///
///   · `figure` — a symbol cannot say everything. §6.2 bis wants a COUNTER
///     painted in zero ("0 tests calibrados"), and the chat's empty state wants
///     the coach's real avatar. Both used to be reasons to hand-roll the whole
///     block. Defaults to nothing, so the thirty symbol call sites are untouched.
///   · `note` — an exit and an explanation are not mutually exclusive. "Pruébate
///     por tu cuenta" is what the athlete can do NOW; "los tests los programa tu
///     coach" is the half that does not depend on them. The enum cannot carry it
///     (Swift has no default arguments on enum cases, so adding one would churn
///     every existing `.action` call site), so it rides alongside — and renders
///     through the SAME note box as `.explained`: one implementation, two
///     positions.
///   · `eyebrow` — WHICH surface is empty, for a state that degrades from a
///     named section ("Calibración", "Carrera") instead of owning the screen.
struct RedesignEmptyState<Figure: View>: View {
    /// Tracked micro-label above the mark. Nil when the screen is self-evident.
    var eyebrow: String? = nil
    /// The muted SF symbol. Nil when `figure` carries the mark instead.
    var symbol: String? = nil
    let title: String
    let message: String
    /// The way out. Required.
    let exit: EmptyStateExit
    /// The sentence UNDER the exit: the part of the answer that does NOT depend
    /// on the athlete. Leave nil with `.explained` — there the note IS the exit,
    /// and setting both prints the same sentence twice.
    var note: String? = nil
    /// Muted by default. Override only when the emptiness itself carries meaning
    /// — "sin molestias registradas" is good news, and its shield reads green.
    var symbolColor: Color = Theme.Color.faint
    /// The mark, when a symbol cannot say it. `EmptyView` by default.
    let figure: Figure

    /// The figure form: the mark is a view you build (a counter, an avatar).
    init(
        eyebrow: String? = nil,
        title: String,
        message: String,
        exit: EmptyStateExit,
        note: String? = nil,
        @ViewBuilder figure: () -> Figure
    ) {
        self.eyebrow = eyebrow
        self.symbol = nil
        self.title = title
        self.message = message
        self.exit = exit
        self.note = note
        self.figure = figure()
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            if let eyebrow {
                LabelText(text: eyebrow, color: Theme.Color.accentText)
            }
            if let symbol {
                Image(systemName: symbol)
                    .font(.system(size: 34, weight: .regular))
                    .foregroundStyle(symbolColor)
            }
            figure
            Text(title)
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(message)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            exitView
            // Only alongside an action: with `.explained` the exit already IS
            // this box, and printing it twice is how a scaffold starts lying.
            if let note, !exitIsExplained {
                noteBox(note)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var exitIsExplained: Bool {
        if case .explained = exit { return true }
        return false
    }

    @ViewBuilder
    private var exitView: some View {
        switch exit {
        case let .action(title, perform):
            ExpertPrimaryButton(title: title.uppercased(), height: 50, action: perform)
                .padding(.top, Theme.Spacing.xs)
                .padding(.horizontal, Theme.Spacing.m)
        case let .explained(note):
            noteBox(note)
        }
    }

    /// The quiet "this is what has to happen, and who does it" box. ONE
    /// implementation, used both as the exit itself (`.explained`) and as the
    /// footnote under an action (`note`).
    private func noteBox(_ note: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
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
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
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

extension RedesignEmptyState where Figure == EmptyView {
    /// The symbol form — what almost every empty state in the app uses. Argument
    /// order is unchanged from before the `figure` slot existed, so the thirty
    /// existing call sites keep compiling untouched.
    init(
        symbol: String,
        title: String,
        message: String,
        exit: EmptyStateExit,
        note: String? = nil,
        symbolColor: Color = Theme.Color.faint,
        eyebrow: String? = nil
    ) {
        self.eyebrow = eyebrow
        self.symbol = symbol
        self.title = title
        self.message = message
        self.exit = exit
        self.note = note
        self.symbolColor = symbolColor
        self.figure = EmptyView()
    }
}

// MARK: - Fila de dato (§4 y §6.2 bis, hechos componente)

/// Lo que una fila sabe de su número.
///
/// Son TRES estados y no dos a propósito. Mientras la fuente carga no hay ni
/// cifra ni invitación: enseñar la invitación antes de saber si hay dato es
/// prometer un hueco que a lo mejor no existe, y enseñar un guion es inventarse
/// una medida (§7). El estado intermedio se pinta como lo que es — todavía no lo
/// sabemos — con el mismo `redacted` que ya usa la fila de modalidad de Perfil.
enum EstadoDelDato: Equatable {
    /// La fuente aún no ha contestado.
    case cargando
    /// Hay cifra. `sufijo` es su unidad o el resto del contador («kg», «de 4»);
    /// `pie` dice de dónde sale, que es lo que convierte un número en un dato.
    case valor(cifra: String, sufijo: String?, pie: String?)
    /// No hay cifra. La `invitacion` dice QUÉ ACTO la llena — no qué hay dentro
    /// de la puerta. Se usa sólo cuando el atleta puede llenarla (§6.2 bis).
    case vacio(invitacion: String)

    /// Azúcar para el caso normal: `.valor("245", sufijo: "kg", pie: "peso muerto")`.
    static func valor(_ cifra: String, sufijo: String? = nil, pie: String? = nil) -> EstadoDelDato {
        .valor(cifra: cifra, sufijo: sufijo, pie: pie)
    }

    var hayDato: Bool { if case .valor = self { return true } else { return false } }
}

/// UNA fila que enseña su cifra — la pieza que faltaba y por la que Perfil llevaba
/// cinco puertas con la etiqueta de lo que hay dentro en vez de los números que el
/// atleta viene a ver.
///
/// Fija de una vez las dos reglas que se incumplían a mano en cada pantalla:
///
///   · **§4 — el dato pesa más que su etiqueta.** 22 mono contra 13: la etiqueta
///     BAJA cuando hay cifra, y sube a voz principal cuando la fila está vacía,
///     porque entonces el sujeto de la fila es ella. Una fila con etiqueta y valor
///     al mismo tamaño no tiene jerarquía, tiene dos textos.
///   · **§6.2 bis — un hueco se declara o se calla.** El subtítulo explicativo
///     sólo sobrevive cuando NO hay dato, y entonces es una invitación con el acto
///     que la llena. Con dato, el sitio del subtítulo lo ocupa el número.
///
/// El valor escala con el texto del sistema (`MonoText(escala:)`): va en la misma
/// fila que una etiqueta que escala, y si no escalara con ella a tamaño accesible
/// la etiqueta acabaría pesando más que el dato — el §4 al revés.
struct FilaDato<Accesorio: View>: View {
    let etiqueta: String
    /// Segunda línea de la izquierda que se pinta SIEMPRE (la antigüedad de una
    /// marca, su sello de origen). Distinta de la `invitacion`, que sólo existe
    /// cuando no hay dato.
    var detalle: String? = nil
    let estado: EstadoDelDato
    /// Regla vertical de color a la izquierda — el grupo al que pertenece la fila.
    var acento: Color? = nil
    /// Pinta la cifra en el color de acento. Para el contador que aún no está
    /// completo: es la fila que pide un acto.
    var destacaValor: Bool = false
    var muestraChevron: Bool = true
    /// Adorno a la izquierda del chevron — una `PillChip` de estado, por ejemplo.
    @ViewBuilder var accesorio: () -> Accesorio

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            if let acento {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(acento)
                    .frame(width: 3, height: 30)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(etiqueta)
                    .scaledFont(
                        estado.hayDato ? 13 : 15,
                        weight: estado.hayDato ? .medium : .semibold,
                        relativeTo: estado.hayDato ? .footnote : .subheadline
                    )
                    .foregroundStyle(estado.hayDato ? Theme.Color.muted : Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let detalle {
                    Text(detalle)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if case let .vacio(invitacion) = estado {
                    Text(invitacion)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: Theme.Spacing.s)

            accesorio()

            switch estado {
            case .cargando:
                // Ni cifra ni invitación: todavía no sabemos cuál de las dos toca.
                MonoText(text: "00", size: 22, weight: .bold, escala: true)
                    .redacted(reason: .placeholder)
            case let .valor(cifra, sufijo, pie):
                VStack(alignment: .trailing, spacing: 1) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        MonoText(
                            text: cifra,
                            size: 22,
                            weight: .bold,
                            color: destacaValor ? Theme.Color.accentText : Theme.Color.foreground,
                            escala: true
                        )
                        .lineLimit(1)
                        if let sufijo {
                            Text(sufijo)
                                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    if let pie {
                        Text(pie)
                            .scaledFont(11, weight: .medium, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                            .multilineTextAlignment(.trailing)
                    }
                }
            case .vacio:
                EmptyView()
            }

            if muestraChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: 58)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiquetaAccesible)
        .accessibilityAddTraits(muestraChevron ? .isButton : [])
    }

    private var etiquetaAccesible: String {
        var partes = [etiqueta]
        if let detalle { partes.append(detalle) }
        switch estado {
        case .cargando:
            partes.append("cargando")
        case let .valor(cifra, sufijo, pie):
            partes.append([cifra, sufijo].compactMap { $0 }.joined(separator: " "))
            if let pie { partes.append(pie) }
        case let .vacio(invitacion):
            partes.append("sin dato")
            partes.append(invitacion)
        }
        return partes.joined(separator: ", ")
    }
}

extension FilaDato where Accesorio == EmptyView {
    init(
        etiqueta: String,
        detalle: String? = nil,
        estado: EstadoDelDato,
        acento: Color? = nil,
        destacaValor: Bool = false,
        muestraChevron: Bool = true
    ) {
        self.init(
            etiqueta: etiqueta,
            detalle: detalle,
            estado: estado,
            acento: acento,
            destacaValor: destacaValor,
            muestraChevron: muestraChevron,
            accesorio: { EmptyView() }
        )
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
