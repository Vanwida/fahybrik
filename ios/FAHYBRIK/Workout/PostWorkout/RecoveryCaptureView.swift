import SwiftUI

// Tests guiados — the post-effort RECOVERY measurement screen. Shown by
// WorkoutContainer between the live effort and the summary when the test's
// contract asks for an `hrr` result. The athlete does NOTHING: the session's
// recovery window (HRRecoveryCapture) keeps ingesting the live pulse and this
// screen shows the countdown to the 60 s mark + the live bpm. Cancelable at any
// moment ("Saltar" — the measurement is then omitted, never an error); once the
// 60 s band is consolidated it flips to the measured drop and a "Continuar"
// button; at 90 s it advances by itself.
struct RecoveryCaptureView: View {
    let session: WorkoutSession
    /// Fired exactly once — skip, continue, or the 90 s auto-close.
    let onDone: () -> Void

    /// The band-complete moment: 60 s mark + the +5 s tolerance tail. From here
    /// the measurement is final and the athlete can continue.
    private static let bandCompleteSeconds: Double
        = HRRecoveryCapture.hr60OffsetSeconds + HRRecoveryCapture.hr60ToleranceSeconds

    /// Phone-side HealthKit HR reader for the window — the watch mirror keeps
    /// streaming on its own; this covers the no-mirror case (strap-less athlete
    /// whose watch still writes HR samples). Started only when no wrist mirror
    /// is active, exactly like ActiveWorkoutView.
    @State private var liveHR = LiveHeartRateProvider()
    /// El dial crece con el texto del sistema: la cuenta de 80 pt tiene que caber dentro del aro.
    @ScaledMetric(relativeTo: .largeTitle) private var ladoDelDial: CGFloat = 200
    /// Hasta aquí: la cuenta ya tiene tope (×1,3) y un aro más ancho que la pantalla no se ve entero.
    private static let ladoMaximoDelDial: CGFloat = 280
    @State private var finished = false

    private var anchor: Date { session.finishedAt ?? Date() }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            TimelineView(.periodic(from: .now, by: 0.5)) { context in
                let elapsed = context.date.timeIntervalSince(anchor)
                VStack(spacing: 0) {
                    HStack {
                        Text("Test · Recuperación")
                            .papel(.kicker)
                            .foregroundStyle(Theme.Color.accentText)
                        Spacer()
                    }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.l)

                    Spacer()

                    VStack(spacing: Theme.Spacing.xl) {
                        header(elapsed: elapsed)
                        dial(elapsed: elapsed)
                        pulseReadout
                    }
                    .padding(.horizontal, Theme.Spacing.pantalla)

                    Spacer()

                    actionButton(elapsed: elapsed)
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.bottom, Theme.Spacing.xl)
                }
            }
        }
        .onAppear {
            // La pantalla despierta la lleva WorkoutContainer por fase. Gestionarla
            // aquí con onAppear/onDisappear propios era una carrera: en el relevo
            // .active → .recovery el onAppear de esta vista podía ejecutarse ANTES
            // del onDisappear de ActiveWorkoutView, y su false final dejaba la
            // pantalla durmiéndose a mitad de la medición.
            if !PhoneLiveSession.shared.hasMirroredHKSession {
                liveHR.onSample = { [weak session] bpm in
                    session?.injectLiveHR(bpm, source: .healthkit)
                }
                liveHR.start(from: anchor)
            }
        }
        .onDisappear {
            liveHR.stop()
        }
        .task {
            // Auto-close when the 90 s window ends (the engine stops accepting
            // samples then anyway). Sleep the exact remainder, not a fixed 90 —
            // the view can appear a beat after the finish.
            let remaining = HRRecoveryCapture.windowSeconds - Date().timeIntervalSince(anchor)
            if remaining > 0 {
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }
            complete()
        }
    }

    // MARK: - Copy per phase

    @ViewBuilder
    private func header(elapsed: Double) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            Text("Midiendo tu recuperación")
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle(elapsed: elapsed))
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func subtitle(elapsed: Double) -> String {
        if elapsed < HRRecoveryCapture.hr60OffsetSeconds {
            return "Para y respira. No toques nada: registramos cuánto baja tu pulso en 60 segundos."
        }
        if elapsed < Self.bandCompleteSeconds {
            return "Consolidando la marca de 60 segundos…"
        }
        if let drop = session.hrRecovery?.hrr60 {
            return "Tu pulso ha bajado \(drop) \(Vocab.ppm) en el primer minuto. Registrado."
        }
        return "Sin señal de pulso suficiente — esta vez la recuperación se omite."
    }

    // MARK: - Countdown dial (to the 60 s mark)

    @ViewBuilder
    private func dial(elapsed: Double) -> some View {
        let mark = HRRecoveryCapture.hr60OffsetSeconds
        let progress = min(1, max(0, elapsed / mark))
        ZStack {
            Circle()
                .stroke(Theme.Color.hairlineStrong, lineWidth: 8)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Theme.Color.accent, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.5), value: progress)
            if elapsed < mark {
                VStack(spacing: 2) {
                    Text("\(Int((mark - elapsed).rounded(.up)))")
                        .papel(.cuenta)
                        .foregroundStyle(Theme.Color.foreground)
                        .contentTransition(.numericText(countsDown: true))
                    Text("Segundos")
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else if let drop = session.hrRecovery?.hrr60 {
                VStack(spacing: 2) {
                    Text("−\(drop)")
                        .papel(.cuenta)
                        .foregroundStyle(Theme.Color.ok)
                    // El pulso se escribe en ppm (CONTRATO-UI §3): aquí ponía «BPM».
                    Text("\(Vocab.ppm) en 60 s")
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                Image(systemName: elapsed < Self.bandCompleteSeconds ? "waveform.path.ecg" : "minus")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(width: min(ladoDelDial, Self.ladoMaximoDelDial), height: min(ladoDelDial, Self.ladoMaximoDelDial))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(subtitle(elapsed: elapsed))
    }

    // MARK: - Live pulse

    private var pulseReadout: some View {
        HStack(spacing: 10) {
            Image(systemName: "heart.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .symbolEffect(.pulse, options: .repeating, isActive: session.liveHRBpm != nil)
            if let bpm = session.liveHRBpm {
                HStack(alignment: .lastTextBaseline, spacing: 5) {
                    Text("\(bpm)")
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.foreground)
                        .contentTransition(.numericText())
                    Text(Vocab.ppm)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                Text("Sin señal de pulso")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(session.liveHRBpm.map { "Pulso \($0) por minuto" } ?? "Sin señal de pulso")
    }

    // MARK: - Action

    @ViewBuilder
    private func actionButton(elapsed: Double) -> some View {
        if elapsed >= Self.bandCompleteSeconds {
            AccionAncladaResumen(titulo: "Continuar") { complete() }
        } else {
            // Saltar abandona la medida (se omite, nunca es un error): la ejecución se guarda
            // igual por el flujo normal justo después.
            BotonContornoResumen(titulo: "Saltar") { complete() }
        }
    }

    private func complete() {
        guard !finished else { return }
        finished = true
        onDone()
    }
}
