import SwiftUI

// LAS PIEZAS DE DOBLES — lo que comparten las pantallas de la pareja con el kit del día.
//
// Dobles son cinco superficies (la semana conectada, entrenar a la vez, las analíticas de los dos, la
// simulación y el predicho de carrera) que antes se montaban cada una su cabecera, su tarjeta, su pastilla
// y su botón a 10-14 pt. Aquí se dicen una vez, con los papeles y las superficies de «El día»; lo que ya
// existe en el kit (`FichaDia`, `BotonCromoDia`, `InfoPill`, `TeselaDia`…) se usa tal cual.
//
// EL COLOR DE LA PAREJA. El atleta es el acento del club; la pareja es `Theme.Color.partner` (el azul de
// información, que no toca el club). El color dice QUIÉN, nunca cuánto de bien: el texto que va sobre un
// tinte es la tinta del tema (un azul o un acento claro sobre su propio tinte no llega a AA).
//
// Candidatas a subir a `Theme/Dia` si otra pantalla las necesita (lo decide quien consolida el kit):
// la cara de tarjeta con tinte (`caraDobles`), la cabecera con salida y el botón de acción a todo el ancho.

// MARK: - El color de la pareja

extension Theme.Color {
    /// Cuánto pesa el borde de una superficie tintada respecto a su tinte (el mismo 3× que el acento).
    private static let factorBordeDelTinte: Double = 3

    /// El tinte suave de la pareja sobre una tarjeta: el azul con el alfa de fábrica. No lleva el `softAlpha`
    /// del club porque el azul de la pareja NO es el del club.
    static var partnerTint: SwiftUI.Color { tinte(partner, alfaSuaveDeFabrica, sobre: surface) }

    /// El borde de una superficie tintada con el azul de la pareja.
    static var partnerTintBorde: SwiftUI.Color { partner.opacity(alfaSuaveDeFabrica * factorBordeDelTinte) }
}

// MARK: - La cara de una tarjeta de Dobles

/// De quién es lo que dice una tarjeta: neutra, del atleta (tinte del acento del club) o de la pareja (tinte azul).
enum CaraDobles {
    case neutra, acento, pareja

    fileprivate var fondo: SwiftUI.Color {
        switch self {
        case .neutra: return Theme.Color.surface
        case .acento: return Theme.Color.accentTint(sobre: Theme.Color.surface)
        case .pareja: return Theme.Color.partnerTint
        }
    }

    fileprivate var borde: SwiftUI.Color {
        switch self {
        case .neutra: return Theme.Color.hairline
        case .acento: return Theme.Color.accentTintBorde
        case .pareja: return Theme.Color.partnerTintBorde
        }
    }
}

extension View {
    /// Superficie de tarjeta plana con su tinte: la misma forma que `tarjetaDia()` (superficie, contorno fino
    /// y esquinas continuas) pero con la opción de teñirse de quien habla.
    func caraDobles(_ cara: CaraDobles = .neutra, radio: CGFloat = Theme.Radius.tarjeta) -> some View {
        let forma = RoundedRectangle(cornerRadius: radio, style: .continuous)
        return self
            .background(cara.fondo, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(cara.borde, lineWidth: 1))
    }
}

// MARK: - La cabecera de una pantalla de Dobles

/// Cómo se sale de una pantalla de Dobles: se cierra (✕ a la derecha) o se vuelve (‹ a la izquierda).
enum SalidaDobles { case cerrar, volver }

/// La cabecera fija de una pantalla de Dobles: lo que va encima del título (en el acento del club), el título
/// de pantalla, una línea de apoyo, algo a la derecha (el par de avatares) y la salida redonda. Fija arriba:
/// no se va con el scroll.
///
/// La semana conectada se abre a pantalla completa y se CIERRA (✕ a la derecha); las tres que cuelgan de ella
/// se empujan en su pila y se VUELVE (‹ a la izquierda, donde el pulgar la espera).
struct CabeceraDobles<Aparte: View>: View {
    var kicker: String?
    let titulo: String
    var apoyo: String?
    var salida: SalidaDobles
    let alSalir: () -> Void
    @ViewBuilder let aparte: () -> Aparte

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            if salida == .volver { boton }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                if let kicker {
                    Text(kicker)
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.accentText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(titulo)
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let apoyo {
                    Text(apoyo)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            aparte()
            if salida == .cerrar { boton }
        }
        // El círculo de 38 pt va centrado en su área táctil de 48: a la orilla del margen se le quita la
        // mitad de la diferencia para que el círculo, y no el área invisible, caiga en el margen.
        .padding(.leading, salida == .volver ? Theme.Spacing.pantalla - (Theme.Size.toque - 38) / 2 : Theme.Spacing.pantalla)
        .padding(.trailing, salida == .cerrar ? Theme.Spacing.pantalla - (Theme.Size.toque - 38) / 2 : Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
        .background(Theme.Color.background)
    }

    @ViewBuilder
    private var boton: some View {
        switch salida {
        case .cerrar:
            BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: { Haptics.light(); alSalir() })
        case .volver:
            BotonCromoDia(
                etiqueta: "Volver",
                accion: { Haptics.light(); alSalir() },
                icono: { Image(systemName: "chevron.left").font(.system(size: 20, weight: .semibold)) }
            )
        }
    }
}

