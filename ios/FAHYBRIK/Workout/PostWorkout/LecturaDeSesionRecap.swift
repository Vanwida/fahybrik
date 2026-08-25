import SwiftUI

// La tanda del recap y las acciones de abajo (card 132).
// Viven aparte de las siete capas de `LecturaDeSesionPiezas`: son el recorte
// de la ejecución, no otra historia.

struct TarjetaSerieRecap: View {
    let serie: RecapSeriesSticker

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(serie.label)
                    .scaledFont(17, weight: .bold, relativeTo: .body)
                    .italic()
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
                if let pauta = serie.pauta {
                    Text(pauta)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            ParcialesDeSerie(serie: serie)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }
}

struct ParcialesDeSerie: View {
    let serie: RecapSeriesSticker

    var body: some View {
        let cols = serie.columns == 2
            ? [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]
            : [GridItem(.flexible())]
        LazyVGrid(columns: cols, alignment: .leading, spacing: 6) {
            ForEach(serie.splits, id: \.index) { split in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(split.index)")
                        .scaledFont(15, weight: .bold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                    if let duration = split.durationS {
                        Text(Formato.clock(duration))
                            .font(.system(size: 17, weight: .bold, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer(minLength: 0)
                    if let pace = split.paceSPerKm {
                        Text(Formato.ritmo(pace, .porKm))
                            .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(split.isBest ? Theme.Color.ok : Theme.Color.muted)
                    }
                }
            }
        }
    }
}

struct AccionesRecap: View {
    let completa: Bool
    let onCompletado: () -> Void
    var onTecnica: (() -> Void)? = nil
    var onCaptura: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 8) {
            FilaAccionRecap(
                titulo: completa ? "Completado" : "Hecha a medias",
                nota: "El entreno ya está guardado.",
                accion: onCompletado
            )
            if let onTecnica {
                FilaAccionRecap(
                    titulo: "Técnica",
                    nota: "Vídeo, consejos y la nota de tu coach.",
                    accion: onTecnica
                )
            }
            if let onCaptura {
                FilaAccionRecap(
                    titulo: "Captura",
                    nota: "Garmin, Strava, Concept2… la leemos por ti.",
                    accion: onCaptura
                )
            }
        }
        .accessibilityIdentifier("acciones-recap")
    }
}

private struct FilaAccionRecap: View {
    let titulo: String
    let nota: String
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Text(nota)
                    .scaledFont(15, weight: .medium, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
