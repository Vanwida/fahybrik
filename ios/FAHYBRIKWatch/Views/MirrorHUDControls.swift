import SwiftUI

struct MirrorHUDControlsPage: View {
    let owner: WatchPrimaryOwner
    let phase: String?

    @State private var confirmingFinish = false

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 11) {
                if owner.isConnectionLost {
                    connectionLostBanner
                }
                pauseResumeButton
                terminarButton
                if owner.isConnectionLost {
                    discardButton
                } else {
                    Text("El entreno se controla desde el iPhone")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(WatchTheme.dim)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    private var connectionLostBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            WatchLabel(text: "Sin conexión con el iPhone", accent: true)
            Text("El entreno se sigue grabando aquí.")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var pauseResumeButton: some View {
        let paused = phase == MirrorWire.Phase.paused
        return Button {
            WatchHaptics.tap()
            if paused {
                owner.resumeIfPaused()
                owner.sendCommand(MirrorWire.CommandKind.resume)
            } else {
                owner.pause()
                owner.sendCommand(MirrorWire.CommandKind.pause)
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 18, weight: .heavy))
                Text(paused ? "Reanudar" : "Pausar")
                    .font(.system(size: 16, weight: .heavy))
                Spacer(minLength: 0)
            }
            .foregroundStyle(WatchTheme.ink)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .frame(maxWidth: .infinity)
            .background(WatchTheme.surfaceRaised)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    /// FH-101 — Terminar siempre al alcance (segunda página del HUD). Confirmación
    /// mínima; no el diálogo «Seguir entrenando» del teléfono.
    private var terminarButton: some View {
        BigTapButton(title: "Terminar", systemImage: "flag.checkered") {
            confirmingFinish = true
        }
        .confirmationDialog(
            "¿Terminar el entreno?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("Terminar", role: .destructive) {
                owner.finishByAthlete()
            }
            Button("Cancelar", role: .cancel) { }
        }
    }

    private var discardButton: some View {
        Button {
            WatchHaptics.tap()
            owner.discardByAthlete()
        } label: {
            Text("Descartar")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(WatchTheme.dim)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
        }
        .buttonStyle(.plain)
    }
}
