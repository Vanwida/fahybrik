import SwiftUI

// EL CONSTRUCTOR FUNCIONAL (WOD) — dos pasos, Formato → Configura, sobre `FreeFunctionalDraft` (el modelo
// está en FreeFunctionalBuilder.swift). El paso 1 es la rejilla de formatos; el 2, los contadores de
// estructura del formato elegido y la lista de movimientos (que se añaden desde el catálogo). Continuar
// entrega el `FreeWorkoutContext` montado a quien lo aloja, que lo corre por el mismo motor.
//
// Es el mismo flujo que el camino medido y el de fuerza: las piezas son las de
// `ConstructorLibrePiezas.swift`, y aquí sólo vive lo que es propio del WOD.

struct FreeFunctionalBuilderView: View {
    let bearer: String?
    @Binding var draft: FreeFunctionalDraft
    var editingAssignmentId: Int?
    let onBack: () -> Void
    let onStart: (FreeWorkoutContext) -> Void
    var onSaved: () -> Void

    @State private var step: Step
    @State private var showPicker = false
    @State private var isSavingPlan = false
    @State private var aviso: AvisoDia.Contenido?

    init(
        bearer: String?,
        draft: Binding<FreeFunctionalDraft> = .constant(FreeFunctionalDraft()),
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
        _step = State(initialValue: draft.wrappedValue.format == nil ? .format : .config)
    }

    enum Step { case format, config }

    /// «Entreno libre · Funcional · AMRAP»: dónde estás del flujo.
    private var etiqueta: String {
        var partes = ["Entreno libre", "Funcional"]
        if step == .config, let f = draft.format { partes.append(f.labelES) }
        return partes.joined(separator: " · ")
    }

    var body: some View {
        PantallaConstructorLibre(
            salida: .atras,
            // Se cuenta desde la modalidad, que es donde empezó el flujo: el atleta viene del paso 1.
            paso: (step == .format ? 2 : 3, 3),
            alSalir: back
        ) {
            switch step {
            case .format: formatStep
            case .config: configStep
            }
        } pie: {
            if step == .config {
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
        // Cubierta, no hoja: este constructor ya vive dentro de la cubierta de Hoy. Una hoja ahí es el
        // fallo del gimnasio — GET 200 y el selector se queda en «Cargando…».
        .fullScreenCover(isPresented: $showPicker) {
            FreeExercisePickerView(
                bearer: bearer,
                preferredCategory: "functional",
                onPick: { ex in draft.add(ex); showPicker = false; Haptics.medium() },
                onClose: { showPicker = false }
            )
        }
    }

    // MARK: Paso 1 · Formato

    private var formatStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            TituloPasoLibre(etiqueta: etiqueta, titulo: "Formato", apoyo: "Cómo se estructura el trabajo.")
            RejillaEleccionLibre {
                ForEach(FreeFunctionalFormat.allCases) { f in
                    FreeBuilderTile(icon: nil, title: f.labelES, subtitle: f.subtitleES,
                                    selected: draft.format == f) {
                        draft.selectFormat(f)
                        advance(to: .config)
                    }
                }
            }
        }
    }

    // MARK: Paso 2 · Configura

