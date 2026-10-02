import SwiftUI

// SIN DETALLE — la sesión llega sin ejercicios que enseñar. Dos motivos distintos y se dicen distinto (`LecturaFicha.SinDetalle`):
// el detalle no llegó (primera apertura sin red: se vuelve a abrir) o llegó sin ejercicios (el coach escribió solo la nota:
// se empieza igualmente).
//
// Se dice tal cual, con la nota del coach encima, y la salida es la de siempre: seguir, o registrarla a mano. Jamás una
// sesión inventada y sin ruta: no hay un orden que enseñar.

struct SinDetallePrevia: View {
    let motivo: LecturaFicha.SinDetalle

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            FichaDia(.bandeja)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(motivo.titular)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text(motivo.frase)
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
