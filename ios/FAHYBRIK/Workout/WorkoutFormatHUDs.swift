import SwiftUI

// Per-format LIVE timers for the active workout — the dedicated face of each
// conditioning format, routed by `currentSegment.formatScheme` in
// ActiveWorkoutView (el EMOM tiene el suyo, `Vivo/EmomVivoView`, con marco
// propio del §10). They read the session as
// the single source of state (the session owns the clock, audio and auto-advance,
// exactly as the EMOM engine does) and render with the shared Theme atoms.
//
//   FIXED   — the whole round is shown and REPEATED; the screen never advances.
//     · AmrapLiveHUD     count-DOWN window + big "+ Ronda" + rep tally + round list
//     · ForTimeLiveHUD   count-UP (cap flips to count-down) + round/station splits
//   ROTATING — the clock drives the screen forward (work/rest auto-roll).
//     · TabataLiveHUD    work↔rest colour flip, round X/N, per-round rep tally
//     · IntervalsLiveHUD work↔rest, live pace vs target on a run bout
//     · DeathByLiveHUD   per-minute rising target, "Logré / Fallé"
//   CONTINUOUS — one unbroken bout.
//     · SteadyLiveHUD    count-DOWN duration, pace / zone + % in zone

// MARK: - Shared building blocks

/// The hero clock card — a big mono readout in an elevated well with the accent
/// rail, a tracked micro-label above and an optional sub-line. Mirrors the EMOM
/// clock face so every format reads with the same instrument voice.
private struct FormatClockHero: View {
    let caption: String
    var captionColor: Color = Theme.Color.muted
    let value: String
    var sub: String? = nil
    var color: Color = Theme.Color.foreground
    var urgent: Bool = false

    var body: some View {
        CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
            VStack(spacing: 4) {
                LabelText(text: caption, color: captionColor, size: 10)
                Text(value)
                    .font(Theme.Typography.readoutHero)
                    .monospacedDigit()
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .scaleEffect(urgent ? 1.02 : 1.0)
                    .animation(.easeOut(duration: 0.2), value: urgent)
                if let sub {
                    Text(sub)
                        .font(Theme.Typography.readoutLabel)
                        .tracking(0.5)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.s)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(caption), \(value)")
    }
}

/// The phase banner shown by every two-phase format — a full-width tinted bar that
/// flips colour with the phase so it reads under effort from across a box.
///
/// The STRUCTURED-RUN surface still shows both faces (its recovery legs render in
/// place, with their own pace guidance). Every other format's rest has moved to a
/// screen of its own — see RestSurface — so those pass `.work` and only ever wear
/// the work face.
struct WorkRestBanner: View {
    let phase: WorkoutSession.RotatingPhase
    /// What the off-phase is called for this format.
    var restLabel: String = "DESCANSO"
    var body: some View {
        Text(phase == .work ? "TRABAJO" : restLabel)
            .font(.system(size: 14, weight: .heavy, design: .default).italic())
            .tracking(2.0)
            // `background` token = the high-contrast counterpart of `info` in BOTH
            // themes (white on the deep light-blue, near-black on the bright dark-
            // blue), so the REST label stays WCAG-AA either way; WORK rides on the
            // accent's designed `accentOn`.
            .foregroundStyle(phase == .work ? Theme.Color.accentOn : Theme.Color.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(phase == .work ? Theme.Color.accent : Theme.Color.info)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
            .accessibilityLabel(phase == .work ? "Trabajo" : restLabel.capitalized)
    }
}

/// The "this work" card — a movement label + optional work + "Luego …" line, the
/// rotating formats' central piece. Mirrors the EMOM work card.
private struct RotatingWorkCard: View {
    let label: String
    let movement: String
    var work: String? = nil
    var detail: String? = nil
    var next: String? = nil

