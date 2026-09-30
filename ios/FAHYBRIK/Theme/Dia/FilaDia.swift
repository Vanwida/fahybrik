import SwiftUI

// LA FILA — lo que se toca y lleva a otro sitio: una ficha, su título, lo que dice debajo y el chevron.
//
// Las puertas de Perfil, lo que espera una respuesta, «Predicho contra real»: la misma fila con otro
// contenido. Una fila es UN botón y se lee como una frase (`etiqueta`), no como una ficha muda, un título y
// un chevron sueltos. El alto mínimo lo pone cada diseño (72 pt si cabe la ficha con dos líneas, 76 si lleva un
// estado); el color de estado NUNCA va en el texto, va en la ficha y en el fondo (`fondo`).
//
// Dentro de una `ListaDia` la lista pone la tarjeta y el filete; suelta (`enTarjeta`), la fila pone la suya y
// la pulsación se nota en toda la tarjeta.
//
//     FilaDia(ficha: FichaDia(.reloj), titulo: "Dispositivos", etiqueta: "Dispositivos. Apple Salud conectado", alTocar: { … }) {
//         Text("Apple Salud conectado").papel(.nota).foregroundStyle(Theme.Color.muted)
//     }

struct FilaDia<Ficha: View, Detalle: View>: View {
    let ficha: Ficha
    let titulo: String
    let detalle: Detalle
    /// El nombre accesible de la fila entera.
    let etiqueta: String
    var pista: String?
    var altoMinimo: CGFloat
    var aireVertical: CGFloat
    /// Un tinte detrás de la fila (lo que pide al atleta un aviso o un peligro).
    var fondo: SwiftUI.Color
    /// La fila lleva su propia tarjeta.
    var enTarjeta: Bool
    let alTocar: () -> Void

    init(
        ficha: Ficha,
        titulo: String,
        etiqueta: String,
        pista: String? = nil,
        altoMinimo: CGFloat = 76,
        aireVertical: CGFloat = Theme.Spacing.m,
        fondo: SwiftUI.Color = .clear,
        enTarjeta: Bool = false,
        alTocar: @escaping () -> Void,
        @ViewBuilder detalle: () -> Detalle
    ) {
        self.ficha = ficha
        self.titulo = titulo
        self.etiqueta = etiqueta
        self.pista = pista
        self.altoMinimo = altoMinimo
        self.aireVertical = aireVertical
        self.fondo = fondo
        self.enTarjeta = enTarjeta
        self.alTocar = alTocar
        self.detalle = detalle()
    }

    var body: some View {
        Button {
            Haptics.light()
            alTocar()
        } label: {
            cuerpo
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiqueta)
        .accessibilityHint(pista ?? "")
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var cuerpo: some View {
        let fila = HStack(spacing: 14) {
            ficha
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                detalle
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, aireVertical)
        .frame(minHeight: altoMinimo)
        if enTarjeta {
            fila
                .tarjetaDia()
                .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        } else {
            fila
                .background(fondo)
                .contentShape(Rectangle())
        }
    }
}

#if DEBUG
#Preview("Fila · fábrica") { EnAmbasDia { GaleriaDia.Filas() } }
#Preview("Fila · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Filas() } }
#endif
