import SwiftUI

// When the athlete opens a second workout while one is live or soft-left on disk,
// never start silently — offer Seguir | Terminar y empezar | Cancelar.

enum LiveWorkoutLaunchConflict {

    /// FH-99 — only STARTING another live session is gated. A soft-leave snapshot
    /// alone does not block create/save; `WorkoutResumeBanner` handles return.
    static func shouldPromptStartingLive(hasLiveCoverOrTracked: Bool) -> Bool {
        LiveLaunchPolicy.blocksStartingLive(hasLiveCoverOrTracked: hasLiveCoverOrTracked)
    }

    /// Deprecated alias — pass `hasLiveCoverOrTracked` only; snapshot ignored.
    static func shouldPrompt(
        hasLiveCoverOrTracked: Bool,
        snapshot: PersistedWorkoutState?
    ) -> Bool {
        _ = snapshot
        return shouldPromptStartingLive(hasLiveCoverOrTracked: hasLiveCoverOrTracked)
    }

    /// End HK mirror + disk snapshot so a new workout can start cleanly.
    @MainActor
    static func terminateCurrentForNewStart() async {
        PhoneLiveSession.shared.end(save: true)
        PhoneWorkoutRun.shared.end()
        await WorkoutStateStore.shared.close()
        LiveWorkoutResume.shared.dismissFully()
    }
}

/// Reusable confirmation dialog — wire `isPresented` before calling `onLaunch`.
struct LiveWorkoutLaunchConflictDialog: ViewModifier {
    @Binding var isPresented: Bool
    let snapshotTitle: String?
    let onResume: () -> Void
    let onEndAndStart: () -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog(
            "Tienes un entreno en curso",
            isPresented: $isPresented,
            titleVisibility: .visible
        ) {
            Button("Seguir") {
                Haptics.medium()
                onResume()
            }
            Button("Terminar y empezar", role: .destructive) {
                Haptics.heavy()
                onEndAndStart()
            }
            Button("Cancelar", role: .cancel) {
                Haptics.light()
            }
        } message: {
            if let snapshotTitle, !snapshotTitle.isEmpty {
                Text("\(snapshotTitle) sigue abierto. ¿Qué quieres hacer?")
            } else {
                Text("Hay un entreno activo. ¿Qué quieres hacer?")
            }
        }
    }
}

extension View {
    func liveWorkoutLaunchConflict(
        isPresented: Binding<Bool>,
        snapshotTitle: String?,
        onResume: @escaping () -> Void,
        onEndAndStart: @escaping () -> Void
    ) -> some View {
        modifier(LiveWorkoutLaunchConflictDialog(
            isPresented: isPresented,
            snapshotTitle: snapshotTitle,
            onResume: onResume,
            onEndAndStart: onEndAndStart
        ))
    }
}
