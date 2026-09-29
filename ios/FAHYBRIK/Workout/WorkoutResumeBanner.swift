import SwiftUI

// Card 142 — la vuelta a un entreno GUARDADO PARA LUEGO (pausado, instantánea en
// disco): aparece en Inicio y Plan mientras la instantánea siga siendo válida.
//
// El entreno MINIMIZADO (FH-111, el motor sigue) no se pinta aquí: lo lleva la
// barra de sistema sobre las pestañas (`LiveWorkoutMiniBar`), leída del motor en
// memoria. Solo en iOS 26.0, que no puede esconder esa barra, esta tarjeta pinta
// la misma barra dentro del scroll.
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
    /// El alto de la barra del minimizado cuando va dentro del scroll (iOS 26.0):
    /// el de una fila de dos líneas a 15 pt con su aire, como la de sistema.
    private static let inlineBarHeight: CGFloat = 56

    var body: some View {
        let live = LiveWorkoutResume.shared
        Group {
            if let minimized = live.minimized {
                if !LiveWorkoutAccessory.isSystemBarAvailable {
                    LiveWorkoutMiniBar(parked: minimized)
                        .frame(height: Self.inlineBarHeight)
                        .resumeCardChrome()
                }
            } else if let saved, !live.hasLiveSession {
                card(saved)
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
        Button {
            Haptics.medium()
            onResume(WorkoutLaunch(assignmentId: saved.assignmentId ?? "", title: saved.plan.name))
        } label: {
            // Suelo tipográfico (CONTRATO-UI §4.1): nada de texto por debajo de
            // 15 pt, sin excepción por "no cabe" — por eso no lleva una etiqueta
            // "CONTINUAR" aparte (no cabría a 15 pt sin apretar el resto): el
            // chevron ya dice que la fila es tocable, como el resto de filas de
            // esta pantalla.
            HStack(spacing: 12) {
                Image(systemName: "pause.circle.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tienes un entreno a medias")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    Text("\(saved.plan.name) · desde las \(horaDesde(saved.savedAt))")
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
            .resumeCardChrome()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Tienes un entreno a medias: \(saved.plan.name), desde las \(horaDesde(saved.savedAt)). Toca para continuar")
    }

    private func horaDesde(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
}

private extension View {
    /// El marco naranja suave de las tarjetas de vuelta al entreno.
    func resumeCardChrome() -> some View {
        background(Theme.Color.accent.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accent.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }
}
