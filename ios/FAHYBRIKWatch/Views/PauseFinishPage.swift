import SwiftUI

// Pausar / Siguiente bloque / Terminar — one horizontal swipe away from the live
// screen. FH-30: en rodaje el cromo ES la lámina (Pausar naranja grande, Terminar
// rojo abajo). La confirmación es página «¿Terminar y guardar?», no un
// confirmationDialog. «Nuevo tramo» only for free runs (athlete-owned cuts).
struct PauseFinishPage: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil

    @Environment(WatchWorkoutCoordinator.self) private var coordinator

    // Sólo la confirmación del cromo de gimnasio; la lámina lleva la suya dentro
    // de `RodajeControles`.
    @State private var confirmingFinish = false

    private var esRodaje: Bool {
        session.isRunStructureActive || session.currentSegment?.kind == .running
    }

    var body: some View {
        if esRodaje {
            lamina
        } else {
            gym
        }
    }

    // MARK: - Lámina (rodaje)

    /// Las piezas (botón, confirmación, disposición) son de `RodajeControles`,
    /// compartidas con el espejo; aquí sólo van las ACCIONES del motor local.
    private var lamina: some View {
        RodajeMarco(session: session, driver: driver) {
            RodajeControles(
                encabezado: RodajeLamina.encabezadoControles(
                    RodajeLamina.Ventana(sesion: session),
                    sesionS: session.elapsedSeconds
                ),
                pausado: session.isPaused,
                onPausa: { coordinator.togglePause() },
                extras: extras,
                onTerminar: { coordinator.finishWorkout(completeness: .partial) }
            )
        }
    }

    private var extras: [RodajeControles.Extra] {
        var lista: [RodajeControles.Extra] = []
        if muestraNuevoTramo {
            lista.append(.init(titulo: "Nuevo tramo") {
                session.applyCommand(MirrorWire.CommandKind.newLap)
            })
        }
        if session.canEndBlockEarly && session.hasBlockAfterCurrent {
            lista.append(.init(titulo: "Siguiente bloque") { session.endBlockEarly() })
        }
        return lista
    }

    /// Sólo cuando los cortes son del atleta (libre). Prescrito: el corte ya está.
    private var muestraNuevoTramo: Bool {
        RodajeVivoToca.muestraNuevoTramo(session)
    }

    // MARK: - Gym / otras modalidades (cromo previo)

    private var gym: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 11) {
                actionRow(
                    title: session.isPaused ? "Reanudar" : "Pausar",
                    systemImage: session.isPaused ? "play.fill" : "pause.fill",
                    background: WatchTheme.surfaceRaised,
                    foreground: WatchTheme.ink
                ) {
                    coordinator.togglePause()
                }
                if session.canEndBlockEarly && session.hasBlockAfterCurrent {
                    actionRow(
                        title: "Siguiente bloque",
                        systemImage: "forward.end.fill",
                        background: WatchTheme.surfaceRaised,
                        foreground: WatchTheme.orange
                    ) {
                        session.endBlockEarly()
                    }
                }
                actionRow(
                    title: "Terminar",
                    systemImage: "stop.fill",
                    background: WatchTheme.zoneRed.opacity(0.18),
                    foreground: WatchTheme.zoneRed
                ) {
                    confirmingFinish = true
                }
            }
            .padding(.horizontal, 12)
        }
        .confirmationDialog(
            "¿Terminar y guardar?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("Terminar", role: .destructive) {
                session.finish(completeness: .partial)
            }
            Button("Seguir", role: .cancel) { }
        }
    }

    private func actionRow(
        title: String,
        systemImage: String,
        background: Color,
        foreground: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            WatchHaptics.tap()
            action()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .heavy))
                Text(title)
                    .font(.system(size: 16, weight: .heavy))
                Spacer(minLength: 0)
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .frame(maxWidth: .infinity)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
