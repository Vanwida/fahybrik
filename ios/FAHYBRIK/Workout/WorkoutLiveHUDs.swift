import SwiftUI

// LECTURAS del live, no cromo. `RunLiveHUD` y las listas estructurales son el
// SUJETO dentro de `HostVivo` / `MarcoVivo`. El cromo y la acción viven en
// `LenguajeVivoUI` (`BotonVivo`). Un fork de cromo por formato es deuda.
//
// Lo que ya NO vive aquí, y por qué:
//   • El EMOM y el hierro montan su propio `MarcoVivo` (`Workout/Vivo/`).
//   • El ergo es `ErgHUDContent` (Devices/PM5): la lectura de la máquina,
//     también dentro del mismo marco. Vertical y horizontal, el mismo sujeto.
//
// Todas leen `WorkoutSession` + `PM5ConnectionStore` como fuentes únicas — sin
// estado duplicado. Tokens de Theme/Atoms.

// MARK: - Shared center metric (big glanceable hero value)

/// The signature erg-monitor / race-clock readout: a big TRUE-MONOSPACE tabular
/// number (`readoutHero`) on a sunken instrument well, with a tracked-uppercase
/// micro-label above and a small mono unit. The mono voice holds the digit
/// column rock-steady as the value ticks — the PM5 / Whoop readout feel. Fixed
/// size (no reflow at large Dynamic Type); the labels around it scale instead.
///
/// A subtle, cheap value-change emphasis (a brief accent bloom) fires when the
/// displayed value changes, so the screen reads as *alive* mid-effort.
private struct CenterMetric: View {
    let value: String
    let unit: String
    let caption: String
    var color: Color = Theme.Color.foreground
    /// Hero gets the largest readout + accent rail; secondary readouts sit smaller.
    var hero: Bool = true

    @State private var pulse: Bool = false

