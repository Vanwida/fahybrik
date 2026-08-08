import SwiftUI

// SERIES DE CALLE — una serie a la vez en la muñeca.
//
// Qué se enseña en cada momento vive en `GuionSeries` (función pura, probada sin
// pantalla). Aquí quedan las tres cosas que sí son de la vista: leer el motor y
// el driver de tramo, el bisel segmentado y los avisos hápticos.
struct StructuredRunLiveView: View {
    let session: WorkoutSession
    let driver: WatchRunLegDriver

    @State private var lastPaceHapticAt: Date = .distantPast
    @State private var destello = WatchDestello()
    @State private var lastLegIndex: Int = -1

    var body: some View {
        content
            .onChange(of: legPaceSecPerKm) { _, _ in
                guard isWork, let status = objetivo?.status,
                      status == .tooFast || status == .tooSlow else { return }
                if Date().timeIntervalSince(lastPaceHapticAt) >= WatchTheme.zoneExitHapticThrottle {
                    lastPaceHapticAt = Date()
                    WatchHaptics.warning()
                }
            }
            .onChange(of: session.runLegIndex) { _, new in
                if lastLegIndex >= 0, new != lastLegIndex {
                    destello = WatchDestello(
                        n: destello.n + 1,
                        color: isRecovery ? WatchTheme.zoneGreen : WatchTheme.orangeSoft
                    )
                }
                lastLegIndex = new
            }
            .onAppear { lastLegIndex = session.runLegIndex }
    }

    @ViewBuilder
    private var content: some View {
        if session.isRunCountIn {
            countIn
        } else {
            WatchReloj(
                paginas: GuionSeries.paginas(estado, gestos) + paginasDeZona,
                tinte: tinteLienzo,
                fondo: lienzoDeZona,
                bisel: bisel,
                destello: destello
            )
        }
    }

    // MARK: - Count-in

    private var countIn: some View {
        WatchReloj(
            paginas: [
                WatchPagina(
                    id: "countin",
                    contexto: "Serie \(workLegNumber) / \(workLegTotal)",
                    modo: .ojeada,
                    sujeto: WatchFormat.countdown(session.runCountInRemaining),
                    tono: WatchTheme.orange,
                    segundoEtiqueta: "Luego",
                    segundoValor: RunLegDisplay.nextLegPreview(session.currentRunLeg)
                ),
            ],
            tinte: WatchTheme.orange,
            bisel: WatchAroContinuo(remaining: countInFraction).watchBisel(),
            destello: destello
        )
    }

    // MARK: - El motor → el guion

    private var estado: GuionSeries.Estado {
        GuionSeries.Estado(
            fase: isRecovery ? .recupera : .trabajo,
            enMovimiento: session.currentRunLeg?.recuperaEnMovimiento ?? false,
            // En la recuperación el número que importa es el de la serie que VIENE.
            serie: isRecovery ? (workLegNumberForNext ?? workLegTotal) : workLegNumber,
            totalSeries: workLegTotal,
            cierre: cierre,
            metrosEnTramo: driver.legCoveredMeters,
            quedaS: esPorTiempo ? session.runLegRemaining : nil,
            enTramoS: session.runLegElapsed,
            ritmoSecPorKm: legPaceSecPerKm,
            objetivo: objetivo,
            loQueViene: isRecovery ? RunLegDisplay.nextLegPreview(nextRunLeg) : nil,
            zonaViva: session.liveZone,
            bpm: session.liveHRBpm
        )
    }

    private var gestos: GuionSeries.Gestos {
        GuionSeries.Gestos(
            cerrarSerie: { session.primaryAdvance() },
            empezarYa: { session.primaryAdvance() }
        )
    }

    /// QUIÉN CIERRA el tramo en curso — la pregunta que decide el sujeto.
    private var cierre: GuionSeries.Cierre {
        if let m = session.currentRunLeg?.distanceMeters, m > 0 {
            return .hito(metros: Double(m))
        }
        if esPorTiempo { return .reloj }
        return .atleta
    }

