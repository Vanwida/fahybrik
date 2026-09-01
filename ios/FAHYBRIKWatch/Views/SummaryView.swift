import SwiftUI

// AL TERMINAR, EN LA MUÑECA — un sujeto por página.
//
// Diseño (`watch-resumen`): la primera página es el número que cuenta (rondas
// o tiempo), no un mosaico de celdas iguales. El pulso va en su página. Dobles
// mantiene el toggle de compartir. "Listo" cierra.
struct SummaryView: View {
    let session: WorkoutSession
    let coordinator: WatchWorkoutCoordinator
    let onDone: () -> Void

    var body: some View {
        WatchReloj(
            paginas: paginas,
            tinte: isPartial ? WatchTheme.zoneAmber : WatchTheme.zoneGreen
        )
    }

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = []

        // 1. El veredicto: completado / parcial + el reloj total.
        list.append(WatchPagina(
            id: "total",
            contexto: isPartial ? "Parcial" : "Completado",
            modo: .mando,
            sujeto: WatchFormat.clock(session.elapsedSeconds),
            segundoEtiqueta: leftTileLabel,
            segundoValor: leftTileValue,
            accion: "Toca · listo",
            onToca: onDone,
            nota: saveNote
        ))

        // 2. Rondas/bloques como sujeto propio si son el score.
        if session.capturedScoreRounds != nil {
            list.append(WatchPagina(
                id: "score",
                contexto: "Rondas",
                modo: .mando,
                sujeto: leftTileValue,
                segundoEtiqueta: "Tiempo",
                segundoValor: WatchFormat.clock(session.elapsedSeconds),
                accion: "Toca · listo",
                onToca: onDone
            ))
        }

        // 3. Pulso medio, si lo hubo.
        if let avg = avgHR {
            list.append(WatchPagina(
                id: "fc",
                contexto: Vocab.fcMedia,
                modo: .mando,
                sujeto: "\(avg)",
                segundoValor: "ppm",
                accion: "Toca · listo",
                onToca: onDone
            ))
        }

        // 4. Dobles: decisión de compartir (sólo si aplica).
        if coordinator.isDoublesShareable {
            list.append(WatchPagina(
                id: "dobles",
                contexto: "Dobles · \(partnerName)",
                modo: .mando,
                sujeto: coordinator.shareWithPartner ? "Sí" : "No",
                segundoValor: "Compartir resultado",
                accion: coordinator.shareWithPartner
                    ? "Toca · solo para ti"
                    : "Toca · compartir",
                onToca: {
                    coordinator.setShareWithPartner(!coordinator.shareWithPartner)
                },
                nota: saveNote
            ))
        } else if coordinator.isDoublesResult {
            list.append(WatchPagina(
                id: "dobles-badge",
                contexto: "Dobles",
                modo: .mando,
                sujeto: partnerName,
                segundoValor: "con tu pareja",
                accion: "Toca · listo",
                onToca: onDone
            ))
        }

        return list
    }

    // MARK: - Derived

    private var partnerName: String { coordinator.partnerFirstNameResult ?? "pareja" }
    private var isPartial: Bool { session.completeness == .partial }

    private var leftTileLabel: String { session.capturedScoreRounds != nil ? "Rondas" : "Bloques" }
    private var leftTileValue: String {
        if let rounds = session.capturedScoreRounds { return "\(rounds)" }
        return "\(session.completedBlockCount)"
    }

    private var avgHR: Int? {
        let avgs = session.laps.compactMap(\.avgHRBpm)
        guard !avgs.isEmpty else { return nil }
        return avgs.reduce(0, +) / avgs.count
    }

    private var saveNote: String {
        guard coordinator.isDoublesShareable else { return "Guardado en el iPhone" }
        return coordinator.shareWithPartner
            ? "Se comparte con \(partnerName)"
            : "Solo para ti"
    }
}
