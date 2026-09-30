import SwiftUI

// LO QUE SOLO ES DE «PLAN»: la muesca que ata el día elegido del carril con la card (su geometría es la de los
// siete chips del carril, y ninguna otra pestaña tiene un carril), el color de una línea fina dentro de la card
// y el pie que solo existe cuando hay una acción que anclar. Todo lo genérico (pastilla, título, tarjeta, glifos,
// menú «···») vive en el kit del día (`Theme/Dia/`). Ninguna lleva un color clavado: todo sale de `Theme.Color`
// y de los papeles del tono.

// MARK: - La muesca

/// LA MUESCA: el hilo que ata el día elegido del carril con la card, para que se lea «esto es ese día, visto de
/// cerca». Un rombo del color de la card asomando por arriba hacia el chip elegido; vive FUERA del bloque
/// recortado (se pone en un `.overlay` del sujeto). Con el acento sólido no lleva borde (el bloque tampoco).
///
/// Los siete chips del carril son siete columnas iguales con 4 pt de hueco: el centro del `indice` cae en
/// `indice · (ancho de columna + 4) + ancho de columna / 2`.
struct MuescaPlan: View {
    let indice: Int
    let tono: TonoDia

    static let lado: CGFloat = 16
    static let hueco: CGFloat = 4

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func centro(indice: Int, ancho: CGFloat, columnas: Int = 7) -> CGFloat {
        let columna = (ancho - hueco * CGFloat(columnas - 1)) / CGFloat(columnas)
        return CGFloat(indice) * (columna + hueco) + columna / 2
    }

    var body: some View {
        let p = tono.papeles
        GeometryReader { geo in
            Rombo()
                .fill(p.fondo)
                .overlay(Rombo.Bordes().stroke(p.borde, lineWidth: 1))
                .frame(width: Self.lado, height: Self.lado)
                .rotationEffect(.degrees(45))
                .position(x: Self.centro(indice: indice, ancho: geo.size.width), y: 0)
                .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.88), value: indice)
        }
        .frame(height: 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Un cuadrado con solo la esquina de arriba a la izquierda redondeada: girado 45° es la punta hacia arriba.
    private struct Rombo: Shape {
        func path(in rect: CGRect) -> Path {
            UnevenRoundedRectangle(topLeadingRadius: 4).path(in: rect)
        }

        /// Los bordes de arriba y de la izquierda: los dos que asoman fuera de la card.
        struct Bordes: Shape {
            func path(in rect: CGRect) -> Path {
                var p = Path()
                p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
                p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 4))
                p.addQuadCurve(to: CGPoint(x: rect.minX + 4, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
                p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
                return p
            }
        }
    }
}

// MARK: - Las líneas dentro del sujeto

extension TonoDia {
    /// El color de una línea fina dentro de la card: sobre el acento sólido, un velo de su tinta; en el resto,
    /// de la tinta del tema.
    var lineaInterior: SwiftUI.Color {
        self == .accion ? Theme.Color.accentOn.opacity(0.30) : Theme.Color.foreground.opacity(0.14)
    }
}

// MARK: - El pie solo cuando hay una acción

extension View {
    /// `.anchoredAction` cuando hay algo que anclar. Sin acción (un vacío que no tiene salida, y lo dice) no hay pie:
    /// un pie vacío deja una barra muerta con su filete. El margen de las pantallas del día es 20 y el pie ancla con
    /// 16: los 4 restantes van dentro.
    @ViewBuilder
    func anclando<C: View>(si hay: Bool, @ViewBuilder _ contenido: () -> C) -> some View {
        if hay {
            anchoredAction { contenido().padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l) }
        } else {
            self
        }
    }
}
