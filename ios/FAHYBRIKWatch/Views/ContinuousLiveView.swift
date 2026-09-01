import SwiftUI

// RODAJE / CONTINUO — un solo bout sin trocear.
//
// La vista NO decide qué se enseña: eso vive en `GuionRodaje`, que es una función
// pura del estado a las páginas y se prueba sin montar una pantalla. Aquí sólo
// quedan tres cosas que sí son de la vista: leer el motor, el bisel y el háptico
// de salida de zona.
struct ContinuousLiveView: View {
    let session: WorkoutSession

    @State private var lastZoneHapticAt: Date = .distantPast

    var body: some View {
        WatchReloj(
            paginas: GuionRodaje.paginas(estado, gestos) + paginasDeZona,
            tinte: WatchTinte.color(for: session.liveZone),
            fondo: lienzoDeZona,
            bisel: bisel
        )
        .onChange(of: session.liveZone) { _, zone in
            guard let target = session.currentSegment?.targetZone, let zone, zone != target else { return }
            if Date().timeIntervalSince(lastZoneHapticAt) >= WatchTheme.zoneExitHapticThrottle {
                lastZoneHapticAt = Date()
                WatchHaptics.warning()
            }
        }
    }

    // MARK: - La zona como sujeto (y como lienzo)

    /// La página de zona va DETRÁS de las del guion: el sujeto del rodaje sigue
    /// siendo el rodaje. Sin bandas o sin pulso no existe (§7).
    private var paginasDeZona: [WatchPagina] {
        [WatchPaginasComunes.zona(session.liveZonePosition,
                                  bpm: session.liveHRBpm,
                                  objetivo: session.currentSegment?.targetZone)].compactMap { $0 }
    }

    /// EL COLOR ES UN DATO. El lienzo se llena del hue de tu zona conforme te
    /// acercas a la siguiente, en todas las páginas de la vista y no sólo en la
    /// de zona: corriendo, saber si estás entrando o saliendo de la banda es la
    /// pregunta de fondo, no una página que haya que ir a buscar.
    private var lienzoDeZona: AnyView? {
        session.liveZonePosition.map { AnyView(WatchLienzoZona(posicion: $0)) }
    }

    // MARK: - El motor → el guion

    private var estado: GuionRodaje.Estado {
        let esCorrer = session.currentSegment?.kind == .running
        return GuionRodaje.Estado(
            esCorrer: esCorrer,
            zonaObjetivo: session.currentSegment?.targetZone,
            zonaViva: session.liveZone,
            bpm: session.liveHRBpm,
            // Sólo corriendo hay ritmo que prometer: el reloj no ve la máquina de
            // un ergo, y un ritmo inventado en la pantalla que presume de
            // honestidad sería el peor sitio para inventarlo (§7).
            ritmoSecPorKm: esCorrer ? session.liveCoveredPaceSecPerKm : nil,
            metros: session.liveRunDistanceMeters,
            objetivoMetros: session.currentSegment?.targetDistanceMeters.map { Double($0) },
            segundos: session.condElapsed
        )
    }

    /// Un rodaje no tiene decisiones dentro. La única es cerrar un calentamiento
    /// o una vuelta a la calma, que sí acaban cuando el atleta lo dice.
    private var gestos: GuionRodaje.Gestos {
        guard session.currentBlockIsStructural else { return GuionRodaje.Gestos() }
        return GuionRodaje.Gestos(hecho: { session.completeStructuralBlock() })
    }

    // MARK: - Bisel

    /// El aro dibuja a QUIEN CIERRA el bout: un objetivo de distancia o uno de
    /// tiempo. Sin objetivo no hay aro — prometería una fracción que nadie sabe.
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
