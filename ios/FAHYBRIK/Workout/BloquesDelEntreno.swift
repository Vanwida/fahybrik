import SwiftUI

/// Los bloques del entreno. Sobre el bloque actual: guardar, saltar o reiniciar.
/// Sobre cualquier otro: ir a él. No toca el guardado del entreno entero.
struct BloquesDelEntreno: View {
    @Bindable var session: WorkoutSession
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.m) {
                    ForEach(session.bloques) { bloque in
                        tarjeta(bloque)
                    }
                }
                .padding(Theme.Spacing.l)
            }
            .background(Theme.Color.background)
            .navigationTitle("Bloques")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { onClose() }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
        }
    }

    private func esElActual(_ b: WorkoutBlockRegion) -> Bool {
        session.currentBlockRegion?.id == b.id
    }

    @ViewBuilder
    private func tarjeta(_ bloque: WorkoutBlockRegion) -> some View {
        let actual = esElActual(bloque)
        let conTrabajo = session.bloqueTieneTrabajo(bloque)

        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text(bloque.title)
                    .font(.system(size: 17, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: Theme.Spacing.s)
                if conTrabajo {
                    etiqueta("GUARDADO", color: Theme.Color.accentText)
                } else if actual {
                    etiqueta("AHORA", color: Theme.Color.foreground)
                }
            }

            // Los movimientos del bloque, con su dosis y lo que ya está hecho.
            // Es lo que el atleta no podía ver mientras entrenaba: con cinco
            // ejercicios de fuerza no se acordaba de cuál era el último.
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(session.plan.segments(in: bloque).enumerated()), id: \.offset) { i, mov in
                    let indice = bloque.firstIndex + i
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: icono(indice: indice))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(color(indice: indice))
                            .frame(width: 16)
                        Text(mov.title)
                            .font(.system(size: 15, weight: indice == session.currentSegmentIndex ? .bold : .medium))
                            .foregroundStyle(indice == session.currentSegmentIndex
                                             ? Theme.Color.foreground : Theme.Color.muted)
                        Spacer(minLength: 8)
                        if let d = dosis(mov) {
                            Text(d)
                                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
            }

            if actual {
                HStack(spacing: Theme.Spacing.s) {
                    accion("Guardar", "checkmark") { session.guardarBloqueYSeguir(); onClose() }
                    accion("Saltar", "forward.end") { session.saltarBloque(); onClose() }
                    accion("Reiniciar", "arrow.counterclockwise") { session.reiniciarBloque(); onClose() }
                }
            } else {
                accion(conTrabajo ? "Volver a este bloque" : "Empezar por aquí", "play.fill") {
                    session.irAlBloque(bloque)
                    onClose()
                }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(actual ? Theme.Color.accentText : Theme.Color.hairlineStrong, lineWidth: actual ? 2 : 1)
        )
    }

    /// Hecho, en curso, o por hacer. Un movimiento está hecho cuando dejó vuelta.
    private func hecho(_ indice: Int) -> Bool {
        guard indice < session.plan.segments.count else { return false }
        let id = session.plan.segments[indice].id
        return session.laps.contains { $0.segmentId == id }
    }

    private func icono(indice: Int) -> String {
        if hecho(indice) { return "checkmark.circle.fill" }
        if indice == session.currentSegmentIndex { return "circle.dotted" }
        return "circle"
    }

    private func color(indice: Int) -> Color {
        if hecho(indice) { return Theme.Color.ok }
        if indice == session.currentSegmentIndex { return Theme.Color.accentText }
        return Theme.Color.faint
    }

    /// La dosis en corto, la que el atleta necesita para saber qué le espera.
    private func dosis(_ seg: WorkoutSegment) -> String? {
        guard let p = seg.prescription else { return nil }
        if let sets = p.sets, !sets.isEmpty {
            if let m = sets.first?.measure {
                switch m {
                case .reps(let n, _):          return "\(sets.count)×\(n)"
                case .distance(let metros, _): return "\(sets.count)×\(Int(metros)) m"
                case .duration(let s, _):      return "\(sets.count)×\(Int(s))s"
                case .calories(let c, _):      return "\(sets.count)×\(Int(c)) cal"
                default:                       return "\(sets.count) series"
                }
            }
            return "\(sets.count) series"
        }
        return nil
    }

    private func etiqueta(_ texto: String, color: Color) -> some View {
        Text(texto)
            .font(.system(size: 11, weight: .heavy, design: .monospaced))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.14), in: Capsule())
    }

    private func accion(_ titulo: String, _ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            HStack(spacing: 6) {
                Image(systemName: icono).font(.system(size: 13, weight: .bold))
                Text(titulo).font(.system(size: 15, weight: .bold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(Theme.Color.surfaceElevated, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .foregroundStyle(Theme.Color.foreground)
        }
        .buttonStyle(.plain)
    }
}