    @ViewBuilder
    private var configStep: some View {
        if let f = draft.format {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloPasoLibre(etiqueta: etiqueta, titulo: "Configura")
                    .padding(.bottom, Theme.Spacing.s)
                structuralSteppers(f)
                FreePreviewCard(line: draft.headerLine)

                TituloSeccionDia("Movimientos") {
                    InfoPill(text: "Opcional")
                }
                .padding(.top, Theme.Spacing.m)
                ForEach(draft.movements) { m in
                    FreeFunctionalCard(
                        movement: bindingFor(m.id),
                        canMoveUp: draft.movements.first?.id != m.id,
                        canMoveDown: draft.movements.last?.id != m.id,
                        onMoveUp: { draft.move(m.id, by: -1) },
                        onMoveDown: { draft.move(m.id, by: 1) },
                        onRemove: { withAnimation { draft.remove(m.id) } }
                    )
                }
                BotonAnadirLibre(
                    titulo: draft.movements.isEmpty ? "Añadir movimiento" : "Añadir otro",
                    habilitado: draft.canAddMore,
                    etiquetaAlLimite: "Máximo de movimientos alcanzado"
                ) { showPicker = true }
                CampoNombreLibre(sugerido: draft.defaultTitle, texto: $draft.titleEdited,
                                 maximo: FreeFunctionalDraft.maxTitle)
                    .padding(.top, Theme.Spacing.s)
            }
        }
    }

    @ViewBuilder
    private func structuralSteppers(_ f: FreeFunctionalFormat) -> some View {
        if f.usesRounds {
            FreeStepper(label: draft.roundsLabel, value: $draft.rounds,
                        step: FreeFunctionalStep.roundsStep, minValue: 1) { "\($0)" }
        }
        if f.usesWindow {
            FreeStepper(label: "Duración total", value: $draft.windowSeconds,
                        step: FreeFunctionalStep.windowStep, minValue: FreeFunctionalStep.windowStep) {
                Formato.clock($0, subMinuto: .segundos)
            }
        }
        if f.usesCadence {
            cadencePresets
            FreeStepper(label: "Cada", value: $draft.cadenceSeconds,
                        step: FreeFunctionalStep.cadenceStep, minValue: FreeFunctionalStep.cadenceStep) {
                Formato.clock($0, subMinuto: .segundos)
            }
            // El reparto sólo aparece cuando LO HAY. «Al minuto» — el de fábrica y el caso común — no ve
            // esta fila, así que el EMOM sencillo conserva su forma de dos contadores.
            if draft.transitionSeconds > 0 {
                FreeStepper(label: "Cambio", value: $draft.transitionSeconds,
                            step: FreeFunctionalStep.transitionStep, minValue: 0) {
                    $0 == 0 ? "sin cambio" : "\($0) s"
                }
                NotaLibre("\(draft.workSeconds) s de trabajo y \(draft.transitionSeconds) s para cambiar. Suena al parar y al arrancar.")
            }
        }
        if f.usesRest {
            FreeStepper(label: "Descanso entre series", value: $draft.seriesRestSeconds,
                        step: FreeFunctionalStep.restStep, minValue: 0) {
                $0 == 0 ? "sin pausa" : Formato.clock($0, subMinuto: .segundos)
            }
            FreeStepper(label: "Descanso entre rondas", value: $draft.restSeconds,
                        step: FreeFunctionalStep.restStep, minValue: 0) {
                $0 == 0 ? "sin pausa" : Formato.clock($0, subMinuto: .segundos)
            }
        }
        if f.usesCap {
            FreeStepper(label: "Límite de tiempo", value: $draft.capSeconds,
                        step: FreeFunctionalStep.capStep, minValue: 0) {
                $0 == 0 ? "sin límite" : Formato.clock($0, subMinuto: .segundos)
            }
        }
    }

    // Las tres formas del reloj del box, de un toque cada una. Tabata está aquí A PROPÓSITO y no en la
    // rejilla de formatos: 20/10 × 8 es este mismo ciclo de trabajo + cambio con otros números, y
    // hacerlo otro formato partiría el modelo para nada.
    private var cadencePresets: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            RotuloControlLibre("Ritmo")
            HStack(spacing: Theme.Spacing.s) {
                ForEach(FreeEmomPreset.allCases) { p in
                    OpcionLibre(texto: p.labelES, elegida: draft.emomPreset == p) {
                        Haptics.light()
                        draft.apply(p)
                    }
                }
            }
        }
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

    // MARK: Navegación

    private func advance(to next: Step) {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.2)) { step = next }
    }

    private func back() {
        switch step {
        case .format: onBack()
        case .config: withAnimation(.easeInOut(duration: 0.2)) { step = .format }
        }
    }

    private func bindingFor(_ id: UUID) -> Binding<FreeFunctionalMovement> {
        Binding(
            get: { draft.movements.first(where: { $0.id == id }) ?? FreeFunctionalMovement(exercise: FreeExercise(id: 0, name: "", slug: "", category: "functional", modality: nil)) },
            set: { new in
                if let i = draft.movements.firstIndex(where: { $0.id == id }) { draft.movements[i] = new }
            }
        )
    }
}

// MARK: - La tarjeta de un movimiento
//
// Compartida con la hoja de «¿Qué hiciste?»: nombrar lo que hiciste DESPUÉS de una sesión de cronómetro
// tiene que ofrecer exactamente el mismo control de dosis que declararlo antes, o los dos caminos no
// estarían de acuerdo en qué es un movimiento.

struct FreeFunctionalCard: View {
    @Binding var movement: FreeFunctionalMovement
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onRemove: () -> Void

    var body: some View {
        TarjetaMovimientoLibre(
            nombre: movement.exercise.name,
            puedeSubir: canMoveUp, puedeBajar: canMoveDown,
            alSubir: onMoveUp, alBajar: onMoveDown, alQuitar: onRemove
        ) {
            FreeKindToggle(
                title: "Medida",
                options: FreeFunctionalDose.allCases,
                selection: $movement.dose,
                label: { $0.labelES }
            )
            doseStepper
        }
    }

    @ViewBuilder
    private var doseStepper: some View {
        switch movement.dose {
        case .reps:
            FreeStepper(label: "Reps", value: $movement.reps,
                        step: FreeFunctionalStep.repsStep, minValue: 1) { "\($0)" }
        case .calories:
            FreeStepper(label: "Calorías", value: $movement.calories,
                        step: FreeFunctionalStep.calStep, minValue: 1) { "\($0) cal" }
        case .meters:
            FreeStepper(label: "Metros", value: $movement.meters,
                        step: FreeFunctionalStep.metersStep, minValue: FreeFunctionalStep.metersStep) {
                Formato.distancia(Double($0)) ?? "\($0) m"
            }
        case .time:
            FreeStepper(label: "Tiempo", value: $movement.seconds,
                        step: FreeFunctionalStep.secondsStep, minValue: FreeFunctionalStep.secondsStep) {
                Formato.clock($0, subMinuto: .segundos)
            }
        }
    }
}
