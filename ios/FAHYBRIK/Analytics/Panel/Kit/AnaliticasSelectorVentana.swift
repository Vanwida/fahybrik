import SwiftUI

// EL SELECTOR DE VENTANA (A4) — 7 d · 4 sem · 12 sem · 6 m · 1 a · Todo. Un
// conmutador de contorno con el elegido en el ACENTO DEL CLUB (el mismo
// segmentado que Carreras). Cada opción nace del ancho de su texto más su aire y
// crece a partes iguales con lo que sobra: a 390 pt cabe «12 sem» entero. El
// texto NUNCA se trunca ni se encoge (suelo 15 pt); con el texto del sistema muy
// grande, donde ni así caben las seis, la tira se desliza en horizontal en vez de
// ensanchar la pantalla.

struct AnaliticasSelectorVentana: View {
    @Binding var ventana: VentanaClave

    var body: some View {
        AnaliticasSegmento(
            items: VentanaClave.todas.map { ($0, $0.etiqueta) },
            valor: $ventana,
            etiqueta: "Periodo",
            completo: true,
            compacto: true
        )
    }
}

/// Conmutador de vista (Periodo; Carga · Horas; Remo · Ski · Bici). `completo` lo estira a lo
/// ancho; sin él, ocupa lo que ocupan sus textos. `compacto` recorta el aire de cada opción
/// (seis periodos a 390 pt).
struct AnaliticasSegmento<V: Hashable>: View {
    let items: [(V, String)]
    @Binding var valor: V
    let etiqueta: String
    var completo = false
    var compacto = false

    private static var radioDeOpcion: CGFloat { 12 }
    private static var altoDeOpcion: CGFloat { 44 }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        ViewThatFits(in: .horizontal) {
            fila
            ScrollViewReader { lector in
                ScrollView(.horizontal, showsIndicators: false) { fila }
                    .onAppear { lector.scrollTo(valor, anchor: .center) }
                    .onChange(of: valor) { _, nuevo in withAnimation { lector.scrollTo(nuevo, anchor: .center) } }
            }
        }
        .padding(Theme.Spacing.xs)
        .background(Theme.Color.surface, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(etiqueta)
    }

    private var fila: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(items.indices, id: \.self) { i in
                opcion(items[i])
            }
        }
        .frame(maxWidth: completo ? .infinity : nil)
    }

    private func opcion(_ item: (V, String)) -> some View {
        let activo = item.0 == valor
        return Button {
            if !activo { valor = item.0 }
        } label: {
            Text(item.1)
                .papel(.notaPesada)
                .foregroundStyle(activo ? Theme.Color.accentOn : Theme.Color.foreground)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, compacto ? Theme.Spacing.s : 14)
                .frame(maxWidth: completo ? .infinity : nil, minHeight: Self.altoDeOpcion)
                .background {
                    if activo {
                        RoundedRectangle(cornerRadius: Self.radioDeOpcion, style: .continuous).fill(Theme.Color.accent)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: Self.radioDeOpcion, style: .continuous))
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .id(item.0)
        .accessibilityAddTraits(activo ? [.isSelected] : [])
        .accessibilityLabel(item.1)
    }
}

#if DEBUG
private struct AnaliticasSelectorPreview: View {
    @State private var ventana: VentanaClave = .doceSemanas
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            AnaliticasSelectorVentana(ventana: $ventana)
            AnaliticasSegmento(items: [(0, "Carga"), (1, "Horas")], valor: .constant(0), etiqueta: "Carga u horas")
        }
    }
}

#Preview("Selector · fábrica") { EnAmbasDia { AnaliticasSelectorPreview() } }
#Preview("Selector · club azul") { EnAmbasDia(club: .pruebaAzul) { AnaliticasSelectorPreview() } }
#endif
