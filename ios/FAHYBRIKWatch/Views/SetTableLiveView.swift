import SwiftUI

// FUERZA — set table en la muñeca.
//
// Diseño (`watch-fuerza`):
//   · Durante la serie → modo CIEGO: el reloj enuncia (carga/reps) y espera;
//     franja atenuada «serie hecha». No pide nada a gritos mientras sostienes la barra.
//   · Bisel segmentado = serie N de M.
//   · Carga con corona (±2,5 kg). Página del cuerpo aparte.
// El descanso lo pinta `RestBannerView` a pantalla completa (mando + cuenta atrás).
//
// LA SERIE LA LLEVA EL MOTOR, no esta vista (28-sep). La vista guardaba su propio
// índice y confirmaba ella la serie antes de avanzar: tras la última serie con
// descanso, el toque la confirmaba, arrancaba el descanso y el avance lo quitaba, sin
// salir nunca del ejercicio; y tras reanudar volvía a la serie 1 y la corona pisaba
// el peso de series ya hechas. Ahora la serie es `session.pendingSetIndex` y el
// toque es un paso del motor, el mismo que el «Siguiente» del espejo.
struct SetTableLiveView: View {
    let session: WorkoutSession

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
        .onChange(of: session.currentSegmentIndex) { _, _ in seedCrown() }
        .onChange(of: session.pendingSetIndex) { _, _ in seedCrown() }
        .onAppear { seedCrown() }
    }

    // MARK: - La serie (del motor)

    /// La serie que se lee: la pendiente o, con todas cerradas, la última.
    private var shownSetIndex: Int? {
        session.pendingSetIndex ?? (session.setRecords.isEmpty ? nil : session.setRecords.count - 1)
    }

    /// Todas las series cerradas: el siguiente toque cierra el ejercicio.
    private var allSetsClosed: Bool {
        !session.setRecords.isEmpty && session.pendingSetIndex == nil
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
        let n = min((shownSetIndex ?? 0) + 1, total)
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
            accion: allSetsClosed ? "Toca · siguiente" : "Toca · serie hecha",
            onToca: { completeSet() },
            nota: WatchNota.loDicesTu
        )
    }

    private var bisel: AnyView? {
        let total = session.setRecords.count
        guard total > 0 else { return nil }
        return WatchAroSegmentado(
            total: total,
            hechas: session.pendingSetIndex ?? total,
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

    /// Un toque = un paso del motor (`strengthPrimary`): cierra la serie pendiente y
    /// arranca su descanso; sin serie pendiente, cierra el ejercicio. Con dedo detrás,
    /// así que pasa por el antirrebote, como el «Siguiente» del espejo.
    private func completeSet() {
        destello = WatchDestello(n: destello.n + 1, color: WatchTheme.zoneGreen)
        session.primaryAdvance(fromAthleteTap: true)
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
        if session.setRecords.isEmpty {
            session.manualLoadKg = clamped
        } else {
            // La pendiente y las que vienen detrás; nunca una serie ya hecha.
            session.setPendingSetLoad(clamped)
        }
    }

    // MARK: - Derived

    private var currentLoadKg: Double? {
        if let i = shownSetIndex, session.setRecords.indices.contains(i) {
            let s = session.setRecords[i]
            return s.loadActualKg ?? s.loadPrescribedKg
        }
        return session.manualLoadKg ?? session.currentSegment?.loadKg
    }

    private var currentReps: Int? {
        if let i = shownSetIndex, session.setRecords.indices.contains(i) {
            let s = session.setRecords[i]
            return s.repsActual ?? s.repsPrescribed
        }
        return session.currentSegment?.prescribedRepsForLog
    }

    private var prescribedSet: PrescriptionSet? {
        guard let i = shownSetIndex, let sets = session.currentSegment?.prescription?.sets,
              sets.indices.contains(i) else { return nil }
        return sets[i]
    }
}
