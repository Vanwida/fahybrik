import SwiftUI

// SET_TABLE family — per-set strength (a 5×5, a pyramid) logged one set at a time.
// Big load + reps·RIR, a set-progress dot row, a green "Serie hecha" that confirms
// the set and fires the prescribed rest; the crown nudges the load ±2.5 kg. Mockup
// 4d. A single-set strength move falls back to a simple load + "Hecho" flow.
struct SetTableLiveView: View {
    let session: WorkoutSession

    /// The set the athlete is on. Local (not derived from `confirmed`, which a load
    /// edit also flips) and preserved while the rest banner overlays this view.
    @State private var activeSetIndex = 0
    @State private var crownLoad: Double = 0
    /// True while the crown value is being programmatically seeded, so the seed
    /// never writes back (which would forge the set's "touched" flag).
    @State private var seedingCrown = true

    var body: some View {
        content
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

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if session.setRecords.isEmpty {
            singleSet
        } else {
            multiSet
        }
    }

    // MARK: - Multi-set

    private var multiSet: some View {
        let total = session.setRecords.count
        let lectura = lecturaDeSerie
        return LiveScaffold(status: "Fuerza · \(Vocab.serie) \(min(activeSetIndex + 1, total)) / \(total)") {
            VStack(spacing: 5) {
                WatchLabel(text: lectura.etiqueta)
                GiantNumber(text: lectura.texto, size: 42, unit: lectura.unidad)
                if let detail = detailLine { detailText(detail) }
                SetDots(total: total, currentIndex: activeSetIndex, doneIndices: doneIndices)
                    .padding(.top, 2)
            }
        } bottom: {
            BigTapButton(title: "Serie hecha", kind: .green) { completeSet(total: total) }
        }
    }

    // MARK: - Single set

    private var singleSet: some View {
        let lectura = lecturaDeSerie
        return LiveScaffold(status: "Fuerza") {
            VStack(spacing: 5) {
                WatchLabel(text: lectura.etiqueta)
                GiantNumber(text: lectura.texto, size: 42, unit: lectura.unidad)
                if let detail = singleDetailLine { detailText(detail) }
            }
        } bottom: {
            BigTapButton(title: "Serie hecha", kind: .green) {
                session.primaryAdvance()
            }
        }
    }

    // MARK: - Shared pieces

    /// LA SIGUIENTE VERDAD DISPONIBLE de la serie: la carga si la hay, si no las reps,
    /// y si no hay ninguna de las dos el reloj de la serie — lo único que la app sabe
    /// con certeza. Etiqueta, cifra y unidad viajan JUNTAS, igual que en
    /// `OutdoorRunHUDView.lecturaViva`.
    ///
    /// Antes el hueco se pintaba con un guion bajo un «Objetivo» fijo, y las dos
    /// mitades mentían a la vez: no había cifra, y la etiqueta seguía llamando
    /// objetivo a algo que nadie prescribió (un movimiento a peso corporal por tiempo
    /// no lleva ni kilos ni reps). Un cero tampoco vale: esto es una DOSIS, no un
    /// contador, y «0 reps» es una prescripción falsa (§6.2 bis).
    private var lecturaDeSerie: (etiqueta: String, texto: String, unidad: String?) {
        if let load = currentLoadKg { return (Vocab.objetivo, WatchFormat.kg(load), "kg") }
        if let reps = currentReps { return (Vocab.objetivo, "\(reps)", Vocab.reps) }
        return (Vocab.tiempo, WatchFormat.clock(session.lapElapsedSeconds), nil)
    }

    private func detailText(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .heavy))
            .foregroundStyle(WatchTheme.orangeSoft)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    // MARK: - Actions

    private func completeSet(total: Int) {
        session.confirmSet(activeSetIndex)   // fires the prescribed rest
        if activeSetIndex + 1 < total {
            activeSetIndex += 1
        } else {
            session.primaryAdvance()          // last set done → advance the segment
        }
    }

    private func resetForSegment() {
        activeSetIndex = 0
        seedCrown()
    }

    private func seedCrown() {
        // Only arm the "swallow the seed" flag when the value actually CHANGES —
        // otherwise `.onChange(of: crownLoad)` never fires (it's Equatable-gated), the
        // flag stays stuck true, and the next real crown turn (the common case: the
        // next set has the same prescribed load) gets silently eaten. When the value
        // is unchanged there is no programmatic write to swallow, so clear the flag.
        let target = currentLoadKg ?? 0
        if target == crownLoad {
            seedingCrown = false
        } else {
            seedingCrown = true
            crownLoad = target
        }
    }

    private func applyCrownLoad(_ value: Double) {
        // Swallow the programmatic seed — only a real crown turn writes back.
        if seedingCrown { seedingCrown = false; return }
        let clamped = max(0, value)
        if session.setRecords.indices.contains(activeSetIndex) {
            session.setSetLoad(activeSetIndex, clamped)
        } else {
            session.manualLoadKg = clamped
        }
    }

    // MARK: - Derived

    private var doneIndices: Set<Int> { Set(0..<activeSetIndex) }

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

    /// Las reps solo bajan al detalle cuando NO son ya el sujeto: sin carga el hero es
    /// el número de reps, y repetirlo debajo era leer «8 · 8 reps · RIR 2».
    private var detailLine: String? {
        var parts: [String] = []
        if let reps = currentReps, currentLoadKg != nil { parts.append("\(reps) \(Vocab.reps)") }
        if let rir = prescribedSet?.prescribedRir { parts.append("\(Vocab.rir) \(intOrOne(rir))") }
        else if let rpe = prescribedSet?.prescribedRpe { parts.append("\(Vocab.rpe) \(intOrOne(rpe))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var singleDetailLine: String? {
        var parts: [String] = []
        if let reps = currentReps, currentLoadKg != nil { parts.append("\(reps) \(Vocab.reps)") }
        if let e = session.currentSegment?.effortGuidance { parts.append(e) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func intOrOne(_ v: Double) -> String {
        Formato.esDecimal(v)
    }
}