extension CabeceraDobles where Aparte == EmptyView {
    init(kicker: String? = nil, titulo: String, apoyo: String? = nil, salida: SalidaDobles, alSalir: @escaping () -> Void) {
        self.init(kicker: kicker, titulo: titulo, apoyo: apoyo, salida: salida, alSalir: alSalir, aparte: { EmptyView() })
    }
}

// MARK: - La acción a todo el ancho

/// La acción de una pantalla de Dobles: una pastilla a todo el ancho y 56 pt de alto. La principal es de tinta
/// invertida (la acción NO compite en peso con lo que se mira, CONTRATO-UI §10.5); la secundaria es la cara
/// elevada con contorno. Sin habilitar se queda quieta y apagada.
///
/// Va en `.anchoredAction`: la puerta de la pantalla, siempre en el mismo sitio. No es `AccionDia` porque
/// aquélla cierra un sujeto y mide lo que dice; ésta es la de una pantalla de flujo.
struct AccionDobles: View {
    enum Estilo { case principal, secundaria }

    let titulo: String
    var simbolo: String?
    var estilo: Estilo = .principal
    var habilitada = true
    /// La acción está en marcha (guardar): no se puede pulsar dos veces.
    var enCurso = false
    let alTocar: () -> Void

    private static var alto: CGFloat { 56 }

    var body: some View {
        let principal = estilo == .principal
        Button {
            guard habilitada, !enCurso else { return }
            principal ? Haptics.medium() : Haptics.light()
            alTocar()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                if let simbolo {
                    Image(systemName: simbolo)
                        .font(.system(size: 18, weight: .bold))
                        .accessibilityHidden(true)
                }
                Text(titulo)
                    .papel(.accion)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(principal ? Theme.Color.background : Theme.Color.foreground)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity, minHeight: Self.alto)
            .background(principal ? Theme.Color.foreground : Theme.Color.surfaceElevated, in: Capsule())
            .overlay(Capsule().strokeBorder(principal ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(!habilitada || enCurso)
        .opacity(habilitada ? 1 : 0.4)
        .accessibilityLabel(titulo)
    }
}

// MARK: - La fila que lleva a otra pantalla

/// Una fila de tarjeta con su ficha de icono, su título, una línea de apoyo y el chevron: la puerta de la semana
/// conectada a las otras pantallas de la pareja. El nombre accesible lo pone ella; quien la envuelve (un
/// `NavigationLink`) le da el toque.
struct DoblesFilaEnlace: View {
    let simbolo: String
    let titulo: String
    let apoyo: String
    /// Una puerta que pide un acto o ya está en marcha: la ficha se rellena con el acento del club.
    var realce = false
    /// El color del glifo cuando ha de decir de quién es (el azul de la pareja). Nil = la tinta de la ficha.
    var colorDelGlifo: SwiftUI.Color?

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            FichaDia(tono: realce ? .realce : .normal) { glifo }
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(apoyo)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            IconoDia(.chevron, tam: 18)
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.l)
        .caraDobles(.neutra)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(titulo), \(apoyo)")
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var glifo: some View {
        let imagen = Image(systemName: simbolo).font(.system(size: 22, weight: .semibold))
        if let colorDelGlifo { imagen.foregroundStyle(colorDelGlifo) } else { imagen }
    }
}

// MARK: - La nota con el azul de la pareja

/// Una nota de una línea o dos con un glifo de la pareja delante: «los dos resultados quedan visibles para los
/// dos». Informa, no pide nada.
struct DoblesNota: View {
    let simbolo: String
    let texto: String

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: simbolo)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.Color.partner)
                .accessibilityHidden(true)
            Text(texto)
                .papel(.nota)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Theme.Spacing.l)
        .caraDobles(.pareja, radio: Theme.Radius.fila)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - La pastilla de la pareja

