import SwiftUI

// SIN DETALLE — el detalle de la sesión no llegó (primera apertura sin red, o una sesión sin ejercicios detallados).
//
// Se dice tal cual, con la nota del coach encima, y la salida es la de siempre: seguir, o registrarla a mano. Jamás una
// sesión inventada y sin ruta: no hay un orden que enseñar.

struct SinDetallePrevia: View {
    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            FichaDia(.bandeja)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Sin detalle de la sesión")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text("No pudimos cargar los ejercicios de esta sesión. Revisa tu conexión y vuelve a abrirla, o regístrala manualmente.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Theme.Spacing.l)
        .tarjetaDia()
        .accessibilityElement(children: .combine)
    }
}
