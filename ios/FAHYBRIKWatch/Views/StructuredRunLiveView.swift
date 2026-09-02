import SwiftUI

// SERIES DE CALLE — una serie a la vez en la muñeca.
//
// El cromo es la lámina (FH-30): Vivo = restante de ESTA pieza, cero botones
// en trabajo. El count-in (FH-29) se queda: no se reabre aquí.
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
            RodajeVivoPage(session: session, driver: driver, destello: destello)
        }
    }

    // MARK: - Count-in (FH-29: no se reabre)

    private var countIn: some View {
        WatchReloj(
            paginas: [
                WatchPagina(
                    id: "countin",
                    contexto: RunLegDisplay.nombreDeParte(session.currentRunLeg?.phaseRole ?? .main)
                        ?? "Serie \(workLegNumber) / \(workLegTotal)",
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

    private var objetivo: (label: String, status: TargetStatus)? {
        session.currentRunLeg.flatMap { RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: legPaceSecPerKm) }
    }

    private var isWork: Bool { session.isRunLegWork }
    private var isRecovery: Bool { !(session.currentRunLeg?.isWork ?? true) }

    private var legPaceSecPerKm: Int? {
        RunLegDisplay.legPaceSecPerKm(coveredMeters: driver.legCoveredMeters, elapsedS: session.runLegElapsed)
    }

    private var serie: (n: Int, total: Int) {
        RunLegDisplay.serie(legs: session.currentRunLegs ?? [], indice: session.runLegIndex)
    }

    private var workLegTotal: Int { serie.total }
    private var workLegNumber: Int { serie.n }

    private var countInFraction: Double {
        min(1, max(0, session.runCountInRemaining / 3))
    }
}
