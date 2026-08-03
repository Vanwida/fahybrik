import SwiftUI

// SERIES DE CALLE — una serie a la vez en la muñeca.
//
// Diseño (`watch-series` / kit-watch):
//   · Trabajo  → modo ojeada: metros que faltan (o los que llevas sin objetivo),
//     ritmo GPS en segundo nivel, CERO franja anunciada. Gesto latente solo si
//     nadie puede cerrar el tramo (sin distancia prescrita).
//   · Recupera → modo mando: cuenta atrás, lo que viene, «empezar ya».
//   · Bisel segmentado = serie N de M + avance dentro del tramo.
//   · Página del cuerpo (pulso) aparte.
//
// Corrige el live de hoy: héroe a 50 pt con botón de 52 pt y zona bar robando
// altura. La pantalla ES el botón; el progreso vive en el bisel.
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
                paginas: paginas,
                tinte: tinteLienzo,
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
                    contexto: statusText,
                    modo: .ojeada,
                    sujeto: WatchFormat.countdown(session.runCountInRemaining),
                    tono: WatchTheme.orange,
                    segundoEtiqueta: "Luego",
                    segundoValor: RunLegDisplay.nextLegPreview(session.currentRunLeg)
                ),
            ],
            tinte: WatchTheme.orange,
            bisel: WatchAroContinuo(
                remaining: countInFraction
            ).watchBisel(),
            destello: destello
        )
    }

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = []
        if isRecovery {
            list.append(paginaRecupera)
        } else {
            list.append(paginaSerie)
        }
        if let pulso = WatchPaginasComunes.pulso(
            bpm: session.liveHRBpm,
            zone: session.liveZone,
            modo: isRecovery ? .mando : .ojeada
        ) {
            list.append(pulso)
        }
        return list
    }

    private var paginaSerie: WatchPagina {
        let objetivoM = session.currentRunLeg?.distanceMeters
        let cubiertos = driver.legCoveredMeters
        let texto: String
        let unidad = "m"
        if let objetivoM, objetivoM > 0 {
            // Redondeo hacia ARRIBA: no dar por acabado un tramo antes de tiempo.
            texto = String(Int(ceil(max(0, Double(objetivoM) - cubiertos))))
        } else if let total = session.currentRunLeg?.durationSeconds, total > 0 {
            // Tramo a tiempo: la cuenta atrás manda.
            return WatchPagina(
                id: "serie-tiempo",
                contexto: statusText,
                modo: .ojeada,
                sujeto: WatchFormat.countdown(session.runLegRemaining),
                tono: WatchTinte.urgente(session.runLegRemaining),
                segundoEtiqueta: legPaceSecPerKm != nil ? "GPS" : nil,
                segundoValor: legPaceSecPerKm.map { "\(WatchFormat.pace($0))/km" },
                // Con hito de tiempo el motor cierra solo: no se declara toque.
                accion: nil,
                onToca: nil
            )
        } else {
            // Sin objetivo: lo único que sabe el reloj son los metros que LLEVAS.
            texto = String(Int(floor(cubiertos)))
        }

        let cierreManual = objetivoM == nil && session.currentRunLeg?.durationSeconds == nil
        return WatchPagina(
            id: "serie",
            contexto: statusText,
            modo: .ojeada,
            sujeto: texto,
            unidad: unidad,
            segundoEtiqueta: legPaceSecPerKm != nil ? "GPS" : nil,
            segundoValor: legPaceSecPerKm.map { "\(WatchFormat.pace($0))/km" }
                ?? (objetivoM == nil ? "sin objetivo" : nil),
            // Gesto latente solo cuando NADA cierra el tramo (§7).
            accion: cierreManual ? "Toca · serie hecha" : nil,
            onToca: cierreManual ? { session.primaryAdvance() } : nil
        )
    }

    private var paginaRecupera: WatchPagina {
        let queda = session.runLegRemaining
        let luego: String? = {
            if let m = session.currentRunLeg.flatMap({ _ in nextWorkMeters }) {
                return "\(m) m"
            }
            return RunLegDisplay.nextLegPreview(nextRunLeg)
        }()
        return WatchPagina(
            id: "recupera",
            contexto: recoveryContexto,
            modo: .mando,
            sujeto: {
                if let target = session.currentRunLeg?.durationSeconds, target > 0 {
                    return WatchFormat.countdown(queda)
                }
                return String(Int(driver.legCoveredMeters))
            }(),
            unidad: (session.currentRunLeg?.durationSeconds ?? 0) > 0 ? nil : "m",
            tono: {
                if let target = session.currentRunLeg?.durationSeconds, target > 0 {
                    return WatchTinte.urgente(queda)
                }
                return WatchTheme.ink
            }(),
            segundoEtiqueta: luego != nil ? "Luego" : nil,
            segundoValor: luego,
            accion: "Toca · empezar ya",
            onToca: { session.primaryAdvance() }
        )
    }

    // MARK: - Bisel / tinte

    private var bisel: AnyView? {
        if isRecovery {
            if let total = session.currentRunLeg?.durationSeconds, total > 0 {
                let rem = total > 0 ? session.runLegRemaining / Double(total) : 0
                return WatchAroContinuo(remaining: rem).watchBisel()
            }
            return WatchAroContinuo(remaining: 1).watchBisel()
        }
        let total = max(1, workLegTotal)
        let hechas = max(0, workLegNumber - 1)
        return WatchAroSegmentado(
            total: total,
            hechas: hechas,
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

    private var statusText: String {
        let n = session.runLegNumber
        let m = session.runLegTotal
        let measure = session.currentRunLeg.map(RunLegDisplay.measureLabel) ?? ""
        if measure.isEmpty { return "Serie \(n) / \(m)" }
        return "Serie \(n) / \(m) · \(measure)"
    }

    private var recoveryContexto: String {
        let mode = RunLegDisplay.recoveryModeWord(session.currentRunLeg?.recoveryMode)
        let base = mode.isEmpty ? "Recupera" : "Recupera \(mode)"
        if let next = workLegNumberForNext {
            return "\(base) · viene la \(next)"
        }
        return base
    }

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

    private var nextWorkMeters: Int? {
        nextRunLeg?.distanceMeters
    }

    /// Solo piernas de trabajo cuentan en el aro (las recuperaciones no son “serie”).
    private var workLegs: [RunLeg] {
        (session.currentRunLegs ?? []).filter(\.isWork)
    }

    private var workLegTotal: Int { max(1, workLegs.count) }

    private var workLegNumber: Int {
        guard let legs = session.currentRunLegs else { return session.runLegNumber }
        let done = legs.prefix(session.runLegIndex).filter(\.isWork).count
        return isWork ? done + 1 : done
    }

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
        // Count-in suele ser 3 s; sin total fijo drenamos visualmente por remaining/3.
        let total: Double = 3
        return min(1, max(0, session.runCountInRemaining / total))
    }
}
