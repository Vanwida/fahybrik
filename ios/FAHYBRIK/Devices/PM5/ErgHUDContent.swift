import SwiftUI
import UIKit

// THE erg work surface — the ONE view the athlete sees for row / ski / bike work,
// in both orientations, whether the piece stands alone or lives inside a format.
//
// IT IS DRIVEN BY THE TRAMO, NOT BY THE SEGMENT. A 250 m ski round inside an EMOM
// is erg work and gets this surface; the format it lives in becomes the context
// strip on top. Before that, the same monitor showed a full HUD when the piece was
// alone and a generic timer with no erg data at all the moment a format wrapped
// it — the athlete's numbers appeared and disappeared depending on paperwork.
//
// WHAT IT SHOWS, AND WHY IN THIS ORDER. Read from three metres, phone on the floor,
// mid-piece, the questions are: am I on pace → how much is left → which serie is
// this → how hard am I working. So:
//   1 context strip   SERIE 2/5 · 500 m remo · luego descanso 1:30
//   2 goal            what is LEFT (the number that matters mid-piece) + a bar
//   3 hero            the split /500 m, the biggest thing on the screen
//   4 work rail       three tiles only: s/min · vatios · pulso
// Everything else the monitor knows (calorías, cal/h, drag, media, proyección)
// folds away while working and comes back at rest, when there are eyes for it.
//
// ONE VIEW, TWO ARRANGEMENTS. Rotating the phone re-lays this same component out:
// portrait stacks goal / hero / rail; landscape puts goal and rail either side of
// a bigger hero. Read-only — the PM5's resistance is the physical damper.
struct ErgHUDContent: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore
    @Environment(\.verticalSizeClass) private var vSizeClass
    private var isLandscape: Bool { vSizeClass == .compact }

    private var live: PM5LiveSample { pm5.live }
    private var tramo: LiveTramo { session.currentTramo }

    var body: some View {
        VStack(spacing: isLandscape ? 8 : Theme.Spacing.m) {
            // Landscape hides the workout chrome so the numbers own the screen —
            // the leg title has to travel with the HUD there.
            if isLandscape { header }
            contextStrip
            // The programming banner first (it explains a silent monitor better than
            // the generic hint); the no-data hint only when nothing is in flight.
            PM5ProgramBanner(pm5: pm5)
            if pm5.isConnected, noLiveData, pm5.programAnnouncement == nil { noDataHint }
            // Three states, three subjects. Counting in: the count. No monitor: the
            // work you have been given. Working: the split. Each one is the largest
            // thing on the screen while it is true — a hero holding a placeholder
            // through a count-in, or through a piece with no machine paired, is a
            // readout pretending to read something.
            if session.isTramoCountIn {
                countInBody
            } else if !pm5.isConnected {
                unmeasuredBody
            } else if isLandscape {
                landscapeBody
            } else {
                portraitBody
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Counting in

    /// The 3-2-1 owns the screen while it runs. The athlete is sitting on the erg
    /// with his hands on the handle: the only number that exists is the count.
    private var countInBody: some View {
        VStack(spacing: 6) {
            Spacer(minLength: 0)
            Text("\(Int(session.tramoCountInRemaining.rounded(.up)))")
                .font(.system(size: isLandscape ? 150 : 190, weight: .heavy, design: .monospaced)
                    .monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
                .lineLimit(1).minimumScaleFactor(0.4)
                .contentTransition(.numericText())
            if let work = tramo.workLine {
                Text(work.uppercased())
                    .font(.system(size: 20, weight: .heavy, design: .default).italic())
                    .tracking(1)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Empieza en \(Int(session.tramoCountInRemaining.rounded(.up)))")
    }

    // MARK: - No monitor

    /// No machine paired (or it dropped). The prescription is still true, so THAT is
    /// the subject: what the athlete has to do. Live figures are simply absent — a
    /// rail of em-dashes reads as a broken app rather than as an honest silence.
    /// Meters already covered before a drop are kept: they really happened.
    private var unmeasuredBody: some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer(minLength: 0)
            VStack(spacing: 6) {
                Text(tramo.workLine ?? tramo.label)
                    .font(.system(size: isLandscape ? 64 : 76, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.4)
                if tramo.workLine != nil {
                    Text(tramo.label.uppercased())
                        .font(.system(size: 15, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            if let covered = session.tramoErgDistanceMeters, covered >= 1 {
                Text("\(Int(covered)) m antes de perder el monitor")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                Image(systemName: "antenna.radiowaves.left.and.right.slash")
                    .font(.system(size: 14, weight: .semibold))
                Text("Sin monitor. Puedes hacerlo igual, pero no se medirá solo.")
                    .font(.system(size: 13, weight: .medium))
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.warningTint)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Header (landscape only — portrait has the workout's own top strip)

    private var header: some View {
        HStack(spacing: 8) {
            Text(tramo.label)
                .font(.system(size: 12, weight: .heavy, design: .default).italic())
                .tracking(0.4)
                .foregroundStyle(Theme.Color.accentText)
                .lineLimit(1)
            if let obj = objectiveLine {
                Text(obj)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - 1 · Context strip (which serie, what work, what follows)

    /// "SERIE 2/5 · 500 m remo · luego descanso 1:30" — one thin line. Absent for a
    /// single continuous piece, where there is no series to count and the strip
    /// would only repeat the top bar.
    @ViewBuilder
    private var contextStrip: some View {
        if session.isStationTramo {
            // A station of a route. The monitor has earned the screen, but the BLOCK
            // clock is the score of a For Time — it cannot vanish just because the
            // athlete reached the rower. Same strip the route's own HUD shows, so
            // arriving at the erg changes the numbers, never the frame.
            ForTimeContextStrip(session: session)
        } else if session.isTramoCountIn {
            HStack(spacing: 8) {
                LabelText(text: "Prepárate", color: Theme.Color.accentText, size: 10)
                if hasSeries {
                    Text("SERIE \(session.tramoRoundIndex + 1)/\(max(1, session.tramoRoundTotal))")
                        .font(.system(size: 11, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 0)
            }
            .stripChrome()
        } else if hasSeries {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("SERIE \(session.tramoRoundIndex + 1)/\(max(1, session.tramoRoundTotal))")
                    .font(.system(size: 11, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(Theme.Color.accentText)
                    .fixedSize()
                Text(prescriptionLine)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 0)
            }
            .stripChrome()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Serie \(session.tramoRoundIndex + 1) de \(max(1, session.tramoRoundTotal)). \(prescriptionLine)")
        }
    }

    /// What this window is + what follows it.
    private var prescriptionLine: String {
        let thisOne = [tramo.workLine, tramo.label].compactMap { $0 }.joined(separator: " ")
        let restSeconds: Int? = session.currentSegment?.formatRestSeconds
        let rest: String? = restSeconds.map {
            "luego descanso \(Formato.clock(Double($0)))"
        }
        return [thisOne.isEmpty ? nil : thisOne, rest].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: - Arrangements

    private var landscapeBody: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 8) {
                goalBox
                Spacer(minLength: 0)
            }
            .frame(width: 190)

            VStack(spacing: 0) {
                Spacer(minLength: 0)
                heroCard(splitSize: 132)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 8) {
                workRail
                Spacer(minLength: 0)
            }
            .frame(width: 128)
        }
        .frame(maxHeight: .infinity)
    }

    private var portraitBody: some View {
        VStack(spacing: Theme.Spacing.m) {
            goalBox
            // The hero EARNS the slack: whatever height the screen has left after
            // the strip, the goal and the rail belongs to the number the athlete is
            // steering by. This is what used to be dead space above a 4 px bar.
            heroCard(splitSize: 96)
                .frame(maxHeight: .infinity)
            HStack(spacing: 8) { workRail }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 2 · The goal (what is LEFT, plus a bar you can see)

    /// Mid-piece nobody wants "how much have I done"; they want how much is LEFT.
    /// So the big figure counts DOWN to the tramo's goal and the covered/target
    /// reads underneath. No goal → no bar and no invented denominator: a single
    /// honest "metros" readout instead.
    @ViewBuilder
    private var goalBox: some View {
        if let goal = goalReadout {
            VStack(spacing: 7) {
                HStack(alignment: .lastTextBaseline, spacing: 5) {
                    Text(goal.remaining)
                        .font(.system(size: 40, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(goal.done ? Theme.Color.ok : Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.4)
                    Text(goal.unit)
                        .font(.system(size: 15, weight: .heavy, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                    Spacer(minLength: 0)
                    Text(goal.covered)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.Color.surfaceSunken)
                        Capsule()
                            .fill(goal.done ? Theme.Color.ok : Theme.Color.accent)
                            .frame(width: max(0, geo.size.width * goal.fraction))
                    }
                }
                .frame(height: 12)
                HStack(spacing: 8) {
                    Text(goal.done ? "HECHO" : "TE QUEDAN")
                        .font(.system(size: 10, weight: .heavy)).tracking(1.2)
                        .foregroundStyle(goal.done ? Theme.Color.ok : Theme.Color.muted)
                    Spacer(minLength: 0)
                    // The session's running total alongside the round's own goal. The
                    // goal above is what he is chasing NOW (the prescription says the
                    // 500 is per serie); this is everything the monitor has measured
                    // in this block. Silent when the two are the same number.
                    if let total = session.accumulatedErgLine {
                        Text(total)
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.faint)
                            .lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(goal.done ? "Objetivo completado" : "Te quedan \(goal.remaining) \(goal.unit)")
        } else {
            // Metros cubiertos SIN objetivo: un contador, y un contador se pinta en
            // cero (§6.2 bis). Nunca falta — por eso aquí no hay hueco que declarar.
            railTile(valor: "\(Int(coveredMeters))", label: "metros", valueSize: 34)
        }
    }

    /// The one goal readout, whatever the tramo measures. Distance first (the erg
    /// case that matters), then calories, then a time box. nil = nothing prescribed.
    private var goalReadout: (remaining: String, unit: String, covered: String,
                              fraction: Double, done: Bool)? {
        if let target = tramo.targetDistanceMeters {
            let covered = coveredMeters
            let left = max(0, target - covered)
            return ("\(Int(left.rounded()))", "m",
                    "\(Int(covered)) / \(Int(target)) m",
                    min(1, covered / target), left <= 0)
        }
        if let target = tramo.targetCalories, let covered = session.tramoErgCalories {
            let left = max(0, target - covered)
            return ("\(left)", "cal", "\(covered) / \(target) cal",
                    min(1, Double(covered) / Double(target)), left <= 0)
        }
        if let boxed = tramo.boxedSeconds, boxed > 0, let remaining = session.tramoWorkRemaining {
            let fraction = min(1, max(0, (Double(boxed) - remaining) / Double(boxed)))
            return (Formato.clock(remaining, anchoFijo: true), "",
                    "de \(Formato.clock(Double(boxed)))",
                    fraction, remaining <= 0)
        }
        return nil
    }

    // MARK: - 3 · Hero (the split — the number you steer by)

    /// El sujeto es el split. Y cuando no hay split, el sujeto no es un split falso:
    /// a palada parada el ritmo no existe (no es cero, es que no lo hay), así que el
    /// hueco dice POR QUÉ y la unidad «/500m» se va con él — una unidad sola bajo una
    /// frase es el resto de un número que ya no está.
    private func heroCard(splitSize: CGFloat) -> some View {
        CardSurface(padding: Theme.Spacing.m, topAccent: true, elevated: true) {
            VStack(spacing: 4) {
                LabelText(text: "Split · real", size: 10)
                if let split = splitString {
                    Text(split)
                        .font(.system(size: splitSize, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.4)
                    Text(Formato.UnidadRitmo.por500m.rawValue)
                        .font(Theme.Typography.readoutLabel)
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    Text(sinSplitMotivo)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .lineLimit(2).minimumScaleFactor(0.7)
                        .frame(height: splitSize * 0.6)
                }
                Hairline()
                HStack(spacing: 8) {
                    subReadout(valor: avgSplitString, label: "media /500m",
                               ausente: sinSplitMotivo)
                    subReadout(valor: Formato.clock(session.tramoElapsedSeconds),
                               label: tramoTimeLabel)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// POR QUÉ no hay split. Antes de la primera palada el monitor no ha dicho nada;
    /// después, un split ausente significa que ahora mismo no estás remando — que es
    /// un hecho sobre ti, no un fallo de la app.
    private var sinSplitMotivo: String {
        noLiveData ? sinLecturaMotivo : "sin remar"
    }

    /// The bout clock is labelled for what it is. While it is HELD waiting for the
    /// first stroke it says so, instead of showing a 00:00 that looks broken — the
    /// athlete taps Empezar, walks to the erg and sits down, and none of that is
    /// part of the piece.
    private var tramoTimeLabel: String {
        session.tramoClockArmed ? "empieza al remar" : "esta serie"
    }

    private func subReadout(valor: String?, label: String,
                            ausente: String? = nil) -> some View {
        VStack(spacing: 2) {
            if let valor {
                Text(valor)
                    .font(.system(size: 30, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
            } else {
                Text(ausente ?? sinLecturaMotivo)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .frame(height: 30)
            }
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(0.6)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(valor ?? ausente ?? sinLecturaMotivo)")
    }

    // MARK: - 4 · Work rail (three tiles, big enough to read from the floor)

    /// Ritmo, potencia, pulso. That is what changes stroke to stroke and that is
    /// all. Calorías, cal/h, drag, media and proyección used to sit here as eight
    /// 21 pt tiles nobody could read mid-piece; they are pre-start / rest data and
    /// they now live there.
    @ViewBuilder
    private var workRail: some View {
        // Paladas y vatios llegan EN CERO cuando dejas de tirar, y ese cero se pinta:
        // está medido (§6.2 bis). Sólo son nil antes de la primera palada, y entonces
        // se dice eso mismo. El pulso no es del monitor: falta cuando no hay de dónde.
        railTile(valor: spm.map { "\($0)" }, label: "s/min", valueSize: 32,
                 ausente: sinLecturaMotivo)
        railTile(valor: watts.map { "\($0)" }, label: "vatios",
                 color: Theme.Color.accentText, valueSize: 32,
                 ausente: sinLecturaMotivo)
        railTile(valor: session.liveHRBpm.map { "\($0)" }, label: "pulso",
                 color: session.liveZone?.color ?? Theme.Color.foreground, valueSize: 32,
                 ausente: "sin banda ni reloj")
    }

    /// POR QUÉ el monitor no da una lectura. Aquí SIEMPRE está conectado (un monitor
    /// caído se lleva `unmeasuredBody`), así que la única razón posible es que todavía
    /// no ha llegado nada suyo: la primera palada es lo que lo arranca.
    private var sinLecturaMotivo: String { "esperando la primera palada" }

    /// `valor` nil = no hay medida, y entonces se pinta el porqué — mismo contrato que
    /// `ApoyoVivo` (Theme/LenguajeVivoUI.swift), en la voz de esta superficie.
    private func railTile(valor: String?, label: String,
                          color: Color = Theme.Color.foreground,
                          valueSize: CGFloat = 21,
                          ausente: String? = nil) -> some View {
        VStack(spacing: 2) {
            if let valor {
                Text(valor)
                    .font(.system(size: valueSize, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(color)
                    .lineLimit(1).minimumScaleFactor(0.5)
            } else {
                Text(ausente ?? sinLecturaMotivo)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .frame(height: valueSize)
            }
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy)).tracking(0.7)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 11)
        .padding(.horizontal, 4)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(valor ?? ausente ?? sinLecturaMotivo)")
    }

    private var noDataHint: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
            Text("Conectado, pero el PM5 aún no envía datos. Dale unas paladas.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    // MARK: - Derived

    /// True when this really is a series worth counting — otherwise the strip is
    /// silent rather than showing a fake "SERIE 1/1".
    private var hasSeries: Bool { session.tramoRoundTotal > 1 }

    private var noLiveData: Bool {
        live.paceSecondsPer500m == nil && live.powerWatts == nil && (live.distanceMeters ?? 0) <= 0
    }
    /// El split y su media. nil = no hay medida, y quien pinta decide qué dice en su
    /// lugar; devolver un centinela obligaba al héroe a enseñarlo como si fuera un
    /// ritmo (§7). El monitor manda 0 cuando no te mueves y el decodificador lo pasa a
    /// nil, que es lo correcto: a palada parada el ritmo no existe.
    private var splitString: String? {
        guard pm5.isConnected, let p = live.paceSecondsPer500m, p > 0 else { return nil }
        return Formato.ritmoCifras(p)
    }
    private var avgSplitString: String? {
        guard pm5.isConnected, let p = live.avgPaceSecondsPer500m, p > 0 else { return nil }
        return Formato.ritmoCifras(p)
    }

    private var watts: Int? { pm5.isConnected ? live.powerWatts : nil }
    private var spm: Int? { pm5.isConnected ? live.strokeRate : nil }

    /// Meters covered IN THIS TRAMO — the bout's own window, so serie 2 of a 5×500
    /// starts at zero instead of carrying serie 1's metres into its goal. NOT gated
    /// on the link: metres already covered stay true if the monitor drops.
    ///
    /// No es opcional a propósito: es un CONTADOR y empieza en cero. Lo era, y el cero
    /// viajaba envuelto en un `Double?` que nunca era nil — un opcional de mentira que
    /// obligaba a cada callsite a inventarse un valor por si acaso (y uno se inventaba
    /// un guion).
    private var coveredMeters: Double { session.tramoErgDistanceMeters ?? 0 }

    private var objectiveLine: String? {
        if let d = tramo.targetDistanceMeters { return "\(Int(d)) m" }
        if let c = tramo.targetCalories { return "\(c) cal" }
        if let w = session.currentSegment?.targetPowerWatts { return "\(w) W" }
        return nil
    }
}

// `stripChrome()` — the shared context-strip chrome — lives in Theme/Atoms.swift:
// the erg surface and the route's own strip are the same object on screen, so they
// are the same modifier in code.
