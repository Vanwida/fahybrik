import SwiftUI

// MARK: - Entreno libre — builder flow (P2 → P5)
//
// Three steps: Modalidad → Formato → Configura. The athlete picks a measured
// modality, a format from the real catalog, configures the bouts with STEPPERS
// (no free text except the editable title), sees a live "Tu entreno" preview, and
// taps Empezar — which hands the locally-built `WorkoutPlan` to the EXISTING
// `WorkoutContainer` in free mode (same engine, HUDs, finish/RPE flow). On save it
// routes to `FreeWorkoutAPI` instead of the prescribed sync.
struct FreeWorkoutBuilderView: View {
    let bearer: String?
    let onClose: () -> Void
    /// Fired after the free workout is saved, so the caller can refresh the plan
    /// (the new self-origin session then appears as a "Libre" row).
    var onCompleted: () -> Void = {}

    @State private var draft = FreeWorkoutDraft()
    @State private var step: Step = .modality
    @State private var running: FreeWorkoutContext? = nil
    /// Which builder track the athlete is on. The MEASURED wizard (row/run/ski/bike)
    /// lives here; FUERZA / FUNCIONAL hand off to their own list builders, which
    /// return a `FreeWorkoutContext` that runs through the SAME engine below.
    @State private var track: Track = .measured

    enum Step: Int, CaseIterable { case modality, format, bouts }
    enum Track { case measured, strength, functional }

