import SwiftUI

// The wrist HUD for MIRROR MODE. Every value is frame-driven — the phone's engine
// is the single authority; this screen renders its pushed snapshot and re-bases the
// clock locally between frames. Two pages (TabView .page): the LIVE glance (default)
// and a thin CONTROLS page. Layout borrows the standalone live idiom (LiveScaffold,
// the zone bar from ContinuousLiveView, the rest banner's green take-over) so the
// two modes read identically on the wrist.
struct MirrorHUDView: View {
    let controller: MirrorSessionController

    // 0 = live (default) · 1 = controls (one swipe away).
    @State private var page = 0
    @State private var lastZoneHapticAt: Date = .distantPast

    var body: some View {
        TabView(selection: $page) {
            livePage.tag(0)
            controlsPage.tag(1)
        }
        .tabViewStyle(.page)
    }

    // MARK: - Live page

    private var livePage: some View {
        ZStack {
            if controller.state == .ending || phase == MirrorWire.Phase.finished {
                savingOverlay
            } else if phase == MirrorWire.Phase.gate {
                gateContent
            } else if phase == MirrorWire.Phase.countIn {
                countInContent
            } else {
                // #56 — a HYROX dobles station renders the TURN hero (whose station +
                // the rep reparto) in place of the generic work line; a live treadmill
                // distance run renders the belt ring (covered/target + pace); individual
                // work keeps the standard active glance.
                if let dobles = frame?.dobles {
                    doblesContent(dobles)
                } else if let covered = frame?.beltDistanceM {
                    treadmillContent(covered: covered, target: frame?.beltTargetM)
                } else {
                    activeContent
                }
                if phase == MirrorWire.Phase.paused {
                    pausedOverlay
                } else if let rest = frame?.restRemaining {
                    restOverlay(base: rest)
                }
            }
        }
        // Out-of-zone nudge — same throttle as the standalone continuous screen, and
        // only while actually working (never on a gate / pause / rest).
        .onChange(of: controller.liveZone) { _, zone in
            guard phase == MirrorWire.Phase.active,
                  let target = targetZone, let zone, zone != target,
                  Date().timeIntervalSince(lastZoneHapticAt) >= WatchTheme.zoneExitHapticThrottle else { return }
            lastZoneHapticAt = Date()
            WatchHaptics.warning()
        }
        // #56 — "entras tú": the station flipped from the partner's relay back to the
        // athlete (partner → mine/split). Fire the double handoff haptic so a resting
        // athlete knows to go, even without looking at the wrist.
        .onChange(of: frame?.dobles?.role) { old, new in
            guard phase == MirrorWire.Phase.active,
                  old == "partner", new == "mine" || new == "split" else { return }
            WatchHaptics.relayHandoff()
        }
    }

    private var gateContent: some View {
        LiveScaffold {
            VStack(spacing: 8) {
                Text(frame?.blockTitle ?? "Bloque")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                WatchLabel(text: "Listo para empezar", accent: true)
            }
        } bottom: {
            advanceButton
        }
    }

