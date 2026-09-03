import SwiftUI

struct MirrorHUDControlsPage: View {
    let controller: MirrorSessionController
    let phase: String?

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            if controller.isConnectionLost {
                connectionLostControls
            } else {
                normalControls
            }
        }
    }

    private var normalControls: some View {
        VStack(spacing: 11) {
            pauseResumeButton
            Text("El entreno se controla desde el iPhone")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 12)
    }

    private var pauseResumeButton: some View {
        let paused = phase == MirrorWire.Phase.paused
        return Button {
            WatchHaptics.tap()
            if paused {
                controller.resumePrimary()
                controller.sendCommand(MirrorWire.CommandKind.resume)
            } else {
                controller.pausePrimary()
                controller.sendCommand(MirrorWire.CommandKind.pause)
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

    private var connectionLostControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            WatchLabel(text: "Sin conexión con el iPhone", accent: true)
            Text("El entreno se sigue grabando aquí.")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
            Spacer(minLength: 0)
            BigTapButton(title: "Terminar y guardar aquí", systemImage: "checkmark") {
                controller.finishLocally()
            }
            Button {
                WatchHaptics.tap()
                controller.discardLocally()
            } label: {
                Text("Descartar")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(WatchTheme.dim)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}