    var body: some View {
        if let ctx = running {
            // P5 — run it through the existing engine; save via the free path. Shared
            // by all three tracks, so there's ONE place that hosts WorkoutContainer.
            WorkoutContainer(
                assignmentId: nil,
                fallbackTitle: ctx.title,
                bearer: bearer,
                freeContext: ctx,
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
                    onBack: { track = .measured },
                    onStart: { running = $0 }
                )
            case .functional:
                FreeFunctionalBuilderView(
                    bearer: bearer,
                    onBack: { track = .measured },
                    onStart: { running = $0 }
                )
            }
        }
    }

    private var builder: some View {
        VStack(spacing: 0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    switch step {
                    case .modality: modalityStep
                    case .format:   formatStep
                    case .bouts:    boutsStep
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            if step == .bouts { footer }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        // Leaving the measured builder WITHOUT starting (back out, or switch to the
        // Fuerza/Funcional track) → release any belt/strap connected from the card.
        // When Empezar sets `running`, WorkoutContainer owns teardown, so skip here.
        .onDisappear { if running == nil { DeviceHub.shared.stopAll() } }
    }

    // MARK: - Nav bar

    private var navBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                back()
            } label: {
                Image(systemName: step == .modality ? "xmark" : "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(step == .modality ? "Cerrar" : "Atrás")

            VStack(alignment: .leading, spacing: 1) {
                Text("Crear entreno libre")
                    .font(.system(size: 15, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Text(stepBreadcrumb)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            stepDots
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
        .overlay(Rectangle().fill(Theme.Color.hairline).frame(height: 1), alignment: .bottom)
    }

    private var stepDots: some View {
        HStack(spacing: 5) {
            ForEach(Step.allCases, id: \.rawValue) { s in
                Circle()
                    .fill(s.rawValue <= step.rawValue ? Theme.Color.accent : Theme.Color.hairlineStrong)
                    .frame(width: 6, height: 6)
            }
        }
        .accessibilityHidden(true)
    }

    private var stepBreadcrumb: String {
        var parts: [String] = []
        if let m = draft.modality { parts.append(m.labelES) }
        if let f = draft.format { parts.append(f.labelES) }
        if parts.isEmpty { return "Elige una modalidad" }
        return parts.joined(separator: " · ")
    }

    // MARK: - Step 1 · Modalidad

    private var modalityStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            stepHeader(title: "¿Qué vas a hacer?",
                       subtitle: "Disciplinas medidas. Suma al plan, no lo rompe.")
            LazyVGrid(columns: twoCol, spacing: Theme.Spacing.m) {
                ForEach(FreeModality.allCases) { m in
                    FreeBuilderTile(
                        icon: m.icon,
                        title: m.labelES,
                        subtitle: m == .run ? "Ritmo /km" : "Ritmo /500m",
                        selected: draft.modality == m,
                        disabledNote: nil
                    ) {
                        draft.selectModality(m)
                        advance(to: .format)
                    }
                }
                // Catalog-driven tracks: hand off to their own list builders (pick
                // movements + configure), which run through the SAME engine on start.
                FreeBuilderTile(icon: "dumbbell.fill", title: "Fuerza",
                                subtitle: "Series y carga", selected: false, disabledNote: nil) {
                    advanceTrack(.strength)
                }
                FreeBuilderTile(icon: "figure.cross.training", title: "Funcional",
                                subtitle: "WOD · For Time, AMRAP…", selected: false, disabledNote: nil) {
                    advanceTrack(.functional)
                }
            }
        }
    }

    // MARK: - Step 2 · Formato

    private var formatStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            stepHeader(title: "Formato",
                       subtitle: "Cómo se estructura el trabajo.")
            LazyVGrid(columns: twoCol, spacing: Theme.Spacing.m) {
                ForEach(FreeFormat.allCases) { f in
                    FreeBuilderTile(
                        icon: nil,
                        title: f.labelES,
                        subtitle: f.subtitleES,
                        selected: draft.format == f,
                        disabledNote: nil
                    ) {
                        draft.format = f
                        advance(to: .bouts)
                    }
                }
            }
        }
    }

    // MARK: - Step 3 · Configura (bouts)

    @ViewBuilder
    private var boutsStep: some View {
        if let format = draft.format {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                stepHeader(title: "Configura", subtitle: nil)

                if format.usesRounds {
                    FreeStepper(label: format.roundsLabel, value: $draft.rounds,
                                step: FreeStep.rounds, minValue: 1) { "\($0)" }
                }
                if format.usesCadence {
                    FreeStepper(label: "Cada", value: $draft.cadenceSeconds,
                                step: FreeStep.cadenceSeconds, minValue: FreeStep.cadenceSeconds) {
                        PrescriptionRenderer.formatRest($0)
                    }
                }
                if format.usesWindow {
                    FreeStepper(label: "Duración total", value: $draft.windowSeconds,
                                step: FreeStep.windowSeconds, minValue: FreeStep.windowSeconds) {
                        PrescriptionRenderer.formatClock($0)
                    }
                }

                // Work measure (how much) — kind toggle + the matching stepper.
                FreeKindToggle(
                    title: "Medida",
                    options: measureOptions,
                    selection: Binding(get: { draft.measureKind }, set: { draft.measureKind = $0 }),
                    label: { $0.labelES }
                )
                measureStepper

                if format.usesRest {
                    FreeStepper(label: "Descanso", value: $draft.restSeconds,
                                step: FreeStep.restSeconds, minValue: 0) {
                        $0 == 0 ? "—" : PrescriptionRenderer.formatRest($0)
                    }
                }

                // Objetivo (how hard) — REQUIRED: pace or HR zone.
                FreeKindToggle(
                    title: "Objetivo",
                    options: FreeTargetKind.allCases,
                    selection: Binding(get: { draft.targetKind }, set: { draft.targetKind = $0 }),
                    label: { $0.labelES }
                )
                targetControl

                titleField
                FreePreviewCard(line: draft.previewLine)
                if !freeDevices.isEmpty {
                    // Same connect-before-start card as the prescribed brief: a free
                    // run offers the belt + strap, a free erg the PM5 + strap. Connect
                    // here and the live engine starts already streaming. Optional.
                    DeviceConnectCard(devices: freeDevices)
                }
            }
        }
    }

    /// Devices worth offering for the chosen measured modality — mirrors the
    /// prescribed brief (run → belt + strap, erg → PM5 + strap). Empty until a
    /// modality is picked / for a non-measured track.
    private var freeDevices: [PreWorkoutDevice] {
        guard let m = draft.modality else { return [] }
        return m == .run ? [.treadmill, .heartRate] : [.pm5, .heartRate]
    }

    @ViewBuilder
    private var measureStepper: some View {
        switch draft.measureKind {
        case .distance:
            FreeStepper(label: "Distancia", value: $draft.distanceMeters,
                        step: FreeStep.distanceMeters, minValue: FreeStep.distanceMeters) {
                PrescriptionRenderer.formatDistance(Double($0)) ?? "\($0) m"
            }
        case .time:
            FreeStepper(label: "Tiempo", value: $draft.workSeconds,
                        step: FreeStep.workSeconds, minValue: FreeStep.workSeconds) {
                PrescriptionRenderer.formatClock($0)
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
                PrescriptionRenderer.formatPace($0)
            }
        case .hrZone:
            FreeZonePicker(zone: $draft.hrZone)
        }
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
                    if new.count > FreeWorkoutDraft.maxTitle {
                        draft.titleEdited = String(new.prefix(FreeWorkoutDraft.maxTitle))
                    }
                }
                .accessibilityLabel("Nombre del entreno")
        }
    }

    // MARK: - Footer CTA

    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            ExpertPrimaryButton(title: "▶ Empezar entreno", height: 52) {
                guard let ctx = draft.buildContext() else { return }
                Haptics.medium()
                running = ctx
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.m)
        }
        .background(Theme.Color.background)
    }

    // MARK: - Shared bits

    private var twoCol: [GridItem] {
        [GridItem(.flexible(), spacing: Theme.Spacing.m),
         GridItem(.flexible(), spacing: Theme.Spacing.m)]
    }

    private var measureOptions: [FreeMeasureKind] {
        (draft.modality?.supportsCalories ?? true)
            ? FreeMeasureKind.allCases
            : [.distance, .time]
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

    private func advanceTrack(_ next: Track) {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.2)) { track = next }
    }

    private func back() {
        switch step {
        case .modality: onClose()
        case .format:   withAnimation(.easeInOut(duration: 0.2)) { step = .modality }
        case .bouts:    withAnimation(.easeInOut(duration: 0.2)) { step = .format }
        }
    }
}

