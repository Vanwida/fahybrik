import SwiftUI

// EL CONSTRUCTOR DE ENTRENO LIBRE — el camino MEDIDO (remo, correr, ski, bici) y la puerta a los otros dos.
//
// Tres pasos: Modalidad → Formato → Configura. El atleta elige una modalidad medida, un formato del
// catálogo real, configura el trabajo con CONTADORES (cero texto libre salvo el nombre), ve el resumen
// vivo «Tu entreno» y pulsa Continuar, que entrega el `WorkoutPlan` montado en el móvil al MISMO
// `WorkoutContainer` en modo libre (mismo motor, mismos HUD, mismo cierre). Correr se salta «Formato»:
// su plan ya dice si es un rodaje, una serie o una pirámide.
//
// Fuerza y Funcional salen de la misma rejilla hacia sus constructores de lista, que devuelven un
// `FreeWorkoutContext` que corre por el mismo motor, aquí abajo. Los tres caminos se montan con las
// piezas de `ConstructorLibrePiezas.swift`: para el atleta son UN flujo.
struct FreeWorkoutBuilderView: View {
    let bearer: String?
    /// Abre el constructor relleno para editar un plan libre ya programado.
    var editingAssignmentId: Int?
    /// La fuente de pulso máximo del atleta, que llega a `WorkoutContainer` para que un entreno LIBRE
    /// tenga las mismas zonas personales que uno prescrito.
    var hrZones: HRZoneProfile?
    let onClose: () -> Void
    /// Tras guardar el libre, para que quien llamó refresque el plan (la sesión aparece como «Libre»).
    var onCompleted: () -> Void

    @State private var draft: FreeWorkoutDraft
    @State private var step: Step
    @State private var running: FreeWorkoutContext?
    @State private var isSavingPlan = false
    @State private var aviso: AvisoDia.Contenido?
    /// Cómo va la carga del plan a editar. Mientras carga no se enseña la rejilla de modalidad (sería
    /// otra pantalla que luego salta); si falla, se dice y se ofrece reintentar.
    @State private var carga: CargaEdicion
    @State private var intentoDeCarga = 0
    /// En qué camino está el atleta. El MEDIDO vive aquí; FUERZA y FUNCIONAL pasan a sus constructores
    /// de lista, que devuelven un `FreeWorkoutContext` que corre por el MISMO motor.
    @State private var track: Track = .measured
    @State private var strengthDraft = FreeStrengthDraft()
    @State private var functionalDraft = FreeFunctionalDraft()

    enum Step: Int, CaseIterable { case modality, format, bouts }
    enum Track { case measured, strength, functional }
    enum CargaEdicion: Equatable { case lista, cargando, fallo }

    init(
        bearer: String?,
        editingAssignmentId: Int? = nil,
        hrZones: HRZoneProfile? = nil,
        onClose: @escaping () -> Void,
        onCompleted: @escaping () -> Void = {},
        draftInicial: FreeWorkoutDraft = FreeWorkoutDraft(),
        pasoInicial: Step = .modality,
        cargaInicial: CargaEdicion? = nil
    ) {
        self.bearer = bearer
        self.editingAssignmentId = editingAssignmentId
        self.hrZones = hrZones
        self.onClose = onClose
        self.onCompleted = onCompleted
        _draft = State(initialValue: draftInicial)
        _step = State(initialValue: pasoInicial)
        _carga = State(initialValue: cargaInicial ?? (editingAssignmentId == nil ? .lista : .cargando))
    }

    var body: some View {
        if let ctx = running {
            // Correr lo montado por el motor de siempre y guardar por el camino libre. Lo comparten los
            // tres caminos: hay UN sitio que aloja `WorkoutContainer`.
            WorkoutContainer(
                assignmentId: nil,
                fallbackTitle: ctx.title,
                bearer: bearer,
                freeContext: ctx,
                hrZones: hrZones,
                onClose: onClose,
                onCompleted: { _ in onCompleted(); onClose() }
            )
        } else {
            switch track {
            case .measured:
                builder
            case .strength:
                FreeStrengthBuilderView(
                    bearer: bearer,
                    draft: $strengthDraft,
                    editingAssignmentId: editingAssignmentId,
                    onBack: { track = .measured },
                    onStart: { running = $0 },
                    onSaved: { completePlanSave() }
                )
            case .functional:
                FreeFunctionalBuilderView(
                    bearer: bearer,
                    draft: $functionalDraft,
                    editingAssignmentId: editingAssignmentId,
                    onBack: { track = .measured },
                    onStart: { running = $0 },
                    onSaved: { completePlanSave() }
                )
            }
        }
    }

