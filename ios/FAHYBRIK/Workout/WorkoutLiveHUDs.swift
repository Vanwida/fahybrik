import SwiftUI

// Las piezas de la pantalla de entreno que NO tienen marco propio: el HUD de
// correr en cinta/manual, las listas estructurales y las tiras de contexto que
// `ActiveWorkoutView` apila en su ranura.
//
// Lo que ya NO vive aquí, y por qué (29-jul):
//   • El EMOM y el hierro se mudaron a `Workout/Vivo/` — hablan el §10 del
//     CONTRATO-UI y montan su propio `MarcoVivo`, porque el ancla del sujeto es
//     una propiedad de la pantalla y no cabe en una ranura.
//   • El ergo nunca estuvo aquí: tiene UNA superficie propia, `ErgHUDContent`
//     (Devices/PM5), que sirve vertical y horizontal por igual.
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
        gpsActive && (session.liveRunDistanceMeters ?? 0) > 0
    }

    // A target-less run leg (no pace, no distance, no zone) with no live GPS has
    // nothing measurable to display — the HUD would be all dashes. Switch it to
    // the coach's effort/duration guidance instead (e.g. a warmup "8 min RPE 3").
    private var isGuidanceOnly: Bool {
        !hasLiveDistance
            && seg?.targetPaceSecondsPerKm == nil
            && seg?.targetDistanceMeters == nil
            && seg?.targetZone == nil
    }

    // Effort cue for the hero in guidance mode: the prescribed RPE, else a plain
    // "Suave" — never a dash.
    private var guidanceHero: (value: String, caption: String) {
        if let rpe = seg?.effortGuidance { return (rpe, "Esfuerzo objetivo") }
        return ("Suave", "Esfuerzo objetivo")
    }

    var body: some View {
        VStack(spacing: 12) {
            CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
                CenterMetric(
                    value: isGuidanceOnly ? guidanceHero.value : paceString,
                    unit: isGuidanceOnly ? "" : Formato.UnidadRitmo.porKm.rawValue,
                    caption: isGuidanceOnly ? guidanceHero.caption : paceCaption,
                    color: hasLiveDistance ? Theme.Color.accentText : Theme.Color.foreground,
                    hero: true
                )
            }

            let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
            LazyVGrid(columns: cols, spacing: 4) {
                if isGuidanceOnly {
                    // Guidance cells (duration goal + clocks) — real values, no dashes.
                    ExpertCell(label: "Duración", value: seg?.durationGuidance ?? "Libre", unit: "")
                    ExpertCell(label: Vocab.vuelta, value: Formato.clock(session.lapElapsedSeconds, anchoFijo: true), unit: "")
                    ExpertCell(
                        label: Vocab.fc,
                        value: session.liveHRBpm.map { "\($0)" } ?? "—",
                        unit: Vocab.ppm,
                        color: session.liveZone?.color ?? Theme.Color.foreground
                    )
                    ExpertCell(label: Vocab.total, value: Formato.clock(session.elapsedSeconds, anchoFijo: true), unit: "")
                } else {
                    ExpertCell(label: distanceLabel, value: distanceString, unit: "")
                    ExpertCell(label: Vocab.vuelta, value: Formato.clock(session.lapElapsedSeconds, anchoFijo: true), unit: "")
                    ExpertCell(
                        label: Vocab.fc,
                        value: session.liveHRBpm.map { "\($0)" } ?? "—",
                        unit: Vocab.ppm,
                        color: session.liveZone?.color ?? Theme.Color.foreground
                    )
                    ExpertCell(
                        label: "Zona",
                        value: session.currentSegment?.targetZone?.label ?? (session.liveZone?.label ?? "—"),
                        unit: "",
                        color: (session.currentSegment?.targetZone ?? session.liveZone)?.color ?? Theme.Color.foreground
                    )
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

    // Hero pace: live covered pace when GPS is feeding, else the prescribed target
    // pace. Caption makes the meaning explicit so the value is never ambiguous.
    //
    // El ritmo sale del MOTOR (`session.liveCoveredPaceSecPerKm`), nunca de una
    // cuenta propia. Esta vista tenía su copia — distancia del tramo entre tiempo de
    // la vuelta — y en un 6×800 el denominador se comía los trotes: el HUD decía
    // 5:33/km mientras el atleta corría a 3:30, y el registro que le llegaba al coach
    // sí era el bueno. Dos números del mismo esfuerzo. El motor mide sobre la PIERNA
    // en una serie estructurada, así que lo que se ve y lo que se guarda coinciden.
    private var paceString: String {
        if hasLiveDistance, let pace = session.liveCoveredPaceSecPerKm {
            return Formato.ritmoCifras(Double(pace))
        }
        if let p = session.currentSegment?.targetPaceSecondsPerKm {
            return Formato.ritmoCifras(Double(p))
        }
        return "—:—"
    }
    private var paceCaption: String {
        if hasLiveDistance { return "\(Vocab.ritmo) · GPS" }
        return session.currentSegment?.targetPaceSecondsPerKm != nil
            ? "\(Vocab.ritmo) objetivo" : Vocab.ritmo
    }

    // Distance cell shows live covered (GPS) when available, else the target.
    // Lo cubierto se escribe con dos decimales (es una medida) y el objetivo con uno
    // (lo escribió el coach redondo) — misma función, distinta precisión pedida.
    private var distanceLabel: String { hasLiveDistance ? Vocab.distancia : "Objetivo" }
    private var distanceString: String {
        if hasLiveDistance, let d = session.liveRunDistanceMeters {
            return Formato.distanciaCubierta(d) ?? "—"
        }
        guard let d = session.currentSegment?.targetDistanceMeters else { return "—" }
        return Formato.distancia(d) ?? "—"
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


// MARK: - Connection / data-provenance strip
//
// A glanceable row of small chips telling the athlete (and, via the record, the
// coach) WHERE the live data comes from this segment: the erg (PM5), the heart-
// rate source (Apple Watch/HealthKit or a strap through the PM5), and phone GPS
// on runs. Each chip is on (accent) when that source is active, muted when not.
// Tapping the PM5 chip opens pairing (non-blocking) when an erg segment needs it.

struct ConnectionStrip: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore
    let gpsActive: Bool
    /// Whether the current segment actually wants the erg / GPS, so we only nudge
    /// to connect where it matters (don't surface a dead PM5 chip on a squat).
    let segmentIsErg: Bool
    let segmentIsRun: Bool
    let onTapPM5: () -> Void

    private var hrLabel: String? {
        switch session.hrSource {
        case .strap:     return "HR · Banda"
        case .healthkit: return "HR · Watch"
        case .pm5:       return "HR · PM5"
        case .none:      return nil
        }
    }

    /// Spoken source for VoiceOver — honest about which device records HR.
    private var hrSpokenSource: String {
        switch session.hrSource {
        case .strap:     return "la banda"
        case .healthkit: return "el reloj"
        case .pm5:       return "el PM5"
        case .none:      return "el reloj"
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            if segmentIsErg {
                Button(action: onTapPM5) {
                    chip(
                        icon: "antenna.radiowaves.left.and.right",
                        text: pm5.isConnected ? "PM5" : "Conecta PM5",
                        on: pm5.isConnected
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(pm5.isConnected ? "Remo PM5 conectado" : "Conectar remo PM5")
            }
            if let hrLabel {
                chip(icon: "heart.fill", text: hrLabel, on: true)
                    .accessibilityLabel("Frecuencia cardiaca desde \(hrSpokenSource)")
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
            Text(targetLine)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(state == .current ? Theme.Color.foreground : Theme.Color.muted)
                .lineLimit(1)
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
    private var targetLine: String {
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
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }

    private var accessibility: String {
        let stateWord: String
        switch state {
        case .done: stateWord = "completado"
        case .current: stateWord = "actual"
        case .upcoming: stateWord = "siguiente"
        }
        return "\(segment.title), \(stateWord), \(targetLine)"
    }
}