// MARK: - Builder tile (modality / format)

struct FreeBuilderTile: View {
    let icon: String?
    let title: String
    let subtitle: String?
    let selected: Bool
    /// When non-nil the tile is disabled and shows this note ("Próximamente").
    let disabledNote: String?
    let action: () -> Void

    private var isDisabled: Bool { disabledNote != nil }

    var body: some View {
        Button {
            guard !isDisabled else { return }
            action()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    if let icon {
                        Image(systemName: icon)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(isDisabled ? Theme.Color.faint
                                             : (selected ? Theme.Color.accentText : Theme.Color.foreground))
                    }
                    Spacer(minLength: 0)
                    if let note = disabledNote {
                        Text(note)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Theme.Color.muted)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Theme.Color.surfaceSunken)
                            .clipShape(Capsule())
                    } else if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.Color.accent)
                    }
                }
                Text(title)
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .foregroundStyle(isDisabled ? Theme.Color.faint : Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .padding(Theme.Spacing.m)
            .background(selected ? Theme.Color.accent.opacity(0.10) : Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(selected ? Theme.Color.accent : Theme.Color.hairline,
                            lineWidth: selected ? 1.5 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .opacity(isDisabled ? 0.6 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(isDisabled)
        .accessibilityLabel(isDisabled ? "\(title), \(disabledNote ?? "")" : title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Stepper (−/value/+, mono readout) — the only way to set a number

struct FreeStepper: View {
    let label: String
    @Binding var value: Int
    let step: Int
    var minValue: Int = 0
    var maxValue: Int = 100_000
    let format: (Int) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 11)
            HStack(spacing: 10) {
                button(systemName: "minus", delta: -step)
                Text(format(value))
                    .font(.system(size: 28, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: .infinity)
                button(systemName: "plus", delta: step)
            }
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(format(value))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: adjust(step)
            case .decrement: adjust(-step)
            @unknown default: break
            }
        }
    }

    private func button(systemName: String, delta: Int) -> some View {
        Button { adjust(delta) } label: {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 38, height: 38)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(delta > 0 ? "Sumar" : "Restar")
    }

    private func adjust(_ delta: Int) {
        Haptics.light()
        value = min(maxValue, max(minValue, value + delta))
    }
}

// MARK: - Kind toggle (segmented, no free text)

struct FreeKindToggle<Option: Identifiable & Equatable>: View {
    let title: String
    let options: [Option]
    @Binding var selection: Option
    let label: (Option) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: title, size: 11)
            HStack(spacing: 4) {
                ForEach(options) { opt in
                    let on = selection == opt
                    Button {
                        Haptics.light()
                        selection = opt
                    } label: {
                        Text(label(opt))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(on ? Theme.Color.accentOn : Theme.Color.foreground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(on ? Theme.Color.accent : Theme.Color.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label(opt))
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
    }
}

// MARK: - HR zone picker (Z1…Z5)

struct FreeZonePicker: View {
    @Binding var zone: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: "Zona FC", size: 11)
            HStack(spacing: 4) {
                ForEach(HRZone.allCases, id: \.rawValue) { z in
                    let on = zone == z.rawValue
                    Button {
                        Haptics.light()
                        zone = z.rawValue
                    } label: {
                        Text(z.label)
                            .font(.system(size: 14, weight: .heavy, design: .default).italic())
                            .foregroundStyle(on ? Theme.Color.foreground : Theme.Color.muted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(on ? z.tint : Theme.Color.surface)
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                                    .stroke(on ? z.color : Theme.Color.hairline, lineWidth: on ? 1.5 : 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Zona \(z.rawValue)")
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
    }
}

// MARK: - Live preview card ("Tu entreno")

struct FreePreviewCard: View {
    let line: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Tu entreno", color: Theme.Color.accentText, size: 11)
            Text(line.isEmpty ? "—" : line)
                .font(Theme.Typography.readoutS)
                .foregroundStyle(Theme.Color.foreground)
                .minimumScaleFactor(0.7)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.accent.opacity(0.4), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tu entreno: \(line)")
    }
}
