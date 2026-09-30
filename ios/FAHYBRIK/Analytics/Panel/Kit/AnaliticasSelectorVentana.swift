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
        SegmentoDia(
            items: VentanaClave.todas.map { ($0, $0.etiqueta) },
            valor: $ventana,
            etiqueta: "Periodo",
            completo: true,
            compacto: true
        )
    }
}

#if DEBUG
private struct AnaliticasSelectorPreview: View {
    @State private var ventana: VentanaClave = .doceSemanas
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            AnaliticasSelectorVentana(ventana: $ventana)
            SegmentoDia(items: [(0, "Carga"), (1, "Horas")], valor: .constant(0), etiqueta: "Carga u horas")
        }
    }
}

#Preview("Selector · fábrica") { EnAmbasDia { AnaliticasSelectorPreview() } }
#Preview("Selector · club azul") { EnAmbasDia(club: .pruebaAzul) { AnaliticasSelectorPreview() } }
#endif
