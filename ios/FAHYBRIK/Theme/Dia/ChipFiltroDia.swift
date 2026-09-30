import SwiftUI

// EL CHIP DE FILTRO — un control que se elige, y la fila que los agrupa.
//
// `InfoPill` es una LECTURA (un dato con forma de pastilla); esto es un CONTROL: 44 pt, elegido = relleno
// del acento con su tinta encima, sin elegir = cara con contorno. El estado va también en el rasgo
// «seleccionado» (el color solo no basta, §4.2). `FilaChipsDia` los pone en su fila con su etiqueta, y
// scrollea en horizontal cuando no caben.
//
//     FilaChipsDia("Familia") {
//         ChipFiltroDia(texto: "Todas", elegido: familia == nil) { familia = nil }
//     }

struct ChipFiltroDia: View {
    let texto: String
    let elegido: Bool
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            Text(texto)
                .papel(.rotulo)
                .foregroundStyle(elegido ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.l)
                .frame(minHeight: 44)
                .background(elegido ? Theme.Color.accent : Theme.Color.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(elegido ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityAddTraits(elegido ? [.isSelected, .isButton] : .isButton)
    }
}

/// Una fila de chips con su etiqueta, que scrollea en horizontal cuando no caben.
struct FilaChipsDia<Contenido: View>: View {
    let etiqueta: String
    let contenido: Contenido

    init(_ etiqueta: String, @ViewBuilder contenido: () -> Contenido) {
        self.etiqueta = etiqueta
        self.contenido = contenido()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta).papel(.etiqueta).foregroundStyle(Theme.Color.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.Spacing.s) { contenido }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.bottom, 2)
            }
            // La fila llega al borde de la hoja: el margen lateral lo pone su contenido.
            .padding(.horizontal, -Theme.Spacing.pantalla)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(etiqueta)
    }
}

#if DEBUG
#Preview("Chips de filtro · fábrica") { EnAmbasDia { GaleriaDia.Formulario() } }
#Preview("Chips de filtro · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Formulario() } }
#endif