    // The structured-run 3-2-1 pre-roll, rendered like the standalone view
    // (StructuredRunLiveView.countIn): "Prepárate" + a CEIL count-in re-based locally,
    // with the first tramo (frame.lineTitle) as the "luego" preview. No bottom button —
    // the count-in isn't skippable from the mirrored wrist (matches standalone).
    private var countInContent: some View {
        LiveScaffold(status: frame?.blockTitle) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 6) {
                    WatchLabel(text: "Prepárate")
                    GiantNumber(text: countInText(context.date), size: 84, color: WatchTheme.orange)
                    if let next = frame?.lineTitle {
                        Text(next)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(WatchTheme.dim)
                            .padding(.top, 1)
                    }
                }
            }
        }
    }

    private var activeContent: some View {
        LiveScaffold(status: frame?.blockTitle) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 6) {
                    if let line = frame?.lineTitle {
                        Text(line)
                            .font(.system(size: 15, weight: .heavy))
                            .foregroundStyle(WatchTheme.ink)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                    }
                    GiantNumber(text: heroClock(context.date), size: 56)
                    if let detail = frame?.detailLine {
                        Text(detail)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(WatchTheme.dim)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                    }
                    if let progress = frame?.progressText {
                        WatchLabel(text: progress)
                    }
                    hrZoneRow
                }
            }
        } bottom: {
            advanceButton
        }
    }

    // MARK: - Dobles turn (#56)
    //
    // The wrist glance for a HYROX dobles station: whose turn it is (orange = you, blue
    // = the partner), the station, the rep reparto and — for the partner's relay — a
    // "Recupera" cue. Same clock + HR + advance idiom as activeContent so it never reads
    // like a different mode. Every value is frame-pushed (MirrorDoblesTurn); nothing
    // fabricated. The button reads "Relevo ▸" on the partner's relay.
    private func doblesContent(_ d: MirrorDoblesTurn) -> some View {
        let isPartner = d.role == "partner"
        let accent = isPartner ? WatchTheme.zoneBlue : WatchTheme.orange
        return LiveScaffold(status: frame?.blockTitle) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 5) {
                    Text(doblesHeading(d))
                        .font(.system(size: 12, weight: .heavy).italic())
                        .tracking(1.2)
                        .foregroundStyle(accent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(d.station)
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundStyle(WatchTheme.ink)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    if let reps = doblesRepsLine(d) {
                        Text(reps)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(isPartner ? WatchTheme.dim : accent)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    GiantNumber(text: heroClock(context.date), size: 44)
                    hrZoneRow
                }
            }
        } bottom: {
            advanceButton
        }
    }

    private func doblesPartner(_ d: MirrorDoblesTurn) -> String {
        let n = d.partnerName?.trimmingCharacters(in: .whitespaces)
        return (n?.isEmpty == false) ? n! : "compañero"
    }

    private func doblesHeading(_ d: MirrorDoblesTurn) -> String {
        switch d.role {
        case "partner": return "AHORA · \(doblesPartner(d).uppercased())"
        case "split":   return "RELEVO CON \(doblesPartner(d).uppercased())"
        default:        return "TE TOCA A TI"
        }
    }

    private func doblesRepsLine(_ d: MirrorDoblesTurn) -> String? {
        switch d.role {
        case "partner":
            return "Recupera"
        case "split":
            if let mine = d.selfReps, let theirs = d.partnerReps {
                return "Tú \(mine) · \(doblesPartner(d)) \(theirs)"
            }
            return "Tú \(d.selfSharePct)%"
        default:   // mine
            return d.selfReps.map { "Completa · \($0) reps" } ?? "Estación completa"
        }
    }

    // MARK: - Treadmill belt (indoor run)
    //
    // The wrist glance for a live treadmill DISTANCE run: a progress bar filling with the
    // covered belt meters (a distance leg has no countdown to tick), the covered pace and
    // the zone — the SAME readouts the phone HUD shows. Every value is frame-pushed (the
    // wrist can't derive belt distance locally), so nothing ticks between frames; the
    // phone resends as the meters accrue. Same status/HR/advance idiom as activeContent.
    private func treadmillContent(covered: Double, target: Double?) -> some View {
        LiveScaffold(status: frame?.blockTitle) {
            VStack(spacing: 6) {
                if let line = frame?.lineTitle {
                    Text(line)
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(WatchTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                GiantNumber(text: beltPaceText, size: 46, unit: "/km")
                beltProgressBar(fraction: beltFraction(covered: covered, target: target))
                WatchLabel(text: beltDistanceLabel(covered: covered, target: target))
                hrZoneRow
            }
        } bottom: {
            advanceButton
        }
    }

    private var beltPaceText: String {
        frame?.beltPaceSecPerKm.map(WatchFormat.pace) ?? "—:—"
    }

    private func beltFraction(covered: Double, target: Double?) -> Double {
        guard let target, target > 0 else { return 0 }
        return min(1, max(0, covered / target))
    }

    private func beltDistanceLabel(covered: Double, target: Double?) -> String {
        guard let target, target > 0 else { return beltDistance(covered, km: covered >= 1000) }
        let km = target >= 1000                              // format both by the target's scale
        return "\(beltDistance(covered, km: km)) / \(beltDistance(target, km: km))"
    }

    private func beltDistance(_ meters: Double, km: Bool) -> String {
        km ? String(format: "%.2f km", meters / 1000) : "\(Int(meters.rounded())) m"
    }

    private func beltProgressBar(fraction: Double) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(WatchTheme.surfaceRaised)
                Capsule().fill(WatchTheme.orange)
                    .frame(width: max(0, geo.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: 8)
    }

    // MARK: - HR + zone bar (mirrors ContinuousLiveView)

    private var hrZoneRow: some View {
        VStack(spacing: 5) {
            HStack {
                HRPill(bpm: controller.liveHR, zoneColor: controller.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim)
                Spacer()
                if let target = targetZone {
                    WatchLabel(text: "Obj \(target.label)")
                }
            }
            if targetZone != nil {
                zoneBar
            }
        }
    }

    private var zoneBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(HRZone.allCases, id: \.rawValue) { zone in
                        Rectangle()
                            .fill(WatchTheme.zoneColor(zone).opacity(controller.liveZone == zone ? 1 : 0.34))
                    }
                }
                if let target = targetZone {
                    Rectangle()
                        .fill(WatchTheme.ink)
                        .frame(width: 3)
                        .offset(x: markerX(for: target, width: geo.size.width))
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .frame(height: 12)
    }

    private func markerX(for zone: HRZone, width: CGFloat) -> CGFloat {
        // Center the marker in the target zone's 1/5 slot.
        let slot = width / CGFloat(HRZone.allCases.count)
        return slot * (CGFloat(zone.rawValue) - 0.5) - 1.5
    }

    // MARK: - Overlays

    private var pausedOverlay: some View {
        ZStack {
            WatchTheme.bg.opacity(0.92).ignoresSafeArea()
            VStack(spacing: 8) {
                Image(systemName: "pause.fill")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(WatchTheme.orange)
                WatchLabel(text: "En pausa", accent: true)
            }
        }
    }

    private func restOverlay(base: Double) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            ZStack {
                WatchTheme.restBg.ignoresSafeArea()
                VStack(spacing: 6) {
                    StatusHeader(text: "Descanso", color: WatchTheme.zoneGreen)
                    Spacer(minLength: 0)
                    WatchLabel(text: "Vuelve en", color: WatchTheme.zoneGreen.opacity(0.85))
                    GiantNumber(
                        // MIRROR of the phone's rest clock → round like the phone (#68).
                        text: CountdownFormat.mirrored(max(0, base - sinceFrame(context.date))),
                        size: 80,
                        color: WatchTheme.zoneGreen
                    )
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
        }
    }

    private var savingOverlay: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 10) {
                ProgressView()
                    .tint(WatchTheme.orange)
                WatchLabel(text: "Guardando…", accent: true)
            }
        }
    }

    // MARK: - Advance button

    private var advanceButton: some View {
        BigTapButton(title: advanceTitle) {
            controller.sendCommand(MirrorWire.CommandKind.advance)
        }
    }

    private var advanceTitle: String {
        if phase == MirrorWire.Phase.gate { return "Empezar ▸" }
        // #56 — the partner's relay station advances the athlete's OWN next station.
        if frame?.dobles?.role == "partner" { return "Relevo ▸" }
        return "Siguiente ▸"
    }

    // MARK: - Controls page

    private var controlsPage: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            if controller.isConnectionLost {
                connectionLostControls
            } else {
                normalControls
            }
        }
    }

    private var normalControls: some View {
        VStack(spacing: 11) {
            pauseResumeButton
            Text("El entreno se controla desde el iPhone")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 12)
    }

    private var pauseResumeButton: some View {
        let paused = phase == MirrorWire.Phase.paused
        return Button {
            WatchHaptics.tap()
            controller.sendCommand(paused ? MirrorWire.CommandKind.resume : MirrorWire.CommandKind.pause)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 18, weight: .heavy))
                Text(paused ? "Reanudar" : "Pausar")
                    .font(.system(size: 16, weight: .heavy))
                Spacer(minLength: 0)
            }
            .foregroundStyle(WatchTheme.ink)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .frame(maxWidth: .infinity)
            .background(WatchTheme.surfaceRaised)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // Phone unreachable but recording alive → honest local exit (mirrors
    // ResumeOfferView's visual idiom).
    private var connectionLostControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            WatchLabel(text: "Sin conexión con el iPhone", accent: true)
            Text("El entreno se sigue grabando aquí.")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
            Spacer(minLength: 0)
            BigTapButton(title: "Terminar y guardar aquí", systemImage: "checkmark") {
                controller.finishLocally()
            }
            Button {
                WatchHaptics.tap()
                controller.discardLocally()
            } label: {
                Text("Descartar")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(WatchTheme.dim)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: - Derived

    private var frame: MirrorStateFrame? { controller.frame }
    private var phase: String? { controller.frame?.phase }
    private var targetZone: HRZone? { frame?.targetZone.flatMap { HRZone(rawValue: $0) } }

    /// Seconds accrued since the last frame while the clock is running — the active
    /// live clock AND the count-in count-down (both re-based locally between frames);
    /// frozen on a gate / pause / rest-that-isn't-active.
    private func sinceFrame(_ now: Date) -> Double {
        guard let at = controller.frameReceivedAt,
              phase == MirrorWire.Phase.active || phase == MirrorWire.Phase.countIn else { return 0 }
        return max(0, now.timeIntervalSince(at))
    }

    /// The count-in 3-2-1, re-based locally between frames. CEIL (the wrist's OWN
    /// count-in style, in lock-step with the engine's audio ticks) — NOT the mirrored
    /// round the live clock uses, because this is the pre-roll, not a duplicated clock.
    private func countInText(_ now: Date) -> String {
        guard let cd = frame?.countdownRemaining else { return WatchFormat.countdown(0) }
        return CountdownFormat.standalone(max(0, cd - sinceFrame(now)))
    }

    /// The hero clock: a re-based countdown when the phone shows one, else a re-based
    /// count-up of the current lap.
    private func heroClock(_ now: Date) -> String {
        guard let f = frame else { return WatchFormat.clock(0) }
        if let countdown = f.countdownRemaining {
            // MIRROR of the phone's countdown → round like the phone (#68).
            return CountdownFormat.mirrored(max(0, countdown - sinceFrame(now)))
        }
        return WatchFormat.clock(f.lapElapsed + sinceFrame(now))
    }
}
