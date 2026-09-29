import SwiftUI

// EL CROMO — los botones redondos de la cabecera de una pestaña.
//
// «Del coach» a la izquierda, el chat y el avatar a la derecha (Hoy); compartir, ciclo,
// historial y chat (Plan); lo que cuelga de cada pestaña. Fijo: no scrollea nunca. Cada botón
// es de 48 pt de área táctil con un círculo de 38 dentro, y lleva SIEMPRE su nombre accesible:
// un glifo solo no le dice nada a VoiceOver.

// MARK: - La chapita

/// Un círculo elevado con contorno y un glifo (o unas iniciales) dentro: el botón del cromo y la
/// chapita de la cámara que cuelga del avatar. Decorativa: el botón que la contiene lleva el nombre.
struct ChapitaDia<Contenido: View>: View {
    var tam: CGFloat
    /// La sombra suave que la despega del avatar (la chapita de la cámara); el cromo va plano.
    var conSombra: Bool
    let contenido: Contenido

    init(tam: CGFloat = 38, conSombra: Bool = false, @ViewBuilder contenido: () -> Contenido) {
        self.tam = tam
        self.conSombra = conSombra
        self.contenido = contenido()
    }

    var body: some View {
        contenido
            .foregroundStyle(Theme.Color.foreground)
            .frame(width: tam, height: tam)
            .background(Theme.Color.surfaceElevated, in: Circle())
            .overlay(Circle().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
            .shadow(
                color: conSombra ? Theme.Shadow.cardTight.color : .clear,
                radius: Theme.Shadow.cardTight.radius,
                x: Theme.Shadow.cardTight.x,
                y: Theme.Shadow.cardTight.y
            )
            .accessibilityHidden(true)
    }
}

extension ChapitaDia where Contenido == IconoDia {
    /// La chapita con un glifo: el glifo mide algo más de la mitad del círculo.
    init(_ glifo: GlifoDia, tam: CGFloat = 38, conSombra: Bool = false) {
        self.init(tam: tam, conSombra: conSombra, contenido: { IconoDia(glifo, tam: (tam * 0.52).rounded(), peso: .semibold) })
    }
}

// MARK: - La insignia de recuento

/// El globito de recuento: el contador que RECLAMA, no el que hay. Hasta 9 el número; desde 10, «9+».
/// Va con un aro del color del lienzo para que se despegue del botón sobre el que cuelga.
struct InsigniaDia: View {
    let n: Int

    static func texto(_ n: Int) -> String { n > 9 ? "9+" : "\(n)" }

    var body: some View {
        Text(Self.texto(n))
            .papel(.notaPesada)
            .foregroundStyle(Theme.Color.accentOn)
            .padding(.horizontal, 5)
            .frame(minWidth: 22, minHeight: 22)
            .background(Theme.Color.accent, in: Capsule())
            .padding(2)
            .background(Theme.Color.background, in: Capsule())
            .accessibilityHidden(true)
    }
}

// MARK: - El botón del cromo

struct BotonCromoDia<Icono: View>: View {
    /// El nombre accesible. Obligatorio: el botón no tiene texto.
    let etiqueta: String
    /// Lo que reclama el botón (sin resolver, sin leer). 0 = sin insignia.
    var n: Int
    let accion: () -> Void
    let icono: Icono

    init(etiqueta: String, n: Int = 0, accion: @escaping () -> Void, @ViewBuilder icono: () -> Icono) {
        self.etiqueta = etiqueta
        self.n = n
        self.accion = accion
        self.icono = icono()
    }

    var body: some View {
        Button(action: accion) {
            ChapitaDia { icono }
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .overlay(alignment: .topTrailing) {
                    if n > 0 { InsigniaDia(n: n).offset(x: 2, y: -2) }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.9))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiqueta)
        .accessibilityAddTraits(.isButton)
    }
}

extension BotonCromoDia where Icono == IconoDia {
    init(_ glifo: GlifoDia, etiqueta: String, n: Int = 0, accion: @escaping () -> Void) {
        self.init(etiqueta: etiqueta, n: n, accion: accion, icono: { IconoDia(glifo, tam: 20, peso: .semibold) })
    }
}

#if DEBUG
#Preview("Cromo · fábrica") { EnAmbasDia { GaleriaDia.Cabecera() } }
#Preview("Cromo · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Cabecera() } }
#endif
