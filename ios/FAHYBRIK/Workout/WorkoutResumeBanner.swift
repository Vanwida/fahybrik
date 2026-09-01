import SwiftUI

// Card 142 — "el móvil se queda secuestrado". Entre fuerza y cardio el atleta
// descansa de verdad, y hasta ahora la única salida de la pantalla del entreno
// era terminar o descartar. Ahora "Salir y seguir luego" pausa, guarda YA y
// cierra la pantalla (ver `WorkoutSession.leaveToResumeLater` y
// `WorkoutContainer`'s `onLeaveAndResume`) — pero salir así solo sirve de algo
// si VOLVER no depende de que se acuerde. Esta tira es esa vuelta: aparece en
// Plan mientras la instantánea autoguardada siga siendo válida y, al tocarla,
// abre el mismo entreno, que ya ofrece "Seguir donde lo dejé".
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
        guard let candidate = await WorkoutStateStore.shared.load(),
              // La MISMA regla pura que usa el propio entreno para ofrecerse a
              // sí mismo al reabrir (mismo assignment · plan real · fresco <6h),
              // sin reescribirla: pasar el id del candidato como "actual" hace
              // que la comprobación de "mismo assignment" sea trivial cuando lo
              // hay, y siga rechazando un snapshot sin assignment (libre / ad-hoc)
              // exactamente igual que hoy.
              WorkoutRecoveryGate.shouldOffer(saved: candidate, currentAssignmentId: candidate.assignmentId)
        else {
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
            .background(Theme.Color.accent.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accent.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
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
