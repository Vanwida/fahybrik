import SwiftUI

// EL DIÁLOGO — una pregunta que se contesta ahora, sobre el velo, sin salir de la pantalla.
//
// Lo que en el entreno en vivo no puede ser una hoja: terminar, salir, pausar, reanudar. Una tarjeta del
// día (`tarjetaDia`) centrada sobre el velo, con el título a 20 pt, lo que pasa si eliges (`apoyo`) y debajo
// las salidas: UNA acción (`BotonAccionDia`, la que se espera) y, bajo ella, las discretas (`BotonTextoDia`).
// El peligro va en la marca (el triángulo) y en la palabra de peligro del botón, jamás en el título.
//
// El velo NO cierra el diálogo por sí solo: `alTocarFondo` lo decide quien lo monta (en el entreno, tocar fuera
// es «seguir», la salida segura; al terminar, no hay salida por el velo porque es una decisión de verdad).
// Con tamaños de texto grandes la tarjeta se desliza en lugar de salirse de la pantalla.
//
//     DialogoDia("¿Salir del entreno?", apoyo: "Llevas 2 de 5 bloques hechos.", alTocarFondo: seguir) {
//         BotonAccionDia("Seguir entrenando", relleno: .acento, completa: true, accion: seguir)
//         BotonTextoDia("Descartar entreno", tono: .peligro, centrado: true, accion: descarta)
//     }
struct DialogoDia<Salidas: View>: View {
    let titulo: String
    var apoyo: String?
    /// Lo que se va a perder si se sigue adelante: pone la marca de peligro sobre el título.
    var peligro: Bool
    var alTocarFondo: (() -> Void)?
    let salidas: Salidas

    init(
        _ titulo: String,
        apoyo: String? = nil,
        peligro: Bool = false,
        alTocarFondo: (() -> Void)? = nil,
        @ViewBuilder salidas: () -> Salidas
    ) {
        self.titulo = titulo
        self.apoyo = apoyo
        self.peligro = peligro
        self.alTocarFondo = alTocarFondo
        self.salidas = salidas()
    }

    var body: some View {
        ZStack {
            Theme.Color.scrim
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { alTocarFondo?() }
                .accessibilityHidden(true)
            ViewThatFits(in: .vertical) {
                tarjeta
                ScrollView { tarjeta }
                    .scrollBounceBehavior(.basedOnSize)
            }
            .frame(maxWidth: 420)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.xl)
        }
        .accessibilityAddTraits(.isModal)
    }

    private var tarjeta: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                if peligro {
                    IconoDia(.alerta, tam: 22)
                        .foregroundStyle(Theme.Color.danger)
                }
                Text(titulo)
                    .papel(.subtitulo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let apoyo {
                    Text(apoyo)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            salidas
        }
        .padding(Theme.Spacing.l + Theme.Spacing.xs)
        .tarjetaDia(alAncho: true)
    }
}

#if DEBUG
#Preview("Diálogo · fábrica") { EnAmbasDia { GaleriaDia.Dialogos() } }
#Preview("Diálogo · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Dialogos() } }
#endif