    private var esPorTiempo: Bool {
        (session.currentRunLeg?.durationSeconds ?? 0) > 0
    }

    // MARK: - La zona como sujeto (y como lienzo)

    /// Detrás de la página de la serie: el sujeto sigue siendo la serie. Sin
    /// bandas o sin pulso no existe (§7). El objetivo que juzga es el del TRAMO
    /// en curso — una serie a Z4 y su trote a Z1 no se juzgan contra lo mismo.
    private var paginasDeZona: [WatchPagina] {
        [WatchPaginasComunes.zona(session.liveZonePosition,
                                  bpm: session.liveHRBpm,
                                  objetivo: zonaObjetivoDelTramo)].compactMap { $0 }
    }

    private var zonaObjetivoDelTramo: HRZone? {
        if case let .hrZone(z) = session.currentRunLeg?.target { return HRZone(rawValue: z) }
        return session.currentSegment?.targetZone
    }

    /// En la RECUPERACIÓN manda el verde de recuperar, que es un estado y no una
    /// zona; corriendo, el lienzo es tu zona llenándose hacia la siguiente.
    private var lienzoDeZona: AnyView? {
        guard !isRecovery, let p = session.liveZonePosition else { return nil }
        return AnyView(WatchLienzoZona(posicion: p))
    }

    // MARK: - Bisel / tinte

    private var bisel: AnyView? {
        if isRecovery {
            if let total = session.currentRunLeg?.durationSeconds, total > 0 {
                return WatchAroContinuo(remaining: session.runLegRemaining / Double(total)).watchBisel()
            }
            return WatchAroContinuo(remaining: 1).watchBisel()
        }
        return WatchAroSegmentado(
            total: max(1, workLegTotal),
            hechas: max(0, workLegNumber - 1),
            fraccion: workFraction
        ).watchBisel()
    }

    private var tinteLienzo: Color? {
        if isRecovery { return WatchTheme.zoneGreen }
        return WatchTinte.color(for: session.liveZone)
    }

    // MARK: - Derived

    private var isWork: Bool { session.isRunLegWork }
    private var isRecovery: Bool { !(session.currentRunLeg?.isWork ?? true) }

    private var legPaceSecPerKm: Int? {
        RunLegDisplay.legPaceSecPerKm(coveredMeters: driver.legCoveredMeters, elapsedS: session.runLegElapsed)
    }

    private var objetivo: (label: String, status: TargetStatus)? {
        session.currentRunLeg.flatMap { RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: legPaceSecPerKm) }
    }

    private var nextRunLeg: RunLeg? {
        guard let legs = session.currentRunLegs else { return nil }
        let i = session.runLegIndex + 1
        return i < legs.count ? legs[i] : nil
    }

    /// Sólo las piernas de TRABAJO cuentan como serie (una recuperación no es
    /// «la serie 3»), y por eso el aro se segmenta con ellas y no con los tramos.
    private var workLegs: [RunLeg] {
        (session.currentRunLegs ?? []).filter(\.isWork)
    }

    /// La MISMA regla que manda el cable (RunLegDisplay.serie): tenía aquí su
    /// propia copia y dos copias de una cuenta acaban discrepando.
    private var serie: (n: Int, total: Int) {
        RunLegDisplay.serie(legs: session.currentRunLegs ?? [], indice: session.runLegIndex)
    }

    private var workLegTotal: Int { serie.total }

    private var workLegNumber: Int { serie.n }

    private var workLegNumberForNext: Int? {
        guard isRecovery else { return nil }
        let n = workLegNumber + 1
        return n <= workLegTotal ? n : nil
    }

    private var workFraction: Double {
        guard let leg = session.currentRunLeg else { return 0 }
        if let target = leg.distanceMeters, target > 0 {
            return min(1, max(0, driver.legCoveredMeters / Double(target)))
        }
        if let total = leg.durationSeconds, total > 0 {
            return min(1, max(0, session.runLegElapsed / Double(total)))
        }
        return 0
    }

    private var countInFraction: Double {
        min(1, max(0, session.runCountInRemaining / 3))
    }
}
