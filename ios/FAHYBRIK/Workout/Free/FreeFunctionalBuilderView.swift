import SwiftUI

// MARK: - Entreno libre — FUNCIONAL builder view
//
// The UI for the funcional (WOD) track: a 2-step flow (Formato → Configura) over
// `FreeFunctionalDraft` (the model in FreeFunctionalBuilder.swift). Step 1 is the
// format grid; step 2 exposes the structural steppers for the chosen format plus
// the movement list (added via the shared picker). On Empezar it hands the built
// `FreeWorkoutContext` up to the host, which runs it through the same engine.

struct FreeFunctionalBuilderView: View {
    let bearer: String?
    let onBack: () -> Void
    let onStart: (FreeWorkoutContext) -> Void

    @State private var draft = FreeFunctionalDraft()
    @State private var step: Step = .format
    @State private var showPicker = false

    enum Step { case format, config }

    var body: some View {
        VStack(spacing: 0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    switch step {
                    case .format: formatStep
                    case .config: configStep
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            if step == .config { footer }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .sheet(isPresented: $showPicker) {
            FreeExercisePickerView(
                bearer: bearer,
                preferredCategory: "functional",
                onPick: { ex in draft.add(ex); showPicker = false; Haptics.medium() },
                onClose: { showPicker = false }
            )
        }
    }

    // MARK: Nav bar

    private var navBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                back()
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
                Text("Crear funcional")
                    .font(.system(size: 15, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Text(draft.format?.labelES ?? "Elige un formato")
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

    // MARK: Step 1 · Formato

    private var formatStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            stepHeader(title: "Formato", subtitle: "Cómo se estructura el trabajo.")
            LazyVGrid(columns: twoCol, spacing: Theme.Spacing.m) {
                ForEach(FreeFunctionalFormat.allCases) { f in
                    FreeBuilderTile(
                        icon: nil,
                        title: f.labelES,
                        subtitle: f.subtitleES,
                        selected: draft.format == f,
                        disabledNote: nil
                    ) {
                        draft.selectFormat(f)
                        advance(to: .config)
                    }
                }
            }
        }
    }

    // MARK: Step 2 · Configura

    @ViewBuilder
    private var configStep: some View {
        if let f = draft.format {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                stepHeader(title: "Configura", subtitle: nil)
                structuralSteppers(f)
                FreePreviewCard(line: draft.headerLine)
                HStack(spacing: 6) {
                    Text("Movimientos")
                        .font(.system(size: 13, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                    Text("opcional")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(0.6)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.Color.surfaceElevated)
                        .clipShape(Capsule())
                }
                .padding(.top, Theme.Spacing.xs)
                ForEach(draft.movements) { m in
                    FreeFunctionalCard(
                        movement: bindingFor(m.id),
                        canMoveUp: draft.movements.first?.id != m.id,
                        canMoveDown: draft.movements.last?.id != m.id,
                        onMoveUp: { draft.move(m.id, by: -1); Haptics.light() },
                        onMoveDown: { draft.move(m.id, by: 1); Haptics.light() },
                        onRemove: { withAnimation { draft.remove(m.id) }; Haptics.light() }
                    )
                }
                addButton
                titleField
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
                PrescriptionRenderer.formatClock($0)
            }
        }
        if f.usesCadence {
            cadencePresets
            FreeStepper(label: "Cada", value: $draft.cadenceSeconds,
                        step: FreeFunctionalStep.cadenceStep, minValue: FreeFunctionalStep.cadenceStep) {
                PrescriptionRenderer.formatRest($0)
            }
            // The split only appears once there IS one. "Al minuto" — the default and
            // the common case — never sees this row, so the simple EMOM keeps its
            // exact two-stepper form.
            if draft.transitionSeconds > 0 {
                FreeStepper(label: "Cambio", value: $draft.transitionSeconds,
                            step: FreeFunctionalStep.transitionStep, minValue: 0) {
                    $0 == 0 ? "sin cambio" : "\($0) s"
                }
                Text("\(draft.workSeconds) s de trabajo y \(draft.transitionSeconds) s para cambiar. Suena al parar y al arrancar.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        if f.usesRest {
            FreeStepper(label: "Descanso entre rondas", value: $draft.restSeconds,
                        step: FreeFunctionalStep.restStep, minValue: 0) {
                $0 == 0 ? "sin pausa" : PrescriptionRenderer.formatRest($0)
            }
        }
        if f.usesCap {
            FreeStepper(label: "Límite de tiempo", value: $draft.capSeconds,
                        step: FreeFunctionalStep.capStep, minValue: 0) {
                $0 == 0 ? "sin límite" : PrescriptionRenderer.formatClock($0)
            }
        }
    }

    // The three box-clock shapes, one tap each. Tabata is deliberately here and not
    // in the format grid: 20/10 × 8 is this same work+change cycle with different
    // numbers, so making it a separate format would fork the model for nothing.
    private var cadencePresets: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Ritmo", size: 11)
            HStack(spacing: 6) {
                ForEach(FreeEmomPreset.allCases) { p in
                    let on = draft.emomPreset == p
                    Button {
                        Haptics.light()
                        draft.apply(p)
                    } label: {
                        Text(p.labelES)
                            .font(.system(size: 13, weight: .heavy, design: .default).italic())
                            .foregroundStyle(on ? Theme.Color.accentOn : Theme.Color.foreground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(on ? Theme.Color.accent : Theme.Color.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel(p.labelES)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
        }
    }

    private var addButton: some View {
        Button {
            Haptics.light()
            showPicker = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .heavy))
                Text(draft.movements.isEmpty ? "Añadir movimiento" : "Añadir otro")
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
        .accessibilityLabel(draft.canAddMore ? "Añadir movimiento" : "Máximo de movimientos alcanzado")
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
                    if new.count > FreeFunctionalDraft.maxTitle {
                        draft.titleEdited = String(new.prefix(FreeFunctionalDraft.maxTitle))
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

    // MARK: Shared bits

    private var twoCol: [GridItem] {
        [GridItem(.flexible(), spacing: Theme.Spacing.m),
         GridItem(.flexible(), spacing: Theme.Spacing.m)]
    }

    private func stepHeader(title: String, subtitle: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 22, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            if let subtitle {
                Text(subtitle)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

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

// MARK: - Movement card
//
// Shared with the post-workout declaration sheet: naming what you did AFTER a
// cronómetro session must offer the exact same dose control as declaring it before,
// or the two paths would disagree about what a movement is.

struct FreeFunctionalCard: View {
    @Binding var movement: FreeFunctionalMovement
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            header
            FreeKindToggle(
                title: "Medida",
                options: FreeFunctionalDose.allCases,
                selection: $movement.dose,
                label: { $0.labelES }
            )
            doseStepper
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
            Text(movement.exercise.name)
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
                PrescriptionRenderer.formatDistance(Double($0)) ?? "\($0) m"
            }
        case .time:
            FreeStepper(label: "Tiempo", value: $movement.seconds,
                        step: FreeFunctionalStep.secondsStep, minValue: FreeFunctionalStep.secondsStep) {
                PrescriptionRenderer.formatClock($0)
            }
        }
    }
}
