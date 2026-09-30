import SwiftUI

// EL «‹ VOLVER» — la vuelta de un detalle, a la izquierda y fija.
//
// «‹ Analíticas»: un detalle no lleva la barra de pestañas propia (la pantalla entera es para el dato), así
// que la vuelta tiene que estar siempre a la vista, en el acento del club, con 48 pt de área táctil y su
// nombre accesible («Volver a Analíticas»). Es lo que una hoja resuelve con su cierre (`MarcoDeHojaDia`);
// esto es para una pantalla empujada en la navegación.
//
//     AtrasDia(texto: "Analíticas", accion: { volver() })

struct AtrasDia: View {
    let texto: String
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            HStack(spacing: 2) {
                IconoDia(.atras, tam: 20, peso: .bold)
                Text(texto).papel(.cuerpoFuerte)
            }
            .foregroundStyle(Theme.Color.accentText)
            .padding(.leading, Theme.Spacing.xs)
            .padding(.trailing, Theme.Spacing.m + 2)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityLabel("Volver a \(texto)")
    }
}

#if DEBUG
#Preview("Atrás · fábrica") { EnAmbasDia { GaleriaDia.Filas() } }
#Preview("Atrás · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Filas() } }
#endif
