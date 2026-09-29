import SwiftUI

// Card 142 — la vuelta a un entreno GUARDADO PARA LUEGO (pausado, instantánea en
// disco): aparece en el Plan mientras la instantánea siga siendo válida (en Hoy es el
// sujeto «Retoma»).
//
// El entreno MINIMIZADO (FH-111, el motor sigue) no se pinta aquí: lo lleva la
// barra de sistema sobre las pestañas (`LiveWorkoutMiniBar`), leída del motor en
// memoria. Solo en iOS 26.0, que no puede esconder esa barra, esta tarjeta pinta
// la misma barra dentro del scroll.
//
// Autocargada: no pinta nada cuando no hay nada que retomar.
struct WorkoutResumeBanner: View {
    /// Sube cada vez que el cover del entreno se cierra (salga como salga), para
    /// que la tira compruebe otra vez si hay instantánea justo en el momento en
    /// que puede haber aparecido una nueva.
    let refreshToken: Int
    let onResume: (WorkoutLaunch) -> Void

    @State private var saved: PersistedWorkoutState? = nil

    var body: some View {
        let live = LiveWorkoutResume.shared
        Group {
            if let minimized = live.minimized {
                if !LiveWorkoutAccessory.isSystemBarAvailable {
                    LiveWorkoutBarraEnFila(entreno: minimized)
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
        let desde = horaDesde(saved.savedAt)
        return Button {
            Haptics.medium()
            onResume(WorkoutLaunch(assignmentId: saved.assignmentId ?? "", title: saved.plan.name))
        } label: {
            HStack(spacing: 12) {
                FichaDia(tono: .realce) { IconoDia(.pausa) }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tienes un entreno a medias")
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    Text("\(saved.plan.name) · desde las \(desde)")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                IconoDia(.chevron, tam: 14)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: Theme.Size.toque)
            .marcoDeRetomar()
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Tienes un entreno a medias: \(saved.plan.name), desde las \(desde). Toca para continuar")
    }

    private func horaDesde(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
}
