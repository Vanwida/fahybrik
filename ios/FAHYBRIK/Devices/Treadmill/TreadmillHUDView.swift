import SwiftUI
import UIKit

// LA PANTALLA DEL ENTRENO CUANDO CORRES EN CINTA (Bluetooth/FTMS). Hasta el 5-ago
// era un `fullScreenCover` que se abría encima de otro HUD del mismo tramo; ahora es
// una superficie viva más (`ActiveWorkoutView.superficieViva`) y es la ÚNICA que
// pinta ese tramo. Recorre la estructura de tramos con avance AUTOMÁTICO — un tramo
// por distancia se cierra solo cuando la cinta llega al objetivo y encadena con la
// recuperación / el siguiente; el botón manual sólo se adelanta. Reutiliza la
// progresión del propio entreno a través del modelo.
struct TreadmillHUDView: View {
    @State private var model: TreadmillHUDModel
    @State private var showDiagnostics = false
    #if DEBUG
    /// "Modo de control" — the field-diagnosis sheet (long-press the cinta chip).
    /// SÓLO EN DEBUG: es un volcado FTMS crudo (dialecto S1…S5, velocidades sin
    /// interpretar) y se abría con una pulsación larga EN LA APP DEL ATLETA.
    @State private var showControlDebug = false
    #endif
    /// Compact height == the phone is in landscape → switch to the big-number layout.
    @Environment(\.verticalSizeClass) private var vSizeClass
    private var isLandscape: Bool { vSizeClass == .compact }
    /// «CORRER SIN CONECTAR»: el atleta ha dicho que sigue en la cinta aunque la app
    /// no la lea. Cuando esto era un cover, ese botón bajaba el cover y devolvía al
    /// HUD genérico de correr — que ya no existe, y no debería haber existido nunca
    /// (dos pantallas para el mismo tramo). Aquí no hay a dónde volver: se pasa al
    /// HUD en vivo, que sin cinta degrada solo (reloj del tramo + objetivo + pulso,
    /// controles manuales) en vez de dejar al atleta atrapado en la guía de conexión.
    @State private var sinCinta = false
    /// Quick "Avisos de voz" (#63) toggle — shares the key with ProfileView, so the
    /// athlete can mute/unmute the coach without leaving the run.
    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true
    /// SALIR DEL ENTRENO, no «cerrar la pantalla» — misma razón que en
    /// `OutdoorRunHUDView`: sin cover propio, un `dismiss()` desde aquí se llevaría
    /// la presentación del entreno entero sin cerrar la sesión.
    let alSalir: () -> Void
    /// Cinta tonta: el atleta ya dijo que no hay Bluetooth. Se entra directo al
    /// HUD vivo (reloj indoor), no a la guía de conectar.
    init(session: WorkoutSession, hrZones: HRZoneProfile?,
         empiezaSinCinta: Bool = false, alSalir: @escaping () -> Void) {
        // The SHARED hub — so a belt connected in the brief is already live here (no
        // re-scan), and the connection outlives this surface going away and coming back.
        _model = State(initialValue: TreadmillHUDModel(session: session, hrZones: hrZones,
                                                       hub: .shared))
        _sinCinta = State(initialValue: empiezaSinCinta)
        self.alSalir = alSalir
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            VStack(spacing: Theme.Spacing.m) {
                header
                // Honest "connected but silent" state, above the hero: many FTMS
                // belts emit NOTHING until the band moves, and the readouts alone
                // can only say "esperando a la cinta" — this says what to DO about
                // it, which is the part the athlete needs. The 1 s TimelineView
                // re-evaluates the time-based staleness check; the banner drops the
                // instant a sample lands (the model's `latest` mutation re-renders).
                if model.treadmillLink.isLive, !model.isCountIn {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        if model.telemetrySilent { treadmillNoDataHint }
                    }
                }
                if !model.treadmillLink.isLive && !sinCinta {
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
            // La pantalla despierta la lleva WorkoutContainer por fase (dueño
            // único); el flag suelto que se re-afirmaba aquí ya no hace falta.
        }
        .onDisappear { model.teardown() }
        // AQUÍ VIVÍAN TRES AUTO-CIERRES (`dismissIfLeftRun`, terminar, puerta de
        // bloque). Sólo servían para bajar el cover cuando la sesión salía de correr;
        // ahora el reparto lo hace `ActiveWorkoutView.superficieViva`, que deja de
        // resolver a esta vista en ese mismo instante y su desmontaje ya llama a
        // `teardown()`.
        .sheet(isPresented: $showDiagnostics) {
            if let text = model.diagnosticsText { ShareSheet(items: [text]) }
        }
        #if DEBUG
        .sheet(isPresented: $showControlDebug) {
            TreadmillControlDebugSheet(model: model)
        }
        #endif
    }

