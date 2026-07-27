import SwiftUI

// MARK: - Entreno libre — FUERZA (strength) builder
//
// The athlete assembles a strength session from catalog movements: each exercise
// gets N series × a uniform {measure × load × rest}. The scheme is fixed `.sets`
// (no format step). Every field maps to a real `Prescription` field (zero free
// text); per-set actuals get logged live in the set-table HUD. On start we build
// ONE segment per exercise (the set-table `kind: .strength` shape a prescribed
// strength item uses) so the live engine + HUDs behave identically, plus the
// free-save `items[]` (exercise_id + prescription) in the same execution order.

enum FreeStrengthMeasure: String, CaseIterable, Identifiable {
    case reps, time, distance
    var id: String { rawValue }
    var labelES: String {
        switch self {
        case .reps:     return "Reps"
        case .time:     return "Tiempo"
        case .distance: return "Distancia"
        }
    }
}

enum FreeStrengthLoad: String, CaseIterable, Identifiable {
    case bodyweight, kg
    var id: String { rawValue }
    var labelES: String {
        switch self {
        case .bodyweight: return "Corporal"
        case .kg:         return "Kg"
        }
    }
}

// Steps / defaults for the strength steppers — named, no magic numbers.
enum FreeStrengthStep {
    static let defaultSeries = 4
    static let maxSeries = 10
    static let repsStep = 1
    static let defaultReps = 10
    static let secondsStep = 15
    static let defaultSeconds = 30
    static let metersStep = 25
    static let defaultMeters = 50
    static let restStep = 15
    static let defaultRest = 90
    /// Load stepper granularity (kg). Stored as a count of these units so the Int
    /// `FreeStepper` can drive a 2.5-kg increment cleanly.
    static let kgIncrement = 2.5
    static let defaultKgUnits = 8      // 8 × 2.5 = 20 kg
    static let maxItems = 12           // the free-save contract's items[] ceiling
}

// One configured strength exercise. A uniform dose across its series (per-set
// actuals are logged live); the load is stored as a unit count so the Int stepper
// increments it by 2.5 kg.
struct FreeStrengthItem: Identifiable {
    let id = UUID()
    let exercise: FreeExercise
    var series: Int = FreeStrengthStep.defaultSeries
    var measure: FreeStrengthMeasure = .reps
    var reps: Int = FreeStrengthStep.defaultReps
    var seconds: Int = FreeStrengthStep.defaultSeconds
    var meters: Int = FreeStrengthStep.defaultMeters
    var loadKind: FreeStrengthLoad = .bodyweight
    var kgUnits: Int = FreeStrengthStep.defaultKgUnits
    var restSeconds: Int = FreeStrengthStep.defaultRest

    var kg: Double { Double(kgUnits) * FreeStrengthStep.kgIncrement }

    private func measureValue() -> Measure {
        switch measure {
        case .reps:     return .reps(reps)
        case .time:     return .duration(seconds: seconds)
        case .distance: return .distance(meters: Double(meters))
        }
    }

    private func target() -> Target {
        switch loadKind {
        case .bodyweight: return .bodyweight
        case .kg:         return .kg(value: kg, min: nil, max: nil)
        }
    }

    /// This exercise's built `Prescription`: scheme `.sets`, its own modality when
    /// the catalog tagged one (else `.strength`), and `series` identical sets each
    /// carrying the measure/target/rest.
    func prescription() -> Prescription {
        let m = measureValue()
        let t = target()
        let set = PrescriptionSet(measure: m, target: t, modality: nil,
                                  restS: restSeconds, tempo: nil, note: nil)
        return Prescription(
            scheme: .sets,
            modality: exercise.prescriptionModality ?? .strength,
            sets: Array(repeating: set, count: max(1, series)),
            rounds: nil, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil
        )
    }

    /// The runnable live-execution segment for this exercise — the set-table
    /// `kind: .strength` shape (mirrors `WorkoutPlan.segment(from:)` for a
    /// prescribed strength item). The scalar `targetReps`/`loadKg` ride alongside
    /// the prescription so a single-series exercise still primes the fallback rep
    /// flow; a multi-series one drives the per-set table off `prescription.sets`.
    func segment(order: Int, blockTitle: String = "Fuerza", blockPosition: Int = 1) -> WorkoutSegment {
        WorkoutSegment(
            order: order,
            title: exercise.name,
            kind: .strength,
            templateSegmentId: nil,
            targetReps: measure == .reps ? reps : nil,
            targetDistanceMeters: measure == .distance ? Double(meters) : nil,
            targetDurationSeconds: measure == .time ? seconds : nil,
            targetPaceSecondsPerKm: nil,
            targetPowerWatts: nil,
            targetZone: nil,
            loadKg: loadKind == .kg ? kg : nil,
            targetRpe: nil,
            blockTitle: blockTitle,
            blockPosition: blockPosition,
            videoUrl: nil,
            prescription: prescription()
        )
    }

