// LO QUE SOLO TIENE LO DE ANTES DE ENTRENAR — lo que no tiene equivalente en el kit (`Theme/Dia`): la
// pastilla de una zona de pulso y la cabecera de una pantalla previa. Tarjeta, acción, botón de texto,
// botón del cromo y fila adaptable son del kit.

import SwiftUI

/// La pastilla de una zona de pulso: el punto con el color SEMÁNTICO de la zona y la zona en la tinta del
/// tema (el color de zona como texto no llega a AA sobre todas las superficies).
struct PastillaZonaPrevia: View {
    let zona: HRZone

    var body: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            Circle().fill(zona.color).frame(width: 9, height: 9)
            Text(zona.label).papel(.notaPesada)
        }
        .foregroundStyle(Theme.Color.foreground)
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(Theme.Color.surfaceSunken, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Zona \(zona.label)")
    }
}

/// La cabecera de una pantalla previa: los botones redondos del cromo a la izquierda y, a la derecha, lo
/// que haga falta (compartir, «Bloque 2 de 3»).
struct CromoPrevia<Izquierda: View, Derecha: View>: View {
    @ViewBuilder let izquierda: () -> Izquierda
    @ViewBuilder let derecha: () -> Derecha

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            izquierda()
            Spacer(minLength: Theme.Spacing.s)
            derecha()
        }
        .padding(.horizontal, Theme.Spacing.pantalla - 4)
        .padding(.top, Theme.Spacing.s)
    }
}