    var body: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: label, color: Theme.Color.accentText, size: 10)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let work {
                        Text(work)
                            .font(Theme.Typography.readoutS)
                            .monospacedDigit()
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize()
                    }
                    Text(movement)
                        .scaledFont(16, weight: .heavy, relativeTo: .body, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
                if let detail {
                    Text(detail).font(Theme.Typography.small).foregroundStyle(Theme.Color.muted)
                }
                if let next {
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
}

/// A live pace-vs-target chip pair for run bouts (Intervals / Steady): the zone
/// badge + the prescribed target band, so the value above is never ambiguous.
private struct PaceTargetBar: View {
    let session: WorkoutSession
    var body: some View {
        let seg = session.currentSegment
        HStack(spacing: 8) {
            if let z = seg?.targetZone { ZBadge(zone: z) }
            if let p = seg?.targetPaceSecondsPerKm {
                HStack(spacing: 4) {
                    Text("objetivo").font(.system(size: 10)).foregroundStyle(Theme.Color.faint)
                    Text(seg?.kind.isErg == true
                         ? Formato.ritmo(Double(p) / 2, .por500m)
                         : Formato.ritmo(Double(p), .porKm))
                        .font(.system(size: 11, weight: .heavy, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// A 3-cell metric row matching the EMOM HUD's grid (total / progress / HR).
private struct MetricRow3: View {
    /// Una celda de la fila. Era una tupla de cuatro `String` no opcionales, y por
    /// eso cada llamante colaba un `?? "—"` para poder rellenarla: el hueco no
    /// cabía en el tipo. `value` nil = no hay medida, y `ausente` dice por qué (§7).
    struct Cell {
        let label: String
        let value: String?
        var unit: String = ""
        var color: Color = Theme.Color.foreground
        var ausente: String? = nil
    }

    let cells: [Cell]
    var body: some View {
        let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        LazyVGrid(columns: cols, spacing: 4) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, c in
                ExpertCell(label: c.label, value: c.value, unit: c.unit, color: c.color, ausente: c.ausente)
            }
        }
    }
}

/// El pulso en vivo. Sin reloj emparejado no llega ninguna muestra, así que la
/// celda dice eso — que es accionable — en vez de una raya que no dice nada.
private func hrCell(_ session: WorkoutSession) -> MetricRow3.Cell {
    MetricRow3.Cell(label: Vocab.fc,
                    value: session.liveHRBpm.map { "\($0)" },
                    unit: Vocab.ppm,
                    color: session.liveZone?.color ?? Theme.Color.foreground,
                    ausente: "sin reloj")
}

// MARK: - AMRAP

struct AmrapLiveHUD: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var window: Int? { seg?.formatTotalSeconds }
    private var isCountIn: Bool { session.isCondCountIn }
    private var urgent: Bool { !isCountIn && session.condRemaining <= 10 }

    var body: some View {
        VStack(spacing: 12) {
            clock
            roundsCounter
            repRow
            // A bare box clock declares no round, so there is no list to show — the
            // athlete gets the timer and the tally, nothing invented.
            if let seg, seg.hasDeclaredWork {
                FixedRoundList(title: "La ronda", repeatTag: "se repite",
                               components: seg.declaredComponents)
            }
            MetricRow3(cells: [
                .init(label: "Total", value: Formato.clock(session.elapsedSeconds, anchoFijo: true)),
                .init(label: "Reps", value: "\(session.repsCurrentSegment)"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else {
            FormatClockHero(
                caption: "Restante",
                value: Formato.clock(max(0, session.condRemaining), anchoFijo: true),
                sub: window.map { "de \(Formato.clock(Double($0)))" },
                color: Theme.Color.danger,
                urgent: urgent
            )
        }
    }

    // The big tap-to-increment ROUND counter — Rogue/SugarWOD convention: red
    // clock, GREEN rounds. The whole card is the +1 affordance; a small − corrects.
    private var roundsCounter: some View {
        HStack(spacing: 14) {
            Button(action: { session.bumpAmrapRound() }) {
                HStack(spacing: 14) {
                    Text("\(session.fixedRoundsDone)")
                        .font(.system(size: 42, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.ok)
                        .contentTransition(.numericText())
                    VStack(alignment: .leading, spacing: 3) {
                        LabelText(text: "Rondas", color: Theme.Color.ok, size: 10)
                        Text("+\(session.repsCurrentSegment) reps · ronda parcial")
                            .font(.system(size: 11)).foregroundStyle(Theme.Color.muted)
                        Text("toca para +1 ronda")
                            .font(.system(size: 9)).foregroundStyle(Theme.Color.faint)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "plus")
                        .font(.system(size: 24, weight: .heavy))
                        // `background` token is the AA-contrast counterpart of `ok`
                        // in both themes (mirrors "Terminar y guardar").
                        .foregroundStyle(Theme.Color.background)
                        .frame(width: 46, height: 46)
                        .background(Theme.Color.ok)
                        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Sumar una ronda. Llevas \(session.fixedRoundsDone) rondas")
        }
        .padding(13)
        .background(Theme.Color.ok.opacity(0.14))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
            .stroke(Theme.Color.ok.opacity(0.45), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    // Partial-round rep tally — its own row, separate from the round counter (the
    // round button is the high-frequency tap; reps correct a partial round). Fast,
    // un-debounced (the bottom "+ Ronda" is debounced; rep entry must not be).
    private var repRow: some View {
        RepTallyRow(label: "Reps de la ronda parcial", value: session.repsCurrentSegment,
                    onMinus: { session.amrapAddRep(-1) }, onPlus: { session.amrapAddRep(1) })
    }
}

/// A compact, un-debounced rep tally (− value +) for logging reps mid-effort —
/// the AMRAP partial round and the Tabata per-round count. Green affordances on a
/// surface tile, matching the in-workout stepper voice.
private struct RepTallyRow: View {
    let label: String
    let value: Int
    let onMinus: () -> Void
    let onPlus: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            LabelText(text: label, size: 10)
            Spacer(minLength: 8)
            stepButton("minus", onMinus)
            Text("\(value)")
                .font(.system(size: 18, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .frame(minWidth: 36)
                .contentTransition(.numericText())
            stepButton("plus", onPlus)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func stepButton(_ name: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Theme.Color.ok)
                .frame(width: 30, height: 30)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.ok.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(name == "plus" ? "Sumar una repetición" : "Restar una repetición")
    }
}

/// The fixed round/list card shared by AMRAP (does NOT advance — repeats) and the
/// reference list of the count-up formats. Each row is a movement + its work.
private struct FixedRoundList: View {
    let title: String
    var repeatTag: String? = nil
    let components: [WorkComponent]

    var body: some View {
        CardSurface(padding: 0, topAccent: true) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: title, size: 10)
                    Spacer()
                    if let repeatTag {
                        Text(repeatTag.uppercased())
                            .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                            .foregroundStyle(Theme.Color.info)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(Theme.Color.info.opacity(0.16))
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                ForEach(components) { c in
                    Hairline()
                    HStack(spacing: 9) {
                        // Sin dosis declarada no se reserva la columna: un hueco de
                        // 52 pt delante del movimiento se lee como una dosis que se
                        // ha borrado, y no hay tal (§7).
                        if let work = c.work {
                            Text(work)
                                .font(.system(size: 14, weight: .heavy, design: .monospaced))
                                .foregroundStyle(Theme.Color.accentText)
                                .frame(minWidth: 52, alignment: .leading)
                        }
                        Text(c.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        if let d = c.detail {
                            Text(d).font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundStyle(Theme.Color.muted).lineLimit(1)
                        }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

// MARK: - For Time / Chipper / Ladder / Rounds / HYROX sim

struct ForTimeLiveHUD: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var cap: Int? { seg?.formatTotalSeconds }
    private var isCountIn: Bool { session.isCondCountIn }
    // A capped For Time flips to count-DOWN in the FINAL minute of the cap.
    private var capFlip: Bool {
        guard let cap, !isCountIn else { return false }
        let remaining = Double(cap) - session.condElapsed
        return remaining <= 60 && remaining > 0
    }

    /// A ROUTE (the list is the stations, not repeated rounds) and the athlete is on
    /// a station nothing else measures. Then the subject is the work in front of him
    /// — the block clock moves to the context strip, because a 72 pt total time next
    /// to a 14 pt "50 wall balls" tells him the one thing he already knows.
    private var isStationRoute: Bool { seg?.fixedListIsStations == true && !isCountIn }

    var body: some View {
        VStack(spacing: 12) {
            if isStationRoute {
                ForTimeContextStrip(session: session)
                StationSubject(session: session)
                StrikeList(session: session)
                MetricRow3(cells: [
                    .init(label: "Parcial", value: lastSplitSeconds, ausente: "aún sin parciales"),
                    .init(label: "Estación",
                          value: "\(min(session.fixedRoundsDone + 1, session.fixedListTotal))/\(session.fixedListTotal)"),
                    hrCell(session)
                ])
            } else {
                clock
                StrikeList(session: session)
                MetricRow3(cells: [
                    .init(label: "Split", value: lastSplit, ausente: "aún sin vueltas"),
                    .init(label: listUnitLabel, value: "\(session.fixedRoundsDone)/\(session.fixedListTotal)"),
                    hrCell(session)
                ])
            }
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else if capFlip, let cap {
            FormatClockHero(caption: "Cierre del cap",
                            value: Formato.clock(max(0, Double(cap) - session.condElapsed), anchoFijo: true),
                            sub: "cap \(Formato.clock(Double(cap)))",
                            color: Theme.Color.danger, urgent: true)
        } else {
            FormatClockHero(caption: "Tiempo",
                            value: Formato.clock(session.condElapsed, anchoFijo: true),
                            sub: cap.map { "cap \(Formato.clock(Double($0)))" },
                            color: Theme.Color.foreground)
        }
    }

    private var listUnitLabel: String { seg?.formatScheme == .chipper ? "Estación" : "Ronda" }
    /// The block clock at the last strike — the classic For Time split. Nil until
    /// the FIRST strike: antes de la primera vuelta no hay parcial, y una raya ahí
    /// se lee como un parcial de cero (§7).
    private var lastSplit: String? {
        session.fixedRoundSplits.last.map { Formato.clock($0.elapsed) }
    }
    /// How long the LAST STATION took. On a route that is the useful number: the
    /// cumulative stamp is already the clock in the context strip. Nil como arriba.
    private var lastSplitSeconds: String? {
        session.fixedRoundSplits.last.map { Formato.clock($0.seconds) }
    }
}

/// The permanent context of a route: the format, where he is in it, and the BLOCK
/// clock. It exists because the block clock is the score of a For Time, so it can
/// never leave the screen — not when the station becomes the subject, and not when
/// a monitor takes the screen over on an erg station.
struct ForTimeContextStrip: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var cap: Int? { seg?.formatTotalSeconds }
    /// The final minute of a cap counts DOWN and turns red — the same flip the big
    /// clock does, kept here so the urgency survives the strip.
    private var capRemaining: Double? {
        guard let cap else { return nil }
        let r = Double(cap) - session.condElapsed
        return (r <= 60 && r > 0) ? r : nil
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(seg?.formatScheme?.displayName.uppercased() ?? "")
                .font(.system(size: 10, weight: .heavy)).tracking(1.0)
                .foregroundStyle(Theme.Color.accentText)
                .fixedSize()
            Text("\(min(session.fixedRoundsDone + 1, session.fixedListTotal)) de \(session.fixedListTotal)")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Color.faint)
                .fixedSize()
            Spacer(minLength: 6)
            Text(Formato.clock(capRemaining ?? session.condElapsed, anchoFijo: true))
                .font(.system(size: 17, weight: .semibold, design: .monospaced))
                .foregroundStyle(capRemaining != nil ? Theme.Color.danger : Theme.Color.foreground)
                .monospacedDigit()
        }
        .stripChrome()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(seg?.formatScheme?.displayName ?? "Formato"), estación \(min(session.fixedRoundsDone + 1, session.fixedListTotal)) de \(session.fixedListTotal). Tiempo \(Formato.clock(session.condElapsed))")
    }
}

/// THE SUBJECT of a station nothing measures for him: what he has to do, and how
/// long he has been on it.
///
/// It deliberately shows no rep COUNTER. The app does not know how many wall balls
/// he has thrown and will not imply that it does — nobody taps a phone fifty times
/// with a ball in his hands. It knows the clock and which station he is on, because
/// he says so when he moves. That is the whole of what it claims.
private struct StationSubject: View {
    let session: WorkoutSession

    private var tramo: LiveTramo { session.currentTramo }

    var body: some View {
        VStack(spacing: 2) {
            LabelText(text: "Ahora", size: 10)
            Text(tramo.workLine ?? tramo.label)
                .font(.system(size: 64, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .monospacedDigit()
            if tramo.workLine != nil {
                Text(tramo.label)
                    .font(.system(size: 19, weight: .heavy).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            Text("llevas \(Formato.clock(session.tramoElapsedSeconds)) en esta estación")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

/// The recorrer-once / per-round STRIKE list of the count-up formats: a Chipper
/// strikes each station; For Time / Ladder strike each round. The active line is
/// highlighted; tapping it records the split and advances. Reuses the round-strike
/// session actions so a mis-tap is reversible (long-press the active line to undo).
private struct StrikeList: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    /// The list walks the MOVEMENTS once (a chipper, a route) rather than repeating
    /// rounds. One predicate, on the segment, shared with the engine — the rows and
    /// the tramo cursor can never disagree about what a line is.
    private var isStations: Bool { seg?.fixedListIsStations == true }

    // List rows: the movements of a one-pass route, else "Ronda k" with the round's
    // work as detail (the same movement list each round).
    private struct Row: Identifiable { let id: Int; let label: String; let detail: String? }
    private var rows: [Row] {
        guard let seg else { return [] }
        if isStations {
            return seg.declaredComponents.map { c in
                Row(id: c.id,
                    label: c.work.map { "\($0)  \(c.name)" } ?? c.name,
                    detail: c.detail)
            }
        }
        // Per-round rows. A SINGLE-movement For Time shows its work each round
        // ("10 Burpees"); a multi-movement one shows only the movement NAMES — the
        // per-round rep scheme (21-15-9) isn't carried per round, so we never print
        // a rep count that would be wrong for rounds 2+.
        // A bare box clock has no movements to caption the rounds with — the rounds
        // themselves are still the point, so they stay strike-able, just unlabelled.
        let total = session.fixedListTotal
        let declared = seg.declaredComponents
        let detail: String? = {
            if declared.count == 1, let c = declared.first {
                return c.work.map { "\($0) \(c.name)" } ?? c.name
            }
            let names = declared.map(\.name).joined(separator: " · ")
            return names.isEmpty ? nil : names
        }()
        return (0..<total).map { Row(id: $0, label: "Ronda \($0 + 1)", detail: detail) }
    }

    var body: some View {
        CardSurface(padding: 0, topAccent: true) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: isStations ? "El entreno" : "Recorre las rondas", size: 10)
                    Spacer()
                    Text((isStations
                          ? "\(min(session.fixedRoundsDone + 1, session.fixedListTotal)) de \(session.fixedListTotal)"
                          : "marca cada ronda").uppercased())
                        .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                ForEach(rows) { row in
                    Hairline()
                    rowView(row)
                }
            }
        }
    }

    @ViewBuilder
    private func rowView(_ row: Row) -> some View {
        let done = row.id < session.fixedRoundsDone
        let active = row.id == session.fixedRoundsDone
        Button(action: { if active { session.markRoundDone() } }) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.label)
                        .font(.system(size: 14, weight: active ? .heavy : .semibold))
                        .foregroundStyle(done ? Theme.Color.faint : Theme.Color.foreground)
                        .strikethrough(done, color: Theme.Color.faint)
                        .lineLimit(1)
                    if let d = row.detail {
                        Text(d).font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted).lineLimit(1)
                    }
                }
                Spacer(minLength: 6)
                // What this line COST: its real time, and — when a machine measured
                // it — what the machine actually read. This is the whole reason a
                // phone beats a whiteboard, and it is honest about overshoot: a
                // 1.000 m piece closed at 1.014 m reads 1.014 m.
                if let trail = trailing(row.id, done: done, active: active) {
                    Text(trail)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(active ? Theme.Color.accentText : Theme.Color.faint)
                        .lineLimit(1)
                }
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(done ? Theme.Color.ok : (active ? Theme.Color.accentText : Theme.Color.faint))
            }
            .padding(.horizontal, 12).padding(.vertical, 11)
            .background(active ? Theme.Color.accent.opacity(0.08) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!active)
        .simultaneousGesture(LongPressGesture().onEnded { _ in
            if done && row.id == session.fixedRoundsDone - 1 { session.unmarkLastRound() }
        })
        .accessibilityLabel("\(row.label), \(done ? "hecho" : (active ? "actual, toca para marcar" : "pendiente"))")
    }

    /// The trailing number of a line: what a CLOSED one cost (its own time, plus the
    /// measured work when a machine read it), and how long the ACTIVE one has been
    /// running. Pending lines say nothing — there is nothing to say yet.
    private func trailing(_ id: Int, done: Bool, active: Bool) -> String? {
        if done {
            guard id < session.fixedRoundSplits.count else { return nil }
            let s = session.fixedRoundSplits[id]
            let time = Formato.clock(s.seconds)
            guard let work = s.workLine else { return time }
            return "\(work) · \(time)"
        }
        guard active, session.isStationTramo else { return nil }
        return Formato.clock(session.tramoElapsedSeconds)
    }
}

// MARK: - Tabata

struct TabataLiveHUD: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var isCountIn: Bool { session.isCondCountIn }
    private var urgent: Bool { !isCountIn && session.rotPhaseRemaining <= WorkoutSession.emomUrgentThreshold }

    var body: some View {
        VStack(spacing: 12) {
            if !isCountIn { WorkRestBanner(phase: .work) }   // rest has its own screen
            clock
            RotatingWorkCard(
                label: "Trabajo",
                // Sin segmento no hay nombre de movimiento — pero sí sabemos que es
                // la fase de trabajo, que es lo que dice la banda de arriba.
                movement: seg?.primaryMovement ?? "Trabajo",
                next: seg?.formatRestSeconds.map { "Descanso \(Formato.clock(Double($0)))" }
            )
            if !isCountIn {
                RepTallyRow(label: "Reps · ronda \(session.rotRoundIndex + 1)",
                            value: session.rotRepsThisRound,
                            onMinus: { session.tabataAddRep(-1) }, onPlus: { session.tabataAddRep(1) })
            }
            MetricRow3(cells: [
                .init(label: "Total", value: Formato.clock(session.elapsedSeconds, anchoFijo: true)),
                .init(label: "Reps", value: "\(session.rotRepsThisRound)"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else {
            FormatClockHero(
                caption: "Ronda \(session.rotRoundIndex + 1) / \(max(1, session.rotTotalRounds))",
                captionColor: Theme.Color.accentText,
                value: Formato.clock(max(0, session.rotPhaseRemaining), anchoFijo: true),
                sub: cadence,
                color: urgent ? Theme.Color.accentText : Theme.Color.foreground,
                urgent: urgent
            )
        }
    }

    private var cadence: String {
        let w = seg?.formatWorkSeconds.map { "\($0)s work" }
        let r = seg?.formatRestSeconds.map { "\($0)s rest" }
        return [w, r].compactMap { $0 }.joined(separator: " · ")
    }
}

// MARK: - Intervals / Series

struct IntervalsLiveHUD: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var isCountIn: Bool { session.isCondCountIn }
    private var urgent: Bool {
        !isCountIn && session.rotPhaseRemaining > 0 && session.rotPhaseRemaining <= WorkoutSession.emomUrgentThreshold
    }

    var body: some View {
        VStack(spacing: 12) {
            if !isCountIn { WorkRestBanner(phase: .work) }   // rest has its own screen
            clock
            RotatingWorkCard(
                label: "Esta serie",
                // Sin segmento no hay nombre de movimiento — pero sí sabemos que es
                // la fase de trabajo, que es lo que dice la banda de arriba.
                movement: seg?.primaryMovement ?? "Trabajo",
                work: seg?.targetDistanceMeters.flatMap { Formato.distancia($0) },
                next: seg?.formatRestSeconds.map { "Descanso \(Formato.clock(Double($0)))" }
            )
            MetricRow3(cells: [
                .init(label: "Total", value: Formato.clock(session.elapsedSeconds, anchoFijo: true)),
                .init(label: "Series", value: "\(session.rotRoundIndex + 1)/\(max(1, session.rotTotalRounds))"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else if seg?.kind == .running && session.rotPhaseRemaining <= 0 {
            // Distance-based run bout (no fixed duration): show live pace vs target.
            VStack(spacing: 8) {
                let lectura = lecturaDeRitmo
                FormatClockHero(
                    caption: lectura.caption,
                    captionColor: Theme.Color.accentText,
                    value: lectura.value, sub: lectura.unidad,
                    color: session.liveCoveredPaceSecPerKm != nil ? Theme.Color.accentText : Theme.Color.foreground
                )
                PaceTargetBar(session: session)
            }
        } else {
            FormatClockHero(
                caption: serieCaption,
                captionColor: Theme.Color.accentText,
                value: Formato.clock(max(0, session.rotPhaseRemaining), anchoFijo: true),
                color: urgent ? Theme.Color.accentText : Theme.Color.foreground,
                urgent: urgent
            )
        }
    }

    private var serieCaption: String {
        "Serie \(session.rotRoundIndex + 1) / \(max(1, session.rotTotalRounds))"
    }

    /// LA SIGUIENTE VERDAD DISPONIBLE: el ritmo si ya se ha medido, y si no el reloj
    /// de la serie, que es lo único que la app sabe con certeza.
    ///
    /// Etiqueta, cifra y unidad viajan JUNTAS a propósito. Antes esto caía al ritmo
    /// OBJETIVO: la prescripción se pintaba en el hueco del ritmo en vivo, con el
    /// «/km» debajo, y lo único que las separaba era el color. Corriendo, el color
    /// no se lee — y el número que salía era justo el que esperabas ver, así que el
    /// error era invisible (§7). Mismo criterio que `OutdoorRunHUDView.lecturaViva`.
    private var lecturaDeRitmo: (caption: String, value: String, unidad: String?) {
        guard let p = session.liveCoveredPaceSecPerKm else {
            return ("\(serieCaption) · \(Vocab.tiempo.lowercased())",
                    Formato.clock(session.tramoElapsedSeconds, anchoFijo: true), nil)
        }
        return (serieCaption, Formato.ritmoCifras(Double(p)), Formato.UnidadRitmo.porKm.rawValue)
    }
}

// MARK: - Death By

struct DeathByLiveHUD: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var isCountIn: Bool { session.isCondCountIn }
    private var urgent: Bool { !isCountIn && session.rotPhaseRemaining <= WorkoutSession.emomUrgentThreshold }

    var body: some View {
        VStack(spacing: 12) {
            clock
            targetCard
            MetricRow3(cells: [
                .init(label: "Total", value: Formato.clock(session.elapsedSeconds, anchoFijo: true)),
                .init(label: "Ronda", value: "\(session.rotRoundIndex + 1)"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else {
            FormatClockHero(
                caption: "Minuto \(session.rotRoundIndex + 1)",
                captionColor: Theme.Color.accentText,
                value: Formato.clock(max(0, session.rotPhaseRemaining), anchoFijo: true),
                sub: "cada \(Formato.clock(seg?.formatWorkSeconds ?? 60, subMinuto: .segundos)) · objetivo +\(seg?.deathByIncrement ?? 1)/min",
                color: urgent ? Theme.Color.accentText : Theme.Color.foreground,
                urgent: urgent
            )
        }
    }

    private var targetCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(session.deathByTarget)")
                        .font(.system(size: 46, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.accentText)
                        .contentTransition(.numericText())
                    Text(seg?.primaryMovement ?? "reps")
                        .scaledFont(15, weight: .heavy, relativeTo: .body, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                }
                LabelText(text: "Objetivo de este minuto", size: 10)
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityLabel("Objetivo de este minuto, \(session.deathByTarget) \(seg?.primaryMovement ?? "repeticiones")")
    }
}

// MARK: - Steady

struct SteadyLiveHUD: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var total: Int? { seg?.formatTotalSeconds }
    private var isCountIn: Bool { session.isCondCountIn }

    var body: some View {
        VStack(spacing: 12) {
            clock
            paceCard
            MetricRow3(cells: [
                .init(label: "Media", value: avgPace, unit: Formato.UnidadRitmo.porKm.rawValue,
                      ausente: "aún sin recorrido"),
                .init(label: "% zona", value: session.liveZonePctInTarget.map { "\($0)" }, unit: "%",
                      ausente: "sin reloj"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else {
            VStack(spacing: 8) {
                FormatClockHero(
                    caption: total != nil ? "Restante" : "Tiempo",
                    value: total != nil
                        ? Formato.clock(max(0, session.condRemaining), anchoFijo: true)
                        : Formato.clock(session.condElapsed, anchoFijo: true),
                    sub: total.map { "de \(Formato.clock(Double($0)))" },
                    color: Theme.Color.foreground
                )
                PaceTargetBar(session: session)
            }
        }
    }

    private var paceCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Ritmo en vivo", color: Theme.Color.accentText, size: 10)
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    if let livePace {
                        Text(livePace)
                            .font(Theme.Typography.readoutS).monospacedDigit()
                            .foregroundStyle(Theme.Color.foreground)
                        Text(Formato.UnidadRitmo.porKm.rawValue).font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.Color.muted)
                    } else {
                        // La unidad se va con el número: un «/km» solo, al lado de
                        // nada, sigue prometiendo un ritmo que no tenemos (§7).
                        Text("aún sin recorrido")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Spacer(minLength: 0)
                    if let d = session.liveRunDistanceMeters, d > 0,
                       let recorrido = Formato.distanciaCubierta(d) {
                        Text(recorrido)
                            .font(.system(size: 13, weight: .heavy, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// El ritmo MEDIDO, o nil. Nunca «—:—»: quien pinta dice por qué no lo hay.
    private var livePace: String? {
        session.liveCoveredPaceSecPerKm.map { Formato.ritmoCifras(Double($0)) }
    }

    /// La media REAL del tramo (lo recorrido entre lo que llevas).
    ///
    /// Antes caía al ritmo OBJETIVO cuando no había medida: pintaba la prescripción
    /// en el hueco de la media, con su misma etiqueta y su misma unidad. Eso es
    /// fabricar un dato del atleta (§7) — y encima es invisible, porque el número
    /// que sale es exactamente el que esperabas ver. El objetivo ya se pinta aparte.
    private var avgPace: String? {
        session.liveCoveredPaceSecPerKm.map { Formato.ritmoCifras(Double($0)) }
    }
}

// MARK: - Structured run (#61)

/// The live face of a folded run block that carries a `structure`: the flat leg
/// cursor rendered one work/recovery bout at a time, each with its OWN measure,
/// objetivo (the server-resolved pace band) and prescribed inclinación / cadencia.
/// A TIME leg counts DOWN and auto-rolls; a DISTANCE leg shows live covered pace vs
/// target and is closed by the belt (auto) or "TRAMO HECHO" (manual — there is no
/// live phone GPS yet, so a distance leg without a belt is never left waiting).
/// Reuses the shared FORMAT atoms so it reads with the same instrument voice as the
/// other timers; the LEGACY rotating HUDs stay untouched.
struct StructuredRunLiveHUD: View {
    let session: WorkoutSession

    private var leg: RunLeg? { session.currentRunLeg }
    private var isCountIn: Bool { session.isRunCountIn }
    private var isWork: Bool { session.isRunLegWork }
    private var isTimed: Bool { leg?.isTimed ?? false }
    private var urgent: Bool {
        !isCountIn && isTimed && session.runLegRemaining > 0
            && session.runLegRemaining <= WorkoutSession.emomUrgentThreshold
    }

    var body: some View {
        VStack(spacing: 12) {
            if !isCountIn { WorkRestBanner(phase: isWork ? .work : .rest) }
            clock
            workCard
            if let guide = guideLine {
                Text(guide)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity)
            }
            MetricRow3(cells: [
                .init(label: "Total", value: Formato.clock(session.elapsedSeconds, anchoFijo: true)),
                .init(label: "Tramo", value: "\(session.runLegNumber)/\(session.runLegTotal)"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if isCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.runCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else if isTimed {
            // TIME leg — count DOWN; the session's clock auto-rolls it at zero.
            FormatClockHero(
                caption: legCaption,
                captionColor: Theme.Color.accentText,
                value: Formato.clock(max(0, session.runLegRemaining), anchoFijo: true),
                color: urgent ? Theme.Color.accentText : Theme.Color.foreground,
                urgent: urgent
            )
        } else {
            // DISTANCE / open leg — live covered pace vs the objetivo band; closed by
            // the belt or a manual "TRAMO HECHO".
            VStack(spacing: 8) {
                let lectura = lecturaDeRitmo
                FormatClockHero(
                    caption: lectura.caption,
                    captionColor: Theme.Color.accentText,
                    value: lectura.value, sub: lectura.unidad,
                    color: session.liveCoveredPaceSecPerKm != nil ? Theme.Color.accentText : Theme.Color.foreground
                )
                if isWork, let objetivo = leg?.objetivoLabel {
                    HStack(spacing: 4) {
                        Text("objetivo").font(.system(size: 10)).foregroundStyle(Theme.Color.faint)
                        Text(objetivo)
                            .font(.system(size: 11, weight: .heavy, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var workCard: some View {
        RotatingWorkCard(
            label: isWork ? "Este tramo" : "Recuperación",
            movement: session.currentSegment?.primaryMovement ?? "Correr",
            work: legWork,
            detail: isWork ? leg?.objetivoLabel : recoveryModeLabel,
            next: nextLegLabel
        )
    }

    private var legCaption: String {
        isWork ? "Tramo \(session.runLegNumber) / \(session.runLegTotal)"
               : "Descanso · tramo \(session.runLegNumber) / \(session.runLegTotal)"
    }

    /// El ritmo medido del tramo, y si aún no lo hay el RELOJ del tramo.
    ///
    /// Antes caía al ritmo objetivo del leg — que ya se pinta justo debajo, con su
    /// etiqueta «objetivo». O sea que el mismo número salía dos veces y el de arriba
    /// se leía como lo que estabas corriendo (§7). El reloj no miente y siempre está.
    private var lecturaDeRitmo: (caption: String, value: String, unidad: String?) {
        guard let p = session.liveCoveredPaceSecPerKm else {
            return ("\(legCaption) · \(Vocab.tiempo.lowercased())",
                    Formato.clock(session.runLegElapsed, anchoFijo: true), nil)
        }
        return (legCaption, Formato.ritmoCifras(Double(p)), Formato.UnidadRitmo.porKm.rawValue)
    }

    /// The leg's OWN measure ("800 m" / "3:00"), the per-bout value the scalar path
    /// could not carry for a heterogeneous pyramid.
    private var legWork: String? {
        guard let leg else { return nil }
        if let m = leg.distanceMeters { return Formato.distancia(Double(m)) }
        if let s = leg.durationSeconds { return Formato.clock(Double(s)) }
        return nil
    }

    /// PRESCRIBED inclinación / cadencia — a sober reference line, shown only when
    /// the coach set them.
    private var guideLine: String? {
        guard let leg else { return nil }
        var parts: [String] = []
        if let inc = leg.inclinePct, inc > 0 {
            parts.append("Inclinación \(Formato.esDecimal(inc))%")
        }
        if let cad = leg.cadenceSpm { parts.append("Cadencia \(cad) \(Vocab.cadencia)") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var recoveryModeLabel: String? {
        switch leg?.recoveryMode {
        case .trote:   return "trote suave"
        case .caminar: return "caminando"
        case .parado:  return "parado"
        case .none:    return nil
        }
    }

    private var nextLegLabel: String? {
        guard let legs = session.currentRunLegs else { return nil }
        let i = session.runLegIndex + 1
        guard i < legs.count else { return session.isLastSegment ? nil : "Siguiente bloque" }
        let n = legs[i]
        let measure: String = n.distanceMeters.flatMap { Formato.distancia(Double($0)) }
            ?? n.durationSeconds.map { Formato.clock(Double($0)) }
            ?? ""
        return n.isWork ? "Serie \(measure)".trimmingCharacters(in: .whitespaces)
                        : "Descanso \(measure)".trimmingCharacters(in: .whitespaces)
    }
}
