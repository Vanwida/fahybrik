import SwiftUI

// LA MUÑECA EN ESPEJO: el móvil lleva el motor y la muñeca pinta.
//
// Con plan y cursor del móvil, la muñeca pinta la MISMA pila que en solitario (`MunecaEspejo`, decidido por
// `CaraDelEspejo`): correr, fuerza, ergo, WOD, circuito y dobles, con pausa, descanso, 3-2-1 y «sesión completada»
// dentro del cuadro. Este fichero solo lleva lo que la pila no cubre:
//
//   · «Guardando…» mientras la muñeca cierra la grabación (`isEnding`);
//   · «Grabando en la muñeca» antes de la primera trama (el móvil aún no ha dicho nada);
//   · la puerta de un bloque, que espera «Empezar»;
//   · la lista de un calentamiento o una vuelta a la calma: el título, el reloj y «Siguiente».
//
// Estados = `session.state × link` de Apple: PRIMARY sin trama → Grabando en la muñeca (con «Sin conexión» si Apple
// dice que el móvil se fue). No hay HUD sin sesión ni «Conectando…» (FH-56).
struct MirrorHUDView: View {
    let owner: WatchPrimaryOwner

    /// La muñeca bajada: se aplica a la capa de pausa, que no pasa por la pila.
    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        // SOLO `isEnding` enseña «Guardando…» — FH-97: deadline 5s NUNCA se cancela al empezar el save; la UI vuelve
        // a idle aunque finishWorkout cuelgue. Con la cara nueva mandando, sus hápticos los toca el director de la
        // muñeca (`MunecaDirector`) y `Vivo.PoliticaHaptica` calla lo heredado.
        if owner.isEnding {
            MirrorSavingOverlay()
        } else if owner.caraDelEspejo == .muneca {
            MunecaEspejo(owner: owner)
        } else {
            TabView {
                sinPila
                MirrorHUDControlsPage(owner: owner, phase: phase)
            }
            .tabViewStyle(.page)
        }
    }

    // MARK: - Lo que la pila no cubre

    private var sinPila: some View {
        ZStack {
            // Fondo siempre: sin trama el contenido es vacío y el TabView pintaba NEGRO puro.
            WatchTheme.bg.ignoresSafeArea()
            if frame == nil {
                MirrorRecordingOnWristOverlay(owner: owner)
            } else if phase == MirrorWire.Phase.gate {
                gateContent
            } else {
                listaContent
                if phase == MirrorWire.Phase.paused { MirrorPausedOverlay().opacity(atenuado ? 0.65 : 1) }
            }
        }
    }

    private var gateContent: some View {
        LiveScaffold {
            VStack(spacing: 8) {
                Text(frame?.blockTitle ?? "Bloque")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                WatchLabel(text: "Listo para empezar", accent: true)
            }
        } bottom: {
            advanceButton
        }
    }

    /// Una lista de movilidad: nada que medir, solo el título, lo que llevas y el avance.
    private var listaContent: some View {
        LiveScaffold(status: frame?.blockTitle) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 5) {
                    Text(frame?.lineTitle ?? frame?.progressText ?? "Lista")
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundStyle(WatchTheme.ink)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    GiantNumber(text: WatchFormat.clock(heroElapsed(context.date)), size: 44)
                    HRPill(bpm: owner.liveHR, zoneColor: owner.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim)
                }
            }
        } bottom: {
            advanceButton
        }
    }

    // MARK: - Advance button

    /// The FINAL step never ends on one tap (IMG_2385: a free strength session is
    /// one segment inside, so "Siguiente" closed the whole workout mid-warmup).
    /// On the last step the button says what it does — "Terminar" — and asks.
    @State private var confirmingFinish = false

    private var advanceButton: some View {
        let final = isFinalStep
        return BigTapButton(title: advanceTitle) {
            if final {
                confirmingFinish = true
            } else {
                owner.sendCommand(MirrorWire.CommandKind.advance)
            }
        }
        .confirmationDialog(
            "¿Terminar el entreno?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("Terminar", role: .destructive) {
                owner.finishByAthlete()
            }
            Button("Seguir", role: .cancel) { }
        }
    }

    private var isFinalStep: Bool {
        // Only a POSITIVE final flag (new phones send it) and never on a gate —
        // a gate's advance starts the block, it can't end anything.
        phase != MirrorWire.Phase.gate && frame?.isFinalStep == true
    }

    private var advanceTitle: String {
        if phase == MirrorWire.Phase.gate { return "Empezar ▸" }
        if isFinalStep { return "Terminar" }
        return "Siguiente ▸"
    }

    // MARK: - Derived

    private var frame: MirrorStateFrame? { owner.frame }
    private var phase: String? { owner.frame?.phase }

    /// Seconds accrued since the last frame while the clock is running; frozen on a gate / pause.
    private func sinceFrame(_ now: Date) -> Double {
        guard let at = owner.frameReceivedAt, phase == MirrorWire.Phase.active else { return 0 }
        return max(0, now.timeIntervalSince(at))
    }

    /// Los segundos DENTRO de la ventana, re-basados en local entre tramas (los timers del iPhone mueren en
    /// segundo plano).
    private func heroElapsed(_ now: Date) -> Double {
        guard let f = frame else { return 0 }
        return (f.tramo?.enTramoS ?? f.lapElapsed) + sinceFrame(now)
    }
}
