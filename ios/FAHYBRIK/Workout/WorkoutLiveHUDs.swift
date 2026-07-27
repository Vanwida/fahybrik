import SwiftUI

// Concept2 PM5 / ErgData-style live HUDs for the active workout screen.
// ActiveWorkoutView routes to one of these by the current segment's kind:
//   • RunLiveHUD   — running: big pace /km center
//   • StrengthLiveHUD — strength / reps: reps + load + rest treatment
// Erg (row / ski) work does NOT live here: it has ONE surface of its own,
// `ErgHUDContent` (Devices/PM5), which serves portrait and landscape alike.
// All read WorkoutSession + PM5ConnectionStore (passed in) as the single data
// sources — no duplicated state. Tokens from Theme/Atoms; dark + Fabrik orange.

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
                    unit: isGuidanceOnly ? "" : "/km",
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
                    ExpertCell(label: "Lap", value: WorkoutSession.formatElapsed(session.lapElapsedSeconds), unit: "")
                    ExpertCell(
                        label: "HR",
                        value: session.liveHRBpm.map { "\($0)" } ?? "—",
                        unit: "bpm",
                        color: session.liveZone?.color ?? Theme.Color.foreground
                    )
                    ExpertCell(label: "Total", value: WorkoutSession.formatElapsed(session.elapsedSeconds), unit: "")
                } else {
                    ExpertCell(label: distanceLabel, value: distanceString, unit: "")
                    ExpertCell(label: "Lap", value: WorkoutSession.formatElapsed(session.lapElapsedSeconds), unit: "")
                    ExpertCell(
                        label: "HR",
                        value: session.liveHRBpm.map { "\($0)" } ?? "—",
                        unit: "bpm",
                        color: session.liveZone?.color ?? Theme.Color.foreground
                    )
                    ExpertCell(
                        label: "Zone",
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

    // Hero pace: live covered pace (distance/elapsed) when GPS is feeding, else
    // the prescribed target pace. Caption makes the meaning explicit so the
    // value is never ambiguous.
    private var paceString: String {
        if hasLiveDistance, let pace = liveCoveredPaceSecPerKm {
            return TimeMinSecRow.format(Int(pace.rounded()))
        }
        if let p = session.currentSegment?.targetPaceSecondsPerKm { return TimeMinSecRow.format(p) }
        return "—:—"
    }
    private var paceCaption: String {
        if hasLiveDistance { return "Pace · GPS" }
        return session.currentSegment?.targetPaceSecondsPerKm != nil ? "Pace objetivo" : "Pace"
    }
    private var liveCoveredPaceSecPerKm: Double? {
        guard let d = session.liveRunDistanceMeters, d > 0, session.lapElapsedSeconds > 0 else { return nil }
        return session.lapElapsedSeconds / (d / 1000.0)
    }

    // Distance cell shows live covered (GPS) when available, else the target.
    private var distanceLabel: String { hasLiveDistance ? "Dist" : "Dist Tgt" }
    private var distanceString: String {
        if hasLiveDistance, let d = session.liveRunDistanceMeters {
            return d >= 1000 ? String(format: "%.2f km", d / 1000) : "\(Int(d)) m"
        }
        guard let d = session.currentSegment?.targetDistanceMeters else { return "—" }
        if d >= 1000 { return String(format: "%.1f km", d / 1000) }
        return "\(Int(d)) m"
    }
}

// MARK: - Strength / reps HUD
//
// Routes by how the segment's reps are logged (the honest-logging model):
//   • multi-set strength (5×5 / pyramid) → a per-SET list, each set pre-filled
//   • prescribed single chunk (squat 15)  → a PRE-FILLED stepper + confirm-by-advance
//   • open-score (AMRAP) / target-less     → tap-to-count up from a legal 0
// The bottom "HECHO" advance confirms-by-advancing: an untouched prefilled value
// records the prescription with `confirmed=false` (assumed); a stepper edit marks
// it confirmed. Hitting target needs ZERO typing — just advance.

struct StrengthLiveHUD: View {
    let session: WorkoutSession

    // Local mirror of the editable load, primed from the prescription on appear /
    // segment change. The athlete adjusts it to what they really lifted; it flows
    // into the segment record (session.manualLoadKg), overriding the prescription.
    @State private var loadKg: Double?

    private var seg: WorkoutSegment? { session.currentSegment }
    private var supportsLoad: Bool {
        let k = seg?.kind
        return k == .strength || k == .sled
    }

    var body: some View {
        if seg?.usesMultiSetStrength == true {
            StrengthSetsHUD(session: session)
        } else {
            singleView
        }
    }

    // Single-chunk strength / reps: prefilled-or-open rep hero + load + metrics.
    private var singleView: some View {
        VStack(spacing: 12) {
            if seg?.repsArePrimable == true {
                PrefilledRepStepper(session: session)
            } else {
                openScoreHero
            }

            let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
            LazyVGrid(columns: cols, spacing: 4) {
                if supportsLoad {
                    ManualStepperField(
                        label: "Carga",
                        unit: "kg",
                        value: $loadKg,
                        step: 2.5,
                        seedOnFirstTap: seg?.loadKg ?? 0
                    )
                    .onChange(of: loadKg) { _, new in session.manualLoadKg = new }
                } else {
                    ExpertCell(label: "Carga", value: "—", unit: "")
                }
                ExpertCell(label: "Lap", value: WorkoutSession.formatElapsed(session.lapElapsedSeconds), unit: "")
                ExpertCell(
                    label: "HR",
                    value: session.liveHRBpm.map { "\($0)" } ?? "—",
                    unit: "bpm",
                    color: session.liveZone?.color ?? Theme.Color.foreground
                )
                ExpertCell(label: "Total", value: WorkoutSession.formatElapsed(session.elapsedSeconds), unit: "")
            }
        }
        .onAppear { primeLoad() }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            loadKg = nil
            primeLoad()
        }
    }

    // Open-score (AMRAP) / target-less: reps ARE the score, count up from 0.
    private var openScoreHero: some View {
        Button(action: { session.tap(); Haptics.light() }) {
            CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
                CenterMetric(
                    value: "\(session.repsCurrentSegment)",
                    unit: "reps",
                    caption: "Reps · toca para +1",
                    color: Theme.Color.accentText,
                    hero: true
                )
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Sumar repetición. Llevas \(session.repsCurrentSegment)")
    }

    private func primeLoad() {
        guard supportsLoad else { loadKg = nil; return }
        session.primeManualLoadIfNeeded()
        loadKg = session.manualLoadKg
    }
}

// MARK: - Pre-filled rep stepper (a prescribed single chunk: "squat × 15")
//
// The headline fix: the value starts PRE-FILLED at the prescription, so hitting
// target is zero typing — just advance. − / + adjust to what was really done
// (marking it confirmed → scaled if it differs). A SKIP affordance records the
// segment as not done (actual = null). The prescribed value rides along read-only.

private struct PrefilledRepStepper: View {
    let session: WorkoutSession

    private var prescribed: Int? { session.currentSegment?.prescribedRepsForLog }
    private var skipped: Bool { session.repsSkipped }

    var body: some View {
        CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
            VStack(spacing: 10) {
                LabelText(text: skipped ? "Saltado" : "Reps", size: 10)
                if skipped {
                    Text("—")
                        .font(Theme.Typography.readoutHero)
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    HStack(spacing: 18) {
                        roundStep(systemName: "minus", delta: -1)
                        Text("\(session.repsCurrentSegment)")
                            .font(Theme.Typography.readoutHero)
                            .monospacedDigit()
                            .foregroundStyle(Theme.Color.accentText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                            .frame(minWidth: 96)
                            .contentTransition(.numericText())
                        roundStep(systemName: "plus", delta: 1)
                    }
                }
                if let p = prescribed {
                    Text(deviationLabel(prescribed: p))
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
                Button(action: { session.setRepsSkipped(!skipped); Haptics.light() }) {
                    Text(skipped ? "Deshacer salto" : "Saltar ejercicio")
                        .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(skipped ? Theme.Color.accentText : Theme.Color.muted)
                        .underline()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(skipped ? "Deshacer, marcar como hecho" : "Saltar este ejercicio")
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .contain)
    }

    private func deviationLabel(prescribed: Int) -> String {
        let done = session.repsCurrentSegment
        if done == prescribed { return "Prescrito: \(prescribed) reps" }
        let diff = done - prescribed
        let sign = diff > 0 ? "+\(diff)" : "\(diff)"
        return "Prescrito: \(prescribed) · hecho \(done) (\(sign))"
    }

    private func roundStep(systemName: String, delta: Int) -> some View {
        Button(action: {
            session.setReps(session.repsCurrentSegment + delta)
            Haptics.light()
        }) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 52, height: 52)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(delta > 0 ? "Sumar una repetición" : "Restar una repetición")
    }
}

// MARK: - Per-set strength HUD (a 5×5 / pyramid, logged set by set)
//
// Each set is PRE-FILLED to its prescription. "Hecho" = one tap (did as written,
// confirmed, fires the rest timer). "Ajustar" reveals reps / load steppers (+
// optional RPE / RIR) → the set reads scaled when it differs. A set can be
// skipped. The segment aggregate (Σ reps, max load) is built on close for the
// back-compat analytics; the per-set detail rides in `sets[]`.

struct StrengthSetsHUD: View {
    let session: WorkoutSession
    @State private var expanded: Set<Int> = []   // setIndex currently editing

    var body: some View {
        VStack(spacing: 10) {
            if session.restRemainingSeconds > 0 {
                RestBanner(session: session)
            }
            CardSurface(padding: 0, topAccent: true) {
                VStack(spacing: 0) {
                    HStack {
                        LabelText(text: "Series", size: 10)
                        Spacer()
                        Text("\(doneCount)/\(session.setRecords.count)")
                            .font(.system(size: 12, weight: .heavy, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    ForEach(session.setRecords) { rec in
                        Hairline()
                        SetRowView(
                            session: session,
                            index: rec.setIndex - 1,
                            rec: rec,
                            isExpanded: expanded.contains(rec.setIndex),
                            toggleExpanded: {
                                if expanded.contains(rec.setIndex) { expanded.remove(rec.setIndex) }
                                else { expanded.insert(rec.setIndex) }
                            }
                        )
                    }
                }
            }
            metricRow
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in expanded.removeAll() }
    }

    private var doneCount: Int {
        session.setRecords.filter { $0.confirmed && $0.status != "skipped" }.count
    }

    private var metricRow: some View {
        let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        return LazyVGrid(columns: cols, spacing: 4) {
            ExpertCell(label: "Lap", value: WorkoutSession.formatElapsed(session.lapElapsedSeconds), unit: "")
            ExpertCell(
                label: "HR",
                value: session.liveHRBpm.map { "\($0)" } ?? "—",
                unit: "bpm",
                color: session.liveZone?.color ?? Theme.Color.foreground
            )
        }
    }
}

// One set row. Collapsed: set #, prescribed (or logged) work, status, "Hecho".
// Expanded: reps / load steppers, optional RPE / RIR, skip.
private struct SetRowView: View {
    let session: WorkoutSession
    let index: Int
    let rec: SetRecord
    let isExpanded: Bool
    let toggleExpanded: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text("S\(rec.setIndex)")
                    .font(.system(size: 13, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 30, alignment: .leading)
                VStack(alignment: .leading, spacing: 1) {
                    Text(workLine)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if let sub = subLine {
                        Text(sub)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 6)
                statusControl
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            .onTapGesture { toggleExpanded() }

            if isExpanded {
                editor
            }
        }
    }

    // Confirmed → status pill; otherwise a one-tap "Hecho" (did as written).
    @ViewBuilder
    private var statusControl: some View {
        if rec.status == "skipped" {
            Text("SALTADA")
                .font(.system(size: 10, weight: .heavy)).tracking(0.6)
                .foregroundStyle(Theme.Color.muted)
        } else if rec.confirmed {
            HStack(spacing: 6) {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(rec.status == "scaled" ? Theme.Color.warning : Theme.Color.ok)
                if rec.status == "scaled" {
                    Text("AJUSTADA")
                        .font(.system(size: 9, weight: .heavy)).tracking(0.5)
                        .foregroundStyle(Theme.Color.warning)
                }
            }
        } else {
            Button(action: { session.confirmSet(index); Haptics.medium() }) {
                Text("HECHO")
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.accentOn)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Theme.Color.accent)
                    .clipShape(Capsule())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Serie \(rec.setIndex) hecha como prescrita")
        }
    }

    private var editor: some View {
        VStack(spacing: 8) {
            Hairline().opacity(0.4)
            HStack(spacing: 8) {
                IntStepperTile(
                    label: "Reps", value: rec.repsActual ?? rec.repsPrescribed ?? 0,
                    onChange: { session.setSetReps(index, $0) }
                )
                if rec.loadPrescribedKg != nil || rec.loadActualKg != nil {
                    // Rueda con CASCADA (IMG_2385): cambias esta y la heredan las
                    // series que faltan; las hechas conservan su peso real.
                    LiveKgWheelTile(
                        value: rec.loadActualKg ?? rec.loadPrescribedKg ?? 20,
                        onChange: { session.setSetLoadCascade(index, $0) }
                    )
                }
            }
            HStack(spacing: 8) {
                DoubleStepperTile(
                    label: "RPE", unit: "", step: 0.5, maxValue: 10, optional: true,
                    value: rec.rpe,
                    onChange: { session.setSetRPE(index, $0) }
                )
                DoubleStepperTile(
                    label: "RIR", unit: "", step: 1, maxValue: 10, optional: true,
                    value: rec.rir,
                    onChange: { session.setSetRIR(index, $0) }
                )
            }
            Button(action: {
                session.setSetSkipped(index, rec.status != "skipped"); Haptics.light()
            }) {
                Text(rec.status == "skipped" ? "Deshacer salto" : "Saltar serie")
                    .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(rec.status == "skipped" ? Theme.Color.accentText : Theme.Color.muted)
                    .underline()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
        .padding(.top, 2)
    }

    // Prescribed work, or the logged actual once confirmed. A rep set shows its
    // reps (the athlete edits them live); a duration/distance set has no rep
    // dimension, so it reads the prescribed measure from the segment prescription
    // ("0:30", "50 m") instead of a bare dash.
    private var workLine: String {
        let load = rec.confirmed ? (rec.loadActualKg ?? rec.loadPrescribedKg) : rec.loadPrescribedKg
        var s: String
        if rec.repsPrescribed != nil || rec.repsActual != nil {
            let reps = rec.confirmed ? (rec.repsActual ?? rec.repsPrescribed) : rec.repsPrescribed
            s = reps.map { "\($0)" } ?? "—"
        } else {
            s = prescribedMeasureWork ?? "—"
        }
        if let kg = load { s += " × \(kgString(kg)) kg" }
        return s
    }

    // The prescribed measure work for a non-rep set (timed hold / carry), pulled
    // from this set's prescription by index. Nil for rep sets (handled above) or
    // when no prescription is attached.
    private var prescribedMeasureWork: String? {
        guard let sets = session.currentSegment?.prescription?.sets,
              sets.indices.contains(index) else { return nil }
        return PrescriptionRenderer.measureWork(sets[index].measure)
    }

    private var subLine: String? {
        var parts: [String] = []
        if rec.confirmed, let p = rec.repsPrescribed, (rec.repsActual ?? p) != p {
            parts.append("prescrito \(p)")
        }
        if let rpe = rec.rpe { parts.append("RPE \(kgString(rpe))") }
        if let rir = rec.rir { parts.append("RIR \(kgString(rir))") }
        if rec.restS != nil, !rec.confirmed, let r = rec.restS { parts.append("descanso \(r)s") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func kgString(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(v))" : String(format: "%.1f", v)
    }
}

// La rueda de carga del editor en vivo: pasos de 2,5 kg, redondeando el valor
// entrante a la rejilla de discos. "esta y siguientes" dice lo que hace.
private struct LiveKgWheelTile: View {
    let value: Double
    let onChange: (Double) -> Void

    private var units: Binding<Int> {
        Binding(
            get: { max(1, Int((value / 2.5).rounded())) },
            set: { onChange(Double($0) * 2.5) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: "Carga · esta y siguientes", size: 10)
            Picker("Carga", selection: units) {
                ForEach(1...120, id: \.self) { u in
                    Text(KgWheel.kgLabel(Double(u) * 2.5))
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .tag(u)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 84)
            .clipped()
        }
        .frame(maxWidth: .infinity)
    }
}

// Compact rest countdown shown while a set's rest timer runs.
private struct RestBanner: View {
    let session: WorkoutSession
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "timer")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.Color.accentText)
            Text("Descanso")
                .font(.system(size: 12, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            Text(WorkoutSession.formatElapsed(max(0, session.restRemainingSeconds)))
                .font(.system(size: 18, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
            Button(action: { session.dismissRest(); Haptics.light() }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.Color.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Saltar descanso")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.Color.accent.opacity(0.12))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.accentText.opacity(0.4), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Small stepper tiles (per-set editor)

private struct IntStepperTile: View {
    let label: String
    let value: Int
    let onChange: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 10)
            HStack(spacing: 8) {
                stepButton("minus") { onChange(max(0, value - 1)) }
                Text("\(value)")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                stepButton("plus") { onChange(value + 1) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func stepButton(_ name: String, _ action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); action() }) {
            Image(systemName: name)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name == "plus" ? "Sumar \(label)" : "Restar \(label)")
    }
}

private struct DoubleStepperTile: View {
    let label: String
    var unit: String = ""
    let step: Double
    var maxValue: Double? = nil
    var optional: Bool = false        // shows "—" until first tap (RPE/RIR)
    let value: Double?
    let onChange: (Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 10)
            HStack(spacing: 8) {
                stepButton("minus") { adjust(-step) }
                HStack(alignment: .lastTextBaseline, spacing: 3) {
                    Text(display)
                        .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(value == nil ? Theme.Color.muted : Theme.Color.foreground)
                    if !unit.isEmpty {
                        Text(unit).font(.system(size: 10)).foregroundStyle(Theme.Color.muted)
                    }
                }
                .frame(maxWidth: .infinity)
                stepButton("plus") { adjust(step) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var display: String {
        guard let v = value else { return "—" }
        return v.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(v))" : String(format: "%.1f", v)
    }

    private func adjust(_ delta: Double) {
        Haptics.light()
        // Optional fields (RPE/RIR) seed at 0 on the first tap, then count.
        var next = max(0, (value ?? 0) + delta)
        if let mx = maxValue { next = min(mx, next) }
        onChange(next)
    }

    private func stepButton(_ name: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name == "plus" ? "Sumar \(label)" : "Restar \(label)")
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

// MARK: - EMOM HUD (every-minute-on-the-minute)
//
// The dedicated EMOM face — what was missing today, where an EMOM looked
// identical to a generic circuit. A big per-interval count-DOWN (auto-rolling on
// the minute, with the boundary beep fired by the session), the interval counter
// (X / N), and THIS interval's work pulled from the prescription's `sets[]` so an
// alternating EMOM shows the right movement each minute. Reads the session as the
// single source of state; the session owns the timer, audio and auto-advance.

struct EmomLiveHUD: View {
    let session: WorkoutSession

    private var plan: EmomPlan? { session.currentSegment?.emomPlan }
    private var isCountIn: Bool { session.emomCountInRemaining > 0 }
    private var isUrgent: Bool {
        !isCountIn && session.emomPhaseRemaining <= WorkoutSession.emomUrgentThreshold
    }
    /// True while this EMOM is an INTERVAL (explicit work + transition, e.g. 45/15):
    /// the phase is then the whole experience, so it gets the banner. A plain EMOM
    /// has one phase and shows exactly what it always did.
    private var hasTransition: Bool { plan?.hasTransition == true }
    private var isTransition: Bool { hasTransition && !isCountIn && session.emomPhase == .rest }

    var body: some View {
        VStack(spacing: 12) {
            if hasTransition, !isCountIn {
                WorkRestBanner(phase: session.emomPhase, restLabel: "CAMBIO")
            }
            clockCard
            // A bare box clock (EMOM started without declaring movements) has no work
            // to name — the clock IS the session. Showing a card whose only content
            // is a dash would be noise on the one screen that has to read at 3 m.
            if session.currentSegment?.hasDeclaredWork == true {
                workCard
            }
            metricRow
        }
    }

    // Hero clock: the 3-2-1 count-in, then the per-interval count-DOWN. Goes accent
    // in the final 3 seconds (paired with the session's audible ticks).
    private var clockCard: some View {
        CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
            VStack(spacing: 4) {
                if isCountIn {
                    LabelText(text: "Prepárate", size: 10)
                    Text("\(Int(session.emomCountInRemaining.rounded(.up)))")
                        .font(Theme.Typography.readoutHero)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.accentText)
                        .contentTransition(.numericText())
                } else {
                    LabelText(text: intervalLabel, color: Theme.Color.accentText, size: 10)
                    Text(WorkoutSession.formatElapsed(max(0, session.emomPhaseRemaining)))
                        .font(Theme.Typography.readoutHero)
                        .monospacedDigit()
                        .foregroundStyle(isUrgent ? Theme.Color.accentText : Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .scaleEffect(isUrgent ? 1.02 : 1.0)
                        .animation(.easeOut(duration: 0.2), value: isUrgent)
                    Text(cadenceLabel)
                        .font(Theme.Typography.readoutLabel)
                        .tracking(0.5)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.s)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(clockAccessibility)
    }

    // THIS interval's work — movement + measure + intensity, from sets[]. During a
    // transition it shows the work you are WALKING TO, not the one you just left:
    // that is the whole reason a station EMOM has a change window.
    private var workCard: some View {
        let current = plan?.interval(shownIntervalIndex)
        return CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: workCardLabel, color: Theme.Color.accentText, size: 10)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let w = current?.work, w != "—" {
                        Text(w)
                            .font(Theme.Typography.readoutS)
                            .monospacedDigit()
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize()
                    }
                    Text(current?.movement ?? session.currentSegment?.title ?? "—")
                        .scaledFont(16, weight: .heavy, relativeTo: .body, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
                if let detail = current?.detail {
                    Text(detail)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
                if let next = nextMovement {
                    Hairline()
                    HStack(spacing: 6) {
                        LabelText(text: "Luego", size: 9)
                        Text(next)
                            .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var metricRow: some View {
        let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        return LazyVGrid(columns: cols, spacing: 4) {
            ExpertCell(label: "Total", value: WorkoutSession.formatElapsed(session.elapsedSeconds), unit: "")
            ExpertCell(label: "Hechos", value: "\(session.emomCompletedIntervals)/\(plan?.intervalCount ?? 0)", unit: "")
            ExpertCell(
                label: "HR",
                value: session.liveHRBpm.map { "\($0)" } ?? "—",
                unit: "bpm",
                color: session.liveZone?.color ?? Theme.Color.foreground
            )
        }
    }

    // MARK: derived

    /// What the work card is showing: the first interval before GO, the work you
    /// are doing now, or — mid-transition — the work waiting on the other side.
    private var workCardLabel: String {
        if isCountIn { return "Primer intervalo" }
        return isTransition ? "Al acabar el cambio" : "Este intervalo"
    }

    private var intervalLabel: String {
        let n = "Intervalo \(session.emomIntervalIndex + 1) / \(plan?.intervalCount ?? 0)"
        // During a transition the athlete is no longer working — say so on the clock
        // itself, not only on the banner.
        return isTransition ? "Cambio · \(n)" : n
    }

    private var cadenceLabel: String {
        guard let plan else { return "" }
        // A plain EMOM reads as its cadence; an interval reads as its split, which
        // is the number the athlete is actually pacing against.
        guard plan.hasTransition else {
            return "cada \(PrescriptionRenderer.formatRest(plan.intervalSeconds))"
        }
        return "\(plan.workSeconds)/\(plan.restSeconds) · cada \(PrescriptionRenderer.formatRest(plan.intervalSeconds))"
    }

    /// The 0-based interval the work card is describing — the next one while a
    /// transition runs, the current one otherwise. ONE definition so the card and
    /// its "Luego" line can never point at different rounds.
    private var shownIntervalIndex: Int {
        isTransition ? session.emomIntervalIndex + 1 : session.emomIntervalIndex
    }

    // The next movement, ONLY when the EMOM alternates and the upcoming interval
    // is a different movement — so a uniform EMOM never shows a redundant "Luego".
    private var nextMovement: String? {
        guard let plan, plan.isAlternating else { return nil }
        let shown = shownIntervalIndex
        guard let nxt = plan.interval(shown + 1),
              let cur = plan.interval(shown),
              nxt.movement != cur.movement else { return nil }
        return nxt.work != "—" ? "\(nxt.work) · \(nxt.movement)" : nxt.movement
    }

    private var clockAccessibility: String {
        if isCountIn { return "Empieza en \(Int(session.emomCountInRemaining.rounded(.up)))" }
        let secs = Int(session.emomPhaseRemaining.rounded())
        return "\(intervalLabel), quedan \(secs) segundos"
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
        if let d = seg.targetDistanceMeters {
            parts.append(d >= 1000 ? String(format: "%.1fkm", d / 1000) : "\(Int(d))m")
        } else if let t = seg.targetDurationSeconds {
            parts.append(WorkoutSession.formatElapsed(Double(t)))
        } else if let r = seg.targetReps {
            if let kg = seg.loadKg { parts.append("\(r)×\(Int(kg))kg") }
            else { parts.append("\(r) reps") }
        }
        switch seg.kind {
        case .running:
            if let p = seg.targetPaceSecondsPerKm { parts.append("\(TimeMinSecRow.format(p))/km") }
            else if let z = seg.targetZone { parts.append(z.label) }
        case .rowOrSki:
            if let w = seg.targetPowerWatts { parts.append("\(w)W") }
        case .strength, .sled:
            if seg.targetReps == nil, let kg = seg.loadKg { parts.append("\(Int(kg))kg") }
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
