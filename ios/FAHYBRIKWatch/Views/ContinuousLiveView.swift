import SwiftUI

// RODAJE / CONTINUO — un solo bout sin trocear.
//
// Correr (FH-30): el cromo es la lámina — Vivo = lo que falta de la pieza.
// Cualquier otro continuo (ergo, etc.) se queda en GuionRodaje + WatchReloj:
// no es la lámina de correr.
struct ContinuousLiveView: View {
    let session: WorkoutSession

    @State private var lastZoneHapticAt: Date = .distantPast

    var body: some View {
        Group {
            if session.currentSegment?.kind == .running {
                RodajeVivoPage(session: session)
            } else {
                continuoNoRodaje
            }
        }
        .onChange(of: session.liveZone) { _, zone in
            guard let target = session.currentSegment?.targetZone, let zone, zone != target else { return }
            if Date().timeIntervalSince(lastZoneHapticAt) >= WatchTheme.zoneExitHapticThrottle {
                lastZoneHapticAt = Date()
                WatchHaptics.warning()
            }
        }
    }

    // MARK: - Continuo que no es correr (GuionRodaje, sin tocar)

    private var continuoNoRodaje: some View {
        WatchReloj(
            paginas: GuionRodaje.paginas(estado, gestos) + paginasDeZona,
            tinte: WatchTinte.color(for: session.liveZone),
            fondo: lienzoDeZona,
            bisel: bisel
        )
    }

    private var paginasDeZona: [WatchPagina] {
        [WatchPaginasComunes.zona(session.liveZonePosition,
                                  bpm: session.liveHRBpm,
                                  objetivo: session.currentSegment?.targetZone)].compactMap { $0 }
    }

    private var lienzoDeZona: AnyView? {
        session.liveZonePosition.map { AnyView(WatchLienzoZona(posicion: $0)) }
    }

    private var estado: GuionRodaje.Estado {
        GuionRodaje.Estado(
            esCorrer: false,
            zonaObjetivo: session.currentSegment?.targetZone,
            zonaViva: session.liveZone,
            bpm: session.liveHRBpm,
            ritmoSecPorKm: nil,
            metros: session.liveRunDistanceMeters,
            objetivoMetros: session.currentSegment?.targetDistanceMeters.map { Double($0) },
            segundos: session.condElapsed
        )
    }

    private var gestos: GuionRodaje.Gestos {
        guard session.currentBlockIsStructural else { return GuionRodaje.Gestos() }
        return GuionRodaje.Gestos(hecho: { session.completeStructuralBlock() })
    }

    private var bisel: AnyView? {
        if let targetM = session.currentSegment?.targetDistanceMeters,
           targetM > 0,
           let dist = session.liveRunDistanceMeters {
            let rem = max(0, 1 - dist / Double(targetM))
            return WatchAroContinuo(remaining: rem).watchBisel()
        }
        if let total = session.currentSegment?.targetDurationSeconds, total > 0 {
            let rem = max(0, 1 - session.condElapsed / Double(total))
            return WatchAroContinuo(remaining: rem).watchBisel()
        }
        return nil
    }
}
