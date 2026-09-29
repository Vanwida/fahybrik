import SwiftUI

// Estado del Apple Watch en el brief listo para empezar. SOLO informativa y sin
// botones: el reloj se abre solo al pulsar ▶ EMPEZAR (Apple Entreno, Strava y Nike
// Run Club hacen lo mismo) y el entreno nunca depende de él. Lo que dice es lo que
// Apple sabe: reloj emparejado con la app puesta, o no.

struct PreWorkoutWatchCard: View {
    let mirror: PhoneLiveSession
    private let watch = WatchPresence.shared

    var body: some View {
        CardSurface(padding: Theme.Spacing.m) {
            if mirror.wristMirrorLive {
                statusRow(icon: "checkmark.circle.fill", color: Theme.Color.ok,
                          title: "Reloj grabando",
                          subtitle: "Tu entreno ya se graba en la muñeca")
            } else if watch.appAvailable {
                statusRow(icon: "applewatch", color: Theme.Color.ok,
                          title: "Apple Watch listo",
                          subtitle: "Se abre solo al empezar y graba en la muñeca")
            } else {
                statusRow(icon: "applewatch.slash", color: Theme.Color.muted,
                          title: "Sin Apple Watch",
                          subtitle: "Entrenas igual, con el móvil")
            }
        }
    }

    private func statusRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}
