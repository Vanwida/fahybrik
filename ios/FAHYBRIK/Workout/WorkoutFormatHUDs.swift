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
//
// AQUÍ VIVÍAN CINCO PANTALLAS MÁS, Y SE FUERON EL 5-AGO (ver
// docs/entreno-vista-por-vista.html, «Lo que sobra»): `TabataLiveHUD`,
// `IntervalsLiveHUD`, `DeathByLiveHUD`, `SteadyLiveHUD` y `StructuredRunLiveHUD`.
// Ninguna tenía diseño detrás, y entre ellas y los dos HUD de correr había SEIS
// superficies capaces de pintar el mismo tramo de carrera —dos de ellas vivas a la
// vez, una debajo del `fullScreenCover` de la otra—, así que el atleta veía datos
// distintos según por dónde entrase.
//
// La regla que lo hace imposible: UNA VISTA POR LO QUE ESTÁS HACIENDO. Correr lo
// pintan `OutdoorRunHUDView` y `TreadmillHUDView`, y ahora son superficies vivas
// (`ActiveWorkoutView.superficieViva`), no covers: la serie, el rodaje y el tramo
// estructurado son la MISMA pantalla, elegida por dónde contestaste que corres.
// El descanso de cualquier motor sigue siendo `RestSurface`, y el ergo
// `ErgHUDContent`.

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

// Con las cinco pantallas se fueron sus piezas: `WorkRestBanner` (la banda
// trabajo/descanso), `RotatingWorkCard` (la tarjeta «esta serie · luego…») y
// `PaceTargetBar` (el ritmo objetivo). Eran atajos de los formatos rotativos, y
// los dos que quedan —AMRAP y la ruta— no los usan: su descanso ya es
// `RestSurface` y su objetivo lo pinta la superficie que mide.

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
