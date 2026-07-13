import SwiftUI
import UIKit

// Full-screen live HUD for running OUTDOORS on phone GPS (#64). Presented as a cover
// from a run leg (continuous OR a structured series). The map + live trace sit on
// top; below, the SAME leg card / pace hero / goal progress language as the treadmill
// HUD, but the pace comes from smoothed GPS and a distance leg auto-closes on GPS
// distance. Auto-pause freezes the run when the athlete stops, with a sober banner.

struct OutdoorRunHUDView: View {
    @State private var model: OutdoorRunHUDModel
    @Environment(\.dismiss) private var dismiss
    /// "Avisos de voz" (#63) toggle — shares the key with ProfileView.
    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true

    /// Fraction of the screen height the live map occupies — a glance surface, not
    /// the focus; the numbers below carry the coaching.
    private static let mapHeightFraction: CGFloat = 0.38

    init(session: WorkoutSession, hrMaxSource: HRMaxSource?) {
        _model = State(initialValue: OutdoorRunHUDModel(session: session, hrMaxSource: hrMaxSource))
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            GeometryReader { geo in
                VStack(spacing: Theme.Spacing.m) {
                    header
                    RunRouteMapView(coordinates: model.coordinates,
                                    quality: model.gpsQuality,
                                    paused: model.isAutoPaused)
                        .frame(height: geo.size.height * Self.mapHeightFraction)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                            .stroke(Theme.Color.hairline, lineWidth: 1))
                    if model.isCountIn { countInState } else { liveHUD }
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, 10)
            }
        }
        .onAppear {
            model.start()
            // Keep the screen awake for the whole run; ActiveWorkoutView restores it
            // when the session ends (turning it off here would wake-lock off mid-run).
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear { model.teardown() }
        .onChange(of: model.session.currentSegmentIndex) { _, _ in dismissIfLeftRun() }
        .onChange(of: model.session.isFinished) { _, finished in if finished { dismiss() } }
        .onChange(of: model.session.isAwaitingBlockStart) { _, awaiting in if awaiting { dismiss() } }
    }

    private func dismissIfLeftRun() {
        if model.session.currentSegment?.kind != .running
            || model.session.isFinished
            || model.session.isAwaitingBlockStart {
            dismiss()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "figure.run")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
            Text("AL AIRE LIBRE")
                .font(.system(size: 13, weight: .heavy, design: .default).italic())
                .tracking(0.8)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 0)
            Button(action: {
                Haptics.light(); voiceCoachEnabled.toggle()
                if !voiceCoachEnabled { AudioCoach.shared.stopSpeaking() }
            }) {
                Image(systemName: voiceCoachEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(voiceCoachEnabled ? Theme.Color.accentText : Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface).clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel(voiceCoachEnabled ? "Silenciar avisos de voz" : "Activar avisos de voz")
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface).clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Cerrar")
        }
    }

    // MARK: - Count-in

    private var countInState: some View {
        VStack(spacing: Theme.Spacing.l) {
            Spacer()
            LabelText(text: "Prepárate", size: 12)
            Text("\(max(0, model.countInRemaining))")
                .font(.system(size: 88, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
            Text("Empieza la carrera").font(.system(size: 15)).foregroundStyle(Theme.Color.muted)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Live HUD

    private var liveHUD: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: Theme.Spacing.m) {
                legHeader
                if model.isRecovery { recoveryHero } else { paceHero }
                metricsRow
                goalSection
                guideReference
                if model.isAutoPaused { autoPauseBanner }
            }
            .padding(.bottom, 4)
        }
        .safeAreaInset(edge: .bottom) { controls }
    }

    private var legHeader: some View {
        VStack(spacing: 4) {
            if model.isStructured {
                Text("Tramo \(model.legNumber) de \(model.legTotal)")
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.accentText)
            }
            Text(legTitle)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }

    private var legTitle: String {
        if model.isRecovery { return "Recuperación" }
        return model.currentSegment?.title ?? "Correr"
    }

    private var paceHero: some View {
        let status = model.heroStatus
        return CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 6) {
                LabelText(text: "Ritmo GPS", size: 10)
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text(paceString)
                        .font(Theme.Typography.readoutHero)
                        .foregroundStyle(status == .unknown ? Theme.Color.foreground : status.color)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Text("/km").font(Theme.Typography.readoutLabel).foregroundStyle(Theme.Color.muted)
                }
                if let objetivo = model.runTarget.objetivoLabel {
                    HStack(spacing: 8) {
                        Text("Objetivo \(objetivo)")
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                        if let word = paceStateWord(status) {
                            Text(word.uppercased())
                                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                                .tracking(0.6)
                                .foregroundStyle(status.color)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
            .stroke(status == .unknown ? Color.clear : status.color.opacity(0.75), lineWidth: 2))
    }

    private var recoveryHero: some View {
        CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 8) {
                LabelText(text: "Recuperación", size: 10)
                Text(TreadmillMath.clock(Int((model.legTimeRemaining ?? 0).rounded())))
                    .font(Theme.Typography.readoutHero)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var metricsRow: some View {
        let cols = [GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            ExpertCell(label: "Distancia", value: distanceString, unit: "")
            ExpertCell(label: "Tiempo", value: WorkoutSession.formatElapsed(model.legElapsedEffective), unit: "")
            ExpertCell(label: "Pulso",
                       value: model.currentBpm.map { "\($0)" } ?? "—",
                       unit: "bpm",
                       color: model.liveZone?.color ?? Theme.Color.foreground)
        }
    }

    @ViewBuilder
    private var goalSection: some View {
        if !model.isRecovery {
            switch model.currentLeg.goal {
            case let .distance(target):
                GoalProgress(caption: "Distancia del tramo",
                             primary: distString(model.legCoveredMeters),
                             secondary: distString(target),
                             fraction: model.progressFraction,
                             complete: model.progressFraction >= 1)
            case let .time(target):
                GoalProgress(caption: "Tiempo del tramo",
                             primary: TreadmillMath.clock(Int((model.legTimeRemaining ?? Double(target)).rounded())),
                             secondary: TreadmillMath.clock(target),
                             fraction: model.progressFraction,
                             complete: model.progressFraction >= 1)
            case .open:
                EmptyView()
            }
        }
    }

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

    private var autoPauseBanner: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "pause.circle.fill").font(.system(size: 16, weight: .bold))
            Text("Auto-pausa · sin movimiento")
                .font(.system(size: 13, weight: .heavy, design: .default).italic())
                .tracking(0.4)
            Spacer(minLength: 0)
            Text("Se reanuda solo").font(.system(size: 11, weight: .medium))
        }
        .foregroundStyle(Theme.Color.warning)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.warningTint, in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityLabel("Auto-pausa activada, sin movimiento; se reanuda al moverte")
    }

    // MARK: - Controls

    private var controls: some View {
        HStack(spacing: 8) {
            neutralButton(model.session.isPaused ? "REANUDAR" : "PAUSA") { model.togglePause() }
            neutralButton(model.isStructured ? "TRAMO HECHO" : "HECHO") { model.endLegNow() }
        }
        .padding(.top, 4)
    }

    private func neutralButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .heavy, design: .default).italic())
                .tracking(0.8)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity).frame(height: 66)
                .background(Theme.Color.surfaceElevated)
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    // MARK: - Formatting

    private var paceString: String {
        model.livePaceSecPerKm.map { TimeMinSecRow.format($0) } ?? "—:—"
    }
    private var distanceString: String { PrescriptionRenderer.formatDistance(model.coveredMeters) ?? "0 m" }
    private func distString(_ m: Double) -> String { PrescriptionRenderer.formatDistance(m) ?? "0 m" }

    /// The state word on the objetivo line — the mockup's natural-Spanish read of the
    /// live pace vs the band: inside, faster than prescribed, or slower.
    private func paceStateWord(_ status: TargetStatus) -> String? {
        switch status {
        case .inTarget: return "dentro"
        case .tooFast:  return "rápido"
        case .tooSlow:  return "lento"
        case .unknown:  return nil
        }
    }
}

/// The "Correr fuera" entry — the GPS sibling of TreadmillEntryButton. Offered on any
/// run leg; the outdoor screen handles a denied / weak GPS honestly (manual entry
/// stays as the fallback under it).
struct OutdoorEntryButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.medium(); action() }) {
            HStack(spacing: 8) {
                Image(systemName: "location.fill")
                    .font(.system(size: 13, weight: .heavy))
                Text("CORRER FUERA")
                    .font(.system(size: 14, weight: .heavy, design: .default).italic())
                    .tracking(0.8)
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(Theme.Color.surfaceElevated)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.accentText.opacity(0.5), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Correr fuera con GPS")
    }
}
