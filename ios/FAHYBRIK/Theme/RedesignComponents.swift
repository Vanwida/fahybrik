import SwiftUI

// Reusable building blocks for the faithful iOS redesign (handoff:
// design_handoff_fhp/App Atleta - Flujo.dc.html). The screen agents COMPOSE
// these — they don't recreate them. Everything here is built on Theme tokens,
// our Fabrik orange (NOT the handoff red), and the SF type system; semantic
// data-viz colors (ok/warning/danger/info) stay semantic.
//
// Where a component reuses an existing atom (CardSurface, LabelText, MonoText,
// InstrumentReadout) it does so rather than duplicating. New components live
// here; shared primitives stay in Atoms.swift.

// MARK: - Modality dot

/// Small filled dot colored by modality — used in Plan day rows and compact
/// session rows. Decorative; callers provide an accessible label on the row.
struct ModalityDot: View {
    let kind: Theme.Modality.Kind
    var size: CGFloat = 8
    /// Un solo color para todas las modalidades: sobre el bloque del acento el punto de correr SERÍA el
    /// fondo (el de correr es el acento), así que ahí va en la tinta y la modalidad la dice la palabra.
    var tinta: SwiftUI.Color? = nil

    /// Desde la modalidad tal como llega del cable (o el formato de reserva).
    init(modality: String?, size: CGFloat = 8, tinta: SwiftUI.Color? = nil) {
        self.init(kind: Theme.Modality.kind(modality), size: size, tinta: tinta)
    }

    /// Desde un cubo ya resuelto: lo que hace quien ya leyó la modalidad (Hoy, el Plan rehecho).
    init(kind: Theme.Modality.Kind, size: CGFloat = 8, tinta: SwiftUI.Color? = nil) {
        self.kind = kind
        self.size = size
        self.tinta = tinta
    }

    var body: some View {
        Circle()
            .fill(tinta ?? kind.color)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: - Coach avatar

/// A circular avatar showing an initial over the chip surface. Used by the
/// publish notice, coach note row, and chat header. Falls back to a person
/// glyph when `initials` is empty.
struct CoachAvatar: View {
    let initials: String
    var size: CGFloat = 34
    var tint: Color = Theme.Color.accent
    /// La foto de perfil, cuando la hay. Se pinta ENCIMA de las iniciales, así
    /// que sin foto el avatar es exactamente el de siempre.
    var photoURL: String? = nil
    /// El avatar del atleta en «El día»: cara del color de la marca con las iniciales en su
    /// tinta (cursiva de marca), en vez de la cara elevada con el color como glifo. Es el que
    /// lleva el sujeto de Perfil; el pequeño de siempre (chat, avisos) no cambia.
    var relleno: Bool = false

    /// The initials / person glyph are GLYPHS over the (white-in-light) elevated
    /// face, so a brand-orange tint must use the text-safe role split (orange
    /// only reaches ~3:1 on white). Non-orange tints pass through unchanged.
    private var glyphTint: Color {
        if relleno { return tint == Theme.Color.accent ? Theme.Color.accentOn : Theme.Color.background }
        return tint == Theme.Color.accent ? Theme.Color.accentText : tint
    }

    var body: some View {
        ZStack {
            Circle().fill(relleno ? tint : Theme.Color.surfaceElevated)
            if initials.isEmpty {
                Image(systemName: GlifoDia.silueta.simbolo)
                    .font(.system(size: size * (relleno ? 0.46 : 0.42), weight: .semibold))
                    .foregroundStyle(glyphTint)
            } else {
                Text(initials)
                    .font(ScaledFontModifier.fuente(size: size * 0.38, weight: .heavy, italic: relleno))
                    .foregroundStyle(glyphTint)
            }
        }
        .frame(width: size, height: size)
        .overlay(AvatarPhoto(url: photoURL))
        .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
        .accessibilityHidden(true)
    }
}

/// La foto de perfil, recortada al círculo del avatar.
///
/// Va SIEMPRE encima de las iniciales, nunca en su lugar: mientras la imagen
/// viaja — y si no llega — lo que se ve es el avatar de toda la vida, no un
/// hueco. Sin URL no dibuja nada, así que ponerla de overlay es gratis en las
/// pantallas donde el atleta todavía no tiene foto.
struct AvatarPhoto: View {
    let url: String?

    /// La foto entra con un fundido corto en vez de dar un salto. Va en la
    /// transacción de `AsyncImage` porque su transacción por defecto no lleva
    /// animación: puesto como `.transition` suelto no haría nada.
    private static let fundido: Animation = .easeOut(duration: 0.2)

    var body: some View {
        if let url, let resuelta = URL(string: url) {
            AsyncImage(
                url: resuelta,
                transaction: Transaction(animation: Self.fundido)
            ) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    // Cargando, o no llegó: se deja ver el avatar de debajo.
                    Color.clear
                }
            }
            .clipShape(Circle())
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Dismissable sheet chrome
//
// A CONSISTENT escape for modally-presented content that would otherwise rely
// only on the easy-to-miss swipe-down — informational sheets with no nav bar of
// their own (the "cómo se construye tu plan" / coach / legal cards, the morning
// check-in). It wraps the content in the SAME chrome the rest of the app's
// sheets already use: a NavigationStack with an inline top-leading "Cerrar"
// bound to the environment dismiss, so every modal exits the same, findable way.
//
// The dismiss is read where the modifier is APPLIED (the sheet's content root,
// OUTSIDE the NavigationStack this introduces), so calling it closes the
// presentation — mirroring how DoblesPlanView dismisses its own cover.
extension View {
    /// Adds the app's standard top-leading "Cerrar" affordance to modal content
    /// that has no toolbar / nav bar of its own. Pass a custom `closeTitle` only
    /// when "Cerrar" doesn't fit the context.
    func dismissableSheet(closeTitle: String = "Cerrar") -> some View {
        modifier(DismissableSheetModifier(closeTitle: closeTitle))
    }
}

private struct DismissableSheetModifier: ViewModifier {
    let closeTitle: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(closeTitle) {
                            Haptics.light()
                            dismiss()
                        }
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityLabel("Cerrar")
                    }
                }
        }
    }
}
