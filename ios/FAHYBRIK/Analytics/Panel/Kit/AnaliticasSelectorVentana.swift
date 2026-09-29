import SwiftUI

// EL SELECTOR DE VENTANA (A4) — 7 d · 4 sem · 12 sem · 6 m · 1 a · Todo. Uno
// activo en fondo sobre tinta (como los chips del vivo). Nunca naranja: no es
// una acción. Cada píldora nace del ancho de su texto más su margen y crece a
// partes iguales con lo que sobra: a 390 cabe «12 sem» entero, que en seis
// columnas iguales se cortaba por los dos lados. El texto NUNCA se trunca ni
// se encoge (suelo 15 pt).

private typealias TA = AnaliticasTokens.TA
private typealias C = AnaliticasColor

/// Aire a cada lado del texto de una píldora.
private let pildoraPadding: CGFloat = 8

struct AnaliticasSelectorVentana: View {
    @Binding var ventana: VentanaClave

    var body: some View {
        AnaliticasSegmento(
            items: VentanaClave.todas.map { ($0, $0.etiqueta) },
            valor: $ventana,
            etiqueta: "Periodo",
            completo: true
        )
    }
}

/// Conmutador de vista (Carga · Horas; Remo · Ski · Bici). Mismo cromo que el
/// selector de ventana. `completo` lo estira a lo ancho; sin él, ocupa lo que
/// ocupan sus textos.
struct AnaliticasSegmento<V: Hashable>: View {
    let items: [(V, String)]
    @Binding var valor: V
    let etiqueta: String
    var completo = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items.indices, id: \.self) { i in
                let item = items[i]
                let activo = item.0 == valor
                Button {
                    if !activo { valor = item.0 }
                } label: {
                    Text(item.1)
                        .font(.system(size: TA.chip.cuerpo, weight: .semibold).monospacedDigit())
                        .foregroundStyle(activo ? C.fondo : C.tinta2)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, pildoraPadding + (completo ? 0 : 4))
                        .frame(maxWidth: completo ? .infinity : nil, minHeight: TA.chip.alto - 6, maxHeight: TA.chip.alto - 6)
                        .background(activo ? C.tinta : .clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(activo ? [.isSelected] : [])
                .accessibilityLabel(item.1)
            }
        }
        .padding(3)
        .frame(maxWidth: completo ? .infinity : nil)
        .background(C.superficie, in: Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel(etiqueta)
    }
}
