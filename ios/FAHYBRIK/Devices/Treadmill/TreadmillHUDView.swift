import SwiftUI
import UIKit

// Full-screen live HUD for running on a Bluetooth (FTMS) treadmill. Presented as
// a cover from a run leg (continuous OR an interval series). Traverses the leg
// structure with AUTOMATIC advancement — a distance work bout closes itself when
// the belt reaches the target and chains into the recovery/next bout; the manual
// button is only an override. Reuses the workout's own progression via the model.
struct TreadmillHUDView: View {
    @State private var model: TreadmillHUDModel
    @State private var showDiagnostics = false
    /// "Modo de control" — the field-diagnosis sheet (long-press the cinta chip).
    @State private var showControlDebug = false
    @Environment(\.dismiss) private var dismiss
    /// Compact height == the phone is in landscape → switch to the big-number layout.
    @Environment(\.verticalSizeClass) private var vSizeClass
    private var isLandscape: Bool { vSizeClass == .compact }
    /// Quick "Avisos de voz" (#63) toggle — shares the key with ProfileView, so the
    /// athlete can mute/unmute the coach without leaving the run.
    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true

    init(session: WorkoutSession, hrMaxSource: HRMaxSource?) {
        // The SHARED hub — so a belt connected in the brief is already live here (no
        // re-scan), and the connection outlives this cover being opened/closed.
        _model = State(initialValue: TreadmillHUDModel(session: session, hrMaxSource: hrMaxSource,
                                                       hub: .shared))
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            VStack(spacing: Theme.Spacing.m) {
                header
                // Honest "connected but silent" state, above the hero: many FTMS
                // belts emit NOTHING until the band moves, so without this the HUD
                // is a grid of dashes that reads as "broken". The 1 s TimelineView
                // re-evaluates the time-based staleness check; the banner drops the
                // instant a sample lands (the model's `latest` mutation re-renders).
                if model.treadmillLink.isLive, !model.isCountIn {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        if model.telemetrySilent { treadmillNoDataHint }
                    }
                }
                if !model.treadmillLink.isLive {
                    connectingState
                } else if model.isCountIn {
                    countInState
                } else if isLandscape {
                    landscapeLiveHUD
                } else {
                    liveHUD
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)
        }
        .allowsLandscape()
        .overlay {
            if let n = model.startCountdown { countdownOverlay(n) }
        }
        .animation(.easeInOut(duration: 0.2), value: model.startCountdown)
        .onAppear {
            model.start()
            // The workout screen underneath already holds the display awake for the
            // whole session; ensure it here and let ActiveWorkoutView restore it when
            // the workout ends (turning it off now would wake-lock off mid-run).
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear { model.teardown() }
        .onChange(of: model.session.currentSegmentIndex) { _, _ in dismissIfLeftRun() }
        .onChange(of: model.session.isFinished) { _, finished in if finished { dismiss() } }
        .onChange(of: model.session.isAwaitingBlockStart) { _, awaiting in if awaiting { dismiss() } }
        .sheet(isPresented: $showDiagnostics) {
            if let text = model.diagnosticsText { ShareSheet(items: [text]) }
        }
        .sheet(isPresented: $showControlDebug) {
            TreadmillControlDebugSheet(model: model)
        }
    }

    private func dismissIfLeftRun() {
        // The session left the run work (a non-run block, block preview, or the end)
        // → hand back to the standard HUD. A series stays on ONE segment index, and
        // a chain of run legs keeps the belt connected, so those don't dismiss.
        if model.session.currentSegment?.kind != .running
            || model.session.isFinished
            || model.session.isAwaitingBlockStart {
            dismiss()
        }
    }

    // MARK: - Header (chips + close)