    /// Live one-line preview, reusing the shared renderer so it reads exactly like
    /// the rest of the app ("4 × 10 · 20 kg · descanso 90s").
    var previewLine: String {
        PrescriptionRenderer.collapsedSetsLabel(prescription()) ?? exercise.name
    }
}

// MARK: - Draft (the fuerza form model)

@Observable
final class FreeStrengthDraft {
    var items: [FreeStrengthItem] = []
    /// Calentamiento OPCIONAL (petición de Alex entrenando): puede llevar
    /// ejercicios o ir vacío — vacío es solo la fase con su reloj, para que la
    /// serie 1 sea la serie 1 y no el calentamiento contado como trabajo.
    var includeWarmup: Bool = false
    var warmupItems: [FreeStrengthItem] = []
    var titleEdited: String = ""

    static let maxTitle = 80

    var canStart: Bool { !items.isEmpty }
    var canAddMore: Bool { items.count < FreeStrengthStep.maxItems }

    func add(_ exercise: FreeExercise) {
        guard canAddMore else { return }
        items.append(FreeStrengthItem(exercise: exercise))
    }

    func addWarmup(_ exercise: FreeExercise) {
        warmupItems.append(FreeStrengthItem(exercise: exercise))
    }

    func remove(_ id: UUID) {
        items.removeAll { $0.id == id }
        warmupItems.removeAll { $0.id == id }
    }

    func move(_ id: UUID, by delta: Int) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        let j = i + delta
        guard items.indices.contains(j) else { return }
        items.swapAt(i, j)
    }

    /// The free-save `items[]` — exercise_id + prescription, in execution order.
    /// REQUIRED for strength (the top-level prescription is omitted).
    func buildItems() -> [FreeWorkoutItemPayload]? {
        guard !items.isEmpty else { return nil }
        let warm = includeWarmup
            ? warmupItems.map { FreeWorkoutItemPayload(exercise_id: $0.exercise.id, prescription: $0.prescription(), part: "warmup") }
            : []
        return warm + items.map { FreeWorkoutItemPayload(exercise_id: $0.exercise.id, prescription: $0.prescription()) }
    }

    /// The runnable context: one segment per exercise (positions 1..N line up with
    /// items order for the execution upload) + the `items[]` payload.
    func buildContext() -> FreeWorkoutContext? {
        guard let payloadItems = buildItems() else { return nil }
        // Calentamiento primero (bloque 1), el trabajo después (bloque 2). Con el
        // calentamiento incluido pero VACÍO, un único paso manual "Calentamiento"
        // — calientas, le das a seguir, y empieza la fuerza.
        var segments: [WorkoutSegment] = []
        if includeWarmup {
            if warmupItems.isEmpty {
                segments.append(WorkoutSegment(
                    order: 1, title: "Calentamiento", kind: .reps,
                    templateSegmentId: nil,
                    targetReps: nil, targetDistanceMeters: nil, targetDurationSeconds: nil,
                    targetPaceSecondsPerKm: nil, targetPowerWatts: nil, targetZone: nil,
                    loadKg: nil, targetRpe: nil,
                    blockTitle: "Calentamiento", blockPosition: 1,
                    videoUrl: nil, prescription: nil
                ))
            } else {
                for (i, item) in warmupItems.enumerated() {
                    segments.append(item.segment(order: i + 1, blockTitle: "Calentamiento", blockPosition: 1))
                }
            }
        }
        let base = segments.count
        for (i, item) in items.enumerated() {
            segments.append(item.segment(order: base + i + 1, blockTitle: "Fuerza", blockPosition: includeWarmup ? 2 : 1))
        }
        let plan = WorkoutPlan(
            id: UUID(),
            name: resolvedTitle,
            format: .sets,
            estimatedDurationSeconds: estimatedSeconds,
            blockContext: "Libre · no prescrito",
            zoneTargets: [],
            equipment: [],
            segments: segments,
            coachNote: nil,
            demoVideoUrl: nil,
            warmupChecklist: []
        )
        return FreeWorkoutContext(
            title: resolvedTitle,
            modalityWire: PrescriptionModality.strength.rawValue,
            prescription: nil,
            items: payloadItems,
            plan: plan
        )
    }

    var resolvedTitle: String {
        let t = titleEdited.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return String(t.prefix(Self.maxTitle)) }
        return defaultTitle
    }

    var defaultTitle: String {
        switch items.count {
        case 0: return "Fuerza"
        case 1: return "Fuerza · \(items[0].exercise.name)"
        default: return "Fuerza · \(items.count) ejercicios"
        }
    }

    // Rough estimate for the plan card: work time is untracked, so ~40s per series
    // plus the prescribed rest between them. Best-effort, never shown as measured.
    var estimatedSeconds: Int {
        items.reduce(0) { acc, item in
            let per = (item.measure == .time ? item.seconds : 40) + item.restSeconds
            return acc + item.series * per
        }
    }
}

