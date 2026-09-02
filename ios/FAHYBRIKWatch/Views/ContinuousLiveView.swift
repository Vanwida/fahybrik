import SwiftUI

// RODAJE / CONTINUO — un solo bout sin trocear.
//
// El cromo es la lámina (FH-30): una sola página Vivo, sujeto = lo que falta
// de la pieza. GuionRodaje no pinta aquí (ponía la zona como sujeto).
struct ContinuousLiveView: View {
    let session: WorkoutSession

    @State private var lastZoneHapticAt: Date = .distantPast

    var body: some View {
        RodajeVivoPage(session: session)
            .onChange(of: session.liveZone) { _, zone in
                guard let target = session.currentSegment?.targetZone, let zone, zone != target else { return }
                if Date().timeIntervalSince(lastZoneHapticAt) >= WatchTheme.zoneExitHapticThrottle {
                    lastZoneHapticAt = Date()
                    WatchHaptics.warning()
                }
            }
    }
}