    private var header: some View {
        HStack(spacing: 6) {
            headerChip(icon: "figure.run", text: cintaChipText,
                       link: model.treadmillLink, channel: model.treadmillChannel,
                       // MANTENIDO PULSADO en el chip de la cinta = "Modo de control",
                       // el diagnóstico de campo. Fuera del camino del atleta, pero
                       // siempre a un gesto cuando la cinta no obedece.
                       onLongPress: model.controlCapability.hasControlPoint
                           ? { showControlDebug = true } : nil)
            headerChip(icon: "heart.fill", text: pulseChipText,
                       link: model.effectiveHRLink, channel: model.hrChannel)
            Spacer(minLength: 0)
            Button(action: { Haptics.light(); voiceCoachEnabled.toggle(); if !voiceCoachEnabled { AudioCoach.shared.stopSpeaking() } }) {
                Image(systemName: voiceCoachEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(voiceCoachEnabled ? Theme.Color.accentText : Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel(voiceCoachEnabled ? "Silenciar avisos de voz" : "Activar avisos de voz")
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Cerrar")
        }
    }

    /// A header device chip that opens the picker on tap — so mid-run the athlete can
    /// switch machines or DISCONNECT one that latched onto the wrong device.
    private func headerChip(icon: String, text: String,
                            link: DeviceLink, channel: DeviceChannel,
                            onLongPress: (() -> Void)? = nil) -> some View {
        Button {
            Haptics.light()
            channel.openPicker()
        } label: {
            DeviceChip(icon: icon, text: text, link: link)
        }
        .buttonStyle(PressScaleStyle())
        .onLongPressGesture(minimumDuration: 0.6) {
            guard let onLongPress else { return }
            Haptics.medium()
            onLongPress()
        }
        .sheet(isPresented: Binding(get: { channel.isPresentingPicker },
                                    set: { channel.isPresentingPicker = $0 })) {
            DevicePickerSheet(channel: channel)
        }
    }

    private var cintaChipText: String {
        "Cinta · " + (model.treadmillLink.deviceName ?? cintaStateWord)
    }
    private var cintaStateWord: String {
        switch model.treadmillLink {
        case .scanning, .connecting: return "buscando"
        case .lost:                  return "se perdió"
        case .unavailable, .failed:  return "sin señal"
        case .idle, .connected:      return "—"
        }
    }
    private var pulseChipText: String {
        // Single source of truth: whatever the engine says is recording HR (strap →
        // its name/"banda", watch → "reloj", PM5 → "remo"), else the channel state.
        "Pulso · " + (model.effectiveHRLink.deviceName ?? pulseStateWord)
    }
    private var pulseStateWord: String {
        switch model.effectiveHRLink {
        case .scanning, .connecting: return "buscando"
        case .lost:                  return "se perdió"
        case .unavailable, .failed:  return "sin señal"
        case .idle, .connected:      return "—"
        }
    }

    // MARK: - Count-in

    private var countInState: some View {
        VStack(spacing: Theme.Spacing.l) {
            Spacer()
            LabelText(text: "Prepárate", size: 12)
            Text("\(max(0, model.countInRemaining))")
                .font(.system(size: 96, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
            Text("Empieza la serie")
                .font(.system(size: 15))
                .foregroundStyle(Theme.Color.muted)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Live HUD

    private var liveHUD: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: Theme.Spacing.m) {
                legHeader
                heroCard
                controlPanel
                hrAndZoneRow
                metricsRow
                goalSection
                guideReference
            }
            .padding(.bottom, 4)
        }
        .safeAreaInset(edge: .bottom) { controls }
    }

    // MARK: - Landscape live HUD (#6 — big numbers when the phone is rotated)

    /// Landscape split: the belt's REAL speed fills the left half (reads at 5 m), and the
    /// controls + a compact metric strip + START/STOP sit on the right. Only for the
    /// running state — recovery / count-in / connecting keep their centered portrait
    /// states, which read fine rotated.
    private var landscapeLiveHUD: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                Text(landscapeLegLine)
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .tracking(0.4)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(landscapeHero)
                    .font(.system(size: 112, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text(landscapeHeroUnit)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 8) {
                if model.controlCapability.canControl {
                    stepperCard(label: "Velocidad",
                                value: String(format: "%.1f", model.targetSpeedKmh), unit: "km/h",
                                down: { model.nudgeSpeed(-1) }, up: { model.nudgeSpeed(1) })
                    if model.controlCapability.canControlIncline {
                        stepperCard(label: model.inclineControlLabel,
                                    value: model.inclineControlValue, unit: model.inclineControlUnit,
                                    down: { model.nudgeIncline(-1) }, up: { model.nudgeIncline(1) })
                    }
                }
                landscapeMetrics
                landscapeBottomBar
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxHeight: .infinity)
        .padding(.vertical, 2)
    }

    /// Under control the hero shows the belt's REAL speed (what the athlete drives); on a
    /// read-only belt it falls back to live pace (the running metric).
    private var landscapeHero: String {
        model.controlCapability.canControl ? speedString : heroPace
    }
    private var landscapeHeroUnit: String {
        model.controlCapability.canControl ? "km/h · real en la cinta" : "/km · ritmo real"
    }
    private var landscapeLegLine: String {
        var line = "Tramo \(model.legNumber) de \(model.legTotal)"
        if let objetivo = model.runTarget.objetivoLabel { line += " — objetivo \(objetivo)" }
        return line
    }

    private var landscapeMetrics: some View {
        HStack(spacing: 8) {
            ExpertCell(label: "Metros", value: distString(model.legDistanceM), unit: "")
            ExpertCell(label: "Tiempo", value: TreadmillMath.clock(Int(model.legElapsedEffective)), unit: "")
            ExpertCell(label: "Pulso",
                       value: model.currentBpm.map { "\($0)" } ?? "—", unit: "bpm",
                       color: model.liveZone?.color ?? Theme.Color.foreground)
        }
    }

    @ViewBuilder
    private var landscapeBottomBar: some View {
        HStack(spacing: 8) {
            if model.controlCapability.canControl {
                if model.beltMoving {
                    stopButton { model.stopBelt() }
                } else {
                    startButton { model.startBelt() }
                }
            } else {
                neutralButton("TERMINAR TRAMO") { model.endLegNow() }
            }
        }
    }

    // MARK: - Machine control panel (steppers / read-only note)

    /// Speed + inclination steppers when the belt is controllable; an honest "solo
    /// datos" note when it isn't. The values shown are the TARGETS we've set — the hero
    /// above always shows the belt's REAL speed, so the two never silently diverge.
    @ViewBuilder
    private var controlPanel: some View {
        if model.controlCapability.canControl {
            HStack(spacing: 8) {
                stepperCard(label: "Velocidad",
                            value: String(format: "%.1f", model.targetSpeedKmh), unit: "km/h",
                            down: { model.nudgeSpeed(-1) }, up: { model.nudgeSpeed(1) })
                if model.controlCapability.canControlIncline {
                    stepperCard(label: model.inclineControlLabel,
                                value: model.inclineControlValue, unit: model.inclineControlUnit,
                                down: { model.nudgeIncline(-1) }, up: { model.nudgeIncline(1) })
                }
            }
        } else if model.treadmillLink.isLive {
            readOnlyNote
        }
    }

    private func stepperCard(label: String, value: String, unit: String,
                             down: @escaping () -> Void, up: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: label, size: 10)
            HStack(spacing: 4) {
                stepButton("minus", action: down)
                Spacer(minLength: 2)
                HStack(alignment: .lastTextBaseline, spacing: 3) {
                    Text(value)
                        .font(.system(size: 24, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    Text(unit)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 2)
                stepButton("plus", action: up)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface)
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func stepButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 40, height: 40)
                .background(Theme.Color.surfaceElevated)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(icon == "plus" ? "Subir" : "Bajar")
    }

    private var readOnlyNote: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("Esta cinta solo envía datos — no permite control desde la app. Ajústala en la máquina.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    /// PRESCRIBED inclinación / cadencia for a structured leg (#61) — a sober
    /// reference so the athlete can match the belt. Hidden when the coach set none.
    @ViewBuilder
    private var guideReference: some View {
        let parts: [String] = {
            var p: [String] = []
            if let inc = model.prescribedInclinePct, inc > 0 {
                p.append(inc == inc.rounded() ? "Inclinación \(Int(inc))%" : String(format: "Inclinación %.1f%%", inc))
            }
            if let cad = model.prescribedCadenceSpm { p.append("Cadencia \(cad) ppm") }
            return p
        }()
        if !parts.isEmpty {
            Text(parts.joined(separator: " · "))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
        }
    }

    private var legHeader: some View {
        VStack(spacing: 4) {
            Text("Tramo \(model.legNumber) de \(model.legTotal)")
                .font(.system(size: 12, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(Theme.Color.accentText)
            Text(legTitle)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            if !model.isRecovery, let prescription = prescriptionLine {
                Text(prescription)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }

    private var legTitle: String {
        if model.isRecovery { return "Recuperación" }
        return model.currentSegment?.title ?? "Correr"
    }

    @ViewBuilder
    private var heroCard: some View {
        if model.isRecovery {
            recoveryHero
        } else {
            paceHero
        }
    }

    private var recoveryHero: some View {
        CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 8) {
                LabelText(text: "Recuperación", size: 10)
                Text(TreadmillMath.clock(Int((model.legTimeRemaining ?? 0).rounded())))
                    .font(Theme.Typography.readoutHero)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if model.progressFraction > 0 {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.Color.surface)
                            Capsule().fill(Theme.Color.accent)
                                .frame(width: max(0, geo.size.width * model.progressFraction))
                        }
                    }
                    .frame(height: 6)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var paceHero: some View {
        let status = model.heroStatus
        return CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 6) {
                LabelText(text: heroCaption, size: 10)
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text(heroPace)
                        .font(Theme.Typography.readoutHero)
                        .foregroundStyle(status == .unknown ? Theme.Color.foreground : status.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text("/km")
                        .font(Theme.Typography.readoutLabel)
                        .foregroundStyle(Theme.Color.muted)
                }
                if let objetivo = model.runTarget.objetivoLabel {
                    HStack(spacing: 8) {
                        Text("Objetivo \(objetivo)")
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                        if let cue = status.cue {
                            Text(cue.uppercased())
                                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                                .tracking(0.6)
                                .foregroundStyle(status.color)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(status == .unknown ? Color.clear : status.color.opacity(0.75), lineWidth: 2)
        )
    }

    private var hrAndZoneRow: some View {
        let cols = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            ExpertCell(
                label: "Pulso",
                value: model.currentBpm.map { "\($0)" } ?? "—",
                unit: "bpm",
                color: model.liveZone?.color ?? Theme.Color.foreground
            )
            if let zone = model.liveZone {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Zona", size: 11)
                    ZoneMeter(zone: zone, isEstimated: model.zoneIsEstimated)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.surfaceElevated)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                // No HR, or HR without an age → honest empty slot, never a fake zone.
                ExpertCell(label: "Zona", value: "—", unit: "")
            }
        }
    }

    private var metricsRow: some View {
        let cols = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            ExpertCell(label: "Velocidad", value: speedString, unit: "km/h")
            ExpertCell(label: model.inclineControlLabel, value: inclineString,
                       unit: model.inclineControlUnit)
            ExpertCell(label: "Tiempo", value: TreadmillMath.clock(Int(model.legElapsedEffective)), unit: "")
        }
    }

    @ViewBuilder
    private var goalSection: some View {
        if !model.isRecovery {
            switch model.currentLeg.goal {
            case let .distance(target):
                GoalProgress(
                    caption: "Distancia del tramo",
                    primary: distString(model.legDistanceM),
                    secondary: distString(target),
                    fraction: model.progressFraction,
                    complete: model.isComplete
                )
            case let .time(target):
                GoalProgress(
                    caption: "Tiempo del tramo",
                    primary: TreadmillMath.clock(Int((model.legTimeRemaining ?? Double(target)).rounded())),
                    secondary: TreadmillMath.clock(target),
                    fraction: model.progressFraction,
                    complete: model.isComplete
                )
            case .open:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: 8) {
            if let notice = model.controlNotice {
                // The machine refused something → this is EXACTLY the moment the control
                // dialect is in question, so the way into the diagnosis is right here
                // instead of only behind the long-press.
                HStack(spacing: 8) {
                    Text(notice)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.danger)
                    Button(action: { Haptics.light(); showControlDebug = true }) {
                        Text("Modo de control")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    .buttonStyle(PressScaleStyle())
                }
                .frame(maxWidth: .infinity)
            }
            HStack(spacing: 8) {
                if model.controlCapability.canControl {
                    // Belt is drivable → START when stopped, big STOP when moving.
                    if model.beltMoving {
                        neutralButton(model.paused ? "REANUDAR" : "PAUSA") { model.togglePause() }
                        stopButton { model.stopBelt() }
                    } else {
                        startButton { model.startBelt() }
                        neutralButton("TERMINAR TRAMO") { model.endLegNow() }
                    }
                } else {
                    // Read-only belt (or none) → the original manual controls.
                    neutralButton(model.paused ? "REANUDAR" : "PAUSA") { model.togglePause() }
                    neutralButton("TERMINAR TRAMO AHORA") { model.endLegNow() }
                }
            }
        }
        .padding(.top, 4)
    }

    /// Start the belt (orange = go). Kicks off the 3·2·1 in the model.
    private func startButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label("EMPEZAR", systemImage: "play.fill")
                .font(.system(size: 18, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(Theme.Color.accentOn)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .frame(height: 66)
                .background(Theme.Color.accent)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    /// Stop the belt (red, wide = the safety action, always the biggest target).
    private func stopButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label("PARAR", systemImage: "stop.fill")
                .font(.system(size: 18, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .frame(height: 66)
                .background(Theme.Color.danger)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Parar la cinta")
    }

    // MARK: - 3·2·1 start countdown

    private func countdownOverlay(_ n: Int) -> some View {
        ZStack {
            Theme.Color.background.opacity(0.94).ignoresSafeArea()
            VStack(spacing: 8) {
                LabelText(text: "La cinta va a arrancar", size: 13)
                Text("\(n)")
                    .font(.system(size: 180, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                    .contentTransition(.numericText())
                Text("Colócate en la banda y agárrate. Empezará suave y subirá a tu ritmo.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Button(action: { model.cancelStart() }) {
                    Text("Cancelar")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.Color.foreground)
                        .padding(.horizontal, 26).padding(.vertical, 12)
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                }
                .buttonStyle(PressScaleStyle())
                .padding(.top, 22)
            }
        }
        .transition(.opacity)
    }

    private func neutralButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .heavy, design: .default).italic())
                .tracking(0.8)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .frame(height: 66)
                .background(Theme.Color.surfaceElevated)
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    // MARK: - Connected-but-silent hint (mirror of the erg's "sin datos" banner)

    private var treadmillNoDataHint: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.warning)
                Text("Conectada, pero la cinta no envía datos. Ponla en marcha desde la consola — algunas solo emiten con la banda en movimiento.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if model.diagnosticsText != nil {
                Button(action: { showDiagnostics = true }) {
                    Text("Compartir diagnóstico")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .buttonStyle(PressScaleStyle())
                .padding(.leading, 21)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
            .stroke(Theme.Color.warning.opacity(0.4), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Connecting / scan state — THE shared "Conecta tu cinta" screen
    //
    // The SAME guide as the pre-start sequence's paso 2 (single connect journey):
    // it reappears here when the HUD opens unconnected or the belt drops mid-run —
    // identical copy and buttons, never a different-looking second path.
    private var connectingState: some View {
        TreadmillConnectGuide(
            link: model.treadmillLink,
            onSearch: { searchBelt() },
            onSkip: { dismiss() },
            onShareDiagnostics: model.diagnosticsText != nil ? { showDiagnostics = true } : nil
        )
    }

    private func searchBelt() {
        Haptics.light()
        // One intent for every link state: the tap opens the picker and the scan runs
        // behind it (upgrading a silent reconnect already in flight rather than
        // restarting it). The channel never pops this sheet on its own.
        model.treadmillChannel.openPicker()
    }

    // MARK: - Formatting

    private var heroPace: String {
        model.livePaceSecPerKm.map(TreadmillMath.clock) ?? "—:—"
    }
    private var heroCaption: String {
        switch model.runTarget {
        case .zone: return "Ritmo · objetivo por zona"
        default:    return "Ritmo"
        }
    }
    private var prescriptionLine: String? {
        var parts: [String] = []
        switch model.currentLeg.goal {
        case let .distance(m): parts.append(distString(m))
        case let .time(s):     parts.append(TreadmillMath.clock(s))
        case .open:            break
        }
        if let objetivo = model.runTarget.objetivoLabel { parts.append(objetivo) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
    private var speedString: String {
        // The RESOLVED belt speed (odometer-derived when the machine freezes instantaneous
        // speed at 0), so the tile shows the real pace he's running, never a stuck 0.0.
        model.displaySpeedKmh.map { String(format: "%.1f", $0) } ?? "—"
    }
    /// Percent grade, or the console LEVEL on machines whose incline field isn't a grade
    /// — the model owns which, so the cell never shows a fabricated "%".
    private var inclineString: String { model.liveInclineValue }
    private func distString(_ m: Double) -> String {
        m >= 1000 ? String(format: "%.2f km", m / 1000) : "\(Int(m.rounded())) m"
    }
}
