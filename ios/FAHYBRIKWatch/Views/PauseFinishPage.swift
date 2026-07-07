import SwiftUI

// Pausar / Siguiente bloque / Terminar — one horizontal swipe away from the live
// screen, so they're reachable but never fired by accident mid-effort. Pausar
// toggles the engine clock; Siguiente bloque closes the CURRENT block honestly
// (real work logged, rest skipped) and parks on the next block's gate; Terminar
// confirms, then finishes as PARTIAL (the athlete cut the protocol short — never
// a fabricated 'completed'; a full run auto-finishes on its own). Mockup 6.
struct PauseFinishPage: View {
    let session: WorkoutSession

    // Pause must go through the coordinator, not straight to the engine: it pauses/
    // resumes BOTH the engine clock and the HealthKit session, so paused minutes stop
    // accruing elapsed/kcal and no rest-HR sample pollutes the lap.
    @Environment(WatchWorkoutCoordinator.self) private var coordinator

    @State private var confirmingFinish = false

    var body: some View {
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
                // Only when a block EXISTS after this one — cutting the last block
                // short is exactly what Terminar already does.
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
