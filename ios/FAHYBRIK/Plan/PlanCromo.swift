import SwiftUI

// EL CROMO DE ARRIBA DE PLAN (`PlanView.cabeceraDeNavegacion`) — a la izquierda, el chip de Dobles si hay
// pareja; a la derecha, compartir la semana, el ciclo, el historial y el chat. Fijo: no scrollea nunca.
// Sin logo (el logo vive en Hoy).
//
// El ciclo va PRIMERO de los tres iconos de siempre porque es el único que habla del plan que se está
// mirando (11-ago). «Compartir» solo con una semana real delante: sin días servidos no hay nada honesto
// que enseñar. El chat no existe sin coach. Los cuatro botones son de 48 pt y llevan su nombre accesible
// (`BotonCromoDia`). En estados sin plan (vacío, pausa, error, cargando) el cromo sigue ENTERO: el
// historial y el chat no dependen de que haya plan que enseñar.

struct PlanCromo: View {
    /// Nombre de pila de la pareja de dobles.
    let companero: String?
    /// Hay una semana con sesiones delante: se puede compartir.
    let conSemana: Bool
    let conChat: Bool
    let alDobles: () -> Void
    let alCompartir: () -> Void
    let alCiclo: () -> Void
    let alHistorial: () -> Void
    let alChat: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            if let companero {
                Button(action: { Haptics.light(); alDobles() }) {
                    HStack(spacing: Theme.Spacing.s) {
                        Circle().fill(Theme.Color.partner).frame(width: 8, height: 8)
                        Text("Dobles · \(companero)")
                            .papel(.rotulo)
                            .lineLimit(1)
                    }
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 36)
                    .background(Theme.Color.surfaceElevated, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                    .frame(minHeight: Theme.Size.toque)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Modalidad Dobles con \(companero). Ver su plan")
            }
            Spacer(minLength: Theme.Spacing.s)
            HStack(spacing: 0) {
                if conSemana {
                    BotonCromoDia(etiqueta: "Compartir la semana", accion: alCompartir) { SimboloPlan(glifo: .compartir) }
                }
                BotonCromoDia(etiqueta: "Ver el ciclo entero", accion: alCiclo) { SimboloPlan(glifo: .ciclo) }
                BotonCromoDia(.calendario, etiqueta: "Historial de entrenos", accion: alHistorial)
                if conChat {
                    BotonCromoDia(.chat, etiqueta: "Chat con tu coach", accion: alChat)
                }
            }
        }
        .padding(.leading, Theme.Spacing.pantalla)
        .padding(.trailing, Theme.Spacing.s)
        .frame(minHeight: 56)
    }
}

#if DEBUG
#Preview("Cromo de Plan · con pareja") {
    EnAmbasDia {
        PlanCromo(companero: "Biel", conSemana: true, conChat: true,
                  alDobles: {}, alCompartir: {}, alCiclo: {}, alHistorial: {}, alChat: {})
            .padding(.horizontal, -Theme.Spacing.pantalla)
    }
}
#endif
