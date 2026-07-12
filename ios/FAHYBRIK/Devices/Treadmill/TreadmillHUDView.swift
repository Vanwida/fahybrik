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
    @Environment(\.dismiss) private var dismiss
    /// Quick "Avisos de voz" (#63) toggle — shares the key with ProfileView, so the
    /// athlete can mute/unmute the coach without leaving the run.
    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true

    init(session: WorkoutSession, athleteAge: Int?) {
        _model = State(initialValue: TreadmillHUDModel(session: session, athleteAge: athleteAge))
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            VStack(spacing: Theme.Spacing.m) {
                header
                if !model.treadmillLink.isLive {
                    connectingState
                } else if model.isCountIn {
                    countInState
                } else {
                    liveHUD
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)
        }
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
            DeviceChip(icon: "figure.run", text: cintaChipText, link: model.treadmillLink)
            DeviceChip(icon: "heart.fill", text: pulseChipText, link: model.effectiveHRLink)
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

    private var cintaChipText: String {
        "Cinta · " + (model.treadmillLink.deviceName ?? cintaStateWord)
    }
    private var cintaStateWord: String {
        switch model.treadmillLink {
        case .scanning, .connecting: return "buscando"
        case .reconnecting:          return "reconectando"
        case .unavailable, .failed:  return "sin señal"
        case .idle, .connected:      return "—"
        }
    }
    private var pulseChipText: String {
        if model.hrLink.isLive { return "Pulso · " + (model.hrLink.deviceName ?? "banda") }
        if model.session.liveHRBpm != nil { return "Pulso · reloj" }
        return "Pulso · —"
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
                hrAndZoneRow
                metricsRow
                goalSection
                guideReference
            }
            .padding(.bottom, 4)
        }
        .safeAreaInset(edge: .bottom) { controls }
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
                    ZoneMeter(zone: zone)
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
            ExpertCell(label: "Inclinación", value: inclineString, unit: "%")
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

    private var controls: some View {
        // Advancement is automatic — these are manual controls, so both read as
        // neutral (the workout drives itself; PAUSE freezes it, TERMINAR overrides).
        HStack(spacing: 8) {
            neutralButton(model.paused ? "REANUDAR" : "PAUSA") { model.togglePause() }
            neutralButton("TERMINAR TRAMO AHORA") { model.endLegNow() }
        }
        .padding(.top, 4)
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

    // MARK: - Connecting / scan state

    private var connectingState: some View {
        VStack(spacing: Theme.Spacing.l) {
            Spacer(minLength: 0)
            if isSearching {
                ProgressView().tint(Theme.Color.accent).scaleEffect(1.3)
            } else {
                Image(systemName: "figure.run")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
            }
            Text(connectTitle)
                .font(.system(size: 20, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(connectSubtitle)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.xl)
            if model.diagnosticsText != nil {
                Button(action: { showDiagnostics = true }) {
                    Text("Compartir diagnóstico")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .buttonStyle(PressScaleStyle())
            }
            Spacer(minLength: 0)
            ExpertPrimaryButton(title: "VOLVER", height: 60) { dismiss() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var isSearching: Bool {
        switch model.treadmillLink {
        case .scanning, .connecting, .reconnecting, .idle: return true
        default: return false
        }
    }
    private var connectTitle: String {
        switch model.treadmillLink {
        case .reconnecting:  return "Reconectando con la cinta…"
        case .unavailable:   return "No encuentro ninguna cinta"
        case .failed:        return "No se pudo conectar"
        default:             return "Buscando tu cinta…"
        }
    }
    private var connectSubtitle: String {
        switch model.treadmillLink {
        case .unavailable:   return "Comprueba que el Bluetooth de la cinta está activado y que estás cerca."
        case .failed(let m): return m
        case .reconnecting:  return "La conexión se cortó. Sigue corriendo, la recuperamos sola."
        default:             return "Enciende el Bluetooth de la cinta y acércate a ella."
        }
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
        model.latest.speedKmh.map { String(format: "%.1f", $0) } ?? "—"
    }
    private var inclineString: String {
        model.latest.inclinePct.map { String(format: "%.1f", $0) } ?? "—"
    }
    private func distString(_ m: Double) -> String {
        m >= 1000 ? String(format: "%.2f km", m / 1000) : "\(Int(m.rounded())) m"
    }
}