    private var builder: some View {
        PantallaConstructorLibre(
            salida: step == .modality || carga != .lista ? .cerrar : .atras,
            paso: carga == .lista ? pasoActual : nil,
            alSalir: back
        ) {
            switch carga {
            case .cargando: EsqueletoConstructorLibre()
            case .fallo: falloDeCarga
            case .lista:
                switch step {
                case .modality: modalityStep
                case .format:   formatStep
                case .bouts:    boutsStep
                }
            }
        } pie: {
            if carga == .lista, step == .bouts {
                PieConstructorLibre(
                    diaISO: $draft.scheduledDayISO,
                    guardando: isSavingPlan,
                    alGuardar: { Task { await saveMeasuredPlan() } },
                    alContinuar: startNow
                )
            }
        }
        .avisoDia($aviso)
        // Salir del constructor medido SIN empezar suelta los dispositivos (la cinta o la banda
        // conectadas desde la tarjeta). Si Continuar ya puso `running`, el desmontaje es de
        // WorkoutContainer.
        .onDisappear { if running == nil { DeviceHub.shared.stopAll() } }
        .task(id: intentoDeCarga) {
            await loadEditingPlanIfNeeded()
        }
    }

    // MARK: - El plan a editar

    private func loadEditingPlanIfNeeded() async {
        guard let id = editingAssignmentId, carga != .lista else { return }
        carga = .cargando
        guard let bearer,
              let detail = try? await PlanService.fetchAssignmentDetail(String(id), bearer: bearer),
              let hydrated = FreePlanHydration.editTrack(from: detail)
        else {
            carga = .fallo
            return
        }
        switch hydrated {
        case let .measured(d):
            draft = d
            track = .measured
            step = d.usaPlanDeCorrer || d.format != nil ? .bouts : .modality
        case let .strength(d):
            strengthDraft = d
            track = .strength
        case let .functional(d):
            functionalDraft = d
            track = .functional
        }
        carga = .lista
    }

    /// Antes el fallo de carga se guardaba en un estado que nadie pintaba: el atleta veía la rejilla de
    /// modalidad vacía y creía que su entreno se había perdido.
    private var falloDeCarga: some View {
        SujetoDia(
            tono: .peligro,
            etiqueta: "No se ha podido abrir el entreno. Revisa la conexión y vuelve a intentarlo.",
            anuncia: true
        ) {
            KickerDia("Editar entreno")
            TituloDia("No se ha podido abrir")
            ApoyoDia("Tu entreno sigue en el plan. Revisa la conexión y vuelve a intentarlo.")
        } abajo: {
            Button {
                Haptics.light()
                intentoDeCarga += 1
            } label: {
                AccionDia("Reintentar", glifo: .reintentar)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
    }

    // MARK: - El paso en que estás

    /// Correr tiene DOS pasos, no tres: se salta «Formato». Contar tres prometería una pantalla que no
    /// va a existir.
    private var pasoActual: (n: Int, de: Int) {
        let pasos: [Step] = draft.usaPlanDeCorrer ? [.modality, .bouts] : Step.allCases
        return ((pasos.firstIndex(of: step) ?? 0) + 1, pasos.count)
    }

    /// «Entreno libre · Remo · Series»: dónde estás del flujo, en la etiqueta del título.
    private var etiqueta: String {
        var partes = ["Entreno libre"]
        if let m = draft.modality, step != .modality { partes.append(m.labelES) }
        // Corriendo, el «formato» lo dice el plan y no un paso del formulario: ponerlo aquí repetiría
        // una etiqueta que el atleta nunca eligió.
        if let f = draft.format, step == .bouts, !draft.usaPlanDeCorrer { partes.append(f.labelES) }
        return partes.joined(separator: " · ")
    }

    // MARK: - Paso 1 · Modalidad

    private var modalityStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            TituloPasoLibre(etiqueta: etiqueta, titulo: "¿Qué vas a hacer?",
                            apoyo: "Disciplinas medidas. Suma al plan, no lo rompe.")
            RejillaEleccionLibre {
                ForEach(FreeModality.allCases) { m in
                    FreeBuilderTile(
                        icon: m.icon,
                        title: m.labelES,
                        subtitle: m == .run ? "Ritmo /km" : "Ritmo /500m",
                        selected: draft.modality == m
                    ) {
                        draft.selectModality(m)
                        // CORRER NO PASA POR «FORMATO». Su plan ya dice si es un rodaje, una serie o una
                        // pirámide: elegir antes una etiqueta que luego el plan puede desmentir es una
                        // pregunta sin respuesta correcta. El esquema lo deduce `buildRunPrescription`.
                        advance(to: draft.usaPlanDeCorrer ? .bouts : .format)
                    }
                }
                // Los caminos de catálogo pasan a sus constructores de lista (elegir movimientos y
                // configurarlos), que corren por el MISMO motor al empezar.
                FreeBuilderTile(icon: "dumbbell.fill", title: "Fuerza",
                                subtitle: "Series y carga", selected: false) {
                    advanceTrack(.strength)
                }
                FreeBuilderTile(icon: "figure.cross.training", title: "Funcional",
                                subtitle: "WOD · For Time, AMRAP…", selected: false) {
                    advanceTrack(.functional)
                }
            }
        }
    }

