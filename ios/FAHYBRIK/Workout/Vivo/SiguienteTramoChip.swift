import SwiftUI

/// LO QUE VIENE DESPUÉS de este tramo.
///
/// Extraído de `ActiveWorkoutView` el 29-jul: las vistas en vivo del §10 montan
/// su propio marco y necesitaban el mismo chip, y una segunda copia de doce
/// líneas es exactamente como nacieron las catorce duraciones que el `Formato`
/// vino a arreglar. Una implementación, tres sitios.
///
/// Se calla solo cuando no hay nada que anunciar. NO se calla «porque no cabe»:
/// si un tramo es el último, es que de verdad no hay siguiente (§7).
struct SiguienteTramoChip: View {
    /// Nil = este era el último tramo. Entonces no se pinta nada, ni un «fin».
    let siguiente: WorkoutSegment?

    var body: some View {
        if let siguiente {
            HStack(spacing: Theme.Spacing.s) {
                LabelText(text: "Luego", color: Theme.Color.accentText, size: 10)
                Text(siguiente.title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                if let z = siguiente.targetZone {
                    ZBadge(zone: z)
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(
                // Translúcido: el tinte de zona tiene que verse DEBAJO, o el
                // ambiente se corta en una línea recta a media pantalla.
                Theme.Color.surface.opacity(0.78),
                in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .accessibilityElement(children: .combine)
        }
    }
}
