import SwiftUI

/// Los bloques del entreno. Sobre el bloque actual: guardar, saltar o reiniciar.
/// Sobre cualquier otro: ir a él. No toca el guardado del entreno entero.
struct BloquesDelEntreno: View {
    @Bindable var session: WorkoutSession
    let onClose: () -> Void

    var body: some View {
        MarcoDeHojaDia("Bloques", cerrar: onClose) {
            VStack(spacing: Theme.Spacing.m) {
                ForEach(session.bloques) { bloque in
                    tarjeta(bloque)
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
                    .papel(.subtitulo)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: Theme.Spacing.s)
                if conTrabajo {
                    InfoPill(text: "Guardado", estilo: .acento)
                } else if actual {
                    InfoPill(text: "Ahora", estilo: .tinta)
                }
            }

            // Los movimientos del bloque, con su dosis y lo que ya está hecho.
            // Es lo que el atleta no podía ver mientras entrenaba: con cinco
            // ejercicios de fuerza no se acordaba de cuál era el último.
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                ForEach(Array(session.plan.segments(in: bloque).enumerated()), id: \.offset) { i, mov in
                    let indice = bloque.firstIndex + i
                    let enCurso = indice == session.currentSegmentIndex
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        SelloEstadoDia(estado: hecho(indice) ? .hecha : .pendiente, tam: 18,
                                       tinta: enCurso && !hecho(indice) ? Theme.Color.accentText : nil)
                        Text(mov.title)
                            .papel(enCurso ? .cuerpoFuerte : .cuerpo)
                            .foregroundStyle(enCurso ? Theme.Color.foreground : Theme.Color.muted)
                        Spacer(minLength: Theme.Spacing.s)
                        if let d = dosis(mov) {
                            Text(d)
                                .papel(.cifra)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
            }

            if actual {
                // Tres en fila si caben; con el texto grande, una debajo de otra.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: Theme.Spacing.s) { accionesDelActual }
                    VStack(spacing: Theme.Spacing.s) { accionesDelActual }
                }
            } else {
                accion(conTrabajo ? "Volver a este bloque" : "Empezar por aquí", .play) {
                    session.irAlBloque(bloque)
                    onClose()
                }
            }
        }
        .tarjetaDia(realce: actual, alAncho: true)
    }

    @ViewBuilder
    private var accionesDelActual: some View {
        accion("Guardar", .check) { session.guardarBloqueYSeguir(); onClose() }
        accion("Saltar", .flecha) { session.saltarBloque(); onClose() }
        accion("Reiniciar", .reintentar) { session.reiniciarBloque(); onClose() }
    }

    /// Hecho, en curso, o por hacer. Un movimiento está hecho cuando dejó vuelta.
    private func hecho(_ indice: Int) -> Bool {
        guard indice < session.plan.segments.count else { return false }
        let id = session.plan.segments[indice].id
        return session.laps.contains { $0.segmentId == id }
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

    private func accion(_ titulo: String, _ glifo: GlifoDia, _ alTocar: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            alTocar()
        } label: {
            AccionDia(titulo, glifo: glifo, relleno: .apagado, completa: true, alto: Theme.Size.toque, glifoAlFinal: false)
        }
        .buttonStyle(PressScaleStyle())
    }
}
