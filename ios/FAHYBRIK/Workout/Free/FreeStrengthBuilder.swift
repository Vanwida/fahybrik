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

    /// Este ejercicio como ejercicio del plan (el del catálogo + su prescripción).
    func planItem(part: String? = nil) -> FreePlanItem {
        FreePlanItem(exercise: exercise, prescription: prescription(), part: part)
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
    var scheduledDayISO: String = RaceDate.todayISO()

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

    /// Los ejercicios del plan en orden de ejecución: el calentamiento primero.
    private var planItems: [FreePlanItem] {
        let warm = includeWarmup ? warmupItems.map { $0.planItem(part: "warmup") } : []
        return warm + items.map { $0.planItem() }
    }

    /// The free-save `items[]` — exercise_id + prescription, in execution order.
    /// REQUIRED for strength (the top-level prescription is omitted).
    func buildItems() -> [FreeWorkoutItemPayload]? {
        guard !items.isEmpty else { return nil }
        return planItems.map(\.payload)
    }

    /// The runnable context: the plan the server will hold for these exercises,
    /// run through `WorkoutPlan.from` like a coach session (`FreePlanDetail`).
    func buildContext() -> FreeWorkoutContext? {
        guard let payloadItems = buildItems() else { return nil }
        let detail = FreePlanDetail.detail(
            title: resolvedTitle,
            modality: PrescriptionModality.strength.rawValue,
            scheme: .sets,
            items: planItems,
            focus: "Libre · no prescrito"
        )
        // Con el calentamiento incluido pero VACÍO, un único paso manual
        // «Calentamiento» delante — calientas, le das a seguir, y empieza la fuerza.
        // No es un ejercicio del plan: el servidor no lo guarda y no lleva índice.
        let pasoDeCalentamiento: WorkoutSegment? = (includeWarmup && warmupItems.isEmpty)
            ? WorkoutSegment(order: 0, title: "Calentamiento", kind: .reps,
                             blockTitle: "Calentamiento", blockPosition: -1)
            : nil
        guard let plan = FreePlanDetail.plan(from: detail, estimatedSeconds: estimatedSeconds,
                                             leading: pasoDeCalentamiento) else { return nil }
        var ctx = FreeWorkoutContext(
            title: resolvedTitle,
            modalityWire: PrescriptionModality.strength.rawValue,
            prescription: nil,
            items: payloadItems,
            plan: plan
        )
        ctx.planPayload = buildPlanPayload()
        return ctx
    }

    func buildPlanPayload(assignmentId: Int? = nil) -> FreePlanSavePayload? {
        guard let payloadItems = buildItems() else { return nil }
        return FreePlanSavePayload(
            title: resolvedTitle,
            modality: PrescriptionModality.strength.rawValue,
            prescription: nil,
            items: payloadItems,
            assignment_id: assignmentId,
            scheduled_for: scheduledDayISO
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

// MARK: - El constructor

/// El camino de FUERZA: una sola pantalla con la lista de ejercicios (y su calentamiento opcional). Las
/// piezas son las del constructor libre (`ConstructorLibrePiezas.swift`): el mismo flujo que el medido y
/// el funcional.
struct FreeStrengthBuilderView: View {
    let bearer: String?
    @Binding var draft: FreeStrengthDraft
    var editingAssignmentId: Int?
    /// Vuelve a la rejilla de modalidad (el atleta sale del camino de fuerza).
    let onBack: () -> Void
    /// Entrega el contexto montado a quien lo aloja, que lo corre por el motor compartido
    /// (WorkoutContainer, modo libre) igual que el camino medido.
    let onStart: (FreeWorkoutContext) -> Void
    var onSaved: () -> Void

    @State private var showPicker = false
    /// El selector abierto añade al calentamiento (true) o al principal (false).
    @State private var pickingForWarmup = false
    @State private var isSavingPlan = false
    @State private var aviso: AvisoDia.Contenido?

    init(
        bearer: String?,
        draft: Binding<FreeStrengthDraft> = .constant(FreeStrengthDraft()),
        editingAssignmentId: Int? = nil,
        onBack: @escaping () -> Void,
        onStart: @escaping (FreeWorkoutContext) -> Void,
        onSaved: @escaping () -> Void = {}
    ) {
        self.bearer = bearer
        self._draft = draft
        self.editingAssignmentId = editingAssignmentId
        self.onBack = onBack
        self.onStart = onStart
        self.onSaved = onSaved
    }

    var body: some View {
        // Se cuenta desde la modalidad, que es donde empezó el flujo: fuerza no tiene paso de formato.
        PantallaConstructorLibre(salida: .atras, paso: (2, 2), alSalir: onBack) {
            TituloPasoLibre(
                etiqueta: "Entreno libre · Fuerza",
                titulo: "Tus ejercicios",
                apoyo: "Series, medida y carga. Registras cada serie en directo."
            )
            warmupSection
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Principal") {
                    if !draft.items.isEmpty {
                        InfoPill(text: "\(draft.items.count) ejercicio\(draft.items.count == 1 ? "" : "s")")
                    }
                }
                ForEach(draft.items) { item in
                    FreeStrengthCard(
                        item: bindingFor(item.id),
                        canMoveUp: draft.items.first?.id != item.id,
                        canMoveDown: draft.items.last?.id != item.id,
                        onMoveUp: { draft.move(item.id, by: -1) },
                        onMoveDown: { draft.move(item.id, by: 1) },
                        onRemove: { withAnimation { draft.remove(item.id) } }
                    )
                }
                BotonAnadirLibre(
                    titulo: draft.items.isEmpty ? "Añadir ejercicio" : "Añadir otro",
                    habilitado: draft.canAddMore,
                    etiquetaAlLimite: "Máximo de ejercicios alcanzado"
                ) {
                    pickingForWarmup = false
                    showPicker = true
                }
            }
            if draft.canStart {
                CampoNombreLibre(sugerido: draft.defaultTitle, texto: $draft.titleEdited,
                                 maximo: FreeStrengthDraft.maxTitle)
            }
        } pie: {
            if draft.canStart {
                PieConstructorLibre(
                    diaISO: $draft.scheduledDayISO,
                    guardando: isSavingPlan,
                    alGuardar: { Task { await savePlan() } },
                    alContinuar: {
                        guard let ctx = draft.buildContext() else { return }
                        onStart(ctx)
                    }
                )
            }
        }
        .avisoDia($aviso)
        // Cubierta, no hoja: la misma regla de presentaciones anidadas que el constructor funcional.
        .fullScreenCover(isPresented: $showPicker) {
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

    // MARK: Calentamiento (opcional: con ejercicios o vacío, solo la fase con su reloj)

    private var warmupSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Toggle(isOn: $draft.includeWarmup.animation()) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Calentamiento")
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(resumenCalentamiento)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(Theme.Color.accent)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(minHeight: Theme.Size.accion)
            .tarjetaDia()

            if draft.includeWarmup {
                ForEach(draft.warmupItems) { item in
                    FreeStrengthCard(
                        item: bindingForWarmup(item.id),
                        canMoveUp: false, canMoveDown: false,
                        onMoveUp: {}, onMoveDown: {},
                        onRemove: { withAnimation { draft.remove(item.id) } }
                    )
                }
                BotonAnadirLibre(titulo: "Ejercicio de calentamiento") {
                    pickingForWarmup = true
                    showPicker = true
                }
            }
        }
    }

    private var resumenCalentamiento: String {
        guard draft.includeWarmup else { return "Opcional · la serie 1 será la serie 1" }
        let n = draft.warmupItems.count
        return n == 0 ? "Sin ejercicios: solo la fase, con su reloj" : "\(n) ejercicio\(n == 1 ? "" : "s")"
    }

    private func bindingForWarmup(_ id: UUID) -> Binding<FreeStrengthItem> {
        Binding(
            get: { draft.warmupItems.first(where: { $0.id == id }) ?? FreeStrengthItem(exercise: FreeExercise(id: 0, name: "", slug: "", category: "strength", modality: nil)) },
            set: { new in
                if let i = draft.warmupItems.firstIndex(where: { $0.id == id }) { draft.warmupItems[i] = new }
            }
        )
    }

    private func savePlan() async {
        guard !isSavingPlan, let payload = draft.buildPlanPayload(assignmentId: editingAssignmentId) else { return }
        isSavingPlan = true
        defer { isSavingPlan = false }
        do {
            try await FreePlanSaveAPI.save(payload, bearer: bearer)
            Haptics.medium()
            onSaved()
        } catch {
            Haptics.error()
            aviso = AvisoConstructorLibre.noGuardado
        }
    }

    // Enlace por id al array del borrador (el ForEach itera copias).
    private func bindingFor(_ id: UUID) -> Binding<FreeStrengthItem> {
        Binding(
            get: { draft.items.first(where: { $0.id == id }) ?? FreeStrengthItem(exercise: FreeExercise(id: 0, name: "", slug: "", category: "strength", modality: nil)) },
            set: { new in
                if let i = draft.items.firstIndex(where: { $0.id == id }) { draft.items[i] = new }
            }
        )
    }
}

// MARK: - La tarjeta de un ejercicio

private struct FreeStrengthCard: View {
    @Binding var item: FreeStrengthItem
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onRemove: () -> Void

    var body: some View {
        TarjetaMovimientoLibre(
            nombre: item.exercise.name,
            puedeSubir: canMoveUp, puedeBajar: canMoveDown,
            alSubir: onMoveUp, alBajar: onMoveDown, alQuitar: onRemove
        ) {
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
                $0 == 0 ? "sin pausa" : Formato.clock($0, subMinuto: .segundos)
            }
            // El resumen de la tarjeta en una línea: lo que vas a hacer, leído como se dice.
            Text(item.previewLine)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Resumen: \(item.previewLine)")
        }
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
                Formato.clock($0, subMinuto: .segundos)
            }
        case .distance:
            FreeStepper(label: "Distancia", value: $item.meters,
                        step: FreeStrengthStep.metersStep, minValue: FreeStrengthStep.metersStep) {
                Formato.distancia(Double($0)) ?? "\($0) m"
            }
        }
    }
}