    var body: some View {
        VStack(spacing: 6) {
            LabelText(text: caption, size: 10)
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(value)
                    .font(hero ? Theme.Typography.readoutHero : Theme.Typography.readoutL)
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .shadow(color: color.opacity(pulse ? 0.55 : 0), radius: pulse ? 14 : 0)
                    .scaleEffect(pulse ? 1.012 : 1.0)
                if !unit.isEmpty {
                    Text(unit)
                        .font(Theme.Typography.readoutLabel)
                        .tracking(0.5)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, hero ? Theme.Spacing.m : Theme.Spacing.s)
        // Value-change emphasis: a fast bloom-in, slow settle. Drives off the
        // displayed string so any ticking metric (split, watts, pace) pulses.
        .onChange(of: value) { _, _ in
            withAnimation(.easeOut(duration: 0.10)) { pulse = true }
            withAnimation(.easeIn(duration: 0.55).delay(0.10)) { pulse = false }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(caption), \(value) \(unit)")
    }
}

// MARK: - Run HUD

struct RunLiveHUD: View {
    let session: WorkoutSession
    /// GPS availability so the HUD shows a live covered-pace hero when phone GPS
    /// is feeding distance, or a manual distance stepper when it isn't.
    var gpsActive: Bool = false
    /// Opens the live treadmill HUD (#60). Offered on every run leg; the treadmill
    /// screen itself handles the "no compatible treadmill found" case honestly.
    var onTapTreadmill: (() -> Void)? = nil
    /// Opens the live OUTDOOR GPS HUD (#64) — the sibling of the treadmill entry for
    /// running outside (map + GPS pace + auto-pause).
    var onTapOutdoor: (() -> Void)? = nil

    @State private var manualDistance: Double?

    private var seg: WorkoutSegment? { session.currentSegment }

    private var hasLiveDistance: Bool {
        (session.tramoRunCoveredMeters ?? session.liveRunDistanceMeters ?? 0) > 0
    }

    // A target-less run leg (no pace, no distance, no zone) with no live GPS has
    // nothing measurable to display. Switch it to the coach's effort/duration
    // guidance instead (e.g. a warmup "8 min RPE 3").
    private var isGuidanceOnly: Bool {
        !hasLiveDistance
            && seg?.targetPaceSecondsPerKm == nil
            && seg?.targetDistanceMeters == nil
            && seg?.targetZone == nil
    }

    var body: some View {
        let lectura = lecturaDelSujeto
        VStack(spacing: 12) {
            CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
                CenterMetric(
                    value: lectura.valor,
                    unit: lectura.unidad,
                    caption: lectura.etiqueta,
                    color: hasLiveDistance ? Theme.Color.accentText : Theme.Color.foreground,
                    hero: true
                )
            }

            // Las lecturas de servicio. `ApoyoVivo` es el §7 hecho pieza: cuando no
            // hay medida NO pinta un hueco, pinta la RAZÓN de que no la haya, que es
            // lo único accionable mientras corres.
            let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
            LazyVGrid(columns: cols, spacing: 4) {
                if isGuidanceOnly {
                    // Un tramo guiado no mide distancia ni zona: enseña la dosis que
                    // pidió el coach y los dos relojes, que sí se saben.
                    ApoyoVivo(etiqueta: "Duración", valor: seg?.durationGuidance ?? "Libre")
                    apoyoDelReloj
                    apoyoDelPulso
                    ApoyoVivo(etiqueta: Vocab.total,
                              valor: Formato.clock(session.elapsedSeconds, anchoFijo: true))
                } else {
                    // Distancia: lo cubierto cuando el GPS mide, si no el objetivo del
                    // coach. Un tramo sin ninguna de las dos NO deja celda vacía: no
                    // hay hueco que declarar donde nunca hubo dato (§6.2 bis).
                    if hasLiveDistance,
                       let d = session.tramoRunCoveredMeters ?? session.liveRunDistanceMeters,
                       let cubierta = Formato.distanciaCubierta(d) {
                        ApoyoVivo(etiqueta: Vocab.distancia, valor: cubierta)
                    } else if let d = seg?.targetDistanceMeters, let objetivo = Formato.distancia(d) {
                        ApoyoVivo(etiqueta: Vocab.objetivo, valor: objetivo)
                    }
                    apoyoDelReloj
                    apoyoDelPulso
                    apoyoDeLaZona
                }
            }

            // Live treadmill (#60): connect over Bluetooth (FTMS) for real pace vs
            // objetivo, speed/incline, and per-leg distance. The manual stepper below
            // stays as the fallback with no compatible belt.
            if let onTapTreadmill {
                TreadmillEntryButton(action: onTapTreadmill)
            }
            if let onTapOutdoor {
                OutdoorEntryButton(action: onTapOutdoor)
            }

            // No GPS → the athlete logs the distance they covered so the segment
            // still produces a real distance/pace (target distance is shown above
            // as the goal, this records the actual). Pre-fill nothing — covered ≠ target.
            if !gpsActive {
                ManualStepperField(
                    label: "Distancia recorrida",
                    unit: "m",
                    value: $manualDistance,
                    step: 50,
                    seedOnFirstTap: session.currentSegment?.targetDistanceMeters ?? 0,
                    whole: true
                )
                .onChange(of: manualDistance) { _, new in
                    session.manualRunDistanceMeters = new
                }
                .onChange(of: session.currentSegmentIndex) { _, _ in
                    manualDistance = nil   // reset for the next segment
                }
            }
        }
    }

    // MARK: El sujeto — la SIGUIENTE VERDAD DISPONIBLE, nunca un hueco

    /// Qué cifra manda esta pantalla. El ritmo sale del MOTOR
    /// (`session.liveCoveredPaceSecPerKm`). Sin medida y con un ritmo prescrito
    /// NO se pinta el plan como héroe: se dice que no hay fuente.
    private var sujeto: RunLiveHero {
        RunLiveHero.resolve(
            isGuidanceOnly: isGuidanceOnly,
            effortGuidance: seg?.effortGuidance,
            livePaceSecPerKm: session.liveCoveredPaceSecPerKm,
            hasLiveDistance: hasLiveDistance,
            hasPacePrescription: seg?.targetPaceSecondsPerKm != nil,
            lapElapsed: session.lapElapsedSeconds
        )
    }

    /// Etiqueta y cifra viajan JUNTAS a propósito: cuando eran dos decisiones
    /// separadas la pantalla acababa poniendo «Ritmo» encima de un cronómetro, y
    /// mentir con la etiqueta es mentir igual (§7).
    private var lecturaDelSujeto: (etiqueta: String, valor: String, unidad: String) {
        let porKm = Formato.UnidadRitmo.porKm.rawValue
        switch sujeto {
        case let .esfuerzo(v):      return ("Esfuerzo objetivo", v, "")
        case let .ritmoMedido(p):
            let etiqueta = gpsActive ? "\(Vocab.ritmo) · GPS" : Vocab.ritmo
            return (etiqueta, Formato.ritmoCifras(Double(p)), porKm)
        case .sinFuente:            return (Vocab.ritmo, Vocab.sinFuente, "")
        case let .relojDeVuelta(s): return (Vocab.vuelta, Formato.clock(s, anchoFijo: true), "")
        }
    }

    // MARK: Los apoyos

    /// El reloj de apoyo. Cuando el sujeto YA es la vuelta, aquí va el total:
    /// repetir el mismo cronómetro dos veces no es un dato más.
    @ViewBuilder
    private var apoyoDelReloj: some View {
        if case .relojDeVuelta = sujeto {
            ApoyoVivo(etiqueta: Vocab.total,
                      valor: Formato.clock(session.elapsedSeconds, anchoFijo: true))
        } else {
            ApoyoVivo(etiqueta: Vocab.vuelta,
                      valor: Formato.clock(session.lapElapsedSeconds, anchoFijo: true))
        }
    }

    /// El pulso, teñido de su zona. Sin pulsómetro no hay medida y se dice por qué.
    private var apoyoDelPulso: some View {
        ApoyoVivo(etiqueta: Vocab.fc,
                  valor: session.liveHRBpm.map { "\($0)" },
                  unidad: Vocab.ppm,
                  tono: session.liveZone?.color ?? Theme.Color.foreground,
                  ausente: "sin reloj")
    }

    /// La zona: la que pidió el coach, si no la que estás pisando, si no la razón.
    /// Sin pulso no hay nada que clasificar; con pulso pero sin bandas ancladas, no
    /// hay dónde clasificarlo. Son dos huecos distintos y se dicen distinto.
    private var apoyoDeLaZona: some View {
        let zona = seg?.targetZone ?? session.liveZone
        return ApoyoVivo(etiqueta: Vocab.zona,
                         valor: zona?.label,
                         tono: zona?.color ?? Theme.Color.foreground,
                         ausente: session.liveHRBpm == nil ? "sin reloj" : "sin zonas")
    }
}


// MARK: - Warmup / cooldown checklist (ONE structural completion)
//
// A readable checklist of every movement in the block, looping `prescription.rounds`
// as a display guide ("Ronda X de N"). The WHOLE block is gated behind ONE button
// in ActiveWorkoutView ("Calentamiento hecho") — never per-exercise logging.

struct StructuralBlockChecklist: View {
    let segments: [WorkoutSegment]
    let phaseName: String

