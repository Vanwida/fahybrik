import SwiftUI

// #28 — el ritmo de la pareja, arriba de la semana conectada: dos teselas (sesiones juntos este mes ·
// semanas seguidas con al menos una juntos) y la tarjeta de «Última juntos». Solo presenta el bloque aditivo
// `streak`; quien la pone la pinta únicamente con historia real (`DoblesStreakBlock.hasHistory`), así que una
// pareja recién creada no ve nada.
//
// Las dos cifras son un CONTADOR: se pintan también en cero. La tesela de «este mes» es la que tiene el
// acento del club (lo que la pareja hace junta); la otra va neutra, y ninguna cambia el color del dato.
struct DoblesStreakSection: View {
    let streak: DoblesStreakBlock
    /// Nombre de pila de la pareja (la vista del plan lo sabe por `PartnerInfo`) para la línea de «Última juntos».
    let partnerName: String

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            TeselasDia {
                tesela(valor: "\(streak.jointThisMonth)", unidad: "este mes", rotulo: "Sesiones juntos", realce: true)
                tesela(valor: "\(streak.weeksStreak)", unidad: "seguidas", rotulo: "Semanas con ≥1 juntos", realce: false)
            }
            if let last = streak.lastJoint {
                ultimaJuntos(last)
            }
        }
    }

    // MARK: - Teselas

    private func tesela(valor: String, unidad: String, rotulo: String, realce: Bool) -> some View {
        TeselaDia(rotulo: rotulo, realce: realce, etiqueta: "\(valor) \(unidad), \(rotulo)") {
            VStack(alignment: .leading, spacing: 2) {
                Text(valor)
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                Text(unidad)
                    .papel(.notaFuerte)
                    .foregroundStyle(realce ? Theme.Color.foreground : Theme.Color.muted)
            }
        }
    }

    // MARK: - Última juntos

    private func ultimaJuntos(_ last: DoblesLastJoint) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline) {
                Text("Última juntos")
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.accentText)
                Spacer(minLength: Theme.Spacing.m)
                Text(DoblesJointFormat.isoDayMonth(last.date))
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.muted)
            }
            Text(last.title)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            // Cada tiempo se pinta sólo si se registró. La sesión ya pasó y no hay nada que el atleta pueda
            // hacer para recuperar un tiempo que nadie tomó: se calla (§6.2 bis). Si no hay ninguno, la fila
            // entera desaparece en vez de quedarse con dos rayas.
            if last.selfTimeS != nil || last.partnerTimeS != nil {
                HStack(spacing: Theme.Spacing.l) {
                    if let selfS = last.selfTimeS {
                        tiempo(nombre: "Tú", segundos: selfS, color: Theme.Color.accent)
                    }
                    if let partnerS = last.partnerTimeS {
                        tiempo(nombre: partnerName, segundos: partnerS, color: Theme.Color.partner)
                    }
                }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.neutra)
        .accessibilityElement(children: .combine)
    }

    /// Nombre + tiempo. Pide el tiempo NO opcional a propósito: quien llama ya decidió que existe, y así aquí
    /// no queda un hueco que rellenar. El punto es el color de quién es; el nombre va en la tinta del tema.
    private func tiempo(nombre: String, segundos: Int, color: SwiftUI.Color) -> some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            Circle().fill(color).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(nombre)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
            Text(Formato.clock(segundos))
                .papel(.notaPesada)
                .foregroundStyle(Theme.Color.foreground)
        }
    }
}
