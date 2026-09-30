import SwiftUI

// LA CABECERA DEL CHAT — quién es el coach, y el cierre si el chat se levantó encima de otra pantalla.
//
// Banda 1 de las tres (cabecera fija · conversación · compositor anclado): no scrollea nunca. NO afirma presencia
// («en línea»): el backend no expone ninguna señal de si el coach está, así que decirlo sería fabricarlo. La línea
// de rol es el sustituto honesto, y sólo sale cuando sabemos su nombre (con el nombre neutro «Coach» repetiría la
// palabra).

struct CabeceraChat: View {
    let coach: IdentidadCoachChat
    /// El chat se levantó como cover o como hoja: hace falta un cierre. Como raíz no lo lleva (lo dejaría la barra).
    let conCierre: Bool
    var alCerrar: () -> Void = {}

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.m) {
                CoachAvatar(initials: coach.iniciales, size: 44, relleno: true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(coach.nombreCompleto)
                        .papel(.seccion)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                    if coach.nombre != nil {
                        Text("Coach")
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Conversación con \(coach.nombreCompleto)")
            .accessibilityAddTraits(.isHeader)

            if conCierre {
                Button {
                    Haptics.light()
                    alCerrar()
                } label: {
                    IconoDia(.cerrar, tam: 20, peso: .bold)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.92))
                .accessibilityLabel("Cerrar chat")
            }
        }
        .padding(EdgeInsets(
            top: Theme.Spacing.s,
            leading: Theme.Spacing.pantalla,
            bottom: Theme.Spacing.s,
            trailing: conCierre ? Theme.Spacing.s : Theme.Spacing.pantalla
        ))
        .frame(minHeight: 64)
        .background(Theme.Color.background)
    }
}

#if DEBUG
#Preview("Cabecera del chat") {
    EnAmbasDia {
        VStack(spacing: Theme.Spacing.l) {
            CabeceraChat(coach: IdentidadCoachChat(nombre: "Marta Ruiz"), conCierre: true)
            CabeceraChat(coach: IdentidadCoachChat(nombre: nil), conCierre: false)
        }
    }
}
#endif