    // Rounds guide: the max prescribed rounds across the block's movements (a
    // warmup circuit "3 rondas"); 1 when none, so a flat list still renders.
    private var rounds: Int {
        max(1, segments.compactMap { $0.prescription?.rounds }.max() ?? 1)
    }

    var body: some View {
        CardSurface(padding: 0, topAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    LabelText(text: phaseName, size: 10)
                    Spacer()
                    if rounds > 1 {
                        Text("\(rounds) rondas")
                            .font(.system(size: 11, weight: .heavy, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

                if rounds > 1 {
                    ForEach(1...rounds, id: \.self) { r in
                        Hairline()
                        roundHeader(r)
                        movementList
                    }
                } else {
                    Hairline()
                    movementList
                }

                Hairline()
                Text("Marca el bloque entero cuando termines.")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
            }
        }
    }

    private func roundHeader(_ r: Int) -> some View {
        Text("Ronda \(r) de \(rounds)")
            .font(.system(size: 11, weight: .heavy, design: .default).italic())
            .tracking(0.6)
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 2)
    }

    private var movementList: some View {
        ForEach(segments) { seg in
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "circle")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                Text(seg.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: 6)
                if let line = seg.previewWorkLine {
                    Text(line)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Rx / Scaled toggle (metcon-family blocks)
//
// A WOD is done "as prescribed" (Rx) or "scaled". Block-scoped: set once, stamped
// onto each of the block's laps. An optional note captures HOW it was scaled.

struct RxScaledToggle: View {
    let session: WorkoutSession
    @State private var note: String = ""

    private var isScaled: Bool { session.rxScaled == "scaled" }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                segment(title: "RX", on: !isScaled) { session.rxScaled = "rx"; Haptics.light() }
                segment(title: "ESCALADO", on: isScaled) { session.rxScaled = "scaled"; Haptics.light() }
            }
            if isScaled {
                TextField("¿Cómo lo escalaste? (opcional)", text: $note)
                    .scaledFont(12, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Theme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    .onChange(of: note) { _, new in
                        session.scaledNote = new.isEmpty ? nil : new
                    }
            }
        }
        .padding(.horizontal, 4)
        .onAppear { note = session.scaledNote ?? "" }
        .onChange(of: session.currentSegmentIndex) { _, _ in note = session.scaledNote ?? "" }
    }

    private func segment(title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .heavy, design: .default).italic())
                .tracking(1)
                .foregroundStyle(on ? Theme.Color.accentOn : Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(on ? Theme.Color.accent : Theme.Color.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .stroke(on ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(title == "RX" ? "Marcar como prescrito" : "Marcar como escalado")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}


// MARK: - Live scan path after a BLE drop (FH-59)
//
// The DeviceConnection law already promises a button back into the scan after
// `.idle` / `.lost`. This is WHICH chips the live host must keep mounted so that
// button exists when the athlete returns to a station — including after a drop.
// Pure: no BLE, no views. Recovery is scan + tap on DevicePickerSheet /
// PM5LiveStreamView. Never beginBlock, never finish, never auto-reconnect.

/// What the live host mounts so a drop has a scan path without leaving live.
struct LiveDeviceScanPath: Equatable {
    /// Cinta chip in ConnectionStrip. `.lost` / `.idle` do NOT hide it.
    var showCintaChip: Bool
    /// Host `TreadmillEntryButton` while the cover is closed — even if
    /// `SuperficieViva.de == .run`. Opening the cover reaches TreadmillHUDView's
    /// existing picker; the chip itself opens DevicePickerSheet.
    var showTreadmillEntry: Bool
    /// PM5 chip + CTA for the current tramo's pool store. PM5 drop lands in
    /// `.idle` (`connectionLost` is a side flag) — still shown.
    var showPM5Chip: Bool
    /// HR chip. Never hidden when `hrSource == nil` (that was the live hole).
    var showHRChip: Bool

    /// Opening the chip is `openPicker` / the PM5 sheet. Never `beginBlock`.
    var cintaOpensPicker: Bool { showCintaChip }
    var pm5OpensSheet: Bool { showPM5Chip }
    var hrOpensPicker: Bool { showHRChip }
    var requiresBeginBlock: Bool { false }

    /// `wantsCinta` / `wantsPM5` are the TRAMO that uses the source (and the
    /// return to it). Link state is an input so tests can drop to `.lost` (cinta)
    /// or `.idle` (PM5) and assert the chip stays. State never hides a chip.
    static func offer(
        wantsCinta: Bool,
        wantsPM5: Bool,
        treadmillCoverOpen: Bool,
        treadmillLink: DeviceLink,
        pm5State: PM5ConnectionState,
        pm5ConnectionLost: Bool,
        hrLink: DeviceLink,
        hrSource: WorkoutSession.HRSource?
    ) -> LiveDeviceScanPath {
        // `.lost` (FTMS) and `.idle` (PM5 / HR) must not hide the chip.
        _ = treadmillLink
        _ = pm5State
        _ = pm5ConnectionLost
        _ = hrLink
        _ = hrSource
        return LiveDeviceScanPath(
            showCintaChip: wantsCinta,
            showTreadmillEntry: wantsCinta && !treadmillCoverOpen,
            showPM5Chip: wantsPM5,
            showHRChip: true
        )
    }
}

// MARK: - Connection / data-provenance strip
//
// A glanceable row of small chips telling the athlete (and, via the record, the
// coach) WHERE the live data comes from this segment: the erg (PM5), the heart-
// rate source, the cinta, and phone GPS on runs. Each chip is on (accent) when
// that source is live, muted when not. Tapping a machine chip opens the existing
// picker (`DevicePickerSheet` / `PM5LiveStreamView`) — including after `.lost`
// / `.idle`. HR never hides when the source drops.

struct ConnectionStrip: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore
    let gpsActive: Bool
    /// Whether the current TRAMO actually wants the erg / GPS, so we only nudge
    /// to connect where it matters (don't surface a remo chip on a Run station).
    let segmentIsErg: Bool
    let segmentIsRun: Bool
    let onTapPM5: () -> Void
    /// Remo / SkiErg / BikeErg when the tramo names a role; nil = generic PM5.
    var roleTitle: String? = nil
    var path: LiveDeviceScanPath = LiveDeviceScanPath(
        showCintaChip: false, showTreadmillEntry: false,
        showPM5Chip: false, showHRChip: true
    )
    var treadmillLink: DeviceLink = .idle
    var hrLink: DeviceLink = .idle
    var onTapCinta: (() -> Void)? = nil
    var onTapHR: (() -> Void)? = nil

    private var pm5ChipText: String {
        let name = roleTitle ?? "PM5"
        if pm5.isConnected { return name }
        if pm5.connectionLost { return "Se perdió \(name)" }
        return "Conecta \(name)"
    }

    /// Always a label — `.none` used to hide the chip, which is the live hole.
    private var hrLabel: String {
        switch session.hrSource {
        case .strap:     return "HR · Banda"
        case .healthkit: return "HR · Watch"
        case .pm5:       return "HR · PM5"
        case .none:      return hrLink == .lost ? "HR · se perdió" : "HR · conectar"
        }
    }

    /// Spoken source for VoiceOver — honest about which device records HR.
    private var hrSpokenSource: String {
        switch session.hrSource {
        case .strap:     return "la banda"
        case .healthkit: return "el reloj"
        case .pm5:       return "el PM5"
        case .none:      return "sin pulso, toca para buscar"
        }
    }

    private var cintaChipText: String {
        if let name = treadmillLink.deviceName { return "Cinta · \(name)" }
        switch treadmillLink {
        case .lost:                  return "Cinta · se perdió"
        case .scanning, .connecting: return "Cinta · buscando"
        case .unavailable, .failed:  return "Cinta · sin señal"
        case .idle, .connected:      return "Cinta · conectar"
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            if path.showCintaChip, let onTapCinta {
                Button(action: onTapCinta) {
                    DeviceChip(icon: "figure.run", text: cintaChipText, link: treadmillLink)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(treadmillLink.isLive ? "Cinta conectada" : "Buscar cinta")
                .accessibilityHint("Abre la lista para elegir una cinta")
            }
            if path.showPM5Chip || segmentIsErg {
                Button(action: onTapPM5) {
                    chip(
                        icon: "antenna.radiowaves.left.and.right",
                        text: pm5ChipText,
                        on: pm5.isConnected
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(pm5.isConnected
                    ? "\(roleTitle ?? "PM5") conectado"
                    : "Conectar \(roleTitle ?? "PM5")")
            }
            if path.showHRChip {
                Button(action: { onTapHR?() }) {
                    DeviceChip(icon: "heart.fill", text: hrLabel, link: hrChipLink)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Frecuencia cardiaca, \(hrSpokenSource)")
                .accessibilityHint("Abre la lista para elegir una banda")
            }
            if segmentIsRun {
                chip(
                    icon: "location.fill",
                    text: gpsActive ? "GPS" : "GPS off",
                    on: gpsActive
                )
                .accessibilityLabel(gpsActive ? "GPS activo" : "GPS no disponible, distancia manual")
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    /// Engine provenance paints a live chip; a dropped strap/channel stays
    /// `.lost` / `.idle` so the chip is still tappable.
    private var hrChipLink: DeviceLink {
        switch session.hrSource {
        case .strap:     return hrLink
        case .healthkit: return hrLink.isLive ? hrLink : .connected(name: "Watch")
        case .pm5:       return .connected(name: "PM5")
        case .none:      return hrLink
        }
    }

    private func chip(icon: String, text: String, on: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .bold))
            Text(text.uppercased())
                .font(.system(size: 9, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .lineLimit(1)
        }
        .foregroundStyle(on ? Theme.Color.accentText : Theme.Color.muted)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(on ? Theme.Color.accent.opacity(0.14) : Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .stroke(on ? Theme.Color.accentText.opacity(0.5) : Theme.Color.outline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
    }
}

// MARK: - Structured block / interval strip
//
// Concept2-style interval list: the prescribed segments of the current block as
// a horizontal row of chips, current highlighted, done = checked + dimmed,
// upcoming = muted. Each chip shows the per-segment target so the athlete sees
// "where am I in the structured block" and what's next.

struct BlockIntervalStrip: View {
    let segments: [WorkoutSegment]
    let currentIndex: Int
    /// Tap handler — when provided, every chip becomes a button: a future chip
    /// jumps forward (the caller confirms a skip), a past chip reopens it. Nil
    /// keeps the strip a read-only progress indicator.
    var onTap: ((Int) -> Void)? = nil

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(segments.enumerated()), id: \.element.id) { idx, seg in
                        chip(idx: idx, seg: seg).id(idx)
                    }
                }
                .padding(.horizontal, 4)
            }
            .onChange(of: currentIndex) { _, new in
                withAnimation(.easeOut(duration: 0.25)) {
                    proxy.scrollTo(new, anchor: .center)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Bloque estructurado, \(currentIndex + 1) de \(segments.count)")
    }

    @ViewBuilder
    private func chip(idx: Int, seg: WorkoutSegment) -> some View {
        if let onTap {
            Button { onTap(idx) } label: { IntervalChip(segment: seg, state: state(for: idx)) }
                .buttonStyle(PressScaleStyle())
        } else {
            IntervalChip(segment: seg, state: state(for: idx))
        }
    }

    private func state(for idx: Int) -> IntervalChip.State {
        if idx < currentIndex { return .done }
        if idx == currentIndex { return .current }
        return .upcoming
    }
}

private struct IntervalChip: View {
    enum State { case done, current, upcoming }
    let segment: WorkoutSegment
    let state: State

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                if state == .done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundStyle(Theme.Color.ok)
                }
                Text(segment.title.uppercased())
                    .font(.system(size: 10, weight: .heavy, design: .default).italic())
                    .tracking(0.4)
                    .foregroundStyle(titleColor)
                    .lineLimit(1)
            }
            // Un tramo libre no lleva prescripción que enseñar: la línea no existe,
            // no se pinta un guion debajo del título (§7).
            if let targetLine {
                Text(targetLine)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(state == .current ? Theme.Color.foreground : Theme.Color.muted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(minWidth: 96, alignment: .leading)
        .background {
            let shape = RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
            // Current leg lit with a top-down accent wash; done/upcoming sit on
            // the layered surface gradient so the strip reads as depth, not flat.
            shape.fill(
                LinearGradient(
                    colors: state == .current
                        ? [Theme.Color.accent.opacity(0.22), Theme.Color.accent.opacity(0.08)]
                        : [Theme.Color.surfaceElevated, Theme.Color.surface],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(state == .current ? Theme.Color.accentText : Theme.Color.hairline, lineWidth: state == .current ? 1.5 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .brandShadow(Theme.Shadow.cardTight)
        .opacity(state == .upcoming ? 0.55 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private var titleColor: Color {
        switch state {
        case .current: return Theme.Color.accentText
        case .done: return Theme.Color.muted
        case .upcoming: return Theme.Color.foreground
        }
    }

    // Per-segment target line, e.g. "500m · 1:50/500" (erg), "1km · 4:30/km"
    // (run), "12 × 60kg" (strength). Built from the prescription, no free text.
    // Nil for a leg the coach left free: no hay prescripción que resumir.
    private var targetLine: String? {
        let seg = segment
        var parts: [String] = []
        if let d = seg.targetDistanceMeters, let txt = Formato.distancia(d) {
            parts.append(txt)
        } else if let t = seg.targetDurationSeconds {
            // Prescripción, no cronómetro: sin cero delante.
            parts.append(Formato.clock(t))
        } else if let s = Formato.serie(reps: seg.targetReps, cargaKg: seg.loadKg) {
            // La MISMA serie se escribía de tres maneras el 29-jul («5×100 kg» aquí,
            // «5 × 100 kg» en el HUD de fuerza y otra vez distinta en el resumen).
            // Ahora hay un canónico y este chip lo consume (§2.1).
            parts.append(s.linea)
        }
        switch seg.kind {
        case .running:
            if let p = seg.targetPaceSecondsPerKm {
                parts.append(Formato.ritmo(Double(p), .porKm))
            }
            else if let z = seg.targetZone { parts.append(z.label) }
        case .rowOrSki:
            if let w = seg.targetPowerWatts { parts.append("\(w)W") }
        case .strength, .sled:
            if seg.targetReps == nil, let kg = seg.loadKg { parts.append(Formato.kg(kg)) }
        case .reps:
            break
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var accessibility: String {
        let stateWord: String
        switch state {
        case .done: stateWord = "completado"
        case .current: stateWord = "actual"
        case .upcoming: stateWord = "siguiente"
        }
        var dicho = "\(segment.title), \(stateWord)"
        if let targetLine { dicho += ", \(targetLine)" }
        return dicho
    }
}

// Compact in-workout stepper for athlete-logged values when no device measures
// them: actual load on strength/sled, covered distance on a run with no GPS.
struct ManualStepperField: View {
    let label: String
    let unit: String
    @Binding var value: Double?
    let step: Double
    var seedOnFirstTap: Double = 0
    var whole: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 11)
            HStack(spacing: 10) {
                stepButton(systemName: "minus", delta: -step)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(display)
                        .font(.system(size: 30, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if !unit.isEmpty {
                        Text(unit)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .frame(maxWidth: .infinity)
                stepButton(systemName: "plus", delta: step)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(display) \(unit)")
        .accessibilityValue(display)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: adjust(step)
            case .decrement: adjust(-step)
            @unknown default: break
            }
        }
    }

    private var display: String {
        guard let v = value else { return "—" }
        return whole ? "\(Int(v.rounded()))" : trimmed(v)
    }

    private func trimmed(_ v: Double) -> String {
        let s = Formato.esDecimal(v, siempreDecimales: true)
        return s.hasSuffix(".0") ? String(s.dropLast(2)) : s
    }

    private func stepButton(systemName: String, delta: Double) -> some View {
        Button(action: { adjust(delta) }) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 36, height: 36)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(delta > 0 ? "Sumar \(unit)" : "Restar \(unit)")
    }

    private func adjust(_ delta: Double) {
        Haptics.light()
        let base = value ?? seedOnFirstTap
        value = max(0, base + delta)
    }
}
