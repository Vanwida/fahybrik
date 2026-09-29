import SwiftUI

// EL CROMO DE HOY — «Del coach» a la izquierda, el logotipo en el centro, el chat y el avatar a la
// derecha. Fijo: no scrollea nunca.
//
// Sin coach no hay bandeja ni chat: el hueco de la izquierda se guarda para que el logotipo siga
// centrado. Cada botón es de 48 pt de toque y lleva su nombre accesible. El avatar conserva la foto
// de perfil del atleta cuando la tiene (se pinta sobre las iniciales).

struct HoyCromo: View {
    let lectura: LecturaHoy
    let acciones: HoyAcciones

    /// Alto del cromo: el botón de 48 con un punto de aire.
    private static let alto: CGFloat = 56

    private var sinResolver: Int { lectura.conCoach && !lectura.cargando ? lectura.comunicados : 0 }
    private var sinLeer: Int { lectura.cargando ? 0 : lectura.noLeidosChat }

    var body: some View {
        HStack(spacing: 0) {
            Group {
                if lectura.conCoach {
                    BotonCromoDia(
                        .bandeja,
                        etiqueta: sinResolver > 0 ? "Del coach, \(sinResolver) sin resolver" : "Del coach",
                        n: sinResolver,
                        accion: acciones.abrirComunicados
                    )
                } else {
                    Color.clear.frame(width: Theme.Size.toque, height: Theme.Size.toque)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Wordmark(size: 24)

            HStack(spacing: 0) {
                if lectura.conCoach {
                    BotonCromoDia(
                        .chat,
                        etiqueta: sinLeer > 0 ? "Chat con tu coach, \(sinLeer) sin leer" : "Chat con tu coach",
                        n: sinLeer,
                        accion: acciones.abrirChat
                    )
                }
                BotonCromoDia(etiqueta: "Tu perfil", accion: { acciones.abrirPestana(.perfil) }) {
                    avatar
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, Theme.Spacing.s)
        .frame(height: Self.alto)
    }

    /// Las iniciales, o la silueta si aún no hay nombre, con la foto por encima cuando la hay.
    @ViewBuilder
    private var avatar: some View {
        ZStack {
            if lectura.iniciales.isEmpty {
                IconoDia(.silueta, tam: 18, peso: .semibold)
            } else {
                Text(lectura.iniciales).papel(.notaPesada)
            }
            AvatarPhoto(url: lectura.fotoURL)
        }
        .frame(width: 38, height: 38)
    }
}

#if DEBUG
#Preview("Cromo · con coach") {
    EnAmbasDia { HoyCromo(lectura: HoyCasos.lectura("avisos"), acciones: .ninguna) }
}
#Preview("Cromo · sin coach") {
    EnAmbasDia { HoyCromo(lectura: HoyCasos.lectura("libre"), acciones: .ninguna) }
}
#endif
