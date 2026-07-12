import SwiftUI
import UIKit

// Full-screen live HUD for running on a Bluetooth (FTMS) treadmill. Presented as
// a cover from RunLiveHUD when the athlete taps "Correr en cinta"; reuses the
// workout's own segment progression (`primaryAdvance`) via the model. While the
// treadmill isn't connected it shows an honest scan/connecting state with a
// shareable diagnostic; once live it shows pace-vs-objetivo, pulse + zone,
// belt metrics, and the leg's distance/time progress.
struct TreadmillHUDView: View {
    @State private var model: TreadmillHUDModel
    @State private var showDiagnostics = false
    @Environment(\.dismiss) private var dismiss

    init(session: WorkoutSession, athleteAge: Int?) {
        _model = State(initialValue: TreadmillHUDModel(session: session, athleteAge: athleteAge))
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            VStack(spacing: Theme.Spacing.m) {
                header
                if model.treadmillLink.isLive {
                    liveHUD
                } else {
                    connectingState
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)
        }
        .onAppear {
            model.start()
            // The workout screen underneath already holds the display awake for
            // the whole session; ensure it here and let ActiveWorkoutView restore
            // it when the workout ends (turning it off now would wake-lock off
            // mid-run).
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear { model.teardown() }
        .onChange(of: model.session.currentSegmentIndex) { _, _ in
            // The leg advanced. Stay on the HUD (belt keeps its connection) if the
            // next leg is also a run; otherwise hand back to the standard HUD.
            if model.session.currentSegment?.kind == .running {
                model.handleSegmentChange()
            } else {
                dismiss()
            }
        }
        .onChange(of: model.session.isFinished) { _, finished in
            if finished { dismiss() }
        }
        .sheet(isPresented: $showDiagnostics) {
            if let text = model.diagnosticsText { ShareSheet(items: [text]) }
        }
    }

    // MARK: - Header (chips + close)

    private var header: some View {
        HStack(spacing: 6) {
            DeviceChip(icon: "figure.run", text: cintaChipText, link: model.treadmillLink)
            DeviceChip(icon: "heart.fill", text: pulseChipText, link: model.effectiveHRLink)
            Spacer(minLength: 0)
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

    // MARK: - Live HUD

    private var liveHUD: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: Theme.Spacing.m) {
                legHeader
                heroCard
                hrAndZoneRow
                metricsRow
                goalSection
            }
            .padding(.bottom, 4)
        }
        .safeAreaInset(edge: .bottom) { controls }
    }

    private var legHeader: some View {
        VStack(spacing: 4) {
            Text("Tramo \(model.tramoIndex) de \(model.tramoCount)")
                .font(.system(size: 12, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(Theme.Color.accentText)
            Text(model.segment?.title ?? "Correr")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            if let prescription = prescriptionLine {
                Text(prescription)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }

    private var heroCard: some View {
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
            ExpertCell(label: "Tiempo", value: TreadmillMath.clock(Int(model.segmentElapsedS)), unit: "")
        }
    }

    @ViewBuilder
    private var goalSection: some View {
        switch model.goal {
        case let .distance(target):
            GoalProgress(
                caption: "Distancia del tramo",
                primary: distString(model.segmentDistanceM),
                secondary: distString(target),
                fraction: model.progressFraction,
                complete: model.isComplete
            )
        case let .time(target):
            GoalProgress(
                caption: "Tiempo del tramo",
                primary: TreadmillMath.clock(max(0, target - Int(model.segmentElapsedS))),
                secondary: TreadmillMath.clock(target),
                fraction: model.progressFraction,
                complete: model.isComplete
            )
        case .open:
            EmptyView()
        }
    }

    private var controls: some View {
        HStack(spacing: 8) {
            Button(action: { model.togglePause() }) {
                Text(model.paused ? "REANUDAR" : "PAUSA")
                    .font(.system(size: 18, weight: .heavy, design: .default).italic())
                    .tracking(1)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 128)
                    .frame(height: 72)
                    .background(Theme.Color.surfaceElevated)
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
            ExpertPrimaryButton(title: model.session.isLastSegment ? "TERMINAR" : "FIN DEL TRAMO",
                                height: 72) {
                model.finishSegment()
            }
        }
        .padding(.top, 4)
        .background(Theme.Color.background.opacity(0.01))
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
        case .reconnecting:         return "Reconectando con la cinta…"
        case .unavailable:          return "No encuentro ninguna cinta"
        case .failed:               return "No se pudo conectar"
        default:                    return "Buscando tu cinta…"
        }
    }
    private var connectSubtitle: String {
        switch model.treadmillLink {
        case .unavailable:  return "Comprueba que el Bluetooth de la cinta está activado y que estás cerca."
        case .failed(let m): return m
        case .reconnecting: return "La conexión se cortó. Sigue corriendo, la recuperamos sola."
        default:            return "Enciende el Bluetooth de la cinta y acércate a ella."
        }
    }

    // MARK: - Formatting

    private var heroPace: String {
        model.livePaceSecPerKm.map(TreadmillMath.clock) ?? "—:—"
    }
    private var heroCaption: String {
        switch model.runTarget {
        case .zone: return "Ritmo · objetivo por zona"
        case .pace: return "Ritmo"
        case .none: return "Ritmo"
        }
    }
    private var prescriptionLine: String? {
        var parts: [String] = []
        switch model.goal {
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
