import SwiftUI

// Pausar / Siguiente bloque / Terminar — one horizontal swipe away from the live
// screen. FH-30: en rodaje el cromo ES la lámina (Pausar naranja grande, Nuevo
// tramo, Terminar rojo abajo). La confirmación es página «¿Terminar y guardar?»,
// no un confirmationDialog. Los botones de motor ya existentes se quedan;
// «Nuevo tramo» no ejecuta motor (FH-31).
struct PauseFinishPage: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil

    @Environment(WatchWorkoutCoordinator.self) private var coordinator

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

    private var lamina: some View {
        RodajeMarco(session: session, driver: driver) {
            if confirmingFinish {
                confirmar
            } else {
                controles
            }
        }
    }

    private var controles: some View {
        VStack(spacing: 0) {
            RodajeVersales(texto: encabezado, tono: RodajeTipo.contexto)
            GeometryReader { geo in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 8) {
                        botonLamina(
                            session.isPaused ? "Reanudar" : "Pausar",
                            alto: 60,
                            fondo: WatchTheme.orange,
                            tinta: Color(red: 22/255, green: 8/255, blue: 0)
                        ) {
                            coordinator.togglePause()
                        }
                        if muestraNuevoTramo {
                            botonLamina("Nuevo tramo", alto: 52, fondo: WatchTheme.surfaceRaised, tinta: WatchTheme.ink) {
                                // FH-31: el motor no se toca. El botón existe para el cromo.
                            }
                        }
                        if session.canEndBlockEarly && session.hasBlockAfterCurrent {
                            botonLamina("Siguiente bloque", alto: 52, fondo: WatchTheme.surfaceRaised, tinta: WatchTheme.ink) {
                                session.endBlockEarly()
                            }
                        }
                        botonLamina(
                            "Terminar",
                            alto: 46,
                            fondo: Color(red: 36/255, green: 11/255, blue: 11/255),
                            tinta: WatchTheme.zoneRed,
                            borde: Color(red: 115/255, green: 35/255, blue: 35/255)
                        ) {
                            confirmingFinish = true
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: geo.size.height, alignment: .center)
                }
            }
            RodajePuntos(activa: 2)
        }
    }

    private var confirmar: some View {
        VStack(spacing: 0) {
            RodajeVersales(texto: encabezado, tono: RodajeTipo.contexto)
            Spacer(minLength: 4)
            Text("¿Terminar\ny guardar?")
                .font(.system(size: 17, weight: .heavy))
                .multilineTextAlignment(.center)
                .foregroundStyle(WatchTheme.ink)
                .padding(.horizontal, 4)
            Spacer(minLength: 4)
            VStack(spacing: 8) {
                botonLamina("Terminar", alto: 48, fondo: WatchTheme.zoneRed, tinta: Color(red: 42/255, green: 0, blue: 0)) {
                    session.finish(completeness: .partial)
                }
                botonLamina("Seguir", alto: 44, fondo: WatchTheme.surfaceRaised, tinta: WatchTheme.ink) {
                    confirmingFinish = false
                }
            }
            .padding(.bottom, 6)
        }
    }

    private var encabezado: String {
        let reloj = WatchFormat.clock(session.elapsedSeconds)
        if session.isPaused { return "en pausa · \(reloj)" }
        if session.isRunStructureActive {
            let s = RunLegDisplay.serie(legs: session.currentRunLegs ?? [], indice: session.runLegIndex)
            return "serie \(s.n) de \(s.total) · \(reloj)"
        }
        return "rodaje · \(reloj)"
    }

    /// Sólo cuando los cortes son del atleta (libre). Prescrito: el corte ya está.
    private var muestraNuevoTramo: Bool {
        RodajeVivoToca.muestraNuevoTramo(session)
    }

    private func botonLamina(
        _ titulo: String,
        alto: CGFloat,
        fondo: Color,
        tinta: Color,
        borde: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            WatchHaptics.tap()
            action()
        } label: {
            Text(titulo)
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(tinta)
                .frame(maxWidth: .infinity)
                .frame(height: alto)
                .background(fondo)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay {
                    if let borde {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(borde, lineWidth: 1.5)
                    }
                }
        }
        .buttonStyle(.plain)
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
