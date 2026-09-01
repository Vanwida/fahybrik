import SwiftUI

// FUERZA — set table en la muñeca.
//
// Diseño (`watch-fuerza`):
//   · Durante la serie → modo CIEGO: el reloj enuncia (carga/reps) y espera;
//     franja atenuada «serie hecha». No pide nada a gritos mientras sostienes la barra.
//   · Bisel segmentado = serie N de M.
//   · Carga con corona (±2,5 kg). Página del cuerpo aparte.
// El descanso lo pinta `RestBannerView` a pantalla completa (mando + cuenta atrás).
struct SetTableLiveView: View {
    let session: WorkoutSession

    @State private var activeSetIndex = 0
    @State private var crownLoad: Double = 0
    @State private var seedingCrown = true
    @State private var destello = WatchDestello()

    var body: some View {
        WatchReloj(
            paginas: paginas,
            tinte: WatchTinte.color(for: session.liveZone),
            bisel: bisel,
            destello: destello
        )
        .focusable(true)
        .digitalCrownRotation(
            $crownLoad,
            from: 0, through: 500, by: WatchTheme.loadStepKg,
            sensitivity: .low, isContinuous: false
        )
        .onChange(of: crownLoad) { _, newValue in applyCrownLoad(newValue) }
        .onChange(of: session.currentSegmentIndex) { _, _ in resetForSegment() }
        .onChange(of: activeSetIndex) { _, _ in seedCrown() }
        .onAppear { resetForSegment() }
    }

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = [paginaSerie]
        if let pulso = WatchPaginasComunes.pulso(
            bpm: session.liveHRBpm,
            zone: session.liveZone,
            modo: .ciego
        ) {
            list.append(pulso)
        }
        return list
    }

    private var paginaSerie: WatchPagina {
        let lectura = lecturaDeSerie
        let total = max(1, session.setRecords.isEmpty ? 1 : session.setRecords.count)
        let n = session.setRecords.isEmpty ? 1 : min(activeSetIndex + 1, total)
        return WatchPagina(
            id: "serie",
            contexto: session.setRecords.isEmpty
                ? "Fuerza"
                : "Serie \(n) / \(total)",
            modo: .ciego,
            sujeto: lectura.texto,
            unidad: lectura.unidad,
            segundoEtiqueta: lectura.detalle != nil ? nil : nil,
            segundoValor: lectura.detalle,
            segundoTono: WatchTheme.orangeSoft,
            accion: "Toca · serie hecha",
            onToca: { completeSet() },
            nota: WatchNota.loDicesTu
        )
    }

    private var bisel: AnyView? {
        let total = session.setRecords.count
        guard total > 0 else { return nil }
        return WatchAroSegmentado(
            total: total,
            hechas: activeSetIndex,
            fraccion: 0
        ).watchBisel()
    }

    // MARK: - Lectura

    /// Carga → reps → reloj de la serie. Etiqueta y cifra viajan juntas (§7).
    private var lecturaDeSerie: (texto: String, unidad: String?, detalle: String?) {
        if let load = currentLoadKg {
            return (WatchFormat.kg(load), "kg", detailLine)
        }
        if let reps = currentReps {
            return ("\(reps)", Vocab.reps, detailLineSinReps)
        }
        return (WatchFormat.clock(session.lapElapsedSeconds), nil, detailLine)
    }

    private var detailLine: String? {
        var parts: [String] = []
        if let reps = currentReps, currentLoadKg != nil { parts.append("\(reps) \(Vocab.reps)") }
        if let rir = prescribedSet?.prescribedRir { parts.append("\(Vocab.rir) \(Formato.esDecimal(rir))") }
        else if let rpe = prescribedSet?.prescribedRpe { parts.append("\(Vocab.rpe) \(Formato.esDecimal(rpe))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var detailLineSinReps: String? {
        var parts: [String] = []
        if let rir = prescribedSet?.prescribedRir { parts.append("\(Vocab.rir) \(Formato.esDecimal(rir))") }
        else if let rpe = prescribedSet?.prescribedRpe { parts.append("\(Vocab.rpe) \(Formato.esDecimal(rpe))") }
        if let e = session.currentSegment?.effortGuidance, parts.isEmpty { parts.append(e) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Actions

    private func completeSet() {
        destello = WatchDestello(n: destello.n + 1, color: WatchTheme.zoneGreen)
        if session.setRecords.isEmpty {
            session.primaryAdvance()
            return
        }
        let total = session.setRecords.count
        session.confirmSet(activeSetIndex)
        if activeSetIndex + 1 < total {
            activeSetIndex += 1
        } else {
            session.primaryAdvance()
        }
    }

    private func resetForSegment() {
        activeSetIndex = 0
        seedCrown()
    }

    private func seedCrown() {
        let target = currentLoadKg ?? 0
        if target == crownLoad {
            seedingCrown = false
        } else {
            seedingCrown = true
            crownLoad = target
        }
    }

    private func applyCrownLoad(_ value: Double) {
        if seedingCrown { seedingCrown = false; return }
        let clamped = max(0, value)
        if session.setRecords.indices.contains(activeSetIndex) {
            session.setSetLoad(activeSetIndex, clamped)
        } else {
            session.manualLoadKg = clamped
        }
    }

    // MARK: - Derived

    private var currentLoadKg: Double? {
        if session.setRecords.indices.contains(activeSetIndex) {
            let s = session.setRecords[activeSetIndex]
            return s.loadActualKg ?? s.loadPrescribedKg
        }
        return session.manualLoadKg ?? session.currentSegment?.loadKg
    }

    private var currentReps: Int? {
        if session.setRecords.indices.contains(activeSetIndex) {
            let s = session.setRecords[activeSetIndex]
            return s.repsActual ?? s.repsPrescribed
        }
        return session.currentSegment?.prescribedRepsForLog
    }

    private var prescribedSet: PrescriptionSet? {
        guard let sets = session.currentSegment?.prescription?.sets,
              sets.indices.contains(activeSetIndex) else { return nil }
        return sets[activeSetIndex]
    }
}
