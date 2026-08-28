import SwiftUI

// Pausar / Siguiente bloque / Terminar: la página de deslizamiento del
// modo a solas se queda (no es el rediseño de la 105). Los dos actos de
// sesión YA no viven solo aquí: en el vivo hay un gesto cada uno
// (`WatchLiveSessionControls`). Esta página suma «Siguiente bloque».
struct PauseFinishPage: View {
    let session: WorkoutSession

    @Environment(WatchWorkoutCoordinator.self) private var coordinator

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 11) {
                WatchLiveSessionControls(
                    style: .stacked,
                    paused: session.isPaused,
                    onPauseResume: { coordinator.togglePause() },
                    onFinish: { session.finish(completeness: .partial) }
                )
                if session.canEndBlockEarly && session.hasBlockAfterCurrent {
                    WatchLiveSessionRow(
                        title: "Siguiente bloque",
                        systemImage: "forward.end.fill",
                        background: WatchTheme.surfaceRaised,
                        foreground: WatchTheme.orange
                    ) {
                        session.endBlockEarly()
                    }
                }
            }
            .padding(.horizontal, 12)
        }
    }
}

// MARK: - Los dos actos, en el vivo

/// Pausar y Terminar. Un control cada uno. No un deslizamiento.
///
/// Compacto: columna a la derecha del vivo, en el aire que el lienzo ya
/// deja para la hora. Apilado: las dos filas de siempre, en pausa o en
/// la página de controles.
struct WatchLiveSessionControls: View {
    enum Style { case compact, stacked }

    let style: Style
    let paused: Bool
    let onPauseResume: () -> Void
    let onFinish: () -> Void

    @State private var confirmingFinish = false

    var body: some View {
        Group {
            switch style {
            case .compact: compact
            case .stacked: stacked
            }
        }
        .confirmationDialog(
            "¿Terminar el entreno?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button(WatchLiveSessionActs.finishTitle, role: .destructive) {
                WatchHaptics.stop()
                onFinish()
            }
            Button("Seguir", role: .cancel) { }
        }
    }

    private var compact: some View {
        VStack(spacing: 8) {
            compactButton(
                systemImage: WatchLiveSessionActs.pauseSymbol(isPaused: paused),
                label: WatchLiveSessionActs.pauseTitle(isPaused: paused)
            ) {
                WatchHaptics.tap()
                onPauseResume()
            }
            compactButton(
                systemImage: WatchLiveSessionActs.finishSymbol,
                label: WatchLiveSessionActs.finishTitle,
                destructive: true
            ) {
                confirmingFinish = true
            }
        }
        .padding(.trailing, 2)
        .padding(.top, 2)
    }

    private var stacked: some View {
        VStack(spacing: 11) {
            WatchLiveSessionRow(
                title: WatchLiveSessionActs.pauseTitle(isPaused: paused),
                systemImage: WatchLiveSessionActs.pauseSymbol(isPaused: paused),
                background: WatchTheme.surfaceRaised,
                foreground: WatchTheme.ink,
                action: onPauseResume
            )
            WatchLiveSessionRow(
                title: WatchLiveSessionActs.finishTitle,
                systemImage: WatchLiveSessionActs.finishSymbol,
                background: WatchTheme.zoneRed.opacity(0.18),
                foreground: WatchTheme.zoneRed
            ) {
                confirmingFinish = true
            }
        }
    }

    private func compactButton(
        systemImage: String,
        label: String,
        destructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(destructive ? WatchTheme.zoneRed : WatchTheme.ink)
                .frame(width: 40, height: 40)
                .background(WatchTheme.surfaceRaised)
                .clipShape(Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct WatchLiveSessionRow: View {
    let title: String
    let systemImage: String
    let background: Color
    let foreground: Color
    let action: () -> Void

    var body: some View {
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
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}
