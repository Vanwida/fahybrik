import SwiftUI

// Concept2 PM5 / ErgData-style live HUDs for the active workout screen.
// ActiveWorkoutView routes to one of these by the current segment's kind:
//   • ErgLiveHUD   — row / ski / bike erg (PM5): big split /500m + watts center
//   • RunLiveHUD   — running: big pace /km center
//   • StrengthLiveHUD — strength / reps: reps + load + rest treatment
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

// MARK: - Erg HUD (row / ski / bike)

struct ErgLiveHUD: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore

    private var live: PM5LiveSample { pm5.live }

    var body: some View {
        VStack(spacing: 12) {
            // Hero face: split /500m, then watts directly under — the two values
            // a rower fixes on, exactly as the PM5 monitor stacks them, set into
            // an elevated instrument well so the readout floats off the canvas.
            CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
                VStack(spacing: 4) {
                    CenterMetric(
                        value: splitString,
                        unit: "/500m",
                        caption: "Split",
                        color: Theme.Color.foreground,
                        hero: true
                    )
                    Hairline()
                    CenterMetric(
                        value: watts.map { "\($0)" } ?? "—",
                        unit: "W",
                        caption: "Power",
                        color: Theme.Color.accentText,
                        hero: false
                    )
                }
            }

            metricRow
        }
    }

    // Surrounding metrics: distance, elapsed lap, SPM, calories, HR.
    private var metricRow: some View {
        let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        return LazyVGrid(columns: cols, spacing: 4) {
            ExpertCell(label: "Dist", value: distanceString, unit: "m")
            ExpertCell(label: "Lap", value: WorkoutSession.formatElapsed(session.lapElapsedSeconds), unit: "")
            ExpertCell(label: "SPM", value: spm.map { "\($0)" } ?? "—", unit: "")
            ExpertCell(label: "Cal", value: calories.map { "\($0)" } ?? "—", unit: "")
            ExpertCell(
                label: "HR",
                value: session.liveHRBpm.map { "\($0)" } ?? "—",
                unit: "bpm",
                color: session.liveZone?.color ?? Theme.Color.foreground
            )
            ExpertCell(label: "Tgt", value: targetString, unit: targetUnit)
        }
    }

    // MARK: derived

    private var splitString: String {
        guard pm5.isConnected, let p = live.paceSecondsPer500m, p > 0 else { return "—:—" }
        let s = Int(p.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
    private var watts: Int? { pm5.isConnected ? live.powerWatts : nil }
    private var spm: Int? { pm5.isConnected ? live.strokeRate : nil }
    private var calories: Int? { pm5.isConnected ? live.caloriesKcal : nil }

    private var distanceString: String {
        if pm5.isConnected, let d = live.distanceMeters { return "\(Int(d))" }
        if let t = session.currentSegment?.targetDistanceMeters { return "0/\(Int(t))" }
        return "—"
    }

    // Target cell: prefer prescribed distance, else target power.
    private var targetString: String {
        let seg = session.currentSegment
        if let d = seg?.targetDistanceMeters { return "\(Int(d))" }
        if let w = seg?.targetPowerWatts { return "\(w)" }
        if let t = seg?.targetDurationSeconds { return WorkoutSession.formatElapsed(Double(t)) }
        return "—"
    }
    private var targetUnit: String {
        let seg = session.currentSegment
        if seg?.targetDistanceMeters != nil { return "m" }
        if seg?.targetPowerWatts != nil { return "W" }
        return ""
    }
}

// MARK: - Run HUD

struct RunLiveHUD: View {
    let session: WorkoutSession
    /// GPS availability so the HUD shows a live covered-pace hero when phone GPS
    /// is feeding distance, or a manual distance stepper when it isn't.
    var gpsActive: Bool = false

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

struct StrengthLiveHUD: View {
    let session: WorkoutSession

    // Local mirror of the editable load, primed from the prescription on appear /
    // segment change. The athlete adjusts it to what they really lifted; it flows
    // into the segment record (session.manualLoadKg), overriding the prescription.
    @State private var loadKg: Double?

    private var supportsLoad: Bool {
        let k = session.currentSegment?.kind
        return k == .strength || k == .sled
    }

    var body: some View {
        VStack(spacing: 12) {
            // Tap the reps hero to log a rep — strength/reps have no sensor, the
            // athlete counts. Generous hit area; haptic on each tap. Set into the
            // same elevated instrument well as the erg / run heroes.
            Button(action: { session.tap(); Haptics.light() }) {
                CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
                    CenterMetric(
                        value: repsString,
                        unit: "reps",
                        caption: "Reps · toca para +1",
                        color: Theme.Color.accentText,
                        hero: true
                    )
                }
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Sumar repetición. Llevas \(repsString)")

            let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
            LazyVGrid(columns: cols, spacing: 4) {
                if supportsLoad {
                    // Manual actual load — primary strength data when no device.
                    ManualStepperField(
                        label: "Carga",
                        unit: "kg",
                        value: $loadKg,
                        step: 2.5,
                        seedOnFirstTap: session.currentSegment?.loadKg ?? 0
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

    private func primeLoad() {
        guard supportsLoad else { loadKg = nil; return }
        session.primeManualLoadIfNeeded()
        loadKg = session.manualLoadKg
    }

    private var repsString: String {
        let seg = session.currentSegment
        if seg?.kind == .reps, let t = seg?.targetReps {
            return "\(session.repsCurrentSegment)/\(t)"
        }
        return "\(session.repsCurrentSegment)"
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
        !isCountIn && session.emomIntervalRemaining <= WorkoutSession.emomUrgentThreshold
    }

    var body: some View {
        VStack(spacing: 12) {
            clockCard
            workCard
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
                    Text(WorkoutSession.formatElapsed(max(0, session.emomIntervalRemaining)))
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

    // THIS interval's work — movement + measure + intensity, from sets[].
    private var workCard: some View {
        let current = plan?.interval(session.emomIntervalIndex)
        return CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: isCountIn ? "Primer intervalo" : "Este intervalo", color: Theme.Color.accentText, size: 10)
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

    private var intervalLabel: String {
        "Intervalo \(session.emomIntervalIndex + 1) / \(plan?.intervalCount ?? 0)"
    }

    private var cadenceLabel: String {
        guard let s = plan?.intervalSeconds else { return "" }
        return "cada \(PrescriptionRenderer.formatRest(s))"
    }

    // The next movement, ONLY when the EMOM alternates and the upcoming interval
    // is a different movement — so a uniform EMOM never shows a redundant "Luego".
    private var nextMovement: String? {
        guard let plan, plan.isAlternating else { return nil }
        let n = session.emomIntervalIndex + 1
        guard let nxt = plan.interval(n),
              let cur = plan.interval(session.emomIntervalIndex),
              nxt.movement != cur.movement else { return nil }
        return nxt.work != "—" ? "\(nxt.work) · \(nxt.movement)" : nxt.movement
    }

    private var clockAccessibility: String {
        if isCountIn { return "Empieza en \(Int(session.emomCountInRemaining.rounded(.up)))" }
        let secs = Int(session.emomIntervalRemaining.rounded())
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
        case .healthkit: return "HR · Watch"
        case .pm5:       return "HR · PM5"
        case .none:      return nil
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
                    .accessibilityLabel("Frecuencia cardiaca desde \(session.hrSource == .pm5 ? "el PM5" : "el reloj")")
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
