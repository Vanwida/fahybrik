import SwiftUI

// RODAJE / CONTINUO — un solo bout sin trocear.
//
// Diseño (`watch-rodaje`): un sujeto por página (ritmo · distancia · tiempo ·
// pulso). Sin GPS no se inventa ritmo: se degrada a lo medido. Sin ancla de FC
// no hay tinte. Ojeada pura — CERO controles en el tramo principal (se cierra
// por tiempo o desde Pausar/Terminar). Un calentamiento estructural sí ofrece
// «Hecho» en mando.
struct ContinuousLiveView: View {
    let session: WorkoutSession

    @State private var lastZoneHapticAt: Date = .distantPast

    var body: some View {
        WatchReloj(
            paginas: paginas,
            tinte: WatchTinte.color(for: session.liveZone),
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

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = []
        let modo: WatchModo = session.currentBlockIsStructural ? .mando : .ojeada

        if let pace = measuredPace {
            list.append(WatchPagina(
                id: "ritmo",
                contexto: statusText,
                modo: modo,
                sujeto: WatchFormat.pace(pace),
                unidad: Formato.UnidadRitmo.porKm.rawValue,
                segundoEtiqueta: "GPS",
                segundoValor: zoneVeredicto,
                segundoTono: zoneVeredictoColor,
                accion: structuralAction,
                onToca: structuralTap
            ))
        }

        if let dist = session.liveRunDistanceMeters {
            list.append(WatchPagina(
                id: "distancia",
                contexto: "Recorriste",
                modo: modo,
                sujeto: distanceValue(dist),
                unidad: dist >= 1000 ? "km" : "m",
                accion: list.isEmpty ? structuralAction : nil,
                onToca: list.isEmpty ? structuralTap : nil
            ))
        }

        // Tiempo: siempre, y es la degradación final si no hay GPS.
        list.append(WatchPaginasComunes.tiempo(
            segundos: session.condElapsed,
            contexto: measuredPace == nil && session.liveRunDistanceMeters == nil ? statusText : "Llevas",
            nota: measuredPace == nil && session.currentSegment?.kind == .running ? WatchNota.sinSenal : nil,
            modo: modo
        ).conAccion(structuralAction, onToca: structuralTap))

        if let pulso = WatchPaginasComunes.pulso(
            bpm: session.liveHRBpm,
            zone: session.liveZone,
            modo: modo
        ) {
            list.append(pulso)
        }

        return list
    }

    private var bisel: AnyView? {
        // Si hay objetivo de distancia o tiempo prescrito, el aro drena lo que queda.
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

    // MARK: - Derived

    private var measuredPace: Int? {
        guard session.currentSegment?.kind == .running else { return nil }
        return session.liveCoveredPaceSecPerKm
    }

    private func distanceValue(_ meters: Double) -> String {
        if meters >= 1000 {
            return Formato.esDecimal(meters / 1000, decimals: 2, siempreDecimales: true)
        }
        return String(Int(meters))
    }

    private var statusText: String {
        if let z = session.currentSegment?.targetZone {
            let kind = session.currentSegment?.kind == .running ? "Correr" : "Continuo"
            return "\(kind) · \(z.label)"
        }
        return session.currentSegment?.kind == .running ? "Correr" : "Continuo"
    }

    private var inZone: Bool {
        guard let target = session.currentSegment?.targetZone, let live = session.liveZone else { return false }
        return live == target
    }

    private var zoneVeredicto: String? {
        guard session.currentSegment?.targetZone != nil, session.liveZone != nil else { return nil }
        return inZone ? "en zona" : "fuera de zona"
    }

    private var zoneVeredictoColor: Color? {
        guard zoneVeredicto != nil else { return nil }
        return inZone ? WatchTheme.zoneGreen : WatchTheme.zoneAmber
    }

    private var structuralAction: String? {
        session.currentBlockIsStructural ? "Toca · hecho" : nil
    }

    private var structuralTap: (() -> Void)? {
        session.currentBlockIsStructural ? { session.completeStructuralBlock() } : nil
    }
}

// MARK: - Pequeña ayuda para reusar la página de tiempo con acción estructural

private extension WatchPagina {
    func conAccion(_ accion: String?, onToca: (() -> Void)?) -> WatchPagina {
        var copy = self
        if let accion {
            copy.accion = accion
            copy.onToca = onToca
        }
        return copy
    }
}
