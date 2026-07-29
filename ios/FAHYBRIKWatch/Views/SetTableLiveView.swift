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
        return LiveScaffold(status: "Fuerza · Serie \(min(activeSetIndex + 1, total)) / \(total)") {
            VStack(spacing: 5) {
                WatchLabel(text: "Objetivo")
                loadHero
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
        LiveScaffold(status: "Fuerza") {
            VStack(spacing: 5) {
                WatchLabel(text: "Objetivo")
                loadHero
                if let detail = singleDetailLine { detailText(detail) }
            }
        } bottom: {
            BigTapButton(title: "Serie hecha", kind: .green) {
                session.primaryAdvance()
            }
        }
    }

    // MARK: - Shared pieces

    @ViewBuilder
    private var loadHero: some View {
        if let load = currentLoadKg {
            GiantNumber(text: WatchFormat.kg(load), size: 42, unit: "kg")
        } else {
            // Bodyweight / %RM with no absolute kg — the reps line carries the work.
            GiantNumber(text: currentReps.map(String.init) ?? "—", size: 42, unit: "reps")
        }
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

    private var detailLine: String? {
        var parts: [String] = []
        if let reps = currentReps { parts.append("\(reps) reps") }
        if let rir = prescribedSet?.prescribedRir { parts.append("RIR \(intOrOne(rir))") }
        else if let rpe = prescribedSet?.prescribedRpe { parts.append("RPE \(intOrOne(rpe))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var singleDetailLine: String? {
        guard let reps = currentReps else { return session.currentSegment?.effortGuidance }
        var parts = ["\(reps) reps"]
        if let e = session.currentSegment?.effortGuidance { parts.append(e) }
        return parts.joined(separator: " · ")
    }

    private func intOrOne(_ v: Double) -> String {
        Formato.esDecimal(v)
    }
}