    // MARK: - Header (chips + close)

    private var header: some View {
        HStack(spacing: 6) {
            headerChip(icon: "figure.run", text: cintaChipText,
                       link: model.treadmillLink, channel: model.treadmillChannel,
                       // MANTENIDO PULSADO en el chip de la cinta = "Modo de control",
                       // el diagnóstico de campo. SÓLO EN DEBUG: en la app del atleta
                       // una pulsación larga de 0,6 s abría un volcado FTMS crudo, que
                       // no es una pantalla de producto (5-ago).
                       onLongPress: gestoDeDiagnostico)
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
            Button(action: { alSalir() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Salir del entreno")
        }
    }

    /// El gesto de diagnóstico, o nada. En Release devuelve nil y el chip se queda
    /// sin pulsación larga: la hoja de depuración no se compila.
    private var gestoDeDiagnostico: (() -> Void)? {
        #if DEBUG
        return model.controlCapability.hasControlPoint ? { showControlDebug = true } : nil
        #else
        return nil
        #endif
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
    /// La palabra del chip cuando no hay nombre de aparato que enseñar. `.connected`
    /// SIEMPRE trae nombre (`deviceName`), así que sólo cae aquí por `.idle`: nadie ha
    /// empezado a buscar todavía. Eso se dice, no se pinta un guion — y el chip es
    /// además el sitio donde se arregla, que se abre de un toque.
    private var cintaStateWord: String {
        switch model.treadmillLink {
        case .scanning, .connecting: return "buscando"
        case .lost:                  return "se perdió"
        case .unavailable, .failed:  return "sin señal"
        case .idle, .connected:      return "sin conectar"
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
        case .idle, .connected:      return "sin conectar"
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

    /// The subject is the athlete's PACE against his objective; under it only what earns
    /// its place — pulso, zona, y los metros del tramo con su barra. Whatever height is
    /// left over goes to the subject (the hero centres in it) instead of pooling as a gap
    /// above the action, which stays anchored at the thumb.
    private var liveHUD: some View {
        GeometryReader { geo in
            ScrollView(showsIndicators: false) {
                VStack(spacing: Theme.Spacing.m) {
                    legHeader
                    heroSection
                    controlPanel
                    hrAndZoneRow
                    progressSection
                    guideReference
                }
                .padding(.bottom, 4)
                .frame(minHeight: geo.size.height, alignment: .top)
            }
        }
        .safeAreaInset(edge: .bottom) { controls }
    }

    // MARK: - Landscape live HUD (#6 — big numbers when the phone is rotated)

    /// Landscape split: the belt's REAL speed fills the left half (reads at 5 m), and the
    /// controls + a compact metric strip + START/STOP sit on the right. Only for the
    /// running state — recovery / count-in / connecting keep their centered portrait
    /// states, which read fine rotated.
    private var landscapeLiveHUD: some View {
        let sujeto = landscapeSubject
        return HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                Text(landscapeLegLine)
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .tracking(0.4)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(sujeto.cifra)
                    .font(.system(size: 112, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text(sujeto.unidad)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
                if let motivo = sujeto.motivo {
                    Text(motivo)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                Spacer(minLength: 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 8) {
                if model.canControlSpeed {
                    stepperCard(label: "Velocidad objetivo",
                                value: Formato.esDecimal(model.targetSpeedKmh, siempreDecimales: true), unit: "km/h",
                                down: { model.nudgeSpeed(-1) }, up: { model.nudgeSpeed(1) })
                }
                if model.canControlIncline {
                    stepperCard(label: model.inclineControlLabel,
                                value: model.inclineControlValue, unit: model.inclineControlUnit,
                                down: { model.nudgeIncline(-1) }, up: { model.nudgeIncline(1) })
                }
                if model.speedIsManual { manualSpeedNote }
                landscapeMetrics
                landscapeBottomBar
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxHeight: .infinity)
        .padding(.vertical, 2)
    }

    /// When the app drives the belt's speed the subject is that speed (it's the dial the
    /// athlete is turning); otherwise it is his pace, the running metric. Either way it is
    /// the belt's REAL reading, never the target we asked for — y cuando esa lectura no
    /// existe se baja a `sinRitmo` con el motivo debajo, nunca a un guion de 112 pt.
    ///
    /// La velocidad SÍ se pinta en cero: una cinta que dice "voy a 0" está midiendo (§6.2
    /// bis). El ritmo no, porque a velocidad cero el ritmo no existe (no es 0, es nada).
    private var landscapeSubject: (cifra: String, unidad: String, motivo: String?) {
        if model.canControlSpeed {
            if let kmh = model.displaySpeedKmh {
                return (Formato.esDecimal(kmh, siempreDecimales: true), "km/h · real en la cinta", nil)
            }
        } else if let ritmo = heroPace {
            return (ritmo, "/km · ritmo real", nil)
        }
        let caida = sinRitmo
        return (caida.cifra, caida.etiqueta.lowercased(), model.sinLecturaMotivo)
    }

    private var landscapeLegLine: String {
        var line = "Tramo \(model.legNumber) de \(model.legTotal)"
        if let remaining = model.session.tramoWorkRemaining, remaining > 0 {
            line += " · quedan \(Formato.clock(remaining, anchoFijo: true))"
        } else if let objetivo = model.runTarget.objetivoLabel {
            line += " · objetivo \(objetivo)"
        }
        return line
    }

    private var landscapeMetrics: some View {
        HStack(spacing: 8) {
            ExpertCell(label: "Metros", value: distString(model.coveredMeters), unit: "")
            ExpertCell(label: "Tiempo", value: Formato.clock(Int(model.legElapsedEffective)), unit: "")
            // Metros y tiempo los sabe la app siempre; el pulso viene de fuera y puede
            // no estar. Entonces la celda dice POR QUÉ, no una raya (§7).
            ExpertCell(label: "Pulso",
                       value: model.currentBpm.map { "\($0)" }, unit: Vocab.ppm,
                       color: model.liveZone?.color ?? Theme.Color.foreground,
                       ausente: model.sinPulsoMotivo)
        }
    }

    @ViewBuilder
    private var landscapeBottomBar: some View {
        HStack(spacing: 8) {
            if model.canControlSpeed {
                if model.beltMoving {
                    stopButton { model.stopBelt() }
                } else {
                    startButton { model.startBelt() }
                }
            } else {
                BotonVivo(titulo: "TERMINAR TRAMO") { model.endLegNow() }
            }
        }
    }

    // MARK: - Machine control panel (steppers / read-only note)

    /// A stepper per axis THIS machine declared it accepts — speed and incline judged
    /// separately, so a belt that takes one and refuses the other shows exactly one.
    /// Nothing at all otherwise: the whole section resolves to an EmptyView so it doesn't
    /// even leave a spacing gap behind. The values here are the TARGETS we command; the
    /// belt's own reading lives once, under the hero.
    @ViewBuilder
    private var controlPanel: some View {
        if model.canControlSpeed || model.canControlIncline {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    if model.canControlSpeed {
                        stepperCard(label: "Velocidad objetivo",
                                    value: Formato.esDecimal(model.targetSpeedKmh, siempreDecimales: true), unit: "km/h",
                                    down: { model.nudgeSpeed(-1) }, up: { model.nudgeSpeed(1) })
                    }
                    if model.canControlIncline {
                        stepperCard(label: model.inclineControlLabel,
                                    value: model.inclineControlValue, unit: model.inclineControlUnit,
                                    down: { model.nudgeIncline(-1) }, up: { model.nudgeIncline(1) })
                    }
                }
                // Half the machine answers to the app and half doesn't → say which.
                if model.speedIsManual { manualSpeedNote }
            }
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

    /// The calm, one-line honest state for a belt whose firmware won't take a speed target
    /// over Bluetooth (the incline stepper stays live beside it). Muted, never a red error —
    /// the athlete sets speed on the console and we keep reading his real pace.
    private var manualSpeedNote: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "speedometer")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("Pon la velocidad en la cinta. Tu modelo no la deja controlar por Bluetooth; la inclinación sí.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// What the coach PRESCRIBED for this tramo (#61) — inclinación / cadencia. Named as a
    /// request ("el coach pide") so it can never be misread as the belt's own reading in
    /// the hero above; nobody sets the belt for the athlete, so this is what he matches by
    /// hand on the console. Hidden when the coach set none.
    @ViewBuilder
    private var guideReference: some View {
        let parts: [String] = {
            var p: [String] = []
            if let inc = model.prescribedInclinePct, inc > 0 {
                p.append("inclinación \(Formato.esDecimal(inc)) %")
            }
            if let cad = model.prescribedCadenceSpm { p.append("cadencia \(cad) \(Vocab.cadencia)") }
            return p
        }()
        if !parts.isEmpty {
            Text("El coach pide " + parts.joined(separator: " y "))
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

    /// The screen's subject, centred in whatever height the rest of the stack doesn't need.
    private var heroSection: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            heroCard
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity)
    }

    @ViewBuilder
    private var heroCard: some View {
        if model.isRecovery {
            recoveryHero
        } else {
            paceHero
        }
    }

    /// Una recuperación con cuenta atrás enseña lo que QUEDA. Una recuperación abierta
    /// (sin `rest_s` prescrito) no tiene cuenta atrás que enseñar, y un «0:00» ahí es un
    /// reloj que nadie ha puesto (§7): entonces manda el tiempo que LLEVAS, que la app sí
    /// sabe siempre. El rótulo cambia con la cifra, o el número estaría mintiendo.
    private var recoveryHero: some View {
        let restante = model.legTimeRemaining
        return CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 8) {
                LabelText(text: restante != nil ? "Recuperación" : "Llevas recuperando", size: 10)
                Text(Formato.clock(restante ?? model.legElapsedEffective))
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
                beltReadings
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// EL SUJETO de la tarjeta. Con ritmo medido, el ritmo y su veredicto; sin él, la
    /// siguiente verdad disponible y el PORQUÉ de que no haya ritmo.
    ///
    /// El objetivo, y al lado la velocidad que hay que MARCAR en la consola.
    ///
    /// El coach prescribe en ritmo, que es su idioma; la cinta se marca en km/h, que
    /// es el de la máquina. Mientras la cinta no acepte que la app le fije la
    /// velocidad —hoy no lo hace ninguna de las que hemos encontrado— la cuenta la
    /// hace el atleta a mano y sudando, y equivocarla es correr otra sesión. Se la
    /// damos hecha, redondeada al escalón que su consola admite de verdad.
    ///
    /// Sólo cuando le toca marcarla a él: si la app pudiera fijar la velocidad,
    /// darle un número que teclear sería ruido.
    private func objetivoConMarca(_ objetivo: String) -> String {
        guard !model.canControlSpeed,
              let marca = model.runTarget.velocidadDeCinta(step: model.escalonDeVelocidad)
        else { return "Objetivo \(objetivo)" }
        return "Objetivo \(objetivo) · pon \(marca)"
    }

    /// Rótulo y cifra viajan JUNTOS a propósito: poner «Ritmo» encima de un cronómetro
    /// es mentir igual (§7), y es el error más difícil de ver porque cada mitad, por su
    /// cuenta, es correcta. Y sin medida no hay veredicto: el borde de color y el «vas
    /// rápido» se apagan, porque juzgaban un número que ya no está.
    private var paceHero: some View {
        let ritmo = heroPace
        let status = model.heroStatus
        let juzga = ritmo != nil && status != .unknown
        return CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 6) {
                LabelText(text: ritmo != nil ? heroCaption : sinRitmo.etiqueta, size: 10)
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text(ritmo ?? sinRitmo.cifra)
                        .font(Theme.Typography.readoutHero)
                        .foregroundStyle(juzga ? status.color : Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    // La unidad viaja con SU cifra: «/km» debajo de un cronómetro
                    // convertiría el reloj del tramo en un ritmo que nadie ha medido.
                    if ritmo != nil {
                        Text(Formato.UnidadRitmo.porKm.rawValue)
                            .font(Theme.Typography.readoutLabel)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                if ritmo != nil, let objetivo = model.runTarget.objetivoLabel {
                    HStack(spacing: 8) {
                        // El objetivo va en RITMO, que es el idioma del coach; la consola
                        // se marca en km/h, que es el idioma de la máquina. Mientras la
                        // cinta no acepte que la app le fije la velocidad —hoy, ninguna—
                        // el atleta hace la cuenta a mano y sudando. Se la damos hecha, y
                        // sólo cuando le toca marcarla a él: si la app pudiera fijarla,
                        // decirle un número sería ruido.
                        Text(objetivoConMarca(objetivo))
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                        if let cue = status.cue {
                            Text(cue.uppercased())
                                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                                .tracking(0.6)
                                .foregroundStyle(status.color)
                        }
                    }
                } else if ritmo == nil {
                    Text(model.sinLecturaMotivo)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
                beltReadings
            }
            .frame(maxWidth: .infinity)
        }
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(juzga ? status.color.opacity(0.75) : Color.clear, lineWidth: 2)
        )
    }

    /// What the BELT ITSELF says it is doing, under the pace it produces and nowhere else
    /// on the screen. Same measurement as the hero in the units of the machine's own dial,
    /// so the athlete can match the console without a second "velocidad" contradicting the
    /// first. Absent until the belt sends something — never a row of dashes.
    @ViewBuilder
    private var beltReadings: some View {
        if let line = beltReadingLine {
            Text(line)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, 2)
        }
    }

    private var beltReadingLine: String? {
        var parts: [String] = []
        if let kmh = model.displaySpeedKmh, kmh > 0 {
            parts.append("\(Formato.esDecimal(kmh)) km/h en la cinta")
        }
        if let incline = model.liveInclineText { parts.append(incline) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Pulso y zona. El pulso dice lo que mide o POR QUÉ no mide; la zona, cuando no
    /// existe, DESAPARECE.
    ///
    /// Antes eran dos celdas fijas con un guion cada una. Pero no son el mismo caso: al
    /// pulso le falta un aparato y eso el atleta lo arregla de un toque en el chip de
    /// arriba, así que se declara (§6.2 bis); la zona sin umbral no la arregla nadie a
    /// mitad de un tramo, así que se calla — y callarse es quitar la celda, no dejar el
    /// hueco con una raya dentro. Sin zona, el pulso se queda el ancho entero.
    private var hrAndZoneRow: some View {
        // HStack y no la rejilla de dos columnas que había: con la zona ausente, una
        // rejilla deja media fila en blanco, que es el mismo hueco con otra cara.
        HStack(alignment: .top, spacing: 8) {
            ExpertCell(
                label: "Pulso",
                value: model.currentBpm.map { "\($0)" },
                unit: Vocab.ppm,
                color: model.liveZone?.color ?? Theme.Color.foreground,
                ausente: model.sinPulsoMotivo
            )
            if let zone = model.liveZone {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: Vocab.zona, size: 11)
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
            }
        }
    }

    /// Where the athlete is inside this tramo: covered metres against the target with its
    /// bar, and the tramo clock in the same card — one card answers "how far" and "how
    /// long", so neither needs a tile of its own. An OPEN leg keeps the card (there is
    /// still distance and time to show) and simply has no bar to fill.
    @ViewBuilder
    private var progressSection: some View {
        if !model.isRecovery {
            let clock = Formato.clock(Int(model.legElapsedEffective))
            switch model.currentLeg.goal {
            case let .distance(target):
                GoalProgress(
                    caption: "Distancia del tramo",
                    primary: distString(model.coveredMeters),
                    secondary: distString(target),
                    elapsed: clock,
                    fraction: model.progressFraction,
                    complete: model.isComplete
                )
            case let .time(target):
                // The primary readout IS the clock here (time remaining), so no second one.
                GoalProgress(
                    caption: "Tiempo del tramo",
                    primary: Formato.clock(Int((model.legTimeRemaining ?? Double(target)).rounded())),
                    secondary: Formato.clock(target),
                    fraction: model.progressFraction,
                    complete: model.isComplete
                )
            case .open:
                GoalProgress(
                    caption: "Llevas en el tramo",
                    primary: distString(model.coveredMeters),
                    secondary: nil,
                    elapsed: clock,
                    fraction: nil,
                    complete: false
                )
            }
        }
    }

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: 8) {
            if let notice = model.controlNotice {
                // The machine refused something → this is EXACTLY the moment the control
                // dialect is in question, so the way into the diagnosis is right here
                // instead of only behind the long-press. En Release el atleta lee el
                // aviso y nada más: el volcado FTMS es una herramienta de campo nuestra.
                HStack(spacing: 8) {
                    Text(notice)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.danger)
                    #if DEBUG
                    Button(action: { Haptics.light(); showControlDebug = true }) {
                        Text("Modo de control")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    .buttonStyle(PressScaleStyle())
                    #endif
                }
                .frame(maxWidth: .infinity)
            }
            HStack(spacing: 8) {
                if model.canControlSpeed {
                    // The belt takes start/stop/speed → START when stopped, big STOP when moving.
                    if model.beltMoving {
                        BotonVivo(titulo: model.paused ? "REANUDAR" : "PAUSA") { model.togglePause() }
                        stopButton { model.stopBelt() }
                    } else {
                        startButton { model.startBelt() }
                        BotonVivo(titulo: "TERMINAR TRAMO") { model.endLegNow() }
                    }
                } else {
                    // Manual-speed belt (athlete starts/stops on the console) OR read-only →
                    // the app runs the workout flow, never a belt button that would do nothing.
                    BotonVivo(titulo: model.paused ? "REANUDAR" : "PAUSA") { model.togglePause() }
                    BotonVivo(titulo: "TERMINAR TRAMO AHORA") { model.endLegNow() }
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

    // MARK: - Connected-but-silent hint (mirror of the erg's "sin datos" banner)

    private var treadmillNoDataHint: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.warning)
                Text("Conectada, pero la cinta no envía datos. Ponla en marcha desde la consola: algunas solo emiten con la banda en movimiento.")
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
            // «Correr sin conectar» — ver `sinCinta`: se sigue en ESTA pantalla, que
            // sin cinta enseña lo que sí se sabe. No hay otro HUD al que volver.
            onSkip: {
                Haptics.light()
                model.session.runEnvironment = .indoor
                model.session.ensurePhoneWorkoutRun()
                sinCinta = true
            },
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

    /// Ritmo MEDIDO: cinta o HK indoor de la sesión. nil = no hay fuente.
    private var heroPace: String? {
        model.heroPaceSecPerKm.map { Formato.ritmoCifras(Double($0)) }
    }

    /// Sin cinta y sin reloj el héroe no finge el ritmo del plan.
    private var sinRitmo: (etiqueta: String, cifra: String) {
        (Vocab.ritmo, Vocab.sinFuente)
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
        case let .time(s):     parts.append(Formato.clock(s))
        case .open:            break
        }
        if let objetivo = model.runTarget.objetivoLabel { parts.append(objetivo) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
    /// La distancia CUBIERTA es un contador, y un contador se pinta en cero (§6.2 bis):
    /// «0 m» al empezar el tramo no es un hueco, es la verdad.
    private func distString(_ m: Double) -> String {
        Formato.distanciaCubierta(m) ?? "0 m"
    }
}
