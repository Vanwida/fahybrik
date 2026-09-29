import SwiftUI

// EL ENTRENO MINIMIZADO SE SIGUE VIENDO (FH-111).
//
// El chevrón del vivo esconde la pantalla pero NO para nada: el motor, el reloj y
// el espejo de la muñeca siguen. Antes, lo único que quedaba era una tarjeta en el
// scroll de Inicio/Plan que leía el disco y no se enteraba a tiempo, así que el
// atleta acababa volviendo por «crear entreno» → «seguir o terminar».
//
// Ahora es la barra de «reproduciendo» del sistema (la de Música): encima de las
// pestañas, en todas, con el crono corriendo y el paso de ahora; tocarla reabre
// EL MISMO motor (`presentParkedCoverIfNeeded`), no un entreno nuevo. Lee la
// sesión aparcada en memoria, nunca el disco: la verdad es el motor vivo.
struct LiveWorkoutMiniBar: View {
    let parked: RecoveredLiveCover
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

    var body: some View {
        let session = parked.session
        let title = parked.title ?? session.plan.name
        let detail = Self.detail(for: session)
        Button {
            Haptics.medium()
            LiveWorkoutResume.shared.presentParkedCoverIfNeeded()
        } label: {
            HStack(spacing: 12) {
                statusGlyph(paused: session.isPaused)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    // Plegada (al hacer scroll la barra se encoge junto a las
                    // pestañas) solo cabe una línea: el nombre y el crono.
                    if placement != .inline {
                        Text(detail)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                Text(Formato.clock(session.elapsedSeconds))
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(session.isPaused ? Theme.Color.muted : Theme.Color.accentText)
                    .contentTransition(.numericText())
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Entreno en curso: \(title). \(detail). \(Formato.clock(session.elapsedSeconds))")
        .accessibilityHint("Toca para volver al entreno")
        .accessibilityAddTraits(.isButton)
    }

    /// El punto que late mientras el reloj corre; la pausa se ve quieta.
    private func statusGlyph(paused: Bool) -> some View {
        Image(systemName: paused ? "pause.circle.fill" : "record.circle")
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(Theme.Color.accentText)
            .symbolEffect(.pulse, options: .repeating, isActive: !paused)
            .frame(width: 26)
    }

    /// La segunda línea: en qué punto está el entreno, dicho para el atleta.
    static func detail(for session: WorkoutSession) -> String {
        if session.isPaused { return "En pausa" }
        if session.isAwaitingFinishDecision { return "Trabajo hecho · toca para cerrar" }
        if session.isAwaitingBlockStart { return "Bloque listo para empezar" }
        return session.currentSegment?.title ?? "En curso"
    }
}

extension View {
    /// La barra del entreno minimizado sobre las pestañas. iOS 26.0 no puede
    /// esconder el accesorio (saldría una cápsula vacía): ahí la vuelta la da
    /// `WorkoutResumeBanner`, que pinta esta misma barra dentro de Inicio y Plan.
    @ViewBuilder
    func liveWorkoutAccessory(_ parked: RecoveredLiveCover?) -> some View {
        if #available(iOS 26.1, *) {
            tabViewBottomAccessory(isEnabled: parked != nil) {
                if let parked { LiveWorkoutMiniBar(parked: parked) }
            }
        } else {
            self
        }
    }
}

enum LiveWorkoutAccessory {
    /// La barra de sistema está disponible: la tarjeta del scroll no la duplica.
    static var isSystemBarAvailable: Bool {
        if #available(iOS 26.1, *) { return true }
        return false
    }
}

// MARK: - La barra con cara de fila (iOS 26.0)

/// La misma barra dentro del scroll, SOLO donde el sistema no puede pintarla sobre las pestañas
/// (iOS 26.0, ver `LiveWorkoutAccessory.isSystemBarAvailable`). La usan Hoy y el aviso de retomar del Plan.
struct LiveWorkoutBarraEnFila: View {
    let entreno: RecoveredLiveCover

    /// El alto de una fila de dos líneas a 15 pt con su aire, como la barra de sistema.
    private static let alto: CGFloat = 56

    var body: some View {
        LiveWorkoutMiniBar(parked: entreno)
            .frame(height: Self.alto)
            .marcoDeRetomar()
    }
}

extension View {
    /// El marco de acento suave de lo que devuelve al atleta a un entreno empezado.
    func marcoDeRetomar() -> some View {
        background(Theme.Color.accentTint, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                .strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
    }
}
