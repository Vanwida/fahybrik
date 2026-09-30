import SwiftUI

// RX / ESCALADO EN EL RESUMEN — se declara AL TERMINAR, junto a la puntuación
// (DECISIONS 2026-09-28; patrón SmartWOD / Wodify). Una fila por bloque puntuado
// (`DeclaracionesRx.bloques`); con un solo bloque, sin su título. El dato viaja
// en `rx_scaled` / `scaled_note` de cada tramo del bloque (`ManualSegmentOverlay`).

/// RX · ESCALADO, y cómo se escaló si se escaló. El MISMO selector en el resumen y en el
/// conmutador que aún pintan dos vistas en vivo (`RxScaledToggle`): por eso su API no cambia, y
/// con la piel del día también ellas pasan a 15 pt y a toques de 48 pt.
struct SelectorRx: View {
    @Binding var nivel: NivelRx
    @Binding var nota: String

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            HStack(spacing: Theme.Spacing.s) {
                segmento("RX", .rx, accesible: "Como está escrito (RX)")
                segmento("ESCALADO", .scaled, accesible: "Escalado")
            }
            if nivel == .scaled {
                CampoTextoResumen(marcador: "¿Cómo lo escalaste? (opcional)",
                                  etiquetaAccesible: "Cómo lo escalaste",
                                  texto: $nota,
                                  lineas: 1...3)
            }
        }
    }

    private func segmento(_ titulo: String, _ valor: NivelRx, accesible: String) -> some View {
        OpcionResumen(titulo: titulo, elegida: nivel == valor, etiquetaAccesible: accesible) {
            nivel = valor
        }
    }
}

/// La tarjeta del resumen: «¿Cómo lo hiciste?» con un selector por bloque puntuado.
struct DeclaracionRxCard: View {
    let bloques: [BloqueRx]
    @Binding var declaradas: [Int: DeclaracionRx]

    var body: some View {
        TarjetaResumen(etiqueta: "¿Cómo lo hiciste?") {
            ForEach(bloques) { b in
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    if bloques.count > 1 {
                        Text(b.titulo)
                            .papel(.cuerpoFuerte)
                            .foregroundStyle(Theme.Color.foreground)
                            .accessibilityAddTraits(.isHeader)
                    }
                    SelectorRx(nivel: nivel(b.id), nota: nota(b.id))
                }
            }
        }
    }

    private func nivel(_ id: Int) -> Binding<NivelRx> {
        Binding(get: { declaradas[id]?.nivel ?? .rx },
                set: { declaradas[id, default: DeclaracionRx()].nivel = $0 })
    }

    private func nota(_ id: Int) -> Binding<String> {
        Binding(get: { declaradas[id]?.nota ?? "" },
                set: { declaradas[id, default: DeclaracionRx()].nota = $0 })
    }
}
