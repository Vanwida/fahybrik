import SwiftUI

// LA TABLA DENSA — cifras tabulares en una tarjeta (mejores por pieza, por repeticiones, por patrón, por estación). Espejo de
// `kit-analiticas/piezas-detalle.tsx#Tabla`: cabecera a 15 pt, rayas finas, y NADA se trunca — la celda parte en dos líneas
// antes que perder una palabra.
//
// Las columnas reparten el ancho como el `1fr` del doble: a partes iguales lo que sobra tras las de ancho fijo. Es lo que
// hace que, a 390 pt y con el texto del sistema grande, una cifra no baile de una fila a otra.
//
// Accesibilidad: cada fila es UN elemento que se lee de izquierda a derecha, con el nombre de su columna delante de cada cifra
// (el rótulo de cabecera no se repite como elemento suelto).

/// Una columna de la tabla.
struct ColumnaDeTabla {
    let cabecera: String
    var alinear: HorizontalAlignment = .leading
    /// Ancho fijo en pt; sin él, comparte lo que sobra con las demás.
    var ancho: CGFloat? = nil
}

struct AnaliticasTabla<Fila: Identifiable, Celda: View>: View {
    /// Para VoiceOver: «Mejores esfuerzos por distancia».
    let etiqueta: String
    let columnas: [ColumnaDeTabla]
    let filas: [Fila]
    /// La celda de una fila en una columna (por su posición).
    @ViewBuilder let celda: (Fila, Int) -> Celda

    private static var separacion: CGFloat { 10 }

    var body: some View {
        AnaliticasSuperficie(padding: 0) {
            VStack(spacing: 0) {
                cabecera
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, 10)
                Rectangle().fill(Theme.Color.hairlineStrong).frame(height: 1)
                ForEach(Array(filas.enumerated()), id: \.element.id) { i, fila in
                    if i > 0 { Rectangle().fill(Theme.Color.hairline).frame(height: 1).padding(.horizontal, Theme.Spacing.l) }
                    HStack(alignment: .firstTextBaseline, spacing: Self.separacion) {
                        ForEach(columnas.indices, id: \.self) { c in
                            hueco(columnas[c]) { celda(fila, c) }
                        }
                    }
                    .papel(.cuerpo)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, 12)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(etiqueta)
    }

    private var cabecera: some View {
        HStack(alignment: .firstTextBaseline, spacing: Self.separacion) {
            ForEach(columnas.indices, id: \.self) { c in
                hueco(columnas[c]) {
                    Text(columnas[c].cabecera).papel(.rotulo).foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .accessibilityHidden(true)
    }

    /// El sitio de una columna: ancho fijo, o su parte del sobrante, con su alineación.
    @ViewBuilder
    private func hueco<V: View>(_ c: ColumnaDeTabla, @ViewBuilder _ contenido: () -> V) -> some View {
        let alineacion: Alignment = c.alinear == .trailing ? .trailing : .leading
        let texto: TextAlignment = c.alinear == .trailing ? .trailing : .leading
        if let ancho = c.ancho {
            contenido().multilineTextAlignment(texto).frame(width: ancho, alignment: alineacion)
        } else {
            contenido().multilineTextAlignment(texto).frame(maxWidth: .infinity, alignment: alineacion)
        }
    }
}

/// Una celda con un texto grande y, debajo, una nota de apoyo (la dosis de una estación, el cambio contra el periodo anterior).
struct AnaliticasCeldaDoble: View {
    let principal: String
    var apoyo: String? = nil
    var alinear: HorizontalAlignment = .leading
    var tono: Color = Theme.Color.foreground

    var body: some View {
        VStack(alignment: alinear, spacing: 2) {
            Text(principal).foregroundStyle(tono).fixedSize(horizontal: false, vertical: true)
            if let apoyo { AnaliticasEtiqueta(texto: apoyo) }
        }
    }
}