/// La pastilla de un dato que es de la pareja («Marcos», «Marcos 40 %»): el tinte azul y la tinta del tema. El
/// neutro y el del acento son `InfoPill`; esta existe porque el kit no tiene el azul de la pareja.
struct PastillaPareja: View {
    let texto: String

    var body: some View {
        Text(texto)
            .papel(.rotulo)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, Theme.Spacing.m)
            .frame(minHeight: 32)
            .background(Theme.Color.partnerTint, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.Color.partnerTintBorde, lineWidth: 1))
    }
}

// MARK: - El gap contra el objetivo

/// El gap del predicho de la pareja contra el objetivo, en una pastilla: el estado va en el tinte y en el
/// glifo, y el texto es la tinta del tema. Lo dice el servidor (`gapS`): positivo = se pasan, negativo = dentro.
struct PastillaDeGap: View {
    let gapS: Int

    private var estado: (texto: String, color: SwiftUI.Color, glifo: GlifoDia?) {
        if gapS > 0 { return ("\(GoalGapFormat.signedDuration(gapS)) sobre el objetivo", Theme.Color.warning, .sube) }
        if gapS < 0 { return ("\(GoalGapFormat.signedDuration(gapS)) bajo el objetivo", Theme.Color.ok, .baja) }
        return ("Justo en tu objetivo", Theme.Color.ok, .check)
    }

    var body: some View {
        let e = estado
        HStack(spacing: Theme.Spacing.xs + 2) {
            if let glifo = e.glifo {
                IconoDia(glifo, tam: 14, peso: .bold).foregroundStyle(e.color)
            }
            Text(e.texto)
                .papel(.notaPesada)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Theme.Color.foreground)
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(Theme.Color.tinte(e.color, 0.18, sobre: Theme.Color.surface), in: Capsule())
        .overlay(Capsule().strokeBorder(e.color.opacity(0.45), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Los átomos de la pareja (compartidos por las pantallas de Dobles)

/// El par de avatares solapados — el atleta (aro del acento) sobre la pareja (aro azul): la marca de la
/// cabecera. El atleta lee en el acento del club, la pareja en azul.
struct DoblesAvatarPair: View {
    let selfInitials: String
    let partnerInitials: String
    var size: CGFloat = 40

    var body: some View {
        // El atleta queda ENCIMA de su pareja: sus iniciales («Yo») no se pueden tapar.
        HStack(spacing: -8) {
            DoblesAthleteAvatar(initials: selfInitials, color: Theme.Color.accent, size: size).zIndex(1)
            DoblesAthleteAvatar(initials: partnerInitials, color: Theme.Color.partner, size: size)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Tú y tu compañero")
    }
}

/// Un avatar: las iniciales sobre la cara elevada, con el aro del color de quien es (acento = el atleta,
/// azul = la pareja). Decorativo: el nombre lo lleva quien lo contiene.
struct DoblesAthleteAvatar: View {
    let initials: String
    let color: SwiftUI.Color
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(Theme.Color.surfaceElevated)
            // Las iniciales son un glifo dentro de un círculo: acompañan a su tamaño, pero no bajan del suelo
            // tipográfico; el círculo más pequeño las encoge antes de cortarlas.
            Text(initials)
                .font(.system(size: max(size * 0.38, Theme.Typography.suelo), weight: .heavy))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(color, lineWidth: 2))
        .accessibilityHidden(true)
    }
}

/// La barra de reparto de dos tonos: la parte del atleta (acento) y la de la pareja (azul), que suman el
/// ancho entero. `selfShare` 0…1; la pareja es 1 − selfShare. Decorativa: quien la pone nombra la fila.
struct DoblesSplitBar: View {
    let selfShare: Double
    var height: CGFloat = 8

    private var clamped: Double { max(0, min(1, selfShare)) }

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Theme.Color.accent)
                    .frame(width: geo.size.width * CGFloat(clamped))
                Rectangle()
                    .fill(Theme.Color.partner)
                    .frame(width: geo.size.width * CGFloat(1 - clamped))
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: height / 2, style: .continuous))
        .accessibilityHidden(true)
    }
}