    // MARK: - Paso 2 · Formato

    private var formatStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            TituloPasoLibre(etiqueta: etiqueta, titulo: "Formato",
                            apoyo: "Cómo se estructura el trabajo.")
            RejillaEleccionLibre {
                ForEach(FreeFormat.allCases) { f in
                    FreeBuilderTile(icon: nil, title: f.labelES, subtitle: f.subtitleES,
                                    selected: draft.format == f) {
                        draft.format = f
                        advance(to: .bouts)
                    }
                }
            }
        }
    }

    // MARK: - Paso 3 · Configura

    @ViewBuilder
    private var boutsStep: some View {
        if draft.usaPlanDeCorrer {
            runStep
        } else {
            boutsForm
        }
    }

    /// CORRER SE MONTA COMO ES: una lista de tramos, con su calentamiento, sus repeticiones, sus
    /// recuperaciones (con medida, objetivo y modo propios) y su vuelta a la calma. El formulario de
    /// abajo no puede escribir ninguna de esas cosas — ver `FreeRunPlan`.
    private var runStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            TituloPasoLibre(etiqueta: etiqueta, titulo: "Monta tu entreno")
            FreeRunBuilderView(plan: $draft.runPlan)
            nameField
            FreePreviewCard(line: draft.previewLine)
        }
    }

    @ViewBuilder
    private var boutsForm: some View {
        if let format = draft.format {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloPasoLibre(etiqueta: etiqueta, titulo: "Configura")
                    .padding(.bottom, Theme.Spacing.s)

                if format.usesRounds {
                    FreeStepper(label: format.roundsLabel, value: $draft.rounds,
                                step: FreeStep.rounds, minValue: 1) { "\($0)" }
                }
                if format.usesCadence {
                    FreeStepper(label: "Cada", value: $draft.cadenceSeconds,
                                step: FreeStep.cadenceSeconds, minValue: FreeStep.cadenceSeconds) {
                        Formato.clock($0, subMinuto: .segundos)
                    }
                }
                if format.usesWindow {
                    FreeStepper(label: "Duración total", value: $draft.windowSeconds,
                                step: FreeStep.windowSeconds, minValue: FreeStep.windowSeconds) {
                        Formato.clock($0, subMinuto: .segundos)
                    }
                }

                // Cuánto trabajo: qué se mide y su contador.
                FreeKindToggle(
                    title: "Medida",
                    options: measureOptions,
                    selection: Binding(get: { draft.measureKind }, set: { draft.measureKind = $0 }),
                    label: { $0.labelES }
                )
                measureStepper

                if format.usesRest {
                    // Descanso cero no es «no se sabe»: es que no hay descanso, y el atleta acaba de
                    // elegirlo bajando el contador. Se dice (§7).
                    FreeStepper(label: Vocab.descanso, value: $draft.restSeconds,
                                step: FreeStep.restSeconds, minValue: 0) {
                        $0 == 0 ? "Sin descanso" : Formato.clock($0, subMinuto: .segundos)
                    }
                }

                // Contra qué objetivo — OBLIGATORIO aquí: un bout montado por el atleta siempre lleva
                // uno, así que el selector nunca enseña el «sin objetivo» del borrador (ése es de una
                // prueba sin marca que batir, que nunca abre este constructor).
                FreeKindToggle(
                    title: "Objetivo",
                    options: FreeTargetKind.allCases,
                    selection: Binding(get: { draft.targetKind ?? .pace }, set: { draft.targetKind = $0 }),
                    label: { $0.labelES }
                )
                targetControl

                nameField
                FreePreviewCard(line: draft.previewLine)
            }
        }
    }

    @ViewBuilder
    private var measureStepper: some View {
        switch draft.measureKind {
        case .distance:
            FreeStepper(label: "Distancia", value: $draft.distanceMeters,
                        step: FreeStep.distanceMeters, minValue: FreeStep.distanceMeters) {
                Formato.distancia(Double($0)) ?? "\($0) m"
            }
        case .time:
            FreeStepper(label: "Tiempo", value: $draft.workSeconds,
                        step: FreeStep.workSeconds, minValue: FreeStep.workSeconds) {
                Formato.clock($0, subMinuto: .segundos)
            }
        case .calories:
            FreeStepper(label: "Calorías", value: $draft.calories,
                        step: FreeStep.calories, minValue: FreeStep.calories) { "\($0) cal" }
        }
    }

    @ViewBuilder
    private var targetControl: some View {
        switch draft.targetKind {
        case .pace:
            FreeStepper(label: "Ritmo \(draft.modality?.paceUnitLabel ?? "")",
                        value: $draft.paceSeconds, step: FreeStep.paceSeconds, minValue: 30) {
                Formato.ritmoCifras(Double($0))
            }
        case .hrZone:
            FreeZonePicker(zone: $draft.hrZone)
        case nil:
            EmptyView()   // inalcanzable: el selector de arriba siempre deja un objetivo
        }
    }

    private var nameField: some View {
        CampoNombreLibre(sugerido: draft.defaultTitle, texto: $draft.titleEdited, maximo: FreeWorkoutDraft.maxTitle)
    }

    private var measureOptions: [FreeMeasureKind] {
        (draft.modality?.supportsCalories ?? true) ? FreeMeasureKind.allCases : [.distance, .time]
    }

    // MARK: - Guardar y empezar

    private func saveMeasuredPlan() async {
        guard !isSavingPlan, let payload = draft.buildPlanPayload(assignmentId: editingAssignmentId) else { return }
        isSavingPlan = true
        defer { isSavingPlan = false }
        do {
            try await FreePlanSaveAPI.save(payload, bearer: bearer)
            Haptics.medium()
            completePlanSave()
        } catch {
            Haptics.error()
            aviso = AvisoConstructorLibre.noGuardado
        }
    }

    private func completePlanSave() {
        onCompleted()
        onClose()
    }

    /// Montar y lanzar por WorkoutContainer → dispositivos → preparar (FH-95).
    private func startNow() {
        guard let ctx = draft.buildContext() else { return }
        running = ctx
    }

    // MARK: - Navegación entre pasos

    private func advance(to next: Step) {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.2)) { step = next }
    }

    private func advanceTrack(_ next: Track) {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.2)) { track = next }
    }

    private func back() {
        guard carga == .lista else { return onClose() }
        switch step {
        case .modality: onClose()
        case .format:   withAnimation(.easeInOut(duration: 0.2)) { step = .modality }
        // Correr se saltó «Formato» a la ida; atrás tiene que devolverle a la modalidad y no a un paso
        // que nunca vio.
        case .bouts:
            let destino: Step = draft.usaPlanDeCorrer ? .modality : .format
            withAnimation(.easeInOut(duration: 0.2)) { step = destino }
        }
    }
}

/// Mientras llega el plan a editar: la MISMA forma que tendrá el paso «Configura» (título y tres
/// contadores), para que nada salte al llegar.
struct EsqueletoConstructorLibre: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SkeletonBar(width: 150, height: 15, radius: 5)
                SkeletonBar(width: 220, height: 30, radius: 8)
            }
            .padding(.bottom, Theme.Spacing.s)
            ForEach(0..<3, id: \.self) { _ in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    SkeletonBar(width: 90, height: 15, radius: 5)
                    SkeletonBar(height: 44, radius: 12)
                }
                .padding(Theme.Spacing.l)
                .tarjetaDia()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu entreno")
    }
}