// MARK: - Builder view

struct FreeStrengthBuilderView: View {
    let bearer: String?
    /// Return to the modality grid (the athlete backs out of the fuerza track).
    let onBack: () -> Void
    /// Hand the built context up to the host, which runs it through the shared
    /// engine (WorkoutContainer, free mode) exactly like the measured path.
    let onStart: (FreeWorkoutContext) -> Void

    @State private var draft = FreeStrengthDraft()
    @State private var showPicker = false
    /// El picker abierto añade al calentamiento (true) o al principal (false).
    @State private var pickingForWarmup = false

    var body: some View {
        VStack(spacing: 0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    stepHeader
                    warmupSection
                    ForEach(draft.items) { item in
                        FreeStrengthCard(
                            item: bindingFor(item.id),
                            canMoveUp: draft.items.first?.id != item.id,
                            canMoveDown: draft.items.last?.id != item.id,
                            onMoveUp: { draft.move(item.id, by: -1); Haptics.light() },
                            onMoveDown: { draft.move(item.id, by: 1); Haptics.light() },
                            onRemove: { withAnimation { draft.remove(item.id) }; Haptics.light() }
                        )
                    }
                    addButton
                    if draft.canStart { titleField }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            if draft.canStart { footer }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .sheet(isPresented: $showPicker) {
            FreeExercisePickerView(
                bearer: bearer,
                preferredCategory: "strength",
                onPick: { ex in
                    if pickingForWarmup { draft.addWarmup(ex) } else { draft.add(ex) }
                    showPicker = false
                    Haptics.medium()
                },
                onClose: { showPicker = false }
            )
        }
    }

    // MARK: Calentamiento (opcional, rellenable o vacío — IMG del gym de Alex)

    @ViewBuilder
    private var warmupSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Toggle(isOn: $draft.includeWarmup.animation()) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Calentamiento")
                        .font(.system(size: 14, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                    Text(draft.includeWarmup
                         ? (draft.warmupItems.isEmpty ? "Sin ejercicios: solo la fase, con su reloj" : "\(draft.warmupItems.count) ejercicio\(draft.warmupItems.count == 1 ? "" : "s")")
                         : "Opcional · la serie 1 será la serie 1")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .tint(Theme.Color.accent)
            .padding(Theme.Spacing.m)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))

            if draft.includeWarmup {
                ForEach(draft.warmupItems) { item in
                    FreeStrengthCard(
                        item: bindingForWarmup(item.id),
                        canMoveUp: false, canMoveDown: false,
                        onMoveUp: {}, onMoveDown: {},
                        onRemove: { withAnimation { draft.remove(item.id) }; Haptics.light() }
                    )
                }
                Button {
                    pickingForWarmup = true
                    showPicker = true
                    Haptics.light()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                        Text("Ejercicio de calentamiento")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                            .strokeBorder(Theme.Color.outline, style: StrokeStyle(lineWidth: 1, dash: [5]))
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func bindingForWarmup(_ id: UUID) -> Binding<FreeStrengthItem> {
        Binding(
            get: { draft.warmupItems.first(where: { $0.id == id }) ?? FreeStrengthItem(exercise: FreeExercise(id: 0, name: "", slug: "", category: "strength", modality: nil)) },
            set: { new in
                if let i = draft.warmupItems.firstIndex(where: { $0.id == id }) { draft.warmupItems[i] = new }
            }
        )
    }

    // MARK: Nav bar

    private var navBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                onBack()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Atrás")
            VStack(alignment: .leading, spacing: 1) {
                Text("Crear fuerza")
                    .font(.system(size: 15, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Text(draft.items.isEmpty ? "Añade ejercicios" : "\(draft.items.count) ejercicio\(draft.items.count == 1 ? "" : "s")")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
        .overlay(Rectangle().fill(Theme.Color.hairline).frame(height: 1), alignment: .bottom)
    }

    private var stepHeader: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Tus ejercicios")
                .font(.system(size: 22, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            Text("Series, medida y carga. Registras cada serie en directo.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var addButton: some View {
        Button {
            Haptics.light()
            pickingForWarmup = false
            showPicker = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .heavy))
                Text(draft.items.isEmpty ? "Añadir ejercicio" : "Añadir otro")
                    .font(.system(size: 14, weight: .heavy, design: .default).italic())
            }
            .foregroundStyle(draft.canAddMore ? Theme.Color.accentText : Theme.Color.faint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accent.opacity(draft.canAddMore ? 0.4 : 0.15),
                            style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!draft.canAddMore)
        .accessibilityLabel(draft.canAddMore ? "Añadir ejercicio" : "Máximo de ejercicios alcanzado")
    }

    private var titleField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Nombre", size: 11)
            TextField(draft.defaultTitle, text: $draft.titleEdited)
                .font(Theme.Typography.bodyEmph)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, 12)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                .onChange(of: draft.titleEdited) { _, new in
                    if new.count > FreeStrengthDraft.maxTitle {
                        draft.titleEdited = String(new.prefix(FreeStrengthDraft.maxTitle))
                    }
                }
                .accessibilityLabel("Nombre del entreno")
        }
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            ExpertPrimaryButton(title: "▶ Empezar entreno", height: 52) {
                guard let ctx = draft.buildContext() else { return }
                Haptics.medium()
                onStart(ctx)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.m)
        }
        .background(Theme.Color.background)
    }

    // Index-safe binding into the draft's item array (ForEach over value copies).
    private func bindingFor(_ id: UUID) -> Binding<FreeStrengthItem> {
        Binding(
            get: { draft.items.first(where: { $0.id == id }) ?? FreeStrengthItem(exercise: FreeExercise(id: 0, name: "", slug: "", category: "strength", modality: nil)) },
            set: { new in
                if let i = draft.items.firstIndex(where: { $0.id == id }) { draft.items[i] = new }
            }
        )
    }
}

// MARK: - Exercise card

private struct FreeStrengthCard: View {
    @Binding var item: FreeStrengthItem
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            header
            FreeStepper(label: "Series", value: $item.series,
                        step: FreeStrengthStep.repsStep, minValue: 1, maxValue: FreeStrengthStep.maxSeries) { "\($0)" }
            FreeKindToggle(
                title: "Medida",
                options: FreeStrengthMeasure.allCases,
                selection: $item.measure,
                label: { $0.labelES }
            )
            measureStepper
            FreeKindToggle(
                title: "Carga",
                options: FreeStrengthLoad.allCases,
                selection: $item.loadKind,
                label: { $0.labelES }
            )
            if item.loadKind == .kg {
                // Rueda, no −/+: de 20 a 80 kg en un gesto (petición de Alex en vivo).
                KgWheel(label: "Carga", units: $item.kgUnits)
            }
            FreeStepper(label: "Descanso", value: $item.restSeconds,
                        step: FreeStrengthStep.restStep, minValue: 0) {
                $0 == 0 ? "sin pausa" : PrescriptionRenderer.formatRest($0)
            }
            previewLine
        }
        .padding(Theme.Spacing.m)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text(item.exercise.name)
                .font(.system(size: 16, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            iconButton("chevron.up", enabled: canMoveUp, label: "Subir", action: onMoveUp)
            iconButton("chevron.down", enabled: canMoveDown, label: "Bajar", action: onMoveDown)
            iconButton("trash", enabled: true, label: "Quitar", action: onRemove)
        }
    }

