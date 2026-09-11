import SwiftUI

// Card 142 / FH-111 — la ✕ del vivo MINIMIZA (sesión ACTIVE, espejo intacto).
// Esta tira es la vuelta cuando el chrome está cerrado: aparece en Plan mientras
// la instantánea siga siendo válida y, al tocarla, reabre el MISMO motor vivo
// (`LiveWorkoutResume.presentParkedCoverIfNeeded`), no un entreno nuevo.
//
// Copy distingue minimize ACTIVE (reloj sigue) de soft-leave pausado (Card 142).
//
// Autocargada como el resto de tarjetas de esta familia (ver `DoblesLiveBanner`
// en Inicio): no pinta nada cuando no hay nada que retomar.
struct WorkoutResumeBanner: View {
    /// Sube cada vez que el cover del entreno se cierra (salga como salga), para
    /// que la tira compruebe otra vez si hay instantánea justo en el momento en
    /// que puede haber aparecido una nueva.
    let refreshToken: Int
    let onResume: (WorkoutLaunch) -> Void

    @State private var saved: PersistedWorkoutState? = nil

    var body: some View {
        Group {
            if let saved {
                card(saved)
            } else {
                EmptyView()
            }
        }
        .task(id: refreshToken) { await load() }
    }

    private func load() async {
        guard let candidate = await WorkoutStateStore.shared.load() else {
            saved = nil
            return
        }
        let offer: Bool = {
            if let aid = candidate.assignmentId, !aid.isEmpty {
                return WorkoutRecoveryGate.shouldOffer(
                    saved: candidate,
                    currentAssignmentId: aid
                )
            }
            return WorkoutRecoveryGate.isFresh(candidate)
        }()
        guard offer else {
            saved = nil
            return
        }
        saved = candidate
    }

    private func card(_ saved: PersistedWorkoutState) -> some View {
        let isLiveActive = LiveWorkoutResume.shared.isUIMinimized
            || (!saved.isPaused && LiveWorkoutResume.shared.hasLiveSession)
        return Button {
            Haptics.medium()
            onResume(WorkoutLaunch(assignmentId: saved.assignmentId ?? "", title: saved.plan.name))
        } label: {
            // Suelo tipográfico (CONTRATO-UI §4.1): nada de texto por debajo de
            // 15 pt, sin excepción por "no cabe" — por eso no lleva una etiqueta
            // "CONTINUAR" aparte (no cabría a 15 pt sin apretar el resto): el
            // chevron ya dice que la fila es tocable, como el resto de filas de
            // esta pantalla.
            HStack(spacing: 12) {
                Image(systemName: isLiveActive ? "figure.run.circle.fill" : "pause.circle.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                VStack(alignment: .leading, spacing: 2) {
                    Text(isLiveActive ? "Entreno en curso" : "Tienes un entreno a medias")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    Text(isLiveActive
                         ? "\(saved.plan.name) · sigue activo"
                         : "\(saved.plan.name) · desde las \(horaDesde(saved.savedAt))")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.accent.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accent.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(bannerAccessibilityLabel(saved: saved, isLiveActive: isLiveActive))
    }

    private func bannerAccessibilityLabel(
        saved: PersistedWorkoutState,
        isLiveActive: Bool
    ) -> String {
        if isLiveActive {
            return "Entreno en curso: \(saved.plan.name), sigue activo. Toca para volver"
        }
        return "Tienes un entreno a medias: \(saved.plan.name), desde las \(horaDesde(saved.savedAt)). Toca para continuar"
    }

    private func horaDesde(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
}
