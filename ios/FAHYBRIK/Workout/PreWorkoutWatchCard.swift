import SwiftUI

// Estado del Apple Watch en la ficha lista para empezar. SOLO informativa y sin botones: el reloj se abre
// solo al empezar (Apple Entreno, Strava y Nike Run Club hacen lo mismo) y el entreno nunca depende de él.
// Dice lo que Apple sabe: reloj grabando, emparejado con la app puesta, o no.

struct PreWorkoutWatchCard: View {
    let mirror: PhoneLiveSession
    private let watch = WatchPresence.shared

    private struct Estado {
        let simbolo: String
        /// El color de ESTADO del glifo (verde = listo); el texto va siempre en la tinta del tema.
        let color: Color
        let titulo: String
        let linea: String
    }

    private var estado: Estado {
        if mirror.wristMirrorLive {
            return Estado(simbolo: "checkmark.circle.fill", color: Theme.Color.ok,
                          titulo: "Reloj grabando", linea: "Tu entreno ya se graba en la muñeca")
        }
        if watch.appAvailable {
            return Estado(simbolo: "applewatch", color: Theme.Color.ok,
                          titulo: "Apple Watch listo", linea: "Se abre solo al empezar y graba en la muñeca")
        }
        return Estado(simbolo: "applewatch.slash", color: Theme.Color.muted,
                      titulo: "Sin Apple Watch", linea: "Entrenas igual, con el móvil")
    }

    var body: some View {
        let e = estado
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            FichaDia {
                Image(systemName: e.simbolo)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(e.color)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(e.titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                Text(e.linea)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Theme.Spacing.l)
        .tarjetaPrevia()
        .accessibilityElement(children: .combine)
    }
}