    private func iconButton(_ name: String, enabled: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: { if enabled { action() } }) {
            Image(systemName: name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(enabled ? Theme.Color.muted : Theme.Color.faint)
                .frame(width: 30, height: 30)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var measureStepper: some View {
        switch item.measure {
        case .reps:
            FreeStepper(label: "Reps", value: $item.reps,
                        step: FreeStrengthStep.repsStep, minValue: 1) { "\($0)" }
        case .time:
            FreeStepper(label: "Tiempo", value: $item.seconds,
                        step: FreeStrengthStep.secondsStep, minValue: FreeStrengthStep.secondsStep) {
                PrescriptionRenderer.formatClock($0)
            }
        case .distance:
            FreeStepper(label: "Distancia", value: $item.meters,
                        step: FreeStrengthStep.metersStep, minValue: FreeStrengthStep.metersStep) {
                PrescriptionRenderer.formatDistance(Double($0)) ?? "\($0) m"
            }
        }
    }

    private var previewLine: some View {
        Text(item.previewLine)
            .font(Theme.Typography.small)
            .foregroundStyle(Theme.Color.accentText)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 2)
            .accessibilityLabel("Resumen: \(item.previewLine)")
    }

    private func kgString(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(v))" : String(format: "%.1f", v)
    }
}
