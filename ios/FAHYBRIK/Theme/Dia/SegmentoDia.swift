import SwiftUI

// EL SEGMENTO — un conmutador de contorno con la opción elegida en el ACENTO DEL CLUB.
//
// Periodo (7 d · 4 sem · 12 sem · 6 m · 1 a · Todo), Carga · Horas, Individual · Dobles · Relevos, la
// distancia de una carrera. 44 pt por opción; la elegida rellena con el acento y su tinta encima, y va
// además en el rasgo «seleccionado» (el color solo no basta, §4.2).
//
// El texto NUNCA se trunca ni se encoge (suelo de 15 pt, CONTRATO-UI §4.1): cada opción nace del ancho de
// su texto más su aire, y con el texto del sistema muy grande, donde ni así caben todas, la tira se desliza
// en horizontal en vez de ensanchar la pantalla. `completo` la estira a lo ancho y reparte lo que sobra a
// partes iguales; `compacto` recorta el aire de cada opción (seis periodos a 390 pt). `conEtiqueta` pone su
// nombre encima, a la vista («Formato», «División»); sin él el nombre lo lee solo VoiceOver.
//
//     SegmentoDia(items: [(Modo.carga, "Carga"), (Modo.horas, "Horas")], valor: $modo, etiqueta: "Carga u horas")

struct SegmentoDia<V: Hashable>: View {
    let items: [(V, String)]
    @Binding var valor: V
    let etiqueta: String
    var completo = false
    var compacto = false
    var conEtiqueta = false

    private static var radioDeOpcion: CGFloat { 12 }
    private static var altoDeOpcion: CGFloat { 44 }

    var body: some View {
        if conEtiqueta {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                // El nombre ya lo lleva el control para VoiceOver: leerlo también aquí lo diría dos veces.
                Text(etiqueta).papel(.etiqueta).foregroundStyle(Theme.Color.muted).accessibilityHidden(true)
                control
            }
        } else {
            control
        }
    }

    private var control: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        return ViewThatFits(in: .horizontal) {
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
private struct SegmentoDePrueba: View {
    @State private var ventana = "12 sem"
    @State private var formato = "Individual"
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SegmentoDia(items: ["7 d", "4 sem", "12 sem", "6 m", "1 a", "Todo"].map { ($0, $0) }, valor: $ventana,
                        etiqueta: "Periodo", completo: true, compacto: true)
            SegmentoDia(items: ["Individual", "Dobles", "Relevos"].map { ($0, $0) }, valor: $formato,
                        etiqueta: "Formato", completo: true, conEtiqueta: true)
        }
    }
}

#Preview("Segmento · fábrica") { EnAmbasDia { SegmentoDePrueba() } }
#Preview("Segmento · club azul") { EnAmbasDia(club: .pruebaAzul) { SegmentoDePrueba() } }
#endif
