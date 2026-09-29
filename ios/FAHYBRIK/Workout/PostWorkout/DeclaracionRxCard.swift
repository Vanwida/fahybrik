import SwiftUI

// RX / ESCALADO EN EL RESUMEN — se declara AL TERMINAR, junto a la puntuación
// (DECISIONS 2026-09-28; patrón SmartWOD / Wodify). Una fila por bloque puntuado
// (`DeclaracionesRx.bloques`); con un solo bloque, sin su título. El dato viaja
// en `rx_scaled` / `scaled_note` de cada tramo del bloque (`ManualSegmentOverlay`).

/// RX · ESCALADO, y cómo se escaló si se escaló. El MISMO selector en el resumen y
/// en el conmutador de la vista vieja (`RxScaledToggle`).
struct SelectorRx: View {
    @Binding var nivel: NivelRx
    @Binding var nota: String

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                segmento("RX", .rx, accesible: "Como está escrito (RX)")
                segmento("ESCALADO", .scaled, accesible: "Escalado")
            }
            if nivel == .scaled {
                TextField("¿Cómo lo escalaste? (opcional)", text: $nota)
                    .scaledFont(12, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Theme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            }
        }
    }

    private func segmento(_ titulo: String, _ valor: NivelRx, accesible: String) -> some View {
        let on = nivel == valor
        return Button(action: { nivel = valor; Haptics.light() }) {
            Text(titulo)
                .font(.system(size: 12, weight: .heavy, design: .default).italic())
                .tracking(1)
                .foregroundStyle(on ? Theme.Color.accentOn : Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(on ? Theme.Color.accent : Theme.Color.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .stroke(on ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(accesible)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// La tarjeta del resumen: «¿Cómo lo hiciste?» con un selector por bloque puntuado.
struct DeclaracionRxCard: View {
    let bloques: [BloqueRx]
    @Binding var declaradas: [Int: DeclaracionRx]

    var body: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "¿Cómo lo hiciste?", size: 9)
                ForEach(bloques) { b in
                    VStack(alignment: .leading, spacing: 6) {
                        if bloques.count > 1 {
                            Text(b.titulo)
                                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        SelectorRx(nivel: nivel(b.id), nota: nota(b.id))
                    }
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
